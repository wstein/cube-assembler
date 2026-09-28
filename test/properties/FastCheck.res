// Just enough of fast-check for the ReScript property tests.
type arbitrary<'a>
type property

type range = {min: int, max: int}
type lengths = {minLength: int, maxLength: int}
type parameters = {numRuns: int}

@module("fast-check") external integer: range => arbitrary<int> = "integer"
@module("fast-check") external constant: 'a => arbitrary<'a> = "constant"
@module("fast-check") external boolean: unit => arbitrary<bool> = "boolean"
@module("fast-check") @variadic
external constantFrom: array<'a> => arbitrary<'a> = "constantFrom"
@module("fast-check") external array: (arbitrary<'a>, lengths) => arbitrary<array<'a>> = "array"
@module("fast-check")
external tuple2: (arbitrary<'a>, arbitrary<'b>) => arbitrary<('a, 'b)> = "tuple"
@module("fast-check")
external tuple3: (arbitrary<'a>, arbitrary<'b>, arbitrary<'c>) => arbitrary<('a, 'b, 'c)> = "tuple"
@module("fast-check")
external tuple4: (
  arbitrary<'a>,
  arbitrary<'b>,
  arbitrary<'c>,
  arbitrary<'d>,
) => arbitrary<('a, 'b, 'c, 'd)> = "tuple"
@send external chain: (arbitrary<'a>, 'a => arbitrary<'b>) => arbitrary<'b> = "chain"
@send external map: (arbitrary<'a>, 'a => 'b) => arbitrary<'b> = "map"

@module("fast-check") external property: (arbitrary<'a>, 'a => bool) => property = "property"
@module("fast-check") external assert_: (property, parameters) => unit = "assert"

// Checks `predicate` on `runs` generated values; fast-check shrinks a
// failure to a small counterexample and throws it.
let check = (arbitrary, predicate, ~runs=100) =>
  assert_(property(arbitrary, predicate), {numRuns: runs})
