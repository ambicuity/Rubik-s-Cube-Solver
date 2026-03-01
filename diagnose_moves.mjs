/**
 * Step-by-step LBL solver debug with timeout per step.
 * Applies each goal after previous step resolves.
 */
import { applyMove, applySequence } from './src/solver.js';
import { applyScramble } from './src/scrambleManager.js';

function iddfs(state, goalFn, moves, depth, path) {
    if (goalFn(state)) return path;
    if (depth === 0) return null;
    for (const move of moves) {
        if (path.length > 0) {
            const lastBase = path[path.length - 1].replace(/[2']/g, '');
            if (lastBase === move.replace(/[2']/g, '')) continue;
        }
        const s = state.slice();
        applyMove(s, move);
        const result = iddfs(s, goalFn, moves, depth - 1, [...path, move]);
        if (result) return result;
    }
    return null;
}

function searchGoal(state, goalFn, goalName, maxDepth) {
    const moves = ['U', "U'", 'U2', 'R', "R'", 'R2', 'F', "F'", 'F2',
        'D', "D'", 'D2', 'L', "L'", 'L2', 'B', "B'", 'B2'];
    if (goalFn(state)) return { found: true, seq: [], already: true };
    const start = Date.now();
    for (let depth = 1; depth <= maxDepth; depth++) {
        const result = iddfs(state.slice(), goalFn, moves, depth, []);
        const elapsed = Date.now() - start;
        if (result) return { found: true, seq: result, elapsed };
        if (elapsed > 8000) return { found: false, timedOut: true, depth, elapsed };
    }
    return { found: false, depth: maxDepth };
}

// Goal functions (same as in solver.js)
const goals = {
    whiteCross: state =>
        state[1] === 'U' && state[46] === 'B' &&
        state[5] === 'U' && state[14] === 'R' &&
        state[7] === 'U' && state[19] === 'F' &&
        state[3] === 'U' && state[37] === 'L',

    whiteCorners: state =>
        state[8] === 'U' && state[9] === 'R' && state[20] === 'F' &&
        state[6] === 'U' && state[18] === 'F' && state[38] === 'L' &&
        state[2] === 'U' && state[11] === 'R' && state[45] === 'B' &&
        state[0] === 'U' && state[36] === 'L' && state[47] === 'B',

    middleLayer: state =>
        state[23] === 'F' && state[12] === 'R' &&
        state[21] === 'F' && state[41] === 'L' &&
        state[48] === 'B' && state[14] === 'R' &&
        state[50] === 'B' && state[39] === 'L',

    yellowCross: state =>
        state[27] === 'D' && state[28] === 'D' &&
        state[30] === 'D' && state[32] === 'D' && state[34] === 'D',

    yellowEdges: state =>
        state[28] === 'D' && state[25] === 'F' &&
        state[30] === 'D' && state[43] === 'L' &&
        state[32] === 'D' && state[16] === 'R' &&
        state[34] === 'D' && state[52] === 'B',
};

const scrambled = applyScramble(["R", "U", "R'", "U'"]).split('');
const state = scrambled.slice();
const steps = [
    ['whiteCross', 8],
    ['whiteCorners', 6],
    ['middleLayer', 8],
    ['yellowCross', 6],
    ['yellowEdges', 6],
];

console.log('Starting state:', state.join(''));
for (const [goalName, maxDepth] of steps) {
    const goalFn = goals[goalName];
    const r = searchGoal(state, goalFn, goalName, maxDepth);
    if (r.found && r.already) {
        console.log(`✅ ${goalName}: already satisfied`);
    } else if (r.found) {
        console.log(`✅ ${goalName}: [${r.seq.join(' ')}] (${r.elapsed}ms)`);
        applySequence(state, r.seq);
    } else if (r.timedOut) {
        console.log(`⏱️  ${goalName}: TIMEOUT at depth ${r.depth} after ${r.elapsed}ms`);
        // Print current state for debugging
        console.log('   Current state:', state.join(''));
        break;
    } else {
        console.log(`❌ ${goalName}: not found within depth ${r.depth}`);
        break;
    }
}
