// ============================================================
//  NEON STORM — Full-level play-through with a dodging bot
// ============================================================
// Plays one whole level through the real input path. Each frame the bot tries
// 17 moves (8 directions × full/focus speed, plus standing still) against enemy
// bullets, bodies and asteroids projected 0.3 s ahead, and steers towards the
// lowest enemy (or the boss) while holding fire.
//
// Hits are COUNTED instead of killing the player (1 s grace after each), and
// power-up drops are disabled, so every level is played start to finish with
// the same fixed loadout. The bot sees exact bullet velocities, so hit counts
// are not a measure of human difficulty; use them to spot stalls, undodgeable
// patterns and escort/level failures, and maxBulletsOnScreen for density.
//
// Usage: node tools/sim/playthrough.js <levelIndex> [difficulty] [weapon] [weaponLevel]
// Results: tools/sim/out/playthrough-L<n>-<difficulty>.json

const { launch, writeResult } = require('./harness');

const [lvl, diff, weapon, weaponLevel] = [
    +(process.argv[2] || 0), process.argv[3] || 'normal', process.argv[4] || 'spread', +(process.argv[5] || 3),
];
const MAX_MS = 360000;

(async () => {
    const g = await launch();
    await g.ev(([lvl, diff, weapon, weaponLevel]) => {
        Settings.values.fireMode = 'manual';
        Game.startLevel(lvl, diff, false);
        Player.primaryWeapon = weapon; Player.primaryLevel = weaponLevel; Player.droneLevel = 0;
        PowerUps.spawn = () => {}; // fixed loadout, so levels are comparable

        const S = window.__stats = {
            hitsWaves: 0, hitsBoss: 0, maxBullets: 0,
            lastWaveAt: null, bossStartAt: null, bossDefeatedAt: null, firstHits: [],
        };
        Player._die = function () {
            if (this.invincible) return;
            Boss.active ? S.hitsBoss++ : S.hitsWaves++;
            if (S.firstHits.length < 5) S.firstHits.push({ t: +WaveSystem.levelTimer.toFixed(1), x: Math.round(this.x), y: Math.round(this.y) });
            this.invincible = true; this.invincibleTimer = 1.0;
        };

        const K = Input.keys;
        const DIRS = [[0, 0]];
        for (let a = 0; a < 8; a++) DIRS.push([Math.cos(a * Math.PI / 4), Math.sin(a * Math.PI / 4)]);
        const HORIZON = 0.3, STEPS = 6;

        function danger(px, py, threats) {
            let d = 0;
            for (const b of threats) {
                for (let k = 1; k <= STEPS; k++) {
                    const t = HORIZON * k / STEPS;
                    const dx = b.x + b.vx * t - px[k], dy = b.y + b.vy * t - py[k];
                    const r = Player.hitboxRadius + b.radius + 3;
                    const dd = dx * dx + dy * dy;
                    if (dd < r * r) d += 1000 / k;
                    else if (dd < 900) d += 90 / (dd + 1) / k;
                }
            }
            return d;
        }

        function botStep() {
            const near = o => Math.abs(o.x - Player.x) < 200 && Math.abs(o.y - Player.y) < 260;
            const threats = Enemies.enemyBullets.pool.filter(near);
            for (const e of Enemies.list) if (near(e)) threats.push({ x: e.x, y: e.y, vx: 0, vy: e.speed || 0, radius: e.radius });
            for (const a of Asteroids.list) if (near(a)) threats.push(a);
            if (Boss.active && Boss.entered) threats.push({ x: Boss.x, y: Boss.y, vx: 0, vy: 0, radius: Boss.radius });

            let tx = PLAY_W / 2;
            const ty = PLAY_H - 150;
            if (Boss.active && Boss.entered) tx = Boss.x;
            else {
                let lowest = null;
                for (const e of Enemies.list) if (e.y > 0 && (!lowest || e.y > lowest.y)) lowest = e;
                if (lowest) tx = lowest.x;
            }

            let best = Infinity, choice = [0, 0, false];
            for (const focus of [false, true]) {
                if (focus && !GameConfig.focus.enabled) continue;
                const spd = Player.speed * (focus ? GameConfig.focus.speedMultiplier : 1);
                for (const [dx, dy] of DIRS) {
                    const px = [], py = [];
                    for (let k = 0; k <= STEPS; k++) {
                        const t = HORIZON * k / STEPS;
                        px.push(Math.max(14, Math.min(PLAY_W - 14, Player.x + dx * spd * t)));
                        py.push(Math.max(14, Math.min(PLAY_H - 14, Player.y + dy * spd * t)));
                    }
                    let c = danger(px, py, threats);
                    c += Math.abs(px[STEPS] - tx) * 0.01 + Math.abs(py[STEPS] - ty) * 0.01;
                    if (px[STEPS] < 40 || px[STEPS] > PLAY_W - 40) c += 2;
                    if (c < best) { best = c; choice = [dx, dy, focus]; }
                }
            }
            K.ArrowLeft = choice[0] < -0.3; K.ArrowRight = choice[0] > 0.3;
            K.ArrowUp = choice[1] < -0.3; K.ArrowDown = choice[1] > 0.3;
            K.ShiftLeft = choice[2]; K.Space = true;
        }

        const update = Game.update.bind(Game);
        Game.update = (dt) => {
            if (Game.state === 'playing') botStep();
            update(dt);
            S.maxBullets = Math.max(S.maxBullets, Enemies.enemyBullets.pool.length);
            if (S.lastWaveAt === null && WaveSystem.currentWaveIndex >= WaveSystem.waves.length) S.lastWaveAt = WaveSystem.levelTimer;
            if (S.bossStartAt === null && Boss.active && Boss.entered) S.bossStartAt = WaveSystem.levelTimer;
            if (S.bossDefeatedAt === null && Boss.defeated) S.bossDefeatedAt = WaveSystem.levelTimer;
        };
    }, [lvl, diff, weapon, weaponLevel]);

    for (let t = 0; t < MAX_MS; t += 10000) {
        await g.run(10000);
        if (await g.ev(() => window.__stats.bossDefeatedAt !== null || Game.state !== 'playing')) break;
    }

    const r = await g.ev(() => {
        const S = window.__stats;
        let outcome = 'boss defeated';
        if (S.bossDefeatedAt === null) {
            if (Game.state === 'game_over') outcome = Escort.alive === false ? 'game over: escort destroyed' : 'game over';
            else if (S.bossStartAt === null) outcome = 'stalled: boss never arrived';
            else outcome = 'boss not defeated in time';
        }
        return {
            level: Game.currentLevelIndex + 1,
            difficulty: GameConfig.difficulty,
            loadout: Player.primaryWeapon + ' L' + Player.primaryLevel,
            outcome,
            hitsDuringWaves: S.hitsWaves,
            hitsDuringBoss: S.hitsBoss,
            secondsUntilLastWave: S.lastWaveAt !== null ? +S.lastWaveAt.toFixed(1) : null,
            bossDelayAfterLastWave: S.bossStartAt !== null && S.lastWaveAt !== null ? +(S.bossStartAt - S.lastWaveAt).toFixed(1) : null,
            bossFightSeconds: S.bossDefeatedAt !== null ? +(S.bossDefeatedAt - S.bossStartAt).toFixed(1) : null,
            maxBulletsOnScreen: S.maxBullets,
            score: Scoring.score,
            firstHits: S.firstHits,
            enemiesLeftOnField: Enemies.list.map(e => e.type + '@' + Math.round(e.x) + ',' + Math.round(e.y)),
        };
    });
    await g.close();
    console.log(JSON.stringify(r, null, 2));
    writeResult(`playthrough-L${lvl + 1}-${diff}.json`, r);
})();
