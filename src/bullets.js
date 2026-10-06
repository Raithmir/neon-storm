// ============================================================
//  BULLET POOL — optimised with hand-drawn glow
// ============================================================
class BulletPool {
    // enemy: enemy bullets get a dark shadow, orb/needle shapes and a spawn pop;
    // player bullets are streaks and missiles pointing along their velocity
    constructor(maxSize = 500, enemy = false) {
        this.pool = [];
        this.maxSize = maxSize;
        this.enemy = enemy;
    }

    spawn(x, y, vx, vy, opts = {}) {
        if (this.pool.length >= this.maxSize) return null;
        const bullet = {
            x, y, vx, vy,
            prevX: x, prevY: y,
            radius: opts.radius || 3,
            color: opts.color || '#00ffff',
            damage: opts.damage || 1,
            active: true,
            type: opts.type || 'normal',
            life: opts.life || 5,
            grazed: false,
            pierce: !!opts.pierce,          // passes through enemies (hits each once)
            harmless: opts.harmless || 0,   // seconds of telegraph before it can hit
            turnRate: opts.turnRate || 5.0, // homing turn rate (rad/s)
            age: 0,
            _hex: Renderer.colorToHex(opts.color || '#00ffff'),
            _p: null,   // Pixi body Particle
            _pc: null,  // Pixi white-core Particle
            _ps: null,  // Pixi shadow Particle (enemy bullets)
        };
        if (Renderer.usePixi && Renderer.bulletLayer && Renderer.fx) this._addParticles(bullet);
        this.pool.push(bullet);
        return bullet;
    }

    _addParticles(b) {
        const fx = Renderer.fx;
        const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        let body = fx.orb, core = fx.core, ay = 0.5;
        if (this.enemy) {
            b._shape = speed >= 300 ? 'needle' : (b.radius >= 5 ? 'heavy' : 'orb');
            if (b._shape === 'needle') body = fx.needle;
            b._ps = new PIXI.Particle({ texture: fx.shadow, x: b.x, y: b.y, anchorX: 0.5, anchorY: 0.5, tint: 0xffffff, alpha: 1 });
            Renderer.bulletShadowLayer.addParticle(b._ps);
        } else {
            // Regular shots take the Hangar bullet style; missiles and laser keep their own
            const style = { plasma: 'plasma', retro: 'pixel', shards: 'shard' }[Hangar.equipped.bullet] || 'streak';
            b._shape = b.type === 'homing' ? 'missile' : (b.type === 'laser' ? 'beam' : style);
            const bodies = { missile: fx.missile, beam: fx.glow, plasma: fx.orb, pixel: fx.pixel, shard: fx.needle, streak: fx.streak };
            const cores = { missile: fx.core, beam: fx.core, plasma: fx.core, pixel: fx.pixel, shard: fx.core, streak: fx.streak };
            body = bodies[b._shape];
            core = cores[b._shape];
            ay = b._shape === 'streak' ? 0.18 : 0.5;   // streak head sits on the bullet
        }
        b._p = new PIXI.Particle({ texture: body, x: b.x, y: b.y, anchorX: 0.5, anchorY: ay, tint: b._hex, alpha: 0.9 });
        b._pc = new PIXI.Particle({ texture: core, x: b.x, y: b.y, anchorX: 0.5, anchorY: ay, tint: 0xffffff, alpha: 0.95 });
        Renderer.bulletLayer.addParticle(b._p);
        Renderer.bulletLayer.addParticle(b._pc);
        this._syncParticles(b);
    }

    _removeParticles(b) {
        if (b._p)  { Renderer.bulletLayer.removeParticle(b._p);  b._p  = null; }
        if (b._pc) { Renderer.bulletLayer.removeParticle(b._pc); b._pc = null; }
        if (b._ps) { Renderer.bulletShadowLayer.removeParticle(b._ps); b._ps = null; }
    }

