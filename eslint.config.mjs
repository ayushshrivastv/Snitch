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
    "docs/research/**",
    "src/components/sites/**",
    "src/components/snitch-landing-page.tsx",
    "src/components/floating-navbar-demo.tsx",
    "scripts/prepare-dune-clone.mjs",
    "scripts/download-assets-dune-com-7b520ede-home-2cc974af.mjs",
  ]),
]);

export default eslintConfig;
