# NEON STORM α — Gameplay & Balance Review

*Scope: gameplay, balance and game-feel of the existing features. Graphics are out of scope (intentionally placeholder). Where a suggestion refers to another game, it is to point at a proven solution in the genre, not to add a new feature.*

Reference points used: **DoDonPachi / Cave shooters** (chain gauge, shot/laser split, auto-bomb), **Touhou** (graze, focus shot, invulnerability rules, death-bomb window), **Raiden** (colour-cycling power-ups, dropping power on death), **Ikaruga / Crimzon Clover** (chain and meter-driven "break" states), **Gradius** (power-up economy).

---

## 1. Summary — top 10 in priority order

| # | Issue | Type | Impact |
|---|-------|------|--------|
| 1 | Neon Surge's main effects (2× fire rate, shots cancel bullets) are **not implemented**. It only gives 3× score | Missing mechanic | High |
| 2 | Bosses die in **3–12 s** with a levelled weapon. Boss HP does not scale with level or difficulty | Balance | High |
| 3 | Weapon balance: **Laser is strictly best** from Lv3. **Homing Lv1 does less damage than having no weapon**. Drones Lv1–2 do nothing | Balance | High |
| 4 | Level scaling stacks **three multipliers** (density × HP^1.3 × speed/fire-rate). Bullet density scaling also **breaks boss patterns** (overlapping rings, bullets off-screen, gaps) | Balance / bug | High |
| 5 | Random power-up types force weapon swaps (Lv5 → Lv1). The player has to *dodge* power-ups | Design | High |
| 6 | Wave spawns use `setTimeout` (wall-clock time), so pausing drops enemies. A pause at the wrong moment **soft-locks victory** | Bug | High |
| 7 | Dashing **cancels bomb/respawn invulnerability** | Bug | Medium-High |
| 8 | Score contamination: level select/custom start carries the previous run's score and weapons. End-level bonuses re-count cumulative graze/chain every level | Bug | Medium |
| 9 | Surge activation (Fire + Focus) collides with normal focused shooting in manual mode. In auto-fire, focusing **stops shooting** | Controls | Medium |
| 10 | Boss can arrive on top of the final (pre-boss) wave | Bug | Medium |

Detail for each follows, grouped by system.

---

## 2. Player weapons

### 2.1 DPS table (single target, all projectiles hitting)

Computed from `player.js:133` (fire rates) and `player.js:283-343` (damage per volley):

| Weapon | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---|---|---|---|---|
| None (base shot) | 8.3 | – | – | – | – |
| Spread | 23.1 | 30.8 | 46.2 | 49.2 | 56.9 |
| **Homing** | **6.5** | 8.0 | 9.5 | 11.0 | 12.5 |
| **Laser** | 20.0 | 30.0 | **68.0** | **94.5** | **110.0** |

Findings:

- **Homing is a trap pick.** Homing slows the fire rate to 0.2 s, and that slower rate also applies to the base shot. So Lv1 homing (6.5 DPS) is *worse than no weapon* (8.3). Lv5 homing is about 1/9 of Lv5 laser. The comment at `player.js:308` calls it a "convenience weapon, not a damage dealer", but at 0.3 damage it can't even one-shot a Level 1 scout. In Raiden, homing trades roughly 30–40% damage for tracking, not 90%.
  - *Suggestion:* keep the base shot at its own 0.12 s timer, independent of the primary weapon. Raise missile damage to ~0.8–1.0 and give missiles a slightly longer interval, so homing lands at ~60–70% of spread DPS.
