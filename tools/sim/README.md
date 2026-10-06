# Headless gameplay simulation

Scripts that load the built game in headless Chromium and play it on a fake 60 fps clock, used to verify
`docs/neon-storm-gameplay-review.md`. Game logic runs unmodified; only drawing is stubbed out, so a two-minute
level simulates in well under a minute.

## Setup

```bash
node build.js                     # produces dist/neon-storm-delta.html
npm install --no-save playwright  # dev-only; the game itself has no dependencies
npx playwright install chromium   # skip if you already have a Chromium (see CHROMIUM_PATH)
```

Environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `GAME_HTML` | `dist/neon-storm-delta.html` | Build to test |
| `CHROMIUM_PATH` | Playwright's bundled Chromium | Use a specific Chromium executable |

## Scripts

| Command | What it does | Time |
|---|---|---|
| `npm run sim:checks` | Regression checks for the review's bugs (below). Exit code 1 if any fail. Runs up to 4 checks in parallel; `SIM_JOBS=1` runs them one at a time | ~3.5 min |
| `npm run sim:render` | Render smoke test: draws every screen and plays every level with rendering on (plus Flash Reduction and the Canvas 2D fallback). Exit code 1 on any page or console error | ~2 min |
| `npm run sim:audio` | Audio check: renders every music track and sound effect offline through the game's mix (fails on errors, silence or clipping, including a bomb's worth of explosions at once) and checks the track chosen for each game state. Add `--wav` (`node tools/sim/audio.js --wav`) to write previews to `tools/sim/out/audio/`: one WAV per track plus `sfx-reel.wav` | ~1 min |
| `node tools/sim/checks.js dashKeepsBombInvulnerability,laserPierces` | Run selected checks only | |
| `npm run sim:weapons` | Measured DPS for every weapon and level vs boss- and scout-sized targets | ~3 min |
| `npm run sim:boss-ttk` | Boss time-to-kill for 6 loadouts (optionally `node tools/sim/boss-ttk.js 0,5` for chosen levels) | ~10 min |
| `node tools/sim/playthrough.js <level 0-5> [casual\|normal\|hardcore] [weapon] [level] [--human]` | One full level with a fixed loadout. Default: perfect bot, hits counted. `--human`: human-like bot, real deaths | 1–3 min |
| `node tools/sim/campaign.js [difficulty] [label]` | Whole campaign as one run with the human-like bot: deaths, lives, extends, weapon progress, chain, Surge, mid-boss outcomes per level | 15–30 min |
| `node tools/sim/perf.js` | Game-logic cost per frame in a heavy late-Endless scene, with and without Surge | ~5 min |
| `node tools/sim/perf.js --render` | Texture bytes uploaded per frame and CPU time of the gameplay and HUD draw calls, in late Endless and a level-6 boss fight, at HIGH and LOW | ~10 min |

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
| `endlessScalingCapped`, `endlessEnemyCap` | 4.2 |
| `escortStaysOutOfBossRange` | 6 |
| `surgeNotTriggeredByFocusedFire`, `surgeEffects` | 5.1 |
| `noGrazeWhileInvulnerable`, `grazeMilestonesOncePerLevel` | 5.2 |
| `endBonusesPerLevel` | 5.4 |
| `levelSelectStartsFresh` | 7 |
| `pauseKeepsScheduledSpawns`, `victoryAfterPause`, `bossWaitsForFinalWave` | 8 |
| `midBossPausesStageAndEscapes`, `midBossRewards` | 8 (mid-bosses) |
| `hoverEnemiesLeave`, `noOffscreenFire`, `asteroidRateIndependentOfFps` | 6 |
| `architectSweepSpreads`, `casualRingsHaveNoGap`, `denseRingsHaveNoDuplicates`, `wallsStayOnScreen` | 3.2 |

## Caveats

- The perfect bot (default) knows every bullet's exact velocity, so its hit counts **do not** reflect human
  difficulty; use it for stalls, escort/level failures and undodgeable situations. The human-like bot
  (`--human`, `campaign.js`) has a 180 ms reaction time, perception noise and limited attention, but it is
  still better than a typical player — treat its death counts as a lower bound. It rarely bombs, so the
  bomb economy is not well measured.
- `perf.js` times game logic; `--render` measures upload volume and CPU draw time. GPU time can't be measured headless (WebGL is software-emulated by SwiftShader, and its timings swing by 100× between runs), so use Settings → SHOW FPS in a real browser for frame rate.
- The simulation runs at a fixed 60 fps, so it cannot show frame-rate-dependent effects such as bullet
  tunnelling; `asteroidRateIndependentOfFps` calls the update function directly at both rates instead.
- Checks and tools reach into game globals (`Player`, `Boss`, `WaveSystem`…). Renaming those will need the
  scripts updating.
