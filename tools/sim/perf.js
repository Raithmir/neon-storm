// ============================================================
//  NEON STORM — Frame-time measurement
// ============================================================
// Logic (default): times Game.update (rendering stubbed in the harness) in a heavy
// late-Endless scene, with and without Neon Surge (whose shot-vs-bullet cancel is
// the most expensive loop). A 60 fps frame budget is 16.7 ms for logic AND drawing.
//
// --render: in the same Endless scene and in a level-6 boss fight, at HIGH (2×) and
// LOW (1×): texture bytes uploaded per frame, and the CPU time of the gameplay draw
// calls and of the HUD. The Renderer Phase 7 measure: run it before and after a change.
// GPU time isn't measured: headless WebGL is software-emulated (SwiftShader) and its
// timings are meaningless, so check frame rate with Settings → SHOW FPS in a browser.
//
// Usage: node tools/sim/perf.js [--render]   Results: tools/sim/out/perf.json / perf-render.json

const { launch, writeResult } = require('./harness');

const RENDER = process.argv.includes('--render');

// The fake clock freezes performance.now() during synchronous code, so time a batch of
// frames with Node's real clock instead: the batch runs back-to-back in the page.
async function timeBatch(g, fn, arg, frames) {
    const t0 = process.hrtime.bigint();
    await g.ev(fn, arg);
    return Number(process.hrtime.bigint() - t0) / 1e6 / frames;
}

async function heavyEndless(g) {
    await g.ev(() => {
        Game.startEndless('hardcore');
        Player.primaryWeapon = 'spread'; Player.primaryLevel = 5; Player.droneLevel = 5;
        Input.keys.Space = true;
        const update = Game.update.bind(Game);
        Game.update = (dt) => { Player.invincible = true; Player.invincibleTimer = 99; update(dt); };
    });
    await g.run(600000); // 10 minutes of Endless to build a heavy scene
}

async function logic() {
    const g = await launch();
    await heavyEndless(g);
    const FRAMES = 300;
    const measure = async (surge) => {
        const scene = await g.ev((surge) => {
            if (surge) { Scoring.surgeActive = true; Scoring.surgeDuration = 1e9; } else { Scoring.surgeActive = false; }
            return { enemyBullets: Enemies.enemyBullets.pool.length, poolCap: Enemies.enemyBullets.maxSize, enemies: Enemies.list.length };
        }, surge);
        const ms = await timeBatch(g, (n) => { for (let i = 0; i < n; i++) Game.update(1 / 60); }, FRAMES, FRAMES);
        return { ...scene, avgLogicMsPerFrame: +ms.toFixed(2) };
    };
    const result = { normal: await measure(false), surge: await measure(true), budgetMs: 16.7 };
    await g.close();
    console.log(JSON.stringify(result, null, 2));
    writeResult('perf.json', result);
}

async function render() {
    // Canvas 2D on the CPU, so its drawing is timed where it happens (no GPU syncs)
    const g = await launch({ draw: true, args: ['--disable-accelerated-2d-canvas'] });
    await g.ev(() => {
        // Count texture upload bytes: the per-frame cost Phase 7 removes
        const gl = Renderer.app && Renderer.app.renderer.gl;
        window.__uploaded = 0;
        if (!gl) return;
        for (const fn of ['texImage2D', 'texSubImage2D']) {
            const orig = gl[fn].bind(gl);
            gl[fn] = (...a) => {
                const src = a[a.length - 1];
                const w = src && src.width !== undefined ? src.width : a[fn === 'texImage2D' ? 3 : 4];
                const h = src && src.height !== undefined ? src.height : a[fn === 'texImage2D' ? 4 : 5];
                if (w && h) window.__uploaded += w * h * 4;
                return orig(...a);
            };
        }
    });
    // Build scenes with drawing off, as the logic tools do
    await g.ev(() => {
        window.__draw = Game.draw; Game.draw = () => {};
        if (Renderer.app && Renderer.app.ticker) Renderer.app.ticker.stop();
    });

    const scenes = {
        endless: () => heavyEndless(g),
        boss: () => g.ev(() => {
            Game.startLevel(5, 'normal', false);
            Player.invincible = true; Player.invincibleTimer = 1e9;
            Player.primaryWeapon = 'laser'; Player.primaryLevel = 5; Player.droneLevel = 5;
            for (let f = 0; f < 60 * 30; f++) {
                Input.keys.Space = true;
                Player.x = 360 + Math.sin(f / 90) * 200;
                if (f === 60 * 20) { Boss.init(ALL_LEVELS[5].bossType); Boss.warningTimer = 0.5; }
                Game.update(1 / 60);
                if (Game.state !== 'playing') Game.state = 'playing';
            }
        }),
    };

    const FRAMES = 30, BATCHES = 5;
    const result = {
        note: 'uploadMB: texture bytes sent to the GPU per frame. drawMs/hudMs: CPU time of the draw calls, median of '
            + BATCHES + ' batches. GPU frame time is not measured: headless WebGL is software (use SHOW FPS in a browser).',
        scenes: {},
    };
    for (const [name, build] of Object.entries(scenes)) {
        await build();
        const counts = await g.ev(() => {
            Game.draw = window.__draw;
            Game.state = 'playing';
            return {
                enemies: Enemies.list.length,
                enemyBullets: Enemies.enemyBullets.pool.length,
                particles: Particles.particles.length,
                boss: Boss.active ? Boss.bossType : null,
            };
        });
        result.scenes[name] = { counts, quality: {} };
        for (const quality of ['high', 'low']) {
            const row = await g.ev((q) => {
                Renderer.setQuality(q); Renderer.applyResolution(2);
                for (let i = 0; i < 5; i++) Game.draw();   // bake any new sprites first
                window.__uploaded = 0;
                for (let i = 0; i < 30; i++) Game.draw();
                return { playScale: Renderer.playScale, uploadMB: +(window.__uploaded / 30 / 1048576).toFixed(2) };
            }, quality);
            for (const part of ['drawMs', 'hudMs']) {
                const runs = [];
                for (let b = 0; b <= BATCHES; b++) {
                    const ms = await timeBatch(g, ([part, n]) => {
                        const R = Renderer, pctx = R.getPlayCtx();
                        const ectx = R.getEntityCtx ? R.getEntityCtx() : pctx;   // GpuCtx since Phase 7
                        for (let i = 0; i < n; i++) {
                            if (part === 'hudMs') { HUD.draw(ctx); continue; }
                            R.beginFrame();
                            Background.draw(pctx); Asteroids.draw(ectx); Escort.draw(ectx); PowerUps.draw(ectx);
                            Enemies.draw(ectx); Player.draw(ectx); if (Boss.active) Boss.draw(ectx);
                            Particles.draw(ectx); Scoring.drawPopups(ectx);
                            if (R.gpu) R.gpu.end();
                        }
                    }, [part, FRAMES], FRAMES);
                    if (b > 0) runs.push(ms);   // batch 0 warms up
                }
                runs.sort((a, b) => a - b);
                row[part] = +runs[runs.length >> 1].toFixed(2);
            }
            result.scenes[name].quality[quality] = row;
        }
        await g.ev(() => { Game.draw = () => {}; });
    }
    if (g.errors.length) result.errors = g.errors.slice(0, 5);
    await g.close();
    console.log(JSON.stringify(result.scenes, null, 2));
    writeResult('perf-render.json', result);
}

(RENDER ? render() : logic()).catch(e => { console.error(e); process.exit(1); });
