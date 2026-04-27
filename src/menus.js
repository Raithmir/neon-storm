// ============================================================
//  MENU SYSTEM
// ============================================================
const Menu = {
    selectedIndex: 0,
    items: [],
    titlePulse: 0,
    gridOffset: 0,

    drawTitle(ctx) {
        this.titlePulse += 0.02;
        this.gridOffset += 1.2;

        // Full screen background gradient
        const grad = ctx.createLinearGradient(0, 0, 0, SCREEN_H);
        grad.addColorStop(0, '#050318');
        grad.addColorStop(0.45, '#0a0620');
        grad.addColorStop(0.65, '#1a0a3e');
        grad.addColorStop(0.8, '#3d1a5e');
        grad.addColorStop(0.9, '#6e1a5e');
        grad.addColorStop(1, '#ff006e');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

        // Star field
        for (let i = 0; i < 80; i++) {
            const sx = ((i * 137.5 + this.gridOffset * 0.3) % SCREEN_W);
            const sy = ((i * 97.3 + i * i * 3.1) % (SCREEN_H * 0.65));
            const brightness = 0.2 + (Math.sin(this.titlePulse * 2 + i) * 0.5 + 0.5) * 0.5;
            ctx.fillStyle = `rgba(255, 255, 255, ${brightness})`;
            const size = (i % 3 === 0) ? 2 : 1;
            ctx.fillRect(sx, sy, size, size);
        }

        // Horizon sun glow
        const sunY = SCREEN_H * 0.78;
        const sunGrad = ctx.createRadialGradient(SCREEN_W / 2, sunY, 20, SCREEN_W / 2, sunY, 250);
        sunGrad.addColorStop(0, 'rgba(255, 120, 0, 0.5)');
        sunGrad.addColorStop(0.4, 'rgba(255, 0, 100, 0.2)');
        sunGrad.addColorStop(1, 'rgba(255, 0, 100, 0)');
        ctx.fillStyle = sunGrad;
        ctx.fillRect(0, sunY - 250, SCREEN_W, 500);

        // Sun disc (half circle at horizon)
        ctx.fillStyle = '#ff6600';
        ctx.shadowColor = '#ff6600';
        ctx.shadowBlur = 30;
        ctx.beginPath();
        ctx.arc(SCREEN_W / 2, sunY + 15, 60, Math.PI, 0);
        ctx.fill();
        // Sun stripes
        ctx.fillStyle = '#3d1a5e';
        ctx.shadowBlur = 0;
        for (let s = 0; s < 5; s++) {
            const sy2 = sunY - 40 + s * 12;
            if (sy2 < sunY + 15) {
                ctx.fillRect(SCREEN_W / 2 - 70, sy2, 140, 3);
            }
        }

        // City silhouette on horizon
        ctx.fillStyle = '#0d0520';
        const cityY = sunY + 10;
        const cityBuildings = [
            [200, 30, 50], [240, 20, 80], [270, 35, 40], [320, 15, 100], [345, 40, 60],
            [400, 25, 110], [435, 50, 45], [500, 20, 90], [530, 35, 55], [580, 15, 120],
            [605, 45, 50], [660, 25, 85], [700, 30, 65], [740, 20, 95], [770, 40, 40],
            [1100, 30, 70], [1140, 20, 95], [1170, 35, 50], [1210, 15, 110], [1250, 45, 60],
            [1310, 25, 80], [1350, 40, 45], [1400, 20, 100], [1440, 35, 55], [1500, 15, 90],
            [1530, 50, 40], [1590, 25, 75], [1630, 30, 95], [1670, 20, 55], [1710, 40, 70]
        ];
        for (const [bx, bw, bh] of cityBuildings) {
            ctx.fillRect(bx, cityY - bh, bw, bh + 100);
        }

        // Perspective grid — lower portion
        const horizon = sunY + 15;
        const gridH = SCREEN_H - horizon;
        ctx.save();

        // Horizontal grid lines (perspective, scrolling)
        ctx.strokeStyle = 'rgba(255, 0, 255, 0.3)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 20; i++) {
            const t = (i * 50 + (this.gridOffset * 2) % 50) / (20 * 50);
            const y = horizon + t * t * gridH * 1.2;
            if (y > SCREEN_H || y < horizon) continue;
            ctx.globalAlpha = Math.min(1, t * 4) * 0.35;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(SCREEN_W, y);
            ctx.stroke();
        }

        // Vertical grid lines (converging to vanishing point)
        ctx.globalAlpha = 0.2;
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.2)';
        const vanishX = SCREEN_W / 2;
        for (let i = -16; i <= 16; i++) {
            const bottomX = vanishX + i * 80;
            ctx.beginPath();
            ctx.moveTo(vanishX + i * 2, horizon);
            ctx.lineTo(bottomX, SCREEN_H);
            ctx.stroke();
        }
        ctx.restore();

        // Floating particles — drifting upward
        ctx.globalAlpha = 0.3;
        for (let i = 0; i < 20; i++) {
            const px = ((i * 193.7 + this.gridOffset * 0.5) % SCREEN_W);
            const py = SCREEN_H - ((i * 87.3 + this.gridOffset * (0.3 + i * 0.02)) % (SCREEN_H * 0.5));
            const hue = (this.titlePulse * 20 + i * 18) % 360;
            ctx.fillStyle = `hsla(${hue}, 100%, 70%, 0.2)`;
            ctx.beginPath();
            ctx.arc(px, py, 1.5 + Math.sin(this.titlePulse + i) * 0.8, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        // Title
        const glow = 10 + Math.sin(this.titlePulse) * 5;
        ctx.fillStyle = '#00ffff';
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = glow;
        ctx.font = 'bold 72px Share Tech Mono, Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('NEON STORM \u03b1', SCREEN_W / 2, 280);

        // Subtitle
        ctx.shadowBlur = 5;
        ctx.fillStyle = '#ff00ff';
        ctx.shadowColor = '#ff00ff';
        ctx.font = '18px Share Tech Mono, Consolas, monospace';
        ctx.fillText('BULLET HELL SHOOTER', SCREEN_W / 2, 320);
        ctx.shadowBlur = 0;

        // Menu items
        this.items = ['NEW GAME', 'ENDLESS MODE', 'HANGAR', 'HIGH SCORES', 'ACHIEVEMENTS', 'SETTINGS', 'HOW TO PLAY'];
        const startY = 440;
        for (let i = 0; i < this.items.length; i++) {
            const selected = i === this.selectedIndex;
            const y = startY + i * 50;

            if (selected) {
                ctx.fillStyle = '#00ffff';
                ctx.shadowColor = '#00ffff';
                ctx.shadowBlur = 15;
                ctx.font = 'bold 24px Share Tech Mono, Consolas, monospace';
                // Selection indicator
                ctx.fillText('▸ ' + this.items[i] + ' ◂', SCREEN_W / 2, y);
            } else {
                ctx.fillStyle = '#667788';
                ctx.shadowBlur = 0;
                ctx.font = '20px Share Tech Mono, Consolas, monospace';
                ctx.fillText(this.items[i], SCREEN_W / 2, y);
            }
        }
        ctx.shadowBlur = 0;

        // Footer
        ctx.fillStyle = '#667788';
        ctx.font = '12px Share Tech Mono, Consolas, monospace';
        ctx.fillText('ARROW KEYS TO SELECT  •  ENTER TO CONFIRM', SCREEN_W / 2, SCREEN_H - 60);
        ctx.fillText('GAMEPAD SUPPORTED', SCREEN_W / 2, SCREEN_H - 40);
        ctx.fillStyle = '#ff00ff';
        ctx.font = '13px Share Tech Mono, Consolas, monospace';
        ctx.fillText('ALPHA VERSION — WORK IN PROGRESS', SCREEN_W / 2, SCREEN_H - 20);
    },

    drawDifficultySelect(ctx) {
        // Background
        const grad = ctx.createLinearGradient(0, 0, 0, SCREEN_H);
        grad.addColorStop(0, '#0a0620');
        grad.addColorStop(1, '#1a0a3e');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

        ctx.fillStyle = '#00ffff';
        ctx.font = 'bold 36px Share Tech Mono, Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 10;
        ctx.fillText('SELECT DIFFICULTY', SCREEN_W / 2, 120);
        ctx.shadowBlur = 0;

        this.items = ['CASUAL', 'NORMAL', 'HARDCORE', 'CUSTOM', 'BACK'];
        const descs = [
            '0.5x Score  •  5 Lives  •  All assists ON',
            '1.0x Score  •  3 Lives  •  Standard experience',
            '2.0x Score  •  1 Life   •  No bombs or focus',
            'Mix and match  •  No leaderboard',
            ''
        ];
        const colors = ['#00ff88', '#ffff00', '#ff4444', '#cc44ff', '#888888'];

        const startY = 280;
        for (let i = 0; i < this.items.length; i++) {
            const selected = i === this.selectedIndex;
            const y = startY + i * 90;

            if (selected) {
                // Selection box
                ctx.strokeStyle = colors[i];
                ctx.shadowColor = colors[i];
                ctx.shadowBlur = 10;
                ctx.lineWidth = 2;
                ctx.strokeRect(SCREEN_W / 2 - 250, y - 30, 500, 60);
                ctx.shadowBlur = 0;

                ctx.fillStyle = colors[i];
                ctx.font = 'bold 26px Share Tech Mono, Consolas, monospace';
                ctx.fillText(this.items[i], SCREEN_W / 2, y);
            } else {
                ctx.fillStyle = '#445566';
                ctx.font = '22px Share Tech Mono, Consolas, monospace';
                ctx.fillText(this.items[i], SCREEN_W / 2, y);
            }

            if (descs[i]) {
                ctx.fillStyle = selected ? '#aaaaaa' : '#555555';
                ctx.font = '13px Share Tech Mono, Consolas, monospace';
                ctx.fillText(descs[i], SCREEN_W / 2, y + 22);
            }
        }

        ctx.fillStyle = '#667788';
        ctx.font = '12px Share Tech Mono, Consolas, monospace';
        ctx.fillText('ESC TO GO BACK', SCREEN_W / 2, SCREEN_H - 50);
    },

    drawGameOver(ctx) {
        ctx.fillStyle = 'rgba(10, 6, 18, 0.85)';
        ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
        ctx.textAlign = 'center';

        const isEndless = Game.currentLevelIndex === -1;

        ctx.fillStyle = '#ff0040';
        ctx.shadowColor = '#ff0040';
        ctx.shadowBlur = 20;
        ctx.font = 'bold 52px Share Tech Mono, Consolas, monospace';
        ctx.fillText('GAME OVER', SCREEN_W / 2, 180);
        ctx.shadowBlur = 0;

        // Endless mode stats
        if (isEndless) {
            ctx.fillStyle = '#ffaa00';
            ctx.font = 'bold 20px Share Tech Mono, Consolas, monospace';
            ctx.fillText('ENDLESS MODE — WAVE ' + EndlessMode.wave, SCREEN_W / 2, 220);
            ctx.fillStyle = '#aaaaaa';
            ctx.font = '14px Share Tech Mono, Consolas, monospace';
            const mins = Math.floor(WaveSystem.levelTimer / 60);
            const secs = Math.floor(WaveSystem.levelTimer % 60);
            ctx.fillText('SURVIVED: ' + mins + ':' + secs.toString().padStart(2, '0'), SCREEN_W / 2, 245);
        }

        ctx.fillStyle = '#ffffff';
        ctx.font = '18px Share Tech Mono, Consolas, monospace';
        ctx.fillText('SCORE', SCREEN_W / 2, isEndless ? 280 : 260);
        ctx.font = 'bold 32px Share Tech Mono, Consolas, monospace';
        ctx.fillStyle = '#00ffff';
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 10;
        ctx.fillText(Scoring.score.toLocaleString(), SCREEN_W / 2, isEndless ? 315 : 295);
        ctx.shadowBlur = 0;

        // End-of-run bonuses
        const bonusEndY = EndRunBonus.draw(ctx, SCREEN_W / 2, 330);

        // Total with bonuses
        const totalScore = Scoring.score + EndRunBonus.totalBonus;
        ctx.fillStyle = '#ffff00';
        ctx.font = 'bold 20px Share Tech Mono, Consolas, monospace';
        ctx.fillText('TOTAL: ' + totalScore.toLocaleString(), SCREEN_W / 2, bonusEndY + 15);

        const ncEarned = Math.floor(totalScore / 3000 * GameConfig.scoreMultiplier);
        ctx.fillStyle = '#ffaa00';
        ctx.font = '14px Share Tech Mono, Consolas, monospace';
        ctx.fillText('+ ' + ncEarned + ' NEON CREDITS', SCREEN_W / 2, bonusEndY + 40);

        // High score initial entry or menu
        if (HighScores.enteringInitials) {
            HighScores.drawInitialEntry(ctx, SCREEN_W / 2, bonusEndY + 75);
        } else {
            this.items = ['RETRY', 'MAIN MENU'];
            const startY = bonusEndY + 85;
            for (let i = 0; i < this.items.length; i++) {
                const selected = i === this.selectedIndex;
                if (selected) {
                    ctx.fillStyle = '#00ffff';
                    ctx.font = 'bold 22px Share Tech Mono, Consolas, monospace';
                    ctx.fillText('▸ ' + this.items[i], SCREEN_W / 2, startY + i * 45);
                } else {
                    ctx.fillStyle = '#667788';
                    ctx.font = '18px Share Tech Mono, Consolas, monospace';
                    ctx.fillText(this.items[i], SCREEN_W / 2, startY + i * 45);
                }
            }
        }
    },

    drawVictory(ctx) {
        ctx.fillStyle = 'rgba(10, 6, 18, 0.8)';
        ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
        ctx.textAlign = 'center';

        // Level name
        const lvl = ALL_LEVELS[Game.currentLevelIndex];
        ctx.fillStyle = '#888888'; ctx.font = '14px Share Tech Mono, Consolas, monospace';
        ctx.fillText('LEVEL ' + (Game.currentLevelIndex + 1) + ' — ' + (lvl ? lvl.name.toUpperCase() : ''), SCREEN_W / 2, 155);

        ctx.fillStyle = '#00ffff';
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 25;
        ctx.font = 'bold 48px Share Tech Mono, Consolas, monospace';
        ctx.fillText('MISSION COMPLETE', SCREEN_W / 2, 195);
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#ffffff';
        ctx.font = '18px Share Tech Mono, Consolas, monospace';
        ctx.fillText('SCORE', SCREEN_W / 2, 240);
        ctx.font = 'bold 32px Share Tech Mono, Consolas, monospace';
        ctx.fillStyle = '#ffff00';
        ctx.shadowColor = '#ffff00';
        ctx.shadowBlur = 10;
        ctx.fillText(Scoring.score.toLocaleString(), SCREEN_W / 2, 275);
        ctx.shadowBlur = 0;

        const bonusEndY = EndRunBonus.draw(ctx, SCREEN_W / 2, 310);

        const totalScore = Scoring.score + EndRunBonus.totalBonus;
        ctx.fillStyle = '#00ffff';
        ctx.font = 'bold 22px Share Tech Mono, Consolas, monospace';
        ctx.fillText('TOTAL: ' + totalScore.toLocaleString(), SCREEN_W / 2, bonusEndY + 15);

        const ncEarned = Math.floor(totalScore / 3000 * GameConfig.scoreMultiplier);
        ctx.fillStyle = '#ffaa00';
        ctx.font = '14px Share Tech Mono, Consolas, monospace';
        ctx.fillText('+ ' + ncEarned + ' NEON CREDITS', SCREEN_W / 2, bonusEndY + 40);

        if (HighScores.enteringInitials) {
            HighScores.drawInitialEntry(ctx, SCREEN_W / 2, bonusEndY + 75);
        } else {
            const hasNextLevel = Game.currentLevelIndex < Campaign.getLevelCount() - 1 &&
                Campaign.isLevelAvailable(Game.currentLevelIndex + 1, GameConfig.difficulty === 'custom');
            this.items = hasNextLevel ? ['NEXT LEVEL', 'RETRY', 'MAIN MENU'] :
                (Game.currentLevelIndex >= 4 ? ['CONTINUE...', 'MAIN MENU'] : ['RETRY', 'MAIN MENU']);
            const startY = bonusEndY + 80;
            for (let i = 0; i < this.items.length; i++) {
                const selected = i === this.selectedIndex;
                if (selected) {
                    ctx.fillStyle = this.items[i] === 'NEXT LEVEL' ? '#00ff88' : '#00ffff';
                    ctx.font = 'bold 22px Share Tech Mono, Consolas, monospace';
                    ctx.fillText('▸ ' + this.items[i], SCREEN_W / 2, startY + i * 40);
                } else {
                    ctx.fillStyle = '#667788';
                    ctx.font = '18px Share Tech Mono, Consolas, monospace';
                    ctx.fillText(this.items[i], SCREEN_W / 2, startY + i * 40);
                }
            }
        }
    },

    highScoreTab: 0,

    drawHighScores(ctx) {
        const grad = ctx.createLinearGradient(0, 0, 0, SCREEN_H);
        grad.addColorStop(0, '#0a0620');
        grad.addColorStop(1, '#1a0a3e');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

        ctx.fillStyle = '#00ffff';
        ctx.font = 'bold 36px Share Tech Mono, Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 10;
        ctx.fillText('HIGH SCORES', SCREEN_W / 2, 80);
        ctx.shadowBlur = 0;

        // Tabs — now includes ENDLESS
        const tabs = ['CASUAL', 'NORMAL', 'HARDCORE', 'ENDLESS', 'SESSION'];
        const tabKeys = ['casual', 'normal', 'hardcore', 'endless', 'session'];
        const tabW = 150;
        const tabStartX = SCREEN_W / 2 - (tabs.length * tabW) / 2;
        for (let i = 0; i < tabs.length; i++) {
            const x = tabStartX + i * tabW + tabW / 2;
            const selected = i === this.highScoreTab;
            const colors = ['#00ff88', '#ffff00', '#ff4444', '#ff8800', '#cc44ff'];
            ctx.fillStyle = selected ? colors[i] : '#445566';
            ctx.font = selected ? 'bold 14px Share Tech Mono, Consolas, monospace' : '13px Share Tech Mono, Consolas, monospace';
            ctx.fillText(tabs[i], x, 125);
            if (selected) {
                ctx.fillStyle = colors[i];
                ctx.fillRect(x - tabW / 2 + 15, 133, tabW - 30, 2);
            }
        }

        // Board content
        const tabKey = tabKeys[this.highScoreTab];
        if (tabKey === 'session') {
            // Session scores
            ctx.textAlign = 'center';
            if (HighScores.sessionScores.length === 0) {
                ctx.fillStyle = '#888888';
                ctx.font = '14px Share Tech Mono, Consolas, monospace';
                ctx.fillText('NO SCORES THIS SESSION', SCREEN_W / 2, 200);
            } else {
                ctx.textAlign = 'left';
                const colRank = SCREEN_W / 2 - 280;
                const colName = SCREEN_W / 2 - 230;
                const colScore = SCREEN_W / 2 - 150;
                const colInfo = SCREEN_W / 2 + 50;
                const colDate = SCREEN_W / 2 + 200;
                ctx.fillStyle = '#666666';
                ctx.font = '12px Share Tech Mono, Consolas, monospace';
                ctx.fillText('#', colRank, 170);
                ctx.fillText('NAME', colName, 170);
                ctx.fillText('SCORE', colScore, 170);
                ctx.fillText('INFO', colInfo, 170);
                ctx.fillText('MODE', colDate, 170);

                HighScores.sessionScores.slice(0, 10).forEach((entry, i) => {
                    const ey = 192 + i * 24;
                    ctx.fillStyle = i < 3 ? '#ffaa00' : '#aaaaaa';
                    ctx.font = '13px Share Tech Mono, Consolas, monospace';
                    ctx.fillText((i + 1).toString(), colRank, ey);
                    ctx.fillText(entry.initials, colName, ey);
                    ctx.fillText(entry.score.toLocaleString(), colScore, ey);
                    ctx.fillStyle = '#888888';
                    const info = entry.mode === 'endless' ? 'W' + (entry.wave || '?') : 'L' + (entry.levelReached || '?') + (entry.won ? ' ✓' : '');
                    ctx.fillText(info, colInfo, ey);
                    ctx.fillText((entry.difficulty || '').toUpperCase(), colDate, ey);
                });
            }
        } else {
            // Persistent board (campaign or endless)
            const board = HighScores.boards[tabKey] || [];
            ctx.textAlign = 'center';

            if (board.length === 0) {
                ctx.fillStyle = '#888888';
                ctx.font = '14px Share Tech Mono, Consolas, monospace';
                ctx.fillText('NO SCORES YET', SCREEN_W / 2, 200);
            } else {
                ctx.textAlign = 'left';
                const isEndless = tabKey === 'endless';
                const colRank = SCREEN_W / 2 - 310;
                const colName = SCREEN_W / 2 - 260;
                const colScore = SCREEN_W / 2 - 170;
                const colChain = SCREEN_W / 2 + 10;
                const colInfo = SCREEN_W / 2 + 120;
                const colDate = SCREEN_W / 2 + 240;

                // Header
                ctx.fillStyle = '#666666';
                ctx.font = '12px Share Tech Mono, Consolas, monospace';
                ctx.fillText('#', colRank, 170);
                ctx.fillText('NAME', colName, 170);
                ctx.fillText('SCORE', colScore, 170);
                ctx.fillText('CHAIN', colChain, 170);
                ctx.fillText(isEndless ? 'WAVE' : 'LEVEL', colInfo, 170);
                ctx.fillText('DATE', colDate, 170);

                board.forEach((entry, i) => {
                    const ey = 192 + i * 24;
                    ctx.fillStyle = i === 0 ? '#ffff00' : i < 3 ? '#ffaa00' : '#aaaaaa';
                    ctx.font = i < 3 ? 'bold 13px Share Tech Mono, Consolas, monospace' : '13px Share Tech Mono, Consolas, monospace';
                    ctx.fillText((i + 1).toString(), colRank, ey);
                    ctx.fillText(entry.initials, colName, ey);
                    ctx.fillText(entry.score.toLocaleString(), colScore, ey);
                    ctx.fillText((entry.maxChain || 0).toString(), colChain, ey);
                    if (isEndless) {
                        ctx.fillText('W' + (entry.wave || '?'), colInfo, ey);
                    } else {
                        const lvlText = (entry.levelReached || '?') + '/6' + (entry.won ? ' ✓' : '');
                        ctx.fillText(lvlText, colInfo, ey);
                    }
                    ctx.fillStyle = '#666666';
                    ctx.fillText(entry.date || '', colDate, ey);
                });
            }
        }

        ctx.textAlign = 'center';
        ctx.fillStyle = '#888888';
        ctx.font = '14px Share Tech Mono, Consolas, monospace';

        // NC balance
        ctx.fillStyle = '#ffaa00';
        ctx.font = '16px Share Tech Mono, Consolas, monospace';
        ctx.fillText('NEON CREDITS: ' + NeonCredits.balance, SCREEN_W / 2, SCREEN_H - 120);

        ctx.fillStyle = '#667788';
        ctx.font = '12px Share Tech Mono, Consolas, monospace';
        ctx.fillText('←→ CHANGE TAB    ESC BACK', SCREEN_W / 2, SCREEN_H - 50);
    },

    drawPause(ctx) {
        ctx.fillStyle = 'rgba(10, 6, 18, 0.7)';
        ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

        ctx.textAlign = 'center';
        ctx.fillStyle = '#00ffff';
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 15;
        ctx.font = 'bold 40px Share Tech Mono, Consolas, monospace';
        ctx.fillText('PAUSED', SCREEN_W / 2, 380);
        ctx.shadowBlur = 0;

        if (Game.pauseConfirm) {
            // Confirmation dialog
            const action = Game.pauseConfirm === 'restart' ? 'RESTART LEVEL' : 'QUIT TO MENU';
            ctx.fillStyle = '#ffaa00';
            ctx.font = 'bold 20px Share Tech Mono, Consolas, monospace';
            ctx.fillText('ARE YOU SURE?', SCREEN_W / 2, 460);
            ctx.fillStyle = '#cccccc';
            ctx.font = '16px Share Tech Mono, Consolas, monospace';
            ctx.fillText(action, SCREEN_W / 2, 490);
            ctx.fillStyle = '#667788';
            ctx.font = '14px Share Tech Mono, Consolas, monospace';
            ctx.fillText('ENTER = YES    ESC = NO', SCREEN_W / 2, 530);
        } else {
            this.items = ['RESUME', 'RESTART', 'MAIN MENU'];
            const startY = 470;
            for (let i = 0; i < this.items.length; i++) {
                const selected = i === this.selectedIndex;
                if (selected) {
                    ctx.fillStyle = '#00ffff';
                    ctx.font = 'bold 20px Share Tech Mono, Consolas, monospace';
                    ctx.fillText('▸ ' + this.items[i], SCREEN_W / 2, startY + i * 40);
                } else {
                    ctx.fillStyle = '#667788';
                    ctx.font = '16px Share Tech Mono, Consolas, monospace';
                    ctx.fillText(this.items[i], SCREEN_W / 2, startY + i * 40);
                }
            }
        }
    }
};
