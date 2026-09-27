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
        Game.update = (dt) => { Player.invincible = true; Player.invincibleTimer = 99; update(dt); };
    });
    await g.run(600000); // 10 minutes of Endless to build a heavy scene

    // The fake clock freezes performance.now() during synchronous code, so time a batch of
    // frames with Node's real clock instead: FRAMES logic updates run back-to-back in the page.
    const FRAMES = 300;
    const measure = async (surge) => {
        const scene = await g.ev((surge) => {
            if (surge) { Scoring.surgeActive = true; Scoring.surgeDuration = 1e9; } else { Scoring.surgeActive = false; }
            return { enemyBullets: Enemies.enemyBullets.pool.length, poolCap: Enemies.enemyBullets.maxSize, enemies: Enemies.list.length };
        }, surge);
        const t0 = process.hrtime.bigint();
        await g.ev((n) => { for (let i = 0; i < n; i++) Game.update(1 / 60); }, FRAMES);
        const ms = Number(process.hrtime.bigint() - t0) / 1e6;
        return { ...scene, avgLogicMsPerFrame: +(ms / FRAMES).toFixed(2) };
    };
    const result = { normal: await measure(false), surge: await measure(true), budgetMs: 16.7 };
    await g.close();
    console.log(JSON.stringify(result, null, 2));
    writeResult('perf.json', result);
})();
