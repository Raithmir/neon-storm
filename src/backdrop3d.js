// ============================================================
//  BACKDROP 3D — three.js level backgrounds on PixiJS's GL context
//
//  Each level can have a 3D scene (BACKDROP_SCENES_3D[bgType]) that replaces
//  its shader backdrop (backdrops.js). three.js (vendor/three.min.js, the
//  global THREE) shares Pixi's WebGL context, renders the scene into its own
//  render target, and that texture is handed to Pixi, where a mesh at the
//  bottom of Renderer.worldLayer draws it through the backdrop uniforms: heat
//  haze, dimming under dense bullets and Flash Reduction work as they do for
//  the shader backdrops, and all of Pixi's filters apply on top.
//
//  The shader backdrop is used instead when 3D BACKDROPS is off, at LOW
//  graphics quality, without WebGL2, or after any error or context loss.
//
//  Scenes: BACKDROP_SCENES_3D[theme] = { build() } returning
//    { scene, camera, update(s) }, where s = { t, dt, pulse, boss, surge, calm }
//  (t pauses with the game; pulse/boss/surge are the 0..1 backdrop uniforms).
//  Readability rule as for the shader backdrops: keep everything darker and
//  less saturated than what the player can collide with. Scenes write their
//  own fog (shader materials), so all materials here are ShaderMaterials or
//  basic materials with fog off.
//
//  The texture handoff swaps the WebGLTexture inside a Pixi TextureSource
//  (Pixi internals: renderer.texture.getGlSource), so Pixi is pinned
//  (vendor/pixi.min.js, 8.18.1); re-check this file when upgrading it.
// ============================================================

// GLSL helpers shared by the scenes' shaders
const B3D_GLSL = `
float h11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float h21(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm3(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = mat2(0.8, 0.6, -0.6, 0.8) * p * 2.03 + 11.0; a *= 0.5; }
    return v;
}
// Anti-aliased grid line strength for a coordinate in cell units
float gridAA(float c, float widthPx) {
    float d = abs(fract(c - 0.5) - 0.5) / max(fwidth(c), 1e-4);
    return 1.0 - smoothstep(widthPx * 0.5, widthPx * 0.5 + 1.0, d);
}
`;

// Small JS helpers for building scenes
const B3D = {
    rng(seed) {
        let s = seed % 2147483647;
        if (s <= 0) s += 2147483646;
        return () => (s = (s * 16807) % 2147483647) / 2147483647;
    },

    // Value noise in JS (terrain heights), matching vnoise's shape
    noise2(x, y) {
        const h = (a, b) => {
            const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
            return s - Math.floor(s);
        };
        const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
        const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
        const a = h(ix, iy), b = h(ix + 1, iy), c = h(ix, iy + 1), d = h(ix + 1, iy + 1);
        return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
    },

    fbm2(x, y, oct) {
        let v = 0, a = 0.5;
        for (let i = 0; i < (oct || 4); i++) { v += a * this.noise2(x, y); x = x * 2.03 + 17; y = y * 2.03 + 9; a *= 0.5; }
        return v;
    },

    // ShaderMaterial with the shared GLSL prepended to the fragment shader
    mat(vertexShader, fragmentShader, uniforms, opts) {
        return new THREE.ShaderMaterial(Object.assign({
            vertexShader,
            fragmentShader: B3D_GLSL + fragmentShader,
            uniforms: uniforms || {},
        }, opts || {}));
    },

    // World-position varying, with instancing when the mesh is instanced
    VS_WORLD: `
varying vec3 vW;
varying vec2 vUv;
varying vec3 vN;
varying float vSeed;
void main() {
    vUv = uv;
    #ifdef USE_INSTANCING
        mat4 m = modelMatrix * instanceMatrix;
        vSeed = fract(sin(dot(instanceMatrix[3].xyz, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    #else
        mat4 m = modelMatrix;
        vSeed = 0.0;
    #endif
    vec4 w = m * vec4(position, 1.0);
    vW = w.xyz;
    vN = normalize(mat3(m) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
}`,

    col(hex) { return new THREE.Color(hex); },

    // Objects that move every frame (or in their vertex shader) keep stale
    // bounds, which makes three cull them; these are always drawn instead
    always(...objs) { for (const o of objs) o.frustumCulled = false; return objs[0]; },
    lerpColor(out, a, b, t) { return out.copy(a).lerp(b, t); },
};

