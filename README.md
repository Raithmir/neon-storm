# Neon Storm β

A vertical scrolling bullet hell shooter built with HTML5 Canvas, PixiJS, and vanilla JavaScript.

## What's New in β

Neon Storm β introduces a **PixiJS rendering pipeline** for the gameplay play area. All gameplay drawing still uses Canvas 2D (unchanged draw methods), but the output is piped through PixiJS as a GPU-rendered texture. This lays the foundation for bloom, post-processing filters, and shader effects in upcoming updates.

- **Dual-canvas architecture:** PixiJS renders the play area (720×960), Canvas 2D overlay handles menus, HUD, and transitions
- **Automatic fallback:** If PixiJS fails to load, the game runs on pure Canvas 2D (looks like the alpha, fully functional)
- **Self-contained build:** `node build.js` downloads and bundles PixiJS inline — the output HTML works offline from `file://`

β also includes a full **gameplay and balance pass** (see `docs/neon-storm-gameplay-review.md`):
- **Pacing:** mid-bosses on every level and ~4-minute stages.
- **Weapons:** a rebalanced weapon curve with a piercing laser, working drones and Neon Surge (with its own SURGE button).
- **Bosses:** phase timeouts, positional armor and telegraphed attacks.
- **Progression:** persistent lives and weapons with score extends, and a death-bomb window.
- **Scaling:** readable difficulty scaling.
- **Bug fixes:** pause-safe game-time scheduling, plus many other gameplay bugs.
- **Tooling:** headless simulation and regression checks in `tools/sim/`.

## Project Structure

```
neon-storm/
├── build.js                 — Build script (downloads PixiJS, concatenates src → dist)
├── package.json             — Project metadata & scripts
├── vendor/                  — Cached dependencies (auto-populated by build)
│   └── pixi.min.js          — PixiJS v8 (downloaded on first build)
├── dist/                    — Built output (generated)
│   ├── neon-storm-beta.html — Playable game (single file, works offline)
│   └── neon-storm.js        — Combined JS (for debugging)
├── src/                     — Source modules
│   ├── constants.js         — Canvas setup, screen layout, dual-canvas sizing
│   ├── renderer.js          — PixiJS pipeline + offscreen Canvas 2D bridge
│   ├── config.js            — Difficulty presets, GameConfig
│   ├── input.js             — Keyboard + gamepad input system
│   ├── audio.js             — Procedural SFX (Web Audio API)
│   ├── storage.js           — Persistence, high scores, settings, NC, achievements, end-of-level bonuses
│   ├── ui-systems.js        — Custom difficulty, hangar/shop, tutorial
│   ├── particles.js         — Particle effects, screen shake, transitions
│   ├── bullets.js           — BulletPool class (player + enemy projectiles)
│   ├── scoring.js           — Chain combo, graze, surge meter
│   ├── enemies.js           — Enemy types, AI, patterns, power-ups
│   ├── midbosses.js         — Mid-boss types, movement, patterns, rewards
│   ├── waves.js             — Game-time scheduler, wave sequencer, level 1-6 data, Endless
│   ├── level-systems.js     — Asteroids, escort, campaign progression
│   ├── bosses.js            — Boss types, patterns, visuals
│   ├── player.js            — Player ship, weapons, abilities
│   ├── background.js        — Scrolling backgrounds (6 themes)
│   ├── hud.js               — HUD panels (left + right)
│   ├── menus.js             — All menu screens
│   ├── game.js              — Main game state machine
│   └── main.js              — Game loop & initialization
├── tools/sim/               — Headless gameplay simulation + regression checks (see its README)
└── docs/                    — Documentation
    ├── neon-storm-dev-guide.md       — Developer Guide
    ├── neon-storm-checklist.md       — Remaining Work Checklist
    ├── neon-storm-gdd.md             — Game Design Document (v1.1)
    └── neon-storm-gameplay-review.md — Gameplay/balance review and measurements
```

## Quick Start

### Build (single file, works offline)
```bash
node build.js
```
First build downloads PixiJS (~250KB) and caches it in `vendor/`. Output is `dist/neon-storm-beta.html` — double-click to play, no server required.

### Play (web server, for development)
```bash
npx http-server . -p 8080 -c-1
```
Open `http://localhost:8080` — `index.html` loads PixiJS from CDN and source files from `src/`.

### Development
Edit files in `src/`, refresh the browser. No build step needed when using the web server approach. For the single-file build, run `node build.js` after changes.

### Checking gameplay changes
```bash
npm install --no-save playwright   # dev-only
node build.js
npm run sim:checks                 # regression checks (all should pass)
```
See `tools/sim/README.md` for the balance tools (weapon DPS, boss time-to-kill, bot play-throughs, campaign runs).

## Architecture

### Rendering Pipeline

The game uses a **dual-canvas architecture** introduced in beta:

1. **Offscreen Canvas 2D** (720×960) — All gameplay `.draw(ctx)` methods draw here using standard Canvas 2D API. No draw code was changed from the alpha.
2. **PixiJS Application** — Takes the offscreen canvas as a texture, renders it as a GPU sprite. This enables GPU filters (bloom, blur, distortion) to be applied to the entire play area.
3. **Overlay Canvas 2D** (1920×1080) — Menus, HUD, transitions, and all non-gameplay UI draw here directly.

The `Renderer` module (`renderer.js`) manages this pipeline. During gameplay, `Game.draw()` calls `Renderer.getPlayCtx()` to get the offscreen Canvas 2D context, passes it to all gameplay draw methods, then calls `Renderer.endFrame()` to upload and GPU-render. When PixiJS isn't available, the offscreen canvas is blitted directly onto the overlay canvas instead.

### Module System

The game uses a **concatenation-based build** rather than ES modules. All source files use global scope — each file's objects, classes, and functions are available to files loaded after it. The build script concatenates them in dependency order.

**Dependency order matters.** The order in `build.js`'s `SOURCE_FILES` array is the load order. Files can reference globals from any file above them in the list but not below.

## Key Globals

| Object | File | Purpose |
|--------|------|---------|
| `Renderer` | renderer.js | PixiJS pipeline + offscreen canvas bridge |
| `GameConfig` | config.js | Current difficulty settings (mutable) |
| `Input` | input.js | Keyboard/gamepad state |
| `Audio` | audio.js | Sound effects |
| `Player` | player.js | Player ship state |
| `Enemies` | enemies.js | Enemy manager |
| `Boss` | bosses.js | Boss state machine |
| `MidBoss` | midbosses.js | Mid-boss behaviour (types in `MidBossTypes`) |
| `WaveSystem` / `Scheduler` | waves.js | Wave sequencer / game-time delayed actions |
| `Scoring` | scoring.js | Score, chain, surge |
| `Game` | game.js | Main state machine |
| `Settings` | storage.js | Player preferences |
| `Hangar` | ui-systems.js | Cosmetics shop |
| `Campaign` | level-systems.js | Level progression |

## Documentation

See the `docs/` folder:
- **Developer Guide** — Architecture deep-dive, how to add enemies/levels/bosses/weapons
- **Remaining Work Checklist** — Everything left to do, by category
- **Game Design Document** — Design spec (v1.1, matches the implemented gameplay)
- **Gameplay Review** — Balance review, genre targets, fix passes and simulation results

## Tech Stack

- **Rendering:** PixiJS v8 (WebGPU/WebGL) for gameplay, HTML5 Canvas 2D for UI
- **Language:** Vanilla JavaScript (no frameworks)
- **Audio:** Web Audio API (procedural SFX)
- **Fonts:** Google Fonts (Share Tech Mono)
- **Persistence:** localStorage / Artifact Storage API
