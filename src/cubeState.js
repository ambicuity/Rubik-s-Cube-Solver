/**
 * cubeState.js - Manages the state of the Rubik's Cube
 * Stores captured face data and provides state management
 */

export class CubeState {
    constructor() {
        this.faces = {
            F: null, // Front - typically white
            R: null, // Right - typically red
            B: null, // Back - typically yellow
            L: null, // Left - typically orange
            U: null, // Up - typically blue
            D: null  // Down - typically green
        };
        
        this.faceOrder = ['F', 'R', 'B', 'L', 'U', 'D'];
        this.currentFaceIndex = 0;
        this.captureHistory = [];
    }

    /**
     * Get current face being captured
     */
    getCurrentFace() {
        return this.faceOrder[this.currentFaceIndex];
    }

    /**
     * Get next face to capture
     */
    getNextFace() {
        if (this.currentFaceIndex < this.faceOrder.length - 1) {
            return this.faceOrder[this.currentFaceIndex + 1];
        }
        return null;
    }

    /**
     * Check if all faces are captured
     */
    isComplete() {
        return Object.values(this.faces).every(face => face !== null);
    }

    /**
     * Get number of captured faces
     */
    getCapturedCount() {
        return Object.values(this.faces).filter(face => face !== null).length;
    }

    /**
     * Capture face data
     */
    captureFace(faceKey, colors) {
        this.faces[faceKey] = colors;
        this.captureHistory.push({
            face: faceKey,
            colors: colors,
            timestamp: Date.now()
        });

        // Move to next face
        if (this.currentFaceIndex < this.faceOrder.length - 1) {
            this.currentFaceIndex++;
        }
    }

    /**
     * Recapture the last face
     */
    recaptureLastFace() {
        if (this.captureHistory.length > 0) {
            const lastCapture = this.captureHistory.pop();
            this.faces[lastCapture.face] = null;
            this.currentFaceIndex = this.faceOrder.indexOf(lastCapture.face);
            return true;
        }
        return false;
    }

    /**
     * Reset all captures
     */
    reset() {
        Object.keys(this.faces).forEach(key => {
            this.faces[key] = null;
        });
        this.currentFaceIndex = 0;
        this.captureHistory = [];
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
            const faceData = this.faces[face];
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
        return this.faces[faceKey];
    }

    /**
     * Get all faces data
     */
    getAllFaces() {
        return { ...this.faces };
    }

    /**
     * Get progress information
     */
    getProgress() {
        return {
            current: this.currentFaceIndex,
            total: this.faceOrder.length,
            completed: this.getCapturedCount(),
            isComplete: this.isComplete(),
            currentFace: this.getCurrentFace(),
            nextFace: this.getNextFace()
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
