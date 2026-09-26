// ============================================================
//  HUD RENDERER
// ============================================================
const HUD = {
    draw(ctx) {
        // HUD backgrounds
        ctx.fillStyle = '#0a0612';
        ctx.fillRect(0, 0, HUD_LEFT_W, SCREEN_H);
        ctx.fillRect(HUD_RIGHT_X, 0, HUD_RIGHT_W, SCREEN_H);

        // Border lines
        ctx.strokeStyle = '#ff00ff';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#ff00ff';
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.moveTo(PLAY_X - 1, 0);
        ctx.lineTo(PLAY_X - 1, SCREEN_H);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(PLAY_X + PLAY_W + 1, 0);
        ctx.lineTo(PLAY_X + PLAY_W + 1, SCREEN_H);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Subtle grid on HUD panels
        ctx.strokeStyle = 'rgba(255, 0, 255, 0.05)';
        ctx.lineWidth = 1;
        for (let y = 0; y < SCREEN_H; y += 30) {
            ctx.beginPath();
            ctx.moveTo(0, y); ctx.lineTo(HUD_LEFT_W, y); ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(HUD_RIGHT_X, y); ctx.lineTo(SCREEN_W, y); ctx.stroke();
        }

        const leftCenter = HUD_LEFT_W / 2;
        const rightCenter = HUD_RIGHT_X + HUD_RIGHT_W / 2;
        let leftY = 60;
        let rightY = 60;

        // === LEFT HUD ===

        // Title
        ctx.fillStyle = '#00ffff';
        ctx.font = 'bold 20px Share Tech Mono, Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 0;
        ctx.fillText('NEON STORM \u03b2', leftCenter, leftY);
        ctx.shadowBlur = 0;
        leftY += 50;

        // Lives
        ctx.fillStyle = '#888888';
        ctx.font = '12px Share Tech Mono, Consolas, monospace';
        ctx.fillText('LIVES', leftCenter, leftY);
        leftY += 20;
        for (let i = 0; i < Player.lives; i++) {
            const lx = leftCenter - (Player.lives - 1) * 12 + i * 24;
            ctx.fillStyle = '#00ffff';
            ctx.shadowColor = '#00ffff';
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.moveTo(lx, leftY - 6);
            ctx.lineTo(lx + 6, leftY + 3);
            ctx.lineTo(lx, leftY + 8);
            ctx.lineTo(lx - 6, leftY + 3);
            ctx.closePath();
            ctx.fill();
        }
        ctx.shadowBlur = 0;
        leftY += 30;

        // Shield HP
        if (Player.maxShieldHp > 0) {
            ctx.fillStyle = '#888888';
            ctx.font = '12px Share Tech Mono, Consolas, monospace';
            ctx.fillText('SHIELD', leftCenter, leftY);
            leftY += 14;
            const shieldBarW = 120;
            const shieldBarH = 10;
            const shieldBarX = leftCenter - shieldBarW / 2;
            ctx.fillStyle = '#1a1a3e';
            ctx.fillRect(shieldBarX, leftY, shieldBarW, shieldBarH);
            const shieldPct = Player.maxShieldHp > 0 ? Player.shieldHp / Player.maxShieldHp : 0;
            ctx.fillStyle = Player.shieldFlashTimer > 0 ? '#ffffff' : '#4488ff';
            ctx.shadowColor = '#4488ff';
            ctx.shadowBlur = 0;
            ctx.fillRect(shieldBarX, leftY, shieldBarW * shieldPct, shieldBarH);
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#aaaaaa';
            ctx.font = '12px Share Tech Mono, Consolas, monospace';
            ctx.fillText(Player.shieldHp + '/' + Player.maxShieldHp, leftCenter, leftY + shieldBarH + 12);
            leftY += 35;
        }

        // Bombs
        if (GameConfig.bombs.enabled) {
            ctx.fillStyle = '#888888';
            ctx.font = '12px Share Tech Mono, Consolas, monospace';
            ctx.fillText('BOMBS', leftCenter, leftY);
            leftY += 20;
            for (let i = 0; i < Player.bombs; i++) {
                const bx = leftCenter - (Player.bombs - 1) * 10 + i * 20;
                ctx.fillStyle = '#ff8800';
                ctx.shadowColor = '#ff8800';
                ctx.shadowBlur = 0;
                ctx.beginPath();
                ctx.arc(bx, leftY, 6, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.shadowBlur = 0;
            leftY += 30;
        }

        // Weapon
        ctx.fillStyle = '#888888';
        ctx.font = '12px Share Tech Mono, Consolas, monospace';
        ctx.fillText('WEAPON', leftCenter, leftY);
        leftY += 18;
        const weaponColors = { none: '#666666', spread: '#ff8c00', homing: '#00ff88', laser: '#4488ff' };
        const weaponNames = { none: 'BASE', spread: 'SPREAD', homing: 'HOMING', laser: 'LASER' };
        ctx.fillStyle = weaponColors[Player.primaryWeapon];
        ctx.font = 'bold 14px Share Tech Mono, Consolas, monospace';
        ctx.fillText(weaponNames[Player.primaryWeapon], leftCenter, leftY);
        if (Player.primaryLevel > 0) {
            leftY += 16;
            ctx.fillStyle = '#ffffff';
            ctx.font = '13px Share Tech Mono, Consolas, monospace';
            ctx.fillText('LV ' + '█'.repeat(Player.primaryLevel) + '░'.repeat(5 - Player.primaryLevel), leftCenter, leftY);
        }
        leftY += 30;

        // Drones
        ctx.fillStyle = '#888888';
        ctx.font = '12px Share Tech Mono, Consolas, monospace';
        ctx.fillText('DRONES', leftCenter, leftY);
        leftY += 18;
        ctx.fillStyle = Player.droneLevel > 0 ? '#cc44ff' : '#333333';
        ctx.font = 'bold 14px Share Tech Mono, Consolas, monospace';
        ctx.fillText(Player.droneLevel > 0 ? 'LV ' + '█'.repeat(Player.droneLevel) + '░'.repeat(5 - Player.droneLevel) : 'NONE', leftCenter, leftY);
        leftY += 35;

        // Surge meter
        if (GameConfig.graze.enabled) {
            ctx.fillStyle = '#888888';
            ctx.font = '12px Share Tech Mono, Consolas, monospace';
            ctx.fillText('SURGE', leftCenter, leftY);
            leftY += 12;
            const barW = 140;
            const barH = 12;
            const barX = leftCenter - barW / 2;
            ctx.fillStyle = '#1a0a2e';
            ctx.fillRect(barX, leftY, barW, barH);
            const pct = Scoring.surgeCharge / Scoring.surgeMax;
            const surgeColor = Scoring.surgeActive ? '#ffffff' : (pct >= 1 ? '#ffff00' : '#00ffff');
            ctx.fillStyle = surgeColor;
            ctx.shadowColor = surgeColor;
            ctx.shadowBlur = 0;
            ctx.fillRect(barX, leftY, barW * pct, barH);
            ctx.shadowBlur = 0;
            if (Scoring.surgeActive) {
                leftY += barH + 8;
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 12px Share Tech Mono, Consolas, monospace';
                const surgeTimeText = 'ACTIVE ' + Scoring.surgeDuration.toFixed(1) + 's';
                ctx.fillText(surgeTimeText, leftCenter, leftY);
            } else if (pct >= 1) {
                leftY += barH + 8;
                ctx.fillStyle = '#ffff00';
                ctx.font = 'bold 13px Share Tech Mono, Consolas, monospace';
                ctx.fillText('READY!', leftCenter, leftY);
            }
            leftY += 25;
        }

        // Dash cooldown
        if (GameConfig.dash.enabled) {
            ctx.fillStyle = '#888888';
            ctx.font = '12px Share Tech Mono, Consolas, monospace';
            ctx.fillText('DASH', leftCenter, leftY);
            leftY += 12;
            const dashReady = Player.dashCooldown <= 0;
            ctx.fillStyle = dashReady ? '#00ff88' : '#333333';
            ctx.font = 'bold 12px Share Tech Mono, Consolas, monospace';
            ctx.fillText(dashReady ? 'READY' : Player.dashCooldown.toFixed(1) + 's', leftCenter, leftY);
        }

        // === RIGHT HUD ===

        // Score
        ctx.fillStyle = '#888888';
        ctx.font = '12px Share Tech Mono, Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('SCORE', rightCenter, rightY);
        rightY += 22;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px Share Tech Mono, Consolas, monospace';
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 0;
        ctx.fillText(Scoring.score.toLocaleString(), rightCenter, rightY);
        ctx.shadowBlur = 0;
        rightY += 40;

        // Chain combo
        ctx.fillStyle = '#888888';
        ctx.font = '12px Share Tech Mono, Consolas, monospace';
        ctx.fillText('CHAIN', rightCenter, rightY);
        rightY += 20;
        if (Scoring.chain > 0) {
            ctx.fillStyle = Scoring.multiplier >= 5 ? '#ffff00' : Scoring.multiplier >= 3 ? '#ff8800' : '#ffffff';
            ctx.font = 'bold 18px Share Tech Mono, Consolas, monospace';
            ctx.shadowColor = ctx.fillStyle;
            ctx.shadowBlur = 0;
            ctx.fillText(Scoring.chain + ' HITS', rightCenter, rightY);
            rightY += 18;
            ctx.font = 'bold 14px Share Tech Mono, Consolas, monospace';
            ctx.fillText(Scoring.multiplier + 'x', rightCenter, rightY);
            ctx.shadowBlur = 0;
            // Chain timer bar
            rightY += 10;
            const timerBarW = 120;
            const timerPct = Scoring.chainTimer / (Scoring.chainTimerMax / GameConfig.chainTimerSpeed);
            ctx.fillStyle = '#1a0a2e';
            ctx.fillRect(rightCenter - timerBarW / 2, rightY, timerBarW, 4);
            ctx.fillStyle = timerPct > 0.3 ? '#00ff88' : '#ff4444';
            ctx.fillRect(rightCenter - timerBarW / 2, rightY, timerBarW * timerPct, 4);
        } else {
            ctx.fillStyle = '#333333';
            ctx.font = '14px Share Tech Mono, Consolas, monospace';
            ctx.fillText('---', rightCenter, rightY);
        }
        rightY += 35;

        // Multiplier info
        ctx.fillStyle = '#888888';
        ctx.font = '12px Share Tech Mono, Consolas, monospace';
        ctx.fillText('MULTIPLIER', rightCenter, rightY);
        rightY += 20;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px Share Tech Mono, Consolas, monospace';
        ctx.fillText(GameConfig.scoreMultiplier + 'x BASE', rightCenter, rightY);
        rightY += 35;

        // Graze count with threshold progress
        if (GameConfig.graze.enabled) {
            ctx.fillStyle = '#888888';
            ctx.font = '12px Share Tech Mono, Consolas, monospace';
            ctx.fillText('GRAZE', rightCenter, rightY);
            rightY += 20;
            ctx.fillStyle = '#cc88ff';
            ctx.font = 'bold 16px Share Tech Mono, Consolas, monospace';
            ctx.fillText(Scoring.grazeCount.toString(), rightCenter, rightY);
            // Show next threshold
            if (Scoring.nextGrazeThreshold < Scoring.grazeThresholds.length) {
                const next = Scoring.grazeThresholds[Scoring.nextGrazeThreshold];
                ctx.fillStyle = '#666688';
                ctx.font = '10px Share Tech Mono, Consolas, monospace';
                ctx.fillText('NEXT: ' + next, rightCenter, rightY + 14);
                rightY += 12;
            }
            rightY += 28;
        }

        // Max chain
        ctx.fillStyle = '#888888';
        ctx.font = '12px Share Tech Mono, Consolas, monospace';
        ctx.fillText('MAX CHAIN', rightCenter, rightY);
        rightY += 20;
        ctx.fillStyle = '#ffaa00';
        ctx.font = 'bold 16px Share Tech Mono, Consolas, monospace';
        ctx.fillText(Scoring.maxChain.toString(), rightCenter, rightY);
        rightY += 28;

        // Perfect run indicator
        if (Scoring.isPerfect) {
            ctx.fillStyle = '#00ff88';
            ctx.font = 'bold 12px Share Tech Mono, Consolas, monospace';
            ctx.fillText('★ PERFECT ★', rightCenter, rightY);
            rightY += 22;
        }
        rightY += 14;

        // Difficulty
        ctx.fillStyle = '#888888';
        ctx.font = '12px Share Tech Mono, Consolas, monospace';
        ctx.fillText('DIFFICULTY', rightCenter, rightY);
        rightY += 18;
        const diffColors = { casual: '#00ff88', normal: '#ffff00', hardcore: '#ff4444', custom: '#cc44ff' };
        ctx.fillStyle = diffColors[GameConfig.difficulty] || '#ffffff';
        ctx.font = 'bold 14px Share Tech Mono, Consolas, monospace';
        ctx.fillText(GameConfig.difficulty.toUpperCase(), rightCenter, rightY);
        rightY += 35;

        // Level timer
        ctx.fillStyle = '#888888';
        ctx.font = '12px Share Tech Mono, Consolas, monospace';
        ctx.fillText('TIME', rightCenter, rightY);
        rightY += 18;
        const mins = Math.floor(WaveSystem.levelTimer / 60);
        const secs = Math.floor(WaveSystem.levelTimer % 60);
        ctx.fillStyle = '#ffffff';
        ctx.font = '14px Share Tech Mono, Consolas, monospace';
        ctx.fillText(`${mins}:${secs.toString().padStart(2, '0')}`, rightCenter, rightY);
        rightY += 30;

        // Level / Mode name
        ctx.fillStyle = '#888888';
        ctx.font = '12px Share Tech Mono, Consolas, monospace';
        const isEndless = Game.currentLevelIndex === -1;
        if (isEndless) {
            ctx.fillText('ENDLESS', rightCenter, rightY);
            rightY += 18;
            ctx.fillStyle = '#ffaa00';
            ctx.font = 'bold 14px Share Tech Mono, Consolas, monospace';
            ctx.fillText('WAVE ' + EndlessMode.wave, rightCenter, rightY);
        } else {
            ctx.fillText('LEVEL', rightCenter, rightY);
            rightY += 18;
            const lvlData = ALL_LEVELS[Game.currentLevelIndex];
            ctx.fillStyle = '#aaaaaa';
            ctx.font = '12px Share Tech Mono, Consolas, monospace';
            ctx.fillText((Game.currentLevelIndex + 1) + ': ' + (lvlData ? lvlData.name : '').toUpperCase(), rightCenter, rightY);
        }
        rightY += 25;

        // Escort status (if active)
        if (Escort.active && Escort.alive) {
            ctx.fillStyle = '#888888';
            ctx.font = '12px Share Tech Mono, Consolas, monospace';
            ctx.fillText('ESCORT', rightCenter, rightY);
            rightY += 14;
            const eBarW = 120;
            const eBarH = 8;
            const eBarX = rightCenter - eBarW / 2;
            ctx.fillStyle = '#002200';
            ctx.fillRect(eBarX, rightY, eBarW, eBarH);
            const ePct = Escort.hp / Escort.maxHp;
            ctx.fillStyle = ePct > 0.3 ? '#44aa44' : '#ff4444';
            ctx.fillRect(eBarX, rightY, eBarW * ePct, eBarH);
            ctx.fillStyle = '#88ff88';
            ctx.font = '12px Share Tech Mono, Consolas, monospace';
            ctx.fillText('AURORA', rightCenter, rightY + eBarH + 12);
        }

        // Controls reference at bottom — shows actual bindings
        const controlsY = SCREEN_H - 180;
        ctx.fillStyle = '#667788';
        ctx.font = '12px Share Tech Mono, Consolas, monospace';
        ctx.textAlign = 'center';
        const controls = [
            ['MOVE', Input.getKeyBindDisplay('up').split(' / ')[0] + '/' + Input.getKeyBindDisplay('down').split(' / ')[0]],
            ['FIRE', Input.getKeyBindDisplay('fire')],
            ['FOCUS', Input.getKeyBindDisplay('focus')],
            ['DASH', Input.getKeyBindDisplay('dash')],
            ['BOMB', Input.getKeyBindDisplay('bomb')],
            ['PAUSE', Input.getKeyBindDisplay('pause')]
        ];
        controls.forEach((c, i) => {
            ctx.fillStyle = '#778899';
            ctx.fillText(c[0], rightCenter - 35, controlsY + i * 18);
            ctx.fillStyle = '#888888';
            ctx.fillText(c[1], rightCenter + 35, controlsY + i * 18);
        });

        // Last-life danger indicator — pulsing red edge strips (cheap, no radial gradient)
        if (Player.alive && Player.lives <= 1 && Player.maxShieldHp === 0) {
            const pulse = 0.08 + Math.sin(Date.now() * 0.005) * 0.05;
            const edgeW = 30;
            ctx.fillStyle = `rgba(255, 0, 0, ${pulse})`;
            // Left edge
            const lg = ctx.createLinearGradient(PLAY_X, 0, PLAY_X + edgeW, 0);
            lg.addColorStop(0, `rgba(255, 0, 0, ${pulse})`);
            lg.addColorStop(1, 'rgba(255, 0, 0, 0)');
            ctx.fillStyle = lg;
            ctx.fillRect(PLAY_X, PLAY_Y, edgeW, PLAY_H);
            // Right edge
            const rg = ctx.createLinearGradient(PLAY_X + PLAY_W, 0, PLAY_X + PLAY_W - edgeW, 0);
            rg.addColorStop(0, `rgba(255, 0, 0, ${pulse})`);
            rg.addColorStop(1, 'rgba(255, 0, 0, 0)');
            ctx.fillStyle = rg;
            ctx.fillRect(PLAY_X + PLAY_W - edgeW, PLAY_Y, edgeW, PLAY_H);
        }
    }
};
