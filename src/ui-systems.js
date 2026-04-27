// ============================================================
//  CUSTOM DIFFICULTY
// ============================================================
const CustomDifficulty = {
    selectedIndex: 0,
    config: {},
    startLevel: 0,
    items: [
        { key: 'startLevel', label: 'START LEVEL', type: 'cycle', options: [0, 1, 2, 3, 4, 5], labels: ['1', '2', '3', '4', '5', '6 (SECRET)'], configPath: null },
        { key: 'bombs_enabled', label: 'BOMBS', type: 'toggle', configPath: ['bombs', 'enabled'] },
        { key: 'bombs_count', label: 'BOMB COUNT', type: 'cycle', options: [1, 2, 3, 4, 5], configPath: ['bombs', 'startCount'] },
        { key: 'focus_enabled', label: 'FOCUS MODE', type: 'toggle', configPath: ['focus', 'enabled'] },
        { key: 'dash_enabled', label: 'DASH', type: 'toggle', configPath: ['dash', 'enabled'] },
        { key: 'dash_cooldown', label: 'DASH COOLDOWN', type: 'cycle', options: [1.0, 1.5, 2.0, 3.0, 5.0], configPath: ['dash', 'cooldown'], suffix: 's' },
        { key: 'graze_enabled', label: 'GRAZE SYSTEM', type: 'toggle', configPath: ['graze', 'enabled'] },
        { key: 'graze_zone', label: 'GRAZE ZONE', type: 'cycle', options: [1.4, 1.0, 0.7], labels: ['GENEROUS', 'STANDARD', 'TIGHT'], configPath: ['graze', 'zoneMultiplier'] },
        { key: 'autofire', label: 'AUTO-FIRE', type: 'toggle', configPath: ['autofire'] },
        { key: 'lives', label: 'LIVES', type: 'cycle', options: [1, 2, 3, 5], configPath: ['lives'] },
        { key: 'shieldHp', label: 'SHIELD HP', type: 'cycle', options: [0, 1, 2, 3, 5], labels: ['OFF', '1 HIT', '2 HITS', '3 HITS', '5 HITS'], configPath: ['shieldHp'] },
        { key: 'deathPenalty', label: 'DEATH PENALTY', type: 'cycle', options: ['none', 'moderate', 'full'], configPath: ['deathPenalty'] },
        { key: 'bulletDensity', label: 'BULLET DENSITY', type: 'cycle', options: [0.5, 0.75, 1.0, 1.3, 1.6], labels: ['50%', '75%', '100%', '130%', '160%'], configPath: ['bulletDensity'] },
        { key: 'chainTimerSpeed', label: 'CHAIN TIMER', type: 'cycle', options: [0.7, 1.0, 1.4], labels: ['LENIENT', 'STANDARD', 'AGGRESSIVE'], configPath: ['chainTimerSpeed'] },
        { key: 'start', label: 'START GAME', type: 'action' },
        { key: 'back', label: 'BACK', type: 'action' }
    ],

    init() {
        this.config = JSON.parse(JSON.stringify(DIFFICULTY_PRESETS.normal));
        this.selectedIndex = 0;
    },

    _getVal(item) {
        const path = item.configPath;
        if (!path) return null;
        if (path.length === 1) return this.config[path[0]];
        return this.config[path[0]][path[1]];
    },

    _setVal(item, val) {
        const path = item.configPath;
        if (path.length === 1) this.config[path[0]] = val;
        else this.config[path[0]][path[1]] = val;
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

        if (item.type === 'toggle' && item.configPath) {
            if (Input.isPressed('confirm') || Input.isPressed('left') || Input.isPressed('right')) {
                this._setVal(item, !this._getVal(item));
                Audio.playMenuNav();
            }
        } else if (item.type === 'cycle' && item.key === 'startLevel') {
            if (Input.isPressed('left') || Input.isPressed('right') || Input.isPressed('confirm')) {
                const opts = item.options;
                let idx = opts.indexOf(this.startLevel);
                if (idx === -1) idx = 0;
                const dir = Input.isPressed('left') ? -1 : 1;
                idx = (idx + dir + opts.length) % opts.length;
                this.startLevel = opts[idx];
                Audio.playMenuNav();
            }
        } else if (item.type === 'cycle' && item.configPath) {
            if (Input.isPressed('left') || Input.isPressed('right') || Input.isPressed('confirm')) {
                const opts = item.options;
                const cur = this._getVal(item);
                let idx = opts.indexOf(cur);
                if (idx === -1) idx = 0;
                const dir = Input.isPressed('left') ? -1 : 1;
                idx = (idx + dir + opts.length) % opts.length;
                this._setVal(item, opts[idx]);
                Audio.playMenuNav();
            }
        } else if (item.type === 'action') {
            if (Input.isPressed('confirm')) {
                Audio.playMenuSelect();
                if (item.key === 'start') return 'start';
                if (item.key === 'back') return 'back';
            }
        }

        if (Input.isPressed('back')) return 'back';
        return null;
    },

    getConfig() {
        const cfg = JSON.parse(JSON.stringify(this.config));
        cfg.difficulty = 'custom';
        cfg.scoreMultiplier = 1.0;
        return cfg;
    },

    draw(ctx) {
        const grad = ctx.createLinearGradient(0, 0, 0, SCREEN_H);
        grad.addColorStop(0, '#0a0620');
        grad.addColorStop(1, '#1a0a3e');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

        ctx.fillStyle = '#cc44ff';
        ctx.font = 'bold 32px Share Tech Mono, Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#cc44ff';
        ctx.shadowBlur = 10;
        ctx.fillText('CUSTOM DIFFICULTY', SCREEN_W / 2, 80);
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#888888';
        ctx.font = '12px Share Tech Mono, Consolas, monospace';
        ctx.fillText('Scores will not be recorded to leaderboards', SCREEN_W / 2, 108);

        const startY = 145;
        const lineH = 38;
        for (let i = 0; i < this.items.length; i++) {
            const item = this.items[i];
            const y = startY + i * lineH;
            const selected = i === this.selectedIndex;

            if (item.type === 'action') {
                ctx.textAlign = 'center';
                ctx.fillStyle = selected ? (item.key === 'start' ? '#00ff88' : '#00ffff') : '#667788';
                ctx.font = selected ? 'bold 16px Share Tech Mono, Consolas, monospace' : '14px Share Tech Mono, Consolas, monospace';
                ctx.fillText(selected ? '▸ ' + item.label + ' ◂' : item.label, SCREEN_W / 2, y);
                continue;
            }

            ctx.textAlign = 'right';
            ctx.fillStyle = selected ? '#ffffff' : '#667788';
            ctx.font = selected ? 'bold 14px Share Tech Mono, Consolas, monospace' : '13px Share Tech Mono, Consolas, monospace';
            ctx.fillText(item.label, SCREEN_W / 2 - 20, y);

            ctx.textAlign = 'left';
            const val = item.key === 'startLevel' ? this.startLevel : this._getVal(item);

            if (item.type === 'toggle') {
                ctx.fillStyle = val ? '#00ff88' : '#ff4444';
                ctx.font = selected ? 'bold 14px Share Tech Mono, Consolas, monospace' : '13px Share Tech Mono, Consolas, monospace';
                ctx.fillText(val ? 'ON' : 'OFF', SCREEN_W / 2 + 20, y);
            } else if (item.type === 'cycle') {
                const idx = item.options.indexOf(val);
                let display = item.labels ? item.labels[idx] : String(val) + (item.suffix || '');
                display = display.toUpperCase();
                ctx.fillStyle = selected ? '#00ffff' : '#888888';
                ctx.font = selected ? 'bold 14px Share Tech Mono, Consolas, monospace' : '13px Share Tech Mono, Consolas, monospace';
                ctx.fillText(selected ? '◂ ' + display + ' ▸' : display, SCREEN_W / 2 + 20, y);
            }
        }

        ctx.textAlign = 'center';
        ctx.fillStyle = '#667788';
        ctx.font = '13px Share Tech Mono, Consolas, monospace';
        ctx.fillText('↑↓ SELECT  ←→ ADJUST  ENTER CONFIRM  ESC BACK', SCREEN_W / 2, SCREEN_H - 40);
    }
};


