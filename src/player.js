// ============================================================
//  PLAYER
// ============================================================
const Player = {
    x: PLAY_W / 2,
    y: PLAY_H - 80,
    speed: 360,
    radius: 14,          // Visual radius
    hitboxRadius: 3,     // Actual collision radius
    grazeRadius: 24,     // Graze detection zone

    // State
    lives: 3,
    alive: true,
    invincible: false,
    invincibleTimer: 0,
    respawnTimer: 0,
    shieldHp: 0,
    maxShieldHp: 0,
    shieldFlashTimer: 0,
    deathAnimTimer: 0,
    deathX: 0,
    deathY: 0,
    deathFragments: [],

    // Weapons
    primaryWeapon: 'none', // 'none', 'spread', 'homing', 'laser'
    primaryLevel: 0,
    droneLevel: 0,
    fireTimer: 0,
    fireRate: 0.1,

    // Abilities
    bombs: 3,
    bombActive: false,
    bombTimer: 0,
    dashCooldown: 0,
    dashing: false,
    dashTimer: 0,
    dashDir: { x: 0, y: 0 },

    // Visual
    engineFlicker: 0,
    trailPositions: [],

    // Bullet pool
    bullets: new BulletPool(200),

    init() {
        this.x = PLAY_W / 2;
        this.y = PLAY_H - 80;
        this.alive = true;
        this.invincible = true;
        this.invincibleTimer = 2.0;
        this.lives = GameConfig.lives;
        this.bombs = GameConfig.bombs.enabled ? GameConfig.bombs.startCount : 0;
        this.maxShieldHp = GameConfig.shieldHp || 0;
        this.shieldHp = this.maxShieldHp;
        this.shieldFlashTimer = 0;
        this.primaryWeapon = 'none';
        this.primaryLevel = 0;
        this.droneLevel = 0;
        this.fireTimer = 0;
        this.dashCooldown = 0;
        this.dashing = false;
        this.bullets.clear();
        this.trailPositions = [];
    },

    update(dt) {
        if (!this.alive) {
            this.respawnTimer -= dt;
            this.deathAnimTimer = Math.max(0, this.deathAnimTimer - dt);
            // Animate death fragments
            for (const f of this.deathFragments) {
                f.x += f.vx * dt;
                f.y += f.vy * dt;
                f.vy += 30 * dt; // slight gravity
                f.rot += f.rotSpeed * dt;
                f.vx *= 0.98;
                f.vy *= 0.98;
            }
            if (this.respawnTimer <= 0 && this.lives > 0) this._respawn();
            // Keep bullets moving even while dead
            this.bullets.update(dt, Enemies.list);
            return;
        }

        this.engineFlicker += dt * 20;
        this.invincibleTimer = Math.max(0, this.invincibleTimer - dt);
        if (this.invincibleTimer <= 0) this.invincible = false;
        this.dashCooldown = Math.max(0, this.dashCooldown - dt);
        this.shieldFlashTimer = Math.max(0, this.shieldFlashTimer - dt);

        // Bomb
        if (this.bombActive) {
            this.bombTimer -= dt;
            if (this.bombTimer <= 0) this.bombActive = false;
        }

        // Dash
        if (this.dashing) {
            this.dashTimer -= dt;
            this.x += this.dashDir.x * this.speed * 3 * dt;
            this.y += this.dashDir.y * this.speed * 3 * dt;
            if (this.dashTimer <= 0) {
                this.dashing = false;
                this.invincible = false;
            }
        } else {
            // Normal movement
            const move = Input.getMovement();
            const focusing = GameConfig.focus.enabled && Input.isHeld('focus');
            const spd = this.speed * (focusing ? GameConfig.focus.speedMultiplier : 1);
            this.x += move.x * spd * dt;
            this.y += move.y * spd * dt;
        }

        // Clamp to play area
        this.x = Math.max(this.radius, Math.min(PLAY_W - this.radius, this.x));
        this.y = Math.max(this.radius, Math.min(PLAY_H - this.radius, this.y));

        // Trail
        this.trailPositions.unshift({ x: this.x, y: this.y });
        if (this.trailPositions.length > 10) this.trailPositions.pop();

        // Firing
        const shouldFire = GameConfig.fireMode === 'auto' ? !Input.isHeld('focus') : Input.isHeld('fire');
        this.fireTimer -= dt;
        if (shouldFire && this.fireTimer <= 0 && !this.dashing) {
            this._fire();
            // Weapon-specific fire rates
            const rates = { none: 0.12, spread: 0.13, homing: 0.2, laser: 0.1 };
            this.fireTimer = rates[this.primaryWeapon] || 0.12;
        }

        // Dash input
        if (Input.isPressed('dash') && GameConfig.dash.enabled && this.dashCooldown <= 0 && !this.dashing) {
            this._startDash();
        }

        // Bomb input
        if (Input.isPressed('bomb') && GameConfig.bombs.enabled && this.bombs > 0 && !this.bombActive) {
            this._useBomb();
        }

        // Graze detection
        if (GameConfig.graze.enabled) {
            const gz = this.grazeRadius * (GameConfig.graze.zoneMultiplier || 1);
            for (const b of Enemies.enemyBullets.pool) {
                if (b.grazed) continue;
                const dx = b.x - this.x;
                const dy = b.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < gz && dist > this.hitboxRadius + b.radius) {
                    b.grazed = true;
                    Scoring.addGraze();
                    Particles.spawn(b.x, b.y, 2, { color: '#ffffff', speed: 60, life: 0.15, size: 1.5 });
                    Audio.playGraze();
                }
            }
        }

        // Surge activation — fire+focus together, or bomb key when surge is ready and bombs empty/disabled
        if (Scoring.surgeCharge >= Scoring.surgeMax && !Scoring.surgeActive) {
            const surgeTriggered = (Input.isHeld('fire') && Input.isHeld('focus')) ||
                                   (Input.isPressed('bomb') && (!GameConfig.bombs.enabled || this.bombs <= 0));
            if (surgeTriggered) {
                Scoring.activateSurge();
                Achievements.onSurge();
                Audio.playSurgeActivate();
                ScreenShake.trigger(6, 0.3);
                Particles.spawn(this.x, this.y, 25, { color: '#ffffff', speed: 150, life: 0.5, size: 3 });
            }
        }

        // Collision with enemy bullets
        if (!this.invincible && !this.dashing) {
            for (const b of Enemies.enemyBullets.pool) {
                const dx = b.x - this.x;
                const dy = b.y - this.y;
                if (dx * dx + dy * dy < (this.hitboxRadius + b.radius) * (this.hitboxRadius + b.radius)) {
                    b.active = false;
                    this._die();
                    break;
                }
            }
        }

        // Collision with enemies (contact damage)
        if (!this.invincible && !this.dashing) {
            for (const e of Enemies.list) {
                const dx = e.x - this.x;
                const dy = e.y - this.y;
                if (dx * dx + dy * dy < (this.hitboxRadius + e.radius) * (this.hitboxRadius + e.radius)) {
                    this._die();
                    break;
                }
            }
        }

        // Collision with boss
        if (!this.invincible && !this.dashing && Boss.active && Boss.entered && !Boss.defeated) {
            const dx = Boss.x - this.x;
            const dy = Boss.y - this.y;
            if (dx * dx + dy * dy < (this.hitboxRadius + Boss.radius) * (this.hitboxRadius + Boss.radius)) {
                this._die();
            }
        }

        // Player bullets collision with enemies
        for (let i = this.bullets.pool.length - 1; i >= 0; i--) {
            const b = this.bullets.pool[i];

            // Check boss
            if (Boss.active && Boss.entered && !Boss.defeated) {
                const dx = b.x - Boss.x;
                const dy = b.y - Boss.y;
                if (dx * dx + dy * dy < (b.radius + Boss.radius) * (b.radius + Boss.radius)) {
                    Boss.hit(b.damage);
                    b.active = false;
                    Particles.spawn(b.x, b.y, 3, { color: '#00ffff', speed: 50, life: 0.1 });
                    continue;
                }
            }

            // Check enemies
            for (const e of Enemies.list) {
                const dx = b.x - e.x;
                const dy = b.y - e.y;
                if (dx * dx + dy * dy < (b.radius + e.radius) * (b.radius + e.radius)) {
                    // Calculate player-to-enemy distance for point-blank bonus
                    const pdx = this.x - e.x, pdy = this.y - e.y;
                    const playerDist = Math.sqrt(pdx * pdx + pdy * pdy);
                    const killed = Enemies.hit(e, b.damage, playerDist);
                    b.active = false;
                    Particles.spawn(b.x, b.y, 3, { color: '#00ffff', speed: 50, life: 0.1 });
                    break;
                }
            }
        }

        // Collect power-ups
        for (let i = PowerUps.list.length - 1; i >= 0; i--) {
            const p = PowerUps.list[i];
            const dx = p.x - this.x;
            const dy = p.y - this.y;
            if (dx * dx + dy * dy < (p.radius + this.radius) * (p.radius + this.radius)) {
                this._collectPowerUp(p);
                PowerUps.list.splice(i, 1);
            }
        }

        // Build homing targets list
        const homingTargets = [...Enemies.list];
        if (Boss.active && Boss.entered && !Boss.defeated) {
            homingTargets.push({ x: Boss.x, y: Boss.y });
        }
        this.bullets.update(dt, homingTargets);
    },

    _fire() {
        const baseSpeed = -700;

        // Base shot (always fires unless laser is active)
        if (this.primaryWeapon !== 'laser') {
            this.bullets.spawn(this.x, this.y - this.radius, 0, baseSpeed, { color: Hangar.bulletColor, radius: 3, damage: 1 });
        }
        Audio.playShot();

        // Weapon projectile color — use equipped bullet style, fall back to weapon-specific color
        const bColor = Hangar.bulletColor;
        const isDefaultBullet = Hangar.equipped.bullet === 'neon';
        const spreadColor = isDefaultBullet ? '#ff8c00' : bColor;
        const homingColor = isDefaultBullet ? '#00ff88' : bColor;
        const laserColor = isDefaultBullet ? '#4488ff' : bColor;
        const droneColor = isDefaultBullet ? '#cc44ff' : bColor;

        // Primary weapon additional shots
        // Spread: Lv1=2-way, Lv2=3-way, Lv3=5-way, Lv4=7-way+bigger, Lv5=9-way+rear shot
        // Homing: Lv1=1 missile, Lv2=2, Lv3=3, Lv4=4 fast, Lv5=5 fast+stronger
        // Laser: Lv1=thin beam, Lv2=wider, Lv3=dual, Lv4=triple, Lv5=wide triple+pierce damage
        switch (this.primaryWeapon) {
            case 'spread': {
                const lvl = this.primaryLevel;
                const angles = lvl >= 5 ? [-0.5, -0.35, -0.2, -0.1, 0.1, 0.2, 0.35, 0.5] :
                               lvl >= 4 ? [-0.45, -0.3, -0.15, 0.15, 0.3, 0.45] :
                               lvl >= 3 ? [-0.35, -0.2, 0, 0.2, 0.35] :
                               lvl >= 2 ? [-0.25, 0, 0.25] :
                               [-0.2, 0.2];
                const dmg = lvl >= 5 ? 0.8 : lvl >= 4 ? 0.9 : 1;
                const rad = lvl >= 4 ? 3 : 2.5;
                for (const a of angles) {
                    this.bullets.spawn(this.x, this.y - this.radius,
                        Math.sin(a) * -baseSpeed, Math.cos(a) * baseSpeed,
                        { color: spreadColor, radius: rad, damage: dmg });
                }
                // Lv5: rear shot for coverage
                if (lvl >= 5) {
                    this.bullets.spawn(this.x, this.y + this.radius, 0, -baseSpeed * 0.5,
                        { color: spreadColor, radius: 2.5, damage: 0.5 });
                }
                break;
            }
            case 'homing': {
                const lvl = this.primaryLevel;
                const count = lvl >= 5 ? 5 : lvl >= 4 ? 4 : lvl >= 3 ? 3 : lvl >= 2 ? 2 : 1;
                const dmg = 0.3; // Low damage — convenience weapon, not a damage dealer
                const spd = lvl >= 4 ? 0.7 : 0.6;
                for (let j = 0; j < count; j++) {
                    const ox = (j - (count - 1) / 2) * 14;
                    this.bullets.spawn(this.x + ox, this.y - this.radius,
                        ox * 2, baseSpeed * spd,
                        { color: homingColor, radius: 2.5, damage: dmg, type: 'homing', life: 3 });
                }
                break;
            }
            case 'laser': {
                const lvl = this.primaryLevel;
                const beamDamage = lvl >= 5 ? 5 : lvl >= 4 ? 4.5 : lvl >= 3 ? 4 : lvl >= 2 ? 3 : 2;
                const beamWidth = lvl >= 5 ? 8 : lvl >= 4 ? 7 : lvl >= 3 ? 6 : lvl >= 2 ? 5 : 4;
                this.bullets.spawn(this.x, this.y - this.radius, 0, baseSpeed * 1.5,
                    { color: laserColor, radius: beamWidth, damage: beamDamage, type: 'laser' });
                // Lv3+: side beams
                if (lvl >= 3) {
                    const sideW = lvl >= 5 ? beamWidth * 0.6 : beamWidth * 0.5;
                    const sideDmg = lvl >= 5 ? beamDamage * 0.4 : beamDamage * 0.35;
                    const sideSpread = lvl >= 5 ? 18 : lvl >= 4 ? 15 : 12;
                    this.bullets.spawn(this.x - sideSpread, this.y - this.radius, 0, baseSpeed * 1.5,
                        { color: laserColor, radius: sideW, damage: sideDmg, type: 'laser' });
                    this.bullets.spawn(this.x + sideSpread, this.y - this.radius, 0, baseSpeed * 1.5,
                        { color: laserColor, radius: sideW, damage: sideDmg, type: 'laser' });
                }
                // Lv4+: additional outer beams (thin, low damage)
                if (lvl >= 4) {
                    this.bullets.spawn(this.x - 30, this.y - this.radius, 0, baseSpeed * 1.3,
                        { color: laserColor, radius: beamWidth * 0.3, damage: beamDamage * 0.2, type: 'laser' });
                    this.bullets.spawn(this.x + 30, this.y - this.radius, 0, baseSpeed * 1.3,
                        { color: laserColor, radius: beamWidth * 0.3, damage: beamDamage * 0.2, type: 'laser' });
                }
                break;
            }
        }

        // Drone firing — Lv1-2: contact only, Lv3: 4 drones fire, Lv4: 5 drones fire faster, Lv5: 6 drones + stronger
        if (this.droneLevel >= 3) {
            const droneCount = this.droneLevel >= 5 ? 6 : this.droneLevel >= 4 ? 5 : 4;
            const droneDmg = 0.5; // Same damage per shot at all levels — more drones = more coverage, not more burst
            for (let d = 0; d < droneCount; d++) {
                const a = (Math.PI * 2 / droneCount) * d + this.engineFlicker * 0.15;
                const dx = this.x + Math.cos(a) * 30;
                const dy = this.y + Math.sin(a) * 30;
                if (this.fireTimer <= 0) {
                    let nearest = null, nearDist = Infinity;
                    for (const e of Enemies.list) {
                        const d2 = (e.x - dx) * (e.x - dx) + (e.y - dy) * (e.y - dy);
                        if (d2 < nearDist) { nearDist = d2; nearest = e; }
                    }
                    if (nearest) {
                        const ang = Math.atan2(nearest.y - dy, nearest.x - dx);
                        this.bullets.spawn(dx, dy, Math.cos(ang) * 500, Math.sin(ang) * 500,
                            { color: droneColor, radius: 2, damage: droneDmg, life: 1.5 });
                    }
                }
            }
        }
    },

    _startDash() {
        const move = Input.getMovement();
        if (move.x === 0 && move.y === 0) {
            this.dashDir = { x: 0, y: -1 }; // Default: dash up
        } else {
            this.dashDir = move;
        }
        this.dashing = true;
        this.dashTimer = 0.15;
        this.invincible = true;
        this.dashCooldown = GameConfig.dash.cooldown;
        Audio.playDash();
        Particles.spawn(this.x, this.y, 8, { color: '#00ffff', speed: 100, life: 0.3, size: 2 });
    },

    _useBomb() {
        this.bombs--;
        Scoring.recordBomb();
        this.bombActive = true;
        this.bombTimer = 1.5;
        this.invincible = true;
        this.invincibleTimer = 1.5;
        Renderer.triggerChroma(0.008, 0.4);
        Renderer.triggerFlash(0x00ffff, 0.15);

        // Clear all enemy bullets
        Enemies.enemyBullets.clear();

        // Damage all enemies — tiered: kills weak, damages medium, hurts tough
        for (const e of [...Enemies.list]) {
            let bombDmg;
            if (e.maxHp <= 3) {
                bombDmg = e.maxHp + 5; // Guaranteed kill: scouts, snipers, shield walls
            } else if (e.maxHp <= 6) {
                bombDmg = Math.ceil(e.maxHp * 0.75); // 75%: gunships, turrets, phase shifters — nearly dead
            } else {
                bombDmg = Math.ceil(e.maxHp * 0.45); // 45%: cruisers, carriers, bombers — hurt but survive
            }
            Enemies.hit(e, bombDmg);
        }

        // Damage boss — 10% of current phase HP
        if (Boss.active && Boss.entered && !Boss.defeated) {
            const bossBombDmg = Math.max(8, Math.ceil(Boss.maxHp * 0.1));
            Boss.hit(bossBombDmg);
        }

        Scoring.breakChain();
        ScreenShake.trigger(8, 0.5);
        Audio.playBomb();

        // Bomb visual particles
        for (let i = 0; i < 40; i++) {
            const a = (Math.PI * 2 / 40) * i;
            Particles.spawn(this.x, this.y, 1, {
                color: '#00ffff', speed: 300, life: 0.8, size: 3,
                angle: a, spread: 0.1
            });
        }
    },

    _die() {
        if (this.invincible || !this.alive) return;

        // Shield absorbs hit if available
        if (this.shieldHp > 0) {
            this.shieldHp--;
            this.shieldFlashTimer = 0.3;
            this.invincible = true;
            this.invincibleTimer = 0.8;
            Particles.spawn(this.x, this.y, 15, { color: '#4488ff', speed: 120, life: 0.3, size: 2 });
            Particles.spawnShockwave(this.x, this.y, '#4488ff', 40, 0.25);
            Renderer.addGlow(this.x, this.y, 0x4488ff, 60, 0.6);
            Renderer.triggerChroma(0.005, 0.2);
            ScreenShake.trigger(4, 0.2);
            Audio.playShieldHit();
            return;
        }

        this.alive = false;
        this.lives--;
        Scoring.recordDeath();
        Scoring.breakChain();
        Scoring.surgeCharge = 0;
        Scoring.surgeActive = false;

        // Death penalty
        switch (GameConfig.deathPenalty) {
            case 'moderate':
                if (this.primaryLevel > 0) this.primaryLevel--;
                else this.primaryWeapon = 'none';
                if (this.droneLevel > 0) this.droneLevel--;
                break;
            case 'full':
                this.primaryWeapon = 'none';
                this.primaryLevel = 0;
                this.droneLevel = 0;
                break;
        }

        // Death animation — spawn ship fragments
        this.deathX = this.x;
        this.deathY = this.y;
        this.deathAnimTimer = 1.5;
        this.deathFragments = [];
        const skinColor = Hangar.skinColor;
        for (let i = 0; i < 8; i++) {
            const angle = (Math.PI * 2 / 8) * i + Math.random() * 0.3;
            this.deathFragments.push({
                x: this.x, y: this.y,
                vx: Math.cos(angle) * (60 + Math.random() * 80),
                vy: Math.sin(angle) * (60 + Math.random() * 80),
                rot: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 8,
                size: 4 + Math.random() * 6,
                color: i % 2 === 0 ? skinColor : '#88eeff'
            });
        }

        Particles.spawn(this.x, this.y, 30, { color: skinColor, speed: 200, life: 0.6, size: 3 });
        Particles.spawn(this.x, this.y, 20, { color: '#ffffff', speed: 150, life: 0.4, size: 2 });
        Renderer.triggerChroma(0.012, 0.5);
        Renderer.triggerFlash(0xffffff, 0.25);
        ScreenShake.trigger(10, 0.5);
        Audio.playPlayerDeath();

        if (this.lives > 0) {
            this.respawnTimer = 1.5;
        }
    },

    _respawn() {
        this.alive = true;
        this.x = PLAY_W / 2;
        this.y = PLAY_H - 80;
        this.invincible = true;
        this.invincibleTimer = 2.0;
        this.bombs = Math.min(this.bombs + 2, GameConfig.bombs.startCount);
        this.shieldHp = this.maxShieldHp; // Restore shield on respawn
        this.bullets.clear();
    },

    _collectPowerUp(powerUp) {
        Audio.playPowerUp();
        Particles.spawn(powerUp.x, powerUp.y, 10, { color: powerUp.color, speed: 80, life: 0.3 });

        const weaponNames = { spread: 'SPREAD SHOT', homing: 'HOMING MISSILES', laser: 'LASER BEAM', drone: 'DRONES' };
        const weaponColors = { spread: '#ff8c00', homing: '#00ff88', laser: '#4488ff', drone: '#cc44ff' };

        if (powerUp.type === 'drone') {
            this.droneLevel = Math.min(5, this.droneLevel + 1);
            if (this.droneLevel >= 5) Achievements.onDroneMax();
            Scoring.spawnPopup(weaponNames.drone + ' LV' + this.droneLevel, weaponColors.drone, 16);
        } else {
            if (this.primaryWeapon === powerUp.type) {
                this.primaryLevel = Math.min(5, this.primaryLevel + 1);
                if (this.primaryLevel >= 5) Achievements.onWeaponMax();
                Scoring.spawnPopup(weaponNames[powerUp.type] + ' LV' + this.primaryLevel, weaponColors[powerUp.type], 16);
            } else {
                this.primaryWeapon = powerUp.type;
                this.primaryLevel = 1;
                Scoring.spawnPopup(weaponNames[powerUp.type] + ' LV1', weaponColors[powerUp.type], 16);
            }
        }
    },

    draw(ctx) {
        // Draw death fragments when dead
        if (!this.alive && this.deathAnimTimer > 0) {
            const alpha = this.deathAnimTimer / 1.5;
            for (const f of this.deathFragments) {
                ctx.save();
                ctx.translate(f.x, f.y);
                ctx.rotate(f.rot);
                ctx.globalAlpha = alpha;
                ctx.fillStyle = f.color;
                // Irregular triangle fragment
                ctx.beginPath();
                ctx.moveTo(-f.size * 0.5, -f.size * 0.3);
                ctx.lineTo(f.size * 0.5, 0);
                ctx.lineTo(-f.size * 0.3, f.size * 0.4);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            }
            ctx.globalAlpha = 1;
            // Still draw bullets even when dead
            this.bullets.draw(ctx);
            return;
        }

        if (!this.alive) return;

        // Blink when invincible
        if (this.invincible && !this.dashing && Math.floor(this.invincibleTimer * 10) % 2 === 0) return;

        const focusing = GameConfig.focus.enabled && Input.isHeld('focus');

        // Engine trail — apply equipped trail color
        ctx.globalAlpha = 0.3;
        for (let i = 1; i < this.trailPositions.length; i++) {
            const t = this.trailPositions[i];
            const alpha = (1 - i / this.trailPositions.length) * 0.3;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = this.dashing ? '#ffffff' : Hangar.trailColor;
            ctx.beginPath();
            ctx.arc(t.x, t.y, this.radius * (1 - i * 0.08), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        // Drones
        if (this.droneLevel > 0) {
            const droneCount = this.droneLevel >= 5 ? 6 : this.droneLevel >= 4 ? 5 : this.droneLevel >= 3 ? 4 : this.droneLevel >= 2 ? 3 : 2;
            for (let d = 0; d < droneCount; d++) {
                const a = (Math.PI * 2 / droneCount) * d + this.engineFlicker * 0.15;
                const dx = this.x + Math.cos(a) * 30;
                const dy = this.y + Math.sin(a) * 30;
                ctx.fillStyle = '#cc44ff';
                ctx.beginPath();
                ctx.arc(dx, dy, 5, 0, Math.PI * 2);
                ctx.fill();
                // Shield pulse for level 2+, stronger at higher levels
                if (this.droneLevel >= 2 && Math.sin(this.engineFlicker * 0.5) > (this.droneLevel >= 4 ? 0.5 : 0.8)) {
                    const pulseAlpha = this.droneLevel >= 5 ? 0.5 : this.droneLevel >= 4 ? 0.4 : 0.3;
                    ctx.strokeStyle = `rgba(204, 68, 255, ${pulseAlpha})`;
                    ctx.lineWidth = this.droneLevel >= 4 ? 3 : 2;
                    ctx.beginPath();
                    ctx.arc(this.x, this.y, 35, 0, Math.PI * 2);
                    ctx.stroke();
                    // Double ring at level 5
                    if (this.droneLevel >= 5) {
                        ctx.strokeStyle = 'rgba(204, 68, 255, 0.2)';
                        ctx.beginPath();
                        ctx.arc(this.x, this.y, 45, 0, Math.PI * 2);
                        ctx.stroke();
                    }
                }
            }
        }

        ctx.save();
        ctx.translate(this.x, this.y);

        // GPU glow behind player — engine glow + surge glow
        Renderer.addGlow(this.x, this.y, Renderer.colorToHex(Hangar.trailColor), this.radius * 2.5, 0.25);
        if (Scoring.surgeActive) {
            Renderer.addGlow(this.x, this.y, 0xffffff, this.radius * 4, 0.3);
        }

        // Surge glow
        if (Scoring.surgeActive && !Settings.values.flashReduction) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.beginPath();
            ctx.arc(0, 0, this.radius + 10 + Math.sin(this.engineFlicker) * 3, 0, Math.PI * 2);
            ctx.fill();
        }

        // Shield HP visual
        if (this.maxShieldHp > 0 && this.shieldHp > 0) {
            const shieldAlpha = this.shieldFlashTimer > 0 ? 0.6 : 0.2 + Math.sin(this.engineFlicker * 0.3) * 0.1;
            const shieldColor = this.shieldFlashTimer > 0 ? '#ffffff' : '#4488ff';
            ctx.strokeStyle = shieldColor;
            ctx.lineWidth = 2;
            ctx.globalAlpha = shieldAlpha;
            ctx.beginPath();
            ctx.arc(0, 0, this.radius + 5, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }

        // Ship body — apply equipped skin
        const skinColor = Hangar.equipped.skin === 'chromatic'
            ? `hsl(${(this.engineFlicker * 10) % 360}, 100%, 70%)`
            : Hangar.skinColor;
        const shipAlpha = Hangar.equipped.skin === 'ghost' ? 0.6 : 1.0;
        ctx.globalAlpha = shipAlpha;
        const sc = Scoring.surgeActive ? '#ffffff' : skinColor;
        ctx.fillStyle = sc;
        const r = this.radius;

        // Main fuselage
        ctx.beginPath();
        ctx.moveTo(0, -r * 1.1);         // Nose
        ctx.lineTo(r * 0.25, -r * 0.5);  // Right nose taper
        ctx.lineTo(r * 0.3, r * 0.1);    // Right body
        ctx.lineTo(r * 0.25, r * 0.7);   // Right rear
        ctx.lineTo(-r * 0.25, r * 0.7);  // Left rear
        ctx.lineTo(-r * 0.3, r * 0.1);   // Left body
        ctx.lineTo(-r * 0.25, -r * 0.5); // Left nose taper
        ctx.closePath();
        ctx.fill();

        // Wings
        ctx.beginPath();
        ctx.moveTo(r * 0.3, -r * 0.1);   // Right wing root
        ctx.lineTo(r * 0.9, r * 0.4);    // Right wing tip
        ctx.lineTo(r * 0.85, r * 0.6);   // Right wing trailing edge
        ctx.lineTo(r * 0.3, r * 0.3);    // Right wing back to body
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-r * 0.3, -r * 0.1);  // Left wing root
        ctx.lineTo(-r * 0.9, r * 0.4);   // Left wing tip
        ctx.lineTo(-r * 0.85, r * 0.6);  // Left wing trailing edge
        ctx.lineTo(-r * 0.3, r * 0.3);   // Left wing back to body
        ctx.closePath();
        ctx.fill();

        // Cockpit canopy
        ctx.fillStyle = Scoring.surgeActive ? '#ffffff' : '#aaddff';
        ctx.globalAlpha = shipAlpha * 0.7;
        ctx.beginPath();
        ctx.ellipse(0, -r * 0.35, r * 0.12, r * 0.25, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = shipAlpha;

        // Wing tip accents
        ctx.fillStyle = sc;
        ctx.fillRect(r * 0.7, r * 0.35, r * 0.15, 2);
        ctx.fillRect(-r * 0.85, r * 0.35, r * 0.15, 2);

        // Outline
        ctx.strokeStyle = Scoring.surgeActive ? '#ffffff' : '#88eeff';
        ctx.lineWidth = 1;
        // Fuselage outline
        ctx.beginPath();
        ctx.moveTo(0, -r * 1.1);
        ctx.lineTo(r * 0.25, -r * 0.5);
        ctx.lineTo(r * 0.3, r * 0.1);
        ctx.lineTo(r * 0.9, r * 0.4);
        ctx.lineTo(r * 0.85, r * 0.6);
        ctx.lineTo(r * 0.25, r * 0.7);
        ctx.lineTo(-r * 0.25, r * 0.7);
        ctx.lineTo(-r * 0.85, r * 0.6);
        ctx.lineTo(-r * 0.9, r * 0.4);
        ctx.lineTo(-r * 0.3, r * 0.1);
        ctx.lineTo(-r * 0.25, -r * 0.5);
        ctx.closePath();
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Engine glow — twin engines at wing roots
        const trailColor = Hangar.trailColor;
        const flicker = Math.sin(this.engineFlicker) * 2;
        ctx.fillStyle = trailColor;
        // Left engine
        ctx.beginPath();
        ctx.moveTo(-r * 0.35, r * 0.65);
        ctx.lineTo(-r * 0.25, r * 0.95 + flicker);
        ctx.lineTo(-r * 0.15, r * 0.65);
        ctx.fill();
        // Right engine
        ctx.beginPath();
        ctx.moveTo(r * 0.15, r * 0.65);
        ctx.lineTo(r * 0.25, r * 0.95 + flicker);
        ctx.lineTo(r * 0.35, r * 0.65);
        ctx.fill();

        // Focus mode hitbox indicator (or always if setting enabled)
        if (focusing || Settings.values.showHitbox) {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(0, 0, this.hitboxRadius + 1, 0, Math.PI * 2);
            ctx.fill();
            // Graze zone indicator
            if (GameConfig.graze.enabled) {
                const gz = this.grazeRadius * (GameConfig.graze.zoneMultiplier || 1);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(0, 0, gz, 0, Math.PI * 2);
                ctx.stroke();
            }
        }

        ctx.restore();

        // Draw player bullets
        this.bullets.draw(ctx);

        // Bomb effect
        if (this.bombActive && !Settings.values.flashReduction) {
            const bombAlpha = this.bombTimer / 1.5;
            // GPU glow at bomb centre
            Renderer.addGlow(this.x, this.y, 0x00ffff, 300 * bombAlpha, bombAlpha * 0.4);
            // Screen-filling flash
            ctx.fillStyle = `rgba(0, 255, 255, ${bombAlpha * 0.08})`;
            ctx.fillRect(0, 0, PLAY_W, PLAY_H);
            // White-hot centre
            ctx.fillStyle = `rgba(255, 255, 255, ${bombAlpha * 0.12})`;
            ctx.beginPath();
            ctx.arc(this.x, this.y, 80 * bombAlpha, 0, Math.PI * 2);
            ctx.fill();
            // Expanding shockwave ring
            const ringR = (1.5 - this.bombTimer) * 400;
            ctx.strokeStyle = `rgba(0, 255, 255, ${bombAlpha * 0.5})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(this.x, this.y, ringR, 0, Math.PI * 2);
            ctx.stroke();
            // Secondary inner ring
            ctx.strokeStyle = `rgba(255, 255, 255, ${bombAlpha * 0.3})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(this.x, this.y, ringR * 0.6, 0, Math.PI * 2);
            ctx.stroke();
        } else if (this.bombActive) {
            // Reduced flash — just the ring, dimmer
            const ringR = (1.5 - this.bombTimer) * 400;
            ctx.strokeStyle = `rgba(0, 255, 255, 0.15)`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.x, this.y, ringR, 0, Math.PI * 2);
            ctx.stroke();
        }
    }
};
