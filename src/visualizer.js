/**
 * visualizer.js - Cube visualization
 * Creates 2D net representation of the cube
 */

export class Visualizer {
    constructor() {
        this.container = document.getElementById('cube-2d-view');
        this.facePositions = {
            U: { x: 1, y: 0 },
            L: { x: 0, y: 1 },
            F: { x: 1, y: 1 },
            R: { x: 2, y: 1 },
            B: { x: 3, y: 1 },
            D: { x: 1, y: 2 }
        };
        // Standard Web color map
        this.colorMapping = {
            'white': '#ffffff',
            'yellow': '#ffd500',
            'green': '#009e60',
            'blue': '#0051ba',
            'red': '#c41e3a',
            'orange': '#ff5800',
            'unknown': '#333333'
        };
    }

    /**
     * Render 2D cube net using SVG
     */
    render(cubeState) {
        this.container.innerHTML = '';

        const faces = cubeState.getAllFaces();

        const faceSize = 50; // Size of each face square
        const faceSpacing = 5; // Spacing between faces

        const svgWidth = (4 * faceSize) + (3 * faceSpacing);
        const svgHeight = (3 * faceSize) + (2 * faceSpacing);

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', svgWidth);
        svg.setAttribute('height', svgHeight);
        svg.setAttribute('viewBox', `0 0 ${svgWidth} ${svgHeight}`);
        svg.classList.add('cube-net-svg');

        for (const [faceKey, pos] of Object.entries(this.facePositions)) {
            const faceData = faces[faceKey];
            if (!faceData) continue;

            const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            // Shift group to correct net position
            const offsetX = pos.x * (faceSize + faceSpacing);
            const offsetY = pos.y * (faceSize + faceSpacing);
            group.setAttribute('transform', `translate(${offsetX}, ${offsetY})`);

            // Check if 2x2 or 3x3 based on length
            const gridSize = faceData.length === 4 ? 2 : 3;
            // E.g. 54 / 3 = 18.  2x2: 54 / 2 = 27
            const currentStickerSize = faceSize / gridSize;

            faceData.forEach((sticker, index) => {
                const row = Math.floor(index / gridSize);
                const col = index % gridSize;

                const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                rect.setAttribute('x', col * currentStickerSize + 1);
                rect.setAttribute('y', row * currentStickerSize + 1);
                rect.setAttribute('width', currentStickerSize - 2);
                rect.setAttribute('height', currentStickerSize - 2);
                rect.setAttribute('fill', this.colorMapping[sticker.color] || this.colorMapping['unknown']);
                rect.setAttribute('rx', 2);

                // Add id so we can update it later
                rect.setAttribute('id', `vis-sticker-${faceKey}-${index}`);

                // Tooltip
                const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
                title.textContent = `${faceKey}${index} (${sticker.color})`;
                rect.appendChild(title);

                group.appendChild(rect);
            });

            svg.appendChild(group);
        }

        this.container.appendChild(svg);
    }

    /**
     * Updates a single sticker in the 2D visualizer directly without full re-render.
     */
    updateSticker(faceKey, index, colorName) {
        const el = document.getElementById(`vis-sticker-${faceKey}-${index}`);
        if (el) {
            el.setAttribute('fill', this.colorMapping[colorName] || this.colorMapping['unknown']);
            const title = el.querySelector('title');
            if (title) title.textContent = `${faceKey}${index} (${colorName})`;
        }
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
