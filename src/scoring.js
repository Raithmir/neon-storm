// ============================================================
//  SCORING SYSTEM
// ============================================================
const Scoring = {
    score: 0,
    chain: 0,
    chainTimer: 0,
    chainTimerMax: 3.0,
    maxChain: 0,
    multiplier: 1,
    surgeCharge: 0,
    surgeMax: 100,
    surgeActive: false,
    surgeDuration: 0,
    surgeMaxDuration: 5.0,
    grazeCount: 0,
    neonCredits: 0,

    // Perfect run tracking
    deathCount: 0,
    bombCount: 0,
    isPerfect: true,  // No deaths AND no bombs this level

    // Graze thresholds for bonus popups (per level)
    grazeThresholds: [25, 50, 100, 200, 500],
    nextGrazeThreshold: 0,

    // Per-level counters (end-of-level bonuses and level records use these)
    levelStartScore: 0,
    levelGrazes: 0,
    levelMaxChain: 0,

    // Extra lives at score milestones (normal-difficulty points; scaled by the score multiplier)
    extendThresholds: [300000, 1000000, 2000000, 4000000],
    nextExtend: 0,

    // Floating popup text system
    popups: [],

    spawnPopup(text, color, size) {
        this.popups.push({
            text,
            color: color || '#ffff00',
            size: size || 24,
            x: PLAY_W / 2,
            y: PLAY_H * 0.35,
            life: 2.0,
            maxLife: 2.0,
            vy: -40
        });
    },

    // Point-blank kill bonus
    // distance: pixels between player and enemy at time of kill
    addKill(basePoints, distance) {
        const prevMultiplier = this.multiplier;
        this.chain++;
        this.chainTimer = this.chainTimerMax / GameConfig.chainTimerSpeed;
        if (this.chain > this.maxChain) this.maxChain = this.chain;
        if (this.chain > this.levelMaxChain) this.levelMaxChain = this.chain;
        this._updateMultiplier();

        // Point-blank bonus: 3x within 60px, 2x within 120px, 1.5x within 200px
        let pointBlankMult = 1;
        let pointBlankLabel = '';
        if (distance !== undefined && distance < 60) {
            pointBlankMult = 3; pointBlankLabel = 'POINT BLANK! 3x';
        } else if (distance !== undefined && distance < 120) {
            pointBlankMult = 2; pointBlankLabel = 'CLOSE KILL! 2x';
        } else if (distance !== undefined && distance < 200) {
            pointBlankMult = 1.5; pointBlankLabel = 'NEAR KILL! 1.5x';
        }

        let pts = basePoints * this.multiplier * pointBlankMult * GameConfig.scoreMultiplier;
        if (this.surgeActive) pts *= 3;
        this.score += Math.floor(pts);

        // Each kill contributes a little surge charge; grazing (5 each) is the main source
        this.surgeCharge = Math.min(this.surgeMax, this.surgeCharge + 1.5);

        // Point-blank popup (only for 2x+)
        if (pointBlankMult >= 2) {
            this.spawnPopup(pointBlankLabel, pointBlankMult >= 3 ? '#ff00ff' : '#ffaa00', pointBlankMult >= 3 ? 22 : 16);
        }

        // Chain milestone SFX + popup
        if (this.multiplier > prevMultiplier) {
            Audio.playChainMilestone(this.multiplier);
            const milestoneColors = { 2: '#ffaa00', 3: '#ff8800', 5: '#ff4400', 8: '#ff00ff' };
            this.spawnPopup(
                this.chain + ' HITS! ' + this.multiplier + 'x',
                milestoneColors[this.multiplier] || '#ffff00',
                this.multiplier >= 5 ? 30 : 24
            );
        }
    },

    addGraze() {
        this.grazeCount++;
        this.levelGrazes++;
        const reward = 5 * (GameConfig.graze.rewardMultiplier || 1);
        this.surgeCharge = Math.min(this.surgeMax, this.surgeCharge + reward);
        this.score += Math.floor(10 * GameConfig.scoreMultiplier);

        // Graze threshold milestones
        if (this.nextGrazeThreshold < this.grazeThresholds.length &&
            this.levelGrazes >= this.grazeThresholds[this.nextGrazeThreshold]) {
            const count = this.grazeThresholds[this.nextGrazeThreshold];
            const bonusScore = count * 10;
            this.score += Math.floor(bonusScore * GameConfig.scoreMultiplier);
            this.spawnPopup(count + ' GRAZES! +' + bonusScore, '#00ffff', 20);
            this.nextGrazeThreshold++;
        }
    },

    // A player shot connected: keeps the chain timer topped up while you keep
    // hitting (DoDonPachi-style), so skilled players can bridge wave gaps on tough enemies
    onHit() {
        if (this.chain > 0 && this.chainTimer > 0) {
            const max = this.chainTimerMax / GameConfig.chainTimerSpeed;
            this.chainTimer = Math.min(max, this.chainTimer + 0.08);
        }
    },

    // Start-of-level bookkeeping (level score, per-level bonus counters, milestones)
    beginLevel() {
        this.levelStartScore = this.score;
        this.levelGrazes = 0;
        this.levelMaxChain = 0;
        this.levelDeaths = 0;
        this.levelBombs = 0;
        this.nextGrazeThreshold = 0;
    },

    get levelScore() {
        return this.score - this.levelStartScore;
    },

    _checkExtends() {
        const mult = GameConfig.scoreMultiplier || 1;
        while (this.nextExtend < this.extendThresholds.length &&
               this.score >= this.extendThresholds[this.nextExtend] * mult) {
            this.nextExtend++;
            if (Player.lives < 9) {
                Player.lives++;
                this.spawnPopup('EXTEND! 1UP', '#00ff88', 28);
                Audio.playPowerUp();
            }
        }
    },

    recordDeath() {
        this.deathCount++;
        this.levelDeaths++;
        this.isPerfect = false;
    },

    recordBomb() {
        this.bombCount++;
        this.levelBombs++;
        this.isPerfect = false;
    },

    activateSurge() {
        if (this.surgeCharge >= this.surgeMax && !this.surgeActive) {
            this.surgeActive = true;
            this.surgeDuration = this.surgeMaxDuration;
            this.surgeCharge = 0;
            this.spawnPopup('NEON SURGE!', '#ffffff', 32);
            return true;
        }
        return false;
    },

    _updateMultiplier() {
        // Tiers sized so 5x is reachable with good play and 8x is an expert goal
        // (the old 50/100 thresholds were never reached in simulated campaigns)
        if (this.chain >= 60) this.multiplier = 8;
        else if (this.chain >= 35) this.multiplier = 5;
        else if (this.chain >= 20) this.multiplier = 3;
        else if (this.chain >= 10) this.multiplier = 2;
        else this.multiplier = 1;
    },

    update(dt) {
        this._checkExtends();
        if (this.chainTimer > 0) {
            this.chainTimer -= dt;
            if (this.chainTimer <= 0) {
                this.chain = 0;
                this.multiplier = 1;
            }
        }
        if (this.surgeActive) {
            this.surgeDuration -= dt;
            if (this.surgeDuration <= 0) {
                this.surgeActive = false;
            }
        }
        // Update popups
        for (let i = this.popups.length - 1; i >= 0; i--) {
            const p = this.popups[i];
            p.y += p.vy * dt;
            p.life -= dt;
            if (p.life <= 0) this.popups.splice(i, 1);
        }
    },

    drawPopups(ctx) {
        for (const p of this.popups) {
            const alpha = Math.min(1, p.life / (p.maxLife * 0.3)); // Fade out in last 30%
            const scale = 1 + (1 - p.life / p.maxLife) * 0.3; // Grow slightly over time
            ctx.globalAlpha = alpha;
            Neon.text(ctx, p.text, p.x, p.y, p.color, Math.round(p.size * scale));
        }
        ctx.globalAlpha = 1;
    },

    breakChain() {
        if (this.multiplier >= 2) {
            this.spawnPopup('CHAIN BROKEN', '#ff4444', 20);
        }
        this.chain = 0;
        this.chainTimer = 0;
        this.multiplier = 1;
    },

    // Soft reset — between campaign levels. Keep score + maxChain, clear per-level state.
    softReset() {
        this.chain = 0;
        this.chainTimer = 0;
        this.multiplier = 1;
        this.surgeCharge = 0;
        this.surgeActive = false;
        this.surgeDuration = 0;
        this.nextGrazeThreshold = 0;
        // Keep: score, maxChain, grazeCount, deathCount, bombCount, isPerfect, nextExtend
        this.popups = [];
        this.beginLevel();
    },

    reset() {
        this.score = 0;
        this.chain = 0;
        this.chainTimer = 0;
        this.maxChain = 0;
        this.multiplier = 1;
        this.surgeCharge = 0;
        this.surgeActive = false;
        this.surgeDuration = 0;
        this.grazeCount = 0;
        this.deathCount = 0;
        this.bombCount = 0;
        this.isPerfect = true;
        this.nextGrazeThreshold = 0;
        this.nextExtend = 0;
        this.popups = [];
        this.beginLevel();
    }
};
