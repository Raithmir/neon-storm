// ============================================================
//  UI KIT — neon building blocks for menus, briefings and the HUD
//
//  Everything draws on the 1920×1080 overlay canvas in logical
//  coordinates. Screens are composed from:
//    UI.background()  animated neon horizon (menus)
//    UI.dim()         darkens the screen behind an overlay (pause, results)
//    UI.title()       big glowing heading
//    UI.panel()       translucent card with a neon frame and corner brackets
//    UI.item()        menu entry; the selected one gets a highlight bar
//    UI.hint()        footer key hints
// ============================================================
const UI = {
    CYAN: '#00ffff',
    MAGENTA: '#ff2bd6',
    DIM: '#6f7f99',
    TEXT: '#c8d2e6',

    time() {
        return performance.now() / 1000;
    },

    // --- Backgrounds ---

    _bgCache: null,
    _bakeBackground() {
        const k = Renderer.uiScale || 1;
        const c = document.createElement('canvas');
        c.width = Math.round(SCREEN_W * k); c.height = Math.round(SCREEN_H * k);
        c._scale = k;
        const g = c.getContext('2d');
        g.scale(k, k);
        const horizon = SCREEN_H * 0.62;
        const sky = g.createLinearGradient(0, 0, 0, horizon);
        sky.addColorStop(0, '#03010d');
        sky.addColorStop(0.6, '#10042e');
        sky.addColorStop(1, '#3a0a5c');
        g.fillStyle = sky;
        g.fillRect(0, 0, SCREEN_W, horizon);
        const floor = g.createLinearGradient(0, horizon, 0, SCREEN_H);
        floor.addColorStop(0, '#2a0845');
        floor.addColorStop(0.25, '#0b0220');
        floor.addColorStop(1, '#030008');
        g.fillStyle = floor;
        g.fillRect(0, horizon, SCREEN_W, SCREEN_H - horizon);
        // Stars (seeded so they stay put)
        let seed = 7;
        const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
        for (let i = 0; i < 260; i++) {
            const y = rnd() * horizon * 0.9;
            g.fillStyle = `rgba(255,255,255,${(0.2 + rnd() * 0.6) * (1 - y / horizon)})`;
            g.fillRect(rnd() * SCREEN_W, y, rnd() < 0.15 ? 2 : 1, rnd() < 0.15 ? 2 : 1);
        }
        // Striped sun with halo
        const cx = SCREEN_W / 2, sy = horizon - 30, R = 150;
        const halo = g.createRadialGradient(cx, sy, R * 0.5, cx, sy, R * 3);
        halo.addColorStop(0, 'rgba(255,40,170,0.35)');
        halo.addColorStop(1, 'rgba(255,40,170,0)');
        g.fillStyle = halo;
        g.fillRect(cx - R * 3, sy - R * 3, R * 6, R * 3 + 30);
        g.save();
        g.beginPath(); g.arc(cx, sy, R, Math.PI, 0); g.lineTo(cx + R, horizon); g.lineTo(cx - R, horizon); g.closePath(); g.clip();
        const sun = g.createLinearGradient(0, sy - R, 0, horizon);
        sun.addColorStop(0, '#ffd23a'); sun.addColorStop(0.55, '#ff3d8b'); sun.addColorStop(1, '#b400ff');
        g.fillStyle = sun;
        g.fillRect(cx - R, sy - R, R * 2, R + 30);
        let yy = sy - R * 0.15, h = 3;
        g.fillStyle = '#2a0845';
        while (yy < horizon) { g.fillRect(cx - R, yy, R * 2, h); yy += h * 2.4; h += 1.3; }
        g.restore();
        // Wireframe mountains either side of the sun
        g.strokeStyle = 'rgba(255,43,214,0.9)';
        g.fillStyle = '#07011a';
        g.lineWidth = 2;
        for (const side of [-1, 1]) {
            g.beginPath();
            g.moveTo(cx + side * 220, horizon);
            let x = cx + side * 220;
            let k = 0;
            while (Math.abs(x - cx) < SCREEN_W / 2 + 40) {
                x += side * (40 + rnd() * 70);
                const peak = 30 + rnd() * 140 * Math.min(1, Math.abs(x - cx) / 500);
                g.lineTo(x, horizon - (k++ % 2 ? peak : peak * 0.35));
            }
            g.lineTo(x, horizon);
            g.closePath();
            g.fill();
            g.stroke();
        }
        return c;
    },

    // Animated neon horizon: cached sky, sun and mountains, plus a perspective
    // grid scrolling toward the viewer. opts.dim darkens it for busy screens.
    background(ctx, opts) {
        const o = opts || {};
        if (!this._bgCache || this._bgCache._scale !== Renderer.uiScale) this._bgCache = this._bakeBackground();
        ctx.drawImage(this._bgCache, 0, 0, SCREEN_W, SCREEN_H);
        const horizon = SCREEN_H * 0.62;
        const cx = SCREEN_W / 2;
        const t = this.time();
        ctx.save();
        ctx.lineWidth = 1.5;
        // Receding horizontal lines
        const scroll = (t * 0.6) % 1;
        for (let i = 0; i < 18; i++) {
            const z = (i + 1 - scroll);
            const y = horizon + (SCREEN_H - horizon) * (1 / z) * 0.9 - 0;
            if (y <= horizon + 2 || y > SCREEN_H) continue;
            const k = (y - horizon) / (SCREEN_H - horizon);
            ctx.strokeStyle = `rgba(255,43,214,${0.15 + k * 0.6})`;
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(SCREEN_W, y); ctx.stroke();
        }
        // Converging lines
        for (let i = -24; i <= 24; i++) {
            ctx.strokeStyle = i % 4 === 0 ? 'rgba(0,229,255,0.45)' : 'rgba(255,43,214,0.35)';
            ctx.beginPath();
            ctx.moveTo(cx + i * 30, horizon);
            ctx.lineTo(cx + i * 260, SCREEN_H);
            ctx.stroke();
        }
        // Horizon glow line
        ctx.strokeStyle = 'rgba(255,120,220,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, horizon); ctx.lineTo(SCREEN_W, horizon); ctx.stroke();
        ctx.restore();
        if (o.dim) this.dim(ctx, o.dim);
    },

    dim(ctx, alpha) {
        ctx.fillStyle = `rgba(4, 1, 14, ${alpha})`;
        ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    },

    // --- Text ---

    title(ctx, text, y, color, size) {
        const c = color || this.CYAN;
        Neon.text(ctx, text, SCREEN_W / 2, y, c, size || 52, { core: 0.45, halo: 0.5 });
        // Underline flourish
        const w = Math.min(520, text.length * (size || 52) * 0.4);
        ctx.fillStyle = c;
        ctx.globalAlpha = 0.6;
        ctx.fillRect(SCREEN_W / 2 - w / 2, y + 16, w, 2);
        ctx.globalAlpha = 1;
    },

    hint(ctx, text, y) {
        Neon.text(ctx, this.keys(text), SCREEN_W / 2, y || SCREEN_H - 40, this.DIM, 15, { weight: '', halo: 0 });
    },

    // Prompt text for the device in use: with a gamepad, key names become its
    // buttons (confirm is always A, back always B). Arrows read as the D-pad.
    keys(text) {
        if (Input.lastDevice !== 'pad') return text;
        return text
            .replace('ARROW KEYS / D-PAD', 'D-PAD')
            .replace(/\bENTER\b/g, '[A]')
            .replace(/\bESC\b/g, '[B]');
    },

    label(ctx, text, x, y, color, size, align) {
        Neon.text(ctx, text, x, y, color || this.DIM, size || 14, { weight: '', halo: 0, align: align || 'center' });
    },

    // --- Containers ---

    panel(ctx, x, y, w, h, color, opts) {
        const o = opts || {};
        const c = color || this.CYAN;
        ctx.save();
        ctx.fillStyle = o.fill || 'rgba(8, 3, 24, 0.72)';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = c;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        // Corner brackets
        ctx.globalAlpha = 0.95;
        ctx.lineWidth = 2;
        const L = Math.min(18, w / 4, h / 4);
        ctx.beginPath();
        ctx.moveTo(x, y + L); ctx.lineTo(x, y); ctx.lineTo(x + L, y);
        ctx.moveTo(x + w - L, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + L);
        ctx.moveTo(x + w, y + h - L); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - L, y + h);
        ctx.moveTo(x + L, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - L);
        ctx.stroke();
        ctx.restore();
        if (o.title) {
            ctx.fillStyle = c;
            ctx.globalAlpha = 0.18;
            ctx.fillRect(x, y, w, 26);
            ctx.globalAlpha = 1;
            Neon.text(ctx, o.title, x + 14, y + 18, c, 13, { align: 'left', halo: 0.2 });
        }
    },

    // Menu entry centred on cx. Selected entries get a glowing bar and chevrons.
    // opts: { w, color, desc, disabled, size, right (text on the right) }
    item(ctx, label, cx, y, selected, opts) {
        const o = opts || {};
        const w = o.w || 420;
        const color = o.color || this.CYAN;
        const size = o.size || 24;
        if (selected) {
            const pulse = Renderer.calm() ? 0.25 : 0.2 + Math.sin(this.time() * 4) * 0.06;
            const g = ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
            g.addColorStop(0, 'rgba(0,0,0,0)');
            g.addColorStop(0.5, color);
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.globalAlpha = pulse;
            ctx.fillRect(cx - w / 2, y - size * 0.95, w, size * 1.35);
            ctx.globalAlpha = 0.9;
            ctx.fillRect(cx - w / 2, y + size * 0.4, w, 1.5);
            ctx.globalAlpha = 1;
            const ax = w / 2 - 16;
            for (const s of [-1, 1]) {
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.moveTo(cx + s * ax, y - size * 0.3);
                ctx.lineTo(cx + s * (ax - 10), y - size * 0.3 - 8);
                ctx.lineTo(cx + s * (ax - 10), y - size * 0.3 + 8);
                ctx.fill();
            }
        }
        const textColor = o.disabled ? '#3a4458' : (selected ? '#ffffff' : color);
        ctx.globalAlpha = selected || o.disabled ? 1 : 0.65;
        Neon.text(ctx, label, cx, y, selected ? color : textColor, selected ? size + 2 : size, {
            halo: selected ? 0.45 : 0, core: selected ? 0.55 : 0, weight: selected ? 'bold' : '',
        });
        ctx.globalAlpha = 1;
        if (o.desc) {
            Neon.text(ctx, o.desc, cx, y + size * 0.95, selected ? this.TEXT : this.DIM, 14, { weight: '', halo: 0 });
        }
    },

    // Horizontal row of tabs; returns nothing. colors[] optional per tab.
    tabs(ctx, labels, selectedIndex, cx, y, colors) {
        const tw = 170;
        const x0 = cx - (labels.length * tw) / 2;
        for (let i = 0; i < labels.length; i++) {
            const x = x0 + i * tw + tw / 2;
            const sel = i === selectedIndex;
            const c = (colors && colors[i]) || this.CYAN;
            if (sel) {
                ctx.fillStyle = c;
                ctx.globalAlpha = 0.16;
                ctx.fillRect(x - tw / 2 + 6, y - 22, tw - 12, 32);
                ctx.globalAlpha = 1;
                ctx.fillRect(x - tw / 2 + 6, y + 10, tw - 12, 2);
            }
            Neon.text(ctx, labels[i], x, y, sel ? c : this.DIM, sel ? 17 : 15, { halo: sel ? 0.35 : 0, weight: sel ? 'bold' : '' });
        }
    },

    // --- Icons ---

    // The player's ship in neon at any size (drawn live, so it stays crisp)
    ship(ctx, x, y, r, color) {
        ctx.save();
        ctx.translate(x, y);
        Player._bakeShipNeon(ctx, color || Hangar.skinColor || this.CYAN, r, false);
        ctx.restore();
    },

    // Diamond pip, filled when on
    pip(ctx, x, y, s, color, on) {
        ctx.beginPath();
        ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); ctx.closePath();
        if (on) { ctx.fillStyle = color; ctx.fill(); }
        ctx.strokeStyle = color;
        ctx.globalAlpha = on ? 1 : 0.4;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.globalAlpha = 1;
    },
};
