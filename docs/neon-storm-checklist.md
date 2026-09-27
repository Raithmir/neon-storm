# NEON STORM β — Remaining Work

*All completed items removed. This is the single tracker for what's left to do.*

*For a full history of what's been implemented, see the Developer Guide.*

---

## Renderer Visual Upgrades (Phase 2+)

The PixiJS pipeline is in place (Phase 1 complete). Phases 2–6 below are done.

- [x] Phase 2: Bloom & Blending — AdvancedBloomFilter with per-level intensity tuning, additive glow layer with 200-sprite GPU pool, bullet/particle/explosion glow halos, particle cap raised to 1500
- [x] Phase 3: Enhanced Backgrounds — deep star field with alpha twinkle (100 stars), nebula/atmosphere layer with per-theme colours and drift, near foreground speed streaks (25 particles), horizon silhouette gradient fade and horizontal drift on city themes
- [x] Phase 4: Weapons & Combat VFX — enemy hit spark bursts with GPU glow flash, enhanced death explosions with white-hot flash particles and glow burst, bomb visual upgrade with centre glow + white-hot core + secondary ring, shield hit ripple shockwave with glow
- [x] Phase 5: Screen-Space Effects — chromatic aberration on damage/death/bomb (intensity scales with severity), screen flash on death/boss defeat/bomb, Level 6 persistent chromatic aberration, CRT scanline filter (toggleable via Renderer.setCRT)
- [x] Phase 6: Dynamic Lighting — power-up pulsing glow halos, boss core glow (brightens on hit flash), enemy death glow bursts, shield hit glow pulse (all via existing additive glow layer)

---

## Gameplay Review Follow-ups

The gameplay/balance review and its three fix passes are complete (see `neon-storm-gameplay-review.md` §11–13; 30 regression checks in `tools/sim/checks.js`). What's left needs people or a real browser:

- [ ] Human play-testing of the tuned balance — feel, bullet readability with bloom, boss/mid-boss timer lengths
- [ ] Confirm Hardcore's difficulty curve (simulated runs now end in the first half of the campaign)
- [ ] Measure the bomb / death-bomb economy with real players (the simulation bot almost never bombs)
- [ ] Profile rendering performance in a real browser, especially late Endless
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

- [ ] Music tracks — original or royalty-free synthwave music for: menu theme, per-level gameplay (6 tracks), boss theme, victory sting, game over sting. Music system hooks already exist (playMusic/stopMusic/crossfadeMusic)

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

*Last updated: Neon Storm β — gameplay review, mid-bosses and simulation tooling*
