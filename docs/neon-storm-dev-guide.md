# Neon Storm γ — Developer Guide

## Overview

Neon Storm γ is a vertical scrolling bullet hell shooter. It features a 6-level campaign (each ~3–4.5 minutes with a mid-boss and a boss), 9 enemy types, 6 mid-bosses, 6 boss fights, 3 primary weapons plus a drone slot, an Endless mode, and a full meta-game with persistent unlockables.

**Tech stack:** PixiJS v8 (WebGPU/WebGL) with pixi-filters v6 for gameplay rendering and GLSL shader backgrounds, HTML5 Canvas 2D for gameplay art (neon line art via a sprite atlas) and UI/menus, vanilla JavaScript (no frameworks), Web Audio API for procedural SFX and a procedural synthwave soundtrack, localStorage/Artifact Storage API for persistence.

**Target:** Desktop browsers; laid out at 1920×1080 and scaled to fit the window, rendering at the display's pixel density (up to 2× on HIGH graphics quality).

**Balance reference:** `docs/neon-storm-gameplay-review.md` records the review, the genre targets used (Cave / Touhou / Raiden) and the measured results; `tools/sim/` contains the headless simulation tools and regression checks used to tune it (see *Testing* below).

---

## File Structure

The project is split into 27 source modules in `src/`, concatenated by `build.js` into a single distributable HTML file (with PixiJS and pixi-filters inlined from `vendor/`). For the web server approach, `index.html` loads them directly via `<script>` tags.

### Module Map (in dependency order)

| Module | Lines | Purpose |
|--------|-------|---------|
| `constants.js` | ~45 | Canvas setup, screen constants, dual-canvas sizing |
| `backdrops.js` | ~405 | GPU fragment shaders for the six level backgrounds |
| `renderer.js` | ~1130 | PixiJS pipeline, FX texture sheet, backdrop, GPU glow/bloom, screen effects, resolution & graphics quality; offscreen Canvas 2D for the no-WebGL fallback |
| `backdrop3d.js` | ~1590 | three.js 3D level backgrounds (`Backdrop3D`, `BACKDROP_SCENES_3D`) on Pixi's GL context |
| `gpu-ctx.js` | ~480 | `GpuCtx`: the Canvas 2D subset the play-area draw code uses, emitted as pooled Pixi sprites/graphics |
| `config.js` | ~50 | Difficulty presets (casual/normal/hardcore) |
| `input.js` | ~250 | Keyboard + gamepad polling, rebindable actions (incl. `surge`) |
| `audio.js` | ~370 | Web Audio API procedural SFX; mix buses (SFX, music with pause filter and ducking, master compressor) |
| `storage.js` | ~725 | Persistence, high scores, settings (+ screen), controls screen, NC, achievements, end-of-level bonuses |
| `ui-systems.js` | ~500 | Custom difficulty, hangar/shop (with live previews), tutorial |
| `neon.js` | ~315 | Neon line-art helpers (strokes, lights, text, bars) and the sprite atlas |
| `ui-kit.js` | ~270 | UI building blocks: animated menu background, panels, titles, menu items, tabs |
| `particles.js` | ~415 | Particles, sparks, explosions, outline shatter, screen shake, transitions |
| `bullets.js` | ~315 | BulletPool class (player + enemy projectiles; shapes, pierce, telegraph, homing) |
| `scoring.js` | ~260 | Chain combo, graze, surge meter, per-level counters, extends, popups |
| `enemies.js` | ~960 | Enemy types, AI, fire rules, retreat, patterns, neon art, power-ups |
| `midbosses.js` | ~535 | Mid-boss types, movement, patterns, rewards, neon art, HP bar |
| `waves.js` | ~470 | Game-time Scheduler, wave sequencer, level 1-6 data, Endless generator |
| `level-systems.js` | ~285 | Asteroids, escort (with neon art), campaign progression |
| `bosses.js` | ~1270 | Boss types, patterns, armor, phase timeouts, neon art, defeat sequences |
| `player.js` | ~965 | Player ship, weapons, drones, abilities, collision, trails |
| `background.js` | ~960 | Painted Canvas 2D backgrounds (the no-WebGL fallback) |
| `hud.js` | ~275 | HUD panels (left + right) and the FPS meter |
| `menus.js` | ~370 | Title, difficulty, briefing, level select, scores, achievements, pause, results |
| `game.js` | ~805 | Main game state machine, level scaling, level flow |
| `music.js` | ~500 | Procedural synthwave soundtrack: track data, sequencer, instruments, stings, state-driven track choice |
| `main.js` | ~25 | Boot sequence + game loop |

