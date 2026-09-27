// ============================================================
//  PERSISTENT STORAGE
// ============================================================
const Storage = {
    async get(key) {
        try {
            if (window.storage) {
                const result = await window.storage.get(key);
                return result ? JSON.parse(result.value) : null;
            }
            const v = localStorage.getItem('neonstorm_' + key);
            return v ? JSON.parse(v) : null;
        } catch (e) { return null; }
    },
    async set(key, value) {
        try {
            if (window.storage) {
                await window.storage.set(key, JSON.stringify(value));
            } else {
                localStorage.setItem('neonstorm_' + key, JSON.stringify(value));
            }
        } catch (e) { console.warn('Storage save failed:', e); }
    }
};


// ============================================================
//  HIGH SCORE SYSTEM
// ============================================================
const HighScores = {
    boards: { casual: [], normal: [], hardcore: [], endless: [] },
    sessionScores: [],
    loaded: false,
    enteringInitials: false,
    currentInitials: ['A', 'A', 'A'],
    initialCursor: 0,
    pendingScore: null,
    pendingDifficulty: null,
    pendingDetails: null,

    async load() {
        const data = await Storage.get('highscores');
        if (data) {
            this.boards = data;
        }
        // Ensure arrays exist
        ['casual', 'normal', 'hardcore', 'endless'].forEach(d => {
            if (!this.boards[d]) this.boards[d] = [];
        });
        this.loaded = true;
    },

    async save() {
        await Storage.set('highscores', this.boards);
    },

    qualifies(score, board) {
        if (board === 'custom') return false;
        const b = this.boards[board] || [];
        return b.length < 10 || score > b[b.length - 1].score;
    },

    addScore(initials, score, board, details) {
        if (board === 'custom') return;
        const entry = {
            initials,
            score,
            maxChain: details ? details.maxChain : 0,
            graze: details ? details.graze : 0,
            levelReached: details ? details.levelReached : 0,
            wave: details ? details.wave : 0,
            mode: details ? details.mode : 'campaign',
            won: details ? details.won : false,
            date: new Date().toLocaleDateString()
        };
        if (!this.boards[board]) this.boards[board] = [];
        this.boards[board].push(entry);
        this.boards[board].sort((a, b) => b.score - a.score);
        if (this.boards[board].length > 10) this.boards[board].length = 10;
        this.save();

        // Session scores
        this.sessionScores.push({ ...entry, difficulty: board });
        this.sessionScores.sort((a, b) => b.score - a.score);
    },

    startInitialEntry(score, board, details) {
        this.enteringInitials = true;
        this.currentInitials = ['A', 'A', 'A'];
        this.initialCursor = 0;
        this.pendingScore = score;
        this.pendingDifficulty = board;
        this.pendingDetails = details || null;
    },

    updateInitialEntry() {
        if (!this.enteringInitials) return false;

        if (Input.isPressed('up')) {
            let c = this.currentInitials[this.initialCursor].charCodeAt(0);
            c = c >= 90 ? 65 : c + 1; // A-Z wrap
            this.currentInitials[this.initialCursor] = String.fromCharCode(c);
            Audio.playMenuNav();
        }
        if (Input.isPressed('down')) {
            let c = this.currentInitials[this.initialCursor].charCodeAt(0);
            c = c <= 65 ? 90 : c - 1;
            this.currentInitials[this.initialCursor] = String.fromCharCode(c);
            Audio.playMenuNav();
        }
        if (Input.isPressed('right') || Input.isPressed('confirm')) {
            if (this.initialCursor < 2) {
                this.initialCursor++;
                Audio.playMenuNav();
            } else {
                // Submit
                const initials = this.currentInitials.join('');
                this.addScore(initials, this.pendingScore, this.pendingDifficulty, this.pendingDetails);
                this.enteringInitials = false;
                Audio.playMenuSelect();
                return true; // done
            }
        }
        if (Input.isPressed('left') && this.initialCursor > 0) {
            this.initialCursor--;
            Audio.playMenuNav();
        }
        return false;
    },

    drawInitialEntry(ctx, x, y) {
        Neon.text(ctx, 'NEW HIGH SCORE!', x, y + 10, '#ffee33', 28, { core: 0.4 });
        UI.label(ctx, 'ENTER YOUR INITIALS', x, y + 40, UI.TEXT, 16);
        for (let i = 0; i < 3; i++) {
            const cx = x - 56 + i * 56;
            const selected = i === this.initialCursor;
            const c = selected ? UI.CYAN : UI.DIM;
            UI.panel(ctx, cx - 22, y + 58, 44, 56, c, { fill: selected ? 'rgba(0,255,255,0.08)' : 'rgba(6,2,18,0.6)' });
            Neon.text(ctx, this.currentInitials[i], cx, y + 100, selected ? '#ffffff' : UI.TEXT, 38, { halo: selected ? 0.5 : 0 });
            if (selected) {
                Neon.text(ctx, '▲', cx, y + 52, UI.CYAN, 14, { halo: 0 });
                Neon.text(ctx, '▼', cx, y + 132, UI.CYAN, 14, { halo: 0 });
            }
        }
        UI.label(ctx, '↑↓ CHANGE   ←→ MOVE   ENTER CONFIRM', x, y + 160, UI.DIM, 14);
    },

    drawBoard(ctx, difficulty, x, y, w) {
        const board = this.boards[difficulty] || [];
        ctx.textAlign = 'center';
        ctx.fillStyle = '#888888';
        ctx.font = '12px Share Tech Mono, Consolas, monospace';

        if (board.length === 0) {
            ctx.fillText('NO SCORES YET', x, y + 20);
            return;
        }

        ctx.textAlign = 'left';
        const colRank = x - w / 2 + 10;
        const colName = x - w / 2 + 50;
        const colScore = x - w / 2 + 120;
        const colChain = x - w / 2 + 260;
        const colDate = x - w / 2 + 330;

        // Header
        ctx.fillStyle = '#666666';
        ctx.font = '12px Share Tech Mono, Consolas, monospace';
        ctx.fillText('#', colRank, y);
        ctx.fillText('NAME', colName, y);
        ctx.fillText('SCORE', colScore, y);
        ctx.fillText('CHAIN', colChain, y);
        ctx.fillText('DATE', colDate, y);

        board.forEach((entry, i) => {
            const ey = y + 18 + i * 22;
            ctx.fillStyle = i === 0 ? '#ffff00' : i < 3 ? '#ffaa00' : '#aaaaaa';
            ctx.font = i < 3 ? 'bold 13px Share Tech Mono, Consolas, monospace' : '13px Share Tech Mono, Consolas, monospace';
            ctx.fillText((i + 1).toString(), colRank, ey);
            ctx.fillText(entry.initials, colName, ey);
            ctx.fillText(entry.score.toLocaleString(), colScore, ey);
            ctx.fillText(entry.maxChain.toString(), colChain, ey);
            ctx.fillStyle = '#666666';
            ctx.fillText(entry.date || '', colDate, ey);
        });
        ctx.textAlign = 'center';
    }
};


