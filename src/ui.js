/**
 * ui.js - Main UI controller
 * Orchestrates all components and handles user interactions
 */

import { cameraManager } from './camera.js';
import { colorDetector } from './colorDetection.js';
import { cubeState } from './cubeState.js';
import { cubeValidator } from './validator.js';
import { cubeSolver } from './solver.js';
import { cubeVisualizer } from './visualizer.js';
import { geminiClient } from './geminiClient.js';
import { ThreeScene } from './threeScene.js';

class UIController {
    constructor() {
        this.currentSection = 'capture';
        this.isCapturing = false;
        this.detectionInterval = null;

        this.initializeElements();
        this.attachEventListeners();

        // Initialize 3D Scene
        this.threeScene = new ThreeScene('cube-3d-container');

        this.updateUI();
    }

    /**
     * Initialize DOM element references
     */
    initializeElements() {
        // Buttons
        this.startCameraBtn = document.getElementById('start-camera-btn');
        this.captureFaceBtn = document.getElementById('capture-face-btn');
        this.recaptureBtn = document.getElementById('recapture-btn');
        this.resetCaptureBtn = document.getElementById('reset-capture-btn');
        this.validateBtn = document.getElementById('validate-btn');
        this.backToCaptureBtn = document.getElementById('back-to-capture-btn');
        this.solveBtn = document.getElementById('solve-btn');
        this.newCubeBtn = document.getElementById('new-cube-btn');

        // Display elements
        this.currentFaceLabel = document.getElementById('current-face');
        this.errorMessage = document.getElementById('error-message');
        this.validationResult = document.getElementById('validation-result');
        this.solvingStatus = document.getElementById('solving-status');
        this.solutionMoves = document.getElementById('solution-moves');
        this.geminiExplanation = document.getElementById('gemini-explanation');

        // Sections
        this.captureSection = document.getElementById('capture-section');
        this.visualizationSection = document.getElementById('visualization-section');
        this.solutionSection = document.getElementById('solution-section');

        // Face dots
        this.faceDots = document.querySelectorAll('.face-dot');
    }

    /**
     * Attach event listeners
     */
    attachEventListeners() {
        this.startCameraBtn.addEventListener('click', () => this.handleStartCamera());
        this.captureFaceBtn.addEventListener('click', () => this.handleCaptureFace());
        this.recaptureBtn.addEventListener('click', () => this.handleRecapture());
        this.resetCaptureBtn.addEventListener('click', () => this.handleReset());
        this.validateBtn.addEventListener('click', () => this.handleValidate());
        this.backToCaptureBtn.addEventListener('click', () => this.showSection('capture'));
        this.solveBtn.addEventListener('click', () => this.handleSolve());
        this.newCubeBtn.addEventListener('click', () => this.handleNewCube());
    }

    /**
     * Handle start camera
     */
    async handleStartCamera() {
        this.showError('');
        const result = await cameraManager.startCamera();

        if (result.success) {
            this.startCameraBtn.textContent = 'Camera Active';
            this.startCameraBtn.disabled = true;
            this.captureFaceBtn.disabled = false;
            this.startColorDetection();
        } else {
            this.showError(result.error);
        }
    }

    /**
     * Start real-time color detection preview
     */
    startColorDetection() {
        let stabilityCounter = 0;
        let lastColorsJson = '';
        const STABILITY_THRESHOLD = 5; // Frames required for stability
        const videoContainer = document.querySelector('.video-container'); // Get container

        // Update preview every 200ms for smoother auto-detection
        this.detectionInterval = setInterval(() => {
            if (cameraManager.isCameraActive()) {
                const video = cameraManager.getVideoElement();
                const colors = colorDetector.detectFaceColors(video);

                if (colors) {
                    this.updateGridOverlay(colors);

                    // Auto-detect Face based on Center Color
                    const centerPiece = colors.find(c => c.position.row === 1 && c.position.col === 1);
                    if (centerPiece && centerPiece.color !== 'unknown') {
                        this.updateFaceFromCenter(centerPiece.color);
                    }

                    // Auto-Capture Logic
                    const hasUnknown = colors.some(c => c.color === 'unknown');

                    if (!hasUnknown) {
                        const currentJson = JSON.stringify(colors.map(c => c.color));
                        if (currentJson === lastColorsJson) {
                            stabilityCounter++;
                        } else {
                            stabilityCounter = 0;
                            lastColorsJson = currentJson;
                            // Reset visual state
                            videoContainer.classList.remove('scanning-locked');
                            videoContainer.classList.add('scanning-active');
                        }

                        // Visual Feedback: Border turns green as we lock
                        if (stabilityCounter > 2) {
                            videoContainer.classList.add('scanning-locked');
                        }

                        // If stable and not already captured for this face
                        if (stabilityCounter >= STABILITY_THRESHOLD) {
                            const currentFace = cubeState.getCurrentFace();
                            const faceData = cubeState.getFaceData(currentFace);

                            // Only auto-capture if this face isn't already filled
                            if (!faceData && !this.isCapturing) {
                                this.isCapturing = true;
                                this.handleCaptureFace(); // This now includes validation

                                // Reset capturing flag after a delay to prevent double triggers
                                setTimeout(() => {
                                    this.isCapturing = false;
                                    stabilityCounter = 0; // Reset stability
                                }, 2000);
                            }
                        }
                    } else {
                        stabilityCounter = 0;
                        videoContainer.classList.remove('scanning-locked');
                        videoContainer.classList.add('scanning-active');
                    }
                }
            }
        }, 200);
    }

