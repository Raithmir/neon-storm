// ============================================================
//  ENEMY SYSTEM
// ============================================================
const Enemies = {
    list: [],
    enemyBullets: new BulletPool(800, true),

    // Enemy type definitions (data-driven)
    types: {
        scout_drone: {
            hp: 1, speed: 150, radius: 12, score: 100, color: '#ff8c00', accent: '#ffcc44', bulletColor: '#ff6600',
            fireRate: 2.0, bulletSpeed: 180, dropChance: 0.08
        },
        gunship: {
            hp: 3, speed: 80, radius: 18, score: 300, color: '#ff6600', accent: '#ffaa00', bulletColor: '#ff3300',
            fireRate: 1.5, bulletSpeed: 170, dropChance: 0.18
        },
        missile_turret: {
            hp: 5, speed: 30, radius: 22, score: 500, color: '#ff4400', accent: '#ff8844', bulletColor: '#ff2200',
            fireRate: 2.8, bulletSpeed: 130, dropChance: 0.25, cancelBullets: true
        },
        phase_shifter: {
            hp: 4, speed: 100, radius: 15, score: 600, color: '#ff00ff', accent: '#ff88ff', bulletColor: '#cc00ff',
            fireRate: 3.0, bulletSpeed: 160, dropChance: 0.20, cancelBullets: true
        },
        shielded_cruiser: {
            hp: 8, shieldHp: 3, speed: 40, radius: 28, score: 1000, color: '#8b00ff', accent: '#aa44ff', bulletColor: '#6600cc',
            fireRate: 2.5, bulletSpeed: 140, dropChance: 0.5, cancelBullets: true
        },
        bomber: {
            hp: 6, speed: 50, radius: 24, score: 700, color: '#ff4400', accent: '#ff6622', bulletColor: '#ff2200',
            fireRate: 2.5, bulletSpeed: 110, dropChance: 0.30, cancelBullets: true
        },
        sniper: {
            hp: 2, speed: 20, radius: 14, score: 400, color: '#ffff00', accent: '#ffffaa', bulletColor: '#ffcc00',
            fireRate: 3.5, bulletSpeed: 500, dropChance: 0.15
        },
        carrier: {
            hp: 10, speed: 25, radius: 30, score: 1200, color: '#cc6600', accent: '#ff8800', bulletColor: '#ff6600',
            fireRate: 2.0, bulletSpeed: 140, dropChance: 0.6, cancelBullets: true
        },
        shield_wall: {
            hp: 3, speed: 60, radius: 16, score: 250, color: '#4488ff', accent: '#66aaff', bulletColor: '#2266dd',
            fireRate: 2.0, bulletSpeed: 160, dropChance: 0.10
        }
    },

    // Enemies whose patterns scale bullet COUNT with density; all others scale fire frequency
    COUNT_SCALED: { phase_shifter: true, bomber: true },
    // Seconds an enemy on these paths stays before retreating (genre convention: nothing waits forever)
    LIFETIMES: { hover: 14, strafe: 16 },
    CARRIER_MAX_LAUNCHES: 6,
    NO_FIRE_RADIUS: 110,          // no point-blank shots at the player
    FIRE_CEILING: PLAY_H * 0.75,  // enemies below this line stop firing

    spawn(type, x, y, movePath) {
        const def = this.types[type];
        if (!def) return;
        const hpScale = GameConfig._levelHpScale || 1;
        const spdScale = GameConfig._levelSpeedScale || 1;
        const rateScale = GameConfig._levelFireRateScale || 1;
        const density = GameConfig.bulletDensity || 1;
        const densityRate = this.COUNT_SCALED[type] ? 1 : density;
        const fireRate = def.fireRate / (rateScale * densityRate);
        // Spawned beside the play area (e.g. "sides" formation): fly in before following the path
        const entryX = x < 0 ? 70 : x > PLAY_W ? PLAY_W - 70 : null;
        const enemy = {
            type, x, y,
            hp: Math.ceil(def.hp * hpScale),
            maxHp: Math.ceil(def.hp * hpScale),
            shieldHp: Math.ceil((def.shieldHp || 0) * hpScale),
            maxShieldHp: Math.ceil((def.shieldHp || 0) * hpScale),
            speed: def.speed,
            radius: def.radius,
            score: Math.floor(def.score * hpScale),
            color: def.color,
            accent: def.accent || def.color,
            bulletColor: def.bulletColor || '#ff1493',
            fireRate,
            fireTimer: fireRate * Math.random(),
            bulletSpeed: def.bulletSpeed * spdScale,
            dropChance: def.dropChance,
            cancelBullets: def.cancelBullets || false,
            movePath: movePath || 'straight_down',
            moveTimer: 0,
            entryX,
            retreating: false,
            launches: 0,
            active: true,
            flashTimer: 0,
            // Phase shifter specific
            teleportTimer: type === 'phase_shifter' ? 3.0 : 0,
            warpTimer: 0,
            warpTo: null,
            // Shielded cruiser specific
            shieldAngle: 0,
            // Sniper specific
            aimAngle: Math.PI / 2,
            // Visual rotation
            rotation: 0,
            prevX: x,
            prevY: y
        };
        this.list.push(enemy);
        return enemy;
    },

    update(dt, playerX, playerY) {
        for (let i = this.list.length - 1; i >= 0; i--) {
            const e = this.list[i];
            e.moveTimer += dt;
            e.flashTimer = Math.max(0, e.flashTimer - dt);

            // Store pre-move position
            const oldX = e.x, oldY = e.y;

            // Movement based on path type
            this._updateMovement(e, dt);

            // Update visual rotation based on movement direction
            const dmx = e.x - oldX;
            // Types that bank when moving horizontally
            const rotTypes = { scout_drone: 0.8, gunship: 0.6, bomber: 0.4, shielded_cruiser: 0.25, carrier: 0.15 };
            const rotStrength = rotTypes[e.type];
            if (rotStrength !== undefined) {
                // Simple banking: horizontal velocity → tilt angle, clamped
                const targetRot = Math.max(-0.4, Math.min(0.4, dmx * 0.02)) * rotStrength;
                // Smooth interpolation
                e.rotation += (targetRot - e.rotation) * Math.min(1, dt * 6);
            } else {
                e.rotation *= (1 - dt * 4);
            }
            e.prevX = oldX;
            e.prevY = oldY;

            // Firing — only on screen, above the fire ceiling, and not point-blank on the player
            e.fireTimer -= dt;
            if (e.fireTimer <= 0) {
                const onScreen = e.x > 0 && e.x < PLAY_W && e.y > 0 && e.y < this.FIRE_CEILING;
                const pdx = playerX - e.x, pdy = playerY - e.y;
                const tooClose = pdx * pdx + pdy * pdy < this.NO_FIRE_RADIUS * this.NO_FIRE_RADIUS;
                if (onScreen && !tooClose && e.warpTimer <= 0 && !e.retreating) {
                    this._firePattern(e, playerX, playerY);
                }
                e.fireTimer = e.fireRate;
            }

            // Phase shifter teleport — telegraphed: a marker appears at the destination first
            if (e.type === 'phase_shifter' && !e.retreating) {
                if (e.warpTimer > 0) {
                    e.warpTimer -= dt;
                    if (e.warpTimer <= 0) {
                        e.x = e.warpTo.x;
                        e.y = e.warpTo.y;
                        e.fireTimer = Math.max(e.fireTimer, 0.8); // no instant shot after arriving
                        Particles.spawn(e.x, e.y, 8, { color: e.bulletColor, speed: 80, life: 0.3 });
                    }
                } else {
                    e.teleportTimer -= dt;
                    if (e.teleportTimer <= 0) {
                        e.warpTo = { x: 40 + Math.random() * (PLAY_W - 80), y: 40 + Math.random() * (PLAY_H * 0.4) };
                        e.warpTimer = 0.45;
                        e.teleportTimer = 2.5 + Math.random();
                    }
                }
            }

            // Sniper aim tracking — locks 0.3 s before the shot so the laser sight is honest
            if (e.type === 'sniper' && e.fireTimer > 0.3) {
                e.aimAngle = Math.atan2(playerY - e.y, playerX - e.x);
            }

            // Shielded cruiser shield rotation
            if (e.type === 'shielded_cruiser') {
                e.shieldAngle += dt * 1.5;
            }

            // Remove if off screen (retreating enemies leave through the top)
            if (e.y > PLAY_H + 60 || e.x < -60 || e.x > PLAY_W + 60 || (e.retreating && e.y < -60)) {
                this.list.splice(i, 1);
            }
        }

        // Enemy homing bullets track the player
        this.enemyBullets.update(dt, Player.alive ? [{ x: playerX, y: playerY }] : null);
    },

    // Every remaining enemy leaves the screen (used when the boss arrives)
    retreatAll() {
        for (const e of this.list) e.retreating = true;
    },

    _updateMovement(e, dt) {
        // Mid-bosses have their own movement (midbosses.js) until they retreat
        if (e.midboss && !e.retreating) {
            MidBoss.updateMovement(e, dt, Player.x);
            return;
        }
        // Fly in from beside the play area first
        if (e.entryX !== null) {
            const step = Math.max(80, e.speed) * 1.5 * dt;
            e.x += Math.max(-step, Math.min(step, e.entryX - e.x));
            if (Math.abs(e.x - e.entryX) < 1) { e.entryX = null; e.moveTimer = 0; }
            return;
        }
        // Retreat: leave upwards after the path's lifetime (or when told to)
        const lifetime = this.LIFETIMES[e.movePath];
        if (lifetime && e.moveTimer > lifetime) e.retreating = true;
        if (e.retreating) {
            e.y -= Math.max(90, e.speed * 1.5) * dt;
            return;
        }
        switch (e.movePath) {
            case 'straight_down':
                e.y += e.speed * dt;
                break;
            case 'sweep_left':
                e.y += e.speed * 0.5 * dt;
                e.x -= e.speed * 0.7 * dt;
                break;
            case 'sweep_right':
                e.y += e.speed * 0.5 * dt;
                e.x += e.speed * 0.7 * dt;
                break;
            case 'zigzag':
                e.y += e.speed * 0.6 * dt;
                e.x += Math.sin(e.moveTimer * 3) * e.speed * 0.8 * dt;
                break;
            case 'strafe':
                e.y += e.speed * 0.2 * dt;
                e.x += Math.sin(e.moveTimer * 2) * e.speed * dt;
                break;
            case 'hover':
                e.y += Math.max(0, (100 - e.y) * 0.5) * dt;
                e.x += Math.sin(e.moveTimer * 1.5) * e.speed * 0.3 * dt;
                break;
        }
    },

    _firePattern(e, px, py) {
        const density = GameConfig.bulletDensity;
        const dx = px - e.x;
        const dy = py - e.y;
        const angle = Math.atan2(dy, dx);
        const bs = e.bulletSpeed;

        if (e.midboss) {
            MidBoss.fire(e, px, py);
            return;
        }
        switch (e.type) {
            case 'scout_drone':
                // Fires from sensor at centre
                this.enemyBullets.spawn(e.x, e.y + e.radius * 0.3,
                    Math.cos(angle) * bs, Math.sin(angle) * bs,
                    { color: e.bulletColor, radius: 3 });
                break;
            case 'gunship':
                // Fires from under-nose cannon
                for (let j = -1; j <= 1; j++) {
                    const a = angle + j * 0.15;
                    this.enemyBullets.spawn(e.x, e.y + e.radius * 0.9,
                        Math.cos(a) * bs, Math.sin(a) * bs,
                        { color: e.bulletColor, radius: 3 });
                }
                break;
            case 'missile_turret':
                // Slow homing missile from the barrel tip — gentle turn rate, easy to out-turn
                this.enemyBullets.spawn(e.x, e.y + e.radius * 0.85,
                    Math.cos(angle) * bs * 0.8, Math.sin(angle) * bs * 0.8,
                    { color: e.bulletColor, radius: 4, life: 4, type: 'homing', turnRate: 1.0 });
                break;
            case 'phase_shifter': {
                // Radial burst from energy core (centre is fine)
                const count = Math.floor(8 * density);
                for (let j = 0; j < count; j++) {
                    const a = (Math.PI * 2 / count) * j;
                    this.enemyBullets.spawn(e.x, e.y,
                        Math.cos(a) * bs, Math.sin(a) * bs,
                        { color: e.bulletColor, radius: 3 });
                }
                break;
            }
            case 'shielded_cruiser':
                // Fires from side weapon bays
                for (let j = -1; j <= 1; j += 2) {
                    const a = angle + j * 0.3;
                    this.enemyBullets.spawn(e.x + j * e.radius * 0.7, e.y,
                        Math.cos(a) * bs, Math.sin(a) * bs,
                        { color: e.bulletColor, radius: 4 });
                }
                break;
            case 'bomber': {
                // Drops from bomb bay doors
                const bombCount = Math.floor(3 * density);
                for (let j = 0; j < bombCount; j++) {
                    const bx = e.x + (j - (bombCount - 1) / 2) * 15;
                    this.enemyBullets.spawn(bx, e.y + e.radius * 0.55, (Math.random() - 0.5) * 30, bs * 0.6,
                        { color: e.bulletColor, radius: 5, life: 1.5 });
                }
                // Ring from centre
                const ringCount = Math.floor(10 * density);
                for (let j = 0; j < ringCount; j++) {
                    const a = (Math.PI * 2 / ringCount) * j;
                    this.enemyBullets.spawn(e.x, e.y + e.radius * 0.3,
                        Math.cos(a) * bs * 0.5, Math.sin(a) * bs * 0.5,
                        { color: e.accent, radius: 2.5, life: 2 });
                }
                break;
            }
            case 'sniper': {
                // Fires from barrel end along the locked aim (matches the laser sight)
                this.enemyBullets.spawn(e.x, e.y + e.radius * 0.9,
                    Math.cos(e.aimAngle) * bs, Math.sin(e.aimAngle) * bs,
                    { color: e.bulletColor, radius: 4, life: 3 });
                break;
            }
            case 'carrier':
                // Drones launch from hangar bay
                if (Enemies.list.length < 30 && e.launches < this.CARRIER_MAX_LAUNCHES) {
                    e.launches++;
                    Enemies.spawn('scout_drone', e.x + (Math.random() - 0.5) * 15, e.y + e.radius * 0.6, 'straight_down');
                }
                break;
            case 'shield_wall':
                // Centre shot
                this.enemyBullets.spawn(e.x, e.y + e.radius * 0.2,
                    Math.cos(angle) * bs, Math.sin(angle) * bs,
                    { color: e.bulletColor, radius: 3 });
                break;
        }
    },

    hit(enemy, damage, playerDist) {
        Audio.playHitTick();
        if (enemy.shieldHp > 0) {
            enemy.shieldHp -= damage;
            enemy.flashTimer = 0.08;
            Particles.spawn(enemy.x, enemy.y, 3, { color: enemy.bulletColor, speed: 60, life: 0.15, size: 1.5 });
            if (enemy.shieldHp <= 0) {
                Particles.spawn(enemy.x, enemy.y, 12, { color: enemy.bulletColor, speed: 120, life: 0.4 });
            }
            return false; // not dead
        }
        enemy.hp -= damage;
        enemy.flashTimer = 0.08;
        // GPU glow flash (impact sparks are spawned by the bullet: Particles.impact)
        Renderer.addGlow(enemy.x, enemy.y, 0xffffff, enemy.radius * 3, 0.7);
        if (enemy.hp <= 0) {
            this._onDeath(enemy, playerDist);
            return true;
        }
        return false;
    },

    _onDeath(enemy, playerDist) {
        enemy.active = false;
        const isBig = enemy.radius > 20;
        const explColor = Hangar.explosionColor;
        const accent = enemy.accent || explColor;

        // Layered explosion: use spawnExplosion for the main burst
        Particles.spawnExplosion(enemy.x, enemy.y, {
            style: isBig ? 'large' : 'medium',
            color: explColor,
            color2: '#ffffff',
        });
        // Extra accent-coloured sparks for visual variety
        Particles.spawn(enemy.x, enemy.y, isBig ? 12 : 6, { color: accent, speed: 180, life: 0.7, size: 3 });
        // The ship's neon outline breaks apart
        const outline = MidBoss.isType(enemy.type) ? MidBoss.outline(enemy) : this.outline(enemy);
        if (outline) Particles.shatter(enemy.x, enemy.y, outline.pts, outline.scale, enemy.rotation || 0, enemy.color, isBig ? 1.3 : 1);
        if (isBig) ScreenShake.trigger(6, 0.25);

        // Bullet cancel
        if (enemy.cancelBullets) {
            for (const b of this.enemyBullets.pool) {
                const dx = b.x - enemy.x;
                const dy = b.y - enemy.y;
                if (dx * dx + dy * dy < 120 * 120) {
                    b.active = false;
                    // Spawn score pickup particle
                    Particles.spawn(b.x, b.y, 1, { color: '#00ffff', speed: 30, life: 0.8, size: 2 });
                    Scoring.score += Math.floor(250 * Scoring.multiplier * GameConfig.scoreMultiplier);
                }
            }
        }

        if (enemy.midboss) MidBoss.onDefeat(enemy);
        Scoring.addKill(enemy.score, playerDist);
        Achievements.onEnemyKill();
        Audio.playExplosionSmall();

        // Power-up drop
        if (Math.random() < enemy.dropChance) {
            PowerUps.spawn(enemy.x, enemy.y);
        }

        // Remove from list
        const idx = this.list.indexOf(enemy);
        if (idx >= 0) this.list.splice(idx, 1);
    },

    // ------------------------------------------------------------
    //  Neon style art (see neon.js). Each entry draws one enemy type
    //  around its centre: the static body comes from the sprite atlas,
    //  animated parts are drawn live on top. Outlines are in units of r.
    // ------------------------------------------------------------
    _NEON_SHAPES: {
        scout: Neon.mirror([0, -0.7, 0.32, -0.25, 0.28, 0.3, 0, 0.55]),
        gunship: Neon.mirror([0, -0.8, 0.4, -0.3, 0.9, 0, 0.85, 0.2, 0.4, 0.1, 0.35, 0.6, 0.6, 0.8, 0.3, 0.7]),
        gunshipCanopy: Neon.mirror([0, -0.62, 0.14, -0.42, 0.12, -0.25, 0, -0.2]),
        gunshipBarrel: [-0.07, 0.62, 0.07, 0.62, 0.07, 0.98, -0.07, 0.98],
        turretBase: [-0.8, -0.4, 0.8, -0.4, 0.6, 0.4, -0.6, 0.4],
        turretBracket: [0.5, -0.15, 0.72, -0.15, 0.72, 0.15, 0.5, 0.15],
        turretBarrel: [-0.1, 0.2, 0.1, 0.2, 0.1, 0.76, -0.1, 0.76],
        turretTip: [-0.18, 0.74, 0.18, 0.74, 0.18, 0.88, -0.18, 0.88],
        star: (() => {
            const pts = [];
            for (let j = 0; j < 10; j++) {
                const a = (Math.PI * 2 / 10) * j - Math.PI / 2;
                const k = j % 2 === 0 ? 1 : 0.45;
                pts.push(Math.cos(a) * k, Math.sin(a) * k);
            }
            return pts;
        })(),
        cruiser: Neon.mirror([0, -0.7, 0.5, -0.5, 0.8, -0.1, 0.7, 0.5, 0.3, 0.7]),
        cruiserBridge: Neon.mirror([0, -0.44, 0.2, -0.34, 0.2, -0.24, 0, -0.18]),
        bomber: Neon.mirror([0, -0.5, 0.4, -0.4, 0.9, -0.1, 0.8, 0.2, 0.4, 0.3, 0.35, 0.6]),
        sniperBody: [-0.5, -0.3, 0.5, -0.3, 0.4, 0.3, -0.4, 0.3],
        sniperVane: [0.45, -0.2, 0.72, -0.4, 0.66, 0.08, 0.42, 0.2],
        sniperBarrel: [-0.08, 0.25, 0.08, 0.25, 0.08, 1.0, -0.08, 1.0],
        carrier: Neon.mirror([0, -0.6, 0.6, -0.4, 0.9, 0, 0.8, 0.5, 0.4, 0.7]),
        carrierBay: [-0.25, 0.3, 0.25, 0.3, 0.2, 0.66, -0.2, 0.66],
        wall: [-1, -0.3, 1, -0.3, 1, 0.3, -1, 0.3],
    },

    // Outline used when the enemy shatters: flat points in units of the radius
    _OUTLINES: {
        scout_drone: 'scout', gunship: 'gunship', missile_turret: 'turretBase', phase_shifter: 'star',
        shielded_cruiser: 'cruiser', bomber: 'bomber', sniper: 'sniperBody', carrier: 'carrier', shield_wall: 'wall',
    },
    outline(e) {
        const key = this._OUTLINES[e.type];
        return key ? { pts: this._NEON_SHAPES[key], scale: e.radius } : null;
    },

    _neonGlow(e, size, flash, alpha) {
        if (e._glowHex === undefined) e._glowHex = Renderer.colorToHex(e.color);
        Renderer.addGlow(e.x, e.y, e._glowHex, size, flash ? 0.6 : (alpha || 0.22));
    },

    // Mirror a right-side detail line to the left (x -> -x) and draw both
    _neonPair(ctx, pts, r, color, alpha, width) {
        Neon.detail(ctx, pts, r, color, alpha, width);
        const m = pts.slice();
        for (let i = 0; i < m.length; i += 2) m[i] = -m[i];
        Neon.detail(ctx, m, r, color, alpha, width);
    },

    // Static bodies, baked into the atlas once per colour and flash state
    _bake: {
        scout(c, e, r, flash) {
            const S = Enemies._NEON_SHAPES;
            Enemies._neonPair(c, [0.3, -0.2, 0.8, -0.35], r, e.accent, 0.8, 1.2);
            for (let s = -1; s <= 1; s += 2) {
                const rx = s * r * 0.8, ry = -r * 0.35, rr = r * 0.34;
                c.fillStyle = e.accent;
                c.globalAlpha = 0.08;
                c.beginPath(); c.arc(rx, ry, rr, 0, Math.PI * 2); c.fill();
                c.globalAlpha = 1;
                Neon.ring(c, rx, ry, rr, e.accent, 0.6, flash);
            }
            Neon.shape(c, S.scout, r, e.color, 1.1, flash, 0.3);
            Neon.detail(c, [-0.18, 0.2, 0, 0.32, 0.18, 0.2], r, e.accent, 0.6, 0.8);
        },
        gunship(c, e, r, flash) {
            const S = Enemies._NEON_SHAPES;
            Neon.shape(c, S.gunshipBarrel, r, e.accent, 0.8, flash, 0.4);
            Neon.shape(c, S.gunship, r, e.color, 1.2, flash, 0.24);
            Enemies._neonPair(c, [0.42, 0.02, 0.84, 0.1], r, e.accent, 0.55, 1);
            Neon.detail(c, [0, -0.12, 0, 0.55], r, e.accent, 0.4, 1);
            Neon.detail(c, [-0.3, 0.62, 0.3, 0.62], r, e.accent, 0.4, 1);
            Neon.shape(c, S.gunshipCanopy, r, e.accent, 0.7, flash, 0.4);
        },
        missile_turret(c, e, r, flash) {
            const S = Enemies._NEON_SHAPES;
            Neon.shape(c, S.turretBarrel, r, e.accent, 0.9, flash, 0.35);
            Neon.shape(c, S.turretTip, r, e.accent, 0.9, flash, 0.35);
            Neon.shape(c, S.turretBase, r, e.color, 1.3, flash, 0.24);
            const m = S.turretBracket.slice();
            for (let i = 0; i < m.length; i += 2) m[i] = -m[i];
            Neon.shape(c, S.turretBracket, r, e.accent, 0.8, flash, 0.3);
            Neon.shape(c, m, r, e.accent, 0.8, flash, 0.3);
            Neon.detail(c, [-0.62, 0.22, 0.62, 0.22], r, e.accent, 0.4, 1);
            // Dome
            c.beginPath();
            c.arc(0, -r * 0.1, r * 0.35, Math.PI, 0);
            c.closePath();
            c.fillStyle = flash ? '#ffffff' : e.color;
            c.globalAlpha = 0.3;
            c.fill();
            c.globalAlpha = 1;
            Neon.stroke(c, e.color, 1, flash);
        },
        phase_shifter(c, e, r, flash) {
            const S = Enemies._NEON_SHAPES;
            Neon.shape(c, S.star, r, e.color, 1.1, flash, 0.25);
            for (let j = 0; j < 10; j += 2) {
                Neon.detail(c, [0, 0, S.star[j * 2], S.star[j * 2 + 1]], r, e.accent, 0.4, 0.8);
            }
            c.beginPath();
            for (let j = 1; j < 10; j += 2) c.lineTo(S.star[j * 2] * r, S.star[j * 2 + 1] * r);
            c.closePath();
            c.strokeStyle = e.accent; c.globalAlpha = 0.5; c.lineWidth = 0.8; c.stroke();
            c.globalAlpha = 1;
        },
        shielded_cruiser(c, e, r, flash) {
            const S = Enemies._NEON_SHAPES;
            Neon.shape(c, S.cruiser, r, e.color, 1.4, flash, 0.22);
            Neon.path(c, S.cruiser, r * 0.62, true);
            c.strokeStyle = e.accent; c.globalAlpha = 0.4; c.lineWidth = 1; c.stroke();
            c.globalAlpha = 1;
            Neon.detail(c, [-0.62, 0, 0.62, 0], r, e.accent, 0.5, 1);
            Neon.detail(c, [-0.42, 0.35, 0.42, 0.35], r, e.accent, 0.5, 1);
            Enemies._neonPair(c, [0.5, -0.5, 0.35, -0.05], r, e.accent, 0.4, 1);
            Neon.shape(c, S.cruiserBridge, r, e.accent, 0.8, flash, 0.35);
        },
        bomber(c, e, r, flash) {
            const S = Enemies._NEON_SHAPES;
            Neon.shape(c, S.bomber, r, e.color, 1.3, flash, 0.24);
            Enemies._neonPair(c, [0.42, -0.25, 0.84, -0.06], r, e.accent, 0.55, 1);
            Enemies._neonPair(c, [0.42, 0.1, 0.78, 0.16], r, e.accent, 0.4, 1);
            // Bomb bay frame
            Neon.path(c, [-0.27, 0.16, 0.27, 0.16, 0.27, 0.57, -0.27, 0.57], r, true);
            c.fillStyle = '#000000'; c.globalAlpha = 0.5; c.fill();
            c.globalAlpha = 1;
            Neon.stroke(c, e.accent, 0.7, flash);
        },
        sniper(c, e, r, flash) {
            const S = Enemies._NEON_SHAPES;
            Neon.shape(c, S.sniperBarrel, r, e.accent, 0.7, flash, 0.4);
            const m = S.sniperVane.slice();
            for (let i = 0; i < m.length; i += 2) m[i] = -m[i];
            Neon.shape(c, S.sniperVane, r, e.color, 0.8, flash, 0.2);
            Neon.shape(c, m, r, e.color, 0.8, flash, 0.2);
            Neon.shape(c, S.sniperBody, r, e.color, 1.1, flash, 0.25);
            Neon.detail(c, [-0.3, -0.12, 0.3, -0.12], r, e.accent, 0.4, 0.8);
            Neon.ring(c, 0, r * 1.0, r * 0.12, e.accent, 0.5, flash);
            Neon.ring(c, 0, 0, 3.5, e.accent, 0.5, flash);
        },
        carrier(c, e, r, flash) {
            const S = Enemies._NEON_SHAPES;
            Neon.shape(c, S.carrier, r, e.color, 1.5, flash, 0.22);
            Neon.path(c, S.carrier, r * 0.62, true);
            c.strokeStyle = e.accent; c.globalAlpha = 0.35; c.lineWidth = 1; c.stroke();
            c.globalAlpha = 1;
            Neon.detail(c, [-0.55, 0.05, 0.55, 0.05], r, e.accent, 0.45, 1);
            Enemies._neonPair(c, [0.62, -0.25, 0.82, 0.3], r, e.accent, 0.5, 1);
            Enemies._neonPair(c, [0.45, -0.1, 0.45, 0.55], r, e.accent, 0.35, 1);
            // Hangar bay
            Neon.path(c, S.carrierBay, r, true);
            c.fillStyle = '#000000'; c.globalAlpha = 0.6; c.fill();
            c.globalAlpha = 1;
            Neon.stroke(c, e.accent, 0.9, flash);
            // Bridge windows
            for (let j = -1; j <= 1; j++) {
                Neon.detail(c, [j * 0.1 - 0.035, -0.4, j * 0.1 + 0.035, -0.4], r, e.accent, 0.9, 1.6);
            }
        },
        shield_wall(c, e, r, flash) {
            const S = Enemies._NEON_SHAPES;
            Neon.shape(c, S.wall, r, e.color, 1.4, flash, 0.1);
            for (let j = -1; j <= 1; j++) Neon.detail(c, [j * 0.5, -0.26, j * 0.5, 0.26], r, e.accent, 0.3, 1);
            for (let sx = -1; sx <= 1; sx += 2) {
                for (let sy = -1; sy <= 1; sy += 2) Neon.light(c, sx * r, sy * r * 0.3, 1.6, e.accent, 1);
            }
        },
    },

    _neon: {
        scout_drone(ctx, e, r, flash) {
            const t = Neon.time();
            this._neonGlow(e, r * 2.6, flash);
            Neon.squash(ctx, flash, 0.15);
            Neon.sprite(ctx, 'scout|' + e.color + (flash ? '|f' : ''), r * 1.2 + 4, this._bake.scout, e, r, flash);
            // Spinning rotor blades
            ctx.strokeStyle = '#ffffff';
            ctx.globalAlpha = 0.7;
            ctx.lineWidth = 1;
            for (let s = -1; s <= 1; s += 2) {
                const rx = s * r * 0.8, ry = -r * 0.35, rr = r * 0.29;
                const a = t * 28 * s + e.x * 0.1;
                const bx = Math.cos(a) * rr, by = Math.sin(a) * rr;
                ctx.beginPath(); ctx.moveTo(rx - bx, ry - by); ctx.lineTo(rx + bx, ry + by); ctx.stroke();
            }
            ctx.globalAlpha = 1;
            const pulse = 0.7 + Math.sin(t * 9 + e.y * 0.05) * 0.3;
            Neon.light(ctx, 0, -r * 0.05, 1.8, '#ff3344', flash ? 1 : pulse);
        },

        gunship(ctx, e, r, flash) {
            const t = Neon.time();
            this._neonGlow(e, r * 2.4, flash);
            Neon.squash(ctx, flash, 0.12);
            Neon.sprite(ctx, 'gunship|' + e.color + (flash ? '|f' : ''), r * 1.1 + 4, this._bake.gunship, e, r, flash);
            // Main rotor: faint disc and two crossed blades
            const cy = -r * 0.1, rl = r * 0.95;
            ctx.fillStyle = e.accent;
            ctx.globalAlpha = 0.06;
            ctx.beginPath(); ctx.arc(0, cy, rl, 0, Math.PI * 2); ctx.fill();
            const a = t * 18 + e.y * 0.05;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.2;
            ctx.globalAlpha = 0.55;
            for (let k = 0; k < 2; k++) {
                const bx = Math.cos(a + k * Math.PI / 2) * rl, by = Math.sin(a + k * Math.PI / 2) * rl;
                ctx.beginPath(); ctx.moveTo(-bx, cy - by); ctx.lineTo(bx, cy + by); ctx.stroke();
            }
            ctx.globalAlpha = 1;
            Neon.light(ctx, 0, cy, 1.5, e.accent, 1);
            const charge = Math.max(0, Math.min(1, 1 - e.fireTimer / 0.5));
            Neon.light(ctx, 0, r * 0.98, 1.6, e.bulletColor || e.color, 0.3 + charge * 0.7);
        },

        missile_turret(ctx, e, r, flash) {
            const t = Neon.time();
            this._neonGlow(e, r * 2.2, flash);
            Neon.squash(ctx, flash, 0.08);
            Neon.sprite(ctx, 'turret|' + e.color + (flash ? '|f' : ''), r * 0.95 + 4, this._bake.missile_turret, e, r, flash);
            // Missile rack lights chase left to right
            const lit = Math.floor(t * 6 + e.x * 0.01) % 3;
            for (let j = 0; j < 3; j++) {
                Neon.light(ctx, (j - 1) * r * 0.4, -r * 0.28, 1.5, e.accent, j === lit ? 1 : 0.3);
            }
            const charge = Math.max(0, Math.min(1, 1 - e.fireTimer / 0.6));
            Neon.light(ctx, 0, r * 0.88, 2, e.bulletColor || e.color, 0.25 + charge * 0.75);
        },

        phase_shifter(ctx, e, r, flash) {
            this._neonGlow(e, r * 3, flash, 0.3);
            ctx.save();   // keep the spin off the HP bar drawn afterwards
            ctx.rotate(e.moveTimer * 2);
            Neon.squash(ctx, flash, 0.15);
            Neon.sprite(ctx, 'shifter|' + e.color + (flash ? '|f' : ''), r * 1.1 + 4, this._bake.phase_shifter, e, r, flash);
            // Counter-rotating outer arcs and a pulsing core
            ctx.rotate(-e.moveTimer * 5);
            ctx.strokeStyle = e.accent;
            ctx.lineWidth = 1;
            ctx.globalAlpha = 0.5;
            for (let k = 0; k < 3; k++) {
                const a = (Math.PI * 2 / 3) * k;
                ctx.beginPath(); ctx.arc(0, 0, r * 1.25, a, a + 1.2); ctx.stroke();
            }
            ctx.globalAlpha = 1;
            Neon.light(ctx, 0, 0, r * 0.18, e.accent, 0.6 + Math.sin(e.moveTimer * 5) * 0.4);
            ctx.restore();
        },

        shielded_cruiser(ctx, e, r, flash) {
            this._neonGlow(e, r * 2.2, flash);
            Neon.squash(ctx, flash, 0.06);
            Neon.sprite(ctx, 'cruiser|' + e.color + (flash ? '|f' : ''), r * 0.85 + 5, this._bake.shielded_cruiser, e, r, flash);
            Neon.light(ctx, 0, -r * 0.31, 2, e.accent, 0.6 + Math.sin(e.moveTimer * 3) * 0.3);
            // Rotating half-shield
            if (e.shieldHp > 0) {
                const a = 0.55 + Math.sin(e.moveTimer * 5) * 0.3;
                ctx.globalAlpha = a;
                ctx.beginPath(); ctx.arc(0, 0, r + 6, e.shieldAngle, e.shieldAngle + Math.PI);
                Neon.stroke(ctx, '#4488ff', 1.4, false);
                ctx.globalAlpha = a * 0.5;
                ctx.beginPath(); ctx.arc(0, 0, r + 10, e.shieldAngle + 0.3, e.shieldAngle + Math.PI - 0.3);
                ctx.strokeStyle = '#88bbff'; ctx.lineWidth = 1; ctx.stroke();
                ctx.globalAlpha = 1;
            }
        },

        bomber(ctx, e, r, flash) {
            this._neonGlow(e, r * 2.2, flash);
            Neon.squash(ctx, flash, 0.08);
            // Engine plumes behind the hull
            const f = Math.sin(e.moveTimer * 30) * 1.5;
            Neon.flame(ctx, -r * 0.22, r * 0.58, 3, 6 + f, e.color, 0.8);
            Neon.flame(ctx, r * 0.22, r * 0.58, 3, 6 - f, e.color, 0.8);
            Neon.sprite(ctx, 'bomber|' + e.color + (flash ? '|f' : ''), r * 0.95 + 5, this._bake.bomber, e, r, flash);
            // Bay doors slide open; bombs glow inside while open
            const open = Math.max(0, Math.sin(e.moveTimer * 2));
            Neon.light(ctx, 0, r * 0.37, 2.2, e.bulletColor || e.color, open);
            const w = r * 0.25 * (1 - open * 0.7);
            ctx.strokeStyle = flash ? '#ffffff' : e.accent;
            ctx.lineWidth = 1;
            ctx.globalAlpha = 0.8;
            ctx.strokeRect(-r * 0.25, r * 0.18, w, r * 0.37);
            ctx.strokeRect(r * 0.25 - w, r * 0.18, w, r * 0.37);
            ctx.globalAlpha = 1;
        },

        sniper(ctx, e, r, flash) {
            this._neonGlow(e, r * 2.2, flash);
            // Targeting laser: faint wide beam with a bright core, thickening before the shot
            if (e.fireTimer < 0.8) {
                const k = 0.1 + (0.8 - e.fireTimer) * 0.5;
                const ex = Math.cos(e.aimAngle) * 300, ey = Math.sin(e.aimAngle) * 300;
                ctx.strokeStyle = e.color;
                ctx.globalAlpha = k * 0.35;
                ctx.lineWidth = e.fireTimer < 0.3 ? 5 : 3;
                ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(ex, ey); ctx.stroke();
                ctx.strokeStyle = '#ffffff';
                ctx.globalAlpha = Math.min(1, k);
                ctx.lineWidth = e.fireTimer < 0.3 ? 1.5 : 0.8;
                ctx.stroke();
                ctx.globalAlpha = 1;
            }
            Neon.squash(ctx, flash, 0.12);
            Neon.sprite(ctx, 'sniper|' + e.color + (flash ? '|f' : ''), r * 1.1 + 4, this._bake.sniper, e, r, flash);
            const charge = Math.max(0, Math.min(1, 1 - e.fireTimer / 0.8));
            Neon.light(ctx, 0, 0, 2.2, e.color, 0.4 + charge * 0.6);
        },

        carrier(ctx, e, r, flash) {
            const t = Neon.time();
            this._neonGlow(e, r * 2, flash);
            Neon.squash(ctx, flash, 0.05);
            Neon.sprite(ctx, 'carrier|' + e.color + (flash ? '|f' : ''), r * 0.95 + 5, this._bake.carrier, e, r, flash);
            // Landing lights run down the hangar bay
            const step = Math.floor(t * 5) % 4;
            for (let j = 0; j < 3; j++) {
                Neon.light(ctx, -r * 0.16, r * (0.38 + j * 0.1), 1.2, e.accent, j === step ? 1 : 0.25);
                Neon.light(ctx, r * 0.16, r * (0.38 + j * 0.1), 1.2, e.accent, j === step ? 1 : 0.25);
            }
            // Wing-tip running lights
            const blink = Math.sin(t * 4 + e.x * 0.02) > 0;
            Neon.light(ctx, -r * 0.9, 0, 1.6, e.color, blink ? 1 : 0.25);
            Neon.light(ctx, r * 0.9, 0, 1.6, e.color, blink ? 0.25 : 1);
        },

        shield_wall(ctx, e, r, flash) {
            this._neonGlow(e, r * 2.2, flash, 0.3);
            Neon.squash(ctx, flash, 0.1);
            // Energy field: pulsing fill, a sweeping scan line and drifting bands
            ctx.fillStyle = e.color;
            ctx.globalAlpha = 0.14 + Math.sin(e.moveTimer * 6) * 0.07;
            ctx.fillRect(-r * 0.96, -r * 0.27, r * 1.92, r * 0.54);
            const sx = Math.sin(e.moveTimer * 2.2) * r * 0.9;
            ctx.strokeStyle = '#ffffff';
            ctx.globalAlpha = 0.6;
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(sx, -r * 0.27); ctx.lineTo(sx, r * 0.27); ctx.stroke();
            ctx.strokeStyle = e.accent;
            ctx.globalAlpha = 0.25;
            for (let j = 0; j < 2; j++) {
                const y = ((e.moveTimer * 0.6 + j * 0.5) % 1 - 0.5) * r * 0.5;
                ctx.beginPath(); ctx.moveTo(-r * 0.95, y); ctx.lineTo(r * 0.95, y); ctx.stroke();
            }
            ctx.globalAlpha = 1;
            Neon.sprite(ctx, 'wall|' + e.color + (flash ? '|f' : ''), r * 1.1 + 4, this._bake.shield_wall, e, r, flash);
        },
    },

    draw(ctx) {
        const isGlitchLevel = Background.bgType === 'void';
        // Warp-in markers (phase shifter and teleporting mid-boss telegraph)
        for (const e of this.list) {
            if (!(e.warpTimer > 0) || !e.warpTo) continue;
            const t = Math.max(0, 1 - e.warpTimer / 0.5);
            ctx.strokeStyle = e.color;
            ctx.globalAlpha = 0.3 + 0.5 * t;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(e.warpTo.x, e.warpTo.y, e.radius * (2 - t), 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
        for (const e of this.list) {
            ctx.save();
            // Glitch jitter for Level 6
            const glitchX = isGlitchLevel ? (Math.random() - 0.5) * 4 : 0;
            const glitchY = isGlitchLevel ? (Math.random() - 0.5) * 4 : 0;
            ctx.translate(e.x + glitchX, e.y + glitchY);

            // Apply movement rotation for ship-like enemies
            if (Math.abs(e.rotation) > 0.01) {
                ctx.rotate(e.rotation);
            }

            // Flash on hit, or random glitch flash in Level 6
            const glitchFlash = isGlitchLevel && Math.random() < 0.02;
            const flash = e.flashTimer > 0 || glitchFlash;
            if (MidBoss.isType(e.type)) MidBoss.draw(ctx, e, flash);
            else this._neon[e.type].call(this, ctx, e, e.radius, flash);

            // HP bar for tough enemies (mid-bosses use the top-of-screen bar)
            if (e.maxHp > 2 && !e.midboss) {
                const barW = e.radius * 2;
                const barH = 3;
                const barY = -e.radius - 8;
                ctx.fillStyle = '#330000';
                ctx.fillRect(-barW / 2, barY, barW, barH);
                const hpPct = (e.hp + Math.max(0, e.shieldHp)) / (e.maxHp + e.maxShieldHp);
                ctx.fillStyle = e.shieldHp > 0 ? '#4488ff' : '#ff4444';
                ctx.fillRect(-barW / 2, barY, barW * hpPct, barH);
            }

            ctx.restore();
        }

        MidBoss.drawBar(ctx);

        // Apply colorblind override to enemy bullets before drawing
        // (colour change also re-tints the GPU bullet)
        if (Settings.values.colorblind) {
            for (const b of this.enemyBullets.pool) {
                if (b._origColor) continue;
                b._origColor = b.color;
                b.color = '#ffcc00';
                b._hex = 0xffcc00;
                if (b._p) b._p.tint = b._hex;
            }
        } else {
            for (const b of this.enemyBullets.pool) {
                if (!b._origColor) continue;
                b.color = b._origColor; b._origColor = null;
                b._hex = Renderer.colorToHex(b.color);
                if (b._p) b._p.tint = b._hex;
            }
        }
        this.enemyBullets.draw(ctx);
    },

    clear() {
        this.list.length = 0;
        this.enemyBullets.clear();
    }
};


// ============================================================
//  POWER-UP SYSTEM
// ============================================================
const PowerUps = {
    list: [],
    types: ['spread', 'homing', 'laser', 'drone'],

    colors: { spread: '#ff8c00', homing: '#00ff88', laser: '#4488ff', drone: '#cc44ff' },

    spawn(x, y, forceType) {
        const type = forceType || this.types[Math.floor(Math.random() * this.types.length)];
        this.list.push({
            x, y,
            type,
            color: this.colors[type],
            vy: 50,
            life: 999,
            radius: 10,
            bobTimer: Math.random() * Math.PI * 2
        });
    },

    update(dt) {
        for (let i = this.list.length - 1; i >= 0; i--) {
            const p = this.list[i];
            p.y += p.vy * dt;
            p.life -= dt;
            p.bobTimer += dt * 4;
            if (p.life <= 0 || p.y > PLAY_H + 20) {
                this.list.splice(i, 1);
            }
        }
    },

    // Neon style: a rotating hex badge with the weapon icon in glowing
    // line art. Badge and icon are baked; spin, pulse and sparkles are live.
    _HEX: Neon.polygon(6, 0),
    _bakeBadge(c, color, r) {
        Neon.shape(c, PowerUps._HEX, r, color, 1.3, false, 0.3);
        Neon.path(c, PowerUps._HEX, r * 0.72, true);
        c.strokeStyle = color; c.globalAlpha = 0.4; c.lineWidth = 1; c.stroke();
        c.globalAlpha = 1;
    },
    _bakeIcon(c, type, color) {
        c.beginPath();
        switch (type) {
            case 'spread':
                for (let j = -2; j <= 2; j++) {
                    const a = -Math.PI / 2 + j * 0.3;
                    c.moveTo(0, 3); c.lineTo(Math.cos(a) * 8, 3 + Math.sin(a) * 8);
                }
                break;
            case 'homing':
                Neon.path(c, [0, -7, 2.5, -2, 2.5, 4, 5, 7, -5, 7, -2.5, 4, -2.5, -2], 1, true);
                break;
            case 'laser':
                c.moveTo(0, -8); c.lineTo(0, 8);
                c.moveTo(-3.5, -5); c.lineTo(-3.5, 5);
                c.moveTo(3.5, -5); c.lineTo(3.5, 5);
                break;
            case 'drone':
                c.arc(0, 0, 6, 0, Math.PI * 2);
                break;
        }
        Neon.stroke(c, color, 0.9, false);
    },
    _drawNeon(ctx, p, pulse, rot) {
        const t = p.bobTimer;
        // Outer pulsing ring
        ctx.globalAlpha = 0.35 + Math.sin(t * 2) * 0.15;
        Neon.ring(ctx, 0, 0, p.radius + 5 + Math.sin(t * 1.5) * 2, p.color, 0.6, false);
        ctx.globalAlpha = 0.75 + pulse * 0.25;
        ctx.save();
        ctx.rotate(rot * 0.3);
        Neon.sprite(ctx, 'pu_badge|' + p.color, p.radius + 5, this._bakeBadge, p.color, p.radius);
        ctx.restore();
        ctx.globalAlpha = 1;
        Neon.sprite(ctx, 'pu_icon|' + p.type, 14, this._bakeIcon, p.type, p.color);
        // Live icon details
        if (p.type === 'drone') {
            Neon.light(ctx, 0, 0, 1.6, p.color, 1);
            for (let j = 0; j < 3; j++) {
                const a = (Math.PI * 2 / 3) * j + rot * 2;
                Neon.light(ctx, Math.cos(a) * 6, Math.sin(a) * 6, 1.4, p.color, 1);
            }
        } else if (p.type === 'homing') {
            Neon.flame(ctx, 0, 7, 2, 3 + Math.sin(t * 8) * 1.5, p.color, 0.9);
        } else if (p.type === 'spread') {
            for (let j = -2; j <= 2; j++) {
                const a = -Math.PI / 2 + j * 0.3;
                Neon.light(ctx, Math.cos(a) * 8, 3 + Math.sin(a) * 8, 1, p.color, 0.6 + pulse * 0.4);
            }
        }
        // Rotating sparkles
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.7;
        for (let j = 0; j < 4; j++) {
            const a = rot + (Math.PI / 2) * j;
            ctx.beginPath();
            ctx.arc(Math.cos(a) * (p.radius + 5), Math.sin(a) * (p.radius + 5), 1, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    },

    draw(ctx) {
        for (const p of this.list) {
            const bob = Math.sin(p.bobTimer) * 3;
            const pulse = 0.7 + Math.sin(p.bobTimer * 1.5) * 0.3;
            const rot = p.bobTimer * 0.8;

            // Dynamic light — pulsing glow around power-ups
            Renderer.addGlow(p.x, p.y + bob, Renderer.colorToHex(p.color), p.radius * 6, 0.3 + pulse * 0.4);

            ctx.save();
            ctx.translate(p.x, p.y + bob);
            this._drawNeon(ctx, p, pulse, rot);
            ctx.restore();
        }
    },

    clear() { this.list.length = 0; }
};
