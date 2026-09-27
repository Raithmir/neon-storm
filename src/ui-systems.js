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
        UI.background(ctx, { dim: 0.6 });
        UI.title(ctx, 'CUSTOM DIFFICULTY', 90, '#cc44ff');
        UI.label(ctx, 'Scores will not be recorded to leaderboards', SCREEN_W / 2, 140, UI.DIM, 15);
        const cx = SCREEN_W / 2;
        const top = 200, lineH = 44;
        UI.panel(ctx, cx - 420, top - 40, 840, this.items.length * lineH + 30, '#cc44ff');
        for (let i = 0; i < this.items.length; i++) {
            const item = this.items[i];
            const y = top + i * lineH;
            const selected = i === this.selectedIndex;
            if (item.type === 'action') {
                UI.item(ctx, item.label, cx, y + 6, selected, { w: 480, size: 20, color: item.key === 'start' ? '#00ff88' : UI.CYAN });
                continue;
            }
            if (selected) {
                ctx.fillStyle = '#cc44ff';
                ctx.globalAlpha = 0.14;
                ctx.fillRect(cx - 400, y - 24, 800, 36);
                ctx.globalAlpha = 1;
                ctx.fillRect(cx - 400, y - 24, 3, 36);
            }
            Neon.text(ctx, item.label, cx - 30, y, selected ? '#ffffff' : UI.DIM, selected ? 18 : 17, { align: 'right', halo: 0, weight: selected ? 'bold' : '' });
            const val = item.key === 'startLevel' ? this.startLevel : this._getVal(item);
            if (item.type === 'toggle') {
                Neon.text(ctx, val ? 'ON' : 'OFF', cx + 20, y, val ? '#00ff88' : '#ff3355', 17, { align: 'left', halo: selected ? 0.3 : 0 });
            } else if (item.type === 'cycle') {
                const idx = item.options.indexOf(val);
                const display = (item.labels ? item.labels[idx] : String(val) + (item.suffix || '')).toUpperCase();
                Neon.text(ctx, selected ? '◂  ' + display + '  ▸' : display, cx + 20, y, selected ? UI.CYAN : UI.TEXT, 17, { align: 'left', halo: selected ? 0.3 : 0 });
            }
        }
        UI.hint(ctx, '↑↓ SELECT   ←→ ADJUST   ENTER CONFIRM   ESC BACK');
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
            { id: 'void', name: 'Void Trail', cost: 120, color: '#aa33ff' }
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
        UI.background(ctx, { dim: 0.6 });
        UI.title(ctx, 'HANGAR', 100);
        Neon.text(ctx, 'NEON CREDITS  ' + NeonCredits.balance, SCREEN_W / 2, 158, '#ffaa00', 20, { halo: 0.3 });

        const cx = SCREEN_W / 2;
        const lx = cx - 600, lw = 540, top = 210, ph = 640;
        const inItems = this.mode !== 'categories';
        UI.panel(ctx, lx, top, lw, ph, UI.CYAN, { title: inItems ? this.categories[this.categoryIndex] : 'CATEGORIES' });

        let previewCat, previewItem;
        if (!inItems) {
            const keys = ['skins', 'trails', 'bullets', 'explosions'];
            const equipKeys = ['skin', 'trail', 'bullet', 'explosion'];
            for (let i = 0; i < this.categories.length; i++) {
                const y = top + 90 + i * 100;
                const selected = i === this.categoryIndex;
                UI.item(ctx, this.categories[i], lx + lw / 2, y, selected, { w: lw - 60, size: 26 });
                if (i < 4) {
                    const eq = this.catalog[keys[i]].find(it => it.id === this.equipped[equipKeys[i]]);
                    UI.label(ctx, 'EQUIPPED: ' + (eq ? eq.name.toUpperCase() : '-'), lx + lw / 2, y + 30, selected ? UI.TEXT : UI.DIM, 14);
                }
            }
            if (this.categoryIndex < 4) {
                previewCat = keys[this.categoryIndex];
                previewItem = this.catalog[previewCat].find(it => it.id === this.equipped[equipKeys[this.categoryIndex]]);
            }
        } else {
            const items = this.catalog[this._getCatalogKey()];
            const unlockKey = this._getUnlockKey();
            const equipKey = this._getEquipKey();
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const y = top + 80 + i * 108;
                const selected = i === this.itemIndex;
                const owned = this.unlocked[unlockKey].includes(item.id);
                const isEquipped = this.equipped[equipKey] === item.id;
                if (selected) {
                    ctx.fillStyle = item.color;
                    ctx.globalAlpha = 0.12;
                    ctx.fillRect(lx + 20, y - 36, lw - 40, 84);
                    ctx.globalAlpha = 1;
                    ctx.fillRect(lx + 20, y - 36, 3, 84);
                }
                // Swatch
                ctx.save();
                ctx.translate(lx + 64, y);
                ctx.rotate(Math.PI / 4);
                ctx.fillStyle = item.color;
                ctx.globalAlpha = owned ? 0.9 : 0.35;
                ctx.fillRect(-11, -11, 22, 22);
                ctx.strokeStyle = '#ffffff';
                ctx.globalAlpha = selected ? 0.9 : 0.3;
                ctx.lineWidth = 1.5;
                ctx.strokeRect(-11, -11, 22, 22);
                ctx.restore();
                Neon.text(ctx, item.name.toUpperCase(), lx + 100, y + 6, selected ? '#ffffff' : (owned ? UI.TEXT : UI.DIM), selected ? 22 : 20,
                    { align: 'left', halo: selected ? 0.3 : 0, weight: selected ? 'bold' : '' });
                let status, statusColor;
                if (isEquipped) { status = 'EQUIPPED'; statusColor = '#00ff88'; }
                else if (owned) { status = selected ? UI.keys('ENTER TO EQUIP') : 'OWNED'; statusColor = selected ? UI.CYAN : UI.DIM; }
                else {
                    const afford = NeonCredits.balance >= item.cost;
                    status = item.cost + ' NC' + (selected ? (afford ? UI.keys('  •  ENTER TO BUY') : '  •  NOT ENOUGH NC') : '');
                    statusColor = afford ? '#ffaa00' : '#ff3355';
                }
                UI.label(ctx, status, lx + 100, y + 32, statusColor, 15, 'left');
            }
            previewCat = this._getCatalogKey();
            previewItem = items[this.itemIndex];
        }

        // Preview
        const px = cx + 60, pw = 540;
        UI.panel(ctx, px, top, pw, ph, previewItem ? previewItem.color : UI.DIM, { title: 'PREVIEW', fill: 'rgba(3, 1, 12, 0.85)' });
        if (previewItem) {
            ctx.save();
            ctx.beginPath(); ctx.rect(px + 2, top + 28, pw - 4, ph - 30); ctx.clip();
            this._drawPreview(ctx, previewCat, previewItem, px + pw / 2, top + 30 + (ph - 30) / 2, pw, ph - 30);
            ctx.restore();
            UI.label(ctx, previewItem.name.toUpperCase(), px + pw / 2, top + ph - 24, previewItem.color, 18);
        }
        UI.hint(ctx, '↑↓ SELECT   ENTER CONFIRM   ESC BACK');
    },

    // Animated preview of a cosmetic, centred on (cx, cy)
    _drawPreview(ctx, cat, item, cx, cy, w, h) {
        const t = UI.time();
        // Faint scrolling grid for motion
        ctx.strokeStyle = 'rgba(255, 43, 214, 0.12)';
        ctx.lineWidth = 1;
        const off = (t * 60) % 40;
        for (let y = cy - h / 2 + off; y < cy + h / 2; y += 40) { ctx.beginPath(); ctx.moveTo(cx - w / 2, y); ctx.lineTo(cx + w / 2, y); ctx.stroke(); }
        for (let x = cx - w / 2; x < cx + w / 2; x += 40) { ctx.beginPath(); ctx.moveTo(x, cy - h / 2); ctx.lineTo(x, cy + h / 2); ctx.stroke(); }

        const skin = this.equipped.skin === 'chromatic' ? `hsl(${(t * 120) % 360}, 100%, 70%)` : (this.skinColor || '#00ffff');
        const ship = (x, y, r, color, alpha) => {
            ctx.save();
            ctx.globalAlpha = alpha || 1;
            const f = Math.sin(t * 30) * 2;
            Neon.flame(ctx, x - r * 0.22, y + r * 0.62, r * 0.12, r * 0.45 + f, this.trailColor, 0.9);
            Neon.flame(ctx, x + r * 0.22, y + r * 0.62, r * 0.12, r * 0.45 - f, this.trailColor, 0.9);
            UI.ship(ctx, x, y, r, color);
            ctx.restore();
        };

        if (cat === 'skins') {
            const color = item.id === 'chromatic' ? `hsl(${(t * 120) % 360}, 100%, 70%)` : item.color;
            ship(cx, cy + Math.sin(t * 2) * 8, 90, color, item.id === 'ghost' ? 0.6 : 1);
        } else if (cat === 'trails') {
            const sx = cx + Math.sin(t * 1.5) * 90, sy = cy - 110;
            const pts = [];
            for (let i = 0; i < 14; i++) pts.push({ x: cx + Math.sin(t * 1.5 - i * 0.12) * 90, y: sy + 28 + i * 20 });
            Player.drawTrail(ctx, pts, item.id, item.color, 40, t);
            ship(sx, sy, 40, skin);
        } else if (cat === 'bullets') {
            const sy = cy + h / 2 - 90;
            ship(cx, sy, 36, skin);
            const style = item.id;
            for (let i = 0; i < 14; i++) {
                const p = ((t * 1.4 + i / 14) % 1);
                const lane = (i % 3) - 1;
                const x = cx + lane * 34 * (0.2 + p), y = sy - 40 - p * (h - 150);
                this._drawBulletShape(ctx, style, x, y, item.color, 4.5, t + i);
            }
        } else if (cat === 'explosions') {
            const period = 1.6;
            const p = (t % period) / period;
            this._drawExplosionPreview(ctx, item.id, item.color, cx, cy, p, Math.floor(t / period));
        }
    },

    _drawBulletShape(ctx, style, x, y, color, r, t) {
        ctx.save();
        ctx.translate(x, y);
        if (style === 'plasma') {
            Neon.light(ctx, 0, 0, r * 1.2 * (1 + Math.sin(t * 20) * 0.1), color, 1);
        } else if (style === 'retro') {
            ctx.fillStyle = color;
            ctx.fillRect(-r, -r, r * 2, r * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(-r * 0.4, -r * 0.4, r * 0.8, r * 0.8);
        } else if (style === 'shards') {
            ctx.rotate(t * 8);
            Neon.path(ctx, [0, -2.2, 0.7, 0, 0, 2.2, -0.7, 0], r, true);
            ctx.fillStyle = color;
            ctx.fill();
            Neon.stroke(ctx, color, 0.8, false);
        } else {
            ctx.beginPath(); ctx.moveTo(0, -r * 1.2); ctx.lineTo(0, r * 4);
            ctx.lineCap = 'round';
            ctx.strokeStyle = color; ctx.lineWidth = r * 1.6; ctx.globalAlpha = 0.6; ctx.stroke();
            ctx.strokeStyle = '#ffffff'; ctx.lineWidth = r * 0.6; ctx.globalAlpha = 1; ctx.stroke();
        }
        ctx.restore();
    },

    _drawExplosionPreview(ctx, variant, color, cx, cy, p, seed) {
        const rnd = (i) => { const h = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453; return h - Math.floor(h); };
        const ease = 1 - (1 - p) * (1 - p);
        const fade = 1 - p;
        const nova = variant === 'supernova';
        // Flash
        if (p < 0.15 && !Renderer.calm()) {
            ctx.globalAlpha = (1 - p / 0.15) * 0.8;
            Neon.light(ctx, cx, cy, nova ? 60 : 30, '#ffffff', 1);
        }
        // Rings
        ctx.globalAlpha = fade;
        Neon.ring(ctx, cx, cy, ease * (nova ? 230 : 150), color, 1.4, false);
        if (nova) Neon.ring(ctx, cx, cy, ease * 140, '#ffffff', 0.8, false);
        if (variant === 'pixel') {
            for (let i = 0; i < 40; i++) {
                const a = rnd(i) * Math.PI * 2, d = ease * (40 + rnd(i + 50) * 140);
                const sz = 8 * fade + 2;
                ctx.globalAlpha = fade;
                ctx.fillStyle = i % 4 ? color : '#ffffff';
                ctx.fillRect(cx + Math.cos(a) * d - sz / 2, cy + Math.sin(a) * d + p * p * 60 - sz / 2, sz, sz);
            }
        } else if (variant === 'shatter') {
            const pts = Neon.polygon(6, 0);
            for (let i = 0; i < 6; i++) {
                for (let k = 0; k < 3; k++) {
                    const a0 = (i + k / 3) / 6 * Math.PI * 2, a1 = (i + (k + 1) / 3) / 6 * Math.PI * 2;
                    const mid = (a0 + a1) / 2;
                    const d = 50 + ease * (120 + rnd(i * 3 + k) * 80);
                    const spin = p * (rnd(i * 7 + k) - 0.5) * 10;
                    const half = 50 * Math.sin((a1 - a0) / 2);
                    const mx = cx + Math.cos(mid) * d, my = cy + Math.sin(mid) * d;
                    const ang = mid + Math.PI / 2 + spin;
                    ctx.beginPath();
                    ctx.moveTo(mx - Math.cos(ang) * half, my - Math.sin(ang) * half);
                    ctx.lineTo(mx + Math.cos(ang) * half, my + Math.sin(ang) * half);
                    ctx.globalAlpha = fade;
                    Neon.stroke(ctx, color, 1.3, false);
                }
            }
        } else {
            const n = nova ? 44 : 28;
            ctx.lineCap = 'round';
            for (let i = 0; i < n; i++) {
                const a = rnd(i) * Math.PI * 2, d = ease * (60 + rnd(i + 99) * (nova ? 220 : 150));
                const len = 18 * fade + 4;
                ctx.globalAlpha = fade;
                ctx.strokeStyle = i % 3 ? color : '#ffffff';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
                ctx.lineTo(cx + Math.cos(a) * (d + len), cy + Math.sin(a) * (d + len));
                ctx.stroke();
            }
        }
        ctx.globalAlpha = 1;
    }
};


