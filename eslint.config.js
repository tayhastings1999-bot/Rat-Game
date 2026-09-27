import globals from 'globals';

export default [
  { ignores: ['dist/**', 'project/**', 'node_modules/**'] },
  {
    files: ['src/**/*.js', 'scripts/**/*.mjs'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.browser, ...globals.node, __scurry: 'readonly' } },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
    },
  },
];
