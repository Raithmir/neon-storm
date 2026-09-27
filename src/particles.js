// ============================================================
//  PARTICLE SYSTEM
// ============================================================
const Particles = {
    particles: [],
    shockwaves: [], // Expanding ring effects
    shards: [],     // Neon outline pieces from shattered ships
    maxParticles: 3000,
    maxShards: 600,

    _density() {
        const densityScale = { low: 0.3, medium: 0.6, high: 1.0 };
        return densityScale[Settings.values.particleDensity] || 1.0;
    },

    // opts: angle/spread (radians), speed, life, size, color, decay,
    //       streak (draw as a spark line stretched along its velocity),
    //       drag (velocity kept per second, default 0.5), gravity (px/s²)
    spawn(x, y, count, opts = {}) {
        const actualCount = Math.min(Math.max(1, Math.round(count * this._density())), this.maxParticles - this.particles.length);
        if (actualCount <= 0) return;
        for (let i = 0; i < actualCount; i++) {
            const angle = opts.angle !== undefined ? opts.angle + (Math.random() - 0.5) * (opts.spread || Math.PI * 2) : Math.random() * Math.PI * 2;
            const speed = (opts.speed !== undefined ? opts.speed : 100) * (0.5 + Math.random());
            const life = opts.life || (0.3 + Math.random() * 0.5);
            const size = opts.size || (1 + Math.random() * 2);
            this._add({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life, maxLife: life, size,
                color: opts.color || '#00ffff',
                decay: opts.decay || 1,
                streak: !!opts.streak,
                drag: opts.drag !== undefined ? opts.drag : 0.5,
                gravity: opts.gravity || 0,
                _pp: null,
            });
        }
    },

    _add(p) {
        if (this.particles.length >= this.maxParticles) return;
        p._hex = Renderer.colorToHex(p.color);
        if (Renderer.usePixi && Renderer.particleLayer && Renderer.fx) {
            p._pp = new PIXI.Particle({
                texture: p.streak ? Renderer.fx.spark : Renderer.fx.glow,
                x: p.x, y: p.y,
                anchorX: 0.5, anchorY: 0.5,
                tint: p._hex,
                alpha: 0.9,
            });
            this._syncPixi(p, 1);
            Renderer.particleLayer.addParticle(p._pp);
        }
        this.particles.push(p);
    },

    // A stationary glow that fades quickly: muzzle flashes, explosion cores, exhaust
    flash(x, y, radius, color, life) {
        if (Renderer.calm() && radius > 20) radius = 20;   // Flash Reduction: no big white bursts
        this._add({ x, y, vx: 0, vy: 0, life, maxLife: life, size: radius / 2, color, decay: 1, flash: true, drag: 0, gravity: 0, _pp: null });
    },

    // Bullet impact: a spray of sparks thrown back against the shot's direction
    impact(b) {
        const back = Math.atan2(-b.vy, -b.vx);
        this.spawn(b.x, b.y, 4, { angle: back, spread: 1.6, speed: 160, life: 0.18, size: 1.4, color: b.color, streak: true, drag: 0.1 });
        this.flash(b.x, b.y, 7, '#ffffff', 0.06);
    },

    // Multi-layer explosion: white flash, fireball, neon ring, spark streaks, core burst, embers
    spawnExplosion(x, y, opts = {}) {
        const style = opts.style || 'medium';
        const color  = opts.color  || '#ff8800';
        const color2 = opts.color2 || '#ffffff';
        const styles = {
            small:  { shock: 40,  core: 8,  coreSpd: 120, coreLife: 0.4, coreSize: 1.5, spark: 10, sparkSpd: 220, sparkLife: 0.35, ember: 3,  fScale: 1.2, fDur: 0.35 },
            medium: { shock: 70,  core: 14, coreSpd: 200, coreLife: 0.6, coreSize: 2.5, spark: 20, sparkSpd: 320, sparkLife: 0.45, ember: 6,  fScale: 2.2, fDur: 0.45 },
            large:  { shock: 110, core: 24, coreSpd: 280, coreLife: 0.8, coreSize: 3.5, spark: 30, sparkSpd: 420, sparkLife: 0.55, ember: 10, fScale: 3.5, fDur: 0.55 },
            mega:   { shock: 160, core: 36, coreSpd: 370, coreLife: 1.0, coreSize: 5,   spark: 48, sparkSpd: 520, sparkLife: 0.7,  ember: 16, fScale: 5.5, fDur: 0.65 },
        };
        const s = styles[style] || styles.medium;
        this.flash(x, y, s.shock * 0.7, '#ffffff', 0.1);
        this.spawnShockwave(x, y, color, s.shock, 0.4);
        if (style !== 'small') this.spawnShockwave(x, y, color2, s.shock * 0.6, 0.25);
        this.spawn(x, y, s.spark, { color, speed: s.sparkSpd, life: s.sparkLife, size: 1.6, streak: true, drag: 0.15 });
        this.spawn(x, y, s.core,  { color: color2, speed: s.coreSpd, life: s.coreLife * 0.5, size: s.coreSize * 0.7 });
        this.spawn(x, y, s.ember, { color, speed: 40, life: 1.4, size: 1.6, drag: 0.3, gravity: -25 });
        Renderer.addGlow(x, y, Renderer.colorToHex(color2), s.shock * 0.9, 0.95);
        Renderer.spawnExplosionSprite(x, y, s.fScale, Renderer.colorToHex(color), s.fDur);
    },

    // Break a neon outline into spinning line segments.
    // pts: flat closed outline [x0, y0, ...] in units of `scale`, rotated by `rot`.
    shatter(x, y, pts, scale, rot, color, speed) {
        const n = pts.length / 2;
        const cos = Math.cos(rot || 0), sin = Math.sin(rot || 0);
        const pieces = Math.round(this._density() * 2) || 1;   // cuts per edge
        const sp = speed || 1;
        for (let i = 0; i < n && this.shards.length < this.maxShards; i++) {
            const j = (i + 1) % n;
            const ax = pts[i * 2] * scale, ay = pts[i * 2 + 1] * scale;
            const bx = pts[j * 2] * scale, by = pts[j * 2 + 1] * scale;
            for (let k = 0; k < pieces; k++) {
                const t0 = k / pieces, t1 = (k + 1) / pieces;
                const x0 = ax + (bx - ax) * t0, y0 = ay + (by - ay) * t0;
                const x1 = ax + (bx - ax) * t1, y1 = ay + (by - ay) * t1;
                const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
                const wx = mx * cos - my * sin, wy = mx * sin + my * cos;
                const d = Math.sqrt(wx * wx + wy * wy) || 1;
                const out = (60 + Math.random() * 140) * sp;
                const life = 0.8 + Math.random() * 0.5;
                this.shards.push({
                    x: x + wx, y: y + wy,
                    vx: wx / d * out + (Math.random() - 0.5) * 60,
                    vy: wy / d * out + (Math.random() - 0.5) * 60,
                    a: Math.atan2(y1 - y0, x1 - x0) + (rot || 0),
                    va: (Math.random() - 0.5) * 14,
                    half: Math.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0)) / 2,
                    life, maxLife: life, color,
                });
            }
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

    _syncPixi(p, t) {
        const pp = p._pp;
        pp.x = p.x;
        pp.y = p.y;
        if (p.streak) {
            const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
            pp.rotation = Math.atan2(p.vy, p.vx) + Math.PI / 2;
            pp.scaleX = p.size * 0.45;
            pp.scaleY = (3 + speed * 0.045) * (0.4 + t * 0.6) / 32;
            pp.alpha = t;
        } else if (p.flash) {
            const s = (p.size * 2 * (0.6 + t * 0.4)) / 32;
            pp.scaleX = pp.scaleY = s;
            pp.alpha = t;
        } else {
            const s = (p.size * (0.3 + t * 0.7) * 2) / 32;
            pp.scaleX = pp.scaleY = s;
            pp.alpha = t * 0.9;
        }
    },

    update(dt) {
        const usePixi = Renderer.usePixi && Renderer.particleLayer;
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vx *= (1 - p.drag * dt);
            p.vy *= (1 - p.drag * dt);
            p.vy += p.gravity * dt;
            p.life -= dt * p.decay;
            if (p.life <= 0) {
                if (p._pp) { Renderer.particleLayer.removeParticle(p._pp); p._pp = null; }
                this.particles.splice(i, 1);
            } else if (usePixi && p._pp) {
                this._syncPixi(p, p.life / p.maxLife);
            }
        }
        for (let i = this.shards.length - 1; i >= 0; i--) {
            const s = this.shards[i];
            s.x += s.vx * dt;
            s.y += s.vy * dt;
            s.vx *= (1 - 1.2 * dt);
            s.vy *= (1 - 1.2 * dt);
            s.a += s.va * dt;
            s.life -= dt;
            if (s.life <= 0) this.shards.splice(i, 1);
        }
        // Update shockwaves
        for (let i = this.shockwaves.length - 1; i >= 0; i--) {
            const s = this.shockwaves[i];
            s.life -= dt;
            const t = 1 - s.life / s.maxLife; // 0→1 over lifetime
            s.radius = s.maxRadius * (1 - (1 - t) * (1 - t));   // fast start, slowing
            if (s.life <= 0) this.shockwaves.splice(i, 1);
        }
    },

    draw(ctx) {
        if (Renderer.usePixi) {
            // Pixi path: particles are rendered via particleLayer; just feed bloom
            for (const p of this.particles) {
                const t = p.life / p.maxLife;
                if (!p.streak && t > 0.4 && p.size >= 1.5) {
                    const currentSize = p.size * (0.3 + t * 0.7);
                    Renderer.addGlow(p.x, p.y, p._hex, currentSize * (p.flash ? 4 : 9), t * 0.45);
                }
            }
        } else {
            // Canvas 2D fallback path
            const prevComposite = ctx.globalCompositeOperation;
            ctx.globalCompositeOperation = 'lighter';

            for (const p of this.particles) {
                const t = p.life / p.maxLife;
                const currentSize = p.size * (0.3 + t * 0.7);

                if (p.streak) {
                    const len = 3 + Math.sqrt(p.vx * p.vx + p.vy * p.vy) * 0.03;
                    const a = Math.atan2(p.vy, p.vx);
                    ctx.globalAlpha = t;
                    ctx.strokeStyle = p.color;
                    ctx.lineWidth = p.size;
                    ctx.beginPath();
                    ctx.moveTo(p.x - Math.cos(a) * len, p.y - Math.sin(a) * len);
                    ctx.lineTo(p.x + Math.cos(a) * len, p.y + Math.sin(a) * len);
                    ctx.stroke();
                    continue;
                }

                if (t > 0.4 && p.size >= 1.5) {
                    Renderer.addGlow(p.x, p.y, p._hex, currentSize * 8, t * 0.5);
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

        // Shattered outline pieces: coloured halo pass, then white-hot core pass
        if (this.shards.length > 0) {
            ctx.lineCap = 'round';
            for (let pass = 0; pass < 2; pass++) {
                ctx.lineWidth = pass === 0 ? 5 : 1.5;
                for (const s of this.shards) {
                    const t = s.life / s.maxLife;
                    const dx = Math.cos(s.a) * s.half, dy = Math.sin(s.a) * s.half;
                    ctx.strokeStyle = pass === 0 ? s.color : '#ffffff';
                    ctx.globalAlpha = pass === 0 ? t * 0.45 : t * 0.9;
                    ctx.beginPath();
                    ctx.moveTo(s.x - dx, s.y - dy);
                    ctx.lineTo(s.x + dx, s.y + dy);
                    ctx.stroke();
                }
            }
        }

        // Shockwave rings: faint wide halo plus a thin bright line
        for (const s of this.shockwaves) {
            const t = 1 - s.life / s.maxLife;
            Renderer.addGlow(s.x, s.y, Renderer.colorToHex(s.color), s.radius * 2.5, (1 - t) * 0.8);
            ctx.strokeStyle = s.color;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
            ctx.globalAlpha = (1 - t) * 0.3;
            ctx.lineWidth = 7 * (1 - t) + 1;
            ctx.stroke();
            ctx.globalAlpha = (1 - t) * 0.9;
            ctx.lineWidth = 1.5 * (1 - t) + 0.5;
            ctx.strokeStyle = '#ffffff';
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
        this.shards.length = 0;
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