// ============================================================
//  SETTINGS SYSTEM
// ============================================================
const Settings = {
    values: {
        sfxVolume: 70,
        musicVolume: 50,
        screenShake: 'high',    // 'off', 'low', 'high'
        particleDensity: 'high', // 'low', 'medium', 'high'
        showHitbox: false,
        flashReduction: false,
        fireMode: 'manual',     // 'auto', 'manual'
        colorblind: false,
    },
    menuOpen: false,
    selectedIndex: 0,
    items: [
        { key: 'sfxVolume', label: 'SFX VOLUME', type: 'slider', min: 0, max: 100, step: 10 },
        { key: 'musicVolume', label: 'MUSIC VOLUME', type: 'slider', min: 0, max: 100, step: 10 },
        { key: 'screenShake', label: 'SCREEN SHAKE', type: 'cycle', options: ['off', 'low', 'high'] },
        { key: 'particleDensity', label: 'PARTICLES', type: 'cycle', options: ['low', 'medium', 'high'] },
        { key: 'showHitbox', label: 'SHOW HITBOX', type: 'toggle' },
        { key: 'flashReduction', label: 'FLASH REDUCTION', type: 'toggle' },
        { key: 'colorblind', label: 'COLORBLIND MODE', type: 'toggle' },
        { key: 'fireMode', label: 'FIRE MODE', type: 'cycle', options: ['manual', 'auto'] },
        { key: 'controls', label: 'CONTROLS', type: 'action' },
        { key: 'back', label: 'BACK', type: 'action' }
    ],

    async load() {
        const data = await Storage.get('settings');
        if (data) Object.assign(this.values, data);
        this._apply();
    },

    async save() {
        await Storage.set('settings', this.values);
    },

    _apply() {
        Audio.sfxVolume = this.values.sfxVolume / 100;
        Audio.musicVolume = this.values.musicVolume / 100;
        GameConfig.fireMode = this.values.fireMode;
    },

    // Colorblind-safe enemy bullet color (replaces pink/red with high-contrast yellow)
    enemyBulletColor(originalColor) {
        if (!this.values.colorblind) return originalColor;
        // Map pink/red/magenta enemy bullets to yellow/orange for visibility
        return '#ffcc00';
    },

    update() {
        if (Input.isPressed('up')) {
            this.selectedIndex = (this.selectedIndex - 1 + this.items.length) % this.items.length;
            Audio.playMenuNav();
        }
        if (Input.isPressed('down')) {
            this.selectedIndex = (this.selectedIndex + 1) % this.items.length;
            Audio.playMenuNav();
        }

        const item = this.items[this.selectedIndex];

        if (item.type === 'slider') {
            if (Input.isPressed('left')) {
                this.values[item.key] = Math.max(item.min, this.values[item.key] - item.step);
                this._apply();
                Audio.playMenuNav();
            }
            if (Input.isPressed('right')) {
                this.values[item.key] = Math.min(item.max, this.values[item.key] + item.step);
                this._apply();
                Audio.playMenuNav();
            }
        } else if (item.type === 'cycle') {
            if (Input.isPressed('left') || Input.isPressed('right') || Input.isPressed('confirm')) {
                const opts = item.options;
                const idx = opts.indexOf(this.values[item.key]);
                this.values[item.key] = opts[(idx + 1) % opts.length];
                this._apply();
                Audio.playMenuNav();
            }
        } else if (item.type === 'toggle') {
            if (Input.isPressed('confirm') || Input.isPressed('left') || Input.isPressed('right')) {
                this.values[item.key] = !this.values[item.key];
                this._apply();
                Audio.playMenuNav();
            }
        } else if (item.type === 'action' && item.key === 'back') {
            if (Input.isPressed('confirm')) {
                this.save();
                return 'back';
            }
        } else if (item.type === 'action' && item.key === 'controls') {
            if (Input.isPressed('confirm')) {
                Audio.playMenuSelect();
                return 'controls';
            }
        }

        if (Input.isPressed('back')) {
            this.save();
            return 'back';
        }
        return null;
    },

    draw(ctx) {
        UI.background(ctx, { dim: 0.55 });
        UI.title(ctx, 'SETTINGS', 110);
        const cx = SCREEN_W / 2;
        const rowH = 58, top = 200;
        UI.panel(ctx, cx - 420, top - 40, 840, this.items.length * rowH + 30, UI.CYAN);

        for (let i = 0; i < this.items.length; i++) {
            const item = this.items[i];
            const y = top + i * rowH;
            const selected = i === this.selectedIndex;
            const valColor = selected ? UI.CYAN : UI.TEXT;

            if (item.type === 'action') {
                UI.item(ctx, item.label, cx, y + 6, selected, { w: 520, size: 20 });
                continue;
            }
            if (selected) {
                ctx.fillStyle = UI.CYAN;
                ctx.globalAlpha = 0.12;
                ctx.fillRect(cx - 400, y - 26, 800, 42);
                ctx.globalAlpha = 1;
                ctx.fillRect(cx - 400, y - 26, 3, 42);
            }
            Neon.text(ctx, item.label, cx - 30, y + 2, selected ? '#ffffff' : UI.DIM, selected ? 20 : 18,
                { align: 'right', halo: 0, weight: selected ? 'bold' : '' });

            const vx = cx + 20;
            if (item.type === 'slider') {
                const val = this.values[item.key];
                Neon.bar(ctx, vx + 24, y - 10, 220, 12, val / item.max, selected ? UI.CYAN : '#5a6a88', 10);
                Neon.text(ctx, val + '%', vx + 270, y + 2, valColor, 18, { align: 'left', halo: 0 });
                if (selected) {
                    Neon.text(ctx, '◂', vx + 8, y + 2, UI.CYAN, 18, { halo: 0 });
                    Neon.text(ctx, '▸', vx + 340, y + 2, UI.CYAN, 18, { halo: 0 });
                }
            } else if (item.type === 'cycle') {
                const val = this.values[item.key].toString().toUpperCase();
                Neon.text(ctx, selected ? '◂  ' + val + '  ▸' : val, vx, y + 2, valColor, 18, { align: 'left', halo: selected ? 0.3 : 0 });
            } else if (item.type === 'toggle') {
                const on = this.values[item.key];
                // Switch: a pill with a knob
                const sx = vx, sy = y - 12;
                ctx.fillStyle = on ? 'rgba(0,255,136,0.25)' : 'rgba(255,51,85,0.15)';
                ctx.fillRect(sx, sy, 56, 22);
                ctx.strokeStyle = on ? '#00ff88' : '#ff3355';
                ctx.lineWidth = 1.5;
                ctx.strokeRect(sx + 0.5, sy + 0.5, 55, 21);
                ctx.fillStyle = on ? '#00ff88' : '#ff3355';
                ctx.fillRect(on ? sx + 34 : sx + 4, sy + 4, 18, 14);
                Neon.text(ctx, on ? 'ON' : 'OFF', sx + 72, y + 2, on ? '#00ff88' : '#ff3355', 17, { align: 'left', halo: 0 });
            }
        }
        UI.hint(ctx, '↑↓ SELECT   ←→ ADJUST   ENTER CONFIRM   ESC BACK');
    }
};

