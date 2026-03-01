/**
 * ui.js - Main UI controller
 * Orchestrates all components and handles user interactions.
 * Auto-capture state machine delegated to AutoCaptureController.
 */

import { cameraManager } from './camera.js';
import { colorDetector } from './colorDetection.js';
import { cubeState } from './cubeState.js';
import { cubeValidator } from './validator.js';
import { optimalSolver } from './optimalSolver.js';
import { cubeSolver as lblSolver } from './solver.js';
import { Solver2x2 } from './solver2x2.js';
import { cubeVisualizer } from './visualizer.js';
import { geminiClient } from './geminiClient.js';
import { AutoCaptureController } from './autoCaptureController.js';
import { solutionAnimator } from './solutionAnimator.js';
import { ManualEntryController } from './manualEntry.js';
import { generateScramble, applyScramble, stateStringToFaces } from './scrambleManager.js';

const solver2x2 = new Solver2x2();

class UIController {
    constructor() {
        this.currentSection = 'capture';
        this.threeScene = null;
        this._autoCapture = null;
        this.cubeSize = 3;           // 2 or 3
        this.solveMethod = 'optimal';   // 'optimal' | 'lbl'

        this._initElements();
        this._attachListeners();
        this._initialize3D();
        this.updateUI();
    }

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
        // Main flow buttons
        this.startCameraBtn = document.getElementById('start-camera-btn');
        this.captureFaceBtn = document.getElementById('capture-face-btn');
        this.recaptureBtn = document.getElementById('recapture-btn');
        this.resetCaptureBtn = document.getElementById('reset-capture-btn');
        this.validateBtn = document.getElementById('validate-btn');
        this.backToCaptureBtn = document.getElementById('back-to-capture-btn');
        this.solveBtn = document.getElementById('solve-btn');
        this.newCubeBtn = document.getElementById('new-cube-btn');

        // Labels & State
        this.currentFaceLabel = document.getElementById('current-face-label');
        this.errorMessage = document.getElementById('error-message');
        this.validationResult = document.getElementById('validation-result');
        this.solvingStatus = document.getElementById('solving-status');
        this.solutionMoves = document.getElementById('solution-moves');
        this.geminiExplanation = document.getElementById('gemini-explanation');
        this.faceDots = document.querySelectorAll('.face-dot');

        // Sections
        this.captureSection = document.getElementById('capture-section');
        this.visualizationSection = document.getElementById('visualization-section');
        this.solutionSection = document.getElementById('solution-section');

        // Animator controls
        this.animatorControls = document.getElementById('animator-controls');
        this.animCurrent = document.getElementById('animator-current');
        this.animTotal = document.getElementById('animator-total');
        this.animPlayBtn = document.getElementById('anim-play-btn');
        this.animBackBtn = document.getElementById('anim-back-btn');
        this.animForwardBtn = document.getElementById('anim-forward-btn');
        this.animResetBtn = document.getElementById('anim-reset-btn');

