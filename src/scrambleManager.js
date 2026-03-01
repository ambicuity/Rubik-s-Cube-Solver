/**
 * scrambleManager.js — Scramble parser, applier, and random generator
 *
 * Supports standard WCA scramble notation:
 *   Face moves: U D R L F B
 *   Suffixes: ' (prime/CCW)  2 (double)  none (CW)
 *   Examples: "R U2 F' L D2 B"
 *
 * Usage:
 *   import { parseScramble, applyScramble, generateScramble } from './scrambleManager.js';
 *
 *   const moves  = parseScramble("R U2 F' L");  // → ['R','U2','F\'','L']
 *   const state  = applyScramble(moves);          // → 54-char state string
 *   const random = generateScramble(20);           // → "R U2 F' L2 ..."
 */

import { applyMove } from './solver.js';


// Solved state: each face has 9 identical stickers
const SOLVED_STATE = 'UUUUUUUUU' + 'RRRRRRRRR' + 'FFFFFFFFF' +
    'DDDDDDDDD' + 'LLLLLLLLL' + 'BBBBBBBBB';

// Valid face letters
const FACES = ['U', 'D', 'R', 'L', 'F', 'B'];

// Opposite faces (can't follow each other in a scramble)
const OPPOSITE = { U: 'D', D: 'U', R: 'L', L: 'R', F: 'B', B: 'F' };

/**
 * Parse a WCA scramble string into an array of move tokens.
 * Whitespace-separated. Validates each token format.
 * @param {string} scrambleStr
 * @returns {string[]}
 */
export function parseScramble(scrambleStr) {
    if (!scrambleStr || typeof scrambleStr !== 'string') return [];
    const tokens = scrambleStr.trim().toUpperCase().split(/\s+/).filter(Boolean);
    const valid = [];
    for (const tok of tokens) {
        const face = tok[0];
        const suffix = tok.slice(1);
        if (!FACES.includes(face)) {
            throw new Error(`Invalid move face: "${tok}"`);
        }
        if (suffix !== '' && suffix !== "'" && suffix !== '2') {
            throw new Error(`Invalid move suffix: "${tok}"`);
        }
        valid.push(tok);
    }
    return valid;
}

/**
 * Apply a sequence of moves to the solved state and return the resulting
 * 54-character cube state string.
 * @param {string[]} moves — array of move tokens (e.g. ["R", "U2", "F'"])
 * @returns {string} 54-char state string
 */
export function applyScramble(moves) {
    let state = SOLVED_STATE.split('');
    for (const move of moves) {
        applyMove(state, move);
    }
    return state.join('');
}

/**
 * Generate a random WCA-style scramble of `length` moves.
 * Guarantees no two consecutive moves on the same face or opposite faces.
 * @param {number} length — defaults to 20
 * @returns {string} space-separated scramble string
 */
export function generateScramble(length = 20) {
    const suffixes = ['', "'", '2'];
    const moves = [];
    let lastFace = null;
    let prevFace = null;

    while (moves.length < length) {
        // Exclude last face and (if last two were opposite pair) the opposite of last face
        const excluded = new Set([lastFace]);
        if (prevFace && OPPOSITE[prevFace] === lastFace) excluded.add(prevFace);

        const candidates = FACES.filter(f => !excluded.has(f));
        const face = candidates[Math.floor(Math.random() * candidates.length)];
        const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
        moves.push(face + suffix);
        prevFace = lastFace;
        lastFace = face;
    }

    return moves.join(' ');
}

/**
 * Convert a 54-char state string back to a cubeState-compatible faces object.
 * Face order in string: U(0-8) R(9-17) F(18-26) D(27-35) L(36-44) B(45-53)
 *
 * @param {string} stateStr
 * @param {number} [size=3]  Cube size (3 for 3x3, 2 for 2x2 — unused currently but kept for API parity)
 * @param {Object} [colorMap]  Optional map of { U:'white', R:'red', ... } derived from
 *                             center stickers. Falls back to the standard WCA scheme.
 * @returns {{ U, R, F, D, L, B }} — each value is array of 9 { color } objects
 */
export function stateStringToFaces(stateStr, size = 3, colorMap = null) {
    // Default WCA standard color scheme
    const defaultLetterToColor = {
        U: 'white', R: 'red', F: 'green',
        D: 'yellow', L: 'orange', B: 'blue'
    };

    // If a dynamic colorMap is supplied (face→color), invert it to letter→color
    let letterToColor = defaultLetterToColor;
    if (colorMap && typeof colorMap === 'object') {
        const inverted = {};
        for (const [face, color] of Object.entries(colorMap)) {
            inverted[face] = color;
        }
        // Only override if we got a full 6-face map
        if (Object.keys(inverted).length === 6) {
            letterToColor = inverted;
        }
    }

    const faceKeys = ['U', 'R', 'F', 'D', 'L', 'B'];
    const result = {};

    faceKeys.forEach((face, fi) => {
        result[face] = Array.from({ length: 9 }, (_, si) => ({
            color: letterToColor[stateStr[fi * 9 + si]] || 'unknown'
        }));
    });

    return result;
}
