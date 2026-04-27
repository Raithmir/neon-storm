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
        ctx.fillStyle = '#ffff00';
        ctx.font = 'bold 18px Share Tech Mono, Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('NEW HIGH SCORE!', x, y);

        ctx.fillStyle = '#aaaaaa';
        ctx.font = '14px Share Tech Mono, Consolas, monospace';
        ctx.fillText('ENTER YOUR INITIALS', x, y + 25);

        for (let i = 0; i < 3; i++) {
            const cx = x - 30 + i * 30;
            const selected = i === this.initialCursor;
            ctx.fillStyle = selected ? '#00ffff' : '#888888';
            ctx.shadowColor = selected ? '#00ffff' : 'transparent';
            ctx.shadowBlur = selected ? 10 : 0;
            ctx.font = 'bold 32px Share Tech Mono, Consolas, monospace';
            ctx.fillText(this.currentInitials[i], cx, y + 65);
            if (selected) {
                ctx.fillStyle = '#00ffff';
                ctx.fillText('▲', cx, y + 42);
                ctx.fillText('▼', cx, y + 82);
            }
        }
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#778899';
        ctx.font = '13px Share Tech Mono, Consolas, monospace';
        ctx.fillText('↑↓ CHANGE  ←→ MOVE  ENTER CONFIRM', x, y + 105);
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
        ctx.fillText('SETTINGS', SCREEN_W / 2, 120);
        ctx.shadowBlur = 0;

        const startY = 220;
        for (let i = 0; i < this.items.length; i++) {
            const item = this.items[i];
            const y = startY + i * 55;
            const selected = i === this.selectedIndex;

            // Label (skip for action items — they draw their own centered label)
            if (item.type !== 'action') {
                ctx.fillStyle = selected ? '#ffffff' : '#667788';
                ctx.font = selected ? 'bold 16px Share Tech Mono, Consolas, monospace' : '14px Share Tech Mono, Consolas, monospace';
                ctx.textAlign = 'right';
                ctx.fillText(item.label, SCREEN_W / 2 - 20, y);
            }

            // Value
            ctx.textAlign = 'left';
            ctx.fillStyle = selected ? '#00ffff' : '#888888';
            ctx.font = selected ? 'bold 16px Share Tech Mono, Consolas, monospace' : '14px Share Tech Mono, Consolas, monospace';

            if (item.type === 'slider') {
                const val = this.values[item.key];
                const barW = 150;
                const barH = 8;
                const barX = SCREEN_W / 2 + 20;
                ctx.fillStyle = '#222233';
                ctx.fillRect(barX, y - barH / 2 - 2, barW, barH);
                ctx.fillStyle = selected ? '#00ffff' : '#667788';
                ctx.fillRect(barX, y - barH / 2 - 2, barW * (val / item.max), barH);
                ctx.fillStyle = selected ? '#ffffff' : '#aaaaaa';
                ctx.fillText(val + '%', barX + barW + 15, y);
                if (selected) {
                    ctx.fillStyle = '#00ffff';
                    ctx.fillText('◂', barX - 15, y);
                    ctx.fillText('▸', barX + barW + 55, y);
                }
            } else if (item.type === 'cycle') {
                const val = this.values[item.key].toUpperCase();
                ctx.fillText(selected ? '◂ ' + val + ' ▸' : val, SCREEN_W / 2 + 20, y);
            } else if (item.type === 'toggle') {
                const val = this.values[item.key];
                ctx.fillStyle = val ? '#00ff88' : '#ff4444';
                ctx.fillText(val ? 'ON' : 'OFF', SCREEN_W / 2 + 20, y);
            } else if (item.type === 'action') {
                ctx.textAlign = 'center';
                if (selected) {
                    ctx.fillStyle = '#00ffff';
                    ctx.font = 'bold 16px Share Tech Mono, Consolas, monospace';
                    ctx.fillText('▸ ' + item.label + ' ◂', SCREEN_W / 2, y);
                } else {
                    ctx.fillStyle = '#667788';
                    ctx.font = '14px Share Tech Mono, Consolas, monospace';
                    ctx.fillText(item.label, SCREEN_W / 2, y);
                }
            }
        }
        ctx.textAlign = 'center';
        ctx.fillStyle = '#667788';
        ctx.font = '13px Share Tech Mono, Consolas, monospace';
        ctx.fillText('↑↓ SELECT  ←→ ADJUST  ENTER CONFIRM  ESC BACK', SCREEN_W / 2, SCREEN_H - 50);
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
        const grad = ctx.createLinearGradient(0, 0, 0, SCREEN_H);
        grad.addColorStop(0, '#0a0620');
        grad.addColorStop(1, '#1a0a3e');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

        ctx.textAlign = 'center';
        ctx.fillStyle = '#00ffff';
        ctx.font = 'bold 32px Share Tech Mono, Consolas, monospace';
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 10;
        ctx.fillText('CONTROLS', SCREEN_W / 2, 80);
        ctx.shadowBlur = 0;

        // Column headers
        ctx.fillStyle = '#667788';
        ctx.font = '13px Share Tech Mono, Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('ACTION', SCREEN_W / 2 - 200, 130);
        ctx.fillText('KEYBOARD', SCREEN_W / 2, 130);
        ctx.fillText('GAMEPAD', SCREEN_W / 2 + 200, 130);

        // Separator line
        ctx.strokeStyle = '#333355';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(SCREEN_W / 2 - 320, 140);
        ctx.lineTo(SCREEN_W / 2 + 320, 140);
        ctx.stroke();

        const items = this.getItems();
        const startY = 170;
        const lineH = 40;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const y = startY + i * lineH;
            const selected = i === this.selectedIndex;
            const isAction = item.action === 'back' || item.action === 'reset';

            if (isAction) {
                ctx.textAlign = 'center';
                ctx.fillStyle = selected ? (item.action === 'reset' ? '#ffaa00' : '#00ffff') : '#667788';
                ctx.font = selected ? 'bold 16px Share Tech Mono, Consolas, monospace' : '14px Share Tech Mono, Consolas, monospace';
                ctx.fillText(selected ? '▸ ' + item.label + ' ◂' : item.label, SCREEN_W / 2, y);
                continue;
            }

            // Selection highlight
            if (selected) {
                ctx.strokeStyle = '#00ffff';
                ctx.shadowColor = '#00ffff';
                ctx.shadowBlur = 6;
                ctx.lineWidth = 1;
                ctx.strokeRect(SCREEN_W / 2 - 320, y - 15, 640, 32);
                ctx.shadowBlur = 0;
            }

            // Action name
            ctx.textAlign = 'center';
            ctx.fillStyle = selected ? '#ffffff' : '#99aabb';
            ctx.font = selected ? 'bold 15px Share Tech Mono, Consolas, monospace' : '14px Share Tech Mono, Consolas, monospace';
            ctx.fillText(item.label, SCREEN_W / 2 - 200, y);

            // Keyboard binding
            const isListeningKey = this.mode === 'rebind_key' && selected;
            ctx.fillStyle = isListeningKey ? '#ffff00' : (selected ? '#00ffff' : '#888888');
            ctx.font = '14px Share Tech Mono, Consolas, monospace';
            ctx.fillText(isListeningKey ? '[ PRESS A KEY ]' : Input.getKeyBindDisplay(item.action), SCREEN_W / 2, y);

            // Gamepad binding
            const isListeningBtn = this.mode === 'rebind_button' && selected;
            ctx.fillStyle = isListeningBtn ? '#ffff00' : (selected ? '#00ffff' : '#888888');
            ctx.fillText(isListeningBtn ? '[ PRESS BUTTON ]' : Input.getGpBindDisplay(item.action), SCREEN_W / 2 + 200, y);
        }

        // Instructions
        ctx.textAlign = 'center';
        ctx.fillStyle = '#667788';
        ctx.font = '13px Share Tech Mono, Consolas, monospace';
        if (this.mode === 'rebind_key') {
            ctx.fillStyle = '#ffff00';
            ctx.fillText('Press any key to bind, or ESC to cancel', SCREEN_W / 2, SCREEN_H - 80);
        } else if (this.mode === 'rebind_button') {
            ctx.fillStyle = '#ffff00';
            ctx.fillText('Press any gamepad button to bind, or ESC to cancel', SCREEN_W / 2, SCREEN_H - 80);
        } else {
            ctx.fillText('ENTER/→ = Rebind keyboard    ← = Rebind gamepad (if connected)', SCREEN_W / 2, SCREEN_H - 80);
        }
        ctx.fillStyle = '#667788';
        ctx.fillText('ESC = Back', SCREEN_W / 2, SCREEN_H - 55);

        // Gamepad status
        ctx.fillStyle = Input.gamepadState ? '#00ff88' : '#667788';
        ctx.font = '12px Share Tech Mono, Consolas, monospace';
        ctx.fillText(Input.gamepadState ? 'GAMEPAD CONNECTED' : 'NO GAMEPAD DETECTED', SCREEN_W / 2, SCREEN_H - 30);
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

    calculate(won, lives, maxChain, graze, levelTime) {
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
            if (lives === GameConfig.lives) {
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
            ctx.fillStyle = '#aaaaaa';
            ctx.font = '14px Share Tech Mono, Consolas, monospace';
            ctx.textAlign = 'right';
            ctx.fillText(b.label, x - 10, y);
            ctx.textAlign = 'left';
            ctx.fillStyle = '#00ff88';
            ctx.fillText('+' + b.value.toLocaleString(), x + 10, y);
            y += 22;
        }
        if (this.bonuses.length > 0) {
            y += 5;
            ctx.textAlign = 'center';
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 16px Share Tech Mono, Consolas, monospace';
            ctx.fillText('TOTAL BONUS: +' + this.totalBonus.toLocaleString(), x, y);
        }
        ctx.textAlign = 'center';
        return y + 10;
    }
};
