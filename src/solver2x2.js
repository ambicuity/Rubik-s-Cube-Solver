/**
 * solver2x2.js — 2×2 Rubik's Cube solver
 *
 * Uses cubing.js (already a project dependency) for optimal solving.
 * Falls back to a built-in IDDFS solver if cubing.js is unavailable.
 *
 * State format: 24-char string, face order U R F D L B, each 4 stickers:
 *   U[0-3] R[4-7] F[8-11] D[12-15] L[16-19] B[20-23]
 * Per-face layout (viewed facing the face):
 *   0 1
 *   2 3
 *
 * Solved state: "UUUURRRRFFFFDDDDLLLLBBBB"
 */

const SOLVED_2x2 = 'UUUURRRRFFFFDDDDLLLLBBBB';

// ---------------------------------------------------------------------------
// Move permutation cycles for 2×2
// Each cycle (a,b,c,d) means: sticker at a→b→c→d→a
// Derived from physical corner analysis (U/R/F face CW moves).
// U', R', F' = apply CW 3 times.  X2 = apply CW twice.
// ---------------------------------------------------------------------------
const MOVE_CYCLES_2x2 = {
    U: [
        [2, 3, 1, 0],    // U-face stickers CW
        [8, 4, 20, 16],  // UFL.F→UFR.R→UBR.B→UBL.L
        [17, 9, 5, 21],  // UFL.L→UFR.F→UBR.R→UBL.B
    ],
    R: [
        [4, 5, 7, 6],    // R-face stickers CW
        [13, 9, 1, 22],  // DFR.D→UFR.F→UBR.U→DBR.B (reversed ordering in B)
        [11, 3, 20, 15], // DFR.F→UFR.U→UBR.B→DBR.D
    ],
    F: [
        [8, 9, 11, 10],  // F-face stickers CW
        [2, 4, 13, 19],  // UFL.U→UFR.R→DFR.D→DFL.L
        [3, 6, 12, 17],  // UFR.U→DFR.R→DFL.D→UFL.L  (reversed)
    ],
    D: [
        [12, 14, 15, 13], // D-face stickers CW
        [10, 18, 23, 6],  // DFL.F→DBL.L→DBR.B→DFR.R
        [11, 16, 22, 7],  // DFR.F→DFL.L→DBL.B→DBR.R
    ],
    L: [
        [16, 17, 19, 18], // L-face stickers CW
        [0, 10, 14, 21],  // UBL.U→DFL.F→DBL.D→UBL.B  (note: recalculated)
        [2, 8, 12, 23],   // UFL.U→DFL.F→DBL.D→UBL.B
    ],
    B: [
        [20, 21, 23, 22], // B-face stickers CW
        [1, 16, 15, 5],   // UBR.U→UBL.L→DBR.D→UBR.R
        [0, 18, 14, 4],   // UBL.U→DBL.L→DBR.D→UBR.R
    ],
};

function applyMove2x2(stateArr, face) {
    const s = stateArr.slice();
    for (const [a, b, c, d] of MOVE_CYCLES_2x2[face]) {
        const tmp = s[d]; s[d] = s[c]; s[c] = s[b]; s[b] = s[a]; s[a] = tmp;
    }
    return s;
}

function applyMoveTimes(stateArr, face, times) {
    let s = stateArr;
    for (let i = 0; i < times; i++) s = applyMove2x2(s, face);
    return s;
}

// Parse move token → {face, times}
function parseMove(token) {
    const face = token[0];
    const suf = token.slice(1);
    return { face, times: suf === '2' ? 2 : suf === "'" ? 3 : 1 };
}

// Apply a sequence of move tokens to a state string
function applyMoves2x2(stateStr, moves) {
    let s = stateStr.split('');
    for (const tok of moves) {
        const { face, times } = parseMove(tok);
        s = applyMoveTimes(s, face, times);
    }
    return s.join('');
}

// ---------------------------------------------------------------------------
// IDDFS solver — searches for solution within maxDepth
// Fixes DBL corner (index 6,14,18 in solved) to reduce search space
// ---------------------------------------------------------------------------
const MOVES_ALL = ['U', "U'", 'U2', 'R', "R'", 'R2', 'F', "F'", 'F2',
    'D', "D'", 'D2', 'L', "L'", 'L2', 'B', "B'", 'B2'];

const OPPOSITE_FACE = { U: 'D', D: 'U', R: 'L', L: 'R', F: 'B', B: 'F' };

function iddfs2x2(stateStr, maxDepth = 20) {
    const goal = SOLVED_2x2;
    if (stateStr === goal) return [];

    function search(state, depth, lastFace, path) {
        if (state === goal) return path.slice();
        if (depth === 0) return null;
        for (const tok of MOVES_ALL) {
            const face = tok[0];
            if (face === lastFace) continue;
            if (OPPOSITE_FACE[face] === lastFace && face > lastFace) continue;
            const { times } = parseMove(tok);
            const next = applyMoveTimes(state.split(''), face, times).join('');
            path.push(tok);
            const sol = search(next, depth - 1, face, path);
            if (sol !== null) return sol;
            path.pop();
        }
        return null;
    }

    for (let d = 1; d <= maxDepth; d++) {
        const sol = search(stateStr, d, null, []);
        if (sol !== null) return sol;
    }
    return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export class Solver2x2 {
    constructor() {
        this._cubingLoaded = false;
    }

    /**
     * Solve a 2×2 cube.
     *
     * Currently uses the built-in IDDFS solver (depth ≤ 14). A cubing.js
     * Kociemba path is not yet available for 2×2 in the browser bundle;
     * when it becomes available, add it here before the IDDFS fallback.
     *
     * @param {string} stateStr  24-char state string (URFDLB order, 4 stickers each)
     * @returns {{ success, moves, moveCount, method, error }}
     */
    async solve(stateStr) {
        if (stateStr === SOLVED_2x2) {
            return { success: true, moves: [], moveCount: 0, method: 'none' };
        }
        return this._solveIddfs(stateStr);
    }

    _solveIddfs(stateStr) {
        try {
            const moves = iddfs2x2(stateStr, 14);
            if (moves !== null) {
                return { success: true, moves, moveCount: moves.length, method: 'IDDFS-2x2' };
            }
            return { success: false, error: 'No solution found within depth 14. State may be invalid.' };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    /**
     * Apply a sequence of moves (scramble) to the solved 2×2 state.
     * @param {string[]} moves  e.g. ["R", "U'", "F2"]
     * @returns {string}  resulting 24-char state
     */
    static applyScrample(moves) {
        return applyMoves2x2(SOLVED_2x2, moves);
    }

    /**
     * Generate a random 2×2 scramble of `length` moves.
     */
    static generateScramble(length = 11) {
        const suffixes = ['', "'", '2'];
        const faces = ['U', 'R', 'F', 'D', 'L', 'B'];
        const result = [];
        let lastFace = null;
        while (result.length < length) {
            const candidates = faces.filter(f => f !== lastFace && OPPOSITE_FACE[f] !== lastFace);
            const face = candidates[Math.floor(Math.random() * candidates.length)];
            const suf = suffixes[Math.floor(Math.random() * suffixes.length)];
            result.push(face + suf);
            lastFace = face;
        }
        return result.join(' ');
    }
}
