/**
 * optimalSolver.js — Kociemba two-phase optimal solver via cubing.js
 *
 * Uses cubing.js `experimentalSolve3x3x3IgnoringCenters` which runs the
 * two-phase Kociemba algorithm (God's Number ≤ 20). Wraps it behind the
 * same interface as solver.js so ui.js stays unchanged.
 *
 * Usage (in ui.js):
 *   import { optimalSolver } from './optimalSolver.js';
 *   const result = await optimalSolver.solve(stateString);
 *
 * The solver runs asynchronously (WASM-backed), so it must be awaited.
 * Falls back to the LBL solver if cubing.js fails to load.
 */

import { cubeSolver as lblFallback } from './solver.js';

let _solveFunc = null;

/**
 * Lazily initialise the cubing.js solver.
 * Called once; subsequent calls use the cached function.
 */
async function _load() {
    if (_solveFunc) return _solveFunc;
    try {
        const { experimentalSolve3x3x3IgnoringCenters } =
            await import('https://cdn.cubing.net/js/cubing/twisty');
        _solveFunc = experimentalSolve3x3x3IgnoringCenters;
        console.log('[OptimalSolver] cubing.js solver loaded');
    } catch (e) {
        console.warn('[OptimalSolver] cubing.js unavailable, using LBL fallback:', e.message);
        _solveFunc = null;
    }
    return _solveFunc;
}

/**
 * Convert a 54-char URFDLB state string into the face-colour string format
 * expected by cubing.js (same URFDLB order — no conversion needed).
 * cubing.js `experimentalSolve3x3x3IgnoringCenters` accepts the standard
 * 54-char string directly.
 */
class OptimalSolver {
    constructor() {
        this.solution = null;
        // Eagerly start loading the solver WASM in the background
        _load();
    }

    /**
     * Solve asynchronously.
     * Returns { success, moves, moveCount, method, solveMs } or { success: false, error }.
     * `solveMs` is the wall-clock time spent in the core solve (excludes WASM load time).
     */
    async solve(cubeStateString) {
        if (!cubeStateString || cubeStateString.length !== 54 || cubeStateString.includes('?')) {
            return { success: false, error: 'Invalid or incomplete cube state string.' };
        }

        const fn = await _load();

        if (fn) {
            try {
                const t0 = performance.now();
                const alg = await fn(cubeStateString);
                const solveMs = Math.round(performance.now() - t0);
                const movesStr = alg.toString().trim();

                if (!movesStr) {
                    this.solution = [];
                    return { success: true, moves: [], moveCount: 0, method: 'kociemba', solveMs };
                }

                const moves = movesStr.split(/\s+/);
                this.solution = moves;
                return { success: true, moves, moveCount: moves.length, method: 'kociemba', solveMs };
            } catch (err) {
                console.warn('[OptimalSolver] cubing.js solve failed, falling back to LBL:', err.message);
            }
        }

        // Synchronous LBL fallback
        const t0 = performance.now();
        const fallback = lblFallback.solve(cubeStateString);
        const solveMs = Math.round(performance.now() - t0);
        this.solution = fallback.moves || [];
        return { ...fallback, method: 'lbl', solveMs };
    }

    getSolution() { return this.solution; }

    formatMoves(moves) { return moves.join(' '); }

    groupMovesByPhase(moves) {
        return lblFallback.groupMovesByPhase(moves);
    }

    static getMoveNotationGuide() {
        return lblFallback.constructor.getMoveNotationGuide
            ? lblFallback.constructor.getMoveNotationGuide()
            : {};
    }
}

export const optimalSolver = new OptimalSolver();
