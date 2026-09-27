# NEON STORM — Game Design Document v1.1

*v1.1 (beta): sections 3–10 updated to the implemented and simulation-tuned values — see `docs/neon-storm-gameplay-review.md` §12–13 for the reasoning and measurements.*

## 1. Overview

**Title:** Neon Storm
**Genre:** Vertical scrolling bullet hell shooter
**Platform:** HTML5 Canvas (desktop browser, 1080p target)
**Tech Stack:** Vanilla JavaScript + HTML5 Canvas + Web Audio API
**Visual Style:** Synthwave / Neon aesthetic
**Target Play Time:** ~5 minutes per run (single level)
**Inspiration:** 1942, DoDonPachi, Ikaruga, Crimzon Clover, Touhou, Gradius

---

## 2. Screen Layout & Resolution

**Target Resolution:** 1920×1080 (landscape)

**Layout:**

```
┌──────────┬─────────────────────┬──────────┐
│          │                     │          │
│  LEFT    │     PLAY AREA       │  RIGHT   │
│  HUD     │   (~540×960)        │  HUD     │
│          │   Portrait ratio    │          │
│  Lives   │   Centered          │  Score   │
│  Bombs   │                     │  Chain   │
│  Weapons │                     │  High    │
│  Drones  │                     │  Score   │
│  Surge   │                     │  NC      │
│          │                     │          │
└──────────┴─────────────────────┴──────────┘
```

- **Play Area:** Centered, portrait-ratio (~540×960), classic vertical scroller feel
- **Left HUD Panel:** Lives, bombs remaining, current weapon + level, drone/shield status, Surge meter
- **Right HUD Panel:** Score, chain combo counter + multiplier, session high score, Neon Credits earned
- **HUD Background:** Subtle animated synthwave elements (slow grid scroll, ambient particles)
- Play area is fixed size, centered and scaled to fit the browser window

---

## 3. Player Ship

### 3.1 Movement
- 8-directional movement via keyboard (Arrow keys / WASD) or gamepad left stick
- **Focus Mode:** Hold designated key to move at 40% speed for precise dodging
  - Player hitbox becomes visible as a glowing dot while active
  - Focus also tightens the Spread Shot fan (Touhou-style focused shot)
  - Available on every preset; can be toggled in Custom mode
- Base movement speed is 360 px/s: the ship crosses the 720 px play area in ~2 seconds

### 3.2 Firing
- **Fire mode is a settings toggle** — player chooses between:
  - **Auto-fire:** Ship fires continuously, including while Focus is held (default on Casual)
  - **Manual fire:** Tap/hold fire button, separate focus button
- Base weapon: Single forward shot every 0.12 s (always available, cannot be lost). It runs on its own
  timer, so no primary weapon ever slows it down

### 3.3 Special Abilities

**Bomb (limited stock):**
- Default start: 3 bombs (varies by difficulty)
- Clears all enemy bullets on screen
- Damage is tiered by the enemy's *base* toughness: basic enemies (scouts, snipers, shield walls) always die;
  mid-tier enemies lose 75% of their HP; heavy enemies lose 45%
- Bosses take 10% of the current phase's HP, and every intact armor segment is hit
- ~1.5 s of invincibility; breaks the chain
- Visual: Screen flash, expanding neon shockwave ring
- Stock: up to 2 bombs restored on respawn (never above the starting count); the stock carries between
  levels and is topped up to the starting count at the start of each level
- **Death-bomb window:** after a lethal hit, pressing Bomb within a short window cancels the death
  (Casual 0.25 s, Normal 0.15 s, none on Hardcore — Touhou-style)

**Dash (cooldown-based):**
- Quick directional phase shift in movement direction
- 0.2 seconds of invincibility during dash; any invincibility already running (bomb, respawn) is kept
- ~2 second cooldown (varies by difficulty)
- Visual: Afterimage trail in ship color, brief transparency
- Can dash through bullets and enemies without taking damage; grazes during a dash still count

