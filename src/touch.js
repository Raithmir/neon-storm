// ============================================================
//  TOUCH CONTROLS
//  Drawn on their own full-window canvas (#touch-ui).
//
//  Menus (every state but 'playing') are tapped: screens register their
//  targets with UI.tap while drawing. Touch-down selects (highlights) a
//  target, lifting the finger on it activates it; a drag scrolls a list that
//  set UI.scroll, and cancels the tap. A BACK button sits in the bottom-left
//  (clear of titles, near the thumb) on screens that have a back action.
//
//  In play, buttons on the right, and two ways to move (Settings TOUCH MOVE):
//  - DRAG (default): a finger anywhere off the buttons moves the ship by the
//    distance it travels, 1:1 with the screen, so the thumb never covers the
//    ship. The ship still moves at most at its normal top speed, and only a
//    short way behind the finger is stored, so it can't overshoot after a lift.
//    No FOCUS button: the hitbox shows while dragging.
//  - STICK: a floating analog stick, built so a thumb can't slide off it:
//  - the stick appears wherever the thumb lands on the left half;
//  - the finger that starts the stick owns it until it lifts, wherever it goes;
//  - past the rim the base is dragged along behind the thumb, so reversing
//    direction responds at once instead of after travelling back across;
//  - full speed is reached before the rim, with a small deadzone at the centre;
//  - buttons have hit areas larger than drawn, a touch that misses every button
//    on the right goes to the nearest one, and a held button stays held when
//    the thumb rolls off it.
//  Pause: a button top-right in landscape; in portrait, tap the HUD strip.
//
//  Input reads Touch.held / Touch.pressed per action and Touch.move (analog);
//  Player reads Touch.pending (drag travel still to cover, play-area px).
//  While moving or focusing, the ship fires (no separate fire button).
// ============================================================
const Touch = {
    canvas: null,
    ctx: null,
    stick: null,         // { id, bx, by, x, y } — base and thumb, CSS px
    move: { x: 0, y: 0 },
    drag: null,          // { id, x, y } — the dragging finger, CSS px
    pending: { x: 0, y: 0 },
    heading: null,       // direction of the latest drag travel, for dash
    _headingAge: 0,      // frames since the drag last moved
    owners: {},          // pointerId -> action of the button that touch started on
    held: {},
    pressed: {},         // latched on touch-down/tap, cleared by Input.lateUpdate()
    menuTouch: null,     // { id, x0, y0, target, moved, rows } — a finger on a menu
    _drawn: false,

    DEADZONE: 0.12,      // fraction of the stick radius
    FULL: 0.75,          // full deflection here, before the rim
    HIT: 1.35,           // button hit radius vs drawn radius
    SNAP: 2.4,           // a missed touch on the right goes to a button this close
    DRAG_LAG: 0.3,       // seconds of travel at top speed the ship may trail the finger
    SLOP: 12,            // CSS px a menu touch may move and still count as a tap

    init() {
        const c = document.createElement('canvas');
        c.id = 'touch-ui';
        c.style.cssText = 'position: fixed; left: 0; top: 0; width: 100%; height: 100%; z-index: 3; pointer-events: none;';
        document.body.appendChild(c);
        this.canvas = c;
        this.ctx = c.getContext('2d');

        window.addEventListener('pointerdown', e => this._down(e));
        window.addEventListener('pointermove', e => this._moveTo(e));
        window.addEventListener('pointerup', e => this._up(e, true));
        window.addEventListener('pointercancel', e => this._up(e, false));
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
        this.drag = null;
        this.menuTouch = null;
        this.pending = { x: 0, y: 0 };
        this.owners = {};
        this.held = {};
        this.move = { x: 0, y: 0 };
    },

    _mode() {
        return typeof Game !== 'undefined' && Game.state === 'playing' ? 'play' : 'menu';
    },

    // Sizes scale with the short side of the window: u ≈ 39 px on a phone
    _unit() { return Math.max(28, Math.min(48, Math.min(window.innerWidth, window.innerHeight) / 10)); },
    _radius() { return this._unit() * 1.5; },
    _dragMode() { return this._mode() === 'play' && Settings.values.touchMove !== 'stick'; },
    dragging() { return !!this.drag; },

    // Window CSS px -> overlay logical px (the overlay is letterboxed in landscape)
    _logical(x, y) {
        const r = canvas.getBoundingClientRect();
        return { x: (x - r.left) * SCREEN_W / r.width, y: (y - r.top) * SCREEN_H / r.height };
    },

    // Portrait: the bottom of the play area and of the HUD strip, CSS px
    _belowPlay() { return canvas.getBoundingClientRect().top + (PLAY_Y + PLAY_H) * Layout.scale; },
    _stripBottom() { return canvas.getBoundingClientRect().top + PLAY_Y * Layout.scale; },

    // Menus: a BACK button in the bottom-left, on screens where back does something
    NO_BACK: ['title', 'game_over', 'victory', 'practice_complete', 'rush_complete', 'campaign_complete'],
    _backButton() {
        if (this._mode() !== 'menu' || this.NO_BACK.includes(Game.state)) return null;
        const u = this._unit();
        return { action: 'back', label: 'BACK', x: 1.5 * u, y: window.innerHeight - 1.0 * u, w: 2.4 * u, h: 1.0 * u, color: '#8899bb' };
    },

    // Play-mode buttons (round)
    _buttons() {
        if (this._mode() === 'menu') return [];
        const W = window.innerWidth, H = window.innerHeight, u = this._unit();
        const at = (rx, ry) => ({ x: W - rx * u, y: H - ry * u });
        // Portrait pauses by tapping the HUD strip instead
        const pause = Layout.portrait ? [] : [{ action: 'pause', label: 'II', r: 0.6 * u, color: '#8899bb', x: W - 1.0 * u, y: 1.0 * u }];
        if (this._dragMode()) {
            return [
                { action: 'bomb', label: 'BOMB', r: 1.15 * u, color: '#ff3366', ...at(2.0, 2.0) },
                { action: 'dash', label: 'DASH', r: 0.85 * u, color: '#ffcc00', ...at(4.6, 1.3) },
                { action: 'surge', label: 'SURGE', r: 0.85 * u, color: '#cc44ff', ...at(1.3, 4.6) },
                ...pause,
            ];
        }
        return [
            { action: 'focus', label: 'FOCUS', r: 1.2 * u, color: '#00e5ff', ...at(2.0, 2.0) },
            { action: 'bomb', label: 'BOMB', r: 0.85 * u, color: '#ff3366', ...at(4.6, 1.3) },
            { action: 'dash', label: 'DASH', r: 0.85 * u, color: '#ffcc00', ...at(1.3, 4.6) },
            { action: 'surge', label: 'SURGE', r: 0.85 * u, color: '#cc44ff', ...at(4.0, 4.0) },
            ...pause,
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

    _press(id, action) {
        this.owners[id] = action;
        this.pressed[action] = true;
    },

    _down(e) {
        if (e.pointerType !== 'touch' || !this.enabled()) return;
        Input.lastDevice = 'touch';
        const x = e.clientX, y = e.clientY;
        if (this._mode() === 'menu') return this._menuDown(e, x, y);

        let b = this._buttonAt(x, y, this.HIT);
        // Portrait: the HUD strip is the pause button
        if (!b && Layout.portrait && y < this._stripBottom()) return this._press(e.pointerId, 'pause');
        if (!b && this._dragMode()) {
            // Any touch off the buttons drags; while one already does, a
            // second goes to the nearest button instead
            if (!this.drag && !this.stick) { this.drag = { id: e.pointerId, x, y }; return; }
            b = this._buttonAt(x, y, this.SNAP);
            if (b) this._press(e.pointerId, b.action);
            return;
        }
        if (!b && x < window.innerWidth / 2) {
            // A second finger on the left is ignored: the stick is already owned
            if (!this.stick) this.stick = { id: e.pointerId, bx: x, by: y, x, y };
            return;
        }
        if (!b) b = this._buttonAt(x, y, this.SNAP);
        if (b) this._press(e.pointerId, b.action);
    },

    _menuDown(e, x, y) {
        const back = this._backButton();
        const pad = 0.25 * this._unit();
        if (back && Math.abs(x - back.x) < back.w / 2 + pad && Math.abs(y - back.y) < back.h / 2 + pad) {
            return this._press(e.pointerId, 'back');
        }
        if (this.menuTouch) return; // one finger at a time on menus
        const p = this._logical(x, y);
        const target = UI.tapAt(p.x, p.y);
        if (target && target.act.sel) target.act.sel();
        this.menuTouch = { id: e.pointerId, x0: x, y0: y, target, moved: false, rows: 0 };
    },

    _moveTo(e) {
        const m = this.menuTouch;
        if (m && e.pointerId === m.id) {
            const dy = e.clientY - m.y0;
            if (Math.hypot(e.clientX - m.x0, dy) > this.SLOP) m.moved = true;
            // Drag-to-scroll: one row per `step` of travel, finger up = list moves up
            if (m.moved && UI.scroll) {
                const rows = Math.trunc(-dy / (UI.scroll.step * Layout.scale));
                if (rows !== m.rows) { UI.scroll.by(rows - m.rows); m.rows = rows; }
            }
            return;
        }
        const f = this.drag;
        if (f && e.pointerId === f.id) {
            // Screen travel -> play-area px (the overlay canvas spans SCREEN_W)
            const k = SCREEN_W / (canvas.clientWidth || SCREEN_W);
            const dx = (e.clientX - f.x) * k, dy = (e.clientY - f.y) * k;
            f.x = e.clientX;
            f.y = e.clientY;
            this.pending.x += dx;
            this.pending.y += dy;
            const d = Math.hypot(dx, dy);
            if (d > 0.5) { this.heading = { x: dx / d, y: dy / d }; this._headingAge = 0; }
            return;
        }
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

    _up(e, released) {
        const m = this.menuTouch;
        if (m && e.pointerId === m.id) {
            this.menuTouch = null;
            // A tap: lifted without moving, on the target it went down on
            if (released && !m.moved && m.target) {
                const p = this._logical(e.clientX, e.clientY);
                if (UI.tapAt(p.x, p.y) === m.target || this._near(m.target, p)) {
                    if (m.target.act.run) m.target.act.run(p);
                    if (m.target.act.press) this.pressed[m.target.act.press] = true;
                }
            }
        }
        if (this.drag && e.pointerId === this.drag.id) this.drag = null;
        if (this.stick && e.pointerId === this.stick.id) {
            this.stick = null;
            this.move = { x: 0, y: 0 };
        }
        delete this.owners[e.pointerId];
    },

    // The tap list is rebuilt every frame, so compare by position, not identity
    _near(t, p) { return p.x >= t.x && p.x <= t.x + t.w && p.y >= t.y && p.y <= t.y + t.h; },

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
        if (this._mode() === 'play' && (s || this.drag || this.held.focus)) this.held.fire = true;
        if (this._mode() !== 'play') this.pending = { x: 0, y: 0 };
        if (++this._headingAge > 8) this.heading = null; // dash only follows a drag still moving
    },

    // Player: how far to move this frame, at most `maxStep`. The rest stays
    // pending, trimmed to DRAG_LAG of travel and to the walls (`room`: the
    // offsets the ship can still move), so pushing into a wall stores nothing
    takeDrag(maxStep, maxSpeed, room) {
        const p = this.pending;
        p.x = Math.max(room.left, Math.min(room.right, p.x));
        p.y = Math.max(room.top, Math.min(room.bottom, p.y));
        let d = Math.hypot(p.x, p.y);
        const cap = maxSpeed * this.DRAG_LAG;
        if (d > cap) { p.x *= cap / d; p.y *= cap / d; d = cap; }
        if (d === 0) return null;
        const k = Math.min(1, maxStep / d);
        const step = { x: p.x * k, y: p.y * k };
        p.x -= step.x;
        p.y -= step.y;
        return step;
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

        if (this._mode() === 'menu') {
            const b = this._backButton();
            if (b) {
                const on = this.held.back;
                g.beginPath();
                g.roundRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h, b.h / 2);
                g.globalAlpha = on ? 0.35 : 0.12;
                g.fillStyle = b.color;
                g.fill();
                g.globalAlpha = on ? 0.95 : 0.6;
                g.strokeStyle = b.color;
                g.lineWidth = 2;
                g.stroke();
                g.globalAlpha = on ? 1 : 0.8;
                g.fillStyle = on ? '#ffffff' : '#c8d2e6';
                g.font = 'bold ' + Math.round(0.38 * u) + "px 'Share Tech Mono', monospace";
                g.fillText('◀ ' + b.label, b.x, b.y);
                g.globalAlpha = 1;
            }
            return;
        }

        // Portrait: the HUD strip pauses; mark it with a small pause icon
        if (Layout.portrait) {
            g.globalAlpha = this.held.pause ? 1 : 0.55;
            g.fillStyle = '#c8d2e6';
            const s = 0.16 * u, top = canvas.getBoundingClientRect().top;
            g.fillRect(0.35 * u, top + 0.2 * u, s, 0.34 * u);
            g.fillRect(0.35 * u + 1.8 * s, top + 0.2 * u, s, 0.34 * u);
            g.globalAlpha = 1;
        }

        if (this._dragMode() && !this.stick) {
            if (this.drag) {
                this._ring(g, this.drag.x, this.drag.y, 0.5 * u, '#00e5ff', 0.45, 0.08);
            } else {
                g.globalAlpha = 0.35;
                g.fillStyle = '#00e5ff';
                g.font = Math.round(0.36 * u) + "px 'Share Tech Mono', monospace";
                // Portrait: under the play area if there's room, else over its lower part
                if (Layout.portrait) g.fillText('DRAG ANYWHERE TO MOVE', W / 2, H - this._belowPlay() > 2 * u ? this._belowPlay() + 0.75 * u : H - 6.2 * u);
                else g.fillText('DRAG ANYWHERE TO MOVE', Math.min(W / 2, 4.5 * u), H - 1.2 * u);
            }
            this._drawButtons(g, u);
            return;
        }

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
        this._drawButtons(g, u);
    },

    _drawButtons(g, u) {
        for (const b of this._buttons()) {
            const on = this.held[b.action];
            this._ring(g, b.x, b.y, b.r, b.color, on ? 0.95 : 0.5, on ? 0.35 : 0.1);
            g.globalAlpha = on ? 1 : 0.7;
            g.fillStyle = on ? '#ffffff' : b.color;
            g.font = 'bold ' + Math.round(Math.min(0.42 * u, b.r * (b.label.length > 2 ? 0.42 : 0.8))) + "px 'Share Tech Mono', monospace";
            g.fillText(b.label, b.x, b.y);
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
