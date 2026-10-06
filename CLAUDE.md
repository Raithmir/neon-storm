# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (no build step needed — edit src/, refresh browser)
npx http-server . -p 8080 -c-1
# Open http://localhost:8080

# Build single-file distributable (bundles vendor/pixi.min.js and vendor/pixi-filters.min.js; downloads them if missing)
node build.js
# Output: dist/neon-storm-delta.html (offline-capable), dist/neon-storm.js (debug)
```

There are no unit tests, no lint, and no transpilation — vanilla JS only.

```bash
# Headless gameplay simulation (dev-only; needs: npm install --no-save playwright)
npm run sim:checks     # regression checks for known gameplay bugs (tools/sim/checks.js)
npm run sim:render     # render smoke test: every screen + every level drawn, fails on any error
npm run sim:audio      # audio check: every music track + SFX rendered offline; --wav writes previews
```

CI (`.github/workflows/ci.yml`) runs on every PR and on pushes to main/delta: it builds, fails if the committed `dist/` doesn't match `src/` (so always run `node build.js` and commit `dist/`), then runs `sim:checks` in one job and `sim:render` + `sim:audio` in a parallel one (Playwright's Chromium is cached). Pushes to main deploy the built game to GitHub Pages (`.github/workflows/pages.yml`).

Settings → SHOW FPS displays an FPS/frame-time readout with the graphics quality and object counts (`FpsMeter` in hud.js).

The official PixiJS v8 agent skills are vendored in `.claude/skills/pixijs*` (pinned; see `.claude/skills/PIXIJS-SKILLS.md`). Their examples use `import`s — here it's the global `PIXI.*` build.

See `tools/sim/README.md` for the weapon DPS, boss time-to-kill and bot play-through tools.

## Architecture

### Module System

All 26 source files in `src/` use **global scope** — no ES modules, no imports. They are concatenated by `build.js` in dependency order (defined in `SOURCE_FILES`). For `index.html` dev mode, they load via `<script>` tags in the same order. **Files can only reference globals from files listed above them in `SOURCE_FILES`.**

### Rendering Pipeline (Dual-Canvas)

```
Level backdrop shader (backdrops.js) → PixiJS Mesh at the bottom of gameLayer
Entity/particle .draw(ctx) calls → GpuCtx (gpu-ctx.js) → pooled Pixi sprites + graphics
Bullets, particles, glow halos → native Pixi particles
                               ↓
                    Filters → Pixi canvas (play area)