// ============================================================
//  CONTROLS REBINDING SCREEN
// ============================================================
const ControlsScreen = {
    selectedIndex: 0,
    mode: 'browse', // 'browse', 'rebind_key', 'rebind_button'

    // Items: one row per rebindable action + reset + back
    getItems() {
        const items = Input.rebindableActions.map(action => ({
            action,
            label: action.toUpperCase()
        }));
        items.push({ action: 'reset', label: 'RESET TO DEFAULTS' });
        items.push({ action: 'back', label: 'BACK' });
        return items;
    },

    update() {
        const items = this.getItems();

        if (this.mode === 'rebind_key') {
            // Waiting for key press — Input handles capture via listeningForKey
            if (!Input.listeningForKey) {
                // Key was captured, return to browse
                this.mode = 'browse';
                Audio.playMenuSelect();
            }
            // Allow cancel with Escape (handled specially)
            return null;
        }

        if (this.mode === 'rebind_button') {
            // Waiting for gamepad button
            if (!Input.listeningForButton) {
                this.mode = 'browse';
                Audio.playMenuSelect();
            }
            // Cancel if no gamepad after a timeout — allow keyboard escape
            if (Input.keys['Escape'] && !Input.prevKeys['Escape']) {
                Input.cancelListen();
                this.mode = 'browse';
                Audio.playMenuNav();
            }
            return null;
        }

        // Browse mode
        if (Input.isPressed('up')) {
            this.selectedIndex = (this.selectedIndex - 1 + items.length) % items.length;
            Audio.playMenuNav();
        }
        if (Input.isPressed('down')) {
            this.selectedIndex = (this.selectedIndex + 1) % items.length;
            Audio.playMenuNav();
        }

        const item = items[this.selectedIndex];

        if (Input.isPressed('confirm') || Input.isPressed('right')) {
            if (item.action === 'back') {
                Audio.playMenuSelect();
                return 'back';
            } else if (item.action === 'reset') {
                Input.resetBindings();
                Audio.playMenuSelect();
                return null;
            } else {
                // Start keyboard rebind for this action
                this.mode = 'rebind_key';
                Input.startKeyListen(item.action);
                Audio.playMenuNav();
                return null;
            }
        }

        // Left arrow → rebind gamepad button
        if (Input.isPressed('left') && item.action !== 'back' && item.action !== 'reset') {
            if (Input.gamepadState) {
                this.mode = 'rebind_button';
                Input.startButtonListen(item.action);
                Audio.playMenuNav();
            }
        }

        if (Input.isPressed('back')) {
            Audio.playMenuNav();
            return 'back';
        }

        return null;
    },

    draw(ctx) {
        UI.background(ctx, { dim: 0.55 });
        UI.title(ctx, 'CONTROLS', 100);
        const cx = SCREEN_W / 2;
        const items = this.getItems();
        const top = 220, lineH = 50;
        UI.panel(ctx, cx - 440, top - 70, 880, items.length * lineH + 60, UI.CYAN);
        UI.label(ctx, 'ACTION', cx - 260, top - 30, UI.DIM, 14);
        UI.label(ctx, 'KEYBOARD', cx, top - 30, UI.DIM, 14);
        UI.label(ctx, 'GAMEPAD', cx + 260, top - 30, UI.DIM, 14);

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const y = top + i * lineH;
            const selected = i === this.selectedIndex;
            if (item.action === 'back' || item.action === 'reset') {
                UI.item(ctx, item.label, cx, y + 6, selected, { w: 460, size: 20, color: item.action === 'reset' ? '#ffaa00' : UI.CYAN });
                continue;
            }
            if (selected) {
                ctx.fillStyle = UI.CYAN;
                ctx.globalAlpha = 0.12;
                ctx.fillRect(cx - 420, y - 26, 840, 40);
                ctx.globalAlpha = 1;
                ctx.fillRect(cx - 420, y - 26, 3, 40);
            }
            Neon.text(ctx, item.label, cx - 260, y, selected ? '#ffffff' : UI.TEXT, 18, { halo: 0, weight: selected ? 'bold' : '' });
            const listenKey = this.mode === 'rebind_key' && selected;
            const listenBtn = this.mode === 'rebind_button' && selected;
            Neon.text(ctx, listenKey ? '[ PRESS A KEY ]' : Input.getKeyBindDisplay(item.action), cx, y,
                listenKey ? '#ffee33' : (selected ? UI.CYAN : UI.DIM), 17, { halo: listenKey ? 0.4 : 0, weight: '' });
            Neon.text(ctx, listenBtn ? '[ PRESS BUTTON ]' : Input.getGpBindDisplay(item.action), cx + 260, y,
                listenBtn ? '#ffee33' : (selected ? UI.CYAN : UI.DIM), 17, { halo: listenBtn ? 0.4 : 0, weight: '' });
        }

        if (this.mode === 'rebind_key') {
            UI.label(ctx, 'Press any key to bind, or ESC to cancel', cx, SCREEN_H - 90, '#ffee33', 16);
        } else if (this.mode === 'rebind_button') {
            UI.label(ctx, 'Press any gamepad button to bind, or ESC to cancel', cx, SCREEN_H - 90, '#ffee33', 16);
        } else {
            UI.label(ctx, 'ENTER/→ REBIND KEYBOARD    ← REBIND GAMEPAD (IF CONNECTED)', cx, SCREEN_H - 90, UI.DIM, 15);
        }
        UI.label(ctx, Input.gamepadState ? 'GAMEPAD CONNECTED' : 'NO GAMEPAD DETECTED', cx, SCREEN_H - 62,
            Input.gamepadState ? '#00ff88' : UI.DIM, 14);
        UI.hint(ctx, 'ESC BACK', SCREEN_H - 34);
    }
};


