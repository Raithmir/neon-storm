// ============================================================
//  NEON STORM — Full campaign run with the human-like bot
// ============================================================
// Plays Level 1 onwards as one continuous run, exactly as the game carries it
// between levels (lives, bombs, weapons, score, extends), with power-ups ON and
// the bot collecting them the way a player would under random pickups.
// Hits are real; the run ends at game over or after the last level.
//
// Per level it records deaths, bombs, lives, extends, weapon progress, the best
// chain multiplier and Surge use. Runs are random (spawns, drops), so run several.
//
// Usage: node tools/sim/campaign.js [difficulty] [runLabel]
// Results: tools/sim/out/campaign-<difficulty>-<runLabel>.json

const { launch, writeResult } = require('./harness');
const { installBot } = require('./bot');

const DIFF = process.argv[2] || 'normal';
const LABEL = process.argv[3] || '1';
const LAST_LEVEL = DIFF === 'casual' ? 4 : 5; // the secret Level 6 needs Normal or Hardcore
const MAX_LEVEL_MS = 420000;

(async () => {
    const g = await launch();
    await g.ev((diff) => {
        Settings.values.fireMode = 'manual';
        Game.startLevel(0, diff, false);
        const C = window.__campaign = { levels: [], runTime: 0, weaponReached: {}, extends: 0, level: null };
        const extend = Scoring._checkExtends.bind(Scoring);
        Scoring._checkExtends = () => { const before = Scoring.nextExtend; extend(); C.extends += Scoring.nextExtend - before; };
        const update = Game.update.bind(Game);
        Game.update = (dt) => {
            update(dt);
            if (Game.state !== 'playing') return;
            C.runTime += dt;
            const L = C.level;
            if (!L) return;
            L.maxMultiplier = Math.max(L.maxMultiplier, Scoring.multiplier);
            L.maxChain = Math.max(L.maxChain, Scoring.chain);
            const lvl = Player.primaryLevel;
            for (const mark of [3, 5]) {
                if (lvl >= mark && C.weaponReached['L' + mark] === undefined) {
                    C.weaponReached['L' + mark] = { atLevel: Game.currentLevelIndex + 1, runSeconds: Math.round(C.runTime), weapon: Player.primaryWeapon };
                }
            }
        };
    }, DIFF);
    await g.page.evaluate(installBot, { human: true, countHits: false, abilities: true, seekPickups: true });

    const beginLevel = () => g.ev(() => {
        window.__campaign.level = {
            level: Game.currentLevelIndex + 1, livesAtStart: Player.lives, bombsAtStart: Player.bombs,
            weaponAtStart: Player.primaryWeapon + ' L' + Player.primaryLevel, dronesAtStart: Player.droneLevel,
            maxMultiplier: 1, maxChain: 0, surgesAtStart: window.__bot.surges, extendsAtStart: window.__campaign.extends,
        };
    });

    await beginLevel();
    for (let level = 0; level <= LAST_LEVEL; level++) {
        for (let t = 0; t < MAX_LEVEL_MS; t += 5000) {
            await g.run(5000);
            if (await g.ev(() => Game.state !== 'playing')) break;
        }
        const r = await g.ev(() => {
            const C = window.__campaign, L = C.level;
            return {
                ...L,
                outcome: Game.state === 'victory' ? 'cleared' : Game.state === 'game_over' ? 'game over' : 'timed out (' + Game.state + ')',
                seconds: Math.round(WaveSystem.levelTimer),
                deaths: Scoring.levelDeaths,
                bombsUsed: Scoring.levelBombs,
                livesAtEnd: Player.lives,
                extendsEarned: C.extends - L.extendsAtStart,
                surgesUsed: window.__bot.surges - L.surgesAtStart,
                weaponAtEnd: Player.primaryWeapon + ' L' + Player.primaryLevel,
                dronesAtEnd: Player.droneLevel,
                score: Scoring.score,
            };
        });
        console.log(JSON.stringify(r));
        await g.ev((r) => window.__campaign.levels.push(r), r);
        if (r.outcome !== 'cleared' || level === LAST_LEVEL) break;
        // Continue the run exactly as the victory screen's "next level" does
        await g.ev(() => { HighScores.enteringInitials = false; Game.startLevel(Game.currentLevelIndex + 1, GameConfig.difficulty, true); });
        await beginLevel();
    }

    const summary = await g.ev(() => {
        const C = window.__campaign, B = window.__bot;
        return {
            difficulty: GameConfig.difficulty,
            levelsCleared: C.levels.filter(l => l.outcome === 'cleared').length,
            totalDeaths: C.levels.reduce((a, l) => a + l.deaths, 0),
            extendsEarned: C.extends,
            weaponReached: C.weaponReached,
            midBosses: (B.midBosses || []).map(m => ({ level: m.level, type: m.type, outcome: m.outcome, seconds: m.end !== null ? +(m.end - m.start).toFixed(1) : null })),
            pickupsTaken: B.pickupsTaken,
            firstPickups: B.pickupLog.slice(0, 12),
            deathBombAttempts: B.deathBombs,
            finalScore: Scoring.score,
            levels: C.levels,
        };
    });
    await g.close();
    console.log(JSON.stringify({ ...summary, levels: undefined }, null, 2));
    writeResult(`campaign-${DIFF}-${LABEL}.json`, summary);
})();
