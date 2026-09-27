# Neon Storm β — Developer Guide

## Overview

Neon Storm β is a vertical scrolling bullet hell shooter. It features a 6-level campaign (each ~3–4.5 minutes with a mid-boss and a boss), 9 enemy types, 6 mid-bosses, 6 boss fights, 3 primary weapons plus a drone slot, an Endless mode, and a full meta-game with persistent unlockables.

**Tech stack:** PixiJS v8 (WebGPU/WebGL) for gameplay rendering, HTML5 Canvas 2D for UI/menus, vanilla JavaScript (no frameworks), Web Audio API for procedural SFX, localStorage/Artifact Storage API for persistence.

**Target:** Desktop browsers at 1920×1080. Scales to fit the browser window.

**Balance reference:** `docs/neon-storm-gameplay-review.md` records the review, the genre targets used (Cave / Touhou / Raiden) and the measured results; `tools/sim/` contains the headless simulation tools and regression checks used to tune it (see *Testing* below).

---

## File Structure

The project is split into 21 source modules in `src/`, concatenated by `build.js` into a single distributable HTML file. For the web server approach, `index.html` loads them directly via `<script>` tags.

### Module Map (in dependency order)

| Module | Lines | Purpose |
|--------|-------|---------|
| `constants.js` | ~45 | Canvas setup, screen constants, dual-canvas sizing |
| `renderer.js` | ~850 | PixiJS pipeline, offscreen Canvas 2D bridge, bloom/glow/screen effects |
| `config.js` | ~50 | Difficulty presets (casual/normal/hardcore) |
| `input.js` | ~250 | Keyboard + gamepad polling, rebindable actions (incl. `surge`) |
| `audio.js` | ~330 | Web Audio API procedural SFX + music hooks |
| `storage.js` | ~810 | Persistence, high scores, settings, NC, achievements, end-of-level bonuses |
| `ui-systems.js` | ~380 | Custom difficulty, hangar/shop, tutorial |
| `particles.js` | ~270 | Particles, screen shake, screen transitions |
| `bullets.js` | ~255 | BulletPool class (player + enemy projectiles; pierce, telegraph, homing) |
| `scoring.js` | ~265 | Chain combo, graze, surge meter, per-level counters, extends, popups |
| `enemies.js` | ~915 | Enemy types, AI, fire rules, retreat, patterns, power-ups |
| `midbosses.js` | ~300 | Mid-boss types, movement, patterns, rewards, HP bar |
| `waves.js` | ~470 | Game-time Scheduler, wave sequencer, level 1-6 data, Endless generator |
| `level-systems.js` | ~245 | Asteroids, escort, campaign progression |
| `bosses.js` | ~1225 | Boss types, patterns, armor, phase timeouts, visuals, defeat sequences |
| `player.js` | ~950 | Player ship, weapons, drones, abilities, collision |
| `background.js` | ~955 | 6-theme parallax backgrounds |
| `hud.js` | ~385 | HUD panels (left + right) |
| `menus.js` | ~540 | All menu screens |
| `game.js` | ~1000 | Main game state machine, level scaling, level flow |
| `main.js` | ~25 | Boot sequence + game loop |

### Rendering Architecture

The game uses a dual-canvas architecture:

```
  Gameplay .draw(ctx) methods
           │
           ▼
  Offscreen Canvas 2D (720×960)    ◄── All existing draw code draws here
           │
           ▼
  PixiJS Texture Upload            ◄── GPU texture from offscreen canvas
           │
           ▼
  PixiJS Sprite + Filters          ◄── Bloom, blur, distortion (Phase 2+)
           │
           ▼
  Pixi Canvas (play area)          ◄── Positioned over the play area

  Overlay Canvas 2D (1920×1080)    ◄── Menus, HUD, transitions (unchanged)
```

The `Renderer` module manages this pipeline:
- `Renderer.getPlayCtx()` — returns the offscreen Canvas 2D context
- `Renderer.beginFrame()` — clears the offscreen canvas
- `Renderer.endFrame()` — uploads to GPU and renders via PixiJS
- `Renderer.setShake(x, y)` — applies screen shake to the PixiJS sprite

When PixiJS isn't available, `endFrame()` is a no-op and `Game.draw()` blits the offscreen canvas directly onto the overlay canvas with `ctx.drawImage()`. All gameplay draw code is identical in both paths — only the final compositing differs.

---

## Architecture Concepts

### Data-Driven Design

Levels, enemies, mid-bosses, bosses, and difficulty settings are defined as data objects, not hardcoded logic.

**Adding a new level:** Create a new level data object following the existing pattern:

