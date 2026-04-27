// ============================================================
//  BULLET POOL — optimised: no shadowBlur, hand-drawn glow
// ============================================================
class BulletPool {
    constructor(maxSize = 500) {
        this.pool = [];
        this.maxSize = maxSize;
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
            grazed: false
        };
        this.pool.push(bullet);
        return bullet;
    }

    update(dt, homingTargets) {
        for (let i = this.pool.length - 1; i >= 0; i--) {
            const b = this.pool[i];
            b.prevX = b.x;
            b.prevY = b.y;

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
                    const turnRate = 5.0;
                    const newAngle = current + Math.sign(diff) * Math.min(Math.abs(diff), turnRate * dt);
                    const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
                    b.vx = Math.cos(newAngle) * speed;
                    b.vy = Math.sin(newAngle) * speed;
                }
            }

            b.x += b.vx * dt;
            b.y += b.vy * dt;
            b.life -= dt;
            if (b.x < -20 || b.x > PLAY_W + 20 || b.y < -20 || b.y > PLAY_H + 20 || b.life <= 0 || !b.active) {
                this.pool.splice(i, 1);
            }
        }
    }

    draw(ctx) {
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
        // Motion trail
        const dx = b.x - b.prevX, dy = b.y - b.prevY;
        const trailLen = Math.sqrt(dx * dx + dy * dy);
        if (trailLen > 2) {
            ctx.globalAlpha = 0.15;
            ctx.fillStyle = b.color;
            ctx.beginPath();
            ctx.moveTo(b.x + b.radius * 0.5, b.y);
            ctx.lineTo(b.prevX + b.radius * 0.3, b.prevY);
            ctx.lineTo(b.prevX - b.radius * 0.3, b.prevY);
            ctx.lineTo(b.x - b.radius * 0.5, b.y);
            ctx.closePath();
            ctx.fill();
        }

        // Soft outer glow (replaces shadowBlur)
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius * 2.2, 0, Math.PI * 2);
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

    clear() { this.pool.length = 0; }
}
