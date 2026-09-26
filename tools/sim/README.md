# Headless gameplay simulation

Scripts that load the built game in headless Chromium and play it on a fake 60 fps clock, used to verify
`docs/neon-storm-gameplay-review.md`. Game logic runs unmodified; only drawing is stubbed out, so a two-minute
level simulates in well under a minute.

## Setup

```bash
node build.js                     # produces dist/neon-storm-beta.html
npm install --no-save playwright  # dev-only; the game itself has no dependencies
npx playwright install chromium   # skip if you already have a Chromium (see CHROMIUM_PATH)
```

Environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `GAME_HTML` | `dist/neon-storm-beta.html` | Build to test |
| `CHROMIUM_PATH` | Playwright's bundled Chromium | Use a specific Chromium executable |

## Scripts

| Command | What it does | Time |
|---|---|---|
| `npm run sim:checks` | Regression checks for the review's bugs (below). Exit code 1 if any fail | ~5 min |
| `node tools/sim/checks.js dashKeepsBombInvulnerability,laserPierces` | Run selected checks only | |
| `npm run sim:weapons` | Measured DPS for every weapon and level vs boss- and scout-sized targets | ~3 min |
| `npm run sim:boss-ttk` | Boss time-to-kill for 6 loadouts (optionally `node tools/sim/boss-ttk.js 0,5` for chosen levels) | ~10 min |
| `node tools/sim/playthrough.js <level 0-5> [casual\|normal\|hardcore] [weapon] [level]` | Full level played by a dodging bot | 1–3 min |

Results are written to `tools/sim/out/` (git-ignored) as JSON.

## Regression checks

Each check asserts the **correct** behaviour. On the original beta (`ec6cad4`) all of the first 24 failed; after the fix
pass every check passes, so a failure now means a regression. Checks that
encode a design decision rather than a plain bug (e.g. `laserPierces`, `surgeNotTriggeredByFocusedFire`,
`hoverEnemiesLeave`) should be edited or removed if the design goes a different way.

| Check | Review § |
|---|---|
| `dashKeepsBombInvulnerability` | 7 |
| `lv1DeathRemovesWeapon` | 2.1 |
| `bombKillsLevel6Scout` | 4.1 |
| `autofireWhileFocusing` | 9 |
| `casualPresetAutofire` | 4.2 |
| `dronesLv2DealDamage`, `dronesTargetBoss`, `laserPierces` | 2.1 |
| `weaponUpgradesNeverWeaker` | 2.1 |
| `escortStaysOutOfBossRange` | 6 |
| `surgeNotTriggeredByFocusedFire`, `surgeEffects` | 5.1 |
| `noGrazeWhileInvulnerable`, `grazeMilestonesOncePerLevel` | 5.2 |
| `endBonusesPerLevel` | 5.4 |
| `levelSelectStartsFresh` | 7 |
| `pauseKeepsScheduledSpawns`, `victoryAfterPause`, `bossWaitsForFinalWave` | 8 |
| `hoverEnemiesLeave`, `noOffscreenFire`, `asteroidRateIndependentOfFps` | 6 |
| `architectSweepSpreads`, `casualRingsHaveNoGap`, `denseRingsHaveNoDuplicates`, `wallsStayOnScreen` | 3.2 |

## Caveats

- The play-through bot knows every bullet's exact velocity, so its hit counts **do not** reflect human
  difficulty. Use it to find stalls, escort/level failures and undodgeable situations, and
  `maxBulletsOnScreen` as a density measure.
- The simulation runs at a fixed 60 fps, so it cannot show frame-rate-dependent effects such as bullet
  tunnelling; `asteroidRateIndependentOfFps` calls the update function directly at both rates instead.
- Checks and tools reach into game globals (`Player`, `Boss`, `WaveSystem`…). Renaming those will need the
  scripts updating.
