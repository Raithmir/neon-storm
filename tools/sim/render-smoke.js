// ============================================================
//  NEON STORM — Render smoke test
// ============================================================
// Draws every screen and plays through every level with rendering ON, and
// fails on any page error or console error. It catches the class of bugs
// the gameplay checks can't: exceptions in draw code, shader compile
// errors, missing art for an enemy type, broken UI screens.
//
//   node tools/sim/render-smoke.js
//
// For each level it simulates ~45 s of play and ~25 s of the boss fight
// (including its final phase), drawing the gameplay layers every few
// frames and a full frame (PixiJS render included) now and then. It then
// repeats one level with Flash Reduction on, one on the Canvas 2D
// fallback (no WebGL) and one with the shader backdrop instead of the 3D
// scene. A level fails if its 3D scene broke and fell back, or if a shader
// program compiled during its boss fight. Takes a few minutes.

const { launch, writeResult } = require('./harness');
const { SCREENS, setLayout } = require('./screens');

// Network noise from loading web fonts under file:// is not a game error
const IGNORE = [/Failed to load resource/i, /net::ERR_/i];

(async () => {
    const g = await launch({ draw: true });
    const results = { screens: {}, levels: {} };
    let failed = false;

    const step = async (label, fn, arg) => {
        const before = g.errors.length;
        let thrown = null;
        let out;
        try { out = await g.ev(fn, arg); } catch (e) { thrown = e.message.split('\n')[0]; }
        const errs = g.errors.slice(before).filter(e => !IGNORE.some(r => r.test(e)));
        if (thrown) errs.push(thrown);
        const ok = errs.length === 0;
        if (!ok) failed = true;
        console.log((ok ? 'PASS  ' : 'FAIL  ') + label + (ok ? '' : '\n      ' + errs.slice(0, 3).join('\n      ')));
        return { ok, errs, out };
    };

    // --- Every screen (one full draw each), in the landscape and the portrait layout ---
    for (const layout of ['landscape', 'portrait']) {
        await setLayout(g, layout);
        for (const [name, setup] of SCREENS) {
            const src = setup.toString();
            const r = await step('screen ' + name + (layout === 'portrait' ? ' (portrait)' : ''), (src) => {
                Menu.selectedIndex = 0;
                (new Function('return (' + src + ')'))()();
                Game.draw();
            }, src);
            results.screens[name + ' ' + layout] = r.ok;
        }
    }
    await setLayout(g, 'landscape');

    // --- Every level through its boss (plus Flash Reduction and the Canvas 2D fallback) ---
    const runs = [0, 1, 2, 3, 4, 5].map(l => ({ lvl: l, label: 'level ' + (l + 1) }));
    runs.push({ lvl: 5, label: 'level 6 (flash reduction)', calm: true });
    runs.push({ lvl: 2, label: 'level 3 (Canvas 2D fallback)', fallback: true });
    runs.push({ lvl: 3, label: 'level 4 (shader backdrop, 3D off)', no3d: true });
    for (const run of runs) {
        const r = await step(run.label, (run) => {
            Settings.values.flashReduction = !!run.calm;
            Settings.values.backdrop3d = !run.no3d;
            if (run.fallback) Renderer.usePixi = false;
            Game.startLevel(run.lvl, 'normal', false);
            Player.invincible = true; Player.invincibleTimer = 1e9;
            Player.primaryWeapon = ['spread', 'homing', 'laser'][run.lvl % 3];
            Player.primaryLevel = 4; Player.droneLevel = 3;
            const pctx = Renderer.getPlayCtx(), ectx = Renderer.getEntityCtx();
            const layers = () => {
                Renderer.beginFrame();
                Background.draw(pctx); Asteroids.draw(ectx); Escort.draw(ectx); PowerUps.draw(ectx);
                Enemies.draw(ectx); Player.draw(ectx); if (Boss.active) Boss.draw(ectx);
                Particles.draw(ectx); Scoring.drawPopups(ectx);
            };
            const stats = { maxEnemies: 0, boss: null, bombs: 0, bossCompiles: 0 };
            // Count shader compiles: none may happen once the boss is in (a compile can
            // block a phone's main thread long enough to cut the music; see Renderer._prewarmFilters)
            const gl = Renderer.usePixi && Renderer.app && Renderer.app.renderer.gl;
            if (gl && !gl.__counted) {
                const link = gl.linkProgram.bind(gl), source = gl.shaderSource.bind(gl);
                let src = '';
                gl.shaderSource = (sh, code) => { src = code; return source(sh, code); };
                gl.linkProgram = p => {
                    window.__links = (window.__links || 0) + 1;
                    window.__linked = (window.__linked || []).concat((src.match(/uniform\s+\w+\s+(\w+)/g) || []).slice(0, 4).map(u => u.split(/\s+/).pop()).join(','));
                    return link(p);
                };
                gl.__counted = true;
            }
            let links0 = 0;
            for (let f = 0; f < 60 * 70; f++) {
                Input.keys['Space'] = true;
                Player.x = 360 + Math.sin(f / 90) * 200;
                if (f === 60 * 45) { Enemies.clear(); Boss.init(ALL_LEVELS[run.lvl].bossType); Boss.warningTimer = 0.5; links0 = window.__links || 0; }
                if (f === 60 * 58) { Boss.phase = Boss.totalPhases; Boss.armor = []; }
                if (f % 600 === 300 && Player.bombs > 0) { Player.bombs++; Input.keys['KeyB'] = true; stats.bombs++; }
                Game.update(1 / 60);
                Input.keys['KeyB'] = false;
                if (Game.state !== 'playing') Game.state = 'playing';
                stats.maxEnemies = Math.max(stats.maxEnemies, Enemies.list.length);
                if (Boss.active) stats.boss = Boss.bossType;
                if (f % 4 === 0) layers();
                if (f % 120 === 0) Game.draw();   // full frame: HUD + PixiJS render
            }
            // Kill everything so death effects and the boss defeat sequence render too
            for (const e of Enemies.list.slice()) Enemies.hit(e, 1e6);
            if (Boss.active) Boss.hit(1e6);
            for (let f = 0; f < 60 * 4; f++) { Game.update(1 / 60); if (f % 10 === 0) Game.draw(); }
            Settings.values.flashReduction = false;
            Settings.values.backdrop3d = true;
            if (run.fallback) Renderer.usePixi = true;
            if (Backdrop3D.broken) throw new Error('3D backdrop failed and fell back to the shader');
            stats.bossCompiles = (window.__links || 0) - links0;
            if (stats.bossCompiles > 0) throw new Error(stats.bossCompiles + ' shader program(s) compiled during the boss fight (stalls on phones; prewarm them): '
                + window.__linked.slice(-stats.bossCompiles).map(u => '[' + u + ']').join(' '));
            return stats;
        }, run);
        results.levels[run.label] = { ok: r.ok, ...(r.out || {}), errors: r.errs };
    }

    writeResult('render-smoke.json', results);
    await g.close();
    console.log(failed ? '\nRender smoke test FAILED' : '\nRender smoke test passed');
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
