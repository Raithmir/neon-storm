// ============================================================
//  SCHEDULER (game-time delayed actions)
// ============================================================
// Delayed spawns and state changes run on game time, not wall-clock time, so
// they pause with the game and are discarded when a level restarts.
const Scheduler = {
    time: 0,
    queue: [],

    after(seconds, fn) {
        this.queue.push({ at: this.time + Math.max(0, seconds), fn });
    },

    update(dt) {
        this.time += dt;
        // Run due items in order; items scheduled while running wait for the next update
        const due = this.queue.filter(item => item.at <= this.time).sort((a, b) => a.at - b.at);
        if (due.length === 0) return;
        this.queue = this.queue.filter(item => item.at > this.time);
        for (const item of due) item.fn();
    },

    get pending() { return this.queue.length; },

    clear() {
        this.time = 0;
        this.queue = [];
    }
};


// ============================================================
//  WAVE SYSTEM (Data-driven level sequencer)
// ============================================================
const WaveSystem = {
    waves: [],
    currentWaveIndex: 0,
    levelTimer: 0,
    levelComplete: false,
    bossActive: false,

    loadLevel(levelData) {
        this.waves = levelData.waves;
        this.currentWaveIndex = 0;
        this.levelTimer = 0;
        this.levelComplete = false;
        this.bossActive = false;
    },

    update(dt) {
        this.levelTimer += dt;

        // Spawn waves based on timing
        while (this.currentWaveIndex < this.waves.length) {
            const wave = this.waves[this.currentWaveIndex];
            if (this.levelTimer >= wave.time) {
                this._spawnWave(wave);
                this.currentWaveIndex++;
            } else {
                break;
            }
        }
    },

    _spawnWave(wave) {
        for (const group of wave.enemies) {
            for (let i = 0; i < group.count; i++) {
                let x, y;
                const spacing = PLAY_W / (group.count + 1);

                switch (group.formation) {
                    case 'line':
                        x = spacing * (i + 1);
                        y = -20 - i * 15;
                        break;
                    case 'v_shape':
                        x = PLAY_W / 2 + (i - (group.count - 1) / 2) * 50;
                        y = -20 - Math.abs(i - (group.count - 1) / 2) * 25;
                        break;
                    case 'random':
                        x = 40 + Math.random() * (PLAY_W - 80);
                        y = -20 - Math.random() * 60;
                        break;
                    case 'sides':
                        x = i % 2 === 0 ? -15 : PLAY_W + 15;
                        y = 60 + (Math.floor(i / 2)) * 40;
                        break;
                    default:
                        x = spacing * (i + 1);
                        y = -20;
                }

                // Delayed spawn (game time — pauses with the game)
                Scheduler.after(((group.delay || 0) + i * (group.stagger || 200)) / 1000, () => {
                    Enemies.spawn(group.type, x, y, group.movePath || 'straight_down');
                });
            }
        }
    },

    // All waves dispatched and every delayed spawn has happened
    allWavesSpawned() {
        return this.currentWaveIndex >= this.waves.length && Scheduler.pending === 0;
    },

    isComplete() {
        return this.allWavesSpawned() && Enemies.list.length === 0 && !this.bossActive;
    }
};


