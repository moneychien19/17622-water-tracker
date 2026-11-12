import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'server',
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['tests/helpers/global-setup.ts'],
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
