// ============================================================
//  NEON STORM — Core Engine
// ============================================================

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

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

canvas.width = SCREEN_W;
canvas.height = SCREEN_H;

// Scale canvas to fit window
function resizeCanvas() {
    const scaleX = window.innerWidth / SCREEN_W;
    const scaleY = window.innerHeight / SCREEN_H;
    const scale = Math.min(scaleX, scaleY);
    canvas.style.width = (SCREEN_W * scale) + 'px';
    canvas.style.height = (SCREEN_H * scale) + 'px';
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();
