import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'jsdom',
        globals: true,
        include: ['tests/**/*.test.js'],
        coverage: {
            reporter: ['text', 'json-summary'],
            include: ['src/**/*.js'],
            exclude: ['src/vendor/**']
        }
    }
});
