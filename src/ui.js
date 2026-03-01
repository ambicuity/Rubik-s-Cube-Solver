/**
 * ui.js - Main UI controller
 * Orchestrates all components and handles user interactions.
 * Auto-capture state machine delegated to AutoCaptureController.
 */

import { cameraManager } from './camera.js';
import { colorDetector } from './colorDetection.js';
import { cubeState } from './cubeState.js';
import { cubeValidator } from './validator.js';
import { optimalSolver } from './optimalSolver.js'; // Kociemba + LBL fallback
import { cubeSolver as lblSolver } from './solver.js';        // groupMovesByPhase
import { cubeVisualizer } from './visualizer.js';
import { geminiClient } from './geminiClient.js';
import { AutoCaptureController } from './autoCaptureController.js';
import { solutionAnimator } from './solutionAnimator.js';

class UIController {
    constructor() {
        this.currentSection = 'capture';
        this.threeScene = null;
        this._autoCapture = null;

        this._initElements();
        this._attachListeners();
        this._initialize3D();
        this.updateUI();
    }

    // -------------------------------------------------------------------------
    // Init
    // -------------------------------------------------------------------------

    async _initialize3D() {
        try {
            const module = await import('./threeScene.js');
            this.threeScene = new module.ThreeScene('cube-3d-container');
            this.updateUI();
        } catch (err) {
            console.warn('3D scene unavailable:', err.message);
            const el = document.getElementById('cube-3d-container');
            if (el) el.style.display = 'none';
        }
    }

    _initElements() {
        this.startCameraBtn = document.getElementById('start-camera-btn');
        this.captureFaceBtn = document.getElementById('capture-face-btn');
        this.recaptureBtn = document.getElementById('recapture-btn');
        this.resetCaptureBtn = document.getElementById('reset-capture-btn');
        this.validateBtn = document.getElementById('validate-btn');
        this.backToCaptureBtn = document.getElementById('back-to-capture-btn');
        this.solveBtn = document.getElementById('solve-btn');
        this.newCubeBtn = document.getElementById('new-cube-btn');

        this.currentFaceLabel = document.getElementById('current-face');
        this.errorMessage = document.getElementById('error-message');
        this.validationResult = document.getElementById('validation-result');
        this.solvingStatus = document.getElementById('solving-status');
        this.solutionMoves = document.getElementById('solution-moves');
        this.geminiExplanation = document.getElementById('gemini-explanation');

        this.captureSection = document.getElementById('capture-section');
        this.visualizationSection = document.getElementById('visualization-section');
        this.solutionSection = document.getElementById('solution-section');

        this.faceDots = document.querySelectorAll('.face-dot');

        // Animator controls
        this.animatorControls = document.getElementById('animator-controls');
        this.animCurrent = document.getElementById('animator-current');
        this.animTotal = document.getElementById('animator-total');
        this.animPlayBtn = document.getElementById('anim-play-btn');
        this.animBackBtn = document.getElementById('anim-back-btn');
        this.animForwardBtn = document.getElementById('anim-forward-btn');
        this.animResetBtn = document.getElementById('anim-reset-btn');
    }

