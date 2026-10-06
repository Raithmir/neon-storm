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
//    uHaze    boss centre (px), radius (px), strength 0..1: heat haze
//             behind the boss; every shader starts with p = haze(...)
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
uniform vec4 uHaze;

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
// Heat haze: shimmer the backdrop behind the boss (a tall ellipse around it,
// with the noise drifting upward like rising air)
vec2 haze(vec2 p) {
    if (uHaze.w <= 0.0) return p;
    vec2 d = (p - uHaze.xy) / vec2(uHaze.z, uHaze.z * 1.4);
    float f = smoothstep(1.0, 0.2, length(d)) * uHaze.w;
    if (f <= 0.0) return p;
    vec2 q = p * 0.035 + vec2(0.0, uTime * 1.8);
    return p + (vec2(noise(q), noise(q + 17.3)) - 0.5) * 16.0 * f;
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
    vec2 p = haze(vUV * uRes);
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
    vec2 p = haze(vUV * uRes);
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
    vec2 p = haze(vUV * uRes);
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
    vec2 p = haze(vUV * uRes);
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
    vec2 p = haze(vUV * uRes);
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
    vec2 p = haze(vUV * uRes);
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
