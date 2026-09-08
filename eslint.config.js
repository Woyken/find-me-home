//  @ts-check

import { tanstackConfig } from "@tanstack/eslint-config";

export default [
  ...tanstackConfig,
  {
    rules: {
      "import/no-cycle": "off",
      "import/order": "off",
      "sort-imports": "off",
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/require-await": "off",
      "pnpm/json-enforce-catalog": "off",
    },
  },
  {
    files: ['playwright.config.ts', 'e2e/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.e2e.json',
      },
    },
  },
  {
    ignores: [
      "eslint.config.js",
      "prettier.config.js",
    ],
  },
];
