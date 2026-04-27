# NEON STORM α — Future Features & Polish Roadmap

*Updated to reflect current alpha state. Items marked ✅ are implemented. Items marked 🔧 are partially implemented.*

---

## 1. Polish & Bug Fixes (Priority: Immediate)

These should be addressed before any new features:

- [ ] Boss-specific attack patterns (currently all bosses share the same patterns)
- [ ] Apply equipped cosmetics to gameplay rendering (skins, trails, bullets, explosions)
- [ ] Unique visual identity for each boss in draw code
- [ ] Level 6 glitched enemy variants (visual + behavioral)
- [ ] Shield Wall enemies linking visually
- [ ] Sniper targeting laser aiming at player
- [ ] Settings actually affecting gameplay (colorblind mode, flash reduction, particle density)
- [ ] Level select screen for replaying completed levels
- [ ] Screen transition effects (fades between states)
- [ ] Chain milestone visual popups (currently SFX only)
- [ ] More dramatic boss defeat sequences
- [ ] Campaign completion celebration screen
- [ ] Parallax scrolling in backgrounds
- [ ] Key/gamepad rebinding UI

---

## 2. Gameplay Mechanics (Priority: High)

### 2.1 Adaptive Rank System (DoDonPachi-inspired)
- Hidden dynamic difficulty scaling with player performance
- Playing well increases rank — faster bullets, denser patterns, more enemies
- Dying/bombing decreases rank
- Rank affects score potential
- Display rank in post-run stats

### 2.2 Weapon Combination System
- Max level weapons of two types fuse into hybrid weapons
- Scatter Seekers (Spread + Homing), Prism Beam (Laser + Spread), Tracking Beam (Homing + Laser)

### 2.3 Secondary Fire Mode
- Each weapon has an alternate fire (charge shots, lock-on bursts, concentrated blasts)

### 2.4 Power-Up Choice System (Gradius-inspired)
- Collect generic energy, choose upgrade from selection bar

---

## 3. Content (Priority: High)

### 3.1 Additional Levels
- ✅ 6 levels implemented (5 + secret)
- Potential: underwater, volcanic, arctic, cyberspace themes
- Each new level should introduce a twist or new enemy type

### 3.2 Additional Enemy Types
- ✅ 9 types implemented
- Remaining concepts: Mimic, Reflector, Gravity Well, Twin Core

### 3.3 Boss Improvements
- ✅ 6 boss types defined with varying phase counts
- Each boss needs unique attack patterns and visual designs
- Consider mini-bosses mid-level

---

## 4. Player Progression (Priority: Medium)

### 4.1 Ship Selection
- ✅ Cosmetic skins in Hangar
- Add gameplay ships: Phantom (fast/small), Titan (slow/powerful), Arc (chain lightning)

### 4.2 Achievement System
- Challenges awarding NC and exclusive cosmetics

### 4.3 Boss Practice & Enemy Gallery
- 🔧 Listed in Hangar but not implemented

---

## 5. Game Modes (Priority: Medium)

- Endless / Survival Mode
- Boss Rush Mode
- Time Attack Mode
- Daily Challenge Mode (requires backend)

---

## 6. Audio (Priority: Medium)

- ✅ Music hooks exist, need actual tracks
- Enhanced SFX with more variety

---

## 7. Lower Priority

- Local co-op, online leaderboards, mobile/touch, WebGL migration, modding support

---

## Priority Matrix

| Feature | Impact | Effort | Priority |
|---------|--------|--------|----------|
| Boss-specific patterns | High | Medium | P0 |
| Apply cosmetics to rendering | Medium | Low | P0 |
| Settings working | Medium | Low | P0 |
| Adaptive rank system | High | Medium | P1 |
| Ship selection (gameplay) | High | Medium | P1 |
| Achievement system | Medium | Low | P1 |
| Soundtrack | High | External | P1 |
| Boss Rush / Endless mode | Medium | Medium | P2 |
| Additional enemies | Medium | Medium | P2 |
| Weapon combinations | Medium | High | P3 |
| Mobile / Co-op | Medium | High | P3 |
| Online features | Medium | High | P4 |

---

*Update as features are implemented.*