// ============================================================
//  LEVEL 1 DATA
// ============================================================
const LEVEL_1 = {
    id: 'level_1',
    name: 'First Contact',
    briefing: 'Unidentified hostile forces detected over Neo-Tokyo.\nYou are cleared for launch, pilot.',
    bgType: 'synthwave',
    bossType: 'architect',
    levelScale: 1.0,
    waves: [
        // INTRO (0-30s)
        { time: 0.5, enemies: [{ type: 'scout_drone', count: 5, formation: 'v_shape', movePath: 'straight_down' }] },
        { time: 3, enemies: [{ type: 'scout_drone', count: 4, formation: 'line', movePath: 'sweep_left', stagger: 300 }] },
        { time: 6, enemies: [{ type: 'scout_drone', count: 4, formation: 'line', movePath: 'sweep_right', stagger: 300 }] },
        { time: 9, enemies: [{ type: 'scout_drone', count: 6, formation: 'v_shape', movePath: 'zigzag' }] },
        { time: 13, enemies: [{ type: 'scout_drone', count: 8, formation: 'line', movePath: 'straight_down', stagger: 150 }] },

        // BUILD-UP (18-50s)
        { time: 18, enemies: [
            { type: 'scout_drone', count: 4, formation: 'v_shape', movePath: 'straight_down' },
            { type: 'gunship', count: 1, formation: 'random', movePath: 'strafe', delay: 500 }
        ]},
        { time: 24, enemies: [{ type: 'gunship', count: 2, formation: 'sides', movePath: 'strafe' }] },
        { time: 28, enemies: [
            { type: 'scout_drone', count: 6, formation: 'line', movePath: 'zigzag', stagger: 100 },
            { type: 'gunship', count: 1, formation: 'random', movePath: 'strafe', delay: 1000 }
        ]},
        { time: 34, enemies: [{ type: 'missile_turret', count: 1, formation: 'random', movePath: 'hover' }] },
        { time: 38, enemies: [
            { type: 'scout_drone', count: 5, formation: 'v_shape', movePath: 'sweep_left' },
            { type: 'gunship', count: 2, formation: 'random', movePath: 'strafe', delay: 800 }
        ]},
        { time: 44, enemies: [
            { type: 'missile_turret', count: 2, formation: 'line', movePath: 'hover' },
            { type: 'scout_drone', count: 4, formation: 'random', movePath: 'straight_down', delay: 500 }
        ]},

        // ESCALATION (50-90s)
        { time: 52, enemies: [{ type: 'phase_shifter', count: 1, formation: 'random', movePath: 'hover' }] },
        { time: 56, enemies: [
            { type: 'scout_drone', count: 6, formation: 'v_shape', movePath: 'zigzag' },
            { type: 'gunship', count: 2, formation: 'sides', movePath: 'strafe' }
        ]},
        { time: 62, enemies: [
            { type: 'phase_shifter', count: 2, formation: 'random', movePath: 'hover' },
            { type: 'scout_drone', count: 4, formation: 'line', movePath: 'straight_down', stagger: 200 }
        ]},
        { time: 70, enemies: [{ type: 'shielded_cruiser', count: 1, formation: 'random', movePath: 'hover' }] },
        { time: 75, enemies: [
            { type: 'phase_shifter', count: 1, formation: 'random', movePath: 'hover' },
            { type: 'gunship', count: 3, formation: 'random', movePath: 'strafe' }
        ]},
        { time: 82, enemies: [
            { type: 'shielded_cruiser', count: 1, formation: 'random', movePath: 'hover' },
            { type: 'scout_drone', count: 8, formation: 'line', movePath: 'zigzag', stagger: 100 }
        ]},

        // PRE-BOSS (90-100s) — generous drops
        { time: 92, enemies: [
            { type: 'gunship', count: 4, formation: 'line', movePath: 'strafe', stagger: 300 },
            { type: 'phase_shifter', count: 2, formation: 'random', movePath: 'hover', delay: 1000 },
            { type: 'scout_drone', count: 6, formation: 'v_shape', movePath: 'straight_down', delay: 500 }
        ]}
    ]
};