    _syncParticles(b) {
        const r = b.radius;
        const rot = Math.atan2(b.vy, b.vx) + Math.PI / 2;
        const p = b._p, pc = b._pc;
        p.x = pc.x = b.x;
        p.y = pc.y = b.y;
        if (this.enemy) {
            // Pop in over the first 0.1 s so new bullets catch the eye
            const pop = b.age < 0.1 ? 1 + (1 - b.age / 0.1) * 0.8 : 1;
            const faint = b.harmless > 0;
            let k = pop;
            if (b._shape === 'heavy') k *= 1 + Math.sin(b.age * 14) * 0.1;
            if (b._shape === 'needle') {
                p.scaleX = r * 0.24 * k; p.scaleY = r * 0.11 * k;
                pc.scaleX = r * 0.06 * k; pc.scaleY = r * 0.3 * k;
                p.rotation = pc.rotation = rot;
            } else {
                p.scaleX = p.scaleY = r * 0.14 * k;
                pc.scaleX = pc.scaleY = r * 0.1 * k;
            }
            p.alpha = faint ? 0.25 : 0.95;
            pc.alpha = faint ? 0.2 : 1;
            const ps = b._ps;
            ps.x = b.x; ps.y = b.y;
            ps.scaleX = ps.scaleY = r * 0.13 * k;
            ps.alpha = faint ? 0.3 : 1;
            return;
        }
        p.rotation = pc.rotation = rot;
        if (b._shape === 'missile') {
            p.scaleX = p.scaleY = r * 0.3;
            pc.scaleX = pc.scaleY = r * 0.08;
            pc.x = b.x - b.vx * 0.007; pc.y = b.y - b.vy * 0.007;   // hot exhaust at the tail
        } else if (b._shape === 'plasma') {
            const k = 1 + Math.sin(b.age * 30) * 0.12;
            p.rotation = pc.rotation = 0;
            p.scaleX = p.scaleY = r * 0.17 * k;
            pc.scaleX = pc.scaleY = r * 0.1;
        } else if (b._shape === 'pixel') {
            p.rotation = pc.rotation = 0;
            p.scaleX = p.scaleY = r * 0.36;
            pc.scaleX = pc.scaleY = r * 0.14;
        } else if (b._shape === 'shard') {
            p.rotation = pc.rotation = b.age * 14;
            p.scaleX = r * 0.32; p.scaleY = r * 0.1;
            pc.scaleX = pc.scaleY = r * 0.06;
        } else if (b._shape === 'beam') {
            p.scaleX = r * 0.075; p.scaleY = 2.4;
            pc.scaleX = r * 0.05; pc.scaleY = 11;
            p.alpha = 0.55; pc.alpha = 0.7;
        } else {
            p.scaleX = r * 0.2; p.scaleY = r * 0.14;
            pc.scaleX = r * 0.08; pc.scaleY = r * 0.112;
        }
    }

    update(dt, homingTargets) {
        for (let i = this.pool.length - 1; i >= 0; i--) {
            const b = this.pool[i];
            b.prevX = b.x;
            b.prevY = b.y;
            if (b.harmless > 0) b.harmless = Math.max(0, b.harmless - dt);

            if (b.type === 'homing' && homingTargets && homingTargets.length > 0) {
                let nearest = null, nearDist = Infinity;
                for (const t of homingTargets) {
                    const dx = t.x - b.x, dy = t.y - b.y;
                    const d = dx * dx + dy * dy;
                    if (d < nearDist) { nearDist = d; nearest = t; }
                }
                if (nearest) {
                    const desired = Math.atan2(nearest.y - b.y, nearest.x - b.x);
                    const current = Math.atan2(b.vy, b.vx);
                    let diff = desired - current;
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    const newAngle = current + Math.sign(diff) * Math.min(Math.abs(diff), b.turnRate * dt);
                    const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
                    b.vx = Math.cos(newAngle) * speed;
                    b.vy = Math.sin(newAngle) * speed;
                }
            }

            b.x += b.vx * dt;
            b.y += b.vy * dt;
            b.life -= dt;
            b.age += dt;
            if (b.x < -20 || b.x > PLAY_W + 20 || b.y < -20 || b.y > PLAY_H + 20 || b.life <= 0 || !b.active) {
                this._removeParticles(b);
                this.pool.splice(i, 1);
            } else if (b._p) {
                this._syncParticles(b);
                // Homing missiles leave a short exhaust trail
                if (b._shape === 'missile' && (b.age * 60 | 0) % 2 === 0) {
                    Particles.flash(b.x - b.vx * 0.01, b.y - b.vy * 0.01, 2, b.color, 0.18);
                }
            }
        }
    }

