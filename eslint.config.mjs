import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Feature modules: code outside features/<name>/ imports only "@/features/<name>", never the
  // files inside it, so each feature can change its insides without breaking the rest of the app.
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["features/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ regex: "^@/features/[^/]+/", message: "Import the feature from \"@/features/<name>\", not a file inside it." }] }],
    },
  },
  // Inside a feature, files of another feature are off limits the same way.
  {
    files: ["features/portfolio/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ regex: "^@/features/(?!portfolio/)[^/]+/", message: "Import another feature from \"@/features/<name>\", not a file inside it." }] }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "backend/.venv/**",
  ]),
]);

export default eslintConfig;