### Rendering Architecture

```
  Level backdrop shader (backdrops.js)   ◄── PixiJS Mesh, bottom of the play area
  Gameplay .draw(ctx) methods
           │
           ▼
  GpuCtx → Pixi sprites + graphics               ◄── Neon art stamped from the sprite atlas
           │
           ▼
  Native particles + glow render texture         ◄── Bullets/particles from the FX sheet, bloom halos
           │
           ▼
  Filters: colour grade, bloom, shockwave, god-rays, chroma, CRT, glitch
           │
           ▼
  Pixi canvas (play area)

  Overlay Canvas 2D (1920×1080 × render scale)   ◄── Menus, HUD, transitions (UI kit)
```

- `Renderer.getEntityCtx()` / `beginFrame()` / `endFrame()` — frame lifecycle. In Pixi mode the context is a `GpuCtx` (`gpu-ctx.js`); without Pixi it is the offscreen canvas (`getPlayCtx()`), which in Pixi mode only holds the painted background when no shader backdrop is active.
- `Renderer.setBackdrop(theme)` — picks the level's shader; `_updateBackdrop` feeds it pulse/boss/Surge/bullet-density uniforms.
- `Renderer.fx` — the shared particle texture sheet (glow, orb, core, shadow, streak, needle, missile, spark, pixel).
- `Renderer.applyResolution()` — both canvases render at CSS scale × `devicePixelRatio`, capped by GRAPHICS QUALITY (high 2×, medium 1.5×, low 1×; auto steps down on slow frames). Draw code keeps logical coordinates.
- `Renderer.calm()` — true with Flash Reduction on; every flash, glitch and pulse checks it.
- Screen effects use pixi-filters v6 (`PIXI.filters`); centres are play-area pixels.

When PixiJS isn't available, the draw code gets the offscreen canvas, the painted Canvas 2D backgrounds are used, and `Game.draw()` blits it onto the overlay.

The art conventions (neon style rules, `_bake`/`_neon` split, sprite keys, adding art for new entities) are documented in `CLAUDE.md` → Art Style and in the header of `src/neon.js`.

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

3. Add its neon art: a `_bake` entry for the static body and a `_neon` entry for the live parts (see `CLAUDE.md` → Art Style). Add its outline to `Enemies._OUTLINES` so it shatters on death.

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

Each level's `bgType` selects a three.js scene in `BACKDROP_SCENES_3D` (`src/backdrop3d.js`; how it is wired into Pixi is in that file's header):
- `synthwave` — neon grid toward a striped sun setting behind a Neo-Tokyo skyline, wireframe mountains, light pylons
- `industrial` — foundry canyon: molten channel, riveted decks and conveyors, vent-lit factory blocks, pipes, gantries overhead, smokestacks, embers
- `space` — asteroid belt: nebula with dust lanes and a galactic band, ringed gas giant, tumbling rocks, glinting debris
- `sky` — night flight: moonlit cloud decks, a city and highways far below, moon and aurora, the convoy's navigation lights
- `digital` — circuit-board city: routed traces with data pulses, chips and data towers, the Core with rings and beams, hex sky
- `void` — collapsing tunnel of panels breaking away, a singularity with an accretion disc, band glitches

A scene is `{ build() }` returning `{ scene, camera, update(s), glitch? }`; `s` carries the time and the backdrop uniforms (pulse, boss, surge, calm). Scenes use ShaderMaterials with their own fog (helpers in `B3D` and `B3D_GLSL`); anything that moves per frame or in its vertex shader needs `B3D.always()` (no frustum culling). Preview a scene by starting its level; `npm run sim:render` catches shader errors.

