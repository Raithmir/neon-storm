// ============================================================
//  NEON STORM — three.js bundler
// ============================================================
// three.js ships as ES modules only, but the game is plain concatenated
// scripts. This bundles the classes listed in entry.js into one minified
// script that defines the global THREE: vendor/three.min.js (committed,
// inlined by build.js like PixiJS). Only needed when entry.js or the
// three.js version changes.
//
//   npm install --no-save three@0.186.1 esbuild playwright   (one command: --no-save
//                                                              drops packages it isn't given)
//   node tools/three/bundle.js

const fs = require('fs');
const path = require('path');

let esbuild;
try {
    esbuild = require('esbuild');
    require.resolve('three');
} catch (e) {
    console.error('Needs three and esbuild: npm install --no-save three@0.186.1 esbuild');
    process.exit(1);
}

const out = path.join(__dirname, '..', '..', 'vendor', 'three.min.js');
esbuild.buildSync({
    entryPoints: [path.join(__dirname, 'entry.js')],
    bundle: true,
    minify: true,
    format: 'iife',
    globalName: 'THREE',
    legalComments: 'inline',
    outfile: out,
});
const version = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'node_modules', 'three', 'package.json'), 'utf8')).version;
const kb = Math.round(fs.statSync(out).size / 1024);
console.log('vendor/three.min.js: three ' + version + ', ' + kb + ' KB');
