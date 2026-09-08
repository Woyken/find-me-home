import { defineConfig } from 'oxlint'

export default defineConfig({
  plugins: [],
  ignorePatterns: ['dist/', 'public/parcels/', 'playwright-report/', 'test-results/'],
  rules: {
    // The bookmarklet test executes a generated browser script by design.
    'eslint/no-eval': 'off',
    // Solid assigns this ref after the declaration during rendering.
    'eslint/no-unassigned-vars': 'off',
    'eslint/no-shadow': 'error',
    'eslint/prefer-const': ['error', { destructuring: 'any' }],
    'import/consistent-type-specifier-style': ['error', 'prefer-top-level'],
    'import/first': 'error',
    'import/newline-after-import': 'error',
    'import/no-commonjs': 'error',
    'import/no-duplicates': 'error',
    'typescript/ban-ts-comment': [
      'error',
      { 'ts-expect-error': false, 'ts-ignore': 'allow-with-description' },
    ],
    'typescript/consistent-type-imports': ['error', { prefer: 'type-imports' }],
    'typescript/method-signature-style': ['error', 'property'],
    'typescript/no-duplicate-enum-values': 'error',
    'typescript/no-extra-non-null-assertion': 'error',
    'typescript/no-for-in-array': 'error',
    'typescript/no-inferrable-types': ['error', { ignoreParameters: true }],
    'typescript/no-misused-new': 'error',
    'typescript/no-namespace': 'error',
    'typescript/no-non-null-asserted-optional-chain': 'error',
    'typescript/no-unsafe-function-type': 'error',
    'typescript/no-wrapper-object-types': 'error',
    'typescript/prefer-as-const': 'error',
    'typescript/triple-slash-reference': 'error',
  },
})
