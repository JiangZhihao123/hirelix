import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Test artifacts and local browser automation output should not block app lint.
    "coverage/**",
    "test-results/**",
    "playwright-report/**",
    "blob-report/**",
    "playwright/.cache/**",
    ".playwright-cli/**",
    ".playwright-mcp/**",
    "output/**",
    "runs/**",
    // Local utility scripts are not part of the web app lint gate.
    "scripts/**",
  ]),
]);

export default eslintConfig;
