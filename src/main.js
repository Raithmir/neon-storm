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

// Initialize and start
Game.init().then(() => {
    requestAnimationFrame((timestamp) => {
        Game.lastTime = timestamp;
        gameLoop(timestamp);
    });
});

