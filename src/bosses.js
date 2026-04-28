// ============================================================
//  BOSS TYPE DEFINITIONS
// ============================================================
const BossTypes = {
    architect: {
        name: 'THE ARCHITECT', phases: 3, phaseHps: [80, 120, 160],
        hasArmor: true, armorCount: 4, armorHp: 20,
        colors: ['#ff4444', '#ff00ff', '#ff0040']
    },
    furnace: {
        name: 'THE FURNACE', phases: 2, phaseHps: [150, 200],
        hasArmor: false,
        colors: ['#ff6600', '#ff2200']
    },
    leviathan: {
        name: 'THE LEVIATHAN', phases: 3, phaseHps: [120, 160, 140],
        hasArmor: false,
        colors: ['#4488ff', '#00ffaa', '#ff44ff']
    },
    interceptor_duo: {
        name: 'INTERCEPTOR DUO', phases: 2, phaseHps: [140, 220],
        hasArmor: false,
        colors: ['#ffaa00', '#ff4400']
    },
    nexus: {
        name: 'THE NEXUS', phases: 3, phaseHps: [160, 200, 280],
        hasArmor: true, armorCount: 6, armorHp: 15,
        colors: ['#cc44ff', '#ff00ff', '#ffffff']
    },
    echo: {
        name: 'THE ECHO', phases: 3, phaseHps: [180, 220, 300],
        hasArmor: false,
        colors: ['#00ffff', '#ff00ff', '#ffffff']
    }
};


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
            }
            return;
        }

        // Defeat sequence — multi-stage dramatic explosion
        if (this.defeated) {
            this.defeatTimer += dt;

            // Stage 1 (0-1.5s): Internal explosions, increasing frequency
            if (this.defeatTimer < 1.5) {
                const freq = 0.3 - this.defeatTimer * 0.12; // Faster over time
                if (this.defeatTimer % Math.max(0.08, freq) < dt) {
                    const rx = this.x + (Math.random() - 0.5) * 80;
                    const ry = this.y + (Math.random() - 0.5) * 80;
                    const col = this.colors[Math.floor(Math.random() * this.colors.length)] || '#ff8800';
                    Particles.spawn(rx, ry, 12, { color: col, speed: 100 + this.defeatTimer * 40, life: 0.5, size: 2 + this.defeatTimer });
                    Audio.playExplosionSmall();
                    ScreenShake.trigger(3 + this.defeatTimer * 3, 0.15);
                }
            }

            // Stage 2 (1.5-2.5s): Boss breaks apart, large ring explosions
            if (this.defeatTimer >= 1.5 && this.defeatTimer < 2.5) {
                if (this.defeatTimer % 0.2 < dt) {
                    const ringCount = 16;
                    for (let j = 0; j < ringCount; j++) {
                        const a = (Math.PI * 2 / ringCount) * j + this.defeatTimer * 2;
                        const dist = (this.defeatTimer - 1.5) * 150;
                        Particles.spawn(
                            this.x + Math.cos(a) * dist,
                            this.y + Math.sin(a) * dist,
                            3, { color: '#ffffff', speed: 80, life: 0.4, size: 3 }
                        );
                    }
                    Audio.playExplosionSmall();
                    ScreenShake.trigger(8, 0.2);
                }
            }

            // Stage 3 (2.5-3.5s): Boss-specific final effect
            if (this.defeatTimer >= 2.5 && this.defeatTimer < 3.5) {
                if (this.defeatTimer - dt < 2.5) {
                    // One-time big boom at start of stage 3
                    Audio.playExplosionLarge();
                    ScreenShake.trigger(15, 0.8);
                    Renderer.triggerFlash(0xffffff, 0.5);
                    Renderer.triggerChroma(0.015, 0.6);

                    // Boss-specific final burst
                    switch (this.bossType) {
                        case 'furnace':
                            // Fiery explosion
                            Particles.spawn(this.x, this.y, 50, { color: '#ff4400', speed: 300, life: 1.0, size: 4 });
                            Particles.spawn(this.x, this.y, 30, { color: '#ffaa00', speed: 200, life: 0.8, size: 3 });
                            break;
                        case 'leviathan':
                            // Organic dissolution
                            for (let j = 0; j < 40; j++) {
                                const a = Math.random() * Math.PI * 2;
                                const d = Math.random() * 60;
                                Particles.spawn(this.x + Math.cos(a) * d, this.y + Math.sin(a) * d, 3, { color: '#00ffaa', speed: 150 + Math.random() * 100, life: 1.2, size: 3 });
                            }
                            break;
                        case 'interceptor_duo':
                            // Twin explosions
                            Particles.spawn(this.x - 40, this.y, 35, { color: '#ffaa00', speed: 250, life: 0.8, size: 4 });
                            Particles.spawn(this.x + 40, this.y, 35, { color: '#ff4400', speed: 250, life: 0.8, size: 4 });
                            break;
                        case 'nexus':
                            // Energy implosion then burst
                            Particles.spawn(this.x, this.y, 60, { color: '#cc44ff', speed: 350, life: 1.2, size: 5 });
                            Particles.spawn(this.x, this.y, 40, { color: '#ffffff', speed: 200, life: 1.0, size: 3 });
                            break;
                        case 'echo':
                            // Glitch dissolution
                            for (let j = 0; j < 50; j++) {
                                const col = ['#00ffff', '#ff00ff', '#ffffff'][j % 3];
                                Particles.spawn(this.x + (Math.random() - 0.5) * 100, this.y + (Math.random() - 0.5) * 100, 2, { color: col, speed: 200 + Math.random() * 150, life: 1.0, size: 2 + Math.random() * 3 });
                            }
                            break;
                        default: // architect
                            Particles.spawn(this.x, this.y, 60, { color: '#ffffff', speed: 250, life: 1.0, size: 4 });
                            Particles.spawn(this.x, this.y, 40, { color: '#ff00ff', speed: 200, life: 0.8, size: 3 });
                            break;
                    }
                }
            }

            // Final cleanup
            if (this.defeatTimer > 3.5) {
                this.active = false;
                Scoring.score += Math.floor(25000 * GameConfig.scoreMultiplier);
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
                    for (let j = 0; j < Math.floor(15 * density); j++) {
                        const x = (PLAY_W / 15) * j + 10;
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
                    for (let j = 0; j < Math.floor(10 * density); j++) {
                        const a = Math.PI / 2 + (j - 5) * 0.12;
                        Enemies.enemyBullets.spawn(this.x, this.y + this.radius * 0.9, Math.cos(a) * bs * 0.8, Math.sin(a) * bs * 0.8, { color: '#ff2200', radius: 3, life: 2 });
                    }
                    this.attackTimer = 1.5; break;
            }
        } else {
            switch (pattern) {
                case 0: // Charge slam — bullet burst
                    for (let j = 0; j < Math.floor(20 * density); j++) {
                        const a = (Math.PI * 2 / 20) * j;
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
                        for (let j = 0; j < Math.floor(12 * density); j++) {
                            const a = angle - 0.6 + (1.2 / 12) * j;
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
                        for (let j = 0; j < Math.floor(16 * density); j++) {
                            const a = (Math.PI * 2 / 16) * j + this.moveTimer * 2;
                            Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs, Math.sin(a) * bs, { color: '#00ffaa', radius: 3 });
                            Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a + Math.PI) * bs * 0.7, Math.sin(a + Math.PI) * bs * 0.7, { color: '#4488ff', radius: 3 });
                        }
                        this.attackTimer = 0.8; break;
                    case 1: // Tentacle sweep (reuse phase 1 pattern)
                        for (let j = 0; j < Math.floor(12 * density); j++) {
                            const a = angle - 0.6 + (1.2 / 12) * j;
                            Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs * 0.8, Math.sin(a) * bs * 0.8, { color: '#00ffaa', radius: 3 });
                        }
                        this.attackTimer = 1.0; break;
                    case 2: // Ring burst
                        const count = Math.floor(20 * density);
                        for (let j = 0; j < count; j++) {
                            const a = (Math.PI * 2 / count) * j;
                            Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs * 0.6, Math.sin(a) * bs * 0.6, { color: '#00ffaa', radius: 4 });
                        }
                        this.attackTimer = 1.0; break;
                }
                break;
            case 3: // Charging — fast and aggressive
                switch (pattern) {
                    case 0: for (let j = 0; j < Math.floor(24 * density); j++) { const a = (Math.PI * 2 / 24) * j + this.moveTimer * 3; Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs * 1.1, Math.sin(a) * bs * 1.1, { color: '#00ffaa', radius: 3 }); } this.attackTimer = 0.5; break;
                    case 1: for (let j = -4; j <= 4; j++) { Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(angle + j * 0.12) * bs * 1.3, Math.sin(angle + j * 0.12) * bs * 1.3, { color: '#4488ff', radius: 4 }); } this.attackTimer = 0.6; break;
                    case 2: for (let j = 0; j < Math.floor(12 * density); j++) { const a = Math.random() * Math.PI * 2; Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * (80 + Math.random() * bs), Math.sin(a) * (80 + Math.random() * bs), { color: '#00ffaa', radius: 3 }); } this.attackTimer = 0.7; break;
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
                    const c = Math.floor(12 * density);
                    for (let j = 0; j < c; j++) { const a = (Math.PI * 2 / c) * j; Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs * 0.7, Math.sin(a) * bs * 0.7, { color: '#ff6600', radius: 3 }); }
                    this.attackTimer = 1.5; break;
            }
        } else { // Combined form — overlapping patterns
            switch (pattern) {
                case 0: // Double spiral
                    for (let j = 0; j < Math.floor(20 * density); j++) { const a = (Math.PI * 2 / 20) * j + this.moveTimer * 2.5; Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs, Math.sin(a) * bs, { color: '#ffaa00', radius: 3 }); Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a + 0.3) * bs * 0.8, Math.sin(a + 0.3) * bs * 0.8, { color: '#ff4400', radius: 3 }); }
                    this.attackTimer = 0.7; break;
                case 1: // Wide shotgun
                    for (let j = -5; j <= 5; j++) { const a = angle + j * 0.1; Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs * 1.2, Math.sin(a) * bs * 1.2, { color: '#ff6600', radius: 4 }); }
                    this.attackTimer = 0.8; break;
                case 2: // Spawn drones
                    for (let j = 0; j < 4; j++) Enemies.spawn('scout_drone', this.x + (j - 1.5) * 30, this.y + 20, 'straight_down');
                    this.attackTimer = 2.5; break;
                case 3: // Burst rings
                    for (let ring = 0; ring < 2; ring++) { const c = Math.floor((14 + ring * 6) * density); for (let j = 0; j < c; j++) { const a = (Math.PI * 2 / c) * j + ring * 0.15; Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs * (0.6 + ring * 0.3), Math.sin(a) * bs * (0.6 + ring * 0.3), { color: ring === 0 ? '#ffaa00' : '#ff4400', radius: 3 }); } }
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
                    case 0: for (let j = 0; j < Math.floor(16 * density); j++) { const a = (Math.PI * 2 / 16) * j; Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs * 0.7, Math.sin(a) * bs * 0.7, { color: '#cc44ff', radius: 4 }); } this.attackTimer = 1.2; break;
                    case 1: for (let j = -3; j <= 3; j++) { Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(angle + j * 0.15) * bs * 1.1, Math.sin(angle + j * 0.15) * bs * 1.1, { color: '#ff00ff', radius: 3 }); } this.attackTimer = 0.8; break;
                    case 2: Enemies.spawn('phase_shifter', this.x, this.y + 30, 'hover'); this.attackTimer = 3.0; break;
                    case 3: // Horizontal wall with gaps
                        for (let j = 0; j < Math.floor(18 * density); j++) { if (j % 4 === Math.floor(this.moveTimer) % 4) continue; const x = (PLAY_W / 18) * j; Enemies.enemyBullets.spawn(x, this.y + 30, 0, bs * 0.5, { color: '#cc44ff', radius: 3 }); }
                        this.attackTimer = 1.0; break;
                }
                break;
            case 2: // Pattern remix — uses attacks inspired by previous bosses
                switch (pattern) {
                    case 0: this._furnaceAttack(angle, bs * 0.9, density); break;
                    case 1: this._leviathanAttack(angle, bs * 0.9, density); break;
                    case 2: this._duoAttack(angle, bs * 0.9, density); break;
                    case 3: for (let j = 0; j < Math.floor(20 * density); j++) { const a = (Math.PI * 2 / 20) * j + this.moveTimer * 2; Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs, Math.sin(a) * bs, { color: '#ff00ff', radius: 3 }); } this.attackTimer = 0.6; break;
                }
                break;
            case 3: // Endurance — everything at max
                switch (pattern) {
                    case 0: // Triple spiral
                        for (let s = 0; s < 3; s++) { for (let j = 0; j < Math.floor(10 * density); j++) { const a = (Math.PI * 2 / 10) * j + this.moveTimer * 3 + s * (Math.PI * 2 / 3); Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs, Math.sin(a) * bs, { color: ['#ff00ff', '#cc44ff', '#ffffff'][s], radius: 3 }); } }
                        this.attackTimer = 0.4; break;
                    case 1: for (let j = -5; j <= 5; j++) { Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(angle + j * 0.1) * bs * 1.3, Math.sin(angle + j * 0.1) * bs * 1.3, { color: '#ffffff', radius: 4 }); } this.attackTimer = 0.5; break;
                    case 2: for (let j = 0; j < 3; j++) Enemies.spawn('phase_shifter', this.x + (j - 1) * 50, this.y + 30, 'hover'); this.attackTimer = 3.0; break;
                    case 3: // Cross beams
                        for (let arm = 0; arm < 4; arm++) { const ba = this.moveTimer * 1.5 + arm * (Math.PI / 2); for (let j = 0; j < 10; j++) { const bx = this.x + Math.cos(ba) * j * 18; const by = this.y + Math.sin(ba) * j * 18; if (bx > 0 && bx < PLAY_W && by > 0 && by < PLAY_H) Enemies.enemyBullets.spawn(bx, by, 0, 0, { color: '#ff00ff', radius: 4, life: 0.6 }); } }
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
                        for (let j = 0; j < 3; j++) { Enemies.enemyBullets.spawn(this.x + (j - 1) * 20, this.y, Math.cos(angle) * bs * 0.5, Math.sin(angle) * bs * 0.5, { color: '#00ff88', radius: 3, type: 'homing', life: 4 }); }
                        this.attackTimer = 1.0; break;
                    case 2: // Ring
                        const c = Math.floor(14 * density); for (let j = 0; j < c; j++) { const a = (Math.PI * 2 / c) * j; Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs * 0.7, Math.sin(a) * bs * 0.7, { color: '#00ffff', radius: 3 }); }
                        this.attackTimer = 1.2; break;
                }
                break;
            case 2: // Mirrors laser + adds own patterns
                switch (pattern) {
                    case 0: // Laser beams (vertical lines)
                        for (let j = -1; j <= 1; j++) { for (let k = 0; k < 8; k++) { Enemies.enemyBullets.spawn(this.x + j * 15, this.y + k * 15, 0, bs * 1.5, { color: '#4488ff', radius: 5, life: 0.5 }); } }
                        this.attackTimer = 0.4; break;
                    case 1: // Mirror movement burst
                        for (let j = 0; j < Math.floor(16 * density); j++) { const a = (Math.PI * 2 / 16) * j + this.moveTimer * 2; Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs, Math.sin(a) * bs, { color: '#ff00ff', radius: 3 }); }
                        this.attackTimer = 0.7; break;
                    case 2: // Aimed fan
                        for (let j = -4; j <= 4; j++) { Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(angle + j * 0.12) * bs * 1.2, Math.sin(angle + j * 0.12) * bs * 1.2, { color: '#00ffff', radius: 3 }); }
                        this.attackTimer = 0.6; break;
                }
                break;
            case 3: // All patterns combined, faster
                switch (pattern) {
                    case 0: for (let j = 0; j < Math.floor(24 * density); j++) { const a = (Math.PI * 2 / 24) * j + this.moveTimer * 3; Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs * 1.1, Math.sin(a) * bs * 1.1, { color: '#ffffff', radius: 3 }); } this.attackTimer = 0.4; break;
                    case 1: for (let j = -5; j <= 5; j++) { Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(angle + j * 0.1) * bs * 1.4, Math.sin(angle + j * 0.1) * bs * 1.4, { color: '#00ffff', radius: 4 }); } for (let j = 0; j < 3; j++) { Enemies.enemyBullets.spawn(this.x + (j-1)*20, this.y, Math.cos(angle)*bs*0.5, Math.sin(angle)*bs*0.5, { color:'#00ff88', radius:3, type:'homing', life:3 }); } this.attackTimer = 0.5; break;
                    case 2: for (let j = -1; j <= 1; j++) { for (let k = 0; k < 10; k++) Enemies.enemyBullets.spawn(this.x + j * 20, this.y + k * 12, 0, bs * 1.5, { color: '#4488ff', radius: 5, life: 0.4 }); } this.attackTimer = 0.3; break;
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
                    const sx = this.x + Math.cos(seg.angle + this.moveTimer) * 40;
                    const sy = this.y + Math.sin(seg.angle + this.moveTimer) * 40;
                    for (let j = -2; j <= 2; j++) {
                        const a = angle + j * 0.2;
                        Enemies.enemyBullets.spawn(sx, sy, Math.cos(a) * bs, Math.sin(a) * bs, { color: '#ff1493', radius: 3 });
                    }
                }
                this.attackTimer = 1.5;
                break;
            case 1: // Horizontal sweep
                for (let i = 0; i < Math.floor(12 * density); i++) {
                    const x = (PLAY_W / (12 * density)) * i + 10;
                    Enemies.enemyBullets.spawn(this.x, this.y + 30, 0, bs * 0.8, { color: '#ff4040', radius: 3 });
                }
                this.attackTimer = 2.0;
                break;
            case 2: // Ring burst
                const count = Math.floor(16 * density);
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
                    const count = Math.floor((12 + ring * 4) * density);
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
                            Enemies.enemyBullets.spawn(bx, by, 0, 0, { color: '#ff4488', radius: 4, life: 0.8 });
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
                const spiralCount = Math.floor(24 * density);
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
                const ringCount = Math.floor(10 * density);
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
                for (let j = 0; j < Math.floor(20 * density); j++) {
                    const a = Math.random() * Math.PI * 2;
                    const spd = 80 + Math.random() * bs;
                    Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * spd, Math.sin(a) * spd, { color: '#ff1493', radius: 3 });
                }
                this.attackTimer = 1.2;
                break;
        }
    },

    hit(damage) {
        if (!this.active || !this.entered || this.defeated) return;

        // Phase 1: Damage armor first
        if (this.phase === 1) {
            for (const seg of this.armor) {
                if (seg.alive) {
                    seg.hp -= damage;
                    this.flashTimer = 0.06;
                    if (seg.hp <= 0) {
                        seg.alive = false;
                        Particles.spawn(
                            this.x + Math.cos(seg.angle) * 40,
                            this.y + Math.sin(seg.angle) * 40,
                            20, { color: '#ff8800', speed: 150, life: 0.5 }
                        );
                        Scoring.score += Math.floor(1500 * GameConfig.scoreMultiplier);
                        Audio.playExplosionSmall();
                        ScreenShake.trigger(6, 0.3);
                    }
                    // Check if all armor destroyed
                    if (this.armor.every(s => !s.alive)) {
                        this._nextPhase();
                    }
                    return;
                }
            }
        }

        // Phase transition invulnerability
        if (this.phaseTransitionTimer > 0) return;

        this.hp -= damage;
        this.flashTimer = 0.06;

        if (this.hp <= 0) {
            if (this.phase < this.totalPhases) {
                this._nextPhase();
            } else {
                this._onDefeat();
            }
        }
    },

    _nextPhase() {
        this.phase++;
        this.hp = this.phaseHps[this.phase - 1];
        this.maxHp = this.phaseHps[this.phase - 1];
        this.attackTimer = 2.0;
        this.patternIndex = 0;
        this.phaseTransitionTimer = 1.5; // Brief invulnerability
        Enemies.enemyBullets.clear();
        ScreenShake.trigger(8, 0.5);
        Particles.spawn(this.x, this.y, 30, { color: '#ffffff', speed: 180, life: 0.6, size: 3 });
        Particles.spawnShockwave(this.x, this.y, this.colors[this.phase - 1] || '#ffffff', 80, 0.5);
        Audio.playExplosionLarge();
        Scoring.score += Math.floor((this.phase === 2 ? 5000 : 10000) * GameConfig.scoreMultiplier);
        Scoring.spawnPopup('PHASE ' + this.phase, this.colors[this.phase - 1] || '#ffffff', 24);
    },

    _onDefeat() {
        this.defeated = true;
        this.defeatTimer = 0;
        ScreenShake.trigger(10, 0.8);
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

        ctx.save();
        ctx.translate(this.x, this.y);

        const flash = this.flashTimer > 0;
        const mainColor = flash ? '#ffffff' : (this.colors[this.phase - 1] || '#ff4444');

        // Dynamic light — boss core glow (brighter during flash)
        Renderer.addGlow(this.x, this.y, Renderer.colorToHex(mainColor), this.radius * (flash ? 3 : 2), flash ? 0.5 : 0.2);

        // Core body
        ctx.fillStyle = mainColor;

        // Type-specific body shapes
        const r = this.radius;
        switch (this.bossType) {
            case 'furnace': {
                // Industrial war machine — heavy armoured hull, smokestacks, cannons
                // Main hull
                ctx.beginPath();
                ctx.moveTo(-r * 0.8, -r * 0.7);
                ctx.lineTo(r * 0.8, -r * 0.7);
                ctx.lineTo(r * 0.9, -r * 0.2);
                ctx.lineTo(r * 0.7, r * 0.6);
                ctx.lineTo(-r * 0.7, r * 0.6);
                ctx.lineTo(-r * 0.9, -r * 0.2);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = flash ? '#fff' : '#ff8844';
                ctx.lineWidth = 2; ctx.stroke();
                // Armour plates
                ctx.strokeStyle = flash ? '#fff' : '#884422';
                ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(-r * 0.7, -r * 0.2); ctx.lineTo(r * 0.7, -r * 0.2); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(-r * 0.6, r * 0.2); ctx.lineTo(r * 0.6, r * 0.2); ctx.stroke();
                // Smokestacks
                ctx.fillStyle = flash ? '#ffffff' : '#663300';
                ctx.fillRect(-r * 0.7, -r * 1.0, r * 0.2, r * 0.35);
                ctx.fillRect(r * 0.5, -r * 1.0, r * 0.2, r * 0.35);
                // Smoke
                ctx.fillStyle = `rgba(100, 50, 0, ${0.3 + Math.sin(this.moveTimer * 2) * 0.15})`;
                ctx.beginPath(); ctx.arc(-r * 0.6, -r * 1.1, 5 + Math.sin(this.moveTimer * 3) * 2, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(r * 0.6, -r * 1.1, 5 + Math.cos(this.moveTimer * 3) * 2, 0, Math.PI * 2); ctx.fill();
                // Side cannons
                ctx.fillStyle = mainColor;
                ctx.fillRect(-r * 1.1, -r * 0.1, r * 0.3, r * 0.15);
                ctx.fillRect(r * 0.8, -r * 0.1, r * 0.3, r * 0.15);
                // Central cannon
                ctx.fillRect(-r * 0.08, r * 0.5, r * 0.16, r * 0.4);
                ctx.fillRect(-r * 0.15, r * 0.85, r * 0.3, r * 0.08);
                // Furnace glow (core)
                ctx.fillStyle = '#ff2200';
                ctx.globalAlpha = 0.5 + Math.sin(this.moveTimer * 4) * 0.3;
                ctx.beginPath(); ctx.arc(0, 0, r * 0.25, 0, Math.PI * 2); ctx.fill();
                break;
            }
            case 'leviathan': {
                // Organic creature — segmented body, multiple eyes, animated tentacles
                // Main body segments
                ctx.beginPath(); ctx.ellipse(0, 0, r * 0.85, r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.ellipse(0, -r * 0.15, r * 0.65, r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = flash ? '#fff' : '#44ccaa'; ctx.lineWidth = 1.5; ctx.stroke();
                // Outer membrane
                ctx.strokeStyle = `rgba(0, 200, 150, 0.3)`;
                ctx.lineWidth = 1;
                ctx.beginPath(); ctx.ellipse(0, 0, r * 0.95, r * 0.7, 0, 0, Math.PI * 2); ctx.stroke();
                // Tentacles (6, animated)
                for (let t = 0; t < 6; t++) {
                    const ta = (Math.PI * 2 / 6) * t + this.moveTimer * 0.4;
                    const wave = Math.sin(this.moveTimer * 2.5 + t * 1.2);
                    ctx.strokeStyle = `rgba(0, 255, 170, ${0.35 + Math.sin(this.moveTimer * 3 + t) * 0.15})`;
                    ctx.lineWidth = 2.5 - t * 0.1;
                    ctx.beginPath();
                    const sx = Math.cos(ta) * r * 0.7, sy = Math.sin(ta) * r * 0.5;
                    ctx.moveTo(sx, sy);
                    ctx.quadraticCurveTo(
                        Math.cos(ta) * r * 1.3 + wave * 15, Math.sin(ta) * r * 1.0 + wave * 10,
                        Math.cos(ta + 0.2 + wave * 0.1) * r * 1.8, Math.sin(ta + 0.2 + wave * 0.1) * r * 1.4
                    );
                    ctx.stroke();
                }
                // Eyes (3)
                const eyePositions = [[-r * 0.25, -r * 0.25], [r * 0.25, -r * 0.25], [0, -r * 0.05]];
                for (const [ex, ey] of eyePositions) {
                    ctx.fillStyle = flash ? '#ffffff' : '#001a10';
                    ctx.beginPath(); ctx.ellipse(ex, ey, r * 0.12, r * 0.08, 0, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#00ffaa';
                    ctx.beginPath(); ctx.arc(ex, ey, r * 0.04, 0, Math.PI * 2); ctx.fill();
                }
                break;
            }
            case 'interceptor_duo': {
                // Twin fighter ships — each with wings and engines
                const sep = this.phase === 1 ? 45 : 18;
                for (let s = -1; s <= 1; s += 2) {
                    const ox = s * sep;
                    ctx.fillStyle = mainColor;
                    // Fighter body
                    ctx.beginPath();
                    ctx.moveTo(ox, -r * 0.7);
                    ctx.lineTo(ox + r * 0.2, -r * 0.3);
                    ctx.lineTo(ox + r * 0.15, r * 0.4);
                    ctx.lineTo(ox, r * 0.5);
                    ctx.lineTo(ox - r * 0.15, r * 0.4);
                    ctx.lineTo(ox - r * 0.2, -r * 0.3);
                    ctx.closePath();
                    ctx.fill();
                    // Wings
                    ctx.beginPath();
                    ctx.moveTo(ox + r * 0.15, -r * 0.1);
                    ctx.lineTo(ox + r * 0.55, r * 0.15);
                    ctx.lineTo(ox + r * 0.5, r * 0.3);
                    ctx.lineTo(ox + r * 0.15, r * 0.15);
                    ctx.closePath();
                    ctx.fill();
                    ctx.beginPath();
                    ctx.moveTo(ox - r * 0.15, -r * 0.1);
                    ctx.lineTo(ox - r * 0.55, r * 0.15);
                    ctx.lineTo(ox - r * 0.5, r * 0.3);
                    ctx.lineTo(ox - r * 0.15, r * 0.15);
                    ctx.closePath();
                    ctx.fill();
                    // Outline
                    ctx.strokeStyle = flash ? '#fff' : (s < 0 ? '#ffcc44' : '#ff6644');
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.moveTo(ox, -r * 0.7); ctx.lineTo(ox + r * 0.55, r * 0.15);
                    ctx.lineTo(ox + r * 0.15, r * 0.4); ctx.lineTo(ox, r * 0.5);
                    ctx.lineTo(ox - r * 0.15, r * 0.4); ctx.lineTo(ox - r * 0.55, r * 0.15);
                    ctx.closePath(); ctx.stroke();
                    // Cockpit
                    ctx.fillStyle = flash ? '#ffffff' : '#442200';
                    ctx.beginPath(); ctx.ellipse(ox, -r * 0.35, r * 0.07, r * 0.12, 0, 0, Math.PI * 2); ctx.fill();
                    // Engine
                    ctx.fillStyle = s < 0 ? '#ffcc44' : '#ff6644';
                    ctx.globalAlpha = 0.6;
                    ctx.beginPath();
                    ctx.moveTo(ox - 4, r * 0.45); ctx.lineTo(ox, r * 0.7 + Math.sin(this.moveTimer * 8) * 3);
                    ctx.lineTo(ox + 4, r * 0.45); ctx.fill();
                    ctx.globalAlpha = 1;
                }
                // Phase 2: energy link between ships
                if (this.phase === 2) {
                    ctx.strokeStyle = `rgba(255, 150, 0, ${0.4 + Math.sin(this.moveTimer * 5) * 0.2})`;
                    ctx.lineWidth = 2;
                    for (let beam = 0; beam < 3; beam++) {
                        const by = -r * 0.2 + beam * r * 0.25;
                        ctx.beginPath(); ctx.moveTo(-sep, by); ctx.lineTo(sep, by); ctx.stroke();
                    }
                }
                break;
            }
            case 'nexus': {
                // Energy nexus — central sphere with orbiting ring structures and data streams
                // Outer shell
                ctx.globalAlpha = 0.3;
                ctx.beginPath(); ctx.arc(0, 0, r * 0.9, 0, Math.PI * 2); ctx.fill();
                ctx.globalAlpha = 1;
                // Core sphere
                ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = flash ? '#fff' : '#aa44ff'; ctx.lineWidth = 2; ctx.stroke();
                // Inner bright core
                ctx.fillStyle = '#ffffff';
                ctx.globalAlpha = 0.4 + Math.sin(this.moveTimer * 3) * 0.2;
                ctx.beginPath(); ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2); ctx.fill();
                ctx.globalAlpha = 1;
                // Orbital rings (3, rotating at different speeds)
                for (let ring = 0; ring < 3; ring++) {
                    ctx.strokeStyle = `rgba(200, 0, 255, ${0.4 + Math.sin(this.moveTimer * 2 + ring) * 0.15})`;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.ellipse(0, 0, r * (0.75 + ring * 0.12), r * (0.25 + ring * 0.05),
                        this.moveTimer * (0.6 + ring * 0.4), 0, Math.PI * 2);
                    ctx.stroke();
                    // Node on each ring
                    const nodeA = this.moveTimer * (0.6 + ring * 0.4);
                    const nodeX = Math.cos(nodeA) * r * (0.75 + ring * 0.12);
                    const nodeY = Math.sin(nodeA) * r * (0.25 + ring * 0.05);
                    ctx.fillStyle = '#ff00ff';
                    ctx.beginPath(); ctx.arc(nodeX, nodeY, 3, 0, Math.PI * 2); ctx.fill();
                }
                // Data stream particles
                ctx.fillStyle = '#cc44ff';
                ctx.globalAlpha = 0.5;
                for (let p = 0; p < 8; p++) {
                    const pa = this.moveTimer * 1.5 + p * 0.8;
                    const pd = r * 0.4 + Math.sin(pa * 2) * r * 0.3;
                    ctx.fillRect(Math.cos(pa) * pd - 1, Math.sin(pa) * pd - 1, 2, 2);
                }
                ctx.globalAlpha = 1;
                break;
            }
            case 'echo': {
                // Dark mirror of player ship — inverted, with glitch distortion
                // Main fuselage (inverted — nose pointing down)
                ctx.beginPath();
                ctx.moveTo(0, r * 1.0);            // Nose (pointing down)
                ctx.lineTo(r * 0.25, r * 0.4);
                ctx.lineTo(r * 0.3, -r * 0.2);
                ctx.lineTo(r * 0.25, -r * 0.7);
                ctx.lineTo(-r * 0.25, -r * 0.7);
                ctx.lineTo(-r * 0.3, -r * 0.2);
                ctx.lineTo(-r * 0.25, r * 0.4);
                ctx.closePath();
                ctx.fill();
                // Wings (inverted)
                ctx.beginPath();
                ctx.moveTo(r * 0.3, r * 0.1); ctx.lineTo(r * 0.9, -r * 0.3);
                ctx.lineTo(r * 0.85, -r * 0.5); ctx.lineTo(r * 0.3, -r * 0.2);
                ctx.closePath(); ctx.fill();
                ctx.beginPath();
                ctx.moveTo(-r * 0.3, r * 0.1); ctx.lineTo(-r * 0.9, -r * 0.3);
                ctx.lineTo(-r * 0.85, -r * 0.5); ctx.lineTo(-r * 0.3, -r * 0.2);
                ctx.closePath(); ctx.fill();
                // Outline
                ctx.strokeStyle = flash ? '#fff' : '#88eeff'; ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(0, r * 1.0); ctx.lineTo(r * 0.25, r * 0.4);
                ctx.lineTo(r * 0.9, -r * 0.3); ctx.lineTo(r * 0.85, -r * 0.5);
                ctx.lineTo(r * 0.25, -r * 0.7); ctx.lineTo(-r * 0.25, -r * 0.7);
                ctx.lineTo(-r * 0.85, -r * 0.5); ctx.lineTo(-r * 0.9, -r * 0.3);
                ctx.lineTo(-r * 0.25, r * 0.4);
                ctx.closePath(); ctx.stroke();
                // Dark cockpit
                ctx.fillStyle = flash ? '#ffffff' : '#002233';
                ctx.beginPath(); ctx.ellipse(0, r * 0.3, r * 0.1, r * 0.2, 0, 0, Math.PI * 2); ctx.fill();
                // Engines (pointing up since inverted)
                ctx.fillStyle = '#00ffff';
                ctx.globalAlpha = 0.6;
                ctx.beginPath();
                ctx.moveTo(-r * 0.35, -r * 0.65); ctx.lineTo(-r * 0.25, -r * 0.95 - Math.sin(this.moveTimer * 8) * 3);
                ctx.lineTo(-r * 0.15, -r * 0.65); ctx.fill();
                ctx.beginPath();
                ctx.moveTo(r * 0.15, -r * 0.65); ctx.lineTo(r * 0.25, -r * 0.95 - Math.sin(this.moveTimer * 8) * 3);
                ctx.lineTo(r * 0.35, -r * 0.65); ctx.fill();
                ctx.globalAlpha = 1;
                // Glitch ghost
                if (Math.random() < 0.06) {
                    ctx.globalAlpha = 0.25;
                    ctx.fillStyle = '#ff00ff';
                    ctx.translate((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
                    ctx.beginPath();
                    ctx.moveTo(0, r * 1.0); ctx.lineTo(r * 0.25, r * 0.4);
                    ctx.lineTo(r * 0.3, -r * 0.2); ctx.lineTo(r * 0.25, -r * 0.7);
                    ctx.lineTo(-r * 0.25, -r * 0.7); ctx.lineTo(-r * 0.3, -r * 0.2);
                    ctx.lineTo(-r * 0.25, r * 0.4);
                    ctx.closePath(); ctx.fill();
                    ctx.globalAlpha = 1;
                }
                break;
            }
            default: {
                // Architect — angular mech with shoulder pods, central eye, leg struts
                // Main body
                ctx.beginPath();
                ctx.moveTo(0, -r * 0.8);
                ctx.lineTo(r * 0.4, -r * 0.6);
                ctx.lineTo(r * 0.5, -r * 0.1);
                ctx.lineTo(r * 0.4, r * 0.5);
                ctx.lineTo(r * 0.15, r * 0.7);
                ctx.lineTo(-r * 0.15, r * 0.7);
                ctx.lineTo(-r * 0.4, r * 0.5);
                ctx.lineTo(-r * 0.5, -r * 0.1);
                ctx.lineTo(-r * 0.4, -r * 0.6);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = flash ? '#fff' : '#ff8888'; ctx.lineWidth = 1.5; ctx.stroke();
                // Shoulder pods
                ctx.beginPath();
                ctx.moveTo(r * 0.5, -r * 0.4); ctx.lineTo(r * 0.95, -r * 0.5);
                ctx.lineTo(r * 1.0, -r * 0.15); ctx.lineTo(r * 0.85, r * 0.05);
                ctx.lineTo(r * 0.5, 0);
                ctx.closePath(); ctx.fill();
                ctx.beginPath();
                ctx.moveTo(-r * 0.5, -r * 0.4); ctx.lineTo(-r * 0.95, -r * 0.5);
                ctx.lineTo(-r * 1.0, -r * 0.15); ctx.lineTo(-r * 0.85, r * 0.05);
                ctx.lineTo(-r * 0.5, 0);
                ctx.closePath(); ctx.fill();
                // Central eye
                ctx.fillStyle = flash ? '#ffffff' : '#220000';
                ctx.beginPath(); ctx.ellipse(0, -r * 0.25, r * 0.15, r * 0.1, 0, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(0, -r * 0.25, r * 0.05, 0, Math.PI * 2); ctx.fill();
                // Leg struts
                ctx.strokeStyle = mainColor; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(r * 0.15, r * 0.7); ctx.lineTo(r * 0.35, r * 1.0); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(-r * 0.15, r * 0.7); ctx.lineTo(-r * 0.35, r * 1.0); ctx.stroke();
                // Weapon hardpoints on shoulders
                ctx.fillStyle = mainColor;
                ctx.fillRect(r * 0.85, -r * 0.45, r * 0.1, r * 0.25);
                ctx.fillRect(-r * 0.95, -r * 0.45, r * 0.1, r * 0.25);
                break;
            }
        }

        // Armor segments (any boss with armor)
        if (this.armor.length > 0 && this.phase === 1) {
            for (const seg of this.armor) {
                if (!seg.alive) continue;
                const ax = Math.cos(seg.angle + this.moveTimer * 0.5) * 45;
                const ay = Math.sin(seg.angle + this.moveTimer * 0.5) * 45;
                ctx.fillStyle = '#ff6644';
                ctx.beginPath();
                ctx.arc(ax, ay, 12, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#ffaa88';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }
        }

        // Core glow (phases 2-3)
        if (this.phase >= 2) {
            const pulseR = 15 + Math.sin(this.moveTimer * 5) * 5;
            ctx.fillStyle = `rgba(255, 0, 255, ${0.3 + Math.sin(this.moveTimer * 3) * 0.2})`;
            ctx.beginPath();
            ctx.arc(0, 0, pulseR, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(0, 0, 6, 0, Math.PI * 2);
            ctx.fill();
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
        }
    }
};
