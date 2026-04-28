// ============================================================
//  ENEMY SYSTEM
// ============================================================
const Enemies = {
    list: [],
    enemyBullets: new BulletPool(800),

    // Enemy type definitions (data-driven)
    types: {
        scout_drone: {
            hp: 1, speed: 150, radius: 12, score: 100, color: '#ff8c00', accent: '#ffcc44', bulletColor: '#ff6600',
            fireRate: 2.0, bulletSpeed: 180, dropChance: 0.04
        },
        gunship: {
            hp: 3, speed: 80, radius: 18, score: 300, color: '#ff6600', accent: '#ffaa00', bulletColor: '#ff3300',
            fireRate: 1.5, bulletSpeed: 170, dropChance: 0.12
        },
        missile_turret: {
            hp: 5, speed: 30, radius: 22, score: 500, color: '#ff4400', accent: '#ff8844', bulletColor: '#ff2200',
            fireRate: 2.8, bulletSpeed: 130, dropChance: 0.2, cancelBullets: true
        },
        phase_shifter: {
            hp: 4, speed: 100, radius: 15, score: 600, color: '#ff00ff', accent: '#ff88ff', bulletColor: '#cc00ff',
            fireRate: 3.0, bulletSpeed: 160, dropChance: 0.15, cancelBullets: true
        },
        shielded_cruiser: {
            hp: 8, shieldHp: 3, speed: 40, radius: 28, score: 1000, color: '#8b00ff', accent: '#aa44ff', bulletColor: '#6600cc',
            fireRate: 2.5, bulletSpeed: 140, dropChance: 0.5, cancelBullets: true
        },
        bomber: {
            hp: 6, speed: 50, radius: 24, score: 700, color: '#ff4400', accent: '#ff6622', bulletColor: '#ff2200',
            fireRate: 2.5, bulletSpeed: 110, dropChance: 0.25, cancelBullets: true
        },
        sniper: {
            hp: 2, speed: 20, radius: 14, score: 400, color: '#ffff00', accent: '#ffffaa', bulletColor: '#ffcc00',
            fireRate: 3.5, bulletSpeed: 500, dropChance: 0.1
        },
        carrier: {
            hp: 10, speed: 25, radius: 30, score: 1200, color: '#cc6600', accent: '#ff8800', bulletColor: '#ff6600',
            fireRate: 2.0, bulletSpeed: 140, dropChance: 0.6, cancelBullets: true
        },
        shield_wall: {
            hp: 3, speed: 60, radius: 16, score: 250, color: '#4488ff', accent: '#66aaff', bulletColor: '#2266dd',
            fireRate: 2.0, bulletSpeed: 160, dropChance: 0.06
        }
    },

    spawn(type, x, y, movePath) {
        const def = this.types[type];
        if (!def) return;
        const hpScale = GameConfig._levelHpScale || 1;
        const spdScale = GameConfig._levelSpeedScale || 1;
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
            fireRate: def.fireRate / spdScale,
            fireTimer: def.fireRate * Math.random(),
            bulletSpeed: def.bulletSpeed * spdScale,
            dropChance: def.dropChance,
            cancelBullets: def.cancelBullets || false,
            movePath: movePath || 'straight_down',
            moveTimer: 0,
            active: true,
            flashTimer: 0,
            // Phase shifter specific
            teleportTimer: type === 'phase_shifter' ? 3.0 : 0,
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

            // Firing
            e.fireTimer -= dt;
            if (e.fireTimer <= 0 && e.y > 0 && e.y < PLAY_H - 50) {
                this._firePattern(e, playerX, playerY);
                e.fireTimer = e.fireRate;
            }

            // Phase shifter teleport
            if (e.type === 'phase_shifter') {
                e.teleportTimer -= dt;
                if (e.teleportTimer <= 0) {
                    e.x = 40 + Math.random() * (PLAY_W - 80);
                    e.y = 40 + Math.random() * (PLAY_H * 0.4);
                    e.teleportTimer = 2.5 + Math.random();
                    Particles.spawn(e.x, e.y, 8, { color: e.bulletColor, speed: 80, life: 0.3 });
                }
            }

            // Sniper aim tracking
            if (e.type === 'sniper') {
                e.aimAngle = Math.atan2(playerY - e.y, playerX - e.x);
            }

            // Shielded cruiser shield rotation
            if (e.type === 'shielded_cruiser') {
                e.shieldAngle += dt * 1.5;
            }

            // Remove if off screen
            if (e.y > PLAY_H + 60 || e.x < -60 || e.x > PLAY_W + 60) {
                this.list.splice(i, 1);
            }
        }

        this.enemyBullets.update(dt);
    },

    _updateMovement(e, dt) {
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
                // Fires from barrel tip
                this.enemyBullets.spawn(e.x, e.y + e.radius * 0.85,
                    Math.cos(angle) * bs * 0.8, Math.sin(angle) * bs * 0.8,
                    { color: e.bulletColor, radius: 4, life: 4 });
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
                // Fires from barrel end
                this.enemyBullets.spawn(e.x, e.y + e.radius * 0.9,
                    Math.cos(angle) * bs, Math.sin(angle) * bs,
                    { color: e.bulletColor, radius: 4, life: 3 });
                break;
            }
            case 'carrier':
                // Drones launch from hangar bay
                if (Enemies.list.length < 30) {
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
        // Impact spark burst at hit point
        Particles.spawn(enemy.x, enemy.y, 3, { color: '#ffffff', speed: 80, life: 0.12, size: 1.5 });
        // GPU glow flash
        Renderer.addGlow(enemy.x, enemy.y, 0xffffff, enemy.radius * 2, 0.5);
        if (enemy.hp <= 0) {
            this._onDeath(enemy, playerDist);
            return true;
        }
        return false;
    },

    _onDeath(enemy, playerDist) {
        enemy.active = false;
        const particleCount = enemy.radius > 20 ? 30 : 15;
        const explColor = Hangar.explosionColor;
        // Bright white-hot flash particles (brief, large)
        Particles.spawn(enemy.x, enemy.y, 4, { color: '#ffffff', speed: 60, life: 0.15, size: 4 });
        // Main explosion burst
        Particles.spawn(enemy.x, enemy.y, particleCount, { color: explColor, speed: 150, life: 0.5, size: 2 });
        Particles.spawn(enemy.x, enemy.y, Math.floor(particleCount * 0.4), { color: enemy.accent || explColor, speed: 120, life: 0.4, size: 2.5 });
        Particles.spawn(enemy.x, enemy.y, 6, { color: '#ffffff', speed: 80, life: 0.3, size: 3 });
        // GPU glow burst at death position
        Renderer.addGlow(enemy.x, enemy.y, Renderer.colorToHex(explColor), enemy.radius * 5, 0.7);
        // Shockwave ring for medium+ enemies
        if (enemy.radius > 15) {
            Particles.spawnShockwave(enemy.x, enemy.y, explColor, enemy.radius * 3, 0.35);
        }

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

    draw(ctx) {
        const isGlitchLevel = Background.bgType === 'void';
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
            if (e.flashTimer > 0 || glitchFlash) {
                ctx.fillStyle = glitchFlash ? '#ff00ff' : '#ffffff';
            } else {
                ctx.fillStyle = e.color;
            }

            // Draw based on type
            const r = e.radius;
            const flash = e.flashTimer > 0 || glitchFlash;
            const accent = flash ? '#ffffff' : e.accent;
            switch (e.type) {
                case 'scout_drone':
                    // Small quad-rotor drone with propeller arms
                    ctx.beginPath();
                    ctx.moveTo(0, -r * 0.6);
                    ctx.lineTo(r * 0.3, -r * 0.2);
                    ctx.lineTo(r * 0.3, r * 0.3);
                    ctx.lineTo(0, r * 0.5);
                    ctx.lineTo(-r * 0.3, r * 0.3);
                    ctx.lineTo(-r * 0.3, -r * 0.2);
                    ctx.closePath();
                    ctx.fill();
                    // Rotor arms
                    ctx.strokeStyle = accent;
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.moveTo(-r * 0.7, -r * 0.3); ctx.lineTo(r * 0.7, -r * 0.3);
                    ctx.stroke();
                    // Rotor circles
                    ctx.lineWidth = 1;
                    ctx.globalAlpha = 0.4;
                    ctx.beginPath(); ctx.arc(-r * 0.7, -r * 0.3, r * 0.3, 0, Math.PI * 2); ctx.stroke();
                    ctx.beginPath(); ctx.arc(r * 0.7, -r * 0.3, r * 0.3, 0, Math.PI * 2); ctx.stroke();
                    ctx.globalAlpha = 1;
                    // Eye/sensor
                    ctx.fillStyle = '#ff4444';
                    ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI * 2); ctx.fill();
                    break;

                case 'gunship':
                    // Attack helicopter — wide body, stub wings, cannon
                    ctx.beginPath();
                    ctx.moveTo(0, -r * 0.8);        // Nose
                    ctx.lineTo(r * 0.4, -r * 0.3);
                    ctx.lineTo(r * 0.9, 0);          // Right wing
                    ctx.lineTo(r * 0.85, r * 0.2);
                    ctx.lineTo(r * 0.4, r * 0.1);
                    ctx.lineTo(r * 0.35, r * 0.6);  // Right tail
                    ctx.lineTo(r * 0.6, r * 0.8);   // Right stabiliser
                    ctx.lineTo(r * 0.3, r * 0.7);
                    ctx.lineTo(-r * 0.3, r * 0.7);
                    ctx.lineTo(-r * 0.6, r * 0.8);  // Left stabiliser
                    ctx.lineTo(-r * 0.35, r * 0.6);
                    ctx.lineTo(-r * 0.4, r * 0.1);
                    ctx.lineTo(-r * 0.85, r * 0.2);
                    ctx.lineTo(-r * 0.9, 0);         // Left wing
                    ctx.lineTo(-r * 0.4, -r * 0.3);
                    ctx.closePath();
                    ctx.fill();
                    ctx.strokeStyle = accent; ctx.lineWidth = 1; ctx.stroke();
                    // Under-nose cannon
                    ctx.fillStyle = accent;
                    ctx.fillRect(-2, r * 0.7, 4, r * 0.25);
                    // Cockpit
                    ctx.fillStyle = flash ? '#ffffff' : '#442200';
                    ctx.beginPath(); ctx.ellipse(0, -r * 0.4, r * 0.15, r * 0.2, 0, 0, Math.PI * 2); ctx.fill();
                    break;

                case 'missile_turret':
                    // Rotating turret platform — base + barrel
                    // Base platform
                    ctx.beginPath();
                    ctx.moveTo(-r * 0.8, -r * 0.4);
                    ctx.lineTo(r * 0.8, -r * 0.4);
                    ctx.lineTo(r * 0.6, r * 0.4);
                    ctx.lineTo(-r * 0.6, r * 0.4);
                    ctx.closePath();
                    ctx.fill();
                    ctx.strokeStyle = accent; ctx.lineWidth = 1.5; ctx.stroke();
                    // Turret dome
                    ctx.beginPath(); ctx.arc(0, -r * 0.1, r * 0.35, Math.PI, 0); ctx.fill();
                    // Barrel
                    ctx.fillStyle = accent;
                    ctx.fillRect(-2.5, r * 0.2, 5, r * 0.6);
                    // Barrel tip
                    ctx.fillRect(-4, r * 0.75, 8, 3);
                    // Side mounting brackets
                    ctx.fillRect(-r * 0.7, -r * 0.15, r * 0.2, r * 0.3);
                    ctx.fillRect(r * 0.5, -r * 0.15, r * 0.2, r * 0.3);
                    break;

                case 'phase_shifter':
                    // Alien crystal / energy form — rotating prism
                    ctx.rotate(e.moveTimer * 2);
                    // Outer prism
                    ctx.beginPath();
                    for (let j = 0; j < 5; j++) {
                        const a = (Math.PI * 2 / 5) * j - Math.PI / 2;
                        const pr = j % 2 === 0 ? r : r * 0.5;
                        ctx.lineTo(Math.cos(a) * pr, Math.sin(a) * pr);
                    }
                    ctx.closePath();
                    ctx.fill();
                    ctx.strokeStyle = '#ff88ff'; ctx.lineWidth = 1.5; ctx.stroke();
                    // Inner energy core
                    ctx.fillStyle = flash ? '#ffffff' : '#ffffff';
                    ctx.globalAlpha = 0.5 + Math.sin(e.moveTimer * 5) * 0.3;
                    ctx.beginPath(); ctx.arc(0, 0, r * 0.25, 0, Math.PI * 2); ctx.fill();
                    ctx.globalAlpha = 1;
                    break;

                case 'shielded_cruiser':
                    // Heavy cruiser — wide wedge with armoured plates
                    ctx.beginPath();
                    ctx.moveTo(0, -r * 0.7);
                    ctx.lineTo(r * 0.5, -r * 0.5);
                    ctx.lineTo(r * 0.8, -r * 0.1);
                    ctx.lineTo(r * 0.7, r * 0.5);
                    ctx.lineTo(r * 0.3, r * 0.7);
                    ctx.lineTo(-r * 0.3, r * 0.7);
                    ctx.lineTo(-r * 0.7, r * 0.5);
                    ctx.lineTo(-r * 0.8, -r * 0.1);
                    ctx.lineTo(-r * 0.5, -r * 0.5);
                    ctx.closePath();
                    ctx.fill();
                    ctx.strokeStyle = accent; ctx.lineWidth = 1.5; ctx.stroke();
                    // Armour plate lines
                    ctx.strokeStyle = flash ? '#fff' : '#663399';
                    ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.moveTo(-r * 0.6, 0); ctx.lineTo(r * 0.6, 0); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(-r * 0.4, r * 0.35); ctx.lineTo(r * 0.4, r * 0.35); ctx.stroke();
                    // Bridge
                    ctx.fillStyle = flash ? '#ffffff' : '#220044';
                    ctx.beginPath(); ctx.ellipse(0, -r * 0.3, r * 0.2, r * 0.12, 0, 0, Math.PI * 2); ctx.fill();
                    // Shield arc
                    if (e.shieldHp > 0) {
                        ctx.strokeStyle = `rgba(68, 136, 255, ${0.5 + Math.sin(e.moveTimer * 5) * 0.3})`;
                        ctx.lineWidth = 3; 
                        ctx.beginPath(); ctx.arc(0, 0, r + 6, e.shieldAngle, e.shieldAngle + Math.PI); ctx.stroke();
                        
                    }
                    break;

                case 'bomber':
                    // Heavy bomber — wide fuselage, bomb bay doors
                    ctx.beginPath();
                    ctx.moveTo(0, -r * 0.5);
                    ctx.lineTo(r * 0.4, -r * 0.4);
                    ctx.lineTo(r * 0.9, -r * 0.1);   // Right wing
                    ctx.lineTo(r * 0.8, r * 0.2);
                    ctx.lineTo(r * 0.4, r * 0.3);
                    ctx.lineTo(r * 0.35, r * 0.6);
                    ctx.lineTo(-r * 0.35, r * 0.6);
                    ctx.lineTo(-r * 0.4, r * 0.3);
                    ctx.lineTo(-r * 0.8, r * 0.2);
                    ctx.lineTo(-r * 0.9, -r * 0.1);  // Left wing
                    ctx.lineTo(-r * 0.4, -r * 0.4);
                    ctx.closePath();
                    ctx.fill();
                    ctx.strokeStyle = accent; ctx.lineWidth = 1; ctx.stroke();
                    // Bomb bay doors (open/close animation)
                    ctx.fillStyle = flash ? '#ffffff' : '#661100';
                    const bayOpen = Math.sin(e.moveTimer * 2) * 0.3;
                    ctx.fillRect(-r * 0.25, r * 0.2, r * 0.2 - bayOpen * 5, r * 0.35);
                    ctx.fillRect(bayOpen * 5 + r * 0.05, r * 0.2, r * 0.2 - bayOpen * 5, r * 0.35);
                    // Engines
                    ctx.fillStyle = '#ff4400';
                    ctx.globalAlpha = 0.6;
                    ctx.fillRect(-r * 0.3, r * 0.55, 5, 4 + Math.random() * 3);
                    ctx.fillRect(r * 0.15, r * 0.55, 5, 4 + Math.random() * 3);
                    ctx.globalAlpha = 1;
                    break;

                case 'sniper':
                    // Long-barrelled sniper platform
                    // Body
                    ctx.beginPath();
                    ctx.moveTo(-r * 0.5, -r * 0.3);
                    ctx.lineTo(r * 0.5, -r * 0.3);
                    ctx.lineTo(r * 0.4, r * 0.3);
                    ctx.lineTo(-r * 0.4, r * 0.3);
                    ctx.closePath();
                    ctx.fill();
                    ctx.strokeStyle = accent; ctx.lineWidth = 1; ctx.stroke();
                    // Long barrel
                    ctx.fillStyle = accent;
                    ctx.fillRect(-1.5, r * 0.2, 3, r * 0.8);
                    // Scope lens
                    ctx.fillStyle = flash ? '#ffffff' : '#ffff00';
                    
                    ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
                    
                    // Targeting laser preview
                    if (e.fireTimer < 0.8) {
                        const laserAlpha = 0.1 + (0.8 - e.fireTimer) * 0.4;
                        ctx.strokeStyle = `rgba(255, 255, 0, ${laserAlpha})`;
                        ctx.lineWidth = e.fireTimer < 0.3 ? 2 : 1;
                        ctx.beginPath(); ctx.moveTo(0, 0);
                        ctx.lineTo(Math.cos(e.aimAngle) * 300, Math.sin(e.aimAngle) * 300);
                        ctx.stroke();
                    }
                    break;

                case 'carrier':
                    // Large mothership with hangar bay
                    ctx.beginPath();
                    ctx.moveTo(0, -r * 0.6);
                    ctx.lineTo(r * 0.6, -r * 0.4);
                    ctx.lineTo(r * 0.9, 0);
                    ctx.lineTo(r * 0.8, r * 0.5);
                    ctx.lineTo(r * 0.4, r * 0.7);
                    ctx.lineTo(-r * 0.4, r * 0.7);
                    ctx.lineTo(-r * 0.8, r * 0.5);
                    ctx.lineTo(-r * 0.9, 0);
                    ctx.lineTo(-r * 0.6, -r * 0.4);
                    ctx.closePath();
                    ctx.fill();
                    ctx.strokeStyle = accent; ctx.lineWidth = 1.5; ctx.stroke();
                    // Hangar bay opening
                    ctx.fillStyle = flash ? '#ffffff' : '#220800';
                    ctx.beginPath();
                    ctx.moveTo(-r * 0.25, r * 0.3);
                    ctx.lineTo(r * 0.25, r * 0.3);
                    ctx.lineTo(r * 0.2, r * 0.65);
                    ctx.lineTo(-r * 0.2, r * 0.65);
                    ctx.closePath();
                    ctx.fill();
                    // Hangar bay lights
                    ctx.fillStyle = '#ff8800';
                    ctx.globalAlpha = 0.4 + Math.sin(e.moveTimer * 3) * 0.3;
                    ctx.fillRect(-r * 0.15, r * 0.55, r * 0.3, 2);
                    ctx.globalAlpha = 1;
                    // Bridge windows
                    ctx.fillStyle = flash ? '#ffffff' : '#884400';
                    ctx.fillRect(-r * 0.15, -r * 0.45, r * 0.3, r * 0.1);
                    break;

                case 'shield_wall':
                    // Energy shield panel — thin, wide, with energy field
                    ctx.fillRect(-r, -r * 0.3, r * 2, r * 0.6);
                    // Energy field effect
                    ctx.fillStyle = `rgba(68, 136, 255, ${0.3 + Math.sin(e.moveTimer * 6) * 0.15})`;
                    ctx.fillRect(-r * 0.9, -r * 0.25, r * 1.8, r * 0.5);
                    // Border frame
                    ctx.strokeStyle = accent;
                    ctx.lineWidth = 2;
                    ctx.strokeRect(-r, -r * 0.3, r * 2, r * 0.6);
                    // Corner nodes
                    ctx.fillStyle = '#ffffff';
                    ctx.globalAlpha = 0.7;
                    ctx.beginPath(); ctx.arc(-r, -r * 0.3, 2.5, 0, Math.PI * 2); ctx.fill();
                    ctx.beginPath(); ctx.arc(r, -r * 0.3, 2.5, 0, Math.PI * 2); ctx.fill();
                    ctx.beginPath(); ctx.arc(-r, r * 0.3, 2.5, 0, Math.PI * 2); ctx.fill();
                    ctx.beginPath(); ctx.arc(r, r * 0.3, 2.5, 0, Math.PI * 2); ctx.fill();
                    ctx.globalAlpha = 1;
                    break;

                default:
                    // Fallback circle
                    ctx.beginPath();
                    ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
                    ctx.fill();
                    break;
            }

            // HP bar for tough enemies
            if (e.maxHp > 2) {
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

        // Apply colorblind override to enemy bullets before drawing
        if (Settings.values.colorblind) {
            for (const b of this.enemyBullets.pool) {
                b._origColor = b._origColor || b.color;
                b.color = '#ffcc00';
            }
        } else {
            for (const b of this.enemyBullets.pool) {
                if (b._origColor) { b.color = b._origColor; b._origColor = null; }
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

    spawn(x, y, forceType) {
        const type = forceType || this.types[Math.floor(Math.random() * this.types.length)];
        const colors = { spread: '#ff8c00', homing: '#00ff88', laser: '#4488ff', drone: '#cc44ff' };
        this.list.push({
            x, y,
            type,
            color: colors[type],
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

    draw(ctx) {
        for (const p of this.list) {
            const bob = Math.sin(p.bobTimer) * 3;
            const pulse = 0.7 + Math.sin(p.bobTimer * 1.5) * 0.3;
            const rot = p.bobTimer * 0.8;

            // Dynamic light — pulsing glow around power-ups
            Renderer.addGlow(p.x, p.y + bob, Renderer.colorToHex(p.color), p.radius * 4, 0.15 + pulse * 0.2);

            ctx.save();
            ctx.translate(p.x, p.y + bob);

            // Outer pulsing ring
            ctx.strokeStyle = p.color;
            
            ctx.lineWidth = 1.5;
            ctx.globalAlpha = 0.3 + Math.sin(p.bobTimer * 2) * 0.15;
            ctx.beginPath();
            ctx.arc(0, 0, p.radius + 5 + Math.sin(p.bobTimer * 1.5) * 2, 0, Math.PI * 2);
            ctx.stroke();

            // Inner filled hexagon background
            ctx.globalAlpha = 0.5 * pulse;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            for (let j = 0; j < 6; j++) {
                const a = (Math.PI * 2 / 6) * j + rot * 0.3;
                const r = p.radius;
                ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
            }
            ctx.closePath();
            ctx.fill();

            // Weapon icon — drawn in white over the colored background
            ctx.globalAlpha = 1;
            

            switch (p.type) {
                case 'spread':
                    // Fan of lines spreading outward
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 2;
                    for (let j = -2; j <= 2; j++) {
                        const a = -Math.PI / 2 + j * 0.3;
                        ctx.beginPath();
                        ctx.moveTo(0, 2);
                        ctx.lineTo(Math.cos(a) * 9, Math.sin(a) * 9);
                        ctx.stroke();
                    }
                    // Small dots at tips
                    ctx.fillStyle = '#ffffff';
                    for (let j = -2; j <= 2; j++) {
                        const a = -Math.PI / 2 + j * 0.3;
                        ctx.beginPath();
                        ctx.arc(Math.cos(a) * 9, Math.sin(a) * 9, 1.2, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    break;

                case 'homing':
                    // Missile shape — pointed nose, fins
                    ctx.fillStyle = '#ffffff';
                    ctx.beginPath();
                    ctx.moveTo(0, -8);  // Nose
                    ctx.lineTo(3, -2);
                    ctx.lineTo(3, 5);
                    ctx.lineTo(6, 8);   // Right fin
                    ctx.lineTo(3, 6);
                    ctx.lineTo(-3, 6);
                    ctx.lineTo(-6, 8);  // Left fin
                    ctx.lineTo(-3, 5);
                    ctx.lineTo(-3, -2);
                    ctx.closePath();
                    ctx.fill();
                    // Exhaust
                    ctx.fillStyle = p.color;
                    ctx.globalAlpha = 0.6 + Math.sin(p.bobTimer * 8) * 0.3;
                    ctx.beginPath();
                    ctx.moveTo(-2, 6);
                    ctx.lineTo(0, 10 + Math.sin(p.bobTimer * 8) * 2);
                    ctx.lineTo(2, 6);
                    ctx.fill();
                    break;

                case 'laser':
                    // Vertical beam with glow
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(-1.5, -9, 3, 18);
                    // Side glow bars
                    ctx.globalAlpha = 0.5;
                    ctx.fillStyle = p.color;
                    ctx.fillRect(-4, -7, 2, 14);
                    ctx.fillRect(2, -7, 2, 14);
                    // Bright center point
                    ctx.globalAlpha = 1;
                    ctx.fillStyle = '#ffffff';
                    ctx.beginPath();
                    ctx.arc(0, -9, 2, 0, Math.PI * 2);
                    ctx.fill();
                    break;

                case 'drone':
                    // Orbiting dots around center
                    ctx.fillStyle = '#ffffff';
                    ctx.beginPath();
                    ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
                    ctx.fill();
                    // Orbiting satellites
                    for (let j = 0; j < 3; j++) {
                        const a = (Math.PI * 2 / 3) * j + rot * 2;
                        const ox = Math.cos(a) * 6;
                        const oy = Math.sin(a) * 6;
                        ctx.fillStyle = '#ffffff';
                        ctx.beginPath();
                        ctx.arc(ox, oy, 1.8, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    // Orbit ring
                    ctx.strokeStyle = '#ffffff';
                    ctx.globalAlpha = 0.3;
                    ctx.lineWidth = 0.8;
                    ctx.beginPath();
                    ctx.arc(0, 0, 6, 0, Math.PI * 2);
                    ctx.stroke();
                    break;
            }

            // Rotating corner sparkles
            ctx.globalAlpha = 0.6;
            ctx.fillStyle = '#ffffff';
            for (let j = 0; j < 4; j++) {
                const a = rot + (Math.PI / 2) * j;
                const sparkR = p.radius + 3;
                ctx.beginPath();
                ctx.arc(Math.cos(a) * sparkR, Math.sin(a) * sparkR, 1, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.restore();
        }
    },

    clear() { this.list.length = 0; }
};
