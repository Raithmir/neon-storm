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

    // Weapons
    primaryWeapon: 'none', // 'none', 'spread', 'homing', 'laser'
    primaryLevel: 0,
    droneLevel: 0,
    fireTimer: 0,        // base shot
    weaponTimer: 0,      // primary weapon
    droneShotTimer: 0,
    droneContactTimer: 0,
    shieldPulseTimer: 0,
    shieldPulseFlash: 0,
    deathPending: 0,     // death-bomb window remaining

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
        this.weaponTimer = 0;
        this.droneShotTimer = 0;
        this.droneContactTimer = 0;
        this.shieldPulseTimer = 3.0;
        this.shieldPulseFlash = 0;
        this.deathPending = 0;
        this.prevX = this.x;
        this.prevY = this.y;
        this.dashCooldown = 0;
        this.dashing = false;
        this.bombActive = false;
        this.bullets.clear();
        this.trailPositions = [];
    },

    // Weapon tuning. Targets (single target, all shots landing, incl. base shot):
    // Lv1 ≈ 17-18 DPS, Lv3 ≈ 26-31, Lv5 ≈ 36-45 — a ~2.5× power curve like
    // Raiden/Touhou, with every weapon within ~20% of the others.
    BASE_SHOT_INTERVAL: 0.12,
    WEAPON_INTERVALS: { spread: 0.25, homing: 0.26, laser: 0.1 }, // homing never misses, so it fires slower
    DRONE_SHOT_INTERVAL: 0.5,
    DRONE_CONTACT_INTERVAL: 0.15,
    FOCUS_SPREAD_FACTOR: 0.35,
    // Spread fans: each level is a strict superset of the previous one (pellets are only
    // ever added), so an upgrade can never land fewer shots on a target at any range
    SPREAD_ANGLES: [
        null,
        [-0.05, 0.05],
        [-0.05, 0, 0.05],
        [-0.2, -0.05, 0, 0.05, 0.2],
        [-0.2, -0.12, -0.05, 0, 0.05, 0.12, 0.2],
        [-0.34, -0.2, -0.12, -0.05, 0, 0.05, 0.12, 0.2, 0.34],
    ],

    droneCount() {
        return this.droneLevel > 0 ? this.droneLevel + 1 : 0; // Lv1: 2 … Lv5: 6
    },

    dronePositions() {
        const n = this.droneCount();
        const out = [];
        for (let d = 0; d < n; d++) {
            const a = (Math.PI * 2 / n) * d + this.engineFlicker * 0.15;
            out.push({ x: this.x + Math.cos(a) * 30, y: this.y + Math.sin(a) * 30 });
        }
        return out;
    },

    isFocusing() {
        return GameConfig.focus.enabled && Input.isHeld('focus');
    },

    update(dt) {
        if (!this.alive) {
            this.respawnTimer -= dt;
            this.deathAnimTimer = Math.max(0, this.deathAnimTimer - dt);
            if (this.respawnTimer <= 0 && this.lives > 0) this._respawn();
            // Keep bullets moving even while dead
            this.bullets.update(dt, Enemies.list);
            return;
        }

        this.prevX = this.x;
        this.prevY = this.y;
        this.engineFlicker += dt * 20;
        this.invincibleTimer = Math.max(0, this.invincibleTimer - dt);
        if (this.invincibleTimer <= 0 && !this.dashing) this.invincible = false;
        this.dashCooldown = Math.max(0, this.dashCooldown - dt);
        this.shieldFlashTimer = Math.max(0, this.shieldFlashTimer - dt);
        this.shieldPulseFlash = Math.max(0, this.shieldPulseFlash - dt);

        // Death-bomb window: a lethal hit can still be cancelled by bombing (Touhou-style)
        if (this.deathPending > 0) {
            if (Input.isPressed('bomb') && GameConfig.bombs.enabled && this.bombs > 0) {
                this.deathPending = 0;
                this._useBomb();
                Scoring.spawnPopup('DEATH BOMB!', '#00ffff', 20);
            } else {
                this.deathPending -= dt;
                if (this.deathPending <= 0) {
                    this.deathPending = 0;
                    this._die(true);
                    return;
                }
            }
        }

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
                // Keep any invulnerability that was already running (bomb, respawn, shield)
                this.invincible = this.invincibleTimer > 0;
            }
        } else {
            // Normal movement
            const move = Input.getMovement();
            const spd = this.speed * (this.isFocusing() ? GameConfig.focus.speedMultiplier : 1);
            this.x += move.x * spd * dt;
            this.y += move.y * spd * dt;
        }

        // Clamp to play area
        this.x = Math.max(this.radius, Math.min(PLAY_W - this.radius, this.x));
        this.y = Math.max(this.radius, Math.min(PLAY_H - this.radius, this.y));

        // Trail
        this.trailPositions.unshift({ x: this.x, y: this.y });
        if (this.trailPositions.length > 10) this.trailPositions.pop();

        // Firing — auto-fire keeps shooting while focusing (focus tightens the pattern instead)
        const shouldFire = (GameConfig.fireMode === 'auto' || Input.isHeld('fire')) && !this.dashing && this.deathPending <= 0;
        const rateMult = Scoring.surgeActive ? 0.5 : 1; // Neon Surge: double fire rate
        this.fireTimer -= dt;
        this.weaponTimer -= dt;
        this.droneShotTimer -= dt;
        if (shouldFire) {
            if (this.fireTimer <= 0) {
                this._fireBaseShot();
                this.fireTimer = this.BASE_SHOT_INTERVAL * rateMult;
            }
            if (this.primaryWeapon !== 'none' && this.primaryLevel > 0 && this.weaponTimer <= 0) {
                this._fireWeapon();
                this.weaponTimer = this.WEAPON_INTERVALS[this.primaryWeapon] * rateMult;
            }
            if (this.droneLevel >= 3 && this.droneShotTimer <= 0) {
                this._fireDrones();
                this.droneShotTimer = this.DRONE_SHOT_INTERVAL * rateMult;
            }
        }

        // Laser beam MeshRope — show while firing, hide otherwise
        if (this.primaryWeapon === 'laser' && this.alive) {
            const laserColor = Hangar.equipped.bullet === 'neon' ? '#4488ff' : Hangar.bulletColor;
            Renderer.updateLaserBeam(this.x, this.y - this.radius, laserColor, shouldFire);
            Audio.laserHum(shouldFire && this.primaryLevel > 0);
        } else {
            Renderer.updateLaserBeam(0, 0, null, false);
        }

        // Dash input
        if (Input.isPressed('dash') && GameConfig.dash.enabled && this.dashCooldown <= 0 && !this.dashing) {
            this._startDash();
        }

        // Bomb input (the death-bomb window above handles bombing while hit)
        if (Input.isPressed('bomb') && GameConfig.bombs.enabled && this.bombs > 0 && !this.bombActive && this.deathPending <= 0) {
            this._useBomb();
        }

        // Graze detection — only while vulnerable (dashing through bullets still counts)
        if (GameConfig.graze.enabled && (!this.invincible || this.dashing) && this.deathPending <= 0) {
            const gz = this.grazeRadius * (GameConfig.graze.zoneMultiplier || 1);
            for (const b of Enemies.enemyBullets.pool) {
                if (b.grazed || b.harmless > 0) continue;
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

        // Surge activation — dedicated SURGE input, or bomb with no bombs left
        if (Scoring.surgeCharge >= Scoring.surgeMax && !Scoring.surgeActive) {
            const surgeTriggered = Input.isPressed('surge') ||
                                   (Input.isPressed('bomb') && (!GameConfig.bombs.enabled || this.bombs <= 0));
            if (surgeTriggered) {
                Scoring.activateSurge();
                Achievements.onSurge();
                Audio.playSurgeActivate();
                ScreenShake.trigger(12, 0.5);
                Renderer.triggerFlash(0xffffff, 0.35);
                Renderer.triggerChroma(0.025, 0.7);
                Renderer.triggerShockwave(this.x / PLAY_W, this.y / PLAY_H);
                Particles.spawn(this.x, this.y, 80, { color: '#ffffff', speed: 300, life: 0.7, size: 4 });
                Particles.spawn(this.x, this.y, 40, { color: '#00ffff', speed: 200, life: 1.0, size: 2.5 });
                Particles.spawnShockwave(this.x, this.y, '#00ffff', 150, 0.45);
                Renderer.addGlow(this.x, this.y, 0x00ffff, 150, 0.95);
                Renderer.spawnExplosionSprite(this.x, this.y, 5, 0x00ffff, 0.5);
            }
        }

        // Drones: contact damage and periodic shield pulse
        this._updateDrones(dt);

        // Collision with enemy bullets (swept, so fast bullets can't tunnel through the hitbox)
        if (!this.invincible && !this.dashing && this.deathPending <= 0) {
            for (const b of Enemies.enemyBullets.pool) {
                if (b.harmless > 0) continue;
                const r = this.hitboxRadius + b.radius;
                if (this._sweptHit(b, r)) {
                    b.active = false;
                    this._die();
                    break;
                }
            }
        }

        // Collision with enemies (contact damage)
        if (!this.invincible && !this.dashing && this.deathPending <= 0) {
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
        if (!this.invincible && !this.dashing && this.deathPending <= 0 && Boss.active && Boss.entered && !Boss.defeated) {
            const dx = Boss.x - this.x;
            const dy = Boss.y - this.y;
            if (dx * dx + dy * dy < (this.hitboxRadius + Boss.radius) * (this.hitboxRadius + Boss.radius)) {
                this._die();
            }
        }

        // Neon Surge: player shots cancel enemy bullets they touch
        if (Scoring.surgeActive) this._surgeCancelBullets();

        // Player bullets collision with enemies
        for (let i = this.bullets.pool.length - 1; i >= 0; i--) {
            const b = this.bullets.pool[i];
            if (!b.active) continue;

            // Check boss (armor segments first, then the core)
            if (Boss.active && Boss.entered && !Boss.defeated) {
                if (Boss.hitTest(b)) {
                    b.active = false;
                    Scoring.onHit();
                    Particles.impact(b);
                    continue;
                }
            }

            // Check enemies — lasers pierce, hitting each enemy once
            for (const e of Enemies.list) {
                if (b.pierce && b.hitSet && b.hitSet.has(e)) continue;
                const dx = b.x - e.x;
                const dy = b.y - e.y;
                if (dx * dx + dy * dy < (b.radius + e.radius) * (b.radius + e.radius)) {
                    // Calculate player-to-enemy distance for point-blank bonus
                    const pdx = this.x - e.x, pdy = this.y - e.y;
                    const playerDist = Math.sqrt(pdx * pdx + pdy * pdy);
                    Enemies.hit(e, b.damage, playerDist);
                    Scoring.onHit();
                    Particles.impact(b);
                    if (b.pierce) {
                        (b.hitSet || (b.hitSet = new Set())).add(e);
                        continue;
                    }
                    b.active = false;
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

        this.bullets.update(dt, this._targets());
    },

    // Enemies plus the boss, as homing/drone targets
    _targets() {
        const targets = [...Enemies.list];
        if (Boss.active && Boss.entered && !Boss.defeated) targets.push({ x: Boss.x, y: Boss.y, isBoss: true });
        return targets;
    },

    // Closest approach between the hitbox and a bullet's path since the last frame
    _sweptHit(b, r) {
        const px = this.prevX !== undefined ? this.prevX : this.x;
        const py = this.prevY !== undefined ? this.prevY : this.y;
        const ax = b.prevX - px, ay = b.prevY - py;   // relative position at start of step
        const bx = b.x - this.x, by = b.y - this.y;   // relative position now
        const vx = bx - ax, vy = by - ay;
        const len2 = vx * vx + vy * vy;
        let t = len2 > 0 ? -(ax * vx + ay * vy) / len2 : 0;
        t = Math.max(0, Math.min(1, t));
        const cx = ax + vx * t, cy = ay + vy * t;
        return cx * cx + cy * cy < r * r;
    },

    _surgeCancelBullets() {
        const enemy = Enemies.enemyBullets.pool;
        for (const b of this.bullets.pool) {
            if (!b.active) continue;
            for (const eb of enemy) {
                if (!eb.active) continue;
                const dx = b.x - eb.x, dy = b.y - eb.y;
                const r = b.radius + eb.radius + 2;
                if (dx * dx + dy * dy < r * r) {
                    eb.active = false;
                    Particles.spawn(eb.x, eb.y, 2, { color: '#ffffff', speed: 60, life: 0.2, size: 2 });
                    Scoring.score += Math.floor(10 * GameConfig.scoreMultiplier);
                    if (!b.pierce) { b.active = false; break; }
                }
            }
        }
    },

    _updateDrones(dt) {
        if (this.droneLevel <= 0) return;
        const drones = this.dronePositions();

        // Contact damage (GDD: drones damage enemies they touch)
        this.droneContactTimer -= dt;
        if (this.droneContactTimer <= 0) {
            this.droneContactTimer = this.DRONE_CONTACT_INTERVAL;
            for (const d of drones) {
                for (const e of [...Enemies.list]) {
                    const dx = e.x - d.x, dy = e.y - d.y;
                    if (dx * dx + dy * dy < (e.radius + 6) * (e.radius + 6)) Enemies.hit(e, 1);
                }
                if (Boss.active && Boss.entered && !Boss.defeated) {
                    const dx = Boss.x - d.x, dy = Boss.y - d.y;
                    if (dx * dx + dy * dy < (Boss.radius + 6) * (Boss.radius + 6)) Boss.hit(1);
                }
            }
        }

        // Shield pulse (Lv2+): periodically cancels enemy bullets close to the ship
        if (this.droneLevel >= 2) {
            this.shieldPulseTimer -= dt;
            if (this.shieldPulseTimer <= 0) {
                this.shieldPulseTimer = this.droneLevel >= 4 ? 2.0 : 3.0;
                this.shieldPulseFlash = 0.25;
                const r = this.droneLevel >= 5 ? 55 : 45;
                for (const b of Enemies.enemyBullets.pool) {
                    const dx = b.x - this.x, dy = b.y - this.y;
                    if (dx * dx + dy * dy < r * r) {
                        b.active = false;
                        Particles.spawn(b.x, b.y, 2, { color: '#cc44ff', speed: 60, life: 0.2, size: 2 });
                    }
                }
            }
        }
    },

    _weaponColors() {
        const bColor = Hangar.bulletColor;
        const isDefaultBullet = Hangar.equipped.bullet === 'neon';
        return {
            spread: isDefaultBullet ? '#ff8c00' : bColor,
            homing: isDefaultBullet ? '#00ff88' : bColor,
            laser: isDefaultBullet ? '#4488ff' : bColor,
            drone: isDefaultBullet ? '#cc44ff' : bColor,
        };
    },

    // Base shot: always available, on its own timer so weapons never slow it down
    _fireBaseShot() {
        this.bullets.spawn(this.x, this.y - this.radius, 0, -700, { color: Hangar.bulletColor, radius: 3, damage: 1 });
        Particles.flash(this.x, this.y - this.radius - 2, 9, Hangar.bulletColor, 0.05);
        Audio.playShot();
    },

    _fireWeapon() {
        const baseSpeed = -700;
        const lvl = this.primaryLevel;
        const colors = this._weaponColors();
        const focus = this.isFocusing();

        switch (this.primaryWeapon) {
            case 'spread': {
                // Focus tightens the fan (Touhou-style focused shot)
                const spreadMult = focus ? this.FOCUS_SPREAD_FACTOR : 1;
                const rad = lvl >= 4 ? 3 : 2.5;
                for (const a0 of this.SPREAD_ANGLES[lvl]) {
                    const a = a0 * spreadMult;
                    this.bullets.spawn(this.x, this.y - this.radius,
                        Math.sin(a) * -baseSpeed, Math.cos(a) * baseSpeed,
                        { color: colors.spread, radius: rad, damage: 1 });
                }
                break;
            }
            case 'homing': {
                Audio.playMissile();
                const count = lvl + 1; // Lv1: 2 … Lv5: 6 missiles
                const spd = lvl >= 4 ? 0.7 : lvl >= 2 ? 0.65 : 0.6;
                for (let j = 0; j < count; j++) {
                    const ox = (j - (count - 1) / 2) * 12;
                    this.bullets.spawn(this.x + ox, this.y - this.radius,
                        ox * 2, baseSpeed * spd,
                        { color: colors.homing, radius: 2.5, damage: 1, type: 'homing', life: 3 });
                }
                break;
            }
            case 'laser': {
                // Piercing beam: main beam plus side beams (Lv3+) and thin outer beams (Lv4+)
                const mainDmg = [0, 1.0, 1.3, 1.6, 1.9, 2.3][lvl];
                const mainW = [0, 4, 5, 6, 7, 8][lvl];
                const opts = (radius, damage) => ({ color: colors.laser, radius, damage, type: 'laser', pierce: true });
                this.bullets.spawn(this.x, this.y - this.radius, 0, baseSpeed * 1.5, opts(mainW, mainDmg));
                if (lvl >= 3) {
                    const off = [0, 0, 0, 12, 13, 14][lvl];         // stays inside a scout's hitbox
                    const dmg = [0, 0, 0, 0.3, 0.35, 0.4][lvl];
                    this.bullets.spawn(this.x - off, this.y - this.radius, 0, baseSpeed * 1.5, opts(3, dmg));
                    this.bullets.spawn(this.x + off, this.y - this.radius, 0, baseSpeed * 1.5, opts(3, dmg));
                }
                if (lvl >= 4) {
                    const off = lvl >= 5 ? 28 : 26;
                    const dmg = lvl >= 5 ? 0.2 : 0.15;
                    this.bullets.spawn(this.x - off, this.y - this.radius, 0, baseSpeed * 1.3, opts(2, dmg));
                    this.bullets.spawn(this.x + off, this.y - this.radius, 0, baseSpeed * 1.3, opts(2, dmg));
                }
                break;
            }
        }
        const flashColor = colors[this.primaryWeapon];
        if (flashColor) Particles.flash(this.x, this.y - this.radius - 2, 12, flashColor, 0.06);
    },

    // Drones Lv3+: each drone fires at the nearest target, including the boss
    _fireDrones() {
        const targets = this._targets();
        if (targets.length === 0) return;
        const color = this._weaponColors().drone;
        for (const d of this.dronePositions()) {
            let nearest = null, nearDist = Infinity;
            for (const t of targets) {
                const d2 = (t.x - d.x) * (t.x - d.x) + (t.y - d.y) * (t.y - d.y);
                if (d2 < nearDist) { nearDist = d2; nearest = t; }
            }
            const ang = Math.atan2(nearest.y - d.y, nearest.x - d.x);
            this.bullets.spawn(d.x, d.y, Math.cos(ang) * 500, Math.sin(ang) * 500,
                { color, radius: 2, damage: 1, life: 1.5 });
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
        this.dashTimer = 0.2;
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
        this.invincibleTimer = Math.max(this.invincibleTimer, 1.5);
        Renderer.triggerChroma(0.015, 0.6);
        Renderer.triggerFlash(0x00ffff, 0.3);
        Renderer.triggerShockwave(this.x / PLAY_W, this.y / PLAY_H);

        // Clear all enemy bullets
        Enemies.enemyBullets.clear();

        // Damage all enemies — tiered by the enemy's BASE toughness, so level HP scaling
        // doesn't push basic enemies out of the "guaranteed kill" tier
        for (const e of [...Enemies.list]) {
            const baseHp = (Enemies.types[e.type] || {}).hp || e.maxHp;
            let bombDmg;
            if (e.midboss) {
                bombDmg = Math.ceil(e.maxHp * 0.1);          // Mid-bosses: like bosses, 10%
            } else if (baseHp <= 3) {
                bombDmg = e.maxHp + e.shieldHp + 5;          // Guaranteed kill: scouts, snipers, shield walls
            } else if (baseHp <= 6) {
                bombDmg = Math.ceil(e.maxHp * 0.75);        // Gunships, turrets, phase shifters — nearly dead
            } else {
                bombDmg = Math.ceil(e.maxHp * 0.45);        // Cruisers, carriers, bombers — hurt but survive
            }
            Enemies.hit(e, bombDmg);
        }

        // Damage boss — 10% of current phase HP, and every armor segment
        if (Boss.active && Boss.entered && !Boss.defeated) {
            Boss.bombHit(Math.max(8, Math.ceil(Boss.maxHp * 0.1)));
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

    // confirmed: true once the death-bomb window has expired
    _die(confirmed) {
        if (!this.alive) return;
        if (!confirmed) {
            if (this.invincible || this.deathPending > 0) return;

            // Shield absorbs hit if available
            if (this.shieldHp > 0) {
                this.shieldHp--;
                this.shieldFlashTimer = 0.3;
                this.invincible = true;
                this.invincibleTimer = 0.8;
                Particles.spawn(this.x, this.y, 20, { color: '#4488ff', speed: 150, life: 0.4, size: 2.5 });
                Particles.spawnShockwave(this.x, this.y, '#4488ff', 60, 0.35);
                Renderer.addGlow(this.x, this.y, 0x4488ff, 100, 0.8);
                Renderer.triggerChroma(0.008, 0.3);
                ScreenShake.trigger(6, 0.3);
                Audio.playShieldHit();
                return;
            }

            // Death-bomb window: a short grace period in which bombing cancels the hit
            const window = GameConfig.deathBombWindow || 0;
            if (window > 0 && GameConfig.bombs.enabled && this.bombs > 0) {
                this.deathPending = window;
                Renderer.triggerFlash(0xff0044, 0.15);
                return;
            }
        }

        this.alive = false;
        this.lives--;
        Scoring.recordDeath();
        Scoring.breakChain();
        Scoring.surgeCharge = Math.floor(Scoring.surgeCharge * 0.5); // keep half the graze effort
        Scoring.surgeActive = false;

        // Death penalty
        switch (GameConfig.deathPenalty) {
            case 'moderate':
                if (this.primaryLevel > 0) this.primaryLevel--;
                if (this.primaryLevel === 0) this.primaryWeapon = 'none';
                if (this.droneLevel > 0) this.droneLevel--;
                break;
            case 'full':
                this.primaryWeapon = 'none';
                this.primaryLevel = 0;
                this.droneLevel = 0;
                break;
        }

        // Death animation — the ship's outline shatters
        this.deathX = this.x;
        this.deathY = this.y;
        this.deathAnimTimer = 1.5;
        const skinColor = Hangar.skinColor || '#00ffff';
        Particles.shatter(this.x, this.y, this._NEON_HULL, this.radius, 0, skinColor, 1.6);
        Particles.shatter(this.x, this.y, this._NEON_CANOPY, this.radius, 0, '#aaddff', 1.2);

        Particles.spawn(this.x, this.y, 50, { color: skinColor, speed: 250, life: 0.8, size: 4 });
        Particles.spawn(this.x, this.y, 30, { color: '#ffffff', speed: 200, life: 0.5, size: 3 });
        Renderer.triggerChroma(0.02, 0.7);
        Renderer.triggerFlash(0xffffff, 0.4);
        ScreenShake.trigger(15, 0.6);
        Audio.playPlayerDeath();

        if (this.lives > 0) {
            this.respawnTimer = 1.5;
        }
    },

    _respawn() {
        this.alive = true;
        this.x = PLAY_W / 2;
        this.y = PLAY_H - 80;
        this.prevX = this.x;
        this.prevY = this.y;
        this.invincible = true;
        this.invincibleTimer = 2.0;
        this.bombs = Math.max(this.bombs, Math.min(this.bombs + 2, GameConfig.bombs.startCount));
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

    // Neon style ship outlines, in units of this.radius
    _NEON_HULL: Neon.mirror([0, -1.15, 0.2, -0.6, 0.3, -0.05, 0.95, 0.45, 0.9, 0.62, 0.45, 0.48, 0.32, 0.72, 0.12, 0.62, 0, 0.66]),
    _NEON_CANOPY: Neon.mirror([0, -0.66, 0.1, -0.42, 0.08, -0.2, 0, -0.14]),
    _neonBank: 0,
    _neonLastX: null,

    // Draw an engine trail along pts (ship first). Styles match the Hangar
    // trails: thrust ribbon, flickering flame, particle scatter, lightning
    // arc and void (dark core, glowing edges). Also used by the Hangar preview.
    drawTrail(ctx, pts, style, color, r, t) {
        const n = pts.length;
        const calm = Renderer.calm();
        const ribbon = (fill, widthK, alpha, jitter) => {
            ctx.fillStyle = fill;
            for (let i = 0; i < n - 1; i++) {
                const p0 = pts[i], p1 = pts[i + 1];
                const j0 = jitter ? 1 + Math.sin(t * 40 + i * 1.7) * jitter : 1;
                const j1 = jitter ? 1 + Math.sin(t * 40 + (i + 1) * 1.7) * jitter : 1;
                const w0 = r * widthK * (1 - i / n) * j0, w1 = r * widthK * (1 - (i + 1) / n) * j1;
                ctx.globalAlpha = (1 - i / n) * alpha;
                ctx.beginPath();
                ctx.moveTo(p0.x - w0, p0.y); ctx.lineTo(p0.x + w0, p0.y);
                ctx.lineTo(p1.x + w1, p1.y); ctx.lineTo(p1.x - w1, p1.y);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        };
        switch (style) {
            case 'flame':
                ribbon(color, 0.6, 0.45, calm ? 0 : 0.25);
                ribbon('#ffcc33', 0.3, 0.6, calm ? 0 : 0.3);
                ribbon('#ffffff', 0.1, 0.6, 0);
                break;
            case 'scatter':
                for (let i = 1; i < n; i++) {
                    const k = 1 - i / n;
                    for (let j = 0; j < 2; j++) {
                        const h = Math.sin(i * 12.9 + j * 78.2 + Math.floor(t * 12)) * 43758.5;
                        const off = (h - Math.floor(h) - 0.5) * r * 1.2 * (1 - k);
                        Neon.light(ctx, pts[i].x + off, pts[i].y, 1.2 + k * 1.2, color, k);
                    }
                }
                break;
            case 'lightning': {
                ctx.beginPath();
                ctx.moveTo(pts[0].x, pts[0].y);
                for (let i = 1; i < n; i++) {
                    const h = Math.sin(i * 91.3 + (calm ? 0 : Math.floor(t * 20)) * 7.1) * 43758.5;
                    ctx.lineTo(pts[i].x + (h - Math.floor(h) - 0.5) * r * 1.1, pts[i].y);
                }
                ctx.globalAlpha = 0.9;
                Neon.stroke(ctx, color, 1.1, false);
                ctx.globalAlpha = 1;
                ribbon(color, 0.25, 0.25, 0);
                break;
            }
            case 'void':
                ribbon('#aa33ff', 0.62, 0.5, 0);
                ribbon('#05000c', 0.48, 0.95, 0);
                break;
            default: // thrust
                ribbon(color, 0.5, 0.35, 0);
                ribbon('#ffffff', 0.14, 0.5, 0);
        }
    },

    _HEX: Neon.polygon(6, Math.PI / 6),
    _DRONE: [0, -1, 0.7, 0, 0, 1, -0.7, 0],
    _bakeDrone(c) {
        Neon.shape(c, Player._DRONE, 6, '#cc44ff', 0.9, false, 0.3);
        Neon.detail(c, [-0.7, 0, 0.7, 0], 6, '#ee99ff', 0.6, 0.8);
    },

    _bakeShipNeon(c, sc, r, surge) {
        Neon.shape(c, Player._NEON_HULL, r, sc, 1.2, false, 0.2);
        Neon.detail(c, [0, -0.78, 0, 0.3], r, sc, 0.45, 1);
        Neon.detail(c, [0.32, 0.1, 0.82, 0.47], r, sc, 0.6, 1);
        Neon.detail(c, [-0.32, 0.1, -0.82, 0.47], r, sc, 0.6, 1);
        Neon.shape(c, Player._NEON_CANOPY, r, surge ? '#ffffff' : '#aaddff', 0.7, false, 0.4);
    },

    // Neon style ship body (origin already translated to the ship).
    // Banks into horizontal movement by narrowing the hull.
    _drawShipNeon(ctx) {
        const r = this.radius;
        const surge = Scoring.surgeActive;
        const skinColor = Hangar.equipped.skin === 'chromatic'
            ? `hsl(${(this.engineFlicker * 10) % 360}, 100%, 70%)`
            : Hangar.skinColor;
        const sc = surge ? '#ffffff' : skinColor;
        const shipAlpha = Hangar.equipped.skin === 'ghost' ? 0.6 : 1.0;

        const dx = this._neonLastX === null ? 0 : this.x - this._neonLastX;
        this._neonLastX = this.x;
        const target = Math.max(-1, Math.min(1, dx / 5));
        this._neonBank += (target - this._neonBank) * 0.2;
        const bank = this._neonBank;

        ctx.save();
        ctx.globalAlpha = shipAlpha;
        ctx.scale(1 - Math.abs(bank) * 0.18, 1);

        // Engine flames (behind the hull): coloured plume with a white core
        const trailColor = Hangar.trailColor;
        const len = 0.45 + Math.sin(this.engineFlicker) * 0.08 + Math.sin(this.engineFlicker * 2.7) * 0.05;
        for (let s = -1; s <= 1; s += 2) {
            const ex = s * r * 0.22, ey = r * 0.62;
            ctx.fillStyle = trailColor;
            ctx.globalAlpha = shipAlpha * 0.55;
            ctx.beginPath();
            ctx.moveTo(ex - r * 0.12, ey);
            ctx.lineTo(ex, ey + r * (len + 0.25));
            ctx.lineTo(ex + r * 0.12, ey);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.globalAlpha = shipAlpha * 0.9;
            ctx.beginPath();
            ctx.moveTo(ex - r * 0.05, ey);
            ctx.lineTo(ex, ey + r * len);
            ctx.lineTo(ex + r * 0.05, ey);
            ctx.fill();
        }
        ctx.globalAlpha = shipAlpha;

        // Hull, panel lines and canopy (baked per colour; the chromatic
        // skin changes colour every frame, so it is drawn live)
        const key = Hangar.equipped.skin === 'chromatic' && !surge ? null : 'player|' + sc;
        Neon.sprite(ctx, key, r * 1.25 + 4, this._bakeShipNeon, sc, r, surge);
        // The wing on the side we're banking towards catches more light
        if (Math.abs(bank) > 0.05) {
            const side = bank > 0 ? 1 : -1;
            ctx.globalAlpha = shipAlpha * Math.min(1, Math.abs(bank)) * 0.25;
            ctx.fillStyle = sc;
            Neon.path(ctx, [side * 0.3, -0.05, side * 0.95, 0.45, side * 0.9, 0.62, side * 0.45, 0.48], r, true);
            ctx.fill();
            ctx.globalAlpha = shipAlpha;
        }

        // Wing-tip running lights, blinking out of step
        const blink = Math.sin(this.engineFlicker * 0.5);
        Neon.light(ctx, r * 0.9, r * 0.52, 1.4, sc, blink > 0 ? 1 : 0.35);
        Neon.light(ctx, -r * 0.9, r * 0.52, 1.4, sc, blink > 0 ? 0.35 : 1);

        ctx.restore();
    },

    draw(ctx) {
        // Dead: the shattered hull is drawn by Particles; still draw bullets
        if (!this.alive && this.deathAnimTimer > 0) {
            this.bullets.draw(ctx);
            return;
        }

        if (!this.alive) return;

        // Blink when invincible
        if (this.invincible && !this.dashing && Math.floor(this.invincibleTimer * 10) % 2 === 0) return;

        const focusing = GameConfig.focus.enabled && Input.isHeld('focus');

        // Engine trail streams down behind the ship (the world scrolls past)
        // and bends as it moves; its look comes from the equipped trail
        const trail = this.trailPositions;
        if (trail.length > 1) {
            const pts = trail.map((p, i) => ({ x: p.x, y: p.y + this.radius * 0.7 + i * 7 }));
            this.drawTrail(ctx, pts, this.dashing ? 'thrust' : Hangar.equipped.trail,
                this.dashing ? '#ffffff' : Hangar.trailColor, this.radius, this.engineFlicker / 20);
        }

        // Drones: small spinning neon diamonds with a hot core
        if (this.droneLevel > 0) {
            const spin = this.engineFlicker * 0.2;
            for (const d of this.dronePositions()) {
                ctx.save();
                ctx.translate(d.x, d.y);
                ctx.rotate(spin);
                Neon.sprite(ctx, 'drone', 10, this._bakeDrone);
                ctx.restore();
                Neon.light(ctx, d.x, d.y, 1.6, '#cc44ff', 0.7 + Math.sin(this.engineFlicker * 0.4) * 0.3);
            }
            // Shield pulse ring (Lv2+) — shown while a pulse is cancelling bullets
            if (this.shieldPulseFlash > 0) {
                const r = this.droneLevel >= 5 ? 55 : 45;
                ctx.globalAlpha = Math.min(1, 0.3 + this.shieldPulseFlash * 2.5);
                Neon.ring(ctx, this.x, this.y, r * (1 - this.shieldPulseFlash), '#cc44ff', this.droneLevel >= 4 ? 1.4 : 1, false);
                ctx.globalAlpha = 1;
            }
        }

        ctx.save();
        ctx.translate(this.x, this.y);

        // GPU glow behind player — engine glow + surge glow
        Renderer.addGlow(this.x, this.y, Renderer.colorToHex(Hangar.trailColor), this.radius * 4, 0.45);
        if (Scoring.surgeActive) {
            Renderer.addGlow(this.x, this.y, 0xffffff, this.radius * 6, Renderer.calm() ? 0.2 : 0.5);
            // Surge aura: counter-rotating arcs
            const a0 = this.engineFlicker * 0.15;
            ctx.globalAlpha = 0.7;
            for (let k = 0; k < 3; k++) {
                const a = a0 + (Math.PI * 2 / 3) * k;
                ctx.beginPath(); ctx.arc(0, 0, this.radius + 11, a, a + 1.3);
                Neon.stroke(ctx, '#ffffff', 0.8, false);
                ctx.beginPath(); ctx.arc(0, 0, this.radius + 16, -a, -a + 0.8);
                Neon.stroke(ctx, '#00ffff', 0.6, false);
            }
            ctx.globalAlpha = 1;
        }

        // Shield: a hexagonal barrier that brightens when it takes a hit
        if (this.maxShieldHp > 0 && this.shieldHp > 0) {
            const hit = this.shieldFlashTimer > 0;
            ctx.globalAlpha = hit ? 0.9 : 0.35 + Math.sin(this.engineFlicker * 0.3) * 0.1;
            ctx.save();
            ctx.rotate(this.engineFlicker * 0.03);
            Neon.path(ctx, this._HEX, this.radius + 7, true);
            Neon.stroke(ctx, hit ? '#ffffff' : '#4488ff', 0.8, false);
            ctx.restore();
            ctx.globalAlpha = 1;
        }

        // While the shield holds, an energy outline hugs the hull (white on a hit)
        const shielded = this.maxShieldHp > 0 && this.shieldHp > 0;
        Neon.filtered(ctx, shielded ? Renderer.shieldGlow(this.shieldFlashTimer > 0) : null, () => this._drawShipNeon(ctx));

        // Focus mode hitbox indicator (or always if setting enabled)
        if (focusing || Settings.values.showHitbox) {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(0, 0, this.hitboxRadius + 1, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 0.9;
            Neon.ring(ctx, 0, 0, this.hitboxRadius + 2.5, '#ff2266', 0.6, false);
            ctx.globalAlpha = 1;
            // Graze zone indicator
            if (GameConfig.graze.enabled) {
                const gz = this.grazeRadius * (GameConfig.graze.zoneMultiplier || 1);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 5]);
                ctx.beginPath();
                ctx.arc(0, 0, gz, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }

        ctx.restore();

        // Draw player bullets
        this.bullets.draw(ctx);

        // Bomb: two expanding neon rings with a brief cyan wash (no wash with Flash Reduction)
        if (this.bombActive) {
            const k = this.bombTimer / 1.5;
            const calm = Renderer.calm();
            const ringR = (1.5 - this.bombTimer) * 400;
            if (!calm) {
                Renderer.addGlow(this.x, this.y, 0x00ffff, 400 * k, k * 0.7);
                ctx.fillStyle = `rgba(0, 255, 255, ${k * 0.06})`;
                ctx.fillRect(0, 0, PLAY_W, PLAY_H);
            }
            ctx.globalAlpha = k * (calm ? 0.4 : 1);
            ctx.beginPath(); ctx.arc(this.x, this.y, ringR, 0, Math.PI * 2);
            Neon.stroke(ctx, '#00ffff', 2.2, false);
            ctx.beginPath(); ctx.arc(this.x, this.y, ringR * 0.6, 0, Math.PI * 2);
            Neon.stroke(ctx, '#88ffff', 1, false);
            ctx.globalAlpha = 1;
        }
    }
};
