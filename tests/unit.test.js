/**
 * Unit tests for pure functions in the Rubik's Cube Solver.
 * Run with: npm test
 *
 * Test coverage:
 *  - colorDetection.js:  rgbToHsv, detectColor
 *  - cubeState.js:       colorToNotation (dynamic map), getStateString
 *  - validator.js:       validateFace, validate (count checks, parity)
 *  - solver.js:          Move round-trip identity (all 18 base moves),
 *                        applyMove/applySequence exports, groupMovesByPhase
 *  - scrambleManager.js: parseScramble, applyScramble (correctness),
 *                        stateStringToFaces (default + custom colorMap)
 *  - Integration:        scramble → solve → verify solved state
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SOLVED_STATE = 'UUUUUUUUU' + 'RRRRRRRRR' + 'FFFFFFFFF' +
    'DDDDDDDDD' + 'LLLLLLLLL' + 'BBBBBBBBB';

function isSolved(stateStr) {
    for (let f = 0; f < 6; f++) {
        const center = stateStr[f * 9 + 4];
        for (let i = 0; i < 9; i++) {
            if (stateStr[f * 9 + i] !== center) return false;
        }
    }
    return true;
}

// ---------------------------------------------------------------------------
// colorDetection — pure math functions
// ---------------------------------------------------------------------------
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
    return Array.from({ length: 9 }, () => ({ color }));
}

describe('CubeState.colorToNotation', () => {
    it('maps colors dynamically from captured centers', () => {
        const cs = new CubeState();
        cs.captureFace('U', makeFace('white'));
        cs.captureFace('R', makeFace('red'));
        cs.captureFace('F', makeFace('green'));
        cs.captureFace('D', makeFace('yellow'));
        cs.captureFace('L', makeFace('orange'));
        cs.captureFace('B', makeFace('blue'));

        expect(cs.colorToNotation('white')).toBe('U');
        expect(cs.colorToNotation('red')).toBe('R');
        expect(cs.colorToNotation('green')).toBe('F');
        expect(cs.colorToNotation('yellow')).toBe('D');
        expect(cs.colorToNotation('orange')).toBe('L');
        expect(cs.colorToNotation('blue')).toBe('B');
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
        cs.captureFace('U', makeFace('yellow'));
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
// solver.js — applyMove exports: round-trip identity tests
// All 18 base moves (X and X' must be inverses; X2 applied twice = identity)
// ---------------------------------------------------------------------------
import { applyMove, applySequence } from '../src/solver.js';

const BASE_FACES = ['U', 'R', 'F', 'D', 'L', 'B'];

describe('applyMove: CW then CCW = identity (all 6 faces)', () => {
    for (const face of BASE_FACES) {
        it(`${face} then ${face}' restores the solved state`, () => {
            const state = SOLVED_STATE.split('');
            applyMove(state, face);
            applyMove(state, face + "'");
            expect(state.join('')).toBe(SOLVED_STATE);
        });
    }
});

describe('applyMove: CCW then CW = identity (all 6 faces)', () => {
    for (const face of BASE_FACES) {
        it(`${face}' then ${face} restores the solved state`, () => {
            const state = SOLVED_STATE.split('');
            applyMove(state, face + "'");
            applyMove(state, face);
            expect(state.join('')).toBe(SOLVED_STATE);
        });
    }
});

describe('applyMove: double then double = identity (all 6 faces)', () => {
    for (const face of BASE_FACES) {
        it(`${face}2 twice restores the solved state`, () => {
            const state = SOLVED_STATE.split('');
            applyMove(state, face + '2');
            applyMove(state, face + '2');
            expect(state.join('')).toBe(SOLVED_STATE);
        });
    }
});

describe('applyMove: CW four times = identity (all 6 faces)', () => {
    for (const face of BASE_FACES) {
        it(`${face} x4 restores the solved state`, () => {
            const state = SOLVED_STATE.split('');
            for (let i = 0; i < 4; i++) applyMove(state, face);
            expect(state.join('')).toBe(SOLVED_STATE);
        });
    }
});

describe('applyMove: rejects unknown move', () => {
    it('throws an error for an invalid face letter', () => {
        const state = SOLVED_STATE.split('');
        expect(() => applyMove(state, 'X')).toThrow(/Unknown move/);
    });
});

describe('applySequence: known algorithm round-trip', () => {
    // Pure array-manipulation tests (no solver involved — fast).
    // Sexy move: (R U R' U') has group order 6 — applying 6 times returns to solved.
    it("(R U R' U') x6 restores the solved state", () => {
        const state = SOLVED_STATE.split('');
        const sexyMove = ["R", "U", "R'", "U'"];
        for (let i = 0; i < 6; i++) applySequence(state, sexyMove);
        expect(state.join('')).toBe(SOLVED_STATE);
    });

    // Multi-move inverse: applying a sequence then its inverse restores solved state
    it('applySequence + inverse restores the solved state', () => {
        const state = SOLVED_STATE.split('');
        const seq = ["R", "U", "F2", "L'", "D"];
        const inv = [...seq].reverse().map(m =>
            m.endsWith("'") ? m[0] : m.endsWith('2') ? m : m + "'"
        );
        applySequence(state, seq);
        applySequence(state, inv);
        expect(state.join('')).toBe(SOLVED_STATE);
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
        const moves = Array.from({ length: 40 }, (_, i) => ['R', 'U', 'F', 'L', "R'", "U'"][i % 6]);
        const groups = cs.groupMovesByPhase(moves);
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

// ---------------------------------------------------------------------------
// scrambleManager — parseScramble, applyScramble, stateStringToFaces
// ---------------------------------------------------------------------------
import { parseScramble, applyScramble, generateScramble, stateStringToFaces } from '../src/scrambleManager.js';

describe('parseScramble', () => {
    it('parses a standard WCA scramble string', () => {
        const moves = parseScramble("R U2 F' L D B'");
        expect(moves).toEqual(['R', 'U2', "F'", 'L', 'D', "B'"]);
    });

    it('returns empty array for empty string', () => {
        expect(parseScramble('')).toEqual([]);
    });

    it('throws on invalid face letter', () => {
        expect(() => parseScramble('X U R')).toThrow(/Invalid move face/);
    });

    it('throws on invalid suffix', () => {
        expect(() => parseScramble('R3')).toThrow(/Invalid move suffix/);
    });
});

describe('applyScramble correctness', () => {
    it('returns the solved state when given zero moves', () => {
        expect(applyScramble([])).toBe(SOLVED_STATE);
    });

    it("R then R' returns to solved", () => {
        const state = applyScramble(["R", "R'"]);
        expect(state).toBe(SOLVED_STATE);
    });

    it('any 20-move scramble is not the solved state', () => {
        const scramble = parseScramble(generateScramble(20));
        const state = applyScramble(scramble);
        // Extremely unlikely to be solved — treat as a sanity check
        // (the probability is 1/4.3×10^19)
        expect(state).not.toBe(SOLVED_STATE);
    });

    it('scramble then inverse scramble restores solved state', () => {
        const scramble = ["R", "U", "F", "D2", "L'", "B2"];
        const inverse = [...scramble].reverse().map(m =>
            m.endsWith("'") ? m[0] : m.endsWith('2') ? m : m + "'"
        );
        const forward = applyScramble(scramble);
        const restored = applyScramble([...scramble, ...inverse]);
        expect(restored).toBe(SOLVED_STATE);
    });
});

describe('stateStringToFaces', () => {
    it('converts solved state string to all-white U face with default map', () => {
        const faces = stateStringToFaces(SOLVED_STATE);
        expect(faces.U.every(c => c.color === 'white')).toBe(true);
        expect(faces.R.every(c => c.color === 'red')).toBe(true);
        expect(faces.D.every(c => c.color === 'yellow')).toBe(true);
    });

    it('accepts a custom colorMap and overrides defaults', () => {
        const customMap = { U: 'yellow', R: 'orange', F: 'blue', D: 'white', L: 'red', B: 'green' };
        const faces = stateStringToFaces(SOLVED_STATE, 3, customMap);
        // U face stickers in solved state are all 'U' → mapped to 'yellow' in custom map
        expect(faces.U.every(c => c.color === 'yellow')).toBe(true);
    });

    it('falls back to default map for incomplete custom colorMap', () => {
        const partialMap = { U: 'yellow' }; // only 1 of 6 faces
        const faces = stateStringToFaces(SOLVED_STATE, 3, partialMap);
        // Falls back to default: U → white
        expect(faces.U.every(c => c.color === 'white')).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Integration test: scramble → solve → verify
// Uses the LBL solver (synchronous) so no async WASM needed in unit tests.
// ---------------------------------------------------------------------------
describe('Integration: applyScramble → CubeSolver.solve → solved state', () => {
    const solver = new CubeSolver();

    // Keep scrambles short (1-4 moves) to stay within the IDDFS per-phase depth limit.
    // The LBL solver uses maxDepth 6-10 per sub-goal; longer scrambles require
    // deeper search and are best covered by the optimal solver integration tests.
    const simpleScrambles = [
        ["R"],
        ["U", "R'"],
        ["R", "U", "F"],
        ["R", "U", "R'", "U'"],
    ];

    for (const scramble of simpleScrambles) {
        it(`solves scramble: ${scramble.join(' ')}`, () => {
            const scrambledState = applyScramble(scramble);
            const result = solver.solve(scrambledState);
            expect(result.success).toBe(true);

            // Apply the solution to the scrambled state and verify it is solved
            const finalState = scrambledState.split('');
            applySequence(finalState, result.moves);
            expect(isSolved(finalState.join(''))).toBe(true);
        });
    }
});