### 3.4 Hitbox
- Visual ship is larger than actual hitbox (standard for the genre); hitbox radius 3 px
- Hitbox is a small circle at the center of the ship sprite
- Hitbox becomes visible during Focus Mode as a bright glowing dot
- Optional setting: "Show hitbox always"
- Bullet collision is swept (tested along the bullet's path each frame), so fast bullets can't pass through

---

## 4. Weapon System (Hybrid)

### 4.1 Primary Weapon Slot
One active primary weapon at a time, levels 1–5. Collecting the same type levels it up. Collecting a
different type switches to it at Level 1.

Balance targets: every weapon's damage grows ~2.3× from Lv1 to Lv5 (≈16 → ≈38 DPS on a single target,
including the base shot), all weapons stay within ~20% of each other, and **no level ever does less damage
than the level below it** (guarded by `tools/sim/checks.js`).

**Spread Shot** (volley every 0.25 s, 1 damage per pellet):
- Lv1: 2 pellets · Lv2: 3 · Lv3: 5 · Lv4: 7 · Lv5: 9
- Each level adds pellets to the previous fan without moving existing ones (inner pellets first)
- Holding Focus narrows the fan to 35% of its width — the best single-target damage when focused

**Homing Missiles** (volley every 0.26 s, 1 damage per missile):
- Lv1: 2 missiles · Lv2: 3 · Lv3: 4 · Lv4: 5 · Lv5: 6 (faster at Lv2 and Lv4)
- Never miss, so they fire slightly slower and deal a little less raw damage

