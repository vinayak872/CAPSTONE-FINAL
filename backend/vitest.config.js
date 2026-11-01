import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Disable parallel execution of test files because tests modify the shared release_config.json on disk
    fileParallelism: false,
    environment: 'node'
  }
});
