// ============================================================
//  BACKGROUND RENDERER — Enhanced parallax with 5 layers
//
//  Layer order (back to front):
//    1. Sky gradient (static)
//    2. Deep star field — slow scroll, alpha twinkle
//    3. Nebula / atmosphere — large soft colour clouds, per-theme
//    4. Sun / horizon glow
//    5. Mid parallax — theme-specific ambient elements
//    6. Horizon silhouettes — buildings, antennas, etc.
//    7. Perspective grid
//    8. Near foreground — fast debris/dust for speed sensation
//    9. Glitch overlay (void theme only)
// ============================================================
const Background = {
    gridOffset: 0,
    bgType: 'synthwave',

    // Parallax layers
    farStars: [],      // Layer 2 — deep star field
    nebulae: [],       // Layer 3 — large soft colour blobs
    midLayer: [],      // Layer 5 — theme-specific mid elements
    nearLayer: [],     // Layer 6 — horizon silhouettes
    foreground: [],    // Layer 8 — fast foreground particles

    init() {
        // Deep star field — more stars, with twinkle phase
        this.farStars = [];
        for (let i = 0; i < 100; i++) {
            this.farStars.push({
                x: Math.random() * PLAY_W,
                y: Math.random() * PLAY_H,
                size: 0.5 + Math.random() * 1.8,
                speed: 8 + Math.random() * 15,
                brightness: 0.3 + Math.random() * 0.5,
                twinklePhase: Math.random() * Math.PI * 2,
                twinkleSpeed: 1.5 + Math.random() * 3,
            });
        }

        // Nebula clouds — large, soft, theme-coloured
        this.nebulae = [];
        for (let i = 0; i < 6; i++) {
            this.nebulae.push({
                x: Math.random() * PLAY_W,
                y: Math.random() * PLAY_H * 0.7,
                rx: 60 + Math.random() * 120,
                ry: 30 + Math.random() * 60,
                speed: 5 + Math.random() * 10,
                driftX: (Math.random() - 0.5) * 8,
                alpha: 0.03 + Math.random() * 0.04,
            });
        }

        // Mid layer — theme-specific ambient elements
        this.midLayer = [];
        for (let i = 0; i < 15; i++) {
            this.midLayer.push({
                x: Math.random() * PLAY_W,
                y: Math.random() * PLAY_H,
                size: 2 + Math.random() * 4,
                speed: 30 + Math.random() * 40,
                type: Math.floor(Math.random() * 3)
            });
        }

        // Near foreground — fast particles for speed sensation
        this.foreground = [];
        for (let i = 0; i < 25; i++) {
            this.foreground.push({
                x: Math.random() * PLAY_W,
                y: Math.random() * PLAY_H,
                size: 0.5 + Math.random() * 1.5,
                speed: 200 + Math.random() * 300,
                alpha: 0.05 + Math.random() * 0.08,
                length: 4 + Math.random() * 12,
            });
        }

        // Horizon silhouettes
        this.nearLayer = [];
        this._generateNearLayer();
    },

    _generateNearLayer() {
        this.nearLayer = [];
        const W = PLAY_W;
        switch (this.bgType) {
            case 'synthwave':
            case 'industrial':
                for (let x = 10; x < W - 10; x += 30 + Math.random() * 20) {
                    this.nearLayer.push({ x, w: 20 + Math.random() * 35, h: 40 + Math.random() * 100, type: 'building' });
                }
                break;
            case 'space':
                for (let x = 30; x < W - 30; x += 60 + Math.random() * 80) {
                    const types = ['antenna', 'dish', 'debris'];
                    this.nearLayer.push({ x, w: 15 + Math.random() * 30, h: 20 + Math.random() * 60, type: types[Math.floor(Math.random() * 3)] });
                }
                break;
            case 'sky':
                for (let x = 0; x < W; x += 40 + Math.random() * 60) {
                    this.nearLayer.push({ x, w: 60 + Math.random() * 100, h: 15 + Math.random() * 30, type: 'cloud' });
                }
                break;
            case 'digital':
                for (let x = 20; x < W - 20; x += 25 + Math.random() * 40) {
                    this.nearLayer.push({ x, w: 8 + Math.random() * 15, h: 50 + Math.random() * 130, type: 'datatower' });
                }
                break;
            case 'void':
                for (let x = 30; x < W - 30; x += 50 + Math.random() * 70) {
                    this.nearLayer.push({ x, w: 20 + Math.random() * 40, h: 30 + Math.random() * 70, type: 'corrupt' });
                }
                break;
        }
    },

    update(dt) {
        this.gridOffset += dt * 120;
        if (this.gridOffset > 60) this.gridOffset -= 60;

        // Far stars — slow scroll + twinkle
        for (const s of this.farStars) {
            s.y += s.speed * dt;
            s.twinklePhase += s.twinkleSpeed * dt;
            if (s.y > PLAY_H) { s.y = -2; s.x = Math.random() * PLAY_W; }
        }

        // Nebulae — very slow vertical scroll + horizontal drift
        for (const n of this.nebulae) {
            n.y += n.speed * dt;
            n.x += n.driftX * dt;
            if (n.y > PLAY_H * 0.8 + n.ry) {
                n.y = -n.ry;
                n.x = Math.random() * PLAY_W;
            }
            if (n.x < -n.rx) n.x = PLAY_W + n.rx;
            if (n.x > PLAY_W + n.rx) n.x = -n.rx;
        }

        // Mid layer
        for (const m of this.midLayer) {
            m.y += m.speed * dt;
            if (m.y > PLAY_H + 10) { m.y = -10; m.x = Math.random() * PLAY_W; }
        }

        // Foreground — fast scroll
        for (const f of this.foreground) {
            f.y += f.speed * dt;
            if (f.y > PLAY_H + f.length) { f.y = -f.length; f.x = Math.random() * PLAY_W; }
        }
    },

    draw(ctx) {
        const themes = {
            synthwave: { sky: ['#0a0620','#1a0a3e','#2d0a4e','#5c1a6e','#ff006e'], sun: 'rgba(255,100,0,0.4)', grid: 'rgba(255,0,255,0.25)', vgrid: 'rgba(0,255,255,0.2)', silhouette: '#0d0520', accent: '#ff00ff', windowColor: 'rgba(255,200,100,', nebula: '#ff00ff' },
            industrial: { sky: ['#0a0808','#1a0a08','#2d1510','#4a1a10','#ff4400'], sun: 'rgba(255,60,0,0.5)', grid: 'rgba(255,80,0,0.2)', vgrid: 'rgba(255,120,0,0.15)', silhouette: '#0a0504', accent: '#ff4400', windowColor: 'rgba(255,100,30,', nebula: '#ff4400' },
            space: { sky: ['#020210','#050520','#080840','#0a0a50','#0a0a30'], sun: 'rgba(50,50,255,0.2)', grid: 'rgba(80,80,255,0.15)', vgrid: 'rgba(100,100,255,0.1)', silhouette: '#030318', accent: '#4466aa', windowColor: 'rgba(100,150,255,', nebula: '#4488cc' },
            sky: { sky: ['#081830','#102848','#204070','#4080b0','#80c0e0'], sun: 'rgba(255,220,100,0.4)', grid: 'rgba(255,255,255,0.08)', vgrid: 'rgba(255,255,200,0.06)', silhouette: '#1a3050', accent: '#6090c0', windowColor: 'rgba(255,255,200,', nebula: '#80b0d0' },
            digital: { sky: ['#050010','#100020','#200040','#400060','#ff00ff'], sun: 'rgba(200,0,255,0.4)', grid: 'rgba(255,0,255,0.3)', vgrid: 'rgba(0,255,255,0.25)', silhouette: '#0a0018', accent: '#cc44ff', windowColor: 'rgba(180,0,255,', nebula: '#cc44ff' },
            void: { sky: ['#000000','#020204','#040208','#020204','#000000'], sun: 'rgba(100,0,0,0.2)', grid: 'rgba(255,0,0,0.1)', vgrid: 'rgba(255,0,0,0.08)', silhouette: '#040204', accent: '#440022', windowColor: 'rgba(255,0,50,', nebula: '#440022' }
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

        // === Deep star field — with twinkle ===
        for (const s of this.farStars) {
            const twinkle = 0.5 + 0.5 * Math.sin(s.twinklePhase);
            const alpha = s.brightness * (0.4 + twinkle * 0.6);
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.fillRect(s.x, s.y, s.size, s.size);
        }

        // === Nebula / atmosphere layer ===
        for (const n of this.nebulae) {
            ctx.globalAlpha = n.alpha;
            ctx.fillStyle = t.nebula;
            ctx.beginPath();
            ctx.ellipse(n.x, n.y, n.rx, n.ry, 0, 0, Math.PI * 2);
            ctx.fill();
            // Secondary puff offset
            ctx.beginPath();
            ctx.ellipse(n.x + n.rx * 0.4, n.y + n.ry * 0.3, n.rx * 0.6, n.ry * 0.5, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        // === Sun / horizon glow ===
        const sunY = PLAY_H * 0.82;
        ctx.fillStyle = this._cachedSunGrad;
        ctx.fillRect(0, sunY - 200, PLAY_W, 400);

        // === Mid parallax layer ===
        this._drawMidLayer(ctx, t);

        // === Horizon silhouettes ===
        this._drawSilhouettes(ctx, t);

        // === Perspective grid ===
        this._drawGrid(ctx, t);

        // === Near foreground — fast streaks ===
        this._drawForeground(ctx, t);

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

        // Gradient fade at top of silhouette region
        const fadeGrad = ctx.createLinearGradient(0, baseY - 140, 0, baseY - 80);
        fadeGrad.addColorStop(0, 'rgba(0,0,0,0)');
        fadeGrad.addColorStop(1, theme.silhouette);
        ctx.fillStyle = fadeGrad;
        ctx.fillRect(0, baseY - 140, PLAY_W, 60);

        ctx.fillStyle = theme.silhouette;

        // Slow horizontal drift for applicable themes
        const drift = (this.bgType === 'synthwave' || this.bgType === 'industrial' || this.bgType === 'digital')
            ? Math.sin(this.gridOffset * 0.003) * 8 : 0;

        ctx.save();
        if (drift !== 0) ctx.translate(drift, 0);

        for (const el of this.nearLayer) {
            switch (el.type) {
                case 'building':
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
                    ctx.fillStyle = theme.silhouette;
                    ctx.fillRect(el.x + el.w / 2 - 2, baseY - el.h, 4, el.h + 200);
                    ctx.fillRect(el.x, baseY - el.h * 0.6, el.w, 3);
                    if (Math.sin(this.gridOffset * 0.1 + el.x) > 0.3) {
                        ctx.fillStyle = '#ff4444';
                        ctx.fillRect(el.x + el.w / 2 - 2, baseY - el.h - 2, 4, 4);
                    }
                    break;

                case 'dish':
                    ctx.fillStyle = theme.silhouette;
                    ctx.fillRect(el.x + el.w / 2 - 3, baseY - el.h * 0.5, 6, el.h * 0.5 + 200);
                    ctx.beginPath();
                    ctx.arc(el.x + el.w / 2, baseY - el.h * 0.5, el.w / 2, Math.PI, 0);
                    ctx.fill();
                    break;

                case 'debris':
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
                    ctx.fillStyle = theme.silhouette;
                    ctx.globalAlpha = 0.4;
                    ctx.beginPath();
                    ctx.ellipse(el.x + el.w / 2, baseY - el.h / 2, el.w / 2, el.h / 2, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.ellipse(el.x + el.w * 0.3, baseY - el.h * 0.3, el.w * 0.3, el.h * 0.4, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.globalAlpha = 1;
                    break;

                case 'datatower':
                    ctx.fillStyle = theme.silhouette;
                    ctx.fillRect(el.x, baseY - el.h, el.w, el.h + 200);
                    ctx.strokeStyle = theme.accent;
                    ctx.globalAlpha = 0.3;
                    ctx.lineWidth = 1;
                    for (let dy = baseY; dy > baseY - el.h; dy -= 12) {
                        if (Math.sin(this.gridOffset * 0.08 + dy * 0.1 + el.x) > 0.5) {
                            ctx.globalAlpha = 0.4;
                            ctx.beginPath();
                            ctx.moveTo(el.x, dy);
                            ctx.lineTo(el.x + el.w, dy);
                            ctx.stroke();
                        }
                    }
                    ctx.globalAlpha = 1;
                    ctx.fillStyle = theme.accent;
                    ctx.globalAlpha = 0.5;
                    ctx.fillRect(el.x + el.w / 2 - 1, baseY - el.h - 8, 2, 8);
                    ctx.globalAlpha = 1;
                    break;

                case 'corrupt':
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
        ctx.restore();
        ctx.fillStyle = theme.silhouette;
    },

    _drawGrid(ctx, theme) {
        const horizon = PLAY_H * 0.82;
        const gridH = PLAY_H - horizon;

        ctx.save();

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

    _drawForeground(ctx, theme) {
        // Fast-scrolling streaks in front of everything
        // Low opacity so they don't obscure gameplay
        ctx.save();
        for (const f of this.foreground) {
            ctx.globalAlpha = f.alpha;
            switch (this.bgType) {
                case 'industrial':
                    ctx.fillStyle = '#ff6633';
                    break;
                case 'void':
                    ctx.fillStyle = Math.random() > 0.7 ? '#ff0066' : '#330011';
                    break;
                case 'digital':
                    ctx.fillStyle = '#00ffcc';
                    break;
                case 'sky':
                    ctx.fillStyle = '#c0d8f0';
                    break;
                default:
                    ctx.fillStyle = '#ffffff';
                    break;
            }
            // Draw as a short vertical streak (motion blur effect)
            ctx.fillRect(f.x, f.y, f.size * 0.4, f.length);
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
