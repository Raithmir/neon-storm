// ============================================================
//  NEON STORM — Full-level play-through with a dodging bot
// ============================================================
// Plays one whole level through the real input path with the bot in bot.js,
// with power-up drops disabled so every level uses the same fixed loadout.
//
// Default (perfect bot): hits are COUNTED instead of killing the player, so the
// level is always played to the end. The bot sees exact bullet velocities, so use
// it to spot stalls, undodgeable patterns and escort failures, not difficulty.
// --human: reaction time, perception noise and limited attention; hits are real,
// and the bot bombs/dashes/uses Surge. Use it (and campaign.js) for difficulty.
//
// Usage: node tools/sim/playthrough.js <levelIndex> [difficulty] [weapon] [weaponLevel] [--human]
// Results: tools/sim/out/playthrough-L<n>-<difficulty>.json

const { launch, writeResult } = require('./harness');
const { installBot } = require('./bot');

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const HUMAN = process.argv.includes('--human');
const [lvl, diff, weapon, weaponLevel] = [
    +(args[0] || 0), args[1] || 'normal', args[2] || 'spread', +(args[3] || 3),
];
const MAX_MS = 360000;

(async () => {
    const g = await launch();
    await g.ev(([lvl, diff, weapon, weaponLevel]) => {
        Settings.values.fireMode = 'manual';
        Game.startLevel(lvl, diff, false);
        Player.primaryWeapon = weapon; Player.primaryLevel = weaponLevel; Player.droneLevel = 0;
        PowerUps.spawn = () => {}; // fixed loadout, so levels are comparable
        window.__stats = { lastWaveAt: null, bossStartAt: null, bossDefeatedAt: null };
    }, [lvl, diff, weapon, weaponLevel]);
    await g.page.evaluate(installBot, { human: HUMAN, countHits: !HUMAN, abilities: HUMAN, seekPickups: false });
    await g.ev(() => {
        const S = window.__stats;
        const update = Game.update.bind(Game);
        Game.update = (dt) => {
            update(dt);
            if (S.lastWaveAt === null && WaveSystem.currentWaveIndex >= WaveSystem.waves.length) S.lastWaveAt = WaveSystem.levelTimer;
            if (S.bossStartAt === null && Boss.active && Boss.entered) S.bossStartAt = WaveSystem.levelTimer;
            if (S.bossDefeatedAt === null && Boss.defeated) S.bossDefeatedAt = WaveSystem.levelTimer;
        };
    });

    for (let t = 0; t < MAX_MS; t += 10000) {
        await g.run(10000);
        if (await g.ev(() => window.__stats.bossDefeatedAt !== null || Game.state !== 'playing')) break;
    }

    const r = await g.ev(() => {
        const S = window.__stats, B = window.__bot;
        let outcome = 'boss defeated';
        if (S.bossDefeatedAt === null) {
            if (Game.state === 'game_over') outcome = Escort.alive === false ? 'game over: escort destroyed' : 'game over';
            else if (S.bossStartAt === null) outcome = 'stalled: boss never arrived';
            else outcome = 'boss not defeated in time';
        }
        return {
            level: Game.currentLevelIndex + 1,
            difficulty: GameConfig.difficulty,
            loadout: Player.primaryWeapon + ' L' + Player.primaryLevel,
            outcome,
            deaths: Scoring.levelDeaths,
            hitsDuringWaves: B.hitsWaves,
            hitsDuringBoss: B.hitsBoss,
            bombsUsed: Scoring.levelBombs,
            secondsUntilLastWave: S.lastWaveAt !== null ? +S.lastWaveAt.toFixed(1) : null,
            bossDelayAfterLastWave: S.bossStartAt !== null && S.lastWaveAt !== null ? +(S.bossStartAt - S.lastWaveAt).toFixed(1) : null,
            bossFightSeconds: S.bossDefeatedAt !== null ? +(S.bossDefeatedAt - S.bossStartAt).toFixed(1) : null,
            maxBulletsOnScreen: B.maxBullets,
            score: Scoring.score,
            enemiesLeftOnField: Enemies.list.map(e => e.type + '@' + Math.round(e.x) + ',' + Math.round(e.y)),
        };
    });
    await g.close();
    console.log(JSON.stringify(r, null, 2));
    writeResult(`playthrough-L${lvl + 1}-${diff}${HUMAN ? '-human' : ''}.json`, r);
})();
