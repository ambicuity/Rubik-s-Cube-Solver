/**
 * colorDetection.js - Client-side computer vision for color detection
 * Converts RGB to HSV and detects cube colors
 */

export class ColorDetector {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

        // HSV ranges for Rubik's Cube colors
        this.colorRanges = {
            white: { h: [0, 360], s: [0, 30], v: [70, 100] },
            yellow: { h: [40, 70], s: [40, 100], v: [70, 100] },
            red: { h: [0, 15], s: [40, 100], v: [40, 100] },
            orange: { h: [15, 40], s: [40, 100], v: [50, 100] },
            green: { h: [70, 160], s: [30, 100], v: [30, 100] },
            blue: { h: [160, 260], s: [30, 100], v: [30, 100] }
        };
    }

    /**
     * Convert RGB to HSV
     */
    rgbToHsv(r, g, b) {
        r /= 255;
        g /= 255;
        b /= 255;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const diff = max - min;

        let h = 0;
        let s = max === 0 ? 0 : (diff / max) * 100;
        let v = max * 100;

        if (diff !== 0) {
            if (max === r) {
                h = ((g - b) / diff + (g < b ? 6 : 0)) * 60;
            } else if (max === g) {
                h = ((b - r) / diff + 2) * 60;
            } else {
                h = ((r - g) / diff + 4) * 60;
            }
        }

        return { h, s, v };
    }

    /**
     * Detect color from HSV values
     */
    detectColor(hsv) {
        const { h, s, v } = hsv;
        let bestMatch = 'unknown';
        let bestScore = -Infinity;

        for (const [colorName, range] of Object.entries(this.colorRanges)) {
            let score = 0;

            // Check hue (circular range)
            const [hMin, hMax] = range.h;
            if (colorName === 'red' && h > 330) {
                // Handle red wrapping around 360
                score += 100;
            } else if (h >= hMin && h <= hMax) {
                const hCenter = (hMin + hMax) / 2;
                const hDistance = Math.abs(h - hCenter);
                score += 100 - (hDistance / ((hMax - hMin) / 2)) * 100;
            }

            // Check saturation
            const [sMin, sMax] = range.s;
            if (s >= sMin && s <= sMax) {
                const sCenter = (sMin + sMax) / 2;
                const sDistance = Math.abs(s - sCenter);
                score += 50 - (sDistance / ((sMax - sMin) / 2)) * 50;
            } else {
                score -= 50;
            }

            // Check value
            const [vMin, vMax] = range.v;
            if (v >= vMin && v <= vMax) {
                const vCenter = (vMin + vMax) / 2;
                const vDistance = Math.abs(v - vCenter);
                score += 50 - (vDistance / ((vMax - vMin) / 2)) * 50;
            } else {
                score -= 50;
            }

            if (score > bestScore) {
                bestScore = score;
                bestMatch = colorName;
            }
        }

        return bestScore > 50 ? bestMatch : 'unknown';
    }

    /**
     * Sample color from a region of the video
     */
    sampleColorFromRegion(video, x, y, width, height) {
        this.canvas.width = width;
        this.canvas.height = height;

        // Draw video frame to canvas
        this.ctx.drawImage(video, x, y, width, height, 0, 0, width, height);

        // Get pixel data
        const imageData = this.ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        // Calculate average color, ignoring outliers
        const colors = [];
        for (let i = 0; i < data.length; i += 4) {
            colors.push({
                r: data[i],
                g: data[i + 1],
                b: data[i + 2]
            });
        }

        // Simple averaging
        let totalR = 0, totalG = 0, totalB = 0;
        colors.forEach(color => {
            totalR += color.r;
            totalG += color.g;
            totalB += color.b;
        });

        const avgR = Math.round(totalR / colors.length);
        const avgG = Math.round(totalG / colors.length);
        const avgB = Math.round(totalB / colors.length);

        return { r: avgR, g: avgG, b: avgB };
    }

    /**
     * Detect colors from a 3x3 grid on the video
     */
    detectFaceColors(video) {
        const videoWidth = video.videoWidth;
        const videoHeight = video.videoHeight;

        if (videoWidth === 0 || videoHeight === 0) {
            return null;
        }

        // Define grid area (60% of video centered)
        const gridSize = Math.min(videoWidth, videoHeight) * 0.6;
        const startX = (videoWidth - gridSize) / 2;
        const startY = (videoHeight - gridSize) / 2;
        const cellSize = gridSize / 3;
        const sampleSize = cellSize * 0.5; // Sample from center 50% of each cell

        const colors = [];

        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
                const cellX = startX + col * cellSize + (cellSize - sampleSize) / 2;
                const cellY = startY + row * cellSize + (cellSize - sampleSize) / 2;

                const rgb = this.sampleColorFromRegion(
                    video,
                    cellX,
                    cellY,
                    sampleSize,
                    sampleSize
                );

                const hsv = this.rgbToHsv(rgb.r, rgb.g, rgb.b);
                const color = this.detectColor(hsv);

                colors.push({
                    position: { row, col },
                    rgb,
                    hsv,
                    color
                });
            }
        }

        return colors;
    }

    /**
     * Map color names to cube notation
     */
    static getColorNotation(colorName) {
        const mapping = {
            white: 'W',
            yellow: 'Y',
            blue: 'B',
            green: 'G',
            red: 'R',
            orange: 'O'
        };
        return mapping[colorName] || '?';
    }

    /**
     * Get the detected color of the center piece
     */
    getCenterPieceColor(video) {
        const videoWidth = video.videoWidth;
        const videoHeight = video.videoHeight;

        if (!videoWidth || !videoHeight) return null;

        const gridSize = Math.min(videoWidth, videoHeight) * 0.6;
        const cellSize = gridSize / 3;

        // Center cell is at index (1, 1)
        const centerX = (videoWidth - gridSize) / 2 + cellSize * 1.5;
        const centerY = (videoHeight - gridSize) / 2 + cellSize * 1.5;
        const sampleSize = cellSize * 0.5;

        const rgb = this.sampleColorFromRegion(
            video,
            centerX - sampleSize / 2,
            centerY - sampleSize / 2,
            sampleSize,
            sampleSize
        );

        const hsv = this.rgbToHsv(rgb.r, rgb.g, rgb.b);
        return this.detectColor(hsv);
    }
}

export const colorDetector = new ColorDetector();
