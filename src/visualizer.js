/**
 * visualizer.js - Cube visualization
 * Creates 2D net representation of the cube
 */

export class CubeVisualizer {
    constructor() {
        this.container = document.getElementById('cube-2d-view');
    }

    /**
     * Render 2D cube net
     */
    render(cubeState) {
        this.container.innerHTML = '';

        const faces = cubeState.getAllFaces();
        const faceOrder = ['U', 'L', 'F', 'R', 'B', 'D'];

        faceOrder.forEach(faceKey => {
            const faceData = faces[faceKey];
            if (!faceData) return;

            const faceGrid = document.createElement('div');
            faceGrid.className = `face-grid ${faceKey}`;

            // Create 3x3 grid of stickers
            for (let i = 0; i < 9; i++) {
                const sticker = document.createElement('div');
                sticker.className = 'sticker';
                
                const cellData = faceData[i];
                if (cellData && cellData.color) {
                    sticker.classList.add(`color-${cellData.color}`);
                } else {
                    sticker.style.backgroundColor = '#ccc';
                }

                faceGrid.appendChild(sticker);
            }

            this.container.appendChild(faceGrid);
        });
    }

    /**
     * Clear visualization
     */
    clear() {
        this.container.innerHTML = '<p class="text-center">Capture all 6 faces to see the cube visualization</p>';
    }

    /**
     * Highlight a specific sticker
     */
    highlightSticker(face, position) {
        const faceGrid = this.container.querySelector(`.face-grid.${face}`);
        if (!faceGrid) return;

        const stickers = faceGrid.querySelectorAll('.sticker');
        const index = position.row * 3 + position.col;
        
        if (stickers[index]) {
            stickers[index].style.border = '3px solid #2563eb';
        }
    }

    /**
     * Animate a move (optional enhancement)
     */
    animateMove(move) {
        // This could be enhanced with CSS animations
        console.log('Animating move:', move);
    }
}

export const cubeVisualizer = new CubeVisualizer();
