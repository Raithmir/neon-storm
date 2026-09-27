
// === constants.js ===
// ============================================================
//  NEON STORM — Core Constants & Canvas Setup
// ============================================================

// --- Screen / Layout Constants ---
const SCREEN_W = 1920;
const SCREEN_H = 1080;
const PLAY_W = 720;
const PLAY_H = 960;
const PLAY_X = (SCREEN_W - PLAY_W) / 2;
const PLAY_Y = (SCREEN_H - PLAY_H) / 2;
const HUD_LEFT_W = PLAY_X;
const HUD_RIGHT_X = PLAY_X + PLAY_W;
const HUD_RIGHT_W = SCREEN_W - HUD_RIGHT_X;

// Canvas 2D overlay — menus, HUD, transitions
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = SCREEN_W;
canvas.height = SCREEN_H;

// Scale canvases to fit window
function resizeCanvas() {
    const scaleX = window.innerWidth / SCREEN_W;
    const scaleY = window.innerHeight / SCREEN_H;
    const scale = Math.min(scaleX, scaleY);
    canvas.style.width = (SCREEN_W * scale) + 'px';
    canvas.style.height = (SCREEN_H * scale) + 'px';

    // Position the Pixi canvas over the play area within the container
    if (typeof Renderer !== 'undefined' && Renderer.pixiCanvas) {
        Renderer.resize(scale, PLAY_X * scale, PLAY_Y * scale);
    }
    // Render at the display's real pixel density (capped by graphics quality)
    if (typeof Renderer !== 'undefined' && Renderer.ready) Renderer.applyResolution(scale);
}
window.addEventListener('resize', resizeCanvas);
// Safe initial sizing (Renderer not yet available — just size the overlay canvas)
(function() {
    const scaleX = window.innerWidth / SCREEN_W;
    const scaleY = window.innerHeight / SCREEN_H;
    const scale = Math.min(scaleX, scaleY);
    canvas.style.width = (SCREEN_W * scale) + 'px';
    canvas.style.height = (SCREEN_H * scale) + 'px';
})();


// === backdrops.js ===
// ============================================================
//  BACKDROPS — GPU fragment shaders for the level backgrounds
//
//  Each level's background is one full-screen shader (see
//  Renderer.setBackdrop) drawn under all gameplay. The world streams
//  toward the player: perspective levels put their horizon at the top,
//  top-down levels scroll their ground downward.
//
//  Uniforms (set every frame by Renderer._updateBackdrop):
//    uTime    seconds of play (pauses with the game)
//    uRes     play-area size in pixels (720, 960)
//    uPulse   1 on a bomb or big blast, decaying to 0
//    uBoss    0..1 while a boss is on screen
//    uSurge   0..1 while Neon Surge is active
//    uDim     0..~0.35, darkens the backdrop under dense bullet patterns
//    uCalm    1 when Flash Reduction is on: no glitch flicker or strobing
//
//  Readability rule: keep backdrops darker and less saturated than
//  anything the player can collide with. Pixel coords: p = vUV * uRes,
//  y grows downward.
//
//  When WebGL isn't available the Canvas 2D Background module draws the
//  older painted backgrounds instead.
// ============================================================
const BACKDROP_VERTEX = `
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
    mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
    gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
    vUV = aUV;
}`;

const BACKDROP_COMMON = `
precision highp float;
in vec2 vUV;
uniform float uTime;
uniform vec2 uRes;
uniform float uPulse;
uniform float uBoss;
uniform float uSurge;
uniform float uDim;
uniform float uCalm;

float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}
float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) {
        v += a * noise(p);
        p = mat2(0.8, 0.6, -0.6, 0.8) * p * 2.02 + vec2(17.0, 9.0);   // rotate octaves to hide grid artefacts
        a *= 0.5;
    }
    return v;
}
// Sparse point stars on a grid of cells; returns brightness
float stars(vec2 p, float cell, float density, float size) {
    vec2 c = floor(p / cell);
    vec2 f = fract(p / cell);
    float h = hash(c);
    if (h > density) return 0.0;
    vec2 pos = vec2(hash(c + 3.1), hash(c + 7.7)) * 0.8 + 0.1;
    float d = length((f - pos) * cell);
    float tw = 0.6 + 0.4 * sin(uTime * (1.0 + h * 3.0) + h * 40.0);
    return smoothstep(size, 0.0, d) * tw * (0.5 + 0.5 * hash(c + 1.3));
}
// Distance-based line intensity: 1 on the line, fading over w pixels
float line(float distPx, float w) {
    return smoothstep(w, 0.0, distPx);
}
vec3 finish(vec3 col) {
    return col * (1.0 - uDim);
}
`;

const BACKDROP_SHADERS = {

    // Level 1 — perspective neon grid rushing toward the player, striped
    // sun and wireframe mountains on a horizon near the top
    synthwave: `
void main() {
    vec2 p = vUV * uRes;
    float W = uRes.x;
    float cx = W * 0.5;
    float hy = uRes.y * 0.27;
    vec3 gridCol = mix(vec3(1.0, 0.17, 0.84), vec3(1.0, 0.1, 0.25), uBoss * 0.7);
    gridCol = mix(gridCol, vec3(0.3, 1.0, 1.0), uSurge * 0.5);
    vec3 col;

    if (p.y < hy) {
        // Sky
        float t = p.y / hy;
        col = mix(vec3(0.02, 0.004, 0.08), vec3(0.3, 0.05, 0.42), pow(t, 2.2));
        col += vec3(stars(p + vec2(0.0, uTime * 4.0), 26.0, 0.25, 1.4)) * (1.0 - t) * 0.8;

        // Sun with a halo and scrolling stripes across its lower half
        vec2 sc = vec2(cx, hy - 18.0);
        float R = 84.0;
        float d = length(p - sc);
        vec3 sunTop = mix(vec3(1.0, 0.8, 0.2), vec3(1.0, 0.3, 0.15), uBoss);
        vec3 sunCol = mix(sunTop, vec3(1.0, 0.1, 0.55), smoothstep(sc.y - R, sc.y + R * 0.4, p.y));
        float stripeY = (p.y - (sc.y - R * 0.1)) + uTime * 6.0;
        float gap = smoothstep(sc.y - R * 0.1, sc.y + R, p.y);
        float stripe = step(fract(stripeY / 12.0), gap * 0.55) * step(sc.y - R * 0.1, p.y);
        float sun = smoothstep(R, R - 1.5, d) * (1.0 - stripe);
        col = mix(col, sunCol * 0.95, sun);
        col += vec3(1.0, 0.2, 0.6) * 0.35 * exp(-max(d - R, 0.0) / 60.0) * (1.0 - sun);

        // Wireframe mountains, taller toward the edges so the sun shows
        float edge = abs(p.x / W - 0.5) * 2.0;
        float mh = (0.2 + 0.8 * smoothstep(0.15, 0.9, edge)) * (fbm(vec2(p.x * 0.012, 3.0)) * 110.0 + 10.0);
        float ridge = hy - mh;
        if (p.y > ridge) {
            vec3 body = vec3(0.03, 0.005, 0.09);
            float gx = line(abs(fract(p.x / 22.0 + 0.5) - 0.5) * 22.0, 0.8) * 0.35;
            float gy = line(abs(fract((p.y - ridge) / 14.0) - 0.5) * 14.0, 0.8) * 0.25;
            col = body + gridCol * (gx + gy) * 0.35 * smoothstep(hy, ridge, p.y);
        }
        col += gridCol * line(abs(p.y - ridge), 1.6) * 0.9;
    } else {
        // Floor: perspective grid
        float dy = p.y - hy;
        float gx = (p.x - cx) / dy * 14.0;
        float gz = 1100.0 / dy + uTime * 3.2;
        float wX = abs(gx - floor(gx + 0.5)) * dy / 14.0;
        float wZ = abs(gz - floor(gz + 0.5)) * dy * dy / 1100.0;
        float lw = 0.7 + dy * 0.004;
        float fade = smoothstep(0.0, 140.0, dy);
        // Converging lines crowd together near the horizon: fade them out there
        float lx = line(wX, lw) * smoothstep(10.0, 110.0, dy);
        float lz = line(wZ, lw) * fade;
        // Every fourth lane line is cyan
        float lane = step(abs(mod(floor(gx + 0.5), 4.0)), 0.5);
        vec3 lc = mix(gridCol, vec3(0.1, 0.95, 1.0), lane * 0.8);
        float bright = (0.45 + uPulse * 0.6 + uSurge * 0.3) * mix(0.35, 1.0, fade);
        col = mix(vec3(0.16, 0.03, 0.26), vec3(0.015, 0.004, 0.05), smoothstep(0.0, 260.0, dy));
        col += (lc * lx * 0.8 + gridCol * lz) * bright;
        // Haze on the horizon and the sun's reflection
        col += vec3(0.8, 0.1, 0.6) * 0.25 * exp(-dy / 30.0);
        col += vec3(1.0, 0.3, 0.6) * 0.12 * exp(-abs(p.x - cx) / 40.0) * exp(-dy / 220.0);
    }
    gl_FragColor = vec4(finish(col), 1.0);
}`,

    // Level 2 — flying low over a foundry floor: plated deck, glowing vents,
    // conveyor belts, pipes, and dark girders sweeping past overhead
    industrial: `
void main() {
    vec2 p = vUV * uRes;
    vec2 w = vec2(p.x, p.y - uTime * 70.0);
    float T = 96.0;
    vec2 cell = floor(w / T);
    vec2 f = fract(w / T) * T;
    float h = hash(cell);
    vec3 col = vec3(0.045, 0.035, 0.035) * (0.8 + 0.4 * hash(cell + 5.0));

    // Plate seams and rivets
    float seam = min(min(f.x, T - f.x), min(f.y, T - f.y));
    col *= 0.55 + 0.45 * smoothstep(0.0, 2.5, seam);
    vec2 rv = min(f, T - f);
    col += vec3(0.2, 0.14, 0.12) * smoothstep(2.2, 0.8, length(rv - vec2(6.0))) * 0.6;

    float heat = 0.6 + 0.4 * sin(uTime * 3.0 + h * 20.0) + uPulse;
    // Furnace vents
    if (h < 0.18) {
        vec2 q = abs(f - T * 0.5);
        if (q.x < 30.0 && q.y < 20.0) {
            float slot = step(0.5, fract(f.y / 6.0));
            col = mix(vec3(0.02, 0.0, 0.0), vec3(1.0, 0.3, 0.05) * heat * 0.7, slot * 0.8);
        }
        col += vec3(1.0, 0.3, 0.0) * 0.18 * heat * exp(-length(max(q - vec2(30.0, 20.0), 0.0)) / 18.0);
    }
    // Conveyor belts in some columns, with chevrons moving faster than the deck
    float colH = hash(vec2(cell.x, 3.0));
    if (colH < 0.28) {
        float bx = abs(f.x - T * 0.5);
        if (bx < 26.0) {
            float by = w.y - uTime * 60.0;
            float chev = fract((by + bx * 0.8) / 22.0);
            col = vec3(0.04, 0.035, 0.035) + vec3(0.9, 0.6, 0.2) * 0.2 * step(chev, 0.25);
            col *= 0.6 + 0.4 * smoothstep(26.0, 20.0, bx);
        }
        col += vec3(0.9, 0.55, 0.2) * 0.3 * line(abs(bx - 27.0), 1.2);
    }
    // Pipes between columns with flanges
    float px = mod(p.x + 30.0, 240.0);
    float pr = abs(px - 12.0);
    if (pr < 9.0) {
        float shade = cos(pr / 9.0 * 1.5);
        col = vec3(0.14, 0.12, 0.12) * shade + vec3(1.0, 0.4, 0.1) * 0.06 * shade * shade;
        float fl = mod(w.y, 150.0);
        col += vec3(0.25, 0.18, 0.15) * step(fl, 6.0) * shade;
    }
    // Heat glow ahead (top of screen)
    col += vec3(0.8, 0.12, 0.02) * 0.14 * smoothstep(uRes.y * 0.25, 0.0, p.y) * (1.0 + uBoss * 0.8);
    // Girders overhead: faster, dark, rim-lit
    float gy = mod(p.y - uTime * 160.0, 520.0);
    if (gy < 36.0) {
        float truss = abs(fract((p.x + gy * 1.0) / 36.0) - 0.5) * 36.0;
        float truss2 = abs(fract((p.x - gy * 1.0) / 36.0) - 0.5) * 36.0;
        float edgeL = min(gy, 36.0 - gy);
        float solid = max(line(edgeL, 4.0), max(line(truss, 2.5), line(truss2, 2.5)));
        col = mix(col, vec3(0.015, 0.008, 0.006), solid * 0.92);
        col += vec3(1.0, 0.4, 0.1) * 0.4 * line(abs(gy - 1.0), 1.2);
    }
    // Embers drifting up
    col += vec3(1.0, 0.5, 0.15) * stars(vec2(p.x, p.y + uTime * 120.0), 40.0, 0.1, 1.4) * 0.6;
    gl_FragColor = vec4(finish(col * (0.85 + uSurge * 0.3)), 1.0);
}`,

    // Level 3 — deep space: parallax star layers, drifting nebula, a ringed planet
    space: `
void main() {
    vec2 p = vUV * uRes;
    vec3 col = vec3(0.004, 0.006, 0.025);
    // Nebula
    vec2 np = vec2(p.x, p.y - uTime * 6.0) * 0.004;
    float n = fbm(np + vec2(0.0, 3.0));
    float n2 = fbm(np * 1.7 + vec2(5.0, 1.0));
    col += vec3(0.12, 0.08, 0.35) * smoothstep(0.45, 0.85, n) * 0.9;
    col += vec3(0.05, 0.18, 0.35) * smoothstep(0.5, 0.9, n2) * 0.7;
    col = mix(col, col * vec3(1.4, 0.6, 0.8), uBoss * 0.5);
    // Three star layers at different speeds
    col += vec3(0.7, 0.75, 1.0) * stars(vec2(p.x, p.y - uTime * 8.0), 18.0, 0.22, 0.9) * 0.6;
    col += vec3(0.85, 0.9, 1.0) * stars(vec2(p.x, p.y - uTime * 22.0), 34.0, 0.2, 1.3);
    col += vec3(1.0) * stars(vec2(p.x + 7.0, p.y - uTime * 55.0), 70.0, 0.18, 1.8);
    // Fast streaks for speed
    vec2 sp = vec2(p.x, p.y - uTime * 420.0);
    vec2 sc = floor(sp / vec2(60.0, 240.0));
    float sh = hash(sc);
    if (sh < 0.08) {
        vec2 sf = fract(sp / vec2(60.0, 240.0)) * vec2(60.0, 240.0);
        col += vec3(0.5, 0.6, 1.0) * line(abs(sf.x - 30.0), 0.8) * smoothstep(0.0, 60.0, sf.y) * step(sf.y, 60.0) * 0.4;
    }
    // Ringed planet, low on the right, lit from the upper left
    vec2 pc = vec2(uRes.x * 0.82, uRes.y * 0.9);
    float R = 190.0;
    vec2 d = p - pc;
    float r = length(d);
    // Ring (tilted ellipse), behind the planet on top and in front below
    vec2 rd = vec2(d.x * 0.92 + d.y * 0.4, (-d.x * 0.4 + d.y * 0.92) * 3.2);
    float rr = length(rd);
    float ring = smoothstep(250.0, 256.0, rr) * smoothstep(340.0, 334.0, rr) * (0.55 + 0.45 * sin(rr * 0.35));
    if (r < R) {
        vec3 nrm = normalize(vec3(d / R, sqrt(max(0.0, 1.0 - dot(d / R, d / R)))));
        float lit = max(0.0, dot(nrm, normalize(vec3(-0.6, -0.5, 0.6))));
        float bands = fbm(vec2(nrm.y * 6.0, nrm.x * 1.5 + uTime * 0.02));
        vec3 pcol = mix(vec3(0.15, 0.1, 0.35), vec3(0.35, 0.5, 0.9), bands) * (0.06 + lit * 0.4);
        col = pcol;
        col += vec3(0.3, 0.5, 1.0) * pow(1.0 - nrm.z, 3.0) * 0.5;
        if (rd.y > 0.0) col += vec3(0.6, 0.55, 0.9) * ring * 0.4;
    } else {
        col += vec3(0.6, 0.55, 0.9) * ring * 0.4;
        col += vec3(0.25, 0.4, 1.0) * 0.25 * exp(-(r - R) / 25.0);
    }
    col *= 1.0 + uPulse * 0.8 + uSurge * 0.2;
    gl_FragColor = vec4(finish(col), 1.0);
}`,

    // Level 4 — night flight above the clouds: city lights far below,
    // moonlit cloud layers streaming past at two speeds
    sky: `
void main() {
    vec2 p = vUV * uRes;
    // City lights far below: clusters of lamps in districts, a few winding main roads
    vec2 cp = vec2(p.x, p.y - uTime * 30.0);
    float district = smoothstep(0.45, 0.72, fbm(cp * 0.004));
    float lamps = stars(cp, 6.0, 0.55, 1.1) + stars(cp + 3.0, 11.0, 0.35, 1.4);
    vec3 col = vec3(0.01, 0.02, 0.06);
    col += vec3(1.0, 0.7, 0.35) * lamps * 0.7 * district;
    float road = 1e3;
    for (int i = 0; i < 3; i++) {
        float fi = float(i);
        float rx = uRes.x * (0.2 + 0.3 * fi) + sin(cp.y * 0.006 + fi * 2.0) * 60.0 + sin(cp.y * 0.017 + fi) * 14.0;
        road = min(road, abs(p.x - rx));
    }
    col += vec3(1.0, 0.75, 0.4) * line(road, 1.5) * 0.25 * (0.4 + district);
    col = mix(col, col * vec3(1.3, 0.5, 0.5), uBoss * 0.6);
    // Lower cloud deck
    vec2 c1 = vec2(p.x, p.y - uTime * 75.0) * 0.0035;
    float d1 = fbm(c1 + vec2(1.7, 9.2));
    float cov1 = smoothstep(0.42, 0.72, d1);
    float top1 = smoothstep(0.42, 0.72, fbm(c1 + vec2(1.7, 9.2) - vec2(0.0, 0.02)));
    vec3 cloud1 = mix(vec3(0.07, 0.1, 0.2), vec3(0.3, 0.4, 0.6), clamp((top1 - cov1) * 6.0 + 0.4, 0.0, 1.0));
    col = mix(col, cloud1, cov1 * 0.85);
    // Upper, faster wisps
    vec2 c2 = vec2(p.x * 0.8, p.y - uTime * 170.0) * 0.005;
    float cov2 = smoothstep(0.55, 0.8, fbm(c2 + vec2(8.0, 2.0)));
    col = mix(col, vec3(0.28, 0.36, 0.55), cov2 * 0.45);
    // Moon glow from ahead
    vec2 m = p - vec2(uRes.x * 0.72, -30.0);
    col += vec3(0.4, 0.55, 0.9) * 0.35 * exp(-length(m) / 260.0);
    col += vec3(0.8, 0.9, 1.0) * uPulse * 0.25 * cov1;
    col *= 1.0 + uSurge * 0.25;
    gl_FragColor = vec4(finish(col), 1.0);
}`,

    // Level 5 — a circuit board seen from above: traces, pads and chips,
    // with data pulses racing along the traces
    digital: `
vec2 edgeHash(vec2 c) { return vec2(hash(c + 0.5), hash(c + 17.3)); }
void main() {
    vec2 p = vUV * uRes;
    float S = 40.0;
    vec2 w = vec2(p.x, p.y - uTime * 80.0);
    vec2 c = floor(w / S);
    vec2 f = fract(w / S) * S - S * 0.5;
    vec3 col = vec3(0.012, 0.004, 0.035);
    // Back layer: slower, faint grid for depth
    vec2 bw = vec2(p.x, p.y - uTime * 35.0);
    vec2 bg = abs(fract(bw / 60.0) - 0.5) * 60.0;
    col += vec3(0.25, 0.05, 0.5) * max(line(bg.x, 0.8), line(bg.y, 0.8)) * 0.12;

    // Traces: each cell links to right/down neighbours by hash; left/up come from neighbours
    float right = step(0.55, edgeHash(c).x);
    float down  = step(0.45, edgeHash(c).y);
    float left  = step(0.55, edgeHash(c - vec2(1.0, 0.0)).x);
    float up    = step(0.45, edgeHash(c - vec2(0.0, 1.0)).y);
    float tw = 1.6;
    float tr = 0.0;
    tr = max(tr, right * line(abs(f.y), tw) * step(0.0, f.x));
    tr = max(tr, left  * line(abs(f.y), tw) * step(f.x, 0.0));
    tr = max(tr, down  * line(abs(f.x), tw) * step(0.0, f.y));
    tr = max(tr, up    * line(abs(f.x), tw) * step(f.y, 0.0));
    float links = right + down + left + up;
    float pad = step(0.5, links) * line(abs(length(f) - 4.0), 1.4);
    vec3 traceCol = mix(vec3(0.65, 0.2, 1.0), vec3(0.0, 1.0, 0.8), step(0.5, hash(vec2(c.x, 7.0))));
    traceCol = mix(traceCol, vec3(1.0, 0.15, 0.35), uBoss * 0.6);
    col += traceCol * (tr * 0.45 + pad * 0.7) * (1.0 + uPulse * 0.8 + uSurge * 0.4);

    // Chips: dark blocks with pin rows over some 3x2 cell areas
    vec2 chipCell = floor(w / vec2(S * 3.0, S * 2.0));
    if (hash(chipCell + 40.0) < 0.12) {
        vec2 cf = fract(w / vec2(S * 3.0, S * 2.0)) * vec2(S * 3.0, S * 2.0) - vec2(S * 1.5, S);
        vec2 q = abs(cf);
        if (q.x < 44.0 && q.y < 26.0) {
            col = vec3(0.03, 0.015, 0.06);
            col += traceCol * 0.5 * line(min(44.0 - q.x, 26.0 - q.y), 1.2);
        }
        float pins = step(26.0, q.y) * step(q.y, 34.0) * step(q.x, 40.0) * step(0.5, fract(cf.x / 8.0));
        col += traceCol * pins * 0.5;
    }

    // Data pulses: bright packets travelling down vertical traces toward the player
    float colSeed = hash(vec2(c.x, 91.0));
    float py = fract((w.y / (S * 6.0)) - uTime * (0.4 + colSeed * 0.5) + colSeed * 5.0);
    float pulse = smoothstep(0.06, 0.0, abs(py - 0.5)) * (down * step(0.0, f.y) + up * step(f.y, 0.0)) * line(abs(f.x), 2.5);
    col += vec3(0.7, 1.0, 1.0) * pulse * 0.9;
    // A scan line sweeps down now and then
    float scan = fract(uTime * 0.12);
    col += traceCol * 0.25 * line(abs(p.y - scan * uRes.y * 1.4), 2.0);
    gl_FragColor = vec4(finish(col), 1.0);
}`,

    // Level 6 — a collapsing tunnel into the void, with glitch bands and tears
    void: `
void main() {
    vec2 p = vUV * uRes;
    // Glitch bands: horizontal strips occasionally jump sideways
    float band = floor(p.y / 22.0);
    float gt = floor(uTime * 9.0);
    float gh = hash(vec2(band, gt));
    float glitch = step(0.94 - uPulse * 0.2 - uBoss * 0.04, gh) * (1.0 - uCalm);
    p.x += glitch * (hash(vec2(band, gt + 3.0)) - 0.5) * 70.0;

    vec2 c = vec2(uRes.x * 0.5 + sin(uTime * 0.4) * 30.0, uRes.y * 0.26);
    vec2 d = p - c;
    float r = length(d) / uRes.y;
    float a = atan(d.y, d.x);
    a += 0.08 * sin(r * 6.0 - uTime * 1.3);
    float v = 1.1 / max(r, 0.02) + uTime * 2.2;
    float u = a / 6.2831853 * 18.0;
    // Wall grid, fading to black at the centre
    float gu = abs(fract(u) - 0.5);
    float gv = abs(fract(v) - 0.5);
    float grid = max(smoothstep(0.04 + 0.03 * r, 0.0, gu), smoothstep(0.06 * (0.4 + r), 0.0, gv));
    float depth = smoothstep(0.03, 0.5, r);
    vec3 lineCol = mix(vec3(0.9, 0.05, 0.25), vec3(1.0, 0.0, 0.7), 0.5 + 0.5 * sin(v * 0.7));
    vec3 col = vec3(0.02, 0.0, 0.01) * depth;
    col += lineCol * grid * depth * (0.35 + uPulse * 0.6 + uSurge * 0.3);
    // Cells flicker in and out
    float cellH = hash(floor(vec2(u, v)));
    col += lineCol * 0.12 * depth * step(0.93, cellH) * (0.5 + 0.5 * sin(uTime * 8.0 * (1.0 - uCalm) + cellH * 30.0));
    // The void's eye
    col += vec3(0.8, 0.0, 0.2) * 0.5 * line(abs(r - 0.03), 0.004);
    // Glitched bands tint cyan; rare vertical tears
    col = mix(col, col.gbr * 1.6 + vec3(0.0, 0.08, 0.08), glitch * 0.8);
    float tear = step(0.997, hash(vec2(floor(p.x / 3.0), floor(uTime * 12.0))));
    col += vec3(1.0, 0.2, 0.5) * tear * 0.3 * step(0.8, hash(vec2(floor(p.y / 90.0), gt))) * (1.0 - uCalm);
    gl_FragColor = vec4(finish(col), 1.0);
}`,
};


// === renderer.js ===
// ============================================================
//  RENDERER — Canvas 2D glow + PixiJS GPU pipeline
//
//  Pixi path architecture:
//    1. Gameplay draws to offCanvas (720×960) via Canvas 2D
//    2. Glow halos draw to glowCanvas via addGlow()
//    3. offCanvas  → gameSprite  (game content)
//    4. _starSlowLayer / _starFastLayer: TilingSprite GPU star fields
//    5. glowCanvas → _glowSprite + BlurFilter = real GPU bloom
//    6. bulletLayer / particleLayer: native PIXI.ParticleContainers (additive)
//    7. _explosionLayer: fireball PIXI.Sprites for big hits
//    8. _laserBeamMesh: MeshRope for laser beam visual
//    9. All above live in gameLayer, which carries ColorMatrixFilter + shockwave + godray
//   10. _flashSprite sits on app.stage (above colour grade + bloom)
//   11. app.stage carries chroma + CRT + glitch filters (screen-space)
//
//  Canvas 2D fallback: glowCanvas composited additively into
//  compCanvas, then blitted onto overlay — identical to alpha build.
// ============================================================
const Renderer = {
    app: null,
    pixiCanvas: null,
    ready: false,
    usePixi: false,

    // Offscreen canvases
    offCanvas: null,     // Gameplay drawing (Canvas 2D)
    offCtx: null,
    glowCanvas: null,    // Glow halos → drives GPU bloom in Pixi mode
    glowCtx: null,
    compCanvas: null,    // Used only in Canvas 2D fallback
    compCtx: null,

    // PixiJS container hierarchy
    gameLayer: null,         // Container: all gameplay Pixi objects
    bulletLayer: null,       // ParticleContainer (additive) — bullet particles
    particleLayer: null,     // ParticleContainer (additive) — effect particles
    _explosionLayer: null,   // Container — fireball sprites for big explosions
    _explosionSprites: [],

    // Main game canvas sprite
    gameTexture: null,
    _canvasSource: null,
    gameSprite: null,

    // GPU star field — TilingSprites, added additively above gameSprite
    _starSlowLayer: null,
    _starFastLayer: null,
    _starScrollSlow: 0,
    _starScrollFast: 0,

    // Bloom: glowCanvas uploaded with BlurFilter
    _glowCanvasSource: null,
    _glowSprite: null,
    _blurFilter: null,

    // Laser beam — MeshRope driven from player position
    _laserBeamMesh: null,
    _laserBeamPoints: null,
    _laserBeamTime: 0,
    _laserBeamTex: null,

    // Per-level colour grade
    _colorGrade: null,

    // Shared glow radial gradient texture for Pixi particles
    glowTex: null,

    // Screen flash (on stage, above bloom)
    _flashSprite: null,
    _flashTimer: 0,
    _flashDuration: 0,
    _flashColor: 0xffffff,

    // Chromatic aberration
    _chromaFilter: null,
    _chromaTimer: 0,
    _chromaDuration: 0,
    _chromaIntensity: 0,
    _chromaPersist: false,

    // CRT scanline filter
    _crtFilter: null,
    _crtEnabled: false,

    // Shockwave (bomb / surge) — pixi-filters ShockwaveFilter on gameLayer
    _shockwaveFilter: null,
    _shockwaveActive: false,
    _shockwaveTimer: 0,

    // God-ray (boss entrance) — pixi-filters GodrayFilter on gameLayer
    _godrayFilter: null,
    _godrayTimer: 0,
    _godrayDuration: 0,

    // Glitch (boss phase change) — pixi-filters GlitchFilter on app.stage
    _glitchFilter: null,
    _glitchTimer: 0,

    // Canvas 2D glow image (used by addGlow fallback)
    _glowImg: null,

    async init() {
        this.offCanvas = document.createElement('canvas');
        this.offCanvas.width = PLAY_W;
        this.offCanvas.height = PLAY_H;
        this.offCtx = this.offCanvas.getContext('2d');

        this.glowCanvas = document.createElement('canvas');
        this.glowCanvas.width = PLAY_W;
        this.glowCanvas.height = PLAY_H;
        this.glowCtx = this.glowCanvas.getContext('2d');

        this.compCanvas = document.createElement('canvas');
        this.compCanvas.width = PLAY_W;
        this.compCanvas.height = PLAY_H;
        this.compCtx = this.compCanvas.getContext('2d');

        this._glowImg = this._createGlowImage(64);

        if (typeof PIXI === 'undefined') {
            console.warn('[Renderer] PixiJS not loaded — Canvas 2D only');
            this.ready = true;
            return;
        }

        try {
            // Filters render at the renderer's resolution, so high-DPI output stays sharp
            if (PIXI.Filter && PIXI.Filter.defaultOptions) PIXI.Filter.defaultOptions.resolution = 'inherit';
            this.app = new PIXI.Application();
            await this.app.init({
                width: PLAY_W,
                height: PLAY_H,
                backgroundAlpha: 0,
                antialias: false,
                preference: 'webgl',
            });

            this.pixiCanvas = this.app.canvas;
            this.pixiCanvas.id = 'pixi-play';

            const container = document.getElementById('game-container');
            if (container) {
                container.insertBefore(this.pixiCanvas, canvas);
            } else {
                canvas.parentNode.insertBefore(this.pixiCanvas, canvas);
            }

            // --- Game canvas sprite ---
            this._canvasSource = new PIXI.CanvasSource({
                resource: this.offCanvas,
                width: PLAY_W,
                height: PLAY_H,
            });
            this.gameTexture = new PIXI.Texture(this._canvasSource);
            this.gameSprite = new PIXI.Sprite(this.gameTexture);

            // --- GPU Bloom: glowCanvas → sprite with BlurFilter + additive blend ---
            this._glowCanvasSource = new PIXI.CanvasSource({
                resource: this.glowCanvas,
                width: PLAY_W,
                height: PLAY_H,
            });
            const glowTex = new PIXI.Texture(this._glowCanvasSource);
            this._glowSprite = new PIXI.Sprite(glowTex);
            this._blurFilter = new PIXI.BlurFilter({ strength: 8, quality: 3 });
            this._glowSprite.filters = [this._blurFilter];
            this._glowSprite.blendMode = 'add';
            this._glowSprite.alpha = 1.3;

            // --- Shared FX sheet for native Pixi particles (see _createFxTextures) ---
            this.fx = this._createFxTextures();
            this.glowTex = this.fx.glow;

            // --- Enemy bullet shadows (normal blend, under the additive bullets) ---
            // A dark disc behind every enemy bullet keeps it readable over bright backgrounds
            this.bulletShadowLayer = new PIXI.ParticleContainer({
                texture: this.fx.shadow,
                dynamicProperties: { vertex: true, position: true, rotation: false, color: true },
                boundsArea: new PIXI.Rectangle(0, 0, PLAY_W, PLAY_H),
            });

            // --- Bullet ParticleContainer (additive, GPU-batched) ---
            this.bulletLayer = new PIXI.ParticleContainer({
                texture: this.glowTex,
                dynamicProperties: { vertex: true, position: true, rotation: true, color: true },
                boundsArea: new PIXI.Rectangle(0, 0, PLAY_W, PLAY_H),
                blendMode: 'add',
            });

            // --- Particle ParticleContainer (additive, GPU-batched) ---
            this.particleLayer = new PIXI.ParticleContainer({
                texture: this.glowTex,
                dynamicProperties: { vertex: true, position: true, rotation: true, color: true },
                boundsArea: new PIXI.Rectangle(0, 0, PLAY_W, PLAY_H),
                blendMode: 'add',
            });

            // --- Explosion fireball sprites ---
            this._explosionLayer = new PIXI.Container();

            // --- Per-level colour grade (identity by default) ---
            this._colorGrade = new PIXI.ColorMatrixFilter();

            // --- Game layer: assembles all gameplay Pixi objects ---
            // Order: sky canvas → GPU stars → bloom → bullets → particles → explosions → laser beam
            this.gameLayer = new PIXI.Container();
            this.gameLayer.filterArea = new PIXI.Rectangle(0, 0, PLAY_W, PLAY_H);
            this._initBackdrop();                           // 0. GPU shader background
            this.gameLayer.addChild(this.gameSprite);       // 1. Game canvas (all Canvas 2D drawing)
            this._initStarLayers();                         // 2-3. GPU star tiles (only without a backdrop)
            this.gameLayer.addChild(this._glowSprite);      // 4. Blurred glow bloom
            this.gameLayer.addChild(this.bulletShadowLayer); // 5. Enemy bullet shadows
            this.gameLayer.addChild(this.bulletLayer);      // 5. Native bullets
            this.gameLayer.addChild(this.particleLayer);    // 6. Native particles
            this.gameLayer.addChild(this._explosionLayer);  // 7. Fireball sprites
            this.app.stage.addChild(this.gameLayer);

            // --- Screen flash overlay (above colour grade + bloom) ---
            this._flashSprite = new PIXI.Sprite(PIXI.Texture.WHITE);
            this._flashSprite.width = PLAY_W;
            this._flashSprite.height = PLAY_H;
            this._flashSprite.alpha = 0;
            this._flashSprite.blendMode = 'add';
            this.app.stage.addChild(this._flashSprite);

            // Context loss
            this.pixiCanvas.addEventListener('webglcontextlost', (e) => {
                e.preventDefault();
                console.warn('[Renderer] WebGL context lost');
                this.usePixi = false;
            });
            this.pixiCanvas.addEventListener('webglcontextrestored', () => {
                console.log('[Renderer] WebGL context restored');
                this.usePixi = true;
            });

            this._initChromaFilter();
            this._initCRTFilter();

            // --- pixi-filters effects (guarded — no-ops if pixi-filters isn't loaded) ---
            this._initShockwaveFilter();
            this._initGodrayFilter();
            this._initGlitchFilter();

            // --- Laser beam MeshRope ---
            this._initLaserBeam();

            for (const f of [this._colorGrade, this._chromaFilter, this._crtFilter, this._shockwaveFilter, this._godrayFilter, this._glitchFilter]) {
                if (f) f.resolution = 'inherit';
            }

            // Apply initial filter chain
            this._rebuildGameLayerFilters();
            this._rebuildFilterChain();

            this.usePixi = true;
            this.ready = true;
            console.log('[Renderer] PixiJS v' + PIXI.VERSION + ' (' + this.app.renderer.name + ') — bloom + colour grade active');
        } catch (e) {
            console.warn('[Renderer] PixiJS init failed:', e);
            this.ready = true;
        }
    },

    // Canvas 2D white radial gradient (used for addGlow and baked into glowTex)
    _createGlowImage(size) {
        const c = document.createElement('canvas');
        c.width = size; c.height = size;
        const g = c.getContext('2d');
        const half = size / 2;
        const grad = g.createRadialGradient(half, half, 0, half, half, half);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.3, 'rgba(255,255,255,0.5)');
        grad.addColorStop(0.7, 'rgba(255,255,255,0.15)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, size, size);
        return c;
    },

    // One canvas holds every particle shape, because a ParticleContainer's
    // particles must all share a texture source. Shapes are white so tint
    // colours them; elongated ones point up (-y), so rotate by angle + PI/2.
    //   glow    soft radial falloff (bloom dots, fireballs)
    //   orb     enemy bullet body: solid disc with a soft rim
    //   core    small hot centre for bullets
    //   shadow  dark disc drawn behind enemy bullets (normal blend)
    //   streak  player shot: capsule, bright head fading to the tail
    //   needle  fast enemy shot: long thin diamond
    //   missile homing shot: arrowhead with fins
    //   spark   thin line for sparks and debris
    //   pixel   hard square (Pixel Retro bullets, Pixel Dissolve explosions)
    _createFxTextures() {
        const W = 256, H = 64;
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        const g = c.getContext('2d');
        const radial = (cx, cy, r, stops) => {
            const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
            for (const [o, col] of stops) grad.addColorStop(o, col);
            g.fillStyle = grad;
            g.fillRect(cx - r, cy - r, r * 2, r * 2);
        };
        g.drawImage(this._createGlowImage(64), 0, 0);
        radial(80, 16, 16, [[0, '#fff'], [0.62, '#fff'], [0.72, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]);
        radial(112, 16, 16, [[0, '#fff'], [0.35, '#fff'], [0.55, 'rgba(255,255,255,0.4)'], [1, 'rgba(255,255,255,0)']]);
        radial(144, 16, 16, [[0, 'rgba(0,0,0,0.85)'], [0.75, 'rgba(0,0,0,0.7)'], [1, 'rgba(0,0,0,0)']]);
        // streak (160..176 x 0..64): tapered capsule, head at the top
        let grad = g.createLinearGradient(0, 2, 0, 62);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.25, 'rgba(255,255,255,0.9)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grad;
        g.beginPath();
        g.moveTo(168, 1); g.quadraticCurveTo(175, 4, 174, 12); g.lineTo(169.5, 63);
        g.lineTo(166.5, 63); g.lineTo(162, 12); g.quadraticCurveTo(161, 4, 168, 1);
        g.fill();
        // needle (176..192): long diamond
        g.fillStyle = '#fff';
        g.beginPath(); g.moveTo(184, 1); g.lineTo(189, 24); g.lineTo(184, 63); g.lineTo(179, 24); g.closePath(); g.fill();
        // missile (192..208 x 0..32): arrowhead with fins
        g.beginPath();
        g.moveTo(200, 1); g.lineTo(204, 12); g.lineTo(204, 22); g.lineTo(207, 30); g.lineTo(193, 30);
        g.lineTo(196, 22); g.lineTo(196, 12); g.closePath(); g.fill();
        // spark (208..216 x 0..32): thin line, soft at both ends
        grad = g.createLinearGradient(0, 0, 0, 32);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(0.3, 'rgba(255,255,255,1)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grad;
        g.fillRect(210.5, 0, 3, 32);
        // pixel (216..224 x 0..8): hard square for retro bullets and pixel explosions
        g.fillStyle = '#fff';
        g.fillRect(217, 1, 6, 6);

        const src = new PIXI.CanvasSource({ resource: c, width: W, height: H });
        const tex = (x, y, w, h) => new PIXI.Texture({ source: src, frame: new PIXI.Rectangle(x, y, w, h) });
        return {
            glow: tex(0, 0, 64, 64), orb: tex(64, 0, 32, 32), core: tex(96, 0, 32, 32),
            shadow: tex(128, 0, 32, 32), streak: tex(160, 0, 16, 64), needle: tex(176, 0, 16, 64),
            missile: tex(192, 0, 16, 32), spark: tex(208, 0, 8, 32), pixel: tex(216, 0, 8, 8),
        };
    },

    // --- Backdrop: full-screen shader background (see backdrops.js) ---

    _initBackdrop() {
        try {
            const geometry = new PIXI.Geometry({
                attributes: {
                    aPosition: [0, 0, PLAY_W, 0, PLAY_W, PLAY_H, 0, PLAY_H],
                    aUV: [0, 0, 1, 0, 1, 1, 0, 1],
                },
                indexBuffer: [0, 1, 2, 0, 2, 3],
            });
            this._bgUniforms = new PIXI.UniformGroup({
                uTime:  { value: 0, type: 'f32' },
                uRes:   { value: new Float32Array([PLAY_W, PLAY_H]), type: 'vec2<f32>' },
                uPulse: { value: 0, type: 'f32' },
                uBoss:  { value: 0, type: 'f32' },
                uSurge: { value: 0, type: 'f32' },
                uDim:   { value: 0, type: 'f32' },
                uCalm:  { value: 0, type: 'f32' },
            });
            this._bgShaders = {};
            this._bgGeometry = geometry;
            this.backdropTheme = null;
            this.bgPulse = 0;
            this.setBackdrop('synthwave');
            this.gameLayer.addChild(this._bgMesh);
            this.backdropActive = true;
        } catch (e) {
            console.warn('[Renderer] Shader backdrop unavailable — using Canvas 2D background:', e);
            this._bgMesh = null;
            this.backdropActive = false;
        }
    },

    setBackdrop(theme) {
        if (theme === this.backdropTheme || !this._bgGeometry) return;
        const src = BACKDROP_SHADERS[theme] || BACKDROP_SHADERS.synthwave;
        let shader = this._bgShaders[theme];
        if (!shader) {
            shader = PIXI.Shader.from({
                gl: { vertex: BACKDROP_VERTEX, fragment: BACKDROP_COMMON + src },
                resources: { bgUniforms: this._bgUniforms },
            });
            this._bgShaders[theme] = shader;
        }
        if (!this._bgMesh) this._bgMesh = new PIXI.Mesh({ geometry: this._bgGeometry, shader });
        else this._bgMesh.shader = shader;
        this.backdropTheme = theme;
    },

    // Per-frame uniforms: follows the level theme and reacts to bombs, bosses, Surge and bullet density
    _updateBackdrop(dt) {
        if (!this._bgMesh) return;
        this.setBackdrop(Background.bgType);
        const u = this._bgUniforms.uniforms;
        const approach = (cur, target, rate) => cur + (target - cur) * Math.min(1, dt * rate);
        this.bgPulse = Math.max(0, this.bgPulse - dt * 1.6);
        const bossOn = typeof Boss !== 'undefined' && Boss.active && Boss.entered && !Boss.defeated ? 1 : 0;
        const surgeOn = typeof Scoring !== 'undefined' && Scoring.surgeActive ? 1 : 0;
        const bullets = typeof Enemies !== 'undefined' ? Enemies.enemyBullets.pool.length : 0;
        u.uTime = Background.time;
        u.uPulse = this.bgPulse;
        u.uBoss = approach(u.uBoss, bossOn, 1.5);
        u.uSurge = approach(u.uSurge, surgeOn, 4);
        u.uDim = approach(u.uDim, Math.min(0.35, bullets / 350 * 0.35), 3);
        u.uCalm = this.calm() ? 1 : 0;
        if (this._starSlowLayer) this._starSlowLayer.visible = this._starFastLayer.visible = false;
    },

    // --- Star field (TilingSprite) ---

    _createStarTexture(count, maxRadius, seed) {
        const c = document.createElement('canvas');
        c.width = PLAY_W; c.height = PLAY_H;
        const g = c.getContext('2d');
        // Seeded random via simple LCG so each call is reproducible
        let r = seed || 1337;
        const rng = () => { r = (r * 1664525 + 1013904223) & 0xffffffff; return (r >>> 0) / 0xffffffff; };
        for (let i = 0; i < count; i++) {
            const x = rng() * PLAY_W;
            const y = rng() * PLAY_H;
            const radius = 0.4 + rng() * maxRadius;
            const alpha = 0.25 + rng() * 0.6;
            g.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            g.beginPath();
            g.arc(x, y, radius, 0, Math.PI * 2);
            g.fill();
        }
        const src = new PIXI.CanvasSource({ resource: c, width: PLAY_W, height: PLAY_H });
        return new PIXI.Texture(src);
    },

    _initStarLayers() {
        try {
            // Deep slow stars — many, small
            const slowTex = this._createStarTexture(120, 1.0, 9001);
            this._starSlowLayer = new PIXI.TilingSprite({ texture: slowTex, width: PLAY_W, height: PLAY_H });
            this._starSlowLayer.blendMode = 'add';
            this._starSlowLayer.alpha = 0.65;

            // Near fast stars — fewer, slightly larger
            const fastTex = this._createStarTexture(40, 1.6, 4242);
            this._starFastLayer = new PIXI.TilingSprite({ texture: fastTex, width: PLAY_W, height: PLAY_H });
            this._starFastLayer.blendMode = 'add';
            this._starFastLayer.alpha = 0.85;

            this.gameLayer.addChild(this._starSlowLayer);
            this.gameLayer.addChild(this._starFastLayer);
        } catch (e) {
            console.warn('[Renderer] Star layers unavailable:', e);
        }
    },

    // --- Laser beam (MeshRope) ---

    _createLaserBeamTexture() {
        const w = 14, h = 32;
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const g = c.getContext('2d');
        // Horizontal gradient: transparent → bright centre → transparent
        const grad = g.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0,    'rgba(255,255,255,0)');
        grad.addColorStop(0.3,  'rgba(255,255,255,0.35)');
        grad.addColorStop(0.5,  'rgba(255,255,255,1)');
        grad.addColorStop(0.7,  'rgba(255,255,255,0.35)');
        grad.addColorStop(1,    'rgba(255,255,255,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, w, h);
        const src = new PIXI.CanvasSource({ resource: c, width: w, height: h });
        return new PIXI.Texture(src);
    },

    _initLaserBeam() {
        if (!this.usePixi) return;
        try {
            this._laserBeamTex = this._createLaserBeamTexture();
            this._laserBeamPoints = [];
            const numPoints = 10;
            for (let i = 0; i < numPoints; i++) {
                this._laserBeamPoints.push(new PIXI.Point(PLAY_W / 2, PLAY_H * (1 - i / (numPoints - 1))));
            }
            this._laserBeamMesh = new PIXI.MeshRope({
                texture: this._laserBeamTex,
                points: this._laserBeamPoints,
            });
            this._laserBeamMesh.blendMode = 'add';
            this._laserBeamMesh.visible = false;
            this._laserBeamMesh.alpha = 0.9;
            this.gameLayer.addChild(this._laserBeamMesh);
        } catch (e) {
            console.warn('[Renderer] LaserBeam mesh unavailable:', e);
        }
    },

    // Called each frame from Player.update() — x/y is the ship's gun tip
    updateLaserBeam(x, y, color, visible) {
        if (!this._laserBeamMesh) return;
        if (!visible) {
            this._laserBeamMesh.visible = false;
            return;
        }
        const pts = this._laserBeamPoints;
        const numPoints = pts.length;
        const t = this._laserBeamTime;
        for (let i = 0; i < numPoints; i++) {
            const frac = i / (numPoints - 1);             // 0 = ship tip, 1 = top of screen
            const waveAmp = (1 - frac) * (1 - frac) * 10; // strongest near ship, tapers to 0
            pts[i].x = x + Math.sin(t * 7 + i * 1.3) * waveAmp;
            pts[i].y = y * (1 - frac);                    // ship y → 0 at top
        }
        const hex = typeof color === 'string' ? this.colorToHex(color) : (color || 0x4488ff);
        this._laserBeamMesh.tint = hex;
        this._laserBeamMesh.visible = true;
    },

    // --- pixi-filters effects ---

    // pixi-filters v6 (bundled by build.js) registers itself as PIXI.filters
    _filtersLib() {
        return (typeof PIXI !== 'undefined' && PIXI.filters && PIXI.filters.ShockwaveFilter) ? PIXI.filters : null;
    },

    _initShockwaveFilter() {
        const F = this._filtersLib();
        if (!F) return;
        try {
            // Centre and sizes are in play-area pixels
            this._shockwaveFilter = new F.ShockwaveFilter({
                center: { x: PLAY_W / 2, y: PLAY_H / 2 },
                time: 0,
                amplitude: 35,
                wavelength: 90,
                brightness: 0.85,
                speed: 650,
                radius: -1,
            });
            this._shockwaveFilter.enabled = false;
        } catch (e) {
            console.warn('[Renderer] ShockwaveFilter unavailable:', e);
        }
    },

    _initGodrayFilter() {
        const F = this._filtersLib();
        if (!F) return;
        try {
            // Point light (not parallel rays) just above the top-centre of the play area
            this._godrayFilter = new F.GodrayFilter({
                angle: 30,
                gain: 0.55,
                lacunarity: 2.5,
                time: 0,
                parallel: false,
                center: { x: PLAY_W / 2, y: -40 },
                alpha: 0,
            });
            this._godrayFilter.enabled = false;
        } catch (e) {
            console.warn('[Renderer] GodrayFilter unavailable:', e);
        }
    },

    _initGlitchFilter() {
        const F = this._filtersLib();
        if (!F) return;
        try {
            this._glitchFilter = new F.GlitchFilter({
                slices: 6,
                offset: 55,
                fillMode: 0,
                average: false,
                seed: Math.random(),
                minSize: 8,
                sampleSize: 512,
            });
            this._glitchFilter.enabled = false;
        } catch (e) {
            console.warn('[Renderer] GlitchFilter unavailable:', e);
        }
    },

    // gameLayer.filters = colorGrade + any active game-space effects
    _rebuildGameLayerFilters() {
        if (!this.gameLayer) return;
        const filters = [this._colorGrade];
        if (this._shockwaveFilter && this._shockwaveActive) filters.push(this._shockwaveFilter);
        if (this._godrayFilter && this._godrayTimer > 0) filters.push(this._godrayFilter);
        this.gameLayer.filters = filters;
    },

    _initChromaFilter() {
        try {
            this._chromaFilter = PIXI.Filter.from({
                gl: {
                    vertex: `
                        in vec2 aPosition;
                        out vec2 vTextureCoord;
                        uniform vec4 uInputSize;
                        uniform vec4 uOutputFrame;
                        uniform vec4 uOutputTexture;
                        vec4 filterVertexPosition(void) {
                            vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
                            position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
                            position.y = position.y * (2.0*uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
                            return vec4(position, 0.0, 1.0);
                        }
                        vec2 filterTextureCoord(void) {
                            return aPosition * (uOutputFrame.zw * uInputSize.zw);
                        }
                        void main(void) {
                            gl_Position = filterVertexPosition();
                            vTextureCoord = filterTextureCoord();
                        }`,
                    fragment: `
                        in vec2 vTextureCoord;
                        uniform sampler2D uTexture;
                        uniform float uOffset;
                        void main(void) {
                            float r = texture(uTexture, vTextureCoord + vec2(uOffset, 0.0)).r;
                            float g = texture(uTexture, vTextureCoord).g;
                            float b = texture(uTexture, vTextureCoord - vec2(uOffset, 0.0)).b;
                            float a = texture(uTexture, vTextureCoord).a;
                            gl_FragColor = vec4(r, g, b, a);
                        }`
                },
                resources: {
                    chromaUniforms: { uOffset: { value: 0.0, type: 'f32' } }
                }
            });
        } catch (e) {
            console.warn('[Renderer] Chroma filter unavailable:', e);
        }
    },

    _initCRTFilter() {
        try {
            this._crtFilter = PIXI.Filter.from({
                gl: {
                    vertex: `
                        in vec2 aPosition;
                        out vec2 vTextureCoord;
                        uniform vec4 uInputSize;
                        uniform vec4 uOutputFrame;
                        uniform vec4 uOutputTexture;
                        vec4 filterVertexPosition(void) {
                            vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
                            position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
                            position.y = position.y * (2.0*uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
                            return vec4(position, 0.0, 1.0);
                        }
                        vec2 filterTextureCoord(void) {
                            return aPosition * (uOutputFrame.zw * uInputSize.zw);
                        }
                        void main(void) {
                            gl_Position = filterVertexPosition();
                            vTextureCoord = filterTextureCoord();
                        }`,
                    fragment: `
                        in vec2 vTextureCoord;
                        uniform sampler2D uTexture;
                        uniform vec4 uInputSize;
                        uniform float uIntensity;
                        void main(void) {
                            vec4 color = texture(uTexture, vTextureCoord);
                            float line = mod(vTextureCoord.y * uInputSize.y, 2.0);
                            float scanline = 1.0 - step(1.0, line) * uIntensity;
                            gl_FragColor = vec4(color.rgb * scanline, color.a);
                        }`
                },
                resources: {
                    crtUniforms: { uIntensity: { value: 0.12, type: 'f32' } }
                }
            });
        } catch (e) {
            console.warn('[Renderer] CRT filter unavailable:', e);
        }
    },

    // Chroma + CRT + Glitch live on app.stage (screen-space, above colour grade + bloom)
    _rebuildFilterChain() {
        if (!this.app) return;
        const filters = [];
        if (this._chromaFilter && (this._chromaTimer > 0 || this._chromaPersist)) filters.push(this._chromaFilter);
        if (this._crtFilter && this._crtEnabled) filters.push(this._crtFilter);
        if (this._glitchFilter && this._glitchTimer > 0) filters.push(this._glitchFilter);
        this.app.stage.filters = filters.length > 0 ? filters : null;
    },

    // --- Render resolution & graphics quality ---
    //
    // The overlay (menus/HUD) and the play area render at the display's real
    // pixel density (CSS scale × devicePixelRatio), capped by the quality
    // level. Drawing code keeps using logical coordinates (1920×1080 overlay,
    // 720×960 play area); a canvas transform maps them to device pixels.
    // Settings.values.graphicsQuality: 'auto' starts at high and steps down
    // while playing if frames run slow; 'high' | 'medium' | 'low' are fixed.
    QUALITY: {
        high:   { cap: 2,   blurQuality: 3 },
        medium: { cap: 1.5, blurQuality: 2 },
        low:    { cap: 1,   blurQuality: 1 },
    },
    quality: 'high',
    playScale: 1,
    uiScale: 1,
    _cssScale: 1,

    setQuality(setting) {
        this._autoQuality = setting === 'auto' || !this.QUALITY[setting];
        this.quality = this._autoQuality ? 'high' : setting;
        this._slowTime = 0;
        this.applyResolution();
    },

    applyResolution(cssScale) {
        if (cssScale) this._cssScale = cssScale;
        const q = this.QUALITY[this.quality] || this.QUALITY.high;
        const want = this._cssScale * (window.devicePixelRatio || 1);
        const k = Math.max(1, Math.min(q.cap, Math.round(want * 4) / 4));

        // Overlay canvas (menus, HUD)
        if (Math.round(SCREEN_W * k) !== canvas.width) {
            canvas.width = Math.round(SCREEN_W * k);
            canvas.height = Math.round(SCREEN_H * k);
        }
        ctx.setTransform(k, 0, 0, k, 0, 0);
        this.uiScale = k;

        // Play area: Pixi renderer + the Canvas 2D gameplay layer it uploads
        if (this.usePixi && this.app) {
            if (k !== this.playScale) {
                this.app.renderer.resize(PLAY_W, PLAY_H, k);
                this._canvasSource.resize(PLAY_W, PLAY_H, k);
                this.playScale = k;
            }
            if (this._blurFilter) this._blurFilter.quality = q.blurQuality;
        } else {
            this.playScale = 1;
        }
    },

    // Auto quality: step down a level after ~3 s of slow frames during play
    _autoTune(dtMs) {
        if (!this._autoQuality || this.quality === 'low') return;
        if (typeof Game === 'undefined' || Game.state !== 'playing' || document.hidden) { this._slowTime = 0; return; }
        this._frameAvg = this._frameAvg ? this._frameAvg * 0.95 + dtMs * 0.05 : dtMs;
        this._slowTime = this._frameAvg > 22 ? (this._slowTime || 0) + dtMs / 1000 : 0;
        if (this._slowTime > 3) {
            this.quality = this.quality === 'high' ? 'medium' : 'low';
            this._slowTime = 0;
            this._frameAvg = 0;
            console.log('[Renderer] Auto graphics quality → ' + this.quality);
            this.applyResolution();
        }
    },

    // --- Frame lifecycle ---

    getPlayCtx() { return this.offCtx; },

    beginFrame() {
        const k = this.playScale;
        this.offCtx.setTransform(1, 0, 0, 1, 0, 0);
        this.offCtx.clearRect(0, 0, this.offCanvas.width, this.offCanvas.height);
        this.offCtx.setTransform(k, 0, 0, k, 0, 0);
        this.glowCtx.clearRect(0, 0, PLAY_W, PLAY_H);
    },

    updateEffects(dt) {
        if (!this.usePixi) return;

        // Chromatic aberration
        if (this._chromaTimer > 0 && !this._chromaPersist) {
            this._chromaTimer -= dt;
            if (this._chromaTimer <= 0) {
                this._chromaTimer = 0;
                this._chromaIntensity = 0;
                this._rebuildFilterChain();
            }
        }
        if (this._chromaFilter) {
            const t = this._chromaDuration > 0 ? this._chromaTimer / this._chromaDuration : 0;
            const offset = this._chromaPersist ? this._chromaIntensity : this._chromaIntensity * t;
            this._chromaFilter.resources.chromaUniforms.uniforms.uOffset = this.calm() ? 0 : offset;
        }

        // Screen flash
        if (this._flashTimer > 0) {
            this._flashTimer -= dt;
            const t = Math.max(0, this._flashTimer / this._flashDuration);
            this._flashSprite.alpha = t * (this._flashPeak || 0.8);
            this._flashSprite.tint = this._flashColor;
            if (this._flashTimer <= 0) this._flashSprite.alpha = 0;
        }

        // Explosion fireball sprites
        for (let i = this._explosionSprites.length - 1; i >= 0; i--) {
            const e = this._explosionSprites[i];
            e.elapsed += dt;
            const t = e.elapsed / e.duration;
            const eased = 1 - Math.pow(1 - Math.min(t, 1), 2);
            e.sprite.scale.set(e.maxScale * eased);
            e.sprite.alpha = (1 - t) * (this.calm() ? 0.5 : 1);
            if (t >= 1) {
                this._explosionLayer.removeChild(e.sprite);
                this._explosionSprites.splice(i, 1);
            }
        }

        // Star field scroll
        if (this._starSlowLayer) {
            this._starScrollSlow += dt * 18;
            this._starScrollFast += dt * 55;
            this._starSlowLayer.tilePosition.y = this._starScrollSlow;
            this._starFastLayer.tilePosition.y = this._starScrollFast;
        }

        // Laser beam time (drives oscillation animation)
        if (this._laserBeamMesh) {
            this._laserBeamTime += dt;
        }

        // Shockwave — expand until wave leaves screen (~1.2s at speed 650)
        if (this._shockwaveActive && this._shockwaveFilter) {
            this._shockwaveTimer -= dt;
            this._shockwaveFilter.time += dt;
            if (this._shockwaveTimer <= 0) {
                this._shockwaveActive = false;
                this._shockwaveFilter.enabled = false;
                this._rebuildGameLayerFilters();
            }
        }

        // God-ray fade in → hold → fade out
        if (this._godrayTimer > 0 && this._godrayFilter) {
            this._godrayTimer -= dt;
            this._godrayFilter.time += dt * 0.4;
            const frac = this._godrayTimer / this._godrayDuration;
            if (frac > 0.8) {
                this._godrayFilter.alpha = (1 - frac) / 0.2 * 0.65;
            } else if (frac < 0.3) {
                this._godrayFilter.alpha = frac / 0.3 * 0.65;
            } else {
                this._godrayFilter.alpha = 0.65;
            }
            if (this._godrayTimer <= 0) {
                this._godrayTimer = 0;
                this._godrayFilter.enabled = false;
                this._rebuildGameLayerFilters();
            }
        }

        // Glitch — update seed each frame for randomness, disable when expired
        if (this._glitchTimer > 0 && this._glitchFilter) {
            this._glitchTimer -= dt;
            this._glitchFilter.seed = Math.random();
            if (this._glitchTimer <= 0) {
                this._glitchTimer = 0;
                this._glitchFilter.enabled = false;
                this._rebuildFilterChain();
            }
        }
    },

    // Pixi mode: upload game + glow canvases separately (glow sprite handles bloom)
    // Fallback mode: composite glow additively into compCanvas for blitToOverlay
    endFrame() {
        if (this.usePixi) {
            const now = performance.now();
            const frameMs = now - (this._lastFrameTime || now);
            this._updateBackdrop(Math.min(0.1, frameMs / 1000));
            if (frameMs > 0) this._autoTune(frameMs);
            this._lastFrameTime = now;
            this._canvasSource.update();
            this._glowCanvasSource.update();
            this.app.renderer.render(this.app.stage);
        } else {
            const c = this.compCtx;
            c.clearRect(0, 0, PLAY_W, PLAY_H);
            c.globalCompositeOperation = 'source-over';
            c.drawImage(this.offCanvas, 0, 0, PLAY_W, PLAY_H);
            c.globalCompositeOperation = 'lighter';
            c.drawImage(this.glowCanvas, 0, 0);
            c.globalCompositeOperation = 'source-over';
        }
    },

    // Canvas 2D fallback only — blits compCanvas onto the overlay
    blitToOverlay(targetCtx, x, y) {
        targetCtx.drawImage(this.compCanvas, x, y, PLAY_W, PLAY_H);
    },

    setShake(x, y) {
        if (this.usePixi && this.gameLayer) {
            this.gameLayer.position.set(x, y);
        }
    },

    resize(scale, pixiLeft, pixiTop) {
        if (!this.pixiCanvas) return;
        this.pixiCanvas.style.width = (PLAY_W * scale) + 'px';
        this.pixiCanvas.style.height = (PLAY_H * scale) + 'px';
        this.pixiCanvas.style.left = pixiLeft + 'px';
        this.pixiCanvas.style.top = pixiTop + 'px';
    },

    // --- Glow API (Canvas 2D — writes to glowCanvas, blurred by _glowSprite in Pixi mode) ---

    _glowCache: {},

    _getTintedGlow(colorHex) {
        if (this._glowCache[colorHex]) return this._glowCache[colorHex];
        const size = 64;
        const c = document.createElement('canvas');
        c.width = size; c.height = size;
        const g = c.getContext('2d');
        g.drawImage(this._glowImg, 0, 0);
        g.globalCompositeOperation = 'source-in';
        g.fillStyle = '#' + colorHex.toString(16).padStart(6, '0');
        g.fillRect(0, 0, size, size);
        this._glowCache[colorHex] = c;
        return c;
    },

    addGlow(x, y, color, size, alpha) {
        const hex = typeof color === 'number' ? color : this.colorToHex(color);
        const img = this._getTintedGlow(hex);
        const g = this.glowCtx;
        g.globalAlpha = alpha || 0.4;
        g.drawImage(img, x - size, y - size, size * 2, size * 2);
        g.globalAlpha = 1;
    },

    colorToHex(cssColor) {
        if (typeof cssColor === 'number') return cssColor;
        if (cssColor.charAt(0) === '#') {
            if (cssColor.length === 4) {
                const r = cssColor[1], g = cssColor[2], b = cssColor[3];
                return parseInt(r + r + g + g + b + b, 16);
            }
            return parseInt(cssColor.slice(1, 7), 16);
        }
        if (cssColor.charAt(0) === 'r') {
            const m = cssColor.match(/([\d.]+)/g);
            if (m) return (parseInt(m[0]) << 16) | (parseInt(m[1]) << 8) | parseInt(m[2]);
        }
        if (cssColor.charAt(0) === 'h') {
            const m = cssColor.match(/([\d.]+)/g);
            if (m) {
                const rgb = _rendererHslToRgb(parseFloat(m[0]), parseFloat(m[1]), parseFloat(m[2]));
                return (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
            }
        }
        return 0xffffff;
    },

    // --- Bloom control ---

    setBloomIntensity(scale, threshold) {
        if (!this._blurFilter || !this._glowSprite) return;
        this._blurFilter.strength = 6 + scale * 7.5;
        this._glowSprite.alpha = 1.0 + scale * 0.5;
    },

    // --- Per-level colour grade ---

    setColorGrade(opts) {
        if (!this._colorGrade) return;
        this._colorGrade.reset();
        if (!opts) return;
        if (opts.hue)        this._colorGrade.hue(opts.hue, false);
        if (opts.saturate)   this._colorGrade.saturate(opts.saturate, false);
        if (opts.contrast)   this._colorGrade.contrast(opts.contrast, false);
        if (opts.brightness) this._colorGrade.brightness(1 + opts.brightness, false);
    },

    // --- Explosion fireball sprite ---

    spawnExplosionSprite(x, y, maxScale, colorHex, duration) {
        if (!this.usePixi || !this.glowTex || !this._explosionLayer) return;
        const s = new PIXI.Sprite(this.glowTex);
        s.anchor.set(0.5);
        s.x = x;
        s.y = y;
        s.tint = colorHex || 0xff8800;
        s.alpha = this.calm() ? 0.5 : 1.0;
        s.scale.set(0.05);
        s.blendMode = 'add';
        this._explosionLayer.addChild(s);
        this._explosionSprites.push({ sprite: s, maxScale: maxScale || 3, duration: duration || 0.5, elapsed: 0 });
    },

    // --- Screen-space effects ---

    // Flash Reduction setting: every flash, glitch, colour split and backdrop
    // pulse goes through here, so photosensitive players get a calm screen
    calm() {
        return typeof Settings !== 'undefined' && !!Settings.values.flashReduction;
    },

    triggerChroma(intensity, duration) {
        if (!this._chromaFilter || this.calm()) return;
        this._chromaIntensity = intensity || 0.008;
        this._chromaDuration = duration || 0.3;
        this._chromaTimer = this._chromaDuration;
        this._rebuildFilterChain();
    },

    setPersistentChroma(intensity) {
        if (!this._chromaFilter) return;
        this._chromaPersist = intensity > 0;
        this._chromaIntensity = intensity;
        this._rebuildFilterChain();
    },

    triggerFlash(color, duration) {
        const calm = this.calm();
        this.bgPulse = Math.max(this.bgPulse || 0, calm ? 0.1 : 0.6);
        if (!this.usePixi) return;
        this._flashColor = color || 0xffffff;
        // Calm: a faint, slow wash instead of a white-out
        this._flashDuration = calm ? Math.max(0.5, duration || 0.3) : (duration || 0.3);
        this._flashPeak = calm ? 0.12 : 0.8;
        this._flashTimer = this._flashDuration;
        this._flashSprite.alpha = this._flashPeak;
        this._flashSprite.tint = this._flashColor;
    },

    setCRT(enabled) {
        this._crtEnabled = enabled;
        this._rebuildFilterChain();
    },

    // --- Game-space effects ---

    // Shockwave ripple expanding from a normalised position (0-1 range)
    triggerShockwave(normX, normY) {
        this.bgPulse = this.calm() ? 0.15 : 1;
        if (!this._shockwaveFilter) return;
        this._shockwaveFilter.center = { x: normX * PLAY_W, y: normY * PLAY_H };
        this._shockwaveFilter.time = 0;
        this._shockwaveActive = true;
        this._shockwaveTimer = 1.1;
        this._shockwaveFilter.enabled = true;
        this._rebuildGameLayerFilters();
    },

    // Volumetric god-ray light from top-centre — use on boss entrance
    triggerGodray(duration) {
        if (!this._godrayFilter) return;
        this._godrayDuration = duration || 2.5;
        this._godrayTimer = this._godrayDuration;
        this._godrayFilter.time = 0;
        this._godrayFilter.alpha = 0;
        this._godrayFilter.enabled = true;
        this._rebuildGameLayerFilters();
    },

    // Screen-space glitch burst — use on boss phase transition
    triggerGlitch(duration) {
        if (!this._glitchFilter || this.calm()) return;
        this._glitchTimer = duration || 0.55;
        this._glitchFilter.enabled = true;
        this._rebuildFilterChain();
    },
};

function _rendererHslToRgb(h, s, l) {
    s /= 100; l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r, g, b;
    if (h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}


// === config.js ===
// ============================================================
//  GAME CONFIG (Difficulty System)
// ============================================================
const DIFFICULTY_PRESETS = {
    casual: {
        bombs: { enabled: true, startCount: 5 },
        focus: { enabled: true, speedMultiplier: 0.4 },
        dash: { enabled: true, cooldown: 1.5 },
        graze: { enabled: true, zoneMultiplier: 1.4, rewardMultiplier: 0.8 },
        autofire: true,
        lives: 5,
        shieldHp: 0,
        deathPenalty: 'none',
        bulletDensity: 0.6,
        chainTimerSpeed: 0.7,
        scoreMultiplier: 0.5,
        deathBombWindow: 0.25   // seconds after a hit in which bombing cancels it
    },
    normal: {
        bombs: { enabled: true, startCount: 3 },
        focus: { enabled: true, speedMultiplier: 0.4 },
        dash: { enabled: true, cooldown: 2.0 },
        graze: { enabled: true, zoneMultiplier: 1.0, rewardMultiplier: 1.0 },
        autofire: false,
        lives: 3,
        shieldHp: 0,
        deathPenalty: 'moderate',
        bulletDensity: 1.0,
        chainTimerSpeed: 1.0,
        scoreMultiplier: 1.0,
        deathBombWindow: 0.15
    },
    hardcore: {
        bombs: { enabled: false, startCount: 0 },
        focus: { enabled: true, speedMultiplier: 0.4 }, // focus is a precision tool, not an assist
        dash: { enabled: true, cooldown: 3.0 },
        graze: { enabled: true, zoneMultiplier: 0.7, rewardMultiplier: 1.5 },
        autofire: false,
        lives: 1,
        shieldHp: 0,
        deathPenalty: 'full',
        bulletDensity: 1.3,
        chainTimerSpeed: 1.4,
        scoreMultiplier: 2.0,
        deathBombWindow: 0
    }
};

let GameConfig = JSON.parse(JSON.stringify(DIFFICULTY_PRESETS.normal));
GameConfig.difficulty = 'normal';
GameConfig.fireMode = 'manual'; // 'auto' or 'manual'


// === input.js ===
// ============================================================
//  INPUT SYSTEM (Keyboard + Gamepad)
// ============================================================
const Input = {
    keys: {},
    prevKeys: {},
    gamepadState: null,
    prevGamepadState: null,
    listeningForKey: null,    // Action name when waiting for key press
    listeningForButton: null, // Action name when waiting for gamepad button

    // Default key bindings
    defaultBindings: {
        up: ['ArrowUp', 'KeyW'],
        down: ['ArrowDown', 'KeyS'],
        left: ['ArrowLeft', 'KeyA'],
        right: ['ArrowRight', 'KeyD'],
        fire: ['Space', 'KeyZ'],
        focus: ['ShiftLeft', 'ShiftRight', 'KeyX'],
        dash: ['KeyC', 'KeyV'],
        bomb: ['KeyB', 'KeyN'],
        surge: ['KeyF', 'KeyM'],
        pause: ['Escape', 'KeyP'],
        confirm: ['Enter', 'Space'],
        back: ['Escape', 'Backspace']
    },

    // Default gamepad bindings
    defaultGpBindings: {
        fire: [0, 2],       // A, X
        focus: [6],          // Left trigger
        dash: [5],           // Right bumper
        bomb: [4],           // Left bumper
        surge: [7, 3],       // Right trigger, Y
        pause: [9],          // Start
        confirm: [0],        // A
        back: [1]            // B
    },

    // Current bindings (rebindable, start as copies of defaults)
    bindings: {},
    gpBindings: {},

    // Actions that can be rebound by the player (excludes menu-only actions)
    rebindableActions: ['up', 'down', 'left', 'right', 'fire', 'focus', 'dash', 'bomb', 'surge', 'pause'],

    // Human-readable names for key codes
    keyDisplayNames: {
        ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
        Space: 'SPACE', ShiftLeft: 'L.SHIFT', ShiftRight: 'R.SHIFT',
        Enter: 'ENTER', Escape: 'ESC', Backspace: 'BACKSPACE', Tab: 'TAB',
        ControlLeft: 'L.CTRL', ControlRight: 'R.CTRL', AltLeft: 'L.ALT', AltRight: 'R.ALT',
    },

    // Human-readable names for gamepad buttons (standard layout)
    gpButtonNames: ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'SELECT', 'START',
                    'L3', 'R3', 'D-UP', 'D-DOWN', 'D-LEFT', 'D-RIGHT', 'HOME'],

    init() {
        // Copy defaults
        this.bindings = JSON.parse(JSON.stringify(this.defaultBindings));
        this.gpBindings = JSON.parse(JSON.stringify(this.defaultGpBindings));

        window.addEventListener('keydown', e => {
            this.keys[e.code] = true;
            // If listening for a rebind, capture the key
            if (this.listeningForKey) {
                const action = this.listeningForKey;
                this.listeningForKey = null;
                // Set this key as the primary bind for the action (keep 1 key)
                this.bindings[action] = [e.code];
                // Also update confirm/back if relevant
                if (action === 'pause') this.bindings.back = ['Escape', 'Backspace'];
                this._saveBindings();
                e.preventDefault();
                return;
            }
            e.preventDefault();
        });
        window.addEventListener('keyup', e => {
            this.keys[e.code] = false;
            e.preventDefault();
        });
    },

    update() {
        // Poll gamepad (fresh state for this frame)
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        const gp = gamepads[0];
        if (gp) {
            this.gamepadState = {
                axes: [...gp.axes],
                buttons: gp.buttons.map(b => b.pressed)
            };
            // If listening for a gamepad rebind, capture the button
            if (this.listeningForButton) {
                for (let i = 0; i < gp.buttons.length; i++) {
                    if (gp.buttons[i].pressed && !(this.prevGamepadState && this.prevGamepadState.buttons[i])) {
                        const action = this.listeningForButton;
                        this.listeningForButton = null;
                        this.gpBindings[action] = [i];
                        if (action === 'pause') this.gpBindings.back = [1];
                        this._saveBindings();
                        break;
                    }
                }
            }
        } else {
            this.gamepadState = null;
        }
    },

    // Call at END of frame to snapshot state for next frame's isPressed comparisons
    lateUpdate() {
        this.prevKeys = { ...this.keys };
        this.prevGamepadState = this.gamepadState ? {
            axes: [...this.gamepadState.axes],
            buttons: [...this.gamepadState.buttons]
        } : null;
    },

    // Check if action is currently held
    isHeld(action) {
        const keys = this.bindings[action];
        if (keys) {
            for (const k of keys) {
                if (this.keys[k]) return true;
            }
        }
        if (this.gamepadState && this.gpBindings[action]) {
            for (const b of this.gpBindings[action]) {
                if (this.gamepadState.buttons[b]) return true;
            }
        }
        return false;
    },

    // Check if action was just pressed this frame
    isPressed(action) {
        // Don't process normal input while listening for rebind
        if (this.listeningForKey || this.listeningForButton) return false;

        const keys = this.bindings[action];
        if (keys) {
            for (const k of keys) {
                if (this.keys[k] && !this.prevKeys[k]) return true;
            }
        }
        if (this.gamepadState && this.gpBindings[action]) {
            for (const b of this.gpBindings[action]) {
                if (this.gamepadState.buttons[b] && !(this.prevGamepadState && this.prevGamepadState.buttons[b])) return true;
            }
        }
        return false;
    },

    // Get movement vector (keyboard + gamepad combined)
    getMovement() {
        let x = 0, y = 0;
        if (this.isHeld('left')) x -= 1;
        if (this.isHeld('right')) x += 1;
        if (this.isHeld('up')) y -= 1;
        if (this.isHeld('down')) y += 1;

        // Gamepad analog stick
        if (this.gamepadState) {
            const deadzone = 0.2;
            const ax = this.gamepadState.axes[0] || 0;
            const ay = this.gamepadState.axes[1] || 0;
            if (Math.abs(ax) > deadzone) x += ax;
            if (Math.abs(ay) > deadzone) y += ay;
        }

        // Normalize
        const len = Math.sqrt(x * x + y * y);
        if (len > 1) { x /= len; y /= len; }
        return { x, y };
    },

    // Get display name for a key code
    getKeyName(code) {
        if (this.keyDisplayNames[code]) return this.keyDisplayNames[code];
        // Strip 'Key' prefix for letter keys
        if (code.startsWith('Key')) return code.slice(3);
        if (code.startsWith('Digit')) return code.slice(5);
        return code;
    },

    // Get display name for a gamepad button
    getButtonName(index) {
        return this.gpButtonNames[index] || ('BTN' + index);
    },

    // Get display string for an action's keyboard binding
    getKeyBindDisplay(action) {
        const keys = this.bindings[action];
        if (!keys || keys.length === 0) return '---';
        return keys.map(k => this.getKeyName(k)).join(' / ');
    },

    // Get display string for an action's gamepad binding
    getGpBindDisplay(action) {
        const btns = this.gpBindings[action];
        if (!btns || btns.length === 0) return '---';
        return btns.map(b => this.getButtonName(b)).join(' / ');
    },

    // Start listening for a key rebind
    startKeyListen(action) {
        this.listeningForKey = action;
        this.listeningForButton = null;
    },

    // Start listening for a gamepad button rebind
    startButtonListen(action) {
        this.listeningForButton = action;
        this.listeningForKey = null;
    },

    // Cancel listening
    cancelListen() {
        this.listeningForKey = null;
        this.listeningForButton = null;
    },

    // Reset all bindings to defaults
    resetBindings() {
        this.bindings = JSON.parse(JSON.stringify(this.defaultBindings));
        this.gpBindings = JSON.parse(JSON.stringify(this.defaultGpBindings));
        this._saveBindings();
    },

    // Save bindings to storage
    async _saveBindings() {
        await Storage.set('inputBindings', {
            keyboard: this.bindings,
            gamepad: this.gpBindings
        });
    },

    // Load bindings from storage
    async loadBindings() {
        const data = await Storage.get('inputBindings');
        if (data) {
            if (data.keyboard) Object.assign(this.bindings, data.keyboard);
            if (data.gamepad) Object.assign(this.gpBindings, data.gamepad);
        }
    }
};


// === audio.js ===
// ============================================================
//  AUDIO SYSTEM (Procedural SFX via Web Audio API)
// ============================================================
const Audio = {
    ctx: null,
    masterVolume: 1.0,
    sfxVolume: 0.8,
    musicVolume: 0.5,
    enabled: true,

    init() {
        // Defer AudioContext creation to first user interaction (browser policy)
        const createCtx = () => {
            if (this.ctx) return;
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            window.removeEventListener('click', createCtx);
            window.removeEventListener('keydown', createCtx);
            window.removeEventListener('touchstart', createCtx);
        };
        window.addEventListener('click', createCtx);
        window.addEventListener('keydown', createCtx);
        window.addEventListener('touchstart', createCtx);
    },

    _createGain(volume) {
        if (!this.ctx) return null;
        const gain = this.ctx.createGain();
        gain.gain.value = volume * this.sfxVolume * this.masterVolume;
        gain.connect(this.ctx.destination);
        return gain;
    },

    // Pitch randomization helper — returns a multiplier near 1.0
    _rPitch(range) { return 1 + (Math.random() - 0.5) * (range || 0.15); },

    playShot() {
        if (!this.enabled || !this.ctx) return;
        const t = this.ctx.currentTime;
        const p = this._rPitch(0.2);
        const osc = this.ctx.createOscillator();
        const gain = this._createGain(0.18);
        osc.type = 'square';
        osc.frequency.setValueAtTime(880 * p, t);
        osc.frequency.exponentialRampToValueAtTime(440 * p, t + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
        osc.connect(gain);
        osc.start(t);
        osc.stop(t + 0.06);
    },

    playLaser() {
        if (!this.enabled || !this.ctx) return;
        const t = this.ctx.currentTime;
        const p = this._rPitch(0.1);
        const osc = this.ctx.createOscillator();
        const gain = this._createGain(0.14);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(600 * p, t);
        osc.frequency.linearRampToValueAtTime(200 * p, t + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        osc.connect(gain);
        osc.start(t);
        osc.stop(t + 0.15);
    },

    playExplosionSmall() {
        if (!this.enabled || !this.ctx) return;
        const t = this.ctx.currentTime;
        const p = this._rPitch(0.3);
        const duration = 0.15 + Math.random() * 0.1;
        const bufferSize = Math.floor(this.ctx.sampleRate * duration);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        const gain = this._createGain(0.4);
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2000 * p, t);
        filter.frequency.exponentialRampToValueAtTime(200 * p, t + duration);
        source.connect(filter);
        filter.connect(gain);
        source.start(t);
    },

    playExplosionLarge() {
        if (!this.enabled || !this.ctx) return;
        const t = this.ctx.currentTime;
        const bufferSize = this.ctx.sampleRate * 0.5;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 1.5);
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        const gain = this._createGain(0.45);
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(3000, t);
        filter.frequency.exponentialRampToValueAtTime(80, t + 0.5);
        source.connect(filter);
        filter.connect(gain);
        source.start(t);
    },

    playDash() {
        if (!this.enabled || !this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this._createGain(0.12);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, t);
        osc.frequency.exponentialRampToValueAtTime(1200, t + 0.08);
        osc.frequency.exponentialRampToValueAtTime(300, t + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        osc.connect(gain);
        osc.start(t);
        osc.stop(t + 0.18);
    },

    playBomb() {
        if (!this.enabled || !this.ctx) return;
        const t = this.ctx.currentTime;
        // Deep boom
        const osc = this.ctx.createOscillator();
        const gain = this._createGain(0.4);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(120, t);
        osc.frequency.exponentialRampToValueAtTime(30, t + 0.6);
        gain.gain.setValueAtTime(0.5 * this.sfxVolume * this.masterVolume, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
        osc.connect(gain);
        osc.start(t);
        osc.stop(t + 0.8);
        // Noise sweep
        const bufferSize = this.ctx.sampleRate * 0.6;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        const g2 = this._createGain(0.2);
        src.connect(g2);
        src.start(t);
    },

    playPowerUp() {
        if (!this.enabled || !this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this._createGain(0.12);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523, t);
        osc.frequency.setValueAtTime(659, t + 0.06);
        osc.frequency.setValueAtTime(784, t + 0.12);
        osc.frequency.setValueAtTime(1047, t + 0.18);
        gain.gain.setValueAtTime(0.25 * this.sfxVolume * this.masterVolume, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        osc.connect(gain);
        osc.start(t);
        osc.stop(t + 0.3);
    },

    playGraze() {
        if (!this.enabled || !this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this._createGain(0.1);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime((2000 + Math.random() * 1000) * this._rPitch(0.3), t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
        osc.connect(gain);
        osc.start(t);
        osc.stop(t + 0.03);
    },

    playMenuSelect() {
        if (!this.enabled || !this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this._createGain(0.1);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(660, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        osc.connect(gain);
        osc.start(t);
        osc.stop(t + 0.08);
    },

    playMenuNav() {
        if (!this.enabled || !this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this._createGain(0.14);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        osc.connect(gain);
        osc.start(t);
        osc.stop(t + 0.04);
    },

    playChainMilestone(tier) {
        if (!this.enabled || !this.ctx) return;
        const t = this.ctx.currentTime;
        const freqs = { 2: [523, 659], 3: [523, 659, 784], 5: [523, 659, 784, 1047], 8: [523, 784, 1047, 1319] };
        const notes = freqs[tier] || [523, 659];
        const osc = this.ctx.createOscillator();
        const gain = this._createGain(0.1);
        osc.type = 'sine';
        notes.forEach((f, i) => osc.frequency.setValueAtTime(f, t + i * 0.06));
        gain.gain.setValueAtTime(0.2 * this.sfxVolume * this.masterVolume, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + notes.length * 0.06 + 0.1);
        osc.connect(gain);
        osc.start(t);
        osc.stop(t + notes.length * 0.06 + 0.1);
    },

    playSurgeActivate() {
        if (!this.enabled || !this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this._createGain(0.4);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, t);
        osc.frequency.exponentialRampToValueAtTime(1600, t + 0.3);
        gain.gain.setValueAtTime(0.3 * this.sfxVolume * this.masterVolume, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        osc.connect(gain);
        osc.start(t);
        osc.stop(t + 0.5);
        // Layered shimmer
        const osc2 = this.ctx.createOscillator();
        const gain2 = this._createGain(0.18);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(800, t);
        osc2.frequency.setValueAtTime(1200, t + 0.15);
        osc2.frequency.setValueAtTime(1600, t + 0.3);
        gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        osc2.connect(gain2);
        osc2.start(t);
        osc2.stop(t + 0.5);
    },

    playPlayerDeath() {
        if (!this.enabled || !this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this._createGain(0.2);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(400, t);
        osc.frequency.exponentialRampToValueAtTime(50, t + 0.5);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
        osc.connect(gain);
        osc.start(t);
        osc.stop(t + 0.6);
        this.playExplosionLarge();
    },

    playShieldHit() {
        if (!this.enabled || !this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this._createGain(0.12);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, t);
        osc.frequency.exponentialRampToValueAtTime(400, t + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        osc.connect(gain);
        osc.start(t);
        osc.stop(t + 0.12);
    },

    playAsteroidBreak() {
        if (!this.enabled || !this.ctx) return;
        const t = this.ctx.currentTime;
        const bufferSize = this.ctx.sampleRate * 0.15;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        const gain = this._createGain(0.1);
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1500, t);
        filter.frequency.exponentialRampToValueAtTime(300, t + 0.15);
        source.connect(filter);
        filter.connect(gain);
        source.start(t);
    },

    playEscortHit() {
        if (!this.enabled || !this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this._createGain(0.1);
        osc.type = 'square';
        osc.frequency.setValueAtTime(300, t);
        osc.frequency.exponentialRampToValueAtTime(100, t + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        osc.connect(gain);
        osc.start(t);
        osc.stop(t + 0.18);
    },

    // Subtle hit tick — plays when player bullet damages an enemy
    _lastHitTime: 0,
    playHitTick() {
        if (!this.enabled || !this.ctx) return;
        const t = this.ctx.currentTime;
        // Throttle to max one tick per 0.04s to avoid audio spam
        if (t - this._lastHitTime < 0.04) return;
        this._lastHitTime = t;
        const osc = this.ctx.createOscillator();
        const gain = this._createGain(0.09);
        const p = this._rPitch(0.15);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1400 * p, t);
        osc.frequency.exponentialRampToValueAtTime(800 * p, t + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        osc.connect(gain);
        osc.start(t);
        osc.stop(t + 0.04);
    },

    // Music hooks (for future)
    playMusic(trackId) { /* TODO: Load and play audio file */ },
    stopMusic() { /* TODO */ },
    crossfadeMusic(trackId) { /* TODO */ }
};


// === storage.js ===
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
        showFps: false,
        flashReduction: false,
        fireMode: 'manual',     // 'auto', 'manual'
        colorblind: false,
        graphicsQuality: 'auto',  // 'auto', 'high', 'medium', 'low'
    },
    menuOpen: false,
    selectedIndex: 0,
    items: [
        { key: 'sfxVolume', label: 'SFX VOLUME', type: 'slider', min: 0, max: 100, step: 10 },
        { key: 'musicVolume', label: 'MUSIC VOLUME', type: 'slider', min: 0, max: 100, step: 10 },
        { key: 'screenShake', label: 'SCREEN SHAKE', type: 'cycle', options: ['off', 'low', 'high'] },
        { key: 'graphicsQuality', label: 'GRAPHICS QUALITY', type: 'cycle', options: ['auto', 'high', 'medium', 'low'] },
        { key: 'particleDensity', label: 'PARTICLES', type: 'cycle', options: ['low', 'medium', 'high'] },
        { key: 'showHitbox', label: 'SHOW HITBOX', type: 'toggle' },
        { key: 'showFps', label: 'SHOW FPS', type: 'toggle' },
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
        if (Renderer.quality !== undefined && this._appliedQuality !== this.values.graphicsQuality) {
            this._appliedQuality = this.values.graphicsQuality;
            Renderer.setQuality(this.values.graphicsQuality);
        }
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


// === ui-systems.js ===
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
                else if (owned) { status = selected ? 'ENTER TO EQUIP' : 'OWNED'; statusColor = selected ? UI.CYAN : UI.DIM; }
                else {
                    const afford = NeonCredits.balance >= item.cost;
                    status = item.cost + ' NC' + (selected ? (afford ? '  •  ENTER TO BUY' : '  •  NOT ENOUGH NC') : '');
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

// === neon.js ===
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


// === ui-kit.js ===
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
        Neon.text(ctx, text, SCREEN_W / 2, y || SCREEN_H - 40, this.DIM, 15, { weight: '', halo: 0 });
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


// === particles.js ===
// ============================================================
//  PARTICLE SYSTEM
// ============================================================
const Particles = {
    particles: [],
    shockwaves: [], // Expanding ring effects
    shards: [],     // Neon outline pieces from shattered ships
    maxParticles: 3000,
    maxShards: 600,

    _density() {
        const densityScale = { low: 0.3, medium: 0.6, high: 1.0 };
        return densityScale[Settings.values.particleDensity] || 1.0;
    },

    // opts: angle/spread (radians), speed, life, size, color, decay,
    //       streak (draw as a spark line stretched along its velocity),
    //       drag (velocity kept per second, default 0.5), gravity (px/s²)
    spawn(x, y, count, opts = {}) {
        const actualCount = Math.min(Math.max(1, Math.round(count * this._density())), this.maxParticles - this.particles.length);
        if (actualCount <= 0) return;
        for (let i = 0; i < actualCount; i++) {
            const angle = opts.angle !== undefined ? opts.angle + (Math.random() - 0.5) * (opts.spread || Math.PI * 2) : Math.random() * Math.PI * 2;
            const speed = (opts.speed !== undefined ? opts.speed : 100) * (0.5 + Math.random());
            const life = opts.life || (0.3 + Math.random() * 0.5);
            const size = opts.size || (1 + Math.random() * 2);
            this._add({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life, maxLife: life, size,
                color: opts.color || '#00ffff',
                decay: opts.decay || 1,
                streak: !!opts.streak,
                pixel: !!opts.pixel,
                drag: opts.drag !== undefined ? opts.drag : 0.5,
                gravity: opts.gravity || 0,
                _pp: null,
            });
        }
    },

    _add(p) {
        if (this.particles.length >= this.maxParticles) return;
        p._hex = Renderer.colorToHex(p.color);
        if (Renderer.usePixi && Renderer.particleLayer && Renderer.fx) {
            p._pp = new PIXI.Particle({
                texture: p.streak ? Renderer.fx.spark : (p.pixel ? Renderer.fx.pixel : Renderer.fx.glow),
                x: p.x, y: p.y,
                anchorX: 0.5, anchorY: 0.5,
                tint: p._hex,
                alpha: 0.9,
            });
            this._syncPixi(p, 1);
            Renderer.particleLayer.addParticle(p._pp);
        }
        this.particles.push(p);
    },

    // A stationary glow that fades quickly: muzzle flashes, explosion cores, exhaust
    flash(x, y, radius, color, life) {
        if (Renderer.calm() && radius > 20) radius = 20;   // Flash Reduction: no big white bursts
        this._add({ x, y, vx: 0, vy: 0, life, maxLife: life, size: radius / 2, color, decay: 1, flash: true, drag: 0, gravity: 0, _pp: null });
    },

    // Bullet impact: a spray of sparks thrown back against the shot's direction
    impact(b) {
        const back = Math.atan2(-b.vy, -b.vx);
        this.spawn(b.x, b.y, 4, { angle: back, spread: 1.6, speed: 160, life: 0.18, size: 1.4, color: b.color, streak: true, drag: 0.1 });
        this.flash(b.x, b.y, 7, '#ffffff', 0.06);
    },

    // Multi-layer explosion: white flash, fireball, neon ring, spark streaks, core burst, embers
    spawnExplosion(x, y, opts = {}) {
        const style = opts.style || 'medium';
        const color  = opts.color  || '#ff8800';
        const color2 = opts.color2 || '#ffffff';
        const styles = {
            small:  { shock: 40,  core: 8,  coreSpd: 120, coreLife: 0.4, coreSize: 1.5, spark: 10, sparkSpd: 220, sparkLife: 0.35, ember: 3,  fScale: 1.2, fDur: 0.35 },
            medium: { shock: 70,  core: 14, coreSpd: 200, coreLife: 0.6, coreSize: 2.5, spark: 20, sparkSpd: 320, sparkLife: 0.45, ember: 6,  fScale: 2.2, fDur: 0.45 },
            large:  { shock: 110, core: 24, coreSpd: 280, coreLife: 0.8, coreSize: 3.5, spark: 30, sparkSpd: 420, sparkLife: 0.55, ember: 10, fScale: 3.5, fDur: 0.55 },
            mega:   { shock: 160, core: 36, coreSpd: 370, coreLife: 1.0, coreSize: 5,   spark: 48, sparkSpd: 520, sparkLife: 0.7,  ember: 16, fScale: 5.5, fDur: 0.65 },
        };
        const s = styles[style] || styles.medium;
        // Hangar explosion styles (opts.variant): burst (default), shatter, pixel, supernova
        const v = opts.variant || 'burst';
        const nova = v === 'supernova';
        this.flash(x, y, s.shock * (nova ? 1.2 : 0.7), '#ffffff', nova ? 0.16 : 0.1);
        this.spawnShockwave(x, y, color, s.shock * (nova ? 1.5 : 1), nova ? 0.55 : 0.4);
        if (style !== 'small' || nova) this.spawnShockwave(x, y, color2, s.shock * 0.6, 0.25);
        if (v === 'pixel') {
            // Pixel Dissolve: the burst breaks into squares that drift down and fade
            this.spawn(x, y, s.spark + s.core, { color, speed: s.coreSpd * 0.6, life: 0.9, size: 3, pixel: true, drag: 1.5, gravity: 40 });
            this.spawn(x, y, s.core, { color: color2, speed: s.coreSpd * 0.4, life: 0.6, size: 2, pixel: true, drag: 1.5 });
        } else {
            const sparkK = v === 'shatter' ? 0.5 : (nova ? 1.6 : 1);
            this.spawn(x, y, s.spark * sparkK, { color, speed: s.sparkSpd * (nova ? 1.3 : 1), life: s.sparkLife, size: 1.6, streak: true, drag: 0.15 });
            this.spawn(x, y, s.core,  { color: color2, speed: s.coreSpd, life: s.coreLife * 0.5, size: s.coreSize * 0.7 });
            if (v !== 'shatter') this.spawn(x, y, s.ember, { color, speed: 40, life: 1.4, size: 1.6, drag: 0.3, gravity: -25 });
        }
        Renderer.addGlow(x, y, Renderer.colorToHex(color2), s.shock * 0.9, 0.95);
        Renderer.spawnExplosionSprite(x, y, s.fScale, Renderer.colorToHex(color), s.fDur);
    },

    // Break a neon outline into spinning line segments.
    // pts: flat closed outline [x0, y0, ...] in units of `scale`, rotated by `rot`.
    shatter(x, y, pts, scale, rot, color, speed, cuts) {
        const n = pts.length / 2;
        const cos = Math.cos(rot || 0), sin = Math.sin(rot || 0);
        const pieces = Math.max(1, Math.round(this._density() * (cuts || 2)));   // cuts per edge
        const sp = speed || 1;
        for (let i = 0; i < n && this.shards.length < this.maxShards; i++) {
            const j = (i + 1) % n;
            const ax = pts[i * 2] * scale, ay = pts[i * 2 + 1] * scale;
            const bx = pts[j * 2] * scale, by = pts[j * 2 + 1] * scale;
            for (let k = 0; k < pieces; k++) {
                const t0 = k / pieces, t1 = (k + 1) / pieces;
                const x0 = ax + (bx - ax) * t0, y0 = ay + (by - ay) * t0;
                const x1 = ax + (bx - ax) * t1, y1 = ay + (by - ay) * t1;
                const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
                const wx = mx * cos - my * sin, wy = mx * sin + my * cos;
                const d = Math.sqrt(wx * wx + wy * wy) || 1;
                const out = (60 + Math.random() * 140) * sp;
                const life = 0.8 + Math.random() * 0.5;
                this.shards.push({
                    x: x + wx, y: y + wy,
                    vx: wx / d * out + (Math.random() - 0.5) * 60,
                    vy: wy / d * out + (Math.random() - 0.5) * 60,
                    a: Math.atan2(y1 - y0, x1 - x0) + (rot || 0),
                    va: (Math.random() - 0.5) * 14,
                    half: Math.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0)) / 2,
                    life, maxLife: life, color,
                });
            }
        }
    },

    // Spawn an expanding shockwave ring
    spawnShockwave(x, y, color, maxRadius, duration) {
        this.shockwaves.push({
            x, y, color: color || '#ffffff',
            radius: 0,
            maxRadius: maxRadius || 60,
            life: duration || 0.4,
            maxLife: duration || 0.4
        });
    },

    _syncPixi(p, t) {
        const pp = p._pp;
        pp.x = p.x;
        pp.y = p.y;
        if (p.streak) {
            const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
            pp.rotation = Math.atan2(p.vy, p.vx) + Math.PI / 2;
            pp.scaleX = p.size * 0.45;
            pp.scaleY = (3 + speed * 0.045) * (0.4 + t * 0.6) / 32;
            pp.alpha = t;
        } else if (p.pixel) {
            pp.scaleX = pp.scaleY = p.size * 0.5 * (0.5 + t * 0.5);
            pp.alpha = t;
        } else if (p.flash) {
            const s = (p.size * 2 * (0.6 + t * 0.4)) / 32;
            pp.scaleX = pp.scaleY = s;
            pp.alpha = t;
        } else {
            const s = (p.size * (0.3 + t * 0.7) * 2) / 32;
            pp.scaleX = pp.scaleY = s;
            pp.alpha = t * 0.9;
        }
    },

    update(dt) {
        const usePixi = Renderer.usePixi && Renderer.particleLayer;
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vx *= (1 - p.drag * dt);
            p.vy *= (1 - p.drag * dt);
            p.vy += p.gravity * dt;
            p.life -= dt * p.decay;
            if (p.life <= 0) {
                if (p._pp) { Renderer.particleLayer.removeParticle(p._pp); p._pp = null; }
                this.particles.splice(i, 1);
            } else if (usePixi && p._pp) {
                this._syncPixi(p, p.life / p.maxLife);
            }
        }
        for (let i = this.shards.length - 1; i >= 0; i--) {
            const s = this.shards[i];
            s.x += s.vx * dt;
            s.y += s.vy * dt;
            s.vx *= (1 - 1.2 * dt);
            s.vy *= (1 - 1.2 * dt);
            s.a += s.va * dt;
            s.life -= dt;
            if (s.life <= 0) this.shards.splice(i, 1);
        }
        // Update shockwaves
        for (let i = this.shockwaves.length - 1; i >= 0; i--) {
            const s = this.shockwaves[i];
            s.life -= dt;
            const t = 1 - s.life / s.maxLife; // 0→1 over lifetime
            s.radius = s.maxRadius * (1 - (1 - t) * (1 - t));   // fast start, slowing
            if (s.life <= 0) this.shockwaves.splice(i, 1);
        }
    },

    draw(ctx) {
        if (Renderer.usePixi) {
            // Pixi path: particles are rendered via particleLayer; just feed bloom
            for (const p of this.particles) {
                const t = p.life / p.maxLife;
                if (!p.streak && t > 0.4 && p.size >= 1.5) {
                    const currentSize = p.size * (0.3 + t * 0.7);
                    Renderer.addGlow(p.x, p.y, p._hex, currentSize * (p.flash ? 4 : 9), t * 0.45);
                }
            }
        } else {
            // Canvas 2D fallback path
            const prevComposite = ctx.globalCompositeOperation;
            ctx.globalCompositeOperation = 'lighter';

            for (const p of this.particles) {
                const t = p.life / p.maxLife;
                const currentSize = p.size * (0.3 + t * 0.7);

                if (p.pixel) {
                    const sz = p.size * 1.5 * (0.5 + t * 0.5);
                    ctx.globalAlpha = t;
                    ctx.fillStyle = p.color;
                    ctx.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
                    continue;
                }
                if (p.streak) {
                    const len = 3 + Math.sqrt(p.vx * p.vx + p.vy * p.vy) * 0.03;
                    const a = Math.atan2(p.vy, p.vx);
                    ctx.globalAlpha = t;
                    ctx.strokeStyle = p.color;
                    ctx.lineWidth = p.size;
                    ctx.beginPath();
                    ctx.moveTo(p.x - Math.cos(a) * len, p.y - Math.sin(a) * len);
                    ctx.lineTo(p.x + Math.cos(a) * len, p.y + Math.sin(a) * len);
                    ctx.stroke();
                    continue;
                }

                if (t > 0.4 && p.size >= 1.5) {
                    Renderer.addGlow(p.x, p.y, p._hex, currentSize * 8, t * 0.5);
                }

                ctx.globalAlpha = t * 0.2;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, currentSize * 2.5, 0, Math.PI * 2);
                ctx.fill();

                ctx.globalAlpha = t * 0.9;
                ctx.beginPath();
                ctx.arc(p.x, p.y, currentSize, 0, Math.PI * 2);
                ctx.fill();

                if (t > 0.5 && p.size >= 2) {
                    ctx.fillStyle = '#ffffff';
                    ctx.globalAlpha = (t - 0.5) * 1.2;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, currentSize * 0.35, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            ctx.globalCompositeOperation = prevComposite;
        }

        // Shattered outline pieces: coloured halo pass, then white-hot core pass
        if (this.shards.length > 0) {
            ctx.lineCap = 'round';
            for (let pass = 0; pass < 2; pass++) {
                ctx.lineWidth = pass === 0 ? 5 : 1.5;
                for (const s of this.shards) {
                    const t = s.life / s.maxLife;
                    const dx = Math.cos(s.a) * s.half, dy = Math.sin(s.a) * s.half;
                    ctx.strokeStyle = pass === 0 ? s.color : '#ffffff';
                    ctx.globalAlpha = pass === 0 ? t * 0.45 : t * 0.9;
                    ctx.beginPath();
                    ctx.moveTo(s.x - dx, s.y - dy);
                    ctx.lineTo(s.x + dx, s.y + dy);
                    ctx.stroke();
                }
            }
        }

        // Shockwave rings: faint wide halo plus a thin bright line
        for (const s of this.shockwaves) {
            const t = 1 - s.life / s.maxLife;
            Renderer.addGlow(s.x, s.y, Renderer.colorToHex(s.color), s.radius * 2.5, (1 - t) * 0.8);
            ctx.strokeStyle = s.color;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
            ctx.globalAlpha = (1 - t) * 0.3;
            ctx.lineWidth = 7 * (1 - t) + 1;
            ctx.stroke();
            ctx.globalAlpha = (1 - t) * 0.9;
            ctx.lineWidth = 1.5 * (1 - t) + 0.5;
            ctx.strokeStyle = '#ffffff';
            ctx.stroke();
        }

        ctx.globalAlpha = 1;
    },

    clear() {
        if (Renderer.usePixi && Renderer.particleLayer) {
            for (const p of this.particles) {
                if (p._pp) Renderer.particleLayer.removeParticle(p._pp);
            }
        }
        this.particles.length = 0;
        this.shockwaves.length = 0;
        this.shards.length = 0;
    }
};


// ============================================================
//  SCREEN SHAKE
// ============================================================
const ScreenShake = {
    intensity: 0,
    duration: 0,
    offsetX: 0,
    offsetY: 0,

    trigger(intensity, duration) {
        this.intensity = intensity;
        this.duration = duration;
    },

    update(dt) {
        if (this.duration > 0) {
            this.duration -= dt;
            const t = this.intensity * (this.duration > 0 ? 1 : 0);
            this.offsetX = (Math.random() - 0.5) * t * 2;
            this.offsetY = (Math.random() - 0.5) * t * 2;
        } else {
            this.offsetX = 0;
            this.offsetY = 0;
        }
    }
};

// ============================================================
//  SCREEN TRANSITIONS
// ============================================================
const Transition = {
    active: false,
    alpha: 0,
    fadeSpeed: 2.0,
    phase: 'none',  // 'fade_out', 'hold', 'fade_in', 'none'
    holdTimer: 0,
    holdDuration: 0.15,
    onMidpoint: null,  // Callback to execute at the midpoint (when fully black)

    // Start a fade-out → callback → fade-in transition
    start(callback, speed) {
        this.active = true;
        this.alpha = 0;
        this.fadeSpeed = speed || 3.5;
        this.phase = 'fade_out';
        this.onMidpoint = callback;
    },

    update(dt) {
        if (!this.active) return;

        switch (this.phase) {
            case 'fade_out':
                this.alpha += this.fadeSpeed * dt;
                if (this.alpha >= 1) {
                    this.alpha = 1;
                    this.phase = 'hold';
                    this.holdTimer = this.holdDuration;
                    // Execute midpoint callback
                    if (this.onMidpoint) {
                        this.onMidpoint();
                        this.onMidpoint = null;
                    }
                }
                break;
            case 'hold':
                this.holdTimer -= dt;
                if (this.holdTimer <= 0) {
                    this.phase = 'fade_in';
                }
                break;
            case 'fade_in':
                this.alpha -= this.fadeSpeed * dt;
                if (this.alpha <= 0) {
                    this.alpha = 0;
                    this.phase = 'none';
                    this.active = false;
                }
                break;
        }
    },

    draw(ctx) {
        if (!this.active || this.alpha < 0.02) return;
        ctx.fillStyle = `rgba(10, 6, 18, ${this.alpha})`;
        ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    }
};


// === bullets.js ===
// ============================================================
//  BULLET POOL — optimised with hand-drawn glow
// ============================================================
class BulletPool {
    // enemy: enemy bullets get a dark shadow, orb/needle shapes and a spawn pop;
    // player bullets are streaks and missiles pointing along their velocity
    constructor(maxSize = 500, enemy = false) {
        this.pool = [];
        this.maxSize = maxSize;
        this.enemy = enemy;
    }

    spawn(x, y, vx, vy, opts = {}) {
        if (this.pool.length >= this.maxSize) return null;
        const bullet = {
            x, y, vx, vy,
            prevX: x, prevY: y,
            radius: opts.radius || 3,
            color: opts.color || '#00ffff',
            damage: opts.damage || 1,
            active: true,
            type: opts.type || 'normal',
            life: opts.life || 5,
            grazed: false,
            pierce: !!opts.pierce,          // passes through enemies (hits each once)
            harmless: opts.harmless || 0,   // seconds of telegraph before it can hit
            turnRate: opts.turnRate || 5.0, // homing turn rate (rad/s)
            age: 0,
            _hex: Renderer.colorToHex(opts.color || '#00ffff'),
            _p: null,   // Pixi body Particle
            _pc: null,  // Pixi white-core Particle
            _ps: null,  // Pixi shadow Particle (enemy bullets)
        };
        if (Renderer.usePixi && Renderer.bulletLayer && Renderer.fx) this._addParticles(bullet);
        this.pool.push(bullet);
        return bullet;
    }

    _addParticles(b) {
        const fx = Renderer.fx;
        const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        let body = fx.orb, core = fx.core, ay = 0.5;
        if (this.enemy) {
            b._shape = speed >= 300 ? 'needle' : (b.radius >= 5 ? 'heavy' : 'orb');
            if (b._shape === 'needle') body = fx.needle;
            b._ps = new PIXI.Particle({ texture: fx.shadow, x: b.x, y: b.y, anchorX: 0.5, anchorY: 0.5, tint: 0xffffff, alpha: 1 });
            Renderer.bulletShadowLayer.addParticle(b._ps);
        } else {
            // Regular shots take the Hangar bullet style; missiles and laser keep their own
            const style = { plasma: 'plasma', retro: 'pixel', shards: 'shard' }[Hangar.equipped.bullet] || 'streak';
            b._shape = b.type === 'homing' ? 'missile' : (b.type === 'laser' ? 'beam' : style);
            const bodies = { missile: fx.missile, beam: fx.glow, plasma: fx.orb, pixel: fx.pixel, shard: fx.needle, streak: fx.streak };
            const cores = { missile: fx.core, beam: fx.core, plasma: fx.core, pixel: fx.pixel, shard: fx.core, streak: fx.streak };
            body = bodies[b._shape];
            core = cores[b._shape];
            ay = b._shape === 'streak' ? 0.18 : 0.5;   // streak head sits on the bullet
        }
        b._p = new PIXI.Particle({ texture: body, x: b.x, y: b.y, anchorX: 0.5, anchorY: ay, tint: b._hex, alpha: 0.9 });
        b._pc = new PIXI.Particle({ texture: core, x: b.x, y: b.y, anchorX: 0.5, anchorY: ay, tint: 0xffffff, alpha: 0.95 });
        Renderer.bulletLayer.addParticle(b._p);
        Renderer.bulletLayer.addParticle(b._pc);
        this._syncParticles(b);
    }

    _removeParticles(b) {
        if (b._p)  { Renderer.bulletLayer.removeParticle(b._p);  b._p  = null; }
        if (b._pc) { Renderer.bulletLayer.removeParticle(b._pc); b._pc = null; }
        if (b._ps) { Renderer.bulletShadowLayer.removeParticle(b._ps); b._ps = null; }
    }

    _syncParticles(b) {
        const r = b.radius;
        const rot = Math.atan2(b.vy, b.vx) + Math.PI / 2;
        const p = b._p, pc = b._pc;
        p.x = pc.x = b.x;
        p.y = pc.y = b.y;
        if (this.enemy) {
            // Pop in over the first 0.1 s so new bullets catch the eye
            const pop = b.age < 0.1 ? 1 + (1 - b.age / 0.1) * 0.8 : 1;
            const faint = b.harmless > 0;
            let k = pop;
            if (b._shape === 'heavy') k *= 1 + Math.sin(b.age * 14) * 0.1;
            if (b._shape === 'needle') {
                p.scaleX = r * 0.24 * k; p.scaleY = r * 0.11 * k;
                pc.scaleX = r * 0.06 * k; pc.scaleY = r * 0.3 * k;
                p.rotation = pc.rotation = rot;
            } else {
                p.scaleX = p.scaleY = r * 0.14 * k;
                pc.scaleX = pc.scaleY = r * 0.1 * k;
            }
            p.alpha = faint ? 0.25 : 0.95;
            pc.alpha = faint ? 0.2 : 1;
            const ps = b._ps;
            ps.x = b.x; ps.y = b.y;
            ps.scaleX = ps.scaleY = r * 0.13 * k;
            ps.alpha = faint ? 0.3 : 1;
            return;
        }
        p.rotation = pc.rotation = rot;
        if (b._shape === 'missile') {
            p.scaleX = p.scaleY = r * 0.5;
            pc.scaleX = pc.scaleY = r * 0.12;
            pc.x = b.x - b.vx * 0.012; pc.y = b.y - b.vy * 0.012;   // hot exhaust at the tail
        } else if (b._shape === 'plasma') {
            const k = 1 + Math.sin(b.age * 30) * 0.12;
            p.rotation = pc.rotation = 0;
            p.scaleX = p.scaleY = r * 0.17 * k;
            pc.scaleX = pc.scaleY = r * 0.1;
        } else if (b._shape === 'pixel') {
            p.rotation = pc.rotation = 0;
            p.scaleX = p.scaleY = r * 0.36;
            pc.scaleX = pc.scaleY = r * 0.14;
        } else if (b._shape === 'shard') {
            p.rotation = pc.rotation = b.age * 14;
            p.scaleX = r * 0.32; p.scaleY = r * 0.1;
            pc.scaleX = pc.scaleY = r * 0.06;
        } else if (b._shape === 'beam') {
            p.scaleX = r * 0.075; p.scaleY = 2.4;
            pc.scaleX = r * 0.05; pc.scaleY = 11;
            p.alpha = 0.55; pc.alpha = 0.7;
        } else {
            p.scaleX = r * 0.2; p.scaleY = r * 0.14;
            pc.scaleX = r * 0.08; pc.scaleY = r * 0.112;
        }
    }

    update(dt, homingTargets) {
        for (let i = this.pool.length - 1; i >= 0; i--) {
            const b = this.pool[i];
            b.prevX = b.x;
            b.prevY = b.y;
            if (b.harmless > 0) b.harmless = Math.max(0, b.harmless - dt);

            if (b.type === 'homing' && homingTargets && homingTargets.length > 0) {
                let nearest = null, nearDist = Infinity;
                for (const t of homingTargets) {
                    const dx = t.x - b.x, dy = t.y - b.y;
                    const d = dx * dx + dy * dy;
                    if (d < nearDist) { nearDist = d; nearest = t; }
                }
                if (nearest) {
                    const desired = Math.atan2(nearest.y - b.y, nearest.x - b.x);
                    const current = Math.atan2(b.vy, b.vx);
                    let diff = desired - current;
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    const newAngle = current + Math.sign(diff) * Math.min(Math.abs(diff), b.turnRate * dt);
                    const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
                    b.vx = Math.cos(newAngle) * speed;
                    b.vy = Math.sin(newAngle) * speed;
                }
            }

            b.x += b.vx * dt;
            b.y += b.vy * dt;
            b.life -= dt;
            b.age += dt;
            if (b.x < -20 || b.x > PLAY_W + 20 || b.y < -20 || b.y > PLAY_H + 20 || b.life <= 0 || !b.active) {
                this._removeParticles(b);
                this.pool.splice(i, 1);
            } else if (b._p) {
                this._syncParticles(b);
                // Homing missiles leave a short exhaust trail
                if (b._shape === 'missile' && (b.age * 60 | 0) % 2 === 0) {
                    Particles.flash(b.x - b.vx * 0.015, b.y - b.vy * 0.015, 3, b.color, 0.18);
                }
            }
        }
    }

    draw(ctx) {
        // In Pixi mode the particles are synced in update(); only keep addGlow for bloom source
        if (Renderer.usePixi) {
            for (const b of this.pool) {
                Renderer.addGlow(b.x, b.y, b._hex, b.radius * 7, this.enemy ? 0.4 : 0.5);
            }
            return;
        }

        // Canvas 2D fallback path
        const prevComposite = ctx.globalCompositeOperation;
        ctx.globalCompositeOperation = 'lighter';

        for (const b of this.pool) {
            if (b.type === 'laser') {
                this._drawLaser(ctx, b);
            } else if (b.type === 'homing') {
                this._drawHoming(ctx, b);
            } else {
                this._drawNormal(ctx, b);
            }
        }

        ctx.globalCompositeOperation = prevComposite;
        ctx.globalAlpha = 1;
    }

    _drawNormal(ctx, b) {
        if (b.harmless > 0) {
            // Telegraph: faint outline only
            ctx.globalAlpha = 0.35;
            ctx.strokeStyle = b.color;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
            return;
        }
        // GPU glow halo behind bullet
        Renderer.addGlow(b.x, b.y, Renderer.colorToHex(b.color), b.radius * 6, 0.5);

        // Motion trail
        const dx = b.x - b.prevX, dy = b.y - b.prevY;
        const trailLen = Math.sqrt(dx * dx + dy * dy);
        if (trailLen > 2) {
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = b.color;
            ctx.beginPath();
            ctx.moveTo(b.x + b.radius * 0.5, b.y);
            ctx.lineTo(b.prevX + b.radius * 0.3, b.prevY);
            ctx.lineTo(b.prevX - b.radius * 0.3, b.prevY);
            ctx.lineTo(b.x - b.radius * 0.5, b.y);
            ctx.closePath();
            ctx.fill();
        }

        // Soft outer glow
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius * 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Main bullet body
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        ctx.fill();

        // Bright centre
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius * 0.35, 0, Math.PI * 2);
        ctx.fill();
    }

    _drawHoming(ctx, b) {
        // GPU glow halo
        Renderer.addGlow(b.x, b.y, Renderer.colorToHex(b.color), b.radius * 8, 0.45);

        const angle = Math.atan2(b.vy, b.vx);

        // Exhaust trail
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = b.color;
        const tailX = b.x - Math.cos(angle) * 12;
        const tailY = b.y - Math.sin(angle) * 12;
        ctx.beginPath();
        ctx.moveTo(b.x + Math.cos(angle + Math.PI / 2) * b.radius * 0.6, b.y + Math.sin(angle + Math.PI / 2) * b.radius * 0.6);
        ctx.lineTo(tailX, tailY);
        ctx.lineTo(b.x + Math.cos(angle - Math.PI / 2) * b.radius * 0.6, b.y + Math.sin(angle - Math.PI / 2) * b.radius * 0.6);
        ctx.closePath();
        ctx.fill();

        // Missile body
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = b.color;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(angle + Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(0, -b.radius * 1.2);
        ctx.lineTo(b.radius * 0.6, b.radius * 0.4);
        ctx.lineTo(-b.radius * 0.6, b.radius * 0.4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Bright tip
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(b.x + Math.cos(angle) * b.radius * 0.5, b.y + Math.sin(angle) * b.radius * 0.5, 1.5, 0, Math.PI * 2);
        ctx.fill();
    }

    _drawLaser(ctx, b) {
        // GPU glow halo (elongated by using wider size)
        Renderer.addGlow(b.x, b.y, Renderer.colorToHex(b.color), b.radius * 8, 0.5);

        const len = Math.min(35, Math.abs(b.vy) * 0.035);

        // Wide outer glow
        ctx.globalAlpha = 0.15;
        ctx.fillStyle = b.color;
        ctx.fillRect(b.x - b.radius * 2, b.y - len, b.radius * 4, len * 2);

        // Mid beam
        ctx.globalAlpha = 0.6;
        ctx.fillRect(b.x - b.radius, b.y - len * 0.8, b.radius * 2, len * 1.6);

        // Core beam
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(b.x - b.radius * 0.35, b.y - len * 0.6, b.radius * 0.7, len * 1.2);
    }

    clear() {
        if (Renderer.usePixi && Renderer.bulletLayer) {
            for (const b of this.pool) this._removeParticles(b);
        }
        this.pool.length = 0;
    }
}


// === scoring.js ===
// ============================================================
//  SCORING SYSTEM
// ============================================================
const Scoring = {
    score: 0,
    chain: 0,
    chainTimer: 0,
    chainTimerMax: 3.0,
    maxChain: 0,
    multiplier: 1,
    surgeCharge: 0,
    surgeMax: 100,
    surgeActive: false,
    surgeDuration: 0,
    surgeMaxDuration: 5.0,
    grazeCount: 0,
    neonCredits: 0,

    // Perfect run tracking
    deathCount: 0,
    bombCount: 0,
    isPerfect: true,  // No deaths AND no bombs this level

    // Graze thresholds for bonus popups (per level)
    grazeThresholds: [25, 50, 100, 200, 500],
    nextGrazeThreshold: 0,

    // Per-level counters (end-of-level bonuses and level records use these)
    levelStartScore: 0,
    levelGrazes: 0,
    levelMaxChain: 0,

    // Extra lives at score milestones (normal-difficulty points; scaled by the score multiplier)
    extendThresholds: [300000, 1000000, 2000000, 4000000],
    nextExtend: 0,

    // Floating popup text system
    popups: [],

    spawnPopup(text, color, size) {
        this.popups.push({
            text,
            color: color || '#ffff00',
            size: size || 24,
            x: PLAY_W / 2,
            y: PLAY_H * 0.35,
            life: 2.0,
            maxLife: 2.0,
            vy: -40
        });
    },

    // Point-blank kill bonus
    // distance: pixels between player and enemy at time of kill
    addKill(basePoints, distance) {
        const prevMultiplier = this.multiplier;
        this.chain++;
        this.chainTimer = this.chainTimerMax / GameConfig.chainTimerSpeed;
        if (this.chain > this.maxChain) this.maxChain = this.chain;
        if (this.chain > this.levelMaxChain) this.levelMaxChain = this.chain;
        this._updateMultiplier();

        // Point-blank bonus: 3x within 60px, 2x within 120px, 1.5x within 200px
        let pointBlankMult = 1;
        let pointBlankLabel = '';
        if (distance !== undefined && distance < 60) {
            pointBlankMult = 3; pointBlankLabel = 'POINT BLANK! 3x';
        } else if (distance !== undefined && distance < 120) {
            pointBlankMult = 2; pointBlankLabel = 'CLOSE KILL! 2x';
        } else if (distance !== undefined && distance < 200) {
            pointBlankMult = 1.5; pointBlankLabel = 'NEAR KILL! 1.5x';
        }

        let pts = basePoints * this.multiplier * pointBlankMult * GameConfig.scoreMultiplier;
        if (this.surgeActive) pts *= 3;
        this.score += Math.floor(pts);

        // Each kill contributes a little surge charge; grazing (5 each) is the main source
        this.surgeCharge = Math.min(this.surgeMax, this.surgeCharge + 1.5);

        // Point-blank popup (only for 2x+)
        if (pointBlankMult >= 2) {
            this.spawnPopup(pointBlankLabel, pointBlankMult >= 3 ? '#ff00ff' : '#ffaa00', pointBlankMult >= 3 ? 22 : 16);
        }

        // Chain milestone SFX + popup
        if (this.multiplier > prevMultiplier) {
            Audio.playChainMilestone(this.multiplier);
            const milestoneColors = { 2: '#ffaa00', 3: '#ff8800', 5: '#ff4400', 8: '#ff00ff' };
            this.spawnPopup(
                this.chain + ' HITS! ' + this.multiplier + 'x',
                milestoneColors[this.multiplier] || '#ffff00',
                this.multiplier >= 5 ? 30 : 24
            );
        }
    },

    addGraze() {
        this.grazeCount++;
        this.levelGrazes++;
        const reward = 5 * (GameConfig.graze.rewardMultiplier || 1);
        this.surgeCharge = Math.min(this.surgeMax, this.surgeCharge + reward);
        this.score += Math.floor(10 * GameConfig.scoreMultiplier);

        // Graze threshold milestones
        if (this.nextGrazeThreshold < this.grazeThresholds.length &&
            this.levelGrazes >= this.grazeThresholds[this.nextGrazeThreshold]) {
            const count = this.grazeThresholds[this.nextGrazeThreshold];
            const bonusScore = count * 10;
            this.score += Math.floor(bonusScore * GameConfig.scoreMultiplier);
            this.spawnPopup(count + ' GRAZES! +' + bonusScore, '#00ffff', 20);
            this.nextGrazeThreshold++;
        }
    },

    // A player shot connected: keeps the chain timer topped up while you keep
    // hitting (DoDonPachi-style), so skilled players can bridge wave gaps on tough enemies
    onHit() {
        if (this.chain > 0 && this.chainTimer > 0) {
            const max = this.chainTimerMax / GameConfig.chainTimerSpeed;
            this.chainTimer = Math.min(max, this.chainTimer + 0.08);
        }
    },

    // Start-of-level bookkeeping (level score, per-level bonus counters, milestones)
    beginLevel() {
        this.levelStartScore = this.score;
        this.levelGrazes = 0;
        this.levelMaxChain = 0;
        this.levelDeaths = 0;
        this.levelBombs = 0;
        this.nextGrazeThreshold = 0;
    },

    get levelScore() {
        return this.score - this.levelStartScore;
    },

    _checkExtends() {
        const mult = GameConfig.scoreMultiplier || 1;
        while (this.nextExtend < this.extendThresholds.length &&
               this.score >= this.extendThresholds[this.nextExtend] * mult) {
            this.nextExtend++;
            if (Player.lives < 9) {
                Player.lives++;
                this.spawnPopup('EXTEND! 1UP', '#00ff88', 28);
                Audio.playPowerUp();
            }
        }
    },

    recordDeath() {
        this.deathCount++;
        this.levelDeaths++;
        this.isPerfect = false;
    },

    recordBomb() {
        this.bombCount++;
        this.levelBombs++;
        this.isPerfect = false;
    },

    activateSurge() {
        if (this.surgeCharge >= this.surgeMax && !this.surgeActive) {
            this.surgeActive = true;
            this.surgeDuration = this.surgeMaxDuration;
            this.surgeCharge = 0;
            this.spawnPopup('NEON SURGE!', '#ffffff', 32);
            return true;
        }
        return false;
    },

    _updateMultiplier() {
        // Tiers sized so 5x is reachable with good play and 8x is an expert goal
        // (the old 50/100 thresholds were never reached in simulated campaigns)
        if (this.chain >= 60) this.multiplier = 8;
        else if (this.chain >= 35) this.multiplier = 5;
        else if (this.chain >= 20) this.multiplier = 3;
        else if (this.chain >= 10) this.multiplier = 2;
        else this.multiplier = 1;
    },

    update(dt) {
        this._checkExtends();
        if (this.chainTimer > 0) {
            this.chainTimer -= dt;
            if (this.chainTimer <= 0) {
                this.chain = 0;
                this.multiplier = 1;
            }
        }
        if (this.surgeActive) {
            this.surgeDuration -= dt;
            if (this.surgeDuration <= 0) {
                this.surgeActive = false;
            }
        }
        // Update popups
        for (let i = this.popups.length - 1; i >= 0; i--) {
            const p = this.popups[i];
            p.y += p.vy * dt;
            p.life -= dt;
            if (p.life <= 0) this.popups.splice(i, 1);
        }
    },

    drawPopups(ctx) {
        for (const p of this.popups) {
            const alpha = Math.min(1, p.life / (p.maxLife * 0.3)); // Fade out in last 30%
            const scale = 1 + (1 - p.life / p.maxLife) * 0.3; // Grow slightly over time
            ctx.globalAlpha = alpha;
            Neon.text(ctx, p.text, p.x, p.y, p.color, Math.round(p.size * scale));
        }
        ctx.globalAlpha = 1;
    },

    breakChain() {
        if (this.multiplier >= 2) {
            this.spawnPopup('CHAIN BROKEN', '#ff4444', 20);
        }
        this.chain = 0;
        this.chainTimer = 0;
        this.multiplier = 1;
    },

    // Soft reset — between campaign levels. Keep score + maxChain, clear per-level state.
    softReset() {
        this.chain = 0;
        this.chainTimer = 0;
        this.multiplier = 1;
        this.surgeCharge = 0;
        this.surgeActive = false;
        this.surgeDuration = 0;
        this.nextGrazeThreshold = 0;
        // Keep: score, maxChain, grazeCount, deathCount, bombCount, isPerfect, nextExtend
        this.popups = [];
        this.beginLevel();
    },

    reset() {
        this.score = 0;
        this.chain = 0;
        this.chainTimer = 0;
        this.maxChain = 0;
        this.multiplier = 1;
        this.surgeCharge = 0;
        this.surgeActive = false;
        this.surgeDuration = 0;
        this.grazeCount = 0;
        this.deathCount = 0;
        this.bombCount = 0;
        this.isPerfect = true;
        this.nextGrazeThreshold = 0;
        this.nextExtend = 0;
        this.popups = [];
        this.beginLevel();
    }
};


// === enemies.js ===
// ============================================================
//  ENEMY SYSTEM
// ============================================================
const Enemies = {
    list: [],
    enemyBullets: new BulletPool(800, true),

    // Enemy type definitions (data-driven)
    types: {
        scout_drone: {
            hp: 1, speed: 150, radius: 12, score: 100, color: '#ff8c00', accent: '#ffcc44', bulletColor: '#ff6600',
            fireRate: 2.0, bulletSpeed: 180, dropChance: 0.08
        },
        gunship: {
            hp: 3, speed: 80, radius: 18, score: 300, color: '#ff6600', accent: '#ffaa00', bulletColor: '#ff3300',
            fireRate: 1.5, bulletSpeed: 170, dropChance: 0.18
        },
        missile_turret: {
            hp: 5, speed: 30, radius: 22, score: 500, color: '#ff4400', accent: '#ff8844', bulletColor: '#ff2200',
            fireRate: 2.8, bulletSpeed: 130, dropChance: 0.25, cancelBullets: true
        },
        phase_shifter: {
            hp: 4, speed: 100, radius: 15, score: 600, color: '#ff00ff', accent: '#ff88ff', bulletColor: '#cc00ff',
            fireRate: 3.0, bulletSpeed: 160, dropChance: 0.20, cancelBullets: true
        },
        shielded_cruiser: {
            hp: 8, shieldHp: 3, speed: 40, radius: 28, score: 1000, color: '#8b00ff', accent: '#aa44ff', bulletColor: '#6600cc',
            fireRate: 2.5, bulletSpeed: 140, dropChance: 0.5, cancelBullets: true
        },
        bomber: {
            hp: 6, speed: 50, radius: 24, score: 700, color: '#ff4400', accent: '#ff6622', bulletColor: '#ff2200',
            fireRate: 2.5, bulletSpeed: 110, dropChance: 0.30, cancelBullets: true
        },
        sniper: {
            hp: 2, speed: 20, radius: 14, score: 400, color: '#ffff00', accent: '#ffffaa', bulletColor: '#ffcc00',
            fireRate: 3.5, bulletSpeed: 500, dropChance: 0.15
        },
        carrier: {
            hp: 10, speed: 25, radius: 30, score: 1200, color: '#cc6600', accent: '#ff8800', bulletColor: '#ff6600',
            fireRate: 2.0, bulletSpeed: 140, dropChance: 0.6, cancelBullets: true
        },
        shield_wall: {
            hp: 3, speed: 60, radius: 16, score: 250, color: '#4488ff', accent: '#66aaff', bulletColor: '#2266dd',
            fireRate: 2.0, bulletSpeed: 160, dropChance: 0.10
        }
    },

    // Enemies whose patterns scale bullet COUNT with density; all others scale fire frequency
    COUNT_SCALED: { phase_shifter: true, bomber: true },
    // Seconds an enemy on these paths stays before retreating (genre convention: nothing waits forever)
    LIFETIMES: { hover: 14, strafe: 16 },
    CARRIER_MAX_LAUNCHES: 6,
    NO_FIRE_RADIUS: 110,          // no point-blank shots at the player
    FIRE_CEILING: PLAY_H * 0.75,  // enemies below this line stop firing

    spawn(type, x, y, movePath) {
        const def = this.types[type];
        if (!def) return;
        const hpScale = GameConfig._levelHpScale || 1;
        const spdScale = GameConfig._levelSpeedScale || 1;
        const rateScale = GameConfig._levelFireRateScale || 1;
        const density = GameConfig.bulletDensity || 1;
        const densityRate = this.COUNT_SCALED[type] ? 1 : density;
        const fireRate = def.fireRate / (rateScale * densityRate);
        // Spawned beside the play area (e.g. "sides" formation): fly in before following the path
        const entryX = x < 0 ? 70 : x > PLAY_W ? PLAY_W - 70 : null;
        const enemy = {
            type, x, y,
            hp: Math.ceil(def.hp * hpScale),
            maxHp: Math.ceil(def.hp * hpScale),
            shieldHp: Math.ceil((def.shieldHp || 0) * hpScale),
            maxShieldHp: Math.ceil((def.shieldHp || 0) * hpScale),
            speed: def.speed,
            radius: def.radius,
            score: Math.floor(def.score * hpScale),
            color: def.color,
            accent: def.accent || def.color,
            bulletColor: def.bulletColor || '#ff1493',
            fireRate,
            fireTimer: fireRate * Math.random(),
            bulletSpeed: def.bulletSpeed * spdScale,
            dropChance: def.dropChance,
            cancelBullets: def.cancelBullets || false,
            movePath: movePath || 'straight_down',
            moveTimer: 0,
            entryX,
            retreating: false,
            launches: 0,
            active: true,
            flashTimer: 0,
            // Phase shifter specific
            teleportTimer: type === 'phase_shifter' ? 3.0 : 0,
            warpTimer: 0,
            warpTo: null,
            // Shielded cruiser specific
            shieldAngle: 0,
            // Sniper specific
            aimAngle: Math.PI / 2,
            // Visual rotation
            rotation: 0,
            prevX: x,
            prevY: y
        };
        this.list.push(enemy);
        return enemy;
    },

    update(dt, playerX, playerY) {
        for (let i = this.list.length - 1; i >= 0; i--) {
            const e = this.list[i];
            e.moveTimer += dt;
            e.flashTimer = Math.max(0, e.flashTimer - dt);

            // Store pre-move position
            const oldX = e.x, oldY = e.y;

            // Movement based on path type
            this._updateMovement(e, dt);

            // Update visual rotation based on movement direction
            const dmx = e.x - oldX;
            // Types that bank when moving horizontally
            const rotTypes = { scout_drone: 0.8, gunship: 0.6, bomber: 0.4, shielded_cruiser: 0.25, carrier: 0.15 };
            const rotStrength = rotTypes[e.type];
            if (rotStrength !== undefined) {
                // Simple banking: horizontal velocity → tilt angle, clamped
                const targetRot = Math.max(-0.4, Math.min(0.4, dmx * 0.02)) * rotStrength;
                // Smooth interpolation
                e.rotation += (targetRot - e.rotation) * Math.min(1, dt * 6);
            } else {
                e.rotation *= (1 - dt * 4);
            }
            e.prevX = oldX;
            e.prevY = oldY;

            // Firing — only on screen, above the fire ceiling, and not point-blank on the player
            e.fireTimer -= dt;
            if (e.fireTimer <= 0) {
                const onScreen = e.x > 0 && e.x < PLAY_W && e.y > 0 && e.y < this.FIRE_CEILING;
                const pdx = playerX - e.x, pdy = playerY - e.y;
                const tooClose = pdx * pdx + pdy * pdy < this.NO_FIRE_RADIUS * this.NO_FIRE_RADIUS;
                if (onScreen && !tooClose && e.warpTimer <= 0 && !e.retreating) {
                    this._firePattern(e, playerX, playerY);
                }
                e.fireTimer = e.fireRate;
            }

            // Phase shifter teleport — telegraphed: a marker appears at the destination first
            if (e.type === 'phase_shifter' && !e.retreating) {
                if (e.warpTimer > 0) {
                    e.warpTimer -= dt;
                    if (e.warpTimer <= 0) {
                        e.x = e.warpTo.x;
                        e.y = e.warpTo.y;
                        e.fireTimer = Math.max(e.fireTimer, 0.8); // no instant shot after arriving
                        Particles.spawn(e.x, e.y, 8, { color: e.bulletColor, speed: 80, life: 0.3 });
                    }
                } else {
                    e.teleportTimer -= dt;
                    if (e.teleportTimer <= 0) {
                        e.warpTo = { x: 40 + Math.random() * (PLAY_W - 80), y: 40 + Math.random() * (PLAY_H * 0.4) };
                        e.warpTimer = 0.45;
                        e.teleportTimer = 2.5 + Math.random();
                    }
                }
            }

            // Sniper aim tracking — locks 0.3 s before the shot so the laser sight is honest
            if (e.type === 'sniper' && e.fireTimer > 0.3) {
                e.aimAngle = Math.atan2(playerY - e.y, playerX - e.x);
            }

            // Shielded cruiser shield rotation
            if (e.type === 'shielded_cruiser') {
                e.shieldAngle += dt * 1.5;
            }

            // Remove if off screen (retreating enemies leave through the top)
            if (e.y > PLAY_H + 60 || e.x < -60 || e.x > PLAY_W + 60 || (e.retreating && e.y < -60)) {
                this.list.splice(i, 1);
            }
        }

        // Enemy homing bullets track the player
        this.enemyBullets.update(dt, Player.alive ? [{ x: playerX, y: playerY }] : null);
    },

    // Every remaining enemy leaves the screen (used when the boss arrives)
    retreatAll() {
        for (const e of this.list) e.retreating = true;
    },

    _updateMovement(e, dt) {
        // Mid-bosses have their own movement (midbosses.js) until they retreat
        if (e.midboss && !e.retreating) {
            MidBoss.updateMovement(e, dt, Player.x);
            return;
        }
        // Fly in from beside the play area first
        if (e.entryX !== null) {
            const step = Math.max(80, e.speed) * 1.5 * dt;
            e.x += Math.max(-step, Math.min(step, e.entryX - e.x));
            if (Math.abs(e.x - e.entryX) < 1) { e.entryX = null; e.moveTimer = 0; }
            return;
        }
        // Retreat: leave upwards after the path's lifetime (or when told to)
        const lifetime = this.LIFETIMES[e.movePath];
        if (lifetime && e.moveTimer > lifetime) e.retreating = true;
        if (e.retreating) {
            e.y -= Math.max(90, e.speed * 1.5) * dt;
            return;
        }
        switch (e.movePath) {
            case 'straight_down':
                e.y += e.speed * dt;
                break;
            case 'sweep_left':
                e.y += e.speed * 0.5 * dt;
                e.x -= e.speed * 0.7 * dt;
                break;
            case 'sweep_right':
                e.y += e.speed * 0.5 * dt;
                e.x += e.speed * 0.7 * dt;
                break;
            case 'zigzag':
                e.y += e.speed * 0.6 * dt;
                e.x += Math.sin(e.moveTimer * 3) * e.speed * 0.8 * dt;
                break;
            case 'strafe':
                e.y += e.speed * 0.2 * dt;
                e.x += Math.sin(e.moveTimer * 2) * e.speed * dt;
                break;
            case 'hover':
                e.y += Math.max(0, (100 - e.y) * 0.5) * dt;
                e.x += Math.sin(e.moveTimer * 1.5) * e.speed * 0.3 * dt;
                break;
        }
    },

    _firePattern(e, px, py) {
        const density = GameConfig.bulletDensity;
        const dx = px - e.x;
        const dy = py - e.y;
        const angle = Math.atan2(dy, dx);
        const bs = e.bulletSpeed;

        if (e.midboss) {
            MidBoss.fire(e, px, py);
            return;
        }
        switch (e.type) {
            case 'scout_drone':
                // Fires from sensor at centre
                this.enemyBullets.spawn(e.x, e.y + e.radius * 0.3,
                    Math.cos(angle) * bs, Math.sin(angle) * bs,
                    { color: e.bulletColor, radius: 3 });
                break;
            case 'gunship':
                // Fires from under-nose cannon
                for (let j = -1; j <= 1; j++) {
                    const a = angle + j * 0.15;
                    this.enemyBullets.spawn(e.x, e.y + e.radius * 0.9,
                        Math.cos(a) * bs, Math.sin(a) * bs,
                        { color: e.bulletColor, radius: 3 });
                }
                break;
            case 'missile_turret':
                // Slow homing missile from the barrel tip — gentle turn rate, easy to out-turn
                this.enemyBullets.spawn(e.x, e.y + e.radius * 0.85,
                    Math.cos(angle) * bs * 0.8, Math.sin(angle) * bs * 0.8,
                    { color: e.bulletColor, radius: 4, life: 4, type: 'homing', turnRate: 1.0 });
                break;
            case 'phase_shifter': {
                // Radial burst from energy core (centre is fine)
                const count = Math.floor(8 * density);
                for (let j = 0; j < count; j++) {
                    const a = (Math.PI * 2 / count) * j;
                    this.enemyBullets.spawn(e.x, e.y,
                        Math.cos(a) * bs, Math.sin(a) * bs,
                        { color: e.bulletColor, radius: 3 });
                }
                break;
            }
            case 'shielded_cruiser':
                // Fires from side weapon bays
                for (let j = -1; j <= 1; j += 2) {
                    const a = angle + j * 0.3;
                    this.enemyBullets.spawn(e.x + j * e.radius * 0.7, e.y,
                        Math.cos(a) * bs, Math.sin(a) * bs,
                        { color: e.bulletColor, radius: 4 });
                }
                break;
            case 'bomber': {
                // Drops from bomb bay doors
                const bombCount = Math.floor(3 * density);
                for (let j = 0; j < bombCount; j++) {
                    const bx = e.x + (j - (bombCount - 1) / 2) * 15;
                    this.enemyBullets.spawn(bx, e.y + e.radius * 0.55, (Math.random() - 0.5) * 30, bs * 0.6,
                        { color: e.bulletColor, radius: 5, life: 1.5 });
                }
                // Ring from centre
                const ringCount = Math.floor(10 * density);
                for (let j = 0; j < ringCount; j++) {
                    const a = (Math.PI * 2 / ringCount) * j;
                    this.enemyBullets.spawn(e.x, e.y + e.radius * 0.3,
                        Math.cos(a) * bs * 0.5, Math.sin(a) * bs * 0.5,
                        { color: e.accent, radius: 2.5, life: 2 });
                }
                break;
            }
            case 'sniper': {
                // Fires from barrel end along the locked aim (matches the laser sight)
                this.enemyBullets.spawn(e.x, e.y + e.radius * 0.9,
                    Math.cos(e.aimAngle) * bs, Math.sin(e.aimAngle) * bs,
                    { color: e.bulletColor, radius: 4, life: 3 });
                break;
            }
            case 'carrier':
                // Drones launch from hangar bay
                if (Enemies.list.length < 30 && e.launches < this.CARRIER_MAX_LAUNCHES) {
                    e.launches++;
                    Enemies.spawn('scout_drone', e.x + (Math.random() - 0.5) * 15, e.y + e.radius * 0.6, 'straight_down');
                }
                break;
            case 'shield_wall':
                // Centre shot
                this.enemyBullets.spawn(e.x, e.y + e.radius * 0.2,
                    Math.cos(angle) * bs, Math.sin(angle) * bs,
                    { color: e.bulletColor, radius: 3 });
                break;
        }
    },

    hit(enemy, damage, playerDist) {
        Audio.playHitTick();
        if (enemy.shieldHp > 0) {
            enemy.shieldHp -= damage;
            enemy.flashTimer = 0.08;
            Particles.spawn(enemy.x, enemy.y, 3, { color: enemy.bulletColor, speed: 60, life: 0.15, size: 1.5 });
            if (enemy.shieldHp <= 0) {
                Particles.spawn(enemy.x, enemy.y, 12, { color: enemy.bulletColor, speed: 120, life: 0.4 });
            }
            return false; // not dead
        }
        enemy.hp -= damage;
        enemy.flashTimer = 0.08;
        // GPU glow flash (impact sparks are spawned by the bullet: Particles.impact)
        Renderer.addGlow(enemy.x, enemy.y, 0xffffff, enemy.radius * 3, 0.7);
        if (enemy.hp <= 0) {
            this._onDeath(enemy, playerDist);
            return true;
        }
        return false;
    },

    _onDeath(enemy, playerDist) {
        enemy.active = false;
        const isBig = enemy.radius > 20;
        const explColor = Hangar.explosionColor;
        const accent = enemy.accent || explColor;

        // Layered explosion: use spawnExplosion for the main burst
        const variant = Hangar.equipped.explosion;
        Particles.spawnExplosion(enemy.x, enemy.y, {
            style: isBig ? 'large' : 'medium',
            color: explColor,
            color2: '#ffffff',
            variant,
        });
        // Extra accent-coloured sparks for visual variety
        Particles.spawn(enemy.x, enemy.y, isBig ? 12 : 6, { color: accent, speed: 180, life: 0.7, size: 3 });
        // The ship's neon outline breaks apart
        const outline = MidBoss.isType(enemy.type) ? MidBoss.outline(enemy) : this.outline(enemy);
        if (outline) {
            const heavy = variant === 'shatter';   // the Shatter style throws more, faster pieces
            Particles.shatter(enemy.x, enemy.y, outline.pts, outline.scale, enemy.rotation || 0, enemy.color,
                (isBig ? 1.3 : 1) * (heavy ? 1.7 : 1), heavy ? 3 : 2);
        }
        if (isBig) ScreenShake.trigger(6, 0.25);

        // Bullet cancel
        if (enemy.cancelBullets) {
            for (const b of this.enemyBullets.pool) {
                const dx = b.x - enemy.x;
                const dy = b.y - enemy.y;
                if (dx * dx + dy * dy < 120 * 120) {
                    b.active = false;
                    // Spawn score pickup particle
                    Particles.spawn(b.x, b.y, 1, { color: '#00ffff', speed: 30, life: 0.8, size: 2 });
                    Scoring.score += Math.floor(250 * Scoring.multiplier * GameConfig.scoreMultiplier);
                }
            }
        }

        if (enemy.midboss) MidBoss.onDefeat(enemy);
        Scoring.addKill(enemy.score, playerDist);
        Achievements.onEnemyKill();
        Audio.playExplosionSmall();

        // Power-up drop
        if (Math.random() < enemy.dropChance) {
            PowerUps.spawn(enemy.x, enemy.y);
        }

        // Remove from list
        const idx = this.list.indexOf(enemy);
        if (idx >= 0) this.list.splice(idx, 1);
    },

    // ------------------------------------------------------------
    //  Neon style art (see neon.js). Each entry draws one enemy type
    //  around its centre: the static body comes from the sprite atlas,
    //  animated parts are drawn live on top. Outlines are in units of r.
    // ------------------------------------------------------------
    _NEON_SHAPES: {
        scout: Neon.mirror([0, -0.7, 0.32, -0.25, 0.28, 0.3, 0, 0.55]),
        gunship: Neon.mirror([0, -0.8, 0.4, -0.3, 0.9, 0, 0.85, 0.2, 0.4, 0.1, 0.35, 0.6, 0.6, 0.8, 0.3, 0.7]),
        gunshipCanopy: Neon.mirror([0, -0.62, 0.14, -0.42, 0.12, -0.25, 0, -0.2]),
        gunshipBarrel: [-0.07, 0.62, 0.07, 0.62, 0.07, 0.98, -0.07, 0.98],
        turretBase: [-0.8, -0.4, 0.8, -0.4, 0.6, 0.4, -0.6, 0.4],
        turretBracket: [0.5, -0.15, 0.72, -0.15, 0.72, 0.15, 0.5, 0.15],
        turretBarrel: [-0.1, 0.2, 0.1, 0.2, 0.1, 0.76, -0.1, 0.76],
        turretTip: [-0.18, 0.74, 0.18, 0.74, 0.18, 0.88, -0.18, 0.88],
        star: (() => {
            const pts = [];
            for (let j = 0; j < 10; j++) {
                const a = (Math.PI * 2 / 10) * j - Math.PI / 2;
                const k = j % 2 === 0 ? 1 : 0.45;
                pts.push(Math.cos(a) * k, Math.sin(a) * k);
            }
            return pts;
        })(),
        cruiser: Neon.mirror([0, -0.7, 0.5, -0.5, 0.8, -0.1, 0.7, 0.5, 0.3, 0.7]),
        cruiserBridge: Neon.mirror([0, -0.44, 0.2, -0.34, 0.2, -0.24, 0, -0.18]),
        bomber: Neon.mirror([0, -0.5, 0.4, -0.4, 0.9, -0.1, 0.8, 0.2, 0.4, 0.3, 0.35, 0.6]),
        sniperBody: [-0.5, -0.3, 0.5, -0.3, 0.4, 0.3, -0.4, 0.3],
        sniperVane: [0.45, -0.2, 0.72, -0.4, 0.66, 0.08, 0.42, 0.2],
        sniperBarrel: [-0.08, 0.25, 0.08, 0.25, 0.08, 1.0, -0.08, 1.0],
        carrier: Neon.mirror([0, -0.6, 0.6, -0.4, 0.9, 0, 0.8, 0.5, 0.4, 0.7]),
        carrierBay: [-0.25, 0.3, 0.25, 0.3, 0.2, 0.66, -0.2, 0.66],
        wall: [-1, -0.3, 1, -0.3, 1, 0.3, -1, 0.3],
    },

    // Outline used when the enemy shatters: flat points in units of the radius
    _OUTLINES: {
        scout_drone: 'scout', gunship: 'gunship', missile_turret: 'turretBase', phase_shifter: 'star',
        shielded_cruiser: 'cruiser', bomber: 'bomber', sniper: 'sniperBody', carrier: 'carrier', shield_wall: 'wall',
    },
    outline(e) {
        const key = this._OUTLINES[e.type];
        return key ? { pts: this._NEON_SHAPES[key], scale: e.radius } : null;
    },

    _neonGlow(e, size, flash, alpha) {
        if (e._glowHex === undefined) e._glowHex = Renderer.colorToHex(e.color);
        Renderer.addGlow(e.x, e.y, e._glowHex, size, flash ? 0.6 : (alpha || 0.22));
    },

    // Mirror a right-side detail line to the left (x -> -x) and draw both
    _neonPair(ctx, pts, r, color, alpha, width) {
        Neon.detail(ctx, pts, r, color, alpha, width);
        const m = pts.slice();
        for (let i = 0; i < m.length; i += 2) m[i] = -m[i];
        Neon.detail(ctx, m, r, color, alpha, width);
    },

    // Static bodies, baked into the atlas once per colour and flash state
    _bake: {
        scout(c, e, r, flash) {
            const S = Enemies._NEON_SHAPES;
            Enemies._neonPair(c, [0.3, -0.2, 0.8, -0.35], r, e.accent, 0.8, 1.2);
            for (let s = -1; s <= 1; s += 2) {
                const rx = s * r * 0.8, ry = -r * 0.35, rr = r * 0.34;
                c.fillStyle = e.accent;
                c.globalAlpha = 0.08;
                c.beginPath(); c.arc(rx, ry, rr, 0, Math.PI * 2); c.fill();
                c.globalAlpha = 1;
                Neon.ring(c, rx, ry, rr, e.accent, 0.6, flash);
            }
            Neon.shape(c, S.scout, r, e.color, 1.1, flash, 0.3);
            Neon.detail(c, [-0.18, 0.2, 0, 0.32, 0.18, 0.2], r, e.accent, 0.6, 0.8);
        },
        gunship(c, e, r, flash) {
            const S = Enemies._NEON_SHAPES;
            Neon.shape(c, S.gunshipBarrel, r, e.accent, 0.8, flash, 0.4);
            Neon.shape(c, S.gunship, r, e.color, 1.2, flash, 0.24);
            Enemies._neonPair(c, [0.42, 0.02, 0.84, 0.1], r, e.accent, 0.55, 1);
            Neon.detail(c, [0, -0.12, 0, 0.55], r, e.accent, 0.4, 1);
            Neon.detail(c, [-0.3, 0.62, 0.3, 0.62], r, e.accent, 0.4, 1);
            Neon.shape(c, S.gunshipCanopy, r, e.accent, 0.7, flash, 0.4);
        },
        missile_turret(c, e, r, flash) {
            const S = Enemies._NEON_SHAPES;
            Neon.shape(c, S.turretBarrel, r, e.accent, 0.9, flash, 0.35);
            Neon.shape(c, S.turretTip, r, e.accent, 0.9, flash, 0.35);
            Neon.shape(c, S.turretBase, r, e.color, 1.3, flash, 0.24);
            const m = S.turretBracket.slice();
            for (let i = 0; i < m.length; i += 2) m[i] = -m[i];
            Neon.shape(c, S.turretBracket, r, e.accent, 0.8, flash, 0.3);
            Neon.shape(c, m, r, e.accent, 0.8, flash, 0.3);
            Neon.detail(c, [-0.62, 0.22, 0.62, 0.22], r, e.accent, 0.4, 1);
            // Dome
            c.beginPath();
            c.arc(0, -r * 0.1, r * 0.35, Math.PI, 0);
            c.closePath();
            c.fillStyle = flash ? '#ffffff' : e.color;
            c.globalAlpha = 0.3;
            c.fill();
            c.globalAlpha = 1;
            Neon.stroke(c, e.color, 1, flash);
        },
        phase_shifter(c, e, r, flash) {
            const S = Enemies._NEON_SHAPES;
            Neon.shape(c, S.star, r, e.color, 1.1, flash, 0.25);
            for (let j = 0; j < 10; j += 2) {
                Neon.detail(c, [0, 0, S.star[j * 2], S.star[j * 2 + 1]], r, e.accent, 0.4, 0.8);
            }
            c.beginPath();
            for (let j = 1; j < 10; j += 2) c.lineTo(S.star[j * 2] * r, S.star[j * 2 + 1] * r);
            c.closePath();
            c.strokeStyle = e.accent; c.globalAlpha = 0.5; c.lineWidth = 0.8; c.stroke();
            c.globalAlpha = 1;
        },
        shielded_cruiser(c, e, r, flash) {
            const S = Enemies._NEON_SHAPES;
            Neon.shape(c, S.cruiser, r, e.color, 1.4, flash, 0.22);
            Neon.path(c, S.cruiser, r * 0.62, true);
            c.strokeStyle = e.accent; c.globalAlpha = 0.4; c.lineWidth = 1; c.stroke();
            c.globalAlpha = 1;
            Neon.detail(c, [-0.62, 0, 0.62, 0], r, e.accent, 0.5, 1);
            Neon.detail(c, [-0.42, 0.35, 0.42, 0.35], r, e.accent, 0.5, 1);
            Enemies._neonPair(c, [0.5, -0.5, 0.35, -0.05], r, e.accent, 0.4, 1);
            Neon.shape(c, S.cruiserBridge, r, e.accent, 0.8, flash, 0.35);
        },
        bomber(c, e, r, flash) {
            const S = Enemies._NEON_SHAPES;
            Neon.shape(c, S.bomber, r, e.color, 1.3, flash, 0.24);
            Enemies._neonPair(c, [0.42, -0.25, 0.84, -0.06], r, e.accent, 0.55, 1);
            Enemies._neonPair(c, [0.42, 0.1, 0.78, 0.16], r, e.accent, 0.4, 1);
            // Bomb bay frame
            Neon.path(c, [-0.27, 0.16, 0.27, 0.16, 0.27, 0.57, -0.27, 0.57], r, true);
            c.fillStyle = '#000000'; c.globalAlpha = 0.5; c.fill();
            c.globalAlpha = 1;
            Neon.stroke(c, e.accent, 0.7, flash);
        },
        sniper(c, e, r, flash) {
            const S = Enemies._NEON_SHAPES;
            Neon.shape(c, S.sniperBarrel, r, e.accent, 0.7, flash, 0.4);
            const m = S.sniperVane.slice();
            for (let i = 0; i < m.length; i += 2) m[i] = -m[i];
            Neon.shape(c, S.sniperVane, r, e.color, 0.8, flash, 0.2);
            Neon.shape(c, m, r, e.color, 0.8, flash, 0.2);
            Neon.shape(c, S.sniperBody, r, e.color, 1.1, flash, 0.25);
            Neon.detail(c, [-0.3, -0.12, 0.3, -0.12], r, e.accent, 0.4, 0.8);
            Neon.ring(c, 0, r * 1.0, r * 0.12, e.accent, 0.5, flash);
            Neon.ring(c, 0, 0, 3.5, e.accent, 0.5, flash);
        },
        carrier(c, e, r, flash) {
            const S = Enemies._NEON_SHAPES;
            Neon.shape(c, S.carrier, r, e.color, 1.5, flash, 0.22);
            Neon.path(c, S.carrier, r * 0.62, true);
            c.strokeStyle = e.accent; c.globalAlpha = 0.35; c.lineWidth = 1; c.stroke();
            c.globalAlpha = 1;
            Neon.detail(c, [-0.55, 0.05, 0.55, 0.05], r, e.accent, 0.45, 1);
            Enemies._neonPair(c, [0.62, -0.25, 0.82, 0.3], r, e.accent, 0.5, 1);
            Enemies._neonPair(c, [0.45, -0.1, 0.45, 0.55], r, e.accent, 0.35, 1);
            // Hangar bay
            Neon.path(c, S.carrierBay, r, true);
            c.fillStyle = '#000000'; c.globalAlpha = 0.6; c.fill();
            c.globalAlpha = 1;
            Neon.stroke(c, e.accent, 0.9, flash);
            // Bridge windows
            for (let j = -1; j <= 1; j++) {
                Neon.detail(c, [j * 0.1 - 0.035, -0.4, j * 0.1 + 0.035, -0.4], r, e.accent, 0.9, 1.6);
            }
        },
        shield_wall(c, e, r, flash) {
            const S = Enemies._NEON_SHAPES;
            Neon.shape(c, S.wall, r, e.color, 1.4, flash, 0.1);
            for (let j = -1; j <= 1; j++) Neon.detail(c, [j * 0.5, -0.26, j * 0.5, 0.26], r, e.accent, 0.3, 1);
            for (let sx = -1; sx <= 1; sx += 2) {
                for (let sy = -1; sy <= 1; sy += 2) Neon.light(c, sx * r, sy * r * 0.3, 1.6, e.accent, 1);
            }
        },
    },

    _neon: {
        scout_drone(ctx, e, r, flash) {
            const t = Neon.time();
            this._neonGlow(e, r * 2.6, flash);
            Neon.squash(ctx, flash, 0.15);
            Neon.sprite(ctx, 'scout|' + e.color + (flash ? '|f' : ''), r * 1.2 + 4, this._bake.scout, e, r, flash);
            // Spinning rotor blades
            ctx.strokeStyle = '#ffffff';
            ctx.globalAlpha = 0.7;
            ctx.lineWidth = 1;
            for (let s = -1; s <= 1; s += 2) {
                const rx = s * r * 0.8, ry = -r * 0.35, rr = r * 0.29;
                const a = t * 28 * s + e.x * 0.1;
                const bx = Math.cos(a) * rr, by = Math.sin(a) * rr;
                ctx.beginPath(); ctx.moveTo(rx - bx, ry - by); ctx.lineTo(rx + bx, ry + by); ctx.stroke();
            }
            ctx.globalAlpha = 1;
            const pulse = 0.7 + Math.sin(t * 9 + e.y * 0.05) * 0.3;
            Neon.light(ctx, 0, -r * 0.05, 1.8, '#ff3344', flash ? 1 : pulse);
        },

        gunship(ctx, e, r, flash) {
            const t = Neon.time();
            this._neonGlow(e, r * 2.4, flash);
            Neon.squash(ctx, flash, 0.12);
            Neon.sprite(ctx, 'gunship|' + e.color + (flash ? '|f' : ''), r * 1.1 + 4, this._bake.gunship, e, r, flash);
            // Main rotor: faint disc and two crossed blades
            const cy = -r * 0.1, rl = r * 0.95;
            ctx.fillStyle = e.accent;
            ctx.globalAlpha = 0.06;
            ctx.beginPath(); ctx.arc(0, cy, rl, 0, Math.PI * 2); ctx.fill();
            const a = t * 18 + e.y * 0.05;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.2;
            ctx.globalAlpha = 0.55;
            for (let k = 0; k < 2; k++) {
                const bx = Math.cos(a + k * Math.PI / 2) * rl, by = Math.sin(a + k * Math.PI / 2) * rl;
                ctx.beginPath(); ctx.moveTo(-bx, cy - by); ctx.lineTo(bx, cy + by); ctx.stroke();
            }
            ctx.globalAlpha = 1;
            Neon.light(ctx, 0, cy, 1.5, e.accent, 1);
            const charge = Math.max(0, Math.min(1, 1 - e.fireTimer / 0.5));
            Neon.light(ctx, 0, r * 0.98, 1.6, e.bulletColor || e.color, 0.3 + charge * 0.7);
        },

        missile_turret(ctx, e, r, flash) {
            const t = Neon.time();
            this._neonGlow(e, r * 2.2, flash);
            Neon.squash(ctx, flash, 0.08);
            Neon.sprite(ctx, 'turret|' + e.color + (flash ? '|f' : ''), r * 0.95 + 4, this._bake.missile_turret, e, r, flash);
            // Missile rack lights chase left to right
            const lit = Math.floor(t * 6 + e.x * 0.01) % 3;
            for (let j = 0; j < 3; j++) {
                Neon.light(ctx, (j - 1) * r * 0.4, -r * 0.28, 1.5, e.accent, j === lit ? 1 : 0.3);
            }
            const charge = Math.max(0, Math.min(1, 1 - e.fireTimer / 0.6));
            Neon.light(ctx, 0, r * 0.88, 2, e.bulletColor || e.color, 0.25 + charge * 0.75);
        },

        phase_shifter(ctx, e, r, flash) {
            this._neonGlow(e, r * 3, flash, 0.3);
            ctx.save();   // keep the spin off the HP bar drawn afterwards
            ctx.rotate(e.moveTimer * 2);
            Neon.squash(ctx, flash, 0.15);
            Neon.sprite(ctx, 'shifter|' + e.color + (flash ? '|f' : ''), r * 1.1 + 4, this._bake.phase_shifter, e, r, flash);
            // Counter-rotating outer arcs and a pulsing core
            ctx.rotate(-e.moveTimer * 5);
            ctx.strokeStyle = e.accent;
            ctx.lineWidth = 1;
            ctx.globalAlpha = 0.5;
            for (let k = 0; k < 3; k++) {
                const a = (Math.PI * 2 / 3) * k;
                ctx.beginPath(); ctx.arc(0, 0, r * 1.25, a, a + 1.2); ctx.stroke();
            }
            ctx.globalAlpha = 1;
            Neon.light(ctx, 0, 0, r * 0.18, e.accent, 0.6 + Math.sin(e.moveTimer * 5) * 0.4);
            ctx.restore();
        },

        shielded_cruiser(ctx, e, r, flash) {
            this._neonGlow(e, r * 2.2, flash);
            Neon.squash(ctx, flash, 0.06);
            Neon.sprite(ctx, 'cruiser|' + e.color + (flash ? '|f' : ''), r * 0.85 + 5, this._bake.shielded_cruiser, e, r, flash);
            Neon.light(ctx, 0, -r * 0.31, 2, e.accent, 0.6 + Math.sin(e.moveTimer * 3) * 0.3);
            // Rotating half-shield
            if (e.shieldHp > 0) {
                const a = 0.55 + Math.sin(e.moveTimer * 5) * 0.3;
                ctx.globalAlpha = a;
                ctx.beginPath(); ctx.arc(0, 0, r + 6, e.shieldAngle, e.shieldAngle + Math.PI);
                Neon.stroke(ctx, '#4488ff', 1.4, false);
                ctx.globalAlpha = a * 0.5;
                ctx.beginPath(); ctx.arc(0, 0, r + 10, e.shieldAngle + 0.3, e.shieldAngle + Math.PI - 0.3);
                ctx.strokeStyle = '#88bbff'; ctx.lineWidth = 1; ctx.stroke();
                ctx.globalAlpha = 1;
            }
        },

        bomber(ctx, e, r, flash) {
            this._neonGlow(e, r * 2.2, flash);
            Neon.squash(ctx, flash, 0.08);
            // Engine plumes behind the hull
            const f = Math.sin(e.moveTimer * 30) * 1.5;
            Neon.flame(ctx, -r * 0.22, r * 0.58, 3, 6 + f, e.color, 0.8);
            Neon.flame(ctx, r * 0.22, r * 0.58, 3, 6 - f, e.color, 0.8);
            Neon.sprite(ctx, 'bomber|' + e.color + (flash ? '|f' : ''), r * 0.95 + 5, this._bake.bomber, e, r, flash);
            // Bay doors slide open; bombs glow inside while open
            const open = Math.max(0, Math.sin(e.moveTimer * 2));
            Neon.light(ctx, 0, r * 0.37, 2.2, e.bulletColor || e.color, open);
            const w = r * 0.25 * (1 - open * 0.7);
            ctx.strokeStyle = flash ? '#ffffff' : e.accent;
            ctx.lineWidth = 1;
            ctx.globalAlpha = 0.8;
            ctx.strokeRect(-r * 0.25, r * 0.18, w, r * 0.37);
            ctx.strokeRect(r * 0.25 - w, r * 0.18, w, r * 0.37);
            ctx.globalAlpha = 1;
        },

        sniper(ctx, e, r, flash) {
            this._neonGlow(e, r * 2.2, flash);
            // Targeting laser: faint wide beam with a bright core, thickening before the shot
            if (e.fireTimer < 0.8) {
                const k = 0.1 + (0.8 - e.fireTimer) * 0.5;
                const ex = Math.cos(e.aimAngle) * 300, ey = Math.sin(e.aimAngle) * 300;
                ctx.strokeStyle = e.color;
                ctx.globalAlpha = k * 0.35;
                ctx.lineWidth = e.fireTimer < 0.3 ? 5 : 3;
                ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(ex, ey); ctx.stroke();
                ctx.strokeStyle = '#ffffff';
                ctx.globalAlpha = Math.min(1, k);
                ctx.lineWidth = e.fireTimer < 0.3 ? 1.5 : 0.8;
                ctx.stroke();
                ctx.globalAlpha = 1;
            }
            Neon.squash(ctx, flash, 0.12);
            Neon.sprite(ctx, 'sniper|' + e.color + (flash ? '|f' : ''), r * 1.1 + 4, this._bake.sniper, e, r, flash);
            const charge = Math.max(0, Math.min(1, 1 - e.fireTimer / 0.8));
            Neon.light(ctx, 0, 0, 2.2, e.color, 0.4 + charge * 0.6);
        },

        carrier(ctx, e, r, flash) {
            const t = Neon.time();
            this._neonGlow(e, r * 2, flash);
            Neon.squash(ctx, flash, 0.05);
            Neon.sprite(ctx, 'carrier|' + e.color + (flash ? '|f' : ''), r * 0.95 + 5, this._bake.carrier, e, r, flash);
            // Landing lights run down the hangar bay
            const step = Math.floor(t * 5) % 4;
            for (let j = 0; j < 3; j++) {
                Neon.light(ctx, -r * 0.16, r * (0.38 + j * 0.1), 1.2, e.accent, j === step ? 1 : 0.25);
                Neon.light(ctx, r * 0.16, r * (0.38 + j * 0.1), 1.2, e.accent, j === step ? 1 : 0.25);
            }
            // Wing-tip running lights
            const blink = Math.sin(t * 4 + e.x * 0.02) > 0;
            Neon.light(ctx, -r * 0.9, 0, 1.6, e.color, blink ? 1 : 0.25);
            Neon.light(ctx, r * 0.9, 0, 1.6, e.color, blink ? 0.25 : 1);
        },

        shield_wall(ctx, e, r, flash) {
            this._neonGlow(e, r * 2.2, flash, 0.3);
            Neon.squash(ctx, flash, 0.1);
            // Energy field: pulsing fill, a sweeping scan line and drifting bands
            ctx.fillStyle = e.color;
            ctx.globalAlpha = 0.14 + Math.sin(e.moveTimer * 6) * 0.07;
            ctx.fillRect(-r * 0.96, -r * 0.27, r * 1.92, r * 0.54);
            const sx = Math.sin(e.moveTimer * 2.2) * r * 0.9;
            ctx.strokeStyle = '#ffffff';
            ctx.globalAlpha = 0.6;
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(sx, -r * 0.27); ctx.lineTo(sx, r * 0.27); ctx.stroke();
            ctx.strokeStyle = e.accent;
            ctx.globalAlpha = 0.25;
            for (let j = 0; j < 2; j++) {
                const y = ((e.moveTimer * 0.6 + j * 0.5) % 1 - 0.5) * r * 0.5;
                ctx.beginPath(); ctx.moveTo(-r * 0.95, y); ctx.lineTo(r * 0.95, y); ctx.stroke();
            }
            ctx.globalAlpha = 1;
            Neon.sprite(ctx, 'wall|' + e.color + (flash ? '|f' : ''), r * 1.1 + 4, this._bake.shield_wall, e, r, flash);
        },
    },

    draw(ctx) {
        const isGlitchLevel = Background.bgType === 'void';
        // Warp-in markers (phase shifter and teleporting mid-boss telegraph)
        for (const e of this.list) {
            if (!(e.warpTimer > 0) || !e.warpTo) continue;
            const t = Math.max(0, 1 - e.warpTimer / 0.5);
            ctx.strokeStyle = e.color;
            ctx.globalAlpha = 0.3 + 0.5 * t;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(e.warpTo.x, e.warpTo.y, e.radius * (2 - t), 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
        for (const e of this.list) {
            ctx.save();
            // Glitch jitter for Level 6
            const glitchX = isGlitchLevel ? (Math.random() - 0.5) * 4 : 0;
            const glitchY = isGlitchLevel ? (Math.random() - 0.5) * 4 : 0;
            ctx.translate(e.x + glitchX, e.y + glitchY);

            // Apply movement rotation for ship-like enemies
            if (Math.abs(e.rotation) > 0.01) {
                ctx.rotate(e.rotation);
            }

            // Flash on hit, or random glitch flash in Level 6
            const glitchFlash = isGlitchLevel && !Renderer.calm() && Math.random() < 0.02;
            const flash = e.flashTimer > 0 || glitchFlash;
            if (MidBoss.isType(e.type)) MidBoss.draw(ctx, e, flash);
            else this._neon[e.type].call(this, ctx, e, e.radius, flash);

            // HP bar for tough enemies (mid-bosses use the top-of-screen bar)
            if (e.maxHp > 2 && !e.midboss) {
                if (e.rotation) ctx.rotate(-e.rotation);   // keep the bar level
                const barW = e.radius * 2;
                const hpPct = (e.hp + Math.max(0, e.shieldHp)) / (e.maxHp + e.maxShieldHp);
                Neon.bar(ctx, -barW / 2, -e.radius - 9, barW, 3, hpPct, e.shieldHp > 0 ? '#4488ff' : '#ff3355', 0);
            }

            ctx.restore();
        }

        MidBoss.drawBar(ctx);

        // Apply colorblind override to enemy bullets before drawing
        // (colour change also re-tints the GPU bullet)
        if (Settings.values.colorblind) {
            for (const b of this.enemyBullets.pool) {
                if (b._origColor) continue;
                b._origColor = b.color;
                b.color = '#ffcc00';
                b._hex = 0xffcc00;
                if (b._p) b._p.tint = b._hex;
            }
        } else {
            for (const b of this.enemyBullets.pool) {
                if (!b._origColor) continue;
                b.color = b._origColor; b._origColor = null;
                b._hex = Renderer.colorToHex(b.color);
                if (b._p) b._p.tint = b._hex;
            }
        }
        this.enemyBullets.draw(ctx);
    },

    clear() {
        this.list.length = 0;
        this.enemyBullets.clear();
    }
};


// ============================================================
//  POWER-UP SYSTEM
// ============================================================
const PowerUps = {
    list: [],
    types: ['spread', 'homing', 'laser', 'drone'],

    colors: { spread: '#ff8c00', homing: '#00ff88', laser: '#4488ff', drone: '#cc44ff' },

    spawn(x, y, forceType) {
        const type = forceType || this.types[Math.floor(Math.random() * this.types.length)];
        this.list.push({
            x, y,
            type,
            color: this.colors[type],
            vy: 50,
            life: 999,
            radius: 10,
            bobTimer: Math.random() * Math.PI * 2
        });
    },

    update(dt) {
        for (let i = this.list.length - 1; i >= 0; i--) {
            const p = this.list[i];
            p.y += p.vy * dt;
            p.life -= dt;
            p.bobTimer += dt * 4;
            if (p.life <= 0 || p.y > PLAY_H + 20) {
                this.list.splice(i, 1);
            }
        }
    },

    // Neon style: a rotating hex badge with the weapon icon in glowing
    // line art. Badge and icon are baked; spin, pulse and sparkles are live.
    _HEX: Neon.polygon(6, 0),
    _bakeBadge(c, color, r) {
        Neon.shape(c, PowerUps._HEX, r, color, 1.3, false, 0.3);
        Neon.path(c, PowerUps._HEX, r * 0.72, true);
        c.strokeStyle = color; c.globalAlpha = 0.4; c.lineWidth = 1; c.stroke();
        c.globalAlpha = 1;
    },
    _bakeIcon(c, type, color) {
        c.beginPath();
        switch (type) {
            case 'spread':
                for (let j = -2; j <= 2; j++) {
                    const a = -Math.PI / 2 + j * 0.3;
                    c.moveTo(0, 3); c.lineTo(Math.cos(a) * 8, 3 + Math.sin(a) * 8);
                }
                break;
            case 'homing':
                Neon.path(c, [0, -7, 2.5, -2, 2.5, 4, 5, 7, -5, 7, -2.5, 4, -2.5, -2], 1, true);
                break;
            case 'laser':
                c.moveTo(0, -8); c.lineTo(0, 8);
                c.moveTo(-3.5, -5); c.lineTo(-3.5, 5);
                c.moveTo(3.5, -5); c.lineTo(3.5, 5);
                break;
            case 'drone':
                c.arc(0, 0, 6, 0, Math.PI * 2);
                break;
        }
        Neon.stroke(c, color, 0.9, false);
    },
    _drawNeon(ctx, p, pulse, rot) {
        const t = p.bobTimer;
        // Outer pulsing ring
        ctx.globalAlpha = 0.35 + Math.sin(t * 2) * 0.15;
        Neon.ring(ctx, 0, 0, p.radius + 5 + Math.sin(t * 1.5) * 2, p.color, 0.6, false);
        ctx.globalAlpha = 0.75 + pulse * 0.25;
        ctx.save();
        ctx.rotate(rot * 0.3);
        Neon.sprite(ctx, 'pu_badge|' + p.color, p.radius + 5, this._bakeBadge, p.color, p.radius);
        ctx.restore();
        ctx.globalAlpha = 1;
        Neon.sprite(ctx, 'pu_icon|' + p.type, 14, this._bakeIcon, p.type, p.color);
        // Live icon details
        if (p.type === 'drone') {
            Neon.light(ctx, 0, 0, 1.6, p.color, 1);
            for (let j = 0; j < 3; j++) {
                const a = (Math.PI * 2 / 3) * j + rot * 2;
                Neon.light(ctx, Math.cos(a) * 6, Math.sin(a) * 6, 1.4, p.color, 1);
            }
        } else if (p.type === 'homing') {
            Neon.flame(ctx, 0, 7, 2, 3 + Math.sin(t * 8) * 1.5, p.color, 0.9);
        } else if (p.type === 'spread') {
            for (let j = -2; j <= 2; j++) {
                const a = -Math.PI / 2 + j * 0.3;
                Neon.light(ctx, Math.cos(a) * 8, 3 + Math.sin(a) * 8, 1, p.color, 0.6 + pulse * 0.4);
            }
        }
        // Rotating sparkles
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.7;
        for (let j = 0; j < 4; j++) {
            const a = rot + (Math.PI / 2) * j;
            ctx.beginPath();
            ctx.arc(Math.cos(a) * (p.radius + 5), Math.sin(a) * (p.radius + 5), 1, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    },

    draw(ctx) {
        for (const p of this.list) {
            const bob = Math.sin(p.bobTimer) * 3;
            const pulse = 0.7 + Math.sin(p.bobTimer * 1.5) * 0.3;
            const rot = p.bobTimer * 0.8;

            // Dynamic light — pulsing glow around power-ups
            Renderer.addGlow(p.x, p.y + bob, Renderer.colorToHex(p.color), p.radius * 6, 0.3 + pulse * 0.4);

            ctx.save();
            ctx.translate(p.x, p.y + bob);
            this._drawNeon(ctx, p, pulse, rot);
            ctx.restore();
        }
    },

    clear() { this.list.length = 0; }
};


// === midbosses.js ===
// ============================================================
//  MID-BOSSES
// ============================================================
// One mid-boss per level, around the middle of the stage (genre convention:
// Cave, Touhou). A mid-boss is a heavy enemy registered in Enemies.types, so it
// reuses spawning, level HP scaling, collision and homing; this module adds its
// movement, attack patterns, drawing and rewards.
//
// While a mid-boss is alive the wave timer is paused (WaveSystem), so the stage
// waits for it. If it isn't destroyed within MIDBOSS_TIME_LIMIT it retreats
// without its reward (like a Touhou mid-boss).

const MIDBOSS_TIME_LIMIT = 35;   // seconds on screen before it retreats
const MIDBOSS_ENTRY_Y = 190;     // lower than the main boss, so spread weapons can reach it
const MIDBOSS_BONUS = 8000;      // score for destroying it (× difficulty multiplier)
const MIDBOSS_DROPS = 2;         // guaranteed power-ups on defeat

const MidBossTypes = {
    // Level 1 — heavy gunship: aimed fans and rings, sways across the top
    sentinel: {
        name: 'SENTINEL', level: 1, movement: 'sway',
        color: '#ff6600', accent: '#ffcc44', bulletColor: '#ff4400',
        patterns: ['aimedFan', 'ring', 'wideFan'], interval: 1.1,
    },
    // Level 2 — industrial walker: bomb drops and walls with a gap near the player
    forge_walker: {
        name: 'FORGE WALKER', level: 2, movement: 'sway',
        color: '#cc4400', accent: '#ff8844', bulletColor: '#ff2200',
        patterns: ['bombDrop', 'gapWall', 'aimedHeavy'], interval: 1.2,
    },
    // Level 3 — debris hauler: spiral bursts and thrown debris
    debris_hauler: {
        name: 'DEBRIS HAULER', level: 3, movement: 'sway',
        color: '#dd9955', accent: '#ffd9a0', bulletColor: '#00ffaa',
        patterns: ['spiral', 'debrisThrow', 'ring'], interval: 1.0,
    },
    // Level 4 — strike leader: darts between positions, fast fans, calls in scouts
    strike_leader: {
        name: 'STRIKE LEADER', level: 4, movement: 'dart', hpMult: 0.6, // mobile: lower HP (like the Duo)
        color: '#ffaa00', accent: '#ffdd66', bulletColor: '#ff6600',
        patterns: ['aimedFanFast', 'callScouts', 'crossStreams'], interval: 1.0,
    },
    // Level 5 — core warden: telegraphed teleports, double rings, triple spiral
    core_warden: {
        name: 'CORE WARDEN', level: 5, movement: 'teleport',
        color: '#cc44ff', accent: '#ff88ff', bulletColor: '#cc00ff',
        patterns: ['doubleRing', 'tripleSpiral', 'aimedFan'], interval: 0.95,
    },
    // Level 6 — glitch echo: mirrors the player and fires a copy of their spread
    glitch_echo: {
        name: 'GLITCH ECHO', level: 6, movement: 'mirror',
        color: '#00ffff', accent: '#ff00ff', bulletColor: '#00ffff',
        patterns: ['mirrorSpread', 'randomBurst', 'ringAimed'], interval: 0.9,
    },
};

// Register as enemy types: ~25 s to destroy at the power a player typically has at that point
for (const [id, def] of Object.entries(MidBossTypes)) {
    Enemies.types[id] = {
        hp: Math.round(250 * (def.hpMult || 1)), speed: 70, radius: 40, score: 5000,
        color: def.color, accent: def.accent, bulletColor: def.bulletColor,
        fireRate: def.interval, bulletSpeed: 150, dropChance: 0, cancelBullets: true,
    };
    Enemies.COUNT_SCALED[id] = true; // density scales bullet counts, not fire frequency
}

const MidBoss = {
    isType(type) { return !!MidBossTypes[type]; },

    // The active mid-boss (at most one), or null
    current() {
        for (const e of Enemies.list) if (e.midboss && !e.retreating) return e;
        return null;
    },

    spawn(type) {
        const def = MidBossTypes[type];
        if (!def) return null;
        const e = Enemies.spawn(type, PLAY_W / 2, -60, 'midboss');
        if (!e) return null;
        e.midboss = def;
        e.patternIndex = 0;
        e.fireTimer = 1.5;          // grace period while it enters
        e.onScreenTime = 0;
        e.dartTarget = PLAY_W / 2;
        Scoring.spawnPopup('WARNING — ' + def.name, '#ff4466', 22);
        Audio.playExplosionLarge();
        return e;
    },

    _n(base) { return Math.max(3, Math.round(base * (GameConfig.bulletDensity || 1))); },

    updateMovement(e, dt, playerX) {
        const def = e.midboss;
        if (e.y < MIDBOSS_ENTRY_Y - 1 && e.onScreenTime < 3) {
            e.y += Math.min(90 * dt, MIDBOSS_ENTRY_Y - e.y);
            return;
        }
        e.onScreenTime += dt;
        if (e.onScreenTime > MIDBOSS_TIME_LIMIT) {
            if (!e.retreating) Scoring.spawnPopup(def.name + ' ESCAPED', '#888888', 18);
            e.retreating = true;
            return;
        }
        const t = e.moveTimer;
        switch (def.movement) {
            // Movement speeds stay low (≤ ~140 px/s): shots take ~1 s to reach it, so a
            // fast mid-boss can't be hit at all from the bottom of the screen
            case 'sway':
                e.x += (PLAY_W / 2 + Math.sin(t * 0.35) * 150 - e.x) * Math.min(1, dt * 2);
                e.y = MIDBOSS_ENTRY_Y + Math.sin(t * 1.1) * 20;
                break;
            case 'dart':
                // Dart to one of three positions, then hold there briefly (a window to hit it)
                if (Math.abs(e.x - e.dartTarget) < 4) {
                    e.dartDwell = (e.dartDwell || 0) + dt;
                    if (e.dartDwell > 1.5) {
                        e.dartDwell = 0;
                        e.dartTarget = [140, PLAY_W / 2, PLAY_W - 140][Math.floor(Math.random() * 3)];
                    }
                }
                e.x += Math.sign(e.dartTarget - e.x) * Math.min(Math.abs(e.dartTarget - e.x), 140 * dt);
                e.y = MIDBOSS_ENTRY_Y + Math.sin(t * 2) * 15;
                break;
            case 'teleport':
                if (e.warpTimer > 0) {
                    e.warpTimer -= dt;
                    if (e.warpTimer <= 0) { e.x = e.warpTo.x; e.y = e.warpTo.y; e.fireTimer = Math.max(e.fireTimer, 0.8); }
                } else {
                    e.teleportTimer = (e.teleportTimer || 4) - dt;
                    if (e.teleportTimer <= 0) {
                        e.warpTo = { x: 100 + Math.random() * (PLAY_W - 200), y: MIDBOSS_ENTRY_Y - 60 + Math.random() * 120 };
                        e.warpTimer = 0.5;
                        e.teleportTimer = 4;
                    }
                }
                break;
            case 'mirror':
                e.x += Math.max(-90 * dt, Math.min(90 * dt, (PLAY_W - playerX) - e.x));
                e.y = MIDBOSS_ENTRY_Y + Math.sin(t * 1.5) * 25;
                break;
        }
        e.x = Math.max(50, Math.min(PLAY_W - 50, e.x));
    },

    fire(e, px, py) {
        const def = e.midboss;
        const pattern = def.patterns[e.patternIndex % def.patterns.length];
        e.patternIndex++;
        const B = Enemies.enemyBullets;
        const bs = e.bulletSpeed;
        const angle = Math.atan2(py - e.y, px - e.x);
        const c = def.bulletColor, c2 = def.accent;
        const ring = (count, speed, offset, color, radius) => {
            for (let j = 0; j < count; j++) {
                const a = (Math.PI * 2 / count) * j + offset;
                B.spawn(e.x, e.y, Math.cos(a) * speed, Math.sin(a) * speed, { color, radius: radius || 3 });
            }
        };
        const fan = (count, spreadRad, speed, color, radius) => {
            for (let j = 0; j < count; j++) {
                const a = angle + (count > 1 ? (j / (count - 1) - 0.5) * spreadRad : 0);
                B.spawn(e.x, e.y + 20, Math.cos(a) * speed, Math.sin(a) * speed, { color, radius: radius || 3 });
            }
        };
        switch (pattern) {
            case 'aimedFan': fan(this._n(5), 0.6, bs * 1.1, c); break;
            case 'wideFan': fan(this._n(9), 1.2, bs * 0.9, c2); break;
            case 'aimedFanFast': fan(this._n(7), 0.7, bs * 1.35, c); break;
            case 'aimedHeavy': fan(3, 0.35, bs * 1.2, c, 5); break;
            case 'ring': ring(this._n(14), bs * 0.75, e.moveTimer, c2); break;
            case 'doubleRing':
                ring(this._n(12), bs * 0.65, 0, c);
                ring(this._n(16), bs * 0.9, 0.2, c2);
                break;
            case 'spiral':
                ring(this._n(18), bs * 0.85, e.moveTimer * 2.5, c);
                break;
            case 'tripleSpiral':
                for (let s = 0; s < 3; s++) ring(this._n(6), bs * 0.9, e.moveTimer * 3 + s * 0.35, s === 1 ? c2 : c);
                break;
            case 'bombDrop': {
                const n = this._n(4);
                for (let j = 0; j < n; j++) {
                    B.spawn(e.x + (j - (n - 1) / 2) * 26, e.y + 25, (Math.random() - 0.5) * 30, bs * 0.55, { color: c, radius: 6, life: 3 });
                }
                ring(this._n(8), bs * 0.5, 0, c2, 2.5);
                break;
            }
            case 'gapWall': {
                // Horizontal wall with a 90 px gap centred near the player
                const n = this._n(14);
                const gap = Math.max(60, Math.min(PLAY_W - 60, px + (Math.random() - 0.5) * 120));
                for (let j = 0; j < n; j++) {
                    const x = 10 + ((PLAY_W - 20) / (n - 1)) * j;
                    if (Math.abs(x - gap) < 45) continue;
                    B.spawn(x, e.y + 30, 0, bs * 0.6, { color: c2, radius: 3 });
                }
                break;
            }
            case 'debrisThrow':
                if (Asteroids.active) {
                    for (let j = -1; j <= 1; j += 2) {
                        Asteroids.list.push({ x: e.x + j * 30, y: e.y + 30, vx: j * 40, vy: 110, radius: 12, hp: 2,
                            destructible: true, rotation: 0, rotSpeed: 2 });
                    }
                }
                fan(3, 0.3, bs, c);
                break;
            case 'callScouts':
                for (let j = -1; j <= 1; j += 2) Enemies.spawn('scout_drone', e.x + j * 40, e.y + 30, 'straight_down');
                break;
            case 'crossStreams':
                for (let j = 0; j < this._n(6); j++) {
                    const a1 = 0.7 + j * 0.12, a2 = Math.PI - 0.7 - j * 0.12;
                    B.spawn(e.x - 30, e.y, Math.cos(a1) * bs, Math.sin(a1) * bs, { color: c, radius: 3 });
                    B.spawn(e.x + 30, e.y, Math.cos(a2) * bs, Math.sin(a2) * bs, { color: c2, radius: 3 });
                }
                break;
            case 'mirrorSpread': fan(this._n(7), 0.9, bs, c); break;
            case 'randomBurst':
                for (let j = 0; j < this._n(16); j++) {
                    const a = Math.PI * (0.1 + Math.random() * 0.8);
                    const sp = bs * (0.6 + Math.random() * 0.6);
                    B.spawn(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, { color: j % 2 ? c : c2, radius: 3 });
                }
                break;
            case 'ringAimed':
                ring(this._n(16), bs * 0.7, 0, c2);
                fan(3, 0.25, bs * 1.2, c);
                break;
        }
    },

    // Destroyed (not escaped): bonus, screen-wide bullet cancel, guaranteed power-ups
    onDefeat(e) {
        const bonus = Math.floor(MIDBOSS_BONUS * GameConfig.scoreMultiplier);
        Scoring.score += bonus;
        Scoring.spawnPopup(e.midboss.name + ' DOWN  +' + bonus.toLocaleString(), '#ffff00', 22);
        for (const b of Enemies.enemyBullets.pool) {
            b.active = false;
            Particles.spawn(b.x, b.y, 1, { color: '#00ffff', speed: 30, life: 0.6, size: 2 });
        }
        for (let i = 0; i < MIDBOSS_DROPS; i++) PowerUps.spawn(e.x + (i - 0.5) * 40, e.y);
        Particles.spawn(e.x, e.y, 50, { color: e.color, speed: 260, life: 0.9, size: 4 });
        ScreenShake.trigger(12, 0.6);
        Audio.playExplosionLarge();
    },

    // ------------------------------------------------------------
    //  Neon style art (see neon.js): one design per mid-boss. Static
    //  bodies come from the sprite atlas; moving parts are drawn live.
    //  Outlines are in units of the mid-boss radius.
    // ------------------------------------------------------------
    _NEON_SHAPES: {
        sentinel: Neon.mirror([0, -0.75, 0.35, -0.7, 0.55, -0.4, 1.0, -0.15, 1.0, 0.15, 0.6, 0.3, 0.45, 0.7, 0.15, 0.85]),
        sentinelBarrel: [0.26, 0.55, 0.38, 0.55, 0.38, 1.05, 0.26, 1.05],
        forge: Neon.mirror([0, -0.6, 0.55, -0.6, 0.72, -0.35, 0.72, 0.2, 0.5, 0.45, 0.2, 0.5]),
        forgeStack: [0.28, -0.95, 0.45, -0.95, 0.45, -0.6, 0.28, -0.6],
        forgeCannon: [-0.09, 0.45, 0.09, 0.45, 0.09, 0.82, -0.09, 0.82],
        hauler: Neon.mirror([0, -0.72, 0.4, -0.72, 0.62, -0.45, 0.62, 0.25, 0.38, 0.45, 0.2, 0.45]),
        // Nose points down, toward the player
        striker: Neon.mirror([0, 1.0, 0.18, 0.55, 0.3, 0.1, 1.0, -0.35, 0.95, -0.55, 0.4, -0.4, 0.3, -0.7, 0.12, -0.6, 0, -0.62]),
        strikerCanopy: Neon.mirror([0, 0.62, 0.1, 0.42, 0.08, 0.22, 0, 0.16]),
        wardenOuter: Neon.polygon(8, Math.PI / 8, 0.85),
        wardenInner: Neon.polygon(8, Math.PI / 8, 0.5),
        wardenSpike: [0, -1.18, 0.13, -0.92, 0, -0.8, -0.13, -0.92],
        // The player's ship turned upside down (shared with the Echo boss)
        echoHull: Neon.mirror([0, 1.15, 0.2, 0.6, 0.3, 0.05, 0.95, -0.45, 0.9, -0.62, 0.45, -0.48, 0.32, -0.72, 0.12, -0.62, 0, -0.66]),
        echoCanopy: Neon.mirror([0, 0.66, 0.1, 0.42, 0.08, 0.2, 0, 0.14]),
    },

    _OUTLINES: { sentinel: 'sentinel', forge_walker: 'forge', debris_hauler: 'hauler', strike_leader: 'striker', core_warden: 'wardenOuter', glitch_echo: 'echoHull' },
    outline(e) {
        const key = this._OUTLINES[e.type];
        return key ? { pts: this._NEON_SHAPES[key], scale: e.type === 'glitch_echo' ? e.radius * 0.9 : e.radius } : null;
    },

    _glow(e, size, flash, alpha) {
        if (e._glowHex === undefined) e._glowHex = Renderer.colorToHex(e.color);
        Renderer.addGlow(e.x, e.y, e._glowHex, size, flash ? 0.7 : (alpha || 0.3));
    },

    _flip(pts) {
        const m = pts.slice();
        for (let i = 0; i < m.length; i += 2) m[i] = -m[i];
        return m;
    },

    _bake: {
        sentinel(c, e, r, flash) {
            const S = MidBoss._NEON_SHAPES;
            Neon.shape(c, S.sentinelBarrel, r, e.accent, 1, flash, 0.35);
            Neon.shape(c, MidBoss._flip(S.sentinelBarrel), r, e.accent, 1, flash, 0.35);
            Neon.shape(c, S.sentinel, r, e.color, 1.8, flash, 0.22);
            Neon.path(c, S.sentinel, r * 0.6, true);
            c.strokeStyle = e.accent; c.globalAlpha = 0.4; c.lineWidth = 1; c.stroke();
            c.globalAlpha = 1;
            Enemies._neonPair(c, [0.58, -0.08, 0.96, -0.04], r, e.accent, 0.5, 1);
            Enemies._neonPair(c, [0.58, 0.1, 0.9, 0.1], r, e.accent, 0.5, 1);
            Enemies._neonPair(c, [0.35, -0.7, 0.45, 0.62], r, e.accent, 0.3, 1);
            c.beginPath();
            c.ellipse(0, -r * 0.2, r * 0.22, r * 0.12, 0, 0, Math.PI * 2);
            c.fillStyle = flash ? '#ffffff' : '#140600'; c.globalAlpha = 0.9; c.fill();
            c.globalAlpha = 1;
            Neon.stroke(c, e.accent, 1, flash);
        },
        forge_walker(c, e, r, flash) {
            const S = MidBoss._NEON_SHAPES;
            Neon.shape(c, S.forgeStack, r, e.accent, 1, flash, 0.3);
            Neon.shape(c, MidBoss._flip(S.forgeStack), r, e.accent, 1, flash, 0.3);
            Neon.shape(c, S.forgeCannon, r, e.accent, 1, flash, 0.35);
            Neon.shape(c, S.forge, r, e.color, 1.8, flash, 0.24);
            // Furnace grille
            for (let j = 0; j < 4; j++) {
                const y = -0.2 + j * 0.12;
                Neon.detail(c, [-0.34, y, 0.34, y], r, e.accent, 0.45, 1.2);
            }
            Enemies._neonPair(c, [0.5, -0.5, 0.62, 0.15], r, e.accent, 0.35, 1);
            Neon.detail(c, [-0.5, -0.42, 0.5, -0.42], r, e.accent, 0.35, 1);
        },
        debris_hauler(c, e, r, flash) {
            const S = MidBoss._NEON_SHAPES;
            Neon.shape(c, S.hauler, r, e.color, 1.8, flash, 0.22);
            // Cargo grid
            for (let j = -1; j <= 1; j++) Neon.detail(c, [j * 0.2, -0.5, j * 0.2, 0.25], r, e.accent, 0.35, 1);
            Neon.detail(c, [-0.42, -0.25, 0.42, -0.25], r, e.accent, 0.35, 1);
            Neon.detail(c, [-0.42, 0.02, 0.42, 0.02], r, e.accent, 0.35, 1);
            Neon.detail(c, [-0.25, -0.62, 0.25, -0.62], r, e.accent, 0.9, 2);
            Enemies._neonPair(c, [0.62, -0.3, 0.75, -0.3, 0.75, 0.1, 0.62, 0.1], r, e.accent, 0.6, 1.2);
        },
        strike_leader(c, e, r, flash) {
            const S = MidBoss._NEON_SHAPES;
            Neon.shape(c, S.striker, r, e.color, 1.7, flash, 0.22);
            Neon.detail(c, [0, 0.72, 0, -0.45], r, e.accent, 0.4, 1);
            Enemies._neonPair(c, [0.32, 0.02, 0.9, -0.4], r, e.accent, 0.6, 1.2);
            Enemies._neonPair(c, [0.3, -0.2, 0.62, -0.42], r, e.accent, 0.4, 1);
            Neon.shape(c, S.strikerCanopy, r, e.accent, 0.9, flash, 0.4);
        },
        core_warden(c, e, r, flash) {
            const S = MidBoss._NEON_SHAPES;
            for (let k = 0; k < 4; k++) {
                c.save();
                c.rotate(k * Math.PI / 2);
                Neon.shape(c, S.wardenSpike, r, e.accent, 1, flash, 0.3);
                c.restore();
            }
            Neon.shape(c, S.wardenOuter, r, e.color, 1.8, flash, 0.18);
            Neon.shape(c, S.wardenInner, r, e.accent, 1, flash, 0.14);
            for (let k = 0; k < 8; k++) {
                const i = k * 2;
                Neon.detail(c, [S.wardenInner[i], S.wardenInner[i + 1], S.wardenOuter[i], S.wardenOuter[i + 1]], r, e.accent, 0.4, 1);
            }
        },
        glitch_echo(c, color, r, flash) {
            const S = MidBoss._NEON_SHAPES;
            Neon.shape(c, S.echoHull, r, color, 1.5, flash, 0.18);
            Neon.detail(c, [0, 0.78, 0, -0.3], r, color, 0.45, 1);
            Enemies._neonPair(c, [0.32, -0.1, 0.82, -0.47], r, color, 0.6, 1);
            Neon.shape(c, S.echoCanopy, r, color, 0.8, flash, 0.35);
        },
    },

    _neon: {
        sentinel(ctx, e, r, flash) {
            const t = e.moveTimer;
            this._glow(e, r * 2.6, flash);
            if (flash) ctx.scale(1.05, 0.96);
            Neon.sprite(ctx, 'm_sentinel|' + e.color + (flash ? '|f' : ''), r * 1.12 + 6, this._bake.sentinel, e, r, flash);
            // Rotating weapon ring, eye and barrel muzzles
            ctx.beginPath();
            ctx.arc(0, 0, r * 0.5, t * 2, t * 2 + Math.PI * 1.4);
            ctx.globalAlpha = 0.7;
            Neon.stroke(ctx, e.accent, 0.8, false);
            ctx.globalAlpha = 1;
            const look = Math.max(-1, Math.min(1, (Player.x - e.x) / 200));
            Neon.light(ctx, look * r * 0.1, -r * 0.2, r * 0.06, e.accent, 1);
            const charge = Math.max(0, Math.min(1, 1 - e.fireTimer / 0.4));
            Neon.light(ctx, -r * 0.32, r * 1.05, 2.5, e.bulletColor, 0.3 + charge * 0.7);
            Neon.light(ctx, r * 0.32, r * 1.05, 2.5, e.bulletColor, 0.3 + charge * 0.7);
        },

        forge_walker(ctx, e, r, flash) {
            const t = e.moveTimer;
            this._glow(e, r * 2.6, flash);
            // Four legs stepping in alternating pairs (drawn behind the body)
            for (let k = 0; k < 4; k++) {
                const side = k < 2 ? -1 : 1;
                const front = k % 2 === 0 ? -1 : 1;
                const ph = t * 4 + (k === 0 || k === 3 ? 0 : Math.PI);
                const lift = Math.max(0, Math.sin(ph)) * 0.12;
                const hx = side * r * 0.62, hy = r * (0.05 + front * 0.2);
                const kx = side * r * 0.98, ky = hy - r * (0.18 + lift);
                const fx = side * r * (1.02 + Math.cos(ph) * 0.06), fy = hy + r * (0.32 - lift);
                ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy);
                Neon.stroke(ctx, e.color, 1.3, flash);
                Neon.light(ctx, fx, fy, 2, e.accent, 0.8);
            }
            if (flash) ctx.scale(1.05, 0.96);
            Neon.sprite(ctx, 'm_forge|' + e.color + (flash ? '|f' : ''), r * 1.0 + 6, this._bake.forge_walker, e, r, flash);
            Neon.light(ctx, 0, -r * 0.02, r * 0.12, '#ff2200', 0.6 + Math.sin(t * 5) * 0.3);
            // Smoke and embers rising from the stacks
            for (let s = -1; s <= 1; s += 2) {
                for (let j = 0; j < 3; j++) {
                    const p = (t * 0.8 + j / 3 + (s > 0 ? 0.5 : 0)) % 1;
                    ctx.fillStyle = j === 0 ? e.accent : '#553322';
                    ctx.globalAlpha = (1 - p) * (j === 0 ? 0.7 : 0.35);
                    ctx.beginPath();
                    ctx.arc(s * r * 0.365 + Math.sin(p * 6 + j) * 3, -r * (0.98 + p * 0.5), j === 0 ? 1.5 : 3 + p * 5, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            ctx.globalAlpha = 1;
        },

        debris_hauler(ctx, e, r, flash) {
            const t = e.moveTimer;
            this._glow(e, r * 2.6, flash);
            // Tractor beam between the claws
            const beam = e.bulletColor;
            ctx.fillStyle = beam;
            ctx.globalAlpha = 0.08 + Math.sin(t * 4) * 0.04;
            ctx.beginPath();
            ctx.moveTo(-r * 0.3, r * 0.55); ctx.lineTo(r * 0.3, r * 0.55);
            ctx.lineTo(r * 0.55, r * 1.3); ctx.lineTo(-r * 0.55, r * 1.3);
            ctx.fill();
            ctx.strokeStyle = beam;
            ctx.lineWidth = 1;
            for (let j = 0; j < 3; j++) {
                const p = (t * 0.7 + j / 3) % 1;
                ctx.globalAlpha = 0.4 * (1 - p);
                const y = r * (1.3 - p * 0.75), w = r * (0.55 - p * 0.25);
                ctx.beginPath(); ctx.moveTo(-w, y); ctx.lineTo(w, y); ctx.stroke();
            }
            ctx.globalAlpha = 1;
            // Claws open and close
            const open = 0.25 + Math.sin(t * 2) * 0.2;
            for (let s = -1; s <= 1; s += 2) {
                const bx = s * r * 0.35, by = r * 0.42;
                const ex = s * r * 0.5, ey = r * 0.8;
                ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex, ey);
                ctx.lineTo(ex + s * Math.sin(open) * r * 0.25, ey + Math.cos(open) * r * 0.25);
                ctx.moveTo(ex, ey);
                ctx.lineTo(ex - s * Math.sin(open) * r * 0.25, ey + Math.cos(open) * r * 0.25);
                Neon.stroke(ctx, e.accent, 1.1, flash);
            }
            if (flash) ctx.scale(1.05, 0.96);
            Neon.sprite(ctx, 'm_hauler|' + e.color + (flash ? '|f' : ''), r * 0.8 + 6, this._bake.debris_hauler, e, r, flash);
            const blink = Math.floor(t * 3) % 2;
            Neon.light(ctx, -r * 0.68, -r * 0.1, 2, beam, blink ? 1 : 0.3);
            Neon.light(ctx, r * 0.68, -r * 0.1, 2, beam, blink ? 0.3 : 1);
        },

        strike_leader(ctx, e, r, flash) {
            const t = e.moveTimer;
            this._glow(e, r * 2.4, flash);
            const moving = Math.abs(e.x - e.dartTarget) > 4;
            // Afterburners at the tail (pointing up), brighter while darting
            const len = r * (moving ? 0.22 : 0.12) + Math.sin(t * 40) * 1.5;
            Neon.flame(ctx, -r * 0.2, -r * 0.62, 5, -len, e.accent, moving ? 0.9 : 0.6);
            Neon.flame(ctx, r * 0.2, -r * 0.62, 5, -len, e.accent, moving ? 0.9 : 0.6);
            if (moving) ctx.scale(0.86, 1);
            if (flash) ctx.scale(1.05, 0.96);
            Neon.sprite(ctx, 'm_striker|' + e.color + (flash ? '|f' : ''), r * 1.1 + 6, this._bake.strike_leader, e, r, flash);
            const blink = Math.sin(t * 8) > 0;
            Neon.light(ctx, -r * 0.97, -r * 0.45, 2, e.accent, blink ? 1 : 0.3);
            Neon.light(ctx, r * 0.97, -r * 0.45, 2, e.accent, blink ? 0.3 : 1);
        },

        core_warden(ctx, e, r, flash) {
            const t = e.moveTimer;
            // Fade and shrink while warping out
            if (e.warpTimer > 0) {
                const k = Math.max(0, e.warpTimer / 0.5);
                ctx.globalAlpha = k;
                ctx.scale(0.4 + k * 0.6, 0.4 + k * 0.6);
            }
            this._glow(e, r * 3, flash, 0.35);
            ctx.save();
            ctx.rotate(t * 0.4);
            if (flash) ctx.scale(1.05, 1.05);
            Neon.sprite(ctx, 'm_warden|' + e.color + (flash ? '|f' : ''), r * 1.2 + 6, this._bake.core_warden, e, r, flash);
            ctx.restore();
            // Two segmented rings turning in opposite directions
            const a0 = ctx.globalAlpha;
            for (let ring = 0; ring < 2; ring++) {
                const rr = r * (ring === 0 ? 0.68 : 1.02);
                const off = t * (ring === 0 ? -1.4 : 0.9);
                const n = ring === 0 ? 4 : 6;
                for (let k = 0; k < n; k++) {
                    const a = off + (Math.PI * 2 / n) * k;
                    ctx.beginPath(); ctx.arc(0, 0, rr, a, a + Math.PI / n);
                    ctx.globalAlpha = a0 * 0.8;
                    Neon.stroke(ctx, ring === 0 ? e.accent : e.color, 0.8, flash);
                }
            }
            ctx.globalAlpha = a0;
            Neon.light(ctx, 0, 0, r * 0.13 + Math.sin(t * 6) * 1.5, e.accent, 1);
        },

        glitch_echo(ctx, e, r, flash) {
            const t = e.moveTimer;
            const s = r * 0.9;
            this._glow(e, r * 2.4, flash);
            // Engines at the tail (pointing up)
            const f = Math.sin(t * 40) * 1.5;
            Neon.flame(ctx, -s * 0.22, -s * 0.62, 4, -(s * 0.15 + f), e.color, 0.7);
            Neon.flame(ctx, s * 0.22, -s * 0.62, 4, -(s * 0.15 - f), e.color, 0.7);
            // Magenta ghost copy that jitters, with the odd big glitch jump
            const big = Math.random() < 0.05;
            const gx = big ? (Math.random() - 0.5) * 24 : Math.sin(t * 13) * 3;
            const gy = big ? (Math.random() - 0.5) * 12 : Math.cos(t * 9) * 2;
            ctx.save();
            ctx.translate(gx, gy);
            ctx.globalAlpha = big ? 0.6 : 0.35;
            Neon.sprite(ctx, 'm_echo|' + e.accent, s * 1.2 + 6, this._bake.glitch_echo, e.accent, s, false);
            ctx.restore();
            if (flash) ctx.scale(1.05, 0.96);
            Neon.sprite(ctx, 'm_echo|' + e.color + (flash ? '|f' : ''), s * 1.2 + 6, this._bake.glitch_echo, e.color, s, flash);
        },
    },

    draw(ctx, e, flash) {
        this._neon[e.type].call(this, ctx, e, e.radius, flash);
    },

    // Top-of-screen HP bar and timer (same place as the boss bar; they never overlap)
    drawBar(ctx) {
        const e = this.current();
        if (!e || e.y < 0) return;
        const timeLeft = Math.max(0, MIDBOSS_TIME_LIMIT - e.onScreenTime);
        Neon.topBar(ctx, 'MID-BOSS — ' + e.midboss.name, e.hp / e.maxHp, e.color, timeLeft);
    },
};


// === waves.js ===
// ============================================================
//  SCHEDULER (game-time delayed actions)
// ============================================================
// Delayed spawns and state changes run on game time, not wall-clock time, so
// they pause with the game and are discarded when a level restarts.
const Scheduler = {
    time: 0,
    queue: [],

    after(seconds, fn) {
        this.queue.push({ at: this.time + Math.max(0, seconds), fn });
    },

    update(dt) {
        this.time += dt;
        // Run due items in order; items scheduled while running wait for the next update
        const due = this.queue.filter(item => item.at <= this.time).sort((a, b) => a.at - b.at);
        if (due.length === 0) return;
        this.queue = this.queue.filter(item => item.at > this.time);
        for (const item of due) item.fn();
    },

    get pending() { return this.queue.length; },

    clear() {
        this.time = 0;
        this.queue = [];
    }
};


// ============================================================
//  WAVE SYSTEM (Data-driven level sequencer)
// ============================================================
const WaveSystem = {
    waves: [],
    currentWaveIndex: 0,
    levelTimer: 0,
    levelComplete: false,
    bossActive: false,

    loadLevel(levelData) {
        this.waves = levelData.waves;
        this.currentWaveIndex = 0;
        this.levelTimer = 0;
        this.waveTime = 0;
        this.levelComplete = false;
        this.bossActive = false;
    },

    update(dt) {
        this.levelTimer += dt;
        // Wave schedule clock: paused while a mid-boss is on screen, so the stage waits for it
        if (!MidBoss.current()) this.waveTime += dt;

        // Spawn waves based on timing; nothing else spawns while a mid-boss is on screen
        while (this.currentWaveIndex < this.waves.length && !MidBoss.current()) {
            const wave = this.waves[this.currentWaveIndex];
            if (this.waveTime >= wave.time) {
                this._spawnWave(wave);
                this.currentWaveIndex++;
            } else {
                break;
            }
        }
    },

    _spawnWave(wave) {
        if (wave.midboss) {
            MidBoss.spawn(wave.midboss);
            return;
        }
        for (const group of wave.enemies) {
            for (let i = 0; i < group.count; i++) {
                let x, y;
                const spacing = PLAY_W / (group.count + 1);

                switch (group.formation) {
                    case 'line':
                        x = spacing * (i + 1);
                        y = -20 - i * 15;
                        break;
                    case 'v_shape':
                        x = PLAY_W / 2 + (i - (group.count - 1) / 2) * 50;
                        y = -20 - Math.abs(i - (group.count - 1) / 2) * 25;
                        break;
                    case 'random':
                        x = 40 + Math.random() * (PLAY_W - 80);
                        y = -20 - Math.random() * 60;
                        break;
                    case 'sides':
                        x = i % 2 === 0 ? -15 : PLAY_W + 15;
                        y = 60 + (Math.floor(i / 2)) * 40;
                        break;
                    default:
                        x = spacing * (i + 1);
                        y = -20;
                }

                // Delayed spawn (game time — pauses with the game)
                Scheduler.after(((group.delay || 0) + i * (group.stagger || 200)) / 1000, () => {
                    Enemies.spawn(group.type, x, y, group.movePath || 'straight_down');
                });
            }
        }
    },

    // All waves dispatched and every delayed spawn has happened
    allWavesSpawned() {
        return this.currentWaveIndex >= this.waves.length && Scheduler.pending === 0;
    },

    isComplete() {
        return this.allWavesSpawned() && Enemies.list.length === 0 && !this.bossActive;
    }
};


// ============================================================
//  LEVEL 1 DATA
// ============================================================
const LEVEL_1 = {
    id: 'level_1',
    name: 'First Contact',
    briefing: 'Unidentified hostile forces detected over Neo-Tokyo.\nYou are cleared for launch, pilot.',
    bgType: 'synthwave',
    bossType: 'architect',
    levelScale: 1.0,
    waves: [
        // INTRO (0-30s)
        { time: 0.5, enemies: [{ type: 'scout_drone', count: 5, formation: 'v_shape', movePath: 'straight_down' }] },
        { time: 3, enemies: [{ type: 'scout_drone', count: 4, formation: 'line', movePath: 'sweep_left', stagger: 300 }] },
        { time: 6, enemies: [{ type: 'scout_drone', count: 4, formation: 'line', movePath: 'sweep_right', stagger: 300 }] },
        { time: 9, enemies: [{ type: 'scout_drone', count: 6, formation: 'v_shape', movePath: 'zigzag' }] },
        { time: 13, enemies: [{ type: 'scout_drone', count: 8, formation: 'line', movePath: 'straight_down', stagger: 150 }] },

        // BUILD-UP (18-50s)
        { time: 18, enemies: [
            { type: 'scout_drone', count: 4, formation: 'v_shape', movePath: 'straight_down' },
            { type: 'gunship', count: 1, formation: 'random', movePath: 'strafe', delay: 500 }
        ]},
        { time: 24, enemies: [{ type: 'gunship', count: 2, formation: 'sides', movePath: 'strafe' }] },
        { time: 28, enemies: [
            { type: 'scout_drone', count: 6, formation: 'line', movePath: 'zigzag', stagger: 100 },
            { type: 'gunship', count: 1, formation: 'random', movePath: 'strafe', delay: 1000 }
        ]},
        { time: 34, enemies: [{ type: 'missile_turret', count: 1, formation: 'random', movePath: 'hover' }] },
        { time: 38, enemies: [
            { type: 'scout_drone', count: 5, formation: 'v_shape', movePath: 'sweep_left' },
            { type: 'gunship', count: 2, formation: 'random', movePath: 'strafe', delay: 800 }
        ]},
        { time: 44, enemies: [
            { type: 'missile_turret', count: 2, formation: 'line', movePath: 'hover' },
            { type: 'scout_drone', count: 4, formation: 'random', movePath: 'straight_down', delay: 500 }
        ]},

        // ESCALATION (50-90s)
        { time: 52, midboss: 'sentinel' }, // MID-BOSS — wave clock pauses until it is destroyed or escapes
        { time: 52, enemies: [{ type: 'phase_shifter', count: 1, formation: 'random', movePath: 'hover' }] },
        { time: 56, enemies: [
            { type: 'scout_drone', count: 6, formation: 'v_shape', movePath: 'zigzag' },
            { type: 'gunship', count: 2, formation: 'sides', movePath: 'strafe' }
        ]},
        { time: 62, enemies: [
            { type: 'phase_shifter', count: 2, formation: 'random', movePath: 'hover' },
            { type: 'scout_drone', count: 4, formation: 'line', movePath: 'straight_down', stagger: 200 }
        ]},
        { time: 70, enemies: [{ type: 'shielded_cruiser', count: 1, formation: 'random', movePath: 'hover' }] },
        { time: 75, enemies: [
            { type: 'phase_shifter', count: 1, formation: 'random', movePath: 'hover' },
            { type: 'gunship', count: 3, formation: 'random', movePath: 'strafe' }
        ]},
        { time: 82, enemies: [
            { type: 'shielded_cruiser', count: 1, formation: 'random', movePath: 'hover' },
            { type: 'scout_drone', count: 8, formation: 'line', movePath: 'zigzag', stagger: 100 }
        ]},

        // PRE-BOSS (90-100s) — generous drops
        { time: 92, enemies: [
            { type: 'gunship', count: 4, formation: 'line', movePath: 'strafe', stagger: 300 },
            { type: 'phase_shifter', count: 2, formation: 'random', movePath: 'hover', delay: 1000 },
            { type: 'scout_drone', count: 6, formation: 'v_shape', movePath: 'straight_down', delay: 500 }
        ]},

        // FINALE (after the mid-boss): denser mixes, then a generous pre-boss wave
        { time: 100, enemies: [{ type: 'scout_drone', count: 8, formation: 'v_shape', movePath: 'zigzag', stagger: 100 }, { type: 'gunship', count: 2, formation: 'sides', movePath: 'strafe', delay: 600 }] },
        { time: 107, enemies: [{ type: 'missile_turret', count: 2, formation: 'line', movePath: 'hover' }, { type: 'scout_drone', count: 6, formation: 'line', movePath: 'sweep_right', stagger: 150, delay: 800 }] },
        { time: 114, enemies: [{ type: 'scout_drone', count: 10, formation: 'line', movePath: 'straight_down', stagger: 90 }, { type: 'shielded_cruiser', count: 1, formation: 'random', movePath: 'hover', delay: 1500 }] },
        { time: 123, enemies: [{ type: 'gunship', count: 3, formation: 'sides', movePath: 'strafe' }, { type: 'scout_drone', count: 6, formation: 'v_shape', movePath: 'sweep_left', delay: 700 }] },
        { time: 132, enemies: [{ type: 'phase_shifter', count: 2, formation: 'random', movePath: 'hover' }, { type: 'missile_turret', count: 1, formation: 'random', movePath: 'hover', delay: 500 }, { type: 'scout_drone', count: 8, formation: 'v_shape', movePath: 'straight_down', delay: 1200 }] },
        { time: 141, enemies: [{ type: 'gunship', count: 4, formation: 'line', movePath: 'strafe', stagger: 250 }, { type: 'shielded_cruiser', count: 1, formation: 'random', movePath: 'hover', delay: 1000 }] },
    ]
};


// ============================================================
//  LEVEL 2-6 DATA
// ============================================================
const LEVEL_2 = {
    id: 'level_2', name: 'The Gauntlet',
    briefing: 'The enemy has fortified the industrial sector.\nIntelligence suggests heavy artillery emplacements.\nPush through.',
    bgType: 'industrial',
    bossType: 'furnace',
    levelScale: 1.25,
    waves: [
        { time: 0.5, enemies: [{ type: 'scout_drone', count: 6, formation: 'v_shape', movePath: 'straight_down' }] },
        { time: 3, enemies: [{ type: 'scout_drone', count: 5, formation: 'line', movePath: 'zigzag', stagger: 200 }] },
        { time: 7, enemies: [{ type: 'gunship', count: 2, formation: 'sides', movePath: 'strafe' }] },
        { time: 11, enemies: [{ type: 'bomber', count: 1, formation: 'random', movePath: 'straight_down' }] },
        { time: 15, enemies: [{ type: 'scout_drone', count: 8, formation: 'line', movePath: 'sweep_left', stagger: 150 }, { type: 'sniper', count: 1, formation: 'random', movePath: 'hover', delay: 500 }] },
        { time: 20, enemies: [{ type: 'bomber', count: 2, formation: 'line', movePath: 'straight_down', stagger: 800 }] },
        { time: 25, enemies: [{ type: 'gunship', count: 3, formation: 'random', movePath: 'strafe' }, { type: 'sniper', count: 2, formation: 'random', movePath: 'hover', delay: 1000 }] },
        { time: 32, enemies: [{ type: 'missile_turret', count: 2, formation: 'line', movePath: 'hover' }, { type: 'bomber', count: 1, formation: 'random', movePath: 'straight_down', delay: 500 }] },
        { time: 38, enemies: [{ type: 'scout_drone', count: 10, formation: 'v_shape', movePath: 'zigzag', stagger: 100 }] },
        { time: 44, enemies: [{ type: 'sniper', count: 3, formation: 'line', movePath: 'hover' }, { type: 'gunship', count: 2, formation: 'sides', movePath: 'strafe', delay: 1000 }] },
        { time: 48, midboss: 'forge_walker' }, // MID-BOSS — wave clock pauses until it is destroyed or escapes
        { time: 52, enemies: [{ type: 'bomber', count: 2, formation: 'random', movePath: 'straight_down' }, { type: 'missile_turret', count: 2, formation: 'random', movePath: 'hover', delay: 800 }] },
        { time: 60, enemies: [{ type: 'phase_shifter', count: 1, formation: 'random', movePath: 'hover' }, { type: 'sniper', count: 2, formation: 'random', movePath: 'hover', delay: 500 }] },
        { time: 68, enemies: [{ type: 'bomber', count: 3, formation: 'line', movePath: 'straight_down', stagger: 600 }, { type: 'scout_drone', count: 6, formation: 'v_shape', movePath: 'sweep_right', delay: 1000 }] },
        { time: 78, enemies: [{ type: 'shielded_cruiser', count: 1, formation: 'random', movePath: 'hover' }, { type: 'sniper', count: 2, formation: 'random', movePath: 'hover', delay: 1500 }] },
        { time: 88, enemies: [{ type: 'gunship', count: 4, formation: 'line', movePath: 'strafe', stagger: 300 }, { type: 'bomber', count: 2, formation: 'random', movePath: 'straight_down', delay: 1000 }] },

        // FINALE: artillery push
        { time: 96, enemies: [{ type: 'bomber', count: 2, formation: 'line', movePath: 'straight_down', stagger: 600 }, { type: 'sniper', count: 2, formation: 'random', movePath: 'hover', delay: 800 }] },
        { time: 104, enemies: [{ type: 'scout_drone', count: 10, formation: 'v_shape', movePath: 'zigzag', stagger: 90 }, { type: 'gunship', count: 2, formation: 'sides', movePath: 'strafe', delay: 1000 }] },
        { time: 112, enemies: [{ type: 'sniper', count: 3, formation: 'line', movePath: 'hover' }, { type: 'scout_drone', count: 8, formation: 'line', movePath: 'sweep_right', stagger: 120, delay: 600 }] },
        { time: 121, enemies: [{ type: 'bomber', count: 3, formation: 'random', movePath: 'straight_down', stagger: 500 }, { type: 'gunship', count: 3, formation: 'random', movePath: 'strafe', delay: 1000 }] },
        { time: 130, enemies: [{ type: 'shielded_cruiser', count: 1, formation: 'random', movePath: 'hover' }, { type: 'sniper', count: 2, formation: 'random', movePath: 'hover', delay: 1200 }, { type: 'scout_drone', count: 6, formation: 'v_shape', movePath: 'straight_down', delay: 600 }] },
        { time: 139, enemies: [{ type: 'gunship', count: 4, formation: 'line', movePath: 'strafe', stagger: 250 }, { type: 'bomber', count: 2, formation: 'random', movePath: 'straight_down', delay: 800 }] },
    ]
};

const LEVEL_3 = {
    id: 'level_3', name: 'Debris Field',
    briefing: "We've traced enemy signals to the orbital debris field.\nWatch for hazards — sensors are unreliable in there.",
    bgType: 'space',
    bossType: 'leviathan',
    levelScale: 1.5,
    hasAsteroids: true,
    waves: [
        { time: 1, enemies: [{ type: 'scout_drone', count: 4, formation: 'line', movePath: 'zigzag' }] },
        { time: 5, enemies: [{ type: 'scout_drone', count: 6, formation: 'v_shape', movePath: 'sweep_left', stagger: 200 }] },
        { time: 10, enemies: [{ type: 'carrier', count: 1, formation: 'random', movePath: 'hover' }] },
        { time: 16, enemies: [{ type: 'gunship', count: 3, formation: 'sides', movePath: 'strafe' }] },
        { time: 22, enemies: [{ type: 'scout_drone', count: 8, formation: 'line', movePath: 'straight_down', stagger: 120 }, { type: 'carrier', count: 1, formation: 'random', movePath: 'hover', delay: 1000 }] },
        { time: 30, enemies: [{ type: 'phase_shifter', count: 2, formation: 'random', movePath: 'hover' }] },
        { time: 36, enemies: [{ type: 'carrier', count: 2, formation: 'line', movePath: 'hover', stagger: 1500 }] },
        { time: 44, enemies: [{ type: 'missile_turret', count: 2, formation: 'random', movePath: 'hover' }, { type: 'scout_drone', count: 6, formation: 'v_shape', movePath: 'zigzag', delay: 500 }] },
        { time: 48, midboss: 'debris_hauler' }, // MID-BOSS — wave clock pauses until it is destroyed or escapes
        { time: 52, enemies: [{ type: 'gunship', count: 4, formation: 'random', movePath: 'strafe' }, { type: 'phase_shifter', count: 1, formation: 'random', movePath: 'hover', delay: 800 }] },
        { time: 60, enemies: [{ type: 'shielded_cruiser', count: 1, formation: 'random', movePath: 'hover' }, { type: 'carrier', count: 1, formation: 'random', movePath: 'hover', delay: 1000 }] },
        { time: 70, enemies: [{ type: 'phase_shifter', count: 3, formation: 'random', movePath: 'hover', stagger: 600 }] },
        { time: 80, enemies: [{ type: 'carrier', count: 2, formation: 'random', movePath: 'hover' }, { type: 'gunship', count: 3, formation: 'sides', movePath: 'strafe', delay: 1000 }] },

        // FINALE: deep debris — carriers and shifters in the rocks
        { time: 90, enemies: [{ type: 'scout_drone', count: 8, formation: 'v_shape', movePath: 'zigzag', stagger: 100 }, { type: 'carrier', count: 1, formation: 'random', movePath: 'hover', delay: 1000 }] },
        { time: 99, enemies: [{ type: 'gunship', count: 3, formation: 'sides', movePath: 'strafe' }, { type: 'phase_shifter', count: 1, formation: 'random', movePath: 'hover', delay: 800 }] },
        { time: 108, enemies: [{ type: 'phase_shifter', count: 2, formation: 'random', movePath: 'hover', stagger: 500 }, { type: 'gunship', count: 2, formation: 'random', movePath: 'strafe', delay: 1000 }] },
        { time: 117, enemies: [{ type: 'carrier', count: 1, formation: 'random', movePath: 'hover' }, { type: 'shielded_cruiser', count: 1, formation: 'random', movePath: 'hover', delay: 1500 }] },
        { time: 127, enemies: [{ type: 'scout_drone', count: 10, formation: 'v_shape', movePath: 'straight_down', stagger: 80 }, { type: 'phase_shifter', count: 2, formation: 'random', movePath: 'hover', delay: 1200 }] },
        { time: 137, enemies: [{ type: 'gunship', count: 4, formation: 'line', movePath: 'strafe', stagger: 250 }, { type: 'carrier', count: 1, formation: 'random', movePath: 'hover', delay: 1000 }] },
    ]
};

const LEVEL_4 = {
    id: 'level_4', name: 'The Convoy',
    briefing: 'Command is deploying the carrier AURORA through\ncontested airspace. Escort her through.\nShe cannot fall.',
    bgType: 'sky',
    bossType: 'interceptor_duo',
    levelScale: 1.8,
    hasEscort: true,
    waves: [
        { time: 1, enemies: [{ type: 'scout_drone', count: 6, formation: 'v_shape', movePath: 'straight_down' }] },
        { time: 5, enemies: [{ type: 'scout_drone', count: 4, formation: 'line', movePath: 'sweep_left', stagger: 200 }, { type: 'scout_drone', count: 4, formation: 'line', movePath: 'sweep_right', stagger: 200, delay: 500 }] },
        { time: 10, enemies: [{ type: 'gunship', count: 3, formation: 'random', movePath: 'strafe' }] },
        { time: 15, enemies: [{ type: 'shield_wall', count: 5, formation: 'line', movePath: 'straight_down', stagger: 100 }] },
        { time: 20, enemies: [{ type: 'bomber', count: 2, formation: 'random', movePath: 'straight_down' }, { type: 'scout_drone', count: 6, formation: 'v_shape', movePath: 'zigzag', delay: 500 }] },
        { time: 28, enemies: [{ type: 'shield_wall', count: 6, formation: 'line', movePath: 'straight_down', stagger: 80 }, { type: 'sniper', count: 2, formation: 'random', movePath: 'hover', delay: 1000 }] },
        { time: 35, enemies: [{ type: 'missile_turret', count: 2, formation: 'random', movePath: 'hover' }, { type: 'bomber', count: 2, formation: 'random', movePath: 'straight_down', delay: 800 }] },
        { time: 42, enemies: [{ type: 'phase_shifter', count: 2, formation: 'random', movePath: 'hover' }, { type: 'shield_wall', count: 4, formation: 'line', movePath: 'straight_down', delay: 500, stagger: 100 }] },
        { time: 46, midboss: 'strike_leader' }, // MID-BOSS — wave clock pauses until it is destroyed or escapes
        { time: 50, enemies: [{ type: 'carrier', count: 1, formation: 'random', movePath: 'hover' }, { type: 'gunship', count: 3, formation: 'sides', movePath: 'strafe', delay: 1000 }] },
        { time: 58, enemies: [{ type: 'shielded_cruiser', count: 1, formation: 'random', movePath: 'hover' }, { type: 'bomber', count: 2, formation: 'random', movePath: 'straight_down', delay: 800 }] },
        { time: 68, enemies: [{ type: 'shield_wall', count: 8, formation: 'line', movePath: 'straight_down', stagger: 80 }, { type: 'phase_shifter', count: 2, formation: 'random', movePath: 'hover', delay: 1500 }] },
        { time: 78, enemies: [{ type: 'carrier', count: 2, formation: 'random', movePath: 'hover' }, { type: 'sniper', count: 3, formation: 'random', movePath: 'hover', delay: 1000 }] },

        // FINALE: the convoy's final approach
        { time: 88, enemies: [{ type: 'shield_wall', count: 6, formation: 'line', movePath: 'straight_down', stagger: 80 }, { type: 'gunship', count: 2, formation: 'sides', movePath: 'strafe', delay: 800 }] },
        { time: 96, enemies: [{ type: 'bomber', count: 2, formation: 'random', movePath: 'straight_down' }, { type: 'sniper', count: 2, formation: 'random', movePath: 'hover', delay: 1000 }] },
        { time: 105, enemies: [{ type: 'phase_shifter', count: 2, formation: 'random', movePath: 'hover' }, { type: 'shield_wall', count: 6, formation: 'line', movePath: 'straight_down', stagger: 80, delay: 1000 }] },
        { time: 114, enemies: [{ type: 'missile_turret', count: 2, formation: 'random', movePath: 'hover' }, { type: 'bomber', count: 2, formation: 'random', movePath: 'straight_down', delay: 800 }] },
        { time: 124, enemies: [{ type: 'shielded_cruiser', count: 1, formation: 'random', movePath: 'hover' }, { type: 'gunship', count: 3, formation: 'sides', movePath: 'strafe', delay: 1000 }] },
        { time: 134, enemies: [{ type: 'carrier', count: 1, formation: 'random', movePath: 'hover' }, { type: 'sniper', count: 2, formation: 'random', movePath: 'hover', delay: 1000 }, { type: 'shield_wall', count: 8, formation: 'line', movePath: 'straight_down', stagger: 70, delay: 1500 }] },
    ]
};

const LEVEL_5 = {
    id: 'level_5', name: 'The Core',
    briefing: "This is it. The signal origin — some kind of\nintelligence at the center of it all.\nEnd this.",
    bgType: 'digital',
    bossType: 'nexus',
    levelScale: 2.1,
    waves: [
        { time: 0.5, enemies: [{ type: 'phase_shifter', count: 2, formation: 'random', movePath: 'hover' }] },
        { time: 5, enemies: [{ type: 'scout_drone', count: 10, formation: 'line', movePath: 'zigzag', stagger: 80 }] },
        { time: 10, enemies: [{ type: 'shielded_cruiser', count: 1, formation: 'random', movePath: 'hover' }, { type: 'sniper', count: 2, formation: 'random', movePath: 'hover', delay: 500 }] },
        { time: 17, enemies: [{ type: 'bomber', count: 3, formation: 'line', movePath: 'straight_down', stagger: 500 }] },
        { time: 24, enemies: [{ type: 'carrier', count: 2, formation: 'random', movePath: 'hover', stagger: 2000 }] },
        { time: 32, enemies: [{ type: 'phase_shifter', count: 3, formation: 'random', movePath: 'hover', stagger: 500 }, { type: 'gunship', count: 4, formation: 'sides', movePath: 'strafe', delay: 1000 }] },
        { time: 40, enemies: [{ type: 'shielded_cruiser', count: 2, formation: 'line', movePath: 'hover', stagger: 2000 }] },
        { time: 46, midboss: 'core_warden' }, // MID-BOSS — wave clock pauses until it is destroyed or escapes
        { time: 48, enemies: [{ type: 'shield_wall', count: 8, formation: 'line', movePath: 'straight_down', stagger: 60 }, { type: 'bomber', count: 2, formation: 'random', movePath: 'straight_down', delay: 1000 }] },
        { time: 56, enemies: [{ type: 'carrier', count: 1, formation: 'random', movePath: 'hover' }, { type: 'phase_shifter', count: 2, formation: 'random', movePath: 'hover', delay: 800 }, { type: 'sniper', count: 3, formation: 'random', movePath: 'hover', delay: 1500 }] },
        { time: 66, enemies: [{ type: 'shielded_cruiser', count: 2, formation: 'random', movePath: 'hover' }, { type: 'missile_turret', count: 3, formation: 'line', movePath: 'hover', delay: 1000 }] },
        { time: 76, enemies: [{ type: 'bomber', count: 3, formation: 'random', movePath: 'straight_down', stagger: 400 }, { type: 'carrier', count: 2, formation: 'random', movePath: 'hover', delay: 1500 }, { type: 'phase_shifter', count: 2, formation: 'random', movePath: 'hover', delay: 2000 }] },

        // FINALE: the core's last defences
        { time: 86, enemies: [{ type: 'phase_shifter', count: 3, formation: 'random', movePath: 'hover', stagger: 400 }, { type: 'scout_drone', count: 10, formation: 'line', movePath: 'zigzag', stagger: 80, delay: 600 }] },
        { time: 95, enemies: [{ type: 'shielded_cruiser', count: 2, formation: 'line', movePath: 'hover', stagger: 1500 }, { type: 'sniper', count: 2, formation: 'random', movePath: 'hover', delay: 800 }] },
        { time: 104, enemies: [{ type: 'carrier', count: 1, formation: 'random', movePath: 'hover' }, { type: 'missile_turret', count: 2, formation: 'line', movePath: 'hover', delay: 1000 }] },
        { time: 113, enemies: [{ type: 'shield_wall', count: 8, formation: 'line', movePath: 'straight_down', stagger: 60 }, { type: 'phase_shifter', count: 2, formation: 'random', movePath: 'hover', delay: 1200 }] },
        { time: 123, enemies: [{ type: 'shielded_cruiser', count: 2, formation: 'random', movePath: 'hover' }, { type: 'sniper', count: 3, formation: 'random', movePath: 'hover', delay: 1000 }] },
        { time: 133, enemies: [{ type: 'bomber', count: 3, formation: 'random', movePath: 'straight_down', stagger: 400 }, { type: 'carrier', count: 1, formation: 'random', movePath: 'hover', delay: 1500 }, { type: 'gunship', count: 2, formation: 'sides', movePath: 'strafe', delay: 800 }] },
    ]
};

const LEVEL_6 = {
    id: 'level_6', name: 'SIGNAL LOST',
    briefing: "You weren't supposed to find this.\nThe signal continues. It was never the source.\nIt was a relay.\nWhatever is on the other side... it knows you're coming.",
    bgType: 'void',
    bossType: 'echo',
    levelScale: 2.5,
    waves: [
        { time: 1, enemies: [{ type: 'phase_shifter', count: 3, formation: 'random', movePath: 'hover', stagger: 400 }] },
        { time: 7, enemies: [{ type: 'scout_drone', count: 12, formation: 'v_shape', movePath: 'zigzag', stagger: 60 }] },
        { time: 13, enemies: [{ type: 'bomber', count: 3, formation: 'line', movePath: 'straight_down', stagger: 400 }, { type: 'sniper', count: 3, formation: 'random', movePath: 'hover', delay: 800 }] },
        { time: 20, enemies: [{ type: 'carrier', count: 2, formation: 'random', movePath: 'hover' }, { type: 'shielded_cruiser', count: 1, formation: 'random', movePath: 'hover', delay: 1000 }] },
        { time: 28, enemies: [{ type: 'shield_wall', count: 10, formation: 'line', movePath: 'straight_down', stagger: 50 }] },
        { time: 34, enemies: [{ type: 'phase_shifter', count: 4, formation: 'random', movePath: 'hover', stagger: 300 }, { type: 'bomber', count: 2, formation: 'random', movePath: 'straight_down', delay: 1000 }] },
        { time: 42, enemies: [{ type: 'shielded_cruiser', count: 2, formation: 'line', movePath: 'hover', stagger: 1500 }, { type: 'carrier', count: 2, formation: 'random', movePath: 'hover', delay: 1000 }] },
        { time: 46, midboss: 'glitch_echo' }, // MID-BOSS — wave clock pauses until it is destroyed or escapes
        { time: 52, enemies: [{ type: 'missile_turret', count: 3, formation: 'random', movePath: 'hover' }, { type: 'sniper', count: 4, formation: 'random', movePath: 'hover', delay: 500 }] },
        { time: 60, enemies: [{ type: 'bomber', count: 4, formation: 'random', movePath: 'straight_down', stagger: 300 }, { type: 'phase_shifter', count: 3, formation: 'random', movePath: 'hover', delay: 1500 }] },
        { time: 70, enemies: [{ type: 'carrier', count: 3, formation: 'random', movePath: 'hover', stagger: 1000 }, { type: 'shielded_cruiser', count: 2, formation: 'random', movePath: 'hover', delay: 2000 }] },

        // FINALE: the relay collapses
        { time: 80, enemies: [{ type: 'scout_drone', count: 12, formation: 'v_shape', movePath: 'zigzag', stagger: 60 }, { type: 'phase_shifter', count: 2, formation: 'random', movePath: 'hover', delay: 800 }] },
        { time: 89, enemies: [{ type: 'shielded_cruiser', count: 2, formation: 'line', movePath: 'hover', stagger: 1500 }, { type: 'bomber', count: 2, formation: 'random', movePath: 'straight_down', delay: 800 }] },
        { time: 99, enemies: [{ type: 'carrier', count: 2, formation: 'random', movePath: 'hover' }, { type: 'phase_shifter', count: 3, formation: 'random', movePath: 'hover', stagger: 300, delay: 1000 }] },
        { time: 109, enemies: [{ type: 'bomber', count: 4, formation: 'random', movePath: 'straight_down', stagger: 300 }, { type: 'missile_turret', count: 2, formation: 'random', movePath: 'hover', delay: 1000 }] },
        { time: 119, enemies: [{ type: 'phase_shifter', count: 4, formation: 'random', movePath: 'hover', stagger: 300 }, { type: 'gunship', count: 4, formation: 'sides', movePath: 'strafe', delay: 1000 }] },
        { time: 129, enemies: [{ type: 'shielded_cruiser', count: 2, formation: 'random', movePath: 'hover' }, { type: 'carrier', count: 2, formation: 'random', movePath: 'hover', delay: 1000 }, { type: 'sniper', count: 3, formation: 'random', movePath: 'hover', delay: 1500 }] },
    ]
};

const ALL_LEVELS = [LEVEL_1, LEVEL_2, LEVEL_3, LEVEL_4, LEVEL_5, LEVEL_6];

// ============================================================
//  ENDLESS MODE WAVE GENERATOR
// ============================================================
const EndlessMode = {
    active: false,
    wave: 0,
    spawnTimer: 0,
    spawnInterval: 4.0,
    rank: 1.0, // Difficulty scaling — increases over time
    // Concurrent enemy ceiling: keeps late Endless readable and under the 800-bullet pool.
    // Rank still escalates spawn rate, enemy mix and (capped) stats up to this limit.
    MAX_ENEMIES: 30,

    // Enemy pools by difficulty tier
    easyPool: ['scout_drone', 'scout_drone', 'gunship'],
    medPool: ['gunship', 'missile_turret', 'bomber', 'sniper', 'shield_wall'],
    hardPool: ['phase_shifter', 'shielded_cruiser', 'carrier'],

    // Formations and paths
    formations: ['line', 'v_shape', 'random', 'sides'],
    paths: ['straight_down', 'sweep_left', 'sweep_right', 'zigzag', 'strafe', 'hover'],

    init() {
        this.active = true;
        this.wave = 0;
        this.spawnTimer = 2.0; // Brief grace period
        this.spawnInterval = 4.0;
        this.rank = 1.0;
    },

    update(dt) {
        if (!this.active) return;

        // Rank increases over time
        this.rank = 1.0 + WaveSystem.levelTimer * 0.008; // ~1.5x at 1 min, ~2.0x at 2 min, etc.

        // Spawn waves on timer (held while the screen is at the enemy cap)
        if (Enemies.list.length < this.MAX_ENEMIES) this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
            this._spawnWave();
            this.wave++;
            // Interval decreases with rank (faster spawns over time)
            this.spawnInterval = Math.max(1.5, 4.0 - this.rank * 0.3);
            this.spawnTimer = this.spawnInterval;
        }
    },

    _spawnWave() {
        const wave = this.wave;
        const rank = this.rank;

        // Determine enemy composition based on wave number
        const enemies = [];

        // Always some easy enemies
        const easyCount = Math.floor(3 + rank * 2);
        const easyType = this.easyPool[Math.floor(Math.random() * this.easyPool.length)];
        enemies.push({
            type: easyType, count: easyCount,
            formation: this.formations[Math.floor(Math.random() * this.formations.length)],
            movePath: this.paths[Math.floor(Math.random() * this.paths.length)],
            stagger: 150
        });

        // Add medium enemies after wave 3
        if (wave >= 3) {
            const medCount = Math.floor(1 + rank * 0.5);
            const medType = this.medPool[Math.floor(Math.random() * this.medPool.length)];
            enemies.push({
                type: medType, count: Math.min(medCount, 4),
                formation: 'random',
                movePath: this.paths[Math.floor(Math.random() * this.paths.length)],
                delay: 800
            });
        }

        // Add hard enemies after wave 8
        if (wave >= 8) {
            const hardType = this.hardPool[Math.floor(Math.random() * this.hardPool.length)];
            enemies.push({
                type: hardType, count: Math.min(Math.floor(rank * 0.3), 3),
                formation: 'random',
                movePath: 'hover',
                delay: 1500
            });
        }

        // Power-up drop every 3 waves
        if (wave % 3 === 2) {
            Scheduler.after(2, () => { PowerUps.spawn(PLAY_W * 0.3 + Math.random() * PLAY_W * 0.4, -10); });
        }

        // Spawn via WaveSystem-style spawning
        for (const group of enemies) {
            for (let i = 0; i < group.count; i++) {
                const spacing = PLAY_W / (group.count + 1);
                let x, y;
                switch (group.formation) {
                    case 'line': x = spacing * (i + 1); y = -20 - i * 15; break;
                    case 'v_shape': x = PLAY_W / 2 + (i - (group.count - 1) / 2) * 50; y = -20 - Math.abs(i - (group.count - 1) / 2) * 25; break;
                    case 'sides': x = i % 2 === 0 ? -15 : PLAY_W + 15; y = 60 + Math.floor(i / 2) * 40; break;
                    default: x = 40 + Math.random() * (PLAY_W - 80); y = -20 - Math.random() * 60; break;
                }
                const delay = (group.delay || 0) + i * (group.stagger || 200);
                Scheduler.after(delay / 1000, () => {
                    if (Enemies.list.length < EndlessMode.MAX_ENEMIES) {
                        Enemies.spawn(group.type, x, y, group.movePath || 'straight_down');
                    }
                });
            }
        }
    }
};


// === level-systems.js ===
// ============================================================
//  ASTEROID SYSTEM (Level 3)
// ============================================================
const Asteroids = {
    list: [],
    active: false,

    SPAWN_PER_SECOND: 1.2,

    init() { this.list = []; this.active = false; },
    activate() { this.active = true; },

    update(dt) {
        if (!this.active) return;
        // Spawn new asteroids periodically
        if (Math.random() < this.SPAWN_PER_SECOND * dt) { // frame-rate independent
            const big = Math.random() > 0.6;
            this.list.push({
                x: 20 + Math.random() * (PLAY_W - 40),
                y: -40,
                vx: (Math.random() - 0.5) * 30,
                vy: 60 + Math.random() * 80,
                radius: big ? 20 + Math.random() * 15 : 8 + Math.random() * 10,
                hp: big ? 3 : 1,
                destructible: Math.random() > 0.15,
                rotation: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 2
            });
        }
        for (let i = this.list.length - 1; i >= 0; i--) {
            const a = this.list[i];
            a.x += a.vx * dt;
            a.y += a.vy * dt;
            a.rotation += a.rotSpeed * dt;
            if (a.y > PLAY_H + 50) { this.list.splice(i, 1); continue; }
            if (a.hp <= 0) {
                // Break into smaller pieces if big enough
                if (a.radius > 15) {
                    for (let j = 0; j < 3; j++) {
                        this.list.push({
                            x: a.x + (Math.random() - 0.5) * 15, y: a.y + (Math.random() - 0.5) * 15,
                            vx: (Math.random() - 0.5) * 60, vy: a.vy * 0.8 + Math.random() * 30,
                            radius: 5 + Math.random() * 6, hp: 1, destructible: true,
                            rotation: Math.random() * Math.PI * 2, rotSpeed: (Math.random() - 0.5) * 3
                        });
                    }
                }
                Particles.spawn(a.x, a.y, 8, { color: '#ddaa77', speed: 80, life: 0.3, size: 2 });
                Particles.shatter(a.x, a.y, this._shape(Math.round(a.radius)), a.radius, a.rotation, '#ddaa77', 0.8);
                Scoring.score += Math.floor(50 * GameConfig.scoreMultiplier);
                Audio.playAsteroidBreak();
                this.list.splice(i, 1);
            }
        }
    },

    // Neon rocks: an irregular outline with facet lines, baked per size.
    // Destructible rocks are warm; the indestructible ones are steel blue.
    _shapes: new Map(),
    _shape(R) {
        let pts = this._shapes.get(R);
        if (!pts) {
            pts = [];
            for (let j = 0; j < 9; j++) {
                const ang = (Math.PI * 2 / 9) * j;
                const h = Math.sin(j * 12.9898 + R * 78.233) * 43758.5453;
                const k = 0.72 + (h - Math.floor(h)) * 0.3;
                pts.push(Math.cos(ang) * k, Math.sin(ang) * k);
            }
            this._shapes.set(R, pts);
        }
        return pts;
    },
    _bake(c, R, hard) {
        const pts = Asteroids._shape(R);
        const color = hard ? '#8899ff' : '#ddaa77';
        Neon.shape(c, pts, R, color, 1.1, false, hard ? 0.22 : 0.16);
        // Facets meet at an off-centre point
        const fx = R * 0.15, fy = -R * 0.1;
        c.strokeStyle = color;
        c.lineWidth = 0.8;
        c.globalAlpha = 0.45;
        c.beginPath();
        for (let j = 0; j < pts.length; j += 6) { c.moveTo(fx, fy); c.lineTo(pts[j] * R * 0.95, pts[j + 1] * R * 0.95); }
        c.stroke();
        if (hard) {
            c.globalAlpha = 0.6;
            c.beginPath(); c.arc(0, 0, R * 0.45, 0, Math.PI * 2); c.stroke();
        }
        c.globalAlpha = 1;
    },

    draw(ctx) {
        for (const a of this.list) {
            const R = Math.round(a.radius);
            ctx.save();
            ctx.translate(a.x, a.y);
            ctx.rotate(a.rotation);
            Neon.sprite(ctx, 'rock|' + R + (a.destructible ? '' : '|h'), R + 5, this._bake, R, !a.destructible);
            ctx.restore();
        }
    },

    clear() { this.list = []; this.active = false; }
};


// ============================================================
//  ESCORT SYSTEM (Level 4)
// ============================================================
const Escort = {
    active: false,
    x: PLAY_W / 2,
    y: PLAY_H - 160,
    hp: 50,
    maxHp: 50,
    HIT_RADIUS: 28,
    MIN_Y: PLAY_H * 0.62,
    REGEN_PER_SECOND: 0.4,
    alive: true,
    flashTimer: 0,
    supportTimer: 8,

    init() {
        this.active = false; this.x = PLAY_W / 2; this.y = PLAY_H - 160;
        this.hp = this.maxHp; this.alive = true; this.flashTimer = 0; this.supportTimer = 8;
    },

    activate() { this.active = true; this.alive = true; },

    update(dt) {
        if (!this.active || !this.alive) return;
        this.flashTimer = Math.max(0, this.flashTimer - dt);
        this.hp = Math.min(this.maxHp, this.hp + this.REGEN_PER_SECOND * dt); // damage control repairs
        // Slowly move upward, but stay in the lower part of the screen — drifting into the
        // boss's point-blank range made the escort mission unwinnable
        this.y = Math.max(this.MIN_Y, this.y - 5 * dt);
        this.x += Math.sin(WaveSystem.levelTimer * 0.3) * 15 * dt;
        this.x = Math.max(60, Math.min(PLAY_W - 60, this.x));

        // Support fire
        this.supportTimer -= dt;
        if (this.supportTimer <= 0) {
            this.supportTimer = 6 + Math.random() * 3;
            // Fire support shots
            for (let j = -1; j <= 1; j++) {
                Player.bullets.spawn(this.x + j * 20, this.y - 30, j * 30, -400,
                    { color: '#88ff88', radius: 3, damage: 1, life: 2 });
            }
            // Drop a power-up occasionally
            if (Math.random() > 0.5) {
                PowerUps.spawn(this.x, this.y - 40);
            }
        }

        // Check enemy bullet collision
        for (const b of Enemies.enemyBullets.pool) {
            const dx = b.x - this.x, dy = b.y - this.y;
            if (b.harmless > 0) continue;
            if (dx * dx + dy * dy < this.HIT_RADIUS * this.HIT_RADIUS) {
                b.active = false;
                this.hp--;
                this.flashTimer = 0.15;
                Audio.playEscortHit();
                if (this.hp <= 0) {
                    this.alive = false;
                    Particles.spawn(this.x, this.y, 40, { color: '#88ff88', speed: 200, life: 0.8, size: 3 });
                    Particles.shatter(this.x, this.y, this._HULL, 30, 0, '#44ff88', 1.5);
                    Audio.playExplosionLarge();
                    ScreenShake.trigger(12, 0.8);
                }
            }
        }
    },

    // Neon style allied carrier, nose up (flying with the player)
    _HULL: Neon.mirror([0, -1.0, 0.22, -0.7, 0.34, -0.2, 1.0, 0.25, 0.95, 0.45, 0.4, 0.5, 0.3, 0.8, 0.12, 0.72]),
    _CANOPY: Neon.mirror([0, -0.72, 0.1, -0.5, 0.09, -0.3, 0, -0.26]),
    _bake(c, flash) {
        const S = 30, col = '#44ff88';
        Neon.shape(c, Escort._HULL, S, col, 1.5, flash, 0.2);
        Neon.path(c, Escort._HULL, S * 0.6, true);
        c.strokeStyle = col; c.globalAlpha = 0.35; c.lineWidth = 1; c.stroke();
        c.globalAlpha = 1;
        Neon.detail(c, [0, -0.2, 0, 0.6], S, '#ccffdd', 0.5, 1);                 // flight deck
        for (const y of [-0.05, 0.15, 0.35]) Neon.detail(c, [-0.06, y, 0.06, y], S, '#ccffdd', 0.7, 1);
        Neon.detail(c, [0.36, 0.05, 0.9, 0.36], S, col, 0.55, 1);
        Neon.detail(c, [-0.36, 0.05, -0.9, 0.36], S, col, 0.55, 1);
        Neon.shape(c, Escort._CANOPY, S, '#aaffcc', 0.8, flash, 0.4);
    },

    draw(ctx) {
        if (!this.active || !this.alive) return;
        const flash = this.flashTimer > 0;
        const t = WaveSystem.levelTimer || 0;
        Renderer.addGlow(this.x, this.y, 0x44ff88, 70, flash ? 0.7 : 0.25);
        ctx.save();
        ctx.translate(this.x, this.y);
        const f = Math.sin(t * 35) * 1.5;
        Neon.flame(ctx, -9, 23, 4, 8 + f, '#44ff88', 0.9);
        Neon.flame(ctx, 9, 23, 4, 8 - f, '#44ff88', 0.9);
        Neon.sprite(ctx, 'escort' + (flash ? '|f' : ''), 38, this._bake, flash);
        const blink = Math.sin(t * 5) > 0;
        Neon.light(ctx, -28, 10, 1.6, '#44ff88', blink ? 1 : 0.3);
        Neon.light(ctx, 28, 10, 1.6, '#ffffff', blink ? 0.3 : 1);
        ctx.restore();

        // HP bar
        const barW = 80, barH = 6, barX = this.x - barW / 2, barY = this.y - 35;
        ctx.fillStyle = '#002200';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = this.hp > this.maxHp * 0.3 ? '#44aa44' : '#ff4444';
        ctx.fillRect(barX, barY, barW * (this.hp / this.maxHp), barH);
        ctx.fillStyle = '#88ff88'; ctx.font = '9px Share Tech Mono, Consolas, monospace'; ctx.textAlign = 'center';
        ctx.fillText('AURORA', this.x, barY - 3);
    }
};


// ============================================================
//  CAMPAIGN SYSTEM
// ============================================================
const Campaign = {
    currentLevel: 0,
    levelsUnlocked: 1,
    secretUnlocked: false,
    levelData: ALL_LEVELS,
    levelBests: {},

    async load() {
        const data = await Storage.get('campaign');
        if (data) {
            this.levelsUnlocked = data.levelsUnlocked || 1;
            this.secretUnlocked = data.secretUnlocked || false;
            this.levelBests = data.levelBests || {};
        }
    },

    async save() {
        await Storage.set('campaign', {
            levelsUnlocked: this.levelsUnlocked,
            secretUnlocked: this.secretUnlocked,
            levelBests: this.levelBests
        });
    },

    completeLevel(levelIndex, difficulty) {
        if (levelIndex + 1 < 5 && levelIndex + 2 > this.levelsUnlocked) {
            this.levelsUnlocked = levelIndex + 2;
        }
        if (difficulty === 'normal' || difficulty === 'hardcore') {
            if (levelIndex === 4) {
                this.secretUnlocked = true;
            }
        }
        this.save();
    },

    recordLevelScore(levelIndex, score, maxChain, graze, perfect, difficulty) {
        const key = difficulty + '_L' + levelIndex;
        const existing = this.levelBests[key];
        if (!existing || score > existing.score) {
            this.levelBests[key] = { score, maxChain, graze, perfect, difficulty };
            this.save();
            return true;
        }
        return false;
    },

    getLevelBest(levelIndex, difficulty) {
        return this.levelBests[(difficulty || 'normal') + '_L' + levelIndex] || null;
    },

    getLevelCount() {
        return this.secretUnlocked ? 6 : 5;
    },

    isLevelAvailable(index, isCustom) {
        if (isCustom) return index < this.getLevelCount();
        if (index === 5) return this.secretUnlocked;
        return index < this.levelsUnlocked;
    }
};


// === bosses.js ===
// ============================================================
//  BOSS TYPE DEFINITIONS
// ============================================================
const BossTypes = {
    architect: {
        name: 'THE ARCHITECT', phases: 3, phaseHps: [200, 260, 300],
        hasArmor: true, armorCount: 4, armorHp: 40,
        colors: ['#ff4444', '#ff00ff', '#ff0040']
    },
    furnace: {
        name: 'THE FURNACE', phases: 2, phaseHps: [460, 540],
        hasArmor: false,
        colors: ['#ff6600', '#ff2200']
    },
    leviathan: {
        name: 'THE LEVIATHAN', phases: 3, phaseHps: [340, 380, 380],
        hasArmor: false,
        colors: ['#4488ff', '#00ffaa', '#ff44ff']
    },
    interceptor_duo: {
        name: 'INTERCEPTOR DUO', phases: 2, phaseHps: [300, 400], // fast-moving (low uptime): lower HP
        hasArmor: false,
        colors: ['#ffaa00', '#ff4400']
    },
    nexus: {
        name: 'THE NEXUS', phases: 3, phaseHps: [300, 380, 460],
        hasArmor: true, armorCount: 6, armorHp: 32,
        colors: ['#cc44ff', '#ff00ff', '#ffffff']
    },
    echo: {
        name: 'THE ECHO', phases: 3, phaseHps: [420, 490, 560],
        hasArmor: false,
        colors: ['#00ffff', '#ff00ff', '#ffffff']
    }
};


// Boss tuning (all bosses)
const BOSS_PHASE_TIME_LIMIT = 45;   // seconds; phase ends without its bonus (Touhou-style timeout)
const BOSS_ARMOR_ORBIT = 40;        // armor segments orbit the core at this radius
const BOSS_ARMOR_RADIUS = 16;
const BOSS_ARMORED_CORE_DAMAGE = 0.5;  // core damage multiplier while armor is up


// ============================================================
//  BOSS SYSTEM
// ============================================================
const Boss = {
    active: false,
    x: PLAY_W / 2,
    y: -100,
    phase: 0,
    hp: 0,
    maxHp: 0,
    phaseHps: [80, 120, 160],
    armor: [],
    attackTimer: 0,
    moveTimer: 0,
    patternIndex: 0,
    phaseTransitionTimer: 0,
    flashTimer: 0,
    entered: false,
    defeated: false,
    defeatTimer: 0,
    radius: 50,
    warningTimer: 0,
    bossType: 'architect',
    bossName: 'THE ARCHITECT',
    totalPhases: 3,
    colors: ['#ff4444', '#ff00ff', '#ff0040'],

    // Bullet count for a pattern at the current density (never fewer than 3)
    _n(base, density) {
        return Math.max(3, Math.round(base * density));
    },

    init(bossType) {
        bossType = bossType || 'architect';
        const def = BossTypes[bossType] || BossTypes.architect;
        this.bossType = bossType;
        this.bossName = def.name;
        this.totalPhases = def.phases;
        this.phaseHps = [...def.phaseHps];
        this.colors = [...def.colors];
        this.active = true;
        this.x = PLAY_W / 2;
        this.y = -100;
        this.phase = 1;
        this.hp = this.phaseHps[0];
        this.maxHp = this.phaseHps[0];
        this.entered = false;
        this.defeated = false;
        this.defeatTimer = 0;
        this.attackTimer = 2;
        this.moveTimer = 0;
        this.patternIndex = 0;
        this.flashTimer = 0;
        this.warningTimer = 3;
        this.phaseTime = 0;
        this.phaseTransitionTimer = 0;
        this.timedOut = false;
        // Armor segments
        this.armor = [];
        if (def.hasArmor) {
            const count = def.armorCount || 4;
            for (let i = 0; i < count; i++) {
                this.armor.push({ hp: def.armorHp || 15, angle: (Math.PI * 2 / count) * i, alive: true });
            }
        }
    },

    update(dt, playerX, playerY) {
        if (!this.active) return;

        // Warning phase
        if (this.warningTimer > 0) {
            this.warningTimer -= dt;
            return;
        }

        // Entry animation
        if (!this.entered) {
            this.y += 80 * dt;
            if (this.y >= 120) {
                this.y = 120;
                this.entered = true;
                Renderer.triggerGodray(2.5);
            }
            return;
        }

        // Defeat sequence — multi-stage dramatic explosion
        if (this.defeated) {
            this.defeatTimer += dt;

            // Stage 1 (0-1.5s): Internal explosions, increasing frequency
            if (this.defeatTimer < 1.5) {
                const freq = 0.3 - this.defeatTimer * 0.12;
                if (this.defeatTimer % Math.max(0.08, freq) < dt) {
                    const rx = this.x + (Math.random() - 0.5) * 80;
                    const ry = this.y + (Math.random() - 0.5) * 80;
                    const col = this.colors[Math.floor(Math.random() * this.colors.length)] || '#ff8800';
                    Particles.spawnExplosion(rx, ry, { style: 'small', color: col, color2: '#ffffff' });
                    Audio.playExplosionSmall();
                    ScreenShake.trigger(3 + this.defeatTimer * 3, 0.15);
                }
            }

            // Stage 2 (1.5-2.5s): Boss breaks apart, large ring explosions
            if (this.defeatTimer >= 1.5 && this.defeatTimer < 2.5) {
                if (this.defeatTimer % 0.2 < dt) {
                    const ringCount = 16;
                    const dist = (this.defeatTimer - 1.5) * 150;
                    for (let j = 0; j < ringCount; j++) {
                        const a = (Math.PI * 2 / ringCount) * j + this.defeatTimer * 2;
                        Particles.spawnExplosion(
                            this.x + Math.cos(a) * dist,
                            this.y + Math.sin(a) * dist,
                            { style: 'small', color: this.colors[j % this.colors.length] || '#ffffff', color2: '#ffffff' }
                        );
                    }
                    Audio.playExplosionSmall();
                    ScreenShake.trigger(8, 0.2);
                }
            }

            // Stage 3 (2.5-3.5s): Boss-specific mega final effect
            if (this.defeatTimer >= 2.5 && this.defeatTimer < 3.5) {
                if (this.defeatTimer - dt < 2.5) {
                    // The hull shatters and stops being drawn
                    const col = this.colors[this.phase - 1] || '#ffffff';
                    for (const o of this.outlines()) Particles.shatter(this.x + o.ox, this.y, o.pts, o.scale, 0, col, 2.2);
                    Audio.playExplosionLarge();
                    ScreenShake.trigger(20, 1.0);
                    Renderer.triggerFlash(0xffffff, 0.7);
                    Renderer.triggerChroma(0.025, 0.8);

                    switch (this.bossType) {
                        case 'furnace':
                            Particles.spawnExplosion(this.x, this.y, { style: 'mega', color: '#ff4400', color2: '#ffaa00' });
                            Particles.spawnExplosion(this.x + 30, this.y - 20, { style: 'large', color: '#ffaa00', color2: '#ffffff' });
                            break;
                        case 'leviathan':
                            for (let j = 0; j < 6; j++) {
                                const a = (Math.PI * 2 / 6) * j;
                                const d = 50 + Math.random() * 40;
                                Particles.spawnExplosion(this.x + Math.cos(a) * d, this.y + Math.sin(a) * d,
                                    { style: 'large', color: '#00ffaa', color2: '#ffffff' });
                            }
                            break;
                        case 'interceptor_duo':
                            Particles.spawnExplosion(this.x - 50, this.y, { style: 'large', color: '#ffaa00', color2: '#ffffff' });
                            Particles.spawnExplosion(this.x + 50, this.y, { style: 'large', color: '#ff4400', color2: '#ffffff' });
                            Particles.spawnExplosion(this.x, this.y, { style: 'medium', color: '#ffffff', color2: '#ffff00' });
                            break;
                        case 'nexus':
                            Particles.spawnExplosion(this.x, this.y, { style: 'mega', color: '#cc44ff', color2: '#ffffff' });
                            Particles.spawnShockwave(this.x, this.y, '#cc44ff', 200, 0.6);
                            break;
                        case 'echo': {
                            const echoCols = ['#00ffff', '#ff00ff', '#ffffff'];
                            for (let j = 0; j < 5; j++) {
                                const ox = (Math.random() - 0.5) * 120;
                                const oy = (Math.random() - 0.5) * 120;
                                Particles.spawnExplosion(this.x + ox, this.y + oy,
                                    { style: 'medium', color: echoCols[j % 3], color2: '#ffffff' });
                            }
                            Particles.spawnExplosion(this.x, this.y, { style: 'mega', color: '#ff00ff', color2: '#00ffff' });
                            break;
                        }
                        default: // architect
                            Particles.spawnExplosion(this.x, this.y, { style: 'mega', color: '#ff00ff', color2: '#ffffff' });
                            Particles.spawnExplosion(this.x, this.y + 20, { style: 'large', color: '#ffffff', color2: '#ff00ff' });
                            break;
                    }
                }
            }

            // Final cleanup
            if (this.defeatTimer > 3.5) {
                this.active = false;
                if (!this.timedOut) Scoring.score += Math.floor(25000 * GameConfig.scoreMultiplier);
                Enemies.enemyBullets.clear();
                Scoring.spawnPopup('BOSS DEFEATED!', '#ffff00', 30);
            }
            return;
        }

        this.moveTimer += dt;
        this.flashTimer = Math.max(0, this.flashTimer - dt);
        if (this.phaseTransitionTimer > 0) {
            this.phaseTransitionTimer -= dt;
            // Flash during transition
            this.flashTimer = 0.1;
            this._updateMovement(dt, playerX);
            return; // Skip attacks during transition
        }

        // Phase timeout: the phase ends without its bonus, so fights can't stall
        this.phaseTime += dt;
        if (this.phaseTime >= BOSS_PHASE_TIME_LIMIT) {
            this._phaseTimeout();
            return;
        }
        this.attackTimer -= dt;

        // Movement
        this._updateMovement(dt, playerX);

        // Attack patterns
        if (this.attackTimer <= 0) {
            this._attack(playerX, playerY);
        }
    },

    _updateMovement(dt, playerX) {
        switch (this.bossType) {
            case 'furnace':
                // Heavy, slow, deliberate — stays high, slight tracking
                if (this.phase === 1) {
                    this.x += Math.sin(this.moveTimer * 0.4) * 30 * dt;
                    this.y = 100 + Math.sin(this.moveTimer * 0.3) * 10;
                } else {
                    // Phase 2: breaks free, charges horizontally
                    this.x += Math.sin(this.moveTimer * 1.5) * 100 * dt;
                    this.y = 90 + Math.sin(this.moveTimer * 0.8) * 40;
                    // Occasional charge toward player X
                    if (Math.sin(this.moveTimer * 0.7) > 0.9) {
                        this.x += (playerX - this.x) * 1.5 * dt;
                    }
                }
                break;

            case 'leviathan':
                // Organic, flowing, unpredictable drifting
                if (this.phase === 1) {
                    // Drifts among debris
                    this.x += Math.sin(this.moveTimer * 0.6) * 50 * dt;
                    this.y = 110 + Math.sin(this.moveTimer * 0.4 + 1.5) * 25;
                } else if (this.phase === 2) {
                    // Revealed — wider sweeps
                    this.x += Math.sin(this.moveTimer * 1.0) * 80 * dt;
                    this.y = 100 + Math.sin(this.moveTimer * 0.7) * 35;
                } else {
                    // Charging — lunges toward player then retreats
                    const lungePhase = Math.sin(this.moveTimer * 1.2);
                    if (lungePhase > 0.5) {
                        this.x += (playerX - this.x) * 2.0 * dt;
                        this.y += (200 - this.y) * 1.5 * dt;
                    } else {
                        this.x += Math.sin(this.moveTimer * 2) * 100 * dt;
                        this.y += (80 - this.y) * 1.0 * dt;
                    }
                }
                break;

            case 'interceptor_duo':
                // Fast, darting, strafing runs
                if (this.phase === 1) {
                    // Quick side-to-side strafing
                    this.x += Math.sin(this.moveTimer * 2.0) * 150 * dt;
                    this.y = 90 + Math.sin(this.moveTimer * 3.0) * 20;
                } else {
                    // Combined form — circles and dashes
                    this.x = PLAY_W / 2 + Math.sin(this.moveTimer * 1.5) * 180;
                    this.y = 110 + Math.cos(this.moveTimer * 1.0) * 50;
                }
                break;

            case 'nexus':
                // Pulsing, central, slowly rotating position
                if (this.phase <= 2) {
                    // Stays central with slow orbit
                    this.x = PLAY_W / 2 + Math.sin(this.moveTimer * 0.5) * 60;
                    this.y = 120 + Math.sin(this.moveTimer * 0.4) * 20;
                } else {
                    // Endurance — erratic pulses outward and back
                    this.x = PLAY_W / 2 + Math.sin(this.moveTimer * 1.5) * 120 * Math.sin(this.moveTimer * 0.3);
                    this.y = 110 + Math.sin(this.moveTimer * 2.0) * 50;
                }
                break;

            case 'echo':
                // Mirrors player position with delay — inverse Y
                if (this.phase === 1) {
                    // Delayed mirror of player X, stays at top
                    this.x += (playerX - this.x) * 0.8 * dt;
                    this.y = 100 + Math.sin(this.moveTimer * 1.0) * 15;
                } else if (this.phase === 2) {
                    // Inverse mirror — moves opposite to player
                    const mirrorX = PLAY_W - playerX;
                    this.x += (mirrorX - this.x) * 1.0 * dt;
                    this.y = 100 + Math.sin(this.moveTimer * 1.5) * 30;
                } else {
                    // Erratic — alternates between mirroring and inverse
                    const mirror = Math.sin(this.moveTimer * 0.5) > 0;
                    const targetX = mirror ? playerX : PLAY_W - playerX;
                    this.x += (targetX - this.x) * 1.5 * dt;
                    this.y = 90 + Math.sin(this.moveTimer * 2.0) * 50;
                }
                break;

            default: // architect
                switch (this.phase) {
                    case 1:
                        this.x += Math.sin(this.moveTimer * 0.8) * 40 * dt;
                        break;
                    case 2:
                        this.x += (playerX - this.x) * 0.5 * dt;
                        this.y = 100 + Math.sin(this.moveTimer * 1.2) * 30;
                        break;
                    case 3:
                        this.x += Math.sin(this.moveTimer * 2.5) * 120 * dt;
                        this.y = 100 + Math.sin(this.moveTimer * 1.8) * 40;
                        break;
                }
                break;
        }
        this.x = Math.max(60, Math.min(PLAY_W - 60, this.x));
        this.y = Math.max(50, Math.min(PLAY_H * 0.4, this.y));
    },

    _attack(playerX, playerY) {
        const angle = Math.atan2(playerY - this.y, playerX - this.x);
        const density = GameConfig.bulletDensity;
        const bs = 160;

        // Boss-type-specific attack dispatch
        switch (this.bossType) {
            case 'furnace':
                this._furnaceAttack(angle, bs, density);
                break;
            case 'leviathan':
                this._leviathanAttack(angle, bs, density);
                break;
            case 'interceptor_duo':
                this._duoAttack(angle, bs, density);
                break;
            case 'nexus':
                this._nexusAttack(angle, bs, density);
                break;
            case 'echo':
                this._echoAttack(angle, bs, density, playerX, playerY);
                break;
            default: // architect
                switch (this.phase) {
                    case 1: this._phase1Attack(angle, bs, density); break;
                    case 2: this._phase2Attack(angle, bs, density); break;
                    case 3: this._phase3Attack(angle, bs, density); break;
                }
        }
        this.patternIndex++;
    },

    // === FURNACE (Level 2) — heavy artillery, sweeping fire ===
    _furnaceAttack(angle, bs, density) {
        const pattern = this.patternIndex % (this.phase === 1 ? 3 : 4);
        if (this.phase === 1) {
            switch (pattern) {
                case 0: // Wide horizontal barrage
                    const wallN = this._n(15, density);
                    for (let j = 0; j < wallN; j++) {
                        const x = 10 + ((PLAY_W - 20) / (wallN - 1)) * j; // always spans the screen
                        Enemies.enemyBullets.spawn(x, this.y + 40, 0, bs * 0.7, { color: '#ff6600', radius: 3 });
                    }
                    this.attackTimer = 1.2; break;
                case 1: // Aimed triple cannon
                    for (let j = -1; j <= 1; j++) {
                        const a = angle + j * 0.25;
                        Enemies.enemyBullets.spawn(this.x, this.y + this.radius * 0.9, Math.cos(a) * bs * 1.2, Math.sin(a) * bs * 1.2, { color: '#ff4400', radius: 5 });
                    }
                    this.attackTimer = 0.8; break;
                case 2: // Flame spread (wide cone downward)
                    const flameN = this._n(10, density);
                    for (let j = 0; j < flameN; j++) {
                        const a = Math.PI / 2 + (j / (flameN - 1) - 0.5) * 1.1; // centred cone
                        Enemies.enemyBullets.spawn(this.x, this.y + this.radius * 0.9, Math.cos(a) * bs * 0.8, Math.sin(a) * bs * 0.8, { color: '#ff2200', radius: 3, life: 2 });
                    }
                    this.attackTimer = 1.5; break;
            }
        } else {
            switch (pattern) {
                case 0: // Charge slam — bullet burst
                    for (let j = 0; j < this._n(20, density); j++) {
                        const a = (Math.PI * 2 / this._n(20, density)) * j;
                        Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs, Math.sin(a) * bs, { color: '#ff4400', radius: 4 });
                    }
                    this.attackTimer = 0.9; break;
                case 1: // Sweeping laser line
                    for (let j = 0; j < 10; j++) {
                        const bx = this.x + Math.cos(this.moveTimer * 2) * (j * 20);
                        Enemies.enemyBullets.spawn(bx, this.y + 30, 0, bs * 0.6, { color: '#ff6600', radius: 3, life: 1.5 });
                    }
                    this.attackTimer = 0.6; break;
                case 2: // Aimed shotgun
                    for (let j = -3; j <= 3; j++) {
                        const a = angle + j * 0.1;
                        const spd = bs * (0.8 + Math.random() * 0.4);
                        Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * spd, Math.sin(a) * spd, { color: '#ff2200', radius: 3 });
                    }
                    this.attackTimer = 0.7; break;
                case 3: // Spawn bombers
                    Enemies.spawn('bomber', this.x - 40, this.y + 20, 'straight_down');
                    Enemies.spawn('bomber', this.x + 40, this.y + 20, 'straight_down');
                    this.attackTimer = 3.0; break;
            }
        }
    },

    // === LEVIATHAN (Level 3) — organic, tentacle sweeps, asteroid throws ===
    _leviathanAttack(angle, bs, density) {
        const pattern = this.patternIndex % 3;
        switch (this.phase) {
            case 1: // Hidden among debris
                switch (pattern) {
                    case 0: // Tentacle sweep (arc of bullets)
                        for (let j = 0, tn = this._n(12, density); j < tn; j++) {
                            const a = angle - 0.6 + (1.2 / (tn - 1)) * j;
                            Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs * 0.8, Math.sin(a) * bs * 0.8, { color: '#00ffaa', radius: 3 });
                        }
                        this.attackTimer = 1.3; break;
                    case 1: // Aimed organic shots
                        for (let j = 0; j < 4; j++) {
                            const a = angle + (Math.random() - 0.5) * 0.5;
                            Enemies.enemyBullets.spawn(this.x + (Math.random() - 0.5) * 40, this.y, Math.cos(a) * bs, Math.sin(a) * bs, { color: '#4488ff', radius: 4 });
                        }
                        this.attackTimer = 1.0; break;
                    case 2: // Asteroid spawn
                        if (Asteroids.active) {
                            for (let j = 0; j < 3; j++) {
                                Asteroids.list.push({ x: this.x + (j - 1) * 30, y: this.y + 30, vx: (Math.random() - 0.5) * 50, vy: 100 + Math.random() * 60, radius: 12 + Math.random() * 8, hp: 2, destructible: true, rotation: 0, rotSpeed: 2 });
                            }
                        }
                        this.attackTimer = 2.0; break;
                }
                break;
            case 2: // Revealed — spiral + tentacles
                switch (pattern) {
                    case 0: // Double spiral
                        for (let j = 0; j < this._n(16, density); j++) {
                            const a = (Math.PI * 2 / this._n(16, density)) * j + this.moveTimer * 2;
                            Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs, Math.sin(a) * bs, { color: '#00ffaa', radius: 3 });
                            Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a + Math.PI) * bs * 0.7, Math.sin(a + Math.PI) * bs * 0.7, { color: '#4488ff', radius: 3 });
                        }
                        this.attackTimer = 0.8; break;
                    case 1: // Tentacle sweep (reuse phase 1 pattern)
                        for (let j = 0, tn = this._n(12, density); j < tn; j++) {
                            const a = angle - 0.6 + (1.2 / (tn - 1)) * j;
                            Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs * 0.8, Math.sin(a) * bs * 0.8, { color: '#00ffaa', radius: 3 });
                        }
                        this.attackTimer = 1.0; break;
                    case 2: // Ring burst
                        const count = this._n(20, density);
                        for (let j = 0; j < count; j++) {
                            const a = (Math.PI * 2 / count) * j;
                            Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs * 0.6, Math.sin(a) * bs * 0.6, { color: '#00ffaa', radius: 4 });
                        }
                        this.attackTimer = 1.0; break;
                }
                break;
            case 3: // Charging — fast and aggressive
                switch (pattern) {
                    case 0: for (let j = 0; j < this._n(24, density); j++) { const a = (Math.PI * 2 / this._n(24, density)) * j + this.moveTimer * 3; Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs * 1.1, Math.sin(a) * bs * 1.1, { color: '#00ffaa', radius: 3 }); } this.attackTimer = 0.5; break;
                    case 1: for (let j = -4; j <= 4; j++) { Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(angle + j * 0.12) * bs * 1.3, Math.sin(angle + j * 0.12) * bs * 1.3, { color: '#4488ff', radius: 4 }); } this.attackTimer = 0.6; break;
                    case 2: for (let j = 0; j < this._n(12, density); j++) { const a = Math.random() * Math.PI * 2; Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * (80 + Math.random() * bs), Math.sin(a) * (80 + Math.random() * bs), { color: '#00ffaa', radius: 3 }); } this.attackTimer = 0.7; break;
                }
                break;
        }
    },

    // === INTERCEPTOR DUO (Level 4) — twin alternating attacks ===
    _duoAttack(angle, bs, density) {
        const pattern = this.patternIndex % 4;
        const side = this.patternIndex % 2 === 0 ? -1 : 1;
        const ox = side * 60;
        if (this.phase === 1) {
            switch (pattern) {
                case 0: case 2: // Alternating aimed fans from each side
                    for (let j = -2; j <= 2; j++) {
                        const a = angle + j * 0.15;
                        Enemies.enemyBullets.spawn(this.x + ox, this.y + this.radius * 0.5, Math.cos(a) * bs * 1.1, Math.sin(a) * bs * 1.1, { color: '#ffaa00', radius: 3 });
                    }
                    this.attackTimer = 0.7; break;
                case 1: // Cross streams
                    for (let j = 0; j < 6; j++) {
                        Enemies.enemyBullets.spawn(this.x - 60, this.y, Math.cos(0.8 + j * 0.1) * bs, Math.sin(0.8 + j * 0.1) * bs, { color: '#ffaa00', radius: 3 });
                        Enemies.enemyBullets.spawn(this.x + 60, this.y, Math.cos(Math.PI - 0.8 - j * 0.1) * bs, Math.sin(Math.PI - 0.8 - j * 0.1) * bs, { color: '#ff4400', radius: 3 });
                    }
                    this.attackTimer = 1.2; break;
                case 3: // Ring from center
                    const c = this._n(12, density);
                    for (let j = 0; j < c; j++) { const a = (Math.PI * 2 / c) * j; Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs * 0.7, Math.sin(a) * bs * 0.7, { color: '#ff6600', radius: 3 }); }
                    this.attackTimer = 1.5; break;
            }
        } else { // Combined form — overlapping patterns
            switch (pattern) {
                case 0: // Double spiral
                    for (let j = 0; j < this._n(20, density); j++) { const a = (Math.PI * 2 / this._n(20, density)) * j + this.moveTimer * 2.5; Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs, Math.sin(a) * bs, { color: '#ffaa00', radius: 3 }); Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a + 0.3) * bs * 0.8, Math.sin(a + 0.3) * bs * 0.8, { color: '#ff4400', radius: 3 }); }
                    this.attackTimer = 0.7; break;
                case 1: // Wide shotgun
                    for (let j = -5; j <= 5; j++) { const a = angle + j * 0.1; Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs * 1.2, Math.sin(a) * bs * 1.2, { color: '#ff6600', radius: 4 }); }
                    this.attackTimer = 0.8; break;
                case 2: // Spawn drones
                    for (let j = 0; j < 4; j++) Enemies.spawn('scout_drone', this.x + (j - 1.5) * 30, this.y + 20, 'straight_down');
                    this.attackTimer = 2.5; break;
                case 3: // Burst rings
                    for (let ring = 0; ring < 2; ring++) { const c = this._n(14 + ring * 6, density); for (let j = 0; j < c; j++) { const a = (Math.PI * 2 / c) * j + ring * 0.15; Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs * (0.6 + ring * 0.3), Math.sin(a) * bs * (0.6 + ring * 0.3), { color: ring === 0 ? '#ffaa00' : '#ff4400', radius: 3 }); } }
                    this.attackTimer = 1.0; break;
            }
        }
    },

    // === NEXUS (Level 5) — remixes previous boss patterns ===
    _nexusAttack(angle, bs, density) {
        const pattern = this.patternIndex % 4;
        switch (this.phase) {
            case 1: // Shielded — controlled patterns
                switch (pattern) {
                    case 0: for (let j = 0; j < this._n(16, density); j++) { const a = (Math.PI * 2 / this._n(16, density)) * j; Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs * 0.7, Math.sin(a) * bs * 0.7, { color: '#cc44ff', radius: 4 }); } this.attackTimer = 1.2; break;
                    case 1: for (let j = -3; j <= 3; j++) { Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(angle + j * 0.15) * bs * 1.1, Math.sin(angle + j * 0.15) * bs * 1.1, { color: '#ff00ff', radius: 3 }); } this.attackTimer = 0.8; break;
                    case 2: Enemies.spawn('phase_shifter', this.x, this.y + 30, 'hover'); this.attackTimer = 3.0; break;
                    case 3: // Horizontal wall with gaps
                        for (let j = 0, wn = this._n(18, density); j < wn; j++) { if (j % 4 === Math.floor(this.moveTimer) % 4) continue; const x = 10 + ((PLAY_W - 20) / (wn - 1)) * j; Enemies.enemyBullets.spawn(x, this.y + 30, 0, bs * 0.5, { color: '#cc44ff', radius: 3 }); }
                        this.attackTimer = 1.0; break;
                }
                break;
            case 2: // Pattern remix — uses attacks inspired by previous bosses
                switch (pattern) {
                    case 0: this._furnaceAttack(angle, bs * 0.9, density); break;
                    case 1: this._leviathanAttack(angle, bs * 0.9, density); break;
                    case 2: this._duoAttack(angle, bs * 0.9, density); break;
                    case 3: for (let j = 0; j < this._n(20, density); j++) { const a = (Math.PI * 2 / this._n(20, density)) * j + this.moveTimer * 2; Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs, Math.sin(a) * bs, { color: '#ff00ff', radius: 3 }); } this.attackTimer = 0.6; break;
                }
                break;
            case 3: // Endurance — everything at max
                switch (pattern) {
                    case 0: // Triple spiral
                        for (let s = 0; s < 3; s++) { for (let j = 0; j < this._n(10, density); j++) { const a = (Math.PI * 2 / this._n(10, density)) * j + this.moveTimer * 3 + s * (Math.PI * 2 / 3); Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs, Math.sin(a) * bs, { color: ['#ff00ff', '#cc44ff', '#ffffff'][s], radius: 3 }); } }
                        this.attackTimer = 0.4; break;
                    case 1: for (let j = -5; j <= 5; j++) { Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(angle + j * 0.1) * bs * 1.3, Math.sin(angle + j * 0.1) * bs * 1.3, { color: '#ffffff', radius: 4 }); } this.attackTimer = 0.5; break;
                    case 2: for (let j = 0; j < 3; j++) Enemies.spawn('phase_shifter', this.x + (j - 1) * 50, this.y + 30, 'hover'); this.attackTimer = 3.0; break;
                    case 3: // Cross beams
                        for (let arm = 0; arm < 4; arm++) { const ba = this.moveTimer * 1.5 + arm * (Math.PI / 2); for (let j = 0; j < 10; j++) { const bx = this.x + Math.cos(ba) * j * 18; const by = this.y + Math.sin(ba) * j * 18; if (bx > 0 && bx < PLAY_W && by > 0 && by < PLAY_H) Enemies.enemyBullets.spawn(bx, by, 0, 0, { color: '#ff00ff', radius: 4, life: 0.95, harmless: 0.35 }); } }
                        this.attackTimer = 0.5; break;
                }
                break;
        }
    },

    // === ECHO (Level 6) — mirrors player weapon patterns ===
    _echoAttack(angle, bs, density, playerX, playerY) {
        const pattern = this.patternIndex % 3;
        switch (this.phase) {
            case 1: // Mirrors spread
                switch (pattern) {
                    case 0: // Spread shot (like player)
                        for (let j = -3; j <= 3; j++) { const a = angle + j * 0.15; Enemies.enemyBullets.spawn(this.x, this.y + this.radius * 0.8, Math.cos(a) * bs, Math.sin(a) * bs, { color: '#00ffff', radius: 3 }); }
                        this.attackTimer = 0.5; break;
                    case 1: // Homing (slow tracking bullets)
                        for (let j = 0; j < 3; j++) { Enemies.enemyBullets.spawn(this.x + (j - 1) * 20, this.y, Math.cos(angle) * bs * 0.5, Math.sin(angle) * bs * 0.5, { color: '#00ff88', radius: 3, type: 'homing', life: 4, turnRate: 1.5 }); }
                        this.attackTimer = 1.0; break;
                    case 2: // Ring
                        const c = this._n(14, density); for (let j = 0; j < c; j++) { const a = (Math.PI * 2 / c) * j; Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs * 0.7, Math.sin(a) * bs * 0.7, { color: '#00ffff', radius: 3 }); }
                        this.attackTimer = 1.2; break;
                }
                break;
            case 2: // Mirrors laser + adds own patterns
                switch (pattern) {
                    case 0: // Laser beams (vertical lines)
                        for (let j = -1; j <= 1; j++) { for (let k = 0; k < 8; k++) { Enemies.enemyBullets.spawn(this.x + j * 15, this.y + k * 15, 0, bs * 1.5, { color: '#4488ff', radius: 5, life: 0.75, harmless: 0.25 }); } }
                        this.attackTimer = 0.4; break;
                    case 1: // Mirror movement burst
                        for (let j = 0; j < this._n(16, density); j++) { const a = (Math.PI * 2 / this._n(16, density)) * j + this.moveTimer * 2; Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs, Math.sin(a) * bs, { color: '#ff00ff', radius: 3 }); }
                        this.attackTimer = 0.7; break;
                    case 2: // Aimed fan
                        for (let j = -4; j <= 4; j++) { Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(angle + j * 0.12) * bs * 1.2, Math.sin(angle + j * 0.12) * bs * 1.2, { color: '#00ffff', radius: 3 }); }
                        this.attackTimer = 0.6; break;
                }
                break;
            case 3: // All patterns combined, faster
                switch (pattern) {
                    case 0: for (let j = 0; j < this._n(24, density); j++) { const a = (Math.PI * 2 / this._n(24, density)) * j + this.moveTimer * 3; Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs * 1.1, Math.sin(a) * bs * 1.1, { color: '#ffffff', radius: 3 }); } this.attackTimer = 0.4; break;
                    case 1: for (let j = -5; j <= 5; j++) { Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(angle + j * 0.1) * bs * 1.4, Math.sin(angle + j * 0.1) * bs * 1.4, { color: '#00ffff', radius: 4 }); } for (let j = 0; j < 3; j++) { Enemies.enemyBullets.spawn(this.x + (j-1)*20, this.y, Math.cos(angle)*bs*0.5, Math.sin(angle)*bs*0.5, { color:'#00ff88', radius:3, type:'homing', life:3, turnRate:1.5 }); } this.attackTimer = 0.5; break;
                    case 2: for (let j = -1; j <= 1; j++) { for (let k = 0; k < 10; k++) Enemies.enemyBullets.spawn(this.x + j * 20, this.y + k * 12, 0, bs * 1.5, { color: '#4488ff', radius: 5, life: 0.65, harmless: 0.25 }); } this.attackTimer = 0.3; break;
                }
                break;
        }
    },

    _phase1Attack(angle, bs, density) {
        const pattern = this.patternIndex % 3;
        switch (pattern) {
            case 0: // Aimed spread from armor
                for (const seg of this.armor) {
                    if (!seg.alive) continue;
                    const sx = this.x + Math.cos(seg.angle + this.moveTimer) * BOSS_ARMOR_ORBIT;
                    const sy = this.y + Math.sin(seg.angle + this.moveTimer) * BOSS_ARMOR_ORBIT;
                    for (let j = -2; j <= 2; j++) {
                        const a = angle + j * 0.2;
                        Enemies.enemyBullets.spawn(sx, sy, Math.cos(a) * bs, Math.sin(a) * bs, { color: '#ff1493', radius: 3 });
                    }
                }
                this.attackTimer = 1.5;
                break;
            case 1: // Horizontal sweep
                const sweepN = this._n(12, density);
                for (let i = 0; i < sweepN; i++) {
                    const x = 10 + ((PLAY_W - 20) / (sweepN - 1)) * i;
                    Enemies.enemyBullets.spawn(x, this.y + 30, 0, bs * 0.8, { color: '#ff4040', radius: 3 });
                }
                this.attackTimer = 2.0;
                break;
            case 2: // Ring burst
                const count = this._n(16, density);
                for (let j = 0; j < count; j++) {
                    const a = (Math.PI * 2 / count) * j;
                    Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs * 0.7, Math.sin(a) * bs * 0.7, { color: '#ff1493', radius: 3 });
                }
                this.attackTimer = 1.8;
                break;
        }
    },

    _phase2Attack(angle, bs, density) {
        const pattern = this.patternIndex % 4;
        switch (pattern) {
            case 0: // Dense aimed fan
                for (let j = -4; j <= 4; j++) {
                    const a = angle + j * 0.12;
                    Enemies.enemyBullets.spawn(this.x, this.y + this.radius * 0.9, Math.cos(a) * bs * 1.1, Math.sin(a) * bs * 1.1, { color: '#ff00ff', radius: 3 });
                }
                this.attackTimer = 1.0;
                break;
            case 1: // Double ring
                for (let ring = 0; ring < 2; ring++) {
                    const count = this._n(12 + ring * 4, density);
                    const offset = ring * 0.15;
                    for (let j = 0; j < count; j++) {
                        const a = (Math.PI * 2 / count) * j + offset;
                        const spd = bs * (0.6 + ring * 0.3);
                        Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * spd, Math.sin(a) * spd, { color: '#ff1493', radius: 3 });
                    }
                }
                this.attackTimer = 1.5;
                break;
            case 2: // Spawn mini drones
                for (let j = 0; j < 3; j++) {
                    Enemies.spawn('scout_drone', this.x + (j - 1) * 40, this.y + 20, 'straight_down');
                }
                this.attackTimer = 2.5;
                break;
            case 3: // Rotating lasers (simulated with bullet lines)
                for (let arm = 0; arm < 2; arm++) {
                    const baseA = this.moveTimer * 1.5 + arm * Math.PI;
                    for (let j = 0; j < 8; j++) {
                        const dist = 30 + j * 20;
                        const bx = this.x + Math.cos(baseA) * dist;
                        const by = this.y + Math.sin(baseA) * dist;
                        if (bx > 0 && bx < PLAY_W && by > 0 && by < PLAY_H) {
                            Enemies.enemyBullets.spawn(bx, by, 0, 0, { color: '#ff4488', radius: 4, life: 1.15, harmless: 0.35 });
                        }
                    }
                }
                this.attackTimer = 0.8;
                break;
        }
    },

    _phase3Attack(angle, bs, density) {
        const pattern = this.patternIndex % 3;
        switch (pattern) {
            case 0: // Spiral
                const spiralCount = this._n(24, density);
                for (let j = 0; j < spiralCount; j++) {
                    const a = (Math.PI * 2 / spiralCount) * j + this.moveTimer * 3;
                    Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs, Math.sin(a) * bs, { color: '#ff00ff', radius: 3 });
                }
                this.attackTimer = 0.6;
                break;
            case 1: // Rapid aimed + ring combo
                for (let j = -2; j <= 2; j++) {
                    const a = angle + j * 0.15;
                    Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs * 1.3, Math.sin(a) * bs * 1.3, { color: '#ff4040', radius: 4 });
                }
                const ringCount = this._n(10, density);
                for (let j = 0; j < ringCount; j++) {
                    const a = (Math.PI * 2 / ringCount) * j;
                    Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * bs * 0.5, Math.sin(a) * bs * 0.5, { color: '#ff1493', radius: 3 });
                }
                this.attackTimer = 0.8;
                break;
            case 2: // Charge toward player (telegraphed)
                // Telegraph line
                Particles.spawn(this.x, this.y, 5, { color: '#ff0000', speed: 20, life: 0.5, size: 4 });
                // Bullet burst after charge
                for (let j = 0; j < this._n(20, density); j++) {
                    const a = Math.random() * Math.PI * 2;
                    const spd = 80 + Math.random() * bs;
                    Enemies.enemyBullets.spawn(this.x, this.y, Math.cos(a) * spd, Math.sin(a) * spd, { color: '#ff1493', radius: 3 });
                }
                this.attackTimer = 1.2;
                break;
        }
    },

    // Armor segment positions (they orbit the core)
    armorPositions() {
        return this.armor.map(seg => ({
            seg,
            x: this.x + Math.cos(seg.angle + this.moveTimer) * BOSS_ARMOR_ORBIT,
            y: this.y + Math.sin(seg.angle + this.moveTimer) * BOSS_ARMOR_ORBIT,
        }));
    },

    // Player bullet vs boss. Armor segments are real hit zones: a bullet that touches an
    // intact segment damages it; one that reaches the core while armor is up does reduced damage.
    // Returns true if the bullet was absorbed.
    hitTest(b) {
        if (this.phase === 1 && this.armor.some(seg => seg.alive)) {
            for (const p of this.armorPositions()) {
                if (!p.seg.alive) continue;
                const dx = b.x - p.x, dy = b.y - p.y;
                const r = b.radius + BOSS_ARMOR_RADIUS;
                if (dx * dx + dy * dy < r * r) {
                    this._damageArmor(p.seg, b.damage);
                    return true;
                }
            }
        }
        const dx = b.x - this.x, dy = b.y - this.y;
        if (dx * dx + dy * dy < (b.radius + this.radius) * (b.radius + this.radius)) {
            this.hit(b.damage);
            return true;
        }
        return false;
    },

    _damageArmor(seg, damage) {
        seg.hp -= damage;
        this.flashTimer = 0.06;
        if (seg.hp <= 0 && seg.alive) {
            seg.alive = false;
            Particles.spawn(
                this.x + Math.cos(seg.angle + this.moveTimer) * BOSS_ARMOR_ORBIT,
                this.y + Math.sin(seg.angle + this.moveTimer) * BOSS_ARMOR_ORBIT,
                20, { color: '#ff8800', speed: 150, life: 0.5 }
            );
            Scoring.score += Math.floor(1500 * GameConfig.scoreMultiplier);
            Audio.playExplosionSmall();
            ScreenShake.trigger(6, 0.3);
            if (this.armor.every(s => !s.alive)) Scoring.spawnPopup('ARMOR BROKEN', '#ff8800', 20);
        }
    },

    // Bomb: damages the core and every intact armor segment
    bombHit(damage) {
        if (!this.active || !this.entered || this.defeated) return;
        if (this.phase === 1) {
            for (const seg of this.armor) if (seg.alive) this._damageArmor(seg, damage);
        }
        this.hit(damage, true);
    },

    // Core damage. While armor is intact (phase 1) the core only takes a fraction.
    hit(damage, ignoreArmor) {
        if (!this.active || !this.entered || this.defeated) return;
        if (this.phaseTransitionTimer > 0) return; // phase transition invulnerability

        if (!ignoreArmor && this.phase === 1 && this.armor.some(seg => seg.alive)) {
            damage *= BOSS_ARMORED_CORE_DAMAGE;
        }
        this.hp -= damage;
        this.flashTimer = 0.06;

        if (this.hp <= 0) {
            if (this.phase < this.totalPhases) {
                this._nextPhase(true);
            } else {
                this._onDefeat();
            }
        }
    },

    _phaseTimeout() {
        Scoring.spawnPopup('TIME OUT', '#888888', 22);
        for (const seg of this.armor) seg.alive = false;
        if (this.phase < this.totalPhases) {
            this._nextPhase(false);
        } else {
            this.timedOut = true;
            this._onDefeat();
        }
    },

    _nextPhase(awardBonus) {
        this.phase++;
        this.hp = this.phaseHps[this.phase - 1];
        this.maxHp = this.phaseHps[this.phase - 1];
        this.attackTimer = 2.0;
        this.patternIndex = 0;
        this.phaseTime = 0;
        this.phaseTransitionTimer = 1.5; // Brief invulnerability
        for (const seg of this.armor) seg.alive = false;
        Enemies.enemyBullets.clear();
        ScreenShake.trigger(12, 0.6);
        Particles.spawn(this.x, this.y, 40, { color: '#ffffff', speed: 220, life: 0.7, size: 4 });
        Particles.spawnShockwave(this.x, this.y, this.colors[this.phase - 1] || '#ffffff', 120, 0.6);
        Renderer.addGlow(this.x, this.y, 0xffffff, this.radius * 6, 0.9);
        Renderer.triggerFlash(0xffffff, 0.2);
        Renderer.triggerGlitch(0.55);
        Audio.playExplosionLarge();
        if (awardBonus) Scoring.score += Math.floor((this.phase === 2 ? 5000 : 10000) * GameConfig.scoreMultiplier);
        Scoring.spawnPopup('PHASE ' + this.phase, this.colors[this.phase - 1] || '#ffffff', 24);
    },

    _onDefeat() {
        this.defeated = true;
        this.defeatTimer = 0;
        ScreenShake.trigger(10, 0.8);
    },

    // ------------------------------------------------------------
    //  Neon style art (see neon.js). Static bodies are baked into the
    //  sprite atlas per phase colour and flash state; eyes, lights,
    //  tentacles, rings and flames are drawn live. Units of the radius.
    // ------------------------------------------------------------
    _NEON_SHAPES: {
        hex: Neon.polygon(6, 0),
        archHull: Neon.mirror([0, -0.8, 0.4, -0.6, 0.5, -0.1, 0.4, 0.5, 0.15, 0.7, 0, 0.7]),
        archPod: [0.5, -0.4, 0.95, -0.5, 1.0, -0.15, 0.85, 0.05, 0.5, 0],
        archBarrel: [0.86, 0.02, 0.95, 0.02, 0.94, 0.3, 0.87, 0.3],
        furnace: Neon.mirror([0, -0.7, 0.8, -0.7, 0.9, -0.2, 0.7, 0.6]),
        furnaceStack: [0.5, -1.0, 0.7, -1.0, 0.7, -0.68, 0.5, -0.68],
        furnaceGun: [0.82, -0.12, 1.12, -0.12, 1.12, 0.06, 0.82, 0.06],
        furnaceCannon: [-0.09, 0.58, 0.09, 0.58, 0.09, 0.9, -0.09, 0.9],
        fighter: Neon.mirror([0, -0.7, 0.2, -0.3, 0.15, -0.1, 0.55, 0.15, 0.5, 0.3, 0.15, 0.4, 0, 0.5]),
        fighterCanopy: Neon.mirror([0, -0.5, 0.07, -0.36, 0.06, -0.24, 0, -0.2]),
    },

    // Outlines the boss breaks into when destroyed: [{ pts, scale, ox }]
    outlines() {
        const S = this._NEON_SHAPES, r = this.radius;
        switch (this.bossType) {
            case 'furnace': return [{ pts: S.furnace, scale: r, ox: 0 }];
            case 'leviathan': return [{ pts: Neon.polygon(14, 0, 0.85, 0.6), scale: r, ox: 0 }];
            case 'interceptor_duo': {
                const sep = this.phase === 1 ? 45 : 18;
                return [{ pts: S.fighter, scale: r, ox: -sep }, { pts: S.fighter, scale: r, ox: sep }];
            }
            case 'nexus': return [{ pts: Neon.polygon(12, 0, 0.55), scale: r, ox: 0 }, { pts: Neon.polygon(16, 0, 0.9), scale: r, ox: 0 }];
            case 'echo': return [{ pts: MidBoss._NEON_SHAPES.echoHull, scale: r, ox: 0 }];
            default: {
                const pod = S.archPod, flipped = pod.slice();
                for (let i = 0; i < flipped.length; i += 2) flipped[i] = -flipped[i];
                return [{ pts: S.archHull, scale: r, ox: 0 }, { pts: pod, scale: r, ox: 0 }, { pts: flipped, scale: r, ox: 0 }];
            }
        }
    },

    // Mirror a right-side detail line to the left and draw both
    _pair(ctx, pts, r, color, alpha, width) {
        Neon.detail(ctx, pts, r, color, alpha, width);
        const m = pts.slice();
        for (let i = 0; i < m.length; i += 2) m[i] = -m[i];
        Neon.detail(ctx, m, r, color, alpha, width);
    },

    // Filled ellipse with a glowing edge
    _ellipse(ctx, x, y, rx, ry, color, width, flash, fillAlpha, fillColor) {
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        const a = ctx.globalAlpha;
        ctx.fillStyle = flash ? '#ffffff' : (fillColor || color);
        ctx.globalAlpha = a * (flash ? 0.6 : fillAlpha);
        ctx.fill();
        ctx.globalAlpha = a;
        Neon.stroke(ctx, color, width, flash);
    },

    _bake: {
        architect(c, color, r, flash) {
            const S = Boss._NEON_SHAPES;
            for (let s = -1; s <= 1; s += 2) {
                c.beginPath();
                c.moveTo(s * r * 0.15, r * 0.68);
                c.lineTo(s * r * 0.32, r * 0.84);
                c.lineTo(s * r * 0.34, r * 1.02);
                Neon.stroke(c, color, 1.4, flash);
            }
            Neon.shape(c, S.archHull, r, color, 2, flash, 0.26);
            c.save();
            c.translate(0, r * 0.02);
            Neon.path(c, S.archHull, r * 0.62, true);
            c.strokeStyle = color; c.globalAlpha = 0.45; c.lineWidth = 1; c.stroke();
            c.restore();
            c.globalAlpha = 1;
            Neon.detail(c, [-0.38, 0.12, -0.12, 0.2, 0.12, 0.2, 0.38, 0.12], r, color, 0.5, 1);
            Neon.detail(c, [-0.3, 0.38, -0.1, 0.46, 0.1, 0.46, 0.3, 0.38], r, color, 0.5, 1);
            Neon.detail(c, [0, -0.72, 0, -0.45], r, color, 0.5, 1);
            Boss._ellipse(c, 0, -r * 0.25, r * 0.2, r * 0.11, color, 1.2, flash, 0.9, '#120006');
        },
        architectPod(c, color, r, flash) {
            const S = Boss._NEON_SHAPES;
            Neon.shape(c, S.archBarrel, r, color, 1, flash, 0.3);
            Neon.shape(c, S.archPod, r, color, 1.5, flash, 0.18);
            Neon.detail(c, [0.58, -0.3, 0.9, -0.36], r, color, 0.5, 1);
            Neon.detail(c, [0.58, -0.14, 0.92, -0.2], r, color, 0.5, 1);
        },
        armor(c, color, r, flash) {
            Neon.shape(c, Boss._NEON_SHAPES.hex, r, color, 1.1, flash, 0.25);
            Neon.path(c, Boss._NEON_SHAPES.hex, r * 0.5, true);
            c.strokeStyle = '#ffaa88'; c.globalAlpha = 0.5; c.lineWidth = 1; c.stroke();
            c.globalAlpha = 1;
        },
        furnace(c, color, r, flash) {
            const S = Boss._NEON_SHAPES;
            const accent = '#ffaa66';
            for (const pts of [S.furnaceStack, S.furnaceGun]) {
                Neon.shape(c, pts, r, color, 1.1, flash, 0.3);
                const m = pts.slice();
                for (let i = 0; i < m.length; i += 2) m[i] = -m[i];
                Neon.shape(c, m, r, color, 1.1, flash, 0.3);
            }
            Neon.shape(c, S.furnaceCannon, r, accent, 1, flash, 0.35);
            Neon.shape(c, [-0.17, 0.86, 0.17, 0.86, 0.17, 0.95, -0.17, 0.95], r, accent, 0.9, flash, 0.35);
            Neon.shape(c, S.furnace, r, color, 2.2, flash, 0.24);
            // Armour plating and rivets
            Neon.detail(c, [-0.78, -0.2, 0.78, -0.2], r, accent, 0.45, 1);
            Neon.detail(c, [-0.72, 0.28, 0.72, 0.28], r, accent, 0.45, 1);
            Boss._pair(c, [0.45, -0.7, 0.45, -0.2], r, accent, 0.35, 1);
            Boss._pair(c, [0.45, 0.28, 0.4, 0.6], r, accent, 0.35, 1);
            for (let j = -3; j <= 3; j++) {
                c.fillStyle = accent; c.globalAlpha = 0.6;
                c.beginPath(); c.arc(j * r * 0.22, -r * 0.6, 1.2, 0, Math.PI * 2); c.fill();
            }
            c.globalAlpha = 1;
            // Furnace mouth with grille bars
            Boss._ellipse(c, 0, r * 0.04, r * 0.3, r * 0.3, accent, 1.3, flash, 0.85, '#1a0400');
            for (let j = -2; j <= 2; j++) Neon.detail(c, [j * 0.1, -0.2, j * 0.1, 0.28], r, accent, 0.5, 1.2);
        },
        leviathan(c, color, r, flash) {
            const accent = '#ccffee';
            Boss._ellipse(c, 0, 0, r * 0.95, r * 0.7, color, 0.8, flash, 0.05);
            Boss._ellipse(c, 0, 0, r * 0.85, r * 0.6, color, 1.8, flash, 0.2);
            Boss._ellipse(c, 0, -r * 0.15, r * 0.65, r * 0.45, color, 1.2, flash, 0.18);
            // Ribs across the carapace
            for (let j = 0; j < 5; j++) {
                const y = r * (0.12 + j * 0.09);
                const w = r * (0.7 - j * 0.1);
                c.beginPath();
                c.ellipse(0, y - r * 0.2, w, r * 0.2, 0, 0.15 * Math.PI, 0.85 * Math.PI);
                c.strokeStyle = color; c.globalAlpha = 0.4; c.lineWidth = 1; c.stroke();
            }
            c.globalAlpha = 1;
            // Eye sockets
            for (const [ex, ey] of [[-0.25, -0.25], [0.25, -0.25], [0, -0.05]]) {
                Boss._ellipse(c, ex * r, ey * r, r * 0.12, r * 0.08, accent, 0.8, flash, 0.9, '#001a10');
            }
        },
        fighter(c, color, r, flash, trim) {
            const S = Boss._NEON_SHAPES;
            Neon.shape(c, S.fighter, r, color, 1.3, flash, 0.24);
            Neon.detail(c, [0, -0.55, 0, 0.35], r, trim, 0.45, 1);
            Boss._pair(c, [0.17, 0.02, 0.5, 0.2], r, trim, 0.6, 1);
            Neon.shape(c, S.fighterCanopy, r, trim, 0.7, flash, 0.4);
        },
        nexus(c, color, r, flash) {
            Boss._ellipse(c, 0, 0, r * 0.9, r * 0.9, color, 0.7, flash, 0.06);
            Boss._ellipse(c, 0, 0, r * 0.55, r * 0.55, color, 1.8, flash, 0.22);
            // Latitude and longitude lines give the sphere some depth
            c.strokeStyle = color; c.lineWidth = 1; c.globalAlpha = 0.4;
            for (const [rx, ry] of [[0.55, 0.18], [0.55, 0.38], [0.2, 0.55], [0.4, 0.55]]) {
                c.beginPath(); c.ellipse(0, 0, r * rx, r * ry, 0, 0, Math.PI * 2); c.stroke();
            }
            c.globalAlpha = 1;
        },
        echo(c, color, r, flash) {
            const S = MidBoss._NEON_SHAPES;
            Neon.shape(c, S.echoHull, r, color, 1.8, flash, 0.2);
            Neon.detail(c, [0, 0.78, 0, -0.3], r, color, 0.45, 1);
            Boss._pair(c, [0.32, -0.1, 0.82, -0.47], r, color, 0.6, 1);
            Boss._pair(c, [0.28, 0.05, 0.28, -0.6], r, color, 0.3, 1);
            Neon.shape(c, S.echoCanopy, r, '#88eeff', 0.9, flash, 0.35);
        },
    },

    _neon: {
        architect(ctx, r, color, flash) {
            const t = this.moveTimer;
            const f = flash ? '|f' : '';
            if (flash) ctx.scale(1.03, 0.98);
            Neon.sprite(ctx, 'b_arch|' + color + f, r * 1.1 + 6, this._bake.architect, color, r, flash);
            for (let s = -1; s <= 1; s += 2) Neon.light(ctx, s * r * 0.34, r * 1.02, 2, color, 0.8);
            // Shoulder pods bob out of step; muzzle lights charge and fade
            for (let s = -1; s <= 1; s += 2) {
                ctx.save();
                ctx.translate(0, Math.sin(t * 2 + (s > 0 ? 0 : Math.PI)) * 2);
                ctx.scale(s, 1);
                Neon.sprite(ctx, 'b_archpod|' + color + f, r * 1.05 + 6, this._bake.architectPod, color, r, flash);
                const charge = 0.4 + 0.6 * Math.max(0, Math.sin(t * 3 + (s > 0 ? 0 : 1.5)));
                Neon.light(ctx, r * 0.905, r * 0.32, 2.5, color, flash ? 1 : charge);
                ctx.restore();
            }
            // Eye: sweeping scan line and a pupil that tracks the player
            const scan = Math.sin(t * 1.7) * 0.16;
            Neon.detail(ctx, [scan, -0.33, scan, -0.17], r, color, 0.35, 1);
            const look = Math.max(-1, Math.min(1, (Player.x - this.x) / 220));
            Neon.light(ctx, look * r * 0.1, -r * 0.25, r * 0.05, color, 1);
        },

        furnace(ctx, r, color, flash) {
            const t = this.moveTimer;
            // Smoke and embers from the stacks
            for (let s = -1; s <= 1; s += 2) {
                for (let j = 0; j < 4; j++) {
                    const p = (t * 0.6 + j / 4 + (s > 0 ? 0.4 : 0)) % 1;
                    const ember = j === 0;
                    ctx.fillStyle = ember ? '#ffaa44' : '#553322';
                    ctx.globalAlpha = (1 - p) * (ember ? 0.8 : 0.3);
                    ctx.beginPath();
                    ctx.arc(s * r * 0.6 + Math.sin(p * 5 + j) * 4, -r * (1.02 + p * 0.6), ember ? 1.5 : 4 + p * 7, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            ctx.globalAlpha = 1;
            if (flash) ctx.scale(1.03, 0.98);
            Neon.sprite(ctx, 'b_furnace|' + color + (flash ? '|f' : ''), r * 1.2 + 6, this._bake.furnace, color, r, flash);
            // Fire behind the grille breathes in and out
            const heat = 0.55 + Math.sin(t * 4) * 0.3;
            ctx.fillStyle = '#ff2200';
            ctx.globalAlpha = heat * 0.5;
            ctx.beginPath(); ctx.arc(0, r * 0.04, r * 0.26, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1;
            Neon.light(ctx, 0, r * 0.04, r * 0.08, '#ff6600', heat);
            Neon.light(ctx, 0, r * 0.95, 2.5, color, 0.5 + Math.sin(t * 6) * 0.4);
            for (let s = -1; s <= 1; s += 2) Neon.light(ctx, s * r * 1.12, -r * 0.03, 2, color, 0.5 + Math.sin(t * 6 + 1) * 0.4);
        },

        leviathan(ctx, r, color, flash) {
            const t = this.moveTimer;
            // Tentacles behind the body
            for (let k = 0; k < 6; k++) {
                const ta = (Math.PI * 2 / 6) * k + t * 0.4;
                const wave = Math.sin(t * 2.5 + k * 1.2);
                ctx.beginPath();
                ctx.moveTo(Math.cos(ta) * r * 0.7, Math.sin(ta) * r * 0.5);
                ctx.quadraticCurveTo(
                    Math.cos(ta) * r * 1.3 + wave * 15, Math.sin(ta) * r * 1.0 + wave * 10,
                    Math.cos(ta + 0.2 + wave * 0.1) * r * 1.8, Math.sin(ta + 0.2 + wave * 0.1) * r * 1.4
                );
                ctx.globalAlpha = 0.55 + Math.sin(t * 3 + k) * 0.25;
                Neon.stroke(ctx, color, 1.1 - k * 0.05, flash);
                ctx.globalAlpha = 1;
                Neon.light(ctx, Math.cos(ta + 0.2 + wave * 0.1) * r * 1.8, Math.sin(ta + 0.2 + wave * 0.1) * r * 1.4, 1.6, color, 0.7);
            }
            // The body breathes
            const breathe = 1 + Math.sin(t * 1.8) * 0.02;
            ctx.save();
            ctx.scale(breathe, 2 - breathe);
            Neon.sprite(ctx, 'b_levi|' + color + (flash ? '|f' : ''), r * 1.0 + 6, this._bake.leviathan, color, r, flash);
            ctx.restore();
            // Eyes blink in turn and follow the player
            const look = Math.max(-1, Math.min(1, (Player.x - this.x) / 220));
            const eyes = [[-0.25, -0.25], [0.25, -0.25], [0, -0.05]];
            for (let k = 0; k < 3; k++) {
                const blink = Math.sin(t * 0.9 + k * 2.1) > 0.97;
                if (blink) continue;
                Neon.light(ctx, (eyes[k][0] + look * 0.05) * r, eyes[k][1] * r, r * 0.035, '#00ffaa', 1);
            }
        },

        interceptor_duo(ctx, r, color, flash) {
            const t = this.moveTimer;
            const sep = this.phase === 1 ? 45 : 18;
            // Phase 2: energy link between the ships, with sparks running along it
            if (this.phase === 2) {
                for (let beam = 0; beam < 3; beam++) {
                    const by = -r * 0.2 + beam * r * 0.25;
                    ctx.beginPath(); ctx.moveTo(-sep, by); ctx.lineTo(sep, by);
                    ctx.globalAlpha = 0.5 + Math.sin(t * 5 + beam) * 0.25;
                    Neon.stroke(ctx, '#ff9900', 0.8, false);
                    ctx.globalAlpha = 1;
                    const p = ((t * 1.5 + beam * 0.33) % 1) * 2 - 1;
                    Neon.light(ctx, p * sep, by, 1.5, '#ffcc44', 1);
                }
            }
            for (let s = -1; s <= 1; s += 2) {
                const trim = s < 0 ? '#ffcc44' : '#ff6644';
                ctx.save();
                ctx.translate(s * sep, 0);
                Neon.flame(ctx, 0, r * 0.47, 4, r * 0.2 + Math.sin(t * 30 + s) * 2, trim, 0.9);
                if (flash) ctx.scale(1.05, 0.96);
                Neon.sprite(ctx, 'b_fighter|' + color + '|' + trim + (flash ? '|f' : ''), r * 0.62 + 6, this._bake.fighter, color, r, flash, trim);
                ctx.restore();
            }
        },

        nexus(ctx, r, color, flash) {
            const t = this.moveTimer;
            if (flash) ctx.scale(1.03, 1.03);
            Neon.sprite(ctx, 'b_nexus|' + color + (flash ? '|f' : ''), r * 0.95 + 6, this._bake.nexus, color, r, flash);
            // Orbital rings with a node riding each
            for (let ring = 0; ring < 3; ring++) {
                const rx = r * (0.75 + ring * 0.12), ry = r * (0.25 + ring * 0.05);
                const rot = t * (0.6 + ring * 0.4);
                ctx.beginPath();
                ctx.ellipse(0, 0, rx, ry, rot, 0, Math.PI * 2);
                ctx.globalAlpha = 0.6 + Math.sin(t * 2 + ring) * 0.2;
                Neon.stroke(ctx, ring === 1 ? '#ff00ff' : color, 0.8, flash);
                ctx.globalAlpha = 1;
                const na = t * (1.2 + ring * 0.5);
                const nx = Math.cos(na) * rx, ny = Math.sin(na) * ry;
                Neon.light(ctx, nx * Math.cos(rot) - ny * Math.sin(rot), nx * Math.sin(rot) + ny * Math.cos(rot), 2.2, '#ff00ff', 1);
            }
            Neon.light(ctx, 0, 0, r * 0.14, color, 0.6 + Math.sin(t * 3) * 0.3);
            // Data stream motes
            ctx.fillStyle = '#ffffff';
            for (let p = 0; p < 8; p++) {
                const pa = t * 1.5 + p * 0.8;
                const pd = r * 0.4 + Math.sin(pa * 2) * r * 0.3;
                ctx.globalAlpha = 0.6;
                ctx.fillRect(Math.cos(pa) * pd - 1, Math.sin(pa) * pd - 1, 2, 2);
            }
            ctx.globalAlpha = 1;
        },

        echo(ctx, r, color, flash) {
            const t = this.moveTimer;
            // Engines at the tail (pointing up)
            const f = Math.sin(t * 40) * 1.5;
            Neon.flame(ctx, -r * 0.22, -r * 0.66, 5, -(r * 0.14 + f), '#00ffff', 0.7);
            Neon.flame(ctx, r * 0.22, -r * 0.66, 5, -(r * 0.14 - f), '#00ffff', 0.7);
            // Magenta ghost copy that jitters, with the odd big glitch jump
            const big = Math.random() < 0.06;
            ctx.save();
            ctx.translate(big ? (Math.random() - 0.5) * 20 : Math.sin(t * 11) * 3, big ? (Math.random() - 0.5) * 20 : Math.cos(t * 7) * 2);
            ctx.globalAlpha = big ? 0.55 : 0.3;
            Neon.sprite(ctx, 'b_echo|#ff00ff', r * 1.2 + 6, this._bake.echo, '#ff00ff', r, false);
            ctx.restore();
            if (flash) ctx.scale(1.03, 0.98);
            Neon.sprite(ctx, 'b_echo|' + color + (flash ? '|f' : ''), r * 1.2 + 6, this._bake.echo, color, r, flash);
            Neon.light(ctx, 0, r * 0.4, r * 0.05, '#ff00ff', 0.6 + Math.sin(t * 4) * 0.4);
        },
    },

    draw(ctx) {
        if (!this.active) return;

        // Warning: hazard bands slide in above and below a pulsing banner
        if (this.warningTimer > 0) {
            const t = 3 - this.warningTimer;
            const inK = Math.min(1, t * 3, this.warningTimer * 3);
            const pulse = Renderer.calm() ? 0.85 : 0.6 + Math.sin(t * 8) * 0.4;
            const cy = PLAY_H / 2;
            ctx.save();
            ctx.globalAlpha = inK;
            ctx.fillStyle = 'rgba(20, 0, 8, 0.6)';
            ctx.fillRect(0, cy - 62, PLAY_W, 104);
            for (const by of [cy - 62, cy + 34]) {
                ctx.save();
                ctx.beginPath(); ctx.rect(0, by, PLAY_W, 8); ctx.clip();
                ctx.fillStyle = '#ff0050';
                const off = (t * 60 * (by < cy ? 1 : -1)) % 24;
                for (let x = -24 + off; x < PLAY_W + 24; x += 24) {
                    ctx.beginPath(); ctx.moveTo(x, by + 8); ctx.lineTo(x + 8, by); ctx.lineTo(x + 16, by); ctx.lineTo(x + 8, by + 8); ctx.fill();
                }
                ctx.restore();
            }
            ctx.globalAlpha = inK * pulse;
            Neon.text(ctx, 'WARNING', PLAY_W / 2, cy - 8, '#ff0050', 46, { core: 0.4 });
            ctx.globalAlpha = inK;
            Neon.text(ctx, this.bossName + ' APPROACHES', PLAY_W / 2, cy + 22, '#ff6688', 16, { weight: '' });
            ctx.restore();
            Renderer.addGlow(PLAY_W / 2, cy - 20, 0xff0050, 200, 0.25 * inK * pulse);
            return;
        }

        if (this.defeated && this.defeatTimer >= 2.5) return;   // shattered

        ctx.save();
        ctx.translate(this.x, this.y);

        const flash = this.flashTimer > 0;
        const mainColor = flash ? '#ffffff' : (this.colors[this.phase - 1] || '#ff4444');

        // Dynamic light — boss core glow (brighter during flash)
        Renderer.addGlow(this.x, this.y, Renderer.colorToHex(mainColor), this.radius * (flash ? 5 : 3), flash ? 0.8 : 0.35);

        // Type-specific body (unknown types draw as the Architect, matching init())
        const draw = this._neon[this.bossType] || this._neon.architect;
        draw.call(this, ctx, this.radius, this.colors[this.phase - 1] || '#ff4444', flash);

        // Armor segments (any boss with armor)
        if (this.armor.length > 0 && this.phase === 1) {
            for (const seg of this.armor) {
                if (!seg.alive) continue;
                // Same orbit as the hit zones and the armor's own guns (armorPositions)
                const ax = Math.cos(seg.angle + this.moveTimer) * BOSS_ARMOR_ORBIT;
                const ay = Math.sin(seg.angle + this.moveTimer) * BOSS_ARMOR_ORBIT;
                // Hexagonal plate that spins against the orbit
                ctx.save();
                ctx.translate(ax, ay);
                ctx.rotate(-this.moveTimer * 2 + seg.angle);
                Neon.sprite(ctx, 'b_armor' + (flash ? '|f' : ''), BOSS_ARMOR_RADIUS + 3, this._bake.armor, '#ff6644', BOSS_ARMOR_RADIUS - 3, flash);
                ctx.restore();
            }
        }

        // Core glow (phases 2-3)
        if (this.phase >= 2) {
            const pulse = Math.sin(this.moveTimer * 5);
            ctx.globalAlpha = 0.5 + Math.sin(this.moveTimer * 3) * 0.2;
            Neon.ring(ctx, 0, 0, 13 + pulse * 4, '#ff00ff', 0.8, false);
            ctx.globalAlpha = 1;
            Neon.light(ctx, 0, 0, 4 + pulse, '#ff00ff', 1);
        }

        ctx.restore();

        // HP bar, with pips for the phases still to come
        if (this.entered && !this.defeated) {
            const hpColor = this.phase === 1 ? '#ff4455' : this.phase === 2 ? '#ff00ff' : '#ff0040';
            const timeLeft = Math.max(0, BOSS_PHASE_TIME_LIMIT - this.phaseTime);
            Neon.topBar(ctx, `${this.bossName} — PHASE ${this.phase}`, this.hp / this.maxHp, hpColor, timeLeft,
                [this.totalPhases - this.phase + 1, this.totalPhases]);
        }
    }
};


// === player.js ===
// ============================================================
//  PLAYER
// ============================================================
const Player = {
    x: PLAY_W / 2,
    y: PLAY_H - 80,
    speed: 360,
    radius: 14,          // Visual radius
    hitboxRadius: 3,     // Actual collision radius
    grazeRadius: 24,     // Graze detection zone

    // State
    lives: 3,
    alive: true,
    invincible: false,
    invincibleTimer: 0,
    respawnTimer: 0,
    shieldHp: 0,
    maxShieldHp: 0,
    shieldFlashTimer: 0,
    deathAnimTimer: 0,
    deathX: 0,
    deathY: 0,

    // Weapons
    primaryWeapon: 'none', // 'none', 'spread', 'homing', 'laser'
    primaryLevel: 0,
    droneLevel: 0,
    fireTimer: 0,        // base shot
    weaponTimer: 0,      // primary weapon
    droneShotTimer: 0,
    droneContactTimer: 0,
    shieldPulseTimer: 0,
    shieldPulseFlash: 0,
    deathPending: 0,     // death-bomb window remaining

    // Abilities
    bombs: 3,
    bombActive: false,
    bombTimer: 0,
    dashCooldown: 0,
    dashing: false,
    dashTimer: 0,
    dashDir: { x: 0, y: 0 },

    // Visual
    engineFlicker: 0,
    trailPositions: [],

    // Bullet pool
    bullets: new BulletPool(200),

    init() {
        this.x = PLAY_W / 2;
        this.y = PLAY_H - 80;
        this.alive = true;
        this.invincible = true;
        this.invincibleTimer = 2.0;
        this.lives = GameConfig.lives;
        this.bombs = GameConfig.bombs.enabled ? GameConfig.bombs.startCount : 0;
        this.maxShieldHp = GameConfig.shieldHp || 0;
        this.shieldHp = this.maxShieldHp;
        this.shieldFlashTimer = 0;
        this.primaryWeapon = 'none';
        this.primaryLevel = 0;
        this.droneLevel = 0;
        this.fireTimer = 0;
        this.weaponTimer = 0;
        this.droneShotTimer = 0;
        this.droneContactTimer = 0;
        this.shieldPulseTimer = 3.0;
        this.shieldPulseFlash = 0;
        this.deathPending = 0;
        this.prevX = this.x;
        this.prevY = this.y;
        this.dashCooldown = 0;
        this.dashing = false;
        this.bombActive = false;
        this.bullets.clear();
        this.trailPositions = [];
    },

    // Weapon tuning. Targets (single target, all shots landing, incl. base shot):
    // Lv1 ≈ 17-18 DPS, Lv3 ≈ 26-31, Lv5 ≈ 36-45 — a ~2.5× power curve like
    // Raiden/Touhou, with every weapon within ~20% of the others.
    BASE_SHOT_INTERVAL: 0.12,
    WEAPON_INTERVALS: { spread: 0.25, homing: 0.26, laser: 0.1 }, // homing never misses, so it fires slower
    DRONE_SHOT_INTERVAL: 0.5,
    DRONE_CONTACT_INTERVAL: 0.15,
    FOCUS_SPREAD_FACTOR: 0.35,
    // Spread fans: each level is a strict superset of the previous one (pellets are only
    // ever added), so an upgrade can never land fewer shots on a target at any range
    SPREAD_ANGLES: [
        null,
        [-0.05, 0.05],
        [-0.05, 0, 0.05],
        [-0.2, -0.05, 0, 0.05, 0.2],
        [-0.2, -0.12, -0.05, 0, 0.05, 0.12, 0.2],
        [-0.34, -0.2, -0.12, -0.05, 0, 0.05, 0.12, 0.2, 0.34],
    ],

    droneCount() {
        return this.droneLevel > 0 ? this.droneLevel + 1 : 0; // Lv1: 2 … Lv5: 6
    },

    dronePositions() {
        const n = this.droneCount();
        const out = [];
        for (let d = 0; d < n; d++) {
            const a = (Math.PI * 2 / n) * d + this.engineFlicker * 0.15;
            out.push({ x: this.x + Math.cos(a) * 30, y: this.y + Math.sin(a) * 30 });
        }
        return out;
    },

    isFocusing() {
        return GameConfig.focus.enabled && Input.isHeld('focus');
    },

    update(dt) {
        if (!this.alive) {
            this.respawnTimer -= dt;
            this.deathAnimTimer = Math.max(0, this.deathAnimTimer - dt);
            if (this.respawnTimer <= 0 && this.lives > 0) this._respawn();
            // Keep bullets moving even while dead
            this.bullets.update(dt, Enemies.list);
            return;
        }

        this.prevX = this.x;
        this.prevY = this.y;
        this.engineFlicker += dt * 20;
        this.invincibleTimer = Math.max(0, this.invincibleTimer - dt);
        if (this.invincibleTimer <= 0 && !this.dashing) this.invincible = false;
        this.dashCooldown = Math.max(0, this.dashCooldown - dt);
        this.shieldFlashTimer = Math.max(0, this.shieldFlashTimer - dt);
        this.shieldPulseFlash = Math.max(0, this.shieldPulseFlash - dt);

        // Death-bomb window: a lethal hit can still be cancelled by bombing (Touhou-style)
        if (this.deathPending > 0) {
            if (Input.isPressed('bomb') && GameConfig.bombs.enabled && this.bombs > 0) {
                this.deathPending = 0;
                this._useBomb();
                Scoring.spawnPopup('DEATH BOMB!', '#00ffff', 20);
            } else {
                this.deathPending -= dt;
                if (this.deathPending <= 0) {
                    this.deathPending = 0;
                    this._die(true);
                    return;
                }
            }
        }

        // Bomb
        if (this.bombActive) {
            this.bombTimer -= dt;
            if (this.bombTimer <= 0) this.bombActive = false;
        }

        // Dash
        if (this.dashing) {
            this.dashTimer -= dt;
            this.x += this.dashDir.x * this.speed * 3 * dt;
            this.y += this.dashDir.y * this.speed * 3 * dt;
            if (this.dashTimer <= 0) {
                this.dashing = false;
                // Keep any invulnerability that was already running (bomb, respawn, shield)
                this.invincible = this.invincibleTimer > 0;
            }
        } else {
            // Normal movement
            const move = Input.getMovement();
            const spd = this.speed * (this.isFocusing() ? GameConfig.focus.speedMultiplier : 1);
            this.x += move.x * spd * dt;
            this.y += move.y * spd * dt;
        }

        // Clamp to play area
        this.x = Math.max(this.radius, Math.min(PLAY_W - this.radius, this.x));
        this.y = Math.max(this.radius, Math.min(PLAY_H - this.radius, this.y));

        // Trail
        this.trailPositions.unshift({ x: this.x, y: this.y });
        if (this.trailPositions.length > 10) this.trailPositions.pop();

        // Firing — auto-fire keeps shooting while focusing (focus tightens the pattern instead)
        const shouldFire = (GameConfig.fireMode === 'auto' || Input.isHeld('fire')) && !this.dashing && this.deathPending <= 0;
        const rateMult = Scoring.surgeActive ? 0.5 : 1; // Neon Surge: double fire rate
        this.fireTimer -= dt;
        this.weaponTimer -= dt;
        this.droneShotTimer -= dt;
        if (shouldFire) {
            if (this.fireTimer <= 0) {
                this._fireBaseShot();
                this.fireTimer = this.BASE_SHOT_INTERVAL * rateMult;
            }
            if (this.primaryWeapon !== 'none' && this.primaryLevel > 0 && this.weaponTimer <= 0) {
                this._fireWeapon();
                this.weaponTimer = this.WEAPON_INTERVALS[this.primaryWeapon] * rateMult;
            }
            if (this.droneLevel >= 3 && this.droneShotTimer <= 0) {
                this._fireDrones();
                this.droneShotTimer = this.DRONE_SHOT_INTERVAL * rateMult;
            }
        }

        // Laser beam MeshRope — show while firing, hide otherwise
        if (this.primaryWeapon === 'laser' && this.alive) {
            const laserColor = Hangar.equipped.bullet === 'neon' ? '#4488ff' : Hangar.bulletColor;
            Renderer.updateLaserBeam(this.x, this.y - this.radius, laserColor, shouldFire);
        } else {
            Renderer.updateLaserBeam(0, 0, null, false);
        }

        // Dash input
        if (Input.isPressed('dash') && GameConfig.dash.enabled && this.dashCooldown <= 0 && !this.dashing) {
            this._startDash();
        }

        // Bomb input (the death-bomb window above handles bombing while hit)
        if (Input.isPressed('bomb') && GameConfig.bombs.enabled && this.bombs > 0 && !this.bombActive && this.deathPending <= 0) {
            this._useBomb();
        }

        // Graze detection — only while vulnerable (dashing through bullets still counts)
        if (GameConfig.graze.enabled && (!this.invincible || this.dashing) && this.deathPending <= 0) {
            const gz = this.grazeRadius * (GameConfig.graze.zoneMultiplier || 1);
            for (const b of Enemies.enemyBullets.pool) {
                if (b.grazed || b.harmless > 0) continue;
                const dx = b.x - this.x;
                const dy = b.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < gz && dist > this.hitboxRadius + b.radius) {
                    b.grazed = true;
                    Scoring.addGraze();
                    Particles.spawn(b.x, b.y, 2, { color: '#ffffff', speed: 60, life: 0.15, size: 1.5 });
                    Audio.playGraze();
                }
            }
        }

        // Surge activation — dedicated SURGE input, or bomb with no bombs left
        if (Scoring.surgeCharge >= Scoring.surgeMax && !Scoring.surgeActive) {
            const surgeTriggered = Input.isPressed('surge') ||
                                   (Input.isPressed('bomb') && (!GameConfig.bombs.enabled || this.bombs <= 0));
            if (surgeTriggered) {
                Scoring.activateSurge();
                Achievements.onSurge();
                Audio.playSurgeActivate();
                ScreenShake.trigger(12, 0.5);
                Renderer.triggerFlash(0xffffff, 0.35);
                Renderer.triggerChroma(0.025, 0.7);
                Renderer.triggerShockwave(this.x / PLAY_W, this.y / PLAY_H);
                Particles.spawn(this.x, this.y, 80, { color: '#ffffff', speed: 300, life: 0.7, size: 4 });
                Particles.spawn(this.x, this.y, 40, { color: '#00ffff', speed: 200, life: 1.0, size: 2.5 });
                Particles.spawnShockwave(this.x, this.y, '#00ffff', 150, 0.45);
                Renderer.addGlow(this.x, this.y, 0x00ffff, 150, 0.95);
                Renderer.spawnExplosionSprite(this.x, this.y, 5, 0x00ffff, 0.5);
            }
        }

        // Drones: contact damage and periodic shield pulse
        this._updateDrones(dt);

        // Collision with enemy bullets (swept, so fast bullets can't tunnel through the hitbox)
        if (!this.invincible && !this.dashing && this.deathPending <= 0) {
            for (const b of Enemies.enemyBullets.pool) {
                if (b.harmless > 0) continue;
                const r = this.hitboxRadius + b.radius;
                if (this._sweptHit(b, r)) {
                    b.active = false;
                    this._die();
                    break;
                }
            }
        }

        // Collision with enemies (contact damage)
        if (!this.invincible && !this.dashing && this.deathPending <= 0) {
            for (const e of Enemies.list) {
                const dx = e.x - this.x;
                const dy = e.y - this.y;
                if (dx * dx + dy * dy < (this.hitboxRadius + e.radius) * (this.hitboxRadius + e.radius)) {
                    this._die();
                    break;
                }
            }
        }

        // Collision with boss
        if (!this.invincible && !this.dashing && this.deathPending <= 0 && Boss.active && Boss.entered && !Boss.defeated) {
            const dx = Boss.x - this.x;
            const dy = Boss.y - this.y;
            if (dx * dx + dy * dy < (this.hitboxRadius + Boss.radius) * (this.hitboxRadius + Boss.radius)) {
                this._die();
            }
        }

        // Neon Surge: player shots cancel enemy bullets they touch
        if (Scoring.surgeActive) this._surgeCancelBullets();

        // Player bullets collision with enemies
        for (let i = this.bullets.pool.length - 1; i >= 0; i--) {
            const b = this.bullets.pool[i];
            if (!b.active) continue;

            // Check boss (armor segments first, then the core)
            if (Boss.active && Boss.entered && !Boss.defeated) {
                if (Boss.hitTest(b)) {
                    b.active = false;
                    Scoring.onHit();
                    Particles.impact(b);
                    continue;
                }
            }

            // Check enemies — lasers pierce, hitting each enemy once
            for (const e of Enemies.list) {
                if (b.pierce && b.hitSet && b.hitSet.has(e)) continue;
                const dx = b.x - e.x;
                const dy = b.y - e.y;
                if (dx * dx + dy * dy < (b.radius + e.radius) * (b.radius + e.radius)) {
                    // Calculate player-to-enemy distance for point-blank bonus
                    const pdx = this.x - e.x, pdy = this.y - e.y;
                    const playerDist = Math.sqrt(pdx * pdx + pdy * pdy);
                    Enemies.hit(e, b.damage, playerDist);
                    Scoring.onHit();
                    Particles.impact(b);
                    if (b.pierce) {
                        (b.hitSet || (b.hitSet = new Set())).add(e);
                        continue;
                    }
                    b.active = false;
                    break;
                }
            }
        }

        // Collect power-ups
        for (let i = PowerUps.list.length - 1; i >= 0; i--) {
            const p = PowerUps.list[i];
            const dx = p.x - this.x;
            const dy = p.y - this.y;
            if (dx * dx + dy * dy < (p.radius + this.radius) * (p.radius + this.radius)) {
                this._collectPowerUp(p);
                PowerUps.list.splice(i, 1);
            }
        }

        this.bullets.update(dt, this._targets());
    },

    // Enemies plus the boss, as homing/drone targets
    _targets() {
        const targets = [...Enemies.list];
        if (Boss.active && Boss.entered && !Boss.defeated) targets.push({ x: Boss.x, y: Boss.y, isBoss: true });
        return targets;
    },

    // Closest approach between the hitbox and a bullet's path since the last frame
    _sweptHit(b, r) {
        const px = this.prevX !== undefined ? this.prevX : this.x;
        const py = this.prevY !== undefined ? this.prevY : this.y;
        const ax = b.prevX - px, ay = b.prevY - py;   // relative position at start of step
        const bx = b.x - this.x, by = b.y - this.y;   // relative position now
        const vx = bx - ax, vy = by - ay;
        const len2 = vx * vx + vy * vy;
        let t = len2 > 0 ? -(ax * vx + ay * vy) / len2 : 0;
        t = Math.max(0, Math.min(1, t));
        const cx = ax + vx * t, cy = ay + vy * t;
        return cx * cx + cy * cy < r * r;
    },

    _surgeCancelBullets() {
        const enemy = Enemies.enemyBullets.pool;
        for (const b of this.bullets.pool) {
            if (!b.active) continue;
            for (const eb of enemy) {
                if (!eb.active) continue;
                const dx = b.x - eb.x, dy = b.y - eb.y;
                const r = b.radius + eb.radius + 2;
                if (dx * dx + dy * dy < r * r) {
                    eb.active = false;
                    Particles.spawn(eb.x, eb.y, 2, { color: '#ffffff', speed: 60, life: 0.2, size: 2 });
                    Scoring.score += Math.floor(10 * GameConfig.scoreMultiplier);
                    if (!b.pierce) { b.active = false; break; }
                }
            }
        }
    },

    _updateDrones(dt) {
        if (this.droneLevel <= 0) return;
        const drones = this.dronePositions();

        // Contact damage (GDD: drones damage enemies they touch)
        this.droneContactTimer -= dt;
        if (this.droneContactTimer <= 0) {
            this.droneContactTimer = this.DRONE_CONTACT_INTERVAL;
            for (const d of drones) {
                for (const e of [...Enemies.list]) {
                    const dx = e.x - d.x, dy = e.y - d.y;
                    if (dx * dx + dy * dy < (e.radius + 6) * (e.radius + 6)) Enemies.hit(e, 1);
                }
                if (Boss.active && Boss.entered && !Boss.defeated) {
                    const dx = Boss.x - d.x, dy = Boss.y - d.y;
                    if (dx * dx + dy * dy < (Boss.radius + 6) * (Boss.radius + 6)) Boss.hit(1);
                }
            }
        }

        // Shield pulse (Lv2+): periodically cancels enemy bullets close to the ship
        if (this.droneLevel >= 2) {
            this.shieldPulseTimer -= dt;
            if (this.shieldPulseTimer <= 0) {
                this.shieldPulseTimer = this.droneLevel >= 4 ? 2.0 : 3.0;
                this.shieldPulseFlash = 0.25;
                const r = this.droneLevel >= 5 ? 55 : 45;
                for (const b of Enemies.enemyBullets.pool) {
                    const dx = b.x - this.x, dy = b.y - this.y;
                    if (dx * dx + dy * dy < r * r) {
                        b.active = false;
                        Particles.spawn(b.x, b.y, 2, { color: '#cc44ff', speed: 60, life: 0.2, size: 2 });
                    }
                }
            }
        }
    },

    _weaponColors() {
        const bColor = Hangar.bulletColor;
        const isDefaultBullet = Hangar.equipped.bullet === 'neon';
        return {
            spread: isDefaultBullet ? '#ff8c00' : bColor,
            homing: isDefaultBullet ? '#00ff88' : bColor,
            laser: isDefaultBullet ? '#4488ff' : bColor,
            drone: isDefaultBullet ? '#cc44ff' : bColor,
        };
    },

    // Base shot: always available, on its own timer so weapons never slow it down
    _fireBaseShot() {
        this.bullets.spawn(this.x, this.y - this.radius, 0, -700, { color: Hangar.bulletColor, radius: 3, damage: 1 });
        Particles.flash(this.x, this.y - this.radius - 2, 9, Hangar.bulletColor, 0.05);
        Audio.playShot();
    },

    _fireWeapon() {
        const baseSpeed = -700;
        const lvl = this.primaryLevel;
        const colors = this._weaponColors();
        const focus = this.isFocusing();

        switch (this.primaryWeapon) {
            case 'spread': {
                // Focus tightens the fan (Touhou-style focused shot)
                const spreadMult = focus ? this.FOCUS_SPREAD_FACTOR : 1;
                const rad = lvl >= 4 ? 3 : 2.5;
                for (const a0 of this.SPREAD_ANGLES[lvl]) {
                    const a = a0 * spreadMult;
                    this.bullets.spawn(this.x, this.y - this.radius,
                        Math.sin(a) * -baseSpeed, Math.cos(a) * baseSpeed,
                        { color: colors.spread, radius: rad, damage: 1 });
                }
                break;
            }
            case 'homing': {
                const count = lvl + 1; // Lv1: 2 … Lv5: 6 missiles
                const spd = lvl >= 4 ? 0.7 : lvl >= 2 ? 0.65 : 0.6;
                for (let j = 0; j < count; j++) {
                    const ox = (j - (count - 1) / 2) * 12;
                    this.bullets.spawn(this.x + ox, this.y - this.radius,
                        ox * 2, baseSpeed * spd,
                        { color: colors.homing, radius: 2.5, damage: 1, type: 'homing', life: 3 });
                }
                break;
            }
            case 'laser': {
                // Piercing beam: main beam plus side beams (Lv3+) and thin outer beams (Lv4+)
                const mainDmg = [0, 1.0, 1.3, 1.6, 1.9, 2.3][lvl];
                const mainW = [0, 4, 5, 6, 7, 8][lvl];
                const opts = (radius, damage) => ({ color: colors.laser, radius, damage, type: 'laser', pierce: true });
                this.bullets.spawn(this.x, this.y - this.radius, 0, baseSpeed * 1.5, opts(mainW, mainDmg));
                if (lvl >= 3) {
                    const off = [0, 0, 0, 12, 13, 14][lvl];         // stays inside a scout's hitbox
                    const dmg = [0, 0, 0, 0.3, 0.35, 0.4][lvl];
                    this.bullets.spawn(this.x - off, this.y - this.radius, 0, baseSpeed * 1.5, opts(3, dmg));
                    this.bullets.spawn(this.x + off, this.y - this.radius, 0, baseSpeed * 1.5, opts(3, dmg));
                }
                if (lvl >= 4) {
                    const off = lvl >= 5 ? 28 : 26;
                    const dmg = lvl >= 5 ? 0.2 : 0.15;
                    this.bullets.spawn(this.x - off, this.y - this.radius, 0, baseSpeed * 1.3, opts(2, dmg));
                    this.bullets.spawn(this.x + off, this.y - this.radius, 0, baseSpeed * 1.3, opts(2, dmg));
                }
                break;
            }
        }
        const flashColor = colors[this.primaryWeapon];
        if (flashColor) Particles.flash(this.x, this.y - this.radius - 2, 12, flashColor, 0.06);
    },

    // Drones Lv3+: each drone fires at the nearest target, including the boss
    _fireDrones() {
        const targets = this._targets();
        if (targets.length === 0) return;
        const color = this._weaponColors().drone;
        for (const d of this.dronePositions()) {
            let nearest = null, nearDist = Infinity;
            for (const t of targets) {
                const d2 = (t.x - d.x) * (t.x - d.x) + (t.y - d.y) * (t.y - d.y);
                if (d2 < nearDist) { nearDist = d2; nearest = t; }
            }
            const ang = Math.atan2(nearest.y - d.y, nearest.x - d.x);
            this.bullets.spawn(d.x, d.y, Math.cos(ang) * 500, Math.sin(ang) * 500,
                { color, radius: 2, damage: 1, life: 1.5 });
        }
    },

    _startDash() {
        const move = Input.getMovement();
        if (move.x === 0 && move.y === 0) {
            this.dashDir = { x: 0, y: -1 }; // Default: dash up
        } else {
            this.dashDir = move;
        }
        this.dashing = true;
        this.dashTimer = 0.2;
        this.invincible = true;
        this.dashCooldown = GameConfig.dash.cooldown;
        Audio.playDash();
        Particles.spawn(this.x, this.y, 8, { color: '#00ffff', speed: 100, life: 0.3, size: 2 });
    },

    _useBomb() {
        this.bombs--;
        Scoring.recordBomb();
        this.bombActive = true;
        this.bombTimer = 1.5;
        this.invincible = true;
        this.invincibleTimer = Math.max(this.invincibleTimer, 1.5);
        Renderer.triggerChroma(0.015, 0.6);
        Renderer.triggerFlash(0x00ffff, 0.3);
        Renderer.triggerShockwave(this.x / PLAY_W, this.y / PLAY_H);

        // Clear all enemy bullets
        Enemies.enemyBullets.clear();

        // Damage all enemies — tiered by the enemy's BASE toughness, so level HP scaling
        // doesn't push basic enemies out of the "guaranteed kill" tier
        for (const e of [...Enemies.list]) {
            const baseHp = (Enemies.types[e.type] || {}).hp || e.maxHp;
            let bombDmg;
            if (e.midboss) {
                bombDmg = Math.ceil(e.maxHp * 0.1);          // Mid-bosses: like bosses, 10%
            } else if (baseHp <= 3) {
                bombDmg = e.maxHp + e.shieldHp + 5;          // Guaranteed kill: scouts, snipers, shield walls
            } else if (baseHp <= 6) {
                bombDmg = Math.ceil(e.maxHp * 0.75);        // Gunships, turrets, phase shifters — nearly dead
            } else {
                bombDmg = Math.ceil(e.maxHp * 0.45);        // Cruisers, carriers, bombers — hurt but survive
            }
            Enemies.hit(e, bombDmg);
        }

        // Damage boss — 10% of current phase HP, and every armor segment
        if (Boss.active && Boss.entered && !Boss.defeated) {
            Boss.bombHit(Math.max(8, Math.ceil(Boss.maxHp * 0.1)));
        }

        Scoring.breakChain();
        ScreenShake.trigger(8, 0.5);
        Audio.playBomb();

        // Bomb visual particles
        for (let i = 0; i < 40; i++) {
            const a = (Math.PI * 2 / 40) * i;
            Particles.spawn(this.x, this.y, 1, {
                color: '#00ffff', speed: 300, life: 0.8, size: 3,
                angle: a, spread: 0.1
            });
        }
    },

    // confirmed: true once the death-bomb window has expired
    _die(confirmed) {
        if (!this.alive) return;
        if (!confirmed) {
            if (this.invincible || this.deathPending > 0) return;

            // Shield absorbs hit if available
            if (this.shieldHp > 0) {
                this.shieldHp--;
                this.shieldFlashTimer = 0.3;
                this.invincible = true;
                this.invincibleTimer = 0.8;
                Particles.spawn(this.x, this.y, 20, { color: '#4488ff', speed: 150, life: 0.4, size: 2.5 });
                Particles.spawnShockwave(this.x, this.y, '#4488ff', 60, 0.35);
                Renderer.addGlow(this.x, this.y, 0x4488ff, 100, 0.8);
                Renderer.triggerChroma(0.008, 0.3);
                ScreenShake.trigger(6, 0.3);
                Audio.playShieldHit();
                return;
            }

            // Death-bomb window: a short grace period in which bombing cancels the hit
            const window = GameConfig.deathBombWindow || 0;
            if (window > 0 && GameConfig.bombs.enabled && this.bombs > 0) {
                this.deathPending = window;
                Renderer.triggerFlash(0xff0044, 0.15);
                return;
            }
        }

        this.alive = false;
        this.lives--;
        Scoring.recordDeath();
        Scoring.breakChain();
        Scoring.surgeCharge = Math.floor(Scoring.surgeCharge * 0.5); // keep half the graze effort
        Scoring.surgeActive = false;

        // Death penalty
        switch (GameConfig.deathPenalty) {
            case 'moderate':
                if (this.primaryLevel > 0) this.primaryLevel--;
                if (this.primaryLevel === 0) this.primaryWeapon = 'none';
                if (this.droneLevel > 0) this.droneLevel--;
                break;
            case 'full':
                this.primaryWeapon = 'none';
                this.primaryLevel = 0;
                this.droneLevel = 0;
                break;
        }

        // Death animation — the ship's outline shatters
        this.deathX = this.x;
        this.deathY = this.y;
        this.deathAnimTimer = 1.5;
        const skinColor = Hangar.skinColor || '#00ffff';
        Particles.shatter(this.x, this.y, this._NEON_HULL, this.radius, 0, skinColor, 1.6);
        Particles.shatter(this.x, this.y, this._NEON_CANOPY, this.radius, 0, '#aaddff', 1.2);

        Particles.spawn(this.x, this.y, 50, { color: skinColor, speed: 250, life: 0.8, size: 4 });
        Particles.spawn(this.x, this.y, 30, { color: '#ffffff', speed: 200, life: 0.5, size: 3 });
        Renderer.triggerChroma(0.02, 0.7);
        Renderer.triggerFlash(0xffffff, 0.4);
        ScreenShake.trigger(15, 0.6);
        Audio.playPlayerDeath();

        if (this.lives > 0) {
            this.respawnTimer = 1.5;
        }
    },

    _respawn() {
        this.alive = true;
        this.x = PLAY_W / 2;
        this.y = PLAY_H - 80;
        this.prevX = this.x;
        this.prevY = this.y;
        this.invincible = true;
        this.invincibleTimer = 2.0;
        this.bombs = Math.max(this.bombs, Math.min(this.bombs + 2, GameConfig.bombs.startCount));
        this.shieldHp = this.maxShieldHp; // Restore shield on respawn
        this.bullets.clear();
    },

    _collectPowerUp(powerUp) {
        Audio.playPowerUp();
        Particles.spawn(powerUp.x, powerUp.y, 10, { color: powerUp.color, speed: 80, life: 0.3 });

        const weaponNames = { spread: 'SPREAD SHOT', homing: 'HOMING MISSILES', laser: 'LASER BEAM', drone: 'DRONES' };
        const weaponColors = { spread: '#ff8c00', homing: '#00ff88', laser: '#4488ff', drone: '#cc44ff' };

        if (powerUp.type === 'drone') {
            this.droneLevel = Math.min(5, this.droneLevel + 1);
            if (this.droneLevel >= 5) Achievements.onDroneMax();
            Scoring.spawnPopup(weaponNames.drone + ' LV' + this.droneLevel, weaponColors.drone, 16);
        } else {
            if (this.primaryWeapon === powerUp.type) {
                this.primaryLevel = Math.min(5, this.primaryLevel + 1);
                if (this.primaryLevel >= 5) Achievements.onWeaponMax();
                Scoring.spawnPopup(weaponNames[powerUp.type] + ' LV' + this.primaryLevel, weaponColors[powerUp.type], 16);
            } else {
                this.primaryWeapon = powerUp.type;
                this.primaryLevel = 1;
                Scoring.spawnPopup(weaponNames[powerUp.type] + ' LV1', weaponColors[powerUp.type], 16);
            }
        }
    },

    // Neon style ship outlines, in units of this.radius
    _NEON_HULL: Neon.mirror([0, -1.15, 0.2, -0.6, 0.3, -0.05, 0.95, 0.45, 0.9, 0.62, 0.45, 0.48, 0.32, 0.72, 0.12, 0.62, 0, 0.66]),
    _NEON_CANOPY: Neon.mirror([0, -0.66, 0.1, -0.42, 0.08, -0.2, 0, -0.14]),
    _neonBank: 0,
    _neonLastX: null,

    // Draw an engine trail along pts (ship first). Styles match the Hangar
    // trails: thrust ribbon, flickering flame, particle scatter, lightning
    // arc and void (dark core, glowing edges). Also used by the Hangar preview.
    drawTrail(ctx, pts, style, color, r, t) {
        const n = pts.length;
        const calm = Renderer.calm();
        const ribbon = (fill, widthK, alpha, jitter) => {
            ctx.fillStyle = fill;
            for (let i = 0; i < n - 1; i++) {
                const p0 = pts[i], p1 = pts[i + 1];
                const j0 = jitter ? 1 + Math.sin(t * 40 + i * 1.7) * jitter : 1;
                const j1 = jitter ? 1 + Math.sin(t * 40 + (i + 1) * 1.7) * jitter : 1;
                const w0 = r * widthK * (1 - i / n) * j0, w1 = r * widthK * (1 - (i + 1) / n) * j1;
                ctx.globalAlpha = (1 - i / n) * alpha;
                ctx.beginPath();
                ctx.moveTo(p0.x - w0, p0.y); ctx.lineTo(p0.x + w0, p0.y);
                ctx.lineTo(p1.x + w1, p1.y); ctx.lineTo(p1.x - w1, p1.y);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        };
        switch (style) {
            case 'flame':
                ribbon(color, 0.6, 0.45, calm ? 0 : 0.25);
                ribbon('#ffcc33', 0.3, 0.6, calm ? 0 : 0.3);
                ribbon('#ffffff', 0.1, 0.6, 0);
                break;
            case 'scatter':
                for (let i = 1; i < n; i++) {
                    const k = 1 - i / n;
                    for (let j = 0; j < 2; j++) {
                        const h = Math.sin(i * 12.9 + j * 78.2 + Math.floor(t * 12)) * 43758.5;
                        const off = (h - Math.floor(h) - 0.5) * r * 1.2 * (1 - k);
                        Neon.light(ctx, pts[i].x + off, pts[i].y, 1.2 + k * 1.2, color, k);
                    }
                }
                break;
            case 'lightning': {
                ctx.beginPath();
                ctx.moveTo(pts[0].x, pts[0].y);
                for (let i = 1; i < n; i++) {
                    const h = Math.sin(i * 91.3 + (calm ? 0 : Math.floor(t * 20)) * 7.1) * 43758.5;
                    ctx.lineTo(pts[i].x + (h - Math.floor(h) - 0.5) * r * 1.1, pts[i].y);
                }
                ctx.globalAlpha = 0.9;
                Neon.stroke(ctx, color, 1.1, false);
                ctx.globalAlpha = 1;
                ribbon(color, 0.25, 0.25, 0);
                break;
            }
            case 'void':
                ribbon('#aa33ff', 0.62, 0.5, 0);
                ribbon('#05000c', 0.48, 0.95, 0);
                break;
            default: // thrust
                ribbon(color, 0.5, 0.35, 0);
                ribbon('#ffffff', 0.14, 0.5, 0);
        }
    },

    _HEX: Neon.polygon(6, Math.PI / 6),
    _DRONE: [0, -1, 0.7, 0, 0, 1, -0.7, 0],
    _bakeDrone(c) {
        Neon.shape(c, Player._DRONE, 6, '#cc44ff', 0.9, false, 0.3);
        Neon.detail(c, [-0.7, 0, 0.7, 0], 6, '#ee99ff', 0.6, 0.8);
    },

    _bakeShipNeon(c, sc, r, surge) {
        Neon.shape(c, Player._NEON_HULL, r, sc, 1.2, false, 0.2);
        Neon.detail(c, [0, -0.78, 0, 0.3], r, sc, 0.45, 1);
        Neon.detail(c, [0.32, 0.1, 0.82, 0.47], r, sc, 0.6, 1);
        Neon.detail(c, [-0.32, 0.1, -0.82, 0.47], r, sc, 0.6, 1);
        Neon.shape(c, Player._NEON_CANOPY, r, surge ? '#ffffff' : '#aaddff', 0.7, false, 0.4);
    },

    // Neon style ship body (origin already translated to the ship).
    // Banks into horizontal movement by narrowing the hull.
    _drawShipNeon(ctx) {
        const r = this.radius;
        const surge = Scoring.surgeActive;
        const skinColor = Hangar.equipped.skin === 'chromatic'
            ? `hsl(${(this.engineFlicker * 10) % 360}, 100%, 70%)`
            : Hangar.skinColor;
        const sc = surge ? '#ffffff' : skinColor;
        const shipAlpha = Hangar.equipped.skin === 'ghost' ? 0.6 : 1.0;

        const dx = this._neonLastX === null ? 0 : this.x - this._neonLastX;
        this._neonLastX = this.x;
        const target = Math.max(-1, Math.min(1, dx / 5));
        this._neonBank += (target - this._neonBank) * 0.2;
        const bank = this._neonBank;

        ctx.save();
        ctx.globalAlpha = shipAlpha;
        ctx.scale(1 - Math.abs(bank) * 0.18, 1);

        // Engine flames (behind the hull): coloured plume with a white core
        const trailColor = Hangar.trailColor;
        const len = 0.45 + Math.sin(this.engineFlicker) * 0.08 + Math.sin(this.engineFlicker * 2.7) * 0.05;
        for (let s = -1; s <= 1; s += 2) {
            const ex = s * r * 0.22, ey = r * 0.62;
            ctx.fillStyle = trailColor;
            ctx.globalAlpha = shipAlpha * 0.55;
            ctx.beginPath();
            ctx.moveTo(ex - r * 0.12, ey);
            ctx.lineTo(ex, ey + r * (len + 0.25));
            ctx.lineTo(ex + r * 0.12, ey);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.globalAlpha = shipAlpha * 0.9;
            ctx.beginPath();
            ctx.moveTo(ex - r * 0.05, ey);
            ctx.lineTo(ex, ey + r * len);
            ctx.lineTo(ex + r * 0.05, ey);
            ctx.fill();
        }
        ctx.globalAlpha = shipAlpha;

        // Hull, panel lines and canopy (baked per colour; the chromatic
        // skin changes colour every frame, so it is drawn live)
        const key = Hangar.equipped.skin === 'chromatic' && !surge ? null : 'player|' + sc;
        Neon.sprite(ctx, key, r * 1.25 + 4, this._bakeShipNeon, sc, r, surge);
        // The wing on the side we're banking towards catches more light
        if (Math.abs(bank) > 0.05) {
            const side = bank > 0 ? 1 : -1;
            ctx.globalAlpha = shipAlpha * Math.min(1, Math.abs(bank)) * 0.25;
            ctx.fillStyle = sc;
            Neon.path(ctx, [side * 0.3, -0.05, side * 0.95, 0.45, side * 0.9, 0.62, side * 0.45, 0.48], r, true);
            ctx.fill();
            ctx.globalAlpha = shipAlpha;
        }

        // Wing-tip running lights, blinking out of step
        const blink = Math.sin(this.engineFlicker * 0.5);
        Neon.light(ctx, r * 0.9, r * 0.52, 1.4, sc, blink > 0 ? 1 : 0.35);
        Neon.light(ctx, -r * 0.9, r * 0.52, 1.4, sc, blink > 0 ? 0.35 : 1);

        ctx.restore();
    },

    draw(ctx) {
        // Dead: the shattered hull is drawn by Particles; still draw bullets
        if (!this.alive && this.deathAnimTimer > 0) {
            this.bullets.draw(ctx);
            return;
        }

        if (!this.alive) return;

        // Blink when invincible
        if (this.invincible && !this.dashing && Math.floor(this.invincibleTimer * 10) % 2 === 0) return;

        const focusing = GameConfig.focus.enabled && Input.isHeld('focus');

        // Engine trail streams down behind the ship (the world scrolls past)
        // and bends as it moves; its look comes from the equipped trail
        const trail = this.trailPositions;
        if (trail.length > 1) {
            const pts = trail.map((p, i) => ({ x: p.x, y: p.y + this.radius * 0.7 + i * 7 }));
            this.drawTrail(ctx, pts, this.dashing ? 'thrust' : Hangar.equipped.trail,
                this.dashing ? '#ffffff' : Hangar.trailColor, this.radius, this.engineFlicker / 20);
        }

        // Drones: small spinning neon diamonds with a hot core
        if (this.droneLevel > 0) {
            const spin = this.engineFlicker * 0.2;
            for (const d of this.dronePositions()) {
                ctx.save();
                ctx.translate(d.x, d.y);
                ctx.rotate(spin);
                Neon.sprite(ctx, 'drone', 10, this._bakeDrone);
                ctx.restore();
                Neon.light(ctx, d.x, d.y, 1.6, '#cc44ff', 0.7 + Math.sin(this.engineFlicker * 0.4) * 0.3);
            }
            // Shield pulse ring (Lv2+) — shown while a pulse is cancelling bullets
            if (this.shieldPulseFlash > 0) {
                const r = this.droneLevel >= 5 ? 55 : 45;
                ctx.globalAlpha = Math.min(1, 0.3 + this.shieldPulseFlash * 2.5);
                Neon.ring(ctx, this.x, this.y, r * (1 - this.shieldPulseFlash), '#cc44ff', this.droneLevel >= 4 ? 1.4 : 1, false);
                ctx.globalAlpha = 1;
            }
        }

        ctx.save();
        ctx.translate(this.x, this.y);

        // GPU glow behind player — engine glow + surge glow
        Renderer.addGlow(this.x, this.y, Renderer.colorToHex(Hangar.trailColor), this.radius * 4, 0.45);
        if (Scoring.surgeActive) {
            Renderer.addGlow(this.x, this.y, 0xffffff, this.radius * 6, Renderer.calm() ? 0.2 : 0.5);
            // Surge aura: counter-rotating arcs
            const a0 = this.engineFlicker * 0.15;
            ctx.globalAlpha = 0.7;
            for (let k = 0; k < 3; k++) {
                const a = a0 + (Math.PI * 2 / 3) * k;
                ctx.beginPath(); ctx.arc(0, 0, this.radius + 11, a, a + 1.3);
                Neon.stroke(ctx, '#ffffff', 0.8, false);
                ctx.beginPath(); ctx.arc(0, 0, this.radius + 16, -a, -a + 0.8);
                Neon.stroke(ctx, '#00ffff', 0.6, false);
            }
            ctx.globalAlpha = 1;
        }

        // Shield: a hexagonal barrier that brightens when it takes a hit
        if (this.maxShieldHp > 0 && this.shieldHp > 0) {
            const hit = this.shieldFlashTimer > 0;
            ctx.globalAlpha = hit ? 0.9 : 0.35 + Math.sin(this.engineFlicker * 0.3) * 0.1;
            ctx.save();
            ctx.rotate(this.engineFlicker * 0.03);
            Neon.path(ctx, this._HEX, this.radius + 7, true);
            Neon.stroke(ctx, hit ? '#ffffff' : '#4488ff', 0.8, false);
            ctx.restore();
            ctx.globalAlpha = 1;
        }

        this._drawShipNeon(ctx);

        // Focus mode hitbox indicator (or always if setting enabled)
        if (focusing || Settings.values.showHitbox) {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(0, 0, this.hitboxRadius + 1, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 0.9;
            Neon.ring(ctx, 0, 0, this.hitboxRadius + 2.5, '#ff2266', 0.6, false);
            ctx.globalAlpha = 1;
            // Graze zone indicator
            if (GameConfig.graze.enabled) {
                const gz = this.grazeRadius * (GameConfig.graze.zoneMultiplier || 1);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 5]);
                ctx.beginPath();
                ctx.arc(0, 0, gz, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }

        ctx.restore();

        // Draw player bullets
        this.bullets.draw(ctx);

        // Bomb: two expanding neon rings with a brief cyan wash (no wash with Flash Reduction)
        if (this.bombActive) {
            const k = this.bombTimer / 1.5;
            const calm = Renderer.calm();
            const ringR = (1.5 - this.bombTimer) * 400;
            if (!calm) {
                Renderer.addGlow(this.x, this.y, 0x00ffff, 400 * k, k * 0.7);
                ctx.fillStyle = `rgba(0, 255, 255, ${k * 0.06})`;
                ctx.fillRect(0, 0, PLAY_W, PLAY_H);
            }
            ctx.globalAlpha = k * (calm ? 0.4 : 1);
            ctx.beginPath(); ctx.arc(this.x, this.y, ringR, 0, Math.PI * 2);
            Neon.stroke(ctx, '#00ffff', 2.2, false);
            ctx.beginPath(); ctx.arc(this.x, this.y, ringR * 0.6, 0, Math.PI * 2);
            Neon.stroke(ctx, '#88ffff', 1, false);
            ctx.globalAlpha = 1;
        }
    }
};


// === background.js ===
// ============================================================
//  BACKGROUND RENDERER
//
//  Layers (back to front):
//    1. Sky gradient
//    2. Star field (twinkle, colour tint)
//    3. Nebulae / atmosphere
//    4. Horizon feature (sun, planet, portal, etc.)
//    5. Mid-parallax ambient
//    6. Distant silhouettes
//    7. Near silhouettes (pre-baked window phases)
//    8. Perspective grid / ground plane
//    9. Foreground speed streaks
//   10. Theme overlay (data streams, void tears, etc.)
// ============================================================
const Background = {
    gridOffset: 0,
    time: 0,
    bgType: 'synthwave',

    farStars: [],
    nebulae: [],
    midLayer: [],
    distantBuildings: [],
    buildings: [],
    foreground: [],
    _dataStreams: [],   // digital theme
    _smokePuffs: [],   // industrial theme

    init() {
        this.time = 0;
        this._cachedSkyGrad = null;
        this._cachedTheme = null;

        this.farStars = [];
        for (let i = 0; i < 130; i++) {
            this.farStars.push({
                x: Math.random() * PLAY_W,
                y: Math.random() * PLAY_H * 0.82,
                size: 0.4 + Math.random() * 1.6,
                speed: 5 + Math.random() * 18,
                brightness: 0.4 + Math.random() * 0.6,
                phase: Math.random() * Math.PI * 2,
                twinkleSpeed: 1.0 + Math.random() * 2.5,
                hue: Math.floor(Math.random() * 3), // 0=white 1=blue 2=warm
            });
        }

        this.nebulae = [];
        for (let i = 0; i < 5; i++) {
            this.nebulae.push({
                x: Math.random() * PLAY_W,
                y: Math.random() * PLAY_H * 0.6,
                rx: 80 + Math.random() * 160,
                ry: 40 + Math.random() * 80,
                speed: 3 + Math.random() * 9,
                alpha: 0.04 + Math.random() * 0.05,
                phase: Math.random() * Math.PI * 2,
            });
        }

        this.midLayer = [];
        for (let i = 0; i < 18; i++) {
            this.midLayer.push({
                x: Math.random() * PLAY_W,
                y: Math.random() * PLAY_H,
                size: 1.5 + Math.random() * 4,
                speed: 20 + Math.random() * 50,
                type: Math.floor(Math.random() * 4),
                phase: Math.random() * Math.PI * 2,
            });
        }

        this.foreground = [];
        for (let i = 0; i < 28; i++) {
            this.foreground.push({
                x: Math.random() * PLAY_W,
                y: Math.random() * PLAY_H,
                size: 0.4 + Math.random() * 1.1,
                speed: 160 + Math.random() * 340,
                alpha: 0.04 + Math.random() * 0.07,
                length: 4 + Math.random() * 14,
            });
        }

        this._generateBuildings();
        this._generateThemeExtra();
    },

    _generateNearLayer() { this._generateBuildings(); this._generateThemeExtra(); },

    _generateBuildings() {
        this.buildings = [];
        this.distantBuildings = [];
        const W = PLAY_W;

        switch (this.bgType) {
            case 'synthwave':
            case 'industrial': {
                // Distant city layer — smaller, packed
                for (let x = -10; x < W + 10; x += 12 + Math.random() * 10) {
                    this.distantBuildings.push({
                        x, w: 9 + Math.random() * 18, h: 12 + Math.random() * 50,
                    });
                }
                // Near city — pre-bake window phases
                for (let x = -5; x < W + 5; x += 26 + Math.random() * 22) {
                    const w = 18 + Math.random() * 40;
                    const h = 50 + Math.random() * 120;
                    const el = { x, w, h, windows: [], antennaPhase: Math.random() * Math.PI * 2 };
                    for (let wy = 8; wy < h - 8; wy += 10) {
                        for (let wx = 4; wx < w - 4; wx += 8) {
                            el.windows.push({
                                relX: wx, relY: wy,
                                phase: Math.random() * Math.PI * 2,
                                speed: 0.2 + Math.random() * 0.6,
                                lit: Math.random() < 0.55,
                            });
                        }
                    }
                    this.buildings.push(el);
                }
                break;
            }
            case 'digital': {
                for (let x = -5; x < W + 5; x += 18 + Math.random() * 28) {
                    const w = 5 + Math.random() * 14;
                    const h = 70 + Math.random() * 150;
                    this.buildings.push({ x, w, h, phase: Math.random() * Math.PI * 2 });
                }
                for (let x = 0; x < W; x += 10 + Math.random() * 14) {
                    this.distantBuildings.push({
                        x, w: 3 + Math.random() * 8, h: 25 + Math.random() * 80,
                    });
                }
                break;
            }
            case 'space': {
                for (let x = 20; x < W - 20; x += 55 + Math.random() * 80) {
                    const types = ['antenna', 'dish', 'relay'];
                    this.buildings.push({
                        x, w: 12 + Math.random() * 30, h: 28 + Math.random() * 80,
                        type: types[Math.floor(Math.random() * 3)],
                        phase: Math.random() * Math.PI * 2,
                    });
                }
                break;
            }
            case 'sky': {
                // Three cloud-bank layers at different y positions
                for (let layer = 0; layer < 3; layer++) {
                    const baseY = 0.55 + layer * 0.1;
                    for (let x = -60; x < W + 60; x += 55 + Math.random() * 65) {
                        this.buildings.push({
                            x, w: 80 + Math.random() * 140, h: 22 + Math.random() * 35,
                            type: 'cloud', layer,
                            baseY: PLAY_H * baseY,
                            phase: Math.random() * Math.PI * 2,
                            scrollSpeed: 0.5 + layer * 0.8,
                        });
                    }
                }
                break;
            }
            case 'void': {
                for (let x = 20; x < W - 20; x += 40 + Math.random() * 60) {
                    this.buildings.push({
                        x, w: 16 + Math.random() * 40, h: 30 + Math.random() * 90,
                        phase: Math.random() * Math.PI * 2,
                    });
                }
                break;
            }
        }
    },

    _generateThemeExtra() {
        this._dataStreams = [];
        this._smokePuffs = [];

        if (this.bgType === 'digital') {
            const CHARS = '01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホ';
            for (let i = 0; i < 24; i++) {
                const len = 6 + Math.floor(Math.random() * 10);
                const chars = [];
                for (let j = 0; j < len; j++) {
                    chars.push(CHARS[Math.floor(Math.random() * CHARS.length)]);
                }
                this._dataStreams.push({
                    x: Math.random() * PLAY_W,
                    yOffset: Math.random() * PLAY_H,
                    speed: 55 + Math.random() * 90,
                    chars,
                    alpha: 0.18 + Math.random() * 0.28,
                });
            }
        }

        if (this.bgType === 'industrial') {
            // Smoke puffs — tied to chimneys generated in buildings
            for (let i = 0; i < 20; i++) {
                this._smokePuffs.push({
                    x: 30 + Math.random() * (PLAY_W - 60),
                    y: PLAY_H * 0.5 + Math.random() * PLAY_H * 0.25,
                    size: 8 + Math.random() * 18,
                    alpha: 0.04 + Math.random() * 0.08,
                    speed: 15 + Math.random() * 30,
                    dx: (Math.random() - 0.5) * 12,
                });
            }
        }
    },

    update(dt) {
        this.time += dt;
        this.gridOffset += dt * 120;
        if (this.gridOffset > 60) this.gridOffset -= 60;

        for (const s of this.farStars) {
            s.y += s.speed * dt;
            s.phase += s.twinkleSpeed * dt;
            if (s.y > PLAY_H * 0.82) { s.y = -2; s.x = Math.random() * PLAY_W; }
        }

        for (const n of this.nebulae) {
            n.y += n.speed * dt;
            if (n.y > PLAY_H * 0.65 + n.ry) { n.y = -n.ry; n.x = Math.random() * PLAY_W; }
        }

        for (const m of this.midLayer) {
            m.y += m.speed * dt;
            if (m.y > PLAY_H + 10) { m.y = -10; m.x = Math.random() * PLAY_W; }
        }

        for (const f of this.foreground) {
            f.y += f.speed * dt;
            if (f.y > PLAY_H + f.length) { f.y = -f.length; f.x = Math.random() * PLAY_W; }
        }

        for (const p of this._smokePuffs) {
            p.y -= p.speed * dt;
            p.x += p.dx * dt;
            p.size += 4 * dt;
            p.alpha -= 0.015 * dt;
            if (p.alpha <= 0 || p.y < PLAY_H * 0.3) {
                p.y = PLAY_H * 0.72 + Math.random() * PLAY_H * 0.06;
                p.x = 30 + Math.random() * (PLAY_W - 60);
                p.size = 8 + Math.random() * 18;
                p.alpha = 0.04 + Math.random() * 0.08;
                p.speed = 15 + Math.random() * 30;
                p.dx = (Math.random() - 0.5) * 12;
            }
        }
    },

    draw(ctx) {
        // The GPU shader backdrop (backdrops.js) replaces this painted background
        if (Renderer.backdropActive && Renderer.usePixi) return;
        const t = this._theme();
        this._drawSky(ctx, t);
        this._drawStars(ctx, t);
        this._drawNebulae(ctx, t);
        this._drawHorizonFeature(ctx, t);
        this._drawMidLayer(ctx, t);
        this._drawDistantBuildings(ctx, t);
        this._drawBuildings(ctx, t);
        this._drawGrid(ctx, t);
        this._drawForeground(ctx, t);
        this._drawOverlay(ctx, t);
    },

    _theme() {
        const T = {
            synthwave: {
                sky: ['#04011a', '#0e0438', '#1c0650', '#3a0d70', '#6a12a0'],
                nebC1: '#cc00ff', nebC2: '#6600cc',
                grid: 'rgba(255,0,220,0.28)', vgrid: 'rgba(0,255,220,0.20)',
                sil: '#080220', silFar: '#0f0430',
                accent: '#ff00ff', accent2: '#00ffee',
                winA: 'rgba(255,210,70,', winB: 'rgba(0,255,240,',
                streak: '#ffffff',
            },
            industrial: {
                sky: ['#060404', '#150808', '#271008', '#451808', '#782000'],
                nebC1: '#ff2200', nebC2: '#992200',
                grid: 'rgba(255,90,0,0.22)', vgrid: 'rgba(255,150,0,0.14)',
                sil: '#0c0404', silFar: '#180808',
                accent: '#ff4400', accent2: '#ff9900',
                winA: 'rgba(255,110,10,', winB: 'rgba(255,50,0,',
                streak: '#ff6600',
            },
            space: {
                sky: ['#010108', '#020318', '#050838', '#060a48', '#040630'],
                nebC1: '#2233bb', nebC2: '#551199',
                grid: 'rgba(70,70,255,0.18)', vgrid: 'rgba(90,90,255,0.12)',
                sil: '#030318', silFar: '#050530',
                accent: '#4466cc', accent2: '#88aaff',
                winA: 'rgba(120,170,255,', winB: 'rgba(80,220,200,',
                streak: '#aabbff',
            },
            sky: {
                sky: ['#040c18', '#0a1e38', '#163660', '#2860a0', '#5090c8'],
                nebC1: '#7ab0d8', nebC2: '#3870b0',
                grid: 'rgba(180,210,255,0.10)', vgrid: 'rgba(160,200,255,0.07)',
                sil: '#182840', silFar: '#0e1e30',
                accent: '#60a0c8', accent2: '#c0e0ff',
                winA: 'rgba(255,250,200,', winB: 'rgba(200,240,255,',
                streak: '#c0d4ec',
            },
            digital: {
                sky: ['#030010', '#09001e', '#150038', '#280055', '#550088'],
                nebC1: '#bb00ff', nebC2: '#0077ff',
                grid: 'rgba(255,0,230,0.32)', vgrid: 'rgba(0,255,190,0.26)',
                sil: '#09001a', silFar: '#110022',
                accent: '#cc44ff', accent2: '#00ffcc',
                winA: 'rgba(180,0,255,', winB: 'rgba(0,255,190,',
                streak: '#00ffcc',
            },
            void: {
                sky: ['#000000', '#010002', '#020005', '#010002', '#000000'],
                nebC1: '#3a0018', nebC2: '#1a0028',
                grid: 'rgba(220,0,50,0.11)', vgrid: 'rgba(180,0,40,0.07)',
                sil: '#040104', silFar: '#020102',
                accent: '#770022', accent2: '#330011',
                winA: 'rgba(240,0,55,', winB: 'rgba(160,0,36,',
                streak: '#550018',
            },
        };
        return T[this.bgType] || T.synthwave;
    },

    _drawSky(ctx, t) {
        if (this._cachedTheme !== this.bgType) {
            this._cachedTheme = this.bgType;
            this._cachedSkyGrad = ctx.createLinearGradient(0, 0, 0, PLAY_H);
            const s = t.sky;
            this._cachedSkyGrad.addColorStop(0,    s[0]);
            this._cachedSkyGrad.addColorStop(0.25, s[1]);
            this._cachedSkyGrad.addColorStop(0.55, s[2]);
            this._cachedSkyGrad.addColorStop(0.82, s[3]);
            this._cachedSkyGrad.addColorStop(1,    s[4]);
        }
        ctx.fillStyle = this._cachedSkyGrad;
        ctx.fillRect(0, 0, PLAY_W, PLAY_H);

        // Synthwave aurora bands
        if (this.bgType === 'synthwave') {
            for (let b = 0; b < 3; b++) {
                const by = PLAY_H * (0.12 + b * 0.14) + Math.sin(this.time * 0.18 + b * 1.4) * 15;
                const bAlpha = 0.025 + b * 0.01;
                const bGrad = ctx.createLinearGradient(0, by - 30, 0, by + 30);
                bGrad.addColorStop(0,   'rgba(0,0,0,0)');
                bGrad.addColorStop(0.4, b % 2 === 0 ? `rgba(200,0,255,${bAlpha})` : `rgba(0,220,255,${bAlpha})`);
                bGrad.addColorStop(1,   'rgba(0,0,0,0)');
                ctx.fillStyle = bGrad;
                ctx.fillRect(0, by - 30, PLAY_W, 60);
            }
        }
    },

    _drawStars(ctx, t) {
        const starColors = ['255,255,255', '160,200,255', '255,220,160'];
        for (const s of this.farStars) {
            const twinkle = 0.5 + 0.5 * Math.sin(s.phase);
            const alpha = s.brightness * (0.25 + twinkle * 0.75);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = `rgba(${starColors[s.hue]},1)`;
            ctx.fillRect(s.x, s.y, s.size, s.size);
        }
        ctx.globalAlpha = 1;
    },

    _drawNebulae(ctx, t) {
        for (const n of this.nebulae) {
            ctx.globalAlpha = n.alpha;
            ctx.fillStyle = t.nebC1;
            ctx.beginPath();
            ctx.ellipse(n.x, n.y, n.rx, n.ry, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = n.alpha * 0.55;
            ctx.fillStyle = t.nebC2;
            ctx.beginPath();
            ctx.ellipse(n.x + n.rx * 0.35, n.y + n.ry * 0.25, n.rx * 0.55, n.ry * 0.5, 0.5, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    },

    _drawHorizonFeature(ctx, t) {
        const horizY = PLAY_H * 0.80;

        switch (this.bgType) {

            case 'synthwave': {
                // Classic retrowave striped sun
                const cx = PLAY_W * 0.5;
                const sunR = 68;
                const sunY = horizY - 10;

                // Outer halo
                const halo = ctx.createRadialGradient(cx, sunY, sunR * 0.4, cx, sunY, sunR * 3.2);
                halo.addColorStop(0, 'rgba(255,60,180,0.22)');
                halo.addColorStop(0.4, 'rgba(160,0,220,0.10)');
                halo.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = halo;
                ctx.fillRect(cx - sunR * 3.5, sunY - sunR * 3.5, sunR * 7, sunR * 7);

                ctx.save();
                ctx.beginPath();
                ctx.arc(cx, sunY, sunR, 0, Math.PI * 2);
                ctx.clip();

                // Sun gradient
                const sg = ctx.createLinearGradient(cx, sunY - sunR, cx, sunY + sunR);
                sg.addColorStop(0, '#ff9900');
                sg.addColorStop(0.38, '#ff2288');
                sg.addColorStop(0.7, '#cc00ff');
                sg.addColorStop(1, '#6600cc');
                ctx.fillStyle = sg;
                ctx.fillRect(cx - sunR, sunY - sunR, sunR * 2, sunR * 2);

                // Horizontal stripes (classic look) — drawn only on lower half
                let sy = sunY + sunR * 0.05;
                let stripeH = 2;
                const skyCol = t.sky[0];
                while (sy < sunY + sunR + 1) {
                    ctx.fillStyle = skyCol;
                    ctx.fillRect(cx - sunR, sy, sunR * 2, stripeH);
                    sy += stripeH + stripeH * 0.6;
                    stripeH = Math.min(stripeH + 1.2, 14);
                }
                ctx.restore();

                // Thin horizon line below sun
                ctx.strokeStyle = 'rgba(255,0,200,0.35)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(0, horizY);
                ctx.lineTo(PLAY_W, horizY);
                ctx.stroke();
                break;
            }

            case 'industrial': {
                // Molten horizon — layered glow
                for (let layer = 0; layer < 3; layer++) {
                    const alpha = 0.12 - layer * 0.03;
                    const spread = 80 + layer * 60;
                    const g = ctx.createLinearGradient(0, horizY - spread, 0, horizY + 40);
                    g.addColorStop(0, 'rgba(0,0,0,0)');
                    g.addColorStop(0.6, `rgba(255,${60 + layer * 20},0,${alpha})`);
                    g.addColorStop(1, `rgba(255,${80 + layer * 30},0,${alpha * 0.6})`);
                    ctx.fillStyle = g;
                    ctx.fillRect(0, horizY - spread, PLAY_W, spread + 40);
                }
                // Smog band
                const smog = ctx.createLinearGradient(0, horizY - 120, 0, horizY - 30);
                smog.addColorStop(0, 'rgba(0,0,0,0)');
                smog.addColorStop(1, 'rgba(30,10,4,0.55)');
                ctx.fillStyle = smog;
                ctx.fillRect(0, horizY - 120, PLAY_W, 90);
                break;
            }

            case 'space': {
                // Large planet — partial disc at horizon
                const px = PLAY_W * 0.72;
                const pr = 140;
                const pCy = horizY + pr * 0.55; // mostly below horizon

                ctx.save();
                // Clip to above-horizon only
                ctx.beginPath();
                ctx.rect(0, 0, PLAY_W, horizY);
                ctx.clip();

                // Planet glow
                const pg = ctx.createRadialGradient(px, pCy, pr * 0.3, px, pCy, pr * 1.6);
                pg.addColorStop(0, 'rgba(60,80,200,0.12)');
                pg.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = pg;
                ctx.fillRect(px - pr * 2, pCy - pr * 2, pr * 4, pr * 4);

                // Planet body
                const pb = ctx.createRadialGradient(px - pr * 0.3, pCy - pr * 0.3, pr * 0.1, px, pCy, pr);
                pb.addColorStop(0, '#3050b8');
                pb.addColorStop(0.5, '#1a2880');
                pb.addColorStop(0.85, '#0a1040');
                pb.addColorStop(1, '#050820');
                ctx.fillStyle = pb;
                ctx.beginPath();
                ctx.arc(px, pCy, pr, 0, Math.PI * 2);
                ctx.fill();

                // Atmosphere rim
                ctx.strokeStyle = 'rgba(80,120,255,0.4)';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(px, pCy, pr, 0, Math.PI * 2);
                ctx.stroke();

                ctx.restore();

                // Horizon haze
                const haze = ctx.createLinearGradient(0, horizY - 60, 0, horizY);
                haze.addColorStop(0, 'rgba(0,0,0,0)');
                haze.addColorStop(1, 'rgba(10,10,50,0.5)');
                ctx.fillStyle = haze;
                ctx.fillRect(0, horizY - 60, PLAY_W, 60);
                break;
            }

            case 'sky': {
                // Sun with halo
                const sx = PLAY_W * 0.38;
                const sy = PLAY_H * 0.28;
                const sR = 42;

                const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sR * 3.5);
                sg.addColorStop(0,    'rgba(255,250,200,0.55)');
                sg.addColorStop(0.18, 'rgba(255,220,100,0.30)');
                sg.addColorStop(0.45, 'rgba(255,190,60,0.12)');
                sg.addColorStop(1,    'rgba(0,0,0,0)');
                ctx.fillStyle = sg;
                ctx.fillRect(sx - sR * 4, sy - sR * 4, sR * 8, sR * 8);

                ctx.globalAlpha = 0.9;
                ctx.fillStyle = '#fff8e0';
                ctx.beginPath();
                ctx.arc(sx, sy, sR, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;

                // Atmospheric haze at horizon
                const atm = ctx.createLinearGradient(0, horizY - 80, 0, horizY);
                atm.addColorStop(0, 'rgba(0,0,0,0)');
                atm.addColorStop(1, 'rgba(80,130,200,0.35)');
                ctx.fillStyle = atm;
                ctx.fillRect(0, horizY - 80, PLAY_W, 80);
                break;
            }

            case 'digital': {
                // Pulsing energy portal
                const pcx = PLAY_W * 0.5;
                const pcy = horizY - 5;
                const pulse = 0.85 + 0.15 * Math.sin(this.time * 2.2);
                const pr2 = 55 * pulse;

                const pg2 = ctx.createRadialGradient(pcx, pcy, 0, pcx, pcy, pr2 * 3);
                pg2.addColorStop(0,   'rgba(200,0,255,0.35)');
                pg2.addColorStop(0.3, 'rgba(120,0,200,0.18)');
                pg2.addColorStop(0.7, 'rgba(50,0,100,0.06)');
                pg2.addColorStop(1,   'rgba(0,0,0,0)');
                ctx.fillStyle = pg2;
                ctx.fillRect(pcx - pr2 * 3.5, pcy - pr2 * 3.5, pr2 * 7, pr2 * 7);

                ctx.strokeStyle = `rgba(220,0,255,${0.5 + 0.3 * Math.sin(this.time * 3)})`;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(pcx, pcy, pr2, 0, Math.PI * 2);
                ctx.stroke();

                ctx.strokeStyle = `rgba(0,255,200,${0.3 + 0.2 * Math.sin(this.time * 2.8 + 1)})`;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(pcx, pcy, pr2 * 1.35, 0, Math.PI * 2);
                ctx.stroke();
                break;
            }

            case 'void': {
                // Dark singularity — deep black disc with event-horizon glow
                const vcx = PLAY_W * 0.5;
                const vcy = horizY + 20;
                const vr = 45;

                const vg = ctx.createRadialGradient(vcx, vcy, 0, vcx, vcy, vr * 3.5);
                vg.addColorStop(0,    'rgba(0,0,0,1)');
                vg.addColorStop(0.28, 'rgba(60,0,10,0.8)');
                vg.addColorStop(0.55, 'rgba(120,0,30,0.2)');
                vg.addColorStop(1,    'rgba(0,0,0,0)');
                ctx.fillStyle = vg;
                ctx.fillRect(vcx - vr * 4, vcy - vr * 4, vr * 8, vr * 8);

                ctx.save();
                ctx.beginPath();
                ctx.rect(0, 0, PLAY_W, horizY);
                ctx.clip();
                const rim = ctx.createRadialGradient(vcx, vcy, vr * 0.7, vcx, vcy, vr * 1.1);
                rim.addColorStop(0, 'rgba(0,0,0,0)');
                rim.addColorStop(0.7, 'rgba(180,0,40,0.22)');
                rim.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = rim;
                ctx.fillRect(vcx - vr * 1.5, vcy - vr * 1.5, vr * 3, vr * 3);
                ctx.restore();
                break;
            }
        }
    },

    _drawMidLayer(ctx, t) {
        for (const m of this.midLayer) {
            switch (this.bgType) {
                case 'synthwave':
                    ctx.globalAlpha = 0.06;
                    ctx.strokeStyle = t.accent;
                    ctx.lineWidth = 0.5;
                    ctx.beginPath();
                    ctx.arc(m.x, m.y, m.size * 2.5, 0, Math.PI * 2);
                    ctx.stroke();
                    break;
                case 'industrial':
                    // Smoke handled separately in _smokePuffs; mid layer = ember sparks
                    if (m.y < PLAY_H * 0.78) {
                        ctx.globalAlpha = 0.18 + 0.12 * Math.sin(this.time * 3 + m.phase);
                        ctx.fillStyle = m.type < 2 ? '#ff6600' : '#ffaa00';
                        ctx.fillRect(m.x, m.y, m.size * 0.6, m.size * 0.6);
                    }
                    break;
                case 'space':
                    // Slowly blinking satellite lights
                    if (Math.sin(this.time * 0.8 + m.phase) > 0.6) {
                        ctx.globalAlpha = 0.3;
                        ctx.fillStyle = '#88aaff';
                        ctx.fillRect(m.x, m.y, m.size * 0.8, m.size * 0.8);
                    }
                    break;
                case 'sky':
                    // Wispy cirrus streaks
                    ctx.globalAlpha = 0.06 + 0.03 * Math.sin(this.time * 0.3 + m.phase);
                    ctx.strokeStyle = '#c8e0f8';
                    ctx.lineWidth = m.size * 0.4;
                    ctx.beginPath();
                    ctx.moveTo(m.x - m.size * 5, m.y);
                    ctx.lineTo(m.x + m.size * 5, m.y + m.size * 0.5);
                    ctx.stroke();
                    break;
                case 'digital':
                    // Floating hex digits
                    ctx.globalAlpha = 0.15 + 0.1 * Math.sin(this.time * 1.5 + m.phase);
                    ctx.fillStyle = m.type % 2 === 0 ? t.accent : t.accent2;
                    ctx.font = `${7 + m.size}px monospace`;
                    ctx.fillText(m.type === 0 ? '0' : m.type === 1 ? '1' : m.type === 2 ? 'F' : 'A', m.x, m.y);
                    break;
                case 'void':
                    if (Math.sin(this.time * 2 + m.phase) > 0.5) {
                        ctx.globalAlpha = 0.12;
                        ctx.fillStyle = '#ff0033';
                        ctx.fillRect(m.x, m.y, m.size * 0.5, m.size * 0.5);
                    }
                    break;
            }
        }
        ctx.globalAlpha = 1;
    },

    _drawDistantBuildings(ctx, t) {
        if (this.distantBuildings.length === 0) return;
        const baseY = PLAY_H * 0.78;
        ctx.fillStyle = t.silFar;
        ctx.globalAlpha = 0.65;
        for (const b of this.distantBuildings) {
            ctx.fillRect(b.x, baseY - b.h, b.w, b.h + 120);
        }
        ctx.globalAlpha = 1;
    },

    _drawBuildings(ctx, t) {
        const baseY = PLAY_H * 0.78;

        // Gradient fade at the top of the silhouette region
        const fade = ctx.createLinearGradient(0, baseY - 160, 0, baseY - 80);
        fade.addColorStop(0, 'rgba(0,0,0,0)');
        fade.addColorStop(1, t.sil);
        ctx.fillStyle = fade;
        ctx.fillRect(0, baseY - 160, PLAY_W, 80);

        switch (this.bgType) {

            case 'synthwave':
            case 'industrial': {
                for (const b of this.buildings) {
                    const bx = b.x, bw = b.w, bh = b.h;

                    // Main body
                    ctx.fillStyle = t.sil;
                    ctx.fillRect(bx, baseY - bh, bw, bh + 120);

                    // Roof accent line
                    ctx.strokeStyle = t.accent;
                    ctx.globalAlpha = 0.30;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(bx, baseY - bh);
                    ctx.lineTo(bx + bw, baseY - bh);
                    ctx.stroke();
                    ctx.globalAlpha = 1;

                    // Antenna
                    const antBlink = Math.sin(this.time * 1.8 + b.antennaPhase) > 0.6;
                    ctx.fillStyle = t.sil;
                    ctx.fillRect(bx + bw / 2 - 1, baseY - bh - 10, 2, 10);
                    if (antBlink) {
                        ctx.fillStyle = '#ff4444';
                        ctx.globalAlpha = 0.8;
                        ctx.fillRect(bx + bw / 2 - 2, baseY - bh - 12, 4, 4);
                        ctx.globalAlpha = 1;
                    }

                    // Windows — time-based phases, no per-frame randomness
                    for (const w of b.windows) {
                        const lit = Math.sin(this.time * w.speed + w.phase) > (w.lit ? -0.1 : 0.7);
                        if (!lit) continue;
                        const alpha = 0.12 + 0.18 * Math.abs(Math.sin(this.time * w.speed + w.phase));
                        const col = w.phase % 1 < 0.25 ? t.winB : t.winA;
                        ctx.fillStyle = col + alpha + ')';
                        ctx.fillRect(bx + w.relX, baseY - bh + w.relY, 3, 3);
                    }
                }

                // Smoke for industrial
                for (const p of this._smokePuffs) {
                    ctx.globalAlpha = p.alpha;
                    ctx.fillStyle = '#221006';
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.globalAlpha = 1;
                break;
            }

            case 'digital': {
                for (const b of this.buildings) {
                    ctx.fillStyle = t.sil;
                    ctx.fillRect(b.x, baseY - b.h, b.w, b.h + 120);

                    // Scan lines on tower face
                    const scanY = ((this.time * 60 + b.phase * 40) % b.h);
                    ctx.strokeStyle = t.accent2;
                    ctx.globalAlpha = 0.35;
                    ctx.lineWidth = 1;
                    for (let dy = 0; dy < b.h; dy += 12) {
                        const lineAlpha = 0.15 + 0.25 * Math.abs(Math.sin((dy - scanY) * 0.15));
                        ctx.globalAlpha = lineAlpha;
                        ctx.beginPath();
                        ctx.moveTo(b.x, baseY - b.h + dy);
                        ctx.lineTo(b.x + b.w, baseY - b.h + dy);
                        ctx.stroke();
                    }
                    // Tip glow
                    ctx.globalAlpha = 0.4 + 0.3 * Math.sin(this.time * 2 + b.phase);
                    ctx.fillStyle = t.accent;
                    ctx.fillRect(b.x + b.w / 2 - 1, baseY - b.h - 5, 2, 6);
                    ctx.globalAlpha = 1;
                }
                break;
            }

            case 'space': {
                for (const b of this.buildings) {
                    ctx.fillStyle = t.sil;
                    switch (b.type) {
                        case 'antenna':
                            ctx.fillRect(b.x + b.w / 2 - 2, baseY - b.h, 4, b.h + 120);
                            ctx.fillRect(b.x, baseY - b.h * 0.55, b.w, 3);
                            if (Math.sin(this.time * 1.5 + b.phase) > 0.4) {
                                ctx.fillStyle = '#ff4444';
                                ctx.globalAlpha = 0.75;
                                ctx.fillRect(b.x + b.w / 2 - 2, baseY - b.h - 3, 4, 4);
                                ctx.globalAlpha = 1;
                            }
                            break;
                        case 'dish':
                            ctx.fillRect(b.x + b.w / 2 - 3, baseY - b.h * 0.5, 6, b.h * 0.5 + 120);
                            ctx.beginPath();
                            ctx.arc(b.x + b.w / 2, baseY - b.h * 0.5, b.w / 2, Math.PI, 0);
                            ctx.fill();
                            break;
                        case 'relay':
                            ctx.fillRect(b.x + b.w / 2 - 2, baseY - b.h, 4, b.h + 120);
                            ctx.fillRect(b.x + b.w * 0.1, baseY - b.h * 0.7, b.w * 0.8, 3);
                            ctx.fillRect(b.x + b.w * 0.1, baseY - b.h * 0.4, b.w * 0.8, 3);
                            break;
                    }
                }
                break;
            }

            case 'sky': {
                // Layered clouds — each cloud has its own baseY and scroll speed
                for (const b of this.buildings) {
                    const alpha = [0.35, 0.45, 0.55][b.layer];
                    const drift = Math.sin(this.time * 0.08 * b.scrollSpeed + b.phase) * 6;
                    ctx.globalAlpha = alpha;
                    ctx.fillStyle = t.sil;
                    ctx.beginPath();
                    ctx.ellipse(b.x + b.w / 2 + drift, b.baseY, b.w / 2, b.h / 2, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.ellipse(b.x + b.w * 0.28 + drift, b.baseY - b.h * 0.25, b.w * 0.32, b.h * 0.42, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.ellipse(b.x + b.w * 0.75 + drift, b.baseY - b.h * 0.15, b.w * 0.28, b.h * 0.36, 0, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.globalAlpha = 1;
                break;
            }

            case 'void': {
                for (const b of this.buildings) {
                    ctx.fillStyle = t.sil;
                    ctx.beginPath();
                    ctx.moveTo(b.x, baseY + 120);
                    ctx.lineTo(b.x, baseY - b.h * 0.35);
                    ctx.lineTo(b.x + b.w * 0.22, baseY - b.h);
                    ctx.lineTo(b.x + b.w * 0.5,  baseY - b.h * 0.55);
                    ctx.lineTo(b.x + b.w * 0.72, baseY - b.h * 0.88);
                    ctx.lineTo(b.x + b.w,         baseY - b.h * 0.28);
                    ctx.lineTo(b.x + b.w,         baseY + 120);
                    ctx.closePath();
                    ctx.fill();

                    // Random glitch seam
                    if (Math.sin(this.time * 3.5 + b.phase) > 0.85) {
                        ctx.strokeStyle = 'rgba(255,0,50,0.28)';
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(b.x, baseY - b.h * Math.abs(Math.sin(this.time + b.phase)));
                        ctx.lineTo(b.x + b.w, baseY - b.h * Math.abs(Math.cos(this.time + b.phase)));
                        ctx.stroke();
                    }
                }
                break;
            }
        }
    },

    _drawGrid(ctx, t) {
        const horizon = PLAY_H * 0.80;
        const gridH = PLAY_H - horizon;

        ctx.save();
        ctx.strokeStyle = t.grid;
        ctx.lineWidth = 1;

        // Horizontal lines — perspective spacing
        for (let i = 0; i < 16; i++) {
            const tt = (i * 60 + this.gridOffset) / (16 * 60);
            const y = horizon + tt * tt * gridH;
            if (y > PLAY_H) continue;
            ctx.globalAlpha = Math.min(1, tt * 3) * 0.32;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(PLAY_W, y);
            ctx.stroke();
        }

        // Vertical lines — converge at vanishing point
        ctx.globalAlpha = 0.22;
        ctx.strokeStyle = t.vgrid;
        const vx = PLAY_W / 2;
        for (let i = -10; i <= 10; i++) {
            ctx.beginPath();
            ctx.moveTo(vx + i * 3, horizon);
            ctx.lineTo(vx + i * 58, PLAY_H);
            ctx.stroke();
        }
        ctx.restore();
    },

    _drawForeground(ctx, t) {
        ctx.save();
        for (const f of this.foreground) {
            ctx.globalAlpha = f.alpha;
            ctx.fillStyle = t.streak;
            ctx.fillRect(f.x, f.y, f.size * 0.4, f.length);
        }
        ctx.restore();
    },

    _drawOverlay(ctx, t) {
        switch (this.bgType) {

            case 'digital': {
                // Falling data-stream columns
                ctx.save();
                ctx.font = '9px monospace';
                for (const ds of this._dataStreams) {
                    const colH = ds.chars.length * 11;
                    const baseY = (ds.yOffset + this.time * ds.speed) % (PLAY_H + colH) - colH;
                    for (let i = 0; i < ds.chars.length; i++) {
                        const fade = i / (ds.chars.length - 1);
                        ctx.globalAlpha = ds.alpha * fade;
                        ctx.fillStyle = i === ds.chars.length - 1 ? '#ffffff' : t.accent2;
                        ctx.fillText(ds.chars[i], ds.x, baseY + i * 11);
                    }
                }
                ctx.restore();
                break;
            }

            case 'void': {
                // Reality cracks — jagged glowing lines
                ctx.save();
                const crackCount = 5;
                for (let c = 0; c < crackCount; c++) {
                    const phase = c * 1.3 + this.time * 0.12;
                    if (Math.sin(phase) < -0.3) continue; // cracks appear/disappear
                    const x0 = PLAY_W * (c / crackCount) + Math.sin(phase) * 80;
                    const y0 = PLAY_H * (0.1 + Math.abs(Math.sin(phase * 0.7)) * 0.55);
                    ctx.strokeStyle = `rgba(255,0,60,${0.15 + 0.12 * Math.sin(phase * 2)})`;
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.moveTo(x0, y0);
                    let cx2 = x0, cy2 = y0;
                    for (let seg = 0; seg < 6; seg++) {
                        cx2 += (Math.random() - 0.5) * 35;
                        cy2 += 18 + Math.random() * 20;
                        ctx.lineTo(cx2, cy2);
                    }
                    ctx.stroke();
                    // Inner bright core
                    ctx.strokeStyle = `rgba(255,80,120,${0.08 + 0.06 * Math.sin(phase * 2)})`;
                    ctx.lineWidth = 3;
                    ctx.stroke();
                }

                // Scanline static
                for (let i = 0; i < 4; i++) {
                    const sy = (Math.sin(this.time * 2.8 + i * 43) * 0.5 + 0.5) * PLAY_H;
                    ctx.fillStyle = `rgba(255,0,40,${0.025 + Math.random() * 0.03})`;
                    ctx.fillRect(Math.random() * PLAY_W * 0.5, sy, 60 + Math.random() * 180, 1 + Math.random() * 2);
                }
                ctx.restore();
                break;
            }

            case 'industrial': {
                // Ember particles (mid-layer already handles sparks; add heat shimmer lines)
                ctx.save();
                ctx.strokeStyle = 'rgba(255,100,0,0.04)';
                ctx.lineWidth = 1;
                for (let i = 0; i < 3; i++) {
                    const lx = 60 + i * 220 + Math.sin(this.time * 0.7 + i) * 30;
                    ctx.beginPath();
                    ctx.moveTo(lx, PLAY_H * 0.5);
                    ctx.lineTo(lx + Math.sin(this.time + i * 2) * 15, PLAY_H * 0.78);
                    ctx.stroke();
                }
                ctx.restore();
                break;
            }
        }
    },
};


// === hud.js ===
// ============================================================
//  HUD RENDERER
//  Two side panels either side of the play area, built from UI kit cards:
//    left:  pilot (lives, bombs, shield), armament (weapon, drones), Surge, dash
//    right: score, chain, run stats, mission (level, time, escort), controls
// ============================================================
const HUD = {
    _bgCache: null,

    // Static panel backgrounds (gradient, faint scanlines, edge glow), baked once
    _bakeBackground() {
        const k = Renderer.uiScale || 1;
        const c = document.createElement('canvas');
        c.width = Math.round(SCREEN_W * k); c.height = Math.round(SCREEN_H * k);
        c._scale = k;
        const g = c.getContext('2d');
        g.scale(k, k);
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
        return c;
    },

    draw(ctx) {
        if (!this._bgCache || this._bgCache._scale !== Renderer.uiScale) this._bgCache = this._bakeBackground();
        // Only the side panels: the middle of the overlay stays clear for the play area
        const k = this._bgCache._scale;
        ctx.drawImage(this._bgCache, 0, 0, (HUD_LEFT_W + 2) * k, SCREEN_H * k, 0, 0, HUD_LEFT_W + 2, SCREEN_H);
        ctx.drawImage(this._bgCache, (HUD_RIGHT_X - 2) * k, 0, (HUD_RIGHT_W + 2) * k, SCREEN_H * k, HUD_RIGHT_X - 2, 0, HUD_RIGHT_W + 2, SCREEN_H);
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
        const board = HighScores.boards && HighScores.boards[Game.currentLevelIndex === -1 ? 'endless' : GameConfig.difficulty];
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
        UI.panel(ctx, x, y, w, escort ? 170 : 124, UI.CYAN, { title: isEndless ? 'ENDLESS' : 'MISSION' });
        Neon.text(ctx, isEndless ? 'WAVE ' + EndlessMode.wave : (Game.currentLevelIndex + 1) + '  ' + (lvlData ? lvlData.name : '').toUpperCase(),
            x + 24, y + 62, isEndless ? '#ffaa00' : '#ffffff', 22, { align: 'left', halo: 0.2 });
        const mins = Math.floor(WaveSystem.levelTimer / 60);
        const secs = Math.floor(WaveSystem.levelTimer % 60);
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


// === menus.js ===
// ============================================================
//  MENU SYSTEM
//  Screens are drawn with the UI kit (ui-kit.js). `items` is set while
//  drawing and read by Game.update() for navigation, so keep the lists
//  and their order in step with the handlers there.
// ============================================================
const Menu = {
    selectedIndex: 0,
    items: [],

    drawTitle(ctx) {
        UI.background(ctx);
        const t = UI.time();

        // Logo
        const cx = SCREEN_W / 2;
        const bob = Renderer.calm() ? 0 : Math.sin(t * 1.3) * 4;
        Neon.text(ctx, 'NEON STORM', cx - 26, 200 + bob, UI.CYAN, 110, { core: 0.5, halo: 0.55 });
        Neon.text(ctx, 'γ', cx + 350, 150 + bob, UI.MAGENTA, 56, { core: 0.4 });
        Neon.text(ctx, 'BULLET HELL SHOOTER', cx, 250, UI.MAGENTA, 20, { weight: '', halo: 0.3, core: 0 });

        // The player's ship hovering over the grid, engines lit
        const sy = 870 + (Renderer.calm() ? 0 : Math.sin(t * 2) * 6);
        const f = Math.sin(t * 30) * 3;
        Neon.flame(ctx, cx - 20, sy + 30, 9, 26 + f, Hangar.trailColor, 0.9);
        Neon.flame(ctx, cx + 20, sy + 30, 9, 26 - f, Hangar.trailColor, 0.9);
        UI.ship(ctx, cx, sy, 44);

        // Menu
        this.items = ['NEW GAME', 'ENDLESS MODE', 'HANGAR', 'HIGH SCORES', 'ACHIEVEMENTS', 'SETTINGS', 'HOW TO PLAY'];
        UI.panel(ctx, cx - 250, 300, 500, 415, UI.CYAN, { fill: 'rgba(6, 2, 20, 0.6)' });
        for (let i = 0; i < this.items.length; i++) {
            UI.item(ctx, this.items[i], cx, 358 + i * 54, i === this.selectedIndex, { w: 440 });
        }

        UI.hint(ctx, 'ARROW KEYS / D-PAD TO SELECT  •  ENTER TO CONFIRM', SCREEN_H - 48);
        UI.label(ctx, 'GAMMA BUILD — WORK IN PROGRESS', SCREEN_W / 2, SCREEN_H - 22, UI.MAGENTA, 13);
    },

    drawDifficultySelect(ctx) {
        UI.background(ctx, { dim: 0.45 });
        UI.title(ctx, 'SELECT DIFFICULTY', 130);

        this.items = ['CASUAL', 'NORMAL', 'HARDCORE', 'CUSTOM', 'BACK'];
        const descs = [
            '0.5x SCORE  •  5 LIVES  •  ALL ASSISTS ON',
            '1.0x SCORE  •  3 LIVES  •  STANDARD EXPERIENCE',
            '2.0x SCORE  •  1 LIFE  •  NO BOMBS OR FOCUS',
            'MIX AND MATCH  •  NO LEADERBOARD',
            '',
        ];
        const colors = ['#00ff88', '#ffee33', '#ff3355', '#cc44ff', UI.DIM];
        const cx = SCREEN_W / 2;
        for (let i = 0; i < this.items.length; i++) {
            const y = 270 + i * 120;
            const selected = i === this.selectedIndex;
            if (i < 4) UI.panel(ctx, cx - 330, y - 52, 660, 98, colors[i], { fill: selected ? 'rgba(10, 4, 30, 0.85)' : 'rgba(6, 2, 18, 0.55)' });
            UI.item(ctx, this.items[i], cx, y, selected, { w: 600, color: colors[i], desc: descs[i], size: 28 });
        }
        UI.hint(ctx, 'ESC TO GO BACK');
    },

    // Results panel shared by game over and mission complete. Returns the y after the totals.
    _results(ctx, top, heading, headingColor, scoreColor, footerH) {
        const cx = SCREEN_W / 2;
        const nB = EndRunBonus.bonuses.length;
        const subH = this._resultsSub ? this._resultsSub.length * 26 : 0;
        const h = 110 + subH + 104 + nB * 28 + (nB ? 22 : 0) + 84 + footerH;
        UI.panel(ctx, cx - 360, top, 720, h, headingColor);
        Neon.text(ctx, heading, cx, top + 72, headingColor, 58, { core: 0.45, halo: 0.55 });
        let y = top + 110;
        if (this._resultsSub) {
            for (const line of this._resultsSub) {
                UI.label(ctx, line[0], cx, y, line[1] || UI.TEXT, line[2] || 17);
                y += 26;
            }
        }
        UI.label(ctx, 'SCORE', cx, y + 24, UI.DIM, 15);
        Neon.text(ctx, Scoring.score.toLocaleString(), cx, y + 66, scoreColor, 42, { core: 0.4 });
        const bonusEndY = EndRunBonus.draw(ctx, cx, y + 104);
        const totalScore = Scoring.score + EndRunBonus.totalBonus;
        Neon.text(ctx, 'TOTAL  ' + totalScore.toLocaleString(), cx, bonusEndY + 22, '#ffee33', 28, { core: 0.35 });
        const ncEarned = Math.floor(totalScore / 3000 * GameConfig.scoreMultiplier);
        UI.label(ctx, '+ ' + ncEarned + ' NEON CREDITS', cx, bonusEndY + 54, '#ffaa00', 17);
        return bonusEndY + 70;
    },

    drawGameOver(ctx) {
        UI.dim(ctx, 0.82);
        const isEndless = Game.currentLevelIndex === -1;
        this._resultsSub = null;
        if (isEndless) {
            const mins = Math.floor(WaveSystem.levelTimer / 60);
            const secs = Math.floor(WaveSystem.levelTimer % 60);
            this._resultsSub = [
                ['ENDLESS MODE — WAVE ' + EndlessMode.wave, '#ffaa00', 20],
                ['SURVIVED ' + mins + ':' + secs.toString().padStart(2, '0'), UI.TEXT, 16],
            ];
        }
        const endY = this._results(ctx, 120, 'GAME OVER', '#ff2255', UI.CYAN, HighScores.enteringInitials ? 190 : 130);

        if (HighScores.enteringInitials) {
            HighScores.drawInitialEntry(ctx, SCREEN_W / 2, endY + 20);
        } else {
            this.items = ['RETRY', 'MAIN MENU'];
            for (let i = 0; i < this.items.length; i++) {
                UI.item(ctx, this.items[i], SCREEN_W / 2, endY + 40 + i * 50, i === this.selectedIndex, { w: 380, size: 22 });
            }
        }
    },

    drawVictory(ctx) {
        UI.dim(ctx, 0.78);
        const lvl = ALL_LEVELS[Game.currentLevelIndex];
        this._resultsSub = [['LEVEL ' + (Game.currentLevelIndex + 1) + ' — ' + (lvl ? lvl.name.toUpperCase() : ''), UI.TEXT, 17]];
        const endY = this._results(ctx, 120, 'MISSION COMPLETE', UI.CYAN, '#ffee33', HighScores.enteringInitials ? 190 : 170);

        if (HighScores.enteringInitials) {
            HighScores.drawInitialEntry(ctx, SCREEN_W / 2, endY + 20);
        } else {
            const hasNextLevel = Game.currentLevelIndex < Campaign.getLevelCount() - 1 &&
                Campaign.isLevelAvailable(Game.currentLevelIndex + 1, GameConfig.difficulty === 'custom');
            this.items = hasNextLevel ? ['NEXT LEVEL', 'RETRY', 'MAIN MENU'] :
                (Game.currentLevelIndex >= 4 ? ['CONTINUE...', 'MAIN MENU'] : ['RETRY', 'MAIN MENU']);
            for (let i = 0; i < this.items.length; i++) {
                UI.item(ctx, this.items[i], SCREEN_W / 2, endY + 40 + i * 48, i === this.selectedIndex, {
                    w: 380, size: 22, color: this.items[i] === 'NEXT LEVEL' ? '#00ff88' : UI.CYAN,
                });
            }
        }
    },

    // --- Mission briefing: the level's live backdrop fills the play area ---
    drawBriefing(ctx) {
        const idx = Game.currentLevelIndex;
        const lvl = ALL_LEVELS[idx];
        const t = Game.briefingTimer;
        const inK = Math.min(1, t * 2);
        // Side panels
        const side = ctx.createLinearGradient(0, 0, 0, SCREEN_H);
        side.addColorStop(0, '#06020f'); side.addColorStop(1, '#12052a');
        ctx.fillStyle = side;
        ctx.fillRect(0, 0, PLAY_X, SCREEN_H);
        ctx.fillRect(PLAY_X + PLAY_W, 0, SCREEN_W - PLAY_X - PLAY_W, SCREEN_H);
        // Let the backdrop show through, darkened for the text
        ctx.fillStyle = 'rgba(3, 0, 10, 0.45)';
        ctx.fillRect(PLAY_X, PLAY_Y, PLAY_W, PLAY_H);

        ctx.globalAlpha = inK;
        const cx = SCREEN_W / 2;
        UI.label(ctx, 'LEVEL ' + (idx + 1) + ' / ' + Campaign.getLevelCount(), cx, 250, UI.MAGENTA, 18);
        Neon.text(ctx, lvl.name.toUpperCase(), cx, 312, UI.CYAN, 54, { core: 0.45, halo: 0.55 });
        UI.panel(ctx, cx - 320, 360, 640, 190, UI.CYAN, { title: 'BRIEFING' });
        const lines = (Game.briefingText || '').split('\n');
        // Type the briefing out
        let chars = Renderer.calm() ? 1e9 : Math.floor(t * 70);
        lines.forEach((line, i) => {
            const shown = line.slice(0, Math.max(0, chars));
            chars -= line.length;
            Neon.text(ctx, shown, cx, 425 + i * 34, UI.TEXT, 20, { weight: '', halo: 0 });
        });

        // Campaign progress (left)
        const lx = PLAY_X / 2;
        UI.panel(ctx, lx - 220, 260, 440, 70 + Campaign.getLevelCount() * 56, UI.MAGENTA, { title: 'CAMPAIGN' });
        for (let i = 0; i < Campaign.getLevelCount(); i++) {
            const L = ALL_LEVELS[i];
            const y = 330 + i * 56;
            const cur = i === idx, done = i < idx;
            UI.pip(ctx, lx - 180, y - 6, 7, cur ? UI.CYAN : UI.MAGENTA, cur || done);
            Neon.text(ctx, (i + 1) + '  ' + (L ? L.name.toUpperCase() : ''), lx - 158, y, cur ? '#ffffff' : (done ? UI.TEXT : UI.DIM), cur ? 20 : 17,
                { align: 'left', halo: cur ? 0.35 : 0, weight: cur ? 'bold' : '' });
        }

        // Threat assessment (right): the level's boss in neon
        const rx = PLAY_X + PLAY_W + (SCREEN_W - PLAY_X - PLAY_W) / 2;
        const def = BossTypes[lvl.bossType] || BossTypes.architect;
        UI.panel(ctx, rx - 220, 260, 440, 440, '#ff2255', { title: 'THREAT' });
        const fake = Object.create(Boss);
        fake.moveTimer = t; fake.phase = 1; fake.x = rx; fake.bossType = lvl.bossType;
        ctx.save();
        ctx.translate(rx, 470);
        ctx.scale(1.7, 1.7);
        const draw = Boss._neon[lvl.bossType] || Boss._neon.architect;
        draw.call(fake, ctx, Boss.radius, def.colors[0], false);
        ctx.restore();
        Neon.text(ctx, def.name, rx, 650, '#ff2255', 26, { core: 0.35 });
        UI.label(ctx, def.phases + ' PHASES', rx, 680, UI.DIM, 15);

        // Start prompt with an auto-start countdown
        ctx.globalAlpha = inK * (Renderer.calm() ? 1 : 0.7 + Math.sin(t * 5) * 0.3);
        Neon.text(ctx, 'PRESS ENTER OR FIRE TO LAUNCH', cx, 850, '#ffffff', 22, { halo: 0.3 });
        ctx.globalAlpha = inK;
        Neon.bar(ctx, cx - 180, 880, 360, 4, Math.min(1, t / 8), UI.CYAN, 0);
        ctx.globalAlpha = 1;
    },

    drawLevelSelect(ctx) {
        UI.background(ctx, { dim: 0.55 });
        UI.title(ctx, 'SELECT LEVEL', 110);
        UI.label(ctx, 'DIFFICULTY: ' + GameConfig.difficulty.toUpperCase(), SCREEN_W / 2, 160, UI.TEXT, 17);
        const cx = SCREEN_W / 2;
        const lvlCount = Campaign.getLevelCount();
        UI.panel(ctx, cx - 400, 200, 800, lvlCount * 76 + 40, UI.CYAN);
        for (let i = 0; i <= lvlCount; i++) {
            const y = 250 + i * 76;
            const selected = i === Menu.selectedIndex;
            if (i === lvlCount) {
                UI.item(ctx, 'BACK', cx, y + 20, selected, { w: 400, size: 20 });
                continue;
            }
            const lvl = ALL_LEVELS[i];
            const available = Campaign.isLevelAvailable(i, false);
            const best = Campaign.getLevelBest(i, GameConfig.difficulty);
            if (selected) {
                ctx.fillStyle = available ? UI.CYAN : UI.DIM;
                ctx.globalAlpha = 0.12;
                ctx.fillRect(cx - 380, y - 32, 760, 60);
                ctx.globalAlpha = 1;
                ctx.fillRect(cx - 380, y - 32, 3, 60);
            }
            Neon.text(ctx, (i + 1) + '  ' + (lvl ? lvl.name.toUpperCase() : '') + (available ? '' : '   [LOCKED]'), cx - 350, y + 4,
                !available ? '#3a4458' : selected ? '#ffffff' : UI.TEXT, selected ? 24 : 21, { align: 'left', halo: selected && available ? 0.3 : 0, weight: selected ? 'bold' : '' });
            if (best && available) {
                Neon.text(ctx, best.score.toLocaleString(), cx + 350, y - 2, selected ? '#ffee33' : '#bbaa55', 20, { align: 'right', halo: 0 });
                const extras = [];
                if (best.maxChain > 0) extras.push('CHAIN ' + best.maxChain);
                if (best.perfect) extras.push('★ PERFECT');
                UI.label(ctx, extras.join('   '), cx + 350, y + 20, UI.DIM, 13, 'right');
            } else if (available) {
                UI.label(ctx, 'NO RECORD', cx + 350, y + 4, UI.DIM, 15, 'right');
            }
        }
        UI.hint(ctx, 'ESC BACK');
    },

    drawAchievements(ctx) {
        UI.background(ctx, { dim: 0.6 });
        UI.title(ctx, 'ACHIEVEMENTS', 90, '#ffaa00');
        const prog = Achievements.getProgress();
        UI.label(ctx, prog.unlocked + ' / ' + prog.total + ' UNLOCKED', SCREEN_W / 2, 140, UI.TEXT, 17);
        Neon.bar(ctx, SCREEN_W / 2 - 200, 154, 400, 5, prog.unlocked / Math.max(1, prog.total), '#ffaa00', 0);
        const cols = 2, colW = 560, rowH = 70;
        const startX = SCREEN_W / 2 - colW, startY = 185;
        Achievements.defs.forEach((def, i) => {
            const x = startX + (i % cols) * colW;
            const y = startY + Math.floor(i / cols) * rowH;
            const done = Achievements.isUnlocked(def.id);
            UI.panel(ctx, x + 8, y, colW - 16, rowH - 10, done ? '#ffaa00' : '#3a4458', { fill: done ? 'rgba(40, 20, 0, 0.55)' : 'rgba(6, 2, 18, 0.55)' });
            ctx.font = '24px sans-serif';
            ctx.textAlign = 'center';
            ctx.globalAlpha = done ? 1 : 0.3;
            ctx.fillStyle = '#ffffff';
            ctx.fillText(def.icon, x + 42, y + 40);
            ctx.globalAlpha = 1;
            Neon.text(ctx, def.name, x + 72, y + 27, done ? '#ffaa00' : UI.DIM, 17, { align: 'left', halo: done ? 0.25 : 0 });
            Neon.text(ctx, def.desc, x + 72, y + 48, done ? UI.TEXT : '#4a5468', 14, { align: 'left', halo: 0, weight: '' });
            Neon.text(ctx, (done ? '✓ ' : '') + def.reward + ' NC', x + colW - 26, y + 36, done ? '#00ff88' : '#4a5468', 15, { align: 'right', halo: 0 });
        });
        UI.hint(ctx, 'ESC / ENTER TO RETURN');
    },

    drawCampaignComplete(ctx) {
        UI.background(ctx, { dim: 0.35 });
        const t = Game.briefingTimer;
        const cx = SCREEN_W / 2;
        const isSecret = Game.currentLevelIndex === 5;
        const color = isSecret ? '#ff2bd6' : '#ffee33';
        UI.panel(ctx, cx - 460, 150, 920, 660, color);
        Neon.text(ctx, isSecret ? 'SIGNAL TERMINATED' : 'CAMPAIGN COMPLETE', cx, 250, color, 60, { core: 0.5, halo: 0.6 });
        const sub = isSecret
            ? ['You silenced the relay. The void is quiet...', 'For now.']
            : ['The threat has been neutralized.', 'Outstanding work, pilot.'];
        sub.forEach((line, i) => UI.label(ctx, line, cx, 305 + i * 30, UI.TEXT, 20));
        UI.label(ctx, 'DIFFICULTY: ' + GameConfig.difficulty.toUpperCase(), cx, 400, UI.DIM, 16);
        Neon.text(ctx, 'TOTAL SCORE  ' + Scoring.score.toLocaleString(), cx, 450, UI.CYAN, 32, { core: 0.4 });
        UI.label(ctx, 'NEON CREDITS  ' + NeonCredits.balance, cx, 490, '#ffaa00', 19);
        if (!isSecret && !Campaign.secretUnlocked) {
            UI.label(ctx, 'Something else is out there... beat all levels on Normal to find it.', cx, 545, '#5a6478', 16);
        } else if (!isSecret && Campaign.secretUnlocked) {
            Neon.text(ctx, 'SECRET LEVEL UNLOCKED: SIGNAL LOST', cx, 545, '#ff2bd6', 19, { halo: 0.4 });
        }
        UI.label(ctx, 'Thank you for playing Neon Storm \u03b3 \u2014 more to come!', cx, 600, UI.DIM, 16);
        const items = ['PLAY AGAIN', 'MAIN MENU'];
        items.forEach((label, i) => UI.item(ctx, label, cx, 680 + i * 54, i === Menu.selectedIndex, { w: 420, size: 22 }));
        // Fireworks of shattered neon (small, calm-friendly)
        if (!Renderer.calm()) {
            for (let i = 0; i < 24; i++) {
                const a = i * 2.4 + t * 0.4;
                const r = 520 + Math.sin(t * 0.7 + i) * 40;
                const x = cx + Math.cos(a) * r, y = 480 + Math.sin(a) * r * 0.55;
                ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 2 + i);
                UI.pip(ctx, x, y, 4, i % 2 ? UI.CYAN : UI.MAGENTA, true);
            }
            ctx.globalAlpha = 1;
        }
    },

    highScoreTab: 0,

    drawHighScores(ctx) {
        UI.background(ctx, { dim: 0.55 });
        UI.title(ctx, 'HIGH SCORES', 110);

        const tabs = ['CASUAL', 'NORMAL', 'HARDCORE', 'ENDLESS', 'SESSION'];
        const tabKeys = ['casual', 'normal', 'hardcore', 'endless', 'session'];
        const colors = ['#00ff88', '#ffee33', '#ff3355', '#ff8800', '#cc44ff'];
        UI.tabs(ctx, tabs, this.highScoreTab, SCREEN_W / 2, 200, colors);

        const color = colors[this.highScoreTab];
        const px = SCREEN_W / 2 - 420, pw = 840, top = 240;
        UI.panel(ctx, px, top, pw, 620, color);

        const tabKey = tabKeys[this.highScoreTab];
        const session = tabKey === 'session';
        const rows = session ? HighScores.sessionScores.slice(0, 10) : (HighScores.boards[tabKey] || []);
        if (rows.length === 0) {
            UI.label(ctx, session ? 'NO SCORES THIS SESSION' : 'NO SCORES YET', SCREEN_W / 2, top + 300, UI.DIM, 20);
        } else {
            const isEndless = tabKey === 'endless';
            const cols = session
                ? [['#', 40], ['NAME', 100], ['SCORE', 200], ['INFO', 460], ['MODE', 620]]
                : [['#', 40], ['NAME', 100], ['SCORE', 200], ['CHAIN', 440], [isEndless ? 'WAVE' : 'LEVEL', 560], ['DATE', 680]];
            for (const [h, x] of cols) UI.label(ctx, h, px + x, top + 48, UI.DIM, 14, 'left');
            rows.forEach((entry, i) => {
                const ey = top + 90 + i * 50;
                if (i % 2 === 0) {
                    ctx.fillStyle = 'rgba(255,255,255,0.03)';
                    ctx.fillRect(px + 20, ey - 30, pw - 40, 46);
                }
                const c = i === 0 ? '#ffee33' : i < 3 ? '#ffaa00' : UI.TEXT;
                const big = i < 3 ? 22 : 19;
                const cell = (text, x, col, size) => Neon.text(ctx, text, px + x, ey, col || c, size || big,
                    { align: 'left', halo: i < 3 ? 0.25 : 0, weight: i < 3 ? 'bold' : '' });
                cell((i + 1).toString(), 40);
                cell(entry.initials, 100);
                cell(entry.score.toLocaleString(), 200);
                if (session) {
                    cell(entry.mode === 'endless' ? 'W' + (entry.wave || '?') : 'L' + (entry.levelReached || '?') + (entry.won ? ' ✓' : ''), 460, UI.DIM, 17);
                    cell((entry.difficulty || '').toUpperCase(), 620, UI.DIM, 17);
                } else {
                    cell((entry.maxChain || 0).toString(), 440);
                    cell(isEndless ? 'W' + (entry.wave || '?') : (entry.levelReached || '?') + '/6' + (entry.won ? ' ✓' : ''), 560);
                    cell(entry.date || '', 680, UI.DIM, 16);
                }
            });
        }

        UI.label(ctx, 'NEON CREDITS  ' + NeonCredits.balance, SCREEN_W / 2, SCREEN_H - 110, '#ffaa00', 19);
        UI.hint(ctx, '←→ CHANGE TAB    ESC BACK');
    },

    drawPause(ctx) {
        UI.dim(ctx, 0.62);
        const cx = SCREEN_W / 2;
        UI.panel(ctx, cx - 280, 330, 560, 330, UI.CYAN);
        Neon.text(ctx, 'PAUSED', cx, 405, UI.CYAN, 54, { core: 0.45, halo: 0.55 });

        if (Game.pauseConfirm) {
            const action = Game.pauseConfirm === 'restart' ? 'RESTART LEVEL' : 'QUIT TO MENU';
            Neon.text(ctx, 'ARE YOU SURE?', cx, 480, '#ffaa00', 26);
            UI.label(ctx, action, cx, 520, UI.TEXT, 19);
            UI.label(ctx, 'ENTER = YES    ESC = NO', cx, 600, UI.DIM, 16);
        } else {
            this.items = ['RESUME', 'RESTART', 'MAIN MENU'];
            for (let i = 0; i < this.items.length; i++) {
                UI.item(ctx, this.items[i], cx, 480 + i * 56, i === this.selectedIndex, { w: 460, size: 24 });
            }
        }
    }
};


// === game.js ===
// ============================================================
//  MAIN GAME STATE MACHINE
// ============================================================
const Game = {
    state: 'title',
    lastTime: 0,
    endRunProcessed: false,
    pauseConfirm: null,
    currentLevelIndex: 0,
    briefingText: '',
    briefingTimer: 0,
    _pendingEndless: false,
    _gameOverPending: false,

    async init() {
        Input.init();
        Audio.init();
        Background.init();
        await HighScores.load();
        await Settings.load();
        await NeonCredits.load();
        await Hangar.load();
        await Campaign.load();
        await Input.loadBindings();
        await Achievements.load();
        this.state = 'title';
        Menu.selectedIndex = 0;
    },

    // Level scaling. Genre shooters (Cave, Touhou) mostly escalate density and
    // pattern complexity; bullet speed stays readable, so it is capped.
    applyLevelScaling(scale, baseDensity) {
        const t = Math.max(0, scale - 1);
        GameConfig.bulletDensity = baseDensity * (1 + 0.5 * t);
        GameConfig._levelHpScale = 1 + 0.6 * t;
        GameConfig._levelSpeedScale = Math.min(1.2, 1 + 0.15 * t);   // enemy bullet speed
        GameConfig._levelFireRateScale = 1 + 0.2 * t;                // enemy fire frequency
    },

    // continuing: true only when advancing from a victory screen within one campaign run.
    // Level select, custom start, retry and restart all begin a fresh run.
    startLevel(levelIndex, difficulty, continuing) {
        if (difficulty !== 'custom') {
            GameConfig = JSON.parse(JSON.stringify(DIFFICULTY_PRESETS[difficulty]));
            GameConfig.difficulty = difficulty;
        } else {
            GameConfig = CustomDifficulty.getConfig();
        }
        GameConfig.fireMode = GameConfig.autofire ? 'auto' : Settings.values.fireMode;

        const levelData = ALL_LEVELS[levelIndex];
        this.currentLevelIndex = levelIndex;
        this.applyLevelScaling(levelData.levelScale || 1.0, GameConfig.bulletDensity || 1.0);

        // Carry-over between campaign levels: lives, bombs and weapons persist
        const carry = continuing ? {
            weapon: Player.primaryWeapon, level: Player.primaryLevel, drones: Player.droneLevel,
            lives: Player.lives, bombs: Player.bombs
        } : null;
        Player.init();
        if (carry) {
            Player.primaryWeapon = carry.weapon;
            Player.primaryLevel = carry.level;
            Player.droneLevel = carry.drones;
            Player.lives = carry.lives;
            Player.bombs = GameConfig.bombs.enabled ? Math.max(carry.bombs, GameConfig.bombs.startCount) : 0;
        } else if (this._retryLoadout && this._retryLoadout.levelIndex === levelIndex && levelIndex > 0) {
            // Retrying a later level after game over: minimum loadout (Raiden-style continue)
            Player.primaryWeapon = this._retryLoadout.weapon;
            Player.primaryLevel = this._retryLoadout.weapon === 'none' ? 0 : 2;
            Player.droneLevel = Math.min(1, this._retryLoadout.drones);
        }
        this._retryLoadout = null;

        // Score: keep cumulative score only when continuing a run
        if (continuing) {
            Scoring.softReset();
        } else {
            Scoring.reset();
        }
        Scoring.beginLevel();
        Scheduler.clear();
        Enemies.clear();
        Particles.clear();
        PowerUps.clear();
        Asteroids.clear();
        Escort.init();
        EndlessMode.active = false; // Ensure endless mode is off for campaign
        Boss.active = false;
        Boss.defeated = false;
        WaveSystem.loadLevel(levelData);
        Background.init();
        Background.bgType = levelData.bgType || 'synthwave';
        Background._generateNearLayer(); // Regenerate silhouettes for new theme

        // Bloom intensity per level theme
        const bloomPresets = {
            synthwave:  { bloomScale: 0.9,  threshold: 0.4  },
            industrial: { bloomScale: 1.3,  threshold: 0.28 },
            space:      { bloomScale: 1.0,  threshold: 0.35 },
            sky:        { bloomScale: 0.85, threshold: 0.4  },
            digital:    { bloomScale: 1.1,  threshold: 0.32 },
            void:       { bloomScale: 1.6,  threshold: 0.22 }, // Glitch level — strongest bloom
        };
        const bp = bloomPresets[Background.bgType] || bloomPresets.synthwave;
        Renderer.setBloomIntensity(bp.bloomScale, bp.threshold);

        // Per-level colour grade for distinct mood
        const colorGradePresets = {
            synthwave:  { hue:  0,   saturate:  0.25, contrast: 0.1,  brightness:  0    },
            industrial: { hue:  6,   saturate:  0.3,  contrast: 0.15, brightness:  0.04 },
            space:      { hue:  0,   saturate:  0.15, contrast: 0.12, brightness:  0    },
            sky:        { hue: -6,   saturate:  0.1,  contrast: 0.1,  brightness:  0.03 },
            digital:    { hue:  0,   saturate:  0.25, contrast: 0.12, brightness:  0    },
            void:       { hue:  175, saturate: -0.25, contrast: 0.3,  brightness: -0.08 },
        };
        const cg = colorGradePresets[Background.bgType] || colorGradePresets.synthwave;
        Renderer.setColorGrade(cg);

        // Level 6 glitch atmosphere — persistent chromatic aberration
        Renderer.setPersistentChroma(Background.bgType === 'void' ? 0.003 : 0);

        // Activate level-specific systems
        if (levelData.hasAsteroids) Asteroids.activate();
        if (levelData.hasEscort) Escort.activate();

        this.endRunProcessed = false; this._gameOverPending = false;
        this._lastWaveClearTimer = null;
        this._levelStartWeapon = Player.primaryWeapon;
        this._levelStartDrones = Player.droneLevel;
        this.state = 'playing';
    },

    startGame(difficulty) {
        GameConfig = JSON.parse(JSON.stringify(DIFFICULTY_PRESETS[difficulty]));
        GameConfig.difficulty = difficulty;
        this.showBriefing(0);
    },

    startEndless(difficulty) {
        GameConfig = JSON.parse(JSON.stringify(DIFFICULTY_PRESETS[difficulty]));
        GameConfig.difficulty = difficulty;
        GameConfig.fireMode = GameConfig.autofire ? 'auto' : Settings.values.fireMode;
        GameConfig._baseDensity = GameConfig.bulletDensity;
        this.applyLevelScaling(1, GameConfig._baseDensity);
        this.currentLevelIndex = -1; // Flag for endless mode
        this._retryLoadout = null;
        Player.init();
        Scoring.reset();
        Scoring.beginLevel();
        Scheduler.clear();
        Enemies.clear();
        Particles.clear();
        PowerUps.clear();
        Asteroids.clear();
        Escort.init();
        Boss.active = false;
        Boss.defeated = false;
        WaveSystem.waves = [];
        WaveSystem.currentWaveIndex = 0;
        WaveSystem.levelTimer = 0;
        WaveSystem.waveTime = 0;
        WaveSystem.bossActive = false;
        EndlessMode.init();
        Background.init();
        Background.bgType = 'synthwave';
        Background._generateNearLayer();
        this.endRunProcessed = false; this._gameOverPending = false;
        this._lastWaveClearTimer = null;
        this.state = 'playing';
    },

    showBriefing(levelIndex, continuing = false) {
        this._continuing = continuing;
        const level = ALL_LEVELS[levelIndex];
        this.briefingText = level.briefing || '';
        this.briefingTimer = 0;
        this.currentLevelIndex = levelIndex;
        // Clear the last level's GPU particles/bullets so the briefing backdrop is clean
        Particles.clear();
        Enemies.enemyBullets.clear();
        Player.bullets.clear();
        this.state = 'briefing';
    },

    _processEndRun(won) {
        if (this.endRunProcessed) return;
        this.endRunProcessed = true;

        const isEndless = this.currentLevelIndex === -1;

        // Bonuses count this level only (maxChain/grazeCount are whole-run totals)
        const noDeaths = Scoring.levelDeaths === 0;
        const bonus = EndRunBonus.calculate(
            won, Player.lives, Scoring.levelMaxChain, Scoring.levelGrazes, WaveSystem.levelTimer, noDeaths
        );
        Scoring.score += bonus;

        if (won) {
            Campaign.completeLevel(this.currentLevelIndex, GameConfig.difficulty);
            Achievements.onLevelComplete(this.currentLevelIndex, GameConfig.difficulty,
                noDeaths, Scoring.score, Scoring.maxChain, Scoring.grazeCount);
            if (Campaign.secretUnlocked) Achievements.onSecretUnlocked();

            // Record per-level best score
            if (!isEndless) {
                const isNewRecord = Campaign.recordLevelScore(
                    this.currentLevelIndex, Scoring.levelScore, Scoring.levelMaxChain,
                    Scoring.levelGrazes, Scoring.levelDeaths === 0 && Scoring.levelBombs === 0, GameConfig.difficulty
                );
                if (isNewRecord) {
                    Scoring.spawnPopup('NEW LEVEL RECORD!', '#00ff88', 20);
                }
            }
        }

        // Determine if this is a run-ending event (should record high score)
        const hasNextLevel = won && !isEndless && this.currentLevelIndex < Campaign.getLevelCount() - 1 &&
            Campaign.isLevelAvailable(this.currentLevelIndex + 1, GameConfig.difficulty === 'custom');
        const isRunEnd = !won || !hasNextLevel; // Game over OR final level

        if (isRunEnd) {
            NeonCredits.earn(Scoring.score, GameConfig.difficulty);

            // Record high score with run details
            const scoreEntry = {
                score: Scoring.score,
                maxChain: Scoring.maxChain,
                graze: Scoring.grazeCount,
                mode: isEndless ? 'endless' : 'campaign',
                levelReached: isEndless ? 0 : this.currentLevelIndex + 1,
                wave: isEndless ? EndlessMode.wave : 0,
                won: won
            };

            const board = isEndless ? 'endless' : GameConfig.difficulty;
            if (HighScores.qualifies(Scoring.score, board)) {
                HighScores.startInitialEntry(Scoring.score, board, scoreEntry);
            }
        }
    },

    BOSS_GRACE_SECONDS: 8,
    _lastWaveClearTimer: null,
    _continuing: false,
    _retryLoadout: null,

    // Called on game time (Scheduler), so it only fires while the level is being played
    _endLevel(won) {
        if (this.state !== 'playing') return;
        this._processEndRun(won);
        this.state = won ? 'victory' : 'game_over';
        Menu.selectedIndex = 0;
    },

    update(dt) {
        Input.update();
        Transition.update(dt);

        // Don't process game logic during transition fade
        if (Transition.active && Transition.phase === 'fade_out') return;

        switch (this.state) {
            case 'title':
                this._updateMenu(dt, 7);
                if (Input.isPressed('confirm')) {
                    Audio.playMenuSelect();
                    switch (Menu.selectedIndex) {
                        case 0: // New Game
                            this.state = 'difficulty_select';
                            Menu.selectedIndex = 1;
                            break;
                        case 1: // Endless Mode
                            this.state = 'difficulty_select';
                            this._pendingEndless = true;
                            Menu.selectedIndex = 1;
                            break;
                        case 2: // Hangar
                            this.state = 'hangar';
                            Hangar.categoryIndex = 0;
                            Hangar.mode = 'categories';
                            break;
                        case 3: // High Scores
                            this.state = 'high_scores';
                            Menu.selectedIndex = 0;
                            Menu.highScoreTab = 1;
                            break;
                        case 4: // Achievements
                            this.state = 'achievements';
                            Menu.selectedIndex = 0;
                            break;
                        case 5: // Settings
                            this.state = 'settings';
                            Settings.selectedIndex = 0;
                            break;
                        case 6: // How to Play
                            this.state = 'tutorial';
                            Tutorial.pageIndex = 0;
                            break;
                    }
                }
                break;

            case 'difficulty_select':
                this._updateMenu(dt, 5);
                if (Input.isPressed('confirm')) {
                    Audio.playMenuSelect();
                    const self = this;
                    const startWithDifficulty = (diff) => {
                        if (self._pendingEndless) {
                            self._pendingEndless = false;
                            Transition.start(() => { self.startEndless(diff); });
                        } else {
                            GameConfig = JSON.parse(JSON.stringify(DIFFICULTY_PRESETS[diff]));
                            GameConfig.difficulty = diff;
                            if (Campaign.levelsUnlocked > 1) {
                                self.state = 'level_select';
                                Menu.selectedIndex = 0;
                            } else {
                                self.showBriefing(0);
                            }
                        }
                    };
                    switch (Menu.selectedIndex) {
                        case 0: startWithDifficulty('casual'); break;
                        case 1: startWithDifficulty('normal'); break;
                        case 2: startWithDifficulty('hardcore'); break;
                        case 3:
                            this.state = 'custom_difficulty';
                            CustomDifficulty.init();
                            break;
                        case 4:
                            this.state = 'title';
                            Menu.selectedIndex = 0;
                            break;
                    }
                }
                if (Input.isPressed('back')) {
                    this._pendingEndless = false;
                    this.state = 'title';
                    Menu.selectedIndex = 0;
                    Audio.playMenuNav();
                }
                break;

            case 'custom_difficulty': {
                const cdResult = CustomDifficulty.update();
                if (cdResult === 'start') {
                    GameConfig = CustomDifficulty.getConfig();
                    GameConfig.fireMode = Settings.values.fireMode;
                    this.currentLevelIndex = CustomDifficulty.startLevel || 0;
                    this.showBriefing(this.currentLevelIndex);
                } else if (cdResult === 'back') {
                    this.state = 'difficulty_select';
                    Menu.selectedIndex = 3;
                    Audio.playMenuNav();
                }
                break;
            }

            case 'hangar': {
                const hResult = Hangar.update();
                if (hResult === 'back') {
                    this.state = 'title';
                    Menu.selectedIndex = 2;
                    Audio.playMenuNav();
                }
                break;
            }

            case 'tutorial': {
                const tResult = Tutorial.update();
                if (tResult === 'back') {
                    this.state = 'title';
                    Menu.selectedIndex = 6;
                    Audio.playMenuNav();
                }
                break;
            }

            case 'level_select': {
                const levelCount = Campaign.getLevelCount();
                this._updateMenu(dt, levelCount + 1); // +1 for Back
                if (Input.isPressed('confirm')) {
                    Audio.playMenuSelect();
                    if (Menu.selectedIndex >= levelCount) {
                        this.state = 'difficulty_select';
                        Menu.selectedIndex = 0;
                    } else if (Campaign.isLevelAvailable(Menu.selectedIndex, false)) {
                        this.showBriefing(Menu.selectedIndex);
                    }
                }
                if (Input.isPressed('back')) {
                    this.state = 'difficulty_select';
                    Menu.selectedIndex = 0;
                    Audio.playMenuNav();
                }
                break;
            }

            case 'settings':
                const settingsResult = Settings.update();
                if (settingsResult === 'back') {
                    this.state = 'title';
                    Menu.selectedIndex = 5;
                    Audio.playMenuNav();
                } else if (settingsResult === 'controls') {
                    this.state = 'controls';
                    ControlsScreen.selectedIndex = 0;
                    ControlsScreen.mode = 'browse';
                }
                break;

            case 'controls': {
                const controlsResult = ControlsScreen.update();
                if (controlsResult === 'back') {
                    this.state = 'settings';
                    Audio.playMenuNav();
                }
                break;
            }

            case 'high_scores':
                if (Input.isPressed('left')) {
                    Menu.highScoreTab = (Menu.highScoreTab - 1 + 5) % 5;
                    Audio.playMenuNav();
                }
                if (Input.isPressed('right')) {
                    Menu.highScoreTab = (Menu.highScoreTab + 1) % 5;
                    Audio.playMenuNav();
                }
                if (Input.isPressed('back') || Input.isPressed('confirm')) {
                    this.state = 'title';
                    Menu.selectedIndex = 3;
                    Audio.playMenuNav();
                }
                break;

            case 'achievements':
                if (Input.isPressed('back') || Input.isPressed('confirm')) {
                    this.state = 'title';
                    Menu.selectedIndex = 4;
                    Audio.playMenuNav();
                }
                break;

            case 'briefing':
                this.briefingTimer += dt;
                Background.update(dt);   // keep the briefing backdrop moving
                if (Input.isPressed('confirm') || Input.isPressed('fire') || this.briefingTimer > 8) {
                    Audio.playMenuSelect();
                    const lvlIdx = this.currentLevelIndex;
                    const diff = GameConfig.difficulty;
                    const continuing = this._continuing;
                    Transition.start(() => {
                        this.startLevel(lvlIdx, diff, continuing);
                    }, 3.0);
                }
                if (Input.isPressed('back')) {
                    Transition.start(() => {
                        this.state = 'title'; Menu.selectedIndex = 0;
                    });
                }
                break;

            case 'playing':
                if (Input.isPressed('pause')) {
                    this.state = 'paused';
                    Menu.selectedIndex = 0;
                    Audio.playMenuNav();
                    break;
                }

                Background.update(dt);
                Player.update(dt);
                Enemies.update(dt, Player.x, Player.y);
                PowerUps.update(dt);
                Particles.update(dt);
                Scoring.update(dt);
                ScreenShake.update(dt);
                Renderer.updateEffects(dt);
                WaveSystem.update(dt);
                Scheduler.update(dt);
                Asteroids.update(dt);
                Escort.update(dt);

                // Endless mode wave generation — rank scales like a level, with density capped
                if (EndlessMode.active) {
                    EndlessMode.update(dt);
                    this.applyLevelScaling(EndlessMode.rank, GameConfig._baseDensity);
                    // Caps keep late Endless readable and killable; spawn rate and enemy mix
                    // keep escalating after these are reached
                    GameConfig.bulletDensity = Math.min(GameConfig.bulletDensity, GameConfig._baseDensity * 2.2);
                    GameConfig._levelHpScale = Math.min(GameConfig._levelHpScale, 3);
                    // Fire frequency too: uncapped, late Endless filled the 800-bullet pool
                    GameConfig._levelFireRateScale = Math.min(GameConfig._levelFireRateScale, 1.6);
                }

                // Asteroid collision with player bullets
                for (const a of Asteroids.list) {
                    if (!a.destructible) {
                        // Indestructible — check player collision only
                        const dx = a.x - Player.x, dy = a.y - Player.y;
                        if (dx * dx + dy * dy < (a.radius + Player.hitboxRadius) * (a.radius + Player.hitboxRadius)) {
                            Player._die();
                        }
                        continue;
                    }
                    for (const b of Player.bullets.pool) {
                        const dx = b.x - a.x, dy = b.y - a.y;
                        if (dx * dx + dy * dy < (b.radius + a.radius) * (b.radius + a.radius)) {
                            a.hp -= b.damage;
                            b.active = false;
                            Particles.impact(b);
                            break;
                        }
                    }
                    // Player collision with asteroid
                    const pdx = a.x - Player.x, pdy = a.y - Player.y;
                    if (pdx * pdx + pdy * pdy < (a.radius + Player.hitboxRadius) * (a.radius + Player.hitboxRadius)) {
                        Player._die();
                    }
                }

                // Escort failure check
                if (Escort.active && !Escort.alive) {
                    Escort.active = false; // prevent re-triggering
                    Scheduler.after(1.5, () => this._endLevel(false));
                }

                // Apply settings dynamically
                if (Settings.values.screenShake === 'off') { ScreenShake.offsetX = 0; ScreenShake.offsetY = 0; }
                else if (Settings.values.screenShake === 'low') { ScreenShake.offsetX *= 0.5; ScreenShake.offsetY *= 0.5; }

                // Boss trigger — campaign only. The boss comes once every wave has spawned and the
                // field is clear, or after a grace period (stragglers then retreat), so a level can't stall.
                if (!EndlessMode.active && !Boss.active && !Boss.defeated && WaveSystem.allWavesSpawned()) {
                    if (this._lastWaveClearTimer === null) this._lastWaveClearTimer = 0;
                    this._lastWaveClearTimer += dt;
                    if (Enemies.list.length === 0 || this._lastWaveClearTimer >= this.BOSS_GRACE_SECONDS) {
                        Enemies.retreatAll();
                        const levelData = ALL_LEVELS[this.currentLevelIndex];
                        Boss.init(levelData.bossType || 'architect');
                        WaveSystem.bossActive = true;
                    }
                }

                // Boss update
                if (Boss.active) {
                    Boss.update(dt, Player.x, Player.y);
                    if (!Boss.active && Boss.defeated) {
                        WaveSystem.bossActive = false;
                        Scheduler.after(1.5, () => this._endLevel(true));
                    }
                }

                // Game over check — only trigger once
                if (Player.alive === false && Player.lives <= 0 && !this._gameOverPending) {
                    this._gameOverPending = true;
                    this._retryLoadout = { levelIndex: this.currentLevelIndex, weapon: this._levelStartWeapon || 'none', drones: this._levelStartDrones || 0 };
                    Scheduler.after(1.5, () => this._endLevel(false));
                }
                break;

            case 'paused':
                if (this.pauseConfirm) {
                    // Confirmation sub-state
                    if (Input.isPressed('confirm')) {
                        Audio.playMenuSelect();
                        if (this.pauseConfirm === 'restart') {
                            this.pauseConfirm = null;
                            const isEndless = this.currentLevelIndex === -1;
                            const diff = GameConfig.difficulty;
                            Transition.start(() => { isEndless ? this.startEndless(diff) : this.startLevel(this.currentLevelIndex, diff, false); });
                        } else if (this.pauseConfirm === 'quit') {
                            this.pauseConfirm = null;
                            Transition.start(() => { this.state = 'title'; Menu.selectedIndex = 0; });
                        }
                    }
                    if (Input.isPressed('back') || Input.isPressed('pause')) {
                        this.pauseConfirm = null;
                        Audio.playMenuNav();
                    }
                } else {
                    this._updateMenu(dt, 3);
                    if (Input.isPressed('confirm')) {
                        Audio.playMenuSelect();
                        switch (Menu.selectedIndex) {
                            case 0: this.state = 'playing'; break;
                            case 1: this.pauseConfirm = 'restart'; break;
                            case 2: this.pauseConfirm = 'quit'; break;
                        }
                    }
                    if (Input.isPressed('pause') || Input.isPressed('back')) {
                        this.state = 'playing';
                    }
                }
                break;

            case 'game_over':
                if (HighScores.enteringInitials) {
                    HighScores.updateInitialEntry();
                } else {
                    this._updateMenu(dt, 2);
                    if (Input.isPressed('confirm')) {
                        Audio.playMenuSelect();
                        const lvlIdx = this.currentLevelIndex;
                        const diff = GameConfig.difficulty;
                        const isEndless = lvlIdx === -1;
                        switch (Menu.selectedIndex) {
                            case 0: Transition.start(() => { isEndless ? this.startEndless(diff) : this.startLevel(lvlIdx, diff, false); }); break;
                            case 1: Transition.start(() => { this.state = 'title'; Menu.selectedIndex = 0; }); break;
                        }
                    }
                }
                break;

            case 'victory':
                if (HighScores.enteringInitials) {
                    HighScores.updateInitialEntry();
                } else {
                    const hasNextLevel = this.currentLevelIndex < Campaign.getLevelCount() - 1 &&
                        Campaign.isLevelAvailable(this.currentLevelIndex + 1, GameConfig.difficulty === 'custom');
                    const menuCount = hasNextLevel ? 3 : 2;
                    this._updateMenu(dt, menuCount);
                    if (Input.isPressed('confirm')) {
                        Audio.playMenuSelect();
                        const lvlIdx = this.currentLevelIndex;
                        const diff = GameConfig.difficulty;
                        if (hasNextLevel) {
                            switch (Menu.selectedIndex) {
                                case 0: Transition.start(() => { this.showBriefing(lvlIdx + 1, true); }); break;
                                case 1: Transition.start(() => { this.startLevel(lvlIdx, diff, false); }); break;
                                case 2: Transition.start(() => { this.state = 'title'; Menu.selectedIndex = 0; }); break;
                            }
                        } else {
                            switch (Menu.selectedIndex) {
                                case 0:
                                    Transition.start(() => {
                                        this.state = 'campaign_complete';
                                        this.briefingTimer = 0;
                                        Menu.selectedIndex = 0;
                                    });
                                    break;
                                case 1: Transition.start(() => { this.state = 'title'; Menu.selectedIndex = 0; }); break;
                            }
                        }
                    }
                }
                break;

            case 'campaign_complete':
                this.briefingTimer += dt;
                this._updateMenu(dt, 2);
                if (Input.isPressed('confirm')) {
                    Audio.playMenuSelect();
                    const diff = GameConfig.difficulty;
                    switch (Menu.selectedIndex) {
                        case 0: Transition.start(() => { this.startGame(diff); }); break;
                        case 1: Transition.start(() => { this.state = 'title'; Menu.selectedIndex = 0; }); break;
                    }
                }
                break;
        }
    },

    _updateMenu(dt, itemCount) {
        if (Input.isPressed('down')) {
            Menu.selectedIndex = (Menu.selectedIndex + 1) % itemCount;
            Audio.playMenuNav();
        }
        if (Input.isPressed('up')) {
            Menu.selectedIndex = (Menu.selectedIndex - 1 + itemCount) % itemCount;
            Audio.playMenuNav();
        }
    },

    draw() {
        ctx.clearRect(0, 0, SCREEN_W, SCREEN_H);

        switch (this.state) {
            case 'title':
                Menu.drawTitle(ctx);
                break;

            case 'difficulty_select':
                Menu.drawDifficultySelect(ctx);
                break;

            case 'settings':
                Settings.draw(ctx);
                break;

            case 'controls':
                ControlsScreen.draw(ctx);
                break;

            case 'high_scores':
                Menu.drawHighScores(ctx);
                break;

            case 'achievements':
                Menu.drawAchievements(ctx);
                break;

            case 'custom_difficulty':
                CustomDifficulty.draw(ctx);
                break;

            case 'hangar':
                Hangar.draw(ctx);
                break;

            case 'tutorial':
                Tutorial.draw(ctx);
                break;

            case 'level_select':
                Menu.drawLevelSelect(ctx);
                break;

            case 'briefing': {
                // The level's backdrop plays in the play area behind the briefing
                const lvl = ALL_LEVELS[this.currentLevelIndex];
                Background.bgType = (lvl && lvl.bgType) || 'synthwave';
                const pctx = Renderer.getPlayCtx();
                Renderer.beginFrame();
                Renderer.setShake(0, 0);
                Background.draw(pctx);
                Renderer.endFrame();
                if (!Renderer.usePixi) Renderer.blitToOverlay(ctx, PLAY_X, PLAY_Y);
                Menu.drawBriefing(ctx);
                break;
            }

            case 'playing':
            case 'paused': {
                const pctx = Renderer.getPlayCtx();
                Renderer.beginFrame();
                Renderer.setShake(ScreenShake.offsetX, ScreenShake.offsetY);
                Background.draw(pctx);
                Asteroids.draw(pctx);
                Escort.draw(pctx);
                PowerUps.draw(pctx);
                Enemies.draw(pctx);
                Player.draw(pctx);
                if (Boss.active) Boss.draw(pctx);
                Particles.draw(pctx);
                Scoring.drawPopups(pctx);
                if (Renderer.usePixi) {
                    Renderer.endFrame();
                } else {
                    Renderer.endFrame(); // Still composites glow + game
                    Renderer.blitToOverlay(ctx, PLAY_X + ScreenShake.offsetX, PLAY_Y + ScreenShake.offsetY);
                }
                HUD.draw(ctx);
                if (this.state === 'paused') Menu.drawPause(ctx);
                break;
            }

            case 'game_over': {
                const pctx = Renderer.getPlayCtx();
                Renderer.beginFrame();
                Renderer.setShake(0, 0);
                Background.draw(pctx);
                Asteroids.draw(pctx);
                Enemies.draw(pctx);
                Particles.draw(pctx);
                if (Renderer.usePixi) {
                    Renderer.endFrame();
                } else {
                    Renderer.endFrame();
                    Renderer.blitToOverlay(ctx, PLAY_X, PLAY_Y);
                }
                HUD.draw(ctx);
                Menu.drawGameOver(ctx);
                break;
            }

            case 'victory': {
                const pctx = Renderer.getPlayCtx();
                Renderer.beginFrame();
                Renderer.setShake(0, 0);
                Background.draw(pctx);
                Particles.draw(pctx);
                if (Renderer.usePixi) {
                    Renderer.endFrame();
                } else {
                    Renderer.endFrame();
                    Renderer.blitToOverlay(ctx, PLAY_X, PLAY_Y);
                }
                HUD.draw(ctx);
                Menu.drawVictory(ctx);
                break;
            }

            case 'campaign_complete':
                Menu.drawCampaignComplete(ctx);
                break;
        }

        // Transition overlay — always drawn on top of everything
        Transition.draw(ctx);
        FpsMeter.draw(ctx);
    }
};


// === main.js ===
// ============================================================
//  GAME LOOP
// ============================================================
function gameLoop(timestamp) {
    FpsMeter.tick(timestamp - Game.lastTime);
    const dt = Math.min((timestamp - Game.lastTime) / 1000, 0.05); // Cap delta to prevent spiral
    Game.lastTime = timestamp;

    Game.update(dt);
    Game.draw();
    Input.lateUpdate();

    requestAnimationFrame(gameLoop);
}

// Initialize renderer, then game, then start
(async function boot() {
    await Renderer.init();
    resizeCanvas(); // Re-run after Pixi canvas exists
    await Game.init();
    requestAnimationFrame((timestamp) => {
        Game.lastTime = timestamp;
        gameLoop(timestamp);
    });
})();