// ============================================================
//  LEVEL 2-6 DATA
// ============================================================
const LEVEL_2 = {
    id: 'level_2', name: 'The Gauntlet',
    briefing: 'The enemy has fortified the industrial sector.\nIntelligence suggests heavy artillery emplacements.\nPush through.',
    bgType: 'industrial',
    bossType: 'furnace',
    levelScale: 1.25,
    waves: [
        { time: 0.5, enemies: [{ type: 'scout_drone', count: 6, formation: 'v_shape', movePath: 'straight_down' }] },
        { time: 3, enemies: [{ type: 'scout_drone', count: 5, formation: 'line', movePath: 'zigzag', stagger: 200 }] },
        { time: 7, enemies: [{ type: 'gunship', count: 2, formation: 'sides', movePath: 'strafe' }] },
        { time: 11, enemies: [{ type: 'bomber', count: 1, formation: 'random', movePath: 'straight_down' }] },
        { time: 15, enemies: [{ type: 'scout_drone', count: 8, formation: 'line', movePath: 'sweep_left', stagger: 150 }, { type: 'sniper', count: 1, formation: 'random', movePath: 'hover', delay: 500 }] },
        { time: 20, enemies: [{ type: 'bomber', count: 2, formation: 'line', movePath: 'straight_down', stagger: 800 }] },
        { time: 25, enemies: [{ type: 'gunship', count: 3, formation: 'random', movePath: 'strafe' }, { type: 'sniper', count: 2, formation: 'random', movePath: 'hover', delay: 1000 }] },
        { time: 32, enemies: [{ type: 'missile_turret', count: 2, formation: 'line', movePath: 'hover' }, { type: 'bomber', count: 1, formation: 'random', movePath: 'straight_down', delay: 500 }] },
        { time: 38, enemies: [{ type: 'scout_drone', count: 10, formation: 'v_shape', movePath: 'zigzag', stagger: 100 }] },
        { time: 44, enemies: [{ type: 'sniper', count: 3, formation: 'line', movePath: 'hover' }, { type: 'gunship', count: 2, formation: 'sides', movePath: 'strafe', delay: 1000 }] },
        { time: 52, enemies: [{ type: 'bomber', count: 2, formation: 'random', movePath: 'straight_down' }, { type: 'missile_turret', count: 2, formation: 'random', movePath: 'hover', delay: 800 }] },
        { time: 60, enemies: [{ type: 'phase_shifter', count: 1, formation: 'random', movePath: 'hover' }, { type: 'sniper', count: 2, formation: 'random', movePath: 'hover', delay: 500 }] },
        { time: 68, enemies: [{ type: 'bomber', count: 3, formation: 'line', movePath: 'straight_down', stagger: 600 }, { type: 'scout_drone', count: 6, formation: 'v_shape', movePath: 'sweep_right', delay: 1000 }] },
        { time: 78, enemies: [{ type: 'shielded_cruiser', count: 1, formation: 'random', movePath: 'hover' }, { type: 'sniper', count: 2, formation: 'random', movePath: 'hover', delay: 1500 }] },
        { time: 88, enemies: [{ type: 'gunship', count: 4, formation: 'line', movePath: 'strafe', stagger: 300 }, { type: 'bomber', count: 2, formation: 'random', movePath: 'straight_down', delay: 1000 }] },
    ]
};

const LEVEL_3 = {
    id: 'level_3', name: 'Debris Field',
    briefing: "We've traced enemy signals to the orbital debris field.\nWatch for hazards — sensors are unreliable in there.",
    bgType: 'space',
    bossType: 'leviathan',
    levelScale: 1.5,
    hasAsteroids: true,
    waves: [
        { time: 1, enemies: [{ type: 'scout_drone', count: 4, formation: 'line', movePath: 'zigzag' }] },
        { time: 5, enemies: [{ type: 'scout_drone', count: 6, formation: 'v_shape', movePath: 'sweep_left', stagger: 200 }] },
        { time: 10, enemies: [{ type: 'carrier', count: 1, formation: 'random', movePath: 'hover' }] },
        { time: 16, enemies: [{ type: 'gunship', count: 3, formation: 'sides', movePath: 'strafe' }] },
        { time: 22, enemies: [{ type: 'scout_drone', count: 8, formation: 'line', movePath: 'straight_down', stagger: 120 }, { type: 'carrier', count: 1, formation: 'random', movePath: 'hover', delay: 1000 }] },
        { time: 30, enemies: [{ type: 'phase_shifter', count: 2, formation: 'random', movePath: 'hover' }] },
        { time: 36, enemies: [{ type: 'carrier', count: 2, formation: 'line', movePath: 'hover', stagger: 1500 }] },
        { time: 44, enemies: [{ type: 'missile_turret', count: 2, formation: 'random', movePath: 'hover' }, { type: 'scout_drone', count: 6, formation: 'v_shape', movePath: 'zigzag', delay: 500 }] },
        { time: 52, enemies: [{ type: 'gunship', count: 4, formation: 'random', movePath: 'strafe' }, { type: 'phase_shifter', count: 1, formation: 'random', movePath: 'hover', delay: 800 }] },
        { time: 60, enemies: [{ type: 'shielded_cruiser', count: 1, formation: 'random', movePath: 'hover' }, { type: 'carrier', count: 1, formation: 'random', movePath: 'hover', delay: 1000 }] },
        { time: 70, enemies: [{ type: 'phase_shifter', count: 3, formation: 'random', movePath: 'hover', stagger: 600 }] },
        { time: 80, enemies: [{ type: 'carrier', count: 2, formation: 'random', movePath: 'hover' }, { type: 'gunship', count: 3, formation: 'sides', movePath: 'strafe', delay: 1000 }] },
    ]
};

