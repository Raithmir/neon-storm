// ============================================================
//  ASTEROID SYSTEM (Level 3)
// ============================================================
const Asteroids = {
    list: [],
    active: false,

    SPAWN_PER_SECOND: 1.2,

    init() { this.list = []; this.active = false; },
    activate() { this.active = true; },

    update(dt) {
        if (!this.active) return;
        // Spawn new asteroids periodically
        if (Math.random() < this.SPAWN_PER_SECOND * dt) { // frame-rate independent
            const big = Math.random() > 0.6;
            this.list.push({
                x: 20 + Math.random() * (PLAY_W - 40),
                y: -40,
                vx: (Math.random() - 0.5) * 30,
                vy: 60 + Math.random() * 80,
                radius: big ? 20 + Math.random() * 15 : 8 + Math.random() * 10,
                hp: big ? 3 : 1,
                destructible: Math.random() > 0.15,
                rotation: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 2
            });
        }
        for (let i = this.list.length - 1; i >= 0; i--) {
            const a = this.list[i];
            a.x += a.vx * dt;
            a.y += a.vy * dt;
            a.rotation += a.rotSpeed * dt;
            if (a.y > PLAY_H + 50) { this.list.splice(i, 1); continue; }
            if (a.hp <= 0) {
                // Break into smaller pieces if big enough
                if (a.radius > 15) {
                    for (let j = 0; j < 3; j++) {
                        this.list.push({
                            x: a.x + (Math.random() - 0.5) * 15, y: a.y + (Math.random() - 0.5) * 15,
                            vx: (Math.random() - 0.5) * 60, vy: a.vy * 0.8 + Math.random() * 30,
                            radius: 5 + Math.random() * 6, hp: 1, destructible: true,
                            rotation: Math.random() * Math.PI * 2, rotSpeed: (Math.random() - 0.5) * 3
                        });
                    }
                }
                Particles.spawn(a.x, a.y, 8, { color: '#ddaa77', speed: 80, life: 0.3, size: 2 });
                Particles.shatter(a.x, a.y, this._shape(Math.round(a.radius)), a.radius, a.rotation, '#ddaa77', 0.8);
                Scoring.score += Math.floor(50 * GameConfig.scoreMultiplier);
                Audio.playAsteroidBreak();
                this.list.splice(i, 1);
            }
        }
    },

    // Neon rocks: an irregular outline with facet lines, baked per size.
    // Destructible rocks are warm; the indestructible ones are steel blue.
    _shapes: new Map(),
    _shape(R) {
        let pts = this._shapes.get(R);
        if (!pts) {
            pts = [];
            for (let j = 0; j < 9; j++) {
                const ang = (Math.PI * 2 / 9) * j;
                const h = Math.sin(j * 12.9898 + R * 78.233) * 43758.5453;
                const k = 0.72 + (h - Math.floor(h)) * 0.3;
                pts.push(Math.cos(ang) * k, Math.sin(ang) * k);
            }
            this._shapes.set(R, pts);
        }
        return pts;
    },
    _bake(c, R, hard) {
        const pts = Asteroids._shape(R);
        const color = hard ? '#8899ff' : '#ddaa77';
        Neon.shape(c, pts, R, color, 1.1, false, hard ? 0.22 : 0.16);
        // Facets meet at an off-centre point
        const fx = R * 0.15, fy = -R * 0.1;
        c.strokeStyle = color;
        c.lineWidth = 0.8;
        c.globalAlpha = 0.45;
        c.beginPath();
        for (let j = 0; j < pts.length; j += 6) { c.moveTo(fx, fy); c.lineTo(pts[j] * R * 0.95, pts[j + 1] * R * 0.95); }
        c.stroke();
        if (hard) {
            c.globalAlpha = 0.6;
            c.beginPath(); c.arc(0, 0, R * 0.45, 0, Math.PI * 2); c.stroke();
        }
        c.globalAlpha = 1;
    },

    draw(ctx) {
        for (const a of this.list) {
            const R = Math.round(a.radius);
            ctx.save();
            ctx.translate(a.x, a.y);
            ctx.rotate(a.rotation);
            Neon.sprite(ctx, 'rock|' + R + (a.destructible ? '' : '|h'), R + 5, this._bake, R, !a.destructible);
            ctx.restore();
        }
    },

    clear() { this.list = []; this.active = false; }
};