    /**
     * Update the current face selection based on the detected center color
     */
    updateFaceFromCenter(color) {
        // Standard Rubik's Cube Color Scheme
        // White: Up (U)
        // Yellow: Down (D)
        // Green: Front (F)
        // Blue: Back (B)
        // Red: Right (R)
        // Orange: Left (L)
        // Note: This assumes standard orientation relative to the user holding it.
        // We will map center colors to Faces assuming the user wants to populate that Face.

        const colorMap = {
            'white': 'U',
            'yellow': 'D',
            'green': 'F',
            'blue': 'B',
            'red': 'R',
            'orange': 'L'
        };

        const detectedFace = colorMap[color];
        if (detectedFace) {
            // Update UI to show we detected this face
            // We only switch if the user hasn't locked it, but for "Auto" feel, we switch.
            // However, we need to be careful not to jump around too much.
            // Let's just update the label for now, or use `cubeState` to set current face?
            // `cubeState` manages the *sequence*. 
            // If we want "Random Access" capture, we need to update `cubeState.currentFace`.

            if (this.currentDetectedCenter !== color) {
                this.currentDetectedCenter = color;
                // Ideally we update the internal state to point to this face
                cubeState.currentFace = detectedFace;
                this.updateUI();
            }
        }
    }

    /**
     * Update grid overlay with detected colors
     */
    updateGridOverlay(colors) {
        const gridCells = document.querySelectorAll('.grid-cell');
        colors.forEach((cell, index) => {
            if (gridCells[index]) {
                const colorClass = cell.color !== 'unknown' ? 'detected' : '';
                gridCells[index].className = `grid-cell ${colorClass}`;
            }
        });
    }

    /**
     * Handle capture face
     */
    async handleCaptureFace() {
        const video = cameraManager.getVideoElement();
        const colors = colorDetector.detectFaceColors(video);

        if (!colors) {
            this.showError('Failed to detect colors. Please ensure the cube is properly positioned.');
            return;
        }

        // Validate face
        const validation = cubeValidator.validateFace(colors);
        if (!validation.valid && !validation.warning) {
            this.showError(validation.error);
            return;
        }

        if (validation.warning) {
            // Show warning but allow capture
            this.showError(validation.error || validation.warning, 'warning');
        }

        // Capture the face
        const currentFace = cubeState.getCurrentFace();
        cubeState.captureFace(currentFace, colors);

        this.updateUI();

        // Check if all faces captured
        if (cubeState.isComplete()) {
            this.showError('All faces captured! Click "Validate Cube State" to proceed.', 'success');
            setTimeout(() => {
                this.showSection('visualization');
                cubeVisualizer.render(cubeState);
            }, 1500);
        }
    }

    /**
     * Handle recapture last face
     */
    handleRecapture() {
        if (cubeState.recaptureLastFace()) {
            this.updateUI();
            this.showError('');
        }
    }

    /**
     * Handle reset
     */
    handleReset() {
        cubeState.reset();
        this.updateUI();
        this.showError('');
    }

    /**
     * Handle validate
     */
    handleValidate() {
        const validation = cubeValidator.validate(cubeState);
        const summary = cubeValidator.getValidationSummary(validation);

        this.validationResult.className = `validation-result ${summary.type}`;
        this.validationResult.innerHTML = `
            <h4>${summary.message}</h4>
            <pre>${summary.details}</pre>
        `;
        this.validationResult.classList.remove('hidden');

        if (validation.valid) {
            setTimeout(() => {
                this.showSection('solution');
            }, 2000);
        }
    }

