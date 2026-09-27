// ============================================================
//  NEON STORM — Audio check and preview renderer (music + SFX)
// ============================================================
// Renders every music track and sound effect offline (OfflineAudioContext,
// faster than real time) through the game's real mix, and fails on any page
// error, a silent sound or clipping (including 40 explosions in one frame, as
// when a bomb clears the screen). It also walks the game states and checks
// Music picks the right track and intensity for each.
//
//   node tools/sim/audio.js           # check only
//   node tools/sim/audio.js --wav     # also write WAV previews to tools/sim/out/audio/
//                                     # (one per track, plus sfx-reel.wav with every sound in turn)
//
// Each preview plays the track's layers in turn: intensity 0 (pads + arp),
// 1 (+ drums + bass), 2 (+ lead) and 3 (+ fills). Results and game over play
// their sting first.

const fs = require('fs');
const path = require('path');
const { launch, writeResult } = require('./harness');

const WAV = process.argv.includes('--wav');
const OUT = path.join(__dirname, 'out', 'audio');

// [track, bars at each intensity 0..3]
const PLANS = [
    ['title', [0, 8, 0, 0]],
    ['level_1', [2, 4, 4, 2]],
    ['level_2', [2, 4, 4, 2]],
    ['level_3', [2, 4, 4, 2]],
    ['level_4', [2, 4, 4, 2]],
    ['level_5', [2, 4, 4, 2]],
    ['level_6', [2, 4, 4, 2]],
    ['boss:level_1', [0, 0, 4, 4]],
    ['endless', [0, 4, 4, 0]],
    ['results', [4, 0, 0, 0]],
    ['gameover', [3, 0, 0, 0]],
];

function wavFile(ch, rate) {
    const n = ch[0].length, data = Buffer.alloc(44 + n * 4);
    data.write('RIFF', 0); data.writeUInt32LE(36 + n * 4, 4); data.write('WAVE', 8);
    data.write('fmt ', 12); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22);
    data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 4, 28); data.writeUInt16LE(4, 32); data.writeUInt16LE(16, 34);
    data.write('data', 36); data.writeUInt32LE(n * 4, 40);
    for (let i = 0; i < n; i++) {
        for (let c = 0; c < 2; c++) {
            const v = Math.max(-1, Math.min(1, ch[c][i]));
            data.writeInt16LE(Math.round(v * 32767), 44 + i * 4 + c * 2);
        }
    }
    return data;
}