        // New feature elements
        this.cubeSizeSelect = document.getElementById('cube-size-select');
        this.solveMethodSelect = document.getElementById('solve-method-select');
        this.generateScrambleBtn = document.getElementById('generate-scramble-btn');
        this.manualEntryBtn = document.getElementById('manual-entry-btn');
        this.manualEntryPanel = document.getElementById('manual-entry-panel');
        this.cameraViewPanel = document.querySelector('.camera-view');
        this.scrambleDisplay = document.getElementById('scramble-display');
    }

    _attachListeners() {
        this.startCameraBtn?.addEventListener('click', () => this._handleStartCamera());
        this.captureFaceBtn?.addEventListener('click', () => this._handleCaptureFace());
        this.recaptureBtn?.addEventListener('click', () => this._handleRecapture());
        this.resetCaptureBtn?.addEventListener('click', () => this._handleReset());
        this.validateBtn?.addEventListener('click', () => this._handleValidate());
        this.backToCaptureBtn?.addEventListener('click', () => this._showSection('capture'));
        this.solveBtn?.addEventListener('click', () => this._handleSolve());
        this.newCubeBtn?.addEventListener('click', () => this._handleNewCube());

        // Animator controls
        this.animPlayBtn?.addEventListener('click', () => this._togglePlay());
        this.animBackBtn?.addEventListener('click', () => { solutionAnimator.stepBack(); this._syncAnimatorUI(); });
        this.animForwardBtn?.addEventListener('click', () => { solutionAnimator.stepForward(); this._syncAnimatorUI(); });
        this.animResetBtn?.addEventListener('click', () => { solutionAnimator.reset(); this._syncAnimatorUI(); });

        // Options listeners
        this.cubeSizeSelect?.addEventListener('change', (e) => {
            this.cubeSize = parseInt(e.target.value);
            cubeState.setSize(this.cubeSize);
            this._handleReset();
        });
        this.solveMethodSelect?.addEventListener('change', (e) => {
            this.solveMethod = e.target.value;
        });
        this.generateScrambleBtn?.addEventListener('click', () => this._handleGenerateScramble());
        this.manualEntryBtn?.addEventListener('click', () => this._toggleManualEntry());

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) this._stopDetection();
        });
    }

    _handleStartCamera() {
        this._showError('');
        cameraManager.startCamera().then(result => {
            if (result.success) {
                this.startCameraBtn.textContent = 'Camera Active';
                this.startCameraBtn.disabled = true;
                this.captureFaceBtn.disabled = false;
                this._startDetection();
            } else {
                this._showError(result.error);
            }
        });
    }

    _startDetection() {
        this._stopDetection();
        const videoContainer = document.querySelector('.video-container');

        this._autoCapture = new AutoCaptureController({
            cameraManager,
            colorDetector,
            cubeState,
            intervalMs: 200,
            stabilityThreshold: 5,

            onColorUpdate: (colors) => {
                this._updateGridOverlay(colors);
                if (colors.some(c => c.color === 'unknown')) {
                    videoContainer.classList.remove('scanning-locked');
                    videoContainer.classList.add('scanning-active');
                }
            },
            onCenterDetected: (color) => {
                const map = { white: 'U', yellow: 'D', green: 'F', blue: 'B', red: 'R', orange: 'L' };
                if (map[color]) {
                    cubeState.currentFace = map[color];
                    this.updateUI();
                }
            },
            onStable: () => {
                videoContainer.classList.add('scanning-locked');
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

    _updateGridOverlay(colors) {
        const cells = document.querySelectorAll('.grid-cell');
        colors.forEach((cell, i) => {
            if (cells[i]) cells[i].className = `grid-cell ${cell.color !== 'unknown' ? 'detected' : ''}`;
        });
    }

    _handleCaptureFace() {
        const video = cameraManager.getVideoElement();
        const colors = colorDetector.detectFaceColors(video);

        if (!colors) {
            this._showError('Failed to detect colors. Ensure cube is properly positioned.');
            return;
        }

        const face = cubeState.getCurrentFace();
        cubeState.captureFace(face, colors);
        this.updateUI();

        if (cubeState.isComplete()) {
            this._showError('All faces captured! Validate Cube State to proceed.', 'success');
            setTimeout(() => {
                this._showSection('visualization');
                cubeVisualizer.render(cubeState);
            }, 1000);
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
        cameraManager.stopCamera();
        this.startCameraBtn.disabled = false;
        this.startCameraBtn.textContent = 'Start Camera';
        this.captureFaceBtn.disabled = true;
        if (this.scrambleDisplay) {
            this.scrambleDisplay.textContent = '';
            this.scrambleDisplay.classList.add('hidden');
        }
        this.updateUI();
        this._showError('');
    }

    // New features -----------------------------------------------------------

    _toggleManualEntry() {
        if (!this._manualController) {
            this._manualController = new ManualEntryController(cubeState, () => {
                this._stopDetection();
                cameraManager.stopCamera();
                this._showSection('visualization');
                cubeVisualizer.render(cubeState);
            });
            this._manualController.mount(this.manualEntryPanel);
        }

        // Hide camera UI, show manual UI
        this.cameraViewPanel.style.display = 'none';
        this.manualEntryPanel.style.display = 'block';
        this.startCameraBtn.style.display = 'none';
        this.manualEntryBtn.style.display = 'none';

        const backBtn = document.createElement('button');
        backBtn.className = 'btn btn-secondary';
        backBtn.textContent = '← Back to Camera';
        backBtn.onclick = () => {
            this.manualEntryPanel.style.display = 'none';
            this.cameraViewPanel.style.display = 'block';
            this.startCameraBtn.style.display = 'inline-block';
            this.manualEntryBtn.style.display = 'inline-block';
            backBtn.remove();
        };
        this.manualEntryPanel.appendChild(backBtn);
    }

    _handleGenerateScramble() {
        const movesStr = this.cubeSize === 2
            ? Solver2x2.generateScramble()
            : generateScramble();

        // Apply scramble programmatically to skip scanning
        const movesArr = movesStr.split(' ');
        const stateStr = this.cubeSize === 2
            ? Solver2x2.applyScrample(movesArr)
            : applyScramble(movesArr);

        // Populate cube state directly
        cubeState.reset();
        const facesDict = stateStringToFaces(stateStr, this.cubeSize);
        Object.entries(facesDict).forEach(([face, colors]) => {
            cubeState.captureFace(face, colors);
        });

        if (this.scrambleDisplay) {
            this.scrambleDisplay.textContent = `Scramble applied: ${movesStr}`;
            this.scrambleDisplay.classList.remove('hidden');
        }

        this._stopDetection();
        cameraManager.stopCamera();
        this.updateUI();
        setTimeout(() => {
            this._showSection('visualization');
            cubeVisualizer.render(cubeState);
        }, 800);
    }

    // ------------------------------------------------------------------------

    _handleValidate() {
        const validation = cubeValidator.validate(cubeState);

        this.validationResult.className = `validation-result ${validation.valid ? 'success' : validation.warning ? 'warning' : 'error'}`;
        this.validationResult.innerHTML = `<h4>${validation.valid ? 'Setup Validated' : 'Validation Error'}</h4>`;
        this.validationResult.classList.remove('hidden');

        if (validation.valid) {
            setTimeout(() => this._showSection('solution'), 1000);
        }
    }

    async _handleSolve() {
        this.solvingStatus.classList.remove('hidden');
        this.solutionMoves.classList.add('hidden');
        if (this.animatorControls) this.animatorControls.classList.add('hidden');
        this.solveBtn.disabled = true;

        await new Promise(r => setTimeout(r, 50));
        const stateString = cubeState.getStateString();

        if (!stateString || stateString.includes('?')) {
            this.solvingStatus.innerHTML = '<p class="error">Contains unrecognised colors. Re-capture.</p>';
            this.solveBtn.disabled = false;
            return;
        }

        let result;
        if (this.cubeSize === 2) {
            result = await solver2x2.solve(stateString);
        } else if (this.solveMethod === 'lbl') {
            result = { ...lblSolver.solve(stateString), method: 'Layer-by-Layer' };
        } else {
            result = await optimalSolver.solve(stateString);
        }

        if (result.success) {
            const moves = result.moves;
            this.solutionMoves.innerHTML = `
                <h4>Solution (${result.method || 'Optimal'}) — ${this.cubeSize}×${this.cubeSize}</h4>
                <div class="move-sequence">${moves.join(' ') || '(Already solved!)'}</div>
                <p class="move-count">Total moves: ${result.moveCount}</p>
            `;
            this.solutionMoves.classList.remove('hidden');
            this.solvingStatus.classList.add('hidden');

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
            this._getExplanation(moves);
        } else {
            this.solvingStatus.innerHTML = `<p class="error">Solver error: ${result.error}</p>`;
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
            if (geminiClient.supportsStreaming) {
                await geminiClient.explainSolutionStreaming(moves, grouped,
                    chunk => { this.geminiExplanation.innerHTML += chunk; },
                    () => { }
                );
            } else {
                this.geminiExplanation.innerHTML = await geminiClient.explainSolution(moves, grouped);
            }
        } catch (err) {
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
        if (this.animPlayBtn) {
            this.animPlayBtn.textContent = solutionAnimator.isPlaying ? '⏸ Pause' : '▶ Play';
        }
        if (this.animBackBtn) this.animBackBtn.disabled = i === 0;
        if (this.animForwardBtn) this.animForwardBtn.disabled = i >= t;
    }

    _handleNewCube() {
        this._handleReset();
        this._showSection('capture');
    }

    updateUI() {
        const progress = cubeState.getProgress();
        this.currentFaceLabel.textContent = cubeState.constructor.getFaceLabel(progress.currentFace);

        if (this.threeScene) {
            this.threeScene.rotateToFace(progress.currentFace);
            Object.entries(cubeState.getAllFaces()).forEach(([faceKey, colors]) => {
                if (colors) colors.forEach((c, idx) => this.threeScene.updateSticker(faceKey, idx, c.color));
            });
        }

        this.faceDots.forEach(dot => {
            const face = dot.dataset.face;
            dot.classList.remove('active', 'completed');
            if (cubeState.getFaceData(face)) dot.classList.add('completed');
            else if (face === progress.currentFace) dot.classList.add('active');
        });

        this.recaptureBtn.disabled = progress.completed === 0;
    }

    _showSection(section) {
        [this.captureSection, this.visualizationSection, this.solutionSection]
            .forEach(el => el.classList.remove('active'));

        ({
            capture: this.captureSection,
            visualization: this.visualizationSection,
            solution: this.solutionSection
        })[section]?.classList.add('active');

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
            success: { bg: '#d1fae5', color: '#d1fae5', border: '#10b981' } // using tailwind colors approx
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

document.addEventListener('DOMContentLoaded', () => {
    window.uiController = new UIController();
});
