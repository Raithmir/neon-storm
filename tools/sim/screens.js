// ============================================================
//  NEON STORM — Every screen, for render tests and screenshots
// ============================================================
// SCREENS: [name, setup] pairs. Each setup runs in the page and puts the game
// into one screen; the caller then draws a frame. render-smoke.js draws them
// all in both layouts; run this file to screenshot them:
//
//   node tools/sim/screens.js [landscape|portrait|WxH] [name filter]
//
// Portrait defaults to a 390×844 phone at 2× and shows the touch controls.
// Shots go to tools/sim/out/screens/<layout>/.

const SCREENS = [
    ['title', () => { Game.state = 'title'; }],
    ['difficulty_select', () => { Game.state = 'difficulty_select'; }],
    ['settings', () => { Game.state = 'settings'; }],
    ['controls', () => { Game.state = 'controls'; }],
    ['high_scores', () => { Game.state = 'high_scores'; for (let t = 0; t < 5; t++) { Menu.highScoreTab = t; Game.draw(); } }],
    ['achievements', () => { Game.state = 'achievements'; }],
    ['custom_difficulty', () => { CustomDifficulty.init(); Game.state = 'custom_difficulty'; }],
    ['hangar', () => {
        Game.state = 'hangar';
        Hangar.mode = 'categories';
        for (let c = 0; c < 5; c++) { Hangar.categoryIndex = c; Game.draw(); }
        Hangar.mode = 'items';
        for (let c = 0; c < 4; c++) {
            Hangar.categoryIndex = c;
            const n = Hangar.catalog[Hangar._getCatalogKey()].length;
            for (let i = 0; i < n; i++) { Hangar.itemIndex = i; Game.draw(); }
        }
        Hangar.mode = 'categories';
    }],
    ['tutorial', () => { Game.state = 'tutorial'; for (let p = 0; p < Tutorial.pages.length; p++) { Tutorial.pageIndex = p; Game.draw(); } }],
    ['level_select', () => { Game.state = 'level_select'; }],
    ['briefing', () => { Game.showBriefing(0); for (let i = 0; i < 10; i++) { Game.briefingTimer = i * 0.5; Game.draw(); } }],
    ['paused', () => { Game.startLevel(0, 'normal', false); Game.state = 'paused'; }],
    ['game_over', () => { EndRunBonus.calculate(false, 0, 10, 10, 60, false); Game.state = 'game_over'; }],
    ['victory', () => { EndRunBonus.calculate(true, 2, 10, 10, 60, true); Game.state = 'victory'; }],
    ['campaign_complete', () => { Game.state = 'campaign_complete'; }],
    ['title (boss rush locked)', () => { Campaign.campaignCleared = false; Game.state = 'title'; Menu.selectedIndex = 2; }],
    ['rush_intermission (weapon pick)', () => { Campaign.campaignCleared = true; Game.startBossRush('normal'); }],
    ['rush_intermission (upgrade)', () => {
        BossRush.apply(BossRush.choices[0]); BossRush.splits = [62.4]; BossRush.time = 62.4; BossRush.stage = 1;
        BossRush.rollChoices(); Game._showRushIntermission();
    }],
    ['rush game_over', () => { Game.state = 'game_over'; }],
    ['rush_complete', () => {
        BossRush.splits = [62, 71, 80, 55, 90]; BossRush.time = 358; BossRush.bonuses(true); Game.state = 'rush_complete';
    }],
    ['high_scores (boss rush tab)', () => { Game.state = 'high_scores'; Menu.highScoreTab = 4; BossRush.active = false; }],
    ['boss_menu', () => { Campaign.bossesDefeated = ['architect', 'furnace']; Game.state = 'boss_menu'; }],
    ['practice_setup', () => { Game._openPracticeSetup(); }],
    ['practice game_over', () => { Game.startPractice(Game._practice); Game.state = 'game_over'; }],
    ['practice_complete', () => { BossRush.time = 64.2; Game._practiceNewBest = true; Game.state = 'practice_complete'; }],
    ['gamepad prompts', () => {
        Input.lastDevice = 'pad';
        for (const st of ['title', 'settings', 'hangar', 'tutorial', 'high_scores']) { Game.state = st; Game.draw(); }
        Input.lastDevice = 'keyboard'; Game.state = 'title';
    }],
    ['touch controls', () => {
        Input.lastDevice = 'touch';
        for (const st of ['title', 'settings', 'paused', 'playing']) { Game.state = st; Game.draw(); }
        Input.lastDevice = 'keyboard'; Game.state = 'title';
    }],
    ['playing (HUD)', () => {
        Game.startLevel(1, 'normal', false);
        Object.assign(Player, { primaryWeapon: 'spread', primaryLevel: 3, droneLevel: 2, bombs: 2, lives: 3 });
        Object.assign(Scoring, { score: 1234567, chain: 42, multiplier: 4, chainTimer: 1.2, surgeCharge: Scoring.surgeMax * 0.6 });
        for (let i = 0; i < 90; i++) Game.update(1 / 60);
        Game.state = 'playing';
    }],
    ['playing (boss, escort, last life)', () => {
        Game.startLevel(2, 'normal', false);
        Boss.init(ALL_LEVELS[2].bossType); Boss.warningTimer = 0;
        Object.assign(Player, { lives: 1, maxShieldHp: 0 });
        Object.assign(Scoring, { surgeCharge: Scoring.surgeMax });
        for (let i = 0; i < 120; i++) Game.update(1 / 60);
        Game.state = 'playing';
    }],
];

// Window sizes for each layout (CSS px)
const LAYOUTS = { landscape: { width: 1600, height: 900 }, portrait: { width: 390, height: 844 } };

async function setLayout(g, layout) {
    const size = LAYOUTS[layout] || (() => { const [w, h] = layout.split('x').map(Number); return { width: w, height: h }; })();
    await g.page.setViewportSize(size);
    await g.ev(() => { resizeCanvas(); });
    return size;
}

module.exports = { SCREENS, LAYOUTS, setLayout };

if (require.main === module) {
    const fs = require('fs');
    const path = require('path');
    const { launch } = require('./harness');
    const layout = process.argv[2] || 'portrait';
    const filter = process.argv[3] || '';
    (async () => {
        const g = await launch({ draw: true, dpr: 2 });
        const size = await setLayout(g, layout);
        const touch = size.height > size.width;
        const dir = path.join(__dirname, 'out', 'screens', layout);
        fs.mkdirSync(dir, { recursive: true });
        for (const [name, setup] of SCREENS) {
            if (filter && !name.includes(filter)) continue;
            await g.ev(([src, touch]) => {
                Menu.selectedIndex = 0;
                Input.lastDevice = touch ? 'touch' : 'keyboard';
                (new Function('return (' + src + ')'))()();
                Input.lastDevice = touch ? 'touch' : 'keyboard';
                Game.draw();
            }, [setup.toString(), touch]);
            const file = path.join(dir, name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') + '.png');
            await g.page.screenshot({ path: file });
            console.log(file);
        }
        if (g.errors.length) console.log('ERRORS:\n' + g.errors.join('\n'));
        await g.close();
    })().catch(e => { console.error(e); process.exit(1); });
}
