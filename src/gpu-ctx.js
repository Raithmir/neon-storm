// ============================================================
//  GPU CTX — a Canvas 2D-shaped drawing context backed by PixiJS
//
//  Entity art is written once against the Canvas 2D API (Enemies._neon,
//  Boss._neon, Player._drawShipNeon, ...). In Pixi mode the play area hands
//  that code a GpuCtx instead of the offscreen canvas: every call is turned
//  into pooled Pixi objects in call order, so nothing has to be drawn on the
//  CPU and re-uploaded each frame (Renderer Phase 7).
//
//    drawImage            → PIXI.Sprite on a texture of the source canvas
//                           (Neon atlas pages, baked text); a canvas flagged
//                           __gpuDirty is re-uploaded once, at end()
//    paths, fill, stroke  → PIXI.Graphics; paths are flattened to polylines
//                           in play coordinates, so any transform works
//    fillText/strokeText  → white text baked once per string/font, tinted
//    clip()               → a container masked by the clip path
//    'lighter'            → additive blend
//    beginLayer(filters)  → (not Canvas 2D) the drawing up to endLayer() goes
//      / endLayer()          into a container with those Pixi filters; use
//                            Neon.filtered(), which plain Canvas 2D skips
//
//  Only the subset of Canvas 2D that the play-area draw code uses is here.
//  Gradients, patterns, shadows, filters and getImageData are not supported.
// ============================================================
class GpuCtx {
    constructor(root) {
        this.root = root;
        this._sprites = [];  this._nSprites = 0;
        this._graphics = []; this._nGraphics = 0;
        this._clips = [];    this._nClips = 0;
        this._layers = [];   this._nLayers = 0;
        this._layerStack = [];
        this._parent = root;
        this._g = null;           // Graphics currently being filled (consecutive vector ops)
        this._gBlend = 'normal';
        this._release = [];
        this._resetState();
    }

    _resetState() {
        this._m = [1, 0, 0, 1, 0, 0];
        this._stack = [];
        this._path = [];          // subpaths: { pts: [x0, y0, ...] in play coords, closed }
        this._sub = null;
        this._dash = null;
        this.globalAlpha = 1;
        this.globalCompositeOperation = 'source-over';
        this.fillStyle = '#000000';
        this.strokeStyle = '#000000';
        this.lineWidth = 1;
        this.lineCap = 'butt';
        this.lineJoin = 'miter';
        this.miterLimit = 10;
        this.font = '10px sans-serif';
        this.textAlign = 'start';
        this.textBaseline = 'alphabetic';
    }

    // --- Frame lifecycle (Renderer.beginFrame / endFrame) ---

    begin() {
        for (const src of this._release) src.destroy();
        this._release.length = 0;
        this.root.removeChildren();
        for (let i = 0; i < this._nClips; i++) this._clips[i].box.removeChildren();
        for (let i = 0; i < this._nLayers; i++) this._layers[i].removeChildren();
        this._nSprites = this._nGraphics = this._nClips = this._nLayers = 0;
        this._layerStack.length = 0;
        this._parent = this.root;
        this._g = null;
        this._resetState();
    }

    end() {
        this._g = null;
        // Canvases baked into this frame upload once, however many sprites were added
        for (const src of GpuCtx._dirty) src.update();
        GpuCtx._dirty.clear();
    }

    // Free a canvas's GPU texture once this frame has been rendered
    static release(canvas) {
        const gpu = canvas.__gpu;
        if (!gpu) return;
        canvas.__gpu = null;
        if (Renderer.gpu) Renderer.gpu._release.push(gpu.source);
        else gpu.source.destroy();
    }

    // --- State and transform ---

    save() {
        this._stack.push({
            m: this._m.slice(), parent: this._parent, dash: this._dash,
            globalAlpha: this.globalAlpha, globalCompositeOperation: this.globalCompositeOperation,
            fillStyle: this.fillStyle, strokeStyle: this.strokeStyle,
            lineWidth: this.lineWidth, lineCap: this.lineCap, lineJoin: this.lineJoin, miterLimit: this.miterLimit,
            font: this.font, textAlign: this.textAlign, textBaseline: this.textBaseline,
        });
    }