**Fallback:** the GPU fragment shader in `BACKDROP_SHADERS` (`src/backdrops.js`), drawn under all gameplay with the world streaming toward the player:
- `synthwave` — perspective neon grid, striped sun and wireframe mountains on a horizon near the top
- `industrial` — top-down foundry deck: vents, conveyor belts, pipes, girders overhead, embers
- `space` — parallax star layers, nebula, ringed planet
- `sky` — city lights far below moonlit cloud layers
- `digital` — circuit board with chips and data pulses along the traces
- `void` — warping tunnel with glitch bands and tears

Shared uniforms (`uTime`, `uRes`, `uPulse`, `uBoss`, `uSurge`, `uDim`, `uCalm`) and helpers (`hash`, `noise`, `fbm`, `stars`, `line`, `finish`) are in `BACKDROP_COMMON`. **To add a theme:** add a `void main()` fragment to `BACKDROP_SHADERS`, keep it darker and less saturated than anything collidable, stop strobing when `uCalm` is 1, and add bloom/colour-grade presets for it in `Game.startLevel()`. Add a painted fallback in `background.js` if the level must look right without WebGL. `npm run sim:render` catches shader compile errors.

### Audio

All SFX are procedurally generated via Web Audio API — no external audio files.

Sounds are built from two helpers: `_tone(t, out, {type, f, f2, dur, gain, a, lp})` (oscillator with a pitch glide and envelope) and `_noise(t, out, {filter, f, f2, q, dur, gain})` (a slice of one shared noise buffer through a swept filter). `_glass()` adds the glassy pings used by explosions, `_verb()` sends a layer to the short SFX reverb, and `_throttle(key, gap)` stops a sound restarting too often (a bomb can kill dozens of enemies in one frame).

**Adding a new sound:**
```javascript
playMySound() {
    if (!this._ok() || this._throttle('mine', 0.05)) return;
    const t = this.ctx.currentTime;
    const out = this._createGain(0.2);                     // volume (× SFX VOLUME)
    this._tone(t, out, { type: 'triangle', f: 880, f2: 440, dur: 0.12 });
    this._noise(t, out, { filter: 'highpass', f: 5000, dur: 0.03, gain: 0.3 });
}
```
The laser is a sustained hum: player code calls `Audio.laserHum(true)` every frame it fires and `Audio.frame()` (game loop) stops it when that stops, so pausing or leaving the level silences it. `npm run sim:audio` renders every sound and fails on silence or clipping.

SFX go through `Audio.sfxBus`, music through `Audio.musicBus` → `musicFilter` (pause muffle) → `musicDuck` (`Audio.duckMusic()`, used by bombs and deaths); both share a master compressor, trimmed so quiet sounds keep their level.

### Music

The soundtrack is generated live by `music.js` — no audio files, no licensing. Each entry in `MusicTracks` is data: `bpm`, `root` (MIDI note of the bass), `scale`, `prog` (chord per bar as scale degrees), `kit` (`MUSIC_KITS`), `bass` and `arp` patterns (`MUSIC_BASS`, `MUSIC_ARPS`), oscillator waves and filter cutoffs, and optionally `sting` and `verb`. The lead melody is generated once per track from the progression (seeded, so it never changes).

| Track | Plays during | Feel |
|---|---|---|
| `title` | all menus | A minor, 96 bpm, soft kit |
| `level_1`…`level_6` | briefing (intensity 0) and play | one per level, matched to the backdrop: city synthwave, industrial phrygian, spacious dorian, bright major sky, fast digital arps, slow dark void |
| `boss:<level>` | boss fight (after the WARNING) | 140 bpm harmonic minor in the level's key |
| `endless` | Endless mode | 126 bpm |
| `results` / `gameover` | victory, campaign complete / game over | a sting, then a quiet loop |

`Music.update()` runs every frame from `main.js`: `_want()` maps game state to a track and intensity, a change of track crossfades (1.2 s), and notes are scheduled 0.2 s ahead on the audio clock. Intensity (applied at the next bar): 0 pads + arpeggio (briefing, boss WARNING, after a boss dies), 1 + drums and bass, 2 + lead and 16th hats (mid-boss, boss), 3 + fills and brighter pads (boss final phase, Neon Surge). Pads, bass and arp are side-chained to the kick. MUSIC VOLUME 0 stops the music.