(async () => {
    const g = await launch();
    // The game loop would otherwise run Music.update() (the title track) into
    // our offline contexts while a render is awaited; drive it by hand instead
    await g.ev(() => { Music._driver = Music.update; Music.update = () => {}; });
    let failed = false;
    const results = { tracks: {}, states: {} };
    if (WAV) fs.mkdirSync(OUT, { recursive: true });

    for (const [id, plan] of PLANS) {
        const before = g.errors.length;
        let r;
        try {
            r = await g.ev(async ([id, plan, wav]) => {
                const RATE = 44100;
                const tr = Music.track(id);
                const bar = 60 / tr.bpm * 4;
                const sting = tr.sting ? 3.5 : 0;
                const bars = plan.reduce((a, b) => a + b, 0);
                const secs = sting + bars * bar + 2.5;
                const ctx = new OfflineAudioContext(2, Math.ceil(secs * RATE), RATE);
                Audio.ctx = ctx;
                Audio._buildMix();
                Audio.musicBus.gain.value = 0.5;            // default MUSIC VOLUME
                Music.players = []; Music.current = null; Music._fx = null;
                const p = Music.play(id, 0);
                let t = p.next;
                plan.forEach((n, level) => {
                    for (let b = 0; b < n; b++) { p.target = level; t += bar; Music.tick(t - 0.01); }
                });
                const buf = await ctx.startRendering();
                const out = { secs: +secs.toFixed(1), peak: 0, rms: 0, voices: 0 };
                let sum = 0;
                const chans = [buf.getChannelData(0), buf.getChannelData(1)];
                for (const d of chans) for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > out.peak) out.peak = v; sum += d[i] * d[i]; }
                out.rms = Math.sqrt(sum / (chans[0].length * 2));
                out.peak = +out.peak.toFixed(3); out.rms = +out.rms.toFixed(4);
                if (wav) out.pcm = chans.map(d => Array.from(d, v => Math.round(v * 32767)));
                Audio.ctx = null; Audio.musicBus = null; Music.players = []; Music.current = null; Music._fx = null;
                return out;
            }, [id, plan, WAV]);
        } catch (e) {
            r = { error: e.message.split('\n')[0] };
        }
        const errs = g.errors.slice(before);
        const problems = [];
        if (r.error) problems.push(r.error);
        if (errs.length) problems.push(...errs.slice(0, 3));
        if (!r.error && r.rms < 0.01) problems.push('near silent (rms ' + r.rms + ')');
        if (!r.error && r.peak >= 0.99) problems.push('clipping (peak ' + r.peak + ')');
        if (problems.length) failed = true;
        console.log((problems.length ? 'FAIL  ' : 'PASS  ') + id.padEnd(14) +
            (r.error ? '' : ` ${r.secs}s  peak ${r.peak}  rms ${r.rms}`) +
            (problems.length ? '\n      ' + problems.join('\n      ') : ''));
        if (WAV && r.pcm) {
            const f = path.join(OUT, id.replace(':', '-') + '.wav');
            fs.writeFileSync(f, wavFile(r.pcm.map(a => Float32Array.from(a, v => v / 32767)), 44100));
            delete r.pcm;
        }
        results.tracks[id] = { ok: !problems.length, ...r, problems };
    }

    // --- Track choice for each game state ---
    const states = await g.ev(() => {
        const ctx = new OfflineAudioContext(2, 44100, 44100);
        Audio.ctx = ctx; Audio._buildMix();
        Music.players = []; Music.current = null; Music._fx = null;
        const out = {};
        const at = (label, setup) => {
            setup();
            Music._driver();
            out[label] = Music.current ? Music.current.id + '@' + Music.current.target : 'none';
        };
        at('title', () => { Game.state = 'title'; });
        at('hangar', () => { Game.state = 'hangar'; });
        at('briefing 3', () => { Game.showBriefing(2); });
        at('playing 3', () => { Game.startLevel(2, 'normal', false); Game.state = 'playing'; });
        at('paused 3', () => { Game.state = 'paused'; });
        at('boss warning', () => { Game.state = 'playing'; Boss.init(ALL_LEVELS[2].bossType); });
        at('boss', () => { Boss.warningTimer = 0; });
        at('boss final', () => { Boss.phase = Boss.totalPhases; });
        at('surge', () => { Boss.active = false; Scoring.surgeActive = true; });
        at('victory', () => { Scoring.surgeActive = false; Game.state = 'victory'; });
        at('game over', () => { Game.state = 'game_over'; });
        at('music off', () => { Game.state = 'title'; Audio.musicVolume = 0; });
        Audio.musicVolume = 0.5;
        Audio.ctx = null; Audio.musicBus = null; Music.players = []; Music.current = null; Music._fx = null;
        return out;
    });
    const expect = {
        'title': 'title@1', 'hangar': 'title@1', 'briefing 3': 'level_3@0', 'playing 3': 'level_3@1',
        'paused 3': 'level_3@1', 'boss warning': 'level_3@0', 'boss': 'boss:level_3@2',
        'boss final': 'boss:level_3@3', 'surge': 'level_3@3', 'victory': 'results@0',
        'game over': 'gameover@0', 'music off': 'none',
    };
    for (const [k, v] of Object.entries(expect)) {
        const ok = states[k] === v;
        if (!ok) failed = true;
        console.log((ok ? 'PASS  ' : 'FAIL  ') + ('state ' + k).padEnd(20) + states[k] + (ok ? '' : '  (expected ' + v + ')'));
    }
    results.states = states;

    // --- Sound effects ---
    const SFX = ['playShot', 'playMissile', 'laserHum', 'playDash', 'playGraze', 'playHitTick', 'playPowerUp', 'playExtend',
        'playChainMilestone', 'playSurgeActivate', 'playShieldHit', 'playBomb', 'playPlayerDeath', 'playExplosionSmall',
        'playExplosionLarge', 'playAsteroidBreak', 'playEscortHit', 'playMidbossAlert', 'playBossWarning', 'playBossPhase',
        'playMenuNav', 'playMenuSelect', 'pileup'];
    const reel = [[], []];
    results.sfx = {};
    for (const name of SFX) {
        const before = g.errors.length;
        let r;
        try {
            r = await g.ev(async ([name, wav]) => {
                const RATE = 44100, secs = name === 'playBossWarning' ? 3 : name === 'laserHum' ? 1 : 1.8;
                const ctx = new OfflineAudioContext(2, Math.ceil(secs * RATE), RATE);
                Audio.ctx = ctx; Audio._buildMix(); Audio._last = {}; Audio._laser = null;
                Audio.sfxVolume = 0.7;                                   // default SFX VOLUME
                if (name === 'laserHum') { Audio.laserHum(true); Audio.frame(); }
                else if (name === 'pileup') { for (let i = 0; i < 40; i++) Audio.playExplosionSmall(); Audio.playBomb(); }
                else if (name === 'playChainMilestone') Audio.playChainMilestone(8);
                else Audio[name]();
                const buf = await ctx.startRendering();
                const chans = [buf.getChannelData(0), buf.getChannelData(1)];
                let peak = 0, sum = 0;
                for (const d of chans) for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; sum += d[i] * d[i]; }
                Audio.ctx = null; Audio._laser = null; Audio.sfxBus = null; Audio.musicBus = null; Audio.musicDuck = null;
                const out = { peak: +peak.toFixed(3), rms: +Math.sqrt(sum / (chans[0].length * 2)).toFixed(4) };
                if (wav) out.pcm = chans.map(d => Array.from(d, v => Math.round(v * 32767)));
                return out;
            }, [name, WAV]);
        } catch (e) {
            r = { error: e.message.split('\n')[0] };
        }
        const errs = g.errors.slice(before);
        const problems = [];
        if (r.error) problems.push(r.error);
        if (errs.length) problems.push(...errs.slice(0, 3));
        if (!r.error && r.peak < 0.01) problems.push('silent (peak ' + r.peak + ')');
        if (!r.error && r.peak >= 0.99) problems.push('clipping (peak ' + r.peak + ')');
        if (problems.length) failed = true;
        console.log((problems.length ? 'FAIL  ' : 'PASS  ') + ('sfx ' + name).padEnd(24) +
            (r.error ? '' : ` peak ${r.peak}  rms ${r.rms}`) + (problems.length ? '\n      ' + problems.join('\n      ') : ''));
        if (WAV && r.pcm) {
            for (let c = 0; c < 2; c++) { for (const v of r.pcm[c]) reel[c].push(v); for (let i = 0; i < 22050; i++) reel[c].push(0); }
            delete r.pcm;
        }
        results.sfx[name] = { ok: !problems.length, ...r, problems };
    }
    if (WAV) fs.writeFileSync(path.join(OUT, 'sfx-reel.wav'), wavFile(reel.map(a => Float32Array.from(a, v => v / 32767)), 44100));

    writeResult('audio.json', results);
    await g.close();
    if (WAV) console.log('\nWAV previews in ' + OUT);
    console.log(failed ? '\nAudio check FAILED' : '\nAudio check passed');
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
