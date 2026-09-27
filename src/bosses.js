// ============================================================
//  BOSS TYPE DEFINITIONS
// ============================================================
const BossTypes = {
    architect: {
        name: 'THE ARCHITECT', phases: 3, phaseHps: [200, 260, 300],
        hasArmor: true, armorCount: 4, armorHp: 40,
        colors: ['#ff4444', '#ff00ff', '#ff0040']
    },
    furnace: {
        name: 'THE FURNACE', phases: 2, phaseHps: [460, 540],
        hasArmor: false,
        colors: ['#ff6600', '#ff2200']
    },
    leviathan: {
        name: 'THE LEVIATHAN', phases: 3, phaseHps: [340, 380, 380],
        hasArmor: false,
        colors: ['#4488ff', '#00ffaa', '#ff44ff']
    },
    interceptor_duo: {
        name: 'INTERCEPTOR DUO', phases: 2, phaseHps: [300, 400], // fast-moving (low uptime): lower HP
        hasArmor: false,
        colors: ['#ffaa00', '#ff4400']
    },
    nexus: {
        name: 'THE NEXUS', phases: 3, phaseHps: [300, 380, 460],
        hasArmor: true, armorCount: 6, armorHp: 32,
        colors: ['#cc44ff', '#ff00ff', '#ffffff']
    },
    echo: {
        name: 'THE ECHO', phases: 3, phaseHps: [420, 490, 560],
        hasArmor: false,
        colors: ['#00ffff', '#ff00ff', '#ffffff']
    }
};


// Boss tuning (all bosses)
const BOSS_PHASE_TIME_LIMIT = 45;   // seconds; phase ends without its bonus (Touhou-style timeout)
const BOSS_ARMOR_ORBIT = 40;        // armor segments orbit the core at this radius
const BOSS_ARMOR_RADIUS = 16;
const BOSS_ARMORED_CORE_DAMAGE = 0.5;  // core damage multiplier while armor is up


