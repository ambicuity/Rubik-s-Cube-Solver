/**
 * cubeState.js - Manages the state of the Rubik's Cube
 * Stores captured face data and provides state management.
 *
 * colorToNotation() now derives the color→face map dynamically from
 * the center stickers captured at runtime, removing the hardcoded
 * assumption about which color appears on which face.
 */

export class CubeState {
    constructor() {
        this.size = 3;
        this.reset();
        this.faceOrder = ['U', 'R', 'F', 'D', 'L', 'B']; // WCA standard capture order
    }

    setSize(size) {
        if (size === 2 || size === 3) {
            this.size = size;
            this.reset();
        }
    }

    reset() {
        this.state = {
            U: null, // Up
            D: null, // Down
            L: null, // Left
            R: null, // Right
            F: null, // Front
            B: null  // Back
        };
        this._currentFace = 'F';
        this.captureHistory = [];
        this.currentFaceIndex = 0;
        this._colorToFaceMap = null; // Derived on demand
    }

    set currentFace(face) {
        if (['U', 'D', 'L', 'R', 'F', 'B'].includes(face)) {
            this._currentFace = face;
            this.currentFaceIndex = this.faceOrder.indexOf(face);
        }
    }

    get currentFace() {
        return this._currentFace;
    }

    getCurrentFace() { return this._currentFace; }

    getNextFace() {
        const idx = this.faceOrder.indexOf(this._currentFace);
        return idx < this.faceOrder.length - 1 ? this.faceOrder[idx + 1] : null;
    }

    isComplete() {
        return Object.values(this.state).every(face => face !== null);
    }

    getCapturedCount() {
        return Object.values(this.state).filter(face => face !== null).length;
    }

    captureFace(faceKey, colors) {
        this.state[faceKey] = colors;
        this._colorToFaceMap = null; // Invalidate cached map
        this.captureHistory.push({
            face: faceKey,
            colors,
            timestamp: Date.now()
        });
    }

    recaptureLastFace() {
        if (this.captureHistory.length > 0) {
            const lastCapture = this.captureHistory.pop();
            this.state[lastCapture.face] = null;
            this._colorToFaceMap = null;
            this._currentFace = lastCapture.face;
            this.currentFaceIndex = this.faceOrder.indexOf(lastCapture.face);
            return true;
        }
        return false;
    }

    /**
     * Build a color→face map derived from the center stickers.
     * Center sticker is index 4 (middle of the 3×3 grid) for each face.
     * This replaces the previously hardcoded static mapping and correctly
     * handles non-standard color schemes (e.g. different manufacturers).
     */
    _buildColorToFaceMap() {
        if (this._colorToFaceMap) return this._colorToFaceMap;

        const map = {};

        if (this.size === 3) {
            const CANONICAL_FACES = ['U', 'R', 'F', 'D', 'L', 'B'];
            for (const faceKey of CANONICAL_FACES) {
                const cells = this.state[faceKey];
                if (cells && cells.length === 9) {
                    const centerColor = cells[4].color;
                    if (centerColor && centerColor !== 'unknown') {
                        map[centerColor] = faceKey;
                    }
                }
            }
        } else {
            // 2x2 has no centers, so we assume a standard color scheme
            // matching the hardcoded CENTER_COLORS from manualEntry.js
            map['white'] = 'U';
            map['red'] = 'R';
            map['green'] = 'F';
            map['yellow'] = 'D';
            map['orange'] = 'L';
            map['blue'] = 'B';
        }

        this._colorToFaceMap = map;
        return map;
    }

    /**
     * Get cube state in standard notation (54-char string, order: U,R,F,D,L,B).
     * Each character is the face-key of which face owns that sticker (U/R/F/D/L/B).
     */
    getStateString() {
        if (!this.isComplete()) return null;

        const colorToFace = this._buildColorToFaceMap();
        const standardOrder = ['U', 'R', 'F', 'D', 'L', 'B'];
        let str = '';

        for (const face of standardOrder) {
            const faceData = this.state[face];
            if (!faceData) return null;
            for (const cell of faceData) {
                const notation = colorToFace[cell.color];
                if (!notation) {
                    console.warn(`Unknown color "${cell.color}" has no center mapping.`);
                    str += '?';
                } else {
                    str += notation;
                }
            }
        }

        return str;
    }

    /**
     * Convert a color name to its face notation using the runtime-derived map.
     * Falls back to '?' for unmapped colors (surfaces cleanly to caller).
     */
    colorToNotation(colorName) {
        const map = this._buildColorToFaceMap();
        return map[colorName] || '?';
    }

    getFaceData(faceKey) { return this.state[faceKey]; }

    getAllFaces() { return { ...this.state }; }

    getProgress() {
        const completed = this.faceOrder.filter(f => this.state[f]).length;
        return { completed, total: 6, currentFace: this._currentFace };
    }

    static getFaceLabel(faceKey) {
        const labels = {
            F: 'Front (F)', R: 'Right (R)', B: 'Back (B)',
            L: 'Left (L)', U: 'Top (U)', D: 'Bottom (D)'
        };
        return labels[faceKey] || faceKey;
    }
}

export const cubeState = new CubeState();
