// ============================================================
//  GAME CONFIG (Difficulty System)
// ============================================================
const DIFFICULTY_PRESETS = {
    casual: {
        bombs: { enabled: true, startCount: 5 },
        focus: { enabled: true, speedMultiplier: 0.4 },
        dash: { enabled: true, cooldown: 1.5 },
        graze: { enabled: true, zoneMultiplier: 1.4, rewardMultiplier: 0.8 },
        autofire: true,
        lives: 5,
        shieldHp: 0,
        deathPenalty: 'none',
        bulletDensity: 0.4,
        chainTimerSpeed: 0.7,
        scoreMultiplier: 0.5
    },
    normal: {
        bombs: { enabled: true, startCount: 3 },
        focus: { enabled: true, speedMultiplier: 0.4 },
        dash: { enabled: true, cooldown: 2.0 },
        graze: { enabled: true, zoneMultiplier: 1.0, rewardMultiplier: 1.0 },
        autofire: false,
        lives: 3,
        shieldHp: 0,
        deathPenalty: 'moderate',
        bulletDensity: 1.0,
        chainTimerSpeed: 1.0,
        scoreMultiplier: 1.0
    },
    hardcore: {
        bombs: { enabled: false, startCount: 0 },
        focus: { enabled: false, speedMultiplier: 1.0 },
        dash: { enabled: true, cooldown: 3.0 },
        graze: { enabled: true, zoneMultiplier: 0.7, rewardMultiplier: 1.5 },
        autofire: false,
        lives: 1,
        shieldHp: 0,
        deathPenalty: 'full',
        bulletDensity: 1.3,
        chainTimerSpeed: 1.4,
        scoreMultiplier: 2.0
    }
};

let GameConfig = JSON.parse(JSON.stringify(DIFFICULTY_PRESETS.normal));
GameConfig.difficulty = 'normal';
GameConfig.fireMode = 'manual'; // 'auto' or 'manual'
