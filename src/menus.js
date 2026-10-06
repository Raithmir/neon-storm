// ============================================================
//  MENU SYSTEM
//  Screens are drawn with the UI kit (ui-kit.js). `items` is set while
//  drawing and read by Game.update() for navigation, so keep the lists
//  and their order in step with the handlers there.
// ============================================================
const Menu = {
    selectedIndex: 0,
    items: [],

    drawTitle(ctx) {
        UI.background(ctx);
        const t = UI.time();

        // Logo
        const cx = SCREEN_W / 2;
        const bob = Renderer.calm() ? 0 : Math.sin(t * 1.3) * 4;
        Neon.text(ctx, 'NEON STORM', cx - 26, 200 + bob, UI.CYAN, 110, { core: 0.5, halo: 0.55 });
        Neon.text(ctx, 'δ', cx + 350, 150 + bob, UI.MAGENTA, 56, { core: 0.4 });
        Neon.text(ctx, 'BULLET HELL SHOOTER', cx, 250, UI.MAGENTA, 20, { weight: '', halo: 0.3, core: 0 });

        // The player's ship hovering over the grid, engines lit
        const sy = 870 + (Renderer.calm() ? 0 : Math.sin(t * 2) * 6);
        const f = Math.sin(t * 30) * 3;
        Neon.flame(ctx, cx - 20, sy + 30, 9, 26 + f, Hangar.trailColor, 0.9);
        Neon.flame(ctx, cx + 20, sy + 30, 9, 26 - f, Hangar.trailColor, 0.9);
        UI.ship(ctx, cx, sy, 44);

        // Menu
        this.items = ['NEW GAME', 'ENDLESS MODE', 'HANGAR', 'HIGH SCORES', 'ACHIEVEMENTS', 'SETTINGS', 'HOW TO PLAY'];
        UI.panel(ctx, cx - 250, 300, 500, 415, UI.CYAN, { fill: 'rgba(6, 2, 20, 0.6)' });
        for (let i = 0; i < this.items.length; i++) {
            UI.item(ctx, this.items[i], cx, 358 + i * 54, i === this.selectedIndex, { w: 440 });
        }

        if (SaveData.migrated) {
            UI.label(ctx, 'SAVE UPDATED FOR γ — HIGH SCORES AND LEVEL RECORDS RESET FOR THE NEW SCORING', cx, 752, '#ffdd44', 14);
            UI.label(ctx, 'YOUR UNLOCKS, CREDITS, COSMETICS AND ACHIEVEMENTS ARE KEPT', cx, 774, UI.DIM, 13);
        }
        UI.hint(ctx, 'ARROW KEYS / D-PAD TO SELECT  •  ENTER TO CONFIRM', SCREEN_H - 48);
        UI.label(ctx, 'DELTA BUILD — WORK IN PROGRESS', SCREEN_W / 2, SCREEN_H - 22, UI.MAGENTA, 13);
    },

    drawDifficultySelect(ctx) {
        UI.background(ctx, { dim: 0.45 });
        UI.title(ctx, 'SELECT DIFFICULTY', 130);

        this.items = ['CASUAL', 'NORMAL', 'HARDCORE', 'CUSTOM', 'BACK'];
        const descs = [
            '0.5x SCORE  •  5 LIVES  •  ALL ASSISTS ON',
            '1.0x SCORE  •  3 LIVES  •  STANDARD EXPERIENCE',
            '2.0x SCORE  •  1 LIFE  •  NO BOMBS OR FOCUS',
            'MIX AND MATCH  •  NO LEADERBOARD',
            '',
        ];
        const colors = ['#00ff88', '#ffee33', '#ff3355', '#cc44ff', UI.DIM];
        const cx = SCREEN_W / 2;
        for (let i = 0; i < this.items.length; i++) {
            const y = 270 + i * 120;
            const selected = i === this.selectedIndex;
            if (i < 4) UI.panel(ctx, cx - 330, y - 52, 660, 98, colors[i], { fill: selected ? 'rgba(10, 4, 30, 0.85)' : 'rgba(6, 2, 18, 0.55)' });
            UI.item(ctx, this.items[i], cx, y, selected, { w: 600, color: colors[i], desc: descs[i], size: 28 });
        }
        UI.hint(ctx, 'ESC TO GO BACK');
    },

    // Results panel shared by game over and mission complete. Returns the y after the totals.
    _results(ctx, top, heading, headingColor, scoreColor, footerH) {
        const cx = SCREEN_W / 2;
        const nB = EndRunBonus.bonuses.length;
        const subH = this._resultsSub ? this._resultsSub.length * 26 : 0;
        const h = 110 + subH + 104 + nB * 28 + (nB ? 22 : 0) + 84 + footerH;
        UI.panel(ctx, cx - 360, top, 720, h, headingColor);
        Neon.text(ctx, heading, cx, top + 72, headingColor, 58, { core: 0.45, halo: 0.55 });
        let y = top + 110;
        if (this._resultsSub) {
            for (const line of this._resultsSub) {
                UI.label(ctx, line[0], cx, y, line[1] || UI.TEXT, line[2] || 17);
                y += 26;
            }
        }
        UI.label(ctx, 'SCORE', cx, y + 24, UI.DIM, 15);
        Neon.text(ctx, Scoring.score.toLocaleString(), cx, y + 66, scoreColor, 42, { core: 0.4 });
        const bonusEndY = EndRunBonus.draw(ctx, cx, y + 104);
        const totalScore = Scoring.score + EndRunBonus.totalBonus;
        Neon.text(ctx, 'TOTAL  ' + totalScore.toLocaleString(), cx, bonusEndY + 22, '#ffee33', 28, { core: 0.35 });
        const ncEarned = Math.floor(totalScore / 3000 * GameConfig.scoreMultiplier);
        UI.label(ctx, '+ ' + ncEarned + ' NEON CREDITS', cx, bonusEndY + 54, '#ffaa00', 17);
        return bonusEndY + 70;
    },

    drawGameOver(ctx) {
        UI.dim(ctx, 0.82);
        const isEndless = Game.currentLevelIndex === -1;
        this._resultsSub = null;
        if (isEndless) {
            const mins = Math.floor(WaveSystem.levelTimer / 60);
            const secs = Math.floor(WaveSystem.levelTimer % 60);
            this._resultsSub = [
                ['ENDLESS MODE — WAVE ' + EndlessMode.wave, '#ffaa00', 20],
                ['SURVIVED ' + mins + ':' + secs.toString().padStart(2, '0'), UI.TEXT, 16],
            ];
        }
        const endY = this._results(ctx, 120, 'GAME OVER', '#ff2255', UI.CYAN, HighScores.enteringInitials ? 190 : 130);

        if (HighScores.enteringInitials) {
            HighScores.drawInitialEntry(ctx, SCREEN_W / 2, endY + 20);
        } else {
            this.items = ['RETRY', 'MAIN MENU'];
            for (let i = 0; i < this.items.length; i++) {
                UI.item(ctx, this.items[i], SCREEN_W / 2, endY + 40 + i * 50, i === this.selectedIndex, { w: 380, size: 22 });
            }
        }
    },

    drawVictory(ctx) {
        UI.dim(ctx, 0.78);
        const lvl = ALL_LEVELS[Game.currentLevelIndex];
        this._resultsSub = [['LEVEL ' + (Game.currentLevelIndex + 1) + ' — ' + (lvl ? lvl.name.toUpperCase() : ''), UI.TEXT, 17]];
        const endY = this._results(ctx, 120, 'MISSION COMPLETE', UI.CYAN, '#ffee33', HighScores.enteringInitials ? 190 : 170);

        if (HighScores.enteringInitials) {
            HighScores.drawInitialEntry(ctx, SCREEN_W / 2, endY + 20);
        } else {
            const hasNextLevel = Game.currentLevelIndex < Campaign.getLevelCount() - 1 &&
                Campaign.isLevelAvailable(Game.currentLevelIndex + 1, GameConfig.difficulty === 'custom');
            this.items = hasNextLevel ? ['NEXT LEVEL', 'RETRY', 'MAIN MENU'] :
                (Game.currentLevelIndex >= 4 ? ['CONTINUE...', 'MAIN MENU'] : ['RETRY', 'MAIN MENU']);
            for (let i = 0; i < this.items.length; i++) {
                UI.item(ctx, this.items[i], SCREEN_W / 2, endY + 40 + i * 48, i === this.selectedIndex, {
                    w: 380, size: 22, color: this.items[i] === 'NEXT LEVEL' ? '#00ff88' : UI.CYAN,
                });
            }
        }
    },

    // --- Mission briefing: the level's live backdrop fills the play area ---
    drawBriefing(ctx) {
        const idx = Game.currentLevelIndex;
        const lvl = ALL_LEVELS[idx];
        const t = Game.briefingTimer;
        const inK = Math.min(1, t * 2);
        // Side panels
        const side = ctx.createLinearGradient(0, 0, 0, SCREEN_H);
        side.addColorStop(0, '#06020f'); side.addColorStop(1, '#12052a');
        ctx.fillStyle = side;
        ctx.fillRect(0, 0, PLAY_X, SCREEN_H);
        ctx.fillRect(PLAY_X + PLAY_W, 0, SCREEN_W - PLAY_X - PLAY_W, SCREEN_H);
        // Let the backdrop show through, darkened for the text
        ctx.fillStyle = 'rgba(3, 0, 10, 0.45)';
        ctx.fillRect(PLAY_X, PLAY_Y, PLAY_W, PLAY_H);

        ctx.globalAlpha = inK;
        const cx = SCREEN_W / 2;
        UI.label(ctx, 'LEVEL ' + (idx + 1) + ' / ' + Campaign.getLevelCount(), cx, 250, UI.MAGENTA, 18);
        Neon.text(ctx, lvl.name.toUpperCase(), cx, 312, UI.CYAN, 54, { core: 0.45, halo: 0.55 });
        UI.panel(ctx, cx - 320, 360, 640, 190, UI.CYAN, { title: 'BRIEFING' });
        const lines = (Game.briefingText || '').split('\n');
        // Type the briefing out
        let chars = Renderer.calm() ? 1e9 : Math.floor(t * 70);
        lines.forEach((line, i) => {
            const shown = line.slice(0, Math.max(0, chars));
            chars -= line.length;
            Neon.text(ctx, shown, cx, 425 + i * 34, UI.TEXT, 20, { weight: '', halo: 0 });
        });

        // Campaign progress (left)
        const lx = PLAY_X / 2;
        UI.panel(ctx, lx - 220, 260, 440, 70 + Campaign.getLevelCount() * 56, UI.MAGENTA, { title: 'CAMPAIGN' });
        for (let i = 0; i < Campaign.getLevelCount(); i++) {
            const L = ALL_LEVELS[i];
            const y = 330 + i * 56;
            const cur = i === idx, done = i < idx;
            UI.pip(ctx, lx - 180, y - 6, 7, cur ? UI.CYAN : UI.MAGENTA, cur || done);
            Neon.text(ctx, (i + 1) + '  ' + (L ? L.name.toUpperCase() : ''), lx - 158, y, cur ? '#ffffff' : (done ? UI.TEXT : UI.DIM), cur ? 20 : 17,
                { align: 'left', halo: cur ? 0.35 : 0, weight: cur ? 'bold' : '' });
        }

        // Threat assessment (right): the level's boss in neon
        const rx = PLAY_X + PLAY_W + (SCREEN_W - PLAY_X - PLAY_W) / 2;
        const def = BossTypes[lvl.bossType] || BossTypes.architect;
        UI.panel(ctx, rx - 220, 260, 440, 440, '#ff2255', { title: 'THREAT' });
        const fake = Object.create(Boss);
        fake.moveTimer = t; fake.phase = 1; fake.x = rx; fake.bossType = lvl.bossType;
        ctx.save();
        ctx.translate(rx, 470);
        ctx.scale(1.7, 1.7);
        const draw = Boss._neon[lvl.bossType] || Boss._neon.architect;
        draw.call(fake, ctx, Boss.radius, def.colors[0], false);
        ctx.restore();
        Neon.text(ctx, def.name, rx, 650, '#ff2255', 26, { core: 0.35 });
        UI.label(ctx, def.phases + ' PHASES', rx, 680, UI.DIM, 15);

        // Start prompt with an auto-start countdown
        ctx.globalAlpha = inK * (Renderer.calm() ? 1 : 0.7 + Math.sin(t * 5) * 0.3);
        Neon.text(ctx, UI.keys('PRESS ENTER OR FIRE TO LAUNCH'), cx, 850, '#ffffff', 22, { halo: 0.3 });
        ctx.globalAlpha = inK;
        Neon.bar(ctx, cx - 180, 880, 360, 4, Math.min(1, t / 8), UI.CYAN, 0);
        ctx.globalAlpha = 1;
    },

    drawLevelSelect(ctx) {
        UI.background(ctx, { dim: 0.55 });
        UI.title(ctx, 'SELECT LEVEL', 110);
        UI.label(ctx, 'DIFFICULTY: ' + GameConfig.difficulty.toUpperCase(), SCREEN_W / 2, 160, UI.TEXT, 17);
        const cx = SCREEN_W / 2;
        const lvlCount = Campaign.getLevelCount();
        UI.panel(ctx, cx - 400, 200, 800, lvlCount * 76 + 40, UI.CYAN);
        for (let i = 0; i <= lvlCount; i++) {
            const y = 250 + i * 76;
            const selected = i === Menu.selectedIndex;
            if (i === lvlCount) {
                UI.item(ctx, 'BACK', cx, y + 20, selected, { w: 400, size: 20 });
                continue;
            }
            const lvl = ALL_LEVELS[i];
            const available = Campaign.isLevelAvailable(i, false);
            const best = Campaign.getLevelBest(i, GameConfig.difficulty);
            if (selected) {
                ctx.fillStyle = available ? UI.CYAN : UI.DIM;
                ctx.globalAlpha = 0.12;
                ctx.fillRect(cx - 380, y - 32, 760, 60);
                ctx.globalAlpha = 1;
                ctx.fillRect(cx - 380, y - 32, 3, 60);
            }
            Neon.text(ctx, (i + 1) + '  ' + (lvl ? lvl.name.toUpperCase() : '') + (available ? '' : '   [LOCKED]'), cx - 350, y + 4,
                !available ? '#3a4458' : selected ? '#ffffff' : UI.TEXT, selected ? 24 : 21, { align: 'left', halo: selected && available ? 0.3 : 0, weight: selected ? 'bold' : '' });
            if (best && available) {
                Neon.text(ctx, best.score.toLocaleString(), cx + 350, y - 2, selected ? '#ffee33' : '#bbaa55', 20, { align: 'right', halo: 0 });
                const extras = [];
                if (best.maxChain > 0) extras.push('CHAIN ' + best.maxChain);
                if (best.perfect) extras.push('★ PERFECT');
                UI.label(ctx, extras.join('   '), cx + 350, y + 20, UI.DIM, 13, 'right');
            } else if (available) {
                UI.label(ctx, 'NO RECORD', cx + 350, y + 4, UI.DIM, 15, 'right');
            }
        }
        UI.hint(ctx, 'ESC BACK');
    },

    drawAchievements(ctx) {
        UI.background(ctx, { dim: 0.6 });
        UI.title(ctx, 'ACHIEVEMENTS', 90, '#ffaa00');
        const prog = Achievements.getProgress();
        UI.label(ctx, prog.unlocked + ' / ' + prog.total + ' UNLOCKED', SCREEN_W / 2, 140, UI.TEXT, 17);
        Neon.bar(ctx, SCREEN_W / 2 - 200, 154, 400, 5, prog.unlocked / Math.max(1, prog.total), '#ffaa00', 0);
        const cols = 2, colW = 560, rowH = 70;
        const startX = SCREEN_W / 2 - colW, startY = 185;
        Achievements.defs.forEach((def, i) => {
            const x = startX + (i % cols) * colW;
            const y = startY + Math.floor(i / cols) * rowH;
            const done = Achievements.isUnlocked(def.id);
            UI.panel(ctx, x + 8, y, colW - 16, rowH - 10, done ? '#ffaa00' : '#3a4458', { fill: done ? 'rgba(40, 20, 0, 0.55)' : 'rgba(6, 2, 18, 0.55)' });
            ctx.font = '24px sans-serif';
            ctx.textAlign = 'center';
            ctx.globalAlpha = done ? 1 : 0.3;
            ctx.fillStyle = '#ffffff';
            ctx.fillText(def.icon, x + 42, y + 40);
            ctx.globalAlpha = 1;
            Neon.text(ctx, def.name, x + 72, y + 27, done ? '#ffaa00' : UI.DIM, 17, { align: 'left', halo: done ? 0.25 : 0 });
            Neon.text(ctx, def.desc, x + 72, y + 48, done ? UI.TEXT : '#4a5468', 14, { align: 'left', halo: 0, weight: '' });
            Neon.text(ctx, (done ? '✓ ' : '') + def.reward + ' NC', x + colW - 26, y + 36, done ? '#00ff88' : '#4a5468', 15, { align: 'right', halo: 0 });
        });
        UI.hint(ctx, 'ESC / ENTER TO RETURN');
    },

    drawCampaignComplete(ctx) {
        UI.background(ctx, { dim: 0.35 });
        const t = Game.briefingTimer;
        const cx = SCREEN_W / 2;
        const isSecret = Game.currentLevelIndex === 5;
        const color = isSecret ? '#ff2bd6' : '#ffee33';
        UI.panel(ctx, cx - 460, 150, 920, 660, color);
        Neon.text(ctx, isSecret ? 'SIGNAL TERMINATED' : 'CAMPAIGN COMPLETE', cx, 250, color, 60, { core: 0.5, halo: 0.6 });
        const sub = isSecret
            ? ['You silenced the relay. The void is quiet...', 'For now.']
            : ['The threat has been neutralized.', 'Outstanding work, pilot.'];
        sub.forEach((line, i) => UI.label(ctx, line, cx, 305 + i * 30, UI.TEXT, 20));
        UI.label(ctx, 'DIFFICULTY: ' + GameConfig.difficulty.toUpperCase(), cx, 400, UI.DIM, 16);
        Neon.text(ctx, 'TOTAL SCORE  ' + Scoring.score.toLocaleString(), cx, 450, UI.CYAN, 32, { core: 0.4 });
        UI.label(ctx, 'NEON CREDITS  ' + NeonCredits.balance, cx, 490, '#ffaa00', 19);
        if (!isSecret && !Campaign.secretUnlocked) {
            UI.label(ctx, 'Something else is out there... beat all levels on Normal to find it.', cx, 545, '#5a6478', 16);
        } else if (!isSecret && Campaign.secretUnlocked) {
            Neon.text(ctx, 'SECRET LEVEL UNLOCKED: SIGNAL LOST', cx, 545, '#ff2bd6', 19, { halo: 0.4 });
        }
        UI.label(ctx, 'Thank you for playing Neon Storm \u03b3 \u2014 more to come!', cx, 600, UI.DIM, 16);
        const items = ['PLAY AGAIN', 'MAIN MENU'];
        items.forEach((label, i) => UI.item(ctx, label, cx, 680 + i * 54, i === Menu.selectedIndex, { w: 420, size: 22 }));
        // Fireworks of shattered neon (small, calm-friendly)
        if (!Renderer.calm()) {
            for (let i = 0; i < 24; i++) {
                const a = i * 2.4 + t * 0.4;
                const r = 520 + Math.sin(t * 0.7 + i) * 40;
                const x = cx + Math.cos(a) * r, y = 480 + Math.sin(a) * r * 0.55;
                ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 2 + i);
                UI.pip(ctx, x, y, 4, i % 2 ? UI.CYAN : UI.MAGENTA, true);
            }
            ctx.globalAlpha = 1;
        }
    },

    highScoreTab: 0,

    drawHighScores(ctx) {
        UI.background(ctx, { dim: 0.55 });
        UI.title(ctx, 'HIGH SCORES', 110);

        const tabs = ['CASUAL', 'NORMAL', 'HARDCORE', 'ENDLESS', 'SESSION'];
        const tabKeys = ['casual', 'normal', 'hardcore', 'endless', 'session'];
        const colors = ['#00ff88', '#ffee33', '#ff3355', '#ff8800', '#cc44ff'];
        UI.tabs(ctx, tabs, this.highScoreTab, SCREEN_W / 2, 200, colors);

        const color = colors[this.highScoreTab];
        const px = SCREEN_W / 2 - 420, pw = 840, top = 240;
        UI.panel(ctx, px, top, pw, 620, color);

        const tabKey = tabKeys[this.highScoreTab];
        const session = tabKey === 'session';
        const rows = session ? HighScores.sessionScores.slice(0, 10) : (HighScores.boards[tabKey] || []);
        if (rows.length === 0) {
            UI.label(ctx, session ? 'NO SCORES THIS SESSION' : 'NO SCORES YET', SCREEN_W / 2, top + 300, UI.DIM, 20);
        } else {
            const isEndless = tabKey === 'endless';
            const cols = session
                ? [['#', 40], ['NAME', 100], ['SCORE', 200], ['INFO', 460], ['MODE', 620]]
                : [['#', 40], ['NAME', 100], ['SCORE', 200], ['CHAIN', 440], [isEndless ? 'WAVE' : 'LEVEL', 560], ['DATE', 680]];
            for (const [h, x] of cols) UI.label(ctx, h, px + x, top + 48, UI.DIM, 14, 'left');
            rows.forEach((entry, i) => {
                const ey = top + 90 + i * 50;
                if (i % 2 === 0) {
                    ctx.fillStyle = 'rgba(255,255,255,0.03)';
                    ctx.fillRect(px + 20, ey - 30, pw - 40, 46);
                }
                const c = i === 0 ? '#ffee33' : i < 3 ? '#ffaa00' : UI.TEXT;
                const big = i < 3 ? 22 : 19;
                const cell = (text, x, col, size) => Neon.text(ctx, text, px + x, ey, col || c, size || big,
                    { align: 'left', halo: i < 3 ? 0.25 : 0, weight: i < 3 ? 'bold' : '' });
                cell((i + 1).toString(), 40);
                cell(entry.initials, 100);
                cell(entry.score.toLocaleString(), 200);
                if (session) {
                    cell(entry.mode === 'endless' ? 'W' + (entry.wave || '?') : 'L' + (entry.levelReached || '?') + (entry.won ? ' ✓' : ''), 460, UI.DIM, 17);
                    cell((entry.difficulty || '').toUpperCase(), 620, UI.DIM, 17);
                } else {
                    cell((entry.maxChain || 0).toString(), 440);
                    cell(isEndless ? 'W' + (entry.wave || '?') : (entry.levelReached || '?') + '/6' + (entry.won ? ' ✓' : ''), 560);
                    cell(entry.date || '', 680, UI.DIM, 16);
                }
            });
        }

        UI.label(ctx, 'NEON CREDITS  ' + NeonCredits.balance, SCREEN_W / 2, SCREEN_H - 110, '#ffaa00', 19);
        UI.hint(ctx, '←→ CHANGE TAB    ESC BACK');
    },

    drawPause(ctx) {
        UI.dim(ctx, 0.62);
        const cx = SCREEN_W / 2;
        UI.panel(ctx, cx - 280, 330, 560, 330, UI.CYAN);
        Neon.text(ctx, 'PAUSED', cx, 405, UI.CYAN, 54, { core: 0.45, halo: 0.55 });

        if (Game.pauseConfirm) {
            const action = Game.pauseConfirm === 'restart' ? 'RESTART LEVEL' : 'QUIT TO MENU';
            Neon.text(ctx, 'ARE YOU SURE?', cx, 480, '#ffaa00', 26);
            UI.label(ctx, action, cx, 520, UI.TEXT, 19);
            UI.label(ctx, UI.keys('ENTER = YES    ESC = NO'), cx, 600, UI.DIM, 16);
        } else {
            this.items = ['RESUME', 'RESTART', 'MAIN MENU'];
            for (let i = 0; i < this.items.length; i++) {
                UI.item(ctx, this.items[i], cx, 480 + i * 56, i === this.selectedIndex, { w: 460, size: 24 });
            }
        }
    }
};
