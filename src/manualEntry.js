/**
 * manualEntry.js — Manual color entry for all 6 cube faces
 *
 * Renders a clickable 2D net where each sticker cycles through the
 * 6 cube colors on click. Centers are locked to their face color.
 * On submission, populates cubeState and advances to the solve stage.
 */

const FACE_COLORS = ['white', 'yellow', 'red', 'orange', 'green', 'blue'];

// Standard solved-state center colors per face (WCA orientation)
const CENTER_COLORS = { U: 'white', R: 'red', F: 'green', D: 'yellow', L: 'orange', B: 'blue' };

// Face layout in the 2D net (cross layout: U top, L/F/R/B middle row, D bottom)
const NET_LAYOUT = ['U', 'L', 'F', 'R', 'B', 'D'];

export class ManualEntryController {
    constructor(cubeState, onComplete) {
        this._cubeState = cubeState;
        this._onComplete = onComplete;   // called when user confirms entry

        // Internal 6-face state: each face is an array of 9 color strings
        this._faces = {};
        NET_LAYOUT.forEach(face => {
            this._faces[face] = Array.from({ length: 9 }, (_, i) =>
                i === 4 ? CENTER_COLORS[face] : 'white'
            );
        });
    }

    /** Render the manual entry panel into the given container element. */
    mount(container) {
        container.innerHTML = '';

        const heading = document.createElement('h3');
        heading.textContent = 'Enter Cube Colors Manually';
        heading.style.marginBottom = '12px';
        container.appendChild(heading);

        const hint = document.createElement('p');
        hint.className = 'manual-entry-hint';
        hint.textContent = 'Click any sticker to cycle its color. Center stickers (middle of each face) are locked.';
        container.appendChild(hint);

        const net = document.createElement('div');
        net.className = 'cube-net';
        container.appendChild(net);

        NET_LAYOUT.forEach(faceKey => {
            const faceWrap = document.createElement('div');
            faceWrap.className = `net-face net-face-${faceKey}`;

            const label = document.createElement('div');
            label.className = 'net-face-label';
            label.textContent = faceKey;
            faceWrap.appendChild(label);

            const grid = document.createElement('div');
            grid.className = 'net-grid';

            this._faces[faceKey].forEach((color, idx) => {
                const sticker = document.createElement('div');
                sticker.className = `net-sticker color-${color}`;
                sticker.dataset.face = faceKey;
                sticker.dataset.index = idx;
                sticker.title = `${faceKey}[${idx}] — click to cycle color`;

                if (idx === 4) {
                    sticker.classList.add('net-sticker-center');
                } else {
                    sticker.addEventListener('click', () => this._cycleColor(faceKey, idx, sticker));
                }

                grid.appendChild(sticker);
            });

            faceWrap.appendChild(grid);
            net.appendChild(faceWrap);
        });

        // Action buttons
        const actions = document.createElement('div');
        actions.className = 'manual-entry-actions';

        const btnReset = document.createElement('button');
        btnReset.className = 'btn btn-secondary';
        btnReset.textContent = '↺ Reset to Solved';
        btnReset.addEventListener('click', () => this._resetToSolved(container));
        actions.appendChild(btnReset);

        const btnConfirm = document.createElement('button');
        btnConfirm.id = 'manual-entry-confirm';
        btnConfirm.className = 'btn btn-primary';
        btnConfirm.textContent = '✓ Use This Cube';
        btnConfirm.addEventListener('click', () => this._confirm(container));
        actions.appendChild(btnConfirm);

        container.appendChild(actions);

        this._errorEl = document.createElement('p');
        this._errorEl.className = 'manual-entry-error';
        this._errorEl.style.display = 'none';
        container.appendChild(this._errorEl);
    }

    _cycleColor(faceKey, idx, el) {
        const current = this._faces[faceKey][idx];
        const next = FACE_COLORS[(FACE_COLORS.indexOf(current) + 1) % FACE_COLORS.length];
        this._faces[faceKey][idx] = next;
        // Remove old color class and add new
        FACE_COLORS.forEach(c => el.classList.remove(`color-${c}`));
        el.classList.add(`color-${next}`);
    }

    _resetToSolved(container) {
        NET_LAYOUT.forEach(face => {
            this._faces[face] = Array.from({ length: 9 }, (_, i) =>
                i === 4 ? CENTER_COLORS[face] : CENTER_COLORS[face]
            );
        });
        this.mount(container);
    }

    _confirm(container) {
        const validation = this._validate();
        if (!validation.valid) {
            this._errorEl.textContent = validation.error;
            this._errorEl.style.display = 'block';
            return;
        }
        this._errorEl.style.display = 'none';

        // Populate cubeState
        this._cubeState.reset();
        Object.entries(this._faces).forEach(([faceKey, cells]) => {
            const normalized = cells.map(color => ({ color }));
            this._cubeState.captureFace(faceKey, normalized);
        });

        this._onComplete();
    }

    _validate() {
        // Each of the 6 colors must appear exactly 9 times
        const counts = {};
        FACE_COLORS.forEach(c => { counts[c] = 0; });

        NET_LAYOUT.forEach(face => {
            this._faces[face].forEach(color => {
                if (counts[color] !== undefined) counts[color]++;
                else counts[color] = 1;
            });
        });

        for (const [color, count] of Object.entries(counts)) {
            if (count !== 9) {
                return {
                    valid: false,
                    error: `Color "${color}" appears ${count} time(s) — each color must appear exactly 9 times.`
                };
            }
        }

        // Centers must match standard orientation
        for (const face of NET_LAYOUT) {
            const center = this._faces[face][4];
            if (center !== CENTER_COLORS[face]) {
                return {
                    valid: false,
                    error: `Center of face ${face} must be ${CENTER_COLORS[face]} (was ${center}).`
                };
            }
        }

        return { valid: true };
    }
}
