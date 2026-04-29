// ============================================================
//  PARTICLE SYSTEM
// ============================================================
const Particles = {
    particles: [],
    shockwaves: [], // Expanding ring effects
    maxParticles: 3000,

    spawn(x, y, count, opts = {}) {
        const densityScale = { low: 0.3, medium: 0.6, high: 1.0 };
        const scale = densityScale[Settings.values.particleDensity] || 1.0;
        const actualCount = Math.min(Math.max(1, Math.round(count * scale)), this.maxParticles - this.particles.length);
        if (actualCount <= 0) return;
        for (let i = 0; i < actualCount; i++) {
            const angle = opts.angle !== undefined ? opts.angle + (Math.random() - 0.5) * (opts.spread || Math.PI * 2) : Math.random() * Math.PI * 2;
            const speed = (opts.speed || 100) * (0.5 + Math.random());
            const life = opts.life || (0.3 + Math.random() * 0.5);
            const size = opts.size || (1 + Math.random() * 2);
            const p = {
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life, maxLife: life, size,
                color: opts.color || '#00ffff',
                decay: opts.decay || 1,
                _pp: null, // Pixi Particle
            };
            if (Renderer.usePixi && Renderer.particleLayer && Renderer.glowTex) {
                const s = (size * 2) / 32;
                p._pp = new PIXI.Particle({
                    texture: Renderer.glowTex,
                    x, y,
                    scaleX: s, scaleY: s,
                    anchorX: 0.5, anchorY: 0.5,
                    tint: Renderer.colorToHex(p.color),
                    alpha: 0.85,
                });
                Renderer.particleLayer.addParticle(p._pp);
            }
            this.particles.push(p);
        }
    },

    // Multi-layer explosion: shockwave + particle bursts + GPU fireball + addGlow
    spawnExplosion(x, y, opts = {}) {
        const style = opts.style || 'medium';
        const color  = opts.color  || '#ff8800';
        const color2 = opts.color2 || '#ffffff';
        const styles = {
            small:  { shock: 40,  core: 15, coreSpd: 120, coreLife: 0.4, coreSize: 1.5, spark: 8,  sparkSpd: 80,  sparkLife: 0.6, sparkSize: 2,   fScale: 1.2, fDur: 0.35 },
            medium: { shock: 70,  core: 30, coreSpd: 200, coreLife: 0.6, coreSize: 2.5, spark: 18, sparkSpd: 140, sparkLife: 0.9, sparkSize: 3,   fScale: 2.2, fDur: 0.45 },
            large:  { shock: 110, core: 55, coreSpd: 280, coreLife: 0.8, coreSize: 3.5, spark: 28, sparkSpd: 200, sparkLife: 1.2, sparkSize: 4,   fScale: 3.5, fDur: 0.55 },
            mega:   { shock: 160, core: 80, coreSpd: 370, coreLife: 1.0, coreSize: 5,   spark: 45, sparkSpd: 280, sparkLife: 1.5, sparkSize: 6,   fScale: 5.5, fDur: 0.65 },
        };
        const s = styles[style] || styles.medium;
        this.spawnShockwave(x, y, color, s.shock, 0.4);
        this.spawn(x, y, s.core,  { color: color2, speed: s.coreSpd,  life: s.coreLife,  size: s.coreSize  });
        this.spawn(x, y, s.spark, { color: color,  speed: s.sparkSpd, life: s.sparkLife, size: s.sparkSize });
        Renderer.addGlow(x, y, Renderer.colorToHex(color2), s.shock * 0.9, 0.95);
        Renderer.spawnExplosionSprite(x, y, s.fScale, Renderer.colorToHex(color), s.fDur);
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
        const usePixi = Renderer.usePixi && Renderer.particleLayer;
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vx *= (1 - 0.5 * dt);
            p.vy *= (1 - 0.5 * dt);
            p.life -= dt * p.decay;
            if (p.life <= 0) {
                if (p._pp) { Renderer.particleLayer.removeParticle(p._pp); p._pp = null; }
                this.particles.splice(i, 1);
            } else if (usePixi && p._pp) {
                const t = p.life / p.maxLife;
                const currentSize = p.size * (0.3 + t * 0.7);
                const s = (currentSize * 2) / 32;
                p._pp.x = p.x;
                p._pp.y = p.y;
                p._pp.scaleX = s;
                p._pp.scaleY = s;
                p._pp.alpha = t * 0.9;
            }
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
        if (Renderer.usePixi) {
            // Pixi path: particles are rendered via particleLayer; just feed bloom
            for (const p of this.particles) {
                const t = p.life / p.maxLife;
                if (t > 0.4 && p.size >= 1.5) {
                    const currentSize = p.size * (0.3 + t * 0.7);
                    Renderer.addGlow(p.x, p.y, Renderer.colorToHex(p.color), currentSize * 9, t * 0.45);
                }
            }
        } else {
            // Canvas 2D fallback path
            const prevComposite = ctx.globalCompositeOperation;
            ctx.globalCompositeOperation = 'lighter';

            for (const p of this.particles) {
                const t = p.life / p.maxLife;
                const currentSize = p.size * (0.3 + t * 0.7);

                if (t > 0.4 && p.size >= 1.5) {
                    Renderer.addGlow(p.x, p.y, Renderer.colorToHex(p.color), currentSize * 8, t * 0.5);
                }

                ctx.globalAlpha = t * 0.2;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, currentSize * 2.5, 0, Math.PI * 2);
                ctx.fill();

                ctx.globalAlpha = t * 0.9;
                ctx.beginPath();
                ctx.arc(p.x, p.y, currentSize, 0, Math.PI * 2);
                ctx.fill();

                if (t > 0.5 && p.size >= 2) {
                    ctx.fillStyle = '#ffffff';
                    ctx.globalAlpha = (t - 0.5) * 1.2;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, currentSize * 0.35, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            ctx.globalCompositeOperation = prevComposite;
        }

        // Shockwave rings
        for (const s of this.shockwaves) {
            const t = 1 - s.life / s.maxLife;
            // GPU glow at shockwave centre
            Renderer.addGlow(s.x, s.y, Renderer.colorToHex(s.color), s.radius * 2.5, (1 - t) * 0.8);

            ctx.globalAlpha = (1 - t) * 0.6;
            ctx.strokeStyle = s.color;
            ctx.lineWidth = 2 * (1 - t) + 0.5;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.globalAlpha = 1;
    },

    clear() {
        if (Renderer.usePixi && Renderer.particleLayer) {
            for (const p of this.particles) {
                if (p._pp) Renderer.particleLayer.removeParticle(p._pp);
            }
        }
        this.particles.length = 0;
        this.shockwaves.length = 0;
    }
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
