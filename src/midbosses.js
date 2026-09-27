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
        color: '#dd9955', accent: '#ffd9a0', bulletColor: '#00ffaa',
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

    // ------------------------------------------------------------
    //  Neon style art (see neon.js): one design per mid-boss. Static
    //  bodies come from the sprite atlas; moving parts are drawn live.
    //  Outlines are in units of the mid-boss radius.
    // ------------------------------------------------------------
    _NEON_SHAPES: {
        sentinel: Neon.mirror([0, -0.75, 0.35, -0.7, 0.55, -0.4, 1.0, -0.15, 1.0, 0.15, 0.6, 0.3, 0.45, 0.7, 0.15, 0.85]),
        sentinelBarrel: [0.26, 0.55, 0.38, 0.55, 0.38, 1.05, 0.26, 1.05],
        forge: Neon.mirror([0, -0.6, 0.55, -0.6, 0.72, -0.35, 0.72, 0.2, 0.5, 0.45, 0.2, 0.5]),
        forgeStack: [0.28, -0.95, 0.45, -0.95, 0.45, -0.6, 0.28, -0.6],
        forgeCannon: [-0.09, 0.45, 0.09, 0.45, 0.09, 0.82, -0.09, 0.82],
        hauler: Neon.mirror([0, -0.72, 0.4, -0.72, 0.62, -0.45, 0.62, 0.25, 0.38, 0.45, 0.2, 0.45]),
        // Nose points down, toward the player
        striker: Neon.mirror([0, 1.0, 0.18, 0.55, 0.3, 0.1, 1.0, -0.35, 0.95, -0.55, 0.4, -0.4, 0.3, -0.7, 0.12, -0.6, 0, -0.62]),
        strikerCanopy: Neon.mirror([0, 0.62, 0.1, 0.42, 0.08, 0.22, 0, 0.16]),
        wardenOuter: Neon.polygon(8, Math.PI / 8, 0.85),
        wardenInner: Neon.polygon(8, Math.PI / 8, 0.5),
        wardenSpike: [0, -1.18, 0.13, -0.92, 0, -0.8, -0.13, -0.92],
        // The player's ship turned upside down (shared with the Echo boss)
        echoHull: Neon.mirror([0, 1.15, 0.2, 0.6, 0.3, 0.05, 0.95, -0.45, 0.9, -0.62, 0.45, -0.48, 0.32, -0.72, 0.12, -0.62, 0, -0.66]),
        echoCanopy: Neon.mirror([0, 0.66, 0.1, 0.42, 0.08, 0.2, 0, 0.14]),
    },

    _OUTLINES: { sentinel: 'sentinel', forge_walker: 'forge', debris_hauler: 'hauler', strike_leader: 'striker', core_warden: 'wardenOuter', glitch_echo: 'echoHull' },
    outline(e) {
        const key = this._OUTLINES[e.type];
        return key ? { pts: this._NEON_SHAPES[key], scale: e.type === 'glitch_echo' ? e.radius * 0.9 : e.radius } : null;
    },

    _glow(e, size, flash, alpha) {
        if (e._glowHex === undefined) e._glowHex = Renderer.colorToHex(e.color);
        Renderer.addGlow(e.x, e.y, e._glowHex, size, flash ? 0.7 : (alpha || 0.3));
    },

    _flip(pts) {
        const m = pts.slice();
        for (let i = 0; i < m.length; i += 2) m[i] = -m[i];
        return m;
    },

    _bake: {
        sentinel(c, e, r, flash) {
            const S = MidBoss._NEON_SHAPES;
            Neon.shape(c, S.sentinelBarrel, r, e.accent, 1, flash, 0.35);
            Neon.shape(c, MidBoss._flip(S.sentinelBarrel), r, e.accent, 1, flash, 0.35);
            Neon.shape(c, S.sentinel, r, e.color, 1.8, flash, 0.22);
            Neon.path(c, S.sentinel, r * 0.6, true);
            c.strokeStyle = e.accent; c.globalAlpha = 0.4; c.lineWidth = 1; c.stroke();
            c.globalAlpha = 1;
            Enemies._neonPair(c, [0.58, -0.08, 0.96, -0.04], r, e.accent, 0.5, 1);
            Enemies._neonPair(c, [0.58, 0.1, 0.9, 0.1], r, e.accent, 0.5, 1);
            Enemies._neonPair(c, [0.35, -0.7, 0.45, 0.62], r, e.accent, 0.3, 1);
            c.beginPath();
            c.ellipse(0, -r * 0.2, r * 0.22, r * 0.12, 0, 0, Math.PI * 2);
            c.fillStyle = flash ? '#ffffff' : '#140600'; c.globalAlpha = 0.9; c.fill();
            c.globalAlpha = 1;
            Neon.stroke(c, e.accent, 1, flash);
        },
        forge_walker(c, e, r, flash) {
            const S = MidBoss._NEON_SHAPES;
            Neon.shape(c, S.forgeStack, r, e.accent, 1, flash, 0.3);
            Neon.shape(c, MidBoss._flip(S.forgeStack), r, e.accent, 1, flash, 0.3);
            Neon.shape(c, S.forgeCannon, r, e.accent, 1, flash, 0.35);
            Neon.shape(c, S.forge, r, e.color, 1.8, flash, 0.24);
            // Furnace grille
            for (let j = 0; j < 4; j++) {
                const y = -0.2 + j * 0.12;
                Neon.detail(c, [-0.34, y, 0.34, y], r, e.accent, 0.45, 1.2);
            }
            Enemies._neonPair(c, [0.5, -0.5, 0.62, 0.15], r, e.accent, 0.35, 1);
            Neon.detail(c, [-0.5, -0.42, 0.5, -0.42], r, e.accent, 0.35, 1);
        },
        debris_hauler(c, e, r, flash) {
            const S = MidBoss._NEON_SHAPES;
            Neon.shape(c, S.hauler, r, e.color, 1.8, flash, 0.22);
            // Cargo grid
            for (let j = -1; j <= 1; j++) Neon.detail(c, [j * 0.2, -0.5, j * 0.2, 0.25], r, e.accent, 0.35, 1);
            Neon.detail(c, [-0.42, -0.25, 0.42, -0.25], r, e.accent, 0.35, 1);
            Neon.detail(c, [-0.42, 0.02, 0.42, 0.02], r, e.accent, 0.35, 1);
            Neon.detail(c, [-0.25, -0.62, 0.25, -0.62], r, e.accent, 0.9, 2);
            Enemies._neonPair(c, [0.62, -0.3, 0.75, -0.3, 0.75, 0.1, 0.62, 0.1], r, e.accent, 0.6, 1.2);
        },
        strike_leader(c, e, r, flash) {
            const S = MidBoss._NEON_SHAPES;
            Neon.shape(c, S.striker, r, e.color, 1.7, flash, 0.22);
            Neon.detail(c, [0, 0.72, 0, -0.45], r, e.accent, 0.4, 1);
            Enemies._neonPair(c, [0.32, 0.02, 0.9, -0.4], r, e.accent, 0.6, 1.2);
            Enemies._neonPair(c, [0.3, -0.2, 0.62, -0.42], r, e.accent, 0.4, 1);
            Neon.shape(c, S.strikerCanopy, r, e.accent, 0.9, flash, 0.4);
        },
        core_warden(c, e, r, flash) {
            const S = MidBoss._NEON_SHAPES;
            for (let k = 0; k < 4; k++) {
                c.save();
                c.rotate(k * Math.PI / 2);
                Neon.shape(c, S.wardenSpike, r, e.accent, 1, flash, 0.3);
                c.restore();
            }
            Neon.shape(c, S.wardenOuter, r, e.color, 1.8, flash, 0.18);
            Neon.shape(c, S.wardenInner, r, e.accent, 1, flash, 0.14);
            for (let k = 0; k < 8; k++) {
                const i = k * 2;
                Neon.detail(c, [S.wardenInner[i], S.wardenInner[i + 1], S.wardenOuter[i], S.wardenOuter[i + 1]], r, e.accent, 0.4, 1);
            }
        },
        glitch_echo(c, color, r, flash) {
            const S = MidBoss._NEON_SHAPES;
            Neon.shape(c, S.echoHull, r, color, 1.5, flash, 0.18);
            Neon.detail(c, [0, 0.78, 0, -0.3], r, color, 0.45, 1);
            Enemies._neonPair(c, [0.32, -0.1, 0.82, -0.47], r, color, 0.6, 1);
            Neon.shape(c, S.echoCanopy, r, color, 0.8, flash, 0.35);
        },
    },

    _neon: {
        sentinel(ctx, e, r, flash) {
            const t = e.moveTimer;
            this._glow(e, r * 2.6, flash);
            if (flash) ctx.scale(1.05, 0.96);
            Neon.sprite(ctx, 'm_sentinel|' + e.color + (flash ? '|f' : ''), r * 1.12 + 6, this._bake.sentinel, e, r, flash);
            // Rotating weapon ring, eye and barrel muzzles
            ctx.beginPath();
            ctx.arc(0, 0, r * 0.5, t * 2, t * 2 + Math.PI * 1.4);
            ctx.globalAlpha = 0.7;
            Neon.stroke(ctx, e.accent, 0.8, false);
            ctx.globalAlpha = 1;
            const look = Math.max(-1, Math.min(1, (Player.x - e.x) / 200));
            Neon.light(ctx, look * r * 0.1, -r * 0.2, r * 0.06, e.accent, 1);
            const charge = Math.max(0, Math.min(1, 1 - e.fireTimer / 0.4));
            Neon.light(ctx, -r * 0.32, r * 1.05, 2.5, e.bulletColor, 0.3 + charge * 0.7);
            Neon.light(ctx, r * 0.32, r * 1.05, 2.5, e.bulletColor, 0.3 + charge * 0.7);
        },

        forge_walker(ctx, e, r, flash) {
            const t = e.moveTimer;
            this._glow(e, r * 2.6, flash);
            // Four legs stepping in alternating pairs (drawn behind the body)
            for (let k = 0; k < 4; k++) {
                const side = k < 2 ? -1 : 1;
                const front = k % 2 === 0 ? -1 : 1;
                const ph = t * 4 + (k === 0 || k === 3 ? 0 : Math.PI);
                const lift = Math.max(0, Math.sin(ph)) * 0.12;
                const hx = side * r * 0.62, hy = r * (0.05 + front * 0.2);
                const kx = side * r * 0.98, ky = hy - r * (0.18 + lift);
                const fx = side * r * (1.02 + Math.cos(ph) * 0.06), fy = hy + r * (0.32 - lift);
                ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy);
                Neon.stroke(ctx, e.color, 1.3, flash);
                Neon.light(ctx, fx, fy, 2, e.accent, 0.8);
            }
            if (flash) ctx.scale(1.05, 0.96);
            Neon.sprite(ctx, 'm_forge|' + e.color + (flash ? '|f' : ''), r * 1.0 + 6, this._bake.forge_walker, e, r, flash);
            Neon.light(ctx, 0, -r * 0.02, r * 0.12, '#ff2200', 0.6 + Math.sin(t * 5) * 0.3);
            // Smoke and embers rising from the stacks
            for (let s = -1; s <= 1; s += 2) {
                for (let j = 0; j < 3; j++) {
                    const p = (t * 0.8 + j / 3 + (s > 0 ? 0.5 : 0)) % 1;
                    ctx.fillStyle = j === 0 ? e.accent : '#553322';
                    ctx.globalAlpha = (1 - p) * (j === 0 ? 0.7 : 0.35);
                    ctx.beginPath();
                    ctx.arc(s * r * 0.365 + Math.sin(p * 6 + j) * 3, -r * (0.98 + p * 0.5), j === 0 ? 1.5 : 3 + p * 5, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            ctx.globalAlpha = 1;
        },

        debris_hauler(ctx, e, r, flash) {
            const t = e.moveTimer;
            this._glow(e, r * 2.6, flash);
            // Tractor beam between the claws
            const beam = e.bulletColor;
            ctx.fillStyle = beam;
            ctx.globalAlpha = 0.08 + Math.sin(t * 4) * 0.04;
            ctx.beginPath();
            ctx.moveTo(-r * 0.3, r * 0.55); ctx.lineTo(r * 0.3, r * 0.55);
            ctx.lineTo(r * 0.55, r * 1.3); ctx.lineTo(-r * 0.55, r * 1.3);
            ctx.fill();
            ctx.strokeStyle = beam;
            ctx.lineWidth = 1;
            for (let j = 0; j < 3; j++) {
                const p = (t * 0.7 + j / 3) % 1;
                ctx.globalAlpha = 0.4 * (1 - p);
                const y = r * (1.3 - p * 0.75), w = r * (0.55 - p * 0.25);
                ctx.beginPath(); ctx.moveTo(-w, y); ctx.lineTo(w, y); ctx.stroke();
            }
            ctx.globalAlpha = 1;
            // Claws open and close
            const open = 0.25 + Math.sin(t * 2) * 0.2;
            for (let s = -1; s <= 1; s += 2) {
                const bx = s * r * 0.35, by = r * 0.42;
                const ex = s * r * 0.5, ey = r * 0.8;
                ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex, ey);
                ctx.lineTo(ex + s * Math.sin(open) * r * 0.25, ey + Math.cos(open) * r * 0.25);
                ctx.moveTo(ex, ey);
                ctx.lineTo(ex - s * Math.sin(open) * r * 0.25, ey + Math.cos(open) * r * 0.25);
                Neon.stroke(ctx, e.accent, 1.1, flash);
            }
            if (flash) ctx.scale(1.05, 0.96);
            Neon.sprite(ctx, 'm_hauler|' + e.color + (flash ? '|f' : ''), r * 0.8 + 6, this._bake.debris_hauler, e, r, flash);
            const blink = Math.floor(t * 3) % 2;
            Neon.light(ctx, -r * 0.68, -r * 0.1, 2, beam, blink ? 1 : 0.3);
            Neon.light(ctx, r * 0.68, -r * 0.1, 2, beam, blink ? 0.3 : 1);
        },

        strike_leader(ctx, e, r, flash) {
            const t = e.moveTimer;
            this._glow(e, r * 2.4, flash);
            const moving = Math.abs(e.x - e.dartTarget) > 4;
            // Afterburners at the tail (pointing up), brighter while darting
            const len = r * (moving ? 0.22 : 0.12) + Math.sin(t * 40) * 1.5;
            Neon.flame(ctx, -r * 0.2, -r * 0.62, 5, -len, e.accent, moving ? 0.9 : 0.6);
            Neon.flame(ctx, r * 0.2, -r * 0.62, 5, -len, e.accent, moving ? 0.9 : 0.6);
            if (moving) ctx.scale(0.86, 1);
            if (flash) ctx.scale(1.05, 0.96);
            Neon.sprite(ctx, 'm_striker|' + e.color + (flash ? '|f' : ''), r * 1.1 + 6, this._bake.strike_leader, e, r, flash);
            const blink = Math.sin(t * 8) > 0;
            Neon.light(ctx, -r * 0.97, -r * 0.45, 2, e.accent, blink ? 1 : 0.3);
            Neon.light(ctx, r * 0.97, -r * 0.45, 2, e.accent, blink ? 0.3 : 1);
        },

        core_warden(ctx, e, r, flash) {
            const t = e.moveTimer;
            // Fade and shrink while warping out
            if (e.warpTimer > 0) {
                const k = Math.max(0, e.warpTimer / 0.5);
                ctx.globalAlpha = k;
                ctx.scale(0.4 + k * 0.6, 0.4 + k * 0.6);
            }
            this._glow(e, r * 3, flash, 0.35);
            ctx.save();
            ctx.rotate(t * 0.4);
            if (flash) ctx.scale(1.05, 1.05);
            Neon.sprite(ctx, 'm_warden|' + e.color + (flash ? '|f' : ''), r * 1.2 + 6, this._bake.core_warden, e, r, flash);
            ctx.restore();
            // Two segmented rings turning in opposite directions
            const a0 = ctx.globalAlpha;
            for (let ring = 0; ring < 2; ring++) {
                const rr = r * (ring === 0 ? 0.68 : 1.02);
                const off = t * (ring === 0 ? -1.4 : 0.9);
                const n = ring === 0 ? 4 : 6;
                for (let k = 0; k < n; k++) {
                    const a = off + (Math.PI * 2 / n) * k;
                    ctx.beginPath(); ctx.arc(0, 0, rr, a, a + Math.PI / n);
                    ctx.globalAlpha = a0 * 0.8;
                    Neon.stroke(ctx, ring === 0 ? e.accent : e.color, 0.8, flash);
                }
            }
            ctx.globalAlpha = a0;
            Neon.light(ctx, 0, 0, r * 0.13 + Math.sin(t * 6) * 1.5, e.accent, 1);
        },

        glitch_echo(ctx, e, r, flash) {
            const t = e.moveTimer;
            const s = r * 0.9;
            this._glow(e, r * 2.4, flash);
            // Engines at the tail (pointing up)
            const f = Math.sin(t * 40) * 1.5;
            Neon.flame(ctx, -s * 0.22, -s * 0.62, 4, -(s * 0.15 + f), e.color, 0.7);
            Neon.flame(ctx, s * 0.22, -s * 0.62, 4, -(s * 0.15 - f), e.color, 0.7);
            // Magenta ghost copy that jitters, with the odd big glitch jump
            const big = Math.random() < 0.05;
            const gx = big ? (Math.random() - 0.5) * 24 : Math.sin(t * 13) * 3;
            const gy = big ? (Math.random() - 0.5) * 12 : Math.cos(t * 9) * 2;
            ctx.save();
            ctx.translate(gx, gy);
            ctx.globalAlpha = big ? 0.6 : 0.35;
            Neon.sprite(ctx, 'm_echo|' + e.accent, s * 1.2 + 6, this._bake.glitch_echo, e.accent, s, false);
            ctx.restore();
            if (flash) ctx.scale(1.05, 0.96);
            Neon.sprite(ctx, 'm_echo|' + e.color + (flash ? '|f' : ''), s * 1.2 + 6, this._bake.glitch_echo, e.color, s, flash);
        },
    },

    draw(ctx, e, flash) {
        this._neon[e.type].call(this, ctx, e, e.radius, flash);
    },

    // Top-of-screen HP bar and timer (same place as the boss bar; they never overlap)
    drawBar(ctx) {
        const e = this.current();
        if (!e || e.y < 0) return;
        const timeLeft = Math.max(0, MIDBOSS_TIME_LIMIT - e.onScreenTime);
        Neon.topBar(ctx, 'MID-BOSS — ' + e.midboss.name, e.hp / e.maxHp, e.color, timeLeft);
    },
};
