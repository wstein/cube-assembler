import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Use Bun as the runtime for tests
    environment: "node",
    globals: true,
    include: ["test/**/*.test.ts", "test/**/*.spec.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      // The client TS modules with dedicated unit tests
      // (test/cubeAssembly.test.ts, test/notationOutput.test.ts,
      // test/imageProcessing.test.ts)
      include: [
        "src/client/cubeAssembly.ts",
        "src/client/notationOutput.ts",
        "src/client/imageProcessing.ts",
      ],
    },
  },
  resolve: {
    // Allow importing cubing.js ESM directly
    conditions: ["import", "module", "browser", "default"],
  },
});