const Backdrop3D = {
    ok: false,           // three is running on Pixi's context
    broken: false,       // an error or context loss: shader backdrops from now on
    _scenes: {},         // built scenes, by theme
    _state: { t: 0, dt: 0, pulse: 0, boss: 0, surge: 0, calm: 0 },

    // From Renderer.init, once the shader backdrop exists
    init() {
        if (typeof THREE === 'undefined' || !Renderer.app || !Renderer._bgGeometry) return;
        try {
            const pixi = Renderer.app.renderer;
            const gl = pixi.gl;
            if (typeof WebGL2RenderingContext === 'undefined' || !(gl instanceof WebGL2RenderingContext)) return;
            this._pixi = pixi;
            // Pixi isn't colour-managed (sRGB values straight through), so neither is three
            THREE.ColorManagement.enabled = false;
            this._resetUnpack(gl);
            this.three = new THREE.WebGLRenderer({ canvas: pixi.canvas, context: gl, antialias: false });
            this.three.outputColorSpace = THREE.LinearSRGBColorSpace;
            this.three.autoClear = false;
            this._initComposite();
            this.ok = true;
            console.log('[Backdrop3D] three r' + THREE.REVISION + ' on the Pixi context');
        } catch (e) {
            console.warn('[Backdrop3D] unavailable — shader backdrops only:', e);
            this.broken = true;
        }
    },

    // The mesh in worldLayer that shows the 3D scene through the backdrop uniforms
    _initComposite() {
        this._source = new PIXI.TextureSource({ width: 1, height: 1 });
        this._shader = PIXI.Shader.from({
            gl: {
                vertex: BACKDROP_VERTEX,
                fragment: BACKDROP_COMMON + `
uniform sampler2D uScene;
void main() {
    vec2 p = haze(vUV * uRes);
    // GL render targets are stored bottom-up
    vec3 col = texture(uScene, vec2(p.x / uRes.x, 1.0 - p.y / uRes.y)).rgb;
    col += col * uPulse * (1.0 - uCalm * 0.7) * 0.5;
    gl_FragColor = vec4(finish(col), 1.0);
}`,
            },
            resources: { bgUniforms: Renderer._bgUniforms, uScene: this._source },
        });
        this.mesh = new PIXI.Mesh({ geometry: Renderer._bgGeometry, shader: this._shader });
        this.mesh.visible = false;
        Renderer.worldLayer.addChildAt(this.mesh, Renderer.worldLayer.getChildIndex(Renderer._bgMesh) + 1);
    },

    wants(theme) {
        return this.ok && !this.broken && !!BACKDROP_SCENES_3D[theme] && Renderer.usePixi
            && Settings.values.backdrop3d !== false && Renderer.quality !== 'low';
    },

    // Every frame from Renderer._updateBackdrop. Renders the theme's scene and
    // shows it; returns false when the shader backdrop should show instead.
    frame(theme, dt, u) {
        if (!this.wants(theme)) {
            if (this.mesh) this.mesh.visible = false;
            return false;
        }
        try {
            const sc = this._scenes[theme] || (this._scenes[theme] = BACKDROP_SCENES_3D[theme].build());
            this._target();
            const s = this._state;
            s.t = u.uTime; s.dt = dt; s.pulse = u.uPulse; s.boss = u.uBoss; s.surge = u.uSurge; s.calm = u.uCalm;
            sc.update(s);
            this._render(sc.scene, sc.camera);
            this.mesh.visible = true;
            return true;
        } catch (e) {
            console.warn('[Backdrop3D] scene "' + theme + '" failed — using the shader backdrop:', e);
            this.broken = true;
            this.mesh.visible = false;
            return false;
        }
    },

    // Render target at the play area's resolution; its texture becomes uScene
    _target() {
        const k = Renderer.playScale || 1;
        const w = Math.round(PLAY_W * k), h = Math.round(PLAY_H * k);
        if (this.rt && this.rt.width === w && this.rt.height === h) return;
        if (this.rt) this.rt.dispose();
        this.rt = new THREE.WebGLRenderTarget(w, h, { depthBuffer: true, samples: 4 });
        // Render once so three creates the GL texture, then put it inside a Pixi source
        this._render(new THREE.Scene(), new THREE.PerspectiveCamera());
        const glTex = this.three.properties.get(this.rt.texture).__webglTexture;
        const source = new PIXI.TextureSource({ width: PLAY_W, height: PLAY_H, resolution: k });
        const glSource = this._pixi.texture.getGlSource(source);
        this._pixi.gl.deleteTexture(glSource.texture);
        glSource.texture = glTex;
        this._shader.resources.uScene = source;
        if (this._source) this._source.destroy();
        this._source = source;
    },

    _render(scene, camera) {
        const three = this.three;
        this._resetUnpack(this._pixi.gl);
        three.resetState();
        three.setRenderTarget(this.rt);
        three.clear();
        three.render(scene, camera);
        three.setRenderTarget(null);
        three.resetState();
        this._pixi.resetState();
    },

    // Pixi leaves its texture-upload state set; three expects GL defaults
    _resetUnpack(gl) {
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    },

    // Context lost: three's GL objects are gone, so stay on the shader backdrops
    lose() {
        this.broken = true;
        if (this.mesh) this.mesh.visible = false;
    },
};

