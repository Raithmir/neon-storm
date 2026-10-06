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
2. ~~**three.js 3D backdrops**~~ — Renderer Phase 8: done, a 3D scene for every level (play-test pending, see below).
3. **More levels and modes** — ~~Boss Rush~~ done (play-test pending); ~~Boss Practice~~ done, then new levels designed around what the 3D backdrops can do; adaptive rank and ship selection are candidates too.

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
- [x] Phase 8: 3D backdrops with three.js — see below

### Phase 7: Native Pixi sprites for entities

**Why:** every frame uploads two full canvases to the GPU — the offscreen play canvas (720×960 logical, 1440×1920 at HIGH) and the full-size glow canvas that `Renderer.addGlow()` fills for bloom. Entities (enemies, mid-bosses, bosses, player, power-ups, asteroids, escort) stamp `Neon.sprite()` atlas images onto the play canvas and draw their live parts (mostly `Neon.light`, plus `shape`/`detail`/`squash`, rotors and flames) around them. Moving all of it to Pixi objects removes both uploads, unlocks per-object filters and frees frame time for Phase 8.

**Constraints:** keep the Canvas 2D path as the no-WebGL fallback (each module gets a `Renderer.usePixi` branch, as `Particles.draw` already has, rather than a rewrite); keep `sim:render` green after every step; keep Flash Reduction and the Hangar previews working.

- [x] **0. Baseline.** `tools/sim/perf.js --render` measures texture bytes uploaded per frame and the CPU time of the gameplay/HUD draw calls (headless GPU timing is meaningless, so it isn't measured). Real browser after the migration (Oct 2026): 1440p, HIGH — locked 60 fps, worst frame 16.9 ms. Not yet checked at 4K; no "before" reading was taken (`8412a69` is the last commit before the migration, if one is wanted).
- [x] **1–6. Entities, particles, popups and glow on the GPU** — done differently from the plan: instead of hand-written Pixi objects per entity, `GpuCtx` (`src/gpu-ctx.js`) implements the Canvas 2D subset the draw code uses and emits pooled Pixi sprites/graphics in call order, so all the art stays single-source and the no-WebGL path is unchanged. Atlas pages and baked text are Pixi textures (re-uploaded only when something new is baked); paths become `Graphics`; `clip()` becomes a mask. Glow halos are particles rendered into `_glowRT`. With a shader backdrop the play canvas is neither cleared nor uploaded. Result (`perf.js --render`, late Endless): **13.2 MB uploaded per frame at HIGH → 0** (5.3 MB → 0 at LOW); CPU draw time unchanged at ~1–2 ms.
- [x] **HUD cost** (found while measuring): `HUD.draw` took ~6.7 ms of CPU per frame at HIGH, ~4.5 ms of it blitting the static panel background onto the 3840×2160 overlay. The background now lives on its own canvas under the overlay (`HUD._bg`), drawn once per resolution and shown only while the HUD is up: **6.7 → 2.3 ms**.
- [x] **7. Per-object effects:** heat haze behind bosses (`uHaze` + `haze()` in every backdrop shader, no extra pass); shield outlines (`Neon.filtered(ctx, Renderer.shieldGlow(hit), fn)` draws through a GlowFilter via `GpuCtx.beginLayer`; player shield HP and shielded cruisers); teleport warp (one custom filter, up to 4 pinch/bulge-and-twist points, on `Renderer.worldLayer` — backdrop + entities only, so bullets are never displaced). Flash Reduction softens the haze and warp and keeps shield hits blue. Tune strengths by eye in play.
- [x] **Fix: hitches when new sprites were baked mid-fight** (play-test): every bake re-uploaded its whole 2048² atlas page, once per bake, so a boss phase change pushed 64–84 MB to the GPU in one frame. Now a dirty page uploads once per frame at `GpuCtx.end()`, pages are 1024² (4 MB), and `Boss._prebake()` bakes every phase colour and hit-flash variant while the WARNING banner is up. Phase changes now upload ≤ 8 MB, and later phases 0.4 MB. Boss hit glow and heat haze toned down after the same play-test.

### Phase 8: 3D backdrops with three.js

**Why:** real geometry (fly-through cities, tunnels, wireframe terrain, glTF set pieces) instead of 2D fragment shaders. Starts after Phase 7 step 6, when the frame-time headroom is known.

- [x] **1. Spike** (`spike/three-backdrop`, deleted): three.js shares Pixi's WebGL context; its render target becomes a Pixi texture by swapping the WebGLTexture inside a `TextureSource` (Pixi internals — Pixi now pinned to 8.18.1). Needs three's colour management off, Pixi's unpack state reset, and a y-flip. Size: ~520 KB for the classes used (whole three.js 725 KB). Play-test: locked 60 fps at 1440p HIGH, switching seamlessly. **Go.**
- [x] **2. Build integration:** `vendor/three.min.js` is a committed esbuild bundle of the classes in `tools/three/entry.js` (`npm run three:bundle`), inlined by `build.js` like Pixi — no new tools for a normal build or CI. The single-file build grew from 1.58 MB to ~2.2 MB.
- [x] **3. All six levels have a 3D scene** (`src/backdrop3d.js`): synthwave grid city with a striped sun, foundry canyon with a molten channel, asteroid belt with a ringed gas giant, night flight over moonlit clouds, circuit-board city toward the Core, collapsing tunnel into a singularity. A composite shader applies the shared backdrop uniforms (haze, dimming, pulse, Flash Reduction, Level 6's band glitches). Fallbacks to the shader backdrops: Settings → 3D BACKDROPS off, LOW quality (including auto stepping down), no WebGL2, any error or context loss. `sim:render` runs every level in 3D, one with 3D off, and fails if a scene breaks.
- [ ] **4. Play-test the six scenes** in a real browser: looks, readability of bullets over each, and SHOW FPS at HIGH (and on a slower machine if possible). Tune by eye in `BACKDROP_SCENES_3D`.
- [ ] Ideas: Endless could cycle through the scenes as waves pass; bosses could get a set-piece (e.g. the Leviathan surfacing behind the planet); glTF models for hero objects.
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
- [x] Boss Practice Mode — title → BOSS MODES → BOSS PRACTICE: any boss beaten in the campaign or Boss Rush (`Campaign.bossesDefeated`, derived for older saves), from a chosen phase, with a chosen difficulty, weapon, weapon level and drones; best time per boss and difficulty (`Campaign.practiceBests`); no credits or high scores (checks `bossPracticeFromChosenPhase`, `bossesDefeatedFromOldSave`). It is a mode rather than a Hangar purchase: the Hangar has no bonus-content category
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

- [x] Boss Rush Mode — every campaign boss back to back in its own level (the Echo once the secret level is unlocked), unlocked by clearing Level 5. Weapon pick before boss 1, one upgrade of three between bosses, score + time bonus, split times, BOSS RUSH high-score tab (`BossRush` in `level-systems.js`; check `bossRushRunsEveryBoss`)
- [ ] Play-test Boss Rush: difficulty with the starting loadout, the upgrade choices, par time (`BossRush.PAR_PER_BOSS`)
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
