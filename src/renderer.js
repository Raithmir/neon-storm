// ============================================================
//  RENDERER — Canvas 2D glow + optional PixiJS screen effects
//
//  Architecture:
//    1. Gameplay draws to offscreen Canvas 2D (720×960)
//    2. Glow halos draw to a second offscreen Canvas 2D
//    3. Both are composited onto a THIRD offscreen canvas
//       (glow behind with additive blend, game on top)
//    4. If PixiJS is available, the composited result is
//       uploaded to a GPU texture for screen-space filters
//       (chromatic aberration, CRT scanlines, screen flash)
//    5. If PixiJS is unavailable, the composite canvas is
//       blitted directly onto the overlay
//
//  The glow layer uses NO GPU resources — pure Canvas 2D.
//  PixiJS renders only 1 sprite + 1 flash overlay.
// ============================================================
const Renderer = {
    app: null,
    pixiCanvas: null,
    ready: false,
    usePixi: false,

    // Offscreen canvases
    offCanvas: null,     // Gameplay drawing
    offCtx: null,
    glowCanvas: null,    // Glow halos
    glowCtx: null,
    compCanvas: null,    // Composited result (glow + game)
    compCtx: null,

    // PixiJS objects (minimal — 1 sprite + 1 flash)
    gameTexture: null,
    _canvasSource: null,
    gameSprite: null,

    // Screen flash
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

    // Pre-rendered glow gradient
    _glowImg: null,

    async init() {
        // Create all offscreen canvases
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

            // Single sprite showing the composited canvas
            this._canvasSource = new PIXI.CanvasSource({
                resource: this.compCanvas,
                width: PLAY_W,
                height: PLAY_H,
            });
            this.gameTexture = new PIXI.Texture(this._canvasSource);
            this.gameSprite = new PIXI.Sprite(this.gameTexture);
            this.app.stage.addChild(this.gameSprite);

            // Screen flash overlay
            this._flashSprite = new PIXI.Sprite(PIXI.Texture.WHITE);
            this._flashSprite.width = PLAY_W;
            this._flashSprite.height = PLAY_H;
            this._flashSprite.alpha = 0;
            this._flashSprite.blendMode = 'add';
            this.app.stage.addChild(this._flashSprite);

            // Context loss handling
            this.pixiCanvas.addEventListener('webglcontextlost', (e) => {
                e.preventDefault();
                console.warn('[Renderer] WebGL context lost');
                this.usePixi = false;
            });
            this.pixiCanvas.addEventListener('webglcontextrestored', () => {
                console.log('[Renderer] WebGL context restored');
                this.usePixi = true;
            });

            // Screen-space filters (these are cheap — no render textures needed unless active)
            this._initChromaFilter();
            this._initCRTFilter();

            this.usePixi = true;
            this.ready = true;
            console.log('[Renderer] PixiJS v' + PIXI.VERSION + ' (' + this.app.renderer.name + ')');
        } catch (e) {
            console.warn('[Renderer] PixiJS init failed:', e);
            this.ready = true;
        }
    },

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
        return c; // Return as canvas — drawImage accepts canvas elements
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

    _rebuildFilterChain() {
        if (!this.app) return;
        const filters = [];
        if (this._chromaFilter && (this._chromaTimer > 0 || this._chromaPersist)) filters.push(this._chromaFilter);
        if (this._crtFilter && this._crtEnabled) filters.push(this._crtFilter);
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
        if (this._flashTimer > 0) {
            this._flashTimer -= dt;
            const t = Math.max(0, this._flashTimer / this._flashDuration);
            this._flashSprite.alpha = t * 0.8;
            this._flashSprite.tint = this._flashColor;
            if (this._flashTimer <= 0) this._flashSprite.alpha = 0;
        }
    },

    // Composite glow + game → compCanvas
    endFrame() {
        const c = this.compCtx;
        c.clearRect(0, 0, PLAY_W, PLAY_H);
        // Draw game first
        c.globalCompositeOperation = 'source-over';
        c.drawImage(this.offCanvas, 0, 0);
        // Glow on top with additive blending — makes bright areas glow
        c.globalCompositeOperation = 'lighter';
        c.drawImage(this.glowCanvas, 0, 0);
        c.globalCompositeOperation = 'source-over';

        if (this.usePixi) {
            this._canvasSource.update();
            this.app.renderer.render(this.app.stage);
        }
    },

    // For Canvas 2D fallback — game.js calls this to blit onto overlay
    blitToOverlay(targetCtx, x, y) {
        targetCtx.drawImage(this.compCanvas, x, y);
    },

    setShake(x, y) {
        if (this.usePixi && this.gameSprite) {
            this.gameSprite.position.set(x, y);
        }
    },

    resize(scale, pixiLeft, pixiTop) {
        if (!this.pixiCanvas) return;
        this.pixiCanvas.style.width = (PLAY_W * scale) + 'px';
        this.pixiCanvas.style.height = (PLAY_H * scale) + 'px';
        this.pixiCanvas.style.left = pixiLeft + 'px';
        this.pixiCanvas.style.top = pixiTop + 'px';
    },

    // --- Glow API (pure Canvas 2D — no GPU) ---

    // Cache of pre-tinted glow images per colour
    _glowCache: {},

    _getTintedGlow(colorHex) {
        if (this._glowCache[colorHex]) return this._glowCache[colorHex];
        // Create a tinted version of the glow gradient
        const size = 64;
        const c = document.createElement('canvas');
        c.width = size; c.height = size;
        const g = c.getContext('2d');
        // Draw the white gradient
        g.drawImage(this._glowImg, 0, 0);
        // Tint it by drawing colour on top with 'source-in' (only where gradient has alpha)
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

    // API compatibility stubs
    setBloomIntensity() {},

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
