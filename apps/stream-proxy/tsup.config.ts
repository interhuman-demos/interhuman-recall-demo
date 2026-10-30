import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  clean: true,
  // Bundle the workspace package into the output so the runtime image does not
  // need to resolve @repo/shared's raw TypeScript source.
  noExternal: ["@repo/shared"],
});
