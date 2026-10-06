// ============================================================
//  MAIN GAME STATE MACHINE
// ============================================================
const Game = {
    state: 'title',
    lastTime: 0,
    endRunProcessed: false,
    pauseConfirm: null,
    currentLevelIndex: 0,
    briefingText: '',
    briefingTimer: 0,
    _pendingEndless: false,
    _pendingBossRush: false,
    _rushDifficulty: 'normal',
    _practice: null,            // Boss Practice setup (kept for RETRY and CHANGE SETUP)
    _practiceNewBest: false,
    _gameOverPending: false,

    async init() {
        Input.init();
        Audio.init();
        Background.init();
        await SaveData.migrate();
        await HighScores.load();
        await Settings.load();
        await NeonCredits.load();
        await Hangar.load();
        await Campaign.load();
        await Input.loadBindings();
        await Achievements.load();
        this.state = 'title';
        Menu.selectedIndex = 0;
    },

    // Level scaling. Genre shooters (Cave, Touhou) mostly escalate density and
    // pattern complexity; bullet speed stays readable, so it is capped.
    applyLevelScaling(scale, baseDensity) {
        const t = Math.max(0, scale - 1);
        GameConfig.bulletDensity = baseDensity * (1 + 0.5 * t);
        GameConfig._levelHpScale = 1 + 0.6 * t;
        GameConfig._levelSpeedScale = Math.min(1.2, 1 + 0.15 * t);   // enemy bullet speed
        GameConfig._levelFireRateScale = 1 + 0.2 * t;                // enemy fire frequency
    },

    // continuing: true only when advancing from a victory screen within one campaign run.
    // Level select, custom start, retry and restart all begin a fresh run.
    startLevel(levelIndex, difficulty, continuing) {
        SaveData.migrated = null;   // the title's save-update note has been seen
        if (difficulty !== 'custom') {
            GameConfig = JSON.parse(JSON.stringify(DIFFICULTY_PRESETS[difficulty]));
            GameConfig.difficulty = difficulty;
        } else {
            GameConfig = CustomDifficulty.getConfig();
        }
        GameConfig.fireMode = GameConfig.autofire ? 'auto' : Settings.values.fireMode;

        const levelData = ALL_LEVELS[levelIndex];
        this.currentLevelIndex = levelIndex;
        this.applyLevelScaling(levelData.levelScale || 1.0, GameConfig.bulletDensity || 1.0);

        // Carry-over between campaign levels: lives, bombs and weapons persist
        const carry = continuing ? {
            weapon: Player.primaryWeapon, level: Player.primaryLevel, drones: Player.droneLevel,
            lives: Player.lives, bombs: Player.bombs
        } : null;
        Player.init();
        if (carry) {
            Player.primaryWeapon = carry.weapon;
            Player.primaryLevel = carry.level;
            Player.droneLevel = carry.drones;
            Player.lives = carry.lives;
            Player.bombs = GameConfig.bombs.enabled ? Math.max(carry.bombs, GameConfig.bombs.startCount) : 0;
        } else if (this._retryLoadout && this._retryLoadout.levelIndex === levelIndex && levelIndex > 0) {
            // Retrying a later level after game over: minimum loadout (Raiden-style continue)
            Player.primaryWeapon = this._retryLoadout.weapon;
            Player.primaryLevel = this._retryLoadout.weapon === 'none' ? 0 : 2;
            Player.droneLevel = Math.min(1, this._retryLoadout.drones);
        }
        this._retryLoadout = null;

        // Score: keep cumulative score only when continuing a run
        if (continuing) {
            Scoring.softReset();
        } else {
            Scoring.reset();
        }
        Scoring.beginLevel();
        Scheduler.clear();
        Enemies.clear();
        Particles.clear();
        PowerUps.clear();
        Asteroids.clear();
        Escort.init();
        EndlessMode.active = false; // Ensure endless mode is off for campaign
        BossRush.active = false;
        Boss.active = false;
        Boss.defeated = false;
        WaveSystem.loadLevel(levelData);
        this._applyLevelLook(levelData);

        // Activate level-specific systems
        if (levelData.hasAsteroids) Asteroids.activate();
        if (levelData.hasEscort) Escort.activate();

        this.endRunProcessed = false; this._gameOverPending = false;
        this._lastWaveClearTimer = null;
        this._levelStartWeapon = Player.primaryWeapon;
        this._levelStartDrones = Player.droneLevel;
        this.state = 'playing';
    },

    // A level's backdrop, bloom, colour grade and chroma (campaign levels and Boss Rush stages)
    _applyLevelLook(lvl) {
        Background.init();
        Background.bgType = lvl.bgType || 'synthwave';
        Background._generateNearLayer(); // Regenerate silhouettes for new theme

        // Bloom intensity per level theme
        const bloomPresets = {
            synthwave:  { bloomScale: 0.9,  threshold: 0.4  },
            industrial: { bloomScale: 1.3,  threshold: 0.28 },
            space:      { bloomScale: 1.0,  threshold: 0.35 },
            sky:        { bloomScale: 0.85, threshold: 0.4  },
            digital:    { bloomScale: 1.1,  threshold: 0.32 },
            void:       { bloomScale: 1.6,  threshold: 0.22 }, // Glitch level — strongest bloom
        };
        const bp = bloomPresets[Background.bgType] || bloomPresets.synthwave;
        Renderer.setBloomIntensity(bp.bloomScale, bp.threshold);

        // Per-level colour grade for distinct mood
        const colorGradePresets = {
            synthwave:  { hue:  0,   saturate:  0.25, contrast: 0.1,  brightness:  0    },
            industrial: { hue:  6,   saturate:  0.3,  contrast: 0.15, brightness:  0.04 },
            space:      { hue:  0,   saturate:  0.15, contrast: 0.12, brightness:  0    },
            sky:        { hue: -6,   saturate:  0.1,  contrast: 0.1,  brightness:  0.03 },
            digital:    { hue:  0,   saturate:  0.25, contrast: 0.12, brightness:  0    },
            void:       { hue:  175, saturate: -0.25, contrast: 0.3,  brightness: -0.08 },
        };
        const cg = colorGradePresets[Background.bgType] || colorGradePresets.synthwave;
        Renderer.setColorGrade(cg);

        // Level 6 glitch atmosphere — persistent chromatic aberration
        Renderer.setPersistentChroma(Background.bgType === 'void' ? 0.003 : 0);
    },

    startGame(difficulty) {
        GameConfig = JSON.parse(JSON.stringify(DIFFICULTY_PRESETS[difficulty]));
        GameConfig.difficulty = difficulty;
        this.showBriefing(0);
    },

    startEndless(difficulty) {
        GameConfig = JSON.parse(JSON.stringify(DIFFICULTY_PRESETS[difficulty]));
        GameConfig.difficulty = difficulty;
        GameConfig.fireMode = GameConfig.autofire ? 'auto' : Settings.values.fireMode;
        GameConfig._baseDensity = GameConfig.bulletDensity;
        this.applyLevelScaling(1, GameConfig._baseDensity);
        this.currentLevelIndex = -1; // Flag for endless mode
        this._retryLoadout = null;
        Player.init();
        Scoring.reset();
        Scoring.beginLevel();
        Scheduler.clear();
        Enemies.clear();
        Particles.clear();
        PowerUps.clear();
        Asteroids.clear();
        Escort.init();
        Boss.active = false;
        Boss.defeated = false;
        WaveSystem.waves = [];
        WaveSystem.currentWaveIndex = 0;
        WaveSystem.levelTimer = 0;
        WaveSystem.waveTime = 0;
        WaveSystem.bossActive = false;
        EndlessMode.init();
        BossRush.active = false;
        Background.init();
        Background.bgType = 'synthwave';
        Background._generateNearLayer();
        this.endRunProcessed = false; this._gameOverPending = false;
        this._lastWaveClearTimer = null;
        this.state = 'playing';
    },

    // Boss Rush: the weapon pick comes first (an intermission), then the bosses in order
    startBossRush(difficulty) {
        SaveData.migrated = null;
        if (difficulty !== 'custom') {
            GameConfig = JSON.parse(JSON.stringify(DIFFICULTY_PRESETS[difficulty]));
            GameConfig.difficulty = difficulty;
        } else {
            GameConfig = CustomDifficulty.getConfig();
        }
        GameConfig.fireMode = GameConfig.autofire ? 'auto' : Settings.values.fireMode;
        GameConfig._baseDensity = GameConfig.bulletDensity || 1.0;
        this._rushDifficulty = difficulty;
        this._retryLoadout = null;
        EndlessMode.active = false;
        Player.init();
        Player.droneLevel = BossRush.START_DRONES;
        Scoring.reset();
        BossRush.begin();
        this._showRushIntermission();
    },

    // Boss Practice: one beaten boss, from a chosen phase, with a chosen loadout
    startPractice(setup) {
        SaveData.migrated = null;
        GameConfig = JSON.parse(JSON.stringify(DIFFICULTY_PRESETS[setup.difficulty]));
        GameConfig.difficulty = setup.difficulty;
        GameConfig.fireMode = GameConfig.autofire ? 'auto' : Settings.values.fireMode;
        GameConfig._baseDensity = GameConfig.bulletDensity || 1.0;
        this._retryLoadout = null;
        EndlessMode.active = false;
        Player.init();
        Player.primaryWeapon = setup.weapon;
        Player.primaryLevel = setup.weaponLevel;
        Player.droneLevel = setup.drones;
        Scoring.reset();
        BossRush.beginPractice(setup);
        this._beginRushStage();
    },

    // Between bosses: the next boss's backdrop plays behind the upgrade choice
    _showRushIntermission() {
        const lvl = BossRush.level();
        this.currentLevelIndex = BossRush.order[BossRush.stage];
        this._applyLevelLook(lvl);
        Scheduler.clear();
        Enemies.clear();
        Enemies.enemyBullets.clear();
        Player.bullets.clear();
        Particles.clear();
        PowerUps.clear();
        Boss.active = false;
        Boss.defeated = false;
        this.briefingTimer = 0;
        Menu.selectedIndex = 0;
        this.state = 'rush_intermission';
    },

    _beginRushStage() {
        const lvl = BossRush.level();
        this.currentLevelIndex = BossRush.order[BossRush.stage];
        this.applyLevelScaling(lvl.levelScale || 1.0, GameConfig._baseDensity);
        Scoring.softReset();
        Scoring.beginLevel();
        Scheduler.clear();
        Enemies.clear();
        Particles.clear();
        PowerUps.clear();
        Asteroids.clear();
        Escort.init();
        WaveSystem.waves = [];
        WaveSystem.currentWaveIndex = 0;
        WaveSystem.levelTimer = 0;
        WaveSystem.waveTime = 0;
        this._applyLevelLook(lvl);
        Player.x = PLAY_W / 2;
        Player.y = PLAY_H - 80;
        Player.bullets.clear();
        Boss.init(lvl.bossType || 'architect');
        const startPhase = BossRush.practice ? Math.min(BossRush.practice.phase, Boss.totalPhases) : 1;
        if (startPhase > 1) {
            // Practice from a later phase: that phase's HP, armour already gone
            Boss.phase = startPhase;
            Boss.hp = Boss.maxHp = Boss.phaseHps[startPhase - 1];
            Boss.armor = [];
        }
        Audio.playBossWarning();
        WaveSystem.bossActive = true;
        BossRush.stageTime = 0;
        this.endRunProcessed = false; this._gameOverPending = false;
        this._lastWaveClearTimer = null;
        this.state = 'playing';
    },

    // A Boss Rush boss is down: on to the next intermission, or the results
    _rushBossDown() {
        if (this.state !== 'playing') return;
        if (BossRush.practice) {
            BossRush.cleared();
            this._processEndRun(true);
            this.state = 'practice_complete';
            Menu.selectedIndex = 0;
            return;
        }
        if (BossRush.cleared()) {
            this._processEndRun(true);
            this.state = 'rush_complete';
            Menu.selectedIndex = 0;
            return;
        }
        BossRush.stage++;
        BossRush.rollChoices();
        Transition.start(() => this._showRushIntermission());
    },

    // Restart whatever mode the current run is in
    _restartRun() {
        const diff = GameConfig.difficulty;
        if (BossRush.practice) this.startPractice(BossRush.practice);
        else if (BossRush.active) this.startBossRush(this._rushDifficulty);
        else if (this.currentLevelIndex === -1) this.startEndless(diff);
        else this.startLevel(this.currentLevelIndex, diff, false);
    },

    showBriefing(levelIndex, continuing = false) {
        this._continuing = continuing;
        const level = ALL_LEVELS[levelIndex];
        this.briefingText = level.briefing || '';
        this.briefingTimer = 0;
        this.currentLevelIndex = levelIndex;
        // Clear the last level's GPU particles/bullets so the briefing backdrop is clean
        Particles.clear();
        Enemies.enemyBullets.clear();
        Player.bullets.clear();
        this.state = 'briefing';
    },

    _processEndRun(won) {
        if (this.endRunProcessed) return;
        this.endRunProcessed = true;
        NeonCredits.lastEarned = 0;   // only a run's end pays out

        if (BossRush.practice) {
            // Practice pays nothing and has no leaderboard; it keeps a best time
            EndRunBonus.bonuses = [];
            EndRunBonus.totalBonus = 0;
            const p = BossRush.practice;
            this._practiceNewBest = won && Campaign.recordPractice(p.difficulty, ALL_LEVELS[p.level].bossType, BossRush.time);
            return;
        }
        if (BossRush.active) {
            Scoring.score += BossRush.bonuses(won);
            NeonCredits.earn(Scoring.score, GameConfig.difficulty);
            const entry = {
                score: Scoring.score, maxChain: Scoring.maxChain, graze: Scoring.grazeCount, mode: 'bossrush',
                bosses: BossRush.splits.length, of: BossRush.order.length, time: +BossRush.time.toFixed(1), won,
            };
            // Custom difficulty has no leaderboard, as in the campaign
            if (GameConfig.difficulty !== 'custom' && HighScores.qualifies(Scoring.score, 'bossrush')) {
                HighScores.startInitialEntry(Scoring.score, 'bossrush', entry);
            }
            return;
        }

        const isEndless = this.currentLevelIndex === -1;

        // Bonuses count this level only (maxChain/grazeCount are whole-run totals)
        const noDeaths = Scoring.levelDeaths === 0;
        const bonus = EndRunBonus.calculate(
            won, Player.lives, Scoring.levelMaxChain, Scoring.levelGrazes, WaveSystem.levelTimer, noDeaths
        );
        Scoring.score += bonus;

        if (won) {
            Campaign.completeLevel(this.currentLevelIndex, GameConfig.difficulty);
            Achievements.onLevelComplete(this.currentLevelIndex, GameConfig.difficulty,
                noDeaths, Scoring.score, Scoring.maxChain, Scoring.grazeCount);
            if (Campaign.secretUnlocked) Achievements.onSecretUnlocked();

            // Record per-level best score
            if (!isEndless) {
                const isNewRecord = Campaign.recordLevelScore(
                    this.currentLevelIndex, Scoring.levelScore, Scoring.levelMaxChain,
                    Scoring.levelGrazes, Scoring.levelDeaths === 0 && Scoring.levelBombs === 0, GameConfig.difficulty
                );
                if (isNewRecord) {
                    Scoring.spawnPopup('NEW LEVEL RECORD!', '#00ff88', 20);
                }
            }
        }

        // Determine if this is a run-ending event (should record high score)
        const hasNextLevel = won && !isEndless && this.currentLevelIndex < Campaign.getLevelCount() - 1 &&
            Campaign.isLevelAvailable(this.currentLevelIndex + 1, GameConfig.difficulty === 'custom');
        const isRunEnd = !won || !hasNextLevel; // Game over OR final level

        if (isRunEnd) {
            NeonCredits.earn(Scoring.score, GameConfig.difficulty);

            // Record high score with run details
            const scoreEntry = {
                score: Scoring.score,
                maxChain: Scoring.maxChain,
                graze: Scoring.grazeCount,
                mode: isEndless ? 'endless' : 'campaign',
                levelReached: isEndless ? 0 : this.currentLevelIndex + 1,
                wave: isEndless ? EndlessMode.wave : 0,
                won: won
            };

            const board = isEndless ? 'endless' : GameConfig.difficulty;
            if (HighScores.qualifies(Scoring.score, board)) {
                HighScores.startInitialEntry(Scoring.score, board, scoreEntry);
            }
        }
    },

    BOSS_GRACE_SECONDS: 8,
    _lastWaveClearTimer: null,
    _continuing: false,
    _retryLoadout: null,

    // Called on game time (Scheduler), so it only fires while the level is being played
    _endLevel(won) {
        if (this.state !== 'playing') return;
        this._processEndRun(won);
        this.state = won ? 'victory' : 'game_over';
        Menu.selectedIndex = 0;
    },

    update(dt) {
        Input.update();
        Transition.update(dt);

        // Don't process game logic during transition fade
        if (Transition.active && Transition.phase === 'fade_out') return;

        switch (this.state) {
            case 'title':
                this._updateMenu(dt, 8);
                if (Input.isPressed('confirm')) {
                    if (Menu.selectedIndex === 2 && !BossRush.unlocked() && !BossRush.practiceLevels().length) {
                        Audio.playMenuNav();   // locked: the title explains how to unlock it
                        break;
                    }
                    Audio.playMenuSelect();
                    switch (Menu.selectedIndex) {
                        case 0: // New Game
                            this.state = 'difficulty_select';
                            Menu.selectedIndex = 1;
                            break;
                        case 1: // Endless Mode
                            this.state = 'difficulty_select';
                            this._pendingEndless = true;
                            Menu.selectedIndex = 1;
                            break;
                        case 2: // Boss modes: Rush and Practice
                            this.state = 'boss_menu';
                            Menu.selectedIndex = BossRush.unlocked() ? 0 : 1;
                            break;
                        case 3: // Hangar
                            this.state = 'hangar';
                            Hangar.categoryIndex = 0;
                            Hangar.mode = 'categories';
                            break;
                        case 4: // High Scores
                            this.state = 'high_scores';
                            Menu.selectedIndex = 0;
                            Menu.highScoreTab = 1;
                            break;
                        case 5: // Achievements
                            this.state = 'achievements';
                            Menu.selectedIndex = 0;
                            break;
                        case 6: // Settings
                            this.state = 'settings';
                            Settings.selectedIndex = 0;
                            break;
                        case 7: // How to Play
                            this.state = 'tutorial';
                            Tutorial.pageIndex = 0;
                            break;
                    }
                }
                break;

            case 'difficulty_select':
                this._updateMenu(dt, 5);
                if (Input.isPressed('confirm')) {
                    Audio.playMenuSelect();
                    const self = this;
                    const startWithDifficulty = (diff) => {
                        if (self._pendingEndless) {
                            self._pendingEndless = false;
                            Transition.start(() => { self.startEndless(diff); });
                        } else if (self._pendingBossRush) {
                            self._pendingBossRush = false;
                            Transition.start(() => { self.startBossRush(diff); });
                        } else {
                            GameConfig = JSON.parse(JSON.stringify(DIFFICULTY_PRESETS[diff]));
                            GameConfig.difficulty = diff;
                            if (Campaign.levelsUnlocked > 1) {
                                self.state = 'level_select';
                                Menu.selectedIndex = 0;
                            } else {
                                self.showBriefing(0);
                            }
                        }
                    };
                    switch (Menu.selectedIndex) {
                        case 0: startWithDifficulty('casual'); break;
                        case 1: startWithDifficulty('normal'); break;
                        case 2: startWithDifficulty('hardcore'); break;
                        case 3:
                            this.state = 'custom_difficulty';
                            CustomDifficulty.init();
                            break;
                        case 4:
                            this.state = this._pendingBossRush ? 'boss_menu' : 'title';
                            Menu.selectedIndex = 0;
                            this._pendingEndless = this._pendingBossRush = false;
                            break;
                    }
                }
                if (Input.isPressed('back') && this._pendingBossRush) {
                    this._pendingBossRush = false;
                    this.state = 'boss_menu';
                    Menu.selectedIndex = 0;
                    Audio.playMenuNav();
                } else if (Input.isPressed('back')) {
                    this._pendingEndless = false;
                    this.state = 'title';
                    Menu.selectedIndex = 0;
                    Audio.playMenuNav();
                }
                break;

            case 'custom_difficulty': {
                const cdResult = CustomDifficulty.update();
                if (cdResult === 'start' && this._pendingBossRush) {
                    this._pendingBossRush = false;
                    Transition.start(() => { this.startBossRush('custom'); });
                } else if (cdResult === 'start') {
                    GameConfig = CustomDifficulty.getConfig();
                    GameConfig.fireMode = Settings.values.fireMode;
                    this.currentLevelIndex = CustomDifficulty.startLevel || 0;
                    this.showBriefing(this.currentLevelIndex);
                } else if (cdResult === 'back') {
                    this.state = 'difficulty_select';
                    Menu.selectedIndex = 3;
                    Audio.playMenuNav();
                }
                break;
            }

            case 'hangar': {
                const hResult = Hangar.update();
                if (hResult === 'back') {
                    this.state = 'title';
                    Menu.selectedIndex = 3;
                    Audio.playMenuNav();
                }
                break;
            }

            case 'tutorial': {
                const tResult = Tutorial.update();
                if (tResult === 'back') {
                    this.state = 'title';
                    Menu.selectedIndex = 7;
                    Audio.playMenuNav();
                }
                break;
            }

            case 'level_select': {
                const levelCount = Campaign.getLevelCount();
                this._updateMenu(dt, levelCount + 1); // +1 for Back
                if (Input.isPressed('confirm')) {
                    Audio.playMenuSelect();
                    if (Menu.selectedIndex >= levelCount) {
                        this.state = 'difficulty_select';
                        Menu.selectedIndex = 0;
                    } else if (Campaign.isLevelAvailable(Menu.selectedIndex, false)) {
                        this.showBriefing(Menu.selectedIndex);
                    }
                }
                if (Input.isPressed('back')) {
                    this.state = 'difficulty_select';
                    Menu.selectedIndex = 0;
                    Audio.playMenuNav();
                }
                break;
            }

            case 'settings':
                const settingsResult = Settings.update();
                if (settingsResult === 'back') {
                    this.state = 'title';
                    Menu.selectedIndex = 6;
                    Audio.playMenuNav();
                } else if (settingsResult === 'controls') {
                    this.state = 'controls';
                    ControlsScreen.selectedIndex = 0;
                    ControlsScreen.mode = 'browse';
                }
                break;

            case 'controls': {
                const controlsResult = ControlsScreen.update();
                if (controlsResult === 'back') {
                    this.state = 'settings';
                    Audio.playMenuNav();
                }
                break;
            }

            case 'high_scores':
                if (Input.isPressed('left')) {
                    Menu.highScoreTab = (Menu.highScoreTab - 1 + 6) % 6;
                    Audio.playMenuNav();
                }
                if (Input.isPressed('right')) {
                    Menu.highScoreTab = (Menu.highScoreTab + 1) % 6;
                    Audio.playMenuNav();
                }
                if (Input.isPressed('back') || Input.isPressed('confirm')) {
                    this.state = 'title';
                    Menu.selectedIndex = 4;
                    Audio.playMenuNav();
                }
                break;

            case 'achievements':
                if (Input.isPressed('back') || Input.isPressed('confirm')) {
                    this.state = 'title';
                    Menu.selectedIndex = 5;
                    Audio.playMenuNav();
                }
                break;

            case 'briefing':
                this.briefingTimer += dt;
                Background.update(dt);   // keep the briefing backdrop moving
                if (Input.isPressed('confirm') || Input.isPressed('fire') || this.briefingTimer > 8) {
                    Audio.playMenuSelect();
                    const lvlIdx = this.currentLevelIndex;
                    const diff = GameConfig.difficulty;
                    const continuing = this._continuing;
                    Transition.start(() => {
                        this.startLevel(lvlIdx, diff, continuing);
                    }, 3.0);
                }
                if (Input.isPressed('back')) {
                    Transition.start(() => {
                        this.state = 'title'; Menu.selectedIndex = 0;
                    });
                }
                break;

            case 'playing':
                if (Input.isPressed('pause')) {
                    this.state = 'paused';
                    Menu.selectedIndex = 0;
                    Audio.playMenuNav();
                    break;
                }

                Background.update(dt);
                Player.update(dt);
                Enemies.update(dt, Player.x, Player.y);
                PowerUps.update(dt);
                Particles.update(dt);
                Scoring.update(dt);
                ScreenShake.update(dt);
                Renderer.updateEffects(dt);
                WaveSystem.update(dt);
                Scheduler.update(dt);
                Asteroids.update(dt);
                Escort.update(dt);

                // Endless mode wave generation — rank scales like a level, with density capped
                if (EndlessMode.active) {
                    EndlessMode.update(dt);
                    this.applyLevelScaling(EndlessMode.rank, GameConfig._baseDensity);
                    // Caps keep late Endless readable and killable; spawn rate and enemy mix
                    // keep escalating after these are reached
                    GameConfig.bulletDensity = Math.min(GameConfig.bulletDensity, GameConfig._baseDensity * 2.2);
                    GameConfig._levelHpScale = Math.min(GameConfig._levelHpScale, 3);
                    // Fire frequency too: uncapped, late Endless filled the 800-bullet pool
                    GameConfig._levelFireRateScale = Math.min(GameConfig._levelFireRateScale, 1.6);
                }

                // Asteroid collision with player bullets
                for (const a of Asteroids.list) {
                    if (!a.destructible) {
                        // Indestructible — check player collision only
                        const dx = a.x - Player.x, dy = a.y - Player.y;
                        if (dx * dx + dy * dy < (a.radius + Player.hitboxRadius) * (a.radius + Player.hitboxRadius)) {
                            Player._die();
                        }
                        continue;
                    }
                    for (const b of Player.bullets.pool) {
                        const dx = b.x - a.x, dy = b.y - a.y;
                        if (dx * dx + dy * dy < (b.radius + a.radius) * (b.radius + a.radius)) {
                            a.hp -= b.damage;
                            b.active = false;
                            Particles.impact(b);
                            break;
                        }
                    }
                    // Player collision with asteroid
                    const pdx = a.x - Player.x, pdy = a.y - Player.y;
                    if (pdx * pdx + pdy * pdy < (a.radius + Player.hitboxRadius) * (a.radius + Player.hitboxRadius)) {
                        Player._die();
                    }
                }

                // Escort failure check
                if (Escort.active && !Escort.alive) {
                    Escort.active = false; // prevent re-triggering
                    Scheduler.after(1.5, () => this._endLevel(false));
                }

                // Apply settings dynamically
                if (Settings.values.screenShake === 'off') { ScreenShake.offsetX = 0; ScreenShake.offsetY = 0; }
                else if (Settings.values.screenShake === 'low') { ScreenShake.offsetX *= 0.5; ScreenShake.offsetY *= 0.5; }

                // Boss trigger — campaign only. The boss comes once every wave has spawned and the
                // field is clear, or after a grace period (stragglers then retreat), so a level can't stall.
                if (!EndlessMode.active && !BossRush.active && !Boss.active && !Boss.defeated && WaveSystem.allWavesSpawned()) {
                    if (this._lastWaveClearTimer === null) this._lastWaveClearTimer = 0;
                    this._lastWaveClearTimer += dt;
                    if (Enemies.list.length === 0 || this._lastWaveClearTimer >= this.BOSS_GRACE_SECONDS) {
                        Enemies.retreatAll();
                        const levelData = ALL_LEVELS[this.currentLevelIndex];
                        Boss.init(levelData.bossType || 'architect');
                        Audio.playBossWarning();
                        WaveSystem.bossActive = true;
                    }
                }

                // Boss update
                if (Boss.active) {
                    // Boss Rush clock: runs while a boss is up and fighting
                    if (BossRush.active && Boss.entered && !Boss.defeated) {
                        BossRush.time += dt;
                        BossRush.stageTime += dt;
                    }
                    Boss.update(dt, Player.x, Player.y);
                    if (!Boss.active && Boss.defeated) {
                        WaveSystem.bossActive = false;
                        if (BossRush.active) Scheduler.after(1.5, () => this._rushBossDown());
                        else Scheduler.after(1.5, () => this._endLevel(true));
                    }
                }

                // Game over check — only trigger once
                if (Player.alive === false && Player.lives <= 0 && !this._gameOverPending) {
                    this._gameOverPending = true;
                    this._retryLoadout = { levelIndex: this.currentLevelIndex, weapon: this._levelStartWeapon || 'none', drones: this._levelStartDrones || 0 };
                    Scheduler.after(1.5, () => this._endLevel(false));
                }
                break;

            case 'paused':
                if (this.pauseConfirm) {
                    // Confirmation sub-state
                    if (Input.isPressed('confirm')) {
                        Audio.playMenuSelect();
                        if (this.pauseConfirm === 'restart') {
                            this.pauseConfirm = null;
                            Transition.start(() => this._restartRun());
                        } else if (this.pauseConfirm === 'quit') {
                            this.pauseConfirm = null;
                            Transition.start(() => { this.state = 'title'; Menu.selectedIndex = 0; });
                        }
                    }
                    if (Input.isPressed('back') || Input.isPressed('pause')) {
                        this.pauseConfirm = null;
                        Audio.playMenuNav();
                    }
                } else {
                    this._updateMenu(dt, 3);
                    if (Input.isPressed('confirm')) {
                        Audio.playMenuSelect();
                        switch (Menu.selectedIndex) {
                            case 0: this.state = 'playing'; break;
                            case 1: this.pauseConfirm = 'restart'; break;
                            case 2: this.pauseConfirm = 'quit'; break;
                        }
                    }
                    if (Input.isPressed('pause') || Input.isPressed('back')) {
                        this.state = 'playing';
                    }
                }
                break;

            case 'game_over':
                if (HighScores.enteringInitials) {
                    HighScores.updateInitialEntry();
                } else {
                    this._updateMenu(dt, 2);
                    if (Input.isPressed('confirm')) {
                        Audio.playMenuSelect();
                        switch (Menu.selectedIndex) {
                            case 0: Transition.start(() => this._restartRun()); break;
                            case 1: Transition.start(() => { this.state = 'title'; Menu.selectedIndex = 0; }); break;
                        }
                    }
                }
                break;

            case 'victory':
                if (HighScores.enteringInitials) {
                    HighScores.updateInitialEntry();
                } else {
                    const hasNextLevel = this.currentLevelIndex < Campaign.getLevelCount() - 1 &&
                        Campaign.isLevelAvailable(this.currentLevelIndex + 1, GameConfig.difficulty === 'custom');
                    const menuCount = hasNextLevel ? 3 : 2;
                    this._updateMenu(dt, menuCount);
                    if (Input.isPressed('confirm')) {
                        Audio.playMenuSelect();
                        const lvlIdx = this.currentLevelIndex;
                        const diff = GameConfig.difficulty;
                        if (hasNextLevel) {
                            switch (Menu.selectedIndex) {
                                case 0: Transition.start(() => { this.showBriefing(lvlIdx + 1, true); }); break;
                                case 1: Transition.start(() => { this.startLevel(lvlIdx, diff, false); }); break;
                                case 2: Transition.start(() => { this.state = 'title'; Menu.selectedIndex = 0; }); break;
                            }
                        } else {
                            switch (Menu.selectedIndex) {
                                case 0:
                                    Transition.start(() => {
                                        this.state = 'campaign_complete';
                                        this.briefingTimer = 0;
                                        Menu.selectedIndex = 0;
                                    });
                                    break;
                                case 1: Transition.start(() => { this.state = 'title'; Menu.selectedIndex = 0; }); break;
                            }
                        }
                    }
                }
                break;

            case 'boss_menu': {
                this._updateMenu(dt, 3);
                const back = () => { this.state = 'title'; Menu.selectedIndex = 2; Audio.playMenuNav(); };
                if (Input.isPressed('confirm')) {
                    const i = Menu.selectedIndex;
                    if (i === 0 && BossRush.unlocked()) {
                        Audio.playMenuSelect();
                        this.state = 'difficulty_select';
                        this._pendingBossRush = true;
                        Menu.selectedIndex = 1;
                    } else if (i === 1 && BossRush.practiceLevels().length) {
                        Audio.playMenuSelect();
                        this._openPracticeSetup();
                    } else if (i === 2) {
                        back();
                    } else {
                        Audio.playMenuNav();   // locked
                    }
                }
                if (Input.isPressed('back')) back();
                break;
            }

            case 'practice_setup':
                this._updatePracticeSetup(dt);
                break;

            case 'practice_complete':
                this._updateMenu(dt, 3);
                if (Input.isPressed('confirm')) {
                    Audio.playMenuSelect();
                    switch (Menu.selectedIndex) {
                        case 0: Transition.start(() => this.startPractice(BossRush.practice)); break;
                        case 1: Transition.start(() => this._openPracticeSetup()); break;
                        case 2: Transition.start(() => { this.state = 'title'; Menu.selectedIndex = 2; }); break;
                    }
                }
                break;

            case 'rush_intermission':
                this.briefingTimer += dt;
                Background.update(dt);
                this._updateMenu(dt, BossRush.choices.length);
                if (Input.isPressed('confirm') && this.briefingTimer > 0.4) {
                    Audio.playMenuSelect();
                    BossRush.apply(BossRush.choices[Menu.selectedIndex]);
                    Transition.start(() => this._beginRushStage());
                }
                if (Input.isPressed('back')) {
                    Transition.start(() => { this.state = 'title'; Menu.selectedIndex = 2; });
                }
                break;

            case 'rush_complete':
                if (HighScores.enteringInitials) {
                    HighScores.updateInitialEntry();
                } else {
                    this._updateMenu(dt, 2);
                    if (Input.isPressed('confirm')) {
                        Audio.playMenuSelect();
                        if (Menu.selectedIndex === 0) Transition.start(() => this.startBossRush(this._rushDifficulty));
                        else Transition.start(() => { this.state = 'title'; Menu.selectedIndex = 2; });
                    }
                }
                break;

            case 'campaign_complete':
                this.briefingTimer += dt;
                this._updateMenu(dt, 2);
                if (Input.isPressed('confirm')) {
                    Audio.playMenuSelect();
                    const diff = GameConfig.difficulty;
                    switch (Menu.selectedIndex) {
                        case 0: Transition.start(() => { this.startGame(diff); }); break;
                        case 1: Transition.start(() => { this.state = 'title'; Menu.selectedIndex = 0; }); break;
                    }
                }
                break;
        }
    },

    // --- Boss Practice setup: rows of ←/→ choices, then START / BACK ---
    PRACTICE_ROWS: ['boss', 'phase', 'difficulty', 'weapon', 'weaponLevel', 'drones', 'start', 'back'],

    _openPracticeSetup() {
        const levels = BossRush.practiceLevels();
        const p = this._practice || { level: levels[0], phase: 1, difficulty: 'normal', weapon: 'spread', weaponLevel: 3, drones: 2 };
        if (!levels.includes(p.level)) p.level = levels[0];
        this._practice = p;
        this.state = 'practice_setup';
        Menu.selectedIndex = this.PRACTICE_ROWS.indexOf('start');
    },

    _updatePracticeSetup(dt) {
        const rows = this.PRACTICE_ROWS;
        this._updateMenu(dt, rows.length);
        const p = this._practice, row = rows[Menu.selectedIndex];
        const step = Input.isPressed('right') ? 1 : (Input.isPressed('left') ? -1 : 0);
        const cycle = (list, v) => list[(list.indexOf(v) + step + list.length) % list.length];
        const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v + step));
        if (step) {
            Audio.playMenuNav();
            switch (row) {
                case 'boss': p.level = cycle(BossRush.practiceLevels(), p.level); p.phase = 1; break;
                case 'phase': p.phase = clamp(p.phase, 1, (BossTypes[ALL_LEVELS[p.level].bossType] || BossTypes.architect).phases); break;
                case 'difficulty': p.difficulty = cycle(['casual', 'normal', 'hardcore'], p.difficulty); break;
                case 'weapon': p.weapon = cycle(['spread', 'homing', 'laser'], p.weapon); break;
                case 'weaponLevel': p.weaponLevel = clamp(p.weaponLevel, 1, 5); break;
                case 'drones': p.drones = clamp(p.drones, 0, 5); break;
            }
        }
        if (Input.isPressed('confirm') && (row === 'start' || row === 'back')) {
            Audio.playMenuSelect();
            if (row === 'start') Transition.start(() => this.startPractice(this._practice));
            else { this.state = 'boss_menu'; Menu.selectedIndex = 1; }
        }
        if (Input.isPressed('back')) { this.state = 'boss_menu'; Menu.selectedIndex = 1; Audio.playMenuNav(); }
    },

    _updateMenu(dt, itemCount) {
        if (Input.isPressed('down')) {
            Menu.selectedIndex = (Menu.selectedIndex + 1) % itemCount;
            Audio.playMenuNav();
        }
        if (Input.isPressed('up')) {
            Menu.selectedIndex = (Menu.selectedIndex - 1 + itemCount) % itemCount;
            Audio.playMenuNav();
        }
    },

    draw() {
        ctx.clearRect(0, 0, SCREEN_W, SCREEN_H);
        HUD._drawn = false;

        switch (this.state) {
            case 'title':
                Menu.drawTitle(ctx);
                break;

            case 'difficulty_select':
                Menu.drawDifficultySelect(ctx);
                break;

            case 'settings':
                Settings.draw(ctx);
                break;

            case 'controls':
                ControlsScreen.draw(ctx);
                break;

            case 'high_scores':
                Menu.drawHighScores(ctx);
                break;

            case 'achievements':
                Menu.drawAchievements(ctx);
                break;

            case 'custom_difficulty':
                CustomDifficulty.draw(ctx);
                break;

            case 'hangar':
                Hangar.draw(ctx);
                break;

            case 'tutorial':
                Tutorial.draw(ctx);
                break;

            case 'level_select':
                Menu.drawLevelSelect(ctx);
                break;

            case 'briefing': {
                // The level's backdrop plays in the play area behind the briefing
                const lvl = ALL_LEVELS[this.currentLevelIndex];
                Background.bgType = (lvl && lvl.bgType) || 'synthwave';
                const pctx = Renderer.getPlayCtx();
                Renderer.beginFrame();
                Renderer.setShake(0, 0);
                Background.draw(pctx);
                Renderer.endFrame();
                if (!Renderer.usePixi) Renderer.blitToOverlay(ctx, PLAY_X, PLAY_Y);
                Menu.drawBriefing(ctx);
                break;
            }

            case 'playing':
            case 'paused': {
                const pctx = Renderer.getPlayCtx();
                Renderer.beginFrame();
                Renderer.setShake(ScreenShake.offsetX, ScreenShake.offsetY);
                const ectx = Renderer.getEntityCtx();
                Background.draw(pctx);
                Asteroids.draw(ectx);
                Escort.draw(ectx);
                PowerUps.draw(ectx);
                Enemies.draw(ectx);
                Player.draw(ectx);
                if (Boss.active) Boss.draw(ectx);
                Particles.draw(ectx);
                Scoring.drawPopups(ectx);
                if (Renderer.usePixi) {
                    Renderer.endFrame();
                } else {
                    Renderer.endFrame(); // Still composites glow + game
                    Renderer.blitToOverlay(ctx, PLAY_X + ScreenShake.offsetX, PLAY_Y + ScreenShake.offsetY);
                }
                HUD.draw(ctx);
                if (this.state === 'paused') Menu.drawPause(ctx);
                break;
            }

            case 'game_over': {
                const pctx = Renderer.getPlayCtx();
                Renderer.beginFrame();
                Renderer.setShake(0, 0);
                const ectx = Renderer.getEntityCtx();
                Background.draw(pctx);
                Asteroids.draw(ectx);
                Enemies.draw(ectx);
                Particles.draw(ectx);
                if (Renderer.usePixi) {
                    Renderer.endFrame();
                } else {
                    Renderer.endFrame();
                    Renderer.blitToOverlay(ctx, PLAY_X, PLAY_Y);
                }
                HUD.draw(ctx);
                Menu.drawGameOver(ctx);
                break;
            }

            case 'victory': {
                const pctx = Renderer.getPlayCtx(), ectx = Renderer.getEntityCtx();
                Renderer.beginFrame();
                Renderer.setShake(0, 0);
                Background.draw(pctx);
                Particles.draw(ectx);
                if (Renderer.usePixi) {
                    Renderer.endFrame();
                } else {
                    Renderer.endFrame();
                    Renderer.blitToOverlay(ctx, PLAY_X, PLAY_Y);
                }
                HUD.draw(ctx);
                Menu.drawVictory(ctx);
                break;
            }

            case 'boss_menu':
                Menu.drawBossMenu(ctx);
                break;

            case 'practice_setup':
                Menu.drawPracticeSetup(ctx);
                break;

            case 'practice_complete': {
                const pctx = Renderer.getPlayCtx(), ectx = Renderer.getEntityCtx();
                Renderer.beginFrame();
                Renderer.setShake(0, 0);
                Background.draw(pctx);
                Particles.draw(ectx);
                Renderer.endFrame();
                if (!Renderer.usePixi) Renderer.blitToOverlay(ctx, PLAY_X, PLAY_Y);
                HUD.draw(ctx);
                Menu.drawPracticeComplete(ctx);
                break;
            }

            case 'rush_intermission': {
                const pctx = Renderer.getPlayCtx();
                Renderer.beginFrame();
                Renderer.setShake(0, 0);
                Background.draw(pctx);
                Renderer.endFrame();
                if (!Renderer.usePixi) Renderer.blitToOverlay(ctx, PLAY_X, PLAY_Y);
                Menu.drawRushIntermission(ctx);
                break;
            }

            case 'rush_complete': {
                const pctx = Renderer.getPlayCtx(), ectx = Renderer.getEntityCtx();
                Renderer.beginFrame();
                Renderer.setShake(0, 0);
                Background.draw(pctx);
                Particles.draw(ectx);
                Renderer.endFrame();
                if (!Renderer.usePixi) Renderer.blitToOverlay(ctx, PLAY_X, PLAY_Y);
                HUD.draw(ctx);
                Menu.drawRushComplete(ctx);
                break;
            }

            case 'campaign_complete':
                Menu.drawCampaignComplete(ctx);
                break;
        }

        // Transition overlay — always drawn on top of everything
        Transition.draw(ctx);
        FpsMeter.draw(ctx);
        HUD.showBackground(HUD._drawn);
    }
};
