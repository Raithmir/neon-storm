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
    _gameOverPending: false,

    async init() {
        Input.init();
        Audio.init();
        Background.init();
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

    startLevel(levelIndex, difficulty, keepWeapons) {
        if (difficulty !== 'custom') {
            GameConfig = JSON.parse(JSON.stringify(DIFFICULTY_PRESETS[difficulty]));
            GameConfig.difficulty = difficulty;
        }
        GameConfig.fireMode = Settings.values.fireMode;

        const levelData = ALL_LEVELS[levelIndex];
        this.currentLevelIndex = levelIndex;

        // Apply level scaling — affects bullet density, enemy HP, and bullet speed
        const scale = levelData.levelScale || 1.0;
        GameConfig.bulletDensity = (GameConfig.bulletDensity || 1.0) * scale;
        // HP scales slightly faster than linear to compensate for weapon persistence
        GameConfig._levelHpScale = Math.pow(scale, 1.3);
        GameConfig._levelSpeedScale = 1 + (scale - 1) * 0.4;

        // Weapon persistence between levels — drop 1 level, keep type
        const prevWeapon = keepWeapons ? Player.primaryWeapon : 'none';
        const prevPrimaryLvl = keepWeapons ? Player.primaryLevel : 0;
        const prevDroneLvl = keepWeapons ? Player.droneLevel : 0;
        Player.init();
        if (keepWeapons && prevWeapon !== 'none') {
            Player.primaryWeapon = prevWeapon;
            Player.primaryLevel = Math.max(1, prevPrimaryLvl - 1); // Drop 1 level, minimum Lv1
            Player.droneLevel = Math.max(0, prevDroneLvl - 1);     // Drones also drop 1 level
        }

        // Score: full reset on fresh start, keep cumulative score when continuing
        if (keepWeapons) {
            Scoring.softReset(); // Keep score + max chain, reset per-level state
        } else {
            Scoring.reset(); // Full reset for fresh run
        }
        Enemies.clear();
        Particles.clear();
        PowerUps.clear();
        Asteroids.clear();
        Escort.init();
        EndlessMode.active = false; // Ensure endless mode is off for campaign
        Boss.active = false;
        Boss.defeated = false;
        WaveSystem.loadLevel(levelData);
        Background.init();
        Background.bgType = levelData.bgType || 'synthwave';
        Background._generateNearLayer(); // Regenerate silhouettes for new theme

        // Tune bloom per level theme — darker themes bloom harder
        const bloomPresets = {
            synthwave: { bloomScale: 0.7, threshold: 0.4 },
            ocean: { bloomScale: 0.8, threshold: 0.35 },
            volcanic: { bloomScale: 1.0, threshold: 0.3 },
            storm: { bloomScale: 0.9, threshold: 0.35 },
            frozen: { bloomScale: 0.7, threshold: 0.4 },
            void: { bloomScale: 1.2, threshold: 0.25 }, // Glitch level — strongest bloom
        };
        const bp = bloomPresets[Background.bgType] || bloomPresets.synthwave;
        Renderer.setBloomIntensity(bp.bloomScale, bp.threshold);

        // Level 6 glitch atmosphere — persistent chromatic aberration
        Renderer.setPersistentChroma(Background.bgType === 'void' ? 0.003 : 0);

        // Activate level-specific systems
        if (levelData.hasAsteroids) Asteroids.activate();
        if (levelData.hasEscort) Escort.activate();

        this.endRunProcessed = false; this._gameOverPending = false;
        this.state = 'playing';
    },

    startGame(difficulty) {
        GameConfig = JSON.parse(JSON.stringify(DIFFICULTY_PRESETS[difficulty]));
        GameConfig.difficulty = difficulty;
        this.showBriefing(0);
    },

    startEndless(difficulty) {
        GameConfig = JSON.parse(JSON.stringify(DIFFICULTY_PRESETS[difficulty]));
        GameConfig.difficulty = difficulty;
        GameConfig.fireMode = Settings.values.fireMode;
        GameConfig._levelHpScale = 1;
        GameConfig._levelSpeedScale = 1;
        this.currentLevelIndex = -1; // Flag for endless mode
        Player.init();
        Scoring.reset();
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
        WaveSystem.bossActive = false;
        EndlessMode.init();
        Background.init();
        Background.bgType = 'synthwave';
        Background._generateNearLayer();
        this.endRunProcessed = false; this._gameOverPending = false;
        this.state = 'playing';
    },

    showBriefing(levelIndex) {
        const level = ALL_LEVELS[levelIndex];
        this.briefingText = level.briefing || '';
        this.briefingTimer = 0;
        this.currentLevelIndex = levelIndex;
        this.state = 'briefing';
    },

    _processEndRun(won) {
        if (this.endRunProcessed) return;
        this.endRunProcessed = true;

        const isEndless = this.currentLevelIndex === -1;

        const bonus = EndRunBonus.calculate(
            won, Player.lives, Scoring.maxChain, Scoring.grazeCount, WaveSystem.levelTimer
        );
        Scoring.score += bonus;

        if (won) {
            Campaign.completeLevel(this.currentLevelIndex, GameConfig.difficulty);
            const noDeaths = Player.lives === GameConfig.lives;
            Achievements.onLevelComplete(this.currentLevelIndex, GameConfig.difficulty,
                noDeaths, Scoring.score, Scoring.maxChain, Scoring.grazeCount);
            if (Campaign.secretUnlocked) Achievements.onSecretUnlocked();

            // Record per-level best score
            if (!isEndless) {
                const isNewRecord = Campaign.recordLevelScore(
                    this.currentLevelIndex, Scoring.score, Scoring.maxChain,
                    Scoring.grazeCount, Scoring.isPerfect, GameConfig.difficulty
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

    update(dt) {
        Input.update();
        Transition.update(dt);

        // Don't process game logic during transition fade
        if (Transition.active && Transition.phase === 'fade_out') return;

        switch (this.state) {
            case 'title':
                this._updateMenu(dt, 7);
                if (Input.isPressed('confirm')) {
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
                        case 2: // Hangar
                            this.state = 'hangar';
                            Hangar.categoryIndex = 0;
                            Hangar.mode = 'categories';
                            break;
                        case 3: // High Scores
                            this.state = 'high_scores';
                            Menu.selectedIndex = 0;
                            Menu.highScoreTab = 1;
                            break;
                        case 4: // Achievements
                            this.state = 'achievements';
                            Menu.selectedIndex = 0;
                            break;
                        case 5: // Settings
                            this.state = 'settings';
                            Settings.selectedIndex = 0;
                            break;
                        case 6: // How to Play
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
                            this.state = 'title';
                            Menu.selectedIndex = 0;
                            break;
                    }
                }
                if (Input.isPressed('back')) {
                    this._pendingEndless = false;
                    this.state = 'title';
                    Menu.selectedIndex = 0;
                    Audio.playMenuNav();
                }
                break;

            case 'custom_difficulty': {
                const cdResult = CustomDifficulty.update();
                if (cdResult === 'start') {
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
                    Menu.selectedIndex = 2;
                    Audio.playMenuNav();
                }
                break;
            }

            case 'tutorial': {
                const tResult = Tutorial.update();
                if (tResult === 'back') {
                    this.state = 'title';
                    Menu.selectedIndex = 6;
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
                    Menu.selectedIndex = 5;
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
                    Menu.highScoreTab = (Menu.highScoreTab - 1 + 5) % 5;
                    Audio.playMenuNav();
                }
                if (Input.isPressed('right')) {
                    Menu.highScoreTab = (Menu.highScoreTab + 1) % 5;
                    Audio.playMenuNav();
                }
                if (Input.isPressed('back') || Input.isPressed('confirm')) {
                    this.state = 'title';
                    Menu.selectedIndex = 3;
                    Audio.playMenuNav();
                }
                break;

            case 'achievements':
                if (Input.isPressed('back') || Input.isPressed('confirm')) {
                    this.state = 'title';
                    Menu.selectedIndex = 4;
                    Audio.playMenuNav();
                }
                break;

            case 'briefing':
                this.briefingTimer += dt;
                if (Input.isPressed('confirm') || Input.isPressed('fire') || this.briefingTimer > 8) {
                    Audio.playMenuSelect();
                    const lvlIdx = this.currentLevelIndex;
                    const diff = GameConfig.difficulty;
                    const keep = lvlIdx > 0;
                    Transition.start(() => {
                        this.startLevel(lvlIdx, diff, keep);
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
                Asteroids.update(dt);
                Escort.update(dt);

                // Endless mode wave generation
                if (EndlessMode.active) {
                    EndlessMode.update(dt);
                    // Apply rank scaling to bullet density dynamically
                    GameConfig._levelHpScale = EndlessMode.rank;
                    GameConfig._levelSpeedScale = 1 + (EndlessMode.rank - 1) * 0.4;
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
                            Particles.spawn(b.x, b.y, 3, { color: '#886644', speed: 50, life: 0.15 });
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
                    setTimeout(() => {
                        if (this.state === 'playing') {
                            this._processEndRun(false);
                            this.state = 'game_over';
                            Menu.selectedIndex = 0;
                        }
                    }, 1500);
                    Escort.active = false; // prevent re-triggering
                }

                // Apply settings dynamically
                if (Settings.values.screenShake === 'off') { ScreenShake.offsetX = 0; ScreenShake.offsetY = 0; }
                else if (Settings.values.screenShake === 'low') { ScreenShake.offsetX *= 0.5; ScreenShake.offsetY *= 0.5; }

                // Boss trigger — only in campaign mode
                if (!EndlessMode.active && WaveSystem.currentWaveIndex >= WaveSystem.waves.length && Enemies.list.length === 0 && !Boss.active && !Boss.defeated) {
                    const levelData = ALL_LEVELS[this.currentLevelIndex];
                    Boss.init(levelData.bossType || 'architect');
                    WaveSystem.bossActive = true;
                }

                // Boss update
                if (Boss.active) {
                    Boss.update(dt, Player.x, Player.y);
                    if (!Boss.active && Boss.defeated) {
                        WaveSystem.bossActive = false;
                        setTimeout(() => {
                            if (this.state === 'playing') {
                                this._processEndRun(true);
                                this.state = 'victory';
                                Menu.selectedIndex = 0;
                            }
                        }, 1500);
                    }
                }

                // Game over check — only trigger once
                if (Player.alive === false && Player.lives <= 0 && this.state === 'playing' && !this._gameOverPending) {
                    this._gameOverPending = true;
                    setTimeout(() => {
                        if (this.state === 'playing') {
                            this._processEndRun(false);
                            this.state = 'game_over';
                            Menu.selectedIndex = 0;
                        }
                        this._gameOverPending = false;
                    }, 1500);
                }
                break;

            case 'paused':
                if (this.pauseConfirm) {
                    // Confirmation sub-state
                    if (Input.isPressed('confirm')) {
                        Audio.playMenuSelect();
                        if (this.pauseConfirm === 'restart') {
                            this.pauseConfirm = null;
                            const isEndless = this.currentLevelIndex === -1;
                            const diff = GameConfig.difficulty;
                            Transition.start(() => { isEndless ? this.startEndless(diff) : this.startLevel(this.currentLevelIndex, diff, false); });
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
                        const lvlIdx = this.currentLevelIndex;
                        const diff = GameConfig.difficulty;
                        const isEndless = lvlIdx === -1;
                        switch (Menu.selectedIndex) {
                            case 0: Transition.start(() => { isEndless ? this.startEndless(diff) : this.startLevel(lvlIdx, diff, false); }); break;
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
                                case 0: Transition.start(() => { this.showBriefing(lvlIdx + 1); }); break;
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

            case 'achievements': {
                const grad = ctx.createLinearGradient(0, 0, 0, SCREEN_H);
                grad.addColorStop(0, '#0a0620'); grad.addColorStop(1, '#1a0a3e');
                ctx.fillStyle = grad; ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
                ctx.textAlign = 'center';
                ctx.fillStyle = '#ffaa00'; ctx.font = 'bold 32px Share Tech Mono, Consolas, monospace';
                ctx.shadowColor = '#ffaa00'; ctx.shadowBlur = 10;
                ctx.fillText('ACHIEVEMENTS', SCREEN_W / 2, 70); ctx.shadowBlur = 0;
                const prog = Achievements.getProgress();
                ctx.fillStyle = '#aaaaaa'; ctx.font = '14px Share Tech Mono, Consolas, monospace';
                ctx.fillText(prog.unlocked + ' / ' + prog.total + ' UNLOCKED', SCREEN_W / 2, 100);
                // Grid of achievements
                const cols = 2;
                const colW = 400;
                const startX = SCREEN_W / 2 - colW;
                const startY = 135;
                const rowH = 48;
                Achievements.defs.forEach((def, i) => {
                    const col = i % cols;
                    const row = Math.floor(i / cols);
                    const x = startX + col * colW;
                    const y = startY + row * rowH;
                    const done = Achievements.isUnlocked(def.id);
                    // Background
                    if (done) {
                        ctx.fillStyle = 'rgba(255, 170, 0, 0.08)';
                        ctx.fillRect(x + 5, y, colW - 10, rowH - 4);
                    }
                    // Icon
                    ctx.font = '18px sans-serif';
                    ctx.textAlign = 'left';
                    ctx.fillStyle = done ? '#ffffff' : '#333344';
                    ctx.fillText(def.icon, x + 15, y + 22);
                    // Name
                    ctx.font = (done ? 'bold ' : '') + '13px Share Tech Mono, Consolas, monospace';
                    ctx.fillStyle = done ? '#ffaa00' : '#556677';
                    ctx.fillText(def.name, x + 45, y + 17);
                    // Description
                    ctx.font = '12px Share Tech Mono, Consolas, monospace';
                    ctx.fillStyle = done ? '#999999' : '#445566';
                    ctx.fillText(def.desc, x + 45, y + 34);
                    // Reward
                    ctx.textAlign = 'right';
                    ctx.fillStyle = done ? '#00ff88' : '#445566';
                    ctx.font = '12px Share Tech Mono, Consolas, monospace';
                    ctx.fillText((done ? '✓ ' : '') + def.reward + ' NC', x + colW - 15, y + 22);
                });
                ctx.textAlign = 'center';
                ctx.fillStyle = '#667788'; ctx.font = '13px Share Tech Mono, Consolas, monospace';
                ctx.fillText('ESC / ENTER TO RETURN', SCREEN_W / 2, SCREEN_H - 40);
                break;
            }

            case 'custom_difficulty':
                CustomDifficulty.draw(ctx);
                break;

            case 'hangar':
                Hangar.draw(ctx);
                break;

            case 'tutorial':
                Tutorial.draw(ctx);
                break;

            case 'level_select': {
                const grad = ctx.createLinearGradient(0, 0, 0, SCREEN_H);
                grad.addColorStop(0, '#0a0620'); grad.addColorStop(1, '#1a0a3e');
                ctx.fillStyle = grad; ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
                ctx.textAlign = 'center';
                ctx.fillStyle = '#00ffff'; ctx.font = 'bold 32px Share Tech Mono, Consolas, monospace';
                ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 10;
                ctx.fillText('SELECT LEVEL', SCREEN_W / 2, 100); ctx.shadowBlur = 0;
                ctx.fillStyle = '#aaaaaa'; ctx.font = '14px Share Tech Mono, Consolas, monospace';
                ctx.fillText('DIFFICULTY: ' + GameConfig.difficulty.toUpperCase(), SCREEN_W / 2, 135);
                const lvlCount = Campaign.getLevelCount();
                const startY = 200;
                for (let i = 0; i <= lvlCount; i++) {
                    const y = startY + i * 55;
                    const selected = i === Menu.selectedIndex;
                    if (i === lvlCount) {
                        ctx.fillStyle = selected ? '#00ffff' : '#667788';
                        ctx.font = selected ? 'bold 18px Share Tech Mono, Consolas, monospace' : '16px Share Tech Mono, Consolas, monospace';
                        ctx.fillText(selected ? '▸ BACK ◂' : 'BACK', SCREEN_W / 2, y);
                    } else {
                        const lvl = ALL_LEVELS[i];
                        const available = Campaign.isLevelAvailable(i, false);
                        const best = Campaign.getLevelBest(i, GameConfig.difficulty);
                        if (selected && available) {
                            ctx.strokeStyle = '#00ffff'; ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 8;
                            ctx.lineWidth = 1.5; ctx.strokeRect(SCREEN_W / 2 - 320, y - 22, 640, 44); ctx.shadowBlur = 0;
                        }
                        // Level name
                        ctx.textAlign = 'left';
                        ctx.fillStyle = !available ? '#334455' : selected ? '#ffffff' : '#99aabb';
                        ctx.font = selected ? 'bold 17px Share Tech Mono, Consolas, monospace' : '15px Share Tech Mono, Consolas, monospace';
                        const lockText = available ? '' : ' [LOCKED]';
                        ctx.fillText((i + 1) + ': ' + (lvl ? lvl.name.toUpperCase() : '') + lockText, SCREEN_W / 2 - 300, y);
                        // Best score (right-aligned)
                        if (best && available) {
                            ctx.textAlign = 'right';
                            ctx.fillStyle = selected ? '#ffff00' : '#888866';
                            ctx.font = '14px Share Tech Mono, Consolas, monospace';
                            ctx.fillText(best.score.toLocaleString(), SCREEN_W / 2 + 200, y - 5);
                            ctx.fillStyle = selected ? '#888888' : '#556655';
                            ctx.font = '11px Share Tech Mono, Consolas, monospace';
                            const extras = [];
                            if (best.maxChain > 0) extras.push('CHAIN:' + best.maxChain);
                            if (best.perfect) extras.push('★PERFECT');
                            ctx.fillText(extras.join('  '), SCREEN_W / 2 + 200, y + 10);
                        } else if (available) {
                            ctx.textAlign = 'right';
                            ctx.fillStyle = '#445555';
                            ctx.font = '12px Share Tech Mono, Consolas, monospace';
                            ctx.fillText('NO RECORD', SCREEN_W / 2 + 200, y);
                        }
                        ctx.textAlign = 'center';
                    }
                }
                ctx.fillStyle = '#667788'; ctx.font = '13px Share Tech Mono, Consolas, monospace';
                ctx.fillText('ESC BACK', SCREEN_W / 2, SCREEN_H - 50);
                break;
            }

            case 'briefing': {
                const grad = ctx.createLinearGradient(0, 0, 0, SCREEN_H);
                grad.addColorStop(0, '#0a0620'); grad.addColorStop(1, '#1a0a3e');
                ctx.fillStyle = grad; ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
                ctx.textAlign = 'center';
                const lvl = ALL_LEVELS[this.currentLevelIndex];
                ctx.fillStyle = '#888888'; ctx.font = '14px Share Tech Mono, Consolas, monospace';
                ctx.fillText('LEVEL ' + (this.currentLevelIndex + 1), SCREEN_W / 2, 350);
                ctx.fillStyle = '#00ffff'; ctx.font = 'bold 32px Share Tech Mono, Consolas, monospace';
                ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 10;
                ctx.fillText(lvl.name.toUpperCase(), SCREEN_W / 2, 390); ctx.shadowBlur = 0;
                const lines = (this.briefingText || '').split('\n');
                ctx.fillStyle = '#cccccc'; ctx.font = '15px Share Tech Mono, Consolas, monospace';
                lines.forEach((line, i) => ctx.fillText(line, SCREEN_W / 2, 440 + i * 24));
                ctx.fillStyle = '#778899'; ctx.font = '13px Share Tech Mono, Consolas, monospace';
                ctx.fillText('PRESS ENTER OR FIRE TO BEGIN', SCREEN_W / 2, 580);
                break;
            }

            case 'playing':
            case 'paused': {
                const pctx = Renderer.getPlayCtx();
                Renderer.beginFrame();
                Renderer.setShake(ScreenShake.offsetX, ScreenShake.offsetY);
                Background.draw(pctx);
                Asteroids.draw(pctx);
                Escort.draw(pctx);
                PowerUps.draw(pctx);
                Enemies.draw(pctx);
                Player.draw(pctx);
                if (Boss.active) Boss.draw(pctx);
                Particles.draw(pctx);
                Scoring.drawPopups(pctx);
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
                Background.draw(pctx);
                Asteroids.draw(pctx);
                Enemies.draw(pctx);
                Particles.draw(pctx);
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
                const pctx = Renderer.getPlayCtx();
                Renderer.beginFrame();
                Renderer.setShake(0, 0);
                Background.draw(pctx);
                Particles.draw(pctx);
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

            case 'campaign_complete': {
                // Animated celebration background
                const grad = ctx.createLinearGradient(0, 0, 0, SCREEN_H);
                grad.addColorStop(0, '#0a0620');
                grad.addColorStop(0.5, '#1a0a3e');
                grad.addColorStop(1, '#0a0620');
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

                // Animated particles in background
                const cTime = Game.briefingTimer;
                for (let i = 0; i < 30; i++) {
                    const px = (Math.sin(cTime * 0.5 + i * 1.7) * 0.5 + 0.5) * SCREEN_W;
                    const py = (Math.cos(cTime * 0.3 + i * 2.3) * 0.5 + 0.5) * SCREEN_H;
                    const hue = (cTime * 30 + i * 12) % 360;
                    ctx.fillStyle = `hsla(${hue}, 100%, 70%, 0.15)`;
                    ctx.beginPath();
                    ctx.arc(px, py, 2 + Math.sin(cTime + i) * 1.5, 0, Math.PI * 2);
                    ctx.fill();
                }

                ctx.textAlign = 'center';
                const isSecret = Game.currentLevelIndex === 5;

                // Title
                const titleHue = (cTime * 40) % 360;
                ctx.fillStyle = isSecret ? `hsl(${titleHue}, 100%, 70%)` : '#ffff00';
                ctx.shadowColor = isSecret ? `hsl(${titleHue}, 100%, 50%)` : '#ffff00';
                ctx.shadowBlur = 20 + Math.sin(cTime * 3) * 8;
                ctx.font = 'bold 48px Share Tech Mono, Consolas, monospace';
                ctx.fillText(isSecret ? 'SIGNAL TERMINATED' : 'CAMPAIGN COMPLETE', SCREEN_W / 2, 250);
                ctx.shadowBlur = 0;

                // Subtitle
                ctx.fillStyle = '#cccccc';
                ctx.font = '18px Share Tech Mono, Consolas, monospace';
                if (isSecret) {
                    ctx.fillText('You silenced the relay. The void is quiet...', SCREEN_W / 2, 300);
                    ctx.fillText('For now.', SCREEN_W / 2, 325);
                } else {
                    ctx.fillText('The threat has been neutralized.', SCREEN_W / 2, 300);
                    ctx.fillText('Outstanding work, pilot.', SCREEN_W / 2, 325);
                }

                // Stats
                ctx.fillStyle = '#888888';
                ctx.font = '14px Share Tech Mono, Consolas, monospace';
                ctx.fillText('DIFFICULTY: ' + GameConfig.difficulty.toUpperCase(), SCREEN_W / 2, 390);

                ctx.fillStyle = '#00ffff';
                ctx.font = 'bold 20px Share Tech Mono, Consolas, monospace';
                ctx.fillText('TOTAL SCORE: ' + Scoring.score.toLocaleString(), SCREEN_W / 2, 430);

                ctx.fillStyle = '#ffaa00';
                ctx.font = '16px Share Tech Mono, Consolas, monospace';
                ctx.fillText('NEON CREDITS: ' + NeonCredits.balance, SCREEN_W / 2, 465);

                // Secret level hint
                if (!isSecret && !Campaign.secretUnlocked) {
                    ctx.fillStyle = '#555566';
                    ctx.font = '13px Share Tech Mono, Consolas, monospace';
                    ctx.fillText('Something else is out there... beat all levels on Normal to find it.', SCREEN_W / 2, 520);
                } else if (!isSecret && Campaign.secretUnlocked) {
                    ctx.fillStyle = '#ff00ff';
                    ctx.font = 'bold 14px Share Tech Mono, Consolas, monospace';
                    ctx.fillText('SECRET LEVEL UNLOCKED: SIGNAL LOST', SCREEN_W / 2, 520);
                }

                // Thank you
                ctx.fillStyle = '#667788';
                ctx.font = '14px Share Tech Mono, Consolas, monospace';
                ctx.fillText('Thank you for playing Neon Storm \u03b2', SCREEN_W / 2, 580);
                ctx.fillText('This is a beta build \u2014 more to come!', SCREEN_W / 2, 605);

                // Menu options
                const items = ['PLAY AGAIN', 'MAIN MENU'];
                const startY = 680;
                for (let i = 0; i < items.length; i++) {
                    const selected = i === Menu.selectedIndex;
                    if (selected) {
                        ctx.fillStyle = '#00ffff';
                        ctx.font = 'bold 20px Share Tech Mono, Consolas, monospace';
                        ctx.fillText('▸ ' + items[i] + ' ◂', SCREEN_W / 2, startY + i * 45);
                    } else {
                        ctx.fillStyle = '#667788';
                        ctx.font = '16px Share Tech Mono, Consolas, monospace';
                        ctx.fillText(items[i], SCREEN_W / 2, startY + i * 45);
                    }
                }
                break;
            }
        }

        // Transition overlay — always drawn on top of everything
        Transition.draw(ctx);
    }
};
