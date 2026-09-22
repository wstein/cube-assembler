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
      // ReScript compiled output, plus the client TS modules that now have
      // dedicated unit tests (test/cubeAssembly.test.ts, test/notationOutput.test.ts)
      include: ["lib/**/*.js", "src/client/cubeAssembly.ts", "src/client/notationOutput.ts"],
    },
    // Resolve ReScript compiled output from lib/
    alias: {
      "~cube-assembler": new URL("./lib/js/src", import.meta.url).pathname,
    },
  },
  resolve: {
    // Allow importing cubing.js ESM directly
    conditions: ["import", "module", "browser", "default"],
  },
});
