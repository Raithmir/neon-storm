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
//  Set Settings.values.graphicsStyle = 'classic' to fall back to the
//  original flat-fill art for comparison.
// ============================================================
const Neon = {
    on() {
        return typeof Settings === 'undefined' || Settings.values.graphicsStyle !== 'classic';
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
        const a = ctx.globalAlpha;
        const k = intensity != null ? intensity : 1;
        ctx.fillStyle = color;
        ctx.globalAlpha = a * 0.35 * k;
        ctx.beginPath(); ctx.arc(x, y, radius * 2, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = a * k;
        ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(x, y, radius * 0.45, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = a;
    },

    // Hit reaction: a brief squash-and-stretch around the current origin
    squash(ctx, flash, amount) {
        if (!flash) return;
        const k = amount || 0.12;
        ctx.scale(1 + k, 1 - k);
    }
};