// ============================================================
//  ESCORT SYSTEM (Level 4)
// ============================================================
const Escort = {
    active: false,
    x: PLAY_W / 2,
    y: PLAY_H - 160,
    hp: 50,
    maxHp: 50,
    HIT_RADIUS: 28,
    MIN_Y: PLAY_H * 0.62,
    REGEN_PER_SECOND: 0.4,
    alive: true,
    flashTimer: 0,
    supportTimer: 8,

    init() {
        this.active = false; this.x = PLAY_W / 2; this.y = PLAY_H - 160;
        this.hp = this.maxHp; this.alive = true; this.flashTimer = 0; this.supportTimer = 8;
    },

    activate() { this.active = true; this.alive = true; },

    update(dt) {
        if (!this.active || !this.alive) return;
        this.flashTimer = Math.max(0, this.flashTimer - dt);
        this.hp = Math.min(this.maxHp, this.hp + this.REGEN_PER_SECOND * dt); // damage control repairs
        // Slowly move upward, but stay in the lower part of the screen — drifting into the
        // boss's point-blank range made the escort mission unwinnable
        this.y = Math.max(this.MIN_Y, this.y - 5 * dt);
        this.x += Math.sin(WaveSystem.levelTimer * 0.3) * 15 * dt;
        this.x = Math.max(60, Math.min(PLAY_W - 60, this.x));

        // Support fire
        this.supportTimer -= dt;
        if (this.supportTimer <= 0) {
            this.supportTimer = 6 + Math.random() * 3;
            // Fire support shots
            for (let j = -1; j <= 1; j++) {
                Player.bullets.spawn(this.x + j * 20, this.y - 30, j * 30, -400,
                    { color: '#88ff88', radius: 3, damage: 1, life: 2 });
            }
            // Drop a power-up occasionally
            if (Math.random() > 0.5) {
                PowerUps.spawn(this.x, this.y - 40);
            }
        }

        // Check enemy bullet collision
        for (const b of Enemies.enemyBullets.pool) {
            const dx = b.x - this.x, dy = b.y - this.y;
            if (b.harmless > 0) continue;
            if (dx * dx + dy * dy < this.HIT_RADIUS * this.HIT_RADIUS) {
                b.active = false;
                this.hp--;
                this.flashTimer = 0.15;
                Audio.playEscortHit();
                if (this.hp <= 0) {
                    this.alive = false;
                    Particles.spawn(this.x, this.y, 40, { color: '#88ff88', speed: 200, life: 0.8, size: 3 });
                    Particles.shatter(this.x, this.y, this._HULL, 30, 0, '#44ff88', 1.5);
                    Audio.playExplosionLarge();
                    ScreenShake.trigger(12, 0.8);
                }
            }
        }
    },

    // Neon style allied carrier, nose up (flying with the player)
    _HULL: Neon.mirror([0, -1.0, 0.22, -0.7, 0.34, -0.2, 1.0, 0.25, 0.95, 0.45, 0.4, 0.5, 0.3, 0.8, 0.12, 0.72]),
    _CANOPY: Neon.mirror([0, -0.72, 0.1, -0.5, 0.09, -0.3, 0, -0.26]),
    _bake(c, flash) {
        const S = 30, col = '#44ff88';
        Neon.shape(c, Escort._HULL, S, col, 1.5, flash, 0.2);
        Neon.path(c, Escort._HULL, S * 0.6, true);
        c.strokeStyle = col; c.globalAlpha = 0.35; c.lineWidth = 1; c.stroke();
        c.globalAlpha = 1;
        Neon.detail(c, [0, -0.2, 0, 0.6], S, '#ccffdd', 0.5, 1);                 // flight deck
        for (const y of [-0.05, 0.15, 0.35]) Neon.detail(c, [-0.06, y, 0.06, y], S, '#ccffdd', 0.7, 1);
        Neon.detail(c, [0.36, 0.05, 0.9, 0.36], S, col, 0.55, 1);
        Neon.detail(c, [-0.36, 0.05, -0.9, 0.36], S, col, 0.55, 1);
        Neon.shape(c, Escort._CANOPY, S, '#aaffcc', 0.8, flash, 0.4);
    },

    draw(ctx) {
        if (!this.active || !this.alive) return;
        const flash = this.flashTimer > 0;
        const t = WaveSystem.levelTimer || 0;
        Renderer.addGlow(this.x, this.y, 0x44ff88, 70, flash ? 0.7 : 0.25);
        ctx.save();
        ctx.translate(this.x, this.y);
        const f = Math.sin(t * 35) * 1.5;
        Neon.flame(ctx, -9, 23, 4, 8 + f, '#44ff88', 0.9);
        Neon.flame(ctx, 9, 23, 4, 8 - f, '#44ff88', 0.9);
        Neon.sprite(ctx, 'escort' + (flash ? '|f' : ''), 38, this._bake, flash);
        const blink = Math.sin(t * 5) > 0;
        Neon.light(ctx, -28, 10, 1.6, '#44ff88', blink ? 1 : 0.3);
        Neon.light(ctx, 28, 10, 1.6, '#ffffff', blink ? 0.3 : 1);
        ctx.restore();

        // HP bar
        const barW = 80, barH = 6, barX = this.x - barW / 2, barY = this.y - 35;
        ctx.fillStyle = '#002200';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = this.hp > this.maxHp * 0.3 ? '#44aa44' : '#ff4444';
        ctx.fillRect(barX, barY, barW * (this.hp / this.maxHp), barH);
        ctx.fillStyle = '#88ff88'; ctx.font = '9px Share Tech Mono, Consolas, monospace'; ctx.textAlign = 'center';
        ctx.fillText('AURORA', this.x, barY - 3);
    }
};