const LEVEL_4 = {
    id: 'level_4', name: 'The Convoy',
    briefing: 'Command is deploying the carrier AURORA through\ncontested airspace. Escort her through.\nShe cannot fall.',
    bgType: 'sky',
    bossType: 'interceptor_duo',
    levelScale: 1.8,
    hasEscort: true,
    waves: [
        { time: 1, enemies: [{ type: 'scout_drone', count: 6, formation: 'v_shape', movePath: 'straight_down' }] },
        { time: 5, enemies: [{ type: 'scout_drone', count: 4, formation: 'line', movePath: 'sweep_left', stagger: 200 }, { type: 'scout_drone', count: 4, formation: 'line', movePath: 'sweep_right', stagger: 200, delay: 500 }] },
        { time: 10, enemies: [{ type: 'gunship', count: 3, formation: 'random', movePath: 'strafe' }] },
        { time: 15, enemies: [{ type: 'shield_wall', count: 5, formation: 'line', movePath: 'straight_down', stagger: 100 }] },
        { time: 20, enemies: [{ type: 'bomber', count: 2, formation: 'random', movePath: 'straight_down' }, { type: 'scout_drone', count: 6, formation: 'v_shape', movePath: 'zigzag', delay: 500 }] },
        { time: 28, enemies: [{ type: 'shield_wall', count: 6, formation: 'line', movePath: 'straight_down', stagger: 80 }, { type: 'sniper', count: 2, formation: 'random', movePath: 'hover', delay: 1000 }] },
        { time: 35, enemies: [{ type: 'missile_turret', count: 2, formation: 'random', movePath: 'hover' }, { type: 'bomber', count: 2, formation: 'random', movePath: 'straight_down', delay: 800 }] },
        { time: 42, enemies: [{ type: 'phase_shifter', count: 2, formation: 'random', movePath: 'hover' }, { type: 'shield_wall', count: 4, formation: 'line', movePath: 'straight_down', delay: 500, stagger: 100 }] },
        { time: 50, enemies: [{ type: 'carrier', count: 1, formation: 'random', movePath: 'hover' }, { type: 'gunship', count: 3, formation: 'sides', movePath: 'strafe', delay: 1000 }] },
        { time: 58, enemies: [{ type: 'shielded_cruiser', count: 1, formation: 'random', movePath: 'hover' }, { type: 'bomber', count: 2, formation: 'random', movePath: 'straight_down', delay: 800 }] },
        { time: 68, enemies: [{ type: 'shield_wall', count: 8, formation: 'line', movePath: 'straight_down', stagger: 80 }, { type: 'phase_shifter', count: 2, formation: 'random', movePath: 'hover', delay: 1500 }] },
        { time: 78, enemies: [{ type: 'carrier', count: 2, formation: 'random', movePath: 'hover' }, { type: 'sniper', count: 3, formation: 'random', movePath: 'hover', delay: 1000 }] },
    ]
};

