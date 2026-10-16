import { globalIgnores } from "eslint/config";
import nextConfig from "eslint-config-next/core-web-vitals";

const config = [
  ...nextConfig,
  globalIgnores([
    "dist/**",
    ".next/**",
    ".wrangler/**",
    "worker-configuration.d.ts",
    "node_modules/**",
    "tsconfig.tsbuildinfo",
    // Scratch areas. `work/` holds throwaway copies of the tree (including
    // their own dist/), so linting them reports errors against built output
    // instead of this project's source.
    "work/**",
    "outputs/**",
  ]),
];

export default config;