    /**
     * Handle solve
     */
    async handleSolve() {
        this.solvingStatus.classList.remove('hidden');
        this.solutionMoves.classList.add('hidden');
        this.solveBtn.disabled = true;

        // Simulate solving delay
        await new Promise(resolve => setTimeout(resolve, 1000));

        const stateString = cubeState.getStateString();
        const result = cubeSolver.solve(stateString);

        if (result.success) {
            // Display moves
            const movesHtml = `
                <h4>Solution Moves</h4>
                <div class="move-sequence">${result.moves.join(' ')}</div>
                <p class="move-count">Total moves: ${result.moveCount}</p>
            `;
            this.solutionMoves.innerHTML = movesHtml;
            this.solutionMoves.classList.remove('hidden');
            this.solvingStatus.classList.add('hidden');

            // Get explanation from Gemini
            this.getExplanation(result.moves);
        } else {
            this.solvingStatus.innerHTML = `<p class="error">Failed to solve: ${result.error}</p>`;
            this.solveBtn.disabled = false;
        }
    }

    /**
     * Get explanation from Gemini
     */
    async getExplanation(moves) {
        this.geminiExplanation.innerHTML = `
            <div class="loading-container">
                <div class="cube-loader"></div>
                <p>Asking Gemini for help...</p>
            </div>
        `;

        try {
            const groupedMoves = cubeSolver.groupMovesByPhase(moves);
            const explanation = await geminiClient.explainSolution(moves, groupedMoves);
            this.geminiExplanation.innerHTML = explanation;
        } catch (error) {
            console.error('Explanation error:', error);
            this.geminiExplanation.innerHTML = '<p class="error">Failed to load explanation</p>';
        }
    }

    /**
     * Handle new cube
     */
    handleNewCube() {
        cubeState.reset();
        this.showSection('capture');
        this.startCameraBtn.disabled = false;
        this.startCameraBtn.textContent = 'Start Camera';
        this.updateUI();
    }

    /**
     * Update UI based on current state
     */
    updateUI() {
        const progress = cubeState.getProgress();

        // Update current face label
        this.currentFaceLabel.textContent = cubeState.constructor.getFaceLabel(progress.currentFace);

        // Update 3D Preview Rotation
        if (this.threeScene) {
            this.threeScene.rotateToFace(progress.currentFace);

            // Update stickers
            const allFaces = cubeState.getAllFaces();
            Object.entries(allFaces).forEach(([faceKey, colors]) => {
                if (colors) {
                    colors.forEach((colorData, index) => {
                        this.threeScene.updateSticker(faceKey, index, colorData.color);
                    });
                }
            });
        }

        // Update face dots (Legacy/Fallback)
        this.faceDots.forEach(dot => {
            const face = dot.dataset.face;
            const faceData = cubeState.getFaceData(face);

            dot.classList.remove('active', 'completed');

            if (faceData) {
                dot.classList.add('completed');
            } else if (face === progress.currentFace) {
                dot.classList.add('active');
            }
        });

        // Update recapture button
        this.recaptureBtn.disabled = progress.completed === 0;
    }

    /**
     * Show section
     */
    showSection(section) {
        this.captureSection.classList.remove('active');
        this.visualizationSection.classList.remove('active');
        this.solutionSection.classList.remove('active');

        if (section === 'capture') {
            this.captureSection.classList.add('active');
        } else if (section === 'visualization') {
            this.visualizationSection.classList.add('active');
        } else if (section === 'solution') {
            this.solutionSection.classList.add('active');
        }

        this.currentSection = section;
    }

    /**
     * Show error message
     */
    showError(message, type = 'error') {
        if (!message) {
            this.errorMessage.classList.add('hidden');
            return;
        }

        this.errorMessage.textContent = message;
        this.errorMessage.className = 'error-message';

        if (type === 'warning') {
            this.errorMessage.style.background = '#fef3c7';
            this.errorMessage.style.color = '#92400e';
            this.errorMessage.style.borderColor = '#f59e0b';
        } else if (type === 'success') {
            this.errorMessage.style.background = '#d1fae5';
            this.errorMessage.style.color = '#065f46';
            this.errorMessage.style.borderColor = '#10b981';
        }

        this.errorMessage.classList.remove('hidden');
    }
}

// Initialize UI when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new UIController();
});