const LEVEL_5 = {
    id: 'level_5', name: 'The Core',
    briefing: "This is it. The signal origin — some kind of\nintelligence at the center of it all.\nEnd this.",
    bgType: 'digital',
    bossType: 'nexus',
    levelScale: 2.1,
    waves: [
        { time: 0.5, enemies: [{ type: 'phase_shifter', count: 2, formation: 'random', movePath: 'hover' }] },
        { time: 5, enemies: [{ type: 'scout_drone', count: 10, formation: 'line', movePath: 'zigzag', stagger: 80 }] },
        { time: 10, enemies: [{ type: 'shielded_cruiser', count: 1, formation: 'random', movePath: 'hover' }, { type: 'sniper', count: 2, formation: 'random', movePath: 'hover', delay: 500 }] },
        { time: 17, enemies: [{ type: 'bomber', count: 3, formation: 'line', movePath: 'straight_down', stagger: 500 }] },
        { time: 24, enemies: [{ type: 'carrier', count: 2, formation: 'random', movePath: 'hover', stagger: 2000 }] },
        { time: 32, enemies: [{ type: 'phase_shifter', count: 3, formation: 'random', movePath: 'hover', stagger: 500 }, { type: 'gunship', count: 4, formation: 'sides', movePath: 'strafe', delay: 1000 }] },
        { time: 40, enemies: [{ type: 'shielded_cruiser', count: 2, formation: 'line', movePath: 'hover', stagger: 2000 }] },
        { time: 48, enemies: [{ type: 'shield_wall', count: 8, formation: 'line', movePath: 'straight_down', stagger: 60 }, { type: 'bomber', count: 2, formation: 'random', movePath: 'straight_down', delay: 1000 }] },
        { time: 56, enemies: [{ type: 'carrier', count: 1, formation: 'random', movePath: 'hover' }, { type: 'phase_shifter', count: 2, formation: 'random', movePath: 'hover', delay: 800 }, { type: 'sniper', count: 3, formation: 'random', movePath: 'hover', delay: 1500 }] },
        { time: 66, enemies: [{ type: 'shielded_cruiser', count: 2, formation: 'random', movePath: 'hover' }, { type: 'missile_turret', count: 3, formation: 'line', movePath: 'hover', delay: 1000 }] },
        { time: 76, enemies: [{ type: 'bomber', count: 3, formation: 'random', movePath: 'straight_down', stagger: 400 }, { type: 'carrier', count: 2, formation: 'random', movePath: 'hover', delay: 1500 }, { type: 'phase_shifter', count: 2, formation: 'random', movePath: 'hover', delay: 2000 }] },
    ]
};

const LEVEL_6 = {
    id: 'level_6', name: 'SIGNAL LOST',
    briefing: "You weren't supposed to find this.\nThe signal continues. It was never the source.\nIt was a relay.\nWhatever is on the other side... it knows you're coming.",
    bgType: 'void',
    bossType: 'echo',
    levelScale: 2.5,
    waves: [
        { time: 1, enemies: [{ type: 'phase_shifter', count: 3, formation: 'random', movePath: 'hover', stagger: 400 }] },
        { time: 7, enemies: [{ type: 'scout_drone', count: 12, formation: 'v_shape', movePath: 'zigzag', stagger: 60 }] },
        { time: 13, enemies: [{ type: 'bomber', count: 3, formation: 'line', movePath: 'straight_down', stagger: 400 }, { type: 'sniper', count: 3, formation: 'random', movePath: 'hover', delay: 800 }] },
        { time: 20, enemies: [{ type: 'carrier', count: 2, formation: 'random', movePath: 'hover' }, { type: 'shielded_cruiser', count: 1, formation: 'random', movePath: 'hover', delay: 1000 }] },
        { time: 28, enemies: [{ type: 'shield_wall', count: 10, formation: 'line', movePath: 'straight_down', stagger: 50 }] },
        { time: 34, enemies: [{ type: 'phase_shifter', count: 4, formation: 'random', movePath: 'hover', stagger: 300 }, { type: 'bomber', count: 2, formation: 'random', movePath: 'straight_down', delay: 1000 }] },
        { time: 42, enemies: [{ type: 'shielded_cruiser', count: 2, formation: 'line', movePath: 'hover', stagger: 1500 }, { type: 'carrier', count: 2, formation: 'random', movePath: 'hover', delay: 1000 }] },
        { time: 52, enemies: [{ type: 'missile_turret', count: 3, formation: 'random', movePath: 'hover' }, { type: 'sniper', count: 4, formation: 'random', movePath: 'hover', delay: 500 }] },
        { time: 60, enemies: [{ type: 'bomber', count: 4, formation: 'random', movePath: 'straight_down', stagger: 300 }, { type: 'phase_shifter', count: 3, formation: 'random', movePath: 'hover', delay: 1500 }] },
        { time: 70, enemies: [{ type: 'carrier', count: 3, formation: 'random', movePath: 'hover', stagger: 1000 }, { type: 'shielded_cruiser', count: 2, formation: 'random', movePath: 'hover', delay: 2000 }] },
    ]
};

