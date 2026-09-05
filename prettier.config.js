//  @ts-check

/** @type {import('prettier').Config} */
const config = {
  semi: false,
  singleQuote: true,
  trailingComma: "all",
  overrides: [
    {
      // Prototype code that gets flattened into javascript: URLs must not rely on ASI.
      files: ["public/prototype/**"],
      options: { semi: true },
    },
  ],
};

export default config;
