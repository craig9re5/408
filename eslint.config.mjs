import { globalIgnores } from "eslint/config";
import nextConfig from "eslint-config-next/core-web-vitals";

const config = [
  ...nextConfig,
  globalIgnores([
    "dist/**",
    ".next/**",
    ".wrangler/**",
    "node_modules/**",
    "tsconfig.tsbuildinfo",
  ]),
];

export default config;
