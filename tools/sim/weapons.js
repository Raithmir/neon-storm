// ============================================================
//  NEON STORM — Weapon DPS measurement
// ============================================================
// Holds fire for 10 s at a stationary, high-HP dummy 250 px ahead and reports
// the damage per second actually dealt, for every weapon and level, against a
// boss-sized (r=50) and a scout-sized (r=12) target.
//
// Usage: node tools/sim/weapons.js   Results: tools/sim/out/weapons.json

const { launch, writeResult } = require('./harness');

const LOADOUTS = [['none', 0]];
for (const w of ['spread', 'homing', 'laser']) for (let l = 1; l <= 5; l++) LOADOUTS.push([w, l]);
const TARGETS = { boss: { radius: 50, distance: 250 }, scout: { radius: 12, distance: 250 } };
const SECONDS = 10;

(async () => {
    const g = await launch();
    const rows = [];
    for (const [target, { radius, distance }] of Object.entries(TARGETS)) {
        for (const [weapon, level] of LOADOUTS) {
            await g.ev(([weapon, level, radius, distance]) => {
                Game.startLevel(0, 'normal', false);
                WaveSystem.waves = []; Asteroids.clear();
                Player.primaryWeapon = weapon; Player.primaryLevel = level; Player.droneLevel = 0;
                Player.x = 360; Player.y = 800;
                Player.invincible = true; Player.invincibleTimer = 999;
                GameConfig.fireMode = 'manual';
                const dummy = Enemies.spawn('carrier', 360, 800 - distance, 'static');
                dummy.hp = dummy.maxHp = 1e9; dummy.radius = radius;
                dummy.fireTimer = dummy.fireRate = 1e9; dummy.dropChance = 0;
                window.__dummy = dummy;
                Input.keys['Space'] = true;
            }, [weapon, level, radius, distance]);
            await g.run(200);
            const start = await g.ev(() => window.__dummy.hp);
            await g.run(SECONDS * 1000);
            const end = await g.ev(() => window.__dummy.hp);
            await g.key('Space', false);
            const dps = +((start - end) / SECONDS).toFixed(1);
            rows.push({ target, weapon: weapon + (level ? ' L' + level : ''), dps });
        }
    }
    await g.close();
    console.table(rows);
    writeResult('weapons.json', rows);
})();
