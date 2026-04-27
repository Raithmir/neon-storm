// ============================================================
//  AUDIO SYSTEM (Procedural SFX via Web Audio API)
// ============================================================
const Audio = {
    ctx: null,
    masterVolume: 1.0,
    sfxVolume: 0.8,
    musicVolume: 0.5,
    enabled: true,

    init() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        // Resume on user interaction (browser policy)
        const resume = () => {
            if (this.ctx.state === 'suspended') this.ctx.resume();
            window.removeEventListener('click', resume);
            window.removeEventListener('keydown', resume);
        };
        window.addEventListener('click', resume);
        window.addEventListener('keydown', resume);
    },

    _createGain(volume) {
        const gain = this.ctx.createGain();
        gain.gain.value = volume * this.sfxVolume * this.masterVolume;
        gain.connect(this.ctx.destination);
        return gain;
    },

    // Pitch randomization helper — returns a multiplier near 1.0
    _rPitch(range) { return 1 + (Math.random() - 0.5) * (range || 0.15); },

    playShot() {
        if (!this.enabled || !this.ctx) return;
        const t = this.ctx.currentTime;
        const p = this._rPitch(0.2);
        const osc = this.ctx.createOscillator();
        const gain = this._createGain(0.18);
        osc.type = 'square';
        osc.frequency.setValueAtTime(880 * p, t);
        osc.frequency.exponentialRampToValueAtTime(440 * p, t + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
        osc.connect(gain);
        osc.start(t);
        osc.stop(t + 0.06);
    },

    playLaser() {
        if (!this.enabled || !this.ctx) return;
        const t = this.ctx.currentTime;
        const p = this._rPitch(0.1);
        const osc = this.ctx.createOscillator();
        const gain = this._createGain(0.14);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(600 * p, t);
        osc.frequency.linearRampToValueAtTime(200 * p, t + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        osc.connect(gain);
        osc.start(t);
        osc.stop(t + 0.15);
    },

    playExplosionSmall() {
        if (!this.enabled || !this.ctx) return;
        const t = this.ctx.currentTime;
        const p = this._rPitch(0.3);
        const duration = 0.15 + Math.random() * 0.1;
        const bufferSize = Math.floor(this.ctx.sampleRate * duration);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        const gain = this._createGain(0.4);
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2000 * p, t);
        filter.frequency.exponentialRampToValueAtTime(200 * p, t + duration);
        source.connect(filter);
        filter.connect(gain);
        source.start(t);
    },

    playExplosionLarge() {
        if (!this.enabled || !this.ctx) return;
        const t = this.ctx.currentTime;
        const bufferSize = this.ctx.sampleRate * 0.5;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 1.5);
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        const gain = this._createGain(0.45);
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(3000, t);
        filter.frequency.exponentialRampToValueAtTime(80, t + 0.5);
        source.connect(filter);
        filter.connect(gain);
        source.start(t);
    },

    playDash() {
        if (!this.enabled || !this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this._createGain(0.12);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, t);
        osc.frequency.exponentialRampToValueAtTime(1200, t + 0.08);
        osc.frequency.exponentialRampToValueAtTime(300, t + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        osc.connect(gain);
        osc.start(t);
        osc.stop(t + 0.18);
    },

    playBomb() {
        if (!this.enabled || !this.ctx) return;
        const t = this.ctx.currentTime;
        // Deep boom
        const osc = this.ctx.createOscillator();
        const gain = this._createGain(0.4);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(120, t);
        osc.frequency.exponentialRampToValueAtTime(30, t + 0.6);
        gain.gain.setValueAtTime(0.5 * this.sfxVolume * this.masterVolume, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
        osc.connect(gain);
        osc.start(t);
        osc.stop(t + 0.8);
        // Noise sweep
        const bufferSize = this.ctx.sampleRate * 0.6;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        const g2 = this._createGain(0.2);
        src.connect(g2);
        src.start(t);
    },

    playPowerUp() {
        if (!this.enabled || !this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this._createGain(0.12);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523, t);
        osc.frequency.setValueAtTime(659, t + 0.06);
        osc.frequency.setValueAtTime(784, t + 0.12);
        osc.frequency.setValueAtTime(1047, t + 0.18);
        gain.gain.setValueAtTime(0.25 * this.sfxVolume * this.masterVolume, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        osc.connect(gain);
        osc.start(t);
        osc.stop(t + 0.3);
    },

    playGraze() {
        if (!this.enabled || !this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this._createGain(0.1);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime((2000 + Math.random() * 1000) * this._rPitch(0.3), t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
        osc.connect(gain);
        osc.start(t);
        osc.stop(t + 0.03);
    },

    playMenuSelect() {
        if (!this.enabled || !this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this._createGain(0.1);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(660, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        osc.connect(gain);
        osc.start(t);
        osc.stop(t + 0.08);
    },

    playMenuNav() {
        if (!this.enabled || !this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this._createGain(0.14);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        osc.connect(gain);
        osc.start(t);
        osc.stop(t + 0.04);
    },

    playChainMilestone(tier) {
        if (!this.enabled || !this.ctx) return;
        const t = this.ctx.currentTime;
        const freqs = { 2: [523, 659], 3: [523, 659, 784], 5: [523, 659, 784, 1047], 8: [523, 784, 1047, 1319] };
        const notes = freqs[tier] || [523, 659];
        const osc = this.ctx.createOscillator();
        const gain = this._createGain(0.1);
        osc.type = 'sine';
        notes.forEach((f, i) => osc.frequency.setValueAtTime(f, t + i * 0.06));
        gain.gain.setValueAtTime(0.2 * this.sfxVolume * this.masterVolume, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + notes.length * 0.06 + 0.1);
        osc.connect(gain);
        osc.start(t);
        osc.stop(t + notes.length * 0.06 + 0.1);
    },

    playSurgeActivate() {
        if (!this.enabled || !this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this._createGain(0.4);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, t);
        osc.frequency.exponentialRampToValueAtTime(1600, t + 0.3);
        gain.gain.setValueAtTime(0.3 * this.sfxVolume * this.masterVolume, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        osc.connect(gain);
        osc.start(t);
        osc.stop(t + 0.5);
        // Layered shimmer
        const osc2 = this.ctx.createOscillator();
        const gain2 = this._createGain(0.18);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(800, t);
        osc2.frequency.setValueAtTime(1200, t + 0.15);
        osc2.frequency.setValueAtTime(1600, t + 0.3);
        gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        osc2.connect(gain2);
        osc2.start(t);
        osc2.stop(t + 0.5);
    },

    playPlayerDeath() {
        if (!this.enabled || !this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this._createGain(0.2);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(400, t);
        osc.frequency.exponentialRampToValueAtTime(50, t + 0.5);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
        osc.connect(gain);
        osc.start(t);
        osc.stop(t + 0.6);
        this.playExplosionLarge();
    },

    playShieldHit() {
        if (!this.enabled || !this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this._createGain(0.12);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, t);
        osc.frequency.exponentialRampToValueAtTime(400, t + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        osc.connect(gain);
        osc.start(t);
        osc.stop(t + 0.12);
    },

    playAsteroidBreak() {
        if (!this.enabled || !this.ctx) return;
        const t = this.ctx.currentTime;
        const bufferSize = this.ctx.sampleRate * 0.15;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        const gain = this._createGain(0.1);
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1500, t);
        filter.frequency.exponentialRampToValueAtTime(300, t + 0.15);
        source.connect(filter);
        filter.connect(gain);
        source.start(t);
    },

    playEscortHit() {
        if (!this.enabled || !this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this._createGain(0.1);
        osc.type = 'square';
        osc.frequency.setValueAtTime(300, t);
        osc.frequency.exponentialRampToValueAtTime(100, t + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        osc.connect(gain);
        osc.start(t);
        osc.stop(t + 0.18);
    },

    // Subtle hit tick — plays when player bullet damages an enemy
    _lastHitTime: 0,
    playHitTick() {
        if (!this.enabled || !this.ctx) return;
        const t = this.ctx.currentTime;
        // Throttle to max one tick per 0.04s to avoid audio spam
        if (t - this._lastHitTime < 0.04) return;
        this._lastHitTime = t;
        const osc = this.ctx.createOscillator();
        const gain = this._createGain(0.09);
        const p = this._rPitch(0.15);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1400 * p, t);
        osc.frequency.exponentialRampToValueAtTime(800 * p, t + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        osc.connect(gain);
        osc.start(t);
        osc.stop(t + 0.04);
    },

    // Music hooks (for future)
    playMusic(trackId) { /* TODO: Load and play audio file */ },
    stopMusic() { /* TODO */ },
    crossfadeMusic(trackId) { /* TODO */ }
};
