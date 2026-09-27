// ============================================================
//  MUSIC (procedural synthwave via Web Audio)
// ============================================================
// Every track is generated live from a small description: tempo, key, chord
// progression, drum kit, bass/arp patterns and timbre. Nothing is loaded, so
// the single-file build stays offline and licence-free.
//
// Music.update() runs once per frame (main.js). It picks the track for the
// current game state, crossfades when that changes, sets the intensity, and
// schedules the next notes a fraction of a second ahead on the audio clock.
//
// Intensity decides which layers play (it changes on bar lines):
//   0  pads + arpeggio          (briefing, boss warning, results)
//   1  + drums + bass           (normal play, menus)
//   2  + lead melody + 16th hats (mid-boss, boss)
//   3  + fills, brighter pads    (boss final phase, Neon Surge)
// Pause muffles the mix (Audio.musicFilter); bombs and deaths duck it.

const MUSIC_SCALES = {
    minor:    [0, 2, 3, 5, 7, 8, 10],
    major:    [0, 2, 4, 5, 7, 9, 11],
    dorian:   [0, 2, 3, 5, 7, 9, 10],
    phrygian: [0, 1, 3, 5, 7, 8, 10],
    harmonic: [0, 2, 3, 5, 7, 8, 11],
};

// 16-step patterns. Drums: x hit, o open hat. Bass: 0 chord root, 5 fifth,
// o octave. Arp: digits index the chord tones (root, 3rd, 5th, then an octave up).
const MUSIC_KITS = {
    soft:   { kick: 'x.......x.......', snare: '....x.......x...', hat: '..x...x...x...x.', hat16: 'x.x.x.x.x.x.x.x.', k: 0.75, s: 0.22, h: 0.05 },
    punchy: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...o.', hat16: 'xxxxxxxxxxxxxxox', k: 0.9, s: 0.32, h: 0.055 },
    metal:  { kick: 'x...x..xx...x...', snare: '....x.......x..x', hat: 'x.x.x.x.x.x.x.x.', hat16: 'xxxxxxxxxxxxxxxx', k: 0.95, s: 0.34, h: 0.045, metal: true },
    half:   { kick: 'x.........x.....', snare: '........x.......', hat: '..x...x...x...x.', hat16: 'x.x.x.x.x.x.x.o.', k: 0.85, s: 0.34, h: 0.045 },
};
const MUSIC_BASS = {
    roll:  '0.0.0.0.0.0.0.o.',
    pulse: '0000000000000000',
    long:  '0.......5.......',
    drive: '0.00.00.0.00.0o.',
};
const MUSIC_ARPS = {
    up:     '0123012301230123',
    updown: '0123432101234321',
    wide:   '0.2.4.3.5.3.4.2.',
    stab:   '0..0..0.0..0..0.',
    fast:   '0214021502140325',
    sparse: '0...2...4...2...',
};
// Lead rhythms (x = note onset); the last bar of a phrase uses the ending
const MUSIC_RHYTHMS = ['x..x..x.x...x...', 'x...x.x...x.x...', 'x.x...x..x..x...', 'x.....x.x.x.x...', 'x..x..x...x.x.x.'];
const MUSIC_ENDING = 'x...x...x.......';

