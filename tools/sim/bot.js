// ============================================================
//  NEON STORM — Simulation bot (runs inside the page)
// ============================================================
// installBot(opts) is serialised by Playwright and evaluated in the page, so it
// must be self-contained. It wraps Game.update and drives the real Input.keys.
//
// Each decision it tries 17 moves (8 directions × full/focus speed, plus standing
// still), scores them against projected threats, and steers towards a target.
//
// opts:
//   human         false = perfect information, re-decides every frame
//                 true  = reaction time, perception noise, limited attention,
//                         committed decisions (see HUMAN below)
//   countHits     true = hits are counted instead of killing the player
//   abilities     true = bombs when cornered, death-bombs, dashes, fires Surge
//   seekPickups   true = collects drones and its own weapon colour when safe,
//                        steers around other colours (random-pickup etiquette)

function installBot(opts) {
    const HUMAN = {
        reactionMs: 180,  // a new bullet is invisible for this long
        noisePx: 5,       // position noise on perceived threats
        attention: 24,    // only the nearest N threats are considered
        decisionMs: 100,  // re-decides this often and commits in between
    };
    const HORIZON = opts.human ? 0.26 : 0.3;
    const STEPS = 6;
    const K = Input.keys;
    const DIRS = [[0, 0]];
    for (let a = 0; a < 8; a++) DIRS.push([Math.cos(a * Math.PI / 4), Math.sin(a * Math.PI / 4)]);

    const S = window.__bot = {
        hitsWaves: 0, hitsBoss: 0, bombs: 0, deathBombs: 0, dashes: 0, surges: 0,
        pickupsTaken: 0, maxBullets: 0, decision: null, decisionTimer: 0, press: [],
        pendingSince: null, pickupLog: [],
    };

    // Bullet birth time (for reaction delay)
    const spawn = Enemies.enemyBullets.spawn.bind(Enemies.enemyBullets);
    Enemies.enemyBullets.spawn = (...a) => {
        const b = spawn(...a);
        if (b) b._born = (WaveSystem.levelTimer * 1000);
        return b;
    };

    if (opts.countHits) {
        Player._die = function () {
            if (this.invincible) return;
            Boss.active ? S.hitsBoss++ : S.hitsWaves++;
            this.invincible = true; this.invincibleTimer = 1.0;
        };
    }
    const collect = Player._collectPowerUp.bind(Player);
    Player._collectPowerUp = (p) => {
        S.pickupsTaken++;
        const before = Player.primaryWeapon + ' L' + Player.primaryLevel;
        const r = collect(p);
        S.pickupLog.push({ level: Game.currentLevelIndex + 1, t: Math.round(WaveSystem.levelTimer), type: p.type, before, after: Player.primaryWeapon + ' L' + Player.primaryLevel });
        return r;
    };

    const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;

    function perceive() {
        const now = (WaveSystem.levelTimer * 1000);
        const near = o => Math.abs(o.x - Player.x) < 200 && Math.abs(o.y - Player.y) < 260;
        let threats = [];
        for (const b of Enemies.enemyBullets.pool) {
            if (!b.active || b.harmless > 0.1 || !near(b)) continue;
            if (opts.human && b._born && now - b._born < HUMAN.reactionMs) continue;
            threats.push(b);
        }
        for (const e of Enemies.list) if (near(e)) threats.push({ x: e.x, y: e.y, vx: 0, vy: e.retreating ? -90 : (e.speed || 0), radius: e.radius });
        for (const a of Asteroids.list) if (near(a)) threats.push(a);
        if (Boss.active && Boss.entered) threats.push({ x: Boss.x, y: Boss.y, vx: 0, vy: 0, radius: Boss.radius });
        if (opts.human) {
            threats.sort((a, b) => ((a.x - Player.x) ** 2 + (a.y - Player.y) ** 2) - ((b.x - Player.x) ** 2 + (b.y - Player.y) ** 2));
            threats = threats.slice(0, HUMAN.attention).map(t => ({
                x: t.x + gauss() * HUMAN.noisePx, y: t.y + gauss() * HUMAN.noisePx,
                vx: t.vx || 0, vy: t.vy || 0, radius: t.radius,
            }));
        }
        return threats;
    }

    function danger(px, py, threats) {
        let d = 0;
        for (const b of threats) {
            for (let k = 1; k <= STEPS; k++) {
                const t = HORIZON * k / STEPS;
                const dx = b.x + (b.vx || 0) * t - px[k], dy = b.y + (b.vy || 0) * t - py[k];
                const r = Player.hitboxRadius + b.radius + 3;
                const dd = dx * dx + dy * dy;
                if (dd < r * r) d += 1000 / k;
                else if (dd < 900) d += 90 / (dd + 1) / k;
            }
        }
        return d;
    }

    function wantPickup(p) {
        if (p.type === 'drone') return Player.droneLevel < 5;
        if (Player.primaryWeapon === 'none') return true;
        return p.type === Player.primaryWeapon && Player.primaryLevel < 5;
    }

    function target() {
        let tx = PLAY_W / 2, ty = PLAY_H - 150;
        if (Boss.active && Boss.entered) tx = Boss.x;
        else {
            let lowest = null;
            for (const e of Enemies.list) if (e.y > 0 && !e.retreating && (!lowest || e.y > lowest.y)) lowest = e;
            if (lowest) tx = lowest.x;
        }
        if (opts.seekPickups) {
            let best = null, bestD = 320 * 320;
            for (const p of PowerUps.list) {
                if (!wantPickup(p) || p.y < 250) continue;
                const d = (p.x - Player.x) ** 2 + (p.y - Player.y) ** 2;
                if (d < bestD) { bestD = d; best = p; }
            }
            if (best) { tx = best.x; ty = Math.max(ty - 200, best.y + 20); }
        }
        return [tx, ty];
    }

    function decide() {
        const threats = perceive();
        const [tx, ty] = target();
        const avoid = opts.seekPickups ? PowerUps.list.filter(p => !wantPickup(p)) : [];
        let best = Infinity, choice = [0, 0, false];
        for (const focus of [false, true]) {
            if (focus && !GameConfig.focus.enabled) continue;
            const spd = Player.speed * (focus ? GameConfig.focus.speedMultiplier : 1);
            for (const [dx, dy] of DIRS) {
                const px = [], py = [];
                for (let k = 0; k <= STEPS; k++) {
                    const t = HORIZON * k / STEPS;
                    px.push(Math.max(14, Math.min(PLAY_W - 14, Player.x + dx * spd * t)));
                    py.push(Math.max(14, Math.min(PLAY_H - 14, Player.y + dy * spd * t)));
                }
                let c = danger(px, py, threats);
                c += Math.abs(px[STEPS] - tx) * 0.01 + Math.abs(py[STEPS] - ty) * 0.01;
                if (px[STEPS] < 40 || px[STEPS] > PLAY_W - 40) c += 2;
                for (const p of avoid) {
                    const d2 = (p.x + 0 - px[STEPS]) ** 2 + (p.y + p.vy * HORIZON - py[STEPS]) ** 2;
                    if (d2 < 40 * 40) c += 5;
                }
                if (c < best) { best = c; choice = [dx, dy, focus]; }
            }
        }
        return { choice, cornered: best >= 1000 };
    }

    function press(key) { S.press.push(key); }

    function botStep(dt) {
        // Release keys pressed last frame
        for (const k of ['KeyB', 'KeyC', 'KeyF']) K[k] = false;
        while (S.press.length) K[S.press.pop()] = true;
        if (!Player.alive) { K.Space = true; return; }

        // Death-bomb window: react after the reaction time, if still inside the window
        if (opts.abilities && Player.deathPending > 0) {
            if (S.pendingSince === null) S.pendingSince = (WaveSystem.levelTimer * 1000);
            const waited = (WaveSystem.levelTimer * 1000) - S.pendingSince;
            if (!opts.human || waited >= HUMAN.reactionMs) { press('KeyB'); S.deathBombs++; S.pendingSince = null; }
        } else S.pendingSince = null;

        S.decisionTimer -= dt * 1000;
        if (!opts.human || S.decisionTimer <= 0 || !S.decision) {
            S.decision = decide();
            S.decisionTimer = opts.human ? HUMAN.decisionMs : 0;
            if (opts.abilities && S.decision.cornered && !Player.invincible) {
                if (GameConfig.bombs.enabled && Player.bombs > 0 && !Player.bombActive) { press('KeyB'); S.bombs++; }
                else if (GameConfig.dash.enabled && Player.dashCooldown <= 0) { press('KeyC'); S.dashes++; }
            }
        }
        const [dx, dy, focus] = S.decision.choice;
        K.ArrowLeft = dx < -0.3; K.ArrowRight = dx > 0.3;
        K.ArrowUp = dy < -0.3; K.ArrowDown = dy > 0.3;
        K.ShiftLeft = focus; K.Space = true;

        // Surge in busy moments
        if (opts.abilities && Scoring.surgeCharge >= Scoring.surgeMax && !Scoring.surgeActive &&
            ((Boss.active && Boss.entered) || Enemies.list.length >= 4)) { press('KeyF'); S.surges++; }
    }

    const update = Game.update.bind(Game);
    Game.update = (dt) => {
        if (Game.state === 'playing') botStep(dt);
        update(dt);
        S.maxBullets = Math.max(S.maxBullets, Enemies.enemyBullets.pool.length);
    };
}

module.exports = { installBot };
