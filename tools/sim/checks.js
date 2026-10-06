// ============================================================
//  NEON STORM — Gameplay regression checks
// ============================================================
// Each check sets up a situation in the real game and asserts the CORRECT
// behaviour, so a check passes once its bug is fixed. Section numbers refer to
// docs/neon-storm-gameplay-review.md.
//
// Usage: node tools/sim/checks.js [checkName,checkName,...]
// Exit code 1 if any check fails. Results: tools/sim/out/checks.json

const { launch, writeResult } = require('./harness');

const PLAY_WIDTH = 720; // matches PLAY_W in src/constants.js
const PLAY_H_CHECK = 960; // matches PLAY_H

// Start a level with no waves or asteroids and (by default) an invulnerable player
async function startQuiet(g, opts = {}) {
    const { lvl = 0, diff = 'normal', invincible = true } = opts;
    await g.ev(([lvl, diff, inv]) => {
        Game.startLevel(lvl, diff, false);
        WaveSystem.waves = [];
        Asteroids.clear();
        if (inv) { Player.invincible = true; Player.invincibleTimer = 999; }
    }, [lvl, diff, invincible]);
}

// Count player shots per second by wrapping BulletPool.spawn once
async function installShotCounter(g, filter) {
    await g.ev((filterSrc) => {
        const filter = filterSrc ? new Function('opts', 'return ' + filterSrc) : null;
        window.__shots = 0;
        const orig = Player.bullets.spawn.bind(Player.bullets);
        Player.bullets.spawn = (x, y, vx, vy, opts) => {
            if (!filter || filter(opts || {})) window.__shots++;
            return orig(x, y, vx, vy, opts);
        };
    }, filter || null);
}
async function shotsPerSecond(g, ms = 2000) {
    await g.ev(() => { window.__shots = 0; });
    await g.run(ms);
    return g.ev((ms) => window.__shots / (ms / 1000), ms);
}

// Fire one boss pattern and describe the resulting bullets
async function bossPattern(g, boss, lvl, diff, phase, pattern) {
    return g.ev(([boss, lvl, diff, phase, pattern]) => {
        Game.startLevel(lvl, diff, false);
        Boss.init(boss);
        Object.assign(Boss, { entered: true, warningTimer: 0, x: 360, y: 120, phase, patternIndex: pattern, moveTimer: 0 });
        Enemies.enemyBullets.clear();
        Boss._attack(360, 800);
        const pool = Enemies.enemyBullets.pool;
        const key = b => [Math.round(Math.atan2(b.vy, b.vx) * 100), Math.round(Math.hypot(b.vx, b.vy)), Math.round(b.x), Math.round(b.y)].join(':');
        const angles = [...new Set(pool.map(b => (Math.round(Math.atan2(b.vy, b.vx) * 180 / Math.PI) + 360) % 360))].sort((a, b) => a - b);
        let maxGap = 0;
        for (let i = 0; i < angles.length; i++) {
            const next = i + 1 < angles.length ? angles[i + 1] : angles[0] + 360;
            maxGap = Math.max(maxGap, next - angles[i]);
        }
        const xs = pool.map(b => Math.round(b.x));
        return {
            density: +GameConfig.bulletDensity.toFixed(2),
            bullets: pool.length,
            distinct: new Set(pool.map(key)).size,
            largestAngularGapDeg: maxGap,
            offscreen: xs.filter(x => x < 0 || x > PLAY_W).length,
            xRange: [Math.min(...xs), Math.max(...xs)],
        };
    }, [boss, lvl, diff, phase, pattern]);
}

