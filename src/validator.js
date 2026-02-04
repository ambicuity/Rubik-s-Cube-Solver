/**
 * validator.js - Validates cube state for solvability
 * Ensures the captured cube configuration is physically possible
 */

export class CubeValidator {
    constructor() {
        this.requiredColors = ['white', 'yellow', 'red', 'orange', 'blue', 'green'];
    }

    /**
     * Validate complete cube state
     */
    validate(cubeState) {
        const faces = cubeState.getAllFaces();
        const errors = [];

        // Check if all faces are captured
        if (!cubeState.isComplete()) {
            return {
                valid: false,
                errors: ['Not all faces have been captured']
            };
        }

        // Collect all colors
        const allColors = [];
        Object.values(faces).forEach(face => {
            if (face) {
                face.forEach(cell => {
                    allColors.push(cell.color);
                });
            }
        });

        // Check total number of stickers (should be 54)
        if (allColors.length !== 54) {
            errors.push(`Invalid total stickers: ${allColors.length} (expected 54)`);
        }

        // Check for unknown colors
        const unknownColors = allColors.filter(color => 
            !this.requiredColors.includes(color) && color !== 'unknown'
        );
        if (unknownColors.length > 0) {
            errors.push(`Unknown colors detected: ${unknownColors.join(', ')}`);
        }

        // Check color counts (should be exactly 9 of each color)
        const colorCounts = {};
        this.requiredColors.forEach(color => {
            colorCounts[color] = allColors.filter(c => c === color).length;
        });

        for (const [color, count] of Object.entries(colorCounts)) {
            if (count !== 9) {
                errors.push(`Invalid ${color} count: ${count} (expected 9)`);
            }
        }

        // Check for 'unknown' colors
        const unknownCount = allColors.filter(c => c === 'unknown').length;
        if (unknownCount > 0) {
            errors.push(`${unknownCount} stickers could not be detected. Please recapture these faces.`);
        }

        // Validate center pieces (each face should have a unique center color)
        const centerColors = this.getCenterColors(faces);
        const uniqueCenters = new Set(centerColors);
        if (uniqueCenters.size !== 6) {
            errors.push('Center pieces must all be different colors');
        }

        // Check if centers match required colors
        const missingCenterColors = this.requiredColors.filter(
            color => !centerColors.includes(color)
        );
        if (missingCenterColors.length > 0) {
            errors.push(`Missing center colors: ${missingCenterColors.join(', ')}`);
        }

        return {
            valid: errors.length === 0,
            errors: errors,
            colorCounts: colorCounts
        };
    }

    /**
     * Get center colors from all faces
     */
    getCenterColors(faces) {
        const centers = [];
        const faceOrder = ['F', 'R', 'B', 'L', 'U', 'D'];
        
        faceOrder.forEach(faceKey => {
            const face = faces[faceKey];
            if (face && face.length === 9) {
                // Center piece is at index 4 (middle of 3x3 grid)
                centers.push(face[4].color);
            }
        });

        return centers;
    }

    /**
     * Validate single face during capture
     */
    validateFace(colors) {
        if (!colors || colors.length !== 9) {
            return {
                valid: false,
                error: 'Face must have exactly 9 stickers'
            };
        }

        // Check for unknown colors
        const unknownCount = colors.filter(c => c.color === 'unknown').length;
        if (unknownCount > 0) {
            return {
                valid: false,
                error: `${unknownCount} sticker(s) could not be detected. Adjust lighting or position.`,
                warning: true
            };
        }

        // Check if all stickers are the same color (unlikely but possible for center face)
        const uniqueColors = new Set(colors.map(c => c.color));
        if (uniqueColors.size === 1) {
            return {
                valid: true,
                warning: 'All stickers appear to be the same color. Is this correct?'
            };
        }

        return {
            valid: true
        };
    }

    /**
     * Get validation summary for display
     */
    getValidationSummary(validationResult) {
        if (validationResult.valid) {
            return {
                type: 'success',
                message: '✓ Cube state is valid and ready to solve!',
                details: `Color distribution: ${Object.entries(validationResult.colorCounts)
                    .map(([color, count]) => `${color}: ${count}`)
                    .join(', ')}`
            };
        } else {
            return {
                type: 'error',
                message: '✗ Cube state is invalid',
                details: validationResult.errors.join('\n')
            };
        }
    }
}

export const cubeValidator = new CubeValidator();
