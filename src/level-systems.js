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
                Particles.spawn(a.x, a.y, 8, { color: '#886644', speed: 80, life: 0.3, size: 2 });
                Scoring.score += Math.floor(50 * GameConfig.scoreMultiplier);
                Audio.playAsteroidBreak();
                this.list.splice(i, 1);
            }
        }
    },

    draw(ctx) {
        for (const a of this.list) {
            ctx.save();
            ctx.translate(a.x, a.y);
            ctx.rotate(a.rotation);
            ctx.fillStyle = a.destructible ? '#665544' : '#444455';
            ctx.strokeStyle = a.destructible ? '#887766' : '#6666aa';
            ctx.lineWidth = 1.5;
            // Irregular polygon
            ctx.beginPath();
            for (let j = 0; j < 7; j++) {
                const ang = (Math.PI * 2 / 7) * j;
                const r = a.radius * (0.7 + ((j * 13 + a.radius * 7) % 10) / 25);
                ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
            }
            ctx.closePath();
            ctx.fill(); ctx.stroke();
            if (!a.destructible) {
                ctx.strokeStyle = '#8888cc';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(0, 0, a.radius * 0.5, 0, Math.PI);
                ctx.stroke();
            }
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
    hp: 40,
    maxHp: 40,
    HIT_RADIUS: 28,
    REGEN_PER_SECOND: 0.3,
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
        // Slowly move upward
        this.y -= 5 * dt;
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
                    Audio.playExplosionLarge();
                    ScreenShake.trigger(12, 0.8);
                }
            }
        }
    },

    draw(ctx) {
        if (!this.active || !this.alive) return;
        ctx.save();
        ctx.translate(this.x, this.y);
        // Allied ship — green tinted
        const flash = this.flashTimer > 0;
        ctx.fillStyle = flash ? '#ffffff' : '#44aa44';
        ctx.beginPath();
        ctx.moveTo(0, -25); ctx.lineTo(30, 10); ctx.lineTo(20, 20);
        ctx.lineTo(-20, 20); ctx.lineTo(-30, 10);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#88ff88'; ctx.lineWidth = 1.5; ctx.stroke();
        // Engine
        ctx.fillRect(-12, 20, 8, 6 + Math.random() * 3);
        ctx.fillRect(4, 20, 8, 6 + Math.random() * 3);
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