// ============================================================
//  HANGAR / SHOP
// ============================================================
const Hangar = {
    categoryIndex: 0,
    itemIndex: 0,
    categories: ['SHIP SKINS', 'ENGINE TRAILS', 'BULLET STYLES', 'EXPLOSIONS', 'BACK'],
    catalog: {
        skins: [
            { id: 'cyan_viper', name: 'Cyan Viper', cost: 0, color: '#00ffff' },
            { id: 'magenta_phoenix', name: 'Magenta Phoenix', cost: 80, color: '#ff00ff' },
            { id: 'gold_sentinel', name: 'Gold Sentinel', cost: 80, color: '#ffd700' },
            { id: 'chromatic', name: 'Chromatic Shift', cost: 400, color: '#ffffff' },
            { id: 'ghost', name: 'Ghost Frame', cost: 120, color: '#4488aa' }
        ],
        trails: [
            { id: 'thrust', name: 'Simple Thrust', cost: 0, color: '#0088ff' },
            { id: 'flame', name: 'Flame Trail', cost: 60, color: '#ff4400' },
            { id: 'scatter', name: 'Particle Scatter', cost: 120, color: '#00ff88' },
            { id: 'lightning', name: 'Lightning Arc', cost: 80, color: '#ffff00' },
            { id: 'void', name: 'Void Trail', cost: 120, color: '#220044' }
        ],
        bullets: [
            { id: 'neon', name: 'Standard Neon', cost: 0, color: '#00ffff' },
            { id: 'plasma', name: 'Plasma Orbs', cost: 80, color: '#ff8800' },
            { id: 'retro', name: 'Pixel Retro', cost: 60, color: '#00ff00' },
            { id: 'shards', name: 'Geometric Shards', cost: 140, color: '#ff44ff' }
        ],
        explosions: [
            { id: 'burst', name: 'Standard Burst', cost: 0, color: '#ff8800' },
            { id: 'shatter', name: 'Shatter', cost: 100, color: '#4488ff' },
            { id: 'pixel', name: 'Pixel Dissolve', cost: 120, color: '#00ff00' },
            { id: 'supernova', name: 'Supernova', cost: 80, color: '#ffffff' }
        ]
    },
    unlocked: { skins: ['cyan_viper'], trails: ['thrust'], bullets: ['neon'], explosions: ['burst'] },
    equipped: { skin: 'cyan_viper', trail: 'thrust', bullet: 'neon', explosion: 'burst' },
    mode: 'categories',

    // Cosmetic color lookups for gameplay rendering
    getColor(category, id) {
        const items = this.catalog[category];
        if (!items) return null;
        const item = items.find(i => i.id === id);
        return item ? item.color : null;
    },
    get skinColor() {
        if (this.equipped.skin === 'chromatic') return null; // Special: cycles
        return this.getColor('skins', this.equipped.skin) || '#00ffff';
    },
    get trailColor() { return this.getColor('trails', this.equipped.trail) || '#0088ff'; },
    get bulletColor() { return this.getColor('bullets', this.equipped.bullet) || '#00ffff'; },
    get explosionColor() { return this.getColor('explosions', this.equipped.explosion) || '#ff8800'; },

    async load() {
        const u = await Storage.get('hangar_unlocked');
        if (u) this.unlocked = u;
        const e = await Storage.get('hangar_equipped');
        if (e) this.equipped = e;
    },

    async save() {
        await Storage.set('hangar_unlocked', this.unlocked);
        await Storage.set('hangar_equipped', this.equipped);
    },

    _getCatalogKey() { return ['skins', 'trails', 'bullets', 'explosions'][this.categoryIndex]; },
    _getUnlockKey() { return ['skins', 'trails', 'bullets', 'explosions'][this.categoryIndex]; },
    _getEquipKey() { return ['skin', 'trail', 'bullet', 'explosion'][this.categoryIndex]; },

    update() {
        if (this.mode === 'categories') {
            if (Input.isPressed('up')) { this.categoryIndex = (this.categoryIndex - 1 + this.categories.length) % this.categories.length; Audio.playMenuNav(); }
            if (Input.isPressed('down')) { this.categoryIndex = (this.categoryIndex + 1) % this.categories.length; Audio.playMenuNav(); }
            if (Input.isPressed('confirm')) {
                if (this.categoryIndex === 4) return 'back';
                this.mode = 'items'; this.itemIndex = 0; Audio.playMenuSelect();
            }
            if (Input.isPressed('back')) return 'back';
        } else {
            const items = this.catalog[this._getCatalogKey()];
            if (Input.isPressed('up')) { this.itemIndex = (this.itemIndex - 1 + items.length) % items.length; Audio.playMenuNav(); }
            if (Input.isPressed('down')) { this.itemIndex = (this.itemIndex + 1) % items.length; Audio.playMenuNav(); }
            if (Input.isPressed('confirm')) {
                const item = items[this.itemIndex];
                const unlockKey = this._getUnlockKey();
                if (this.unlocked[unlockKey].includes(item.id)) {
                    this.equipped[this._getEquipKey()] = item.id; this.save(); Audio.playMenuSelect();
                } else if (NeonCredits.balance >= item.cost) {
                    NeonCredits.balance -= item.cost; NeonCredits.save();
                    this.unlocked[unlockKey].push(item.id);
                    this.equipped[this._getEquipKey()] = item.id; this.save(); Audio.playPowerUp();
                } else { Audio.playMenuNav(); }
            }
            if (Input.isPressed('back')) { this.mode = 'categories'; Audio.playMenuNav(); }
        }
        return null;
    },

    draw(ctx) {
        const grad = ctx.createLinearGradient(0, 0, 0, SCREEN_H);
        grad.addColorStop(0, '#0a0620'); grad.addColorStop(1, '#1a0a3e');
        ctx.fillStyle = grad; ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#00ffff'; ctx.font = 'bold 36px Share Tech Mono, Consolas, monospace';
        ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 10;
        ctx.fillText('HANGAR', SCREEN_W / 2, 80); ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffaa00'; ctx.font = 'bold 16px Share Tech Mono, Consolas, monospace';
        ctx.fillText('NEON CREDITS: ' + NeonCredits.balance, SCREEN_W / 2, 115);

        if (this.mode === 'categories') {
            const startY = 220;
            for (let i = 0; i < this.categories.length; i++) {
                const selected = i === this.categoryIndex;
                ctx.fillStyle = selected ? '#00ffff' : '#667788';
                ctx.font = selected ? 'bold 22px Share Tech Mono, Consolas, monospace' : '18px Share Tech Mono, Consolas, monospace';
                ctx.fillText(selected ? '▸ ' + this.categories[i] + ' ◂' : this.categories[i], SCREEN_W / 2, startY + i * 55);
            }
        } else {
            const items = this.catalog[this._getCatalogKey()];
            const unlockKey = this._getUnlockKey();
            const equipKey = this._getEquipKey();
            ctx.fillStyle = '#888888'; ctx.font = '14px Share Tech Mono, Consolas, monospace';
            ctx.fillText(this.categories[this.categoryIndex], SCREEN_W / 2, 155);
            const startY = 200;
            for (let i = 0; i < items.length; i++) {
                const item = items[i]; const y = startY + i * 60;
                const selected = i === this.itemIndex;
                const owned = this.unlocked[unlockKey].includes(item.id);
                const isEquipped = this.equipped[equipKey] === item.id;
                if (selected) {
                    ctx.strokeStyle = item.color; ctx.shadowColor = item.color; ctx.shadowBlur = 8;
                    ctx.lineWidth = 2; ctx.strokeRect(SCREEN_W / 2 - 220, y - 18, 440, 45); ctx.shadowBlur = 0;
                }
                ctx.fillStyle = item.color; ctx.shadowColor = item.color; ctx.shadowBlur = 6;
                ctx.beginPath(); ctx.arc(SCREEN_W / 2 - 180, y + 5, 8, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
                ctx.textAlign = 'left'; ctx.fillStyle = selected ? '#ffffff' : '#aaaaaa';
                ctx.font = selected ? 'bold 15px Share Tech Mono, Consolas, monospace' : '14px Share Tech Mono, Consolas, monospace';
                ctx.fillText(item.name, SCREEN_W / 2 - 155, y + 3);
                ctx.textAlign = 'right';
                if (isEquipped) { ctx.fillStyle = '#00ff88'; ctx.font = 'bold 13px Share Tech Mono, Consolas, monospace'; ctx.fillText('EQUIPPED', SCREEN_W / 2 + 200, y + 3); }
                else if (owned) {
                    ctx.fillStyle = '#888888'; ctx.font = '13px Share Tech Mono, Consolas, monospace'; ctx.fillText('OWNED', SCREEN_W / 2 + 200, y - 2);
                    if (selected) { ctx.fillStyle = '#00ffff'; ctx.font = '13px Share Tech Mono, Consolas, monospace'; ctx.fillText('ENTER TO EQUIP', SCREEN_W / 2 + 200, y + 14); }
                } else {
                    ctx.fillStyle = NeonCredits.balance >= item.cost ? '#ffaa00' : '#ff4444';
                    ctx.font = 'bold 13px Share Tech Mono, Consolas, monospace'; ctx.fillText(item.cost + ' NC', SCREEN_W / 2 + 200, y - 2);
                    if (selected) { ctx.fillStyle = NeonCredits.balance >= item.cost ? '#00ffff' : '#ff4444'; ctx.font = '13px Share Tech Mono, Consolas, monospace'; ctx.fillText(NeonCredits.balance >= item.cost ? 'ENTER TO BUY' : 'NOT ENOUGH NC', SCREEN_W / 2 + 200, y + 14); }
                }
            }
        }
        ctx.textAlign = 'center'; ctx.fillStyle = '#667788'; ctx.font = '13px Share Tech Mono, Consolas, monospace';
        ctx.fillText('↑↓ SELECT  ENTER CONFIRM  ESC BACK', SCREEN_W / 2, SCREEN_H - 40);
    }
};


// ============================================================
//  HOW TO PLAY / TUTORIAL
// ============================================================
const Tutorial = {
    pageIndex: 0,
    pages: [
        { title: 'MOVEMENT', lines: ['Use ARROW KEYS or WASD to move your ship.', 'Your ship can move in all 8 directions.', '', 'Hold SHIFT or X for FOCUS MODE — slower', 'movement for precise bullet dodging.', 'Your hitbox is the tiny dot at the center!', '', 'Gamepad: Left Stick to move.', 'Left Trigger to focus.'] },
        { title: 'SHOOTING', lines: ['Press SPACE or Z to fire.', 'Toggle AUTO-FIRE in Settings menu.', '', 'Collect weapon power-ups to upgrade:', '  S = SPREAD SHOT (orange)', '  H = HOMING MISSILES (green)', '  L = LASER BEAM (blue)', '  D = DRONES (purple, passive slot)', '', 'Same pickup = level up (max Lv5).', 'Different pickup = switch weapon to Lv1.'] },
        { title: 'ABILITIES', lines: ['DASH (C or V) — Quick invincible burst', 'in your movement direction. Has a cooldown.', '', 'BOMB (B or N) — Clears all enemy bullets', 'and damages all enemies. Limited stock.', '', 'Gamepad: Right Bumper = Dash', '         Left Bumper = Bomb'] },
        { title: 'SCORING', lines: ['CHAIN COMBO — Kill enemies quickly to', 'build a score multiplier:', '  10 hits=2x  25=3x  50=5x  100+=8x', '', 'GRAZE — Fly close to enemy bullets to', 'fill the SURGE meter.', '', 'NEON SURGE — When meter is full, hold', 'FIRE + FOCUS to activate. Gives 3x score', 'and your bullets cancel enemy bullets!', '', 'Destroying tough enemies converts their', 'bullets into bonus score pickups.'] },
        { title: 'TIPS', lines: ['Dying drops your weapon 1 level and', 'breaks your chain combo.', '', 'Use FOCUS MODE during dense boss patterns.', 'Your tiny hitbox is your best friend!', '', 'DASH can save you from impossible spots.', '', 'Pre-boss section has extra power-up drops.', 'Stock up before the big fight!', '', 'Earn NEON CREDITS from your score to', 'unlock cosmetics in the HANGAR.', '', 'GOOD LUCK, PILOT!'] }
    ],

    update() {
        if (Input.isPressed('right') || Input.isPressed('confirm')) {
            if (this.pageIndex < this.pages.length - 1) { this.pageIndex++; Audio.playMenuNav(); }
            else return 'back';
        }
        if (Input.isPressed('left') && this.pageIndex > 0) { this.pageIndex--; Audio.playMenuNav(); }
        if (Input.isPressed('back')) return 'back';
        return null;
    },

    draw(ctx) {
        const grad = ctx.createLinearGradient(0, 0, 0, SCREEN_H);
        grad.addColorStop(0, '#0a0620'); grad.addColorStop(1, '#1a0a3e');
        ctx.fillStyle = grad; ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
        const page = this.pages[this.pageIndex];
        ctx.textAlign = 'center';
        ctx.fillStyle = '#00ffff'; ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 10;
        ctx.font = 'bold 36px Share Tech Mono, Consolas, monospace'; ctx.fillText('HOW TO PLAY', SCREEN_W / 2, 80); ctx.shadowBlur = 0;
        ctx.fillStyle = '#888888'; ctx.font = '12px Share Tech Mono, Consolas, monospace';
        ctx.fillText('PAGE ' + (this.pageIndex + 1) + ' / ' + this.pages.length, SCREEN_W / 2, 110);
        ctx.fillStyle = '#ff00ff'; ctx.font = 'bold 24px Share Tech Mono, Consolas, monospace';
        ctx.shadowColor = '#ff00ff'; ctx.shadowBlur = 8;
        ctx.fillText(page.title, SCREEN_W / 2, 170); ctx.shadowBlur = 0;
        ctx.textAlign = 'left';
        let y = 220;
        for (const line of page.lines) {
            ctx.fillStyle = line.startsWith('  ') ? '#00ffff' : '#cccccc';
            ctx.font = '15px Share Tech Mono, Consolas, monospace'; ctx.fillText(line, SCREEN_W / 2 - 280, y); y += 24;
        }
        ctx.textAlign = 'center'; ctx.fillStyle = '#667788'; ctx.font = '13px Share Tech Mono, Consolas, monospace';
        const nav = [];
        if (this.pageIndex > 0) nav.push('← PREV');
        if (this.pageIndex < this.pages.length - 1) nav.push('NEXT →'); else nav.push('ENTER TO FINISH');
        nav.push('ESC BACK');
        ctx.fillText(nav.join('    '), SCREEN_W / 2, SCREEN_H - 50);
        for (let i = 0; i < this.pages.length; i++) {
            ctx.fillStyle = i === this.pageIndex ? '#00ffff' : '#333344';
            ctx.beginPath(); ctx.arc(SCREEN_W / 2 + (i - (this.pages.length - 1) / 2) * 20, SCREEN_H - 80, 4, 0, Math.PI * 2); ctx.fill();
        }
    }
};
// ============================================================