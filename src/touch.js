// ============================================================
//  TOUCH CONTROLS
//  A floating stick on the left and buttons on the right, drawn on their own
//  full-window canvas (#touch-ui) so they also fit the letterbox in portrait.
//
//  Built to be forgiving, so a thumb can't slide off the controls:
//  - the stick appears wherever the thumb lands on the left half;
//  - the finger that starts the stick owns it until it lifts, wherever it goes;
//  - past the rim the base is dragged along behind the thumb, so reversing
//    direction responds at once instead of after travelling back across;
//  - full speed is reached before the rim, with a small deadzone at the centre;
//  - buttons have hit areas larger than drawn, a touch that misses every button
//    on the right goes to the nearest one, and a held button stays held when
//    the thumb rolls off it.
//
//  Input reads Touch.held / Touch.pressed per action and Touch.move (analog).
//  While moving or focusing, the ship fires (no separate fire button).
// ============================================================
const Touch = {
    canvas: null,
    ctx: null,
    stick: null,         // { id, bx, by, x, y } — base and thumb, CSS px
    move: { x: 0, y: 0 },
    owners: {},          // pointerId -> action of the button that touch started on
    held: {},
    pressed: {},         // latched on touch-down, cleared by Input.lateUpdate()
    _dir: null,          // stick direction used for menu navigation
    _repeatAt: 0,
    _drawn: false,

    DEADZONE: 0.12,      // fraction of the stick radius
    FULL: 0.75,          // full deflection here, before the rim
    HIT: 1.35,           // button hit radius vs drawn radius
    SNAP: 2.4,           // a missed touch on the right goes to a button this close

    init() {
        const c = document.createElement('canvas');
        c.id = 'touch-ui';
        c.style.cssText = 'position: fixed; left: 0; top: 0; width: 100%; height: 100%; z-index: 3; pointer-events: none;';
        document.body.appendChild(c);
        this.canvas = c;
        this.ctx = c.getContext('2d');

        window.addEventListener('pointerdown', e => this._down(e));
        window.addEventListener('pointermove', e => this._moveTo(e));
        window.addEventListener('pointerup', e => this._up(e));
        window.addEventListener('pointercancel', e => this._up(e));
        window.addEventListener('blur', () => this.reset());
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) return;
            // Leaving the app mid-level (call, notification): pause on return
            if (this.visible() && typeof Game !== 'undefined' && Game.state === 'playing') this.pressed.pause = true;
            this.reset();
        });
    },

    enabled() {
        return !(typeof Settings !== 'undefined' && Settings.values.touchControls === 'off');
    },

    visible() {
        if (!this.enabled()) return false;
        return Settings.values.touchControls === 'on' || Input.lastDevice === 'touch';
    },

    reset() {
        this.stick = null;
        this.owners = {};
        this.held = {};
        this.move = { x: 0, y: 0 };
        this._dir = null;
    },

    _mode() {
        return typeof Game !== 'undefined' && Game.state === 'playing' ? 'play' : 'menu';
    },

    // Sizes scale with the short side of the window: u ≈ 39 px on a phone in landscape
    _unit() { return Math.max(28, Math.min(window.innerWidth, window.innerHeight) / 10); },
    _radius() { return this._unit() * 1.5; },

    _buttons() {
        const W = window.innerWidth, H = window.innerHeight, u = this._unit();
        const at = (rx, ry) => ({ x: W - rx * u, y: H - ry * u });
        if (this._mode() === 'menu') {
            return [
                { action: 'confirm', label: 'A', r: 1.15 * u, color: '#00ff88', ...at(2.0, 2.0) },
                { action: 'back', label: 'B', r: 0.85 * u, color: '#ff3366', ...at(4.6, 1.3) },
            ];
        }
        return [
            { action: 'focus', label: 'FOCUS', r: 1.2 * u, color: '#00e5ff', ...at(2.0, 2.0) },
            { action: 'bomb', label: 'BOMB', r: 0.85 * u, color: '#ff3366', ...at(4.6, 1.3) },
            { action: 'dash', label: 'DASH', r: 0.85 * u, color: '#ffcc00', ...at(1.3, 4.6) },
            { action: 'surge', label: 'SURGE', r: 0.85 * u, color: '#cc44ff', ...at(4.0, 4.0) },
            { action: 'pause', label: 'II', r: 0.6 * u, color: '#8899bb', x: W - 1.0 * u, y: 1.0 * u },
        ];
    },

    // Closest button within `reach` × its radius, measured relative to each radius
    _buttonAt(x, y, reach) {
        let best = null, bestD = Infinity;
        for (const b of this._buttons()) {
            const d = Math.hypot(x - b.x, y - b.y) / b.r;
            if (d < reach && d < bestD) { best = b; bestD = d; }
        }
        return best;
    },

    _down(e) {
        if (e.pointerType !== 'touch' || !this.enabled()) return;
        Input.lastDevice = 'touch';
        const x = e.clientX, y = e.clientY;
        let b = this._buttonAt(x, y, this.HIT);
        if (!b && x < window.innerWidth / 2) {
            // A second finger on the left is ignored: the stick is already owned
            if (!this.stick) this.stick = { id: e.pointerId, bx: x, by: y, x, y };
            return;
        }
        if (!b) b = this._buttonAt(x, y, this.SNAP);
        if (!b) return;
        this.owners[e.pointerId] = b.action;
        this.pressed[b.action] = true;
    },

    _moveTo(e) {
        const s = this.stick;
        if (!s || e.pointerId !== s.id) return;
        s.x = e.clientX;
        s.y = e.clientY;
        // Past the rim, drag the base along so the thumb stays on the rim
        const R = this._radius();
        const dx = s.x - s.bx, dy = s.y - s.by, d = Math.hypot(dx, dy);
        if (d > R) {
            s.bx += dx / d * (d - R);
            s.by += dy / d * (d - R);
        }
    },

    _up(e) {
        if (this.stick && e.pointerId === this.stick.id) {
            this.stick = null;
            this.move = { x: 0, y: 0 };
        }
        delete this.owners[e.pointerId];
    },

    // Called from Input.update() each frame
    update() {
        const s = this.stick;
        this.move = { x: 0, y: 0 };
        if (s) {
            const R = this._radius();
            const dx = (s.x - s.bx) / R, dy = (s.y - s.by) / R, m = Math.hypot(dx, dy);
            if (m > this.DEADZONE) {
                const k = Math.min(1, (m - this.DEADZONE) / (this.FULL - this.DEADZONE)) / m;
                this.move = { x: dx * k, y: dy * k };
            }
        }

        this.held = {};
        for (const id in this.owners) this.held[this.owners[id]] = true;
        if (this._mode() === 'play' && (s || this.held.focus)) this.held.fire = true;

        // Menus: the stick gives single presses, repeating while held
        const mx = this.move.x, my = this.move.y;
        let dir = null;
        if (Math.hypot(mx, my) > 0.5) dir = Math.abs(mx) > Math.abs(my) ? (mx < 0 ? 'left' : 'right') : (my < 0 ? 'up' : 'down');
        const now = performance.now();
        if (dir !== this._dir) {
            this._dir = dir;
            if (dir) { this.pressed[dir] = true; this._repeatAt = now + 400; }
        } else if (dir && now >= this._repeatAt) {
            this.pressed[dir] = true;
            this._repeatAt = now + 130;
        }
    },

    lateUpdate() {
        this.pressed = {};
    },

    draw() {
        if (!this.canvas) return;
        const c = this.canvas, g = this.ctx;
        const dpr = window.devicePixelRatio || 1;
        const W = window.innerWidth, H = window.innerHeight;
        if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
            c.width = Math.round(W * dpr);
            c.height = Math.round(H * dpr);
        }
        if (!this.visible()) {
            if (this._drawn) { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); this._drawn = false; }
            return;
        }
        this._drawn = true;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, W, H);
        const u = this._unit(), R = this._radius();
        g.textAlign = 'center';
        g.textBaseline = 'middle';

        // Stick: live where the thumb is, or a faint marker showing where to put it
        const s = this.stick;
        const bx = s ? s.bx : 2.4 * u, by = s ? s.by : H - 2.4 * u;
        this._ring(g, bx, by, R, '#00e5ff', s ? 0.5 : 0.22, s ? 0.08 : 0.03);
        if (s) {
            const dx = s.x - s.bx, dy = s.y - s.by, d = Math.hypot(dx, dy), k = d > R ? R / d : 1;
            this._ring(g, s.bx + dx * k, s.by + dy * k, 0.55 * u, '#00e5ff', 0.85, 0.3);
        } else {
            g.globalAlpha = 0.35;
            g.fillStyle = '#00e5ff';
            g.font = Math.round(0.36 * u) + "px 'Share Tech Mono', monospace";
            g.fillText('MOVE', bx, by);
        }

        for (const b of this._buttons()) {
            const on = this.held[b.action];
            this._ring(g, b.x, b.y, b.r, b.color, on ? 0.95 : 0.5, on ? 0.35 : 0.1);
            g.globalAlpha = on ? 1 : 0.7;
            g.fillStyle = on ? '#ffffff' : b.color;
            g.font = 'bold ' + Math.round(Math.min(0.42 * u, b.r * (b.label.length > 2 ? 0.42 : 0.8))) + "px 'Share Tech Mono', monospace";
            g.fillText(b.label, b.x, b.y);
        }

        if (H > W) {
            g.globalAlpha = 0.6;
            g.fillStyle = '#8899bb';
            g.font = Math.round(0.4 * u) + "px 'Share Tech Mono', monospace";
            g.fillText('ROTATE FOR A BIGGER VIEW', W / 2, 1.0 * u);
        }
        g.globalAlpha = 1;
    },

    _ring(g, x, y, r, color, stroke, fill) {
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.globalAlpha = fill;
        g.fillStyle = color;
        g.fill();
        g.globalAlpha = stroke;
        g.strokeStyle = color;
        g.lineWidth = 2;
        g.stroke();
    },
};
