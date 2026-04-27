// ============================================================
//  BACKGROUND RENDERER — Parallax + Per-Theme Silhouettes
// ============================================================
const Background = {
    gridOffset: 0,
    bgType: 'synthwave',

    // Parallax layers
    farStars: [],    // Slowest — distant stars/particles
    midLayer: [],    // Medium — theme-specific mid elements
    nearLayer: [],   // Fastest — foreground silhouette elements

    init() {
        // Far stars (all themes)
        this.farStars = [];
        for (let i = 0; i < 60; i++) {
            this.farStars.push({
                x: Math.random() * PLAY_W,
                y: Math.random() * PLAY_H,
                size: 0.5 + Math.random() * 1.5,
                speed: 10 + Math.random() * 20, // Slow — far away
                brightness: 0.2 + Math.random() * 0.6
            });
        }

        // Mid layer — theme-specific ambient elements
        this.midLayer = [];
        for (let i = 0; i < 15; i++) {
            this.midLayer.push({
                x: Math.random() * PLAY_W,
                y: Math.random() * PLAY_H,
                size: 2 + Math.random() * 4,
                speed: 30 + Math.random() * 40, // Medium speed
                type: Math.floor(Math.random() * 3)
            });
        }

        // Near layer silhouettes are static (drawn procedurally based on theme)
        this.nearLayer = [];
        this._generateNearLayer();
    },

    _generateNearLayer() {
        this.nearLayer = [];
        // Generate horizon silhouette elements based on theme
        // Each element: { x, w, h, type }
        const W = PLAY_W;
        switch (this.bgType) {
            case 'synthwave':
            case 'industrial':
                // Buildings
                for (let x = 10; x < W - 10; x += 30 + Math.random() * 20) {
                    this.nearLayer.push({ x, w: 20 + Math.random() * 35, h: 40 + Math.random() * 100, type: 'building' });
                }
                break;
            case 'space':
                // Space station debris, satellite dishes, antenna arrays
                for (let x = 30; x < W - 30; x += 60 + Math.random() * 80) {
                    const types = ['antenna', 'dish', 'debris'];
                    this.nearLayer.push({ x, w: 15 + Math.random() * 30, h: 20 + Math.random() * 60, type: types[Math.floor(Math.random() * 3)] });
                }
                break;
            case 'sky':
                // Cloud banks — wider, shorter, softer
                for (let x = 0; x < W; x += 40 + Math.random() * 60) {
                    this.nearLayer.push({ x, w: 60 + Math.random() * 100, h: 15 + Math.random() * 30, type: 'cloud' });
                }
                break;
            case 'digital':
                // Data towers — tall, thin, geometric
                for (let x = 20; x < W - 20; x += 25 + Math.random() * 40) {
                    this.nearLayer.push({ x, w: 8 + Math.random() * 15, h: 50 + Math.random() * 130, type: 'datatower' });
                }
                break;
            case 'void':
                // Corrupted fragments — jagged, irregular
                for (let x = 30; x < W - 30; x += 50 + Math.random() * 70) {
                    this.nearLayer.push({ x, w: 20 + Math.random() * 40, h: 30 + Math.random() * 70, type: 'corrupt' });
                }
                break;
        }
    },

    update(dt) {
        this.gridOffset += dt * 120;
        if (this.gridOffset > 60) this.gridOffset -= 60;

        // Parallax scroll — far layer (slow)
        for (const s of this.farStars) {
            s.y += s.speed * dt;
            if (s.y > PLAY_H) { s.y = -2; s.x = Math.random() * PLAY_W; }
        }

        // Mid layer (medium)
        for (const m of this.midLayer) {
            m.y += m.speed * dt;
            if (m.y > PLAY_H + 10) { m.y = -10; m.x = Math.random() * PLAY_W; }
        }
    },

    draw(ctx) {
        const themes = {
            synthwave: { sky: ['#0a0620','#1a0a3e','#2d0a4e','#5c1a6e','#ff006e'], sun: 'rgba(255,100,0,0.4)', grid: 'rgba(255,0,255,0.25)', vgrid: 'rgba(0,255,255,0.2)', silhouette: '#0d0520', accent: '#ff00ff', windowColor: 'rgba(255,200,100,' },
            industrial: { sky: ['#0a0808','#1a0a08','#2d1510','#4a1a10','#ff4400'], sun: 'rgba(255,60,0,0.5)', grid: 'rgba(255,80,0,0.2)', vgrid: 'rgba(255,120,0,0.15)', silhouette: '#0a0504', accent: '#ff4400', windowColor: 'rgba(255,100,30,' },
            space: { sky: ['#020210','#050520','#080840','#0a0a50','#0a0a30'], sun: 'rgba(50,50,255,0.2)', grid: 'rgba(80,80,255,0.15)', vgrid: 'rgba(100,100,255,0.1)', silhouette: '#030318', accent: '#4466aa', windowColor: 'rgba(100,150,255,' },
            sky: { sky: ['#081830','#102848','#204070','#4080b0','#80c0e0'], sun: 'rgba(255,220,100,0.4)', grid: 'rgba(255,255,255,0.08)', vgrid: 'rgba(255,255,200,0.06)', silhouette: '#1a3050', accent: '#6090c0', windowColor: 'rgba(255,255,200,' },
            digital: { sky: ['#050010','#100020','#200040','#400060','#ff00ff'], sun: 'rgba(200,0,255,0.4)', grid: 'rgba(255,0,255,0.3)', vgrid: 'rgba(0,255,255,0.25)', silhouette: '#0a0018', accent: '#cc44ff', windowColor: 'rgba(180,0,255,' },
            void: { sky: ['#000000','#020204','#040208','#020204','#000000'], sun: 'rgba(100,0,0,0.2)', grid: 'rgba(255,0,0,0.1)', vgrid: 'rgba(255,0,0,0.08)', silhouette: '#040204', accent: '#440022', windowColor: 'rgba(255,0,50,' }
        };
        const t = themes[this.bgType] || themes.synthwave;

        // === Sky gradient (cached) ===
        if (!this._cachedSkyGrad || this._cachedTheme !== this.bgType) {
            this._cachedTheme = this.bgType;
            this._cachedSkyGrad = ctx.createLinearGradient(0, 0, 0, PLAY_H);
            this._cachedSkyGrad.addColorStop(0, t.sky[0]);
            this._cachedSkyGrad.addColorStop(0.3, t.sky[1]);
            this._cachedSkyGrad.addColorStop(0.6, t.sky[2]);
            this._cachedSkyGrad.addColorStop(0.85, t.sky[3]);
            this._cachedSkyGrad.addColorStop(1, t.sky[4]);
            const sunY = PLAY_H * 0.82;
            this._cachedSunGrad = ctx.createRadialGradient(PLAY_W / 2, sunY, 10, PLAY_W / 2, sunY, 200);
            this._cachedSunGrad.addColorStop(0, t.sun);
            this._cachedSunGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
            this._cachedSunGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        }
        ctx.fillStyle = this._cachedSkyGrad;
        ctx.fillRect(0, 0, PLAY_W, PLAY_H);

        // === Far parallax layer — stars ===
        for (const s of this.farStars) {
            ctx.fillStyle = `rgba(255, 255, 255, ${s.brightness})`;
            ctx.fillRect(s.x, s.y, s.size, s.size);
        }

        // === Sun / horizon glow (cached) ===
        const sunY = PLAY_H * 0.82;
        ctx.fillStyle = this._cachedSunGrad;
        ctx.fillRect(0, sunY - 200, PLAY_W, 400);

        // === Mid parallax layer — theme-specific ambient particles ===
        this._drawMidLayer(ctx, t);

        // === Near layer — horizon silhouettes ===
        this._drawSilhouettes(ctx, t);

        // === Perspective grid ===
        this._drawGrid(ctx, t);

        // === Void glitch effects ===
        if (this.bgType === 'void') {
            this._drawGlitch(ctx);
        }
    },

    _drawMidLayer(ctx, theme) {
        for (const m of this.midLayer) {
            ctx.globalAlpha = 0.2;
            switch (this.bgType) {
                case 'space':
                    ctx.fillStyle = '#6688cc';
                    ctx.fillRect(m.x, m.y, m.size, m.size * 0.6);
                    // Occasional twinkling
                    if (Math.sin(this.gridOffset * 0.02 + m.x) > 0.8) {
                        ctx.globalAlpha = 0.35;
                        ctx.fillStyle = '#aaccff';
                        ctx.fillRect(m.x - 1, m.y - 1, m.size + 2, m.size * 0.6 + 2);
                    }
                    break;
                case 'sky':
                    ctx.globalAlpha = 0.12;
                    ctx.fillStyle = '#ffffff';
                    ctx.beginPath();
                    ctx.ellipse(m.x, m.y, m.size * 3, m.size, 0, 0, Math.PI * 2);
                    ctx.fill();
                    break;
                case 'digital':
                    ctx.fillStyle = m.type === 0 ? '#cc44ff' : m.type === 1 ? '#00ffcc' : '#ff00aa';
                    ctx.font = (8 + m.type * 2) + 'px monospace';
                    ctx.fillText(m.type === 0 ? '0' : m.type === 1 ? '1' : ':', m.x, m.y);
                    break;
                case 'void':
                    ctx.fillStyle = Math.random() > 0.5 ? '#ff0066' : '#660033';
                    ctx.fillRect(m.x, m.y, m.size * 0.5, m.size * 0.5);
                    break;
                case 'industrial':
                    ctx.fillStyle = `rgba(255, ${80 + m.type * 40}, 0, 0.15)`;
                    ctx.beginPath();
                    ctx.arc(m.x, m.y, m.size, 0, Math.PI * 2);
                    ctx.fill();
                    break;
                default: // synthwave
                    // Faint geometric shapes
                    ctx.strokeStyle = 'rgba(255, 0, 255, 0.06)';
                    ctx.lineWidth = 0.5;
                    ctx.beginPath();
                    ctx.arc(m.x, m.y, m.size * 2, 0, Math.PI * 2);
                    ctx.stroke();
                    break;
            }
        }
        ctx.globalAlpha = 1;
    },

    _drawSilhouettes(ctx, theme) {
        const baseY = PLAY_H * 0.78;
        ctx.fillStyle = theme.silhouette;
        ctx.shadowColor = theme.accent;
        ctx.shadowBlur = 0;

        for (const el of this.nearLayer) {
            switch (el.type) {
                case 'building':
                    // City buildings with windows
                    ctx.fillStyle = theme.silhouette;
                    ctx.fillRect(el.x, baseY - el.h, el.w, el.h + 200);
                    ctx.strokeStyle = theme.accent;
                    ctx.globalAlpha = 0.25;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(el.x, baseY - el.h);
                    ctx.lineTo(el.x + el.w, baseY - el.h);
                    ctx.stroke();
                    ctx.globalAlpha = 1;
                    // Windows
                    for (let wy = baseY - el.h + 8; wy < baseY; wy += 10) {
                        for (let wx = el.x + 4; wx < el.x + el.w - 4; wx += 8) {
                            if (Math.random() > 0.5) {
                                ctx.fillStyle = theme.windowColor + (0.1 + Math.random() * 0.2) + ')';
                                ctx.fillRect(wx, wy, 3, 3);
                            }
                        }
                    }
                    ctx.fillStyle = theme.silhouette;
                    break;

                case 'antenna':
                    // Tall thin antenna with blinking top
                    ctx.fillStyle = theme.silhouette;
                    ctx.fillRect(el.x + el.w / 2 - 2, baseY - el.h, 4, el.h + 200);
                    // Cross bar
                    ctx.fillRect(el.x, baseY - el.h * 0.6, el.w, 3);
                    // Blinking light
                    if (Math.sin(this.gridOffset * 0.1 + el.x) > 0.3) {
                        ctx.fillStyle = '#ff4444';
                        ctx.shadowColor = '#ff4444';
                        ctx.shadowBlur = 0;
                        ctx.fillRect(el.x + el.w / 2 - 2, baseY - el.h - 2, 4, 4);
                        ctx.shadowBlur = 0;
                    }
                    break;

                case 'dish':
                    // Satellite dish
                    ctx.fillStyle = theme.silhouette;
                    ctx.fillRect(el.x + el.w / 2 - 3, baseY - el.h * 0.5, 6, el.h * 0.5 + 200);
                    ctx.beginPath();
                    ctx.arc(el.x + el.w / 2, baseY - el.h * 0.5, el.w / 2, Math.PI, 0);
                    ctx.fill();
                    break;

                case 'debris':
                    // Floating wreckage — irregular shape
                    ctx.fillStyle = theme.silhouette;
                    ctx.beginPath();
                    ctx.moveTo(el.x, baseY - el.h * 0.3);
                    ctx.lineTo(el.x + el.w * 0.3, baseY - el.h);
                    ctx.lineTo(el.x + el.w * 0.7, baseY - el.h * 0.8);
                    ctx.lineTo(el.x + el.w, baseY - el.h * 0.2);
                    ctx.lineTo(el.x + el.w, baseY + 200);
                    ctx.lineTo(el.x, baseY + 200);
                    ctx.closePath();
                    ctx.fill();
                    break;

                case 'cloud':
                    // Soft cloud bank
                    ctx.fillStyle = theme.silhouette;
                    ctx.globalAlpha = 0.4;
                    ctx.beginPath();
                    ctx.ellipse(el.x + el.w / 2, baseY - el.h / 2, el.w / 2, el.h / 2, 0, 0, Math.PI * 2);
                    ctx.fill();
                    // Secondary puff
                    ctx.beginPath();
                    ctx.ellipse(el.x + el.w * 0.3, baseY - el.h * 0.3, el.w * 0.3, el.h * 0.4, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.globalAlpha = 1;
                    break;

                case 'datatower':
                    // Thin geometric data towers
                    ctx.fillStyle = theme.silhouette;
                    ctx.fillRect(el.x, baseY - el.h, el.w, el.h + 200);
                    // Glowing data lines running up the tower
                    ctx.strokeStyle = theme.accent;
                    ctx.globalAlpha = 0.3;
                    ctx.lineWidth = 1;
                    for (let dy = baseY; dy > baseY - el.h; dy -= 12) {
                        const lit = Math.sin(this.gridOffset * 0.08 + dy * 0.1 + el.x) > 0.5;
                        if (lit) {
                            ctx.globalAlpha = 0.4;
                            ctx.beginPath();
                            ctx.moveTo(el.x, dy);
                            ctx.lineTo(el.x + el.w, dy);
                            ctx.stroke();
                        }
                    }
                    ctx.globalAlpha = 1;
                    // Antenna on top
                    ctx.fillStyle = theme.accent;
                    ctx.globalAlpha = 0.5;
                    ctx.fillRect(el.x + el.w / 2 - 1, baseY - el.h - 8, 2, 8);
                    ctx.globalAlpha = 1;
                    break;

                case 'corrupt':
                    // Jagged corrupted fragments
                    ctx.fillStyle = theme.silhouette;
                    ctx.beginPath();
                    ctx.moveTo(el.x, baseY + 200);
                    ctx.lineTo(el.x, baseY - el.h * 0.4);
                    ctx.lineTo(el.x + el.w * 0.2, baseY - el.h);
                    ctx.lineTo(el.x + el.w * 0.5, baseY - el.h * 0.6);
                    ctx.lineTo(el.x + el.w * 0.7, baseY - el.h * 0.9);
                    ctx.lineTo(el.x + el.w, baseY - el.h * 0.3);
                    ctx.lineTo(el.x + el.w, baseY + 200);
                    ctx.closePath();
                    ctx.fill();
                    // Glitch lines
                    if (Math.random() < 0.1) {
                        ctx.strokeStyle = `rgba(255, 0, 100, 0.3)`;
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(el.x, baseY - el.h * Math.random());
                        ctx.lineTo(el.x + el.w, baseY - el.h * Math.random());
                        ctx.stroke();
                    }
                    break;
            }
        }
        ctx.shadowBlur = 0;
        ctx.fillStyle = theme.silhouette;
    },

    _drawGrid(ctx, theme) {
        const horizon = PLAY_H * 0.82;
        const gridH = PLAY_H - horizon;

        ctx.save();

        // Horizontal lines (perspective) — use theme grid color
        ctx.strokeStyle = theme.grid;
        ctx.lineWidth = 1;
        for (let i = 0; i < 15; i++) {
            const tt = (i * 60 + this.gridOffset) / (15 * 60);
            const y = horizon + tt * tt * gridH;
            if (y > PLAY_H) continue;
            ctx.globalAlpha = Math.min(1, tt * 3) * 0.3;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(PLAY_W, y);
            ctx.stroke();
        }

        // Vertical lines (converging) — use theme vgrid color
        ctx.globalAlpha = 0.2;
        ctx.strokeStyle = theme.vgrid;
        const vanishX = PLAY_W / 2;
        for (let i = -10; i <= 10; i++) {
            const bottomX = vanishX + i * 55;
            ctx.beginPath();
            ctx.moveTo(vanishX + i * 3, horizon);
            ctx.lineTo(bottomX, PLAY_H);
            ctx.stroke();
        }

        ctx.restore();
    },

    _drawGlitch(ctx) {
        const time = this.gridOffset * 0.05;
        // Scanline static
        for (let i = 0; i < 5; i++) {
            const sy = (Math.sin(time * 3 + i * 47) * 0.5 + 0.5) * PLAY_H;
            const sw = 50 + Math.random() * 200;
            const sx = Math.random() * PLAY_W;
            ctx.fillStyle = `rgba(255, 0, 0, ${0.03 + Math.random() * 0.04})`;
            ctx.fillRect(sx, sy, sw, 2 + Math.random() * 3);
        }
        // Horizontal glitch bars
        if (Math.random() < 0.03) {
            const gy = Math.random() * PLAY_H;
            const gh = 5 + Math.random() * 20;
            ctx.fillStyle = `rgba(${Math.random() > 0.5 ? '255,0,100' : '0,255,255'}, 0.06)`;
            ctx.fillRect(0, gy, PLAY_W, gh);
        }
        // Corner static
        ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
        for (let i = 0; i < 8; i++) {
            ctx.fillRect(Math.random() * PLAY_W, Math.random() * PLAY_H, Math.random() * 4, Math.random() * 4);
        }
    }
};
