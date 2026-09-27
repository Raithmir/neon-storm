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
                    Particles.spawn(b.x, b.y, 3, { color: '#00ffff', speed: 50, life: 0.1 });
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
                    Particles.spawn(b.x, b.y, 3, { color: '#00ffff', speed: 50, life: 0.1 });
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
            if (baseHp <= 3) {
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
            ctx.fillStyle = '#cc44ff';
            for (const d of this.dronePositions()) {
                ctx.beginPath();
                ctx.arc(d.x, d.y, 5, 0, Math.PI * 2);
                ctx.fill();
            }
            // Shield pulse ring (Lv2+) — shown while a pulse is cancelling bullets
            if (this.shieldPulseFlash > 0) {
                const r = this.droneLevel >= 5 ? 55 : 45;
                ctx.strokeStyle = `rgba(204, 68, 255, ${0.3 + this.shieldPulseFlash * 1.6})`;
                ctx.lineWidth = this.droneLevel >= 4 ? 3 : 2;
                ctx.beginPath();
                ctx.arc(this.x, this.y, r * (1 - this.shieldPulseFlash), 0, Math.PI * 2);
                ctx.stroke();
            }
        }

        ctx.save();
        ctx.translate(this.x, this.y);

        // GPU glow behind player — engine glow + surge glow
        Renderer.addGlow(this.x, this.y, Renderer.colorToHex(Hangar.trailColor), this.radius * 4, 0.45);
        if (Scoring.surgeActive) {
            Renderer.addGlow(this.x, this.y, 0xffffff, this.radius * 6, 0.5);
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
            Renderer.addGlow(this.x, this.y, 0x00ffff, 400 * bombAlpha, bombAlpha * 0.7);
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
