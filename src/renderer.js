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

        const src = new PIXI.CanvasSource({ resource: c, width: W, height: H });
        const tex = (x, y, w, h) => new PIXI.Texture({ source: src, frame: new PIXI.Rectangle(x, y, w, h) });
        return {
            glow: tex(0, 0, 64, 64), orb: tex(64, 0, 32, 32), core: tex(96, 0, 32, 32),
            shadow: tex(128, 0, 32, 32), streak: tex(160, 0, 16, 64), needle: tex(176, 0, 16, 64),
            missile: tex(192, 0, 16, 32), spark: tex(208, 0, 8, 32),
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
            this._updateBackdrop(Math.min(0.1, (now - (this._lastFrameTime || now)) / 1000));
            this._lastFrameTime = now;
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