```javascript
const LEVEL_7 = {
    id: 'level_7',
    name: 'Level Name',
    briefing: 'Briefing text shown before the level.\nSupports line breaks.',
    bgType: 'synthwave',     // Background theme (see Background section)
    bossType: 'architect',   // Boss type key (see BossTypes)
    levelScale: 1.0,         // Difficulty multiplier (see Level Scaling)
    hasAsteroids: false,     // Enable asteroid hazards
    hasEscort: false,        // Enable escort mission
    waves: [
        {
            time: 0.5,       // Seconds on the WAVE CLOCK (pauses during mid-bosses)
            enemies: [
                {
                    type: 'scout_drone',    // Enemy type key
                    count: 5,               // Number to spawn
                    formation: 'v_shape',   // Spawn pattern
                    movePath: 'straight_down', // Movement behavior
                    stagger: 200,           // ms delay between each enemy in the group
                    delay: 0                // ms delay before this group starts spawning
                }
            ]
        },
        { time: 46, midboss: 'sentinel' }, // Mid-boss: wave clock pauses until it is destroyed or escapes
    ]
};
```

Then add it to `ALL_LEVELS` array and update `Campaign.getLevelCount()`. Current levels follow this shape: opening waves (0–~46 s), mid-boss, the level's later waves, a six-wave finale (~80–140 s), then the boss.

### Central GameConfig

All difficulty-dependent behavior reads from the `GameConfig` object. It is rebuilt from the preset (or `CustomDifficulty.getConfig()`) at every `Game.startLevel()`.

```javascript
GameConfig = {
    difficulty: 'normal',
    bombs: { enabled: true, startCount: 3 },
    focus: { enabled: true, speedMultiplier: 0.4 },
    dash: { enabled: true, cooldown: 2.0 },
    graze: { enabled: true, zoneMultiplier: 1.0, rewardMultiplier: 1.0 },
    autofire: false,          // true forces auto-fire (Casual); otherwise Settings.fireMode
    lives: 3,
    shieldHp: 0,              // 0 = instant death, >0 = hits absorbed before death
    deathPenalty: 'moderate', // 'none' | 'moderate' | 'full'
    deathBombWindow: 0.15,    // seconds after a lethal hit in which bombing cancels it
    bulletDensity: 1.0,       // preset density × level scaling
    chainTimerSpeed: 1.0,
    scoreMultiplier: 1.0,
    fireMode: 'manual',       // 'manual' | 'auto'
    _levelHpScale: 1.0,       // Set by Game.applyLevelScaling()
    _levelSpeedScale: 1.0,    // enemy bullet speed
    _levelFireRateScale: 1.0  // enemy fire frequency
}
```

### State Machine

The `Game` object manages all states:

```
title → difficulty_select → briefing → playing ↔ paused
                ↓                         ↓         ↓
        custom_difficulty          game_over    victory → briefing (next level)
                                      ↓            ↓
                                   title         title

Other states: settings, high_scores, hangar, tutorial
```

### Game-Time Scheduling

Never use `setTimeout` for gameplay. `Scheduler.after(seconds, fn)` (in `waves.js`) runs on game time: it only advances while the game is `playing`, so pausing can't drop spawns or skip the end of a level, and it is cleared by every `startLevel`/`startEndless`. Delayed wave spawns, the victory/game-over transitions and the escort failure all use it.

`WaveSystem` keeps two clocks: `levelTimer` (real level time, used for time bonuses and Endless rank) and `waveTime` (the wave schedule, paused while a mid-boss is alive).

### Object Pooling

`BulletPool` is used for both player and enemy projectiles. Bullets are stored in a flat array and removed when inactive, off-screen, or expired. Pools have a max size (player 200, enemy 800). Bullet options include `pierce` (hits each enemy once, used by the laser), `harmless` (telegraph time before a bullet can hit or be grazed) and `turnRate` (homing).

---

## Key Systems Reference

### Enemy System

**Adding a new enemy type:**

1. Add the type definition to `Enemies.types`:
```javascript
my_enemy: {
    hp: 5, speed: 80, radius: 18, score: 400, color: '#ff8800',
    fireRate: 2.0, bulletSpeed: 200, dropChance: 0.3, cancelBullets: false
}
```

2. Add a firing pattern case in `Enemies._firePattern()`. If the pattern's bullet *count* should scale with density, add the type to `Enemies.COUNT_SCALED`; otherwise density scales its fire frequency.

3. Add a drawing case in `Enemies.draw()` inside the switch.

4. If needed, add special movement in `Enemies._updateMovement()`.

