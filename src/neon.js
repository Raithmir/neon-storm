// ============================================================
//  NEON — shared line-art helpers for the neon vector style
//
//  Style rules (keep new art consistent with these):
//    1. Shapes are outlines first. Every outline is drawn in three
//       passes: a wide faint halo, a solid coloured line, and a thin
//       white-hot core. Fills are dark and translucent, never flat.
//    2. One hue per family: player = cyan (skin), each enemy family
//       keeps its `color` from Enemies.types, bosses use their phase
//       colour. White is reserved for cores, hit flashes and the
//       player's hitbox.
//    3. Detail comes from thin inner panel lines and small bright
//       "lights" (eyes, cores, engines), not from extra fills.
//    4. Things move: spin rotors, pulse cores, flicker engines, and
//       flash + squash on hit.
//
//  Sprite atlas: the static parts of each entity (hulls, panel lines,
//  sockets) are drawn once into a shared atlas canvas by Neon.sprite()
//  and then stamped with drawImage every frame. Only the animated bits
//  (rotors, lights, flames, eyes) are drawn live. Sprite keys name the
//  entity, its colour and its flash state, e.g. 'scout|#ff8c00|f'; a
//  hand-drawn image for a key could later replace the baked one.
// ============================================================
const Neon = {
    // --- Sprite atlas ---
    BAKE: true,              // false: draw everything live (for comparing output/cost)
    BAKE_SCALE: 2,           // atlas pixels per play-area pixel (keeps rotated sprites crisp)
    ATLAS_SIZE: 2048,
    ATLAS_MAX_PAGES: 4,      // past this the cache is flushed and rebuilt on demand
    _pages: [],
    _sprites: new Map(),

    // Draw a cached sprite centred on the current origin. `half` is the
    // sprite's half-extent in play pixels (art plus halo must fit inside).
    // drawFn(ctx, a, b, c, d) draws the art around (0, 0) in play-pixel
    // units, the same way it would draw live; it runs only when the key
    // is new. A null key draws live every frame (for art whose colour
    // changes continuously, like the chromatic skin).
    sprite(ctx, key, half, drawFn, a, b, c, d) {
        if (!this.BAKE || key === null) { drawFn(ctx, a, b, c, d); return; }
        let spr = this._sprites.get(key);
        if (!spr) spr = this._bake(key, half, drawFn, a, b, c, d);
        ctx.drawImage(spr.canvas, spr.x, spr.y, spr.size, spr.size, -half, -half, half * 2, half * 2);
    },

    _bake(key, half, drawFn, a, b, cArg, d) {
        const size = Math.ceil(half * 2 * this.BAKE_SCALE) + 2;
        let page = this._pages[this._pages.length - 1];
        if (!page || !this._fits(page, size)) {
            if (this._pages.length >= this.ATLAS_MAX_PAGES) this.flush();
            page = this._newPage();
        }
        if (page.x + size > this.ATLAS_SIZE) { page.x = 0; page.y += page.rowH; page.rowH = 0; }
        const spr = { canvas: page.canvas, x: page.x + 1, y: page.y + 1, size: size - 2 };
        page.x += size;
        page.rowH = Math.max(page.rowH, size);

        const c = page.ctx;
        c.save();
        c.beginPath();
        c.rect(spr.x, spr.y, spr.size, spr.size);
        c.clip();
        c.translate(spr.x + spr.size / 2, spr.y + spr.size / 2);
        c.scale(this.BAKE_SCALE, this.BAKE_SCALE);
        drawFn(c, a, b, cArg, d);
        c.restore();
        this._sprites.set(key, spr);
        return spr;
    },

    _fits(page, size) {
        if (page.x + size <= this.ATLAS_SIZE) return page.y + Math.max(page.rowH, size) <= this.ATLAS_SIZE;
        return page.y + page.rowH + size <= this.ATLAS_SIZE;
    },

    _newPage() {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = this.ATLAS_SIZE;
        const page = { canvas, ctx: canvas.getContext('2d'), x: 0, y: 0, rowH: 0 };
        this._pages.push(page);
        return page;
    },

    flush() {
        this._pages.length = 0;
        this._sprites.clear();
    },

    // Wall-clock seconds for idle animation (spins, pulses) that
    // doesn't need to be tied to an entity's own timers
    time() {
        return performance.now() / 1000;
    },

    // Trace a path from a flat [x0, y0, x1, y1, ...] list, scaled by s
    path(ctx, pts, s, closed) {
        ctx.beginPath();
        ctx.moveTo(pts[0] * s, pts[1] * s);
        for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i] * s, pts[i + 1] * s);
        if (closed !== false) ctx.closePath();
    },

    // Build a left/right symmetric outline from the right half,
    // listed top to bottom. Points on x = 0 are not duplicated.
    mirror(half) {
        const out = half.slice();
        for (let i = half.length - 2; i >= 0; i -= 2) {
            if (half[i] === 0) continue;
            out.push(-half[i], half[i + 1]);
        }
        return out;
    },

    // Three-pass glowing stroke of the current path
    stroke(ctx, color, width, flash) {
        const a = ctx.globalAlpha;
        const c = flash ? '#ffffff' : color;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.strokeStyle = c;
        ctx.globalAlpha = a * 0.22;
        ctx.lineWidth = width * 3.2;
        ctx.stroke();
        ctx.globalAlpha = a;
        ctx.lineWidth = width * 1.4;
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.globalAlpha = a * (flash ? 1 : 0.75);
        ctx.lineWidth = Math.max(0.6, width * 0.45);
        ctx.stroke();
        ctx.globalAlpha = a;
    },

    // Filled + outlined polygon: dark translucent body, glowing edge
    shape(ctx, pts, s, color, width, flash, fillAlpha) {
        this.path(ctx, pts, s, true);
        const a = ctx.globalAlpha;
        ctx.fillStyle = flash ? '#ffffff' : color;
        ctx.globalAlpha = a * (flash ? 0.6 : (fillAlpha != null ? fillAlpha : 0.16));
        ctx.fill();
        ctx.globalAlpha = a;
        this.stroke(ctx, color, width, flash);
    },

    // Thin single-pass detail line (panel lines, struts)
    detail(ctx, pts, s, color, alpha, width) {
        const a = ctx.globalAlpha;
        this.path(ctx, pts, s, false);
        ctx.strokeStyle = color;
        ctx.globalAlpha = a * (alpha != null ? alpha : 0.55);
        ctx.lineWidth = width || 1;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.globalAlpha = a;
    },

    ring(ctx, x, y, radius, color, width, flash) {
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        this.stroke(ctx, color, width, flash);
    },

    // Bright point light: coloured halo with a white centre
    light(ctx, x, y, radius, color, intensity) {
        const k = intensity != null ? intensity : 1;
        if (k <= 0) return;
        const a = ctx.globalAlpha;
        if (this.BAKE && color.charCodeAt(0) === 35) {
            // Stamped from the atlas; radius is rounded to 0.5 px so the
            // few sizes in use each get one sprite. Only fixed '#hex'
            // colours are baked (the chromatic skin's hsl() cycles).
            const rr = Math.max(0.5, Math.round(radius * 2) / 2);
            const key = 'light|' + color + '|' + rr;
            let spr = this._sprites.get(key);
            if (!spr) spr = this._bake(key, rr * 2 + 1, this._drawLight, rr, color);
            const h = rr * 2 + 1;
            ctx.globalAlpha = a * k;
            ctx.drawImage(spr.canvas, spr.x, spr.y, spr.size, spr.size, x - h, y - h, h * 2, h * 2);
            ctx.globalAlpha = a;
            return;
        }
        ctx.globalAlpha = a * k;
        this._drawLight(ctx, radius, color, x, y);
        ctx.globalAlpha = a;
    },

    _drawLight(ctx, radius, color, x, y) {
        const a = ctx.globalAlpha;
        x = x || 0; y = y || 0;
        ctx.fillStyle = color;
        ctx.globalAlpha = a * 0.35;
        ctx.beginPath(); ctx.arc(x, y, radius * 2, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = a;
        ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(x, y, radius * 0.45, 0, Math.PI * 2); ctx.fill();
    },

    // Engine plume pointing down (+y) from (x, y): coloured flame with a
    // white core. Pass a negative len to point it up.
    flame(ctx, x, y, w, len, color, alpha) {
        const a = ctx.globalAlpha;
        const k = alpha != null ? alpha : 1;
        ctx.fillStyle = color;
        ctx.globalAlpha = a * 0.55 * k;
        ctx.beginPath();
        ctx.moveTo(x - w, y); ctx.lineTo(x, y + len * 1.5); ctx.lineTo(x + w, y);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = a * 0.9 * k;
        ctx.beginPath();
        ctx.moveTo(x - w * 0.4, y); ctx.lineTo(x, y + len); ctx.lineTo(x + w * 0.4, y);
        ctx.fill();
        ctx.globalAlpha = a;
    },

    // Regular polygon as a flat point list (for Neon.shape / Neon.path)
    polygon(sides, rotation, sx, sy) {
        const pts = [];
        for (let i = 0; i < sides; i++) {
            const a = rotation + (Math.PI * 2 / sides) * i;
            pts.push(Math.cos(a) * (sx || 1), Math.sin(a) * (sy || sx || 1));
        }
        return pts;
    },

    // Neon text: a soft coloured halo, the coloured letters, then a faint
    // white-hot core. align/baseline default to centre/alphabetic.
    // opts: { weight: 'bold' | '', align, baseline, core (0..1), halo (0..1) }
    FONT: 'Share Tech Mono, Consolas, monospace',
    text(ctx, str, x, y, color, size, opts) {
        const o = opts || {};
        const a = ctx.globalAlpha;
        ctx.font = (o.weight === undefined ? 'bold ' : o.weight + ' ') + size + 'px ' + this.FONT;
        ctx.textAlign = o.align || 'center';
        ctx.textBaseline = o.baseline || 'alphabetic';
        ctx.lineJoin = 'round';
        const halo = o.halo !== undefined ? o.halo : 0.35;
        if (halo > 0) {
            ctx.strokeStyle = color;
            ctx.globalAlpha = a * halo;
            ctx.lineWidth = Math.max(2, size * 0.18);
            ctx.strokeText(str, x, y);
        }
        ctx.globalAlpha = a;
        ctx.fillStyle = color;
        ctx.fillText(str, x, y);
        const core = o.core !== undefined ? o.core : (size >= 20 ? 0.35 : 0);
        if (core > 0) {
            ctx.globalAlpha = a * core;
            ctx.fillStyle = '#ffffff';
            ctx.fillText(str, x, y);
        }
        ctx.globalAlpha = a;
        ctx.textBaseline = 'alphabetic';
    },

    // Neon gauge: dark track, coloured fill with a bright leading edge and
    // top highlight, thin outline; optional tick marks every 1/segments.
    bar(ctx, x, y, w, h, frac, color, segments) {
        const f = Math.max(0, Math.min(1, frac));
        const a = ctx.globalAlpha;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = color;
        ctx.globalAlpha = a * 0.85;
        ctx.fillRect(x, y, w * f, h);
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = a * 0.45;
        ctx.fillRect(x, y, w * f, Math.max(1, h * 0.25));
        if (f > 0 && f < 1) {
            ctx.globalAlpha = a;
            ctx.fillRect(x + w * f - 1, y, 2, h);
        }
        if (segments > 1) {
            ctx.fillStyle = '#000000';
            ctx.globalAlpha = a * 0.6;
            for (let i = 1; i < segments; i++) ctx.fillRect(x + (w * i) / segments - 0.5, y, 1, h);
        }
        ctx.strokeStyle = color;
        ctx.globalAlpha = a * 0.6;
        ctx.lineWidth = 1;
        ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
        ctx.globalAlpha = a;
    },

    // Boss / mid-boss health bar across the top of the play area.
    // pips: [remaining, total] phase markers (optional); timeLeft in seconds.
    topBar(ctx, label, frac, color, timeLeft, pips) {
        const w = 360, h = 7, x = (PLAY_W - w) / 2, y = 16;
        this.bar(ctx, x, y, w, h, frac, color, 10);
        this.text(ctx, label, PLAY_W / 2, y + h + 15, color, 13, { core: 0.5 });
        if (timeLeft !== undefined) {
            this.text(ctx, Math.ceil(timeLeft).toString(), x + w + 30, y + h, timeLeft <= 10 ? '#ff3355' : '#aabbcc', 14, { align: 'right' });
        }
        if (pips) {
            for (let i = 0; i < pips[1]; i++) {
                const px = x - 12 - i * 12, py = y + h / 2;
                ctx.beginPath();
                ctx.moveTo(px, py - 4); ctx.lineTo(px + 4, py); ctx.lineTo(px, py + 4); ctx.lineTo(px - 4, py); ctx.closePath();
                if (i < pips[0]) { ctx.fillStyle = color; ctx.fill(); }
                ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke();
            }
        }
    },

    // Hit reaction: a brief squash-and-stretch around the current origin
    squash(ctx, flash, amount) {
        if (!flash) return;
        const k = amount || 0.12;
        ctx.scale(1 + k, 1 - k);
    }
};
