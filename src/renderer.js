// ============================================================
//  RENDERER — PixiJS pipeline: bloom, glow, screen effects
//
//  Layer order (back to front):
//    1. Glow container (additive blend, behind game)
//    2. Game sprite (offscreen Canvas 2D as texture)
//
//  Filters on stage: bloom, chromatic aberration, CRT scanlines
//  Screen flash: overlay sprite with timed fade
//
//  Canvas 2D fallback: all effect calls are no-ops.
// ============================================================
const Renderer = {
    app: null,
    pixiCanvas: null,
    ready: false,
    usePixi: false,

    // Offscreen canvas
    offCanvas: null,
    offCtx: null,

    // PixiJS objects
    gameTexture: null,
    gameSprite: null,

    // Bloom
    bloomFilter: null,

    // Glow layer
    glowContainer: null,
    _glowTexture: null,
    _glowSprites: [],
    _glowSpriteIdx: 0,
    _glowPoolSize: 200,

    // Screen flash overlay
    _flashSprite: null,
    _flashTimer: 0,
    _flashDuration: 0,
    _flashColor: 0xffffff,

    // Chromatic aberration
    _chromaFilter: null,
    _chromaTimer: 0,
    _chromaDuration: 0,
    _chromaIntensity: 0,
    _chromaPersist: false,   // For Level 6 persistent aberration

    // CRT scanline filter
    _crtFilter: null,
    _crtEnabled: false,

    async init() {
        this.offCanvas = document.createElement('canvas');
        this.offCanvas.width = PLAY_W;
        this.offCanvas.height = PLAY_H;
        this.offCtx = this.offCanvas.getContext('2d');

        if (typeof PIXI === 'undefined') {
            console.warn('[Renderer] PixiJS not loaded — Canvas 2D fallback');
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
            });

            this.pixiCanvas = this.app.canvas;
            this.pixiCanvas.id = 'pixi-play';

            const container = document.getElementById('game-container');
            if (container) {
                container.insertBefore(this.pixiCanvas, canvas);
            } else {
                canvas.parentNode.insertBefore(this.pixiCanvas, canvas);
            }

            // --- Glow layer (behind game, additive) ---
            this.glowContainer = new PIXI.Container();
            this.glowContainer.blendMode = 'add';
            this.app.stage.addChild(this.glowContainer);

            this._glowTexture = this._createGlowTexture(64);
            for (let i = 0; i < this._glowPoolSize; i++) {
                const s = new PIXI.Sprite(this._glowTexture);
                s.anchor.set(0.5);
                s.visible = false;
                s.blendMode = 'add';
                this.glowContainer.addChild(s);
                this._glowSprites.push(s);
            }

            // --- Game sprite ---
            this.gameTexture = PIXI.Texture.from(this.offCanvas);
            this.gameSprite = new PIXI.Sprite(this.gameTexture);
            this.app.stage.addChild(this.gameSprite);

            // --- Screen flash overlay ---
            this._flashSprite = new PIXI.Sprite(PIXI.Texture.WHITE);
            this._flashSprite.width = PLAY_W;
            this._flashSprite.height = PLAY_H;
            this._flashSprite.alpha = 0;
            this._flashSprite.blendMode = 'add';
            this.app.stage.addChild(this._flashSprite);

            // --- Filters ---
            this._initBloom();
            this._initChromaFilter();
            this._initCRTFilter();
            this._rebuildFilterChain();

            this.usePixi = true;
            this.ready = true;
            console.log('[Renderer] PixiJS v' + PIXI.VERSION + ' (' + this.app.renderer.name + ')');
        } catch (e) {
            console.warn('[Renderer] PixiJS init failed:', e);
            this.ready = true;
        }
    },

    // --- Filter init ---

    _initBloom() {
        try {
            const F = (typeof PIXIFilters !== 'undefined' && PIXIFilters.AdvancedBloomFilter)
                    || (PIXI.filters && PIXI.filters.AdvancedBloomFilter);
            if (F) {
                this.bloomFilter = new F({
                    threshold: 0.35, bloomScale: 0.8,
                    brightness: 1.0, blur: 6, quality: 2,
                });
            }
        } catch (e) {
            console.warn('[Renderer] Bloom filter unavailable:', e);
        }
    },

    _initChromaFilter() {
        // Chromatic aberration — RGB channel offset shader
        try {
            const vertSrc = `
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
                }`;
            const fragSrc = `
                in vec2 vTextureCoord;
                uniform sampler2D uTexture;
                uniform float uOffset;
                void main(void) {
                    float r = texture(uTexture, vTextureCoord + vec2(uOffset, 0.0)).r;
                    float g = texture(uTexture, vTextureCoord).g;
                    float b = texture(uTexture, vTextureCoord - vec2(uOffset, 0.0)).b;
                    float a = texture(uTexture, vTextureCoord).a;
                    gl_FragColor = vec4(r, g, b, a);
                }`;
            this._chromaFilter = PIXI.Filter.from({
                gl: { vertex: vertSrc, fragment: fragSrc },
                resources: {
                    chromaUniforms: { uOffset: { value: 0.0, type: 'f32' } }
                }
            });
        } catch (e) {
            // Custom shaders may fail on some backends
            console.warn('[Renderer] Chromatic aberration unavailable:', e);
        }
    },

    _initCRTFilter() {
        // CRT scanline overlay — simple darkening every other line
        try {
            const fragSrc = `
                in vec2 vTextureCoord;
                uniform sampler2D uTexture;
                uniform vec4 uInputSize;
                uniform float uIntensity;
                void main(void) {
                    vec4 color = texture(uTexture, vTextureCoord);
                    float line = mod(vTextureCoord.y * uInputSize.y, 2.0);
                    float scanline = 1.0 - step(1.0, line) * uIntensity;
                    gl_FragColor = vec4(color.rgb * scanline, color.a);
                }`;
            const vertSrc = `
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
                }`;
            this._crtFilter = PIXI.Filter.from({
                gl: { vertex: vertSrc, fragment: fragSrc },
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
        if (this.bloomFilter) filters.push(this.bloomFilter);
        if (this._chromaFilter && (this._chromaTimer > 0 || this._chromaPersist)) filters.push(this._chromaFilter);
        if (this._crtFilter && this._crtEnabled) filters.push(this._crtFilter);
        this.app.stage.filters = filters.length > 0 ? filters : null;
    },

    _createGlowTexture(size) {
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
        return PIXI.Texture.from(c);
    },

    // --- Frame lifecycle ---

    getPlayCtx() {
        return this.offCtx;
    },

    beginFrame() {
        this.offCtx.clearRect(0, 0, PLAY_W, PLAY_H);
        if (!this.usePixi) return;
        for (let i = 0; i < this._glowSpriteIdx; i++) {
            this._glowSprites[i].visible = false;
        }
        this._glowSpriteIdx = 0;
    },

    // Call with dt to update timed effects (chromatic aberration, screen flash)
    updateEffects(dt) {
        if (!this.usePixi) return;

        // Chromatic aberration decay
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

        // Screen flash decay
        if (this._flashTimer > 0) {
            this._flashTimer -= dt;
            const t = Math.max(0, this._flashTimer / this._flashDuration);
            this._flashSprite.alpha = t * 0.8;
            this._flashSprite.tint = this._flashColor;
            if (this._flashTimer <= 0) {
                this._flashSprite.alpha = 0;
            }
        }
    },

    endFrame() {
        if (!this.usePixi) return;
        this.gameTexture.source.update();
        this.app.renderer.render(this.app.stage);
    },

    setShake(x, y) {
        if (!this.usePixi) return;
        this.gameSprite.position.set(x, y);
        this.glowContainer.position.set(x, y);
    },

    resize(scale, pixiLeft, pixiTop) {
        if (!this.pixiCanvas) return;
        this.pixiCanvas.style.width = (PLAY_W * scale) + 'px';
        this.pixiCanvas.style.height = (PLAY_H * scale) + 'px';
        this.pixiCanvas.style.left = pixiLeft + 'px';
        this.pixiCanvas.style.top = pixiTop + 'px';
    },

    // --- Glow API ---

    addGlow(x, y, color, size, alpha) {
        if (!this.usePixi) return;
        if (this._glowSpriteIdx >= this._glowPoolSize) return;
        const s = this._glowSprites[this._glowSpriteIdx++];
        s.position.set(x, y);
        s.width = size * 2;
        s.height = size * 2;
        s.tint = color;
        s.alpha = alpha || 0.4;
        s.visible = true;
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
    setBloomIntensity(bloomScale, threshold) {
        if (!this.bloomFilter) return;
        if (bloomScale !== undefined) this.bloomFilter.bloomScale = bloomScale;
        if (threshold !== undefined) this.bloomFilter.threshold = threshold;
    },

    // --- Screen-space effects API ---

    // Trigger chromatic aberration (brief RGB split on damage/bomb)
    triggerChroma(intensity, duration) {
        if (!this._chromaFilter) return;
        this._chromaIntensity = intensity || 0.008;
        this._chromaDuration = duration || 0.3;
        this._chromaTimer = this._chromaDuration;
        this._rebuildFilterChain();
    },

    // Set persistent chromatic aberration (for Level 6 atmosphere)
    setPersistentChroma(intensity) {
        if (!this._chromaFilter) return;
        this._chromaPersist = intensity > 0;
        this._chromaIntensity = intensity;
        this._rebuildFilterChain();
    },

    // Trigger a screen flash (white/coloured overlay that fades out)
    triggerFlash(color, duration) {
        if (!this.usePixi) return;
        this._flashColor = color || 0xffffff;
        this._flashDuration = duration || 0.3;
        this._flashTimer = this._flashDuration;
        this._flashSprite.alpha = 0.8;
        this._flashSprite.tint = this._flashColor;
    },

    // Toggle CRT scanline filter
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