**Enemy properties at spawn (affected by level scaling):**
- `hp`, `maxHp`, `score` — × `GameConfig._levelHpScale`
- `fireRate` (interval) — ÷ (`_levelFireRateScale` × density, unless count-scaled)
- `bulletSpeed` — × `_levelSpeedScale`

**Fire rules (all enemies):** no firing while off-screen, below 75% of the screen height, within 110 px of the player, while retreating, or during a teleport.

**Lifetimes:** enemies on `hover` / `strafe` paths retreat upward after 14 / 16 s (`Enemies.LIFETIMES`); `Enemies.retreatAll()` clears the field when the boss arrives. Carriers launch at most 6 scouts. Enemies spawned beside the play area (`sides` formation) fly in before following their path.

**Formations:** `line`, `v_shape`, `random`, `sides`
**Move paths:** `straight_down`, `sweep_left`, `sweep_right`, `zigzag`, `strafe`, `hover` (plus `midboss`, internal)

### Mid-Boss System

Mid-bosses (`midbosses.js`) are heavy enemies registered into `Enemies.types` at load, so they reuse spawning, level HP scaling, collision and homing. Define one in `MidBossTypes`:

```javascript
my_midboss: {
    name: 'DISPLAY NAME', level: 1,
    movement: 'sway',         // 'sway' | 'dart' | 'teleport' | 'mirror'
    color: '#ff6600', accent: '#ffcc44', bulletColor: '#ff4400',
    patterns: ['aimedFan', 'ring', 'wideFan'], // cycled in order; implement new names in MidBoss.fire()
    interval: 1.1,            // seconds between patterns
    hpMult: 1.0,              // optional: fast movers get less HP
}
```

Then place it in a level: `{ time: T, midboss: 'my_midboss' }`. Base HP is 250 × `hpMult` × level HP scaling. Keep movement at ≤ ~140 px/s: player shots take about a second to travel up the screen, so faster targets can't be hit. It escapes after `MIDBOSS_TIME_LIMIT` (35 s) with no reward; destroying it pays `MIDBOSS_BONUS`, cancels every enemy bullet and drops `MIDBOSS_DROPS` power-ups. Bombs take 10% of its HP.

### Boss System

Bosses are defined in `BossTypes` and instantiated by the `Boss` singleton:

```javascript
my_boss: {
    name: 'DISPLAY NAME',
    phases: 3,                    // Number of phases
    phaseHps: [300, 380, 460],    // HP per phase
    hasArmor: false,              // If true, phase 1 has destructible armor segments
    armorCount: 4,                // Number of armor segments
    armorHp: 40,                  // HP per armor segment
    colors: ['#ff4444', '#ff00ff', '#ff0040']  // Color per phase
}
```

- **Attack patterns** dispatch by type in `Boss._attack()` (`_furnaceAttack`, `_leviathanAttack`, …; the Architect uses `_phase1/2/3Attack`). Use `this._n(base, density)` for bullet counts and derive angle/position steps from that same count, so rings stay even and walls span the screen at any density.
- **Phase timeout:** `BOSS_PHASE_TIME_LIMIT` (45 s) ends a phase without its bonus (on-screen timer).
- **Armor:** segments orbit at `BOSS_ARMOR_ORBIT`; bullets hit them positionally (`Boss.hitTest`); the core takes `BOSS_ARMORED_CORE_DAMAGE` (50%) while any remain; bombs hit every segment (`Boss.bombHit`).
- **Telegraphs:** stationary/instant bullets are spawned with `harmless: 0.35` so they show before they can hit.
- HP is tuned for ~35–65 s at full uptime with Lv3–Lv5 weapons; the fast-strafing Interceptor Duo has less HP because players can't stay under it.

### Weapon System

Every weapon runs on its own timer, separate from the **base shot** (1 damage every 0.12 s, always on). Surge halves every interval.

| Weapon | Interval | Per level (Lv1 → Lv5) |
|--------|----------|------------------------|
| Spread | 0.25 s | 2 / 3 / 5 / 7 / 9 pellets, 1 dmg each; each level is a strict superset of the previous fan (`SPREAD_ANGLES`); Focus narrows it to 35% |
| Homing | 0.26 s | 2 / 3 / 4 / 5 / 6 missiles, 1 dmg each |
| Laser | 0.10 s | main beam 1.0 / 1.3 / 1.6 / 1.9 / 2.3 dmg, pierces; side beams from Lv3, thin outer beams from Lv4 |
| Drones | contact every 0.15 s; shots every 0.5 s | 2–6 drones; contact damage (all levels), shield pulse (Lv2+), shots at the nearest target incl. the boss (Lv3+) |

