import js from "@eslint/js";
import tseslint from "typescript-eslint";
import jsxA11y from "eslint-plugin-jsx-a11y";

export default tseslint.config(
  { ignores: ["**/.next/**", "**/node_modules/**", "**/test-results/**", "apps/web/next-env.d.ts", "packages/db/node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["apps/web/**/*.tsx"],
    ...jsxA11y.flatConfigs.recommended,
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // The app must never print personal data; only the sanctioned error-class log in apps/web/lib/server.ts is allowed.
      "no-console": "error",
    },
  },
  { files: ["**/*.mjs"], languageOptions: { globals: { process: "readonly" } } },
  { files: ["apps/web/lib/server.ts", "packages/adapters/src/index.ts", "scripts/**"], rules: { "no-console": "off" } },
  { files: ["**/test/**", "**/e2e/**"], rules: { "@typescript-eslint/no-explicit-any": "off", "no-console": "off" } },
);