    draw(ctx) {
        // In Pixi mode the particles are synced in update(); only keep addGlow for bloom source
        if (Renderer.usePixi) {
            for (const b of this.pool) {
                Renderer.addGlow(b.x, b.y, b._hex, b.radius * (b._shape === 'missile' ? 4.5 : 7), this.enemy ? 0.4 : 0.5);
            }
            return;
        }

        // Canvas 2D fallback path
        const prevComposite = ctx.globalCompositeOperation;
        ctx.globalCompositeOperation = 'lighter';

        for (const b of this.pool) {
            if (b.type === 'laser') {
                this._drawLaser(ctx, b);
            } else if (b.type === 'homing') {
                this._drawHoming(ctx, b);
            } else {
                this._drawNormal(ctx, b);
            }
        }

        ctx.globalCompositeOperation = prevComposite;
        ctx.globalAlpha = 1;
    }

    _drawNormal(ctx, b) {
        if (b.harmless > 0) {
            // Telegraph: faint outline only
            ctx.globalAlpha = 0.35;
            ctx.strokeStyle = b.color;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
            return;
        }
        // GPU glow halo behind bullet
        Renderer.addGlow(b.x, b.y, Renderer.colorToHex(b.color), b.radius * 6, 0.5);

        // Motion trail
        const dx = b.x - b.prevX, dy = b.y - b.prevY;
        const trailLen = Math.sqrt(dx * dx + dy * dy);
        if (trailLen > 2) {
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = b.color;
            ctx.beginPath();
            ctx.moveTo(b.x + b.radius * 0.5, b.y);
            ctx.lineTo(b.prevX + b.radius * 0.3, b.prevY);
            ctx.lineTo(b.prevX - b.radius * 0.3, b.prevY);
            ctx.lineTo(b.x - b.radius * 0.5, b.y);
            ctx.closePath();
            ctx.fill();
        }

        // Soft outer glow
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius * 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Main bullet body
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        ctx.fill();

        // Bright centre
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius * 0.35, 0, Math.PI * 2);
        ctx.fill();
    }

    _drawHoming(ctx, b) {
        // GPU glow halo
        Renderer.addGlow(b.x, b.y, Renderer.colorToHex(b.color), b.radius * 8, 0.45);

        const angle = Math.atan2(b.vy, b.vx);

        // Exhaust trail
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = b.color;
        const tailX = b.x - Math.cos(angle) * 12;
        const tailY = b.y - Math.sin(angle) * 12;
        ctx.beginPath();
        ctx.moveTo(b.x + Math.cos(angle + Math.PI / 2) * b.radius * 0.6, b.y + Math.sin(angle + Math.PI / 2) * b.radius * 0.6);
        ctx.lineTo(tailX, tailY);
        ctx.lineTo(b.x + Math.cos(angle - Math.PI / 2) * b.radius * 0.6, b.y + Math.sin(angle - Math.PI / 2) * b.radius * 0.6);
        ctx.closePath();
        ctx.fill();

        // Missile body
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = b.color;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(angle + Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(0, -b.radius * 1.2);
        ctx.lineTo(b.radius * 0.6, b.radius * 0.4);
        ctx.lineTo(-b.radius * 0.6, b.radius * 0.4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Bright tip
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(b.x + Math.cos(angle) * b.radius * 0.5, b.y + Math.sin(angle) * b.radius * 0.5, 1.5, 0, Math.PI * 2);
        ctx.fill();
    }

    _drawLaser(ctx, b) {
        // GPU glow halo (elongated by using wider size)
        Renderer.addGlow(b.x, b.y, Renderer.colorToHex(b.color), b.radius * 8, 0.5);

        const len = Math.min(35, Math.abs(b.vy) * 0.035);

        // Wide outer glow
        ctx.globalAlpha = 0.15;
        ctx.fillStyle = b.color;
        ctx.fillRect(b.x - b.radius * 2, b.y - len, b.radius * 4, len * 2);

        // Mid beam
        ctx.globalAlpha = 0.6;
        ctx.fillRect(b.x - b.radius, b.y - len * 0.8, b.radius * 2, len * 1.6);

        // Core beam
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(b.x - b.radius * 0.35, b.y - len * 0.6, b.radius * 0.7, len * 1.2);
    }

    clear() {
        if (Renderer.usePixi && Renderer.bulletLayer) {
            for (const b of this.pool) this._removeParticles(b);
        }
        this.pool.length = 0;
    }
}
