/**
 * Unit tests for pure functions in the Rubik's Cube Solver.
 * Run with: npm test
 *
 * Tests cover:
 *  - colorDetection.js: rgbToHsv, detectColor
 *  - cubeState.js: colorToNotation (dynamic map), getStateString
 *  - validator.js: validateFace, validate (count checks)
 *  - solver.js: applyMove (via exported helpers), groupMovesByPhase
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// colorDetection — pure math functions
// ---------------------------------------------------------------------------
// We import only the class so no DOM is needed
import { ColorDetector } from '../src/colorDetection.js';

describe('ColorDetector.rgbToHsv', () => {
    const cd = new ColorDetector();

    it('converts pure red (255,0,0) to H≈0 S=100 V=100', () => {
        const { h, s, v } = cd.rgbToHsv(255, 0, 0);
        expect(h).toBeCloseTo(0, 0);
        expect(s).toBeCloseTo(100, 0);
        expect(v).toBeCloseTo(100, 0);
    });

    it('converts pure white (255,255,255) to S=0 V=100', () => {
        const { s, v } = cd.rgbToHsv(255, 255, 255);
        expect(s).toBeCloseTo(0, 0);
        expect(v).toBeCloseTo(100, 0);
    });

    it('converts pure blue (0,0,255) to H≈240', () => {
        const { h } = cd.rgbToHsv(0, 0, 255);
        expect(h).toBeCloseTo(240, 0);
    });

    it('converts pure green (0,255,0) to H≈120', () => {
        const { h } = cd.rgbToHsv(0, 255, 0);
        expect(h).toBeCloseTo(120, 0);
    });

    it('converts pure yellow (255,255,0) to H≈60', () => {
        const { h } = cd.rgbToHsv(255, 255, 0);
        expect(h).toBeCloseTo(60, 0);
    });
});

describe('ColorDetector.detectColor', () => {
    const cd = new ColorDetector();

    it('detects white from low-saturation high-value HSV', () => {
        expect(cd.detectColor({ h: 0, s: 5, v: 95 })).toBe('white');
    });

    it('detects red from H≈5 high saturation', () => {
        expect(cd.detectColor({ h: 5, s: 80, v: 80 })).toBe('red');
    });

    it('detects red from H≈350 (wrap-around)', () => {
        expect(cd.detectColor({ h: 350, s: 80, v: 80 })).toBe('red');
    });

    it('detects yellow from H≈60', () => {
        expect(cd.detectColor({ h: 60, s: 90, v: 90 })).toBe('yellow');
    });

    it('detects blue from H≈220', () => {
        expect(cd.detectColor({ h: 220, s: 80, v: 70 })).toBe('blue');
    });

    it('detects green from H≈120', () => {
        expect(cd.detectColor({ h: 120, s: 80, v: 70 })).toBe('green');
    });

    it('detects orange from H≈25', () => {
        expect(cd.detectColor({ h: 25, s: 80, v: 80 })).toBe('orange');
    });
});

// ---------------------------------------------------------------------------
// CubeState — dynamic color→face mapping
// ---------------------------------------------------------------------------
import { CubeState } from '../src/cubeState.js';

function makeFace(color) {
    // 9 cells, cell 4 is center
    return Array.from({ length: 9 }, (_, i) => ({ color }));
}

describe('CubeState.colorToNotation', () => {
    it('maps colors dynamically from captured centers', () => {
        const cs = new CubeState();
        cs.captureFace('U', makeFace('white'));
        cs.captureFace('D', makeFace('yellow'));
        cs.captureFace('F', makeFace('green'));
        cs.captureFace('B', makeFace('blue'));
        cs.captureFace('R', makeFace('red'));
        cs.captureFace('L', makeFace('orange'));

        expect(cs.colorToNotation('white')).toBe('U');
        expect(cs.colorToNotation('yellow')).toBe('D');
        expect(cs.colorToNotation('green')).toBe('F');
        expect(cs.colorToNotation('blue')).toBe('B');
        expect(cs.colorToNotation('red')).toBe('R');
        expect(cs.colorToNotation('orange')).toBe('L');
    });

    it('returns "?" for unmapped colors', () => {
        const cs = new CubeState();
        cs.captureFace('U', makeFace('white'));
        expect(cs.colorToNotation('purple')).toBe('?');
    });

    it('cache is invalidated on recapture', () => {
        const cs = new CubeState();
        cs.captureFace('U', makeFace('white'));
        expect(cs.colorToNotation('white')).toBe('U');
        cs.recaptureLastFace();
        cs.captureFace('U', makeFace('yellow')); // different color on same face
        expect(cs.colorToNotation('yellow')).toBe('U');
        expect(cs.colorToNotation('white')).toBe('?');
    });
});

describe('CubeState.getStateString', () => {
    it('returns null when not all faces captured', () => {
        const cs = new CubeState();
        cs.captureFace('U', makeFace('white'));
        expect(cs.getStateString()).toBeNull();
    });

    it('returns 54-char string when complete', () => {
        const cs = new CubeState();
        const colors = { U: 'white', R: 'red', F: 'green', D: 'yellow', L: 'orange', B: 'blue' };
        Object.entries(colors).forEach(([f, c]) => cs.captureFace(f, makeFace(c)));
        const str = cs.getStateString();
        expect(str).not.toBeNull();
        expect(str.length).toBe(54);
        // All chars should be valid face keys
        expect([...str].every(ch => 'URFDLB'.includes(ch))).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// CubeValidator — face and cube validation
// ---------------------------------------------------------------------------
import { CubeValidator } from '../src/validator.js';

describe('CubeValidator.validateFace', () => {
    const cv = new CubeValidator();

    it('rejects faces with fewer than 9 stickers', () => {
        expect(cv.validateFace([]).valid).toBe(false);
        expect(cv.validateFace(Array(5).fill({ color: 'red' })).valid).toBe(false);
    });

    it('rejects faces with unknown stickers', () => {
        const face = Array(9).fill({ color: 'red' });
        face[3] = { color: 'unknown' };
        const result = cv.validateFace(face);
        expect(result.valid).toBe(false);
        expect(result.warning).toBe(true);
    });

    it('accepts a valid face', () => {
        const face = Array(9).fill({ color: 'red' });
        expect(cv.validateFace(face).valid).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// CubeSolver — groupMovesByPhase
// ---------------------------------------------------------------------------
import { CubeSolver } from '../src/solver.js';

describe('CubeSolver.groupMovesByPhase', () => {
    const cs = new CubeSolver();

    it('returns empty array for no moves', () => {
        expect(cs.groupMovesByPhase([])).toEqual([]);
    });

    it('returns 4 phase groups for a typical move count', () => {
        const moves = Array.from({ length: 24 }, (_, i) => ['R', 'U', 'F', 'L'][i % 4]);
        const groups = cs.groupMovesByPhase(moves);
        expect(groups.length).toBe(4);
        const phases = groups.map(g => g.phase);
        expect(phases).toContain('Cross');
        expect(phases).toContain('F2L');
        expect(phases).toContain('OLL');
        expect(phases).toContain('PLL');
    });

    it('all moves are accounted for (no loss)', () => {
        const moves = Array.from({ length: 30 }, () => 'U');
        const groups = cs.groupMovesByPhase(moves);
        const total = groups.reduce((s, g) => s + g.moves.length, 0);
        expect(total).toBe(30);
    });
});
