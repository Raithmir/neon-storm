# Neon Storm β — Developer Guide

## Overview

Neon Storm β is a vertical scrolling bullet hell shooter. It features a 6-level campaign, 9 enemy types, 6 boss fights, 4 weapon types, and a full meta-game with persistent unlockables.

**Tech stack:** PixiJS v8 (WebGPU/WebGL) for gameplay rendering, HTML5 Canvas 2D for UI/menus, vanilla JavaScript (no frameworks), Web Audio API for procedural SFX, localStorage/Artifact Storage API for persistence.

**Target:** Desktop browsers at 1920×1080. Scales to fit the browser window.

---

## File Structure

The project is split into 20 source modules in `src/`, concatenated by `build.js` into a single distributable HTML file. For the web server approach, `index.html` loads them directly via `<script>` tags.

### Module Map (in dependency order)

| Module | Lines | Purpose |
|--------|-------|---------|
| `constants.js` | ~45 | Canvas setup, screen constants, dual-canvas sizing |
| `renderer.js` | ~115 | PixiJS pipeline + offscreen Canvas 2D bridge |
| `config.js` | ~50 | Difficulty presets (casual/normal/hardcore) |
| `input.js` | ~250 | Keyboard + gamepad polling, rebindable actions |
| `audio.js` | ~330 | Web Audio API procedural SFX + music hooks |
| `storage.js` | ~810 | Persistence, high scores, settings, NC, end-run bonuses |
| `ui-systems.js` | ~380 | Custom difficulty, hangar/shop, tutorial |
| `particles.js` | ~200 | Particles, screen shake, screen transitions |
| `bullets.js` | ~175 | BulletPool class (player + enemy projectiles) |
| `scoring.js` | ~210 | Chain combo, graze, surge meter, popups |
| `enemies.js` | ~830 | Enemy types, AI, patterns, power-ups |
| `waves.js` | ~375 | Wave sequencer + level 1-6 data |
| `level-systems.js` | ~245 | Asteroids, escort, campaign progression |
| `bosses.js` | ~1150 | Boss types, patterns, visuals, defeat sequences |
| `player.js` | ~775 | Player ship, weapons, abilities, collision |
| `background.js` | ~405 | 6-theme parallax backgrounds |
| `hud.js` | ~385 | HUD panels (left + right) |
| `menus.js` | ~540 | All menu screens |
| `game.js` | ~935 | Main game state machine |
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

Levels, enemies, bosses, and difficulty settings are defined as data objects, not hardcoded logic. This makes it easy to add new content without modifying game systems.

**Adding a new level:** Create a new level data object following the existing pattern:

```javascript
const LEVEL_7 = {
    id: 'level_7',
    name: 'Level Name',
    briefing: 'Briefing text shown before the level.\nSupports line breaks.',
    bgType: 'synthwave',     // Background theme (see Background section)
    bossType: 'architect',   // Boss type key (see BossTypes)
    levelScale: 1.0,         // Difficulty multiplier (HP, fire rate, bullet speed)
    hasAsteroids: false,     // Enable asteroid hazards
    hasEscort: false,        // Enable escort mission
    waves: [
        {
            time: 0.5,       // Seconds into the level when this wave spawns
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
        }
    ]
};
```

Then add it to `ALL_LEVELS` array and update `Campaign.getLevelCount()`.

### Central GameConfig

All difficulty-dependent behavior reads from the `GameConfig` object. This is populated from difficulty presets or custom settings at game start.

```javascript
GameConfig = {
    difficulty: 'normal',
    bombs: { enabled: true, startCount: 3 },
    focus: { enabled: true, speedMultiplier: 0.4 },
    dash: { enabled: true, cooldown: 2.0 },
    graze: { enabled: true, zoneMultiplier: 1.0, rewardMultiplier: 1.0 },
    autofire: false,
    lives: 3,
    shieldHp: 0,             // 0 = instant death, >0 = hits absorbed before death
    deathPenalty: 'moderate', // 'none' | 'moderate' | 'full'
    bulletDensity: 1.0,
    chainTimerSpeed: 1.0,
    scoreMultiplier: 1.0,
    fireMode: 'manual',      // 'manual' | 'auto'
    _levelHpScale: 1.0,      // Set at level start from levelScale
    _levelSpeedScale: 1.0    // Set at level start from levelScale
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

### Object Pooling

`BulletPool` is used for both player and enemy projectiles. Bullets are stored in a flat array and removed when inactive, off-screen, or expired. The pool has a max size to prevent memory issues during intense scenes.

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

2. Add a firing pattern case in `Enemies._firePattern()`:
```javascript
case 'my_enemy':
    // Fire bullets here using this.enemyBullets.spawn(...)
    break;
```

3. Add a drawing case in `Enemies.draw()` inside the switch:
```javascript
case 'my_enemy':
    // Draw using ctx (already translated to enemy position)
    break;