Targets: ~2.3× power from Lv1 to Lv5, all weapons within ~20% on a single target, and no level ever weaker than the one below it (`weaponUpgradesNeverWeaker` check).

**Weapon slot system:**
- **Primary slot:** One of spread/homing/laser, levels 1–5. Collecting the same type levels up; a different type switches at Lv1. Power-up types are random.
- **Passive slot:** Drones. Always stacks independently from primary.
- Weapons, drones, lives and bombs carry over between campaign levels.

### Scoring

- **Chain combo:** 3.0 s kill timer (× difficulty speed), topped up slightly by every hit. Tiers: 10 = 2×, 20 = 3×, 35 = 5×, 60 = 8×.
- **Graze:** only while vulnerable (dashing counts); 5 Surge charge per graze, 1.5 per kill.
- **Neon Surge:** activate with the SURGE input (F/M, RT/Y) when full: 5 s of 2× fire rate, 3× score and shots that cancel bullets. Half the meter is kept on death.
- **Bullet cancel:** Destroying medium+ enemies converts nearby bullets into 250-point pickups; destroying a mid-boss cancels every bullet.
- **End-of-level bonuses** use per-level counters (`Scoring.levelGrazes`, `levelMaxChain`, `levelDeaths`, `levelScore`).
- **Extends:** +1 life at 300k / 1M / 2M / 4M × the difficulty score multiplier.

### Background Themes

Backgrounds are theme-based via `bgType`. Available themes:
- `synthwave` — Purple/magenta gradient, neon city skyline
- `industrial` — Dark reds/oranges, burning infrastructure
- `space` — Deep blues, nebula, sparse stars
- `sky` — Blue to gold gradient, cloud-like
- `digital` — Purple to magenta, data-stream feel
- `void` — Near-black, glitch aesthetic

To add a new theme, add an entry to the `themes` object in `Background.draw()`:
```javascript
my_theme: {
    sky: ['#color1', '#color2', '#color3', '#color4', '#color5'], // gradient stops
    sun: 'rgba(r,g,b,a)',   // horizon glow
    grid: 'rgba(r,g,b,a)',  // horizontal grid lines
    vgrid: 'rgba(r,g,b,a)'  // vertical grid lines
}
```

### Audio

All SFX are procedurally generated via Web Audio API — no external audio files.

**Adding a new sound:**
```javascript
playMySound() {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this._createGain(0.1); // volume
    osc.type = 'sine'; // 'sine', 'square', 'sawtooth', 'triangle'
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.exponentialRampToValueAtTime(220, t + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(gain);
    osc.start(t);
    osc.stop(t + 0.15);
}
```

**Music hooks** exist but are unimplemented (`playMusic`, `stopMusic`, `crossfadeMusic`). These are ready to accept external audio file loading when music is added.

### Persistence

Data is stored via the `Storage` abstraction which tries `window.storage` (Artifact Storage API) first, then falls back to localStorage. All persistent data:

| Key | Data | System |
|-----|------|--------|
| `highscores` | Top 10 per difficulty + endless | HighScores |
| `settings` | Player preferences | Settings |
| `neonCredits` | Currency balance | NeonCredits |
| `hangar_unlocked` | Purchased items | Hangar |
| `hangar_equipped` | Current loadout | Hangar |
| `campaign` | Levels unlocked, secret flag, per-level bests (level score, not run score) | Campaign |
| `achievements` | Unlocked achievements + trackers | Achievements |
| `inputBindings` | Keyboard + gamepad bindings | Input |

---

## Common Tasks

### Adding a New Level

1. Create level data object (see Data-Driven Design above), including a mid-boss entry
2. Add to `ALL_LEVELS` array
3. Update `Campaign.getLevelCount()` and `Campaign.isLevelAvailable()` if needed
4. Optionally create a new background theme, mid-boss and boss type
5. Run `node tools/sim/playthrough.js <index> normal spread 3 --human` to check stage length and the mid-boss/boss outcome

### Adding a New Cosmetic Unlock

1. Add to the appropriate array in `Hangar.catalog` (skins/trails/bullets/explosions):
```javascript
{ id: 'unique_id', name: 'Display Name', cost: 100, color: '#hexcolor' }
```
2. The equipped item is tracked in `Hangar.equipped` and applied in gameplay rendering (see below).

### Applying Cosmetics to Gameplay

The Hangar tracks equipped cosmetics (`Hangar.equipped.skin`, `.trail`, `.bullet`, `.explosion`) and these are applied in gameplay rendering. Ship skins change the player ship fill colour (including Chromatic Shift and Ghost Frame special skins), engine trails use `Hangar.trailColor`, bullet styles apply base shot colour, and explosion effects vary particle colours on enemy death.

