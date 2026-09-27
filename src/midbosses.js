// ============================================================
//  MID-BOSSES
// ============================================================
// One mid-boss per level, around the middle of the stage (genre convention:
// Cave, Touhou). A mid-boss is a heavy enemy registered in Enemies.types, so it
// reuses spawning, level HP scaling, collision and homing; this module adds its
// movement, attack patterns, drawing and rewards.
//
// While a mid-boss is alive the wave timer is paused (WaveSystem), so the stage
// waits for it. If it isn't destroyed within MIDBOSS_TIME_LIMIT it retreats
// without its reward (like a Touhou mid-boss).

const MIDBOSS_TIME_LIMIT = 35;   // seconds on screen before it retreats
const MIDBOSS_ENTRY_Y = 190;     // lower than the main boss, so spread weapons can reach it
const MIDBOSS_BONUS = 8000;      // score for destroying it (× difficulty multiplier)
const MIDBOSS_DROPS = 2;         // guaranteed power-ups on defeat

const MidBossTypes = {
    // Level 1 — heavy gunship: aimed fans and rings, sways across the top
    sentinel: {
        name: 'SENTINEL', level: 1, movement: 'sway',
        color: '#ff6600', accent: '#ffcc44', bulletColor: '#ff4400',
        patterns: ['aimedFan', 'ring', 'wideFan'], interval: 1.1,
    },
    // Level 2 — industrial walker: bomb drops and walls with a gap near the player
    forge_walker: {
        name: 'FORGE WALKER', level: 2, movement: 'sway',
        color: '#cc4400', accent: '#ff8844', bulletColor: '#ff2200',
        patterns: ['bombDrop', 'gapWall', 'aimedHeavy'], interval: 1.2,
    },
    // Level 3 — debris hauler: spiral bursts and thrown debris
    debris_hauler: {
        name: 'DEBRIS HAULER', level: 3, movement: 'sway',
        color: '#886644', accent: '#ccaa77', bulletColor: '#00ffaa',
        patterns: ['spiral', 'debrisThrow', 'ring'], interval: 1.0,
    },
    // Level 4 — strike leader: darts between positions, fast fans, calls in scouts
    strike_leader: {
        name: 'STRIKE LEADER', level: 4, movement: 'dart', hpMult: 0.6, // mobile: lower HP (like the Duo)
        color: '#ffaa00', accent: '#ffdd66', bulletColor: '#ff6600',
        patterns: ['aimedFanFast', 'callScouts', 'crossStreams'], interval: 1.0,
    },
    // Level 5 — core warden: telegraphed teleports, double rings, triple spiral
    core_warden: {
        name: 'CORE WARDEN', level: 5, movement: 'teleport',
        color: '#cc44ff', accent: '#ff88ff', bulletColor: '#cc00ff',
        patterns: ['doubleRing', 'tripleSpiral', 'aimedFan'], interval: 0.95,
    },
    // Level 6 — glitch echo: mirrors the player and fires a copy of their spread
    glitch_echo: {
        name: 'GLITCH ECHO', level: 6, movement: 'mirror',
        color: '#00ffff', accent: '#ff00ff', bulletColor: '#00ffff',
        patterns: ['mirrorSpread', 'randomBurst', 'ringAimed'], interval: 0.9,
    },
};

// Register as enemy types: ~25 s to destroy at the power a player typically has at that point
for (const [id, def] of Object.entries(MidBossTypes)) {
    Enemies.types[id] = {
        hp: Math.round(250 * (def.hpMult || 1)), speed: 70, radius: 40, score: 5000,
        color: def.color, accent: def.accent, bulletColor: def.bulletColor,
        fireRate: def.interval, bulletSpeed: 150, dropChance: 0, cancelBullets: true,
    };
    Enemies.COUNT_SCALED[id] = true; // density scales bullet counts, not fire frequency
}