// ============================================================
//  SCENES
// ============================================================
const BACKDROP_SCENES_3D = {

    // Level 1 — First Contact: a neon grid racing toward a striped sun that
    // sets behind Neo-Tokyo, wireframe mountains either side, light pylons
    // streaming past along the grid
    synthwave: {
        build() {
            const scene = new THREE.Scene();
            const camera = new THREE.PerspectiveCamera(60, PLAY_W / PLAY_H, 1, 4000);
            camera.position.set(0, 24, 0);
            camera.rotation.x = -0.26;          // horizon ~27% from the top, like the shader version

            const U = {
                uScroll: { value: 0 }, uTime: { value: 0 }, uBright: { value: 0.5 },
                uGrid: { value: B3D.col(0xff2bd6) }, uLane: { value: B3D.col(0x19f2ff) },
                uFog: { value: B3D.col(0x3a0a52) }, uSunTop: { value: B3D.col(0xffcc33) },
                uBoss: { value: 0 },
            };
            const red = B3D.col(0xff1a40), cyan = B3D.col(0x4dffff);

            // Sky dome: deep violet to a magenta horizon, with stars
            const sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), B3D.mat(B3D.VS_WORLD, `
uniform float uTime; uniform float uBoss;
varying vec3 vW;
void main() {
    vec3 d = normalize(vW - cameraPosition);
    float e = d.y;
    vec3 col = mix(vec3(0.42, 0.07, 0.48), vec3(0.03, 0.006, 0.1), smoothstep(-0.02, 0.38, e));
    col += vec3(0.9, 0.12, 0.6) * 0.35 * exp(-max(e, 0.0) * 28.0);     // glow along the horizon
    col = mix(col, vec3(0.45, 0.04, 0.12), uBoss * 0.35 * (1.0 - smoothstep(0.0, 0.3, e)));
    vec2 sp = vec2(atan(d.x, -d.z), e) * 160.0;
    vec2 c = floor(sp);
    float h = h21(c);
    float star = step(0.93, h) * smoothstep(0.35, 0.0, length(fract(sp) - 0.5)) * smoothstep(0.08, 0.3, e);
    col += vec3(0.9, 0.85, 1.0) * star * (0.5 + 0.5 * sin(uTime * (1.0 + h * 4.0) + h * 30.0));
    gl_FragColor = vec4(col, 1.0);
}`, U, { side: THREE.BackSide, depthWrite: false }));
            sky.renderOrder = -10;
            scene.add(sky);

            // Sun: gradient disc with scrolling stripes across its lower half, and a halo
            const sun = new THREE.Mesh(new THREE.PlaneGeometry(1500, 1500), B3D.mat(B3D.VS_WORLD, `
uniform float uTime; uniform vec3 uSunTop; uniform float uBoss;
varying vec2 vUv;
void main() {
    vec2 q = vUv * 2.0 - 1.0;
    float r = length(q);
    float R = 0.34;
    float y = q.y / R;                       // -1 bottom .. 1 top of the disc
    vec3 sunCol = mix(vec3(1.0, 0.08, 0.5), uSunTop, smoothstep(-0.8, 0.8, y));
    // Horizontal gaps across the lower part, wider toward the bottom, drifting down
    float band = smoothstep(0.25, -1.0, y);
    float stripe = step(fract(y * 7.0 + uTime * 0.3), band * 0.55) * step(y, 0.25);
    float disc = smoothstep(R, R - 0.004, r) * (1.0 - stripe);
    float halo = exp(-max(r - R, 0.0) * 7.0) * 0.6 * (1.0 - disc);
    // Dimmer during the boss fight, so its bullets stay readable over the sun
    vec3 col = (sunCol * disc + mix(vec3(1.0, 0.2, 0.6), vec3(1.0, 0.15, 0.2), uBoss) * halo) * (1.0 - 0.35 * uBoss);
    gl_FragColor = vec4(col, max(disc, halo));
}`, U, { transparent: true, depthWrite: false }));
            sun.position.set(0, 300, -2400);
            sun.renderOrder = -9;
            scene.add(sun);

            // Distant mountains: a wireframe heightfield, low in the middle so the sun shows
            const mGeo = new THREE.PlaneGeometry(5200, 900, 160, 30);
            mGeo.rotateX(-Math.PI / 2);
            const mp = mGeo.attributes.position;
            for (let i = 0; i < mp.count; i++) {
                const x = mp.getX(i), z = mp.getZ(i);
                const edge = Math.min(1, Math.abs(x) / 2000);
                const mask = 0.12 + 0.88 * edge * edge * (3 - 2 * edge);
                const back = 1 - Math.abs(z) / 450;   // peaks in the middle of the strip
                mp.setY(i, Math.max(0, (B3D.fbm2(x * 0.004, z * 0.004) * 1.4 - 0.25)) * 760 * mask * Math.max(0, back));
            }
            mGeo.computeVertexNormals();
            const mountains = new THREE.Mesh(mGeo, B3D.mat(B3D.VS_WORLD, `
uniform vec3 uGrid; uniform vec3 uFog;
varying vec3 vW; varying vec3 vN;
void main() {
    float gx = gridAA(vW.x / 40.0, 1.2), gz = gridAA(vW.z / 40.0, 1.2);
    float h = clamp(vW.y / 420.0, 0.0, 1.0);
    vec3 body = vec3(0.025, 0.004, 0.07) + vec3(0.06, 0.0, 0.08) * h;
    vec3 col = body + uGrid * max(gx, gz) * (0.25 + 0.55 * h);
    // Fade into the horizon haze at the foot
    col = mix(uFog * 0.9, col, smoothstep(0.0, 40.0, vW.y));
    gl_FragColor = vec4(col, 1.0);
}`, U));
            mountains.position.set(0, -2, -2050);
            scene.add(mountains);

            // Neo-Tokyo skyline in front of the sun: towers with scattered lit windows
            const rnd = B3D.rng(1987);
            const towerGeo = new THREE.BoxGeometry(1, 1, 1);
            towerGeo.translate(0, 0.5, 0);
            const towerCount = 90;
            const towers = new THREE.InstancedMesh(towerGeo, B3D.mat(B3D.VS_WORLD, `
uniform float uTime; uniform vec3 uFog; uniform float uBoss;
varying vec3 vW; varying vec3 vN; varying float vSeed;
void main() {
    vec3 body = vec3(0.02, 0.003, 0.05);
    // Window grid on the side faces
    vec2 wc = vec2(abs(vN.x) > 0.5 ? vW.z : vW.x, vW.y) / vec2(5.0, 6.0);
    vec2 cell = floor(wc);
    float lit = step(0.72, h21(cell + vSeed * 91.0)) * step(abs(vN.y), 0.5);
    float win = lit * step(0.25, fract(wc.x)) * step(fract(wc.x), 0.75) * step(0.3, fract(wc.y)) * step(fract(wc.y), 0.7);
    vec3 wcol = mix(vec3(1.0, 0.75, 0.35), vec3(0.3, 0.95, 1.0), step(0.6, h21(cell * 1.7 + vSeed)));
    wcol = mix(wcol, vec3(1.0, 0.3, 0.6), step(0.85, h21(cell + 3.3)));
    float flicker = 0.75 + 0.25 * sin(uTime * 3.0 + h21(cell) * 40.0);
    vec3 col = body + wcol * win * 0.55 * flicker;
    // Rooftop rim light
    col += vec3(1.0, 0.25, 0.7) * 0.6 * step(0.5, vN.y);
    col = mix(col, uFog, 0.35);
    gl_FragColor = vec4(col, 1.0);
}`, U), towerCount);
            const m4 = new THREE.Matrix4(), pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
            for (let i = 0; i < towerCount; i++) {
                const x = (rnd() - 0.5) * 2000;
                const side = Math.min(1, Math.abs(x) / 1000);
                const h = 18 + rnd() * 40 + side * side * rnd() * 170 + (rnd() < 0.06 ? 90 : 0);
                pos.set(x, 0, -1500 - rnd() * 250);
                scl.set(18 + rnd() * 34, h, 18 + rnd() * 30);
                m4.compose(pos, quat, scl);
                towers.setMatrixAt(i, m4);
            }
            scene.add(towers);

            // Ground: infinite anti-aliased grid, cyan every fourth lane, the sun's reflection ahead
            const ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), B3D.mat(B3D.VS_WORLD, `
uniform float uScroll; uniform float uBright; uniform vec3 uGrid; uniform vec3 uLane; uniform vec3 uFog;
varying vec3 vW;
void main() {
    vec2 c = vec2(vW.x, vW.z - uScroll) / 14.0;
    float dist = length(vW.xz - cameraPosition.xz);
    float lx = gridAA(c.x, 1.3), lz = gridAA(c.y, 1.3);
    // Soft glow around each line close to the camera
    float gw = exp(-abs(fract(c.x - 0.5) - 0.5) * 12.0 * 1.6) + exp(-abs(fract(c.y - 0.5) - 0.5) * 12.0 * 1.6);
    float nearK = 1.0 - smoothstep(30.0, 500.0, dist);
    float lane = step(mod(floor(c.x + 0.5), 4.0), 0.5);
    vec3 lc = mix(uGrid, uLane, lane * 0.8);
    float fogK = smoothstep(150.0, 2300.0, dist);
    vec3 col = vec3(0.012, 0.003, 0.04);
    col += (lc * lx + uGrid * lz) * uBright * (1.0 - fogK * 0.85);
    col += uGrid * gw * 0.1 * nearK * uBright;
    // Faint ground glow toward the horizon
    col += vec3(0.25, 0.03, 0.3) * 0.25 * smoothstep(300.0, 2200.0, dist);
    // Sun reflection: a warm streak down the middle, strongest far away
    col += vec3(1.0, 0.3, 0.55) * 0.22 * exp(-abs(vW.x) / 70.0) * smoothstep(80.0, 1800.0, dist);
    col = mix(col, uFog, fogK * 0.92);
    gl_FragColor = vec4(col, 1.0);
}`, U));
            ground.rotation.x = -Math.PI / 2;
            scene.add(ground);

            // Light pylons along both sides of the grid, streaming past
            const PYLONS = 24, SPAN = 1440;
            const pGeo = new THREE.BoxGeometry(1.6, 1, 1.6);
            pGeo.translate(0, 0.5, 0);
            const pylons = new THREE.InstancedMesh(pGeo, B3D.mat(B3D.VS_WORLD, `
uniform vec3 uGrid; uniform vec3 uLane; uniform vec3 uFog;
varying vec3 vW; varying float vSeed;
void main() {
    float h = clamp(vW.y / 34.0, 0.0, 1.0);
    vec3 c = mix(uLane, uGrid, step(0.5, vSeed));
    vec3 col = vec3(0.02, 0.0, 0.05) + c * (0.1 + 0.6 * pow(h, 3.0));
    float dist = length(vW.xz - cameraPosition.xz);
    col = mix(col, uFog, smoothstep(200.0, 1400.0, dist) * 0.9);
    gl_FragColor = vec4(col, 1.0);
}`, U), PYLONS * 2);
            const pylonZ = [];
            for (let i = 0; i < PYLONS; i++) pylonZ.push(-i * (SPAN / PYLONS));
            // Glowing caps: additive points on the pylon tops
            const capGeo = new THREE.BufferGeometry();
            capGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(PYLONS * 2 * 3), 3));
            const caps = new THREE.Points(capGeo, B3D.mat(`
varying float vD;
void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vD = -mv.z;
    gl_PointSize = clamp(2600.0 / vD, 2.0, 90.0);
    gl_Position = projectionMatrix * mv;
}`, `
uniform vec3 uLane; uniform vec3 uGrid;
varying float vD;
void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float a = exp(-r * r * 5.0) * (1.0 - smoothstep(300.0, 1400.0, vD));
    gl_FragColor = vec4(mix(uLane, vec3(1.0), 0.35) * a * 0.9, 1.0);
}`, U, { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
            B3D.always(pylons, caps);
            scene.add(pylons, caps);

            const SPEED = 75;
            const gridBase = B3D.col(0xff2bd6), tmp = new THREE.Color();
            return {
                scene, camera,
                update(s) {
                    U.uTime.value = s.t;
                    U.uBoss.value = s.boss;
                    U.uScroll.value = s.t * SPEED;
                    U.uBright.value = 0.55 + s.pulse * 0.7 + s.surge * 0.3;
                    B3D.lerpColor(tmp, gridBase, red, s.boss * 0.7);
                    U.uGrid.value.copy(tmp).lerp(cyan, s.surge * 0.5);
                    U.uSunTop.value.setRGB(1.0, 0.8 - 0.5 * s.boss, 0.2 - 0.05 * s.boss);
                    // Pylons: rows at x = ±64, moving toward the camera and wrapping
                    const off = (s.t * SPEED) % (SPAN / PYLONS);
                    const cp = capGeo.attributes.position.array;
                    for (let i = 0; i < PYLONS; i++) {
                        const z = pylonZ[i] + off;
                        for (let side = 0; side < 2; side++) {
                            const x = side ? 64 : -64, h = 34;
                            m4.makeScale(1, h, 1).setPosition(x, 0, z);
                            pylons.setMatrixAt(i * 2 + side, m4);
                            cp.set([x, h + 1.5, z], (i * 2 + side) * 3);
                        }
                    }
                    pylons.instanceMatrix.needsUpdate = true;
                    capGeo.attributes.position.needsUpdate = true;
                },
            };
        },
    },

    // Level 2 — The Gauntlet: low through a foundry canyon at night. A river of
    // molten metal runs down the middle between riveted decks and conveyors,
    // factory blocks with glowing vents and long pipes line the walls, truss
    // gantries sweep overhead, smokestacks smoulder ahead and embers drift up
    industrial: {
        build() {
            const scene = new THREE.Scene();
            const camera = new THREE.PerspectiveCamera(62, PLAY_W / PLAY_H, 1, 3500);
            camera.position.set(0, 46, 0);
            camera.rotation.x = -0.3;

            const U = {
                uTime: { value: 0 }, uScroll: { value: 0 }, uHeat: { value: 0 }, uBoss: { value: 0 },
                uFog: { value: B3D.col(0x1a0905) }, uGlow: { value: B3D.col(0xff5a10) },
            };
            const FOG = `
vec3 foundryFog(vec3 col, vec3 w, float near, float far) {
    float d = length(w - cameraPosition);
    float k = smoothstep(near, far, d);
    // Smoky air lit orange from the furnaces ahead
    vec3 f = uFog + uGlow * (0.06 + 0.1 * uHeat) * smoothstep(far * 0.4, far, d);
    return mix(col, f, k);
}`;
            const rnd = B3D.rng(2024);
            const m4 = new THREE.Matrix4(), pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();

            // Sky: smoke lit from below by the furnaces
            const sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), B3D.mat(B3D.VS_WORLD, `
uniform float uTime; uniform float uHeat; uniform vec3 uGlow;
varying vec3 vW;
void main() {
    vec3 d = normalize(vW - cameraPosition);
    float e = d.y;
    vec2 q = vec2(atan(d.x, -d.z) * 3.0, e * 8.0 - uTime * 0.05);
    float smoke = fbm3(q * 2.0 + vec2(uTime * 0.03, 0.0));
    vec3 col = mix(vec3(0.05, 0.02, 0.015), vec3(0.012, 0.008, 0.01), smoothstep(-0.05, 0.5, e));
    float under = exp(-max(e, 0.0) * 6.0);
    col += uGlow * (0.18 + 0.2 * uHeat) * under * (0.4 + 0.8 * smoke);
    gl_FragColor = vec4(col, 1.0);
}`, U, { side: THREE.BackSide, depthWrite: false }));
            sky.renderOrder = -10;
            scene.add(sky);

            // Floor: molten channel, deck plates with rivets, conveyors
            const floor = new THREE.Mesh(new THREE.PlaneGeometry(1400, 6000), B3D.mat(B3D.VS_WORLD, FOG.replace('vec3 foundryFog', 'uniform vec3 uFog; uniform vec3 uGlow; uniform float uHeat;\nvec3 foundryFog') + `
uniform float uTime; uniform float uScroll; uniform float uBoss;
varying vec3 vW;
void main() {
    float ax = abs(vW.x);
    float z = vW.z - uScroll;
    vec3 col;
    if (ax < 16.0) {
        // Molten metal, kept dark (enemy shots here are orange): a crusted red
        // flow with thin hot veins, brighter toward the distance
        float f = fbm3(vec2(vW.x * 0.08, z * 0.03 - uTime * 0.6));
        float v = fbm3(vec2(vW.x * 0.15 + 5.0, z * 0.06 - uTime * 1.1));
        float vein = smoothstep(0.62, 0.72, v) * smoothstep(0.82, 0.72, v);
        vec3 lava = mix(vec3(0.12, 0.015, 0.0), vec3(0.42, 0.07, 0.0), smoothstep(0.4, 0.8, f));
        lava += vec3(0.75, 0.3, 0.05) * vein * 0.6;
        lava = mix(lava, lava * vec3(1.3, 0.5, 0.4), uBoss * 0.5);
        float crust = smoothstep(9.0, 16.0, ax) * (0.6 + 0.4 * vnoise(vec2(z * 0.2, ax)));
        float far = smoothstep(150.0, 900.0, length(vW - cameraPosition));
        col = mix(lava * (0.75 + 0.35 * uHeat + 0.6 * far), vec3(0.05, 0.02, 0.012), crust);
    } else {
        // Deck plates 24 units square, seams and corner rivets, lit by the channel
        vec2 pc = vec2(vW.x, z) / 24.0;
        float seam = max(gridAA(pc.x, 1.2), gridAA(pc.y, 1.2));
        vec2 f = fract(pc);
        vec2 rv = min(f, 1.0 - f) * 24.0;
        float rivet = smoothstep(1.1, 0.5, length(rv - 2.4));
        float wear = vnoise(floor(pc) * 1.7) * 0.02;
        vec3 steel = vec3(0.032, 0.038, 0.05) + wear;           // cool steel against the heat
        col = steel * (1.0 - seam * 0.55) + vec3(0.03, 0.035, 0.045) * rivet;
        // Conveyor belts with chevrons running faster than the deck
        float bx = abs(ax - 48.0);
        if (bx < 9.0) {
            float chev = step(0.55, fract((z - uTime * 70.0) / 10.0 + bx * 0.06));
            col = vec3(0.03, 0.025, 0.025) + vec3(0.5, 0.18, 0.02) * chev * 0.22 * smoothstep(9.0, 7.0, bx);
            col += vec3(0.25, 0.1, 0.03) * gridAA(bx / 9.0, 1.0) * 0.5;
        }
        // Firelight from the channel
        col += uGlow * (0.16 + 0.1 * uHeat) * exp(-(ax - 16.0) / 22.0);
    }
    gl_FragColor = vec4(foundryFog(col, vW, 120.0, 2600.0), 1.0);
}`, U));
            floor.rotation.x = -Math.PI / 2;
            floor.position.z = -2700;
            scene.add(floor);

            // Long pipes along both walls with flanges scrolling past
            const pipeMat = B3D.mat(B3D.VS_WORLD, FOG.replace('vec3 foundryFog', 'uniform vec3 uFog; uniform vec3 uGlow; uniform float uHeat;\nvec3 foundryFog') + `
uniform float uScroll;
varying vec3 vW; varying vec3 vN;
void main() {
    float z = vW.z - uScroll;
    float flange = smoothstep(0.92, 0.97, fract(z / 46.0));
    float lit = max(0.0, dot(vN, normalize(vec3(-sign(vW.x), 0.4, 0.0))));
    vec3 col = vec3(0.04, 0.035, 0.035) + vec3(0.05, 0.045, 0.04) * pow(max(vN.y, 0.0), 6.0);
    col += uGlow * 0.25 * lit;
    col = mix(col, col * 2.2 + vec3(0.04, 0.02, 0.01), flange);
    gl_FragColor = vec4(foundryFog(col, vW, 100.0, 2400.0), 1.0);
}`, U);
            const pipeGeo = new THREE.CylinderGeometry(1, 1, 6000, 16, 1, true);
            pipeGeo.rotateX(Math.PI / 2);
            for (const [x, y, r] of [[-76, 5, 4.5], [-86, 15, 3.5], [76, 5, 4.5], [88, 13, 4], [-80, 26, 2.5], [84, 25, 2.5]]) {
                const p = new THREE.Mesh(pipeGeo, pipeMat);
                p.scale.set(r, 1, r);
                p.position.set(x, y, -2700);
                scene.add(p);
            }

            // Factory blocks on both sides: panelled walls, glowing vents facing the channel
            const BLOCKS = 36, BSPAN = 2600;
            const blockGeo = new THREE.BoxGeometry(1, 1, 1);
            blockGeo.translate(0, 0.5, 0);
            const blocks = new THREE.InstancedMesh(blockGeo, B3D.mat(B3D.VS_WORLD, FOG.replace('vec3 foundryFog', 'uniform vec3 uFog; uniform vec3 uGlow; uniform float uHeat;\nvec3 foundryFog') + `
uniform float uTime;
varying vec3 vW; varying vec3 vN; varying float vSeed;
void main() {
    vec3 col = vec3(0.028, 0.032, 0.042);
    // Horizontal panel lines and vertical ribs
    col *= 1.0 - 0.35 * gridAA(vW.y / 9.0, 1.0);
    float side = abs(vN.x);
    if (side > 0.5 && sign(vN.x) != sign(vW.x)) {
        // Faces looking at the channel: rows of vents glowing orange
        vec2 vc = vec2(vW.z / 14.0, vW.y / 22.0);
        vec2 f = fract(vc);
        float vent = step(0.15, f.x) * step(f.x, 0.85) * step(0.36, f.y) * step(f.y, 0.64)
                   * step(0.45, fract(f.y * 22.0));             // louvred slats
        float on = step(0.35, h21(floor(vc) + vSeed * 50.0));
        float flick = 0.75 + 0.25 * sin(uTime * (2.0 + vSeed * 3.0) + floor(vc.x) * 1.7);
        col += uGlow * vent * on * flick * (0.42 + 0.3 * uHeat);
        col += uGlow * 0.08;                       // firelight on the facing walls
    }
    // Hot rim along the roofline
    col += uGlow * 0.35 * step(0.5, vN.y) * smoothstep(0.0, 1.0, h21(vec2(vSeed, 2.0)));
    gl_FragColor = vec4(foundryFog(col, vW, 120.0, 2400.0), 1.0);
}`, U), BLOCKS * 2);
            const blockDefs = [];
            for (let i = 0; i < BLOCKS; i++) {
                for (const side of [-1, 1]) {
                    blockDefs.push({ x: side * (118 + rnd() * 40), z0: -i * (BSPAN / BLOCKS) - rnd() * 20,
                        w: 50 + rnd() * 50, h: 40 + rnd() * 120, d: 50 + rnd() * 25 });
                }
            }

            // Overhead gantries: two pillars and a truss beam, warning lights on the pillars
            const GANTRIES = 7, GSPAN = 2100;
            const trussMat = B3D.mat(B3D.VS_WORLD, FOG.replace('vec3 foundryFog', 'uniform vec3 uFog; uniform vec3 uGlow; uniform float uHeat;\nvec3 foundryFog') + `
varying vec3 vW; varying vec2 vUv; varying vec3 vN;
void main() {
    // Lattice: diagonal braces between chords, see-through gaps
    vec2 q = vec2(vUv.x * 40.0, vUv.y);
    float diag = abs(fract(q.x + q.y * 0.9) - 0.5);
    float chord = step(vUv.y, 0.12) + step(0.88, vUv.y);
    float web = smoothstep(0.1, 0.05, diag);
    if (max(chord, web) < 0.5) discard;
    vec3 col = vec3(0.03, 0.026, 0.026) + uGlow * 0.3 * max(-vN.y, 0.0);   // underside lit by the channel
    gl_FragColor = vec4(foundryFog(col, vW, 100.0, 2200.0), 1.0);
}`, U, { side: THREE.DoubleSide });
            const gantries = [];
            const beamGeo = new THREE.PlaneGeometry(300, 14);
            const pillarGeo = new THREE.BoxGeometry(8, 110, 8);
            pillarGeo.translate(0, 55, 0);
            const pillarMat = B3D.mat(B3D.VS_WORLD, FOG.replace('vec3 foundryFog', 'uniform vec3 uFog; uniform vec3 uGlow; uniform float uHeat;\nvec3 foundryFog') + `
varying vec3 vW; varying vec3 vN;
void main() {
    vec3 col = vec3(0.04, 0.034, 0.03) + uGlow * 0.18 * max(0.0, -sign(vW.x) * vN.x);
    col *= 1.0 - 0.3 * gridAA(vW.y / 12.0, 1.0);
    // Hazard stripes at the foot
    col = mix(col, vec3(0.35, 0.22, 0.02) * step(0.5, fract((vW.y + vW.x) / 6.0)), step(vW.y, 12.0) * 0.8);
    gl_FragColor = vec4(foundryFog(col, vW, 100.0, 2200.0), 1.0);
}`, U);
            for (let i = 0; i < GANTRIES; i++) {
                const g = new THREE.Group();
                const beam = new THREE.Mesh(beamGeo, trussMat);
                beam.position.y = 104;
                const beam2 = beam.clone();
                beam2.rotation.x = Math.PI / 2;      // top chord plane, so it reads as a box truss from below
                beam2.position.y = 111;
                g.add(beam, beam2);
                for (const side of [-1, 1]) {
                    const p = new THREE.Mesh(pillarGeo, pillarMat);
                    p.position.x = side * 140;
                    g.add(p);
                }
                g.userData.z0 = -i * (GSPAN / GANTRIES) - 300;
                scene.add(g);
                gantries.push(g);
            }
            // Warning lamps on the gantries + smokestack rims: additive points
            const lampCount = GANTRIES * 2;
            const lampGeo = new THREE.BufferGeometry();
            lampGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(lampCount * 3), 3));
            lampGeo.setAttribute('aOn', new THREE.Float32BufferAttribute(new Float32Array(lampCount), 1));
            const lamps = new THREE.Points(lampGeo, B3D.mat(`
attribute float aOn;
varying float vD; varying float vOn;
void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vD = -mv.z; vOn = aOn;
    gl_PointSize = clamp(2200.0 / vD, 2.0, 60.0);
    gl_Position = projectionMatrix * mv;
}`, `
varying float vD; varying float vOn;
void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float a = exp(-r * r * 6.0) * vOn * (1.0 - smoothstep(400.0, 2000.0, vD));
    gl_FragColor = vec4(vec3(1.0, 0.12, 0.05) * a, 1.0);
}`, {}, { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
            B3D.always(blocks, lamps);
            scene.add(blocks, lamps);

            // Smokestacks ahead with glowing rims and rising smoke
            const stackMat = B3D.mat(B3D.VS_WORLD, FOG.replace('vec3 foundryFog', 'uniform vec3 uFog; uniform vec3 uGlow; uniform float uHeat;\nvec3 foundryFog') + `
varying vec3 vW; varying vec3 vN; varying vec2 vUv;
void main() {
    vec3 col = vec3(0.03, 0.024, 0.022);
    col *= 1.0 - 0.4 * gridAA(vW.y / 30.0, 1.0);
    col += uGlow * (0.8 + 0.6 * uHeat) * smoothstep(0.96, 1.0, vUv.y);
    col += uGlow * 0.05 * (1.0 - vUv.y);
    gl_FragColor = vec4(foundryFog(col, vW, 400.0, 4200.0), 1.0);
}`, U);
            const smokeMat = B3D.mat(B3D.VS_WORLD, `
uniform float uTime; uniform vec3 uGlow; uniform float uHeat;
varying vec2 vUv; varying float vSeed;
void main() {
    vec2 q = vUv;
    float n = fbm3(vec2(q.x * 3.0 + vSeed * 10.0, q.y * 2.5 - uTime * 0.35));
    float shape = smoothstep(0.5, 0.0, abs(q.x - 0.5 - (q.y * q.y) * 0.25)) * smoothstep(0.0, 0.15, q.y) * smoothstep(1.0, 0.4, q.y);
    float a = smoothstep(0.35, 0.75, n) * shape;
    vec3 col = mix(uGlow * (0.35 + 0.3 * uHeat), vec3(0.06, 0.04, 0.035), smoothstep(0.0, 0.5, q.y));
    gl_FragColor = vec4(col, a * 0.75);
}`, U, { transparent: true, depthWrite: false, side: THREE.DoubleSide });
            const stackGeo = new THREE.CylinderGeometry(1, 1.25, 1, 20, 1, true);
            stackGeo.translate(0, 0.5, 0);
            const smokeGeo = new THREE.PlaneGeometry(1, 1);
            smokeGeo.translate(0, 0.5, 0);
            for (let i = 0; i < 9; i++) {
                const side = i % 2 ? 1 : -1;
                const x = side * (180 + rnd() * 520), z = -1500 - rnd() * 900, h = 260 + rnd() * 380, r = 18 + rnd() * 16;
                const st = new THREE.Mesh(stackGeo, stackMat);
                st.scale.set(r, h, r);
                st.position.set(x, 0, z);
                const sm = new THREE.InstancedMesh(smokeGeo, smokeMat, 1);
                m4.compose(pos.set(x, h - 10, z), quat, scl.set(r * 8, r * 16, 1));
                sm.setMatrixAt(0, m4);
                scene.add(st, sm);
            }

            // Embers: sparks drifting up from the channel
            const EMBERS = 500;
            const eGeo = new THREE.BufferGeometry();
            const ePos = new Float32Array(EMBERS * 3), eSeed = new Float32Array(EMBERS);
            for (let i = 0; i < EMBERS; i++) {
                ePos.set([(rnd() - 0.5) * 260, rnd() * 160, -rnd() * 1600], i * 3);
                eSeed[i] = rnd();
            }
            eGeo.setAttribute('position', new THREE.Float32BufferAttribute(ePos, 3));
            eGeo.setAttribute('aSeed', new THREE.Float32BufferAttribute(eSeed, 1));
            const embers = new THREE.Points(eGeo, B3D.mat(`
uniform float uTime; uniform float uScroll;
attribute float aSeed;
varying float vA;
void main() {
    vec3 p = position;
    float life = fract(uTime * (0.15 + aSeed * 0.2) + aSeed);
    p.y = mod(position.y + uTime * (12.0 + aSeed * 22.0), 170.0);
    p.x += sin(uTime * (0.8 + aSeed) + aSeed * 30.0) * 8.0;
    p.z = mod(position.z + uScroll, 1600.0) - 1580.0;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vA = (1.0 - life) * smoothstep(0.0, 20.0, p.y) * (1.0 - smoothstep(600.0, 1500.0, -mv.z));
    gl_PointSize = clamp(420.0 / -mv.z, 1.5, 6.0);
    gl_Position = projectionMatrix * mv;
}`, `
uniform vec3 uGlow;
varying float vA;
void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    gl_FragColor = vec4(mix(uGlow, vec3(1.0, 0.85, 0.4), 0.4) * vA * smoothstep(1.0, 0.2, r), 1.0);
}`, U, { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
            B3D.always(embers);
            scene.add(embers);

            const SPEED = 80;
            const glowBase = B3D.col(0xff5a10), glowBoss = B3D.col(0xff2008);
            return {
                scene, camera,
                update(s) {
                    const scroll = s.t * SPEED;
                    U.uTime.value = s.t;
                    U.uScroll.value = scroll;
                    U.uBoss.value = s.boss;
                    U.uHeat.value = Math.min(1, s.pulse + s.boss * 0.6);
                    B3D.lerpColor(U.uGlow.value, glowBase, glowBoss, s.boss * 0.6);
                    for (let i = 0; i < blockDefs.length; i++) {
                        const b = blockDefs[i];
                        const z = ((b.z0 + scroll) % BSPAN + BSPAN) % BSPAN - BSPAN + 60;
                        m4.compose(pos.set(b.x, 0, z), quat, scl.set(b.w, b.h, b.d));
                        blocks.setMatrixAt(i, m4);
                    }
                    blocks.instanceMatrix.needsUpdate = true;
                    const lp = lampGeo.attributes.position.array, lo = lampGeo.attributes.aOn.array;
                    for (let i = 0; i < GANTRIES; i++) {
                        const g = gantries[i];
                        g.position.z = ((g.userData.z0 + scroll) % GSPAN + GSPAN) % GSPAN - GSPAN + 80;
                        const blink = Math.sin(s.t * 4 + i) > 0 ? 1 : 0.15;
                        for (let side = 0; side < 2; side++) {
                            lp.set([side ? 140 : -140, 114, g.position.z], (i * 2 + side) * 3);
                            lo[i * 2 + side] = blink;
                        }
                    }
                    lampGeo.attributes.position.needsUpdate = true;
                    lampGeo.attributes.aOn.needsUpdate = true;
                },
            };
        },
    },
};
