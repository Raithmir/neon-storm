# Neon Storm γ

A vertical scrolling bullet hell shooter built with HTML5 Canvas, PixiJS, and vanilla JavaScript.

**Play it in your browser:** https://raithmir.github.io/neon-storm/ (published from `main` on every push)

## What's New in γ

Neon Storm γ is a full visual overhaul: everything is redrawn in a **neon vector** style (glowing line art, as in Geometry Wars or Tempest 4000), and the whole game renders sharp at your screen's real resolution.

- **Neon line art:** the player, all enemies, mid-bosses (each now with its own design), bosses, power-ups, asteroids and the escort are glowing outlines with animated parts, cached in a sprite atlas (`src/neon.js`).
- **Shader backgrounds:** each level is a GPU shader (`src/backdrops.js`) that streams toward you: a synthwave grid, a foundry floor, deep space, city lights under clouds, a circuit board and a collapsing void tunnel. They pulse on bombs, shift for bosses and dim under dense bullet patterns.
- **Shots and explosions:** shaped bullets (enemy orbs with dark shadows for readability, needles, player streaks, missiles, a continuous laser), impact sparks, and ships that shatter into their own outline pieces.
- **New UI:** neon title, menus, briefing (with the level's backdrop and boss preview), results screens, hangar with live previews, and a redesigned HUD (`src/ui-kit.js`).
- **Cosmetics that look different:** Hangar bullet styles, trails and explosions each have their own shapes, not just colours.
- **Settings:** GRAPHICS QUALITY (auto/high/medium/low, renders up to 2× on high-DPI screens), and FLASH REDUCTION now covers every flash, glitch and pulse.
- **Soundtrack:** procedural synthwave generated live (`src/music.js`): a menu theme, a track for each level, boss tracks, Endless, and victory / game-over stings. It builds with the action (drums join after the briefing, a lead comes in for mid-bosses and bosses, fills for the final phase and Neon Surge), muffles on pause and ducks under bombs. MUSIC VOLUME now works.
- **Sound effects:** reworked to match the visuals: layered explosions with glassy shatter, a heavier bomb, a laser hum, missile launches, a boss WARNING siren, phase-change glitches and an extra-life fanfare.
- **Gamepad prompts:** menus show controller buttons when you're playing with a gamepad.
- **Save versioning:** older saves are upgraded automatically. High scores and level records from before the rebalance are archived and reset; unlocks, credits, cosmetics and achievements are kept.

## What Was New in β

Neon Storm β introduced a **PixiJS rendering pipeline** for the gameplay play area. All gameplay drawing still uses Canvas 2D (unchanged draw methods), but the output is piped through PixiJS as a GPU-rendered texture. This lays the foundation for bloom, post-processing filters, and shader effects in upcoming updates.

- **Dual-canvas architecture:** PixiJS renders the play area (720×960), Canvas 2D overlay handles menus, HUD, and transitions
- **Automatic fallback:** If PixiJS fails to load, the game runs on pure Canvas 2D (looks like the alpha, fully functional)
- **Self-contained build:** `node build.js` downloads and bundles PixiJS inline — the output HTML works offline from `file://`

β also included a full **gameplay and balance pass** (see `docs/neon-storm-gameplay-review.md`):
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
│   ├── pixi.min.js          — PixiJS v8 (downloaded on first build)
│   └── pixi-filters.min.js  — pixi-filters v6: shockwave, god-ray and glitch effects
├── dist/                    — Built output (generated)
│   ├── neon-storm-gamma.html — Playable game (single file, works offline)
│   └── neon-storm.js        — Combined JS (for debugging)
├── src/                     — Source modules
│   ├── constants.js         — Canvas setup, screen layout, dual-canvas sizing
│   ├── backdrops.js         — GPU shader backgrounds for each level
│   ├── renderer.js          — PixiJS pipeline + offscreen Canvas 2D bridge
│   ├── config.js            — Difficulty presets, GameConfig
│   ├── input.js             — Keyboard + gamepad input system
│   ├── audio.js             — Procedural SFX + mix (Web Audio API)
│   ├── storage.js           — Persistence, high scores, settings, NC, achievements, end-of-level bonuses
│   ├── ui-systems.js        — Custom difficulty, hangar/shop, tutorial
│   ├── neon.js              — Neon line-art helpers + sprite atlas
│   ├── ui-kit.js            — UI building blocks (menu background, panels, titles, items)
│   ├── particles.js         — Particle effects, screen shake, transitions
│   ├── bullets.js           — BulletPool class (player + enemy projectiles)
│   ├── scoring.js           — Chain combo, graze, surge meter
│   ├── enemies.js           — Enemy types, AI, patterns, power-ups
│   ├── midbosses.js         — Mid-boss types, movement, patterns, rewards
│   ├── waves.js             — Game-time scheduler, wave sequencer, level 1-6 data, Endless
│   ├── level-systems.js     — Asteroids, escort, campaign progression
│   ├── bosses.js            — Boss types, patterns, visuals
│   ├── player.js            — Player ship, weapons, abilities
│   ├── background.js        — Painted Canvas 2D backgrounds (fallback without WebGL)
│   ├── hud.js               — HUD panels (left + right)
│   ├── menus.js             — All menu screens
│   ├── game.js              — Main game state machine
│   ├── music.js             — Procedural synthwave soundtrack
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
First build downloads PixiJS (~250KB) and caches it in `vendor/`. Output is `dist/neon-storm-gamma.html` — double-click to play, no server required.

### Play (web server, for development)
```bash
npx http-server . -p 8080 -c-1
```
Open `http://localhost:8080` — `index.html` loads PixiJS from CDN and source files from `src/`.

### Development
Edit files in `src/`, refresh the browser. No build step needed when using the web server approach. For the single-file build, run `node build.js` after changes.

### Checking changes
```bash
npm install --no-save playwright   # dev-only
npx playwright install chromium    # once per machine
node build.js
npm run sim:checks                 # gameplay regression checks
npm run sim:render                 # every screen and level drawn, fails on any error
npm run sim:audio                  # every music track and sound effect rendered offline
```
CI runs the same checks on every pull request. What's planned next is in `docs/neon-storm-checklist.md` (start with "Picking Up Where We Left Off").
See `tools/sim/README.md` for the balance tools (weapon DPS, boss time-to-kill, bot play-throughs, campaign runs).

## Architecture

### Rendering Pipeline

The game uses a **dual-canvas architecture** introduced in beta:

1. **Offscreen Canvas 2D** (720×960) — All gameplay `.draw(ctx)` methods draw here using standard Canvas 2D API. No draw code was changed from the alpha.
2. **PixiJS Application** — Takes the offscreen canvas as a texture, renders it as a GPU sprite. This enables GPU filters (bloom, blur, distortion) to be applied to the entire play area.
3. **Overlay Canvas 2D** (1920×1080) — Menus, HUD, transitions, and all non-gameplay UI draw here directly.

Since γ, a full-screen shader backdrop sits under the play area, bullets and particles are native Pixi particles, and both canvases render at the display's pixel density (see `CLAUDE.md` for the details).

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
| `Music` | music.js | Soundtrack |
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
- **Audio:** Web Audio API (procedural SFX and soundtrack)
- **Fonts:** Google Fonts (Share Tech Mono)
- **Persistence:** localStorage / Artifact Storage API
