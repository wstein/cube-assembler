import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [
      'test/**/*.test.ts',
      'test/**/*.spec.ts',
      // Property tests written in ReScript (test/properties).
      'test/**/*_test.res.mjs',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // The client TS modules with dedicated unit tests
      // (test/cube/cubeAssembly.test.ts, test/cube/notation/notationOutput.test.ts,
      // test/imageProcessing.test.ts)
      include: [
        'src/cube/cubeAssembly.ts',
        'src/cube/notation/NotationOutput.res.mjs',
        'src/client/imageProcessing.ts',
      ],
    },
  },
})
