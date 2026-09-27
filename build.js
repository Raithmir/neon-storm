#!/usr/bin/env node
// Neon Storm γ — Build Script
// Concatenates source modules into a single distributable HTML file.
// Downloads PixiJS and pixi-filters and bundles them inline for offline/file:// use.
// Usage: node build.js

const fs = require('fs');
const path = require('path');
const https = require('https');

const SRC = path.join(__dirname, 'src');
const DIST = path.join(__dirname, 'dist');
const VENDOR = path.join(__dirname, 'vendor');
// Libraries bundled into the HTML: cached in vendor/ (committed), downloaded on first build.
// pixi-filters v6 is the PixiJS v8 line; it registers itself as PIXI.filters.
const VENDOR_LIBS = [
    { name: 'pixi.min.js', url: 'https://cdn.jsdelivr.net/npm/pixi.js@8/dist/pixi.min.js' },
    { name: 'pixi-filters.min.js', url: 'https://cdn.jsdelivr.net/npm/pixi-filters@6.1.5/dist/pixi-filters.min.js' },
];

const SOURCE_FILES = [
    'constants.js',
    'backdrops.js',
    'renderer.js',
    'config.js',
    'input.js',
    'audio.js',
    'storage.js',
    'ui-systems.js',
    'neon.js',
    'ui-kit.js',
    'particles.js',
    'bullets.js',
    'scoring.js',
    'enemies.js',
    'midbosses.js',
    'waves.js',
    'level-systems.js',
    'bosses.js',
    'player.js',
    'background.js',
    'hud.js',
    'menus.js',
    'game.js',
    'music.js',
    'main.js',
];

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                file.close();
                if (fs.existsSync(dest)) fs.unlinkSync(dest);
                return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                file.close();
                if (fs.existsSync(dest)) fs.unlinkSync(dest);
                return reject(new Error('HTTP ' + res.statusCode));
            }
            res.pipe(file);
            file.on('finish', () => { file.close(); resolve(); });
        }).on('error', (e) => {
            file.close();
            if (fs.existsSync(dest)) fs.unlinkSync(dest);
            reject(e);
        });
    });
}

async function build() {
    console.log('Building Neon Storm \u03b3...\n');

    if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });
    if (!fs.existsSync(VENDOR)) fs.mkdirSync(VENDOR, { recursive: true });

    // Get each library — use the cached copy, or download it, or fall back to a CDN tag
    const libTags = [];
    for (const lib of VENDOR_LIBS) {
        const cache = path.join(VENDOR, lib.name);
        if (!fs.existsSync(cache)) {
            try {
                console.log('  \u21bb Downloading ' + lib.name + '...');
                await downloadFile(lib.url, cache);
            } catch (e) {
                console.log('  \u26a0 Could not download ' + lib.name + ': ' + e.message);
                console.log('    Build will use a CDN link (requires internet to play)');
            }
        }
        if (fs.existsSync(cache)) {
            const js = fs.readFileSync(cache, 'utf8');
            libTags.push('<script>\n' + js + '\n<\/script>');
            console.log('  \u2713 ' + lib.name + ' (' + Math.round(js.length / 1024) + ' KB)');
        } else {
            libTags.push('<script src="' + lib.url + '"><\/script>');
        }
    }

    // Concatenate source modules
    let combinedJS = '';
    let totalLines = 0;

    for (const file of SOURCE_FILES) {
        const filePath = path.join(SRC, file);
        if (!fs.existsSync(filePath)) {
            console.error('  ERROR: Missing file: ' + file);
            process.exit(1);
        }
        const content = fs.readFileSync(filePath, 'utf8');
        const lineCount = content.split('\n').length;
        totalLines += lineCount;
        combinedJS += '\n// === ' + file + ' ===\n' + content + '\n';
        console.log('  \u2713 ' + file + ' (' + lineCount + ' lines)');
    }

    const html = '<!DOCTYPE html>\n'
        + '<html lang="en">\n<head>\n'
        + '<meta charset="UTF-8">\n'
        + '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
        + '<title>NEON STORM \u03b3</title>\n'
        + '<style>\n'
        + "@import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap');\n"
        + '* { margin: 0; padding: 0; box-sizing: border-box; }\n'
        + "body { background: #0a0612; overflow: hidden; display: flex; justify-content: center; align-items: center; height: 100vh; font-family: 'Share Tech Mono', 'Consolas', 'Monaco', 'Courier New', monospace; }\n"
        + '#game-container { position: relative; }\n'
        + '#pixi-play { position: absolute; z-index: 1; pointer-events: none; }\n'
        + '#game { position: relative; z-index: 2; display: block; }\n'
        + '</style>\n</head>\n<body>\n'
        + '<div id="game-container">\n<canvas id="game"></canvas>\n</div>\n'
        + libTags.join('\n') + '\n'
        + '<script>\n'
        + combinedJS
        + '\n</script>\n</body>\n</html>';

    fs.writeFileSync(path.join(DIST, 'neon-storm.js'), combinedJS);
    fs.writeFileSync(path.join(DIST, 'neon-storm-gamma.html'), html);

    console.log('\nBuild complete: ' + SOURCE_FILES.length + ' modules, ' + totalLines + ' total lines');
    console.log('Libraries: ' + VENDOR_LIBS.map((l, i) => l.name + (libTags[i].includes(' src=') ? ' (CDN link)' : ' (inline)')).join(', '));
    console.log('Output: dist/neon-storm-gamma.html');
    console.log('Debug:  dist/neon-storm.js');
}

build().catch(e => { console.error('Build failed:', e); process.exit(1); });