Menus / HUD / transitions → Overlay Canvas 2D (1920×1080) directly
```

- `Renderer.getEntityCtx()` — the context gameplay draw code gets: in Pixi mode a `GpuCtx`, which implements the subset of the Canvas 2D API the draw code uses (transforms, paths, fill/stroke, `drawImage`, text, `clip`, `'lighter'`) by emitting Pixi objects in call order; otherwise the offscreen canvas. Art is still written once against Canvas 2D. A Canvas method `GpuCtx` lacks (e.g. `createLinearGradient`) throws, which `sim:render` catches, and unsupported properties such as `shadowBlur` are ignored — extend `gpu-ctx.js` rather than drawing to the canvas. Neon atlas pages become Pixi textures (`Neon._bake` flags the page so it re-uploads)
- Per-object filters: `Neon.filtered(ctx, filters, fn)` draws `fn` through Pixi filters (GpuCtx `beginLayer`/`endLayer`; plain Canvas 2D draws it unfiltered) — used for shield outlines (`Renderer.shieldGlow(hit)`). The backdrop and entities sit in `Renderer.worldLayer`, which carries the teleport warp (`_updateWarp`); bullets and particles are outside it so distortion never moves them. Bosses get a heat haze in the backdrop shaders (`uHaze`, `haze()` in `backdrops.js`)
- `Renderer.getPlayCtx()` — the offscreen Canvas 2D context; in Pixi mode only `Background.draw()` uses it, and only when there's no shader backdrop, so it is neither cleared nor uploaded otherwise
- `Renderer.beginFrame()` / `Renderer.endFrame()` — frame lifecycle; `endFrame()` renders the glow halos (`addGlow`) into `_glowRT` for bloom, then the stage
- `Renderer.setShake(x, y)` — screen shake via PixiJS sprite offset
- Each level's background is a GPU fragment shader in `backdrops.js` (`BACKDROP_SHADERS[bgType]`), drawn by `Renderer.setBackdrop()` under everything else. Its uniforms (`Renderer._updateBackdrop`) react to bombs/flashes (`bgPulse`), bosses, Surge and bullet density (it dims under dense patterns). When it is active, `Background.draw()` skips the painted Canvas 2D background, which remains the no-WebGL fallback
- Bullets and particles are native Pixi particles using shapes from one FX texture sheet (`Renderer.fx`: glow, orb, core, shadow, streak, needle, missile, spark). Enemy bullets get a dark shadow (normal blend) under an additive orb/needle and core; player shots are streaks/missiles pointing along their velocity. `Particles.flash/impact/spawnExplosion/shatter` build effects; `shatter` breaks an entity's neon outline (`Enemies.outline`, `MidBoss.outline`, `Boss.outlines`) into spinning line segments
- Resolution: both the overlay and the play area render at the display's pixel density (CSS scale × `devicePixelRatio`), capped by the GRAPHICS QUALITY setting (`Renderer.QUALITY`: high 2×, medium 1.5×, low 1×; `auto` starts high and steps down after ~3 s of slow frames in play). Draw code keeps using logical coordinates; `Renderer.applyResolution()` sets the canvas transforms (`Renderer.uiScale`, `Renderer.playScale`). Pixi filters use `resolution: 'inherit'`. Caches drawn onto the overlay must be baked at `Renderer.uiScale` (see `UI._bakeBackground`)
- Screen effects (bomb shockwave, boss god-rays, phase-change glitch) use pixi-filters v6 (the PixiJS v8 line, `PIXI.filters`), bundled by `build.js`; `Renderer._filtersLib()` guards them, and their centres are in play-area pixels
- When PixiJS is unavailable, `getEntityCtx()` is the offscreen canvas and `Game.draw()` blits it to the overlay — all draw code works identically in both paths

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
| `Audio` | audio.js | Procedural SFX via Web Audio API; the mix buses (SFX, music, compressor) |
| `Music` | music.js | Procedural synthwave soundtrack, driven by game state each frame |
| `Player` | player.js | Player ship state |
| `Enemies` | enemies.js | Enemy manager |
| `Boss` | bosses.js | Boss singleton |
| `Scoring` | scoring.js | Score, chain combo, surge meter |
| `Game` | game.js | Main state machine |
| `Settings` | storage.js | Persisted player preferences |
| `Neon` | neon.js | Line-art helpers for the neon vector style |
| `UI` | ui-kit.js | Menu/HUD building blocks: background, panels, titles, menu items |
| `Hangar` | ui-systems.js | Cosmetics/unlock shop |
| `Campaign` | level-systems.js | Level progression |
| `WaveSystem` | waves.js | Wave sequencer |

### Data-Driven Content

Levels, enemies, bosses, and difficulty are data objects — not hardcoded logic. Difficulty-dependent behavior reads from `GameConfig` (populated from `DIFFICULTY_PRESETS` or custom settings at `Game.startLevel()`). Level scaling multiplies HP, fire rate, and bullet speed via `GameConfig._levelHpScale` / `GameConfig._levelSpeedScale`.

**Adding a new enemy:** define in `Enemies.types`, add firing case in `Enemies._firePattern()`, add its art in `Enemies._bake` / `Enemies._neon` (see Art Style), optionally add movement in `Enemies._updateMovement()`.

**Adding a new level:** create a level data object with `id`, `name`, `briefing`, `bgType`, `bossType`, `levelScale`, `waves[]`, add to `ALL_LEVELS`, update `Campaign.getLevelCount()`.

**Adding a new mid-boss:** define it in `MidBossTypes` (`midbosses.js`) with `movement` and `patterns` (implement new pattern names in `MidBoss.fire()`), then add `{ time: T, midboss: 'id' }` to a level's `waves`. The wave clock (`WaveSystem.waveTime`) pauses while it is alive; it escapes after `MIDBOSS_TIME_LIMIT`.

**Adding a new boss:** define in `BossTypes` with `phases`, `phaseHps`, `hasArmor`, `colors`. Boss-specific attack behavior goes in `Boss._phase1/2/3Attack()` conditioned on `this.bossType`.

### Art Style

Entities are drawn as neon line art using the `Neon` helpers in `neon.js`; the style rules are in that file's header.

Each module keeps its art next to its logic: `Enemies._neon` / `_bake`, `MidBoss._neon` / `_bake`, `Boss._neon` / `_bake`, `Player._drawShipNeon`, `PowerUps._drawNeon`. The `_bake` functions draw the static body and run once per sprite key via `Neon.sprite()`, which caches the result in a shared texture atlas; the `_neon` functions stamp that sprite and draw the animated parts (lights, rotors, flames) live. Sprite keys include the colour and flash state, so a new colour just bakes a new sprite. Set `Neon.BAKE = false` in the console to draw everything live when checking art changes.

**Adding art for a new enemy/boss:** add a `_bake` entry for the static body and a `_neon` entry that calls `Neon.sprite(ctx, key, halfSize, bakeFn, ...)` then draws the live parts; `halfSize` must cover the art plus its glow. Every enemy type needs a `_neon` entry (mid-bosses: `MidBoss._neon`).

### UI

Menus, briefing, results screens and the HUD are drawn on the overlay canvas with the `UI` kit (`ui-kit.js`): `UI.background` (animated neon horizon), `UI.panel`, `UI.title`, `UI.item` (menu entries), `UI.hint`, plus `Neon.text` / `Neon.bar` / `Neon.topBar`. Screen code sets `Menu.items` while drawing, and `Game.update()` reads it for navigation, so keep the item lists in step with the handlers. The briefing renders the upcoming level's backdrop in the play area.

Flash Reduction (`Settings.values.flashReduction`) is honoured through `Renderer.calm()`: every flash, glitch, chromatic split and backdrop pulse must check it.

Hangar cosmetics change the look, not just the colour: bullet styles pick the player shot shape (`BulletPool._addParticles`), trails pick the style in `Player.drawTrail`, explosions pass `variant` to `Particles.spawnExplosion`. The Hangar preview reuses the same drawing where it can.

### Music

The soundtrack is procedural (`music.js`), so the build stays one offline file. `MusicTracks` describes each track as data: tempo, key/scale, chord progression, drum kit, bass and arp patterns, timbres. The lead melody is generated from the progression with a seeded RNG, so it's the same every time. `Music.update()` (called from the game loop) picks the track from game state in `Music._want()` — title for menus, one per level, `boss:<level>` in the level's key, `results`/`gameover` with a sting — and sets the intensity (0 pads+arp, 1 +drums/bass, 2 +lead, 3 +fills; changes land on bar lines). Pause muffles the music via `Audio.musicFilter`; bombs and deaths call `Audio.duckMusic()`. **Adding a track:** add an entry to `MusicTracks` and return its id from `_want()`; check it with `node tools/sim/audio.js --wav` and listen to the WAV.

### Persistence

`storage.js` wraps both `localStorage` and the Artifact Storage API. High scores, settings, Neon Credits, hangar cosmetics, and campaign progress all persist here.

Saves are versioned: `SaveData.migrate()` (run first in `Game.init()`) upgrades older saves step by step to `SAVE_VERSION`. **If you change what saved data means or how it's stored, bump `SAVE_VERSION` and add a step to `SaveData.steps`** — keep progress, archive rather than delete.

### Prompts

Menu hints go through `UI.keys()` (automatic in `UI.hint`): when `Input.lastDevice` is `'pad'`, ENTER/ESC become [A]/[B]. Wrap any new on-screen key names in `UI.keys()`.

### Boot Sequence (`main.js`)

```javascript
Renderer.init()  // async — sets up PixiJS Application
→ resizeCanvas() // position pixi canvas over play area
→ Game.init()    // loads all persistent state
→ requestAnimationFrame(gameLoop)
```

Each frame: `Game.update(dt)` → `Game.draw()` → `Input.lateUpdate()`.