// ============================================================
//  ACHIEVEMENT SYSTEM
// ============================================================
const Achievements = {
    // All achievement definitions
    defs: [
        // Combat
        { id: 'first_blood', name: 'First Blood', desc: 'Complete Level 1', reward: 20, icon: '⚔' },
        { id: 'exterminator', name: 'Exterminator', desc: 'Defeat 500 enemies total', reward: 50, icon: '💀', track: 'totalKills', target: 500 },
        { id: 'boss_slayer', name: 'Boss Slayer', desc: 'Defeat any boss', reward: 30, icon: '👑' },
        { id: 'boss_master', name: 'Boss Master', desc: 'Defeat all 6 bosses', reward: 100, icon: '🏆' },
        // Scoring
        { id: 'chain_10', name: 'Chain Starter', desc: 'Reach a 10-hit chain', reward: 15, icon: '🔗' },
        { id: 'chain_50', name: 'Chain Expert', desc: 'Reach a 50-hit chain', reward: 40, icon: '🔗' },
        { id: 'chain_100', name: 'Chain Master', desc: 'Reach a 100-hit chain', reward: 80, icon: '🔗' },
        { id: 'surge_first', name: 'Neon Surge', desc: 'Activate Neon Surge for the first time', reward: 20, icon: '⚡' },
        { id: 'score_100k', name: 'High Roller', desc: 'Score 100,000 in a single run', reward: 30, icon: '💰' },
        { id: 'score_500k', name: 'Score Legend', desc: 'Score 500,000 in a single run', reward: 75, icon: '💰' },
        // Survival
        { id: 'untouchable', name: 'Untouchable', desc: 'Complete any level without dying', reward: 60, icon: '🛡' },
        { id: 'graze_100', name: 'Bullet Dancer', desc: 'Accumulate 100 grazes in a single run', reward: 25, icon: '✨' },
        { id: 'graze_500', name: 'Bullet Whisperer', desc: 'Accumulate 500 grazes in a single run', reward: 60, icon: '✨' },
        // Campaign
        { id: 'campaign_casual', name: 'Tourist', desc: 'Complete the campaign on Casual', reward: 30, icon: '🌟' },
        { id: 'campaign_normal', name: 'Soldier', desc: 'Complete the campaign on Normal', reward: 60, icon: '🌟' },
        { id: 'campaign_hardcore', name: 'Legend', desc: 'Complete the campaign on Hardcore', reward: 150, icon: '🌟' },
        { id: 'secret_found', name: 'Signal Traced', desc: 'Unlock the secret level', reward: 40, icon: '📡' },
        { id: 'secret_beat', name: 'Void Walker', desc: 'Complete the secret level', reward: 100, icon: '🌀' },
        // Collection
        { id: 'max_weapon', name: 'Fully Armed', desc: 'Max out any weapon to Level 5', reward: 20, icon: '🔫' },
        { id: 'max_drones', name: 'Drone Commander', desc: 'Reach Drone Level 5', reward: 25, icon: '🤖' },
    ],

    unlocked: [],   // Array of unlocked achievement IDs
    trackers: {},   // Persistent counters like totalKills
    newlyUnlocked: [], // Queue of just-unlocked for popup display
    loaded: false,

    async load() {
        const data = await Storage.get('achievements');
        if (data) {
            this.unlocked = data.unlocked || [];
            this.trackers = data.trackers || {};
        }
        this.loaded = true;
    },

    async save() {
        await Storage.set('achievements', {
            unlocked: this.unlocked,
            trackers: this.trackers
        });
    },

    isUnlocked(id) {
        return this.unlocked.includes(id);
    },

    unlock(id) {
        if (this.isUnlocked(id)) return false;
        const def = this.defs.find(d => d.id === id);
        if (!def) return false;
        this.unlocked.push(id);
        this.newlyUnlocked.push(def);
        NeonCredits.balance += def.reward;
        NeonCredits.save();
        this.save();
        Audio.playPowerUp();
        Scoring.spawnPopup('ACHIEVEMENT: ' + def.name.toUpperCase(), '#ffff00', 20);
        return true;
    },

    addTracker(key, amount) {
        this.trackers[key] = (this.trackers[key] || 0) + amount;
        // Check tracker-based achievements
        for (const def of this.defs) {
            if (def.track === key && this.trackers[key] >= def.target) {
                this.unlock(def.id);
            }
        }
        this.save();
    },

    // Called after each enemy kill
    onEnemyKill() {
        this.addTracker('totalKills', 1);
    },

    // Called at end of level to check level-completion achievements
    onLevelComplete(levelIndex, difficulty, noDeaths, score, maxChain, grazeCount) {
        // First blood
        if (levelIndex === 0) this.unlock('first_blood');
        // Boss slayer
        this.unlock('boss_slayer');
        // Boss master — check if all 6 levels beaten
        const bossesBeat = this.trackers.bossesBeaten || [];
        if (!bossesBeat.includes(levelIndex)) {
            bossesBeat.push(levelIndex);
            this.trackers.bossesBeaten = bossesBeat;
        }
        if (bossesBeat.length >= 6) this.unlock('boss_master');
        // Untouchable
        if (noDeaths) this.unlock('untouchable');
        // Score achievements
        if (score >= 100000) this.unlock('score_100k');
        if (score >= 500000) this.unlock('score_500k');
        // Chain achievements
        if (maxChain >= 10) this.unlock('chain_10');
        if (maxChain >= 50) this.unlock('chain_50');
        if (maxChain >= 100) this.unlock('chain_100');
        // Graze achievements
        if (grazeCount >= 100) this.unlock('graze_100');
        if (grazeCount >= 500) this.unlock('graze_500');
        // Campaign completion
        if (levelIndex === 4) {
            if (difficulty === 'casual') this.unlock('campaign_casual');
            if (difficulty === 'normal') this.unlock('campaign_normal');
            if (difficulty === 'hardcore') this.unlock('campaign_hardcore');
        }
        // Secret level
        if (levelIndex === 5) this.unlock('secret_beat');
        this.save();
    },

    // Called when surge activates
    onSurge() { this.unlock('surge_first'); },

    // Called when secret level is unlocked
    onSecretUnlocked() { this.unlock('secret_found'); },

    // Called when weapon maxed
    onWeaponMax() { this.unlock('max_weapon'); },
    onDroneMax() { this.unlock('max_drones'); },

    // Get completion stats
    getProgress() {
        return { unlocked: this.unlocked.length, total: this.defs.length };
    }
};

