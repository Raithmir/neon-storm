// ============================================================
//  NEON STORM — Boss time-to-kill measurement
// ============================================================
// An invincible autopilot moves under the boss and holds fire from boss entry to
// defeat, holding Focus once lined up (as a player would). Times include phase-transition invulnerability
// and any minions the boss spawns.
//
// Usage: node tools/sim/boss-ttk.js [levelIndex,...]   (default: all 6 bosses)
// Results: tools/sim/out/boss-ttk-L<n>.json

const { launch, writeResult } = require('./harness');

const LOADOUTS = [['none', 0], ['spread', 3], ['spread', 5], ['homing', 5], ['laser', 3], ['laser', 5]];
const MAX_FIGHT_MS = 150000;

async function measure(levelIndex, weapon, level) {
    const g = await launch();
    await g.ev(([lvl, weapon, level]) => {
        Game.startLevel(lvl, 'normal', false);
        Asteroids.clear(); Escort.active = false;
        WaveSystem.currentWaveIndex = WaveSystem.waves.length; Enemies.clear(); // straight to the boss
        Player.primaryWeapon = weapon; Player.primaryLevel = level;
        GameConfig.fireMode = 'manual';
        Input.keys['Space'] = true;
        const S = window.__ttk = { enter: null, dead: null, phaseChanges: [] };
        const update = Game.update.bind(Game);
        Game.update = (dt) => {
            Player.invincible = true; Player.invincibleTimer = 99;
            if (Boss.active) {
                // Like a player: hold Focus once lined up under the boss (tightens spread)
                const lined = Math.abs(Boss.x - Player.x) < 40;
                Input.keys['ShiftLeft'] = lined;
                const step = Player.speed * (lined ? GameConfig.focus.speedMultiplier : 1) * dt;
                Player.x += Math.max(-step, Math.min(step, Boss.x - Player.x));
                Player.y += Math.max(-step, Math.min(step, 780 - Player.y));
            }
            const phase = Boss.phase;
            update(dt);
            if (Boss.entered && S.enter === null) S.enter = WaveSystem.levelTimer;
            if (S.enter !== null && Boss.phase !== phase) S.phaseChanges.push(+(WaveSystem.levelTimer - S.enter).toFixed(1));
            if (Boss.defeated && S.dead === null) S.dead = WaveSystem.levelTimer;
        };
    }, [levelIndex, weapon, level]);
    for (let t = 0; t < MAX_FIGHT_MS + 10000; t += 5000) {
        await g.run(5000);
        if (await g.ev(() => window.__ttk.dead !== null)) break;
    }
    const r = await g.ev(() => {
        const S = window.__ttk;
        return {
            boss: Boss.bossName,
            ttkSeconds: S.dead !== null ? +(S.dead - S.enter).toFixed(1) : null,
            phaseChangesAt: S.phaseChanges,
        };
    });
    await g.close();
    return { level: levelIndex + 1, weapon: weapon + (level ? ' L' + level : ''), ...r };
}

(async () => {
    const levels = process.argv[2] ? process.argv[2].split(',').map(Number) : [0, 1, 2, 3, 4, 5];
    for (const lvl of levels) {
        const rows = [];
        for (const [w, l] of LOADOUTS) rows.push(await measure(lvl, w, l));
        console.table(rows.map(r => ({ ...r, ttkSeconds: r.ttkSeconds ?? '>' + MAX_FIGHT_MS / 1000, phaseChangesAt: r.phaseChangesAt.join(' / ') })));
        writeResult(`boss-ttk-L${lvl + 1}.json`, rows);
    }
})();
