// ============================================================
//  NEON STORM — Core Constants & Canvas Setup
// ============================================================

// --- Screen / Layout ---
// The play area is always PLAY_W × PLAY_H. The overlay's logical size and the
// play area's place in it depend on the window (Layout.update):
//   landscape: 1920×1080, the play area centred with HUD panels either side
//   portrait:  as wide as the play area (or wider, if the window is short) and
//              as tall as the window's shape; a HUD strip on top, the play
//              area under it, and room for touch controls at the bottom
// Draw code uses these names as before; they change only on a resize.
const PLAY_W = 720;
const PLAY_H = 960;
let SCREEN_W = 1920;
let SCREEN_H = 1080;
let PLAY_X = (SCREEN_W - PLAY_W) / 2;
let PLAY_Y = (SCREEN_H - PLAY_H) / 2;
let HUD_LEFT_W = PLAY_X;
let HUD_RIGHT_X = PLAY_X + PLAY_W;
let HUD_RIGHT_W = SCREEN_W - HUD_RIGHT_X;

const Layout = {
    portrait: false,
    scale: 1,            // CSS px per logical px
    version: 0,          // bumps when the logical layout changes (caches rebake)
    HUD_TOP: 150,        // portrait: height of the HUD strip above the play area

    // Portrait whenever the window is clearly taller than wide
    _wantPortrait(W, H) { return H > W * 1.1; },

    // CSS px kept free under the play area for the touch controls (touch.js
    // sizes its buttons from the same unit)
    controlsH(W, H) { return 5.8 * Math.max(28, Math.min(48, Math.min(W, H) / 10)); },

    update() {
        const W = window.innerWidth, H = window.innerHeight;
        const portrait = this._wantPortrait(W, H);
        let sw, sh, px, py, scale;
        if (portrait) {
            scale = Math.min(W / PLAY_W, (H - this.controlsH(W, H)) / (this.HUD_TOP + PLAY_H));
            sw = W / scale; sh = H / scale;
            px = (sw - PLAY_W) / 2; py = this.HUD_TOP;
        } else {
            sw = 1920; sh = 1080;
            scale = Math.min(W / sw, H / sh);
            px = (sw - PLAY_W) / 2; py = (sh - PLAY_H) / 2;
        }
        // Whole logical px keep the overlay canvas crisp
        sw = Math.round(sw); sh = Math.round(sh);
        if (portrait !== this.portrait || sw !== SCREEN_W || sh !== SCREEN_H) this.version++;
        this.portrait = portrait;
        this.scale = scale;
        SCREEN_W = sw; SCREEN_H = sh;
        PLAY_X = Math.round(px); PLAY_Y = py;
        HUD_LEFT_W = PLAY_X;
        HUD_RIGHT_X = PLAY_X + PLAY_W;
        HUD_RIGHT_W = SCREEN_W - HUD_RIGHT_X;
    },

    // Bottom of the area menus lay out in: in portrait, everything below the
    // play area is left to the touch controls
    menuBottom() { return this.portrait ? PLAY_Y + PLAY_H : SCREEN_H; },
};

// Canvas 2D overlay — menus, HUD, transitions
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// Scale canvases to fit window
function resizeCanvas() {
    Layout.update();
    const scale = Layout.scale;
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
// Safe initial sizing (Renderer is not defined yet — just size the overlay canvas)
Layout.update();
canvas.style.width = (SCREEN_W * Layout.scale) + 'px';
canvas.style.height = (SCREEN_H * Layout.scale) + 'px';
canvas.width = SCREEN_W;
canvas.height = SCREEN_H;
