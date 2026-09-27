// ============================================================
//  GAME LOOP
// ============================================================
function gameLoop(timestamp) {
    FpsMeter.tick(timestamp - Game.lastTime);
    const dt = Math.min((timestamp - Game.lastTime) / 1000, 0.05); // Cap delta to prevent spiral
    Game.lastTime = timestamp;

    Game.update(dt);
    Game.draw();
    Music.update();
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

