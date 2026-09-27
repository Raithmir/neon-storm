// ============================================================
//  AUDIO SYSTEM (Procedural SFX via Web Audio API; music is in music.js)
// ============================================================
const Audio = {
    ctx: null,
    masterVolume: 1.0,
    sfxVolume: 0.8,
    musicVolume: 0.5,
    enabled: true,

    init() {
        // Defer AudioContext creation to first user interaction (browser policy)
        const createCtx = () => {
            if (this.ctx) return;
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this._buildMix();
            window.removeEventListener('click', createCtx);
            window.removeEventListener('keydown', createCtx);
            window.removeEventListener('touchstart', createCtx);
        };
        window.addEventListener('click', createCtx);
        window.addEventListener('keydown', createCtx);
        window.addEventListener('touchstart', createCtx);
    },

    // Mix: SFX bus and music bus (volume → pause filter → duck) share one
    // compressor so explosions over the music never clip. Music (music.js)
    // plays into musicBus and sets its level each frame.
    master: null,
    sfxBus: null,
    sfxVerb: null,
    musicBus: null,
    musicFilter: null,
    musicDuck: null,

    _buildMix() {
        const c = this.ctx;
        this.master = c.createDynamicsCompressor();
        this.master.threshold.value = -12;
        this.master.knee.value = 10;
        this.master.ratio.value = 4;
        this.master.attack.value = 0.004;
        this.master.release.value = 0.2;
        // The compressor adds makeup gain (~+3.3 dB at these settings); trim it
        // back so quiet sounds keep their old level and only peaks are squeezed
        const trim = c.createGain();
        trim.gain.value = 0.68;
        this.master.connect(trim);
        trim.connect(c.destination);
        this.sfxBus = c.createGain();
        this.sfxBus.connect(this.master);
        // Short room reverb for big SFX tails (bombs, large explosions, stings)
        const conv = c.createConvolver();
        const len = Math.floor(c.sampleRate * 1.4);
        const ir = c.createBuffer(2, len, c.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
            const d = ir.getChannelData(ch);
            for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
        }
        conv.buffer = ir;
        this.sfxVerb = c.createGain();
        const wet = c.createGain();
        wet.gain.value = 0.3;
        this.sfxVerb.connect(conv); conv.connect(wet); wet.connect(this.master);
        this._noiseBuf = null;
        this.musicBus = c.createGain();
        this.musicBus.gain.value = 0;
        this.musicFilter = c.createBiquadFilter();
        this.musicFilter.type = 'lowpass';
        this.musicFilter.frequency.value = 20000;
        this.musicFilter.Q.value = 0.7;
        this.musicDuck = c.createGain();
        this.musicBus.connect(this.musicFilter);
        this.musicFilter.connect(this.musicDuck);
        this.musicDuck.connect(this.master);
    },

    // Dip the music under a big sound (bomb, death) and let it swell back
    duckMusic(depth, recover) {
        if (!this.musicDuck) return;
        const g = this.musicDuck.gain, t = this.ctx.currentTime;
        g.cancelScheduledValues(t);
        g.setTargetAtTime(1 - depth, t, 0.015);
        g.setTargetAtTime(1, t + 0.08, recover / 3);
    },

    _createGain(volume) {
        if (!this.ctx) return null;
        const gain = this.ctx.createGain();
        gain.gain.value = volume * this.sfxVolume * this.masterVolume;
        gain.connect(this.sfxBus || this.ctx.destination);
        return gain;
    },

    // --- SFX building blocks ---
    // Every sound is a few layers of _tone (oscillator + pitch glide + envelope)
    // and _noise (a slice of one shared noise buffer through a swept filter),
    // into an output gain at the sound's volume (× SFX volume) on the SFX bus.

    _rPitch(range) { return 1 + (Math.random() - 0.5) * (range || 0.15); },

    // Limit how often a sound can start (a bomb can kill dozens of enemies in one frame)
    _last: {},
    _throttle(key, gap) {
        const t = this.ctx.currentTime, last = this._last[key];
        if (last !== undefined && t - last < gap) return true;
        this._last[key] = t;
        return false;
    },

    _ok() { return this.enabled && this.ctx && this.sfxVolume > 0; },

    _tone(t, out, o) {
        const c = this.ctx;
        const osc = c.createOscillator(), g = c.createGain();
        osc.type = o.type || 'sine';
        osc.frequency.setValueAtTime(o.f, t);
        if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + (o.glide || o.dur));
        if (o.detune) osc.detune.value = o.detune;
        const a = o.a || 0.003;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(o.gain || 1, t + a);
        g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
        let node = osc;
        if (o.lp) {
            const f = c.createBiquadFilter();
            f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = o.q || 0.7;
            osc.connect(f); node = f;
        }
        node.connect(g); g.connect(out);
        osc.start(t); osc.stop(t + o.dur + 0.02);
        return g;
    },

    _noise(t, out, o) {
        const c = this.ctx;
        if (!this._noiseBuf || this._noiseBuf.sampleRate !== c.sampleRate) {
            const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
            const d = b.getChannelData(0);
            for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
            this._noiseBuf = b;
        }
        const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
        src.buffer = this._noiseBuf;
        f.type = o.filter || 'lowpass';
        f.frequency.setValueAtTime(o.f, t);
        if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + (o.glide || o.dur));
        f.Q.value = o.q || 0.7;
        const a = o.a || 0.002;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(o.gain || 1, t + a);
        g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
        src.connect(f); f.connect(g); g.connect(out);
        src.start(t, Math.random() * 1.5, o.dur + 0.05);
        return g;
    },

    _verb(node, amount) {
        if (!this.sfxVerb) return;
        const s = this.ctx.createGain();
        s.gain.value = amount;
        node.connect(s); s.connect(this.sfxVerb);
    },

    // Glassy pings: neon ships shatter, so explosions carry a little glass
    _glass(t, out, n, gain) {
        for (let i = 0; i < n; i++) {
            const f = 2400 + Math.random() * 3200;
            this._tone(t + Math.random() * 0.06, out, { f, f2: f * 0.97, dur: 0.06 + Math.random() * 0.1, gain: gain * (0.5 + Math.random() * 0.5) });
        }
    },

    // --- Player ---

    // Base shot: fires constantly, so it is short and soft (a triangle "pew" + a click)
    playShot() {
        if (!this._ok() || this._throttle('shot', 0.03)) return;
        const t = this.ctx.currentTime, p = this._rPitch(0.12);
        const out = this._createGain(0.32);
        this._tone(t, out, { type: 'triangle', f: 1500 * p, f2: 650 * p, dur: 0.06, gain: 0.8 });
        this._noise(t, out, { filter: 'highpass', f: 5000, dur: 0.015, gain: 0.25 });
    },

    // Homing weapon: a missile whoosh
    playMissile() {
        if (!this._ok() || this._throttle('missile', 0.08)) return;
        const t = this.ctx.currentTime, p = this._rPitch(0.2);
        const out = this._createGain(0.25);
        this._noise(t, out, { filter: 'bandpass', f: 700 * p, f2: 3200 * p, q: 3, dur: 0.2, a: 0.02, gain: 1 });
        this._tone(t, out, { type: 'sine', f: 380 * p, f2: 760 * p, dur: 0.1, gain: 0.35 });
    },

    // Laser weapon: a sustained hum while the beam is on. Player code calls
    // laserHum(true) every frame it fires; frame() turns it off when that stops
    // (including pauses and screen changes).
    _laser: null,
    _laserWant: false,
    laserHum(on) { this._laserWant = this._laserWant || on; },

    frame() {
        const want = this._laserWant && this._ok();
        this._laserWant = false;
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        if (want && !this._laser) {
            const c = this.ctx;
            const out = this._createGain(0.12);
            const g = c.createGain(), f = c.createBiquadFilter(), lfo = c.createOscillator(), lg = c.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(1, t + 0.05);
            f.type = 'lowpass'; f.frequency.value = 1400; f.Q.value = 4;
            lfo.frequency.value = 22; lg.gain.value = 0.25;
            lfo.connect(lg); lg.connect(g.gain);
            const oscs = [110, 165, 220.5].map((fr, i) => {
                const o = c.createOscillator();
                o.type = i === 2 ? 'square' : 'sawtooth';
                o.frequency.value = fr;
                o.connect(f); o.start(t);
                return o;
            });
            f.connect(g); g.connect(out);
            lfo.start(t);
            this._laser = { g, oscs: [...oscs, lfo] };
        } else if (!want && this._laser) {
            const L = this._laser;
            L.g.gain.cancelScheduledValues(t);
            L.g.gain.setValueAtTime(L.g.gain.value || 0.5, t);
            L.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
            for (const o of L.oscs) o.stop(t + 0.1);
            this._laser = null;
        }
    },

    playDash() {
        if (!this._ok()) return;
        const t = this.ctx.currentTime;
        const out = this._createGain(0.4);
        this._noise(t, out, { filter: 'bandpass', f: 1200, f2: 5000, q: 2, dur: 0.14, a: 0.02, gain: 0.9 });
        this._tone(t, out, { f: 300, f2: 1200, glide: 0.08, dur: 0.16, gain: 0.5 });
    },

    playBomb() {
        if (!this._ok()) return;
        const t = this.ctx.currentTime;
        this.duckMusic(0.6, 1.4);
        const out = this._createGain(0.5);
        this._tone(t, out, { f: 110, f2: 24, dur: 1.3, gain: 1 });                                        // sub boom
        const n = this._noise(t, out, { f: 300, f2: 6000, glide: 0.25, dur: 1.1, a: 0.05, gain: 0.6 });   // blast wave
        this._verb(n, 0.8);
        for (const f of [1320, 1760, 2640]) {                                                              // shimmer
            const g = this._tone(t + 0.1, out, { f, dur: 1.4, a: 0.05, gain: 0.05 });
            this._verb(g, 1);
        }
    },

    playPowerUp() {
        if (!this._ok()) return;
        const t = this.ctx.currentTime;
        const out = this._createGain(0.4);
        [523, 659, 784, 1047].forEach((f, i) => {
            this._tone(t + i * 0.05, out, { type: 'square', f, dur: 0.09, gain: 0.35, lp: 3000 });
            this._tone(t + 0.16 + i * 0.05, out, { type: 'triangle', f: f * 2, dur: 0.08, gain: 0.2 });   // echo an octave up
        });
    },

    // Extra life: a bigger fanfare than a power-up
    playExtend() {
        if (!this._ok()) return;
        const t = this.ctx.currentTime;
        const out = this._createGain(0.45);
        [523, 659, 784, 1047, 1319, 1568].forEach((f, i) =>
            this._tone(t + i * 0.055, out, { type: 'square', f, dur: 0.1, gain: 0.3, lp: 3500 }));
        for (const f of [1047, 1319, 1568]) {
            const g = this._tone(t + 0.34, out, { type: 'triangle', f, dur: 0.7, a: 0.01, gain: 0.3 });
            this._verb(g, 0.6);
        }
    },

    // Graze: a bright shimmering tick, distinct from hits
    playGraze() {
        if (!this._ok() || this._throttle('graze', 0.025)) return;
        const t = this.ctx.currentTime, p = this._rPitch(0.25);
        const out = this._createGain(0.09);
        this._tone(t, out, { f: 3200 * p, f2: 4400 * p, dur: 0.05, gain: 0.8 });
        this._noise(t, out, { filter: 'highpass', f: 7000, dur: 0.035, gain: 0.5 });
    },

    playSurgeActivate() {
        if (!this._ok()) return;
        const t = this.ctx.currentTime;
        const out = this._createGain(0.52);
        this._tone(t, out, { type: 'sawtooth', f: 200, f2: 1600, glide: 0.3, dur: 0.55, gain: 0.8, lp: 4000 });
        this._noise(t, out, { filter: 'bandpass', f: 400, f2: 8000, q: 1.5, glide: 0.35, dur: 0.5, a: 0.05, gain: 0.5 });
        [800, 1200, 1600, 2400].forEach((f, i) => {
            const g = this._tone(t + i * 0.08, out, { f, dur: 0.4, gain: 0.25 });
            this._verb(g, 0.5);
        });
    },

    playPlayerDeath() {
        if (!this._ok()) return;
        const t = this.ctx.currentTime;
        this.duckMusic(0.75, 1.8);
        const out = this._createGain(0.18);
        this._tone(t, out, { type: 'sawtooth', f: 500, f2: 40, dur: 0.7, gain: 0.8, lp: 1800 });
        this._glass(t, out, 8, 0.35);
        delete this._last.explL;
        this.playExplosionLarge();
    },

    playShieldHit() {
        if (!this._ok()) return;
        const t = this.ctx.currentTime;
        const out = this._createGain(0.12);
        // Inharmonic partials ring like struck metal
        this._tone(t, out, { f: 1200, f2: 900, dur: 0.28, gain: 0.7 });
        this._tone(t, out, { f: 1200 * 2.76, f2: 900 * 2.76, dur: 0.18, gain: 0.3 });
        this._noise(t, out, { filter: 'highpass', f: 3000, dur: 0.04, gain: 0.4 });
    },

    // --- Enemies ---

    // Subtle hit tick when a player shot damages an enemy
    playHitTick() {
        if (!this._ok() || this._throttle('hit', 0.04)) return;
        const t = this.ctx.currentTime, p = this._rPitch(0.15);
        const out = this._createGain(0.08);
        this._tone(t, out, { type: 'triangle', f: 1400 * p, f2: 800 * p, dur: 0.04, gain: 0.8 });
    },

    playExplosionSmall() {
        if (!this._ok() || this._throttle('explS', 0.035)) return;
        const t = this.ctx.currentTime, p = this._rPitch(0.3);
        const out = this._createGain(0.4);
        this._tone(t, out, { f: 150 * p, f2: 45, dur: 0.16, gain: 0.8 });                                   // thump
        this._noise(t, out, { f: 2600 * p, f2: 220 * p, dur: 0.22 + Math.random() * 0.1, gain: 0.8 });      // body
        this._glass(t + 0.01, out, 2, 0.12);
    },

    playExplosionLarge() {
        if (!this._ok() || this._throttle('explL', 0.06)) return;
        const t = this.ctx.currentTime;
        const out = this._createGain(0.3);
        this._tone(t, out, { f: 90, f2: 28, dur: 0.9, gain: 1 });                                            // sub
        const n = this._noise(t, out, { f: 3500, f2: 120, dur: 1.1, gain: 0.8 });                            // body
        this._verb(n, 0.6);
        for (let i = 0; i < 6; i++) {                                                                         // crackle
            this._noise(t + 0.08 + Math.random() * 0.5, out, { filter: 'bandpass', f: 1500 + Math.random() * 2500, q: 4, dur: 0.05, gain: 0.5 });
        }
        this._glass(t + 0.02, out, 5, 0.18);
    },

    playAsteroidBreak() {
        if (!this._ok() || this._throttle('rock', 0.04)) return;
        const t = this.ctx.currentTime, p = this._rPitch(0.25);
        const out = this._createGain(0.09);
        this._tone(t, out, { f: 95 * p, f2: 40, dur: 0.16, gain: 0.7 });
        this._noise(t, out, { f: 1400 * p, f2: 200, dur: 0.2, gain: 0.8 });
        for (let i = 0; i < 3; i++) this._noise(t + Math.random() * 0.08, out, { filter: 'bandpass', f: 800 + Math.random() * 1200, q: 5, dur: 0.04, gain: 0.5 });
    },

    playEscortHit() {
        if (!this._ok() || this._throttle('escort', 0.08)) return;
        const t = this.ctx.currentTime;
        const out = this._createGain(0.22);
        this._tone(t, out, { type: 'square', f: 300, f2: 100, dur: 0.18, gain: 0.8, lp: 1500 });
    },

    // Mid-boss arrival: two short alarm blips
    playMidbossAlert() {
        if (!this._ok()) return;
        const t = this.ctx.currentTime;
        const out = this._createGain(0.12);
        for (let i = 0; i < 2; i++) {
            this._tone(t + i * 0.28, out, { type: 'sawtooth', f: 660, f2: 880, glide: 0.18, dur: 0.22, gain: 0.8, lp: 2400, q: 3 });
        }
    },

    // Boss WARNING: a rising-and-falling siren over a low drone (≈ the 3 s banner)
    playBossWarning() {
        if (!this._ok()) return;
        const c = this.ctx, t = c.currentTime;
        const out = this._createGain(0.14);
        const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(520, t);
        for (let i = 0; i < 3; i++) {
            o.frequency.linearRampToValueAtTime(820, t + i * 0.85 + 0.42);
            o.frequency.linearRampToValueAtTime(520, t + i * 0.85 + 0.85);
        }
        f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 1.5;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.8, t + 0.1);
        g.gain.setValueAtTime(0.8, t + 2.3);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
        o.connect(f); f.connect(g); g.connect(out);
        o.start(t); o.stop(t + 2.65);
        this._tone(t, out, { f: 55, dur: 2.7, a: 0.4, gain: 0.9 });
    },

    // Boss phase change: a descending digital glitch run into a large explosion
    playBossPhase() {
        if (!this._ok()) return;
        const t = this.ctx.currentTime;
        const out = this._createGain(0.2);
        for (let i = 0; i < 12; i++) {
            const f = 2400 * Math.pow(0.85, i) * this._rPitch(0.3);
            this._tone(t + i * 0.025, out, { type: 'square', f, dur: 0.03, gain: 0.7, lp: 5000 });
        }
        delete this._last.explL;
        this.playExplosionLarge();
    },

    // --- UI ---

    playMenuNav() {
        if (!this._ok()) return;
        const t = this.ctx.currentTime;
        const out = this._createGain(0.23);
        this._tone(t, out, { type: 'triangle', f: 900, dur: 0.04, gain: 0.8, lp: 3000 });
    },

    playMenuSelect() {
        if (!this._ok()) return;
        const t = this.ctx.currentTime;
        const out = this._createGain(0.1);
        this._tone(t, out, { type: 'triangle', f: 660, dur: 0.07, gain: 0.8 });
        this._tone(t + 0.05, out, { type: 'triangle', f: 990, dur: 0.1, gain: 0.8 });
    },

    playChainMilestone(tier) {
        if (!this._ok()) return;
        const t = this.ctx.currentTime;
        const freqs = { 2: [523, 659], 3: [523, 659, 784], 5: [523, 659, 784, 1047], 8: [523, 784, 1047, 1319] };
        const notes = freqs[tier] || [523, 659];
        const out = this._createGain(0.23);
        notes.forEach((f, i) => {
            const g = this._tone(t + i * 0.06, out, { type: 'triangle', f, dur: 0.14, gain: 0.8 });
            this._verb(g, 0.3);
        });
    },
};