    restore() {
        const s = this._stack.pop();
        if (!s) return;
        this._m = s.m;
        if (s.parent !== this._parent) { this._parent = s.parent; this._g = null; }
        this._dash = s.dash;
        this.globalAlpha = s.globalAlpha; this.globalCompositeOperation = s.globalCompositeOperation;
        this.fillStyle = s.fillStyle; this.strokeStyle = s.strokeStyle;
        this.lineWidth = s.lineWidth; this.lineCap = s.lineCap; this.lineJoin = s.lineJoin; this.miterLimit = s.miterLimit;
        this.font = s.font; this.textAlign = s.textAlign; this.textBaseline = s.textBaseline;
    }

    translate(x, y) {
        const m = this._m;
        m[4] += m[0] * x + m[2] * y;
        m[5] += m[1] * x + m[3] * y;
    }

    rotate(t) {
        const m = this._m, c = Math.cos(t), s = Math.sin(t);
        const a = m[0], b = m[1];
        m[0] = a * c + m[2] * s;  m[1] = b * c + m[3] * s;
        m[2] = m[2] * c - a * s;  m[3] = m[3] * c - b * s;
    }

    scale(x, y) {
        const m = this._m;
        m[0] *= x; m[1] *= x; m[2] *= y; m[3] *= y;
    }