`npm run sim:audio` renders every track and sound effect offline through the real mix and fails on errors, silence or clipping, and checks the track chosen for each game state. `node tools/sim/audio.js --wav` also writes WAV previews to `tools/sim/out/audio/` (one per track, plus `sfx-reel.wav`).

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
| `saveVersion` | Save format version (`SAVE_VERSION`) | SaveData |
| `highscores_v1`, `levelBests_v1` | Pre-γ scores, archived by the v1 → v2 migration (not shown in game) | SaveData |

**Save versioning:** `SaveData.migrate()` runs in `Game.init()` before anything loads. A save without `saveVersion` is v1 (α/β). Each step in `SaveData.steps[n]` upgrades v*n* to v*n*+1; a save from a newer build is left untouched. When the save format or the meaning of saved data changes, bump `SAVE_VERSION` and add a step — keep progress, archive rather than delete. The title screen notes a migration once. Regression check: `saveMigrationKeepsProgress`.

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

Cosmetics change the look, not just the colour:
- **Skins** — the ship's neon colour (`Hangar.skinColor`; Chromatic cycles, Ghost is translucent).
- **Trails** — `Player.drawTrail(ctx, pts, style, color, r, t)`: thrust ribbon, flame, scatter, lightning, void.
- **Bullet styles** — player shot shape in `BulletPool._addParticles`/`_syncParticles`: streak (neon), orb (plasma), square (retro), spinning diamond (shards). Missiles and the laser keep their own shapes.
- **Explosions** — `variant` passed to `Particles.spawnExplosion` on enemy deaths: burst, shatter (more/faster outline pieces), pixel (drifting squares), supernova (bigger flash and ring).

The Hangar preview (`Hangar._drawPreview`) reuses `Player.drawTrail` and mirrors the other styles; a new cosmetic needs its in-game look and a preview case.

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

There are no unit tests; the game is verified headlessly with `tools/sim/` (Playwright + Chromium). See `tools/sim/README.md` for setup.

- `npm run sim:checks` — regression checks for every gameplay bug fixed in the review, plus balance guards (weapon monotonicity, Endless caps, mid-boss behaviour). Rendering is stubbed. All must pass.
- `npm run sim:render` — render smoke test: every screen and Hangar preview, and every level through its boss with rendering on (plus Flash Reduction and the Canvas 2D fallback). Fails on any page or console error, including shader compile errors.
- `npm run sim:weapons`, `npm run sim:boss-ttk` — weapon DPS and boss time-to-kill.
- `tools/sim/playthrough.js`, `tools/sim/campaign.js` — single levels and whole campaigns played by a bot (perfect, or human-like with reaction time and perception noise).
- `tools/sim/perf.js` — game-logic cost per frame (logic only). For rendering, use Settings → SHOW FPS in a real browser.

**CI** (`.github/workflows/ci.yml`) runs on every PR and on pushes to main/delta: build, a check that the committed `dist/` matches `src/`, `sim:checks` and `sim:render`. **Hosting** (`.github/workflows/pages.yml`) publishes the build from main to GitHub Pages.

Checks reach into game globals (`Player`, `Boss`, `WaveSystem`…); keep them in step when renaming.

---

## Known Limitations & TODOs

See `neon-storm-checklist.md` for the complete remaining work tracker.

### Renderer
- [ ] Canvas 2D fallback (no WebGL) keeps the older painted backgrounds and has no shader/filter effects (intentional — graceful degradation, not parity)
- [ ] Rendering performance not yet measured on real hardware, especially HIGH quality at 4K and late Endless (use Settings → SHOW FPS)
- [ ] Hangar colour swatches use the catalogue colours, so the dark Void Trail swatch doesn't match its glowing purple trail

### Gameplay
- [ ] Human play-testing of the tuned balance — especially Hardcore's difficulty curve and the bomb economy (the simulation bot almost never bombs)
- [ ] Escort ship (Level 4) doesn't dodge — could benefit from basic avoidance AI
- [ ] Asteroid collision only checks player bullets, not enemy bullets
- [ ] Shield Wall enemies don't visually link together
- [ ] Endless has no mid-bosses

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

*Last updated for Neon Storm γ — neon vector graphics overhaul (art, shader backgrounds, effects, UI, resolution). Rendering and art conventions are in `CLAUDE.md`.*
