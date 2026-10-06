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
};
