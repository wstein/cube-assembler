// Just enough of Vitest for the ReScript property tests.
@module("vitest") external describe: (string, unit => unit) => unit = "describe"
@module("vitest") external test: (string, unit => unit, int) => unit = "it"