### Tuning Difficulty

**Global knobs:**
- `DIFFICULTY_PRESETS` — Per-preset lives, bombs, penalties, density, death-bomb window, etc.
- Level `levelScale` — see the scaling math below
- `Enemies.types`, `MidBossTypes`, `BossTypes` — per-type base stats and HP
- `Player.WEAPON_INTERVALS`, `SPREAD_ANGLES` and the damage values in `Player._fireWeapon()`
- `Scoring` — chain tiers/timer, Surge charge, extend thresholds

**Level scaling math** (`Game.applyLevelScaling`, with `t = levelScale − 1`):
- Bullet density = `preset density × (1 + 0.5t)` — ×1.75 at Level 6
- Enemy HP and score = `× (1 + 0.6t)` — ×1.9 at Level 6
- Enemy fire frequency = `× (1 + 0.2t)` — ×1.3 at Level 6
- Enemy bullet speed = `× min(1.2, 1 + 0.15t)`

Endless applies the same curve from its time-based rank, capped at density ×2.2, HP ×3 and fire frequency ×1.6, with at most `EndlessMode.MAX_ENEMIES` (30) enemies on screen.

After tuning, re-measure with the simulation tools (below) rather than by feel alone.

### Adding Gamepad Button Remapping

The input system supports gamepad via `Input.gpBindings`. Button indices follow the Standard Gamepad Layout. Players can remap both keyboard and gamepad from Settings → Controls (`ControlsScreen`, which uses `Input.startKeyListen` / `startButtonListen`); defaults live in `Input.defaultBindings` / `defaultGpBindings`. New actions go in `Input.rebindableActions`.

---

## Testing

There are no unit tests; gameplay is verified headlessly with `tools/sim/` (Playwright + Chromium on a fake 60 fps clock, rendering stubbed). See `tools/sim/README.md` for setup.

- `npm run sim:checks` — regression checks for every gameplay bug fixed in the review, plus balance guards (weapon monotonicity, Endless caps, mid-boss behaviour). All must pass.
- `npm run sim:weapons`, `npm run sim:boss-ttk` — weapon DPS and boss time-to-kill.
- `tools/sim/playthrough.js`, `tools/sim/campaign.js` — single levels and whole campaigns played by a bot (perfect, or human-like with reaction time and perception noise).
- `tools/sim/perf.js` — game-logic cost per frame (logic only; profile rendering in a real browser).

Checks reach into game globals (`Player`, `Boss`, `WaveSystem`…); keep them in step when renaming.

---

## Known Limitations & TODOs

See `neon-storm-checklist.md` for the complete remaining work tracker.

### Renderer
- [ ] Canvas 2D fallback has no glow/shadowBlur effects (intentional — graceful degradation, not parity)
- [ ] Rendering performance not yet profiled in a real browser under heavy scenes (late Endless)

### Gameplay
- [ ] Human play-testing of the tuned balance — especially Hardcore's difficulty curve and the bomb economy (the simulation bot almost never bombs)
- [ ] Escort ship (Level 4) doesn't dodge — could benefit from basic avoidance AI
- [ ] Asteroid collision only checks player bullets, not enemy bullets
- [ ] Shield Wall enemies don't visually link together
- [ ] Endless has no mid-bosses

### Audio
- [ ] Music system has hooks but no actual music tracks

### UI/UX
- [ ] Gamepad button prompts not shown when controller is detected

### Hangar Bonus Content
- [ ] Boss Practice Mode, Enemy Gallery, Music Player, Ship Color Designer — listed in shop but not implemented

---

## Constants Reference

| Constant | Value | Purpose |
|----------|-------|---------|
| `SCREEN_W` | 1920 | Total canvas width |
| `SCREEN_H` | 1080 | Total canvas height |
| `PLAY_W` | 720 | Play area width |
| `PLAY_H` | 960 | Play area height |
| `PLAY_X` | 600 | Play area left edge |
| `PLAY_Y` | 60 | Play area top edge |

---

## Design Documents

| Document | Purpose |
|----------|---------|
| `neon-storm-gdd.md` | Game Design Document (v1.1: gameplay sections match the implementation) |
| `neon-storm-gameplay-review.md` | Gameplay/balance review, genre targets, fix passes and measurements |
| `neon-storm-checklist.md` | Remaining work tracker (single source of truth) |
| `neon-storm-dev-guide.md` | This file — developer reference |
| `../tools/sim/README.md` | Simulation tools and regression checks |

---

*Last updated for Neon Storm β — gameplay review fix passes, mid-bosses and simulation tooling.*