// ============================================================
//  NEON CREDITS SYSTEM
// ============================================================
const NeonCredits = {
    balance: 0,

    async load() {
        const data = await Storage.get('neonCredits');
        if (data !== null) this.balance = data;
    },

    async save() {
        await Storage.set('neonCredits', this.balance);
    },

    earn(score, difficulty) {
        const multipliers = { casual: 0.75, normal: 1.0, hardcore: 1.5, custom: 0.75 };
        const nc = Math.max(5, Math.floor(score / 3000 * (multipliers[difficulty] || 1)));
        this.balance += nc;
        this.save();
        return nc;
    }
};


// ============================================================
//  END-OF-RUN BONUSES
// ============================================================
const EndRunBonus = {
    bonuses: [],
    totalBonus: 0,

    calculate(won, lives, maxChain, graze, levelTime, noDeath) {
        this.bonuses = [];
        this.totalBonus = 0;

        if (won) {
            // Time bonus (faster = more points, baseline 5 min)
            const timeBonus = Math.max(0, Math.floor((300 - levelTime) * 100)) * GameConfig.scoreMultiplier;
            if (timeBonus > 0) this.bonuses.push({ label: 'TIME BONUS', value: Math.floor(timeBonus) });

            // Lives bonus
            const livesBonus = lives * 5000 * GameConfig.scoreMultiplier;
            this.bonuses.push({ label: 'LIVES BONUS', value: Math.floor(livesBonus) });

            // No-death bonus
            if (noDeath) {
                const noDeathBonus = 15000 * GameConfig.scoreMultiplier;
                this.bonuses.push({ label: 'NO DEATH BONUS', value: Math.floor(noDeathBonus) });
            }
        }

        // Chain bonus (always)
        const chainBonus = maxChain * 50 * GameConfig.scoreMultiplier;
        if (chainBonus > 0) this.bonuses.push({ label: 'CHAIN BONUS', value: Math.floor(chainBonus) });

        // Graze bonus
        const grazeBonus = graze * 10 * GameConfig.scoreMultiplier;
        if (grazeBonus > 0) this.bonuses.push({ label: 'GRAZE BONUS', value: Math.floor(grazeBonus) });

        this.totalBonus = this.bonuses.reduce((sum, b) => sum + b.value, 0);
        return this.totalBonus;
    },

    draw(ctx, x, startY) {
        let y = startY;
        for (const b of this.bonuses) {
            Neon.text(ctx, b.label, x - 16, y, UI.DIM, 17, { align: 'right', halo: 0, weight: '' });
            Neon.text(ctx, '+' + b.value.toLocaleString(), x + 16, y, '#00ff88', 17, { align: 'left', halo: 0.2 });
            y += 28;
        }
        if (this.bonuses.length > 0) {
            y += 8;
            Neon.text(ctx, 'TOTAL BONUS  +' + this.totalBonus.toLocaleString(), x, y, '#ffffff', 19, { halo: 0.2 });
        }
        return y + 14;
    }
};
