// ============================================================
//  PARTICLE SYSTEM
// ============================================================
const Particles = {
    particles: [],
    shockwaves: [], // Expanding ring effects
    maxParticles: 1500,

    spawn(x, y, count, opts = {}) {
        // Apply particle density setting
        const densityScale = { low: 0.3, medium: 0.6, high: 1.0 };
        const scale = densityScale[Settings.values.particleDensity] || 1.0;
        const actualCount = Math.min(Math.max(1, Math.round(count * scale)), this.maxParticles - this.particles.length);
        if (actualCount <= 0) return;
        for (let i = 0; i < actualCount; i++) {
            const angle = opts.angle !== undefined ? opts.angle + (Math.random() - 0.5) * (opts.spread || Math.PI * 2) : Math.random() * Math.PI * 2;
            const speed = (opts.speed || 100) * (0.5 + Math.random());
            this.particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: opts.life || (0.3 + Math.random() * 0.5),
                maxLife: opts.life || (0.3 + Math.random() * 0.5),
                size: opts.size || (1 + Math.random() * 2),
                color: opts.color || '#00ffff',
                decay: opts.decay || 1
            });
        }
    },

    // Spawn an expanding shockwave ring
    spawnShockwave(x, y, color, maxRadius, duration) {
        this.shockwaves.push({
            x, y, color: color || '#ffffff',
            radius: 0,
            maxRadius: maxRadius || 60,
            life: duration || 0.4,
            maxLife: duration || 0.4
        });
    },

    update(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vx *= (1 - 0.5 * dt);
            p.vy *= (1 - 0.5 * dt);
            p.life -= dt * p.decay;
            if (p.life <= 0) this.particles.splice(i, 1);
        }
        // Update shockwaves
        for (let i = this.shockwaves.length - 1; i >= 0; i--) {
            const s = this.shockwaves[i];
            s.life -= dt;
            const t = 1 - s.life / s.maxLife; // 0→1 over lifetime
            s.radius = s.maxRadius * t;
            if (s.life <= 0) this.shockwaves.splice(i, 1);
        }
    },

    draw(ctx) {
        const prevComposite = ctx.globalCompositeOperation;
        ctx.globalCompositeOperation = 'lighter';

        for (const p of this.particles) {
            const t = p.life / p.maxLife; // 1→0 over lifetime
            const currentSize = p.size * (0.3 + t * 0.7);

            // GPU glow halo for bright/fresh particles
            if (t > 0.4 && p.size >= 1.5) {
                Renderer.addGlow(p.x, p.y, Renderer.colorToHex(p.color), currentSize * 5, t * 0.25);
            }

            // Soft outer glow
            ctx.globalAlpha = t * 0.2;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, currentSize * 2.5, 0, Math.PI * 2);
            ctx.fill();

            // Main particle
            ctx.globalAlpha = t * 0.9;
            ctx.beginPath();
            ctx.arc(p.x, p.y, currentSize, 0, Math.PI * 2);
            ctx.fill();

            // White-hot centre on large/fresh particles
            if (t > 0.5 && p.size >= 2) {
                ctx.fillStyle = '#ffffff';
                ctx.globalAlpha = (t - 0.5) * 1.2;
                ctx.beginPath();
                ctx.arc(p.x, p.y, currentSize * 0.35, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.globalCompositeOperation = prevComposite;

        // Shockwave rings
        for (const s of this.shockwaves) {
            const t = 1 - s.life / s.maxLife;
            // GPU glow at shockwave centre
            Renderer.addGlow(s.x, s.y, Renderer.colorToHex(s.color), s.radius * 1.5, (1 - t) * 0.5);

            ctx.globalAlpha = (1 - t) * 0.6;
            ctx.strokeStyle = s.color;
            ctx.lineWidth = 2 * (1 - t) + 0.5;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.globalAlpha = 1;
    },

    clear() { this.particles.length = 0; this.shockwaves.length = 0; }
};


// ============================================================
//  SCREEN SHAKE
// ============================================================
const ScreenShake = {
    intensity: 0,
    duration: 0,
    offsetX: 0,
    offsetY: 0,

    trigger(intensity, duration) {
        this.intensity = intensity;
        this.duration = duration;
    },

    update(dt) {
        if (this.duration > 0) {
            this.duration -= dt;
            const t = this.intensity * (this.duration > 0 ? 1 : 0);
            this.offsetX = (Math.random() - 0.5) * t * 2;
            this.offsetY = (Math.random() - 0.5) * t * 2;
        } else {
            this.offsetX = 0;
            this.offsetY = 0;
        }
    }
};

// ============================================================
//  SCREEN TRANSITIONS
// ============================================================
const Transition = {
    active: false,
    alpha: 0,
    fadeSpeed: 2.0,
    phase: 'none',  // 'fade_out', 'hold', 'fade_in', 'none'
    holdTimer: 0,
    holdDuration: 0.15,
    onMidpoint: null,  // Callback to execute at the midpoint (when fully black)

    // Start a fade-out → callback → fade-in transition
    start(callback, speed) {
        this.active = true;
        this.alpha = 0;
        this.fadeSpeed = speed || 3.5;
        this.phase = 'fade_out';
        this.onMidpoint = callback;
    },

    update(dt) {
        if (!this.active) return;

        switch (this.phase) {
            case 'fade_out':
                this.alpha += this.fadeSpeed * dt;
                if (this.alpha >= 1) {
                    this.alpha = 1;
                    this.phase = 'hold';
                    this.holdTimer = this.holdDuration;
                    // Execute midpoint callback
                    if (this.onMidpoint) {
                        this.onMidpoint();
                        this.onMidpoint = null;
                    }
                }
                break;
            case 'hold':
                this.holdTimer -= dt;
                if (this.holdTimer <= 0) {
                    this.phase = 'fade_in';
                }
                break;
            case 'fade_in':
                this.alpha -= this.fadeSpeed * dt;
                if (this.alpha <= 0) {
                    this.alpha = 0;
                    this.phase = 'none';
                    this.active = false;
                }
                break;
        }
    },

    draw(ctx) {
        if (!this.active || this.alpha < 0.02) return;
        ctx.fillStyle = `rgba(10, 6, 18, ${this.alpha})`;
        ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    }
};
