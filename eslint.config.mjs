// Flat config: TypeScript everywhere, Next.js + React hooks rules for apps/web.
import js from "@eslint/js";
import globals from "globals";
import nextVitals from "eslint-config-next/core-web-vitals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/.next/**", "**/dist/**", "packages/db/migrations/**", "**/next-env.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    files: ["scripts/**/*.{mjs,ts}", "*.config.{mjs,ts}", "**/*.config.{mjs,ts}"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["apps/web/public/sw.js"],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    files: ["**/*.test.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  ...nextVitals.map((c) => ({ ...c, files: ["apps/web/**/*.{ts,tsx}", "packages/ui/**/*.{ts,tsx}"] })),
  {
    files: ["apps/web/**/*.{ts,tsx}", "packages/ui/**/*.{ts,tsx}"],
    settings: { next: { rootDir: "apps/web" } },
    rules: {
      "@next/next/no-img-element": "off",
      // Apostrophes and quotes in JSX text are valid and safe; escaping them only hurts readability.
      "react/no-unescaped-entities": "off",
    },
  },
);
