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
