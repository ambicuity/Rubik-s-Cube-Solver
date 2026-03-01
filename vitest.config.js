import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'jsdom',
        globals: true,
        include: ['tests/**/*.test.js'],
        pool: 'forks',                  // fork-based isolation: worker terminates cleanly post-test
        testTimeout: 30000,             // 30s per test (IDDFS sub-solvers can take up to ~5s)
        hookTimeout: 5000,
        coverage: {
            reporter: ['text', 'json-summary'],
            include: ['src/**/*.js'],
            exclude: ['src/vendor/**']
        }
    }
});
