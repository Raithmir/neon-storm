# NEON STORM β — Remaining Work

*All completed items removed. This is the single tracker for what's left to do.*

*For a full history of what's been implemented, see the Developer Guide.*

---

## Renderer Visual Upgrades (Phase 2+)

The PixiJS pipeline is in place (Phase 1 complete). These are the visual upgrade phases — see `neon-storm-beta-roadmap.md` for full details.

- [ ] Phase 2: Bloom & Blending — bloom post-processing filter, additive blend particles (raise cap from 400 to 2000+), bullet glow sprites
- [ ] Phase 3: Enhanced Backgrounds — deep star field layer, nebula/atmosphere layer with displacement, near foreground speed layer, horizon parallax refinement
- [ ] Phase 4: Weapons & Combat VFX — weapon shot trails, multi-phase explosions, impact/hit effects, bomb visual upgrade with shockwave distortion
- [ ] Phase 5: Screen-Space Effects — chromatic aberration on damage, CRT distortion on bomb/boss death, Level 6 glitch atmosphere, optional CRT filter toggle
- [ ] Phase 6: Dynamic Lighting — light layer from bullets/explosions/player, performance-budgeted light sprite pool

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

The beta includes everything from the alpha plus the PixiJS rendering pipeline. Alpha features: 6-level campaign with unique bosses, 9 enemy types, 4 weapon types with 3 upgrade levels each, hybrid weapon/drone system, chain combo + graze + surge scoring, 3 difficulty presets + custom difficulty with 15 toggles, shield HP system, asteroid + escort level mechanics, persistent high scores + neon credits + cosmetics shop + achievements (20 challenges), endless survival mode, controls rebinding (keyboard + gamepad), 6 per-theme parallax backgrounds with horizon silhouettes, procedural SFX with pitch randomisation, screen transitions, boss-specific attack patterns + movement + visuals + defeat sequences, and comprehensive developer documentation.

Beta additions: PixiJS v8 dual-canvas rendering pipeline with offscreen Canvas 2D bridge, automatic WebGPU/WebGL/Canvas fallback, self-contained build with bundled PixiJS.

**~8200 lines across 20 source modules with concatenation build system.**

---

*Last updated: Neon Storm β — Phase 1 renderer migration complete*
