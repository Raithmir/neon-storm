# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (no build step needed — edit src/, refresh browser)
npx http-server . -p 8080 -c-1
# Open http://localhost:8080

# Build single-file distributable (downloads PixiJS on first run)
node build.js
# Output: dist/neon-storm-beta.html (offline-capable), dist/neon-storm.js (debug)
```

There are no unit tests, no lint, and no transpilation — vanilla JS only.

```bash
# Headless gameplay simulation (dev-only; needs: npm install --no-save playwright)
npm run sim:checks     # regression checks for known gameplay bugs (tools/sim/checks.js)
```

See `tools/sim/README.md` for the weapon DPS, boss time-to-kill and bot play-through tools.

## Architecture

### Module System

All 20 source files in `src/` use **global scope** — no ES modules, no imports. They are concatenated by `build.js` in dependency order (defined in `SOURCE_FILES`). For `index.html` dev mode, they load via `<script>` tags in the same order. **Files can only reference globals from files listed above them in `SOURCE_FILES`.**

### Rendering Pipeline (Dual-Canvas)

```
All .draw(ctx) calls → Offscreen Canvas 2D (720×960)
                               ↓
                    PixiJS GPU texture upload
                               ↓
                    PixiJS Sprite + Filters → Pixi canvas (play area)

Menus / HUD / transitions → Overlay Canvas 2D (1920×1080) directly
```

- `Renderer.getPlayCtx()` — returns the offscreen Canvas 2D context for gameplay drawing
- `Renderer.beginFrame()` / `Renderer.endFrame()` — frame lifecycle; `endFrame()` uploads to GPU
- `Renderer.setShake(x, y)` — screen shake via PixiJS sprite offset
- When PixiJS is unavailable, `endFrame()` is a no-op and `Game.draw()` blits the offscreen canvas directly to the overlay canvas — all draw code works identically in both paths

### State Machine (`game.js`)

```
title → difficulty_select → briefing → playing ↔ paused
                  ↓                        ↓
          custom_difficulty            game_over → title
                                           ↓
                                       victory → briefing (next level) → title

Other states: settings, high_scores, hangar, tutorial
```

### Key Globals

| Global | File | Purpose |
|--------|------|---------|
| `Renderer` | renderer.js | PixiJS pipeline manager |
| `GameConfig` | config.js | Live difficulty settings (mutated at level start) |
| `Input` | input.js | Keyboard/gamepad polling |
| `Audio` | audio.js | Procedural SFX via Web Audio API |
| `Player` | player.js | Player ship state |
| `Enemies` | enemies.js | Enemy manager |
| `Boss` | bosses.js | Boss singleton |
| `Scoring` | scoring.js | Score, chain combo, surge meter |
| `Game` | game.js | Main state machine |
| `Settings` | storage.js | Persisted player preferences |
| `Hangar` | ui-systems.js | Cosmetics/unlock shop |
| `Campaign` | level-systems.js | Level progression |
| `WaveSystem` | waves.js | Wave sequencer |

### Data-Driven Content

Levels, enemies, bosses, and difficulty are data objects — not hardcoded logic. Difficulty-dependent behavior reads from `GameConfig` (populated from `DIFFICULTY_PRESETS` or custom settings at `Game.startLevel()`). Level scaling multiplies HP, fire rate, and bullet speed via `GameConfig._levelHpScale` / `GameConfig._levelSpeedScale`.

**Adding a new enemy:** define in `Enemies.types`, add firing case in `Enemies._firePattern()`, add draw case in `Enemies.draw()`, optionally add movement in `Enemies._updateMovement()`.

**Adding a new level:** create a level data object with `id`, `name`, `briefing`, `bgType`, `bossType`, `levelScale`, `waves[]`, add to `ALL_LEVELS`, update `Campaign.getLevelCount()`.

**Adding a new boss:** define in `BossTypes` with `phases`, `phaseHps`, `hasArmor`, `colors`. Boss-specific attack behavior goes in `Boss._phase1/2/3Attack()` conditioned on `this.bossType`.

### Persistence

`storage.js` wraps both `localStorage` and the Artifact Storage API. High scores, settings, Neon Credits, hangar cosmetics, and campaign progress all persist here.

### Boot Sequence (`main.js`)

```javascript
Renderer.init()  // async — sets up PixiJS Application
→ resizeCanvas() // position pixi canvas over play area
→ Game.init()    // loads all persistent state
→ requestAnimationFrame(gameLoop)
```

Each frame: `Game.update(dt)` → `Game.draw()` → `Input.lateUpdate()`.
