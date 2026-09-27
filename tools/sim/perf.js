// ============================================================
//  NEON STORM — Game logic frame-time measurement
// ============================================================
// Times Game.update (logic only; rendering is stubbed in the harness) in a heavy
// late-Endless scene, with and without Neon Surge (whose shot-vs-bullet cancel is
// the most expensive loop). A 60 fps frame budget is 16.7 ms for logic AND drawing.
//
// Usage: node tools/sim/perf.js   Results: tools/sim/out/perf.json

const { launch, writeResult } = require('./harness');

(async () => {
    const g = await launch();
    await g.ev(() => {
        Game.startEndless('hardcore');
        Player.primaryWeapon = 'spread'; Player.primaryLevel = 5; Player.droneLevel = 5;
        Input.keys.Space = true;
        const update = Game.update.bind(Game);
        window.__times = [];
        Game.update = (dt) => {
            Player.invincible = true; Player.invincibleTimer = 99;
            const t0 = performance.now();
            update(dt);
            window.__times.push({ ms: performance.now() - t0, bullets: Enemies.enemyBullets.pool.length, shots: Player.bullets.pool.length, surge: Scoring.surgeActive });
        };
    });
    await g.run(600000); // 10 minutes of Endless to build a heavy scene
    const measure = async (surge) => {
        await g.ev((surge) => {
            window.__times = [];
            if (surge) { Scoring.surgeActive = true; Scoring.surgeDuration = 1e9; } else { Scoring.surgeActive = false; }
        }, surge);
        await g.run(10000);
        return g.ev(() => {
            const t = window.__times.map(x => x.ms).sort((a, b) => a - b);
            const pct = p => +t[Math.min(t.length - 1, Math.floor(t.length * p))].toFixed(2);
            const b = window.__times.map(x => x.bullets);
            return { frames: t.length, medianMs: pct(0.5), p95Ms: pct(0.95), maxMs: pct(1), avgEnemyBullets: Math.round(b.reduce((a, x) => a + x, 0) / b.length), maxEnemyBullets: Math.max(...b), maxPlayerShots: Math.max(...window.__times.map(x => x.shots)) };
        });
    };
    const result = { normal: await measure(false), surge: await measure(true) };
    await g.close();
    console.log(JSON.stringify(result, null, 2));
    writeResult('perf.json', result);
})();