// root: MIDI note of the bass (pads play an octave up, arp and lead two).
// prog: chord per bar, as scale degrees (0 = i/I).
const MusicTracks = {
    title:    { bpm: 96,  root: 45, scale: 'minor',    prog: [0, 5, 2, 6], kit: 'soft',   bass: 'roll',  arp: 'updown', arpWave: 'triangle', bassWave: 'sawtooth', padCut: 1400, bassCut: 420, arpCut: 2400, lead: 'sawtooth' },
    level_1:  { bpm: 110, root: 40, scale: 'minor',    prog: [0, 6, 5, 6], kit: 'punchy', bass: 'roll',  arp: 'up',     arpWave: 'square',   bassWave: 'sawtooth', padCut: 1600, bassCut: 480, arpCut: 2200, lead: 'sawtooth' },
    level_2:  { bpm: 124, root: 38, scale: 'phrygian', prog: [0, 1, 0, 6], kit: 'metal',  bass: 'pulse', arp: 'stab',   arpWave: 'square',   bassWave: 'square',   padCut: 900,  bassCut: 650, arpCut: 1800, lead: 'square' },
    level_3:  { bpm: 98,  root: 42, scale: 'dorian',   prog: [0, 3, 0, 6], kit: 'soft',   bass: 'long',  arp: 'wide',   arpWave: 'triangle', bassWave: 'sawtooth', padCut: 2200, bassCut: 380, arpCut: 3000, lead: 'triangle', verb: 0.7 },
    level_4:  { bpm: 118, root: 43, scale: 'major',    prog: [0, 4, 5, 3], kit: 'punchy', bass: 'drive', arp: 'up',     arpWave: 'square',   bassWave: 'sawtooth', padCut: 1800, bassCut: 520, arpCut: 2800, lead: 'sawtooth' },
    level_5:  { bpm: 130, root: 41, scale: 'minor',    prog: [0, 6, 5, 4], kit: 'punchy', bass: 'drive', arp: 'fast',   arpWave: 'square',   bassWave: 'square',   padCut: 1500, bassCut: 600, arpCut: 2600, lead: 'square' },
    level_6:  { bpm: 88,  root: 35, scale: 'phrygian', prog: [0, 1, 5, 1], kit: 'half',   bass: 'long',  arp: 'wide',   arpWave: 'sine',     bassWave: 'sawtooth', padCut: 800,  bassCut: 300, arpCut: 1600, lead: 'triangle', verb: 0.8 },
    boss:     { bpm: 140, root: 45, scale: 'harmonic', prog: [0, 5, 3, 4], kit: 'metal',  bass: 'pulse', arp: 'fast',   arpWave: 'sawtooth', bassWave: 'sawtooth', padCut: 1200, bassCut: 800, arpCut: 2400, lead: 'square' },
    endless:  { bpm: 126, root: 45, scale: 'minor',    prog: [0, 5, 6, 4], kit: 'punchy', bass: 'drive', arp: 'updown', arpWave: 'square',   bassWave: 'sawtooth', padCut: 1600, bassCut: 520, arpCut: 2400, lead: 'sawtooth' },
    results:  { bpm: 92,  root: 36, scale: 'major',    prog: [0, 5, 3, 4], kit: 'soft',   bass: 'roll',  arp: 'up',     arpWave: 'triangle', bassWave: 'sawtooth', padCut: 1600, bassCut: 420, arpCut: 2400, lead: 'triangle', sting: 'victory' },
    gameover: { bpm: 72,  root: 38, scale: 'minor',    prog: [0, 5, 3, 4], kit: 'half',   bass: 'long',  arp: 'sparse', arpWave: 'sine',     bassWave: 'sawtooth', padCut: 900,  bassCut: 300, arpCut: 1400, lead: 'triangle', sting: 'gameover', verb: 0.8 },
};

