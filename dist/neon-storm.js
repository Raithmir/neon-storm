
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

            // --- Shared glow texture for native Pixi particles ---
            this.glowTex = this._createGlowTexture(64);

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
            this.gameLayer.addChild(this.gameSprite);       // 1. Game canvas (sky + all Canvas 2D)
            this._initStarLayers();                         // 2-3. GPU star tiles
            this.gameLayer.addChild(this._glowSprite);      // 4. Blurred glow bloom
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

            // --- pixi-filters effects (guarded — no-ops if PIXIFilters not loaded) ---
            this._initShockwaveFilter();
            this._initGodrayFilter();
            this._initGlitchFilter();

            // --- Laser beam MeshRope ---
            this._initLaserBeam();

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

    // Convert the glow canvas into a PIXI.Texture for ParticleContainer use
    _createGlowTexture(size) {
        const canvas = this._createGlowImage(size);
        const src = new PIXI.CanvasSource({ resource: canvas, width: size, height: size });
        return new PIXI.Texture(src);
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

    _initShockwaveFilter() {
        if (typeof PIXIFilters === 'undefined') return;
        try {
            this._shockwaveFilter = new PIXIFilters.ShockwaveFilter({
                center: [0.5, 0.5],
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
        if (typeof PIXIFilters === 'undefined') return;
        try {
            this._godrayFilter = new PIXIFilters.GodrayFilter({
                angle: 30,
                gain: 0.55,
                lacunarity: 2.5,
                time: 0,
                parallel: false,
                x: 0.5,
                y: 0.0,
                alpha: 0,
            });
            this._godrayFilter.enabled = false;
        } catch (e) {
            console.warn('[Renderer] GodrayFilter unavailable:', e);
        }
    },

    _initGlitchFilter() {
        if (typeof PIXIFilters === 'undefined') return;
        try {
            this._glitchFilter = new PIXIFilters.GlitchFilter({
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

    // --- Frame lifecycle ---

    getPlayCtx() { return this.offCtx; },

    beginFrame() {
        this.offCtx.clearRect(0, 0, PLAY_W, PLAY_H);
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
            this._chromaFilter.resources.chromaUniforms.uniforms.uOffset = offset;
        }

        // Screen flash
        if (this._flashTimer > 0) {
            this._flashTimer -= dt;
            const t = Math.max(0, this._flashTimer / this._flashDuration);
            this._flashSprite.alpha = t * 0.8;
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
            e.sprite.alpha = 1 - t;
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
            this._canvasSource.update();
            this._glowCanvasSource.update();
            this.app.renderer.render(this.app.stage);
        } else {
            const c = this.compCtx;
            c.clearRect(0, 0, PLAY_W, PLAY_H);
            c.globalCompositeOperation = 'source-over';
            c.drawImage(this.offCanvas, 0, 0);
            c.globalCompositeOperation = 'lighter';
            c.drawImage(this.glowCanvas, 0, 0);
            c.globalCompositeOperation = 'source-over';
        }
    },

    // Canvas 2D fallback only — blits compCanvas onto the overlay
    blitToOverlay(targetCtx, x, y) {
        targetCtx.drawImage(this.compCanvas, x, y);
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
        s.alpha = 1.0;
        s.scale.set(0.05);
        s.blendMode = 'add';
        this._explosionLayer.addChild(s);
        this._explosionSprites.push({ sprite: s, maxScale: maxScale || 3, duration: duration || 0.5, elapsed: 0 });
    },

    // --- Screen-space effects ---

    triggerChroma(intensity, duration) {
        if (!this._chromaFilter) return;
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
        if (!this.usePixi) return;
        this._flashColor = color || 0xffffff;
        this._flashDuration = duration || 0.3;
        this._flashTimer = this._flashDuration;
        this._flashSprite.alpha = 0.8;
        this._flashSprite.tint = this._flashColor;
    },

    setCRT(enabled) {
        this._crtEnabled = enabled;
        this._rebuildFilterChain();
    },

    // --- Game-space effects ---

    // Shockwave ripple expanding from a normalised position (0-1 range)
    triggerShockwave(normX, normY) {
        if (!this._shockwaveFilter) return;
        this._shockwaveFilter.center = [normX, normY];
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
        if (!this._glitchFilter) return;
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
        ctx.fillStyle = '#ffff00';
        ctx.font = 'bold 18px Share Tech Mono, Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('NEW HIGH SCORE!', x, y);

        ctx.fillStyle = '#aaaaaa';
        ctx.font = '14px Share Tech Mono, Consolas, monospace';
        ctx.fillText('ENTER YOUR INITIALS', x, y + 25);

        for (let i = 0; i < 3; i++) {
            const cx = x - 30 + i * 30;
            const selected = i === this.initialCursor;
            ctx.fillStyle = selected ? '#00ffff' : '#888888';
            ctx.shadowColor = selected ? '#00ffff' : 'transparent';
            ctx.shadowBlur = selected ? 10 : 0;
            ctx.font = 'bold 32px Share Tech Mono, Consolas, monospace';
            ctx.fillText(this.currentInitials[i], cx, y + 65);
            if (selected) {
                ctx.fillStyle = '#00ffff';
                ctx.fillText('▲', cx, y + 42);
                ctx.fillText('▼', cx, y + 82);
            }
        }
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#778899';
        ctx.font = '13px Share Tech Mono, Consolas, monospace';
        ctx.fillText('↑↓ CHANGE  ←→ MOVE  ENTER CONFIRM', x, y + 105);
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
        flashReduction: false,
        fireMode: 'manual',     // 'auto', 'manual'
        colorblind: false,
    },
    menuOpen: false,
    selectedIndex: 0,
    items: [
        { key: 'sfxVolume', label: 'SFX VOLUME', type: 'slider', min: 0, max: 100, step: 10 },
        { key: 'musicVolume', label: 'MUSIC VOLUME', type: 'slider', min: 0, max: 100, step: 10 },
        { key: 'screenShake', label: 'SCREEN SHAKE', type: 'cycle', options: ['off', 'low', 'high'] },
        { key: 'particleDensity', label: 'PARTICLES', type: 'cycle', options: ['low', 'medium', 'high'] },
        { key: 'showHitbox', label: 'SHOW HITBOX', type: 'toggle' },
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
        const grad = ctx.createLinearGradient(0, 0, 0, SCREEN_H);
        grad.addColorStop(0, '#0a0620');
        grad.addColorStop(1, '#1a0a3e');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

        ctx.fillStyle = '#00ffff';
        ctx.font = 'bold 36px Share Tech Mono, Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 10;
        ctx.fillText('SETTINGS', SCREEN_W / 2, 120);
        ctx.shadowBlur = 0;

        const startY = 220;
        for (let i = 0; i < this.items.length; i++) {
            const item = this.items[i];
            const y = startY + i * 55;
            const selected = i === this.selectedIndex;

            // Label (skip for action items — they draw their own centered label)
            if (item.type !== 'action') {
                ctx.fillStyle = selected ? '#ffffff' : '#667788';
                ctx.font = selected ? 'bold 16px Share Tech Mono, Consolas, monospace' : '14px Share Tech Mono, Consolas, monospace';
                ctx.textAlign = 'right';
                ctx.fillText(item.label, SCREEN_W / 2 - 20, y);
            }

            // Value
            ctx.textAlign = 'left';
            ctx.fillStyle = selected ? '#00ffff' : '#888888';
            ctx.font = selected ? 'bold 16px Share Tech Mono, Consolas, monospace' : '14px Share Tech Mono, Consolas, monospace';

            if (item.type === 'slider') {
                const val = this.values[item.key];
                const barW = 150;
                const barH = 8;
                const barX = SCREEN_W / 2 + 20;
                ctx.fillStyle = '#222233';
                ctx.fillRect(barX, y - barH / 2 - 2, barW, barH);
                ctx.fillStyle = selected ? '#00ffff' : '#667788';
                ctx.fillRect(barX, y - barH / 2 - 2, barW * (val / item.max), barH);
                ctx.fillStyle = selected ? '#ffffff' : '#aaaaaa';
                ctx.fillText(val + '%', barX + barW + 15, y);
                if (selected) {
                    ctx.fillStyle = '#00ffff';
                    ctx.fillText('◂', barX - 15, y);
                    ctx.fillText('▸', barX + barW + 55, y);
                }
            } else if (item.type === 'cycle') {
                const val = this.values[item.key].toUpperCase();
                ctx.fillText(selected ? '◂ ' + val + ' ▸' : val, SCREEN_W / 2 + 20, y);
            } else if (item.type === 'toggle') {
                const val = this.values[item.key];
                ctx.fillStyle = val ? '#00ff88' : '#ff4444';
                ctx.fillText(val ? 'ON' : 'OFF', SCREEN_W / 2 + 20, y);
            } else if (item.type === 'action') {
                ctx.textAlign = 'center';
                if (selected) {
                    ctx.fillStyle = '#00ffff';
                    ctx.font = 'bold 16px Share Tech Mono, Consolas, monospace';
                    ctx.fillText('▸ ' + item.label + ' ◂', SCREEN_W / 2, y);
                } else {
                    ctx.fillStyle = '#667788';
                    ctx.font = '14px Share Tech Mono, Consolas, monospace';
                    ctx.fillText(item.label, SCREEN_W / 2, y);
                }
            }
        }
        ctx.textAlign = 'center';
        ctx.fillStyle = '#667788';
        ctx.font = '13px Share Tech Mono, Consolas, monospace';
        ctx.fillText('↑↓ SELECT  ←→ ADJUST  ENTER CONFIRM  ESC BACK', SCREEN_W / 2, SCREEN_H - 50);
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
        const grad = ctx.createLinearGradient(0, 0, 0, SCREEN_H);
        grad.addColorStop(0, '#0a0620');
        grad.addColorStop(1, '#1a0a3e');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

        ctx.textAlign = 'center';
        ctx.fillStyle = '#00ffff';
        ctx.font = 'bold 32px Share Tech Mono, Consolas, monospace';
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 10;
        ctx.fillText('CONTROLS', SCREEN_W / 2, 80);
        ctx.shadowBlur = 0;

        // Column headers
        ctx.fillStyle = '#667788';
        ctx.font = '13px Share Tech Mono, Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('ACTION', SCREEN_W / 2 - 200, 130);
        ctx.fillText('KEYBOARD', SCREEN_W / 2, 130);
        ctx.fillText('GAMEPAD', SCREEN_W / 2 + 200, 130);

        // Separator line
        ctx.strokeStyle = '#333355';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(SCREEN_W / 2 - 320, 140);
        ctx.lineTo(SCREEN_W / 2 + 320, 140);
        ctx.stroke();

        const items = this.getItems();
        const startY = 170;
        const lineH = 40;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const y = startY + i * lineH;
            const selected = i === this.selectedIndex;
            const isAction = item.action === 'back' || item.action === 'reset';

            if (isAction) {
                ctx.textAlign = 'center';
                ctx.fillStyle = selected ? (item.action === 'reset' ? '#ffaa00' : '#00ffff') : '#667788';
                ctx.font = selected ? 'bold 16px Share Tech Mono, Consolas, monospace' : '14px Share Tech Mono, Consolas, monospace';
                ctx.fillText(selected ? '▸ ' + item.label + ' ◂' : item.label, SCREEN_W / 2, y);
                continue;
            }

            // Selection highlight
            if (selected) {
                ctx.strokeStyle = '#00ffff';
                ctx.shadowColor = '#00ffff';
                ctx.shadowBlur = 6;
                ctx.lineWidth = 1;
                ctx.strokeRect(SCREEN_W / 2 - 320, y - 15, 640, 32);
                ctx.shadowBlur = 0;
            }

            // Action name
            ctx.textAlign = 'center';
            ctx.fillStyle = selected ? '#ffffff' : '#99aabb';
            ctx.font = selected ? 'bold 15px Share Tech Mono, Consolas, monospace' : '14px Share Tech Mono, Consolas, monospace';
            ctx.fillText(item.label, SCREEN_W / 2 - 200, y);

            // Keyboard binding
            const isListeningKey = this.mode === 'rebind_key' && selected;
            ctx.fillStyle = isListeningKey ? '#ffff00' : (selected ? '#00ffff' : '#888888');
            ctx.font = '14px Share Tech Mono, Consolas, monospace';
            ctx.fillText(isListeningKey ? '[ PRESS A KEY ]' : Input.getKeyBindDisplay(item.action), SCREEN_W / 2, y);

            // Gamepad binding
            const isListeningBtn = this.mode === 'rebind_button' && selected;
            ctx.fillStyle = isListeningBtn ? '#ffff00' : (selected ? '#00ffff' : '#888888');
            ctx.fillText(isListeningBtn ? '[ PRESS BUTTON ]' : Input.getGpBindDisplay(item.action), SCREEN_W / 2 + 200, y);
        }

        // Instructions
        ctx.textAlign = 'center';
        ctx.fillStyle = '#667788';
        ctx.font = '13px Share Tech Mono, Consolas, monospace';
        if (this.mode === 'rebind_key') {
            ctx.fillStyle = '#ffff00';
            ctx.fillText('Press any key to bind, or ESC to cancel', SCREEN_W / 2, SCREEN_H - 80);
        } else if (this.mode === 'rebind_button') {
            ctx.fillStyle = '#ffff00';
            ctx.fillText('Press any gamepad button to bind, or ESC to cancel', SCREEN_W / 2, SCREEN_H - 80);
        } else {
            ctx.fillText('ENTER/→ = Rebind keyboard    ← = Rebind gamepad (if connected)', SCREEN_W / 2, SCREEN_H - 80);
        }
        ctx.fillStyle = '#667788';
        ctx.fillText('ESC = Back', SCREEN_W / 2, SCREEN_H - 55);

        // Gamepad status
        ctx.fillStyle = Input.gamepadState ? '#00ff88' : '#667788';
        ctx.font = '12px Share Tech Mono, Consolas, monospace';
        ctx.fillText(Input.gamepadState ? 'GAMEPAD CONNECTED' : 'NO GAMEPAD DETECTED', SCREEN_W / 2, SCREEN_H - 30);
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
            ctx.fillStyle = '#aaaaaa';
            ctx.font = '14px Share Tech Mono, Consolas, monospace';
            ctx.textAlign = 'right';
            ctx.fillText(b.label, x - 10, y);
            ctx.textAlign = 'left';
            ctx.fillStyle = '#00ff88';
            ctx.fillText('+' + b.value.toLocaleString(), x + 10, y);
            y += 22;
        }
        if (this.bonuses.length > 0) {
            y += 5;
            ctx.textAlign = 'center';
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 16px Share Tech Mono, Consolas, monospace';
            ctx.fillText('TOTAL BONUS: +' + this.totalBonus.toLocaleString(), x, y);
        }
        ctx.textAlign = 'center';
        return y + 10;
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

// === particles.js ===
// ============================================================
//  PARTICLE SYSTEM
// ============================================================
const Particles = {
    particles: [],
    shockwaves: [], // Expanding ring effects
    maxParticles: 3000,

    spawn(x, y, count, opts = {}) {
        const densityScale = { low: 0.3, medium: 0.6, high: 1.0 };
        const scale = densityScale[Settings.values.particleDensity] || 1.0;
        const actualCount = Math.min(Math.max(1, Math.round(count * scale)), this.maxParticles - this.particles.length);
        if (actualCount <= 0) return;
        for (let i = 0; i < actualCount; i++) {
            const angle = opts.angle !== undefined ? opts.angle + (Math.random() - 0.5) * (opts.spread || Math.PI * 2) : Math.random() * Math.PI * 2;
            const speed = (opts.speed || 100) * (0.5 + Math.random());
            const life = opts.life || (0.3 + Math.random() * 0.5);
            const size = opts.size || (1 + Math.random() * 2);
            const p = {
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life, maxLife: life, size,
                color: opts.color || '#00ffff',
                decay: opts.decay || 1,
                _pp: null, // Pixi Particle
            };
            if (Renderer.usePixi && Renderer.particleLayer && Renderer.glowTex) {
                const s = (size * 2) / 32;
                p._pp = new PIXI.Particle({
                    texture: Renderer.glowTex,
                    x, y,
                    scaleX: s, scaleY: s,
                    anchorX: 0.5, anchorY: 0.5,
                    tint: Renderer.colorToHex(p.color),
                    alpha: 0.85,
                });
                Renderer.particleLayer.addParticle(p._pp);
            }
            this.particles.push(p);
        }
    },

    // Multi-layer explosion: shockwave + particle bursts + GPU fireball + addGlow
    spawnExplosion(x, y, opts = {}) {
        const style = opts.style || 'medium';
        const color  = opts.color  || '#ff8800';
        const color2 = opts.color2 || '#ffffff';
        const styles = {
            small:  { shock: 40,  core: 15, coreSpd: 120, coreLife: 0.4, coreSize: 1.5, spark: 8,  sparkSpd: 80,  sparkLife: 0.6, sparkSize: 2,   fScale: 1.2, fDur: 0.35 },
            medium: { shock: 70,  core: 30, coreSpd: 200, coreLife: 0.6, coreSize: 2.5, spark: 18, sparkSpd: 140, sparkLife: 0.9, sparkSize: 3,   fScale: 2.2, fDur: 0.45 },
            large:  { shock: 110, core: 55, coreSpd: 280, coreLife: 0.8, coreSize: 3.5, spark: 28, sparkSpd: 200, sparkLife: 1.2, sparkSize: 4,   fScale: 3.5, fDur: 0.55 },
            mega:   { shock: 160, core: 80, coreSpd: 370, coreLife: 1.0, coreSize: 5,   spark: 45, sparkSpd: 280, sparkLife: 1.5, sparkSize: 6,   fScale: 5.5, fDur: 0.65 },
        };
        const s = styles[style] || styles.medium;
        this.spawnShockwave(x, y, color, s.shock, 0.4);
        this.spawn(x, y, s.core,  { color: color2, speed: s.coreSpd,  life: s.coreLife,  size: s.coreSize  });
        this.spawn(x, y, s.spark, { color: color,  speed: s.sparkSpd, life: s.sparkLife, size: s.sparkSize });
        Renderer.addGlow(x, y, Renderer.colorToHex(color2), s.shock * 0.9, 0.95);
        Renderer.spawnExplosionSprite(x, y, s.fScale, Renderer.colorToHex(color), s.fDur);
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

    update(dt) {
        const usePixi = Renderer.usePixi && Renderer.particleLayer;
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vx *= (1 - 0.5 * dt);
            p.vy *= (1 - 0.5 * dt);
            p.life -= dt * p.decay;
            if (p.life <= 0) {
                if (p._pp) { Renderer.particleLayer.removeParticle(p._pp); p._pp = null; }
                this.particles.splice(i, 1);
            } else if (usePixi && p._pp) {
                const t = p.life / p.maxLife;
                const currentSize = p.size * (0.3 + t * 0.7);
                const s = (currentSize * 2) / 32;
                p._pp.x = p.x;
                p._pp.y = p.y;
                p._pp.scaleX = s;
                p._pp.scaleY = s;
                p._pp.alpha = t * 0.9;
            }
        }
        // Update shockwaves
        for (let i = this.shockwaves.length - 1; i >= 0; i--) {
            const s = this.shockwaves[i];
            s.life -= dt;
            const t = 1 - s.life / s.maxLife; // 0→1 over lifetime
            s.radius = s.maxRadius * t;
            if (s.life <= 0) this.shockwaves.splice(i, 1);
        }
    },

    draw(ctx) {
        if (Renderer.usePixi) {
            // Pixi path: particles are rendered via particleLayer; just feed bloom
            for (const p of this.particles) {
                const t = p.life / p.maxLife;
                if (t > 0.4 && p.size >= 1.5) {
                    const currentSize = p.size * (0.3 + t * 0.7);
                    Renderer.addGlow(p.x, p.y, Renderer.colorToHex(p.color), currentSize * 9, t * 0.45);
                }
            }
        } else {
            // Canvas 2D fallback path
            const prevComposite = ctx.globalCompositeOperation;
            ctx.globalCompositeOperation = 'lighter';

            for (const p of this.particles) {
                const t = p.life / p.maxLife;
                const currentSize = p.size * (0.3 + t * 0.7);

                if (t > 0.4 && p.size >= 1.5) {
                    Renderer.addGlow(p.x, p.y, Renderer.colorToHex(p.color), currentSize * 8, t * 0.5);
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

        // Shockwave rings
        for (const s of this.shockwaves) {
            const t = 1 - s.life / s.maxLife;
            // GPU glow at shockwave centre
            Renderer.addGlow(s.x, s.y, Renderer.colorToHex(s.color), s.radius * 2.5, (1 - t) * 0.8);

            ctx.globalAlpha = (1 - t) * 0.6;
            ctx.strokeStyle = s.color;
            ctx.lineWidth = 2 * (1 - t) + 0.5;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
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
    constructor(maxSize = 500) {
        this.pool = [];
        this.maxSize = maxSize;
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
            _p: null,   // Pixi outer glow Particle
            _pc: null,  // Pixi white-core Particle
        };
        if (Renderer.usePixi && Renderer.bulletLayer && Renderer.glowTex) {
            const hexColor = Renderer.colorToHex(bullet.color);
            const outerScale = (bullet.radius * 5) / 32;
            const coreScale  = (bullet.radius * 0.8) / 32;
            bullet._p = new PIXI.Particle({
                texture: Renderer.glowTex,
                x: bullet.x, y: bullet.y,
                scaleX: outerScale, scaleY: outerScale,
                anchorX: 0.5, anchorY: 0.5,
                tint: hexColor, alpha: 0.8,
            });
            bullet._pc = new PIXI.Particle({
                texture: Renderer.glowTex,
                x: bullet.x, y: bullet.y,
                scaleX: coreScale, scaleY: coreScale,
                anchorX: 0.5, anchorY: 0.5,
                tint: 0xffffff, alpha: 0.95,
            });
            Renderer.bulletLayer.addParticle(bullet._p);
            Renderer.bulletLayer.addParticle(bullet._pc);
        }
        this.pool.push(bullet);
        return bullet;
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
            if (b.x < -20 || b.x > PLAY_W + 20 || b.y < -20 || b.y > PLAY_H + 20 || b.life <= 0 || !b.active) {
                if (b._p)  { Renderer.bulletLayer.removeParticle(b._p);  b._p  = null; }
                if (b._pc) { Renderer.bulletLayer.removeParticle(b._pc); b._pc = null; }
                this.pool.splice(i, 1);
            } else if (b._p) {
                // Sync Pixi particle positions each frame
                const outerScale = (b.radius * 5) / 32;
                const coreScale  = (b.radius * 0.8) / 32;
                b._p.x = b.x;  b._p.y = b.y;
                b._p.scaleX = outerScale; b._p.scaleY = b.type === 'laser' ? outerScale * 3 : outerScale;
                b._pc.x = b.x; b._pc.y = b.y;
                b._pc.scaleX = coreScale; b._pc.scaleY = b.type === 'laser' ? coreScale * 3 : coreScale;
                // Telegraphed bullets stay faint until they become dangerous
                b._p.alpha = b.harmless > 0 ? 0.25 : 0.8;
                b._pc.alpha = b.harmless > 0 ? 0.2 : 0.95;
                if (b.type === 'homing') {
                    b._p.rotation = Math.atan2(b.vy, b.vx) + Math.PI / 2;
                }
            }
        }
    }

    draw(ctx) {
        // In Pixi mode the particles are synced in update(); only keep addGlow for bloom source
        if (Renderer.usePixi) {
            for (const b of this.pool) {
                Renderer.addGlow(b.x, b.y, Renderer.colorToHex(b.color), b.radius * 7, 0.5);
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
            for (const b of this.pool) {
                if (b._p)  Renderer.bulletLayer.removeParticle(b._p);
                if (b._pc) Renderer.bulletLayer.removeParticle(b._pc);
            }
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
            ctx.fillStyle = p.color;
            ctx.font = 'bold ' + Math.round(p.size * scale) + 'px Share Tech Mono, Consolas, monospace';
            ctx.textAlign = 'center';
            ctx.fillText(p.text, p.x, p.y);
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
    enemyBullets: new BulletPool(800),

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
        // Impact spark burst at hit point
        Particles.spawn(enemy.x, enemy.y, 5, { color: '#ffffff', speed: 120, life: 0.15, size: 2 });
        // GPU glow flash
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
        Particles.spawnExplosion(enemy.x, enemy.y, {
            style: isBig ? 'large' : 'medium',
            color: explColor,
            color2: '#ffffff',
        });
        // Extra accent-coloured sparks for visual variety
        Particles.spawn(enemy.x, enemy.y, isBig ? 20 : 10, { color: accent, speed: 180, life: 0.7, size: 3 });
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
            const glitchFlash = isGlitchLevel && Math.random() < 0.02;
            if (e.flashTimer > 0 || glitchFlash) {
                ctx.fillStyle = glitchFlash ? '#ff00ff' : '#ffffff';
            } else {
                ctx.fillStyle = e.color;
            }

            // Draw based on type
            const r = e.radius;
            const flash = e.flashTimer > 0 || glitchFlash;
            const accent = flash ? '#ffffff' : e.accent;
            switch (e.type) {
                case 'scout_drone':
                    // Small quad-rotor drone with propeller arms
                    ctx.beginPath();
                    ctx.moveTo(0, -r * 0.6);
                    ctx.lineTo(r * 0.3, -r * 0.2);
                    ctx.lineTo(r * 0.3, r * 0.3);
                    ctx.lineTo(0, r * 0.5);
                    ctx.lineTo(-r * 0.3, r * 0.3);
                    ctx.lineTo(-r * 0.3, -r * 0.2);
                    ctx.closePath();
                    ctx.fill();
                    // Rotor arms
                    ctx.strokeStyle = accent;
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.moveTo(-r * 0.7, -r * 0.3); ctx.lineTo(r * 0.7, -r * 0.3);
                    ctx.stroke();
                    // Rotor circles
                    ctx.lineWidth = 1;
                    ctx.globalAlpha = 0.4;
                    ctx.beginPath(); ctx.arc(-r * 0.7, -r * 0.3, r * 0.3, 0, Math.PI * 2); ctx.stroke();
                    ctx.beginPath(); ctx.arc(r * 0.7, -r * 0.3, r * 0.3, 0, Math.PI * 2); ctx.stroke();
                    ctx.globalAlpha = 1;
                    // Eye/sensor
                    ctx.fillStyle = '#ff4444';
                    ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI * 2); ctx.fill();
                    break;

                case 'gunship':
                    // Attack helicopter — wide body, stub wings, cannon
                    ctx.beginPath();
                    ctx.moveTo(0, -r * 0.8);        // Nose
                    ctx.lineTo(r * 0.4, -r * 0.3);
                    ctx.lineTo(r * 0.9, 0);          // Right wing
                    ctx.lineTo(r * 0.85, r * 0.2);
                    ctx.lineTo(r * 0.4, r * 0.1);
                    ctx.lineTo(r * 0.35, r * 0.6);  // Right tail
                    ctx.lineTo(r * 0.6, r * 0.8);   // Right stabiliser
                    ctx.lineTo(r * 0.3, r * 0.7);
                    ctx.lineTo(-r * 0.3, r * 0.7);
                    ctx.lineTo(-r * 0.6, r * 0.8);  // Left stabiliser
                    ctx.lineTo(-r * 0.35, r * 0.6);
                    ctx.lineTo(-r * 0.4, r * 0.1);
                    ctx.lineTo(-r * 0.85, r * 0.2);
                    ctx.lineTo(-r * 0.9, 0);         // Left wing
                    ctx.lineTo(-r * 0.4, -r * 0.3);
                    ctx.closePath();
                    ctx.fill();
                    ctx.strokeStyle = accent; ctx.lineWidth = 1; ctx.stroke();
                    // Under-nose cannon
                    ctx.fillStyle = accent;
                    ctx.fillRect(-2, r * 0.7, 4, r * 0.25);
                    // Cockpit
                    ctx.fillStyle = flash ? '#ffffff' : '#442200';
                    ctx.beginPath(); ctx.ellipse(0, -r * 0.4, r * 0.15, r * 0.2, 0, 0, Math.PI * 2); ctx.fill();
                    break;

                case 'missile_turret':
                    // Rotating turret platform — base + barrel
                    // Base platform
                    ctx.beginPath();
                    ctx.moveTo(-r * 0.8, -r * 0.4);
                    ctx.lineTo(r * 0.8, -r * 0.4);
                    ctx.lineTo(r * 0.6, r * 0.4);
                    ctx.lineTo(-r * 0.6, r * 0.4);
                    ctx.closePath();
                    ctx.fill();
                    ctx.strokeStyle = accent; ctx.lineWidth = 1.5; ctx.stroke();
                    // Turret dome
                    ctx.beginPath(); ctx.arc(0, -r * 0.1, r * 0.35, Math.PI, 0); ctx.fill();
                    // Barrel
                    ctx.fillStyle = accent;
                    ctx.fillRect(-2.5, r * 0.2, 5, r * 0.6);
                    // Barrel tip
                    ctx.fillRect(-4, r * 0.75, 8, 3);
                    // Side mounting brackets
                    ctx.fillRect(-r * 0.7, -r * 0.15, r * 0.2, r * 0.3);
                    ctx.fillRect(r * 0.5, -r * 0.15, r * 0.2, r * 0.3);
                    break;

                case 'phase_shifter':
                    // Alien crystal / energy form — rotating prism
                    ctx.rotate(e.moveTimer * 2);
                    // Outer prism
                    ctx.beginPath();
                    for (let j = 0; j < 5; j++) {
                        const a = (Math.PI * 2 / 5) * j - Math.PI / 2;
                        const pr = j % 2 === 0 ? r : r * 0.5;
                        ctx.lineTo(Math.cos(a) * pr, Math.sin(a) * pr);
                    }
                    ctx.closePath();
                    ctx.fill();
                    ctx.strokeStyle = '#ff88ff'; ctx.lineWidth = 1.5; ctx.stroke();
                    // Inner energy core
                    ctx.fillStyle = flash ? '#ffffff' : '#ffffff';
                    ctx.globalAlpha = 0.5 + Math.sin(e.moveTimer * 5) * 0.3;
                    ctx.beginPath(); ctx.arc(0, 0, r * 0.25, 0, Math.PI * 2); ctx.fill();
                    ctx.globalAlpha = 1;
                    break;

                case 'shielded_cruiser':
                    // Heavy cruiser — wide wedge with armoured plates
                    ctx.beginPath();
                    ctx.moveTo(0, -r * 0.7);
                    ctx.lineTo(r * 0.5, -r * 0.5);
                    ctx.lineTo(r * 0.8, -r * 0.1);
                    ctx.lineTo(r * 0.7, r * 0.5);
                    ctx.lineTo(r * 0.3, r * 0.7);
                    ctx.lineTo(-r * 0.3, r * 0.7);
                    ctx.lineTo(-r * 0.7, r * 0.5);
                    ctx.lineTo(-r * 0.8, -r * 0.1);
                    ctx.lineTo(-r * 0.5, -r * 0.5);
                    ctx.closePath();
                    ctx.fill();
                    ctx.strokeStyle = accent; ctx.lineWidth = 1.5; ctx.stroke();
                    // Armour plate lines
                    ctx.strokeStyle = flash ? '#fff' : '#663399';
                    ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.moveTo(-r * 0.6, 0); ctx.lineTo(r * 0.6, 0); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(-r * 0.4, r * 0.35); ctx.lineTo(r * 0.4, r * 0.35); ctx.stroke();
                    // Bridge
                    ctx.fillStyle = flash ? '#ffffff' : '#220044';
                    ctx.beginPath(); ctx.ellipse(0, -r * 0.3, r * 0.2, r * 0.12, 0, 0, Math.PI * 2); ctx.fill();
                    // Shield arc
                    if (e.shieldHp > 0) {
                        ctx.strokeStyle = `rgba(68, 136, 255, ${0.5 + Math.sin(e.moveTimer * 5) * 0.3})`;
                        ctx.lineWidth = 3; 
                        ctx.beginPath(); ctx.arc(0, 0, r + 6, e.shieldAngle, e.shieldAngle + Math.PI); ctx.stroke();
                        
                    }
                    break;

                case 'bomber':
                    // Heavy bomber — wide fuselage, bomb bay doors
                    ctx.beginPath();
                    ctx.moveTo(0, -r * 0.5);
                    ctx.lineTo(r * 0.4, -r * 0.4);
                    ctx.lineTo(r * 0.9, -r * 0.1);   // Right wing
                    ctx.lineTo(r * 0.8, r * 0.2);
                    ctx.lineTo(r * 0.4, r * 0.3);
                    ctx.lineTo(r * 0.35, r * 0.6);
                    ctx.lineTo(-r * 0.35, r * 0.6);
                    ctx.lineTo(-r * 0.4, r * 0.3);
                    ctx.lineTo(-r * 0.8, r * 0.2);
                    ctx.lineTo(-r * 0.9, -r * 0.1);  // Left wing
                    ctx.lineTo(-r * 0.4, -r * 0.4);
                    ctx.closePath();
                    ctx.fill();
                    ctx.strokeStyle = accent; ctx.lineWidth = 1; ctx.stroke();
                    // Bomb bay doors (open/close animation)
                    ctx.fillStyle = flash ? '#ffffff' : '#661100';
                    const bayOpen = Math.sin(e.moveTimer * 2) * 0.3;
                    ctx.fillRect(-r * 0.25, r * 0.2, r * 0.2 - bayOpen * 5, r * 0.35);
                    ctx.fillRect(bayOpen * 5 + r * 0.05, r * 0.2, r * 0.2 - bayOpen * 5, r * 0.35);
                    // Engines
                    ctx.fillStyle = '#ff4400';
                    ctx.globalAlpha = 0.6;
                    ctx.fillRect(-r * 0.3, r * 0.55, 5, 4 + Math.random() * 3);
                    ctx.fillRect(r * 0.15, r * 0.55, 5, 4 + Math.random() * 3);
                    ctx.globalAlpha = 1;
                    break;

                case 'sniper':
                    // Long-barrelled sniper platform
                    // Body
                    ctx.beginPath();
                    ctx.moveTo(-r * 0.5, -r * 0.3);
                    ctx.lineTo(r * 0.5, -r * 0.3);
                    ctx.lineTo(r * 0.4, r * 0.3);
                    ctx.lineTo(-r * 0.4, r * 0.3);
                    ctx.closePath();
                    ctx.fill();
                    ctx.strokeStyle = accent; ctx.lineWidth = 1; ctx.stroke();
                    // Long barrel
                    ctx.fillStyle = accent;
                    ctx.fillRect(-1.5, r * 0.2, 3, r * 0.8);
                    // Scope lens
                    ctx.fillStyle = flash ? '#ffffff' : '#ffff00';
                    
                    ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
                    
                    // Targeting laser preview
                    if (e.fireTimer < 0.8) {
                        const laserAlpha = 0.1 + (0.8 - e.fireTimer) * 0.4;
                        ctx.strokeStyle = `rgba(255, 255, 0, ${laserAlpha})`;
                        ctx.lineWidth = e.fireTimer < 0.3 ? 2 : 1;
                        ctx.beginPath(); ctx.moveTo(0, 0);
                        ctx.lineTo(Math.cos(e.aimAngle) * 300, Math.sin(e.aimAngle) * 300);
                        ctx.stroke();
                    }
                    break;

                case 'carrier':
                    // Large mothership with hangar bay
                    ctx.beginPath();
                    ctx.moveTo(0, -r * 0.6);
                    ctx.lineTo(r * 0.6, -r * 0.4);
                    ctx.lineTo(r * 0.9, 0);
                    ctx.lineTo(r * 0.8, r * 0.5);
                    ctx.lineTo(r * 0.4, r * 0.7);
                    ctx.lineTo(-r * 0.4, r * 0.7);
                    ctx.lineTo(-r * 0.8, r * 0.5);
                    ctx.lineTo(-r * 0.9, 0);
                    ctx.lineTo(-r * 0.6, -r * 0.4);
                    ctx.closePath();
                    ctx.fill();
                    ctx.strokeStyle = accent; ctx.lineWidth = 1.5; ctx.stroke();
                    // Hangar bay opening
                    ctx.fillStyle = flash ? '#ffffff' : '#220800';
                    ctx.beginPath();
                    ctx.moveTo(-r * 0.25, r * 0.3);
                    ctx.lineTo(r * 0.25, r * 0.3);
                    ctx.lineTo(r * 0.2, r * 0.65);
                    ctx.lineTo(-r * 0.2, r * 0.65);
                    ctx.closePath();
                    ctx.fill();
                    // Hangar bay lights
                    ctx.fillStyle = '#ff8800';
                    ctx.globalAlpha = 0.4 + Math.sin(e.moveTimer * 3) * 0.3;
                    ctx.fillRect(-r * 0.15, r * 0.55, r * 0.3, 2);
                    ctx.globalAlpha = 1;
                    // Bridge windows
                    ctx.fillStyle = flash ? '#ffffff' : '#884400';
                    ctx.fillRect(-r * 0.15, -r * 0.45, r * 0.3, r * 0.1);
                    break;

                case 'shield_wall':
                    // Energy shield panel — thin, wide, with energy field
                    ctx.fillRect(-r, -r * 0.3, r * 2, r * 0.6);
                    // Energy field effect
                    ctx.fillStyle = `rgba(68, 136, 255, ${0.3 + Math.sin(e.moveTimer * 6) * 0.15})`;
                    ctx.fillRect(-r * 0.9, -r * 0.25, r * 1.8, r * 0.5);
                    // Border frame
                    ctx.strokeStyle = accent;
                    ctx.lineWidth = 2;
                    ctx.strokeRect(-r, -r * 0.3, r * 2, r * 0.6);
                    // Corner nodes
                    ctx.fillStyle = '#ffffff';
                    ctx.globalAlpha = 0.7;
                    ctx.beginPath(); ctx.arc(-r, -r * 0.3, 2.5, 0, Math.PI * 2); ctx.fill();
                    ctx.beginPath(); ctx.arc(r, -r * 0.3, 2.5, 0, Math.PI * 2); ctx.fill();
                    ctx.beginPath(); ctx.arc(-r, r * 0.3, 2.5, 0, Math.PI * 2); ctx.fill();
                    ctx.beginPath(); ctx.arc(r, r * 0.3, 2.5, 0, Math.PI * 2); ctx.fill();
                    ctx.globalAlpha = 1;
                    break;

                default:
                    if (e.midboss) {
                        MidBoss.draw(ctx, e, flash);
                        break;
                    }
                    // Fallback circle
                    ctx.beginPath();
                    ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
                    ctx.fill();
                    break;
            }

            // HP bar for tough enemies (mid-bosses use the top-of-screen bar)
            if (e.maxHp > 2 && !e.midboss) {
                const barW = e.radius * 2;
                const barH = 3;
                const barY = -e.radius - 8;
                ctx.fillStyle = '#330000';
                ctx.fillRect(-barW / 2, barY, barW, barH);
                const hpPct = (e.hp + Math.max(0, e.shieldHp)) / (e.maxHp + e.maxShieldHp);
                ctx.fillStyle = e.shieldHp > 0 ? '#4488ff' : '#ff4444';
                ctx.fillRect(-barW / 2, barY, barW * hpPct, barH);
            }

            ctx.restore();
        }

        MidBoss.drawBar(ctx);

        // Apply colorblind override to enemy bullets before drawing
        if (Settings.values.colorblind) {
            for (const b of this.enemyBullets.pool) {
                b._origColor = b._origColor || b.color;
                b.color = '#ffcc00';
            }
        } else {
            for (const b of this.enemyBullets.pool) {
                if (b._origColor) { b.color = b._origColor; b._origColor = null; }
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

    draw(ctx) {
        for (const p of this.list) {
            const bob = Math.sin(p.bobTimer) * 3;
            const pulse = 0.7 + Math.sin(p.bobTimer * 1.5) * 0.3;
            const rot = p.bobTimer * 0.8;

            // Dynamic light — pulsing glow around power-ups
            Renderer.addGlow(p.x, p.y + bob, Renderer.colorToHex(p.color), p.radius * 6, 0.3 + pulse * 0.4);

            ctx.save();
            ctx.translate(p.x, p.y + bob);

            // Outer pulsing ring
            ctx.strokeStyle = p.color;
            
            ctx.lineWidth = 1.5;
            ctx.globalAlpha = 0.3 + Math.sin(p.bobTimer * 2) * 0.15;
            ctx.beginPath();
            ctx.arc(0, 0, p.radius + 5 + Math.sin(p.bobTimer * 1.5) * 2, 0, Math.PI * 2);
            ctx.stroke();

            // Inner filled hexagon background
            ctx.globalAlpha = 0.5 * pulse;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            for (let j = 0; j < 6; j++) {
                const a = (Math.PI * 2 / 6) * j + rot * 0.3;
                const r = p.radius;
                ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
            }
            ctx.closePath();
            ctx.fill();

            // Weapon icon — drawn in white over the colored background
            ctx.globalAlpha = 1;
            

            switch (p.type) {
                case 'spread':
                    // Fan of lines spreading outward
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 2;
                    for (let j = -2; j <= 2; j++) {
                        const a = -Math.PI / 2 + j * 0.3;
                        ctx.beginPath();
                        ctx.moveTo(0, 2);
                        ctx.lineTo(Math.cos(a) * 9, Math.sin(a) * 9);
                        ctx.stroke();
                    }
                    // Small dots at tips
                    ctx.fillStyle = '#ffffff';
                    for (let j = -2; j <= 2; j++) {
                        const a = -Math.PI / 2 + j * 0.3;
                        ctx.beginPath();
                        ctx.arc(Math.cos(a) * 9, Math.sin(a) * 9, 1.2, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    break;

                case 'homing':
                    // Missile shape — pointed nose, fins
                    ctx.fillStyle = '#ffffff';
                    ctx.beginPath();
                    ctx.moveTo(0, -8);  // Nose
                    ctx.lineTo(3, -2);
                    ctx.lineTo(3, 5);
                    ctx.lineTo(6, 8);   // Right fin
                    ctx.lineTo(3, 6);
                    ctx.lineTo(-3, 6);
                    ctx.lineTo(-6, 8);  // Left fin
                    ctx.lineTo(-3, 5);
                    ctx.lineTo(-3, -2);
                    ctx.closePath();
                    ctx.fill();
                    // Exhaust
                    ctx.fillStyle = p.color;
                    ctx.globalAlpha = 0.6 + Math.sin(p.bobTimer * 8) * 0.3;
                    ctx.beginPath();
                    ctx.moveTo(-2, 6);
                    ctx.lineTo(0, 10 + Math.sin(p.bobTimer * 8) * 2);
                    ctx.lineTo(2, 6);
                    ctx.fill();
                    break;

                case 'laser':
                    // Vertical beam with glow
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(-1.5, -9, 3, 18);
                    // Side glow bars
                    ctx.globalAlpha = 0.5;
                    ctx.fillStyle = p.color;
                    ctx.fillRect(-4, -7, 2, 14);
                    ctx.fillRect(2, -7, 2, 14);
                    // Bright center point
                    ctx.globalAlpha = 1;
                    ctx.fillStyle = '#ffffff';
                    ctx.beginPath();
                    ctx.arc(0, -9, 2, 0, Math.PI * 2);
                    ctx.fill();
                    break;

                case 'drone':
                    // Orbiting dots around center
                    ctx.fillStyle = '#ffffff';
                    ctx.beginPath();
                    ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
                    ctx.fill();
                    // Orbiting satellites
                    for (let j = 0; j < 3; j++) {
                        const a = (Math.PI * 2 / 3) * j + rot * 2;
                        const ox = Math.cos(a) * 6;
                        const oy = Math.sin(a) * 6;
                        ctx.fillStyle = '#ffffff';
                        ctx.beginPath();
                        ctx.arc(ox, oy, 1.8, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    // Orbit ring
                    ctx.strokeStyle = '#ffffff';
                    ctx.globalAlpha = 0.3;
                    ctx.lineWidth = 0.8;
                    ctx.beginPath();
                    ctx.arc(0, 0, 6, 0, Math.PI * 2);
                    ctx.stroke();
                    break;
            }

            // Rotating corner sparkles
            ctx.globalAlpha = 0.6;
            ctx.fillStyle = '#ffffff';
            for (let j = 0; j < 4; j++) {
                const a = rot + (Math.PI / 2) * j;
                const sparkR = p.radius + 3;
                ctx.beginPath();
                ctx.arc(Math.cos(a) * sparkR, Math.sin(a) * sparkR, 1, 0, Math.PI * 2);
                ctx.fill();
            }

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
        color: '#886644', accent: '#ccaa77', bulletColor: '#00ffaa',
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

    draw(ctx, e, flash) {
        const r = e.radius;
        const t = e.moveTimer;
        // Hull: armoured hexagon
        ctx.fillStyle = flash ? '#ffffff' : e.color;
        ctx.beginPath();
        for (let j = 0; j < 6; j++) {
            const a = (Math.PI * 2 / 6) * j + Math.PI / 6;
            ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.8);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = flash ? '#ffffff' : e.accent;
        ctx.lineWidth = 2;
        ctx.stroke();
        // Rotating weapon ring
        ctx.strokeStyle = e.accent;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.65, t * 2, t * 2 + Math.PI * 1.4);
        ctx.stroke();
        ctx.globalAlpha = 1;
        // Core
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.22 + Math.sin(t * 6) * 1.5, 0, Math.PI * 2);
        ctx.fill();
    },

    // Top-of-screen HP bar and timer (same place as the boss bar; they never overlap)
    drawBar(ctx) {
        const e = this.current();
        if (!e || e.y < 0) return;
        const barW = 200, barH = 6, barX = (PLAY_W - barW) / 2, barY = 15;
        ctx.fillStyle = '#221100';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = e.color;
        ctx.fillRect(barX, barY, barW * Math.max(0, e.hp / e.maxHp), barH);
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px Share Tech Mono, Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('MID-BOSS — ' + e.midboss.name, PLAY_W / 2, barY + barH + 12);
        const timeLeft = Math.max(0, MIDBOSS_TIME_LIMIT - e.onScreenTime);
        ctx.textAlign = 'right';
        ctx.fillStyle = timeLeft <= 10 ? '#ff4444' : '#aaaaaa';
        ctx.fillText(Math.ceil(timeLeft).toString(), barX + barW + 34, barY + barH);
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
                Particles.spawn(a.x, a.y, 8, { color: '#886644', speed: 80, life: 0.3, size: 2 });
                Scoring.score += Math.floor(50 * GameConfig.scoreMultiplier);
                Audio.playAsteroidBreak();
                this.list.splice(i, 1);
            }
        }
    },

    draw(ctx) {
        for (const a of this.list) {
            ctx.save();
            ctx.translate(a.x, a.y);
            ctx.rotate(a.rotation);
            ctx.fillStyle = a.destructible ? '#665544' : '#444455';
            ctx.strokeStyle = a.destructible ? '#887766' : '#6666aa';
            ctx.lineWidth = 1.5;
            // Irregular polygon
            ctx.beginPath();
            for (let j = 0; j < 7; j++) {
                const ang = (Math.PI * 2 / 7) * j;
                const r = a.radius * (0.7 + ((j * 13 + a.radius * 7) % 10) / 25);
                ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
            }
            ctx.closePath();
            ctx.fill(); ctx.stroke();
            if (!a.destructible) {
                ctx.strokeStyle = '#8888cc';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(0, 0, a.radius * 0.5, 0, Math.PI);
                ctx.stroke();
            }
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
                    Audio.playExplosionLarge();
                    ScreenShake.trigger(12, 0.8);
                }
            }
        }
    },

    draw(ctx) {
        if (!this.active || !this.alive) return;
        ctx.save();
        ctx.translate(this.x, this.y);
        // Allied ship — green tinted
        const flash = this.flashTimer > 0;
        ctx.fillStyle = flash ? '#ffffff' : '#44aa44';
        ctx.beginPath();
        ctx.moveTo(0, -25); ctx.lineTo(30, 10); ctx.lineTo(20, 20);
        ctx.lineTo(-20, 20); ctx.lineTo(-30, 10);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#88ff88'; ctx.lineWidth = 1.5; ctx.stroke();
        // Engine
        ctx.fillRect(-12, 20, 8, 6 + Math.random() * 3);
        ctx.fillRect(4, 20, 8, 6 + Math.random() * 3);
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

    draw(ctx) {
        if (!this.active) return;

        // Warning text
        if (this.warningTimer > 0) {
            ctx.save();
            ctx.fillStyle = `rgba(255, 0, 80, ${0.5 + Math.sin(this.warningTimer * 8) * 0.5})`;
            ctx.font = 'bold 28px Share Tech Mono, Consolas, monospace';
            ctx.textAlign = 'center';
            ctx.fillText('WARNING', PLAY_W / 2, PLAY_H / 2 - 20);
            ctx.font = '16px Share Tech Mono, Consolas, monospace';
            ctx.fillText(this.bossName + ' APPROACHES', PLAY_W / 2, PLAY_H / 2 + 15);
            ctx.restore();
            return;
        }

        ctx.save();
        ctx.translate(this.x, this.y);

        const flash = this.flashTimer > 0;
        const mainColor = flash ? '#ffffff' : (this.colors[this.phase - 1] || '#ff4444');

        // Dynamic light — boss core glow (brighter during flash)
        Renderer.addGlow(this.x, this.y, Renderer.colorToHex(mainColor), this.radius * (flash ? 5 : 3), flash ? 0.8 : 0.35);

        // Core body
        ctx.fillStyle = mainColor;

        // Type-specific body shapes
        const r = this.radius;
        switch (this.bossType) {
            case 'furnace': {
                // Industrial war machine — heavy armoured hull, smokestacks, cannons
                // Main hull
                ctx.beginPath();
                ctx.moveTo(-r * 0.8, -r * 0.7);
                ctx.lineTo(r * 0.8, -r * 0.7);
                ctx.lineTo(r * 0.9, -r * 0.2);
                ctx.lineTo(r * 0.7, r * 0.6);
                ctx.lineTo(-r * 0.7, r * 0.6);
                ctx.lineTo(-r * 0.9, -r * 0.2);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = flash ? '#fff' : '#ff8844';
                ctx.lineWidth = 2; ctx.stroke();
                // Armour plates
                ctx.strokeStyle = flash ? '#fff' : '#884422';
                ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(-r * 0.7, -r * 0.2); ctx.lineTo(r * 0.7, -r * 0.2); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(-r * 0.6, r * 0.2); ctx.lineTo(r * 0.6, r * 0.2); ctx.stroke();
                // Smokestacks
                ctx.fillStyle = flash ? '#ffffff' : '#663300';
                ctx.fillRect(-r * 0.7, -r * 1.0, r * 0.2, r * 0.35);
                ctx.fillRect(r * 0.5, -r * 1.0, r * 0.2, r * 0.35);
                // Smoke
                ctx.fillStyle = `rgba(100, 50, 0, ${0.3 + Math.sin(this.moveTimer * 2) * 0.15})`;
                ctx.beginPath(); ctx.arc(-r * 0.6, -r * 1.1, 5 + Math.sin(this.moveTimer * 3) * 2, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(r * 0.6, -r * 1.1, 5 + Math.cos(this.moveTimer * 3) * 2, 0, Math.PI * 2); ctx.fill();
                // Side cannons
                ctx.fillStyle = mainColor;
                ctx.fillRect(-r * 1.1, -r * 0.1, r * 0.3, r * 0.15);
                ctx.fillRect(r * 0.8, -r * 0.1, r * 0.3, r * 0.15);
                // Central cannon
                ctx.fillRect(-r * 0.08, r * 0.5, r * 0.16, r * 0.4);
                ctx.fillRect(-r * 0.15, r * 0.85, r * 0.3, r * 0.08);
                // Furnace glow (core)
                ctx.fillStyle = '#ff2200';
                ctx.globalAlpha = 0.5 + Math.sin(this.moveTimer * 4) * 0.3;
                ctx.beginPath(); ctx.arc(0, 0, r * 0.25, 0, Math.PI * 2); ctx.fill();
                break;
            }
            case 'leviathan': {
                // Organic creature — segmented body, multiple eyes, animated tentacles
                // Main body segments
                ctx.beginPath(); ctx.ellipse(0, 0, r * 0.85, r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.ellipse(0, -r * 0.15, r * 0.65, r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = flash ? '#fff' : '#44ccaa'; ctx.lineWidth = 1.5; ctx.stroke();
                // Outer membrane
                ctx.strokeStyle = `rgba(0, 200, 150, 0.3)`;
                ctx.lineWidth = 1;
                ctx.beginPath(); ctx.ellipse(0, 0, r * 0.95, r * 0.7, 0, 0, Math.PI * 2); ctx.stroke();
                // Tentacles (6, animated)
                for (let t = 0; t < 6; t++) {
                    const ta = (Math.PI * 2 / 6) * t + this.moveTimer * 0.4;
                    const wave = Math.sin(this.moveTimer * 2.5 + t * 1.2);
                    ctx.strokeStyle = `rgba(0, 255, 170, ${0.35 + Math.sin(this.moveTimer * 3 + t) * 0.15})`;
                    ctx.lineWidth = 2.5 - t * 0.1;
                    ctx.beginPath();
                    const sx = Math.cos(ta) * r * 0.7, sy = Math.sin(ta) * r * 0.5;
                    ctx.moveTo(sx, sy);
                    ctx.quadraticCurveTo(
                        Math.cos(ta) * r * 1.3 + wave * 15, Math.sin(ta) * r * 1.0 + wave * 10,
                        Math.cos(ta + 0.2 + wave * 0.1) * r * 1.8, Math.sin(ta + 0.2 + wave * 0.1) * r * 1.4
                    );
                    ctx.stroke();
                }
                // Eyes (3)
                const eyePositions = [[-r * 0.25, -r * 0.25], [r * 0.25, -r * 0.25], [0, -r * 0.05]];
                for (const [ex, ey] of eyePositions) {
                    ctx.fillStyle = flash ? '#ffffff' : '#001a10';
                    ctx.beginPath(); ctx.ellipse(ex, ey, r * 0.12, r * 0.08, 0, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#00ffaa';
                    ctx.beginPath(); ctx.arc(ex, ey, r * 0.04, 0, Math.PI * 2); ctx.fill();
                }
                break;
            }
            case 'interceptor_duo': {
                // Twin fighter ships — each with wings and engines
                const sep = this.phase === 1 ? 45 : 18;
                for (let s = -1; s <= 1; s += 2) {
                    const ox = s * sep;
                    ctx.fillStyle = mainColor;
                    // Fighter body
                    ctx.beginPath();
                    ctx.moveTo(ox, -r * 0.7);
                    ctx.lineTo(ox + r * 0.2, -r * 0.3);
                    ctx.lineTo(ox + r * 0.15, r * 0.4);
                    ctx.lineTo(ox, r * 0.5);
                    ctx.lineTo(ox - r * 0.15, r * 0.4);
                    ctx.lineTo(ox - r * 0.2, -r * 0.3);
                    ctx.closePath();
                    ctx.fill();
                    // Wings
                    ctx.beginPath();
                    ctx.moveTo(ox + r * 0.15, -r * 0.1);
                    ctx.lineTo(ox + r * 0.55, r * 0.15);
                    ctx.lineTo(ox + r * 0.5, r * 0.3);
                    ctx.lineTo(ox + r * 0.15, r * 0.15);
                    ctx.closePath();
                    ctx.fill();
                    ctx.beginPath();
                    ctx.moveTo(ox - r * 0.15, -r * 0.1);
                    ctx.lineTo(ox - r * 0.55, r * 0.15);
                    ctx.lineTo(ox - r * 0.5, r * 0.3);
                    ctx.lineTo(ox - r * 0.15, r * 0.15);
                    ctx.closePath();
                    ctx.fill();
                    // Outline
                    ctx.strokeStyle = flash ? '#fff' : (s < 0 ? '#ffcc44' : '#ff6644');
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.moveTo(ox, -r * 0.7); ctx.lineTo(ox + r * 0.55, r * 0.15);
                    ctx.lineTo(ox + r * 0.15, r * 0.4); ctx.lineTo(ox, r * 0.5);
                    ctx.lineTo(ox - r * 0.15, r * 0.4); ctx.lineTo(ox - r * 0.55, r * 0.15);
                    ctx.closePath(); ctx.stroke();
                    // Cockpit
                    ctx.fillStyle = flash ? '#ffffff' : '#442200';
                    ctx.beginPath(); ctx.ellipse(ox, -r * 0.35, r * 0.07, r * 0.12, 0, 0, Math.PI * 2); ctx.fill();
                    // Engine
                    ctx.fillStyle = s < 0 ? '#ffcc44' : '#ff6644';
                    ctx.globalAlpha = 0.6;
                    ctx.beginPath();
                    ctx.moveTo(ox - 4, r * 0.45); ctx.lineTo(ox, r * 0.7 + Math.sin(this.moveTimer * 8) * 3);
                    ctx.lineTo(ox + 4, r * 0.45); ctx.fill();
                    ctx.globalAlpha = 1;
                }
                // Phase 2: energy link between ships
                if (this.phase === 2) {
                    ctx.strokeStyle = `rgba(255, 150, 0, ${0.4 + Math.sin(this.moveTimer * 5) * 0.2})`;
                    ctx.lineWidth = 2;
                    for (let beam = 0; beam < 3; beam++) {
                        const by = -r * 0.2 + beam * r * 0.25;
                        ctx.beginPath(); ctx.moveTo(-sep, by); ctx.lineTo(sep, by); ctx.stroke();
                    }
                }
                break;
            }
            case 'nexus': {
                // Energy nexus — central sphere with orbiting ring structures and data streams
                // Outer shell
                ctx.globalAlpha = 0.3;
                ctx.beginPath(); ctx.arc(0, 0, r * 0.9, 0, Math.PI * 2); ctx.fill();
                ctx.globalAlpha = 1;
                // Core sphere
                ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = flash ? '#fff' : '#aa44ff'; ctx.lineWidth = 2; ctx.stroke();
                // Inner bright core
                ctx.fillStyle = '#ffffff';
                ctx.globalAlpha = 0.4 + Math.sin(this.moveTimer * 3) * 0.2;
                ctx.beginPath(); ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2); ctx.fill();
                ctx.globalAlpha = 1;
                // Orbital rings (3, rotating at different speeds)
                for (let ring = 0; ring < 3; ring++) {
                    ctx.strokeStyle = `rgba(200, 0, 255, ${0.4 + Math.sin(this.moveTimer * 2 + ring) * 0.15})`;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.ellipse(0, 0, r * (0.75 + ring * 0.12), r * (0.25 + ring * 0.05),
                        this.moveTimer * (0.6 + ring * 0.4), 0, Math.PI * 2);
                    ctx.stroke();
                    // Node on each ring
                    const nodeA = this.moveTimer * (0.6 + ring * 0.4);
                    const nodeX = Math.cos(nodeA) * r * (0.75 + ring * 0.12);
                    const nodeY = Math.sin(nodeA) * r * (0.25 + ring * 0.05);
                    ctx.fillStyle = '#ff00ff';
                    ctx.beginPath(); ctx.arc(nodeX, nodeY, 3, 0, Math.PI * 2); ctx.fill();
                }
                // Data stream particles
                ctx.fillStyle = '#cc44ff';
                ctx.globalAlpha = 0.5;
                for (let p = 0; p < 8; p++) {
                    const pa = this.moveTimer * 1.5 + p * 0.8;
                    const pd = r * 0.4 + Math.sin(pa * 2) * r * 0.3;
                    ctx.fillRect(Math.cos(pa) * pd - 1, Math.sin(pa) * pd - 1, 2, 2);
                }
                ctx.globalAlpha = 1;
                break;
            }
            case 'echo': {
                // Dark mirror of player ship — inverted, with glitch distortion
                // Main fuselage (inverted — nose pointing down)
                ctx.beginPath();
                ctx.moveTo(0, r * 1.0);            // Nose (pointing down)
                ctx.lineTo(r * 0.25, r * 0.4);
                ctx.lineTo(r * 0.3, -r * 0.2);
                ctx.lineTo(r * 0.25, -r * 0.7);
                ctx.lineTo(-r * 0.25, -r * 0.7);
                ctx.lineTo(-r * 0.3, -r * 0.2);
                ctx.lineTo(-r * 0.25, r * 0.4);
                ctx.closePath();
                ctx.fill();
                // Wings (inverted)
                ctx.beginPath();
                ctx.moveTo(r * 0.3, r * 0.1); ctx.lineTo(r * 0.9, -r * 0.3);
                ctx.lineTo(r * 0.85, -r * 0.5); ctx.lineTo(r * 0.3, -r * 0.2);
                ctx.closePath(); ctx.fill();
                ctx.beginPath();
                ctx.moveTo(-r * 0.3, r * 0.1); ctx.lineTo(-r * 0.9, -r * 0.3);
                ctx.lineTo(-r * 0.85, -r * 0.5); ctx.lineTo(-r * 0.3, -r * 0.2);
                ctx.closePath(); ctx.fill();
                // Outline
                ctx.strokeStyle = flash ? '#fff' : '#88eeff'; ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(0, r * 1.0); ctx.lineTo(r * 0.25, r * 0.4);
                ctx.lineTo(r * 0.9, -r * 0.3); ctx.lineTo(r * 0.85, -r * 0.5);
                ctx.lineTo(r * 0.25, -r * 0.7); ctx.lineTo(-r * 0.25, -r * 0.7);
                ctx.lineTo(-r * 0.85, -r * 0.5); ctx.lineTo(-r * 0.9, -r * 0.3);
                ctx.lineTo(-r * 0.25, r * 0.4);
                ctx.closePath(); ctx.stroke();
                // Dark cockpit
                ctx.fillStyle = flash ? '#ffffff' : '#002233';
                ctx.beginPath(); ctx.ellipse(0, r * 0.3, r * 0.1, r * 0.2, 0, 0, Math.PI * 2); ctx.fill();
                // Engines (pointing up since inverted)
                ctx.fillStyle = '#00ffff';
                ctx.globalAlpha = 0.6;
                ctx.beginPath();
                ctx.moveTo(-r * 0.35, -r * 0.65); ctx.lineTo(-r * 0.25, -r * 0.95 - Math.sin(this.moveTimer * 8) * 3);
                ctx.lineTo(-r * 0.15, -r * 0.65); ctx.fill();
                ctx.beginPath();
                ctx.moveTo(r * 0.15, -r * 0.65); ctx.lineTo(r * 0.25, -r * 0.95 - Math.sin(this.moveTimer * 8) * 3);
                ctx.lineTo(r * 0.35, -r * 0.65); ctx.fill();
                ctx.globalAlpha = 1;
                // Glitch ghost
                if (Math.random() < 0.06) {
                    ctx.globalAlpha = 0.25;
                    ctx.fillStyle = '#ff00ff';
                    ctx.translate((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
                    ctx.beginPath();
                    ctx.moveTo(0, r * 1.0); ctx.lineTo(r * 0.25, r * 0.4);
                    ctx.lineTo(r * 0.3, -r * 0.2); ctx.lineTo(r * 0.25, -r * 0.7);
                    ctx.lineTo(-r * 0.25, -r * 0.7); ctx.lineTo(-r * 0.3, -r * 0.2);
                    ctx.lineTo(-r * 0.25, r * 0.4);
                    ctx.closePath(); ctx.fill();
                    ctx.globalAlpha = 1;
                }
                break;
            }
            default: {
                // Architect — angular mech with shoulder pods, central eye, leg struts
                // Main body
                ctx.beginPath();
                ctx.moveTo(0, -r * 0.8);
                ctx.lineTo(r * 0.4, -r * 0.6);
                ctx.lineTo(r * 0.5, -r * 0.1);
                ctx.lineTo(r * 0.4, r * 0.5);
                ctx.lineTo(r * 0.15, r * 0.7);
                ctx.lineTo(-r * 0.15, r * 0.7);
                ctx.lineTo(-r * 0.4, r * 0.5);
                ctx.lineTo(-r * 0.5, -r * 0.1);
                ctx.lineTo(-r * 0.4, -r * 0.6);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = flash ? '#fff' : '#ff8888'; ctx.lineWidth = 1.5; ctx.stroke();
                // Shoulder pods
                ctx.beginPath();
                ctx.moveTo(r * 0.5, -r * 0.4); ctx.lineTo(r * 0.95, -r * 0.5);
                ctx.lineTo(r * 1.0, -r * 0.15); ctx.lineTo(r * 0.85, r * 0.05);
                ctx.lineTo(r * 0.5, 0);
                ctx.closePath(); ctx.fill();
                ctx.beginPath();
                ctx.moveTo(-r * 0.5, -r * 0.4); ctx.lineTo(-r * 0.95, -r * 0.5);
                ctx.lineTo(-r * 1.0, -r * 0.15); ctx.lineTo(-r * 0.85, r * 0.05);
                ctx.lineTo(-r * 0.5, 0);
                ctx.closePath(); ctx.fill();
                // Central eye
                ctx.fillStyle = flash ? '#ffffff' : '#220000';
                ctx.beginPath(); ctx.ellipse(0, -r * 0.25, r * 0.15, r * 0.1, 0, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(0, -r * 0.25, r * 0.05, 0, Math.PI * 2); ctx.fill();
                // Leg struts
                ctx.strokeStyle = mainColor; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(r * 0.15, r * 0.7); ctx.lineTo(r * 0.35, r * 1.0); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(-r * 0.15, r * 0.7); ctx.lineTo(-r * 0.35, r * 1.0); ctx.stroke();
                // Weapon hardpoints on shoulders
                ctx.fillStyle = mainColor;
                ctx.fillRect(r * 0.85, -r * 0.45, r * 0.1, r * 0.25);
                ctx.fillRect(-r * 0.95, -r * 0.45, r * 0.1, r * 0.25);
                break;
            }
        }

        // Armor segments (any boss with armor)
        if (this.armor.length > 0 && this.phase === 1) {
            for (const seg of this.armor) {
                if (!seg.alive) continue;
                // Same orbit as the hit zones and the armor's own guns (armorPositions)
                const ax = Math.cos(seg.angle + this.moveTimer) * BOSS_ARMOR_ORBIT;
                const ay = Math.sin(seg.angle + this.moveTimer) * BOSS_ARMOR_ORBIT;
                ctx.fillStyle = '#ff6644';
                ctx.beginPath();
                ctx.arc(ax, ay, BOSS_ARMOR_RADIUS - 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#ffaa88';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }
        }

        // Core glow (phases 2-3)
        if (this.phase >= 2) {
            const pulseR = 15 + Math.sin(this.moveTimer * 5) * 5;
            ctx.fillStyle = `rgba(255, 0, 255, ${0.3 + Math.sin(this.moveTimer * 3) * 0.2})`;
            ctx.beginPath();
            ctx.arc(0, 0, pulseR, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(0, 0, 6, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();

        // HP bar
        if (this.entered && !this.defeated) {
            const barW = 200;
            const barH = 8;
            const barX = (PLAY_W - barW) / 2;
            const barY = 15;
            ctx.fillStyle = '#220022';
            ctx.fillRect(barX, barY, barW, barH);
            const pct = Math.max(0, this.hp / this.maxHp);
            const hpColor = this.phase === 1 ? '#ff4444' : this.phase === 2 ? '#ff00ff' : '#ff0040';
            ctx.fillStyle = hpColor;
            ctx.fillRect(barX, barY, barW * pct, barH);
            // Phase label
            ctx.fillStyle = '#ffffff';
            ctx.font = '12px Share Tech Mono, Consolas, monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`${this.bossName} — PHASE ${this.phase}`, PLAY_W / 2, barY + barH + 12);
            // Phase timer (turns red in the last 10 s)
            const timeLeft = Math.max(0, BOSS_PHASE_TIME_LIMIT - this.phaseTime);
            ctx.textAlign = 'right';
            ctx.fillStyle = timeLeft <= 10 ? '#ff4444' : '#aaaaaa';
            ctx.fillText(Math.ceil(timeLeft).toString(), barX + barW + 34, barY + barH);
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
    deathFragments: [],

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
            // Animate death fragments
            for (const f of this.deathFragments) {
                f.x += f.vx * dt;
                f.y += f.vy * dt;
                f.vy += 30 * dt; // slight gravity
                f.rot += f.rotSpeed * dt;
                f.vx *= 0.98;
                f.vy *= 0.98;
            }
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
                    Particles.spawn(b.x, b.y, 3, { color: '#00ffff', speed: 50, life: 0.1 });
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
                    Particles.spawn(b.x, b.y, 3, { color: '#00ffff', speed: 50, life: 0.1 });
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

        // Death animation — spawn ship fragments
        this.deathX = this.x;
        this.deathY = this.y;
        this.deathAnimTimer = 1.5;
        this.deathFragments = [];
        const skinColor = Hangar.skinColor;
        for (let i = 0; i < 8; i++) {
            const angle = (Math.PI * 2 / 8) * i + Math.random() * 0.3;
            this.deathFragments.push({
                x: this.x, y: this.y,
                vx: Math.cos(angle) * (60 + Math.random() * 80),
                vy: Math.sin(angle) * (60 + Math.random() * 80),
                rot: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 8,
                size: 4 + Math.random() * 6,
                color: i % 2 === 0 ? skinColor : '#88eeff'
            });
        }

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

    draw(ctx) {
        // Draw death fragments when dead
        if (!this.alive && this.deathAnimTimer > 0) {
            const alpha = this.deathAnimTimer / 1.5;
            for (const f of this.deathFragments) {
                ctx.save();
                ctx.translate(f.x, f.y);
                ctx.rotate(f.rot);
                ctx.globalAlpha = alpha;
                ctx.fillStyle = f.color;
                // Irregular triangle fragment
                ctx.beginPath();
                ctx.moveTo(-f.size * 0.5, -f.size * 0.3);
                ctx.lineTo(f.size * 0.5, 0);
                ctx.lineTo(-f.size * 0.3, f.size * 0.4);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            }
            ctx.globalAlpha = 1;
            // Still draw bullets even when dead
            this.bullets.draw(ctx);
            return;
        }

        if (!this.alive) return;

        // Blink when invincible
        if (this.invincible && !this.dashing && Math.floor(this.invincibleTimer * 10) % 2 === 0) return;

        const focusing = GameConfig.focus.enabled && Input.isHeld('focus');

        // Engine trail — apply equipped trail color
        ctx.globalAlpha = 0.3;
        for (let i = 1; i < this.trailPositions.length; i++) {
            const t = this.trailPositions[i];
            const alpha = (1 - i / this.trailPositions.length) * 0.3;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = this.dashing ? '#ffffff' : Hangar.trailColor;
            ctx.beginPath();
            ctx.arc(t.x, t.y, this.radius * (1 - i * 0.08), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        // Drones
        if (this.droneLevel > 0) {
            ctx.fillStyle = '#cc44ff';
            for (const d of this.dronePositions()) {
                ctx.beginPath();
                ctx.arc(d.x, d.y, 5, 0, Math.PI * 2);
                ctx.fill();
            }
            // Shield pulse ring (Lv2+) — shown while a pulse is cancelling bullets
            if (this.shieldPulseFlash > 0) {
                const r = this.droneLevel >= 5 ? 55 : 45;
                ctx.strokeStyle = `rgba(204, 68, 255, ${0.3 + this.shieldPulseFlash * 1.6})`;
                ctx.lineWidth = this.droneLevel >= 4 ? 3 : 2;
                ctx.beginPath();
                ctx.arc(this.x, this.y, r * (1 - this.shieldPulseFlash), 0, Math.PI * 2);
                ctx.stroke();
            }
        }

        ctx.save();
        ctx.translate(this.x, this.y);

        // GPU glow behind player — engine glow + surge glow
        Renderer.addGlow(this.x, this.y, Renderer.colorToHex(Hangar.trailColor), this.radius * 4, 0.45);
        if (Scoring.surgeActive) {
            Renderer.addGlow(this.x, this.y, 0xffffff, this.radius * 6, 0.5);
        }

        // Surge glow
        if (Scoring.surgeActive && !Settings.values.flashReduction) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.beginPath();
            ctx.arc(0, 0, this.radius + 10 + Math.sin(this.engineFlicker) * 3, 0, Math.PI * 2);
            ctx.fill();
        }

        // Shield HP visual
        if (this.maxShieldHp > 0 && this.shieldHp > 0) {
            const shieldAlpha = this.shieldFlashTimer > 0 ? 0.6 : 0.2 + Math.sin(this.engineFlicker * 0.3) * 0.1;
            const shieldColor = this.shieldFlashTimer > 0 ? '#ffffff' : '#4488ff';
            ctx.strokeStyle = shieldColor;
            ctx.lineWidth = 2;
            ctx.globalAlpha = shieldAlpha;
            ctx.beginPath();
            ctx.arc(0, 0, this.radius + 5, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }

        // Ship body — apply equipped skin
        const skinColor = Hangar.equipped.skin === 'chromatic'
            ? `hsl(${(this.engineFlicker * 10) % 360}, 100%, 70%)`
            : Hangar.skinColor;
        const shipAlpha = Hangar.equipped.skin === 'ghost' ? 0.6 : 1.0;
        ctx.globalAlpha = shipAlpha;
        const sc = Scoring.surgeActive ? '#ffffff' : skinColor;
        ctx.fillStyle = sc;
        const r = this.radius;

        // Main fuselage
        ctx.beginPath();
        ctx.moveTo(0, -r * 1.1);         // Nose
        ctx.lineTo(r * 0.25, -r * 0.5);  // Right nose taper
        ctx.lineTo(r * 0.3, r * 0.1);    // Right body
        ctx.lineTo(r * 0.25, r * 0.7);   // Right rear
        ctx.lineTo(-r * 0.25, r * 0.7);  // Left rear
        ctx.lineTo(-r * 0.3, r * 0.1);   // Left body
        ctx.lineTo(-r * 0.25, -r * 0.5); // Left nose taper
        ctx.closePath();
        ctx.fill();

        // Wings
        ctx.beginPath();
        ctx.moveTo(r * 0.3, -r * 0.1);   // Right wing root
        ctx.lineTo(r * 0.9, r * 0.4);    // Right wing tip
        ctx.lineTo(r * 0.85, r * 0.6);   // Right wing trailing edge
        ctx.lineTo(r * 0.3, r * 0.3);    // Right wing back to body
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-r * 0.3, -r * 0.1);  // Left wing root
        ctx.lineTo(-r * 0.9, r * 0.4);   // Left wing tip
        ctx.lineTo(-r * 0.85, r * 0.6);  // Left wing trailing edge
        ctx.lineTo(-r * 0.3, r * 0.3);   // Left wing back to body
        ctx.closePath();
        ctx.fill();

        // Cockpit canopy
        ctx.fillStyle = Scoring.surgeActive ? '#ffffff' : '#aaddff';
        ctx.globalAlpha = shipAlpha * 0.7;
        ctx.beginPath();
        ctx.ellipse(0, -r * 0.35, r * 0.12, r * 0.25, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = shipAlpha;

        // Wing tip accents
        ctx.fillStyle = sc;
        ctx.fillRect(r * 0.7, r * 0.35, r * 0.15, 2);
        ctx.fillRect(-r * 0.85, r * 0.35, r * 0.15, 2);

        // Outline
        ctx.strokeStyle = Scoring.surgeActive ? '#ffffff' : '#88eeff';
        ctx.lineWidth = 1;
        // Fuselage outline
        ctx.beginPath();
        ctx.moveTo(0, -r * 1.1);
        ctx.lineTo(r * 0.25, -r * 0.5);
        ctx.lineTo(r * 0.3, r * 0.1);
        ctx.lineTo(r * 0.9, r * 0.4);
        ctx.lineTo(r * 0.85, r * 0.6);
        ctx.lineTo(r * 0.25, r * 0.7);
        ctx.lineTo(-r * 0.25, r * 0.7);
        ctx.lineTo(-r * 0.85, r * 0.6);
        ctx.lineTo(-r * 0.9, r * 0.4);
        ctx.lineTo(-r * 0.3, r * 0.1);
        ctx.lineTo(-r * 0.25, -r * 0.5);
        ctx.closePath();
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Engine glow — twin engines at wing roots
        const trailColor = Hangar.trailColor;
        const flicker = Math.sin(this.engineFlicker) * 2;
        ctx.fillStyle = trailColor;
        // Left engine
        ctx.beginPath();
        ctx.moveTo(-r * 0.35, r * 0.65);
        ctx.lineTo(-r * 0.25, r * 0.95 + flicker);
        ctx.lineTo(-r * 0.15, r * 0.65);
        ctx.fill();
        // Right engine
        ctx.beginPath();
        ctx.moveTo(r * 0.15, r * 0.65);
        ctx.lineTo(r * 0.25, r * 0.95 + flicker);
        ctx.lineTo(r * 0.35, r * 0.65);
        ctx.fill();

        // Focus mode hitbox indicator (or always if setting enabled)
        if (focusing || Settings.values.showHitbox) {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(0, 0, this.hitboxRadius + 1, 0, Math.PI * 2);
            ctx.fill();
            // Graze zone indicator
            if (GameConfig.graze.enabled) {
                const gz = this.grazeRadius * (GameConfig.graze.zoneMultiplier || 1);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(0, 0, gz, 0, Math.PI * 2);
                ctx.stroke();
            }
        }

        ctx.restore();

        // Draw player bullets
        this.bullets.draw(ctx);

        // Bomb effect
        if (this.bombActive && !Settings.values.flashReduction) {
            const bombAlpha = this.bombTimer / 1.5;
            // GPU glow at bomb centre
            Renderer.addGlow(this.x, this.y, 0x00ffff, 400 * bombAlpha, bombAlpha * 0.7);
            // Screen-filling flash
            ctx.fillStyle = `rgba(0, 255, 255, ${bombAlpha * 0.08})`;
            ctx.fillRect(0, 0, PLAY_W, PLAY_H);
            // White-hot centre
            ctx.fillStyle = `rgba(255, 255, 255, ${bombAlpha * 0.12})`;
            ctx.beginPath();
            ctx.arc(this.x, this.y, 80 * bombAlpha, 0, Math.PI * 2);
            ctx.fill();
            // Expanding shockwave ring
            const ringR = (1.5 - this.bombTimer) * 400;
            ctx.strokeStyle = `rgba(0, 255, 255, ${bombAlpha * 0.5})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(this.x, this.y, ringR, 0, Math.PI * 2);
            ctx.stroke();
            // Secondary inner ring
            ctx.strokeStyle = `rgba(255, 255, 255, ${bombAlpha * 0.3})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(this.x, this.y, ringR * 0.6, 0, Math.PI * 2);
            ctx.stroke();
        } else if (this.bombActive) {
            // Reduced flash — just the ring, dimmer
            const ringR = (1.5 - this.bombTimer) * 400;
            ctx.strokeStyle = `rgba(0, 255, 255, 0.15)`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.x, this.y, ringR, 0, Math.PI * 2);
            ctx.stroke();
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
// ============================================================
const HUD = {
    draw(ctx) {
        // HUD backgrounds
        ctx.fillStyle = '#0a0612';
        ctx.fillRect(0, 0, HUD_LEFT_W, SCREEN_H);
        ctx.fillRect(HUD_RIGHT_X, 0, HUD_RIGHT_W, SCREEN_H);

        // Border lines
        ctx.strokeStyle = '#ff00ff';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#ff00ff';
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.moveTo(PLAY_X - 1, 0);
        ctx.lineTo(PLAY_X - 1, SCREEN_H);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(PLAY_X + PLAY_W + 1, 0);
        ctx.lineTo(PLAY_X + PLAY_W + 1, SCREEN_H);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Subtle grid on HUD panels
        ctx.strokeStyle = 'rgba(255, 0, 255, 0.05)';
        ctx.lineWidth = 1;
        for (let y = 0; y < SCREEN_H; y += 30) {
            ctx.beginPath();
            ctx.moveTo(0, y); ctx.lineTo(HUD_LEFT_W, y); ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(HUD_RIGHT_X, y); ctx.lineTo(SCREEN_W, y); ctx.stroke();
        }

        const leftCenter = HUD_LEFT_W / 2;
        const rightCenter = HUD_RIGHT_X + HUD_RIGHT_W / 2;
        let leftY = 60;
        let rightY = 60;

        // === LEFT HUD ===

        // Title
        ctx.fillStyle = '#00ffff';
        ctx.font = 'bold 20px Share Tech Mono, Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 0;
        ctx.fillText('NEON STORM \u03b2', leftCenter, leftY);
        ctx.shadowBlur = 0;
        leftY += 50;

        // Lives
        ctx.fillStyle = '#888888';
        ctx.font = '12px Share Tech Mono, Consolas, monospace';
        ctx.fillText('LIVES', leftCenter, leftY);
        leftY += 20;
        for (let i = 0; i < Player.lives; i++) {
            const lx = leftCenter - (Player.lives - 1) * 12 + i * 24;
            ctx.fillStyle = '#00ffff';
            ctx.shadowColor = '#00ffff';
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.moveTo(lx, leftY - 6);
            ctx.lineTo(lx + 6, leftY + 3);
            ctx.lineTo(lx, leftY + 8);
            ctx.lineTo(lx - 6, leftY + 3);
            ctx.closePath();
            ctx.fill();
        }
        ctx.shadowBlur = 0;
        leftY += 30;

        // Shield HP
        if (Player.maxShieldHp > 0) {
            ctx.fillStyle = '#888888';
            ctx.font = '12px Share Tech Mono, Consolas, monospace';
            ctx.fillText('SHIELD', leftCenter, leftY);
            leftY += 14;
            const shieldBarW = 120;
            const shieldBarH = 10;
            const shieldBarX = leftCenter - shieldBarW / 2;
            ctx.fillStyle = '#1a1a3e';
            ctx.fillRect(shieldBarX, leftY, shieldBarW, shieldBarH);
            const shieldPct = Player.maxShieldHp > 0 ? Player.shieldHp / Player.maxShieldHp : 0;
            ctx.fillStyle = Player.shieldFlashTimer > 0 ? '#ffffff' : '#4488ff';
            ctx.shadowColor = '#4488ff';
            ctx.shadowBlur = 0;
            ctx.fillRect(shieldBarX, leftY, shieldBarW * shieldPct, shieldBarH);
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#aaaaaa';
            ctx.font = '12px Share Tech Mono, Consolas, monospace';
            ctx.fillText(Player.shieldHp + '/' + Player.maxShieldHp, leftCenter, leftY + shieldBarH + 12);
            leftY += 35;
        }

        // Bombs
        if (GameConfig.bombs.enabled) {
            ctx.fillStyle = '#888888';
            ctx.font = '12px Share Tech Mono, Consolas, monospace';
            ctx.fillText('BOMBS', leftCenter, leftY);
            leftY += 20;
            for (let i = 0; i < Player.bombs; i++) {
                const bx = leftCenter - (Player.bombs - 1) * 10 + i * 20;
                ctx.fillStyle = '#ff8800';
                ctx.shadowColor = '#ff8800';
                ctx.shadowBlur = 0;
                ctx.beginPath();
                ctx.arc(bx, leftY, 6, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.shadowBlur = 0;
            leftY += 30;
        }

        // Weapon
        ctx.fillStyle = '#888888';
        ctx.font = '12px Share Tech Mono, Consolas, monospace';
        ctx.fillText('WEAPON', leftCenter, leftY);
        leftY += 18;
        const weaponColors = { none: '#666666', spread: '#ff8c00', homing: '#00ff88', laser: '#4488ff' };
        const weaponNames = { none: 'BASE', spread: 'SPREAD', homing: 'HOMING', laser: 'LASER' };
        ctx.fillStyle = weaponColors[Player.primaryWeapon];
        ctx.font = 'bold 14px Share Tech Mono, Consolas, monospace';
        ctx.fillText(weaponNames[Player.primaryWeapon], leftCenter, leftY);
        if (Player.primaryLevel > 0) {
            leftY += 16;
            ctx.fillStyle = '#ffffff';
            ctx.font = '13px Share Tech Mono, Consolas, monospace';
            ctx.fillText('LV ' + '█'.repeat(Player.primaryLevel) + '░'.repeat(5 - Player.primaryLevel), leftCenter, leftY);
        }
        leftY += 30;

        // Drones
        ctx.fillStyle = '#888888';
        ctx.font = '12px Share Tech Mono, Consolas, monospace';
        ctx.fillText('DRONES', leftCenter, leftY);
        leftY += 18;
        ctx.fillStyle = Player.droneLevel > 0 ? '#cc44ff' : '#333333';
        ctx.font = 'bold 14px Share Tech Mono, Consolas, monospace';
        ctx.fillText(Player.droneLevel > 0 ? 'LV ' + '█'.repeat(Player.droneLevel) + '░'.repeat(5 - Player.droneLevel) : 'NONE', leftCenter, leftY);
        leftY += 35;

        // Surge meter
        if (GameConfig.graze.enabled) {
            ctx.fillStyle = '#888888';
            ctx.font = '12px Share Tech Mono, Consolas, monospace';
            ctx.fillText('SURGE', leftCenter, leftY);
            leftY += 12;
            const barW = 140;
            const barH = 12;
            const barX = leftCenter - barW / 2;
            ctx.fillStyle = '#1a0a2e';
            ctx.fillRect(barX, leftY, barW, barH);
            const pct = Scoring.surgeCharge / Scoring.surgeMax;
            const surgeColor = Scoring.surgeActive ? '#ffffff' : (pct >= 1 ? '#ffff00' : '#00ffff');
            ctx.fillStyle = surgeColor;
            ctx.shadowColor = surgeColor;
            ctx.shadowBlur = 0;
            ctx.fillRect(barX, leftY, barW * pct, barH);
            ctx.shadowBlur = 0;
            if (Scoring.surgeActive) {
                leftY += barH + 8;
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 12px Share Tech Mono, Consolas, monospace';
                const surgeTimeText = 'ACTIVE ' + Scoring.surgeDuration.toFixed(1) + 's';
                ctx.fillText(surgeTimeText, leftCenter, leftY);
            } else if (pct >= 1) {
                leftY += barH + 8;
                ctx.fillStyle = '#ffff00';
                ctx.font = 'bold 13px Share Tech Mono, Consolas, monospace';
                ctx.fillText('READY!', leftCenter, leftY);
            }
            leftY += 25;
        }

        // Dash cooldown
        if (GameConfig.dash.enabled) {
            ctx.fillStyle = '#888888';
            ctx.font = '12px Share Tech Mono, Consolas, monospace';
            ctx.fillText('DASH', leftCenter, leftY);
            leftY += 12;
            const dashReady = Player.dashCooldown <= 0;
            ctx.fillStyle = dashReady ? '#00ff88' : '#333333';
            ctx.font = 'bold 12px Share Tech Mono, Consolas, monospace';
            ctx.fillText(dashReady ? 'READY' : Player.dashCooldown.toFixed(1) + 's', leftCenter, leftY);
        }

        // === RIGHT HUD ===

        // Score
        ctx.fillStyle = '#888888';
        ctx.font = '12px Share Tech Mono, Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('SCORE', rightCenter, rightY);
        rightY += 22;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px Share Tech Mono, Consolas, monospace';
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 0;
        ctx.fillText(Scoring.score.toLocaleString(), rightCenter, rightY);
        ctx.shadowBlur = 0;
        rightY += 40;

        // Chain combo
        ctx.fillStyle = '#888888';
        ctx.font = '12px Share Tech Mono, Consolas, monospace';
        ctx.fillText('CHAIN', rightCenter, rightY);
        rightY += 20;
        if (Scoring.chain > 0) {
            ctx.fillStyle = Scoring.multiplier >= 5 ? '#ffff00' : Scoring.multiplier >= 3 ? '#ff8800' : '#ffffff';
            ctx.font = 'bold 18px Share Tech Mono, Consolas, monospace';
            ctx.shadowColor = ctx.fillStyle;
            ctx.shadowBlur = 0;
            ctx.fillText(Scoring.chain + ' HITS', rightCenter, rightY);
            rightY += 18;
            ctx.font = 'bold 14px Share Tech Mono, Consolas, monospace';
            ctx.fillText(Scoring.multiplier + 'x', rightCenter, rightY);
            ctx.shadowBlur = 0;
            // Chain timer bar
            rightY += 10;
            const timerBarW = 120;
            const timerPct = Scoring.chainTimer / (Scoring.chainTimerMax / GameConfig.chainTimerSpeed);
            ctx.fillStyle = '#1a0a2e';
            ctx.fillRect(rightCenter - timerBarW / 2, rightY, timerBarW, 4);
            ctx.fillStyle = timerPct > 0.3 ? '#00ff88' : '#ff4444';
            ctx.fillRect(rightCenter - timerBarW / 2, rightY, timerBarW * timerPct, 4);
        } else {
            ctx.fillStyle = '#333333';
            ctx.font = '14px Share Tech Mono, Consolas, monospace';
            ctx.fillText('---', rightCenter, rightY);
        }
        rightY += 35;

        // Multiplier info
        ctx.fillStyle = '#888888';
        ctx.font = '12px Share Tech Mono, Consolas, monospace';
        ctx.fillText('MULTIPLIER', rightCenter, rightY);
        rightY += 20;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px Share Tech Mono, Consolas, monospace';
        ctx.fillText(GameConfig.scoreMultiplier + 'x BASE', rightCenter, rightY);
        rightY += 35;

        // Graze count with threshold progress
        if (GameConfig.graze.enabled) {
            ctx.fillStyle = '#888888';
            ctx.font = '12px Share Tech Mono, Consolas, monospace';
            ctx.fillText('GRAZE', rightCenter, rightY);
            rightY += 20;
            ctx.fillStyle = '#cc88ff';
            ctx.font = 'bold 16px Share Tech Mono, Consolas, monospace';
            ctx.fillText(Scoring.grazeCount.toString(), rightCenter, rightY);
            // Show next threshold
            if (Scoring.nextGrazeThreshold < Scoring.grazeThresholds.length) {
                const next = Scoring.grazeThresholds[Scoring.nextGrazeThreshold];
                ctx.fillStyle = '#666688';
                ctx.font = '10px Share Tech Mono, Consolas, monospace';
                ctx.fillText('NEXT: ' + next, rightCenter, rightY + 14);
                rightY += 12;
            }
            rightY += 28;
        }

        // Max chain
        ctx.fillStyle = '#888888';
        ctx.font = '12px Share Tech Mono, Consolas, monospace';
        ctx.fillText('MAX CHAIN', rightCenter, rightY);
        rightY += 20;
        ctx.fillStyle = '#ffaa00';
        ctx.font = 'bold 16px Share Tech Mono, Consolas, monospace';
        ctx.fillText(Scoring.maxChain.toString(), rightCenter, rightY);
        rightY += 28;

        // Perfect run indicator
        if (Scoring.isPerfect) {
            ctx.fillStyle = '#00ff88';
            ctx.font = 'bold 12px Share Tech Mono, Consolas, monospace';
            ctx.fillText('★ PERFECT ★', rightCenter, rightY);
            rightY += 22;
        }
        rightY += 14;

        // Difficulty
        ctx.fillStyle = '#888888';
        ctx.font = '12px Share Tech Mono, Consolas, monospace';
        ctx.fillText('DIFFICULTY', rightCenter, rightY);
        rightY += 18;
        const diffColors = { casual: '#00ff88', normal: '#ffff00', hardcore: '#ff4444', custom: '#cc44ff' };
        ctx.fillStyle = diffColors[GameConfig.difficulty] || '#ffffff';
        ctx.font = 'bold 14px Share Tech Mono, Consolas, monospace';
        ctx.fillText(GameConfig.difficulty.toUpperCase(), rightCenter, rightY);
        rightY += 35;

        // Level timer
        ctx.fillStyle = '#888888';
        ctx.font = '12px Share Tech Mono, Consolas, monospace';
        ctx.fillText('TIME', rightCenter, rightY);
        rightY += 18;
        const mins = Math.floor(WaveSystem.levelTimer / 60);
        const secs = Math.floor(WaveSystem.levelTimer % 60);
        ctx.fillStyle = '#ffffff';
        ctx.font = '14px Share Tech Mono, Consolas, monospace';
        ctx.fillText(`${mins}:${secs.toString().padStart(2, '0')}`, rightCenter, rightY);
        rightY += 30;

        // Level / Mode name
        ctx.fillStyle = '#888888';
        ctx.font = '12px Share Tech Mono, Consolas, monospace';
        const isEndless = Game.currentLevelIndex === -1;
        if (isEndless) {
            ctx.fillText('ENDLESS', rightCenter, rightY);
            rightY += 18;
            ctx.fillStyle = '#ffaa00';
            ctx.font = 'bold 14px Share Tech Mono, Consolas, monospace';
            ctx.fillText('WAVE ' + EndlessMode.wave, rightCenter, rightY);
        } else {
            ctx.fillText('LEVEL', rightCenter, rightY);
            rightY += 18;
            const lvlData = ALL_LEVELS[Game.currentLevelIndex];
            ctx.fillStyle = '#aaaaaa';
            ctx.font = '12px Share Tech Mono, Consolas, monospace';
            ctx.fillText((Game.currentLevelIndex + 1) + ': ' + (lvlData ? lvlData.name : '').toUpperCase(), rightCenter, rightY);
        }
        rightY += 25;

        // Escort status (if active)
        if (Escort.active && Escort.alive) {
            ctx.fillStyle = '#888888';
            ctx.font = '12px Share Tech Mono, Consolas, monospace';
            ctx.fillText('ESCORT', rightCenter, rightY);
            rightY += 14;
            const eBarW = 120;
            const eBarH = 8;
            const eBarX = rightCenter - eBarW / 2;
            ctx.fillStyle = '#002200';
            ctx.fillRect(eBarX, rightY, eBarW, eBarH);
            const ePct = Escort.hp / Escort.maxHp;
            ctx.fillStyle = ePct > 0.3 ? '#44aa44' : '#ff4444';
            ctx.fillRect(eBarX, rightY, eBarW * ePct, eBarH);
            ctx.fillStyle = '#88ff88';
            ctx.font = '12px Share Tech Mono, Consolas, monospace';
            ctx.fillText('AURORA', rightCenter, rightY + eBarH + 12);
        }

        // Controls reference at bottom — shows actual bindings
        const controlsY = SCREEN_H - 180;
        ctx.fillStyle = '#667788';
        ctx.font = '12px Share Tech Mono, Consolas, monospace';
        ctx.textAlign = 'center';
        const controls = [
            ['MOVE', Input.getKeyBindDisplay('up').split(' / ')[0] + '/' + Input.getKeyBindDisplay('down').split(' / ')[0]],
            ['FIRE', Input.getKeyBindDisplay('fire')],
            ['FOCUS', Input.getKeyBindDisplay('focus')],
            ['DASH', Input.getKeyBindDisplay('dash')],
            ['BOMB', Input.getKeyBindDisplay('bomb')],
            ['SURGE', Input.getKeyBindDisplay('surge')],
            ['PAUSE', Input.getKeyBindDisplay('pause')]
        ];
        controls.forEach((c, i) => {
            ctx.fillStyle = '#778899';
            ctx.fillText(c[0], rightCenter - 35, controlsY + i * 18);
            ctx.fillStyle = '#888888';
            ctx.fillText(c[1], rightCenter + 35, controlsY + i * 18);
        });

        // Last-life danger indicator — pulsing red edge strips (cheap, no radial gradient)
        if (Player.alive && Player.lives <= 1 && Player.maxShieldHp === 0) {
            const pulse = 0.08 + Math.sin(Date.now() * 0.005) * 0.05;
            const edgeW = 30;
            ctx.fillStyle = `rgba(255, 0, 0, ${pulse})`;
            // Left edge
            const lg = ctx.createLinearGradient(PLAY_X, 0, PLAY_X + edgeW, 0);
            lg.addColorStop(0, `rgba(255, 0, 0, ${pulse})`);
            lg.addColorStop(1, 'rgba(255, 0, 0, 0)');
            ctx.fillStyle = lg;
            ctx.fillRect(PLAY_X, PLAY_Y, edgeW, PLAY_H);
            // Right edge
            const rg = ctx.createLinearGradient(PLAY_X + PLAY_W, 0, PLAY_X + PLAY_W - edgeW, 0);
            rg.addColorStop(0, `rgba(255, 0, 0, ${pulse})`);
            rg.addColorStop(1, 'rgba(255, 0, 0, 0)');
            ctx.fillStyle = rg;
            ctx.fillRect(PLAY_X + PLAY_W - edgeW, PLAY_Y, edgeW, PLAY_H);
        }
    }
};


// === menus.js ===
// ============================================================
//  MENU SYSTEM
// ============================================================
const Menu = {
    selectedIndex: 0,
    items: [],
    titlePulse: 0,
    gridOffset: 0,

    drawTitle(ctx) {
        this.titlePulse += 0.02;
        this.gridOffset += 1.2;

        // Full screen background gradient
        const grad = ctx.createLinearGradient(0, 0, 0, SCREEN_H);
        grad.addColorStop(0, '#050318');
        grad.addColorStop(0.45, '#0a0620');
        grad.addColorStop(0.65, '#1a0a3e');
        grad.addColorStop(0.8, '#3d1a5e');
        grad.addColorStop(0.9, '#6e1a5e');
        grad.addColorStop(1, '#ff006e');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

        // Star field
        for (let i = 0; i < 80; i++) {
            const sx = ((i * 137.5 + this.gridOffset * 0.3) % SCREEN_W);
            const sy = ((i * 97.3 + i * i * 3.1) % (SCREEN_H * 0.65));
            const brightness = 0.2 + (Math.sin(this.titlePulse * 2 + i) * 0.5 + 0.5) * 0.5;
            ctx.fillStyle = `rgba(255, 255, 255, ${brightness})`;
            const size = (i % 3 === 0) ? 2 : 1;
            ctx.fillRect(sx, sy, size, size);
        }

        // Horizon sun glow
        const sunY = SCREEN_H * 0.78;
        const sunGrad = ctx.createRadialGradient(SCREEN_W / 2, sunY, 20, SCREEN_W / 2, sunY, 250);
        sunGrad.addColorStop(0, 'rgba(255, 120, 0, 0.5)');
        sunGrad.addColorStop(0.4, 'rgba(255, 0, 100, 0.2)');
        sunGrad.addColorStop(1, 'rgba(255, 0, 100, 0)');
        ctx.fillStyle = sunGrad;
        ctx.fillRect(0, sunY - 250, SCREEN_W, 500);

        // Sun disc (half circle at horizon)
        ctx.fillStyle = '#ff6600';
        ctx.shadowColor = '#ff6600';
        ctx.shadowBlur = 30;
        ctx.beginPath();
        ctx.arc(SCREEN_W / 2, sunY + 15, 60, Math.PI, 0);
        ctx.fill();
        // Sun stripes
        ctx.fillStyle = '#3d1a5e';
        ctx.shadowBlur = 0;
        for (let s = 0; s < 5; s++) {
            const sy2 = sunY - 40 + s * 12;
            if (sy2 < sunY + 15) {
                ctx.fillRect(SCREEN_W / 2 - 70, sy2, 140, 3);
            }
        }

        // City silhouette on horizon
        ctx.fillStyle = '#0d0520';
        const cityY = sunY + 10;
        const cityBuildings = [
            [200, 30, 50], [240, 20, 80], [270, 35, 40], [320, 15, 100], [345, 40, 60],
            [400, 25, 110], [435, 50, 45], [500, 20, 90], [530, 35, 55], [580, 15, 120],
            [605, 45, 50], [660, 25, 85], [700, 30, 65], [740, 20, 95], [770, 40, 40],
            [1100, 30, 70], [1140, 20, 95], [1170, 35, 50], [1210, 15, 110], [1250, 45, 60],
            [1310, 25, 80], [1350, 40, 45], [1400, 20, 100], [1440, 35, 55], [1500, 15, 90],
            [1530, 50, 40], [1590, 25, 75], [1630, 30, 95], [1670, 20, 55], [1710, 40, 70]
        ];
        for (const [bx, bw, bh] of cityBuildings) {
            ctx.fillRect(bx, cityY - bh, bw, bh + 100);
        }

        // Perspective grid — lower portion
        const horizon = sunY + 15;
        const gridH = SCREEN_H - horizon;
        ctx.save();

        // Horizontal grid lines (perspective, scrolling)
        ctx.strokeStyle = 'rgba(255, 0, 255, 0.3)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 20; i++) {
            const t = (i * 50 + (this.gridOffset * 2) % 50) / (20 * 50);
            const y = horizon + t * t * gridH * 1.2;
            if (y > SCREEN_H || y < horizon) continue;
            ctx.globalAlpha = Math.min(1, t * 4) * 0.35;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(SCREEN_W, y);
            ctx.stroke();
        }

        // Vertical grid lines (converging to vanishing point)
        ctx.globalAlpha = 0.2;
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.2)';
        const vanishX = SCREEN_W / 2;
        for (let i = -16; i <= 16; i++) {
            const bottomX = vanishX + i * 80;
            ctx.beginPath();
            ctx.moveTo(vanishX + i * 2, horizon);
            ctx.lineTo(bottomX, SCREEN_H);
            ctx.stroke();
        }
        ctx.restore();

        // Floating particles — drifting upward
        ctx.globalAlpha = 0.3;
        for (let i = 0; i < 20; i++) {
            const px = ((i * 193.7 + this.gridOffset * 0.5) % SCREEN_W);
            const py = SCREEN_H - ((i * 87.3 + this.gridOffset * (0.3 + i * 0.02)) % (SCREEN_H * 0.5));
            const hue = (this.titlePulse * 20 + i * 18) % 360;
            ctx.fillStyle = `hsla(${hue}, 100%, 70%, 0.2)`;
            ctx.beginPath();
            ctx.arc(px, py, 1.5 + Math.sin(this.titlePulse + i) * 0.8, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        // Title
        const glow = 10 + Math.sin(this.titlePulse) * 5;
        ctx.fillStyle = '#00ffff';
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = glow;
        ctx.font = 'bold 72px Share Tech Mono, Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('NEON STORM \u03b2', SCREEN_W / 2, 280);

        // Subtitle
        ctx.shadowBlur = 5;
        ctx.fillStyle = '#ff00ff';
        ctx.shadowColor = '#ff00ff';
        ctx.font = '18px Share Tech Mono, Consolas, monospace';
        ctx.fillText('BULLET HELL SHOOTER', SCREEN_W / 2, 320);
        ctx.shadowBlur = 0;

        // Menu items
        this.items = ['NEW GAME', 'ENDLESS MODE', 'HANGAR', 'HIGH SCORES', 'ACHIEVEMENTS', 'SETTINGS', 'HOW TO PLAY'];
        const startY = 440;
        for (let i = 0; i < this.items.length; i++) {
            const selected = i === this.selectedIndex;
            const y = startY + i * 50;

            if (selected) {
                ctx.fillStyle = '#00ffff';
                ctx.shadowColor = '#00ffff';
                ctx.shadowBlur = 15;
                ctx.font = 'bold 24px Share Tech Mono, Consolas, monospace';
                // Selection indicator
                ctx.fillText('▸ ' + this.items[i] + ' ◂', SCREEN_W / 2, y);
            } else {
                ctx.fillStyle = '#667788';
                ctx.shadowBlur = 0;
                ctx.font = '20px Share Tech Mono, Consolas, monospace';
                ctx.fillText(this.items[i], SCREEN_W / 2, y);
            }
        }
        ctx.shadowBlur = 0;

        // Footer
        ctx.fillStyle = '#667788';
        ctx.font = '12px Share Tech Mono, Consolas, monospace';
        ctx.fillText('ARROW KEYS TO SELECT  •  ENTER TO CONFIRM', SCREEN_W / 2, SCREEN_H - 60);
        ctx.fillText('GAMEPAD SUPPORTED', SCREEN_W / 2, SCREEN_H - 40);
        ctx.fillStyle = '#ff00ff';
        ctx.font = '13px Share Tech Mono, Consolas, monospace';
        ctx.fillText('ALPHA VERSION — WORK IN PROGRESS', SCREEN_W / 2, SCREEN_H - 20);
    },

    drawDifficultySelect(ctx) {
        // Background
        const grad = ctx.createLinearGradient(0, 0, 0, SCREEN_H);
        grad.addColorStop(0, '#0a0620');
        grad.addColorStop(1, '#1a0a3e');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

        ctx.fillStyle = '#00ffff';
        ctx.font = 'bold 36px Share Tech Mono, Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 10;
        ctx.fillText('SELECT DIFFICULTY', SCREEN_W / 2, 120);
        ctx.shadowBlur = 0;

        this.items = ['CASUAL', 'NORMAL', 'HARDCORE', 'CUSTOM', 'BACK'];
        const descs = [
            '0.5x Score  •  5 Lives  •  All assists ON',
            '1.0x Score  •  3 Lives  •  Standard experience',
            '2.0x Score  •  1 Life   •  No bombs or focus',
            'Mix and match  •  No leaderboard',
            ''
        ];
        const colors = ['#00ff88', '#ffff00', '#ff4444', '#cc44ff', '#888888'];

        const startY = 280;
        for (let i = 0; i < this.items.length; i++) {
            const selected = i === this.selectedIndex;
            const y = startY + i * 90;

            if (selected) {
                // Selection box
                ctx.strokeStyle = colors[i];
                ctx.shadowColor = colors[i];
                ctx.shadowBlur = 10;
                ctx.lineWidth = 2;
                ctx.strokeRect(SCREEN_W / 2 - 250, y - 30, 500, 60);
                ctx.shadowBlur = 0;

                ctx.fillStyle = colors[i];
                ctx.font = 'bold 26px Share Tech Mono, Consolas, monospace';
                ctx.fillText(this.items[i], SCREEN_W / 2, y);
            } else {
                ctx.fillStyle = '#445566';
                ctx.font = '22px Share Tech Mono, Consolas, monospace';
                ctx.fillText(this.items[i], SCREEN_W / 2, y);
            }

            if (descs[i]) {
                ctx.fillStyle = selected ? '#aaaaaa' : '#555555';
                ctx.font = '13px Share Tech Mono, Consolas, monospace';
                ctx.fillText(descs[i], SCREEN_W / 2, y + 22);
            }
        }

        ctx.fillStyle = '#667788';
        ctx.font = '12px Share Tech Mono, Consolas, monospace';
        ctx.fillText('ESC TO GO BACK', SCREEN_W / 2, SCREEN_H - 50);
    },

    drawGameOver(ctx) {
        ctx.fillStyle = 'rgba(10, 6, 18, 0.85)';
        ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
        ctx.textAlign = 'center';

        const isEndless = Game.currentLevelIndex === -1;

        ctx.fillStyle = '#ff0040';
        ctx.shadowColor = '#ff0040';
        ctx.shadowBlur = 20;
        ctx.font = 'bold 52px Share Tech Mono, Consolas, monospace';
        ctx.fillText('GAME OVER', SCREEN_W / 2, 180);
        ctx.shadowBlur = 0;

        // Endless mode stats
        if (isEndless) {
            ctx.fillStyle = '#ffaa00';
            ctx.font = 'bold 20px Share Tech Mono, Consolas, monospace';
            ctx.fillText('ENDLESS MODE — WAVE ' + EndlessMode.wave, SCREEN_W / 2, 220);
            ctx.fillStyle = '#aaaaaa';
            ctx.font = '14px Share Tech Mono, Consolas, monospace';
            const mins = Math.floor(WaveSystem.levelTimer / 60);
            const secs = Math.floor(WaveSystem.levelTimer % 60);
            ctx.fillText('SURVIVED: ' + mins + ':' + secs.toString().padStart(2, '0'), SCREEN_W / 2, 245);
        }

        ctx.fillStyle = '#ffffff';
        ctx.font = '18px Share Tech Mono, Consolas, monospace';
        ctx.fillText('SCORE', SCREEN_W / 2, isEndless ? 280 : 260);
        ctx.font = 'bold 32px Share Tech Mono, Consolas, monospace';
        ctx.fillStyle = '#00ffff';
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 10;
        ctx.fillText(Scoring.score.toLocaleString(), SCREEN_W / 2, isEndless ? 315 : 295);
        ctx.shadowBlur = 0;

        // End-of-run bonuses
        const bonusEndY = EndRunBonus.draw(ctx, SCREEN_W / 2, 330);

        // Total with bonuses
        const totalScore = Scoring.score + EndRunBonus.totalBonus;
        ctx.fillStyle = '#ffff00';
        ctx.font = 'bold 20px Share Tech Mono, Consolas, monospace';
        ctx.fillText('TOTAL: ' + totalScore.toLocaleString(), SCREEN_W / 2, bonusEndY + 15);

        const ncEarned = Math.floor(totalScore / 3000 * GameConfig.scoreMultiplier);
        ctx.fillStyle = '#ffaa00';
        ctx.font = '14px Share Tech Mono, Consolas, monospace';
        ctx.fillText('+ ' + ncEarned + ' NEON CREDITS', SCREEN_W / 2, bonusEndY + 40);

        // High score initial entry or menu
        if (HighScores.enteringInitials) {
            HighScores.drawInitialEntry(ctx, SCREEN_W / 2, bonusEndY + 75);
        } else {
            this.items = ['RETRY', 'MAIN MENU'];
            const startY = bonusEndY + 85;
            for (let i = 0; i < this.items.length; i++) {
                const selected = i === this.selectedIndex;
                if (selected) {
                    ctx.fillStyle = '#00ffff';
                    ctx.font = 'bold 22px Share Tech Mono, Consolas, monospace';
                    ctx.fillText('▸ ' + this.items[i], SCREEN_W / 2, startY + i * 45);
                } else {
                    ctx.fillStyle = '#667788';
                    ctx.font = '18px Share Tech Mono, Consolas, monospace';
                    ctx.fillText(this.items[i], SCREEN_W / 2, startY + i * 45);
                }
            }
        }
    },

    drawVictory(ctx) {
        ctx.fillStyle = 'rgba(10, 6, 18, 0.8)';
        ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
        ctx.textAlign = 'center';

        // Level name
        const lvl = ALL_LEVELS[Game.currentLevelIndex];
        ctx.fillStyle = '#888888'; ctx.font = '14px Share Tech Mono, Consolas, monospace';
        ctx.fillText('LEVEL ' + (Game.currentLevelIndex + 1) + ' — ' + (lvl ? lvl.name.toUpperCase() : ''), SCREEN_W / 2, 155);

        ctx.fillStyle = '#00ffff';
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 25;
        ctx.font = 'bold 48px Share Tech Mono, Consolas, monospace';
        ctx.fillText('MISSION COMPLETE', SCREEN_W / 2, 195);
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#ffffff';
        ctx.font = '18px Share Tech Mono, Consolas, monospace';
        ctx.fillText('SCORE', SCREEN_W / 2, 240);
        ctx.font = 'bold 32px Share Tech Mono, Consolas, monospace';
        ctx.fillStyle = '#ffff00';
        ctx.shadowColor = '#ffff00';
        ctx.shadowBlur = 10;
        ctx.fillText(Scoring.score.toLocaleString(), SCREEN_W / 2, 275);
        ctx.shadowBlur = 0;

        const bonusEndY = EndRunBonus.draw(ctx, SCREEN_W / 2, 310);

        const totalScore = Scoring.score + EndRunBonus.totalBonus;
        ctx.fillStyle = '#00ffff';
        ctx.font = 'bold 22px Share Tech Mono, Consolas, monospace';
        ctx.fillText('TOTAL: ' + totalScore.toLocaleString(), SCREEN_W / 2, bonusEndY + 15);

        const ncEarned = Math.floor(totalScore / 3000 * GameConfig.scoreMultiplier);
        ctx.fillStyle = '#ffaa00';
        ctx.font = '14px Share Tech Mono, Consolas, monospace';
        ctx.fillText('+ ' + ncEarned + ' NEON CREDITS', SCREEN_W / 2, bonusEndY + 40);

        if (HighScores.enteringInitials) {
            HighScores.drawInitialEntry(ctx, SCREEN_W / 2, bonusEndY + 75);
        } else {
            const hasNextLevel = Game.currentLevelIndex < Campaign.getLevelCount() - 1 &&
                Campaign.isLevelAvailable(Game.currentLevelIndex + 1, GameConfig.difficulty === 'custom');
            this.items = hasNextLevel ? ['NEXT LEVEL', 'RETRY', 'MAIN MENU'] :
                (Game.currentLevelIndex >= 4 ? ['CONTINUE...', 'MAIN MENU'] : ['RETRY', 'MAIN MENU']);
            const startY = bonusEndY + 80;
            for (let i = 0; i < this.items.length; i++) {
                const selected = i === this.selectedIndex;
                if (selected) {
                    ctx.fillStyle = this.items[i] === 'NEXT LEVEL' ? '#00ff88' : '#00ffff';
                    ctx.font = 'bold 22px Share Tech Mono, Consolas, monospace';
                    ctx.fillText('▸ ' + this.items[i], SCREEN_W / 2, startY + i * 40);
                } else {
                    ctx.fillStyle = '#667788';
                    ctx.font = '18px Share Tech Mono, Consolas, monospace';
                    ctx.fillText(this.items[i], SCREEN_W / 2, startY + i * 40);
                }
            }
        }
    },

    highScoreTab: 0,

    drawHighScores(ctx) {
        const grad = ctx.createLinearGradient(0, 0, 0, SCREEN_H);
        grad.addColorStop(0, '#0a0620');
        grad.addColorStop(1, '#1a0a3e');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

        ctx.fillStyle = '#00ffff';
        ctx.font = 'bold 36px Share Tech Mono, Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 10;
        ctx.fillText('HIGH SCORES', SCREEN_W / 2, 80);
        ctx.shadowBlur = 0;

        // Tabs — now includes ENDLESS
        const tabs = ['CASUAL', 'NORMAL', 'HARDCORE', 'ENDLESS', 'SESSION'];
        const tabKeys = ['casual', 'normal', 'hardcore', 'endless', 'session'];
        const tabW = 150;
        const tabStartX = SCREEN_W / 2 - (tabs.length * tabW) / 2;
        for (let i = 0; i < tabs.length; i++) {
            const x = tabStartX + i * tabW + tabW / 2;
            const selected = i === this.highScoreTab;
            const colors = ['#00ff88', '#ffff00', '#ff4444', '#ff8800', '#cc44ff'];
            ctx.fillStyle = selected ? colors[i] : '#445566';
            ctx.font = selected ? 'bold 14px Share Tech Mono, Consolas, monospace' : '13px Share Tech Mono, Consolas, monospace';
            ctx.fillText(tabs[i], x, 125);
            if (selected) {
                ctx.fillStyle = colors[i];
                ctx.fillRect(x - tabW / 2 + 15, 133, tabW - 30, 2);
            }
        }

        // Board content
        const tabKey = tabKeys[this.highScoreTab];
        if (tabKey === 'session') {
            // Session scores
            ctx.textAlign = 'center';
            if (HighScores.sessionScores.length === 0) {
                ctx.fillStyle = '#888888';
                ctx.font = '14px Share Tech Mono, Consolas, monospace';
                ctx.fillText('NO SCORES THIS SESSION', SCREEN_W / 2, 200);
            } else {
                ctx.textAlign = 'left';
                const colRank = SCREEN_W / 2 - 280;
                const colName = SCREEN_W / 2 - 230;
                const colScore = SCREEN_W / 2 - 150;
                const colInfo = SCREEN_W / 2 + 50;
                const colDate = SCREEN_W / 2 + 200;
                ctx.fillStyle = '#666666';
                ctx.font = '12px Share Tech Mono, Consolas, monospace';
                ctx.fillText('#', colRank, 170);
                ctx.fillText('NAME', colName, 170);
                ctx.fillText('SCORE', colScore, 170);
                ctx.fillText('INFO', colInfo, 170);
                ctx.fillText('MODE', colDate, 170);

                HighScores.sessionScores.slice(0, 10).forEach((entry, i) => {
                    const ey = 192 + i * 24;
                    ctx.fillStyle = i < 3 ? '#ffaa00' : '#aaaaaa';
                    ctx.font = '13px Share Tech Mono, Consolas, monospace';
                    ctx.fillText((i + 1).toString(), colRank, ey);
                    ctx.fillText(entry.initials, colName, ey);
                    ctx.fillText(entry.score.toLocaleString(), colScore, ey);
                    ctx.fillStyle = '#888888';
                    const info = entry.mode === 'endless' ? 'W' + (entry.wave || '?') : 'L' + (entry.levelReached || '?') + (entry.won ? ' ✓' : '');
                    ctx.fillText(info, colInfo, ey);
                    ctx.fillText((entry.difficulty || '').toUpperCase(), colDate, ey);
                });
            }
        } else {
            // Persistent board (campaign or endless)
            const board = HighScores.boards[tabKey] || [];
            ctx.textAlign = 'center';

            if (board.length === 0) {
                ctx.fillStyle = '#888888';
                ctx.font = '14px Share Tech Mono, Consolas, monospace';
                ctx.fillText('NO SCORES YET', SCREEN_W / 2, 200);
            } else {
                ctx.textAlign = 'left';
                const isEndless = tabKey === 'endless';
                const colRank = SCREEN_W / 2 - 310;
                const colName = SCREEN_W / 2 - 260;
                const colScore = SCREEN_W / 2 - 170;
                const colChain = SCREEN_W / 2 + 10;
                const colInfo = SCREEN_W / 2 + 120;
                const colDate = SCREEN_W / 2 + 240;

                // Header
                ctx.fillStyle = '#666666';
                ctx.font = '12px Share Tech Mono, Consolas, monospace';
                ctx.fillText('#', colRank, 170);
                ctx.fillText('NAME', colName, 170);
                ctx.fillText('SCORE', colScore, 170);
                ctx.fillText('CHAIN', colChain, 170);
                ctx.fillText(isEndless ? 'WAVE' : 'LEVEL', colInfo, 170);
                ctx.fillText('DATE', colDate, 170);

                board.forEach((entry, i) => {
                    const ey = 192 + i * 24;
                    ctx.fillStyle = i === 0 ? '#ffff00' : i < 3 ? '#ffaa00' : '#aaaaaa';
                    ctx.font = i < 3 ? 'bold 13px Share Tech Mono, Consolas, monospace' : '13px Share Tech Mono, Consolas, monospace';
                    ctx.fillText((i + 1).toString(), colRank, ey);
                    ctx.fillText(entry.initials, colName, ey);
                    ctx.fillText(entry.score.toLocaleString(), colScore, ey);
                    ctx.fillText((entry.maxChain || 0).toString(), colChain, ey);
                    if (isEndless) {
                        ctx.fillText('W' + (entry.wave || '?'), colInfo, ey);
                    } else {
                        const lvlText = (entry.levelReached || '?') + '/6' + (entry.won ? ' ✓' : '');
                        ctx.fillText(lvlText, colInfo, ey);
                    }
                    ctx.fillStyle = '#666666';
                    ctx.fillText(entry.date || '', colDate, ey);
                });
            }
        }

        ctx.textAlign = 'center';
        ctx.fillStyle = '#888888';
        ctx.font = '14px Share Tech Mono, Consolas, monospace';

        // NC balance
        ctx.fillStyle = '#ffaa00';
        ctx.font = '16px Share Tech Mono, Consolas, monospace';
        ctx.fillText('NEON CREDITS: ' + NeonCredits.balance, SCREEN_W / 2, SCREEN_H - 120);

        ctx.fillStyle = '#667788';
        ctx.font = '12px Share Tech Mono, Consolas, monospace';
        ctx.fillText('←→ CHANGE TAB    ESC BACK', SCREEN_W / 2, SCREEN_H - 50);
    },

    drawPause(ctx) {
        ctx.fillStyle = 'rgba(10, 6, 18, 0.7)';
        ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

        ctx.textAlign = 'center';
        ctx.fillStyle = '#00ffff';
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 15;
        ctx.font = 'bold 40px Share Tech Mono, Consolas, monospace';
        ctx.fillText('PAUSED', SCREEN_W / 2, 380);
        ctx.shadowBlur = 0;

        if (Game.pauseConfirm) {
            // Confirmation dialog
            const action = Game.pauseConfirm === 'restart' ? 'RESTART LEVEL' : 'QUIT TO MENU';
            ctx.fillStyle = '#ffaa00';
            ctx.font = 'bold 20px Share Tech Mono, Consolas, monospace';
            ctx.fillText('ARE YOU SURE?', SCREEN_W / 2, 460);
            ctx.fillStyle = '#cccccc';
            ctx.font = '16px Share Tech Mono, Consolas, monospace';
            ctx.fillText(action, SCREEN_W / 2, 490);
            ctx.fillStyle = '#667788';
            ctx.font = '14px Share Tech Mono, Consolas, monospace';
            ctx.fillText('ENTER = YES    ESC = NO', SCREEN_W / 2, 530);
        } else {
            this.items = ['RESUME', 'RESTART', 'MAIN MENU'];
            const startY = 470;
            for (let i = 0; i < this.items.length; i++) {
                const selected = i === this.selectedIndex;
                if (selected) {
                    ctx.fillStyle = '#00ffff';
                    ctx.font = 'bold 20px Share Tech Mono, Consolas, monospace';
                    ctx.fillText('▸ ' + this.items[i], SCREEN_W / 2, startY + i * 40);
                } else {
                    ctx.fillStyle = '#667788';
                    ctx.font = '16px Share Tech Mono, Consolas, monospace';
                    ctx.fillText(this.items[i], SCREEN_W / 2, startY + i * 40);
                }
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
            synthwave: { bloomScale: 0.9,  threshold: 0.4  },
            ocean:     { bloomScale: 1.0,  threshold: 0.35 },
            volcanic:  { bloomScale: 1.3,  threshold: 0.28 },
            storm:     { bloomScale: 1.1,  threshold: 0.32 },
            frozen:    { bloomScale: 0.85, threshold: 0.4  },
            void:      { bloomScale: 1.6,  threshold: 0.22 }, // Glitch level — strongest bloom
        };
        const bp = bloomPresets[Background.bgType] || bloomPresets.synthwave;
        Renderer.setBloomIntensity(bp.bloomScale, bp.threshold);

        // Per-level colour grade for distinct mood
        const colorGradePresets = {
            synthwave: { hue:  0,   saturate:  0.25, contrast: 0.1,  brightness:  0    },
            ocean:     { hue: -8,   saturate:  0.15, contrast: 0.08, brightness:  0.05 },
            volcanic:  { hue:  12,  saturate:  0.4,  contrast: 0.2,  brightness:  0.08 },
            storm:     { hue: -5,   saturate:  0.1,  contrast: 0.18, brightness: -0.05 },
            frozen:    { hue: -18,  saturate: -0.1,  contrast: 0.12, brightness:  0.06 },
            void:      { hue:  175, saturate: -0.25, contrast: 0.3,  brightness: -0.08 },
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
                            Particles.spawn(b.x, b.y, 3, { color: '#886644', speed: 50, life: 0.15 });
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

            case 'achievements': {
                const grad = ctx.createLinearGradient(0, 0, 0, SCREEN_H);
                grad.addColorStop(0, '#0a0620'); grad.addColorStop(1, '#1a0a3e');
                ctx.fillStyle = grad; ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
                ctx.textAlign = 'center';
                ctx.fillStyle = '#ffaa00'; ctx.font = 'bold 32px Share Tech Mono, Consolas, monospace';
                ctx.shadowColor = '#ffaa00'; ctx.shadowBlur = 10;
                ctx.fillText('ACHIEVEMENTS', SCREEN_W / 2, 70); ctx.shadowBlur = 0;
                const prog = Achievements.getProgress();
                ctx.fillStyle = '#aaaaaa'; ctx.font = '14px Share Tech Mono, Consolas, monospace';
                ctx.fillText(prog.unlocked + ' / ' + prog.total + ' UNLOCKED', SCREEN_W / 2, 100);
                // Grid of achievements
                const cols = 2;
                const colW = 400;
                const startX = SCREEN_W / 2 - colW;
                const startY = 135;
                const rowH = 48;
                Achievements.defs.forEach((def, i) => {
                    const col = i % cols;
                    const row = Math.floor(i / cols);
                    const x = startX + col * colW;
                    const y = startY + row * rowH;
                    const done = Achievements.isUnlocked(def.id);
                    // Background
                    if (done) {
                        ctx.fillStyle = 'rgba(255, 170, 0, 0.08)';
                        ctx.fillRect(x + 5, y, colW - 10, rowH - 4);
                    }
                    // Icon
                    ctx.font = '18px sans-serif';
                    ctx.textAlign = 'left';
                    ctx.fillStyle = done ? '#ffffff' : '#333344';
                    ctx.fillText(def.icon, x + 15, y + 22);
                    // Name
                    ctx.font = (done ? 'bold ' : '') + '13px Share Tech Mono, Consolas, monospace';
                    ctx.fillStyle = done ? '#ffaa00' : '#556677';
                    ctx.fillText(def.name, x + 45, y + 17);
                    // Description
                    ctx.font = '12px Share Tech Mono, Consolas, monospace';
                    ctx.fillStyle = done ? '#999999' : '#445566';
                    ctx.fillText(def.desc, x + 45, y + 34);
                    // Reward
                    ctx.textAlign = 'right';
                    ctx.fillStyle = done ? '#00ff88' : '#445566';
                    ctx.font = '12px Share Tech Mono, Consolas, monospace';
                    ctx.fillText((done ? '✓ ' : '') + def.reward + ' NC', x + colW - 15, y + 22);
                });
                ctx.textAlign = 'center';
                ctx.fillStyle = '#667788'; ctx.font = '13px Share Tech Mono, Consolas, monospace';
                ctx.fillText('ESC / ENTER TO RETURN', SCREEN_W / 2, SCREEN_H - 40);
                break;
            }

            case 'custom_difficulty':
                CustomDifficulty.draw(ctx);
                break;

            case 'hangar':
                Hangar.draw(ctx);
                break;

            case 'tutorial':
                Tutorial.draw(ctx);
                break;

            case 'level_select': {
                const grad = ctx.createLinearGradient(0, 0, 0, SCREEN_H);
                grad.addColorStop(0, '#0a0620'); grad.addColorStop(1, '#1a0a3e');
                ctx.fillStyle = grad; ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
                ctx.textAlign = 'center';
                ctx.fillStyle = '#00ffff'; ctx.font = 'bold 32px Share Tech Mono, Consolas, monospace';
                ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 10;
                ctx.fillText('SELECT LEVEL', SCREEN_W / 2, 100); ctx.shadowBlur = 0;
                ctx.fillStyle = '#aaaaaa'; ctx.font = '14px Share Tech Mono, Consolas, monospace';
                ctx.fillText('DIFFICULTY: ' + GameConfig.difficulty.toUpperCase(), SCREEN_W / 2, 135);
                const lvlCount = Campaign.getLevelCount();
                const startY = 200;
                for (let i = 0; i <= lvlCount; i++) {
                    const y = startY + i * 55;
                    const selected = i === Menu.selectedIndex;
                    if (i === lvlCount) {
                        ctx.fillStyle = selected ? '#00ffff' : '#667788';
                        ctx.font = selected ? 'bold 18px Share Tech Mono, Consolas, monospace' : '16px Share Tech Mono, Consolas, monospace';
                        ctx.fillText(selected ? '▸ BACK ◂' : 'BACK', SCREEN_W / 2, y);
                    } else {
                        const lvl = ALL_LEVELS[i];
                        const available = Campaign.isLevelAvailable(i, false);
                        const best = Campaign.getLevelBest(i, GameConfig.difficulty);
                        if (selected && available) {
                            ctx.strokeStyle = '#00ffff'; ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 8;
                            ctx.lineWidth = 1.5; ctx.strokeRect(SCREEN_W / 2 - 320, y - 22, 640, 44); ctx.shadowBlur = 0;
                        }
                        // Level name
                        ctx.textAlign = 'left';
                        ctx.fillStyle = !available ? '#334455' : selected ? '#ffffff' : '#99aabb';
                        ctx.font = selected ? 'bold 17px Share Tech Mono, Consolas, monospace' : '15px Share Tech Mono, Consolas, monospace';
                        const lockText = available ? '' : ' [LOCKED]';
                        ctx.fillText((i + 1) + ': ' + (lvl ? lvl.name.toUpperCase() : '') + lockText, SCREEN_W / 2 - 300, y);
                        // Best score (right-aligned)
                        if (best && available) {
                            ctx.textAlign = 'right';
                            ctx.fillStyle = selected ? '#ffff00' : '#888866';
                            ctx.font = '14px Share Tech Mono, Consolas, monospace';
                            ctx.fillText(best.score.toLocaleString(), SCREEN_W / 2 + 200, y - 5);
                            ctx.fillStyle = selected ? '#888888' : '#556655';
                            ctx.font = '11px Share Tech Mono, Consolas, monospace';
                            const extras = [];
                            if (best.maxChain > 0) extras.push('CHAIN:' + best.maxChain);
                            if (best.perfect) extras.push('★PERFECT');
                            ctx.fillText(extras.join('  '), SCREEN_W / 2 + 200, y + 10);
                        } else if (available) {
                            ctx.textAlign = 'right';
                            ctx.fillStyle = '#445555';
                            ctx.font = '12px Share Tech Mono, Consolas, monospace';
                            ctx.fillText('NO RECORD', SCREEN_W / 2 + 200, y);
                        }
                        ctx.textAlign = 'center';
                    }
                }
                ctx.fillStyle = '#667788'; ctx.font = '13px Share Tech Mono, Consolas, monospace';
                ctx.fillText('ESC BACK', SCREEN_W / 2, SCREEN_H - 50);
                break;
            }

            case 'briefing': {
                const grad = ctx.createLinearGradient(0, 0, 0, SCREEN_H);
                grad.addColorStop(0, '#0a0620'); grad.addColorStop(1, '#1a0a3e');
                ctx.fillStyle = grad; ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
                ctx.textAlign = 'center';
                const lvl = ALL_LEVELS[this.currentLevelIndex];
                ctx.fillStyle = '#888888'; ctx.font = '14px Share Tech Mono, Consolas, monospace';
                ctx.fillText('LEVEL ' + (this.currentLevelIndex + 1), SCREEN_W / 2, 350);
                ctx.fillStyle = '#00ffff'; ctx.font = 'bold 32px Share Tech Mono, Consolas, monospace';
                ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 10;
                ctx.fillText(lvl.name.toUpperCase(), SCREEN_W / 2, 390); ctx.shadowBlur = 0;
                const lines = (this.briefingText || '').split('\n');
                ctx.fillStyle = '#cccccc'; ctx.font = '15px Share Tech Mono, Consolas, monospace';
                lines.forEach((line, i) => ctx.fillText(line, SCREEN_W / 2, 440 + i * 24));
                ctx.fillStyle = '#778899'; ctx.font = '13px Share Tech Mono, Consolas, monospace';
                ctx.fillText('PRESS ENTER OR FIRE TO BEGIN', SCREEN_W / 2, 580);
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

            case 'campaign_complete': {
                // Animated celebration background
                const grad = ctx.createLinearGradient(0, 0, 0, SCREEN_H);
                grad.addColorStop(0, '#0a0620');
                grad.addColorStop(0.5, '#1a0a3e');
                grad.addColorStop(1, '#0a0620');
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

                // Animated particles in background
                const cTime = Game.briefingTimer;
                for (let i = 0; i < 30; i++) {
                    const px = (Math.sin(cTime * 0.5 + i * 1.7) * 0.5 + 0.5) * SCREEN_W;
                    const py = (Math.cos(cTime * 0.3 + i * 2.3) * 0.5 + 0.5) * SCREEN_H;
                    const hue = (cTime * 30 + i * 12) % 360;
                    ctx.fillStyle = `hsla(${hue}, 100%, 70%, 0.15)`;
                    ctx.beginPath();
                    ctx.arc(px, py, 2 + Math.sin(cTime + i) * 1.5, 0, Math.PI * 2);
                    ctx.fill();
                }

                ctx.textAlign = 'center';
                const isSecret = Game.currentLevelIndex === 5;

                // Title
                const titleHue = (cTime * 40) % 360;
                ctx.fillStyle = isSecret ? `hsl(${titleHue}, 100%, 70%)` : '#ffff00';
                ctx.shadowColor = isSecret ? `hsl(${titleHue}, 100%, 50%)` : '#ffff00';
                ctx.shadowBlur = 20 + Math.sin(cTime * 3) * 8;
                ctx.font = 'bold 48px Share Tech Mono, Consolas, monospace';
                ctx.fillText(isSecret ? 'SIGNAL TERMINATED' : 'CAMPAIGN COMPLETE', SCREEN_W / 2, 250);
                ctx.shadowBlur = 0;

                // Subtitle
                ctx.fillStyle = '#cccccc';
                ctx.font = '18px Share Tech Mono, Consolas, monospace';
                if (isSecret) {
                    ctx.fillText('You silenced the relay. The void is quiet...', SCREEN_W / 2, 300);
                    ctx.fillText('For now.', SCREEN_W / 2, 325);
                } else {
                    ctx.fillText('The threat has been neutralized.', SCREEN_W / 2, 300);
                    ctx.fillText('Outstanding work, pilot.', SCREEN_W / 2, 325);
                }

                // Stats
                ctx.fillStyle = '#888888';
                ctx.font = '14px Share Tech Mono, Consolas, monospace';
                ctx.fillText('DIFFICULTY: ' + GameConfig.difficulty.toUpperCase(), SCREEN_W / 2, 390);

                ctx.fillStyle = '#00ffff';
                ctx.font = 'bold 20px Share Tech Mono, Consolas, monospace';
                ctx.fillText('TOTAL SCORE: ' + Scoring.score.toLocaleString(), SCREEN_W / 2, 430);

                ctx.fillStyle = '#ffaa00';
                ctx.font = '16px Share Tech Mono, Consolas, monospace';
                ctx.fillText('NEON CREDITS: ' + NeonCredits.balance, SCREEN_W / 2, 465);

                // Secret level hint
                if (!isSecret && !Campaign.secretUnlocked) {
                    ctx.fillStyle = '#555566';
                    ctx.font = '13px Share Tech Mono, Consolas, monospace';
                    ctx.fillText('Something else is out there... beat all levels on Normal to find it.', SCREEN_W / 2, 520);
                } else if (!isSecret && Campaign.secretUnlocked) {
                    ctx.fillStyle = '#ff00ff';
                    ctx.font = 'bold 14px Share Tech Mono, Consolas, monospace';
                    ctx.fillText('SECRET LEVEL UNLOCKED: SIGNAL LOST', SCREEN_W / 2, 520);
                }

                // Thank you
                ctx.fillStyle = '#667788';
                ctx.font = '14px Share Tech Mono, Consolas, monospace';
                ctx.fillText('Thank you for playing Neon Storm \u03b2', SCREEN_W / 2, 580);
                ctx.fillText('This is a beta build \u2014 more to come!', SCREEN_W / 2, 605);

                // Menu options
                const items = ['PLAY AGAIN', 'MAIN MENU'];
                const startY = 680;
                for (let i = 0; i < items.length; i++) {
                    const selected = i === Menu.selectedIndex;
                    if (selected) {
                        ctx.fillStyle = '#00ffff';
                        ctx.font = 'bold 20px Share Tech Mono, Consolas, monospace';
                        ctx.fillText('▸ ' + items[i] + ' ◂', SCREEN_W / 2, startY + i * 45);
                    } else {
                        ctx.fillStyle = '#667788';
                        ctx.font = '16px Share Tech Mono, Consolas, monospace';
                        ctx.fillText(items[i], SCREEN_W / 2, startY + i * 45);
                    }
                }
                break;
            }
        }

        // Transition overlay — always drawn on top of everything
        Transition.draw(ctx);
    }
};


// === main.js ===
// ============================================================
//  GAME LOOP
// ============================================================
function gameLoop(timestamp) {
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