    transform(a, b, c, d, e, f) {
        const m = this._m;
        this._m = [
            m[0] * a + m[2] * b, m[1] * a + m[3] * b,
            m[0] * c + m[2] * d, m[1] * c + m[3] * d,
            m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5],
        ];
    }

    setTransform(a, b, c, d, e, f) { this._m = [a, b, c, d, e, f]; }
    resetTransform() { this._m = [1, 0, 0, 1, 0, 0]; }

    setLineDash(segs) { this._dash = segs && segs.length ? segs.slice() : null; }
    getLineDash() { return this._dash ? this._dash.slice() : []; }

    // --- Paths (stored in play coordinates) ---

    beginPath() { this._path = []; this._sub = null; }

    _pt(x, y) {
        const m = this._m;
        if (!this._sub) { this._sub = { pts: [], closed: false }; this._path.push(this._sub); }
        this._sub.pts.push(m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]);
    }

    moveTo(x, y) {
        this._sub = { pts: [], closed: false };
        this._path.push(this._sub);
        this._pt(x, y);
    }

    lineTo(x, y) { this._pt(x, y); }

    closePath() {
        const sub = this._sub;
        if (!sub || sub.pts.length < 2) return;
        sub.closed = true;
        // Canvas continues from the subpath's start point
        this._sub = { pts: [sub.pts[0], sub.pts[1]], closed: false };
        this._path.push(this._sub);
    }

    rect(x, y, w, h) {
        this.moveTo(x, y); this._pt(x + w, y); this._pt(x + w, y + h); this._pt(x, y + h);
        this.closePath();
    }

    arc(x, y, r, a0, a1, ccw) { this.ellipse(x, y, r, r, 0, a0, a1, ccw); }

    ellipse(x, y, rx, ry, rot, a0, a1, ccw) {
        const TAU = Math.PI * 2;
        let sweep = a1 - a0;
        if (!ccw) {
            if (sweep >= TAU) sweep = TAU;
            else { sweep %= TAU; if (sweep < 0) sweep += TAU; }
        } else {
            if (-sweep >= TAU) sweep = -TAU;
            else { sweep %= TAU; if (sweep > 0) sweep -= TAU; }
        }
        // Segments from the on-screen radius: smooth circles, cheap small lights
        const m = this._m;
        const k = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
        const rr = Math.max(rx, ry) * k;
        const n = Math.max(3, Math.ceil(Math.abs(sweep) / TAU * Math.min(96, Math.max(10, rr * 1.2))));
        const cr = Math.cos(rot || 0), sr = Math.sin(rot || 0);
        for (let i = 0; i <= n; i++) {
            const a = a0 + sweep * i / n;
            const ex = Math.cos(a) * rx, ey = Math.sin(a) * ry;
            this._pt(x + ex * cr - ey * sr, y + ex * sr + ey * cr);
        }
    }

    quadraticCurveTo(cx, cy, x, y) {
        const sub = this._sub;
        if (!sub || !sub.pts.length) { this.moveTo(cx, cy); }
        const m = this._m, p = this._sub.pts;
        const x0 = p[p.length - 2], y0 = p[p.length - 1];
        const qx = m[0] * cx + m[2] * cy + m[4], qy = m[1] * cx + m[3] * cy + m[5];
        const x1 = m[0] * x + m[2] * y + m[4], y1 = m[1] * x + m[3] * y + m[5];
        const N = 12;
        for (let i = 1; i <= N; i++) {
            const t = i / N, u = 1 - t;
            p.push(u * u * x0 + 2 * u * t * qx + t * t * x1, u * u * y0 + 2 * u * t * qy + t * t * y1);
        }
    }

    // --- Painting ---

    _graphic() {
        const blend = this.globalCompositeOperation === 'lighter' ? 'add' : 'normal';
        if (this._g && this._gBlend === blend) return this._g;
        let g = this._graphics[this._nGraphics];
        if (!g) { g = new PIXI.Graphics(); this._graphics.push(g); }
        this._nGraphics++;
        g.clear();
        g.blendMode = blend;
        this._parent.addChild(g);
        this._g = g;
        this._gBlend = blend;
        return g;
    }

    _addPath(g, closeAll) {
        let n = 0;
        for (const sub of this._path) {
            const p = sub.pts;
            if (p.length < 4) continue;
            g.poly(p, closeAll || sub.closed);
            n++;
        }
        return n;
    }

    fill() {
        const col = GpuCtx.color(this.fillStyle);
        const alpha = col.a * this.globalAlpha;
        if (alpha <= 0) return;
        const g = this._graphic();
        g.beginPath();
        if (this._addPath(g, true)) g.fill({ color: col.rgb, alpha });
    }

    stroke() {
        const col = GpuCtx.color(this.strokeStyle);
        const alpha = col.a * this.globalAlpha;
        if (alpha <= 0) return;
        const m = this._m;
        const width = this.lineWidth * Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
        const g = this._graphic();
        g.beginPath();
        let n = 0;
        if (this._dash) {
            for (const sub of this._path) n += this._addDashed(g, sub, Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])));
        } else {
            n = this._addPath(g, false);
        }
        if (n) g.stroke({ width, color: col.rgb, alpha, cap: this.lineCap, join: this.lineJoin, miterLimit: this.miterLimit });
    }

    _addDashed(g, sub, k) {
        const p = sub.pts.slice();
        if (sub.closed) p.push(p[0], p[1]);
        const dash = this._dash.map(d => d * k);
        let di = 0, left = dash[0], on = true, n = 0;
        let cur = on ? [p[0], p[1]] : null;
        for (let i = 2; i < p.length; i += 2) {
            let x0 = p[i - 2], y0 = p[i - 1];
            const x1 = p[i], y1 = p[i + 1];
            let seg = Math.hypot(x1 - x0, y1 - y0);
            while (seg > left) {
                const t = left / seg;
                x0 += (x1 - x0) * t; y0 += (y1 - y0) * t;
                seg -= left;
                if (on) { cur.push(x0, y0); g.poly(cur, false); n++; cur = null; }
                else cur = [x0, y0];
                on = !on;
                di = (di + 1) % dash.length;
                left = dash[di];
            }
            left -= seg;
            if (on) cur.push(x1, y1);
        }
        if (on && cur && cur.length >= 4) { g.poly(cur, false); n++; }
        return n;
    }

    fillRect(x, y, w, h) {
        const path = this._path, sub = this._sub;
        this._path = []; this._sub = null;
        this.rect(x, y, w, h);
        this.fill();
        this._path = path; this._sub = sub;
    }

    strokeRect(x, y, w, h) {
        const path = this._path, sub = this._sub;
        this._path = []; this._sub = null;
        this.rect(x, y, w, h);
        this.stroke();
        this._path = path; this._sub = sub;
    }

    clearRect() {}

    clip() {
        let c = this._clips[this._nClips];
        if (!c) {
            c = { box: new PIXI.Container(), mask: new PIXI.Graphics() };
            this._clips.push(c);
        }
        this._nClips++;
        c.mask.clear();
        c.mask.beginPath();
        if (this._addPath(c.mask, true)) c.mask.fill({ color: 0xffffff });
        c.box.addChild(c.mask);
        c.box.mask = c.mask;
        this._parent.addChild(c.box);
        this._parent = c.box;
        this._g = null;
    }

    // --- Filter layers (GpuCtx only) ---

    beginLayer(filters) {
        let c = this._layers[this._nLayers];
        if (!c) { c = new PIXI.Container(); this._layers.push(c); }
        this._nLayers++;
        c.filters = filters;
        this._parent.addChild(c);
        this._layerStack.push(this._parent);
        this._parent = c;
        this._g = null;
    }

    endLayer() {
        this._parent = this._layerStack.pop() || this.root;
        this._g = null;
    }

    // --- Images ---

    drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh) {
        if (dx === undefined) {
            if (sw === undefined) { dx = sx; dy = sy; dw = img.width; dh = img.height; }
            else { dx = sx; dy = sy; dw = sw; dh = sh; }
            sx = 0; sy = 0; sw = img.width; sh = img.height;
        }
        if (this.globalAlpha <= 0 || sw <= 0 || sh <= 0) return;
        this._sprite(GpuCtx.texture(img, sx, sy, sw, sh), dx, dy, dw / sw, dh / sh, 0xffffff);
    }

    _sprite(tex, dx, dy, kx, ky, tint) {
        let s = this._sprites[this._nSprites];
        if (!s) { s = new PIXI.Sprite(); this._sprites.push(s); }
        this._nSprites++;
        s.texture = tex;
        const m = this._m;
        GpuCtx._mat.set(m[0] * kx, m[1] * kx, m[2] * ky, m[3] * ky, m[0] * dx + m[2] * dy + m[4], m[1] * dx + m[3] * dy + m[5]);
        s.setFromMatrix(GpuCtx._mat);
        s.alpha = this.globalAlpha;
        s.tint = tint;
        s.blendMode = this.globalCompositeOperation === 'lighter' ? 'add' : 'normal';
        this._parent.addChild(s);
        this._g = null;
        return s;
    }

    // --- Text: baked white once per string and font, tinted per use ---

    fillText(str, x, y) { this._text(str, x, y, this.fillStyle, 0); }
    strokeText(str, x, y) { this._text(str, x, y, this.strokeStyle, this.lineWidth); }

    measureText(str) {
        const c = GpuCtx._measureCtx();
        c.font = this.font;
        return c.measureText(str);
    }

    _text(str, x, y, style, strokeW) {
        str = String(str);
        const col = GpuCtx.color(style);
        if (col.a * this.globalAlpha <= 0 || !str) return;
        const t = GpuCtx.textTexture(str, this.font, this.textAlign, this.textBaseline, strokeW, this.lineJoin);
        const prev = this.globalAlpha;
        this.globalAlpha *= col.a;
        const R = GpuCtx.TEXT_RES;
        this._sprite(t.tex, x - t.ox / R, y - t.oy / R, 1 / R, 1 / R, col.rgb);
        this.globalAlpha = prev;
    }
}