    _attachListeners() {
        this.startCameraBtn.addEventListener('click', () => this._handleStartCamera());
        this.captureFaceBtn.addEventListener('click', () => this._handleCaptureFace());
        this.recaptureBtn.addEventListener('click', () => this._handleRecapture());
        this.resetCaptureBtn.addEventListener('click', () => this._handleReset());
        this.validateBtn.addEventListener('click', () => this._handleValidate());
        this.backToCaptureBtn.addEventListener('click', () => this._showSection('capture'));
        this.solveBtn.addEventListener('click', () => this._handleSolve());
        this.newCubeBtn.addEventListener('click', () => this._handleNewCube());

        // Animator controls
        if (this.animPlayBtn) {
            this.animPlayBtn.addEventListener('click', () => this._togglePlay());
            this.animBackBtn.addEventListener('click', () => { solutionAnimator.stepBack(); this._syncAnimatorUI(); });
            this.animForwardBtn.addEventListener('click', () => { solutionAnimator.stepForward(); this._syncAnimatorUI(); });
            this.animResetBtn.addEventListener('click', () => { solutionAnimator.reset(); this._syncAnimatorUI(); });
        }

        // Release camera when page is hidden to be a good resource citizen
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) this._stopDetection();
        });
    }

    // -------------------------------------------------------------------------
    // Camera & detection
    // -------------------------------------------------------------------------

    async _handleStartCamera() {
        this._showError('');
        const result = await cameraManager.startCamera();
        if (result.success) {
            this.startCameraBtn.textContent = 'Camera Active';
            this.startCameraBtn.disabled = true;
            this.captureFaceBtn.disabled = false;
            this._startDetection();
        } else {
            this._showError(result.error);
        }
    }

    _startDetection() {
        this._stopDetection(); // Idempotent — kills any existing interval first

        const videoContainer = document.querySelector('.video-container');

        this._autoCapture = new AutoCaptureController({
            cameraManager: cameraManager,
            colorDetector: colorDetector,
            cubeState: cubeState,
            intervalMs: 200,
            stabilityThreshold: 5,

            onColorUpdate: (colors) => {
                this._updateGridOverlay(colors);
                const hasUnknown = colors.some(c => c.color === 'unknown');
                if (hasUnknown) {
                    videoContainer.classList.remove('scanning-locked');
                    videoContainer.classList.add('scanning-active');
                }
            },

            onCenterDetected: (color) => {
                this._updateFaceFromCenter(color);
            },

            onStable: (colors) => {
                videoContainer.classList.add('scanning-locked');
                // Debounce: disable auto-capture for 2 s after each trigger
                this._autoCapture.setCapturing(true);
                this._handleCaptureFace();
                setTimeout(() => {
                    if (this._autoCapture) this._autoCapture.setCapturing(false);
                    videoContainer.classList.remove('scanning-locked');
                    videoContainer.classList.add('scanning-active');
                }, 2000);
            }
        });

        this._autoCapture.start();
    }

    _stopDetection() {
        if (this._autoCapture) {
            this._autoCapture.stop();
            this._autoCapture = null;
        }
    }

    _updateFaceFromCenter(color) {
        const colorMap = {
            white: 'U', yellow: 'D', green: 'F',
            blue: 'B', red: 'R', orange: 'L'
        };
        const face = colorMap[color];
        if (face) {
            cubeState.currentFace = face;
            this.updateUI();
        }
    }

    _updateGridOverlay(colors) {
        const cells = document.querySelectorAll('.grid-cell');
        colors.forEach((cell, i) => {
            if (cells[i]) {
                cells[i].className = `grid-cell ${cell.color !== 'unknown' ? 'detected' : ''}`;
            }
        });
    }

    // -------------------------------------------------------------------------
    // Capture / reset
    // -------------------------------------------------------------------------

    async _handleCaptureFace() {
        const video = cameraManager.getVideoElement();
        const colors = colorDetector.detectFaceColors(video);

        if (!colors) {
            this._showError('Failed to detect colors. Ensure the cube is properly positioned.');
            return;
        }

        const validation = cubeValidator.validateFace(colors);
        if (!validation.valid && !validation.warning) {
            this._showError(validation.error);
            return;
        }
        if (validation.warning) {
            this._showError(validation.error || validation.warning, 'warning');
        }

        const face = cubeState.getCurrentFace();
        cubeState.captureFace(face, colors);
        this.updateUI();

        if (cubeState.isComplete()) {
            this._showError('All faces captured! Click "Validate Cube State" to proceed.', 'success');
            setTimeout(() => {
                this._showSection('visualization');
                cubeVisualizer.render(cubeState);
            }, 1500);
        }
    }

    _handleRecapture() {
        if (cubeState.recaptureLastFace()) {
            this.updateUI();
            this._showError('');
        }
    }

    _handleReset() {
        cubeState.reset();
        this._stopDetection();
        cameraManager.stopCamera(); // Stop camera on full reset
        this.startCameraBtn.disabled = false;
        this.startCameraBtn.textContent = 'Start Camera';
        this.captureFaceBtn.disabled = true;
        this.updateUI();
        this._showError('');
    }

    // -------------------------------------------------------------------------
    // Validate
    // -------------------------------------------------------------------------

    _handleValidate() {
        const validation = cubeValidator.validate(cubeState);
        const summary = cubeValidator.getValidationSummary(validation);

        this.validationResult.className = `validation-result ${summary.type}`;
        this.validationResult.innerHTML = `
            <h4>${summary.message}</h4>
            <pre>${summary.details}</pre>
        `;
        this.validationResult.classList.remove('hidden');

        if (validation.valid) {
            setTimeout(() => this._showSection('solution'), 2000);
        }
    }

    // -------------------------------------------------------------------------
    // Solve
    // -------------------------------------------------------------------------

    async _handleSolve() {
        this.solvingStatus.classList.remove('hidden');
        this.solutionMoves.classList.add('hidden');
        if (this.animatorControls) this.animatorControls.classList.add('hidden');
        this.solveBtn.disabled = true;

        // Yield to browser to paint spinner
        await new Promise(r => setTimeout(r, 50));

        const stateString = cubeState.getStateString();

        if (!stateString || stateString.includes('?')) {
            this.solvingStatus.innerHTML =
                '<p class="error">Cannot solve: cube state contains unrecognised colors. Re-capture.</p>';
            this.solveBtn.disabled = false;
            return;
        }

        // Use optimal solver (async Kociemba, falls back to LBL)
        const result = await optimalSolver.solve(stateString);

        if (result.success) {
            const moves = result.moves;
            const movesHtml = `
                <h4>Solution Moves</h4>
                <div class="move-sequence">${moves.join(' ') || '(Already solved!)'}</div>
                <p class="move-count">Total moves: ${result.moveCount}</p>
            `;
            this.solutionMoves.innerHTML = movesHtml;
            this.solutionMoves.classList.remove('hidden');
            this.solvingStatus.classList.add('hidden');

            // Set up step-through animation
            if (moves.length > 0 && this.threeScene && this.animatorControls) {
                solutionAnimator.load(moves, this.threeScene);
                solutionAnimator
                    .onProgress(() => this._syncAnimatorUI())
                    .onComplete(() => {
                        if (this.animPlayBtn) this.animPlayBtn.textContent = '▶ Play';
                        this._syncAnimatorUI();
                    });
                this.animatorControls.classList.remove('hidden');
                this._syncAnimatorUI();
            }

            // Stream or fetch Gemini explanation
            this._getExplanation(moves);
        } else {
            this.solvingStatus.innerHTML =
                `<p class="error">Solver error: ${result.error}. The cube state may be physically impossible.</p>`;
            this.solveBtn.disabled = false;
        }
    }

    async _getExplanation(moves) {
        this.geminiExplanation.innerHTML = `
            <div class="loading-container">
                <div class="cube-loader"></div>
                <p>Asking Gemini for help...</p>
            </div>
        `;
        try {
            const grouped = lblSolver.groupMovesByPhase(moves);
            // Use streaming if available, otherwise batch request
            if (geminiClient.supportsStreaming) {
                await geminiClient.explainSolutionStreaming(moves, grouped,
                    (chunk) => { this.geminiExplanation.innerHTML += chunk; },
                    () => { }
                );
            } else {
                const explanation = await geminiClient.explainSolution(moves, grouped);
                this.geminiExplanation.innerHTML = explanation;
            }
        } catch (err) {
            console.error('Explanation error:', err);
            this.geminiExplanation.innerHTML = '<p class="error">Failed to load AI explanation.</p>';
        }
    }

    _togglePlay() {
        if (solutionAnimator.isPlaying) {
            solutionAnimator.pause();
            if (this.animPlayBtn) this.animPlayBtn.textContent = '▶ Play';
        } else {
            solutionAnimator.play();
            if (this.animPlayBtn) this.animPlayBtn.textContent = '⏸ Pause';
        }
    }

    _syncAnimatorUI(idx, total) {
        const i = idx ?? solutionAnimator.currentIndex;
        const t = total ?? solutionAnimator.totalMoves;
        if (this.animCurrent) this.animCurrent.textContent = i;
        if (this.animTotal) this.animTotal.textContent = t;
        // Update play/pause label
        if (this.animPlayBtn) {
            this.animPlayBtn.textContent = solutionAnimator.isPlaying ? '⏸ Pause' : '▶ Play';
        }
        // Disable controls at boundaries
        if (this.animBackBtn) this.animBackBtn.disabled = i === 0;
        if (this.animForwardBtn) this.animForwardBtn.disabled = i >= t;
    }

    // -------------------------------------------------------------------------
    // New cube

    // -------------------------------------------------------------------------

    _handleNewCube() {
        this._stopDetection();
        cameraManager.stopCamera();
        cubeState.reset();
        this._showSection('capture');
        this.startCameraBtn.disabled = false;
        this.startCameraBtn.textContent = 'Start Camera';
        this.captureFaceBtn.disabled = true;
        this.updateUI();
    }

    // -------------------------------------------------------------------------
    // UI helpers
    // -------------------------------------------------------------------------

    updateUI() {
        const progress = cubeState.getProgress();
        this.currentFaceLabel.textContent =
            cubeState.constructor.getFaceLabel(progress.currentFace);

        // 3D preview
        if (this.threeScene) {
            this.threeScene.rotateToFace(progress.currentFace);
            const allFaces = cubeState.getAllFaces();
            Object.entries(allFaces).forEach(([faceKey, colors]) => {
                if (colors) {
                    colors.forEach((colorData, idx) => {
                        this.threeScene.updateSticker(faceKey, idx, colorData.color);
                    });
                }
            });
        }

        // Face progress dots
        this.faceDots.forEach(dot => {
            const face = dot.dataset.face;
            dot.classList.remove('active', 'completed');
            if (cubeState.getFaceData(face)) {
                dot.classList.add('completed');
            } else if (face === progress.currentFace) {
                dot.classList.add('active');
            }
        });

        this.recaptureBtn.disabled = progress.completed === 0;
    }

    _showSection(section) {
        [this.captureSection, this.visualizationSection, this.solutionSection]
            .forEach(el => el.classList.remove('active'));

        const map = {
            capture: this.captureSection,
            visualization: this.visualizationSection,
            solution: this.solutionSection
        };
        map[section]?.classList.add('active');
        this.currentSection = section;
    }

    _showError(message, type = 'error') {
        if (!message) {
            this.errorMessage.classList.add('hidden');
            return;
        }
        this.errorMessage.textContent = message;
        this.errorMessage.className = 'error-message';

        const styles = {
            warning: { bg: '#fef3c7', color: '#92400e', border: '#f59e0b' },
            success: { bg: '#d1fae5', color: '#065f46', border: '#10b981' }
        };
        const s = styles[type];
        if (s) {
            this.errorMessage.style.background = s.bg;
            this.errorMessage.style.color = s.color;
            this.errorMessage.style.borderColor = s.border;
        }
        this.errorMessage.classList.remove('hidden');
    }
}

document.addEventListener('DOMContentLoaded', () => new UIController());