const Music = {
    LOOKAHEAD: 0.2,     // seconds of notes scheduled ahead
    players: [],        // playing tracks (the current one plus any fading out)
    current: null,
    _fx: null,
    _noise: null,

    // --- Per-frame driver ---

    update() {
        const c = Audio.ctx;
        if (!c || !Audio.musicBus) return;
        const now = c.currentTime;
        const vol = Audio.enabled ? Audio.musicVolume * Audio.masterVolume : 0;
        const paused = Game.state === 'paused';
        Audio.musicBus.gain.setTargetAtTime(vol * (paused ? 0.55 : 1), now, 0.08);
        Audio.musicFilter.frequency.setTargetAtTime(paused ? 650 : 20000, now, paused ? 0.06 : 0.3);
        if (vol <= 0) { this.stop(); return; }

        const want = this._want();
        if (!this.current || this.current.id !== want.id) this.play(want.id);
        this.current.target = want.intensity;
        this.current.surge = !!want.surge;
        this.tick(now + this.LOOKAHEAD);
    },

    // Schedule every playing track up to time `until`, dropping faded ones
    tick(until) {
        const now = Audio.ctx.currentTime;
        for (const p of this.players) {
            if (p.next < now - 0.1) p.next = now + 0.05;    // tab was hidden: skip ahead
            const end = p.endAt ? Math.min(until, p.endAt) : until;
            while (p.next < end) {
                this._step(p, p.next);
                p.next += p.stepDur;
                p.step++;
            }
        }
        this.players = this.players.filter(p => {
            if (p.endAt && now > p.endAt + 1) { p.out.disconnect(); return false; }
            return true;
        });
    },

    // Which track, and how intense, for the current game state
    _want() {
        const lvl = EndlessMode.active ? 'endless' : (MusicTracks['level_' + (Game.currentLevelIndex + 1)] ? 'level_' + (Game.currentLevelIndex + 1) : 'level_1');
        switch (Game.state) {
            case 'briefing':
                return { id: lvl, intensity: 0 };
            case 'playing':
            case 'paused': {
                const surge = Scoring.surgeActive;
                if (Boss.active && !Boss.defeated) {
                    if (Boss.warningTimer > 0) return { id: lvl, intensity: 0 };
                    const final = Boss.phase >= Boss.totalPhases;
                    return { id: 'boss:' + lvl, intensity: (final || surge) ? 3 : 2, surge };
                }
                if (Boss.defeated) return { id: lvl, intensity: 0 };
                let n = MidBoss.current() ? 2 : 1;
                if (EndlessMode.active && EndlessMode.wave >= 6) n = 2;
                return { id: lvl, intensity: surge ? 3 : n, surge };
            }
            case 'victory':
            case 'campaign_complete':
                return { id: 'results', intensity: 0 };
            case 'game_over':
                return { id: 'gameover', intensity: 0 };
            default:
                return { id: 'title', intensity: 1 };
        }
    },

    // --- Tracks ---

    // A track by id; 'boss:<level>' is the boss track in that level's key
    track(id) {
        if (id.startsWith('boss:')) {
            const lvl = MusicTracks[id.slice(5)] || MusicTracks.level_1;
            return Object.assign({}, MusicTracks.boss, { id, root: lvl.root });
        }
        return Object.assign({}, MusicTracks[id] || MusicTracks.title, { id });
    },

    // Start a track now (crossfading out whatever is playing)
    play(id, intensity) {
        const c = Audio.ctx, now = c.currentTime;
        this._ensureFx();
        if (this.current) this._fadeOut(this.current, 1.2);
        const tr = this.track(id);
        const out = c.createGain();
        out.connect(Audio.musicBus);
        const pump = c.createGain();        // sidechain "pump" on pads, bass and arp
        pump.connect(out);
        const p = {
            id, track: tr, out, pump,
            step: 0, stepDur: 60 / tr.bpm / 4,
            next: now + 0.05, level: 0, target: intensity || 0, surge: false, endAt: 0,
            melody: this._melody(tr),
        };
        if (tr.sting) {
            out.gain.value = 1;
            p.next += this._sting(p, tr.sting, now + 0.05);
        } else {
            out.gain.setValueAtTime(0, now);
            out.gain.linearRampToValueAtTime(1, now + 0.9);
        }
        this._fx.delay.delayTime.setTargetAtTime(p.stepDur * 3, now, 0.05);   // dotted 8th
        this.players.push(p);
        this.current = p;
        return p;
    },

    stop() {
        for (const p of this.players) if (!p.endAt) this._fadeOut(p, 0.3);
        this.current = null;
    },

    _fadeOut(p, time) {
        const g = p.out.gain, now = Audio.ctx.currentTime;
        g.cancelScheduledValues(now);
        g.setValueAtTime(g.value, now);
        g.linearRampToValueAtTime(0, now + time);
        p.endAt = now + time;
    },

    // --- Sequencer ---

    _step(p, t) {
        const tr = p.track, s = p.step % 16, bar = Math.floor(p.step / 16);
        if (s === 0) p.level = p.target;
        const L = p.level;
        const deg = tr.prog[bar % tr.prog.length];
        const kit = MUSIC_KITS[tr.kit];

        if (s === 0) this._pad(p, t, deg);
        const a = MUSIC_ARPS[tr.arp][s];
        if (a !== '.') this._arp(p, t, deg, +a);

        if (L >= 1) {
            const b = MUSIC_BASS[tr.bass];
            if (b[s] !== '.') {
                let len = 1;
                while (len < 16 && b[(s + len) % 16] === '.') len++;
                this._bass(p, t, deg, b[s], len * p.stepDur * 0.9);
            }
            if (kit.kick[s] === 'x') this._kick(p, t, kit.k);
            if (kit.snare[s] === 'x') this._snare(p, t, kit.s, kit);
            const hats = L >= 2 ? kit.hat16 : kit.hat;
            if (hats[s] !== '.') this._hat(p, t, kit.h * (s % 4 === 2 ? 1 : 0.7), hats[s] === 'o', kit);
        }
        if (L >= 2) {
            const n = p.melody[bar % p.melody.length][s];
            if (n) this._lead(p, t, n.idx, n.len * p.stepDur);
        }
        if (L >= 3 && bar % 4 === 3 && s >= 12) this._snare(p, t, kit.s * (0.5 + (s - 12) * 0.15), kit);
    },

    // MIDI note for a scale index (0 = the key's root) above `base`
    _pitch(tr, base, idx) {
        const sc = MUSIC_SCALES[tr.scale];
        return base + 12 * Math.floor(idx / 7) + sc[((idx % 7) + 7) % 7];
    },

    // --- Instruments ---

    _pad(p, t, deg) {
        const tr = p.track, dur = 16 * p.stepDur;
        const cut = tr.padCut * (p.surge ? 2.2 : 1);
        for (const i of [0, 2, 4]) {
            this._voice(p, t, this._pitch(tr, tr.root + 12, deg + i), dur, {
                waves: [['sawtooth', -9], ['sawtooth', 9]], gain: 0.05,
                a: dur * 0.3, sus: 0.8, r: 0.6, cut, q: 0.8, dest: p.pump, verb: tr.verb || 0.45,
            });
        }
    },

    _arp(p, t, deg, tone) {
        const tr = p.track;
        const idx = deg + [0, 2, 4, 7, 9, 11][tone];
        const cut = (tr.arpCut || 2400) * (p.surge ? 1.8 : 1);
        this._voice(p, t, this._pitch(tr, tr.root + 24, idx), p.stepDur * 0.9, {
            waves: [[tr.arpWave, 0]], gain: 0.06,
            a: 0.004, sus: 0.3, r: 0.08, cut, cutEnd: cut * 0.35, q: 2,
            dest: p.pump, delay: 0.35, verb: 0.15, pan: (p.step % 2 ? 0.35 : -0.35),
        });
    },

    _bass(p, t, deg, ch, dur) {
        const tr = p.track;
        const idx = deg + (ch === '5' ? 4 : ch === 'o' ? 7 : 0);
        this._voice(p, t, this._pitch(tr, tr.root, idx), dur, {
            waves: [[tr.bassWave, 0], ['sine', -1200]], gain: 0.085,
            a: 0.004, sus: 0.6, r: 0.05, cut: tr.bassCut * 3, cutEnd: tr.bassCut, q: 2.5, dest: p.pump,
        });
    },

    _lead(p, t, idx, dur) {
        const tr = p.track;
        this._voice(p, t, this._pitch(tr, tr.root + 24, idx), dur * 0.95, {
            waves: [[tr.lead || 'sawtooth', -7], ['square', 7]], gain: 0.045,
            a: 0.012, sus: 0.7, r: 0.15, cut: 3200, cutEnd: 2000, q: 1, dest: p.out,
            delay: 0.3, verb: 0.25, vibrato: dur > 0.3,
        });
    },

    // Generic subtractive voice: oscillators → lowpass → envelope → (pan) → dest (+ sends)
    _voice(p, t, midi, dur, v) {
        const c = Audio.ctx;
        const f = 440 * Math.pow(2, (midi - 69) / 12);
        const flt = c.createBiquadFilter();
        flt.type = 'lowpass';
        flt.Q.value = v.q || 0.7;
        flt.frequency.setValueAtTime(v.cut, t);
        if (v.cutEnd) flt.frequency.exponentialRampToValueAtTime(v.cutEnd, t + Math.max(0.02, dur));
        const g = c.createGain();
        const a = Math.min(v.a || 0.005, dur * 0.9), r = v.r || 0.08;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(v.gain, t + a);
        g.gain.linearRampToValueAtTime(v.gain * (v.sus === undefined ? 1 : v.sus), t + dur);
        g.gain.linearRampToValueAtTime(0, t + dur + r);
        const stopAt = t + dur + r + 0.02;
        let lfo = null;
        if (v.vibrato) {
            lfo = c.createOscillator();
            const depth = c.createGain();
            lfo.frequency.value = 5.5;
            depth.gain.setValueAtTime(0, t);
            depth.gain.linearRampToValueAtTime(f * 0.006, t + dur);
            lfo.connect(depth);
            lfo.start(t); lfo.stop(stopAt);
            lfo._depth = depth;
        }
        for (const [type, det] of v.waves) {
            const o = c.createOscillator();
            o.type = type;
            o.frequency.value = f;
            o.detune.value = det;
            if (lfo) lfo._depth.connect(o.frequency);
            o.connect(flt);
            o.start(t); o.stop(stopAt);
        }
        flt.connect(g);
        let outNode = g;
        if (v.pan && c.createStereoPanner) {
            const pn = c.createStereoPanner();
            pn.pan.value = v.pan;
            g.connect(pn);
            outNode = pn;
        }
        outNode.connect(v.dest || p.out);
        this._sends(outNode, v.delay, v.verb);
    },

    _sends(node, delay, verb) {
        const c = Audio.ctx;
        if (delay) { const s = c.createGain(); s.gain.value = delay; node.connect(s); s.connect(this._fx.delayIn); }
        if (verb) { const s = c.createGain(); s.gain.value = verb; node.connect(s); s.connect(this._fx.verbIn); }
    },

    _kick(p, t, vel) {
        const c = Audio.ctx;
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(150, t);
        o.frequency.exponentialRampToValueAtTime(42, t + 0.11);
        g.gain.setValueAtTime(vel * 0.8, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        o.connect(g); g.connect(p.out);
        o.start(t); o.stop(t + 0.42);
        // Sidechain pump: pads/bass/arp dip on the kick and swell back
        const pg = p.pump.gain;
        pg.setValueAtTime(0.35, t);
        pg.linearRampToValueAtTime(1, t + p.stepDur * 3);
    },

    _snare(p, t, vel, kit) {
        const c = Audio.ctx;
        const n = this._noiseSrc(t, 0.3);
        const bp = c.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = kit.metal ? 2600 : 1800;
        bp.Q.value = 0.7;
        const g = c.createGain();
        g.gain.setValueAtTime(vel, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        n.connect(bp); bp.connect(g); g.connect(p.out);
        const o = c.createOscillator(), og = c.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(200, t);
        o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
        og.gain.setValueAtTime(vel * 0.7, t);
        og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        o.connect(og); og.connect(p.out);
        o.start(t); o.stop(t + 0.12);
        this._sends(g, 0, 0.5);    // big 80s snare reverb
    },

    _hat(p, t, vel, open, kit) {
        const c = Audio.ctx;
        const len = open ? 0.25 : 0.045;
        const n = this._noiseSrc(t, len + 0.02);
        const hp = c.createBiquadFilter();
        hp.type = kit.metal ? 'bandpass' : 'highpass';
        hp.frequency.value = kit.metal ? 9000 : 7500;
        hp.Q.value = kit.metal ? 1.5 : 0.7;
        const g = c.createGain();
        g.gain.setValueAtTime(vel, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + len);
        n.connect(hp); hp.connect(g); g.connect(p.out);
    },

    _noiseSrc(t, dur) {
        const c = Audio.ctx;
        if (!this._noise || this._noise.sampleRate !== c.sampleRate) {
            const b = c.createBuffer(1, c.sampleRate, c.sampleRate);
            const d = b.getChannelData(0);
            for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
            this._noise = b;
        }
        const src = c.createBufferSource();
        src.buffer = this._noise;
        src.start(t, Math.random() * 0.6, dur);
        return src;
    },

    // Shared echo (dotted 8th) and reverb, returning into the music bus
    _ensureFx() {
        const c = Audio.ctx;
        if (this._fx && this._fx.ctx === c) return;
        const delayIn = c.createGain();
        const delay = c.createDelay(2);
        const fb = c.createGain();
        const damp = c.createBiquadFilter();
        const wet = c.createGain();
        fb.gain.value = 0.35;
        damp.type = 'lowpass';
        damp.frequency.value = 2500;
        wet.gain.value = 0.5;
        delayIn.connect(delay);
        delay.connect(damp); damp.connect(fb); fb.connect(delay);
        delay.connect(wet); wet.connect(Audio.musicBus);

        const verbIn = c.createGain();
        const conv = c.createConvolver();
        const len = Math.floor(c.sampleRate * 2.2);
        const ir = c.createBuffer(2, len, c.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
            const d = ir.getChannelData(ch);
            for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
        }
        conv.buffer = ir;
        const vwet = c.createGain();
        vwet.gain.value = 0.35;
        verbIn.connect(conv); conv.connect(vwet); vwet.connect(Audio.musicBus);
        this._fx = { ctx: c, delayIn, delay, verbIn };
    },

    // --- Stings (played once as the results / game-over track starts) ---

    // Returns how long the sting lasts, so the loop starts after it
    _sting(p, kind, t) {
        const tr = p.track, base = tr.root + 24;
        const lead = { waves: [['sawtooth', -7], ['square', 7]], a: 0.005, sus: 0.6, r: 0.2, cut: 3600, q: 1, dest: p.out, delay: 0.3, verb: 0.4 };
        if (kind === 'victory') {
            [0, 4, 7, 12, 16, 19, 24].forEach((n, i) =>
                this._voice(p, t + i * 0.07, base + n, 0.12, Object.assign({}, lead, { gain: 0.05 })));
            const tc = t + 0.55;
            for (const n of [0, 4, 7, 12]) {
                this._voice(p, tc, base + n, 1.4, Object.assign({}, lead, { gain: 0.035, sus: 0.5, r: 0.8, cutEnd: 1200 }));
            }
            this._kick(p, tc, 0.9);
            const n = this._noiseSrc(tc, 1.6), hp = Audio.ctx.createBiquadFilter(), g = Audio.ctx.createGain();
            hp.type = 'highpass'; hp.frequency.value = 5000;
            g.gain.setValueAtTime(0.12, tc); g.gain.exponentialRampToValueAtTime(0.001, tc + 1.5);
            n.connect(hp); hp.connect(g); g.connect(p.out);
            return 2.4;
        }
        // game over: a slow falling line over a low minor chord
        const tri = Object.assign({}, lead, { waves: [['triangle', 0]], sus: 0.8, r: 0.3, cut: 2000 });
        [12, 10, 7, 3, 0].forEach((n, i) =>
            this._voice(p, t + i * 0.32, base + n, 0.3, Object.assign({}, tri, { gain: 0.07 })));
        for (const n of [0, 3, 7]) {
            this._voice(p, t + 1.3, tr.root + 12 + n, 1.8, {
                waves: [['sawtooth', -9], ['sawtooth', 9]], gain: 0.03, a: 0.3, sus: 0.8, r: 1.2, cut: 900, dest: p.out, verb: 0.6,
            });
        }
        const o = Audio.ctx.createOscillator(), g = Audio.ctx.createGain();
        o.frequency.setValueAtTime(70, t + 1.3);
        o.frequency.exponentialRampToValueAtTime(35, t + 2.6);
        g.gain.setValueAtTime(0.5, t + 1.3);
        g.gain.exponentialRampToValueAtTime(0.001, t + 2.8);
        o.connect(g); g.connect(p.out);
        o.start(t + 1.3); o.stop(t + 2.9);
        return 3.4;
    },

    // --- Lead melody (generated once per track, same every time) ---

    // An AABA'-style tune over the progression: chord tones on the beat,
    // steps between; each bar is a 16-slot array of {idx, len} or null.
    _melody(tr) {
        const rnd = this._rng(tr.id.replace(/^boss:.*/, 'boss'));
        const bars = tr.prog.length;
        const phrase = () => {
            const out = [];
            let prev = tr.prog[0] + 2;
            for (let b = 0; b < bars; b++) {
                const deg = tr.prog[b], last = b === bars - 1;
                const rhythm = last ? MUSIC_ENDING : MUSIC_RHYTHMS[Math.floor(rnd() * MUSIC_RHYTHMS.length)];
                const onsets = [];
                for (let s = 0; s < 16; s++) if (rhythm[s] === 'x') onsets.push(s);
                const bar = new Array(16).fill(null);
                onsets.forEach((s, k) => {
                    const len = (k + 1 < onsets.length ? onsets[k + 1] : 16) - s;
                    let idx;
                    if (s % 4 === 0 || (last && k === onsets.length - 1)) {
                        // nearest chord tone to the previous note (sometimes the next one up/down)
                        const tones = [];
                        for (let i = -2; i <= 11; i++) if ([0, 2, 4].includes(((i - deg) % 7 + 7) % 7)) tones.push(i);
                        tones.sort((x, y) => Math.abs(x - prev) - Math.abs(y - prev));
                        idx = (last && k === onsets.length - 1) ? tones.find(i => ((i - deg) % 7 + 7) % 7 === 0) : tones[rnd() < 0.7 ? 0 : 1];
                    } else {
                        idx = prev + [-1, 1, -2, 2, 1, -1][Math.floor(rnd() * 6)];
                    }
                    idx = Math.max(-2, Math.min(11, idx));
                    bar[s] = { idx, len };
                    prev = idx;
                });
                out.push(bar);
            }
            return out;
        };
        const A = phrase(), B = phrase();
        const half = Math.floor(bars / 2);
        return [...A, ...A.slice(0, half), ...B.slice(half)];
    },

    _rng(seed) {
        let a = 0;
        for (const ch of seed) a = (a * 31 + ch.charCodeAt(0)) | 0;
        return () => {
            a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    },
};
