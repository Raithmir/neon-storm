# NEON STORM δ — Remaining Work

*All completed items removed. This is the single tracker for what's left to do.*

*For a full history of what's been implemented, see the Developer Guide.*

---

## Picking Up Where We Left Off

**State (Oct 2026):** γ is done and live on `main` (https://raithmir.github.io/neon-storm/): neon graphics, shader backdrops, procedural soundtrack, upgraded SFX, save versioning, gamepad prompts. **Next:** δ, starting with Renderer Phase 7.

**Setting up on a new machine:**
```bash
git clone https://github.com/Raithmir/neon-storm.git && cd neon-storm
node build.js                       # Node 20 (as in CI); downloads vendor/ libs if missing
npx http-server . -p 8080 -c-1      # play the dev build at http://localhost:8080
npm install --no-save playwright && npx playwright install chromium
npm run sim:checks && npm run sim:render && npm run sim:audio    # all should pass
```
Read `CLAUDE.md` first (architecture, rules, where things live); `docs/neon-storm-dev-guide.md` has the detail. Claude Code picks up `CLAUDE.md` and the PixiJS skills in `.claude/skills/` automatically.

**How changes flow:** work on a feature branch → PR into `delta` → PR from `delta` into `main`. CI runs on every PR (build + committed `dist/` must match `src/`, gameplay checks, render smoke test, audio check), so always run `node build.js` and commit `dist/`. Merging to `main` deploys to GitHub Pages. For the next version (ε), create its branch from `main` and bump the name/version everywhere it appears: the build output name (`build.js`, plus `tools/sim/harness.js`, `CLAUDE.md`, `README.md` and `tools/sim/README.md`, which refer to `dist/neon-storm-delta.html`; delete the old `dist/` HTML, since Pages copies `dist/neon-storm-*.html`), `package.json`'s version, the title's δ and label in `menus.js`, the branch list in `.github/workflows/ci.yml`, and this file's title. `grep -rn delta` finds them.

**Before calling δ done:** change the title screen's "DELTA BUILD — WORK IN PROGRESS" label (`Menu.drawTitle` in `menus.js`).

**Decisions to revisit if wanted:**
- The γ save migration resets high scores and level records (old ones are kept in storage as `highscores_v1` / `levelBests_v1`). Showing them as a "β scores" tab instead is a small change.
- Music and SFX levels were matched by measurement, not by ear — tune them after play-testing (`MusicTracks` in `music.js`, volumes in `audio.js`; `node tools/sim/audio.js --wav` renders previews).

**Tools worth knowing:** Settings → SHOW FPS for performance; the PixiJS DevTools browser extension to inspect the scene graph, textures and draw calls (useful for Phase 7); `tools/sim/` for balance and play-through bots (see its README).

---

## Roadmap

### γ Gamma — done

1. ~~**Music and SFX**~~ — done: procedural soundtrack and upgraded SFX (see Audio). Tune by ear after play-testing.
2. ~~**Play-test fixes**~~ — done: γ play-tested and accepted.
3. ~~**Save-data versioning**~~ — done: `SAVE_VERSION` / `SaveData.migrate()` in `storage.js`; the γ step archives and resets score tables and keeps everything else.
4. ~~**Gamepad button prompts**~~ — done: menus show [A]/[B]/D-PAD when a controller was used last.

γ shipped as v0.3.0.

### δ Delta — renderer and content (in progress)

1. **Native Pixi sprites for entities** — Renderer Phase 7 (plan below). First, because it changes how every entity is drawn (new art only gets built once, the new way) and frees the frame time 3D needs.
2. **three.js 3D backdrops** — Renderer Phase 8 (plan below). Spike the context sharing, prototype the sky city, then decide how far to take it.
3. **More levels and modes** — Boss Rush / Boss Practice first (every boss exists already), then new levels designed around what the 3D backdrops can do; adaptive rank and ship selection are candidates too.

If δ grows too large, ship Pixi sprites + Boss Rush as δ and move three.js and new levels to ε Epsilon.

### Later / undecided

- **Mobile / touch** — needs a portrait layout (the HUD side panels don't fit a phone); only if mobile players are wanted.
- Platform items (co-op, online leaderboards, replays, modding) — see Platform & Infrastructure.

Hosting: repo Settings → Pages → Source is set to **GitHub Actions**, so pushes to `main` publish to https://raithmir.github.io/neon-storm/.

---

## Gamma Graphics Overhaul (done)

- [x] Neon vector art for every entity (player, 9 enemies, 6 distinct mid-bosses, 6 bosses, power-ups, asteroids, escort) with a sprite atlas; old flat-fill art removed
- [x] GPU shader backgrounds for all six levels, reacting to bombs, bosses, Surge and bullet density
- [x] Shaped bullets (readable enemy orbs with shadows, needles, streaks, missiles, continuous laser), impact sparks, muzzle flashes
- [x] Explosions with flash, neon rings, sparks and embers; ships shatter into their outline pieces
- [x] UI kit and restyled title, menus, briefing (live backdrop + boss preview), results, hangar (live previews) and HUD
- [x] Cosmetics with distinct looks (bullet shapes, trail styles, explosion styles)
- [x] High-DPI rendering with GRAPHICS QUALITY (auto/high/medium/low); FLASH REDUCTION covers every effect
- [x] pixi-filters v6 bundled: bomb shockwave, boss god-rays and phase glitch now work
- [x] SHOW FPS counter; CI (build + dist check, gameplay checks, render smoke test); GitHub Pages hosting from main
- [x] Void Trail uses its glowing purple for the Hangar swatch and engine flames (was a near-black catalogue colour)

---

## Renderer Visual Upgrades (Phase 2+)

The PixiJS pipeline is in place (Phase 1 complete). Phases 2–6 below are done.

- [x] Phase 2: Bloom & Blending — AdvancedBloomFilter with per-level intensity tuning, additive glow layer with 200-sprite GPU pool, bullet/particle/explosion glow halos, particle cap raised to 1500
- [x] Phase 3: Enhanced Backgrounds — deep star field with alpha twinkle (100 stars), nebula/atmosphere layer with per-theme colours and drift, near foreground speed streaks (25 particles), horizon silhouette gradient fade and horizontal drift on city themes
- [x] Phase 4: Weapons & Combat VFX — enemy hit spark bursts with GPU glow flash, enhanced death explosions with white-hot flash particles and glow burst, bomb visual upgrade with centre glow + white-hot core + secondary ring, shield hit ripple shockwave with glow
- [x] Phase 5: Screen-Space Effects — chromatic aberration on damage/death/bomb (intensity scales with severity), screen flash on death/boss defeat/bomb, Level 6 persistent chromatic aberration, CRT scanline filter (toggleable via Renderer.setCRT)
- [x] Phase 6: Dynamic Lighting — power-up pulsing glow halos, boss core glow (brightens on hit flash), enemy death glow bursts, shield hit glow pulse (all via existing additive glow layer)
- [ ] Phase 7: Native Pixi sprites for entities — see below
- [ ] Phase 8: 3D backdrops with three.js — see below

### Phase 7: Native Pixi sprites for entities

**Why:** every frame uploads two full canvases to the GPU — the offscreen play canvas (720×960 logical, 1440×1920 at HIGH) and the full-size glow canvas that `Renderer.addGlow()` fills for bloom. Entities (enemies, mid-bosses, bosses, player, power-ups, asteroids, escort) stamp `Neon.sprite()` atlas images onto the play canvas and draw their live parts (mostly `Neon.light`, plus `shape`/`detail`/`squash`, rotors and flames) around them. Moving all of it to Pixi objects removes both uploads, unlocks per-object filters and frees frame time for Phase 8.

**Constraints:** keep the Canvas 2D path as the no-WebGL fallback (each module gets a `Renderer.usePixi` branch, as `Particles.draw` already has, rather than a rewrite); keep `sim:render` green after every step; keep Flash Reduction and the Hangar previews working.

- [ ] **0. Baseline.** Add a render-time mode to `tools/sim/perf.js` (it times logic only today) and take SHOW FPS readings at HIGH and at 4K in late Endless. Judge every later step against these numbers.
- [ ] **1. Atlas pages as Pixi textures.** Each `Neon` atlas page gets a `CanvasSource`; each sprite key becomes a `Texture` frame on it. Pages upload only when something new is baked. `Neon.flush()` must destroy those textures and invalidate sprites still using them.
- [ ] **2. Entity layer.** A Container between the backdrop and `gameSprite`, with one child container per module in today's draw order (asteroids, escort, power-ups, enemies, player, boss). During the migration, bodies are on the GPU and not-yet-migrated live parts draw on the canvas above them, so lights are never hidden under hulls.
- [ ] **3. Migrate one module at a time** — enemies, mid-bosses, bosses, player, power-ups, asteroids, escort. Each entity owns a pooled `PIXI.Sprite` (or small Container) synced each frame: position, rotation, squash scale, alpha. Hit flash stays a texture swap (the flash state is already in the sprite key). `Neon.light` stamps become child sprites; procedural parts (rotors, flames) become `Graphics` or move last. Add a `sim:render` check that fails if a migrated module draws to the canvas.
- [ ] **4. Glow on the GPU.** `addGlow()` becomes additive glow-texture particles in their own ParticleContainer with the blur filter on it; the glow canvas goes away in Pixi mode.
- [ ] **5. Leftovers.** Score popups (BitmapText), shockwave rings, shield and hitbox, anything `Background.draw` still paints.
- [ ] **6. Stop the upload.** Once nothing draws to the offscreen canvas during play, skip `_canvasSource.update()` (keep a dirty flag for menus and the briefing). Re-measure against step 0.
- [ ] **7. Per-object effects** the migration unlocks: heat haze behind bosses, shield outlines, phase-shifter warp.

### Phase 8: 3D backdrops with three.js

**Why:** real geometry (fly-through cities, tunnels, wireframe terrain, glTF set pieces) instead of 2D fragment shaders. Starts after Phase 7 step 6, when the frame-time headroom is known.

- [ ] **1. Spike the context sharing (throwaway branch, no build changes).** Load three.js from a local file in the dev build only, share Pixi's WebGL context (Pixi is already forced to WebGL, `renderer.js` `preference: 'webgl'`; follow PixiJS's "Mixing PixiJS and Three.js" guide with `resetState()` on both sides), and draw one rotating wireframe city block. Answer three questions: (a) can a three render target become `_bgMesh`'s texture — Pixi v8 has no public API for adopting an external GL texture, so this means touching renderer internals — or does three have to draw first to the screen with Pixi drawing over it without clearing (robust, but bloom/shockwave filters then miss the 3D layer)? (b) what does it cost per frame on top of the Phase 7 numbers? (c) how big is a tree-shaken three build for what we'd use? Go/no-go decision on the answers.
- [ ] **2. Build integration (only on go).** three.js ships ES modules only; bundle a small entry (`window.THREE = { …the parts used }`) into an IIFE with esbuild as a dev dependency, inlined by `build.js` like Pixi. Target ≤ 400 KB added to the single-file build.
- [ ] **3. Sky city prototype** behind a setting: feed the existing uniforms (`bgPulse`, bullet-density dimming, Flash Reduction); fall back to the shader backdrop on LOW quality, if three fails, and in `sim:render` (plus one `sim:render` case with 3D on).
- [ ] **4. Decide scope** — more 3D levels in δ, or move the rest to ε (see Roadmap).
---

## Gameplay Review Follow-ups

The gameplay/balance review and its three fix passes are complete (see `neon-storm-gameplay-review.md` §11–13; 31 regression checks in `tools/sim/checks.js`). What's left needs people or a real browser:

- [x] Human play-testing of the tuned balance — feel, bullet readability over the new shader backgrounds (especially levels 2 and 6), boss/mid-boss timer lengths
- [x] Confirm Hardcore's difficulty curve (simulated runs now end in the first half of the campaign)
- [x] Measure the bomb / death-bomb economy with real players (the simulation bot almost never bombs)
- [ ] Profile rendering performance in a real browser, especially late Endless and HIGH quality at 4K (Settings → SHOW FPS) — now step 0 of Phase 7
- [x] Save-data versioning: old saves get their high scores and per-level records archived (`highscores_v1`, `levelBests_v1`) and reset, since both changed meaning; everything else is kept (check `saveMigrationKeepsProgress`)

---

## Polish & Refinements

Small-to-medium effort items that would improve existing features.

### Gameplay Polish
- [ ] Shield Wall visual linking — connected barrier segments should visually link with energy beams between them
- [ ] Escort AI — allied ship should attempt basic dodging of incoming bullets
- [ ] Asteroid vs enemy bullet collision — enemy bullets should destroy/damage asteroids too

### UI / UX Polish
- [x] Gamepad button prompts — menu hints switch to [A]/[B]/D-PAD when a controller was used last (`Input.lastDevice`, `UI.keys()`)

### Hangar Bonus Content
These are listed as purchasable items in the Hangar shop but have no implementation behind them:
- [ ] Boss Practice Mode — fight any previously defeated boss with selectable loadout
- [ ] Enemy Gallery / Bestiary — view all encountered enemies with stats, lore, and kill counts
- [ ] Music Player — listen to the soundtrack from the menu. Now feasible: `Music.play(id)` plays any track in `MusicTracks`, and the intensity can be stepped 0–3 to hear the layers
- [ ] Ship Color Designer — custom color picker for ship palette

---

## New Gameplay Features

Medium-to-large effort features that add new mechanics or depth.

### Weapons
- [ ] Weapon Combination System — collecting two different max-level weapons fuses them into a hybrid (e.g. Scatter Seekers, Prism Beam, Tracking Beam)
- [ ] Secondary Fire Mode — each weapon has an alternate fire on a separate button (charge shots, lock-on bursts, concentrated blasts)

### Enemies
- [ ] Endless mode mid-bosses (the mid-boss system in `midbosses.js` can be reused)
- [ ] Additional enemy types — Mimic (disguised as power-up, attacks on approach), Reflector (barrier that bounces player bullets back), Gravity Well (pulls player and bullets toward it), Twin Core (linked pair that shares damage)

### Systems
- [ ] Adaptive Rank System — hidden dynamic difficulty that scales with player performance; playing well increases bullet density and enemy aggression, dying/bombing decreases it
- [ ] Ship Selection — multiple playable ships with different stats, hitbox sizes, and unique abilities (e.g. Phantom: fast/tiny/weak, Titan: slow/large/powerful, Arc: chain lightning weapon)

---

## New Game Modes

Features that add entirely new ways to play.

- [ ] Boss Rush Mode — consecutive boss fights with brief intermissions and power-up selection between rounds
- [ ] Time Attack Mode — fixed 3-minute stage with dense spawns, infinite lives, score-only leaderboard
- [ ] Daily Challenge Mode — daily seeded run with specific modifiers (requires online infrastructure for shared leaderboard)

---

## Audio

- [x] Procedural synthwave soundtrack (`music.js`): menu theme, a track per level, boss track in each level's key, Endless, victory and game-over stings; intensity layers follow play (mid-boss, boss phases, Surge); pause muffles, bombs/deaths duck; `npm run sim:audio` in CI
- [ ] Tune the music by ear after play-testing (levels, tempos, which layers play when)
- [x] SFX upgrade — layered explosions with glass pings for the shattering ships, heavier bomb, softer base shot, distinct graze, laser hum, missile whoosh, boss WARNING siren, mid-boss alert, boss phase glitch, extra-life fanfare, per-sound throttling for mass kills; loudness matched to the old set

---

## Platform & Infrastructure

Large effort features for expanding the game's reach or technical foundation.

- [ ] Local Co-op — 2-player on same screen with separate input bindings, shared/separate lives, scaled enemy HP
- [ ] Online Leaderboards — global high score boards (requires backend service + anti-cheat)
- [ ] Ghost Replay System — record player inputs per frame, replay as translucent ghost ship for learning optimal routes
- [ ] Mobile / Touch Controls — relative touch drag for movement, auto-fire, large tap buttons for abilities
- [ ] Modding Support — expose wave data format as documented JSON schema, level editor or JSON upload, community levels with separate leaderboard

---

## Quick Reference: What's Done

The beta includes everything from the alpha plus the PixiJS rendering pipeline and the gameplay review work. Alpha features: 6-level campaign with unique bosses, 9 enemy types, 3 primary weapons with 5 upgrade levels plus a drone slot, hybrid weapon/drone system, chain combo + graze + surge scoring, 3 difficulty presets + custom difficulty with 15 toggles, shield HP system, asteroid + escort level mechanics, persistent high scores + neon credits + cosmetics shop + achievements (20 challenges), endless survival mode, controls rebinding (keyboard + gamepad), 6 per-theme parallax backgrounds with horizon silhouettes, procedural SFX with pitch randomisation, screen transitions, boss-specific attack patterns + movement + visuals + defeat sequences, and comprehensive developer documentation.

Beta additions: PixiJS v8 dual-canvas rendering pipeline with offscreen Canvas 2D bridge, automatic WebGPU/WebGL/Canvas fallback, self-contained build with bundled PixiJS, renderer phases 2–6 (bloom, backgrounds, combat VFX, screen-space effects, dynamic lighting).

Gameplay review additions:
- **Bug fixes:** a game-time scheduler (pause-safe), level-flow fixes, and density-correct boss patterns.
- **Balance:** a rebalanced weapon curve with piercing laser, working drones and Neon Surge, plus boss phase timeouts, positional armor and telegraphs.
- **Progression:** persistent lives and weapons with score extends, and a death-bomb window.
- **Mid-bosses and stage length:** six mid-bosses and ~4-minute stages.
- **Endless caps:** HP, density, fire rate and concurrent enemies.
- **Simulation tooling:** `tools/sim` (regression checks, balance tools, human-like campaign bot).

**~10,500 lines across 21 source modules with concatenation build system.**

---

Gamma additions: neon vector art for every entity with a sprite atlas, GPU shader backgrounds for all six levels, shaped bullets and shattering explosions, a neon UI kit (title, menus, briefing, results, hangar previews, HUD), distinct cosmetic styles, high-DPI rendering with a GRAPHICS QUALITY setting, and FLASH REDUCTION covering every flash and pulse.

*Last updated: Neon Storm γ — graphics overhaul*
