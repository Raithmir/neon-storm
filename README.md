# Neon Storm β

A vertical scrolling bullet hell shooter built with HTML5 Canvas and vanilla JavaScript.

## Project Structure

```
neon-storm/
├── build.js                 — Build script (concatenates src → dist)
├── package.json             — Project metadata & scripts
├── dist/                    — Built output (generated)
│   ├── neon-storm-alpha.html  — Playable game (single file)
│   └── neon-storm.js          — Combined JS (for debugging)
├── src/                     — Source modules
│   ├── constants.js         — Canvas setup, screen layout, dimensions
│   ├── config.js            — Difficulty presets, GameConfig
│   ├── input.js             — Keyboard + gamepad input system
│   ├── audio.js             — Procedural SFX (Web Audio API)
│   ├── storage.js           — Persistence, high scores, settings, NC, end-run bonuses
│   ├── ui-systems.js        — Custom difficulty, hangar/shop, tutorial
│   ├── particles.js         — Particle effects, screen shake
│   ├── bullets.js           — BulletPool class (player + enemy projectiles)
│   ├── scoring.js           — Chain combo, graze, surge meter
│   ├── enemies.js           — Enemy types, AI, patterns, power-ups
│   ├── waves.js             — Wave sequencer, level 1-6 data
│   ├── level-systems.js     — Asteroids, escort, campaign progression
│   ├── bosses.js            — Boss types, patterns, visuals
│   ├── player.js            — Player ship, weapons, abilities
│   ├── background.js        — Scrolling backgrounds (6 themes)
│   ├── hud.js               — HUD panels (left + right)
│   ├── menus.js             — All menu screens
│   ├── game.js              — Main game state machine
│   └── main.js              — Game loop & initialization
└── docs/                    — Documentation
    ├── neon-storm-gdd.md          — Game Design Document
    ├── neon-storm-dev-guide.md    — Developer Guide
    ├── neon-storm-checklist.md    — Implementation Checklist
    └── neon-storm-future-features.md — Future Features Roadmap
```

## Quick Start

### Play (single file)
```bash
node build.js
```
Open `dist/neon-storm-alpha.html` in any browser. No server required.

### Play (web server)
Serve the project root directory with any HTTP server:
```bash
npx http-server . -p 8080 -c-1
```
Then open `http://localhost:8080` — the `index.html` loads source files directly from `src/`.

### Development
Edit files in `src/`, refresh the browser. No build step needed when using the web server approach.

For the single-file build, run `node build.js` after changes.

## Architecture

The game uses a **concatenation-based build** rather than ES modules. All source files use global scope — each file's objects, classes, and functions are available to files loaded after it. The build script concatenates them in dependency order.

**Why not ES modules?** The codebase has extensive cross-references between systems (Player references Enemies, Scoring, Audio, etc.). Converting to ES modules would require rewriting hundreds of import statements. The concatenation approach preserves the simple global architecture while giving us the organizational benefit of separate files.

**Dependency order matters.** The order in `build.js`'s `SOURCE_FILES` array is the load order. Files can reference globals from any file above them in the list but not below.

## Key Globals

| Object | File | Purpose |
|--------|------|---------|
| `GameConfig` | config.js | Current difficulty settings (mutable) |
| `Input` | input.js | Keyboard/gamepad state |
| `Audio` | audio.js | Sound effects |
| `Player` | player.js | Player ship state |
| `Enemies` | enemies.js | Enemy manager |
| `Boss` | bosses.js | Boss state machine |
| `Scoring` | scoring.js | Score, chain, surge |
| `Game` | game.js | Main state machine |
| `Settings` | storage.js | Player preferences |
| `Hangar` | ui-systems.js | Cosmetics shop |
| `Campaign` | level-systems.js | Level progression |

## Documentation

See the `docs/` folder for detailed documentation:
- **Developer Guide** — Architecture deep-dive, how to add enemies/levels/bosses/weapons
- **Implementation Checklist** — What's done vs what's planned
- **Future Features** — Roadmap with priority matrix
- **Game Design Document** — Original design spec

## Tech Stack

- HTML5 Canvas 2D
- Vanilla JavaScript (no frameworks)
- Web Audio API (procedural SFX)
- Google Fonts (Share Tech Mono)
- localStorage / Artifact Storage API (persistence)