const MidBoss = {
    isType(type) { return !!MidBossTypes[type]; },

    // The active mid-boss (at most one), or null
    current() {
        for (const e of Enemies.list) if (e.midboss && !e.retreating) return e;
        return null;
    },

    spawn(type) {
        const def = MidBossTypes[type];
        if (!def) return null;
        const e = Enemies.spawn(type, PLAY_W / 2, -60, 'midboss');
        if (!e) return null;
        e.midboss = def;
        e.patternIndex = 0;
        e.fireTimer = 1.5;          // grace period while it enters
        e.onScreenTime = 0;
        e.dartTarget = PLAY_W / 2;
        Scoring.spawnPopup('WARNING — ' + def.name, '#ff4466', 22);
        Audio.playExplosionLarge();
        return e;
    },

    _n(base) { return Math.max(3, Math.round(base * (GameConfig.bulletDensity || 1))); },

    updateMovement(e, dt, playerX) {
        const def = e.midboss;
        if (e.y < MIDBOSS_ENTRY_Y - 1 && e.onScreenTime < 3) {
            e.y += Math.min(90 * dt, MIDBOSS_ENTRY_Y - e.y);
            return;
        }
        e.onScreenTime += dt;
        if (e.onScreenTime > MIDBOSS_TIME_LIMIT) {
            if (!e.retreating) Scoring.spawnPopup(def.name + ' ESCAPED', '#888888', 18);
            e.retreating = true;
            return;
        }
        const t = e.moveTimer;
        switch (def.movement) {
            // Movement speeds stay low (≤ ~140 px/s): shots take ~1 s to reach it, so a
            // fast mid-boss can't be hit at all from the bottom of the screen
            case 'sway':
                e.x += (PLAY_W / 2 + Math.sin(t * 0.35) * 150 - e.x) * Math.min(1, dt * 2);
                e.y = MIDBOSS_ENTRY_Y + Math.sin(t * 1.1) * 20;
                break;
            case 'dart':
                // Dart to one of three positions, then hold there briefly (a window to hit it)
                if (Math.abs(e.x - e.dartTarget) < 4) {
                    e.dartDwell = (e.dartDwell || 0) + dt;
                    if (e.dartDwell > 1.5) {
                        e.dartDwell = 0;
                        e.dartTarget = [140, PLAY_W / 2, PLAY_W - 140][Math.floor(Math.random() * 3)];
                    }
                }
                e.x += Math.sign(e.dartTarget - e.x) * Math.min(Math.abs(e.dartTarget - e.x), 140 * dt);
                e.y = MIDBOSS_ENTRY_Y + Math.sin(t * 2) * 15;
                break;
            case 'teleport':
                if (e.warpTimer > 0) {
                    e.warpTimer -= dt;
                    if (e.warpTimer <= 0) { e.x = e.warpTo.x; e.y = e.warpTo.y; e.fireTimer = Math.max(e.fireTimer, 0.8); }
                } else {
                    e.teleportTimer = (e.teleportTimer || 4) - dt;
                    if (e.teleportTimer <= 0) {
                        e.warpTo = { x: 100 + Math.random() * (PLAY_W - 200), y: MIDBOSS_ENTRY_Y - 60 + Math.random() * 120 };
                        e.warpTimer = 0.5;
                        e.teleportTimer = 4;
                    }
                }
                break;
            case 'mirror':
                e.x += Math.max(-90 * dt, Math.min(90 * dt, (PLAY_W - playerX) - e.x));
                e.y = MIDBOSS_ENTRY_Y + Math.sin(t * 1.5) * 25;
                break;
        }
        e.x = Math.max(50, Math.min(PLAY_W - 50, e.x));
    },

    fire(e, px, py) {
        const def = e.midboss;
        const pattern = def.patterns[e.patternIndex % def.patterns.length];
        e.patternIndex++;
        const B = Enemies.enemyBullets;
        const bs = e.bulletSpeed;
        const angle = Math.atan2(py - e.y, px - e.x);
        const c = def.bulletColor, c2 = def.accent;
        const ring = (count, speed, offset, color, radius) => {
            for (let j = 0; j < count; j++) {
                const a = (Math.PI * 2 / count) * j + offset;
                B.spawn(e.x, e.y, Math.cos(a) * speed, Math.sin(a) * speed, { color, radius: radius || 3 });
            }
        };
        const fan = (count, spreadRad, speed, color, radius) => {
            for (let j = 0; j < count; j++) {
                const a = angle + (count > 1 ? (j / (count - 1) - 0.5) * spreadRad : 0);
                B.spawn(e.x, e.y + 20, Math.cos(a) * speed, Math.sin(a) * speed, { color, radius: radius || 3 });
            }
        };
        switch (pattern) {
            case 'aimedFan': fan(this._n(5), 0.6, bs * 1.1, c); break;
            case 'wideFan': fan(this._n(9), 1.2, bs * 0.9, c2); break;
            case 'aimedFanFast': fan(this._n(7), 0.7, bs * 1.35, c); break;
            case 'aimedHeavy': fan(3, 0.35, bs * 1.2, c, 5); break;
            case 'ring': ring(this._n(14), bs * 0.75, e.moveTimer, c2); break;
            case 'doubleRing':
                ring(this._n(12), bs * 0.65, 0, c);
                ring(this._n(16), bs * 0.9, 0.2, c2);
                break;
            case 'spiral':
                ring(this._n(18), bs * 0.85, e.moveTimer * 2.5, c);
                break;
            case 'tripleSpiral':
                for (let s = 0; s < 3; s++) ring(this._n(6), bs * 0.9, e.moveTimer * 3 + s * 0.35, s === 1 ? c2 : c);
                break;
            case 'bombDrop': {
                const n = this._n(4);
                for (let j = 0; j < n; j++) {
                    B.spawn(e.x + (j - (n - 1) / 2) * 26, e.y + 25, (Math.random() - 0.5) * 30, bs * 0.55, { color: c, radius: 6, life: 3 });
                }
                ring(this._n(8), bs * 0.5, 0, c2, 2.5);
                break;
            }
            case 'gapWall': {
                // Horizontal wall with a 90 px gap centred near the player
                const n = this._n(14);
                const gap = Math.max(60, Math.min(PLAY_W - 60, px + (Math.random() - 0.5) * 120));
                for (let j = 0; j < n; j++) {
                    const x = 10 + ((PLAY_W - 20) / (n - 1)) * j;
                    if (Math.abs(x - gap) < 45) continue;
                    B.spawn(x, e.y + 30, 0, bs * 0.6, { color: c2, radius: 3 });
                }
                break;
            }
            case 'debrisThrow':
                if (Asteroids.active) {
                    for (let j = -1; j <= 1; j += 2) {
                        Asteroids.list.push({ x: e.x + j * 30, y: e.y + 30, vx: j * 40, vy: 110, radius: 12, hp: 2,
                            destructible: true, rotation: 0, rotSpeed: 2 });
                    }
                }
                fan(3, 0.3, bs, c);
                break;
            case 'callScouts':
                for (let j = -1; j <= 1; j += 2) Enemies.spawn('scout_drone', e.x + j * 40, e.y + 30, 'straight_down');
                break;
            case 'crossStreams':
                for (let j = 0; j < this._n(6); j++) {
                    const a1 = 0.7 + j * 0.12, a2 = Math.PI - 0.7 - j * 0.12;
                    B.spawn(e.x - 30, e.y, Math.cos(a1) * bs, Math.sin(a1) * bs, { color: c, radius: 3 });
                    B.spawn(e.x + 30, e.y, Math.cos(a2) * bs, Math.sin(a2) * bs, { color: c2, radius: 3 });
                }
                break;
            case 'mirrorSpread': fan(this._n(7), 0.9, bs, c); break;
            case 'randomBurst':
                for (let j = 0; j < this._n(16); j++) {
                    const a = Math.PI * (0.1 + Math.random() * 0.8);
                    const sp = bs * (0.6 + Math.random() * 0.6);
                    B.spawn(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, { color: j % 2 ? c : c2, radius: 3 });
                }
                break;
            case 'ringAimed':
                ring(this._n(16), bs * 0.7, 0, c2);
                fan(3, 0.25, bs * 1.2, c);
                break;
        }
    },

    // Destroyed (not escaped): bonus, screen-wide bullet cancel, guaranteed power-ups
    onDefeat(e) {
        const bonus = Math.floor(MIDBOSS_BONUS * GameConfig.scoreMultiplier);
        Scoring.score += bonus;
        Scoring.spawnPopup(e.midboss.name + ' DOWN  +' + bonus.toLocaleString(), '#ffff00', 22);
        for (const b of Enemies.enemyBullets.pool) {
            b.active = false;
            Particles.spawn(b.x, b.y, 1, { color: '#00ffff', speed: 30, life: 0.6, size: 2 });
        }
        for (let i = 0; i < MIDBOSS_DROPS; i++) PowerUps.spawn(e.x + (i - 0.5) * 40, e.y);
        Particles.spawn(e.x, e.y, 50, { color: e.color, speed: 260, life: 0.9, size: 4 });
        ScreenShake.trigger(12, 0.6);
        Audio.playExplosionLarge();
    },

    draw(ctx, e, flash) {
        const r = e.radius;
        const t = e.moveTimer;
        // Hull: armoured hexagon
        ctx.fillStyle = flash ? '#ffffff' : e.color;
        ctx.beginPath();
        for (let j = 0; j < 6; j++) {
            const a = (Math.PI * 2 / 6) * j + Math.PI / 6;
            ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.8);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = flash ? '#ffffff' : e.accent;
        ctx.lineWidth = 2;
        ctx.stroke();
        // Rotating weapon ring
        ctx.strokeStyle = e.accent;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.65, t * 2, t * 2 + Math.PI * 1.4);
        ctx.stroke();
        ctx.globalAlpha = 1;
        // Core
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.22 + Math.sin(t * 6) * 1.5, 0, Math.PI * 2);
        ctx.fill();
    },

    // Top-of-screen HP bar and timer (same place as the boss bar; they never overlap)
    drawBar(ctx) {
        const e = this.current();
        if (!e || e.y < 0) return;
        const barW = 200, barH = 6, barX = (PLAY_W - barW) / 2, barY = 15;
        ctx.fillStyle = '#221100';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = e.color;
        ctx.fillRect(barX, barY, barW * Math.max(0, e.hp / e.maxHp), barH);
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px Share Tech Mono, Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('MID-BOSS — ' + e.midboss.name, PLAY_W / 2, barY + barH + 12);
        const timeLeft = Math.max(0, MIDBOSS_TIME_LIMIT - e.onScreenTime);
        ctx.textAlign = 'right';
        ctx.fillStyle = timeLeft <= 10 ? '#ff4444' : '#aaaaaa';
        ctx.fillText(Math.ceil(timeLeft).toString(), barX + barW + 34, barY + barH);
    },
};
