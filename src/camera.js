/**
 * camera.js - Webcam capture and management
 * Handles MediaDevices API for live video feed
 */

export class CameraManager {
    constructor() {
        this.video = document.getElementById('video');
        this.stream = null;
        this.isActive = false;
    }

    /**
     * Start the webcam
     */
    async startCamera() {
        try {
            const constraints = {
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'environment' // Prefer back camera on mobile
                }
            };

            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.video.srcObject = this.stream;
            this.isActive = true;

            return { success: true };
        } catch (error) {
            console.error('Camera error:', error);
            let errorMessage = 'Failed to access camera. ';
            
            if (error.name === 'NotAllowedError') {
                errorMessage += 'Please allow camera access in your browser settings.';
            } else if (error.name === 'NotFoundError') {
                errorMessage += 'No camera found on this device.';
            } else {
                errorMessage += error.message;
            }

            return { success: false, error: errorMessage };
        }
    }

    /**
     * Stop the webcam
     */
    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
            this.video.srcObject = null;
            this.isActive = false;
        }
    }

    /**
     * Check if camera is active
     */
    isCameraActive() {
        return this.isActive;
    }

    /**
     * Get video element
     */
    getVideoElement() {
        return this.video;
    }
}

export const cameraManager = new CameraManager();
