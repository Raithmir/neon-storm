# Neon Storm δ

A vertical scrolling bullet hell shooter with a neon vector look, built with PixiJS, three.js and vanilla JavaScript.

**Play it in your browser:** https://raithmir.github.io/neon-storm/ (published from `main` on every push)

## The Game

- **Campaign:** six levels of about 3–4.5 minutes, each with a mid-boss and a boss (the sixth is a secret, unlocked by finishing Level 5 on Normal or Hardcore).
- **Endless:** survive escalating waves for as long as you can.
- **Boss modes:** Boss Rush (every boss back to back) and Boss Practice (any boss you've beaten, from any phase).
- **Scoring:** chain combos, grazing bullets to charge Neon Surge, score extends, end-of-level bonuses.
- **Weapons:** Spread, Homing and Laser, each upgradable to LV5, plus drones; bombs, a dash and a focus mode.
- **Difficulty:** Casual, Normal, Hardcore, or Custom with 15 toggles.
- **Meta:** high scores, achievements, and Neon Credits to spend on cosmetics in the Hangar.
- Keyboard or gamepad, with rebindable controls.

## What's New in δ

- **3D backgrounds:** each level flies through its own three.js scene (`src/backdrop3d.js`):
  - Level 1: a synthwave grid racing toward a striped sun setting behind Neo-Tokyo
  - Level 2: a foundry canyon with a molten channel
  - Level 3: an asteroid belt beside a ringed gas giant
  - Level 4: a night flight over moonlit clouds with a city below
  - Level 5: a circuit-board city toward a pulsing Core
  - Level 6: a collapsing tunnel into a singularity

  They pulse on bombs, shift for bosses and dim under dense bullet patterns. Settings → 3D BACKDROPS switches back to the GPU shader backgrounds (`src/backdrops.js`), which are also used at LOW quality and without WebGL2.
- **Boss Rush:** clear the campaign to unlock every boss back to back, each in its own level. Pick a weapon, then one upgrade out of three between bosses. Ranked by score with a time bonus, with split times and its own high-score tab.
- **Boss Practice:** fight any boss you've beaten, from any phase, with your choice of difficulty and loadout. It keeps a best time per boss. Both modes are under BOSS MODES on the title screen.
- **Faster rendering:** gameplay is now drawn as native PixiJS sprites and shapes (`src/gpu-ctx.js`) instead of a canvas re-uploaded to the GPU every frame (13 MB per frame at HIGH), and the HUD costs a third of what it did.
- **New effects:** heat haze behind bosses, energy outlines on shielded ships, and space warping around teleporting enemies.
- **Fixes:** no more stutter when a boss changes phase, and results screens no longer count end-of-run bonuses twice.

## What Was New in γ

γ was a full visual overhaul: everything was redrawn in a **neon vector** style (glowing line art, as in Geometry Wars or Tempest 4000), rendered sharp at your screen's real resolution.

- **Neon line art:** the player, all enemies, mid-bosses (each with its own design), bosses, power-ups, asteroids and the escort are glowing outlines with animated parts, cached in a sprite atlas (`src/neon.js`).
- **Shots and explosions:** shaped bullets (enemy orbs with dark shadows for readability, needles, player streaks, missiles, a continuous laser), impact sparks, and ships that shatter into their own outline pieces.
- **New UI:** neon title, menus, briefing (with the level's backdrop and boss preview), results screens, hangar with live previews, and a redesigned HUD (`src/ui-kit.js`).
- **Cosmetics that look different:** Hangar bullet styles, trails and explosions each have their own shapes, not just colours.
- **Settings:** GRAPHICS QUALITY (auto/high/medium/low, renders up to 2× on high-DPI screens), and FLASH REDUCTION covers every flash, glitch and pulse.
- **Soundtrack:** procedural synthwave generated live (`src/music.js`): a menu theme, a track for each level, boss tracks, Endless, and victory / game-over stings. It builds with the action, muffles on pause and ducks under bombs.
- **Sound effects:** layered explosions with glassy shatter, a heavier bomb, a laser hum, missile launches, a boss WARNING siren, phase-change glitches and an extra-life fanfare.
- **Gamepad prompts:** menus show controller buttons when you're playing with a gamepad.
- **Save versioning:** older saves are upgraded automatically, keeping unlocks, credits, cosmetics and achievements.

## What Was New in β

Neon Storm β introduced a **PixiJS rendering pipeline** for the gameplay play area. Gameplay was still drawn with Canvas 2D and piped through PixiJS as a GPU texture, which laid the foundation for the bloom, filters and shader effects that followed (and, in δ, for drawing everything natively in PixiJS).

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
├── build.js                 — Build script (concatenates src and inlines vendor/ → dist)
├── package.json             — Project metadata & scripts
├── vendor/                  — Libraries inlined into the build (committed)
│   ├── pixi.min.js          — PixiJS 8.18.1 (pinned: backdrop3d.js uses its internals)
│   ├── pixi-filters.min.js  — pixi-filters v6: shockwave, god-ray and glitch effects
│   └── three.min.js         — three.js r186, only the classes the 3D backgrounds use
├── dist/                    — Built output (generated)
│   ├── neon-storm-delta.html — Playable game (single file, works offline)
│   └── neon-storm.js        — Combined JS (for debugging)
├── src/                     — Source modules
│   ├── constants.js         — Canvas setup, screen layout, dual-canvas sizing
│   ├── backdrops.js         — GPU shader backgrounds for each level (fallback)
│   ├── renderer.js          — PixiJS pipeline (Canvas 2D fallback)
│   ├── gpu-ctx.js           — Canvas 2D-shaped context that draws with Pixi objects
│   ├── backdrop3d.js        — three.js 3D level backgrounds on Pixi's GL context
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
│   ├── level-systems.js     — Asteroids, escort, campaign progression, Boss Rush / Practice
│   ├── bosses.js            — Boss types, patterns, visuals
│   ├── player.js            — Player ship, weapons, abilities
│   ├── background.js        — Painted Canvas 2D backgrounds (fallback without WebGL)
│   ├── hud.js               — HUD panels (left + right)
│   ├── menus.js             — All menu screens
│   ├── game.js              — Main game state machine
│   ├── music.js             — Procedural synthwave soundtrack
│   └── main.js              — Game loop & initialization
├── tools/sim/               — Headless gameplay simulation + regression checks (see its README)
├── tools/three/             — Rebuilds vendor/three.min.js (npm run three:bundle)
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
The libraries in `vendor/` are committed, so no download is needed. Output is `dist/neon-storm-delta.html` (about 2.2 MB, everything inlined): double-click it to play, no server required. `dist/neon-storm.js` is the game code alone, for debugging; you don't need it to play.

### Play (web server, for development)
```bash
npx http-server . -p 8080 -c-1
```
Open `http://localhost:8080`: `index.html` loads PixiJS from a CDN (pinned to 8.18.1), three.js from `vendor/` and the source files from `src/`.

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

The game uses a **dual-canvas architecture**:

1. **Gameplay drawing** — All gameplay `.draw(ctx)` methods use the standard Canvas 2D API. Since δ the context they get in Pixi mode is a `GpuCtx` (`gpu-ctx.js`), which turns those calls into Pixi sprites and graphics, so nothing is re-uploaded each frame. Without WebGL they draw to an offscreen Canvas 2D (720×960) instead.
2. **PixiJS Application** — Renders the play area on the GPU, with filters (bloom, blur, distortion) over all of it. Under everything is the level's background: a three.js scene sharing Pixi's WebGL context (`backdrop3d.js`), or a GPU shader (`backdrops.js`) as the fallback.
3. **Overlay Canvas 2D** (1920×1080) — Menus, HUD, transitions, and all non-gameplay UI draw here directly.

Bullets and particles are native Pixi particles, and both canvases render at the display's pixel density. `CLAUDE.md` has the details.

The `Renderer` module (`renderer.js`) manages this pipeline. During gameplay, `Game.draw()` calls `Renderer.getEntityCtx()`, passes it to all gameplay draw methods, then calls `Renderer.endFrame()` to GPU-render. When PixiJS isn't available, that context is the offscreen canvas, which is blitted onto the overlay canvas instead.

### Module System

The game uses a **concatenation-based build** rather than ES modules. All source files use global scope — each file's objects, classes, and functions are available to files loaded after it. The build script concatenates them in dependency order.

**Dependency order matters.** The order in `build.js`'s `SOURCE_FILES` array is the load order. Files can reference globals from any file above them in the list but not below.

## Key Globals

| Object | File | Purpose |
|--------|------|---------|
| `Renderer` | renderer.js | PixiJS pipeline (+ Canvas 2D fallback) |
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
| `Campaign` | level-systems.js | Level progression, beaten bosses |
| `BossRush` | level-systems.js | Boss Rush and Boss Practice runs |
| `Backdrop3D` | backdrop3d.js | three.js level backgrounds (scenes in `BACKDROP_SCENES_3D`) |

## Documentation

See the `docs/` folder:
- **Developer Guide** — Architecture deep-dive, how to add enemies/levels/bosses/weapons
- **Remaining Work Checklist** — Everything left to do, by category
- **Game Design Document** — Design spec (v1.1, matches the implemented gameplay)
- **Gameplay Review** — Balance review, genre targets, fix passes and simulation results

## Tech Stack

- **Rendering:** PixiJS v8 (WebGL) for gameplay, three.js for the 3D backgrounds on the same WebGL context, HTML5 Canvas 2D for UI
- **Language:** Vanilla JavaScript (no frameworks)
- **Audio:** Web Audio API (procedural SFX and soundtrack)
- **Fonts:** Google Fonts (Share Tech Mono)
- **Persistence:** localStorage / Artifact Storage API
