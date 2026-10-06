// ============================================================
//  NEON STORM — Headless simulation harness
// ============================================================
// Loads the built game in headless Chromium (Playwright) with a fake clock, so
// requestAnimationFrame and setTimeout advance together on virtual time at
// 60 fps. Rendering is stubbed out (Game.draw + the PixiJS ticker); game logic,
// collision, spawning and timers run unmodified. Input goes through the real
// Input.keys map, the same path keyboard events use.
//
// Environment:
//   GAME_HTML      Built game to load (default: dist/neon-storm-delta.html)
//   CHROMIUM_PATH  Chromium executable (default: Playwright's own browser)

const fs = require('fs');
const path = require('path');

let chromium;
try {
    ({ chromium } = require('playwright'));
} catch (e) {
    console.error('Playwright is not installed. Run: npm install --no-save playwright');
    process.exit(1);
}

const GAME_HTML = path.resolve(process.env.GAME_HTML || path.join(__dirname, '..', '..', 'dist', 'neon-storm-delta.html'));
const OUT_DIR = path.join(__dirname, 'out');

// opts.draw: keep rendering on (for render tests); the default stubs it out for speed
// opts.args: extra Chromium flags
async function launch(opts = {}) {
    if (!fs.existsSync(GAME_HTML)) {
        throw new Error('Game build not found: ' + GAME_HTML + ' (run `node build.js` first)');
    }
    const browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_PATH || undefined,
        // Software WebGL so the PixiJS renderer can initialise without a GPU
        args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', ...(opts.args || [])],
    });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => { errors.push(e.message); console.log('PAGE ERROR:', e.message); });
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.clock.install({ time: 0 });
    await page.goto('file://' + GAME_HTML);

    // Wait for the async boot (Renderer.init → Game.init → first frame)
    for (let i = 0; i < 40 && !(await page.evaluate(() => Game.lastTime)); i++) {
        await page.clock.runFor(250);
    }
    // Gameplay logic only: skip drawing and stop PixiJS's own render ticker
    if (!opts.draw) {
        await page.evaluate(() => {
            Game.draw = () => {};
            if (typeof Renderer !== 'undefined' && Renderer.app && Renderer.app.ticker) Renderer.app.ticker.stop();
        });
    }

    const g = {
        browser,
        page,
        errors,
        ev: (fn, arg) => page.evaluate(fn, arg),
        run: (ms) => page.clock.runFor(ms),
        key: (code, down) => page.evaluate(([c, d]) => { Input.keys[c] = d; }, [code, down]),
        async tap(code) {
            await g.key(code, true); await g.run(50);
            await g.key(code, false); await g.run(50);
        },
        close: () => browser.close(),
    };
    return g;
}

function writeResult(name, data) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, name), JSON.stringify(data, null, 2));
}

module.exports = { launch, writeResult, GAME_HTML };
