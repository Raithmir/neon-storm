// ============================================================
//  HUD RENDERER
//  Two side panels either side of the play area, built from UI kit cards:
//    left:  pilot (lives, bombs, shield), armament (weapon, drones), Surge, dash
//    right: score, chain, run stats, mission (level, time, escort), controls
// ============================================================
const HUD = {
    _bg: null,          // canvas behind the overlay holding the static panel backgrounds
    _drawn: false,      // HUD.draw ran this frame (Game.draw shows _bg only then)

    // Static panel backgrounds (gradient, faint scanlines, edge glow). They live on
    // their own canvas under the overlay and are drawn only when the resolution
    // changes: blitting them onto the overlay every frame cost ~4.5 ms at HIGH.
    _bakeBackground() {
        const k = Renderer.uiScale || 1;
        let c = this._bg;
        if (!c) {
            c = this._bg = document.createElement('canvas');
            c.id = 'hud-bg';
            c.style.cssText = 'position: absolute; left: 0; top: 0; z-index: 0; pointer-events: none; display: none;';
            canvas.parentNode.insertBefore(c, canvas.parentNode.firstChild);
        }
        c.width = Math.round(SCREEN_W * k); c.height = Math.round(SCREEN_H * k);
        c._scale = k;
        const g = c.getContext('2d');
        g.setTransform(k, 0, 0, k, 0, 0);
        const grad = g.createLinearGradient(0, 0, 0, SCREEN_H);
        grad.addColorStop(0, '#07020f');
        grad.addColorStop(1, '#10031f');
        g.fillStyle = grad;
        g.fillRect(0, 0, HUD_LEFT_W, SCREEN_H);
        g.fillRect(HUD_RIGHT_X, 0, HUD_RIGHT_W, SCREEN_H);
        g.fillStyle = 'rgba(255, 43, 214, 0.035)';
        for (let y = 0; y < SCREEN_H; y += 4) {
            g.fillRect(0, y, HUD_LEFT_W, 1);
            g.fillRect(HUD_RIGHT_X, y, HUD_RIGHT_W, 1);
        }
        // Glowing frame around the play area
        for (const [x, dir] of [[PLAY_X, -1], [PLAY_X + PLAY_W, 1]]) {
            const glow = g.createLinearGradient(x, 0, x + dir * 40, 0);
            glow.addColorStop(0, 'rgba(255, 43, 214, 0.35)');
            glow.addColorStop(1, 'rgba(255, 43, 214, 0)');
            g.fillStyle = glow;
            g.fillRect(dir < 0 ? x - 40 : x, 0, 40, SCREEN_H);
            g.fillStyle = '#ff2bd6';
            g.fillRect(x - 1, 0, 2, SCREEN_H);
        }
    },

    // Called by Game.draw after every frame: the background shows only under the HUD
    showBackground(on) {
        const c = this._bg;
        if (!c) return;
        if (on) {
            // Track the overlay's on-screen size (window resizes)
            if (c.style.width !== canvas.style.width) c.style.width = canvas.style.width;
            if (c.style.height !== canvas.style.height) c.style.height = canvas.style.height;
        }
        const display = on ? 'block' : 'none';
        if (c.style.display !== display) c.style.display = display;
    },

    draw(ctx) {
        if (!this._bg || this._bg._scale !== Renderer.uiScale) this._bakeBackground();
        this._drawn = true;
        this._drawLeft(ctx);
        this._drawRight(ctx);
        this._drawDanger(ctx);
    },

    _drawLeft(ctx) {
        const x = 60, w = HUD_LEFT_W - 120, cx = x + w / 2;
        const t = UI.time();
        Neon.text(ctx, 'NEON STORM', cx, 70, UI.CYAN, 34, { core: 0.4, halo: 0.45 });

        // Pilot: lives, bombs, shield
        let y = 110;
        const pilotH = 150 + (Player.maxShieldHp > 0 ? 44 : 0);
        UI.panel(ctx, x, y, w, pilotH, UI.CYAN, { title: 'PILOT' });
        UI.label(ctx, 'LIVES', x + 20, y + 62, UI.DIM, 14, 'left');
        const lives = Math.min(Player.lives, 8);
        for (let i = 0; i < lives; i++) UI.ship(ctx, x + 140 + i * 38, y + 54, 13);
        if (Player.lives > 8) UI.label(ctx, '+' + (Player.lives - 8), x + 140 + 8 * 38, y + 60, UI.CYAN, 16, 'left');
        if (GameConfig.bombs.enabled) {
            UI.label(ctx, 'BOMBS', x + 20, y + 112, UI.DIM, 14, 'left');
            for (let i = 0; i < Player.bombs; i++) {
                const bx = x + 150 + i * 34, by = y + 106;
                ctx.save(); ctx.translate(bx, by);
                Neon.path(ctx, Neon.polygon(6, Math.PI / 6), 10, true);
                ctx.fillStyle = '#ff8800'; ctx.globalAlpha = 0.25; ctx.fill(); ctx.globalAlpha = 1;
                Neon.stroke(ctx, '#ff8800', 0.9, false);
                ctx.restore();
                Neon.light(ctx, bx, by, 2.5, '#ffcc66', 1);
            }
        }
        if (Player.maxShieldHp > 0) {
            UI.label(ctx, 'SHIELD', x + 20, y + 160, UI.DIM, 14, 'left');
            Neon.bar(ctx, x + 140, y + 148, w - 220, 14, Player.shieldHp / Player.maxShieldHp,
                Player.shieldFlashTimer > 0 ? '#ffffff' : '#4488ff', Player.maxShieldHp);
            UI.label(ctx, Player.shieldHp + '/' + Player.maxShieldHp, x + w - 20, y + 160, UI.TEXT, 15, 'right');
        }
        y += pilotH + 24;

        // Armament: weapon with its power-up badge, level pips, drones
        const weaponColors = { none: '#8899aa', spread: '#ff8c00', homing: '#00ff88', laser: '#4488ff' };
        const weaponNames = { none: 'BASE SHOT', spread: 'SPREAD', homing: 'HOMING', laser: 'LASER' };
        const wc = weaponColors[Player.primaryWeapon] || '#8899aa';
        UI.panel(ctx, x, y, w, 190, wc, { title: 'ARMAMENT' });
        if (Player.primaryWeapon !== 'none') {
            ctx.save(); ctx.translate(x + 60, y + 88); ctx.scale(2.2, 2.2);
            ctx.save(); ctx.rotate(t * 0.3);
            Neon.sprite(ctx, 'pu_badge|' + wc, 15, PowerUps._bakeBadge, wc, 10);
            ctx.restore();
            Neon.sprite(ctx, 'pu_icon|' + Player.primaryWeapon, 14, PowerUps._bakeIcon, Player.primaryWeapon, wc);
            ctx.restore();
        }
        Neon.text(ctx, weaponNames[Player.primaryWeapon] || 'BASE SHOT', x + 120, y + 82, wc, 30, { align: 'left', core: 0.35 });
        for (let i = 0; i < 5; i++) UI.pip(ctx, x + 132 + i * 30, y + 108, 8, wc, i < Player.primaryLevel);
        UI.label(ctx, 'DRONES', x + 20, y + 162, UI.DIM, 14, 'left');
        for (let i = 0; i < 5; i++) UI.pip(ctx, x + 132 + i * 30, y + 156, 8, '#cc44ff', i < Player.droneLevel);
        y += 214;

        // Surge meter
        if (GameConfig.graze.enabled) {
            const pct = Scoring.surgeCharge / Scoring.surgeMax;
            const ready = pct >= 1 && !Scoring.surgeActive;
            const sc = Scoring.surgeActive ? '#ffffff' : (ready ? '#ffee33' : UI.CYAN);
            UI.panel(ctx, x, y, w, 120, sc, { title: 'NEON SURGE' });
            Neon.bar(ctx, x + 20, y + 50, w - 40, 20, Scoring.surgeActive ? Scoring.surgeDuration / Scoring.surgeMaxDuration : pct, sc, 10);
            let msg = Math.floor(pct * 100) + '%', mc = UI.TEXT;
            if (Scoring.surgeActive) { msg = 'ACTIVE  ' + Scoring.surgeDuration.toFixed(1) + 's'; mc = '#ffffff'; }
            else if (ready) { msg = 'READY — ' + Input.getKeyBindDisplay('surge'); mc = '#ffee33'; }
            ctx.globalAlpha = ready && !Renderer.calm() ? 0.7 + Math.sin(t * 6) * 0.3 : 1;
            Neon.text(ctx, msg, cx, y + 100, mc, 20, { halo: ready || Scoring.surgeActive ? 0.4 : 0 });
            ctx.globalAlpha = 1;
            y += 144;
        }

        // Dash
        if (GameConfig.dash.enabled) {
            const ready = Player.dashCooldown <= 0;
            UI.panel(ctx, x, y, w, 70, ready ? '#00ff88' : UI.DIM, { title: 'DASH' });
            const cd = GameConfig.dash.cooldown || 1;
            Neon.bar(ctx, x + 20, y + 44, w - 170, 10, ready ? 1 : 1 - Player.dashCooldown / cd, ready ? '#00ff88' : '#4a5a70', 0);
            Neon.text(ctx, ready ? 'READY' : Player.dashCooldown.toFixed(1) + 's', x + w - 20, y + 54, ready ? '#00ff88' : UI.DIM, 18,
                { align: 'right', halo: ready ? 0.3 : 0 });
        }
    },

    _drawRight(ctx) {
        const x = HUD_RIGHT_X + 60, w = HUD_RIGHT_W - 120, cx = x + w / 2;

        // Score (with the best on this board for reference)
        let y = 40;
        UI.panel(ctx, x, y, w, 130, UI.CYAN, { title: 'SCORE' });
        Neon.text(ctx, Scoring.score.toLocaleString(), cx, y + 88, '#ffffff', 46, { core: 0.2, halo: 0.35 });
        const board = HighScores.boards && HighScores.boards[BossRush.active ? 'bossrush' : (Game.currentLevelIndex === -1 ? 'endless' : GameConfig.difficulty)];
        if (board && board.length) UI.label(ctx, 'BEST  ' + board[0].score.toLocaleString(), cx, y + 118, UI.DIM, 14);
        y += 154;

        // Chain: count, multiplier, and the time left to extend it
        const mult = Scoring.multiplier;
        const chainColor = mult >= 5 ? '#ffee33' : mult >= 3 ? '#ff8800' : UI.CYAN;
        UI.panel(ctx, x, y, w, 130, chainColor, { title: 'CHAIN' });
        if (Scoring.chain > 0) {
            Neon.text(ctx, Scoring.chain + '', x + 30, y + 90, chainColor, 48, { align: 'left', core: 0.3 });
            UI.label(ctx, 'HITS', x + 34 + String(Scoring.chain).length * 29, y + 88, UI.DIM, 15, 'left');
            Neon.text(ctx, mult + 'x', x + w - 30, y + 90, chainColor, 44, { align: 'right', core: 0.4 });
            const timerPct = Scoring.chainTimer / (Scoring.chainTimerMax / GameConfig.chainTimerSpeed);
            Neon.bar(ctx, x + 20, y + 108, w - 40, 6, timerPct, timerPct > 0.3 ? '#00ff88' : '#ff3355', 0);
        } else {
            UI.label(ctx, 'KILL QUICKLY TO BUILD A CHAIN', cx, y + 80, '#4a5468', 16);
        }
        y += 154;

        // Run stats
        UI.panel(ctx, x, y, w, 150, UI.MAGENTA, { title: 'RUN' });
        const stat = (label, value, color, row, col) => {
            const sx = x + 24 + col * (w / 2);
            UI.label(ctx, label, sx, y + 58 + row * 50, UI.DIM, 13, 'left');
            Neon.text(ctx, value, sx, y + 82 + row * 50, color, 21, { align: 'left', halo: 0 });
        };
        stat('BASE MULTIPLIER', GameConfig.scoreMultiplier + 'x', '#ffffff', 0, 0);
        stat('MAX CHAIN', Scoring.maxChain.toString(), '#ffaa00', 0, 1);
        if (GameConfig.graze.enabled) {
            const next = Scoring.nextGrazeThreshold < Scoring.grazeThresholds.length ? ' / ' + Scoring.grazeThresholds[Scoring.nextGrazeThreshold] : '';
            stat('GRAZE', Scoring.grazeCount + next, '#cc88ff', 1, 0);
        }
        if (Scoring.isPerfect) stat('NO HITS', '★ PERFECT', '#00ff88', 1, 1);
        y += 174;

        // Mission
        const isEndless = Game.currentLevelIndex === -1;
        const lvlData = ALL_LEVELS[Game.currentLevelIndex];
        const escort = Escort.active && Escort.alive;
        const rush = BossRush.active;
        UI.panel(ctx, x, y, w, escort ? 170 : 124, rush ? '#ff2255' : UI.CYAN, { title: rush ? 'BOSS RUSH' : (isEndless ? 'ENDLESS' : 'MISSION') });
        Neon.text(ctx, rush ? 'BOSS ' + (BossRush.stage + 1) + '/' + BossRush.order.length + '  ' + BossRush.bossName()
            : isEndless ? 'WAVE ' + EndlessMode.wave : (Game.currentLevelIndex + 1) + '  ' + (lvlData ? lvlData.name : '').toUpperCase(),
            x + 24, y + 62, isEndless ? '#ffaa00' : '#ffffff', rush ? 20 : 22, { align: 'left', halo: 0.2 });
        // Boss Rush shows its run clock instead of the level time
        const clock = rush ? BossRush.time : WaveSystem.levelTimer;
        const mins = Math.floor(clock / 60);
        const secs = Math.floor(clock % 60);
        const diffColors = { casual: '#00ff88', normal: '#ffee33', hardcore: '#ff3355', custom: '#cc44ff' };
        UI.label(ctx, GameConfig.difficulty.toUpperCase(), x + 24, y + 98, diffColors[GameConfig.difficulty] || '#ffffff', 16, 'left');
        Neon.text(ctx, `${mins}:${secs.toString().padStart(2, '0')}`, x + w - 24, y + 98, UI.TEXT, 20, { align: 'right', halo: 0 });
        if (escort) {
            const ePct = Escort.hp / Escort.maxHp;
            UI.label(ctx, 'AURORA', x + 24, y + 144, '#44ff88', 14, 'left');
            Neon.bar(ctx, x + 110, y + 134, w - 140, 12, ePct, ePct > 0.3 ? '#44ff88' : '#ff3355', 10);
        }

        // Controls reference (actual bindings)
        const controls = [
            ['MOVE', Input.getKeyBindDisplay('up').split(' / ')[0] + '/' + Input.getKeyBindDisplay('down').split(' / ')[0]],
            ['FIRE', Input.getKeyBindDisplay('fire')],
            ['FOCUS', Input.getKeyBindDisplay('focus')],
            ['DASH', Input.getKeyBindDisplay('dash')],
            ['BOMB', Input.getKeyBindDisplay('bomb')],
            ['SURGE', Input.getKeyBindDisplay('surge')],
            ['PAUSE', Input.getKeyBindDisplay('pause')],
        ];
        const cy = SCREEN_H - 40 - controls.length * 24;
        controls.forEach((c, i) => {
            UI.label(ctx, c[0], x + 24, cy + i * 24, UI.DIM, 14, 'left');
            UI.label(ctx, c[1], x + w - 24, cy + i * 24, '#8a9ab8', 14, 'right');
        });
    },

    // Last life: pulsing red strips on the play-area edges
    _drawDanger(ctx) {
        if (!(Player.alive && Player.lives <= 1 && Player.maxShieldHp === 0)) return;
        const pulse = Renderer.calm() ? 0.08 : 0.08 + Math.sin(Date.now() * 0.005) * 0.05;
        const edgeW = 30;
        const lg = ctx.createLinearGradient(PLAY_X, 0, PLAY_X + edgeW, 0);
        lg.addColorStop(0, `rgba(255, 0, 0, ${pulse})`);
        lg.addColorStop(1, 'rgba(255, 0, 0, 0)');
        ctx.fillStyle = lg;
        ctx.fillRect(PLAY_X, PLAY_Y, edgeW, PLAY_H);
        const rg = ctx.createLinearGradient(PLAY_X + PLAY_W, 0, PLAY_X + PLAY_W - edgeW, 0);
        rg.addColorStop(0, `rgba(255, 0, 0, ${pulse})`);
        rg.addColorStop(1, 'rgba(255, 0, 0, 0)');
        ctx.fillStyle = rg;
        ctx.fillRect(PLAY_X + PLAY_W - edgeW, PLAY_Y, edgeW, PLAY_H);
    }
};