- **Laser has no drawback.** Genre lasers (DoDonPachi, Raiden's blue laser) trade width for focus. From Lv4, laser here has ±30 px outer beams *and* the highest DPS. The "pierce" promised in the comments (`player.js:282`) and the GDD is not implemented: laser bullets deactivate on first hit (`player.js:236`).
  - *Suggestion:* either implement pierce and cut laser DPS to roughly spread level, or keep laser single-target with no outer beams and ~1.3× spread DPS. Laser should be the boss weapon, and spread the popcorn weapon.
- **Spread damage per pellet drops at Lv4/5** (0.9 / 0.8, `player.js:291`). This creates breakpoints: a Lv5 pellet can't kill a 1-HP scout, and a 3-HP gunship takes 4 pellets instead of 3. Players feel this as "upgrading made me weaker". Keep pellet damage at 1 and balance with pellet count or fire rate.
- **Drones Lv1–2 have no gameplay effect.** The GDD's contact damage and shield pulse are drawn (`player.js:577-606`) but never applied. Drones Lv3+ only fire when the primary fires, only target `Enemies.list` (never the boss), and are useless in boss fights.
  - *Suggestion:* implement the contact damage (cheap: check drone positions against enemies and enemy bullets) and include the boss in the drone target list.
- **Death penalty edge case** (`player.js:453-454`): at Lv1 a death drops the weapon to *Lv0 of the same type*, which fires exactly like Lv1. Only a second death removes it. Set `primaryWeapon = 'none'` when the level reaches 0.

### 2.2 Power-up economy

- `PowerUps.spawn` picks a **random type** (`enemies.js:659`), and a different type resets you to Lv1 (`player.js:520-523`). With ~12 drops per level split over 4 types, the best strategy is to *avoid* most power-ups. That is anti-fun and punishing, and it is exactly the problem Raiden solved.
  - *Suggestion (keeps the existing system):* have weapon pickups **cycle colour** every ~1.5 s so the player chooses when to grab. Or, more lightly, make a different weapon pickup switch type *while keeping the current level* (Raiden behaviour). Drones should stay their own always-useful type.
- Power-ups never despawn (`life: 999`, `enemies.js:666`). The GDD says 8 s. Either is fine, but pick one; the GDD value adds tension.
- The escort in Level 4 drops a random power-up every 6–9 s at 50% (`level-systems.js:124-126`). Together with random types, that is a steady stream of unwanted weapon swaps.
- Weapons carry over between levels at −1 level (`game.js:54`). Lives and bombs fully refill (see §7), so the only thing the player loses between levels is the one resource they earned. Consider keeping the weapon level and making lives persistent instead.

---

## 3. Bosses

### 3.1 Time-to-kill is far too short

Boss HP is fixed per boss (`bosses.js:4-35`) and does not scale with `levelScale` or difficulty, while normal enemies get up to 3.3× HP. Estimated TTK (sum of phase HP ÷ DPS, excluding the 1.5 s phase-transition invulnerability):

| Boss | Total HP | No weapon | Spread Lv5 | Laser Lv5 |
|---|---|---|---|---|
| Architect (L1) | 360* | 43 s | 6.3 s | 3.3 s |
| Furnace (L2) | 350 | 42 s | 6.1 s | 3.2 s |
| Leviathan (L3) | 420 | 50 s | 7.4 s | 3.8 s |
| Interceptor Duo (L4) | 360 | 43 s | 6.3 s | 3.3 s |
| Nexus (L5) | 570* | 68 s | 10.0 s | 5.2 s |
| Echo (L6) | 700 | 84 s | 12.3 s | 6.4 s |

\* Architect/Nexus phase 1 is armor only (see §3.2).

Genre bosses typically last 45–120 s and cycle through every pattern at least once. At these numbers most patterns (including Nexus's remix phase and Echo's mirror phases) are never seen, and there is a **13× gap** between an unpowered and a powered player.

*Suggestions:*
- Scale boss HP per level (the enemy `_levelHpScale` would do), and retune base HP so a *typical* player (Lv3 spread / Lv2–3 laser) takes ~20–30 s per phase.
- Once weapons are rebalanced (§2.1), the weapon spread shrinks and boss HP becomes much easier to tune.
- Optional (DoDonPachi/Touhou convention): a per-phase timer that ends the phase without the phase bonus. This stops under-powered players stalling forever.

### 3.2 Boss logic issues

- **Armor replaces phase 1 instead of protecting it** (`bosses.js:718-741`). When the last armor segment dies, `_nextPhase()` runs, so `phaseHps[0]` (Architect 80, Nexus 160) is never used. Any hit anywhere on the boss damages the *first alive* segment, and overflow damage is lost. Armor is not a targetable part, just a separate HP pool. Consider making segments positional hitboxes (break them to open the core, as in most Cave bosses), then fight phase 1 HP.
- **Density handling breaks patterns.** Many patterns compute the bullet *count* as `floor(N * density)` but keep the *angle/position step* based on `N`:
  - Rings such as `(Math.PI*2/20)*j` with `j < floor(20*density)` (Furnace P2, Leviathan P2/P3, Duo P2, Nexus, Echo): with density > 1, bullets **overlap in pairs** instead of making a denser ring. With density < 1 (Casual), the ring gets **a gap on one side**, which becomes a permanent safe spot.
  - Horizontal walls such as `(PLAY_W/15)*j` (Furnace P1 `bosses.js:373-376`, Nexus wall `:533`): extra bullets spawn off-screen to the right, and on Casual the right side of the screen is empty.
  - Arcs such as `angle - 0.6 + (1.2/12)*j` (Leviathan tentacle) and `(j - 5) * 0.12` (Furnace flame): the arc becomes lopsided.
  - *Fix:* compute `count` once and use `2π / count` (or `span / (count-1)`) everywhere, as the Architect ring already does (`bosses.js:623-625`).
- **Architect "Horizontal sweep" is one bullet.** `bosses.js:616-619` calculates `x` but spawns every bullet at `this.x`, so N bullets are stacked on one point.
- **Stationary "laser" bullets appear instantly** (Architect P2 rotating arms, Nexus cross beams). They spawn at full length with no warning. Add a short, non-lethal telegraph line (as the sniper already has) before the bullets become active.
- **Bomb vs. armored boss** only damages one armor segment (`player.js:409-412` → `Boss.hit`), and the 10%-of-phase-HP formula is tiny once boss HP is fixed.
- Boss contact kill uses a 50 px circle (`player.js:203-209`). Leviathan P3 lunges to y=200 while tracking player X. Make sure it cannot overlap the player's reachable area without a telegraph.

---

## 4. Difficulty scaling

### 4.1 Level scaling stacks three multipliers

`game.js:41-45` applies `levelScale` (1.0 → 2.5) as:

| Level | Bullet density | Enemy HP | Enemy fire rate & bullet speed |
|---|---|---|---|
| 1 | 1.00× | 1.00× | 1.00× |
| 2 | 1.25× | 1.34× | 1.10× |
| 3 | 1.50× | 1.69× | 1.20× |
| 4 | 1.80× | 2.15× | 1.32× |
| 5 | 2.10× | 2.62× | 1.44× |
| 6 | 2.50× | 3.29× | 1.60× |

…multiplied again by the difficulty preset's density (Hardcore L6 = 3.25× density). On top of that, `score` also scales by the HP multiplier.

- The effective threat at L6 is roughly density × speed × time-on-screen (HP) ≈ **13×** Level 1, while the player's power ceiling is fixed. Cave/Touhou games usually scale **one** axis at a time, mostly density and pattern complexity, and keep bullet speed readable.
- **Bullet speed scaling hurts readability the most.** L6 sniper shots travel 800 px/s (1,040 on Hardcore) across a 960 px field. Suggest capping speed scale at ~1.25 and relying on density/patterns.
- HP scaling pushes enemies across **bomb tiers** (`player.js:397-404`): at L6 a scout has 4 HP, lands in the "75%" tier, and **survives a bomb**. Base the tiers on `Enemies.types[e.type].hp` (unscaled).
- Only phase shifters and bombers use `bulletDensity` among normal enemies (`enemies.js:213, 233, 240`). Scouts, gunships, snipers, turrets and cruisers ignore it, so **Casual's 40% density barely changes the waves**. Gunship 3-way and cruiser 2-way should respect it, or Casual should lower fire rate instead.

### 4.2 Difficulty presets

- `autofire: true` on Casual (`config.js:9`) and the Custom "AUTO-FIRE" toggle are **never read**. Fire mode comes only from Settings (`game.js:35`), so Casual players default to manual fire.
- The GDD says Casual density is 60%. The code says 40%, which is also multiplied by `levelScale` (see §3.2 for ring gaps on Casual).
- Hardcore: 1 life, no bombs, no focus, 1.3× density, 1.4× chain drain. **Focus disabled** is unusual for the genre: focus is a precision tool, not an assist. Hardcore usually means more bullets, not fewer controls. Consider keeping focus and using higher density or faster rank instead.
- Endless: `rank = 1 + t*0.008` grows without limit (`waves.js:294`). HP scales linearly with rank and speed by 0.4 × (rank − 1), so at 10 min bullets are ~2.9× speed and at 20 min ~4.8×. Endless runs will end on unreadable bullet speed, not density. Cap the speed component and let density carry the escalation.

---

## 5. Scoring systems

### 5.1 Neon Surge — half-implemented

- The GDD and the in-game tutorial (`ui-systems.js:332`) promise **2× fire rate** and **"your bullets cancel enemy bullets"**. A grep for `surgeActive` shows it only affects score (`scoring.js:78`) and colours. Right now Surge is a pure score toggle with no survival value, which undercuts graze as a risk/reward loop (compare Crimzon Clover's Break or Espgaluda's Kakusei, where the meter-state also changes survival).
- **Activation conflict** (`player.js:166`): Fire + Focus held together is the *normal* input for precise dodging in manual mode, so Surge triggers by accident whenever the meter fills. Options: activate on **bomb press while the meter is full** (bomb only as fallback), a dedicated rebindable key, or a press (not hold) of Focus while Fire is held.
- Surge charge is fully lost on death (`player.js:447`). That is fine, but consider keeping ~50% (Touhou keeps power partially) so a death doesn't wipe 20 grazes of effort.

### 5.2 Graze

- Grazing counts **while invulnerable** (respawn 2 s, shield hit 0.8 s), `player.js:148`. After respawning, players can dive into bullet clouds for free Surge charge. Touhou only counts graze while vulnerable. Suggest `if (!this.invincible || this.dashing)`, keeping dash-grazes as a skill reward.
- Graze milestones re-trigger every level. `softReset` resets `nextGrazeThreshold` but keeps the cumulative `grazeCount` (`scoring.js:183-190`), so the first grazes of Level 2 pay out all old milestones again.

### 5.3 Chain

- The multiplier tiers (10/25/50/100) are ambitious for the enemy counts. Level 1 has ~97 enemies in total and gaps of 3–10 s between waves, against a 2.5 s timer (1.8 s on Hardcore). The 8× tier is effectively unreachable without milking carriers.
  - *Suggestion (DoDonPachi):* **refill the chain timer on hits**, not only kills (a small refill per hit on a large enemy or boss), so skilled players can bridge wave gaps by holding a tough enemy. Also give bosses hit-based chain extension.
- **Carrier milking:** carriers hover forever (see §6) and launch a scout every 2 s with an 8% drop chance each. Leaving one alive is the optimal score and power-up strategy. That can be a deliberate risk/reward mechanic (it is in DoDonPachi), but it should be capped, e.g. a carrier leaves after N launches.
- Bombing breaks the chain *and* sets `isPerfect = false`. Cancelled bullets from a bomb give no score, while cancelling via big-enemy kills gives 250 × multiplier per bullet. That is consistent with the genre (bombs are for survival), just make sure it is communicated.

### 5.4 End-of-level bonuses (`storage.js:756-786`)

- **Double counting.** `maxChain` and `grazeCount` are cumulative across a campaign run (kept by `softReset`), but the chain and graze bonuses are paid at the end of *every* level. Level 1 grazes are paid out 5 times over a full run. Use per-level counters for the bonus.
- The time bonus (`(300 - levelTime) * 100`) mostly rewards **boss kill speed**, because waves are on a fixed timer. Combined with the laser's 3 s boss kills, it widens the weapon imbalance further.
- `Campaign.recordLevelScore` stores the *cumulative* run score as the per-level best, so "Level 3 best" includes Levels 1–2.

---

## 6. Enemies and waves

- **Hover enemies never leave.** `hover` only moves them to y≈100 (`enemies.js:175-178`), and the boss only spawns when `Enemies.list.length === 0` (`game.js:462`). Turrets, snipers, carriers, cruisers and phase shifters stack up in one row at y≈100 if not killed, and the level cannot end until they are. Gunships on `strafe` descend at 16 px/s (≈56 s to cross). Give hover/strafe enemies a lifetime after which they exit upward (standard in the genre), and let the boss start after a timeout.
- **`sides` formation + `strafe`** puts gunships at x = −15 / 735 oscillating ±40 px, so they sit **half off-screen** at the edge (`waves.js` `sides` × `enemies.js:171-174`). Spawn them off-screen and move them in.
- **Point-blank enemy fire:** enemies fire until `y < PLAY_H - 50` (`enemies.js:119`), so straight-down scouts shoot aimed bullets from right next to the player. Cave games suppress fire when an enemy is within ~100–150 px of the player or in the bottom quarter. That rule also rewards point-blank play (which the point-blank score bonus already encourages).
- **Phase shifter** teleports with no telegraph (`enemies.js:125-133`) and can fire its ring on the next frame. Add a ~0.4 s fade-in during which it can't fire or be hit.
- **Sniper** telegraph tracks the player right up to the shot (`enemies.js:137`), so the warning line doesn't tell you where the bullet will go. Lock the aim ~0.3 s before firing, so the telegraph shows where the shot will go.
- `missile_turret` is described as "missile" but fires a plain aimed bullet at 0.8× speed. Its identity overlaps with the scout/sniper; a slow homing shot or a burst would make it distinct.
- **Asteroid spawn is frame-rate dependent** (`Math.random() < 0.02` per frame, `level-systems.js:15`): 1.2/s at 60 Hz and 2.9/s at 144 Hz. Use `rate * dt`. Asteroids also keep spawning during the Leviathan fight. That may be intended, but it stacks with the boss's own asteroid attack.
- **Escort (L4):** the AURORA sits above the player at y≈800, so aimed shots at the player hit it by geometry. Thirty 1-damage hits go quickly against 1.8× density. Consider having it take damage only from bullets aimed at it, or giving it more HP plus slow regeneration. It also makes the random power-up issue (§2.2) worse.

---

## 7. Lives, bombs, dash and progression

- **Dash cancels invulnerability** (`player.js:106-109`). At dash end, `invincible = false` runs even when `invincibleTimer` (bomb 1.5 s / respawn 2 s) still has time left. Dashing out of a bomb makes you vulnerable immediately, and the blink stops. Fix: `this.invincible = this.invincibleTimer > 0;`.
- Dash invulnerability is **0.15 s** (the GDD says ~0.5 s) with a 2 s cooldown. 0.15 s is ~9 frames, which is tight but workable. Test 0.2–0.25 s; 0.5 s would make dash stronger than the bomb.
- **Lives and bombs fully refill every level** (`Player.init()` at `game.js:51`). That removes run-level tension and makes the "LIVES BONUS" a per-level freebie. The genre standard is persistent lives plus **score extends** (e.g. at 1M/3M). Persistent lives also make the carried weapon level matter.
- **Death-bomb window (Touhou) / auto-bomb (DoDonPachi):** on Casual/Normal, an 8–10 frame window after a hit, during which pressing bomb cancels the death, makes bombs feel fair. This adjusts the existing bomb rather than adding a new feature.
- Bomb stock on respawn: `min(bombs + 2, startCount)`. Reasonable.
- **Retry / Restart** from a later level restarts with no weapons and resets score (`game.js:506, 543`), which is a big spike at L5–6 (3× HP enemies with an 8 DPS pea-shooter). Give retries a minimum loadout (e.g. Lv2 of the last weapon), as Raiden does on continue.
- **Level select / custom start inherits stale state.** `briefing` calls `startLevel(idx, diff, keep = idx > 0)` (`game.js:380-382`). Starting Level 3 from level select keeps the **previous session's weapons, score, deaths and `isPerfect`**. Old scores leak into new high-score entries. Use `keep = true` only when coming from a victory screen.
- **Level unlocks are shared across difficulties** (`Campaign.levelsUnlocked`). Clearing L1 on Casual unlocks L2 on Hardcore. That is fine as an accessibility choice, but it makes the per-difficulty records less meaningful.

---

## 8. Engine issues that affect gameplay

- **`setTimeout` spawning** (`waves.js:63`, `waves.js:364`, `game.js:447, 473, 486`):
  - Enemies scheduled during **pause** are silently dropped (the state is `paused`, not `playing`).
  - **Victory soft-lock:** if the player pauses within 1.5 s of the boss dying, the victory callback sees `paused` and does nothing. `Boss.active` is already false, so nothing retries, and the level never ends. The escort-failure path has the same problem.
  - After **Restart/Retry**, pending timeouts from the old run spawn into the new one.
  - In Endless, the timeouts check only `EndlessMode.active`, which stays `true` after quitting to title.
  - *Fix:* move all delayed spawns and state changes into a game-time queue (`{ at: levelTimer + delay, fn }`) processed in `update(dt)`.
- **Boss arrives on top of the final wave:** the last wave's enemies are spawned asynchronously, so if the field is empty when the final wave triggers, `Enemies.list.length === 0` is true in the same frame and the boss starts (`game.js:462`). The pre-boss "generous drops" wave then overlaps the boss warning and fight. Track pending spawns, or require N seconds after the last wave.
- **Tunnelling at low frame rates:** `dt` caps at 50 ms (`main.js:5`). At that cap, an 800 px/s sniper bullet moves 40 px per step against a 7 px combined radius, so hits can be skipped. Either use a fixed-step update (e.g. 120 Hz sub-steps) or swept (segment-vs-circle) collision for fast bullets. The bullet pool already stores `prevX/prevY`, which makes swept collision cheap.

---

## 9. Controls and feel

- **Auto-fire mode stops firing while Focus is held** (`player.js:128`). In almost every shooter with a focus button, focusing *keeps firing* (and in Touhou/Cave it concentrates the shot). Stopping fire in precision moments feels bad and contradicts the GDD. Suggest: auto-fire always fires; focus narrows the spread/laser beams (a natural way to differentiate focused vs. unfocused shots without adding a weapon).
- Player speed 360 px/s crosses the 720 px field in 2.0 s (GDD target 1.5 s). Focus at 0.4× (144 px/s) is in line with the genre. Consider 400–420 px/s unfocused if L5–6 speed scaling stays.
- Power-up collection uses the 14 px *visual* radius plus 10, which is generous and good. Enemy/bullet hits use the 3 px hitbox, which is correct.

---

## 10. Suggested order of work

1. **Bug fixes** (small, low-risk): the dash invulnerability reset, the `setTimeout` → game-time queue (fixes the pause drops, victory soft-lock, stale spawns and boss/final-wave overlap), stale state on level select, end-bonus double counting, the Architect horizontal-sweep bullet stack, the density/angle mismatch in boss patterns, bomb tiers using unscaled HP, the Lv0 weapon, and the unused `autofire` flags.
2. **Finish half-built mechanics**: the Surge effects and a non-conflicting activation input, drone Lv1–2 contact damage and shield, drones targeting bosses, and laser pierce (or remove the claim).
3. **Weapon pass**: decouple the base shot's fire rate, buff homing, and give laser a real trade-off. Target Lv5 spread ≈ Lv5 laser ≈ 1.2× Lv5 homing in *practical* DPS.
4. **Boss pass**: scale HP per level, retune for 20–30 s phases, and add telegraphs for instant stationary bullets.
5. **Scaling pass**: cap bullet-speed scaling, let density carry difficulty, make Casual density apply to all enemies, and add enemy fire suppression near the player.
6. **Economy pass**: colour-cycling or level-keeping power-ups, persistent lives with score extends, per-level chain/graze bonus counters, and hit-based chain refills.

These changes stay within the current feature set and should make the six levels feel much more like a deliberate difficulty curve than a race between the weapon RNG and the scaling multipliers.
