import { createRequire } from 'node:module';

const require = createRequire(new URL('./backend/package.json', import.meta.url));
const js = require('@eslint/js');
const globals = require('globals');

export default [
  {
    ignores: ['**/node_modules/**', 'venv/**', 'evidence/**']
  },
  js.configs.recommended,
  {
    files: [
      'backend/src/**/*.js',
      'backend/tests/**/*.js',
      'services/order-service/src/**/*.js',
      'services/order-service/tests/**/*.js',
      'experiments/**/*.js',
      'test_e2e.js'
    ],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.node
      }
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-undef': 'error'
    }
  },
  {
    files: ['frontend/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'script',
      globals: {
        ...globals.browser
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-undef': 'error'
    }
  }
];
