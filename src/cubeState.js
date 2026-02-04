/**
 * cubeState.js - Manages the state of the Rubik's Cube
 * Stores captured face data and provides state management
 */

export class CubeState {
    constructor() {
        this.reset();
        this.faceOrder = ['F', 'R', 'B', 'L', 'U', 'D'];
    }

    reset() {
        this.state = {
            U: null, // Up (White)
            D: null, // Down (Yellow)
            L: null, // Left (Orange)
            R: null, // Right (Red)
            F: null, // Front (Green)
            B: null  // Back (Blue)
        };
        this._currentFace = 'F'; // Start with Front
        this.captureHistory = [];
        this.currentFaceIndex = 0; // Legacy index for manual flow if needed
    }

    set currentFace(face) {
        if (['U', 'D', 'L', 'R', 'F', 'B'].includes(face)) {
            this._currentFace = face;
            // Update legacy index to match
            this.currentFaceIndex = this.faceOrder.indexOf(face);
        }
    }

    get currentFace() {
        return this._currentFace;
    }

    /**
     * Get current face being captured (Legacy compat)
     */
    getCurrentFace() {
        return this._currentFace;
    }

    /**
     * Get next face to capture
     */
    getNextFace() {
        const idx = this.faceOrder.indexOf(this._currentFace);
        if (idx < this.faceOrder.length - 1) {
            return this.faceOrder[idx + 1];
        }
        return null;
    }

    /**
     * Check if all faces are captured
     */
    isComplete() {
        return Object.values(this.state).every(face => face !== null);
    }

    /**
     * Get number of captured faces
     */
    getCapturedCount() {
        return Object.values(this.state).filter(face => face !== null).length;
    }

    /**
     * Capture face data
     */
    captureFace(faceKey, colors) {
        this.state[faceKey] = colors;
        this.captureHistory.push({
            face: faceKey,
            colors: colors,
            timestamp: Date.now()
        });

        // Auto-advance logic:
        // For auto-detect workflow, we stick with what the camera sees.
        // But for manual workflow, we advance the suggested face.
        // We do NOT forcefully change _currentFace here because auto-detect will handle it.
        // But we increment index if we perfectly match the sequence.
    }

    /**
     * Recapture the last face
     */
    recaptureLastFace() {
        if (this.captureHistory.length > 0) {
            const lastCapture = this.captureHistory.pop();
            this.state[lastCapture.face] = null;
            this._currentFace = lastCapture.face;
            this.currentFaceIndex = this.faceOrder.indexOf(lastCapture.face);
            return true;
        }
        return false;
    }

    /**
     * Get cube state in standard notation
     * Returns a string representing all faces
     */
    getStateString() {
        if (!this.isComplete()) {
            return null;
        }

        let stateString = '';

        // Order: U, R, F, D, L, B (standard cube notation)
        const standardOrder = ['U', 'R', 'F', 'D', 'L', 'B'];

        for (const face of standardOrder) {
            const faceData = this.state[face];
            if (!faceData) {
                return null;
            }

            // Convert color names to notation
            for (const cell of faceData) {
                stateString += this.colorToNotation(cell.color);
            }
        }

        return stateString;
    }

    /**
     * Convert color name to standard notation
     */
    colorToNotation(colorName) {
        const mapping = {
            white: 'U',
            yellow: 'D',
            red: 'F',
            orange: 'B',
            blue: 'R',
            green: 'L'
        };
        return mapping[colorName] || '?';
    }

    /**
     * Get face data for visualization
     */
    getFaceData(faceKey) {
        return this.state[faceKey];
    }

    /**
     * Get all faces data
     */
    getAllFaces() {
        return { ...this.state };
    }

    /**
     * Get progress
     */
    getProgress() {
        let completed = 0;

        this.faceOrder.forEach(face => {
            if (this.state[face]) completed++;
        });

        return {
            completed,
            total: 6,
            currentFace: this._currentFace
        };
    }

    /**
     * Get face label for display
     */
    static getFaceLabel(faceKey) {
        const labels = {
            F: 'Front (F)',
            R: 'Right (R)',
            B: 'Back (B)',
            L: 'Left (L)',
            U: 'Top (U)',
            D: 'Bottom (D)'
        };
        return labels[faceKey] || faceKey;
    }
}

export const cubeState = new CubeState();
