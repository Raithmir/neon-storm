# NEON STORM γ — Remaining Work

*All completed items removed. This is the single tracker for what's left to do.*

*For a full history of what's been implemented, see the Developer Guide.*

---

## Roadmap

### γ Gamma — finish (in progress)

1. **Music and SFX** — procedural synthwave with Web Audio (keeps the single offline HTML, no licensing): a menu theme, per-level variations, a boss track, victory/game-over stings, reacting to play (boss intensity, Surge filter sweep). Then upgrade the ~17 procedural SFX to match the new visuals (weightier explosions, graze, boss warning siren, shatter/impact sounds). See Audio.
2. **Play-test fixes** — the gameplay review follow-ups below, plus anything found in γ's visuals. Use Settings → SHOW FPS for performance reports.
3. **Save-data versioning** — must land before δ, whose new levels, modes and balance changes will change saved data; a version lets old saves migrate or reset cleanly.
4. **Gamepad button prompts** (optional, can slip to δ) — small with the UI kit; see UI / UX Polish.

### δ Delta — renderer and content (next)

1. **Native Pixi sprites for entities** — Renderer Phase 7. First, because it changes how every entity is drawn (new art only gets built once, the new way) and frees the frame time 3D needs.
2. **three.js 3D backdrops** — Renderer Phase 8. Prototype the sky city, then decide how far to take it.
3. **More levels and modes** — Boss Rush / Boss Practice first (every boss exists already), then new levels designed around what the 3D backdrops can do; adaptive rank and ship selection are candidates too.

If δ grows too large, ship Pixi sprites + Boss Rush as δ and move three.js and new levels to ε Epsilon.

### Later / undecided

- **Mobile / touch** — needs a portrait layout (the HUD side panels don't fit a phone); only if mobile players are wanted.
- Platform items (co-op, online leaderboards, replays, modding) — see Platform & Infrastructure.

**One-time setup:** repo Settings → Pages → Source: **GitHub Actions**, so pushes to main publish to https://raithmir.github.io/neon-storm/.

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
- [ ] Hangar swatch for Void Trail still shows its dark catalogue colour rather than the glowing purple trail

---

## Renderer Visual Upgrades (Phase 2+)

The PixiJS pipeline is in place (Phase 1 complete). Phases 2–6 below are done.

- [x] Phase 2: Bloom & Blending — AdvancedBloomFilter with per-level intensity tuning, additive glow layer with 200-sprite GPU pool, bullet/particle/explosion glow halos, particle cap raised to 1500
- [x] Phase 3: Enhanced Backgrounds — deep star field with alpha twinkle (100 stars), nebula/atmosphere layer with per-theme colours and drift, near foreground speed streaks (25 particles), horizon silhouette gradient fade and horizontal drift on city themes
- [x] Phase 4: Weapons & Combat VFX — enemy hit spark bursts with GPU glow flash, enhanced death explosions with white-hot flash particles and glow burst, bomb visual upgrade with centre glow + white-hot core + secondary ring, shield hit ripple shockwave with glow
- [x] Phase 5: Screen-Space Effects — chromatic aberration on damage/death/bomb (intensity scales with severity), screen flash on death/boss defeat/bomb, Level 6 persistent chromatic aberration, CRT scanline filter (toggleable via Renderer.setCRT)
- [x] Phase 6: Dynamic Lighting — power-up pulsing glow halos, boss core glow (brightens on hit flash), enemy death glow bursts, shield hit glow pulse (all via existing additive glow layer)
- [ ] Phase 7: Native Pixi sprites for entities — enemies, mid-bosses, bosses, player, power-ups, asteroids and the escort are still drawn on the offscreen Canvas 2D, which is re-uploaded to the GPU every frame (1440×1920 at high quality), probably the biggest per-frame cost. Turn the `Neon.sprite()` atlas pages into Pixi textures and give each entity a `PIXI.Sprite` (position/rotation/tint/alpha set per frame), keeping only the animated parts (lights, rotors, flames) live or moving them to sprites too. Migrate one module at a time (enemies first); once nothing draws to the offscreen canvas during play, skip its upload. Unlocks per-object filters (heat haze behind bosses, shield outlines, phase-shifter warp) and frees frame time for Phase 8. Keep the Canvas 2D path as the no-WebGL fallback and keep `sim:render` green. Do this before Phase 8.
- [ ] Phase 8 (idea): 3D backdrops with three.js — real geometry (fly-through cities, tunnels, wireframe terrain, glTF set pieces) instead of 2D fragment shaders. Recommended route: three.js and PixiJS share one WebGL context (PixiJS's "Mixing PixiJS and Three.js" guide); three renders the level into a render target that replaces `Renderer._bgMesh`'s texture, so bloom/shockwave filters, `bgPulse`, bullet-density dimming and Flash Reduction keep working unchanged. Separate layered canvases are fine for a quick prototype but cost a second WebGL context, and Pixi filters can't touch the 3D layer. Watch: three.js ships ES modules only (needs an esbuild step or a shim in `build.js`, which concatenates globals); adds ~600 KB to the single-file build; low-quality mode should drop back to the shader backdrop; keep the shader backdrop as the fallback and cover it in `sim:render`. Prototype one level first (sky city is the best candidate).

---

## Gameplay Review Follow-ups

The gameplay/balance review and its three fix passes are complete (see `neon-storm-gameplay-review.md` §11–13; 30 regression checks in `tools/sim/checks.js`). What's left needs people or a real browser:

- [ ] Human play-testing of the tuned balance — feel, bullet readability over the new shader backgrounds (especially levels 2 and 6), boss/mid-boss timer lengths
- [ ] Confirm Hardcore's difficulty curve (simulated runs now end in the first half of the campaign)
- [ ] Measure the bomb / death-bomb economy with real players (the simulation bot almost never bombs)
- [ ] Profile rendering performance in a real browser, especially late Endless and HIGH quality at 4K (Settings → SHOW FPS)
- [ ] Save-data versioning: per-level records now store level score (previously run score) and high scores were set under the old balance — reset or migrate old saves

---

## Polish & Refinements

Small-to-medium effort items that would improve existing features.

### Gameplay Polish
- [ ] Shield Wall visual linking — connected barrier segments should visually link with energy beams between them
- [ ] Escort AI — allied ship should attempt basic dodging of incoming bullets
- [ ] Asteroid vs enemy bullet collision — enemy bullets should destroy/damage asteroids too

### UI / UX Polish
- [ ] Gamepad button prompts — when a controller is detected, show gamepad button labels in menus and HUD instead of keyboard keys

### Hangar Bonus Content
These are listed as purchasable items in the Hangar shop but have no implementation behind them:
- [ ] Boss Practice Mode — fight any previously defeated boss with selectable loadout
- [ ] Enemy Gallery / Bestiary — view all encountered enemies with stats, lore, and kill counts
- [ ] Music Player — listen to soundtrack from the menu (requires music tracks)
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

- [x] Procedural synthwave soundtrack (`music.js`): menu theme, a track per level, boss track in each level's key, Endless, victory and game-over stings; intensity layers follow play (mid-boss, boss phases, Surge); pause muffles, bombs/deaths duck; `npm run sim:music` in CI
- [ ] Tune the music by ear after play-testing (levels, tempos, which layers play when)
- [ ] SFX upgrade to match the γ visuals — weightier layered explosions, distinct graze sound, boss WARNING siren, shatter/impact sounds, UI sounds for the new menus

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
