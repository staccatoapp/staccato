// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // dist/ is the export output; .expo/ holds generated caches including the
    // typed-routes router.d.ts, which the dev server regenerates and must not
    // gate lint.
    ignores: ['dist/*', '.expo/*'],
  },
  {
    files: ['jest-setup.js', '**/*.test.ts', '**/*.test.tsx'],
    languageOptions: {
      globals: { jest: 'readonly', describe: 'readonly', it: 'readonly', expect: 'readonly', beforeEach: 'readonly', afterEach: 'readonly' },
    },
  },
  {
    // jest-setup runs as CommonJS before any transform; require() is the point.
    files: ['jest-setup.js'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
]);