// ============================================================
//  HOW TO PLAY / TUTORIAL
// ============================================================
const Tutorial = {
    pageIndex: 0,
    pages: [
        { title: 'MOVEMENT', lines: ['Use ARROW KEYS or WASD to move your ship.', 'Your ship can move in all 8 directions.', '', 'Hold SHIFT or X for FOCUS MODE — slower', 'movement and a tighter shot pattern.', 'Your hitbox is the tiny dot at the center!', '', 'Gamepad: Left Stick to move.', 'Left Trigger to focus.'] },
        { title: 'SHOOTING', lines: ['Press SPACE or Z to fire.', 'Toggle AUTO-FIRE in Settings menu.', '', 'Collect weapon power-ups to upgrade:', '  S = SPREAD SHOT (orange)', '  H = HOMING MISSILES (green)', '  L = LASER BEAM (blue)', '  D = DRONES (purple, passive slot)', '', 'Same pickup = level up (max Lv5).', 'Different pickup = switch weapon to Lv1.', '', 'Hold FOCUS to tighten your spread.'] },
        { title: 'ABILITIES', lines: ['DASH (C or V) — Quick invincible burst', 'in your movement direction. Has a cooldown.', '', 'BOMB (B or N) — Clears all enemy bullets', 'and damages all enemies. Limited stock.', '', 'Gamepad: Right Bumper = Dash', '         Left Bumper = Bomb'] },
        { title: 'SCORING', lines: ['CHAIN COMBO — Kill enemies quickly to', 'build a score multiplier:', '  10 hits=2x  20=3x  35=5x  60+=8x', '', 'GRAZE — Fly close to enemy bullets to', 'fill the SURGE meter.', '', 'NEON SURGE — When meter is full, press', 'SURGE (F / M) to activate: 2x fire rate,', '3x score, and your shots cancel bullets!', '', 'Destroying tough enemies converts their', 'bullets into bonus score pickups.'] },
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
        UI.background(ctx, { dim: 0.6 });
        UI.title(ctx, 'HOW TO PLAY', 100);
        const page = this.pages[this.pageIndex];
        const cx = SCREEN_W / 2;
        UI.panel(ctx, cx - 420, 170, 840, 690, UI.MAGENTA, { title: 'PAGE ' + (this.pageIndex + 1) + ' / ' + this.pages.length });
        Neon.text(ctx, page.title, cx, 250, UI.MAGENTA, 38, { core: 0.4 });
        let y = 320;
        for (const line of page.lines) {
            const indent = line.startsWith('  ');
            Neon.text(ctx, line.trim(), cx - 340 + (indent ? 40 : 0), y, indent ? UI.CYAN : UI.TEXT, 20, { align: 'left', halo: 0, weight: indent ? 'bold' : '' });
            y += 36;
        }
        for (let i = 0; i < this.pages.length; i++) {
            UI.pip(ctx, cx + (i - (this.pages.length - 1) / 2) * 30, SCREEN_H - 110, 6, UI.CYAN, i === this.pageIndex);
        }
        const nav = [];
        if (this.pageIndex > 0) nav.push('← PREV');
        nav.push(this.pageIndex < this.pages.length - 1 ? 'NEXT →' : 'ENTER TO FINISH');
        nav.push('ESC BACK');
        UI.hint(ctx, nav.join('     '));
    }
};
// ============================================================