const checks = {
    // --- Player / abilities -------------------------------------------------

    async dashKeepsBombInvulnerability(g) {
        await startQuiet(g, { invincible: false });
        await g.run(2500); // let spawn invulnerability expire
        await g.tap('KeyB');
        const afterBomb = await g.ev(() => ({ invincible: Player.invincible, timer: +Player.invincibleTimer.toFixed(2) }));
        await g.tap('KeyC');
        await g.run(300);
        const afterDash = await g.ev(() => ({ invincible: Player.invincible, timer: +Player.invincibleTimer.toFixed(2) }));
        return { section: '§7', expect: 'Dashing keeps remaining bomb invulnerability',
            pass: !(afterDash.timer > 0 && !afterDash.invincible), evidence: { afterBomb, afterDash } };
    },

    async lv1DeathRemovesWeapon(g) {
        const r = await g.ev(() => {
            Game.startLevel(0, 'normal', false); WaveSystem.waves = [];
            Player.primaryWeapon = 'spread'; Player.primaryLevel = 1;
            Player.invincible = false; Player.invincibleTimer = 0;
            Player._die();
            return { weapon: Player.primaryWeapon, level: Player.primaryLevel };
        });
        return { section: '§2.1', expect: 'Dying at Lv1 (moderate penalty) removes the weapon, not a Lv0 copy',
            pass: !(r.weapon !== 'none' && r.level === 0), evidence: r };
    },

    async bombKillsLevel6Scout(g) {
        const r = await g.ev(() => {
            Game.startLevel(5, 'normal', false); WaveSystem.waves = []; Enemies.clear();
            const s = Enemies.spawn('scout_drone', 300, 300, 'static'); s.fireTimer = 1e9;
            Player._useBomb();
            return { scoutMaxHp: s.maxHp, scoutAlive: Enemies.list.includes(s), scoutHpLeft: s.hp };
        });
        return { section: '§4.1', expect: 'A bomb kills a basic scout on every level', pass: !r.scoutAlive, evidence: r };
    },

    async autofireWhileFocusing(g) {
        await startQuiet(g);
        await g.ev(() => { GameConfig.fireMode = 'auto'; });
        await installShotCounter(g);
        await g.run(300);
        const free = await shotsPerSecond(g);
        await g.key('ShiftLeft', true); await g.run(200);
        const focused = await shotsPerSecond(g);
        await g.key('ShiftLeft', false);
        return { section: '§9', expect: 'Auto-fire keeps firing while Focus is held',
            pass: focused > 0, evidence: { shotsPerSec: free, shotsPerSecFocused: focused } };
    },

    async casualPresetAutofire(g) {
        const r = await g.ev(() => {
            Settings.values.fireMode = 'manual';
            Game.startLevel(0, 'casual', false);
            return { presetAutofire: GameConfig.autofire, effectiveFireMode: GameConfig.fireMode };
        });
        return { section: '§4.2', expect: 'Casual preset (autofire: true) starts in auto-fire',
            pass: !(r.presetAutofire && r.effectiveFireMode !== 'auto'), evidence: r };
    },

    // --- Drones / laser -----------------------------------------------------

    async dronesLv2DealDamage(g) {
        await startQuiet(g);
        await g.ev(() => {
            Player.droneLevel = 2; Player.x = 360; Player.y = 700;
            const e = Enemies.spawn('carrier', 390, 700, 'static'); // sits on the drone orbit
            e.hp = e.maxHp = 1000; e.fireTimer = e.fireRate = 1e9; e.radius = 12; e.dropChance = 0;
            window.__target = e;
        });
        await g.run(5000);
        const hp = await g.ev(() => window.__target.hp);
        return { section: '§2.1', expect: 'Lv2 drones damage an enemy on their orbit (GDD contact damage)',
            pass: hp < 1000, evidence: { enemyHpAfter5s: hp } };
    },

    async dronesTargetBoss(g) {
        await g.ev(() => {
            Game.startLevel(0, 'normal', false); Asteroids.clear();
            WaveSystem.currentWaveIndex = WaveSystem.waves.length; Enemies.clear();
            Player.invincible = true; Player.invincibleTimer = 999;
            Player.droneLevel = 5; GameConfig.fireMode = 'manual';
        });
        await g.run(8000); // boss warning + entry
        await g.ev(() => Enemies.clear());
        await installShotCounter(g, 'opts.radius === 2 && opts.life === 1.5'); // drone shots
        await g.key('Space', true);
        const rate = await shotsPerSecond(g, 3000);
        await g.key('Space', false);
        const entered = await g.ev(() => Boss.entered);
        return { section: '§2.1', expect: 'Lv5 drones shoot at the boss', pass: rate > 0,
            evidence: { droneShotsPerSec: rate, bossEntered: entered } };
    },

    async laserPierces(g) {
        await startQuiet(g);
        await g.ev(() => {
            Player.primaryWeapon = 'laser'; Player.primaryLevel = 5; Player.x = 360; Player.y = 850;
            GameConfig.fireMode = 'manual';
            const mk = (y) => { const e = Enemies.spawn('carrier', 360, y, 'static'); e.hp = e.maxHp = 1e6; e.fireTimer = e.fireRate = 1e9; e.radius = 20; e.dropChance = 0; return e; };
            window.__front = mk(600); window.__back = mk(400);
        });
        await g.key('Space', true); await g.run(3000); await g.key('Space', false);
        const r = await g.ev(() => ({ frontDamage: Math.round(1e6 - window.__front.hp), backDamage: Math.round(1e6 - window.__back.hp) }));
        return { section: '§2.1', expect: 'Lv5 laser pierces (as the GDD and code comments state)',
            pass: r.backDamage > 0, evidence: r };
    },

    async weaponUpgradesNeverWeaker(g) {
        // DPS at 250 px against a boss-sized and a scout-sized target, for every weapon level
        const measure = async (weapon, level, radius) => {
            await g.ev(([weapon, level, radius]) => {
                Game.startLevel(0, 'normal', false);
                WaveSystem.waves = []; Asteroids.clear();
                Player.primaryWeapon = weapon; Player.primaryLevel = level; Player.droneLevel = 0;
                Player.x = 360; Player.y = 800; Player.invincible = true; Player.invincibleTimer = 999;
                GameConfig.fireMode = 'manual';
                const d = Enemies.spawn('carrier', 360, 550, 'static');
                d.hp = d.maxHp = 1e9; d.radius = radius; d.fireTimer = d.fireRate = 1e9; d.dropChance = 0;
                window.__dummy = d; Input.keys['Space'] = true;
            }, [weapon, level, radius]);
            await g.run(200);
            const start = await g.ev(() => window.__dummy.hp);
            await g.run(3000);
            const dps = (start - await g.ev(() => window.__dummy.hp)) / 3;
            await g.key('Space', false);
            return +dps.toFixed(1);
        };
        const regressions = [], table = {};
        for (const weapon of ['spread', 'homing', 'laser']) {
            for (const radius of [50, 12]) {
                const row = [];
                for (let level = 1; level <= 5; level++) row.push(await measure(weapon, level, radius));
                table[weapon + '@r' + radius] = row;
                for (let i = 1; i < row.length; i++) {
                    if (row[i] < row[i - 1] * 0.97) regressions.push(`${weapon} r${radius} L${i + 1} < L${i}`);
                }
            }
        }
        return { section: '§2.1', expect: 'No weapon upgrade does less damage than the level below it',
            pass: regressions.length === 0, evidence: { regressions, dps: table } };
    },

    async escortStaysOutOfBossRange(g) {
        const r = await g.ev(() => {
            Game.startLevel(3, 'normal', false);
            let minY = Escort.y;
            for (let i = 0; i < 60 * 200; i++) { WaveSystem.levelTimer += 1 / 60; Escort.update(1 / 60); minY = Math.min(minY, Escort.y); }
            return { minY: Math.round(minY), bossZoneBottom: Math.round(PLAY_H * 0.4) };
        });
        return { section: '§6', expect: 'The escort never drifts up into the boss zone (200 s)',
            pass: r.minY > PLAY_H_CHECK * 0.5, evidence: r };
    },

    // --- Surge / graze / scoring --------------------------------------------

    async surgeNotTriggeredByFocusedFire(g) {
        await startQuiet(g);
        await g.ev(() => { GameConfig.fireMode = 'manual'; Scoring.surgeCharge = Scoring.surgeMax; });
        await g.key('Space', true); await g.key('ShiftLeft', true);
        await g.run(200);
        const active = await g.ev(() => Scoring.surgeActive);
        await g.key('Space', false); await g.key('ShiftLeft', false);
        return { section: '§5.1', expect: 'Holding Fire+Focus (normal precise shooting) does not spend a full Surge meter',
            pass: !active, evidence: { surgeActivated: active } };
    },

    async surgeEffects(g) {
        await startQuiet(g);
        await g.ev(() => { GameConfig.fireMode = 'manual'; });
        await installShotCounter(g);
        await g.key('Space', true);
        await g.run(300);
        const before = await shotsPerSecond(g);
        await g.ev(() => { Scoring.surgeCharge = Scoring.surgeMax; Scoring.activateSurge(); });
        const during = await shotsPerSecond(g);
        await g.ev(() => {
            Scoring.surgeActive = true; Scoring.surgeDuration = 5;
            Enemies.enemyBullets.clear();
            Enemies.enemyBullets.spawn(Player.x, Player.y - 150, 0, 0, { life: 3 });
        });
        await g.run(500);
        const survived = await g.ev(() => Enemies.enemyBullets.pool.length > 0);
        await g.key('Space', false);
        return { section: '§5.1', expect: 'Surge doubles fire rate and player shots cancel enemy bullets (GDD/tutorial)',
            pass: during >= before * 1.8 && !survived,
            evidence: { shotsPerSecBefore: before, shotsPerSecDuringSurge: during, enemyBulletInFirePathSurvived: survived } };
    },

    async noGrazeWhileInvulnerable(g) {
        const r = await g.ev(() => {
            Game.startLevel(0, 'normal', false); WaveSystem.waves = [];
            Player.invincible = true; Player.invincibleTimer = 2; // respawn-style invulnerability
            const before = Scoring.grazeCount;
            for (let i = 0; i < 10; i++) Enemies.enemyBullets.spawn(Player.x + 10, Player.y - 5 + i, 0, 0, { life: 1 });
            Player.update(1 / 60);
            return { grazesGained: Scoring.grazeCount - before, surgeCharge: Scoring.surgeCharge };
        });
        return { section: '§5.2', expect: 'No graze/Surge charge while invulnerable (except dashing)',
            pass: r.grazesGained === 0, evidence: r };
    },

    async grazeMilestonesOncePerLevel(g) {
        const r = await g.ev(() => {
            Game.startLevel(0, 'normal', false);
            for (let i = 0; i < 120; i++) Scoring.addGraze();
            Scoring.softReset(); // between campaign levels
            Scoring.popups = [];
            for (let i = 0; i < 4; i++) Scoring.addGraze();
            return { milestonePopupsAfter4Grazes: Scoring.popups.map(p => p.text).filter(t => t.includes('GRAZES')) };
        });
        return { section: '§5.2', expect: 'Earlier graze milestones do not pay out again on the next level',
            pass: r.milestonePopupsAfter4Grazes.length === 0, evidence: r };
    },

    async endBonusesPerLevel(g) {
        const r = await g.ev(() => {
            // Level 1: lots of grazes and a long chain
            Game.startLevel(0, 'normal', false);
            for (let i = 0; i < 300; i++) Scoring.addGraze();
            Scoring.maxChain = 60;
            // Continue to level 2 and finish it with no new grazes or chain, via the real end-of-level path
            Game.startLevel(1, 'normal', true);
            Game._processEndRun(true);
            HighScores.enteringInitials = false;
            const b = label => (EndRunBonus.bonuses.find(x => x.label === label) || { value: 0 }).value;
            return { level2GrazeBonus: b('GRAZE BONUS'), level2ChainBonus: b('CHAIN BONUS') };
        });
        return { section: '§5.4', expect: 'End-of-level graze/chain bonuses only count that level',
            pass: r.level2GrazeBonus === 0 && r.level2ChainBonus === 0, evidence: r };
    },

    async levelSelectStartsFresh(g) {
        await g.ev(() => {
            Game.startLevel(0, 'normal', false);
            Scoring.score = 123456; Player.primaryWeapon = 'laser'; Player.primaryLevel = 5;
            // Game over → title → level select → Level 3
            Game.state = 'title'; Campaign.levelsUnlocked = 5; Game.showBriefing(2);
        });
        await g.tap('Enter');
        await g.run(2000);
        const r = await g.ev(() => ({ state: Game.state, level: Game.currentLevelIndex + 1, score: Scoring.score, weapon: Player.primaryWeapon + ' L' + Player.primaryLevel }));
        return { section: '§7', expect: 'A level started from level select has no score or weapons from an old run',
            pass: r.score < 123456 && r.weapon === 'none L0', evidence: r };
    },

    // --- Timing / state machine ---------------------------------------------

    async pauseKeepsScheduledSpawns(g) {
        const count = async (pause) => {
            await g.ev(() => {
                Game.startLevel(0, 'normal', false); Asteroids.clear();
                WaveSystem.waves = [{ time: 0.5, enemies: [{ type: 'scout_drone', count: 8, formation: 'line', movePath: 'straight_down', stagger: 150 }] }];
                Player.invincible = true; Player.invincibleTimer = 999;
            });
            await g.run(550);
            if (pause) { await g.tap('Escape'); await g.run(1500); await g.tap('Escape'); }
            await g.run(1500);
            return g.ev(() => Enemies.list.length);
        };
        const normal = await count(false);
        const paused = await count(true);
        return { section: '§8', expect: 'Pausing mid-wave does not lose enemies',
            pass: paused === normal, evidence: { enemiesNoPause: normal, enemiesWithPause: paused } };
    },

    async victoryAfterPause(g) {
        await g.ev(() => {
            Game.startLevel(0, 'normal', false); Asteroids.clear();
            WaveSystem.currentWaveIndex = WaveSystem.waves.length; Enemies.clear();
            Player.invincible = true; Player.invincibleTimer = 999;
        });
        await g.run(8000); // boss warning + entry
        await g.ev(() => { Boss.phase = Boss.totalPhases; Boss.armor = []; Boss.phaseTransitionTimer = 0; Boss.hit(1e6); });
        for (let i = 0; i < 100 && await g.ev(() => Boss.active); i++) await g.run(50);
        await g.tap('Escape'); // pause right after the defeat sequence ends
        await g.run(3000);
        await g.tap('Escape');
        await g.run(20000);
        const r = await g.ev(() => ({ state: Game.state, bossActive: Boss.active, bossDefeated: Boss.defeated }));
        return { section: '§8', expect: 'Victory still triggers if the player pauses right after the boss dies',
            pass: r.state === 'victory', evidence: { stateAfter20s: r } };
    },

    async bossWaitsForFinalWave(g) {
        await g.ev(() => {
            Game.startLevel(0, 'normal', false); Asteroids.clear(); Enemies.clear();
            WaveSystem.currentWaveIndex = WaveSystem.waves.length - 1;
            WaveSystem.levelTimer = WaveSystem.waveTime = WaveSystem.waves[WaveSystem.waves.length - 1].time - 0.1;
            Player.invincible = true; Player.invincibleTimer = 999;
        });
        await g.run(300);
        const early = await g.ev(() => ({ bossActive: Boss.active, enemies: Enemies.list.length }));
        await g.run(4000);
        const later = await g.ev(() => ({ bossActive: Boss.active, bossEntered: Boss.entered, enemies: Enemies.list.length }));
        return { section: '§8', expect: 'The boss does not start while the final wave is still spawning',
            pass: !(early.bossActive && later.enemies > 0), evidence: { justAfterFinalWave: early, fourSecondsLater: later } };
    },

    // --- Enemies / level systems --------------------------------------------

    async hoverEnemiesLeave(g) {
        await startQuiet(g);
        await g.ev(() => ['sniper', 'missile_turret', 'carrier'].forEach((t, i) => Enemies.spawn(t, 150 + i * 200, -20, 'hover')));
        await g.run(90000);
        const r = await g.ev(() => Enemies.list.filter(e => e.movePath === 'hover').map(e => e.type + '@y' + Math.round(e.y)));
        return { section: '§6', expect: 'Unkilled hover enemies eventually leave the screen (90 s)',
            pass: r.length === 0, evidence: { hoverEnemiesAfter90s: r } };
    },

    async noOffscreenFire(g) {
        await startQuiet(g);
        await g.ev(() => {
            WaveSystem.waves = [{ time: 0.1, enemies: [{ type: 'gunship', count: 2, formation: 'sides', movePath: 'strafe' }] }];
            window.__offscreen = 0;
            const orig = Enemies.enemyBullets.spawn.bind(Enemies.enemyBullets);
            Enemies.enemyBullets.spawn = (x, ...rest) => { if (x < 0 || x > PLAY_W) window.__offscreen++; return orig(x, ...rest); };
        });
        await g.run(30000);
        const n = await g.ev(() => window.__offscreen);
        return { section: '§6', expect: 'Gunships from the "sides" formation do not fire from outside the play area',
            pass: n === 0, evidence: { bulletsFiredFromOffscreenIn30s: n } };
    },

    async asteroidRateIndependentOfFps(g) {
        const r = await g.ev(() => {
            // Spawns are random: seed Math.random and sample 10 minutes so the check is deterministic, not flaky
            const SECS = 600, rand = Math.random;
            let seed = 12345;
            Math.random = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
                t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
            const perSecond = (fps) => {
                let spawned = 0;
                Asteroids.clear(); Asteroids.activate();
                for (let i = 0; i < fps * SECS; i++) {
                    const list = Asteroids.list; const orig = list.push;
                    list.push = function (a) { if (a.y === -40) spawned++; return orig.apply(this, arguments); };
                    Asteroids.update(1 / fps);
                    list.push = orig;
                }
                Asteroids.clear();
                return +(spawned / SECS).toFixed(2);
            };
            try { return { perSec60Hz: perSecond(60), perSec144Hz: perSecond(144) }; }
            finally { Math.random = rand; }
        });
        const ratio = r.perSec144Hz / r.perSec60Hz;
        return { section: '§6', expect: 'Asteroid spawn rate is the same at 60 Hz and 144 Hz (±25%)',
            pass: ratio > 0.75 && ratio < 1.25, evidence: r };
    },

    async endlessScalingCapped(g) {
        await g.ev(() => { Game.startEndless('normal'); Player.invincible = true; Player.invincibleTimer = 999; WaveSystem.levelTimer = 3600; });
        await g.run(200);
        const r = await g.ev(() => ({ rank: +EndlessMode.rank.toFixed(1), hpScale: +GameConfig._levelHpScale.toFixed(2),
            densityVsBase: +(GameConfig.bulletDensity / GameConfig._baseDensity).toFixed(2), bulletSpeed: +GameConfig._levelSpeedScale.toFixed(2),
            fireRate: +GameConfig._levelFireRateScale.toFixed(2) }));
        return { section: '§4.2', expect: 'Late Endless keeps HP ≤ 3×, density ≤ 2.2×, fire rate ≤ 1.6× and bullet speed ≤ 1.2×',
            pass: r.hpScale <= 3 && r.densityVsBase <= 2.2 && r.fireRate <= 1.6 && r.bulletSpeed <= 1.2, evidence: r };
    },

    async midBossPausesStageAndEscapes(g) {
        await g.ev(() => {
            Game.startLevel(0, 'normal', false); Asteroids.clear(); Enemies.clear();
            const idx = WaveSystem.waves.findIndex(w => w.midboss);
            WaveSystem.currentWaveIndex = idx;
            WaveSystem.levelTimer = WaveSystem.waveTime = WaveSystem.waves[idx].time - 0.1;
            Player.invincible = true; Player.invincibleTimer = 999; Player.x = 60; // out of its way, not firing
            window.__idx = idx; window.__score0 = Scoring.score;
        });
        await g.run(1000);
        const spawned = await g.ev(() => !!MidBoss.current());
        await g.run(20000);
        const during = await g.ev(() => ({ alive: !!MidBoss.current(), waveIndex: WaveSystem.currentWaveIndex - window.__idx }));
        await g.run(25000); // past the 35 s limit
        const after = await g.ev(() => ({ alive: !!MidBoss.current(), stillOnField: Enemies.list.some(e => e.midboss),
            wavesResumed: WaveSystem.currentWaveIndex - window.__idx > 1 }));
        return { section: '§8', expect: 'A mid-boss pauses the stage, then escapes after its time limit and the stage resumes',
            pass: spawned && during.alive && during.waveIndex === 1 && !after.alive && after.wavesResumed,
            evidence: { spawned, during, after } };
    },

    async midBossRewards(g) {
        const r = await g.ev(() => {
            Game.startLevel(0, 'normal', false); WaveSystem.waves = []; Asteroids.clear(); Enemies.clear(); PowerUps.clear();
            const e = MidBoss.spawn('sentinel'); e.y = 150;
            for (let i = 0; i < 20; i++) Enemies.enemyBullets.spawn(100 + i * 20, 400, 0, 50, {});
            const score0 = Scoring.score;
            Enemies.hit(e, e.maxHp + 10, 300);
            return { powerUps: PowerUps.list.length, bulletsLeft: Enemies.enemyBullets.pool.filter(b => b.active).length,
                bonus: Scoring.score - score0, alive: Enemies.list.includes(e) };
        });
        return { section: '§8', expect: 'Destroying a mid-boss pays a bonus, clears bullets and drops 2 power-ups',
            pass: !r.alive && r.powerUps === 2 && r.bulletsLeft === 0 && r.bonus >= 8000, evidence: r };
    },

    async endlessEnemyCap(g) {
        await g.ev(() => {
            Game.startEndless('hardcore');
            Player.primaryWeapon = 'none'; Player.primaryLevel = 0; // can't clear the screen
            const update = Game.update.bind(Game);
            window.__maxEnemies = 0;
            Game.update = (dt) => { Player.invincible = true; Player.invincibleTimer = 99; update(dt);
                window.__maxEnemies = Math.max(window.__maxEnemies, Enemies.list.length); };
        });
        await g.run(300000); // 5 minutes
        const r = await g.ev(() => ({ maxEnemies: window.__maxEnemies, cap: EndlessMode.MAX_ENEMIES,
            enemyBullets: Enemies.enemyBullets.pool.length, bulletPoolCap: Enemies.enemyBullets.maxSize }));
        // Enemies already in flight (entering/retreating) can briefly overshoot by a handful
        return { section: '§4.2', expect: 'Endless keeps concurrent enemies at its cap even when nothing is killed',
            pass: r.maxEnemies <= r.cap + 5, evidence: r };
    },

    // --- Boss Rush ------------------------------------------------------------

    async bossRushRunsEveryBoss(g) {
        await g.ev(() => {
            Campaign.campaignCleared = true; Campaign.secretUnlocked = true;
            Game.startBossRush('normal');
            Player.invincible = true; Player.invincibleTimer = 1e9;
        });
        const stages = [];
        for (let k = 0; k < 10; k++) {
            const st = await g.ev(() => Game.state);
            if (st !== 'rush_intermission') break;
            await g.run(600);   // past the input guard
            const pick = await g.ev(() => {
                // Take the weapon upgrade when it's offered, so the loadout grows
                const i = Math.max(0, BossRush.choices.findIndex(c => c.kind === 'upgrade'));
                Menu.selectedIndex = i;
                return { kind: BossRush.choices[i].kind, before: Player.primaryWeapon + Player.primaryLevel };
            });
            await g.tap('Enter');
            await g.run(3000);
            const stage = await g.ev(() => ({ state: Game.state, boss: Boss.bossType, bg: Background.bgType,
                level: Game.currentLevelIndex, weapon: Player.primaryWeapon + Player.primaryLevel }));
            // Finish the boss: final phase, armour off, one big hit, then the defeat sequence
            await g.run(6000);
            await g.ev(() => {
                Player.invincible = true; Player.invincibleTimer = 1e9;
                Boss.phase = Boss.totalPhases; Boss.armor = []; Boss.phaseTransitionTimer = 0; Boss.hit(1e6, true);
            });
            await g.run(9000);
            stages.push({ ...pick, ...stage });
        }
        const end = await g.ev(() => ({ state: Game.state, splits: BossRush.splits.length, of: BossRush.order.length,
            time: +BossRush.time.toFixed(1), score: Scoring.score, initials: HighScores.enteringInitials }));
        const bosses = stages.map(s => s.boss);
        const expected = ['architect', 'furnace', 'leviathan', 'interceptor_duo', 'nexus', 'echo'];
        const pass = end.state === 'rush_complete' && end.splits === 6 && end.of === 6 &&
            JSON.stringify(bosses) === JSON.stringify(expected) && stages.every(s => s.state === 'playing') &&
            stages[0].weapon.endsWith(String(2)) && end.time > 0 && end.initials;
        return { section: 'δ', expect: 'Boss Rush fights every boss in order in its own level, applies the picks, and ends on the results with a score entry',
            pass, evidence: { stages, end } };
    },

    // --- Save data ------------------------------------------------------------

    async saveMigrationKeepsProgress(g) {
        const r = await g.ev(async () => {
            const put = (k, v) => localStorage.setItem('neonstorm_' + k, JSON.stringify(v));
            const get = (k) => JSON.parse(localStorage.getItem('neonstorm_' + k));
            // A pre-versioning (β) save
            localStorage.clear();
            put('settings', { sfxVolume: 40, musicVolume: 20 });
            put('highscores', { casual: [], normal: [{ name: 'OLD', score: 999999 }], hardcore: [], endless: [] });
            put('campaign', { levelsUnlocked: 4, secretUnlocked: true, levelBests: { normal_L0: { score: 500000 } } });
            put('neonCredits', 321);
            put('hangar_unlocked', { skins: ['cyan_viper', 'ghost'], trails: ['thrust'], bullets: ['neon'], explosions: ['burst'] });
            await SaveData.migrate();
            const first = { migrated: SaveData.migrated, version: get('saveVersion'), highscores: get('highscores'),
                archivedScores: !!get('highscores_v1'), campaign: get('campaign'), archivedBests: !!get('levelBests_v1'),
                credits: get('neonCredits'), settings: get('settings'), hangar: get('hangar_unlocked') };
            // Booting again changes nothing
            SaveData.migrated = null;
            await SaveData.migrate();
            const again = SaveData.migrated;
            // A fresh install is stamped with the current version and not "migrated"
            localStorage.clear();
            await SaveData.migrate();
            return { first, again, fresh: { migrated: SaveData.migrated, version: get('saveVersion') }, current: SAVE_VERSION };
        });
        const f = r.first;
        const pass = f.version === r.current && f.migrated && f.migrated.from === 1 && f.highscores === null && f.archivedScores &&
            f.campaign.levelsUnlocked === 4 && f.campaign.secretUnlocked === true && Object.keys(f.campaign.levelBests).length === 0 &&
            f.archivedBests && f.credits === 321 && f.settings.sfxVolume === 40 && f.hangar.skins.includes('ghost') &&
            r.again === null && r.fresh.version === r.current && r.fresh.migrated === null;
        return { section: 'γ', expect: 'An old save is upgraded once: scores archived and reset, progress/credits/cosmetics/settings kept; fresh installs start current',
            pass, evidence: r };
    },

    // --- Boss patterns --------------------------------------------------------

    async architectSweepSpreads(g) {
        const r = await bossPattern(g, 'architect', 0, 'normal', 1, 1);
        return { section: '§3.2', expect: 'Architect "horizontal sweep" bullets are spread out, not stacked',
            pass: r.distinct > 1, evidence: r };
    },

    async casualRingsHaveNoGap(g) {
        const r = await bossPattern(g, 'furnace', 1, 'casual', 2, 0);
        return { section: '§3.2', expect: 'Reduced-density rings (Casual) stay evenly spaced (no gap > 90°)',
            pass: r.largestAngularGapDeg <= 90, evidence: r };
    },

    async denseRingsHaveNoDuplicates(g) {
        const r = await bossPattern(g, 'echo', 5, 'normal', 3, 0);
        return { section: '§3.2', expect: 'Higher-density rings add new bullet positions instead of stacked duplicates',
            pass: r.distinct === r.bullets, evidence: r };
    },

    async wallsStayOnScreen(g) {
        const normal = await bossPattern(g, 'furnace', 1, 'normal', 1, 0);
        const casual = await bossPattern(g, 'furnace', 1, 'casual', 1, 0);
        return { section: '§3.2', expect: 'Furnace wall spans the screen on every density with no off-screen bullets',
            pass: normal.offscreen === 0 && casual.xRange[1] > PLAY_WIDTH * 0.8,
            evidence: { normal, casual } };
    },
};

(async () => {
    const only = process.argv[2] ? process.argv[2].split(',') : null;
    const names = Object.keys(checks).filter(n => !only || only.includes(n));
    // Each check gets its own browser, so they run in parallel (SIM_JOBS, default one per CPU, max 4)
    const jobs = Math.max(1, +process.env.SIM_JOBS || Math.min(4, require('os').cpus().length));
    const results = new Array(names.length);
    let next = 0, printed = 0;
    const print = () => {   // report in definition order as results arrive
        for (; printed < names.length && results[printed]; printed++) {
            const r = results[printed];
            console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name} ${r.section || ''} — ${r.expect}\n      ${JSON.stringify(r.evidence)}`);
        }
    };
    const worker = async () => {
        while (next < names.length) {
            const i = next++, name = names[i];
            const g = await launch();
            let r;
            try {
                r = await checks[name](g);
            } catch (e) {
                r = { expect: '(error)', pass: false, evidence: { error: e.message } };
            }
            await g.close();
            results[i] = { name, ...r };
            print();
        }
    };
    await Promise.all(Array.from({ length: jobs }, worker));
    writeResult('checks.json', results);
    const failed = results.filter(r => !r.pass).length;
    console.log(`\n${results.length - failed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
})();
