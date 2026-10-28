const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    settings: {
      'import/resolver': {
        typescript: { project: ['app/tsconfig.json', 'packages/*/tsconfig.json'] },
      },
    },
  },
  {
    ignores: ['**/node_modules/**', '**/.expo/**', '**/dist/**', 'app/drizzle/**'],
  },
]);
