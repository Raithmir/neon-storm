// ============================================================
//  INPUT SYSTEM (Keyboard + Gamepad)
// ============================================================
const Input = {
    keys: {},
    prevKeys: {},
    gamepadState: null,
    prevGamepadState: null,
    listeningForKey: null,    // Action name when waiting for key press
    listeningForButton: null, // Action name when waiting for gamepad button
    lastDevice: 'keyboard',   // 'keyboard' | 'pad' — whichever was used last (for on-screen prompts)

    // Default key bindings
    defaultBindings: {
        up: ['ArrowUp', 'KeyW'],
        down: ['ArrowDown', 'KeyS'],
        left: ['ArrowLeft', 'KeyA'],
        right: ['ArrowRight', 'KeyD'],
        fire: ['Space', 'KeyZ'],
        focus: ['ShiftLeft', 'ShiftRight', 'KeyX'],
        dash: ['KeyC', 'KeyV'],
        bomb: ['KeyB', 'KeyN'],
        surge: ['KeyF', 'KeyM'],
        pause: ['Escape', 'KeyP'],
        confirm: ['Enter', 'Space'],
        back: ['Escape', 'Backspace']
    },

    // Default gamepad bindings
    defaultGpBindings: {
        fire: [0, 2],       // A, X
        focus: [6],          // Left trigger
        dash: [5],           // Right bumper
        bomb: [4],           // Left bumper
        surge: [7, 3],       // Right trigger, Y
        pause: [9],          // Start
        confirm: [0],        // A
        back: [1]            // B
    },

    // Current bindings (rebindable, start as copies of defaults)
    bindings: {},
    gpBindings: {},

    // Actions that can be rebound by the player (excludes menu-only actions)
    rebindableActions: ['up', 'down', 'left', 'right', 'fire', 'focus', 'dash', 'bomb', 'surge', 'pause'],

    // Human-readable names for key codes
    keyDisplayNames: {
        ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
        Space: 'SPACE', ShiftLeft: 'L.SHIFT', ShiftRight: 'R.SHIFT',
        Enter: 'ENTER', Escape: 'ESC', Backspace: 'BACKSPACE', Tab: 'TAB',
        ControlLeft: 'L.CTRL', ControlRight: 'R.CTRL', AltLeft: 'L.ALT', AltRight: 'R.ALT',
    },

    // Human-readable names for gamepad buttons (standard layout)
    gpButtonNames: ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'SELECT', 'START',
                    'L3', 'R3', 'D-UP', 'D-DOWN', 'D-LEFT', 'D-RIGHT', 'HOME'],

    init() {
        // Copy defaults
        this.bindings = JSON.parse(JSON.stringify(this.defaultBindings));
        this.gpBindings = JSON.parse(JSON.stringify(this.defaultGpBindings));

        window.addEventListener('keydown', e => {
            this.keys[e.code] = true;
            this.lastDevice = 'keyboard';
            // If listening for a rebind, capture the key
            if (this.listeningForKey) {
                const action = this.listeningForKey;
                this.listeningForKey = null;
                // Set this key as the primary bind for the action (keep 1 key)
                this.bindings[action] = [e.code];
                // Also update confirm/back if relevant
                if (action === 'pause') this.bindings.back = ['Escape', 'Backspace'];
                this._saveBindings();
                e.preventDefault();
                return;
            }
            e.preventDefault();
        });
        window.addEventListener('keyup', e => {
            this.keys[e.code] = false;
            e.preventDefault();
        });
    },

    update() {
        // Poll gamepad (fresh state for this frame)
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        const gp = gamepads[0];
        if (gp) {
            this.gamepadState = {
                axes: [...gp.axes],
                buttons: gp.buttons.map(b => b.pressed)
            };
            if (this.gamepadState.buttons.some(b => b) || gp.axes.some(a => Math.abs(a) > 0.5)) this.lastDevice = 'pad';
            // If listening for a gamepad rebind, capture the button
            if (this.listeningForButton) {
                for (let i = 0; i < gp.buttons.length; i++) {
                    if (gp.buttons[i].pressed && !(this.prevGamepadState && this.prevGamepadState.buttons[i])) {
                        const action = this.listeningForButton;
                        this.listeningForButton = null;
                        this.gpBindings[action] = [i];
                        if (action === 'pause') this.gpBindings.back = [1];
                        this._saveBindings();
                        break;
                    }
                }
            }
        } else {
            this.gamepadState = null;
        }
    },

    // Call at END of frame to snapshot state for next frame's isPressed comparisons
    lateUpdate() {
        this.prevKeys = { ...this.keys };
        this.prevGamepadState = this.gamepadState ? {
            axes: [...this.gamepadState.axes],
            buttons: [...this.gamepadState.buttons]
        } : null;
    },

    // Check if action is currently held
    isHeld(action) {
        const keys = this.bindings[action];
        if (keys) {
            for (const k of keys) {
                if (this.keys[k]) return true;
            }
        }
        if (this.gamepadState && this.gpBindings[action]) {
            for (const b of this.gpBindings[action]) {
                if (this.gamepadState.buttons[b]) return true;
            }
        }
        return false;
    },

    // Check if action was just pressed this frame
    isPressed(action) {
        // Don't process normal input while listening for rebind
        if (this.listeningForKey || this.listeningForButton) return false;

        const keys = this.bindings[action];
        if (keys) {
            for (const k of keys) {
                if (this.keys[k] && !this.prevKeys[k]) return true;
            }
        }
        if (this.gamepadState && this.gpBindings[action]) {
            for (const b of this.gpBindings[action]) {
                if (this.gamepadState.buttons[b] && !(this.prevGamepadState && this.prevGamepadState.buttons[b])) return true;
            }
        }
        return false;
    },

    // Get movement vector (keyboard + gamepad combined)
    getMovement() {
        let x = 0, y = 0;
        if (this.isHeld('left')) x -= 1;
        if (this.isHeld('right')) x += 1;
        if (this.isHeld('up')) y -= 1;
        if (this.isHeld('down')) y += 1;

        // Gamepad analog stick
        if (this.gamepadState) {
            const deadzone = 0.2;
            const ax = this.gamepadState.axes[0] || 0;
            const ay = this.gamepadState.axes[1] || 0;
            if (Math.abs(ax) > deadzone) x += ax;
            if (Math.abs(ay) > deadzone) y += ay;
        }

        // Normalize
        const len = Math.sqrt(x * x + y * y);
        if (len > 1) { x /= len; y /= len; }
        return { x, y };
    },

    // Get display name for a key code
    getKeyName(code) {
        if (this.keyDisplayNames[code]) return this.keyDisplayNames[code];
        // Strip 'Key' prefix for letter keys
        if (code.startsWith('Key')) return code.slice(3);
        if (code.startsWith('Digit')) return code.slice(5);
        return code;
    },

    // Get display name for a gamepad button
    getButtonName(index) {
        return this.gpButtonNames[index] || ('BTN' + index);
    },

    // Get display string for an action's keyboard binding
    getKeyBindDisplay(action) {
        const keys = this.bindings[action];
        if (!keys || keys.length === 0) return '---';
        return keys.map(k => this.getKeyName(k)).join(' / ');
    },

    // Get display string for an action's gamepad binding
    getGpBindDisplay(action) {
        const btns = this.gpBindings[action];
        if (!btns || btns.length === 0) return '---';
        return btns.map(b => this.getButtonName(b)).join(' / ');
    },

    // Start listening for a key rebind
    startKeyListen(action) {
        this.listeningForKey = action;
        this.listeningForButton = null;
    },

    // Start listening for a gamepad button rebind
    startButtonListen(action) {
        this.listeningForButton = action;
        this.listeningForKey = null;
    },

    // Cancel listening
    cancelListen() {
        this.listeningForKey = null;
        this.listeningForButton = null;
    },

    // Reset all bindings to defaults
    resetBindings() {
        this.bindings = JSON.parse(JSON.stringify(this.defaultBindings));
        this.gpBindings = JSON.parse(JSON.stringify(this.defaultGpBindings));
        this._saveBindings();
    },

    // Save bindings to storage
    async _saveBindings() {
        await Storage.set('inputBindings', {
            keyboard: this.bindings,
            gamepad: this.gpBindings
        });
    },

    // Load bindings from storage
    async loadBindings() {
        const data = await Storage.get('inputBindings');
        if (data) {
            if (data.keyboard) Object.assign(this.bindings, data.keyboard);
            if (data.gamepad) Object.assign(this.gpBindings, data.gamepad);
        }
    }
};