// ============================================================
//  BOSS SYSTEM
// ============================================================
const Boss = {
    active: false,
    x: PLAY_W / 2,
    y: -100,
    phase: 0,
    hp: 0,
    maxHp: 0,
    phaseHps: [80, 120, 160],
    armor: [],
    attackTimer: 0,
    moveTimer: 0,
    patternIndex: 0,
    phaseTransitionTimer: 0,
    flashTimer: 0,
    entered: false,
    defeated: false,
    defeatTimer: 0,
    radius: 50,
    warningTimer: 0,
    bossType: 'architect',
    bossName: 'THE ARCHITECT',
    totalPhases: 3,
    colors: ['#ff4444', '#ff00ff', '#ff0040'],

    // Bullet count for a pattern at the current density (never fewer than 3)
    _n(base, density) {
        return Math.max(3, Math.round(base * density));
    },

    init(bossType) {
        bossType = bossType || 'architect';
        const def = BossTypes[bossType] || BossTypes.architect;
        this.bossType = bossType;
        this.bossName = def.name;
        this.totalPhases = def.phases;
        this.phaseHps = [...def.phaseHps];
        this.colors = [...def.colors];
        this.active = true;
        this.x = PLAY_W / 2;
        this.y = -100;
        this.phase = 1;
        this.hp = this.phaseHps[0];
        this.maxHp = this.phaseHps[0];
        this.entered = false;
        this.defeated = false;
        this.defeatTimer = 0;
        this.attackTimer = 2;
        this.moveTimer = 0;
        this.patternIndex = 0;
        this.flashTimer = 0;
        this.warningTimer = 3;
        this.phaseTime = 0;
        this.phaseTransitionTimer = 0;
        this.timedOut = false;
        // Armor segments
        this.armor = [];
        if (def.hasArmor) {
            const count = def.armorCount || 4;
            for (let i = 0; i < count; i++) {
                this.armor.push({ hp: def.armorHp || 15, angle: (Math.PI * 2 / count) * i, alive: true });
            }
        }
    },

    update(dt, playerX, playerY) {
        if (!this.active) return;

        // Warning phase
        if (this.warningTimer > 0) {
            this.warningTimer -= dt;
            return;
        }

        // Entry animation
        if (!this.entered) {
            this.y += 80 * dt;
            if (this.y >= 120) {
                this.y = 120;
                this.entered = true;
                Renderer.triggerGodray(2.5);
            }
            return;
        }

        // Defeat sequence — multi-stage dramatic explosion
        if (this.defeated) {
            this.defeatTimer += dt;

            // Stage 1 (0-1.5s): Internal explosions, increasing frequency
            if (this.defeatTimer < 1.5) {
                const freq = 0.3 - this.defeatTimer * 0.12;
                if (this.defeatTimer % Math.max(0.08, freq) < dt) {
                    const rx = this.x + (Math.random() - 0.5) * 80;
                    const ry = this.y + (Math.random() - 0.5) * 80;
                    const col = this.colors[Math.floor(Math.random() * this.colors.length)] || '#ff8800';
                    Particles.spawnExplosion(rx, ry, { style: 'small', color: col, color2: '#ffffff' });
                    Audio.playExplosionSmall();
                    ScreenShake.trigger(3 + this.defeatTimer * 3, 0.15);
                }
            }

            // Stage 2 (1.5-2.5s): Boss breaks apart, large ring explosions
            if (this.defeatTimer >= 1.5 && this.defeatTimer < 2.5) {
                if (this.defeatTimer % 0.2 < dt) {
                    const ringCount = 16;
                    const dist = (this.defeatTimer - 1.5) * 150;
                    for (let j = 0; j < ringCount; j++) {
                        const a = (Math.PI * 2 / ringCount) * j + this.defeatTimer * 2;
                        Particles.spawnExplosion(
                            this.x + Math.cos(a) * dist,
                            this.y + Math.sin(a) * dist,
                            { style: 'small', color: this.colors[j % this.colors.length] || '#ffffff', color2: '#ffffff' }
                        );
                    }
                    Audio.playExplosionSmall();
                    ScreenShake.trigger(8, 0.2);
                }
            }

            // Stage 3 (2.5-3.5s): Boss-specific mega final effect
            if (this.defeatTimer >= 2.5 && this.defeatTimer < 3.5) {
                if (this.defeatTimer - dt < 2.5) {
                    // The hull shatters and stops being drawn
                    const col = this.colors[this.phase - 1] || '#ffffff';
                    for (const o of this.outlines()) Particles.shatter(this.x + o.ox, this.y, o.pts, o.scale, 0, col, 2.2);
                    Audio.playExplosionLarge();
                    ScreenShake.trigger(20, 1.0);
                    Renderer.triggerFlash(0xffffff, 0.7);
                    Renderer.triggerChroma(0.025, 0.8);

                    switch (this.bossType) {
                        case 'furnace':
                            Particles.spawnExplosion(this.x, this.y, { style: 'mega', color: '#ff4400', color2: '#ffaa00' });
                            Particles.spawnExplosion(this.x + 30, this.y - 20, { style: 'large', color: '#ffaa00', color2: '#ffffff' });
                            break;
                        case 'leviathan':
                            for (let j = 0; j < 6; j++) {
                                const a = (Math.PI * 2 / 6) * j;
                                const d = 50 + Math.random() * 40;
                                Particles.spawnExplosion(this.x + Math.cos(a) * d, this.y + Math.sin(a) * d,
                                    { style: 'large', color: '#00ffaa', color2: '#ffffff' });
                            }
                            break;
                        case 'interceptor_duo':
                            Particles.spawnExplosion(this.x - 50, this.y, { style: 'large', color: '#ffaa00', color2: '#ffffff' });
                            Particles.spawnExplosion(this.x + 50, this.y, { style: 'large', color: '#ff4400', color2: '#ffffff' });
                            Particles.spawnExplosion(this.x, this.y, { style: 'medium', color: '#ffffff', color2: '#ffff00' });
                            break;
                        case 'nexus':
                            Particles.spawnExplosion(this.x, this.y, { style: 'mega', color: '#cc44ff', color2: '#ffffff' });
                            Particles.spawnShockwave(this.x, this.y, '#cc44ff', 200, 0.6);
                            break;
                        case 'echo': {
                            const echoCols = ['#00ffff', '#ff00ff', '#ffffff'];
                            for (let j = 0; j < 5; j++) {
                                const ox = (Math.random() - 0.5) * 120;
                                const oy = (Math.random() - 0.5) * 120;
                                Particles.spawnExplosion(this.x + ox, this.y + oy,
                                    { style: 'medium', color: echoCols[j % 3], color2: '#ffffff' });
                            }
                            Particles.spawnExplosion(this.x, this.y, { style: 'mega', color: '#ff00ff', color2: '#00ffff' });
                            break;
                        }
                        default: // architect
                            Particles.spawnExplosion(this.x, this.y, { style: 'mega', color: '#ff00ff', color2: '#ffffff' });
                            Particles.spawnExplosion(this.x, this.y + 20, { style: 'large', color: '#ffffff', color2: '#ff00ff' });
                            break;
                    }
                }
            }

            // Final cleanup
            if (this.defeatTimer > 3.5) {
                this.active = false;
                if (!this.timedOut) Scoring.score += Math.floor(25000 * GameConfig.scoreMultiplier);
                Enemies.enemyBullets.clear();
                Scoring.spawnPopup('BOSS DEFEATED!', '#ffff00', 30);
            }
            return;
        }

        this.moveTimer += dt;
        this.flashTimer = Math.max(0, this.flashTimer - dt);
        if (this.phaseTransitionTimer > 0) {
            this.phaseTransitionTimer -= dt;
            // Flash during transition
            this.flashTimer = 0.1;
            this._updateMovement(dt, playerX);
            return; // Skip attacks during transition
        }

        // Phase timeout: the phase ends without its bonus, so fights can't stall
        this.phaseTime += dt;
        if (this.phaseTime >= BOSS_PHASE_TIME_LIMIT) {
            this._phaseTimeout();
            return;
        }
        this.attackTimer -= dt;

        // Movement
        this._updateMovement(dt, playerX);

        // Attack patterns
        if (this.attackTimer <= 0) {
            this._attack(playerX, playerY);
        }
    },

    _updateMovement(dt, playerX) {
        switch (this.bossType) {
            case 'furnace':
                // Heavy, slow, deliberate — stays high, slight tracking
                if (this.phase === 1) {
                    this.x += Math.sin(this.moveTimer * 0.4) * 30 * dt;
                    this.y = 100 + Math.sin(this.moveTimer * 0.3) * 10;
                } else {
                    // Phase 2: breaks free, charges horizontally
                    this.x += Math.sin(this.moveTimer * 1.5) * 100 * dt;
                    this.y = 90 + Math.sin(this.moveTimer * 0.8) * 40;
                    // Occasional charge toward player X
                    if (Math.sin(this.moveTimer * 0.7) > 0.9) {
                        this.x += (playerX - this.x) * 1.5 * dt;
                    }
                }
                break;

            case 'leviathan':
                // Organic, flowing, unpredictable drifting
                if (this.phase === 1) {
                    // Drifts among debris
                    this.x += Math.sin(this.moveTimer * 0.6) * 50 * dt;
                    this.y = 110 + Math.sin(this.moveTimer * 0.4 + 1.5) * 25;
                } else if (this.phase === 2) {
                    // Revealed — wider sweeps
                    this.x += Math.sin(this.moveTimer * 1.0) * 80 * dt;
                    this.y = 100 + Math.sin(this.moveTimer * 0.7) * 35;
                } else {
                    // Charging — lunges toward player then retreats
                    const lungePhase = Math.sin(this.moveTimer * 1.2);
                    if (lungePhase > 0.5) {
                        this.x += (playerX - this.x) * 2.0 * dt;
                        this.y += (200 - this.y) * 1.5 * dt;
                    } else {
                        this.x += Math.sin(this.moveTimer * 2) * 100 * dt;
                        this.y += (80 - this.y) * 1.0 * dt;
                    }
                }
                break;

            case 'interceptor_duo':
                // Fast, darting, strafing runs
                if (this.phase === 1) {
                    // Quick side-to-side strafing
                    this.x += Math.sin(this.moveTimer * 2.0) * 150 * dt;
                    this.y = 90 + Math.sin(this.moveTimer * 3.0) * 20;
                } else {
                    // Combined form — circles and dashes
                    this.x = PLAY_W / 2 + Math.sin(this.moveTimer * 1.5) * 180;
                    this.y = 110 + Math.cos(this.moveTimer * 1.0) * 50;
                }
                break;

            case 'nexus':
                // Pulsing, central, slowly rotating position
                if (this.phase <= 2) {
                    // Stays central with slow orbit
                    this.x = PLAY_W / 2 + Math.sin(this.moveTimer * 0.5) * 60;
                    this.y = 120 + Math.sin(this.moveTimer * 0.4) * 20;
                } else {
                    // Endurance — erratic pulses outward and back
                    this.x = PLAY_W / 2 + Math.sin(this.moveTimer * 1.5) * 120 * Math.sin(this.moveTimer * 0.3);
                    this.y = 110 + Math.sin(this.moveTimer * 2.0) * 50;
                }
                break;

            case 'echo':
                // Mirrors player position with delay — inverse Y
                if (this.phase === 1) {
                    // Delayed mirror of player X, stays at top
                    this.x += (playerX - this.x) * 0.8 * dt;
                    this.y = 100 + Math.sin(this.moveTimer * 1.0) * 15;
                } else if (this.phase === 2) {
                    // Inverse mirror — moves opposite to player
                    const mirrorX = PLAY_W - playerX;
                    this.x += (mirrorX - this.x) * 1.0 * dt;
                    this.y = 100 + Math.sin(this.moveTimer * 1.5) * 30;
                } else {
                    // Erratic — alternates between mirroring and inverse
                    const mirror = Math.sin(this.moveTimer * 0.5) > 0;
                    const targetX = mirror ? playerX : PLAY_W - playerX;
                    this.x += (targetX - this.x) * 1.5 * dt;
                    this.y = 90 + Math.sin(this.moveTimer * 2.0) * 50;
                }
                break;

            default: // architect
                switch (this.phase) {
                    case 1:
                        this.x += Math.sin(this.moveTimer * 0.8) * 40 * dt;
                        break;
                    case 2:
                        this.x += (playerX - this.x) * 0.5 * dt;
                        this.y = 100 + Math.sin(this.moveTimer * 1.2) * 30;
                        break;
                    case 3:
                        this.x += Math.sin(this.moveTimer * 2.5) * 120 * dt;
                        this.y = 100 + Math.sin(this.moveTimer * 1.8) * 40;
                        break;
                }
                break;
        }
        this.x = Math.max(60, Math.min(PLAY_W - 60, this.x));
        this.y = Math.max(50, Math.min(PLAY_H * 0.4, this.y));
    },

    _attack(playerX, playerY) {
        const angle = Math.atan2(playerY - this.y, playerX - this.x);
        const density = GameConfig.bulletDensity;
        const bs = 160;

        // Boss-type-specific attack dispatch
        switch (this.bossType) {
            case 'furnace':
                this._furnaceAttack(angle, bs, density);
                break;
            case 'leviathan':
                this._leviathanAttack(angle, bs, density);
                break;
            case 'interceptor_duo':
                this._duoAttack(angle, bs, density);
                break;
            case 'nexus':
                this._nexusAttack(angle, bs, density);
                break;
            case 'echo':
                this._echoAttack(angle, bs, density, playerX, playerY);
                break;
            default: // architect
                switch (this.phase) {
                    case 1: this._phase1Attack(angle, bs, density); break;
                    case 2: this._phase2Attack(angle, bs, density); break;
                    case 3: this._phase3Attack(angle, bs, density); break;
                }
        }
        this.patternIndex++;
    },

    // === FURNACE (Level 2) — heavy artillery, sweeping fire ===
    _furnaceAttack(angle, bs, density) {
        const pattern = this.patternIndex % (this.phase === 1 ? 3 : 4);
        if (this.phase === 1) {
            switch (pattern) {
                case 0: // Wide horizontal barrage
                    const wallN = this._n(15, density);
                    for (let j = 0; j < wallN; j++) {
                        const x = 10 + ((PLAY_W - 20) / (wallN - 1)) * j; // always spans the screen
                        Enemies.enemyBullets.spawn(x, this.y + 40, 0, bs * 0.7, { color: '#ff6600', radius: 3 });
                    }
                    this.attackTimer = 1.2; break;
                case 1: // Aimed triple cannon
                    for (let j = -1; j <= 1; j++) {
                        const a = angle + j * 0.25;
                        Enemies.enemyBullets.spawn(this.x, this.y + this.radius * 0.9, Math.cos(a) * bs * 1.2, Math.sin(a) * bs * 1.2, { color: '#ff4400', radius: 5 });
                    }
                    this.attackTimer = 0.8; break;
                case 2: // Flame spread (wide cone downward)
                    const flameN = this._n(10, density);
                    for (let j = 0; j < flameN; j++) {
                        const a = Math.PI / 2 + (j / (flameN - 1) - 0.5) * 1.1; // centred cone
                        Enemies.enemyBullets.spawn(this.x, this.y + this.radius * 0.9, Math.cos(a) * bs * 0.8, Math.sin(a) * bs * 0.8, { color: '#ff2200', radius: 3, life: 2 });
                    }
                    this.attackTimer = 1.5; break;
            }
        } else {
            switch (pattern) {
                case 0: // Charge slam — bullet burst
                    for (let j = 0; j < this._n(20, density); j++) {
                        const a = (Math.PI * 2 / this._n(20, density)) * j;
                        Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs, Math.sin(a) * bs, { color: '#ff4400', radius: 4 });
                    }
                    this.attackTimer = 0.9; break;
                case 1: // Sweeping laser line
                    for (let j = 0; j < 10; j++) {
                        const bx = this.x + Math.cos(this.moveTimer * 2) * (j * 20);
                        Enemies.enemyBullets.spawn(bx, this.y + 30, 0, bs * 0.6, { color: '#ff6600', radius: 3, life: 1.5 });
                    }
                    this.attackTimer = 0.6; break;
                case 2: // Aimed shotgun
                    for (let j = -3; j <= 3; j++) {
                        const a = angle + j * 0.1;
                        const spd = bs * (0.8 + Math.random() * 0.4);
                        Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * spd, Math.sin(a) * spd, { color: '#ff2200', radius: 3 });
                    }
                    this.attackTimer = 0.7; break;
                case 3: // Spawn bombers
                    Enemies.spawn('bomber', this.x - 40, this.y + 20, 'straight_down');
                    Enemies.spawn('bomber', this.x + 40, this.y + 20, 'straight_down');
                    this.attackTimer = 3.0; break;
            }
        }
    },

    // === LEVIATHAN (Level 3) — organic, tentacle sweeps, asteroid throws ===
    _leviathanAttack(angle, bs, density) {
        const pattern = this.patternIndex % 3;
        switch (this.phase) {
            case 1: // Hidden among debris
                switch (pattern) {
                    case 0: // Tentacle sweep (arc of bullets)
                        for (let j = 0, tn = this._n(12, density); j < tn; j++) {
                            const a = angle - 0.6 + (1.2 / (tn - 1)) * j;
                            Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs * 0.8, Math.sin(a) * bs * 0.8, { color: '#00ffaa', radius: 3 });
                        }
                        this.attackTimer = 1.3; break;
                    case 1: // Aimed organic shots
                        for (let j = 0; j < 4; j++) {
                            const a = angle + (Math.random() - 0.5) * 0.5;
                            Enemies.enemyBullets.spawn(this.x + (Math.random() - 0.5) * 40, this.y, Math.cos(a) * bs, Math.sin(a) * bs, { color: '#4488ff', radius: 4 });
                        }
                        this.attackTimer = 1.0; break;
                    case 2: // Asteroid spawn
                        if (Asteroids.active) {
                            for (let j = 0; j < 3; j++) {
                                Asteroids.list.push({ x: this.x + (j - 1) * 30, y: this.y + 30, vx: (Math.random() - 0.5) * 50, vy: 100 + Math.random() * 60, radius: 12 + Math.random() * 8, hp: 2, destructible: true, rotation: 0, rotSpeed: 2 });
                            }
                        }
                        this.attackTimer = 2.0; break;
                }
                break;
            case 2: // Revealed — spiral + tentacles
                switch (pattern) {
                    case 0: // Double spiral
                        for (let j = 0; j < this._n(16, density); j++) {
                            const a = (Math.PI * 2 / this._n(16, density)) * j + this.moveTimer * 2;
                            Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs, Math.sin(a) * bs, { color: '#00ffaa', radius: 3 });
                            Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a + Math.PI) * bs * 0.7, Math.sin(a + Math.PI) * bs * 0.7, { color: '#4488ff', radius: 3 });
                        }
                        this.attackTimer = 0.8; break;
                    case 1: // Tentacle sweep (reuse phase 1 pattern)
                        for (let j = 0, tn = this._n(12, density); j < tn; j++) {
                            const a = angle - 0.6 + (1.2 / (tn - 1)) * j;
                            Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs * 0.8, Math.sin(a) * bs * 0.8, { color: '#00ffaa', radius: 3 });
                        }
                        this.attackTimer = 1.0; break;
                    case 2: // Ring burst
                        const count = this._n(20, density);
                        for (let j = 0; j < count; j++) {
                            const a = (Math.PI * 2 / count) * j;
                            Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs * 0.6, Math.sin(a) * bs * 0.6, { color: '#00ffaa', radius: 4 });
                        }
                        this.attackTimer = 1.0; break;
                }
                break;
            case 3: // Charging — fast and aggressive
                switch (pattern) {
                    case 0: for (let j = 0; j < this._n(24, density); j++) { const a = (Math.PI * 2 / this._n(24, density)) * j + this.moveTimer * 3; Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs * 1.1, Math.sin(a) * bs * 1.1, { color: '#00ffaa', radius: 3 }); } this.attackTimer = 0.5; break;
                    case 1: for (let j = -4; j <= 4; j++) { Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(angle + j * 0.12) * bs * 1.3, Math.sin(angle + j * 0.12) * bs * 1.3, { color: '#4488ff', radius: 4 }); } this.attackTimer = 0.6; break;
                    case 2: for (let j = 0; j < this._n(12, density); j++) { const a = Math.random() * Math.PI * 2; Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * (80 + Math.random() * bs), Math.sin(a) * (80 + Math.random() * bs), { color: '#00ffaa', radius: 3 }); } this.attackTimer = 0.7; break;
                }
                break;
        }
    },

    // === INTERCEPTOR DUO (Level 4) — twin alternating attacks ===
    _duoAttack(angle, bs, density) {
        const pattern = this.patternIndex % 4;
        const side = this.patternIndex % 2 === 0 ? -1 : 1;
        const ox = side * 60;
        if (this.phase === 1) {
            switch (pattern) {
                case 0: case 2: // Alternating aimed fans from each side
                    for (let j = -2; j <= 2; j++) {
                        const a = angle + j * 0.15;
                        Enemies.enemyBullets.spawn(this.x + ox, this.y + this.radius * 0.5, Math.cos(a) * bs * 1.1, Math.sin(a) * bs * 1.1, { color: '#ffaa00', radius: 3 });
                    }
                    this.attackTimer = 0.7; break;
                case 1: // Cross streams
                    for (let j = 0; j < 6; j++) {
                        Enemies.enemyBullets.spawn(this.x - 60, this.y, Math.cos(0.8 + j * 0.1) * bs, Math.sin(0.8 + j * 0.1) * bs, { color: '#ffaa00', radius: 3 });
                        Enemies.enemyBullets.spawn(this.x + 60, this.y, Math.cos(Math.PI - 0.8 - j * 0.1) * bs, Math.sin(Math.PI - 0.8 - j * 0.1) * bs, { color: '#ff4400', radius: 3 });
                    }
                    this.attackTimer = 1.2; break;
                case 3: // Ring from center
                    const c = this._n(12, density);
                    for (let j = 0; j < c; j++) { const a = (Math.PI * 2 / c) * j; Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs * 0.7, Math.sin(a) * bs * 0.7, { color: '#ff6600', radius: 3 }); }
                    this.attackTimer = 1.5; break;
            }
        } else { // Combined form — overlapping patterns
            switch (pattern) {
                case 0: // Double spiral
                    for (let j = 0; j < this._n(20, density); j++) { const a = (Math.PI * 2 / this._n(20, density)) * j + this.moveTimer * 2.5; Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs, Math.sin(a) * bs, { color: '#ffaa00', radius: 3 }); Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a + 0.3) * bs * 0.8, Math.sin(a + 0.3) * bs * 0.8, { color: '#ff4400', radius: 3 }); }
                    this.attackTimer = 0.7; break;
                case 1: // Wide shotgun
                    for (let j = -5; j <= 5; j++) { const a = angle + j * 0.1; Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs * 1.2, Math.sin(a) * bs * 1.2, { color: '#ff6600', radius: 4 }); }
                    this.attackTimer = 0.8; break;
                case 2: // Spawn drones
                    for (let j = 0; j < 4; j++) Enemies.spawn('scout_drone', this.x + (j - 1.5) * 30, this.y + 20, 'straight_down');
                    this.attackTimer = 2.5; break;
                case 3: // Burst rings
                    for (let ring = 0; ring < 2; ring++) { const c = this._n(14 + ring * 6, density); for (let j = 0; j < c; j++) { const a = (Math.PI * 2 / c) * j + ring * 0.15; Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs * (0.6 + ring * 0.3), Math.sin(a) * bs * (0.6 + ring * 0.3), { color: ring === 0 ? '#ffaa00' : '#ff4400', radius: 3 }); } }
                    this.attackTimer = 1.0; break;
            }
        }
    },

    // === NEXUS (Level 5) — remixes previous boss patterns ===
    _nexusAttack(angle, bs, density) {
        const pattern = this.patternIndex % 4;
        switch (this.phase) {
            case 1: // Shielded — controlled patterns
                switch (pattern) {
                    case 0: for (let j = 0; j < this._n(16, density); j++) { const a = (Math.PI * 2 / this._n(16, density)) * j; Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs * 0.7, Math.sin(a) * bs * 0.7, { color: '#cc44ff', radius: 4 }); } this.attackTimer = 1.2; break;
                    case 1: for (let j = -3; j <= 3; j++) { Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(angle + j * 0.15) * bs * 1.1, Math.sin(angle + j * 0.15) * bs * 1.1, { color: '#ff00ff', radius: 3 }); } this.attackTimer = 0.8; break;
                    case 2: Enemies.spawn('phase_shifter', this.x, this.y + 30, 'hover'); this.attackTimer = 3.0; break;
                    case 3: // Horizontal wall with gaps
                        for (let j = 0, wn = this._n(18, density); j < wn; j++) { if (j % 4 === Math.floor(this.moveTimer) % 4) continue; const x = 10 + ((PLAY_W - 20) / (wn - 1)) * j; Enemies.enemyBullets.spawn(x, this.y + 30, 0, bs * 0.5, { color: '#cc44ff', radius: 3 }); }
                        this.attackTimer = 1.0; break;
                }
                break;
            case 2: // Pattern remix — uses attacks inspired by previous bosses
                switch (pattern) {
                    case 0: this._furnaceAttack(angle, bs * 0.9, density); break;
                    case 1: this._leviathanAttack(angle, bs * 0.9, density); break;
                    case 2: this._duoAttack(angle, bs * 0.9, density); break;
                    case 3: for (let j = 0; j < this._n(20, density); j++) { const a = (Math.PI * 2 / this._n(20, density)) * j + this.moveTimer * 2; Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs, Math.sin(a) * bs, { color: '#ff00ff', radius: 3 }); } this.attackTimer = 0.6; break;
                }
                break;
            case 3: // Endurance — everything at max
                switch (pattern) {
                    case 0: // Triple spiral
                        for (let s = 0; s < 3; s++) { for (let j = 0; j < this._n(10, density); j++) { const a = (Math.PI * 2 / this._n(10, density)) * j + this.moveTimer * 3 + s * (Math.PI * 2 / 3); Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs, Math.sin(a) * bs, { color: ['#ff00ff', '#cc44ff', '#ffffff'][s], radius: 3 }); } }
                        this.attackTimer = 0.4; break;
                    case 1: for (let j = -5; j <= 5; j++) { Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(angle + j * 0.1) * bs * 1.3, Math.sin(angle + j * 0.1) * bs * 1.3, { color: '#ffffff', radius: 4 }); } this.attackTimer = 0.5; break;
                    case 2: for (let j = 0; j < 3; j++) Enemies.spawn('phase_shifter', this.x + (j - 1) * 50, this.y + 30, 'hover'); this.attackTimer = 3.0; break;
                    case 3: // Cross beams
                        for (let arm = 0; arm < 4; arm++) { const ba = this.moveTimer * 1.5 + arm * (Math.PI / 2); for (let j = 0; j < 10; j++) { const bx = this.x + Math.cos(ba) * j * 18; const by = this.y + Math.sin(ba) * j * 18; if (bx > 0 && bx < PLAY_W && by > 0 && by < PLAY_H) Enemies.enemyBullets.spawn(bx, by, 0, 0, { color: '#ff00ff', radius: 4, life: 0.95, harmless: 0.35 }); } }
                        this.attackTimer = 0.5; break;
                }
                break;
        }
    },

    // === ECHO (Level 6) — mirrors player weapon patterns ===
    _echoAttack(angle, bs, density, playerX, playerY) {
        const pattern = this.patternIndex % 3;
        switch (this.phase) {
            case 1: // Mirrors spread
                switch (pattern) {
                    case 0: // Spread shot (like player)
                        for (let j = -3; j <= 3; j++) { const a = angle + j * 0.15; Enemies.enemyBullets.spawn(this.x, this.y + this.radius * 0.8, Math.cos(a) * bs, Math.sin(a) * bs, { color: '#00ffff', radius: 3 }); }
                        this.attackTimer = 0.5; break;
                    case 1: // Homing (slow tracking bullets)
                        for (let j = 0; j < 3; j++) { Enemies.enemyBullets.spawn(this.x + (j - 1) * 20, this.y, Math.cos(angle) * bs * 0.5, Math.sin(angle) * bs * 0.5, { color: '#00ff88', radius: 3, type: 'homing', life: 4, turnRate: 1.5 }); }
                        this.attackTimer = 1.0; break;
                    case 2: // Ring
                        const c = this._n(14, density); for (let j = 0; j < c; j++) { const a = (Math.PI * 2 / c) * j; Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs * 0.7, Math.sin(a) * bs * 0.7, { color: '#00ffff', radius: 3 }); }
                        this.attackTimer = 1.2; break;
                }
                break;
            case 2: // Mirrors laser + adds own patterns
                switch (pattern) {
                    case 0: // Laser beams (vertical lines)
                        for (let j = -1; j <= 1; j++) { for (let k = 0; k < 8; k++) { Enemies.enemyBullets.spawn(this.x + j * 15, this.y + k * 15, 0, bs * 1.5, { color: '#4488ff', radius: 5, life: 0.75, harmless: 0.25 }); } }
                        this.attackTimer = 0.4; break;
                    case 1: // Mirror movement burst
                        for (let j = 0; j < this._n(16, density); j++) { const a = (Math.PI * 2 / this._n(16, density)) * j + this.moveTimer * 2; Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs, Math.sin(a) * bs, { color: '#ff00ff', radius: 3 }); }
                        this.attackTimer = 0.7; break;
                    case 2: // Aimed fan
                        for (let j = -4; j <= 4; j++) { Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(angle + j * 0.12) * bs * 1.2, Math.sin(angle + j * 0.12) * bs * 1.2, { color: '#00ffff', radius: 3 }); }
                        this.attackTimer = 0.6; break;
                }
                break;
            case 3: // All patterns combined, faster
                switch (pattern) {
                    case 0: for (let j = 0; j < this._n(24, density); j++) { const a = (Math.PI * 2 / this._n(24, density)) * j + this.moveTimer * 3; Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs * 1.1, Math.sin(a) * bs * 1.1, { color: '#ffffff', radius: 3 }); } this.attackTimer = 0.4; break;
                    case 1: for (let j = -5; j <= 5; j++) { Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(angle + j * 0.1) * bs * 1.4, Math.sin(angle + j * 0.1) * bs * 1.4, { color: '#00ffff', radius: 4 }); } for (let j = 0; j < 3; j++) { Enemies.enemyBullets.spawn(this.x + (j-1)*20, this.y, Math.cos(angle)*bs*0.5, Math.sin(angle)*bs*0.5, { color:'#00ff88', radius:3, type:'homing', life:3, turnRate:1.5 }); } this.attackTimer = 0.5; break;
                    case 2: for (let j = -1; j <= 1; j++) { for (let k = 0; k < 10; k++) Enemies.enemyBullets.spawn(this.x + j * 20, this.y + k * 12, 0, bs * 1.5, { color: '#4488ff', radius: 5, life: 0.65, harmless: 0.25 }); } this.attackTimer = 0.3; break;
                }
                break;
        }
    },

    _phase1Attack(angle, bs, density) {
        const pattern = this.patternIndex % 3;
        switch (pattern) {
            case 0: // Aimed spread from armor
                for (const seg of this.armor) {
                    if (!seg.alive) continue;
                    const sx = this.x + Math.cos(seg.angle + this.moveTimer) * BOSS_ARMOR_ORBIT;
                    const sy = this.y + Math.sin(seg.angle + this.moveTimer) * BOSS_ARMOR_ORBIT;
                    for (let j = -2; j <= 2; j++) {
                        const a = angle + j * 0.2;
                        Enemies.enemyBullets.spawn(sx, sy, Math.cos(a) * bs, Math.sin(a) * bs, { color: '#ff1493', radius: 3 });
                    }
                }
                this.attackTimer = 1.5;
                break;
            case 1: // Horizontal sweep
                const sweepN = this._n(12, density);
                for (let i = 0; i < sweepN; i++) {
                    const x = 10 + ((PLAY_W - 20) / (sweepN - 1)) * i;
                    Enemies.enemyBullets.spawn(x, this.y + 30, 0, bs * 0.8, { color: '#ff4040', radius: 3 });
                }
                this.attackTimer = 2.0;
                break;
            case 2: // Ring burst
                const count = this._n(16, density);
                for (let j = 0; j < count; j++) {
                    const a = (Math.PI * 2 / count) * j;
                    Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs * 0.7, Math.sin(a) * bs * 0.7, { color: '#ff1493', radius: 3 });
                }
                this.attackTimer = 1.8;
                break;
        }
    },

    _phase2Attack(angle, bs, density) {
        const pattern = this.patternIndex % 4;
        switch (pattern) {
            case 0: // Dense aimed fan
                for (let j = -4; j <= 4; j++) {
                    const a = angle + j * 0.12;
                    Enemies.enemyBullets.spawn(this.x, this.y + this.radius * 0.9, Math.cos(a) * bs * 1.1, Math.sin(a) * bs * 1.1, { color: '#ff00ff', radius: 3 });
                }
                this.attackTimer = 1.0;
                break;
            case 1: // Double ring
                for (let ring = 0; ring < 2; ring++) {
                    const count = this._n(12 + ring * 4, density);
                    const offset = ring * 0.15;
                    for (let j = 0; j < count; j++) {
                        const a = (Math.PI * 2 / count) * j + offset;
                        const spd = bs * (0.6 + ring * 0.3);
                        Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * spd, Math.sin(a) * spd, { color: '#ff1493', radius: 3 });
                    }
                }
                this.attackTimer = 1.5;
                break;
            case 2: // Spawn mini drones
                for (let j = 0; j < 3; j++) {
                    Enemies.spawn('scout_drone', this.x + (j - 1) * 40, this.y + 20, 'straight_down');
                }
                this.attackTimer = 2.5;
                break;
            case 3: // Rotating lasers (simulated with bullet lines)
                for (let arm = 0; arm < 2; arm++) {
                    const baseA = this.moveTimer * 1.5 + arm * Math.PI;
                    for (let j = 0; j < 8; j++) {
                        const dist = 30 + j * 20;
                        const bx = this.x + Math.cos(baseA) * dist;
                        const by = this.y + Math.sin(baseA) * dist;
                        if (bx > 0 && bx < PLAY_W && by > 0 && by < PLAY_H) {
                            Enemies.enemyBullets.spawn(bx, by, 0, 0, { color: '#ff4488', radius: 4, life: 1.15, harmless: 0.35 });
                        }
                    }
                }
                this.attackTimer = 0.8;
                break;
        }
    },

    _phase3Attack(angle, bs, density) {
        const pattern = this.patternIndex % 3;
        switch (pattern) {
            case 0: // Spiral
                const spiralCount = this._n(24, density);
                for (let j = 0; j < spiralCount; j++) {
                    const a = (Math.PI * 2 / spiralCount) * j + this.moveTimer * 3;
                    Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs, Math.sin(a) * bs, { color: '#ff00ff', radius: 3 });
                }
                this.attackTimer = 0.6;
                break;
            case 1: // Rapid aimed + ring combo
                for (let j = -2; j <= 2; j++) {
                    const a = angle + j * 0.15;
                    Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs * 1.3, Math.sin(a) * bs * 1.3, { color: '#ff4040', radius: 4 });
                }
                const ringCount = this._n(10, density);
                for (let j = 0; j < ringCount; j++) {
                    const a = (Math.PI * 2 / ringCount) * j;
                    Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs * 0.5, Math.sin(a) * bs * 0.5, { color: '#ff1493', radius: 3 });
                }
                this.attackTimer = 0.8;
                break;
            case 2: // Charge toward player (telegraphed)
                // Telegraph line
                Particles.spawn(this.x, this.y, 5, { color: '#ff0000', speed: 20, life: 0.5, size: 4 });
                // Bullet burst after charge
                for (let j = 0; j < this._n(20, density); j++) {
                    const a = Math.random() * Math.PI * 2;
                    const spd = 80 + Math.random() * bs;
                    Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * spd, Math.sin(a) * spd, { color: '#ff1493', radius: 3 });
                }
                this.attackTimer = 1.2;
                break;
        }
    },

    // Armor segment positions (they orbit the core)
    armorPositions() {
        return this.armor.map(seg => ({
            seg,
            x: this.x + Math.cos(seg.angle + this.moveTimer) * BOSS_ARMOR_ORBIT,
            y: this.y + Math.sin(seg.angle + this.moveTimer) * BOSS_ARMOR_ORBIT,
        }));
    },

    // Player bullet vs boss. Armor segments are real hit zones: a bullet that touches an
    // intact segment damages it; one that reaches the core while armor is up does reduced damage.
    // Returns true if the bullet was absorbed.
    hitTest(b) {
        if (this.phase === 1 && this.armor.some(seg => seg.alive)) {
            for (const p of this.armorPositions()) {
                if (!p.seg.alive) continue;
                const dx = b.x - p.x, dy = b.y - p.y;
                const r = b.radius + BOSS_ARMOR_RADIUS;
                if (dx * dx + dy * dy < r * r) {
                    this._damageArmor(p.seg, b.damage);
                    return true;
                }
            }
        }
        const dx = b.x - this.x, dy = b.y - this.y;
        if (dx * dx + dy * dy < (b.radius + this.radius) * (b.radius + this.radius)) {
            this.hit(b.damage);
            return true;
        }
        return false;
    },

    _damageArmor(seg, damage) {
        seg.hp -= damage;
        this.flashTimer = 0.06;
        if (seg.hp <= 0 && seg.alive) {
            seg.alive = false;
            Particles.spawn(
                this.x + Math.cos(seg.angle + this.moveTimer) * BOSS_ARMOR_ORBIT,
                this.y + Math.sin(seg.angle + this.moveTimer) * BOSS_ARMOR_ORBIT,
                20, { color: '#ff8800', speed: 150, life: 0.5 }
            );
            Scoring.score += Math.floor(1500 * GameConfig.scoreMultiplier);
            Audio.playExplosionSmall();
            ScreenShake.trigger(6, 0.3);
            if (this.armor.every(s => !s.alive)) Scoring.spawnPopup('ARMOR BROKEN', '#ff8800', 20);
        }
    },

    // Bomb: damages the core and every intact armor segment
    bombHit(damage) {
        if (!this.active || !this.entered || this.defeated) return;
        if (this.phase === 1) {
            for (const seg of this.armor) if (seg.alive) this._damageArmor(seg, damage);
        }
        this.hit(damage, true);
    },

    // Core damage. While armor is intact (phase 1) the core only takes a fraction.
    hit(damage, ignoreArmor) {
        if (!this.active || !this.entered || this.defeated) return;
        if (this.phaseTransitionTimer > 0) return; // phase transition invulnerability

        if (!ignoreArmor && this.phase === 1 && this.armor.some(seg => seg.alive)) {
            damage *= BOSS_ARMORED_CORE_DAMAGE;
        }
        this.hp -= damage;
        this.flashTimer = 0.06;

        if (this.hp <= 0) {
            if (this.phase < this.totalPhases) {
                this._nextPhase(true);
            } else {
                this._onDefeat();
            }
        }
    },

    _phaseTimeout() {
        Scoring.spawnPopup('TIME OUT', '#888888', 22);
        for (const seg of this.armor) seg.alive = false;
        if (this.phase < this.totalPhases) {
            this._nextPhase(false);
        } else {
            this.timedOut = true;
            this._onDefeat();
        }
    },

    _nextPhase(awardBonus) {
        this.phase++;
        this.hp = this.phaseHps[this.phase - 1];
        this.maxHp = this.phaseHps[this.phase - 1];
        this.attackTimer = 2.0;
        this.patternIndex = 0;
        this.phaseTime = 0;
        this.phaseTransitionTimer = 1.5; // Brief invulnerability
        for (const seg of this.armor) seg.alive = false;
        Enemies.enemyBullets.clear();
        ScreenShake.trigger(12, 0.6);
        Particles.spawn(this.x, this.y, 40, { color: '#ffffff', speed: 220, life: 0.7, size: 4 });
        Particles.spawnShockwave(this.x, this.y, this.colors[this.phase - 1] || '#ffffff', 120, 0.6);
        Renderer.addGlow(this.x, this.y, 0xffffff, this.radius * 6, 0.9);
        Renderer.triggerFlash(0xffffff, 0.2);
        Renderer.triggerGlitch(0.55);
        Audio.playExplosionLarge();
        if (awardBonus) Scoring.score += Math.floor((this.phase === 2 ? 5000 : 10000) * GameConfig.scoreMultiplier);
        Scoring.spawnPopup('PHASE ' + this.phase, this.colors[this.phase - 1] || '#ffffff', 24);
    },

    _onDefeat() {
        this.defeated = true;
        this.defeatTimer = 0;
        ScreenShake.trigger(10, 0.8);
    },

    // ------------------------------------------------------------
    //  Neon style art (see neon.js). Static bodies are baked into the
    //  sprite atlas per phase colour and flash state; eyes, lights,
    //  tentacles, rings and flames are drawn live. Units of the radius.
    // ------------------------------------------------------------
    _NEON_SHAPES: {
        hex: Neon.polygon(6, 0),
        archHull: Neon.mirror([0, -0.8, 0.4, -0.6, 0.5, -0.1, 0.4, 0.5, 0.15, 0.7, 0, 0.7]),
        archPod: [0.5, -0.4, 0.95, -0.5, 1.0, -0.15, 0.85, 0.05, 0.5, 0],
        archBarrel: [0.86, 0.02, 0.95, 0.02, 0.94, 0.3, 0.87, 0.3],
        furnace: Neon.mirror([0, -0.7, 0.8, -0.7, 0.9, -0.2, 0.7, 0.6]),
        furnaceStack: [0.5, -1.0, 0.7, -1.0, 0.7, -0.68, 0.5, -0.68],
        furnaceGun: [0.82, -0.12, 1.12, -0.12, 1.12, 0.06, 0.82, 0.06],
        furnaceCannon: [-0.09, 0.58, 0.09, 0.58, 0.09, 0.9, -0.09, 0.9],
        fighter: Neon.mirror([0, -0.7, 0.2, -0.3, 0.15, -0.1, 0.55, 0.15, 0.5, 0.3, 0.15, 0.4, 0, 0.5]),
        fighterCanopy: Neon.mirror([0, -0.5, 0.07, -0.36, 0.06, -0.24, 0, -0.2]),
    },

    // Outlines the boss breaks into when destroyed: [{ pts, scale, ox }]
    outlines() {
        const S = this._NEON_SHAPES, r = this.radius;
        switch (this.bossType) {
            case 'furnace': return [{ pts: S.furnace, scale: r, ox: 0 }];
            case 'leviathan': return [{ pts: Neon.polygon(14, 0, 0.85, 0.6), scale: r, ox: 0 }];
            case 'interceptor_duo': {
                const sep = this.phase === 1 ? 45 : 18;
                return [{ pts: S.fighter, scale: r, ox: -sep }, { pts: S.fighter, scale: r, ox: sep }];
            }
            case 'nexus': return [{ pts: Neon.polygon(12, 0, 0.55), scale: r, ox: 0 }, { pts: Neon.polygon(16, 0, 0.9), scale: r, ox: 0 }];
            case 'echo': return [{ pts: MidBoss._NEON_SHAPES.echoHull, scale: r, ox: 0 }];
            default: {
                const pod = S.archPod, flipped = pod.slice();
                for (let i = 0; i < flipped.length; i += 2) flipped[i] = -flipped[i];
                return [{ pts: S.archHull, scale: r, ox: 0 }, { pts: pod, scale: r, ox: 0 }, { pts: flipped, scale: r, ox: 0 }];
            }
        }
    },

    // Mirror a right-side detail line to the left and draw both
    _pair(ctx, pts, r, color, alpha, width) {
        Neon.detail(ctx, pts, r, color, alpha, width);
        const m = pts.slice();
        for (let i = 0; i < m.length; i += 2) m[i] = -m[i];
        Neon.detail(ctx, m, r, color, alpha, width);
    },

    // Filled ellipse with a glowing edge
    _ellipse(ctx, x, y, rx, ry, color, width, flash, fillAlpha, fillColor) {
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        const a = ctx.globalAlpha;
        ctx.fillStyle = flash ? '#ffffff' : (fillColor || color);
        ctx.globalAlpha = a * (flash ? 0.6 : fillAlpha);
        ctx.fill();
        ctx.globalAlpha = a;
        Neon.stroke(ctx, color, width, flash);
    },

    _bake: {
        architect(c, color, r, flash) {
            const S = Boss._NEON_SHAPES;
            for (let s = -1; s <= 1; s += 2) {
                c.beginPath();
                c.moveTo(s * r * 0.15, r * 0.68);
                c.lineTo(s * r * 0.32, r * 0.84);
                c.lineTo(s * r * 0.34, r * 1.02);
                Neon.stroke(c, color, 1.4, flash);
            }
            Neon.shape(c, S.archHull, r, color, 2, flash, 0.26);
            c.save();
            c.translate(0, r * 0.02);
            Neon.path(c, S.archHull, r * 0.62, true);
            c.strokeStyle = color; c.globalAlpha = 0.45; c.lineWidth = 1; c.stroke();
            c.restore();
            c.globalAlpha = 1;
            Neon.detail(c, [-0.38, 0.12, -0.12, 0.2, 0.12, 0.2, 0.38, 0.12], r, color, 0.5, 1);
            Neon.detail(c, [-0.3, 0.38, -0.1, 0.46, 0.1, 0.46, 0.3, 0.38], r, color, 0.5, 1);
            Neon.detail(c, [0, -0.72, 0, -0.45], r, color, 0.5, 1);
            Boss._ellipse(c, 0, -r * 0.25, r * 0.2, r * 0.11, color, 1.2, flash, 0.9, '#120006');
        },
        architectPod(c, color, r, flash) {
            const S = Boss._NEON_SHAPES;
            Neon.shape(c, S.archBarrel, r, color, 1, flash, 0.3);
            Neon.shape(c, S.archPod, r, color, 1.5, flash, 0.18);
            Neon.detail(c, [0.58, -0.3, 0.9, -0.36], r, color, 0.5, 1);
            Neon.detail(c, [0.58, -0.14, 0.92, -0.2], r, color, 0.5, 1);
        },
        armor(c, color, r, flash) {
            Neon.shape(c, Boss._NEON_SHAPES.hex, r, color, 1.1, flash, 0.25);
            Neon.path(c, Boss._NEON_SHAPES.hex, r * 0.5, true);
            c.strokeStyle = '#ffaa88'; c.globalAlpha = 0.5; c.lineWidth = 1; c.stroke();
            c.globalAlpha = 1;
        },
        furnace(c, color, r, flash) {
            const S = Boss._NEON_SHAPES;
            const accent = '#ffaa66';
            for (const pts of [S.furnaceStack, S.furnaceGun]) {
                Neon.shape(c, pts, r, color, 1.1, flash, 0.3);
                const m = pts.slice();
                for (let i = 0; i < m.length; i += 2) m[i] = -m[i];
                Neon.shape(c, m, r, color, 1.1, flash, 0.3);
            }
            Neon.shape(c, S.furnaceCannon, r, accent, 1, flash, 0.35);
            Neon.shape(c, [-0.17, 0.86, 0.17, 0.86, 0.17, 0.95, -0.17, 0.95], r, accent, 0.9, flash, 0.35);
            Neon.shape(c, S.furnace, r, color, 2.2, flash, 0.24);
            // Armour plating and rivets
            Neon.detail(c, [-0.78, -0.2, 0.78, -0.2], r, accent, 0.45, 1);
            Neon.detail(c, [-0.72, 0.28, 0.72, 0.28], r, accent, 0.45, 1);
            Boss._pair(c, [0.45, -0.7, 0.45, -0.2], r, accent, 0.35, 1);
            Boss._pair(c, [0.45, 0.28, 0.4, 0.6], r, accent, 0.35, 1);
            for (let j = -3; j <= 3; j++) {
                c.fillStyle = accent; c.globalAlpha = 0.6;
                c.beginPath(); c.arc(j * r * 0.22, -r * 0.6, 1.2, 0, Math.PI * 2); c.fill();
            }
            c.globalAlpha = 1;
            // Furnace mouth with grille bars
            Boss._ellipse(c, 0, r * 0.04, r * 0.3, r * 0.3, accent, 1.3, flash, 0.85, '#1a0400');
            for (let j = -2; j <= 2; j++) Neon.detail(c, [j * 0.1, -0.2, j * 0.1, 0.28], r, accent, 0.5, 1.2);
        },
        leviathan(c, color, r, flash) {
            const accent = '#ccffee';
            Boss._ellipse(c, 0, 0, r * 0.95, r * 0.7, color, 0.8, flash, 0.05);
            Boss._ellipse(c, 0, 0, r * 0.85, r * 0.6, color, 1.8, flash, 0.2);
            Boss._ellipse(c, 0, -r * 0.15, r * 0.65, r * 0.45, color, 1.2, flash, 0.18);
            // Ribs across the carapace
            for (let j = 0; j < 5; j++) {
                const y = r * (0.12 + j * 0.09);
                const w = r * (0.7 - j * 0.1);
                c.beginPath();
                c.ellipse(0, y - r * 0.2, w, r * 0.2, 0, 0.15 * Math.PI, 0.85 * Math.PI);
                c.strokeStyle = color; c.globalAlpha = 0.4; c.lineWidth = 1; c.stroke();
            }
            c.globalAlpha = 1;
            // Eye sockets
            for (const [ex, ey] of [[-0.25, -0.25], [0.25, -0.25], [0, -0.05]]) {
                Boss._ellipse(c, ex * r, ey * r, r * 0.12, r * 0.08, accent, 0.8, flash, 0.9, '#001a10');
            }
        },
        fighter(c, color, r, flash, trim) {
            const S = Boss._NEON_SHAPES;
            Neon.shape(c, S.fighter, r, color, 1.3, flash, 0.24);
            Neon.detail(c, [0, -0.55, 0, 0.35], r, trim, 0.45, 1);
            Boss._pair(c, [0.17, 0.02, 0.5, 0.2], r, trim, 0.6, 1);
            Neon.shape(c, S.fighterCanopy, r, trim, 0.7, flash, 0.4);
        },
        nexus(c, color, r, flash) {
            Boss._ellipse(c, 0, 0, r * 0.9, r * 0.9, color, 0.7, flash, 0.06);
            Boss._ellipse(c, 0, 0, r * 0.55, r * 0.55, color, 1.8, flash, 0.22);
            // Latitude and longitude lines give the sphere some depth
            c.strokeStyle = color; c.lineWidth = 1; c.globalAlpha = 0.4;
            for (const [rx, ry] of [[0.55, 0.18], [0.55, 0.38], [0.2, 0.55], [0.4, 0.55]]) {
                c.beginPath(); c.ellipse(0, 0, r * rx, r * ry, 0, 0, Math.PI * 2); c.stroke();
            }
            c.globalAlpha = 1;
        },
        echo(c, color, r, flash) {
            const S = MidBoss._NEON_SHAPES;
            Neon.shape(c, S.echoHull, r, color, 1.8, flash, 0.2);
            Neon.detail(c, [0, 0.78, 0, -0.3], r, color, 0.45, 1);
            Boss._pair(c, [0.32, -0.1, 0.82, -0.47], r, color, 0.6, 1);
            Boss._pair(c, [0.28, 0.05, 0.28, -0.6], r, color, 0.3, 1);
            Neon.shape(c, S.echoCanopy, r, '#88eeff', 0.9, flash, 0.35);
        },
    },

    _neon: {
        architect(ctx, r, color, flash) {
            const t = this.moveTimer;
            const f = flash ? '|f' : '';
            if (flash) ctx.scale(1.03, 0.98);
            Neon.sprite(ctx, 'b_arch|' + color + f, r * 1.1 + 6, this._bake.architect, color, r, flash);
            for (let s = -1; s <= 1; s += 2) Neon.light(ctx, s * r * 0.34, r * 1.02, 2, color, 0.8);
            // Shoulder pods bob out of step; muzzle lights charge and fade
            for (let s = -1; s <= 1; s += 2) {
                ctx.save();
                ctx.translate(0, Math.sin(t * 2 + (s > 0 ? 0 : Math.PI)) * 2);
                ctx.scale(s, 1);
                Neon.sprite(ctx, 'b_archpod|' + color + f, r * 1.05 + 6, this._bake.architectPod, color, r, flash);
                const charge = 0.4 + 0.6 * Math.max(0, Math.sin(t * 3 + (s > 0 ? 0 : 1.5)));
                Neon.light(ctx, r * 0.905, r * 0.32, 2.5, color, flash ? 1 : charge);
                ctx.restore();
            }
            // Eye: sweeping scan line and a pupil that tracks the player
            const scan = Math.sin(t * 1.7) * 0.16;
            Neon.detail(ctx, [scan, -0.33, scan, -0.17], r, color, 0.35, 1);
            const look = Math.max(-1, Math.min(1, (Player.x - this.x) / 220));
            Neon.light(ctx, look * r * 0.1, -r * 0.25, r * 0.05, color, 1);
        },

        furnace(ctx, r, color, flash) {
            const t = this.moveTimer;
            // Smoke and embers from the stacks
            for (let s = -1; s <= 1; s += 2) {
                for (let j = 0; j < 4; j++) {
                    const p = (t * 0.6 + j / 4 + (s > 0 ? 0.4 : 0)) % 1;
                    const ember = j === 0;
                    ctx.fillStyle = ember ? '#ffaa44' : '#553322';
                    ctx.globalAlpha = (1 - p) * (ember ? 0.8 : 0.3);
                    ctx.beginPath();
                    ctx.arc(s * r * 0.6 + Math.sin(p * 5 + j) * 4, -r * (1.02 + p * 0.6), ember ? 1.5 : 4 + p * 7, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            ctx.globalAlpha = 1;
            if (flash) ctx.scale(1.03, 0.98);
            Neon.sprite(ctx, 'b_furnace|' + color + (flash ? '|f' : ''), r * 1.2 + 6, this._bake.furnace, color, r, flash);
            // Fire behind the grille breathes in and out
            const heat = 0.55 + Math.sin(t * 4) * 0.3;
            ctx.fillStyle = '#ff2200';
            ctx.globalAlpha = heat * 0.5;
            ctx.beginPath(); ctx.arc(0, r * 0.04, r * 0.26, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1;
            Neon.light(ctx, 0, r * 0.04, r * 0.08, '#ff6600', heat);
            Neon.light(ctx, 0, r * 0.95, 2.5, color, 0.5 + Math.sin(t * 6) * 0.4);
            for (let s = -1; s <= 1; s += 2) Neon.light(ctx, s * r * 1.12, -r * 0.03, 2, color, 0.5 + Math.sin(t * 6 + 1) * 0.4);
        },

        leviathan(ctx, r, color, flash) {
            const t = this.moveTimer;
            // Tentacles behind the body
            for (let k = 0; k < 6; k++) {
                const ta = (Math.PI * 2 / 6) * k + t * 0.4;
                const wave = Math.sin(t * 2.5 + k * 1.2);
                ctx.beginPath();
                ctx.moveTo(Math.cos(ta) * r * 0.7, Math.sin(ta) * r * 0.5);
                ctx.quadraticCurveTo(
                    Math.cos(ta) * r * 1.3 + wave * 15, Math.sin(ta) * r * 1.0 + wave * 10,
                    Math.cos(ta + 0.2 + wave * 0.1) * r * 1.8, Math.sin(ta + 0.2 + wave * 0.1) * r * 1.4
                );
                ctx.globalAlpha = 0.55 + Math.sin(t * 3 + k) * 0.25;
                Neon.stroke(ctx, color, 1.1 - k * 0.05, flash);
                ctx.globalAlpha = 1;
                Neon.light(ctx, Math.cos(ta + 0.2 + wave * 0.1) * r * 1.8, Math.sin(ta + 0.2 + wave * 0.1) * r * 1.4, 1.6, color, 0.7);
            }
            // The body breathes
            const breathe = 1 + Math.sin(t * 1.8) * 0.02;
            ctx.save();
            ctx.scale(breathe, 2 - breathe);
            Neon.sprite(ctx, 'b_levi|' + color + (flash ? '|f' : ''), r * 1.0 + 6, this._bake.leviathan, color, r, flash);
            ctx.restore();
            // Eyes blink in turn and follow the player
            const look = Math.max(-1, Math.min(1, (Player.x - this.x) / 220));
            const eyes = [[-0.25, -0.25], [0.25, -0.25], [0, -0.05]];
            for (let k = 0; k < 3; k++) {
                const blink = Math.sin(t * 0.9 + k * 2.1) > 0.97;
                if (blink) continue;
                Neon.light(ctx, (eyes[k][0] + look * 0.05) * r, eyes[k][1] * r, r * 0.035, '#00ffaa', 1);
            }
        },

        interceptor_duo(ctx, r, color, flash) {
            const t = this.moveTimer;
            const sep = this.phase === 1 ? 45 : 18;
            // Phase 2: energy link between the ships, with sparks running along it
            if (this.phase === 2) {
                for (let beam = 0; beam < 3; beam++) {
                    const by = -r * 0.2 + beam * r * 0.25;
                    ctx.beginPath(); ctx.moveTo(-sep, by); ctx.lineTo(sep, by);
                    ctx.globalAlpha = 0.5 + Math.sin(t * 5 + beam) * 0.25;
                    Neon.stroke(ctx, '#ff9900', 0.8, false);
                    ctx.globalAlpha = 1;
                    const p = ((t * 1.5 + beam * 0.33) % 1) * 2 - 1;
                    Neon.light(ctx, p * sep, by, 1.5, '#ffcc44', 1);
                }
            }
            for (let s = -1; s <= 1; s += 2) {
                const trim = s < 0 ? '#ffcc44' : '#ff6644';
                ctx.save();
                ctx.translate(s * sep, 0);
                Neon.flame(ctx, 0, r * 0.47, 4, r * 0.2 + Math.sin(t * 30 + s) * 2, trim, 0.9);
                if (flash) ctx.scale(1.05, 0.96);
                Neon.sprite(ctx, 'b_fighter|' + color + '|' + trim + (flash ? '|f' : ''), r * 0.62 + 6, this._bake.fighter, color, r, flash, trim);
                ctx.restore();
            }
        },

        nexus(ctx, r, color, flash) {
            const t = this.moveTimer;
            if (flash) ctx.scale(1.03, 1.03);
            Neon.sprite(ctx, 'b_nexus|' + color + (flash ? '|f' : ''), r * 0.95 + 6, this._bake.nexus, color, r, flash);
            // Orbital rings with a node riding each
            for (let ring = 0; ring < 3; ring++) {
                const rx = r * (0.75 + ring * 0.12), ry = r * (0.25 + ring * 0.05);
                const rot = t * (0.6 + ring * 0.4);
                ctx.beginPath();
                ctx.ellipse(0, 0, rx, ry, rot, 0, Math.PI * 2);
                ctx.globalAlpha = 0.6 + Math.sin(t * 2 + ring) * 0.2;
                Neon.stroke(ctx, ring === 1 ? '#ff00ff' : color, 0.8, flash);
                ctx.globalAlpha = 1;
                const na = t * (1.2 + ring * 0.5);
                const nx = Math.cos(na) * rx, ny = Math.sin(na) * ry;
                Neon.light(ctx, nx * Math.cos(rot) - ny * Math.sin(rot), nx * Math.sin(rot) + ny * Math.cos(rot), 2.2, '#ff00ff', 1);
            }
            Neon.light(ctx, 0, 0, r * 0.14, color, 0.6 + Math.sin(t * 3) * 0.3);
            // Data stream motes
            ctx.fillStyle = '#ffffff';
            for (let p = 0; p < 8; p++) {
                const pa = t * 1.5 + p * 0.8;
                const pd = r * 0.4 + Math.sin(pa * 2) * r * 0.3;
                ctx.globalAlpha = 0.6;
                ctx.fillRect(Math.cos(pa) * pd - 1, Math.sin(pa) * pd - 1, 2, 2);
            }
            ctx.globalAlpha = 1;
        },

        echo(ctx, r, color, flash) {
            const t = this.moveTimer;
            // Engines at the tail (pointing up)
            const f = Math.sin(t * 40) * 1.5;
            Neon.flame(ctx, -r * 0.22, -r * 0.66, 5, -(r * 0.14 + f), '#00ffff', 0.7);
            Neon.flame(ctx, r * 0.22, -r * 0.66, 5, -(r * 0.14 - f), '#00ffff', 0.7);
            // Magenta ghost copy that jitters, with the odd big glitch jump
            const big = Math.random() < 0.06;
            ctx.save();
            ctx.translate(big ? (Math.random() - 0.5) * 20 : Math.sin(t * 11) * 3, big ? (Math.random() - 0.5) * 20 : Math.cos(t * 7) * 2);
            ctx.globalAlpha = big ? 0.55 : 0.3;
            Neon.sprite(ctx, 'b_echo|#ff00ff', r * 1.2 + 6, this._bake.echo, '#ff00ff', r, false);
            ctx.restore();
            if (flash) ctx.scale(1.03, 0.98);
            Neon.sprite(ctx, 'b_echo|' + color + (flash ? '|f' : ''), r * 1.2 + 6, this._bake.echo, color, r, flash);
            Neon.light(ctx, 0, r * 0.4, r * 0.05, '#ff00ff', 0.6 + Math.sin(t * 4) * 0.4);
        },
    },

    draw(ctx) {
        if (!this.active) return;

        // Warning text
        if (this.warningTimer > 0) {
            ctx.save();
            ctx.fillStyle = `rgba(255, 0, 80, ${0.5 + Math.sin(this.warningTimer * 8) * 0.5})`;
            ctx.font = 'bold 28px Share Tech Mono, Consolas, monospace';
            ctx.textAlign = 'center';
            ctx.fillText('WARNING', PLAY_W / 2, PLAY_H / 2 - 20);
            ctx.font = '16px Share Tech Mono, Consolas, monospace';
            ctx.fillText(this.bossName + ' APPROACHES', PLAY_W / 2, PLAY_H / 2 + 15);
            ctx.restore();
            return;
        }

        if (this.defeated && this.defeatTimer >= 2.5) return;   // shattered

        ctx.save();
        ctx.translate(this.x, this.y);

        const flash = this.flashTimer > 0;
        const mainColor = flash ? '#ffffff' : (this.colors[this.phase - 1] || '#ff4444');

        // Dynamic light — boss core glow (brighter during flash)
        Renderer.addGlow(this.x, this.y, Renderer.colorToHex(mainColor), this.radius * (flash ? 5 : 3), flash ? 0.8 : 0.35);

        // Type-specific body (unknown types draw as the Architect, matching init())
        const draw = this._neon[this.bossType] || this._neon.architect;
        draw.call(this, ctx, this.radius, this.colors[this.phase - 1] || '#ff4444', flash);

        // Armor segments (any boss with armor)
        if (this.armor.length > 0 && this.phase === 1) {
            for (const seg of this.armor) {
                if (!seg.alive) continue;
                // Same orbit as the hit zones and the armor's own guns (armorPositions)
                const ax = Math.cos(seg.angle + this.moveTimer) * BOSS_ARMOR_ORBIT;
                const ay = Math.sin(seg.angle + this.moveTimer) * BOSS_ARMOR_ORBIT;
                // Hexagonal plate that spins against the orbit
                ctx.save();
                ctx.translate(ax, ay);
                ctx.rotate(-this.moveTimer * 2 + seg.angle);
                Neon.sprite(ctx, 'b_armor' + (flash ? '|f' : ''), BOSS_ARMOR_RADIUS + 3, this._bake.armor, '#ff6644', BOSS_ARMOR_RADIUS - 3, flash);
                ctx.restore();
            }
        }

        // Core glow (phases 2-3)
        if (this.phase >= 2) {
            const pulse = Math.sin(this.moveTimer * 5);
            ctx.globalAlpha = 0.5 + Math.sin(this.moveTimer * 3) * 0.2;
            Neon.ring(ctx, 0, 0, 13 + pulse * 4, '#ff00ff', 0.8, false);
            ctx.globalAlpha = 1;
            Neon.light(ctx, 0, 0, 4 + pulse, '#ff00ff', 1);
        }

        ctx.restore();

        // HP bar
        if (this.entered && !this.defeated) {
            const barW = 200;
            const barH = 8;
            const barX = (PLAY_W - barW) / 2;
            const barY = 15;
            ctx.fillStyle = '#220022';
            ctx.fillRect(barX, barY, barW, barH);
            const pct = Math.max(0, this.hp / this.maxHp);
            const hpColor = this.phase === 1 ? '#ff4444' : this.phase === 2 ? '#ff00ff' : '#ff0040';
            ctx.fillStyle = hpColor;
            ctx.fillRect(barX, barY, barW * pct, barH);
            // Phase label
            ctx.fillStyle = '#ffffff';
            ctx.font = '12px Share Tech Mono, Consolas, monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`${this.bossName} — PHASE ${this.phase}`, PLAY_W / 2, barY + barH + 12);
            // Phase timer (turns red in the last 10 s)
            const timeLeft = Math.max(0, BOSS_PHASE_TIME_LIMIT - this.phaseTime);
            ctx.textAlign = 'right';
            ctx.fillStyle = timeLeft <= 10 ? '#ff4444' : '#aaaaaa';
            ctx.fillText(Math.ceil(timeLeft).toString(), barX + barW + 34, barY + barH);
        }
    }
};
