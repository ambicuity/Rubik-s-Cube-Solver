/**
 * threeScene.js - Manages the 3D visualization of the Rubik's Cube
 */

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';


export class ThreeScene {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(45, this.container.clientWidth / this.container.clientHeight, 0.1, 100);
        this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });

        this.cubies = [];
        this.group = new THREE.Group();

        this.init();
    }

    init() {
        // Setup Renderer
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);

        // Setup Camera
        this.camera.position.set(4, 3, 5);
        this.camera.lookAt(0, 0, 0);

        // Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(5, 10, 7);
        this.scene.add(dirLight);

        // Create Cube (3x3x3)
        this.createCube();

        // Animation Loop
        this.animate = this.animate.bind(this);
        this.animate();

        // Handle Resize
        window.addEventListener('resize', () => this.onWindowResize());
    }

    createCube() {
        const geometry = new THREE.BoxGeometry(0.95, 0.95, 0.95);
        // Default grey material for internal/unknown stickers
        const baseMaterial = new THREE.MeshPhysicalMaterial({
            color: 0x222222,
            roughness: 0.5,
            metalness: 0.1
        });

        // We need 27 cubies
        for (let x = -1; x <= 1; x++) {
            for (let y = -1; y <= 1; y++) {
                for (let z = -1; z <= 1; z++) {
                    // Materials array: Right, Left, Top, Bottom, Front, Back
                    // Initialize all as base grey
                    const materials = Array(6).fill(baseMaterial);

                    const mesh = new THREE.Mesh(geometry, materials);
                    mesh.position.set(x, y, z);

                    // Store logic coordinates for updating
                    mesh.userData = { x, y, z };

                    this.group.add(mesh);
                    this.cubies.push(mesh);
                }
            }
        }

        this.scene.add(this.group);
    }

    /**
     * Update a sticker on the 3D cube
     * @param {string} face - 'U', 'D', 'F', 'B', 'L', 'R'
     * @param {number} index - 0-8 index of the sticker on that face
     * @param {string} colorName - 'white', 'yellow', 'green', etc.
     */
    updateSticker(face, index, colorName) {
        // Map color name to hex
        const colors = {
            white: 0xffffff,
            yellow: 0xffd500,
            green: 0x009e60,
            blue: 0x0051ba,
            red: 0xc41e3a,
            orange: 0xff5800,
            unknown: 0x444444
        };

        const hex = colors[colorName] || colors.unknown;
        const material = new THREE.MeshPhysicalMaterial({ color: hex });

        // Helper to find the correct cubie and face index
        const { cubie, faceIndex } = this.getCubieAndFaceIndex(face, index);

        if (cubie) {
            // Clone materials array so we don't affect others
            if (!Array.isArray(cubie.material)) {
                cubie.material = Array(6).fill(cubie.material);
            } else {
                cubie.material = [...cubie.material];
            }
            cubie.material[faceIndex] = material;
        }
    }

    /**
     * Map logical face/index to 3D coordinate and Mesh material index
     */
    getCubieAndFaceIndex(face, index) {
        // Map 0-8 index to (dx, dy) on the face
        // 0 1 2
        // 3 4 5
        // 6 7 8
        const row = Math.floor(index / 3);
        const col = index % 3;

        let x = 0, y = 0, z = 0;
        let faceIndex = 0; // 0:R, 1:L, 2:U, 3:D, 4:F, 5:B

        // Standard orientation:
        // Front (F): z=1, x=-1..1, y=1..-1
        // Back (B): z=-1, x=1..-1, y=1..-1
        // Up (U): y=1, x=-1..1, z=-1..1
        // Down (D): y=-1, x=-1..1, z=1..-1
        // Right (R): x=1, z=1..-1, y=1..-1
        // Left (L): x=-1, z=-1..1, y=1..-1

        switch (face) {
            case 'F':
                z = 1;
                x = col - 1;
                y = 1 - row;
                faceIndex = 4;
                break;
            case 'B':
                z = -1;
                x = 1 - col;
                y = 1 - row;
                faceIndex = 5;
                break;
            case 'U':
                y = 1;
                x = col - 1;
                z = row - 1; // Conventional U starts back-left? 
                // Valid U index 0 is top-left (back-left in 3D?)
                // Let's assume U face looks like cartesian x-z plane
                // 0 1 2 -> z=-1 (back)
                // 3 4 5 -> z=0
                // 6 7 8 -> z=1 (front)
                // x goes -1 -> 1
                z = -1 + row;
                x = col - 1;
                faceIndex = 2;
                break;
            case 'D':
                y = -1;
                z = 1 - row;
                x = col - 1;
                faceIndex = 3;
                break;
            case 'R':
                x = 1;
                z = 1 - col;
                y = 1 - row;
                faceIndex = 0;
                break;
            case 'L':
                x = -1;
                z = col - 1;
                y = 1 - row;
                faceIndex = 1;
                break;
        }

        const cubie = this.cubies.find(m =>
            Math.abs(m.userData.x - x) < 0.1 &&
            Math.abs(m.userData.y - y) < 0.1 &&
            Math.abs(m.userData.z - z) < 0.1
        );

        return { cubie, faceIndex };
    }

    /**
     * Rotate the whole cube to show a specific face
     */
    rotateToFace(face) {
        // Target Rotations (Euler angles)
        const targetRotations = {
            'F': { x: 0.3, y: -0.4 },     // Front slightly tilted
            'R': { x: 0.3, y: -0.4 - 1.57 }, // Rotate Y -90deg
            'B': { x: 0.3, y: -0.4 - 3.14 }, // Rotate Y -180deg
            'L': { x: 0.3, y: -0.4 + 1.57 }, // Rotate Y +90deg
            'U': { x: 0.3 + 1.57, y: 0 },    // Rotate X +90deg
            'D': { x: 0.3 - 1.57, y: 0 }     // Rotate X -90deg
        };

        const target = targetRotations[face] || targetRotations['F'];

        // Simple lerp animation could go here, for now just custom jump
        // or we animate in the loop.

        // Let's rely on detection of 'targetRotation' in animate loop for smoothness
        this.targetRotation = target;
    }

    animate() {
        requestAnimationFrame(this.animate);

        // Smooth rotation to target
        if (this.targetRotation) {
            this.group.rotation.x += (this.targetRotation.x - this.group.rotation.x) * 0.1;
            this.group.rotation.y += (this.targetRotation.y - this.group.rotation.y) * 0.1;
        } else {
            // Idle rotation
            this.group.rotation.y += 0.002;
        }

        this.renderer.render(this.scene, this.camera);
    }

    onWindowResize() {
        if (!this.container) return;
        this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    }
}
