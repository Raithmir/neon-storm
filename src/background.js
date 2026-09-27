// ============================================================
//  BACKGROUND RENDERER
//
//  Layers (back to front):
//    1. Sky gradient
//    2. Star field (twinkle, colour tint)
//    3. Nebulae / atmosphere
//    4. Horizon feature (sun, planet, portal, etc.)
//    5. Mid-parallax ambient
//    6. Distant silhouettes
//    7. Near silhouettes (pre-baked window phases)
//    8. Perspective grid / ground plane
//    9. Foreground speed streaks
//   10. Theme overlay (data streams, void tears, etc.)
// ============================================================
const Background = {
    gridOffset: 0,
    time: 0,
    bgType: 'synthwave',

    farStars: [],
    nebulae: [],
    midLayer: [],
    distantBuildings: [],
    buildings: [],
    foreground: [],
    _dataStreams: [],   // digital theme
    _smokePuffs: [],   // industrial theme

    init() {
        this.time = 0;
        this._cachedSkyGrad = null;
        this._cachedTheme = null;

        this.farStars = [];
        for (let i = 0; i < 130; i++) {
            this.farStars.push({
                x: Math.random() * PLAY_W,
                y: Math.random() * PLAY_H * 0.82,
                size: 0.4 + Math.random() * 1.6,
                speed: 5 + Math.random() * 18,
                brightness: 0.4 + Math.random() * 0.6,
                phase: Math.random() * Math.PI * 2,
                twinkleSpeed: 1.0 + Math.random() * 2.5,
                hue: Math.floor(Math.random() * 3), // 0=white 1=blue 2=warm
            });
        }

        this.nebulae = [];
        for (let i = 0; i < 5; i++) {
            this.nebulae.push({
                x: Math.random() * PLAY_W,
                y: Math.random() * PLAY_H * 0.6,
                rx: 80 + Math.random() * 160,
                ry: 40 + Math.random() * 80,
                speed: 3 + Math.random() * 9,
                alpha: 0.04 + Math.random() * 0.05,
                phase: Math.random() * Math.PI * 2,
            });
        }

        this.midLayer = [];
        for (let i = 0; i < 18; i++) {
            this.midLayer.push({
                x: Math.random() * PLAY_W,
                y: Math.random() * PLAY_H,
                size: 1.5 + Math.random() * 4,
                speed: 20 + Math.random() * 50,
                type: Math.floor(Math.random() * 4),
                phase: Math.random() * Math.PI * 2,
            });
        }

        this.foreground = [];
        for (let i = 0; i < 28; i++) {
            this.foreground.push({
                x: Math.random() * PLAY_W,
                y: Math.random() * PLAY_H,
                size: 0.4 + Math.random() * 1.1,
                speed: 160 + Math.random() * 340,
                alpha: 0.04 + Math.random() * 0.07,
                length: 4 + Math.random() * 14,
            });
        }

        this._generateBuildings();
        this._generateThemeExtra();
    },

    _generateNearLayer() { this._generateBuildings(); this._generateThemeExtra(); },

    _generateBuildings() {
        this.buildings = [];
        this.distantBuildings = [];
        const W = PLAY_W;

        switch (this.bgType) {
            case 'synthwave':
            case 'industrial': {
                // Distant city layer — smaller, packed
                for (let x = -10; x < W + 10; x += 12 + Math.random() * 10) {
                    this.distantBuildings.push({
                        x, w: 9 + Math.random() * 18, h: 12 + Math.random() * 50,
                    });
                }
                // Near city — pre-bake window phases
                for (let x = -5; x < W + 5; x += 26 + Math.random() * 22) {
                    const w = 18 + Math.random() * 40;
                    const h = 50 + Math.random() * 120;
                    const el = { x, w, h, windows: [], antennaPhase: Math.random() * Math.PI * 2 };
                    for (let wy = 8; wy < h - 8; wy += 10) {
                        for (let wx = 4; wx < w - 4; wx += 8) {
                            el.windows.push({
                                relX: wx, relY: wy,
                                phase: Math.random() * Math.PI * 2,
                                speed: 0.2 + Math.random() * 0.6,
                                lit: Math.random() < 0.55,
                            });
                        }
                    }
                    this.buildings.push(el);
                }
                break;
            }
            case 'digital': {
                for (let x = -5; x < W + 5; x += 18 + Math.random() * 28) {
                    const w = 5 + Math.random() * 14;
                    const h = 70 + Math.random() * 150;
                    this.buildings.push({ x, w, h, phase: Math.random() * Math.PI * 2 });
                }
                for (let x = 0; x < W; x += 10 + Math.random() * 14) {
                    this.distantBuildings.push({
                        x, w: 3 + Math.random() * 8, h: 25 + Math.random() * 80,
                    });
                }
                break;
            }
            case 'space': {
                for (let x = 20; x < W - 20; x += 55 + Math.random() * 80) {
                    const types = ['antenna', 'dish', 'relay'];
                    this.buildings.push({
                        x, w: 12 + Math.random() * 30, h: 28 + Math.random() * 80,
                        type: types[Math.floor(Math.random() * 3)],
                        phase: Math.random() * Math.PI * 2,
                    });
                }
                break;
            }
            case 'sky': {
                // Three cloud-bank layers at different y positions
                for (let layer = 0; layer < 3; layer++) {
                    const baseY = 0.55 + layer * 0.1;
                    for (let x = -60; x < W + 60; x += 55 + Math.random() * 65) {
                        this.buildings.push({
                            x, w: 80 + Math.random() * 140, h: 22 + Math.random() * 35,
                            type: 'cloud', layer,
                            baseY: PLAY_H * baseY,
                            phase: Math.random() * Math.PI * 2,
                            scrollSpeed: 0.5 + layer * 0.8,
                        });
                    }
                }
                break;
            }
            case 'void': {
                for (let x = 20; x < W - 20; x += 40 + Math.random() * 60) {
                    this.buildings.push({
                        x, w: 16 + Math.random() * 40, h: 30 + Math.random() * 90,
                        phase: Math.random() * Math.PI * 2,
                    });
                }
                break;
            }
        }
    },

    _generateThemeExtra() {
        this._dataStreams = [];
        this._smokePuffs = [];

        if (this.bgType === 'digital') {
            const CHARS = '01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホ';
            for (let i = 0; i < 24; i++) {
                const len = 6 + Math.floor(Math.random() * 10);
                const chars = [];
                for (let j = 0; j < len; j++) {
                    chars.push(CHARS[Math.floor(Math.random() * CHARS.length)]);
                }
                this._dataStreams.push({
                    x: Math.random() * PLAY_W,
                    yOffset: Math.random() * PLAY_H,
                    speed: 55 + Math.random() * 90,
                    chars,
                    alpha: 0.18 + Math.random() * 0.28,
                });
            }
        }

        if (this.bgType === 'industrial') {
            // Smoke puffs — tied to chimneys generated in buildings
            for (let i = 0; i < 20; i++) {
                this._smokePuffs.push({
                    x: 30 + Math.random() * (PLAY_W - 60),
                    y: PLAY_H * 0.5 + Math.random() * PLAY_H * 0.25,
                    size: 8 + Math.random() * 18,
                    alpha: 0.04 + Math.random() * 0.08,
                    speed: 15 + Math.random() * 30,
                    dx: (Math.random() - 0.5) * 12,
                });
            }
        }
    },

    update(dt) {
        this.time += dt;
        this.gridOffset += dt * 120;
        if (this.gridOffset > 60) this.gridOffset -= 60;

        for (const s of this.farStars) {
            s.y += s.speed * dt;
            s.phase += s.twinkleSpeed * dt;
            if (s.y > PLAY_H * 0.82) { s.y = -2; s.x = Math.random() * PLAY_W; }
        }

        for (const n of this.nebulae) {
            n.y += n.speed * dt;
            if (n.y > PLAY_H * 0.65 + n.ry) { n.y = -n.ry; n.x = Math.random() * PLAY_W; }
        }

        for (const m of this.midLayer) {
            m.y += m.speed * dt;
            if (m.y > PLAY_H + 10) { m.y = -10; m.x = Math.random() * PLAY_W; }
        }

        for (const f of this.foreground) {
            f.y += f.speed * dt;
            if (f.y > PLAY_H + f.length) { f.y = -f.length; f.x = Math.random() * PLAY_W; }
        }

        for (const p of this._smokePuffs) {
            p.y -= p.speed * dt;
            p.x += p.dx * dt;
            p.size += 4 * dt;
            p.alpha -= 0.015 * dt;
            if (p.alpha <= 0 || p.y < PLAY_H * 0.3) {
                p.y = PLAY_H * 0.72 + Math.random() * PLAY_H * 0.06;
                p.x = 30 + Math.random() * (PLAY_W - 60);
                p.size = 8 + Math.random() * 18;
                p.alpha = 0.04 + Math.random() * 0.08;
                p.speed = 15 + Math.random() * 30;
                p.dx = (Math.random() - 0.5) * 12;
            }
        }
    },

    draw(ctx) {
        const t = this._theme();
        this._drawSky(ctx, t);
        this._drawStars(ctx, t);
        this._drawNebulae(ctx, t);
        this._drawHorizonFeature(ctx, t);
        this._drawMidLayer(ctx, t);
        this._drawDistantBuildings(ctx, t);
        this._drawBuildings(ctx, t);
        this._drawGrid(ctx, t);
        this._drawForeground(ctx, t);
        this._drawOverlay(ctx, t);
    },

    _theme() {
        const T = {
            synthwave: {
                sky: ['#04011a', '#0e0438', '#1c0650', '#3a0d70', '#6a12a0'],
                nebC1: '#cc00ff', nebC2: '#6600cc',
                grid: 'rgba(255,0,220,0.28)', vgrid: 'rgba(0,255,220,0.20)',
                sil: '#080220', silFar: '#0f0430',
                accent: '#ff00ff', accent2: '#00ffee',
                winA: 'rgba(255,210,70,', winB: 'rgba(0,255,240,',
                streak: '#ffffff',
            },
            industrial: {
                sky: ['#060404', '#150808', '#271008', '#451808', '#782000'],
                nebC1: '#ff2200', nebC2: '#992200',
                grid: 'rgba(255,90,0,0.22)', vgrid: 'rgba(255,150,0,0.14)',
                sil: '#0c0404', silFar: '#180808',
                accent: '#ff4400', accent2: '#ff9900',
                winA: 'rgba(255,110,10,', winB: 'rgba(255,50,0,',
                streak: '#ff6600',
            },
            space: {
                sky: ['#010108', '#020318', '#050838', '#060a48', '#040630'],
                nebC1: '#2233bb', nebC2: '#551199',
                grid: 'rgba(70,70,255,0.18)', vgrid: 'rgba(90,90,255,0.12)',
                sil: '#030318', silFar: '#050530',
                accent: '#4466cc', accent2: '#88aaff',
                winA: 'rgba(120,170,255,', winB: 'rgba(80,220,200,',
                streak: '#aabbff',
            },
            sky: {
                sky: ['#040c18', '#0a1e38', '#163660', '#2860a0', '#5090c8'],
                nebC1: '#7ab0d8', nebC2: '#3870b0',
                grid: 'rgba(180,210,255,0.10)', vgrid: 'rgba(160,200,255,0.07)',
                sil: '#182840', silFar: '#0e1e30',
                accent: '#60a0c8', accent2: '#c0e0ff',
                winA: 'rgba(255,250,200,', winB: 'rgba(200,240,255,',
                streak: '#c0d4ec',
            },
            digital: {
                sky: ['#030010', '#09001e', '#150038', '#280055', '#550088'],
                nebC1: '#bb00ff', nebC2: '#0077ff',
                grid: 'rgba(255,0,230,0.32)', vgrid: 'rgba(0,255,190,0.26)',
                sil: '#09001a', silFar: '#110022',
                accent: '#cc44ff', accent2: '#00ffcc',
                winA: 'rgba(180,0,255,', winB: 'rgba(0,255,190,',
                streak: '#00ffcc',
            },
            void: {
                sky: ['#000000', '#010002', '#020005', '#010002', '#000000'],
                nebC1: '#3a0018', nebC2: '#1a0028',
                grid: 'rgba(220,0,50,0.11)', vgrid: 'rgba(180,0,40,0.07)',
                sil: '#040104', silFar: '#020102',
                accent: '#770022', accent2: '#330011',
                winA: 'rgba(240,0,55,', winB: 'rgba(160,0,36,',
                streak: '#550018',
            },
        };
        return T[this.bgType] || T.synthwave;
    },

    _drawSky(ctx, t) {
        if (this._cachedTheme !== this.bgType) {
            this._cachedTheme = this.bgType;
            this._cachedSkyGrad = ctx.createLinearGradient(0, 0, 0, PLAY_H);
            const s = t.sky;
            this._cachedSkyGrad.addColorStop(0,    s[0]);
            this._cachedSkyGrad.addColorStop(0.25, s[1]);
            this._cachedSkyGrad.addColorStop(0.55, s[2]);
            this._cachedSkyGrad.addColorStop(0.82, s[3]);
            this._cachedSkyGrad.addColorStop(1,    s[4]);
        }
        ctx.fillStyle = this._cachedSkyGrad;
        ctx.fillRect(0, 0, PLAY_W, PLAY_H);

        // Synthwave aurora bands
        if (this.bgType === 'synthwave') {
            for (let b = 0; b < 3; b++) {
                const by = PLAY_H * (0.12 + b * 0.14) + Math.sin(this.time * 0.18 + b * 1.4) * 15;
                const bAlpha = 0.025 + b * 0.01;
                const bGrad = ctx.createLinearGradient(0, by - 30, 0, by + 30);
                bGrad.addColorStop(0,   'rgba(0,0,0,0)');
                bGrad.addColorStop(0.4, b % 2 === 0 ? `rgba(200,0,255,${bAlpha})` : `rgba(0,220,255,${bAlpha})`);
                bGrad.addColorStop(1,   'rgba(0,0,0,0)');
                ctx.fillStyle = bGrad;
                ctx.fillRect(0, by - 30, PLAY_W, 60);
            }
        }
    },

    _drawStars(ctx, t) {
        const starColors = ['255,255,255', '160,200,255', '255,220,160'];
        for (const s of this.farStars) {
            const twinkle = 0.5 + 0.5 * Math.sin(s.phase);
            const alpha = s.brightness * (0.25 + twinkle * 0.75);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = `rgba(${starColors[s.hue]},1)`;
            ctx.fillRect(s.x, s.y, s.size, s.size);
        }
        ctx.globalAlpha = 1;
    },

    _drawNebulae(ctx, t) {
        for (const n of this.nebulae) {
            ctx.globalAlpha = n.alpha;
            ctx.fillStyle = t.nebC1;
            ctx.beginPath();
            ctx.ellipse(n.x, n.y, n.rx, n.ry, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = n.alpha * 0.55;
            ctx.fillStyle = t.nebC2;
            ctx.beginPath();
            ctx.ellipse(n.x + n.rx * 0.35, n.y + n.ry * 0.25, n.rx * 0.55, n.ry * 0.5, 0.5, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    },

    _drawHorizonFeature(ctx, t) {
        const horizY = PLAY_H * 0.80;

        switch (this.bgType) {

            case 'synthwave': {
                // Classic retrowave striped sun
                const cx = PLAY_W * 0.5;
                const sunR = 68;
                const sunY = horizY - 10;

                // Outer halo
                const halo = ctx.createRadialGradient(cx, sunY, sunR * 0.4, cx, sunY, sunR * 3.2);
                halo.addColorStop(0, 'rgba(255,60,180,0.22)');
                halo.addColorStop(0.4, 'rgba(160,0,220,0.10)');
                halo.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = halo;
                ctx.fillRect(cx - sunR * 3.5, sunY - sunR * 3.5, sunR * 7, sunR * 7);

                ctx.save();
                ctx.beginPath();
                ctx.arc(cx, sunY, sunR, 0, Math.PI * 2);
                ctx.clip();

                // Sun gradient
                const sg = ctx.createLinearGradient(cx, sunY - sunR, cx, sunY + sunR);
                sg.addColorStop(0, '#ff9900');
                sg.addColorStop(0.38, '#ff2288');
                sg.addColorStop(0.7, '#cc00ff');
                sg.addColorStop(1, '#6600cc');
                ctx.fillStyle = sg;
                ctx.fillRect(cx - sunR, sunY - sunR, sunR * 2, sunR * 2);

                // Horizontal stripes (classic look) — drawn only on lower half
                let sy = sunY + sunR * 0.05;
                let stripeH = 2;
                const skyCol = t.sky[0];
                while (sy < sunY + sunR + 1) {
                    ctx.fillStyle = skyCol;
                    ctx.fillRect(cx - sunR, sy, sunR * 2, stripeH);
                    sy += stripeH + stripeH * 0.6;
                    stripeH = Math.min(stripeH + 1.2, 14);
                }
                ctx.restore();

                // Thin horizon line below sun
                ctx.strokeStyle = 'rgba(255,0,200,0.35)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(0, horizY);
                ctx.lineTo(PLAY_W, horizY);
                ctx.stroke();
                break;
            }

            case 'industrial': {
                // Molten horizon — layered glow
                for (let layer = 0; layer < 3; layer++) {
                    const alpha = 0.12 - layer * 0.03;
                    const spread = 80 + layer * 60;
                    const g = ctx.createLinearGradient(0, horizY - spread, 0, horizY + 40);
                    g.addColorStop(0, 'rgba(0,0,0,0)');
                    g.addColorStop(0.6, `rgba(255,${60 + layer * 20},0,${alpha})`);
                    g.addColorStop(1, `rgba(255,${80 + layer * 30},0,${alpha * 0.6})`);
                    ctx.fillStyle = g;
                    ctx.fillRect(0, horizY - spread, PLAY_W, spread + 40);
                }
                // Smog band
                const smog = ctx.createLinearGradient(0, horizY - 120, 0, horizY - 30);
                smog.addColorStop(0, 'rgba(0,0,0,0)');
                smog.addColorStop(1, 'rgba(30,10,4,0.55)');
                ctx.fillStyle = smog;
                ctx.fillRect(0, horizY - 120, PLAY_W, 90);
                break;
            }

            case 'space': {
                // Large planet — partial disc at horizon
                const px = PLAY_W * 0.72;
                const pr = 140;
                const pCy = horizY + pr * 0.55; // mostly below horizon

                ctx.save();
                // Clip to above-horizon only
                ctx.beginPath();
                ctx.rect(0, 0, PLAY_W, horizY);
                ctx.clip();

                // Planet glow
                const pg = ctx.createRadialGradient(px, pCy, pr * 0.3, px, pCy, pr * 1.6);
                pg.addColorStop(0, 'rgba(60,80,200,0.12)');
                pg.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = pg;
                ctx.fillRect(px - pr * 2, pCy - pr * 2, pr * 4, pr * 4);

                // Planet body
                const pb = ctx.createRadialGradient(px - pr * 0.3, pCy - pr * 0.3, pr * 0.1, px, pCy, pr);
                pb.addColorStop(0, '#3050b8');
                pb.addColorStop(0.5, '#1a2880');
                pb.addColorStop(0.85, '#0a1040');
                pb.addColorStop(1, '#050820');
                ctx.fillStyle = pb;
                ctx.beginPath();
                ctx.arc(px, pCy, pr, 0, Math.PI * 2);
                ctx.fill();

                // Atmosphere rim
                ctx.strokeStyle = 'rgba(80,120,255,0.4)';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(px, pCy, pr, 0, Math.PI * 2);
                ctx.stroke();

                ctx.restore();

                // Horizon haze
                const haze = ctx.createLinearGradient(0, horizY - 60, 0, horizY);
                haze.addColorStop(0, 'rgba(0,0,0,0)');
                haze.addColorStop(1, 'rgba(10,10,50,0.5)');
                ctx.fillStyle = haze;
                ctx.fillRect(0, horizY - 60, PLAY_W, 60);
                break;
            }

            case 'sky': {
                // Sun with halo
                const sx = PLAY_W * 0.38;
                const sy = PLAY_H * 0.28;
                const sR = 42;

                const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sR * 3.5);
                sg.addColorStop(0,    'rgba(255,250,200,0.55)');
                sg.addColorStop(0.18, 'rgba(255,220,100,0.30)');
                sg.addColorStop(0.45, 'rgba(255,190,60,0.12)');
                sg.addColorStop(1,    'rgba(0,0,0,0)');
                ctx.fillStyle = sg;
                ctx.fillRect(sx - sR * 4, sy - sR * 4, sR * 8, sR * 8);

                ctx.globalAlpha = 0.9;
                ctx.fillStyle = '#fff8e0';
                ctx.beginPath();
                ctx.arc(sx, sy, sR, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;

                // Atmospheric haze at horizon
                const atm = ctx.createLinearGradient(0, horizY - 80, 0, horizY);
                atm.addColorStop(0, 'rgba(0,0,0,0)');
                atm.addColorStop(1, 'rgba(80,130,200,0.35)');
                ctx.fillStyle = atm;
                ctx.fillRect(0, horizY - 80, PLAY_W, 80);
                break;
            }

            case 'digital': {
                // Pulsing energy portal
                const pcx = PLAY_W * 0.5;
                const pcy = horizY - 5;
                const pulse = 0.85 + 0.15 * Math.sin(this.time * 2.2);
                const pr2 = 55 * pulse;

                const pg2 = ctx.createRadialGradient(pcx, pcy, 0, pcx, pcy, pr2 * 3);
                pg2.addColorStop(0,   'rgba(200,0,255,0.35)');
                pg2.addColorStop(0.3, 'rgba(120,0,200,0.18)');
                pg2.addColorStop(0.7, 'rgba(50,0,100,0.06)');
                pg2.addColorStop(1,   'rgba(0,0,0,0)');
                ctx.fillStyle = pg2;
                ctx.fillRect(pcx - pr2 * 3.5, pcy - pr2 * 3.5, pr2 * 7, pr2 * 7);

                ctx.strokeStyle = `rgba(220,0,255,${0.5 + 0.3 * Math.sin(this.time * 3)})`;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(pcx, pcy, pr2, 0, Math.PI * 2);
                ctx.stroke();

                ctx.strokeStyle = `rgba(0,255,200,${0.3 + 0.2 * Math.sin(this.time * 2.8 + 1)})`;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(pcx, pcy, pr2 * 1.35, 0, Math.PI * 2);
                ctx.stroke();
                break;
            }

            case 'void': {
                // Dark singularity — deep black disc with event-horizon glow
                const vcx = PLAY_W * 0.5;
                const vcy = horizY + 20;
                const vr = 45;

                const vg = ctx.createRadialGradient(vcx, vcy, 0, vcx, vcy, vr * 3.5);
                vg.addColorStop(0,    'rgba(0,0,0,1)');
                vg.addColorStop(0.28, 'rgba(60,0,10,0.8)');
                vg.addColorStop(0.55, 'rgba(120,0,30,0.2)');
                vg.addColorStop(1,    'rgba(0,0,0,0)');
                ctx.fillStyle = vg;
                ctx.fillRect(vcx - vr * 4, vcy - vr * 4, vr * 8, vr * 8);

                ctx.save();
                ctx.beginPath();
                ctx.rect(0, 0, PLAY_W, horizY);
                ctx.clip();
                const rim = ctx.createRadialGradient(vcx, vcy, vr * 0.7, vcx, vcy, vr * 1.1);
                rim.addColorStop(0, 'rgba(0,0,0,0)');
                rim.addColorStop(0.7, 'rgba(180,0,40,0.22)');
                rim.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = rim;
                ctx.fillRect(vcx - vr * 1.5, vcy - vr * 1.5, vr * 3, vr * 3);
                ctx.restore();
                break;
            }
        }
    },

    _drawMidLayer(ctx, t) {
        for (const m of this.midLayer) {
            switch (this.bgType) {
                case 'synthwave':
                    ctx.globalAlpha = 0.06;
                    ctx.strokeStyle = t.accent;
                    ctx.lineWidth = 0.5;
                    ctx.beginPath();
                    ctx.arc(m.x, m.y, m.size * 2.5, 0, Math.PI * 2);
                    ctx.stroke();
                    break;
                case 'industrial':
                    // Smoke handled separately in _smokePuffs; mid layer = ember sparks
                    if (m.y < PLAY_H * 0.78) {
                        ctx.globalAlpha = 0.18 + 0.12 * Math.sin(this.time * 3 + m.phase);
                        ctx.fillStyle = m.type < 2 ? '#ff6600' : '#ffaa00';
                        ctx.fillRect(m.x, m.y, m.size * 0.6, m.size * 0.6);
                    }
                    break;
                case 'space':
                    // Slowly blinking satellite lights
                    if (Math.sin(this.time * 0.8 + m.phase) > 0.6) {
                        ctx.globalAlpha = 0.3;
                        ctx.fillStyle = '#88aaff';
                        ctx.fillRect(m.x, m.y, m.size * 0.8, m.size * 0.8);
                    }
                    break;
                case 'sky':
                    // Wispy cirrus streaks
                    ctx.globalAlpha = 0.06 + 0.03 * Math.sin(this.time * 0.3 + m.phase);
                    ctx.strokeStyle = '#c8e0f8';
                    ctx.lineWidth = m.size * 0.4;
                    ctx.beginPath();
                    ctx.moveTo(m.x - m.size * 5, m.y);
                    ctx.lineTo(m.x + m.size * 5, m.y + m.size * 0.5);
                    ctx.stroke();
                    break;
                case 'digital':
                    // Floating hex digits
                    ctx.globalAlpha = 0.15 + 0.1 * Math.sin(this.time * 1.5 + m.phase);
                    ctx.fillStyle = m.type % 2 === 0 ? t.accent : t.accent2;
                    ctx.font = `${7 + m.size}px monospace`;
                    ctx.fillText(m.type === 0 ? '0' : m.type === 1 ? '1' : m.type === 2 ? 'F' : 'A', m.x, m.y);
                    break;
                case 'void':
                    if (Math.sin(this.time * 2 + m.phase) > 0.5) {
                        ctx.globalAlpha = 0.12;
                        ctx.fillStyle = '#ff0033';
                        ctx.fillRect(m.x, m.y, m.size * 0.5, m.size * 0.5);
                    }
                    break;
            }
        }
        ctx.globalAlpha = 1;
    },

    _drawDistantBuildings(ctx, t) {
        if (this.distantBuildings.length === 0) return;
        const baseY = PLAY_H * 0.78;
        ctx.fillStyle = t.silFar;
        ctx.globalAlpha = 0.65;
        for (const b of this.distantBuildings) {
            ctx.fillRect(b.x, baseY - b.h, b.w, b.h + 120);
        }
        ctx.globalAlpha = 1;
    },

    _drawBuildings(ctx, t) {
        const baseY = PLAY_H * 0.78;

        // Gradient fade at the top of the silhouette region
        const fade = ctx.createLinearGradient(0, baseY - 160, 0, baseY - 80);
        fade.addColorStop(0, 'rgba(0,0,0,0)');
        fade.addColorStop(1, t.sil);
        ctx.fillStyle = fade;
        ctx.fillRect(0, baseY - 160, PLAY_W, 80);

        switch (this.bgType) {

            case 'synthwave':
            case 'industrial': {
                for (const b of this.buildings) {
                    const bx = b.x, bw = b.w, bh = b.h;

                    // Main body
                    ctx.fillStyle = t.sil;
                    ctx.fillRect(bx, baseY - bh, bw, bh + 120);

                    // Roof accent line
                    ctx.strokeStyle = t.accent;
                    ctx.globalAlpha = 0.30;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(bx, baseY - bh);
                    ctx.lineTo(bx + bw, baseY - bh);
                    ctx.stroke();
                    ctx.globalAlpha = 1;

                    // Antenna
                    const antBlink = Math.sin(this.time * 1.8 + b.antennaPhase) > 0.6;
                    ctx.fillStyle = t.sil;
                    ctx.fillRect(bx + bw / 2 - 1, baseY - bh - 10, 2, 10);
                    if (antBlink) {
                        ctx.fillStyle = '#ff4444';
                        ctx.globalAlpha = 0.8;
                        ctx.fillRect(bx + bw / 2 - 2, baseY - bh - 12, 4, 4);
                        ctx.globalAlpha = 1;
                    }

                    // Windows — time-based phases, no per-frame randomness
                    for (const w of b.windows) {
                        const lit = Math.sin(this.time * w.speed + w.phase) > (w.lit ? -0.1 : 0.7);
                        if (!lit) continue;
                        const alpha = 0.12 + 0.18 * Math.abs(Math.sin(this.time * w.speed + w.phase));
                        const col = w.phase % 1 < 0.25 ? t.winB : t.winA;
                        ctx.fillStyle = col + alpha + ')';
                        ctx.fillRect(bx + w.relX, baseY - bh + w.relY, 3, 3);
                    }
                }

                // Smoke for industrial
                for (const p of this._smokePuffs) {
                    ctx.globalAlpha = p.alpha;
                    ctx.fillStyle = '#221006';
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.globalAlpha = 1;
                break;
            }

            case 'digital': {
                for (const b of this.buildings) {
                    ctx.fillStyle = t.sil;
                    ctx.fillRect(b.x, baseY - b.h, b.w, b.h + 120);

                    // Scan lines on tower face
                    const scanY = ((this.time * 60 + b.phase * 40) % b.h);
                    ctx.strokeStyle = t.accent2;
                    ctx.globalAlpha = 0.35;
                    ctx.lineWidth = 1;
                    for (let dy = 0; dy < b.h; dy += 12) {
                        const lineAlpha = 0.15 + 0.25 * Math.abs(Math.sin((dy - scanY) * 0.15));
                        ctx.globalAlpha = lineAlpha;
                        ctx.beginPath();
                        ctx.moveTo(b.x, baseY - b.h + dy);
                        ctx.lineTo(b.x + b.w, baseY - b.h + dy);
                        ctx.stroke();
                    }
                    // Tip glow
                    ctx.globalAlpha = 0.4 + 0.3 * Math.sin(this.time * 2 + b.phase);
                    ctx.fillStyle = t.accent;
                    ctx.fillRect(b.x + b.w / 2 - 1, baseY - b.h - 5, 2, 6);
                    ctx.globalAlpha = 1;
                }
                break;
            }

            case 'space': {
                for (const b of this.buildings) {
                    ctx.fillStyle = t.sil;
                    switch (b.type) {
                        case 'antenna':
                            ctx.fillRect(b.x + b.w / 2 - 2, baseY - b.h, 4, b.h + 120);
                            ctx.fillRect(b.x, baseY - b.h * 0.55, b.w, 3);
                            if (Math.sin(this.time * 1.5 + b.phase) > 0.4) {
                                ctx.fillStyle = '#ff4444';
                                ctx.globalAlpha = 0.75;
                                ctx.fillRect(b.x + b.w / 2 - 2, baseY - b.h - 3, 4, 4);
                                ctx.globalAlpha = 1;
                            }
                            break;
                        case 'dish':
                            ctx.fillRect(b.x + b.w / 2 - 3, baseY - b.h * 0.5, 6, b.h * 0.5 + 120);
                            ctx.beginPath();
                            ctx.arc(b.x + b.w / 2, baseY - b.h * 0.5, b.w / 2, Math.PI, 0);
                            ctx.fill();
                            break;
                        case 'relay':
                            ctx.fillRect(b.x + b.w / 2 - 2, baseY - b.h, 4, b.h + 120);
                            ctx.fillRect(b.x + b.w * 0.1, baseY - b.h * 0.7, b.w * 0.8, 3);
                            ctx.fillRect(b.x + b.w * 0.1, baseY - b.h * 0.4, b.w * 0.8, 3);
                            break;
                    }
                }
                break;
            }

            case 'sky': {
                // Layered clouds — each cloud has its own baseY and scroll speed
                for (const b of this.buildings) {
                    const alpha = [0.35, 0.45, 0.55][b.layer];
                    const drift = Math.sin(this.time * 0.08 * b.scrollSpeed + b.phase) * 6;
                    ctx.globalAlpha = alpha;
                    ctx.fillStyle = t.sil;
                    ctx.beginPath();
                    ctx.ellipse(b.x + b.w / 2 + drift, b.baseY, b.w / 2, b.h / 2, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.ellipse(b.x + b.w * 0.28 + drift, b.baseY - b.h * 0.25, b.w * 0.32, b.h * 0.42, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.ellipse(b.x + b.w * 0.75 + drift, b.baseY - b.h * 0.15, b.w * 0.28, b.h * 0.36, 0, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.globalAlpha = 1;
                break;
            }

            case 'void': {
                for (const b of this.buildings) {
                    ctx.fillStyle = t.sil;
                    ctx.beginPath();
                    ctx.moveTo(b.x, baseY + 120);
                    ctx.lineTo(b.x, baseY - b.h * 0.35);
                    ctx.lineTo(b.x + b.w * 0.22, baseY - b.h);
                    ctx.lineTo(b.x + b.w * 0.5,  baseY - b.h * 0.55);
                    ctx.lineTo(b.x + b.w * 0.72, baseY - b.h * 0.88);
                    ctx.lineTo(b.x + b.w,         baseY - b.h * 0.28);
                    ctx.lineTo(b.x + b.w,         baseY + 120);
                    ctx.closePath();
                    ctx.fill();

                    // Random glitch seam
                    if (Math.sin(this.time * 3.5 + b.phase) > 0.85) {
                        ctx.strokeStyle = 'rgba(255,0,50,0.28)';
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(b.x, baseY - b.h * Math.abs(Math.sin(this.time + b.phase)));
                        ctx.lineTo(b.x + b.w, baseY - b.h * Math.abs(Math.cos(this.time + b.phase)));
                        ctx.stroke();
                    }
                }
                break;
            }
        }
    },

    _drawGrid(ctx, t) {
        const horizon = PLAY_H * 0.80;
        const gridH = PLAY_H - horizon;

        ctx.save();
        ctx.strokeStyle = t.grid;
        ctx.lineWidth = 1;

        // Horizontal lines — perspective spacing
        for (let i = 0; i < 16; i++) {
            const tt = (i * 60 + this.gridOffset) / (16 * 60);
            const y = horizon + tt * tt * gridH;
            if (y > PLAY_H) continue;
            ctx.globalAlpha = Math.min(1, tt * 3) * 0.32;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(PLAY_W, y);
            ctx.stroke();
        }

        // Vertical lines — converge at vanishing point
        ctx.globalAlpha = 0.22;
        ctx.strokeStyle = t.vgrid;
        const vx = PLAY_W / 2;
        for (let i = -10; i <= 10; i++) {
            ctx.beginPath();
            ctx.moveTo(vx + i * 3, horizon);
            ctx.lineTo(vx + i * 58, PLAY_H);
            ctx.stroke();
        }
        ctx.restore();
    },

    _drawForeground(ctx, t) {
        ctx.save();
        for (const f of this.foreground) {
            ctx.globalAlpha = f.alpha;
            ctx.fillStyle = t.streak;
            ctx.fillRect(f.x, f.y, f.size * 0.4, f.length);
        }
        ctx.restore();
    },

    _drawOverlay(ctx, t) {
        switch (this.bgType) {

            case 'digital': {
                // Falling data-stream columns
                ctx.save();
                ctx.font = '9px monospace';
                for (const ds of this._dataStreams) {
                    const colH = ds.chars.length * 11;
                    const baseY = (ds.yOffset + this.time * ds.speed) % (PLAY_H + colH) - colH;
                    for (let i = 0; i < ds.chars.length; i++) {
                        const fade = i / (ds.chars.length - 1);
                        ctx.globalAlpha = ds.alpha * fade;
                        ctx.fillStyle = i === ds.chars.length - 1 ? '#ffffff' : t.accent2;
                        ctx.fillText(ds.chars[i], ds.x, baseY + i * 11);
                    }
                }
                ctx.restore();
                break;
            }

            case 'void': {
                // Reality cracks — jagged glowing lines
                ctx.save();
                const crackCount = 5;
                for (let c = 0; c < crackCount; c++) {
                    const phase = c * 1.3 + this.time * 0.12;
                    if (Math.sin(phase) < -0.3) continue; // cracks appear/disappear
                    const x0 = PLAY_W * (c / crackCount) + Math.sin(phase) * 80;
                    const y0 = PLAY_H * (0.1 + Math.abs(Math.sin(phase * 0.7)) * 0.55);
                    ctx.strokeStyle = `rgba(255,0,60,${0.15 + 0.12 * Math.sin(phase * 2)})`;
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.moveTo(x0, y0);
                    let cx2 = x0, cy2 = y0;
                    for (let seg = 0; seg < 6; seg++) {
                        cx2 += (Math.random() - 0.5) * 35;
                        cy2 += 18 + Math.random() * 20;
                        ctx.lineTo(cx2, cy2);
                    }
                    ctx.stroke();
                    // Inner bright core
                    ctx.strokeStyle = `rgba(255,80,120,${0.08 + 0.06 * Math.sin(phase * 2)})`;
                    ctx.lineWidth = 3;
                    ctx.stroke();
                }

                // Scanline static
                for (let i = 0; i < 4; i++) {
                    const sy = (Math.sin(this.time * 2.8 + i * 43) * 0.5 + 0.5) * PLAY_H;
                    ctx.fillStyle = `rgba(255,0,40,${0.025 + Math.random() * 0.03})`;
                    ctx.fillRect(Math.random() * PLAY_W * 0.5, sy, 60 + Math.random() * 180, 1 + Math.random() * 2);
                }
                ctx.restore();
                break;
            }

            case 'industrial': {
                // Ember particles (mid-layer already handles sparks; add heat shimmer lines)
                ctx.save();
                ctx.strokeStyle = 'rgba(255,100,0,0.04)';
                ctx.lineWidth = 1;
                for (let i = 0; i < 3; i++) {
                    const lx = 60 + i * 220 + Math.sin(this.time * 0.7 + i) * 30;
                    ctx.beginPath();
                    ctx.moveTo(lx, PLAY_H * 0.5);
                    ctx.lineTo(lx + Math.sin(this.time + i * 2) * 15, PLAY_H * 0.78);
                    ctx.stroke();
                }
                ctx.restore();
                break;
            }
        }
    },
};