const ALL_LEVELS = [LEVEL_1, LEVEL_2, LEVEL_3, LEVEL_4, LEVEL_5, LEVEL_6];

// ============================================================
//  ENDLESS MODE WAVE GENERATOR
// ============================================================
const EndlessMode = {
    active: false,
    wave: 0,
    spawnTimer: 0,
    spawnInterval: 4.0,
    rank: 1.0, // Difficulty scaling — increases over time

    // Enemy pools by difficulty tier
    easyPool: ['scout_drone', 'scout_drone', 'gunship'],
    medPool: ['gunship', 'missile_turret', 'bomber', 'sniper', 'shield_wall'],
    hardPool: ['phase_shifter', 'shielded_cruiser', 'carrier'],

    // Formations and paths
    formations: ['line', 'v_shape', 'random', 'sides'],
    paths: ['straight_down', 'sweep_left', 'sweep_right', 'zigzag', 'strafe', 'hover'],

    init() {
        this.active = true;
        this.wave = 0;
        this.spawnTimer = 2.0; // Brief grace period
        this.spawnInterval = 4.0;
        this.rank = 1.0;
    },

    update(dt) {
        if (!this.active) return;

        // Rank increases over time
        this.rank = 1.0 + WaveSystem.levelTimer * 0.008; // ~1.5x at 1 min, ~2.0x at 2 min, etc.

        // Spawn waves on timer
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
            this._spawnWave();
            this.wave++;
            // Interval decreases with rank (faster spawns over time)
            this.spawnInterval = Math.max(1.5, 4.0 - this.rank * 0.3);
            this.spawnTimer = this.spawnInterval;
        }
    },

    _spawnWave() {
        const wave = this.wave;
        const rank = this.rank;

        // Determine enemy composition based on wave number
        const enemies = [];

        // Always some easy enemies
        const easyCount = Math.floor(3 + rank * 2);
        const easyType = this.easyPool[Math.floor(Math.random() * this.easyPool.length)];
        enemies.push({
            type: easyType, count: easyCount,
            formation: this.formations[Math.floor(Math.random() * this.formations.length)],
            movePath: this.paths[Math.floor(Math.random() * this.paths.length)],
            stagger: 150
        });

        // Add medium enemies after wave 3
        if (wave >= 3) {
            const medCount = Math.floor(1 + rank * 0.5);
            const medType = this.medPool[Math.floor(Math.random() * this.medPool.length)];
            enemies.push({
                type: medType, count: Math.min(medCount, 4),
                formation: 'random',
                movePath: this.paths[Math.floor(Math.random() * this.paths.length)],
                delay: 800
            });
        }

        // Add hard enemies after wave 8
        if (wave >= 8) {
            const hardType = this.hardPool[Math.floor(Math.random() * this.hardPool.length)];
            enemies.push({
                type: hardType, count: Math.min(Math.floor(rank * 0.3), 3),
                formation: 'random',
                movePath: 'hover',
                delay: 1500
            });
        }

        // Power-up drop every 3 waves
        if (wave % 3 === 2) {
            Scheduler.after(2, () => { PowerUps.spawn(PLAY_W * 0.3 + Math.random() * PLAY_W * 0.4, -10); });
        }

        // Spawn via WaveSystem-style spawning
        for (const group of enemies) {
            for (let i = 0; i < group.count; i++) {
                const spacing = PLAY_W / (group.count + 1);
                let x, y;
                switch (group.formation) {
                    case 'line': x = spacing * (i + 1); y = -20 - i * 15; break;
                    case 'v_shape': x = PLAY_W / 2 + (i - (group.count - 1) / 2) * 50; y = -20 - Math.abs(i - (group.count - 1) / 2) * 25; break;
                    case 'sides': x = i % 2 === 0 ? -15 : PLAY_W + 15; y = 60 + Math.floor(i / 2) * 40; break;
                    default: x = 40 + Math.random() * (PLAY_W - 80); y = -20 - Math.random() * 60; break;
                }
                const delay = (group.delay || 0) + i * (group.stagger || 200);
                Scheduler.after(delay / 1000, () => {
                    Enemies.spawn(group.type, x, y, group.movePath || 'straight_down');
                });
            }
        }
    }
};