```

4. If needed, add special movement in `Enemies._updateMovement()`.

**Enemy properties at spawn (affected by level scaling):**
- `hp` and `maxHp` — multiplied by `GameConfig._levelHpScale`
- `score` — multiplied by `GameConfig._levelHpScale`
- `fireRate` — divided by `GameConfig._levelSpeedScale` (fires faster)
- `bulletSpeed` — multiplied by `GameConfig._levelSpeedScale`

**Formations:** `line`, `v_shape`, `random`, `sides`
**Move paths:** `straight_down`, `sweep_left`, `sweep_right`, `zigzag`, `strafe`, `hover`

### Boss System

Bosses are defined in `BossTypes` and instantiated by the `Boss` singleton:

```javascript
my_boss: {
    name: 'DISPLAY NAME',
    phases: 3,                    // Number of phases
    phaseHps: [120, 160, 200],    // HP per phase
    hasArmor: false,              // If true, phase 1 has destructible armor segments
    armorCount: 4,                // Number of armor segments
    armorHp: 30,                  // HP per armor segment
    colors: ['#ff4444', '#ff00ff', '#ff0040']  // Color per phase
}
```

**Boss attack patterns** are currently defined in `Boss._phase1Attack()`, `_phase2Attack()`, `_phase3Attack()`. These use the same patterns for all boss types. To add boss-specific patterns, add a switch on `this.bossType` inside these methods.

**Boss behavior that varies by type should be conditioned on `this.bossType`** in the relevant method (update, attack, or draw).

### Weapon System

**Weapons have per-type fire rates** (set in the firing code, not the weapon definition):
- Laser: 0.08s (12.5 shots/sec) — high damage, narrow beam
- Base/Spread: 0.12-0.13s (~8 shots/sec) — medium damage, wide coverage
- Homing: 0.2s (5 shots/sec) — low damage, auto-aim

**Damage values:**
- Base shot: 1
- Spread: 1 per projectile
- Homing: 0.5 per missile
- Laser: 2/3/4 per hit (by level)
- Drone shots: 0.5

**Weapon slot system:**
- **Primary slot:** One of spread/homing/laser. Collecting the same type levels up (max 3). Collecting a different type switches at Lv1.
- **Passive slot:** Drones/shield. Always stacks independently from primary.

### Scoring

- **Chain combo:** Kill timer drains over 2.5s. Multiplier tiers: 10hits=2x, 25=3x, 50=5x, 100=8x.
- **Graze:** Enemy bullets passing the graze zone (but not hitbox) fill the Surge meter.
- **Neon Surge:** When meter full, activate for 5s of 3x score + bullet canceling on player shots.
- **Bullet cancel:** Destroying medium+ enemies converts their bullets into 250-point pickups.
- **End-of-run bonuses:** Time, lives, no-death, chain, graze bonuses added to final score.

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
| `highscores` | Top 10 per difficulty | HighScores |
| `settings` | Player preferences | Settings |
| `neonCredits` | Currency balance | NeonCredits |
| `hangar_unlocked` | Purchased items | Hangar |
| `hangar_equipped` | Current loadout | Hangar |
| `campaign` | Levels unlocked, secret flag | Campaign |

---

## Common Tasks

### Adding a New Level

1. Create level data object (see Data-Driven Design above)
2. Add to `ALL_LEVELS` array
3. Update `Campaign.getLevelCount()` and `Campaign.isLevelAvailable()` if needed
4. Optionally create a new background theme
5. Create a new boss type in `BossTypes`
6. Add boss-specific attack patterns if the generic ones aren't suitable

### Adding a New Cosmetic Unlock

1. Add to the appropriate array in `Hangar.catalog` (skins/trails/bullets/explosions):
```javascript
{ id: 'unique_id', name: 'Display Name', cost: 100, color: '#hexcolor' }
```
2. Cosmetics are currently visual definitions only — the equipped cosmetic is tracked in `Hangar.equipped` but **not yet applied to gameplay rendering**. This is the main cosmetic integration TODO.

### Applying Cosmetics to Gameplay

The Hangar tracks equipped cosmetics (`Hangar.equipped.skin`, `.trail`, `.bullet`, `.explosion`) and these are applied in gameplay rendering. Ship skins change the player ship fill colour (including Chromatic Shift and Ghost Frame special skins), engine trails use `Hangar.trailColor`, bullet styles apply base shot colour, and explosion effects vary particle colours on enemy death.

### Tuning Difficulty

**Global knobs:**
- `DIFFICULTY_PRESETS` — Per-preset values for lives, bombs, penalties, bullet density, etc.
- Level `levelScale` — Per-level HP/speed multiplier
- `Enemies.types` — Per-enemy-type base stats
- `BossTypes` — Per-boss phase HP values
- Weapon fire rates in `Player._fire()` timer assignments
- Weapon damage values in `Player._fire()` bullet spawn calls

**Level scaling math:**
- Enemy HP = `base_hp × levelScale`
- Enemy score = `base_score × levelScale`
- Enemy fire rate = `base_rate / (1 + (levelScale - 1) * 0.6)` (faster at higher scale)
- Enemy bullet speed = `base_speed × (1 + (levelScale - 1) * 0.6)`
- Bullet density = `config_density × levelScale`

### Adding Gamepad Button Remapping

The input system supports gamepad via `Input.gpBindings`. Button indices follow the Standard Gamepad Layout. To remap, change the button index arrays. A full remapping UI would need to be added to the Settings screen.

---

## Known Limitations & TODOs

See `neon-storm-checklist.md` for the complete remaining work tracker.

### Renderer
- [ ] PixiJS filters (bloom, blur, distortion) not yet applied — pipeline is in place but Phase 2 work
- [ ] Background sky gradient renders correctly but is not yet GPU-accelerated (draws to offscreen Canvas 2D)
- [ ] Canvas 2D fallback has no glow/shadowBlur effects (intentional — graceful degradation, not parity)

### Gameplay
- [ ] Escort ship (Level 4) doesn't dodge — could benefit from basic avoidance AI
- [ ] Asteroid collision only checks player bullets, not enemy bullets
- [ ] Shield Wall enemies don't visually link together

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
| `neon-storm-gdd.md` | Original Game Design Document |
| `neon-storm-checklist.md` | Remaining work tracker (single source of truth) |
| `neon-storm-dev-guide.md` | This file — developer reference |

---

*Last updated for Neon Storm β — PixiJS renderer pipeline (Phase 1).*
