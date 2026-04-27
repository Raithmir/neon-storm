// ============================================================
//  RENDERER — PixiJS pipeline with offscreen Canvas 2D bridge
//
//  How it works:
//    1. All gameplay .draw(ctx) methods draw to an offscreen
//       Canvas 2D context (playCtx) — zero code changes needed
//    2. That canvas is uploaded as a PIXI.Texture each frame
//    3. PixiJS displays it as a Sprite, enabling GPU filters
//       (bloom, blur, distortion) to be layered on top
//    4. Menus / HUD / transitions draw to the overlay canvas
//
//  When PixiJS isn't available, playCtx IS the overlay ctx
//  with standard clip + translate, and the game looks like alpha.
// ============================================================
const Renderer = {
    app: null,
    pixiCanvas: null,
    ready: false,
    usePixi: false,

    // Offscreen canvas for gameplay drawing (Canvas 2D)
    offCanvas: null,
    offCtx: null,       // This is what .draw(ctx) methods receive

    // PixiJS objects
    gameTexture: null,
    gameSprite: null,

    async init() {
        // Create the offscreen canvas for gameplay rendering
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

            // Insert Pixi canvas into DOM before the overlay
            const container = document.getElementById('game-container');
            if (container) {
                container.insertBefore(this.pixiCanvas, canvas);
            } else {
                canvas.parentNode.insertBefore(this.pixiCanvas, canvas);
            }

            // Create texture from the offscreen canvas
            this.gameTexture = PIXI.Texture.from(this.offCanvas);

            // Create sprite that displays the offscreen canvas
            this.gameSprite = new PIXI.Sprite(this.gameTexture);
            this.app.stage.addChild(this.gameSprite);

            this.usePixi = true;
            this.ready = true;
            console.log('[Renderer] PixiJS v' + PIXI.VERSION + ' (' + this.app.renderer.name + ')');
        } catch (e) {
            console.warn('[Renderer] PixiJS init failed:', e);
            this.ready = true;
        }
    },

    // Get the context that gameplay .draw() methods should use.
    // Always returns a real Canvas 2D context.
    getPlayCtx() {
        return this.offCtx;
    },

    // Call before gameplay drawing each frame
    beginFrame() {
        // Clear the offscreen canvas
        this.offCtx.clearRect(0, 0, PLAY_W, PLAY_H);
    },

    // Call after gameplay drawing — uploads to GPU and renders
    endFrame() {
        if (!this.usePixi) return;
        // Update the texture from the offscreen canvas
        this.gameTexture.source.update();
        // Render the PixiJS stage (sprite + any filters)
        this.app.renderer.render(this.app.stage);
    },

    // Apply screen shake offset
    setShake(x, y) {
        if (this.usePixi && this.gameSprite) {
            this.gameSprite.position.set(x, y);
        }
    },

    // Position the Pixi canvas to match the play area
    resize(scale, pixiLeft, pixiTop) {
        if (!this.pixiCanvas) return;
        this.pixiCanvas.style.width = (PLAY_W * scale) + 'px';
        this.pixiCanvas.style.height = (PLAY_H * scale) + 'px';
        this.pixiCanvas.style.left = pixiLeft + 'px';
        this.pixiCanvas.style.top = pixiTop + 'px';
    }
};