GpuCtx._mat = typeof PIXI !== 'undefined' ? new PIXI.Matrix() : null;
GpuCtx.TEXT_RES = 2;            // text canvas pixels per play pixel
GpuCtx.TEXT_CACHE_MAX = 400;
GpuCtx._textCache = new Map();
GpuCtx._colors = new Map();
GpuCtx._dirty = new Set();      // texture sources to re-upload at end()

// CSS colour → { rgb, a }, cached. Unparsed forms go through a canvas once.
GpuCtx.color = function (style) {
    let c = this._colors.get(style);
    if (c) return c;
    let s = typeof style === 'string' ? style.trim() : '#000000';
    if (!/^(#|rgb|hsl)/i.test(s)) {
        const mc = this._measureCtx();
        mc.fillStyle = '#000000';
        mc.fillStyle = s;
        s = mc.fillStyle;   // normalised to '#rrggbb' or 'rgba(...)'
    }
    let rgb = 0, a = 1;
    if (s[0] === '#') {
        let h = s.slice(1);
        if (h.length === 3 || h.length === 4) h = h.split('').map(ch => ch + ch).join('');
        rgb = parseInt(h.slice(0, 6), 16);
        if (h.length === 8) a = parseInt(h.slice(6, 8), 16) / 255;
    } else {
        const n = s.match(/[\d.]+%?/g) || [];
        const v = (i) => parseFloat(n[i]);
        if (s[0] === 'h' || s[0] === 'H') {
            const [r, g, b] = _rendererHslToRgb(v(0), v(1), v(2));
            rgb = (r << 16) | (g << 8) | b;
        } else {
            rgb = (Math.round(v(0)) << 16) | (Math.round(v(1)) << 8) | Math.round(v(2));
        }
        if (n.length > 3) a = n[3].endsWith('%') ? v(3) / 100 : v(3);
    }
    c = { rgb, a: isNaN(a) ? 1 : a };
    if (this._colors.size > 2000) this._colors.clear();
    this._colors.set(style, c);
    return c;
};

GpuCtx._measureCtx = function () {
    if (!this._mc) this._mc = document.createElement('canvas').getContext('2d');
    return this._mc;
};

// Texture for a rectangle of a canvas; one GPU source per canvas
GpuCtx.texture = function (img, sx, sy, sw, sh) {
    let gpu = img.__gpu;
    if (!gpu) {
        gpu = img.__gpu = { source: new PIXI.CanvasSource({ resource: img }), frames: new Map() };
        img.__gpuDirty = false;
    } else if (img.__gpuDirty) {
        this._dirty.add(gpu.source);
        img.__gpuDirty = false;
    }
    const key = sx + ',' + sy + ',' + sw + ',' + sh;
    let tex = gpu.frames.get(key);
    if (!tex) {
        tex = new PIXI.Texture({ source: gpu.source, frame: new PIXI.Rectangle(sx, sy, sw, sh) });
        gpu.frames.set(key, tex);
    }
    return tex;
};

GpuCtx.textTexture = function (str, font, align, baseline, strokeW, join) {
    const key = font + '|' + align + '|' + baseline + '|' + strokeW + '|' + join + '|' + str;
    const cache = this._textCache;
    let t = cache.get(key);
    if (t) { cache.delete(key); cache.set(key, t); return t; }   // keep LRU order
    const R = this.TEXT_RES;
    const mc = this._measureCtx();
    mc.font = font;
    const size = parseFloat((font.match(/(\d+(\.\d+)?)px/) || [0, 10])[1]);
    const w = mc.measureText(str).width;
    const pad = Math.ceil(strokeW + 2);
    const cw = Math.ceil((w + pad * 2) * R), ch = Math.ceil((size * 2.6 + pad * 2) * R);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, cw); canvas.height = Math.max(1, ch);
    const c = canvas.getContext('2d');
    const ox = (pad + (align === 'center' ? w / 2 : (align === 'right' || align === 'end') ? w : 0)) * R;
    const oy = (pad + size * 1.3) * R;
    c.scale(R, R);
    c.font = font;
    c.textAlign = align;
    c.textBaseline = baseline;
    if (strokeW > 0) {
        c.strokeStyle = '#ffffff'; c.lineWidth = strokeW; c.lineJoin = join;
        c.strokeText(str, ox / R, oy / R);
    } else {
        c.fillStyle = '#ffffff';
        c.fillText(str, ox / R, oy / R);
    }
    t = { tex: this.texture(canvas, 0, 0, canvas.width, canvas.height), ox, oy };
    cache.set(key, t);
    if (cache.size > this.TEXT_CACHE_MAX) {
        const [oldKey] = cache.keys();
        GpuCtx.release(cache.get(oldKey).tex.source.resource);
        cache.delete(oldKey);
    }
    return t;
};

// Text baked before the web font arrived would keep the fallback font
if (typeof document !== 'undefined' && document.fonts) {
    document.fonts.addEventListener('loadingdone', () => {
        for (const t of GpuCtx._textCache.values()) GpuCtx.release(t.tex.source.resource);
        GpuCtx._textCache.clear();
    });
}