**Laser Beam** (every 0.1 s, **pierces**: hits each enemy in its path once):
- Main beam damage 1.0 / 1.3 / 1.6 / 1.9 / 2.3 per tick (Lv1–5), widening with level
- Lv3+: two side beams (±12–14 px, kept inside a scout's hitbox)
- Lv4+: two thin outer beams (±26–28 px)

### 4.2 Passive Slot — Shield/Drones
Independent from primary weapon. Drone pickups always stack regardless of primary weapon.

- Lv1–5: 2 / 3 / 4 / 5 / 6 orbiting drones
- All levels: drones deal contact damage (1 damage every 0.15 s) to enemies and the boss they touch
- Lv2+: periodic **shield pulse** that cancels enemy bullets near the ship (every 3 s; every 2 s from Lv4;
  larger radius at Lv5)
- Lv3+: each drone fires at the nearest target — enemies *or the boss* — every 0.5 s

### 4.3 Power-Up Drops
- Power-ups drop from destroyed enemies (per-type drop chance: 8% scouts up to 60% carriers)
- Type is random: Spread (orange), Homing (green), Laser (blue), Drone (purple)
- Power-ups drift slowly downward and can be collected by contact; picking the right colour (and avoiding
  the wrong one) is part of the skill
- The Level 4 escort also drops power-ups periodically
- Weapons, drones, lives and bombs carry over between campaign levels (see §9)

---

## 5. Scoring System

### 5.1 Base Scoring
- Each enemy type has a base point value (see Section 7 for values), scaled up with the level's HP scaling
- Points awarded on kill; point-blank kills (within 60 / 120 / 200 px) score 3× / 2× / 1.5×

### 5.2 Kill Chain Combo
- Destroying an enemy starts/extends a combo timer (3.0 s, visible draining bar on HUD)
- **Every hit** also tops the timer up a little (DoDonPachi-style), so a player can bridge a quiet moment by
  keeping fire on a tough enemy or the boss
- Each consecutive kill before the timer expires adds to the chain counter
- Chain multiplier tiers:
  - 1–9 hits: 1x multiplier
  - 10–19 hits: 2x multiplier
  - 20–34 hits: 3x multiplier
  - 35–59 hits: 5x multiplier
  - 60+ hits: 8x multiplier
- Timer drain speed varies by difficulty preset
- Chain breaks (timer expires) reset counter and multiplier to 0/1x
- Dying or using a bomb breaks the chain

### 5.3 Graze System (Neon Surge)
- A detection zone slightly larger than the hitbox surrounds the player
- Enemy bullets passing through this zone (but not hitting the hitbox) count as "grazes" — only while the
  player is vulnerable (dashing still counts)
- Each graze adds 5 to the Surge meter (100 = full); each kill adds 1.5. Grazing is the main source
- Graze detection zone size and reward vary by difficulty
- Graze milestones (25/50/100/200/500 grazes in a level) award bonus points
- When the Surge meter is full, press **SURGE** (F / M; gamepad RT / Y) — or Bomb with no bombs left:
  - Duration: 5 seconds
  - Effects: 2x fire rate (base shot, weapon and drones), player shots cancel enemy bullets on contact
  - Visual: Ship and projectiles glow white-hot, screen edges pulse, intensified bloom
  - Score bonus: All kills during Surge award 3x points (stacks with chain multiplier)
- On death the Surge meter keeps half its charge

### 5.4 Bullet Cancel Score Bonus
- When a medium or larger enemy is destroyed, its nearby bullets are cancelled into score
- Each cancelled bullet is worth 250 base points × current chain multiplier
- Visual: Bullets pop into small cyan stars

### 5.5 End-of-Level Bonuses
All bonuses count **the level just played** (not the whole run):
- **Boss Phase Clear Bonus:** 5,000 / 10,000 per phase cleared by damage (not by timeout), 25,000 for the kill
- **Time Bonus:** Points for completing the level quickly (scaled)
- **Lives Bonus:** 5,000 per remaining life
- **No-Death Bonus:** 15,000 for completing the level without dying
- **Chain Bonus:** 50 × longest chain in the level
- **Graze Bonus:** 10 × grazes in the level

### 5.6 Difficulty Score Multiplier
All scoring is multiplied by a global difficulty factor:
- Casual: 0.5x
- Normal: 1.0x
- Hardcore: 2.0x
- Custom: No multiplier (scores not recorded to leaderboard)

---

## 6. Difficulty System

### 6.1 Presets

**Casual:**
- Bombs: ON (start with 5)
- Focus/Slow Mode: ON
- Dash: ON (shorter cooldown: 1.5s)
- Graze System: ON (generous detection zone)
- Auto-fire: ON (default, can toggle)
- Lives: 5
- Death Penalty: None (keep all upgrades)
- Death-bomb window: 0.25 s
- Enemy Bullet Density: 60%
- Chain Timer: Lenient (slow drain)
- Score Multiplier: 0.5x

**Normal:**
- Bombs: ON (start with 3)
- Focus/Slow Mode: ON
- Dash: ON (2s cooldown)
- Graze System: ON (standard detection zone)
- Auto-fire: OFF (default, can toggle)
- Lives: 3
- Death Penalty: Moderate (drop 1 weapon level — losing the weapon at Lv1 — and 1 drone level)
- Death-bomb window: 0.15 s
- Enemy Bullet Density: 100%
- Chain Timer: Standard
- Score Multiplier: 1.0x

**Hardcore:**
- Bombs: OFF (so no death-bomb)
- Focus/Slow Mode: ON (focus is a precision tool, not an assist)
- Dash: ON (3s cooldown)
- Graze System: ON (tight detection zone, higher reward multiplier)
- Auto-fire: OFF
- Lives: 1
- Death Penalty: Full (lose all weapon upgrades, lose all drones)
- Enemy Bullet Density: 130%
- Chain Timer: Aggressive (fast drain)
- Score Multiplier: 2.0x

**Custom:**
- Full access to all toggles individually
- Dynamic info display showing which settings are harder/easier than Normal
- Scores not recorded to any leaderboard
- Still earns Neon Credits at 0.75x rate

### 6.2 Level Scaling
Each level has a `levelScale` (1.0 → 2.5 by Level 6). Following Cave/Touhou practice, later levels escalate
mostly through density; bullet speed stays readable:

| Level 6 vs Level 1 | Multiplier |
|---|---|
| Bullet density (count in patterns, fire frequency for aimed shooters) | ×1.75 |
| Enemy HP (and score) | ×1.9 |
| Enemy fire frequency | ×1.3 |
| Enemy bullet speed | ×1.2 (cap) |

Density applies to every enemy type and to boss patterns (bullet counts are recomputed so rings stay evenly
spaced and walls span the screen). Endless mode uses the same curve driven by time, with density capped at
×2.2 and HP at ×3.

### 6.3 Toggleable Options (Custom Mode)
| Option | Values | Default (Normal) |
|--------|--------|-------------------|
| Bombs | ON / OFF | ON |
| Bomb Count | 1–5 | 3 |
| Focus Mode | ON / OFF | ON |
| Dash | ON / OFF | ON |
| Dash Cooldown | 1s / 2s / 3s / 5s | 2s |
| Graze System | ON / OFF | ON |
| Graze Zone Size | Generous / Standard / Tight | Standard |
| Auto-fire Default | ON / OFF | OFF |
| Lives | 1 / 2 / 3 / 5 | 3 |
| Death Penalty | None / Moderate / Full | Moderate |
| Bullet Density | 50% / 75% / 100% / 130% / 160% | 100% |
| Chain Timer Speed | Lenient / Standard / Aggressive | Standard |

---

## 7. Enemy Types

### 7.1 Military Tier (Early–Mid Level)

**Scout Drone**
- HP: 1 hit
- Speed: Fast
- Behavior: Appear in wave formations (V-shapes, lines, arcs), move in preset patterns
- Attack: Single aimed shot downward every ~2 seconds
- Score: 100 base points
- Drops: Occasional power-up from formation leaders

**Gunship**
- HP: 3 hits
- Speed: Medium
- Behavior: Enter from sides, strafe horizontally across play area
- Attack: 3-round burst pattern aimed at player position
- Score: 300 base points
- Drops: Power-up on kill (~30% chance)

**Missile Turret**
- HP: 5 hits
- Speed: Slow (scrolls with background) or stationary
- Behavior: Fixed position, rotates to track player
- Attack: Fires homing missiles (slow, can be shot down) every ~3 seconds
- Score: 500 base points
- Drops: Power-up on kill (~50% chance)
- Note: Bullets cancel on destruction (bullet cancel mechanic)

### 7.2 Sci-Fi Elite Tier (Mid–Late Level)

**Phase Shifter**
- HP: 4 hits
- Speed: Medium
- Behavior: Teleports to new position every ~3 seconds (brief warning flash at destination)
- Attack: Fires radial bullet ring (8–12 bullets in a circle) after each teleport
- Score: 600 base points
- Drops: Power-up on kill (~40% chance)
- Note: Bullets cancel on destruction

**Shielded Cruiser**
- HP: 8 hits (3 shield + 5 hull)
- Speed: Slow
- Behavior: Moves slowly downward, rotating energy shield blocks damage from one direction
- Attack: Sweeping laser beam (rotates slowly) + aimed bullet pairs
- Score: 1,000 base points
- Drops: Guaranteed power-up on kill
- Note: Shield must be broken first (visual crack effect); bullets cancel on destruction

### 7.3 Boss — "THE ARCHITECT"
Multi-stage boss fight. Rules shared by all six bosses:
- **Fight length:** tuned for ~35–65 s at full uptime with a Lv3–Lv5 weapon (45–120 s in real play is the
  genre norm). Boss HP rises from 920 (Architect, incl. armor) to 1,470 (Echo); the fast-strafing
  Interceptor Duo has less HP (700) because it is hard to stay under
- **Phase timeout:** each phase ends after 45 s (on-screen timer) without its clear bonus, so an
  under-powered player is never stuck
- **Telegraphs:** stationary "laser" bullets appear faint and harmless for 0.35 s before becoming lethal
- **Armor** (Architect, Nexus): segments are real hit zones orbiting the core; while any remain, the core
  takes 50% damage

**Phase 1: Armored Shell**
- Large mechanical/sci-fi hybrid design
- 4 destructible armor segments protecting the core
- Attacks:
  - Aimed spread shots from each armor segment
  - Horizontal bullet sweep (wall of bullets with gaps to weave through)
  - Deploys scout drone reinforcements periodically
- Transition: All armor segments destroyed → brief cinematic → Phase 2

**Phase 2: Exposed Core**
- Core revealed, faster movement, more aggressive
- Attacks:
  - Dense aimed bullet fans (requires focus mode dodging)
  - Deploys mini-drone swarms (4–6 drones)
  - Rotating laser arms (2 lasers, 180° apart, rotating slowly)
  - Periodic aimed homing missiles
- Transition: Core at 50% HP → screen flash → Phase 3

**Phase 3: Desperate Mode**
- Erratic movement pattern (unpredictable horizontal dashing)
- Attacks (all previous + new):
  - Screen-filling spiral bullet patterns
  - Rapid-fire aimed shots between spiral waves
  - Periodic charge/dash attacks toward player position (telegraphed)
  - All attacks faster and denser
- Defeat: Core destroyed → large explosion sequence → victory

**Boss Score Values:**
- Phase 1 Clear: 5,000 points
- Phase 2 Clear: 10,000 points
- Phase 3 Clear (Boss Defeat): 25,000 points
- Each armor segment: 1,500 points

---

## 8. Level Pacing

### Wave Structure

*Implemented levels run ~70–92 s of waves, then the boss (about 2.8–3.3 min per level in simulated
Normal play). The boss arrives once every wave has spawned and the field is clear, or 8 s after the last
wave — stragglers retreat. Hover and strafe enemies retreat after 14–16 s if not killed. The original
~5-minute plan below would need more wave content per level.*

| Segment | Time | Content | Music |
|---------|------|---------|-------|
| **Intro** | 0:00–0:30 | Scout drone waves in simple formations. First power-up drops. Player learns controls. | Building intro |
| **Build-up** | 0:30–1:30 | Mixed scouts + gunships. More complex formations. Introduce missile turrets. Regular power-up drops. | Main theme rising |
| **Escalation** | 1:30–2:30 | Sci-fi enemies appear alongside military. Phase shifters + shielded cruisers. Dense bullet patterns begin. | Intensity peak |
| **Pre-Boss** | 2:30–3:00 | Intense mixed wave of all enemy types. Generous power-up drops. Brief calm before boss. | Tension build |
| **Boss Fight** | 3:00–5:00 | THE ARCHITECT — 3 phases. | Boss theme |

### Wave Data Architecture
- Waves defined as data objects (JSON-like structure), not hardcoded
- Each wave specifies: enemy types, count, formation pattern, spawn timing, spawn position, movement path
- Level is an ordered array of wave objects
- Boss is a separate state with its own phase logic
- **This architecture supports adding new levels by creating new wave data arrays**

---

## 9. Lives & Death System

### Death Behavior
- On hit: Ship explodes (particle effect), brief pause (~0.5s)
- Respawn at bottom-center with ~2 seconds of invincibility (ship blinks)
- Death penalty applied (varies by difficulty):
  - **None:** Keep all upgrades
  - **Moderate:** Primary weapon drops 1 level (lost at Lv1). Drones drop 1 level.
  - **Full:** Primary weapon resets to base shot. Drones removed entirely.
- Up to 2 bombs restored on respawn (not above the starting count)
- Chain combo broken on death
- Surge meter keeps half its charge on death

### Run Persistence and Extends
- Lives, bombs (topped up to the starting count), weapon and drones carry over between campaign levels;
  score is cumulative for the run
- **Extends:** +1 life at 300k / 1M / 2M / 4M points (× the difficulty score multiplier), max 9 lives
- Starting a level from Level Select or Custom begins a fresh run
- **Retry after Game Over** on Level 2+ restarts that level with a minimum loadout (the weapon held at the
  start of the level at Lv2, drones up to Lv1)

### Game Over
- All lives lost → Game Over screen
- Display: Final score, chain max, difficulty, run stats
- If score qualifies for leaderboard: 3-letter initial entry (classic arcade style)
- Options: Retry (same difficulty) / Main Menu
- Neon Credits awarded based on score achieved

---

## 10. Controls

### Keyboard (Default, Rebindable)
| Action | Primary | Alt |
|--------|---------|-----|
| Move Up | ↑ | W |
| Move Down | ↓ | S |
| Move Left | ← | A |
| Move Right | → | D |
| Fire | Space | Z |
| Focus (Slow) | Left Shift | X |
| Dash | C | V |
| Bomb | B | N |
| Neon Surge | F | M |
| Pause | Escape | P |

### Gamepad (Standard Mapping)
| Action | Button |
|--------|--------|
| Move | Left Stick / D-Pad |
| Fire | A / X (face buttons) |
| Focus | Left Trigger (hold) |
| Dash | Right Bumper |
| Bomb | Left Bumper |
| Neon Surge | Right Trigger / Y |
| Pause | Start |

### Control Rebinding
- Full key remapping available in Settings menu
- Gamepad button remapping
- Settings persist across sessions (stored alongside high scores)

---

## 11. Visual Design

### Color Palette
- **Background:** Deep purple (#1a0a2e) → hot pink horizon (#ff006e)
- **Grid:** Magenta (#ff00ff) and cyan (#00ffff) lines
- **Player:** Bright cyan (#00ffff) with white glow
- **Player bullets:** Cyan
- **Military enemies:** Orange/amber (#ff8c00) neon outlines
- **Sci-fi enemies:** Magenta/purple (#ff00ff / #8b00ff) with glow
- **Enemy bullets:** Hot pink (#ff1493) / red (#ff0040)
- **Power-ups:** Color-coded per type (see Section 4.3)
- **Score pickups:** Small cyan stars
- **UI text:** White with subtle glow

### Visual Effects
- **Bloom/glow:** Applied to all neon elements
- **Particle explosions:** On all enemy deaths (size scales with enemy tier)
- **Screen shake:** On bomb use, boss phase transitions, player death (intensity adjustable in settings)
- **Engine trail:** Behind player ship (style selectable via unlockables)
- **Bullet trails:** Faint trail behind fast-moving bullets
- **Graze sparks:** White particle bursts when bullets pass through graze zone
- **Surge activation:** White-hot glow on ship + projectiles, screen edge pulse
- **Background scrolling:** Perspective grid scrolls downward continuously. City skyline silhouette in mid-ground with parallax. Gradient sky.

### Accessibility
- Colorblind mode: Alternate bullet color schemes
- Screen shake: Off / Low / High
- Particle density: Low / Medium / High
- Show hitbox always: On / Off
- Flash reduction: Reduces intensity of screen flash effects

---

## 12. Audio Design

### Sound Effects (Procedural — Web Audio API)
Generated procedurally, no external audio files required:

- Player shot (short bright zap)
- Player laser (continuous hum)
- Homing missile launch (whoosh)
- Drone fire (small pew)
- Bomb explosion (deep boom + sweep)
- Dash (quick whoosh/phase sound)
- Enemy hit (impact thud)
- Enemy explosion (varying size: pop → boom)
- Boss explosion (large multi-stage boom)
- Power-up collect (bright ascending chime)
- Graze (sharp crackle/spark)
- Surge activate (rising power-up swell)
- Chain milestone (brief celebratory sting at 10/20/35/60)
- Menu select (click)
- Menu navigate (subtle tick)
- Player death (descending crash)
- Game over (low drone)

### Music (Hooks for Future)
- Music system architecture built with play/stop/crossfade capabilities
- Hooks for: Menu theme, gameplay theme, boss theme, victory, game over
- Placeholder: Silent or simple procedural ambient drone
- Future: Load external audio files (MP3/OGG) into the existing hook system

---

## 13. Front End & Menus

### 13.1 Title Screen
- Animated synthwave background (scrolling grid, neon city, gradient sky)
- "NEON STORM" logo with glow/pulse animation
- Ship silhouette drifting in background
- Ambient particle effects

### 13.2 Main Menu
```
NEON STORM
─────────────
▸ NEW GAME
▸ HANGAR
▸ HIGH SCORES
▸ HOW TO PLAY
▸ SETTINGS
```

### 13.3 Difficulty Select (from New Game)
- Visual cards for Casual / Normal / Hardcore / Custom
- Each card shows key settings at a glance
- Custom opens full toggle panel (see Section 6.2)
- Selecting a preset → game starts
- Score multiplier shown prominently

### 13.4 Hangar (Shop / Loadout)
- Displays current Neon Credits balance
- Categories: Ship Skins, Engine Trails, Bullet Styles, Explosion Effects, Bonus Content
- Each item shows: Preview, cost, locked/unlocked status
- Loadout selector: Equip purchased cosmetics
- See Section 14 for full unlockable list

### 13.5 High Scores
- Tabbed interface: Casual | Normal | Hardcore
- Each tab shows Top 10: Rank, Initials, Score, Max Chain, Date
- Current session scores shown in a separate "Session" tab (all difficulties, clears on page close)

### 13.6 How to Play
- Interactive mini-tutorial (skippable)
- Covers: Movement, shooting, focus mode, dash, bomb, graze, chain combo
- Brief guided practice scenarios for each mechanic
- Replayable from menu at any time

### 13.7 Settings
| Category | Options |
|----------|---------|
| **Audio** | SFX Volume (slider), Music Volume (slider) |
| **Visual** | Screen Shake (Off/Low/High), Particle Density (Low/Med/High), Show Hitbox Always (On/Off), Flash Reduction (On/Off), Colorblind Mode (On/Off) |
| **Gameplay** | Fire Mode (Auto-fire / Manual) |
| **Controls** | Key Rebinding, Gamepad Button Remapping |

### 13.8 Pause Menu (In-Game)
- Resume
- Restart Level (with confirmation)
- Settings (audio/visual only — no difficulty changes mid-run)
- Quit to Main Menu (with confirmation)

---

## 14. Currency & Unlockables

### 14.1 Neon Credits (NC)
- Earned after every run: `NC = floor(score / 10,000) × difficulty multiplier`
- Difficulty multipliers: Casual 0.5x, Normal 1.0x, Hardcore 2.0x, Custom 0.75x
- Persist across sessions

### 14.2 Unlockable Items

**Ship Skins (visual only):**
| Skin | Cost |
|------|------|
| Cyan Viper (default) | Free |
| Magenta Phoenix | 200 NC |
| Gold Sentinel | 500 NC |
| Chromatic Shift (rainbow cycle) | 1,000 NC |
| Ghost Frame (translucent) | 750 NC |

**Engine Trail Effects:**
| Trail | Cost |
|-------|------|
| Simple Thrust (default) | Free |
| Flame Trail | 150 NC |
| Particle Scatter | 300 NC |
| Lightning Arc | 500 NC |
| Void Trail (dark + stars) | 750 NC |

**Bullet Styles (player projectiles):**
| Style | Cost |
|-------|------|
| Standard Neon Bolts (default) | Free |
| Plasma Orbs | 200 NC |
| Pixel/Retro | 400 NC |
| Geometric Shards | 350 NC |

**Explosion Effects:**
| Effect | Cost |
|--------|------|
| Standard Burst (default) | Free |
| Shatter (geometric fragments) | 250 NC |
| Pixel Dissolve | 300 NC |
| Supernova (big bloom) | 500 NC |

**Bonus Content:**
| Content | Cost |
|---------|------|
| Music Player | 300 NC |
| Enemy Gallery / Bestiary | 400 NC |
| Boss Practice Mode | 600 NC |
| Ship Color Designer | 1,000 NC |

---

## 15. Persistent Data

### Stored Across Sessions (via Artifact Storage API)
- High scores: Top 10 per difficulty (Casual, Normal, Hardcore)
- Neon Credits: Total balance
- Unlocked items: Which cosmetics/content have been purchased
- Current loadout: Equipped skin, trail, bullet style, explosion
- Settings: Audio volumes, visual preferences, control bindings, fire mode
- Tutorial completion flag

### Session Only
- Session leaderboard (all difficulties mixed)
- Current run state (not saved between sessions)

---

## 16. Architecture & Code Structure

### Design Principles
- **Data-driven:** Levels, waves, enemy types, and weapon stats defined as data objects
- **Modular:** Each system (rendering, input, audio, enemies, weapons, scoring, UI) is an independent module
- **Extensible:** Adding new levels, enemies, weapons, or features requires minimal changes to existing code
- **Central config:** `GameConfig` object drives all difficulty-dependent behavior

### Core Systems
| System | Responsibility |
|--------|---------------|
| **GameLoop** | requestAnimationFrame loop, delta time, state management |
| **Renderer** | Canvas drawing, layers, effects, camera/shake |
| **Input** | Keyboard + gamepad polling, rebindable actions, focus/fire mode |
| **Audio** | Web Audio API procedural SFX, music hooks, volume control |
| **Player** | Ship state, movement, weapons, abilities, collision |
| **Enemies** | Spawning, AI behaviors, patterns, health, drops |
| **Bullets** | Object pools for player + enemy projectiles, collision |
| **Weapons** | Weapon type definitions, upgrade levels, firing patterns |
| **Scoring** | Chain combo, graze, surge, multipliers, end-of-run calculation |
| **Waves** | Data-driven wave sequencer, level progression |
| **Boss** | Multi-phase boss logic, patterns, transitions |
| **Particles** | Visual effects, explosions, trails, glow |
| **UI** | HUD rendering, menus, transitions, text |
| **Storage** | High scores, NC, unlocks, settings persistence |
| **Config** | Difficulty presets, custom toggles, game parameters |

### GameConfig Structure
```javascript
GameConfig = {
  difficulty: "normal",           // "casual" | "normal" | "hardcore" | "custom"
  bombs: { enabled: true, startCount: 3 },
  focus: { enabled: true, speedMultiplier: 0.4 },
  dash: { enabled: true, cooldown: 2.0 },
  graze: { enabled: true, zoneMultiplier: 1.0, rewardMultiplier: 1.0 },
  autofire: false,
  lives: 3,
  deathPenalty: "moderate",       // "none" | "moderate" | "full"
  bulletDensity: 1.0,
  chainTimerSpeed: 1.0,
  scoreMultiplier: 1.0
}
```

### Level Data Format (Example)
```javascript
const level1 = {
  id: "level_1",
  name: "Operation Neon Storm",
  duration: 300, // seconds
  background: { type: "synthwave_city", scrollSpeed: 1.0 },
  music: { gameplay: "track_01", boss: "boss_01" },
  waves: [
    {
      time: 0.5,
      enemies: [
        { type: "scout_drone", count: 5, formation: "v_shape",
          spawnEdge: "top", movePath: "sweep_down_left" }
      ]
    },
    {
      time: 3.0,
      enemies: [
        { type: "scout_drone", count: 8, formation: "line",
          spawnEdge: "top", movePath: "zigzag_down" }
      ]
    },
    // ... more waves
  ],
  boss: { type: "architect", triggerTime: 180 },
  powerUpSchedule: [ /* timed guaranteed drops */ ]
}
```

---

## 17. Build Order (Development Phases)

### Phase 1: Core Engine
- Game loop with delta time
- Canvas setup (play area + HUD panels)
- Scrolling synthwave background
- Input system (keyboard + gamepad)
- Basic state machine (menu → playing → paused → game over)

### Phase 2: Player Ship
- Movement (8-directional + focus mode)
- Base shooting
- Dash ability
- Bomb ability
- Ship rendering with glow effects
- Hitbox + graze zone

### Phase 3: Enemies & Collision
- Enemy base class with shared behaviors
- Scout drone (movement patterns + shooting)
- Gunship
- Missile turret
- Collision detection (player bullets ↔ enemies, enemy bullets ↔ player)
- Object pooling for bullets
- Enemy death effects + bullet cancel mechanic

### Phase 4: Weapon System & Power-Ups
- Primary weapon types (spread, homing, laser)
- Weapon upgrade levels
- Drone/shield passive system
- Power-up drops, collection, visual icons

### Phase 5: Scoring
- Chain combo system + HUD display
- Graze detection + Surge meter
- Neon Surge activation + effects
- Bullet cancel score pickups
- Score multiplier per difficulty

### Phase 6: Sci-Fi Enemies & Boss
- Phase Shifter enemy
- Shielded Cruiser enemy
- Boss: THE ARCHITECT (3 phases)
- Boss patterns, transitions, defeat sequence

### Phase 7: Wave System & Level Flow
- Data-driven wave sequencer
- Level 1 complete wave data
- Pacing + difficulty curve
- Pre-boss section
- Level completion flow

### Phase 8: Front End
- Title screen with animation
- Main menu
- Difficulty select + custom toggle panel
- Settings menu
- Pause menu
- Game over screen + initial entry

### Phase 9: Meta-Game
- Neon Credits calculation + display
- Hangar / shop UI
- Unlockable items + loadout equip
- Persistent storage (high scores, NC, unlocks, settings)

### Phase 10: Audio
- Procedural SFX generation (Web Audio API)
- Sound triggers throughout game systems
- Volume controls
- Music system hooks

### Phase 11: Tutorial
- How to Play interactive sequence
- Guided mechanic introductions

### Phase 12: Polish
- Particle system tuning
- Screen shake refinement
- Visual effect polish (bloom, glow, trails)
- Performance optimization
- Edge case handling
- Balance tuning

---