// ============================================================
//  CAMPAIGN SYSTEM
// ============================================================
const Campaign = {
    currentLevel: 0,
    levelsUnlocked: 1,
    secretUnlocked: false,
    levelData: ALL_LEVELS,
    levelBests: {},

    async load() {
        const data = await Storage.get('campaign');
        if (data) {
            this.levelsUnlocked = data.levelsUnlocked || 1;
            this.secretUnlocked = data.secretUnlocked || false;
            this.levelBests = data.levelBests || {};
        }
    },

    async save() {
        await Storage.set('campaign', {
            levelsUnlocked: this.levelsUnlocked,
            secretUnlocked: this.secretUnlocked,
            levelBests: this.levelBests
        });
    },

    completeLevel(levelIndex, difficulty) {
        if (levelIndex + 1 < 5 && levelIndex + 2 > this.levelsUnlocked) {
            this.levelsUnlocked = levelIndex + 2;
        }
        if (difficulty === 'normal' || difficulty === 'hardcore') {
            if (levelIndex === 4) {
                this.secretUnlocked = true;
            }
        }
        this.save();
    },

    recordLevelScore(levelIndex, score, maxChain, graze, perfect, difficulty) {
        const key = difficulty + '_L' + levelIndex;
        const existing = this.levelBests[key];
        if (!existing || score > existing.score) {
            this.levelBests[key] = { score, maxChain, graze, perfect, difficulty };
            this.save();
            return true;
        }
        return false;
    },

    getLevelBest(levelIndex, difficulty) {
        return this.levelBests[(difficulty || 'normal') + '_L' + levelIndex] || null;
    },

    getLevelCount() {
        return this.secretUnlocked ? 6 : 5;
    },

    isLevelAvailable(index, isCustom) {
        if (isCustom) return index < this.getLevelCount();
        if (index === 5) return this.secretUnlocked;
        return index < this.levelsUnlocked;
    }
};
