/**
 * autoCaptureController.js
 * Encapsulates the auto-capture state machine, extracted from ui.js.
 *
 * Responsibilities:
 *  - Polls the camera feed at a configurable interval
 *  - Detects stable color readings (N consecutive unchanged frames)
 *  - Fires onStable(colors) when the cube face is stable and ready to capture
 *  - Fires onColorUpdate(colors) on every frame for live UI feedback
 *  - Fires onCenterDetected(face) when the center color changes
 *  - Cleans up its interval via stop()
 */
export class AutoCaptureController {
    /**
     * @param {object} opts
     * @param {object} opts.cameraManager   - camera.js singleton
     * @param {object} opts.colorDetector   - colorDetection.js singleton
     * @param {object} opts.cubeState       - cubeState.js singleton
     * @param {Function} opts.onColorUpdate  - (colors) called every frame
     * @param {Function} opts.onCenterDetected - (faceName) called when center changes
     * @param {Function} opts.onStable       - (colors) called when stable threshold met
     * @param {number}  [opts.intervalMs=200]        - polling interval
     * @param {number}  [opts.stabilityThreshold=5]  - frames required for stable
     */
    constructor(opts) {
        this._camera = opts.cameraManager;
        this._detector = opts.colorDetector;
        this._cubeState = opts.cubeState;
        this._onUpdate = opts.onColorUpdate || (() => { });
        this._onCenter = opts.onCenterDetected || (() => { });
        this._onStable = opts.onStable || (() => { });
        this._interval = opts.intervalMs ?? 200;
        this._threshold = opts.stabilityThreshold ?? 5;

        this._timerId = null;
        this._counter = 0;
        this._lastJson = '';
        this._lastCenter = null;
        this._capturing = false; // debounce flag set externally
    }

    /** Start polling. Idempotent — safe to call multiple times. */
    start() {
        this.stop(); // Ensure no duplicate timers
        this._timerId = setInterval(() => this._tick(), this._interval);
    }

    /** Stop polling and clean up. Idempotent. */
    stop() {
        if (this._timerId !== null) {
            clearInterval(this._timerId);
            this._timerId = null;
        }
        this._counter = 0;
        this._lastJson = '';
    }

    /** Lock externally to prevent concurrent auto-captures. */
    setCapturing(flag) {
        this._capturing = flag;
        if (!flag) {
            this._counter = 0;
            this._lastJson = '';
        }
    }

    _tick() {
        if (!this._camera.isCameraActive()) return;

        const video = this._camera.getVideoElement();
        const colors = this._detector.detectFaceColors(video);
        if (!colors) return;

        this._onUpdate(colors);

        // Auto-detect face from center sticker color
        const center = colors.find(c => c.position.row === 1 && c.position.col === 1);
        if (center && center.color !== 'unknown' && center.color !== this._lastCenter) {
            this._lastCenter = center.color;
            this._onCenter(center.color);
        }

        // Stability logic
        const hasUnknown = colors.some(c => c.color === 'unknown');
        if (hasUnknown) {
            this._counter = 0;
            this._lastJson = '';
            return;
        }

        const json = JSON.stringify(colors.map(c => c.color));
        if (json === this._lastJson) {
            this._counter++;
        } else {
            this._counter = 0;
            this._lastJson = json;
        }

        if (this._counter >= this._threshold && !this._capturing) {
            const currentFace = this._cubeState.getCurrentFace();
            if (!this._cubeState.getFaceData(currentFace)) {
                this._onStable(colors);
            }
        }
    }
}
