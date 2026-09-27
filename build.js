#!/usr/bin/env node
// Neon Storm β — Build Script
// Concatenates source modules into a single distributable HTML file.
// Downloads PixiJS and bundles it inline for offline/file:// use.
// Usage: node build.js

const fs = require('fs');
const path = require('path');
const https = require('https');

const SRC = path.join(__dirname, 'src');
const DIST = path.join(__dirname, 'dist');
const VENDOR = path.join(__dirname, 'vendor');
const PIXI_URL = 'https://cdn.jsdelivr.net/npm/pixi.js@8/dist/pixi.min.js';
const PIXI_CACHE = path.join(VENDOR, 'pixi.min.js');

const SOURCE_FILES = [
    'constants.js',
    'renderer.js',
    'config.js',
    'input.js',
    'audio.js',
    'storage.js',
    'ui-systems.js',
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
    console.log('Building Neon Storm \u03b2...\n');

    if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });
    if (!fs.existsSync(VENDOR)) fs.mkdirSync(VENDOR, { recursive: true });

    // Get PixiJS — use cached copy, or download, or fall back to CDN tag
    let pixiJS = '';
    let pixiMode = 'cdn';
    if (fs.existsSync(PIXI_CACHE)) {
        pixiJS = fs.readFileSync(PIXI_CACHE, 'utf8');
        pixiMode = 'inline';
        console.log('  \u2713 pixi.min.js (cached, ' + Math.round(pixiJS.length / 1024) + ' KB)');
    } else {
        try {
            console.log('  \u21bb Downloading pixi.min.js...');
            await downloadFile(PIXI_URL, PIXI_CACHE);
            pixiJS = fs.readFileSync(PIXI_CACHE, 'utf8');
            pixiMode = 'inline';
            console.log('  \u2713 pixi.min.js (downloaded, ' + Math.round(pixiJS.length / 1024) + ' KB)');
        } catch (e) {
            console.log('  \u26a0 Could not download PixiJS: ' + e.message);
            console.log('    Build will use CDN link (requires internet to play)');
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

    const pixiTag = pixiMode === 'inline'
        ? '<script>\n' + pixiJS + '\n<\/script>'
        : '<script src="https://cdn.jsdelivr.net/npm/pixi.js@8/dist/pixi.min.js"><\/script>';

    const html = '<!DOCTYPE html>\n'
        + '<html lang="en">\n<head>\n'
        + '<meta charset="UTF-8">\n'
        + '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
        + '<title>NEON STORM \u03b2</title>\n'
        + '<style>\n'
        + "@import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap');\n"
        + '* { margin: 0; padding: 0; box-sizing: border-box; }\n'
        + "body { background: #0a0612; overflow: hidden; display: flex; justify-content: center; align-items: center; height: 100vh; font-family: 'Share Tech Mono', 'Consolas', 'Monaco', 'Courier New', monospace; }\n"
        + '#game-container { position: relative; }\n'
        + '#pixi-play { position: absolute; z-index: 1; pointer-events: none; }\n'
        + '#game { position: relative; z-index: 2; display: block; }\n'
        + '</style>\n</head>\n<body>\n'
        + '<div id="game-container">\n<canvas id="game"></canvas>\n</div>\n'
        + pixiTag + '\n'
        + '<script>\n'
        + combinedJS
        + '\n</script>\n</body>\n</html>';

    fs.writeFileSync(path.join(DIST, 'neon-storm.js'), combinedJS);
    fs.writeFileSync(path.join(DIST, 'neon-storm-beta.html'), html);

    console.log('\nBuild complete: ' + SOURCE_FILES.length + ' modules, ' + totalLines + ' total lines');
    console.log('PixiJS: ' + (pixiMode === 'inline' ? 'bundled inline (' + Math.round(pixiJS.length / 1024) + ' KB)' : 'CDN link'));
    console.log('Output: dist/neon-storm-beta.html');
    console.log('Debug:  dist/neon-storm.js');
}

build().catch(e => { console.error('Build failed:', e); process.exit(1); });
