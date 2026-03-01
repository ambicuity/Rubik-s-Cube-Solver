/**
 * geminiClient.js - Google Gemini API client
 * Communicates with Gemini API through secure proxy for explanations
 */

import { signedHeaders } from './requestToken.js';

export class GeminiClient {
    constructor() {
        // Live Cloudflare Worker proxy endpoint
        this.proxyEndpoint = 'https://rubiks-cube-gemini-proxy.riteshrana36.workers.dev';
        this.useProxy = true;
        this.hmacSecret = null;   // Set via setHmacSecret() — never hardcode
        /** Set true if your proxy supports streaming (SSE). */
        this.supportsStreaming = false;
    }

    /**
     * Configure proxy endpoint.
     */
    setProxyEndpoint(endpoint) {
        this.proxyEndpoint = endpoint;
        this.useProxy = true;
    }

    /**
     * Set the HMAC secret used to generate X-Request-Token headers.
     * Inject this at boot from an environment variable — never hardcode.
     * Example: geminiClient.setHmacSecret(import.meta.env.VITE_HMAC_SECRET);
     */
    setHmacSecret(secret) {
        this.hmacSecret = secret;
    }

    /**
     * Generate explanation for solving steps
     */
    async explainSolution(moves, groupedMoves) {
        if (!this.useProxy) {
            // Return mock explanation if proxy not configured
            return this.generateMockExplanation(moves, groupedMoves);
        }

        try {
            const prompt = this.buildPrompt(moves, groupedMoves);
            const headers = await signedHeaders(this.hmacSecret,
                { 'Content-Type': 'application/json' });

            const response = await fetch(this.proxyEndpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify({ prompt, maxTokens: 1000 })
            });

            if (!response.ok) {
                throw new Error(`Proxy error: ${response.status}`);
            }

            const data = await response.json();
            return this.formatExplanation(data.explanation || data.text);

        } catch (error) {
            console.error('Gemini API error:', error);
            // Fallback to mock explanation
            return this.generateMockExplanation(moves, groupedMoves);
        }
    }

    /**
     * Streaming variant — progressively calls onChunk(text) as tokens arrive.
     * Falls back to batch explainSolution if streaming fails.
     *
     * @param {string[]} moves
     * @param {object[]} groupedMoves
     * @param {Function} onChunk   - Called with each text chunk as it arrives
     * @param {Function} onComplete - Called when stream is done
     */
    async explainSolutionStreaming(moves, groupedMoves, onChunk, onComplete) {
        if (!this.useProxy) {
            const mock = this.generateMockExplanation(moves, groupedMoves);
            onChunk(mock);
            onComplete();
            return;
        }

        try {
            const prompt = this.buildPrompt(moves, groupedMoves);
            const headers = await signedHeaders(this.hmacSecret,
                { 'Content-Type': 'application/json' });
            const response = await fetch(this.proxyEndpoint + '/stream', {
                method: 'POST',
                headers,
                body: JSON.stringify({ prompt, maxTokens: 1000, stream: true })
            });

            if (!response.ok || !response.body) {
                throw new Error(`Streaming not supported by proxy (${response.status})`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';

            // eslint-disable-next-line no-constant-condition
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop(); // keep incomplete last line

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed === 'data: [DONE]') continue;
                    if (trimmed.startsWith('data: ')) {
                        try {
                            const json = JSON.parse(trimmed.slice(6));
                            const token = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
                            if (token) onChunk(token);
                        } catch { /* skip malformed SSE line */ }
                    }
                }
            }

            onComplete();
        } catch (err) {
            console.warn('[GeminiClient] Streaming failed, falling back to batch:', err.message);
            const explanation = await this.explainSolution(moves, groupedMoves);
            onChunk(explanation);
            onComplete();
        }
    }

    /**
     * Build prompt for Gemini
     */
    buildPrompt(moves, groupedMoves) {
        let prompt = `You are a Rubik's Cube expert. Explain the following solution in simple, beginner-friendly terms.\n\n`;

        prompt += `Solution moves: ${moves.join(' ')}\n\n`;

        prompt += `The moves are grouped into phases:\n`;
        groupedMoves.forEach(group => {
            prompt += `- ${group.phase}: ${group.moves.join(' ')} - ${group.description}\n`;
        });

        prompt += `\nPlease explain:\n`;
        prompt += `1. What each phase accomplishes\n`;
        prompt += `2. Why these specific moves are used\n`;
        prompt += `3. Simple tips for executing these moves\n\n`;
        prompt += `Use clear headings for Cross, F2L, OLL, and PLL phases. Keep explanations concise and encouraging.`;

        return prompt;
    }

    /**
     * Format explanation for display
     */
    formatExplanation(text) {
        // Basic formatting
        return text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br>');
    }

    /**
     * Generate mock explanation when proxy is not available
     */
    generateMockExplanation(moves, groupedMoves) {
        let html = '<div class="explanation">';

        html += '<h4>🎯 Solution Overview</h4>';
        html += `<p>Your cube can be solved in <strong>${moves.length} moves</strong> using the CFOP method (Cross, F2L, OLL, PLL).</p>`;

        groupedMoves.forEach(group => {
            html += `<h4>📍 ${group.phase}</h4>`;
            html += `<p><strong>Moves:</strong> <code>${group.moves.join(' ')}</code></p>`;
            html += `<p>${this.getPhaseExplanation(group.phase)}</p>`;
        });

        html += '<h4>💡 Tips</h4>';
        html += '<ul>';
        html += '<li>Execute moves smoothly and deliberately</li>';
        html += '<li>Use finger tricks for faster solving</li>';
        html += '<li>Practice each phase separately</li>';
        html += '<li>Keep the cube oriented correctly throughout</li>';
        html += '</ul>';

        html += '<p class="note"><em>Note: To get AI-powered explanations from Google Gemini, configure the proxy endpoint in geminiClient.js</em></p>';

        html += '</div>';

        return html;
    }

    /**
     * Get explanation for each phase
     */
    getPhaseExplanation(phase) {
        const explanations = {
            'Cross': 'The cross phase solves the edges of the first layer, creating a plus sign pattern. This establishes the foundation for the rest of the solve.',
            'F2L': 'First Two Layers simultaneously solves the corners of the first layer and edges of the second layer. This is done by pairing corner and edge pieces together.',
            'OLL': 'Orient Last Layer makes all the pieces on the top face the same color, though they may not be in the correct positions yet.',
            'PLL': 'Permute Last Layer moves the correctly oriented pieces into their final positions, completing the cube.'
        };

        return explanations[phase] || 'This phase moves the cube closer to the solved state.';
    }
}

export const geminiClient = new GeminiClient();
