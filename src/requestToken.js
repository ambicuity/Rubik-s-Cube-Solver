/**
 * requestToken.js — Frontend HMAC-SHA256 token generator
 *
 * Produces a time-windowed token that the Cloudflare Worker verifies.
 * The HMAC_SECRET must match the Worker's HMAC_SECRET env variable.
 *
 * SECURITY: This module must only be loaded in a trusted context.
 * The secret itself is never sent to any server — only the derived token is.
 *
 * Usage:
 *   import { getRequestToken } from './requestToken.js';
 *   const token = await getRequestToken('your-hmac-secret');
 *   // Pass token in X-Request-Token header to proxy
 *
 * In production: load the secret from a build-time env via your deploy script,
 * OR store it in Cloudflare Pages environment variables and inject at build time.
 * DO NOT hardcode the secret in source control.
 */

const WINDOW_MINUTES = 5;

/**
 * Generate a time-windowed HMAC-SHA256 token.
 * @param {string} secret - The shared HMAC secret (hex string)
 * @returns {Promise<string>} - Lowercase hex token
 */
export async function getRequestToken(secret) {
    const window = Math.floor(Date.now() / (WINDOW_MINUTES * 60_000));
    const message = `gemini:${window}`;

    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        enc.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', key, enc.encode(message));
    return [...new Uint8Array(signature)]
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Attach a request token to a fetch call's headers.
 * Drop-in helper for geminiClient.js.
 *
 * @param {string} secret
 * @param {HeadersInit} [existingHeaders]
 * @returns {Promise<Headers>}
 */
export async function signedHeaders(secret, existingHeaders = {}) {
    const headers = new Headers(existingHeaders);
    if (secret) {
        headers.set('X-Request-Token', await getRequestToken(secret));
    }
    return headers;
}
