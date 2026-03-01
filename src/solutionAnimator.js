/**
 * solutionAnimator.js — Step-through move animation on the 3D cube
 *
 * Applies Rubik's Cube moves one at a time to the ThreeScene,
 * animating individual cubie-layer rotations using Three.js quaternion
 * interpolation via a pivot group.
 *
 * Public API:
 *   animator.load(moves, threeScene)  — load a solution for playback
 *   animator.play()                   — auto-play all remaining moves
 *   animator.pause()                  — pause auto-play
 *   animator.stepForward()            — apply one move
 *   animator.stepBack()               — undo one move
 *   animator.reset()                  — return to start state
 *   animator.onProgress(fn)           — called after each move: fn(index, total)
 *   animator.onComplete(fn)           — called when all moves applied
 */

import * as THREE from './vendor/three.module.js';

// Map move names to { axis, angle } for layer rotation
const MOVE_DEFS = {
    'U': { axis: new THREE.Vector3(0, 1, 0), angle: Math.PI / 2, layer: { y: 1 } },
    "U'": { axis: new THREE.Vector3(0, 1, 0), angle: -Math.PI / 2, layer: { y: 1 } },
    'U2': { axis: new THREE.Vector3(0, 1, 0), angle: Math.PI, layer: { y: 1 } },
    'D': { axis: new THREE.Vector3(0, 1, 0), angle: -Math.PI / 2, layer: { y: -1 } },
    "D'": { axis: new THREE.Vector3(0, 1, 0), angle: Math.PI / 2, layer: { y: -1 } },
    'D2': { axis: new THREE.Vector3(0, 1, 0), angle: Math.PI, layer: { y: -1 } },
    'R': { axis: new THREE.Vector3(1, 0, 0), angle: -Math.PI / 2, layer: { x: 1 } },
    "R'": { axis: new THREE.Vector3(1, 0, 0), angle: Math.PI / 2, layer: { x: 1 } },
    'R2': { axis: new THREE.Vector3(1, 0, 0), angle: Math.PI, layer: { x: 1 } },
    'L': { axis: new THREE.Vector3(1, 0, 0), angle: Math.PI / 2, layer: { x: -1 } },
    "L'": { axis: new THREE.Vector3(1, 0, 0), angle: -Math.PI / 2, layer: { x: -1 } },
    'L2': { axis: new THREE.Vector3(1, 0, 0), angle: Math.PI, layer: { x: -1 } },
    'F': { axis: new THREE.Vector3(0, 0, 1), angle: -Math.PI / 2, layer: { z: 1 } },
    "F'": { axis: new THREE.Vector3(0, 0, 1), angle: Math.PI / 2, layer: { z: 1 } },
    'F2': { axis: new THREE.Vector3(0, 0, 1), angle: Math.PI, layer: { z: 1 } },
    'B': { axis: new THREE.Vector3(0, 0, 1), angle: Math.PI / 2, layer: { z: -1 } },
    "B'": { axis: new THREE.Vector3(0, 0, 1), angle: -Math.PI / 2, layer: { z: -1 } },
    'B2': { axis: new THREE.Vector3(0, 0, 1), angle: Math.PI, layer: { z: -1 } },
};

const EPSILON = 0.4; // tolerance for layer membership check

export class SolutionAnimator {
    constructor() {
        this._moves = [];
        this._index = 0;            // next move to apply
        this._history = [];           // applied moves (for undo)
        this._scene = null;         // ThreeScene instance
        this._playing = false;
        this._animating = false;        // true while a move animation runs
        this._stepMs = 400;          // ms per move in auto-play

        this._onProgress = () => { };
        this._onComplete = () => { };
    }

    /** Load a move list and bind to a ThreeScene. */
    load(moves, threeScene) {
        this._moves = moves.filter(m => MOVE_DEFS[m]);   // skip unknowns
        this._index = 0;
        this._history = [];
        this._scene = threeScene;
        this._playing = false;
        this._onProgress(0, this._moves.length);
    }

    onProgress(fn) { this._onProgress = fn; return this; }
    onComplete(fn) { this._onComplete = fn; return this; }

    get totalMoves() { return this._moves.length; }
    get currentIndex() { return this._index; }
    get isPlaying() { return this._playing; }

    /** Auto-play remaining moves with spacing. */
    play() {
        if (this._playing || this._index >= this._moves.length) return;
        this._playing = true;
        this._autoStep();
    }

    pause() { this._playing = false; }

    stepForward() {
        if (this._animating || this._index >= this._moves.length) return;
        this._applyMove(this._moves[this._index], false);
        this._index++;
        this._history.push(this._index);
        this._onProgress(this._index, this._moves.length);
        if (this._index >= this._moves.length) {
            this._playing = false;
            this._onComplete();
        }
    }

    stepBack() {
        if (this._animating || this._index === 0) return;
        this._index--;
        const move = this._moves[this._index];
        this._applyMove(this._invertMove(move), false);
        this._onProgress(this._index, this._moves.length);
    }

    reset() {
        this._playing = false;
        // Replay inverted moves from current position back to start
        while (this._index > 0) this.stepBack();
    }

    setSpeedMs(ms) { this._stepMs = Math.max(100, ms); }

    // ---- Private -----------------------------------------------------------

    _autoStep() {
        if (!this._playing || this._index >= this._moves.length) {
            this._playing = false;
            return;
        }
        this.stepForward();
        setTimeout(() => this._autoStep(), this._stepMs);
    }

    /**
     * Apply a single move visually on the ThreeScene's cubies.
     * For instant (non-animated) application, set animate=false.
     */
    _applyMove(moveName, animate = true) {
        const def = MOVE_DEFS[moveName];
        if (!def || !this._scene) return;

        const { axis, angle, layer } = def;
        const pivot = new THREE.Object3D();
        const cubies = this._scene.cubies || [];
        const group = this._scene.group;
        if (!group) return;

        // Collect cubies belonging to this layer
        const layerCubies = cubies.filter(c => {
            for (const [ax, val] of Object.entries(layer)) {
                if (Math.abs(c.userData[ax] - val) > EPSILON) return false;
            }
            return true;
        });

        // Attach to pivot
        group.add(pivot);
        layerCubies.forEach(c => {
            pivot.attach(c);
        });

        // Apply rotation instantly
        pivot.rotateOnAxis(axis, angle);
        pivot.updateMatrixWorld(true);

        // Detach cubies back to group, snapping positions
        layerCubies.forEach(c => {
            group.attach(c);
            // Round positions to avoid float drift
            c.position.set(
                Math.round(c.position.x),
                Math.round(c.position.y),
                Math.round(c.position.z)
            );
            // Update userData
            c.userData.x = c.position.x;
            c.userData.y = c.position.y;
            c.userData.z = c.position.z;
        });

        group.remove(pivot);
    }

    _invertMove(move) {
        if (move.endsWith('2')) return move;     // 180° is its own inverse
        if (move.endsWith("'")) return move.slice(0, -1);
        return move + "'";
    }
}

export const solutionAnimator = new SolutionAnimator();
