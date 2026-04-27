#!/usr/bin/env node
// Neon Storm α — Build Script
// Concatenates source modules into a single distributable HTML file.
// Usage: node build.js

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');
const DIST = path.join(__dirname, 'dist');

// Files in dependency order
const SOURCE_FILES = [
    'constants.js',
    'config.js',
    'input.js',
    'audio.js',
    'storage.js',
    'ui-systems.js',
    'particles.js',
    'bullets.js',
    'scoring.js',
    'enemies.js',
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

const HTML_HEAD = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>NEON STORM \u03b1</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap');
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: #0a0612; overflow: hidden; display: flex; justify-content: center; align-items: center; height: 100vh; font-family: 'Share Tech Mono', 'Consolas', 'Monaco', 'Courier New', monospace; }
canvas { display: block; }
</style>
</head>
<body>
<canvas id="game"></canvas>
<script>
`;

const HTML_TAIL = `
</script>
</body>
</html>`;

// Build
console.log('Building Neon Storm \u03b1...\n');

if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });

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

// Write combined JS for debugging
fs.writeFileSync(path.join(DIST, 'neon-storm.js'), combinedJS);

// Write HTML
fs.writeFileSync(path.join(DIST, 'neon-storm-alpha.html'), HTML_HEAD + combinedJS + HTML_TAIL);

console.log('\nBuild complete: ' + SOURCE_FILES.length + ' modules, ' + totalLines + ' total lines');
console.log('Output: dist/neon-storm-alpha.html');
console.log('Debug:  dist/neon-storm.js');