// ============================================================
//  FPS METER (Settings → SHOW FPS)
//  Top-left readout for play-testing: frames per second, average and
//  worst frame time over the last second, graphics quality/resolution,
//  and live object counts (enemies, bullets, particles).
// ============================================================
const FpsMeter = {
    _frames: [],      // recent frame durations (ms)
    _acc: 0,
    _shown: { fps: 0, avg: 0, worst: 0 },

    // Called once per animation frame with the real (uncapped) frame time
    tick(frameMs) {
        if (!(frameMs > 0) || frameMs > 1000) return;
        this._frames.push(frameMs);
        this._acc += frameMs;
        if (this._acc >= 500) {
            // Refresh the readout twice a second so it's readable
            const recent = this._frames.slice(-120);
            const sum = recent.reduce((a, b) => a + b, 0);
            this._shown.avg = sum / recent.length;
            this._shown.fps = 1000 / this._shown.avg;
            this._shown.worst = Math.max(...recent);
            this._frames = recent.slice(-60);
            this._acc = 0;
        }
    },

    draw(ctx) {
        if (!Settings.values.showFps) return;
        const s = this._shown;
        const color = s.fps >= 55 ? '#00ff88' : s.fps >= 40 ? '#ffee33' : '#ff3355';
        const q = (Renderer.quality || '').toUpperCase() + (Renderer._autoQuality ? ' (AUTO)' : '');
        const lines = [
            [Math.round(s.fps) + ' FPS', color, 20],
            ['AVG ' + s.avg.toFixed(1) + ' ms   WORST ' + s.worst.toFixed(1) + ' ms', UI.TEXT, 13],
            [q + '   ' + (Renderer.playScale || 1) + '×' + (Renderer.usePixi ? '' : '   CANVAS 2D'), UI.DIM, 13],
            ['ENEMIES ' + Enemies.list.length + '   BULLETS ' + Enemies.enemyBullets.pool.length + '/' + Player.bullets.pool.length +
                '   PARTICLES ' + Particles.particles.length, UI.DIM, 13],
        ];
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(8, 8, 360, 94);
        let y = 32;
        for (const [text, c, size] of lines) {
            Neon.text(ctx, text, 18, y, c, size, { align: 'left', halo: 0, weight: size > 14 ? 'bold' : '' });
            y += size > 14 ? 24 : 19;
        }
    },
};
