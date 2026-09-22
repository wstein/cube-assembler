/* PermGen.res
 * Heap's Algorithm for generating all 6! = 720 permutations of 6 face grids.
 * Used by CubeAssembler to enumerate all possible face-to-position assignments.
 */

/** Generate all permutations of an array using Heap's algorithm.
    Returns array of arrays, each being one permutation.
    For n=6: 720 permutations. */
let generatePermutations = (arr: array<'a>): array<array<'a>> => {
  let n = Array.length(arr)
  let results = []
  let current = Array.copy(arr)
  let c = Array.make(~length=n, 0)

  Array.push(results, Array.copy(current))

  let i = ref(0)
  while i.contents < n {
    if Belt.Array.getExn(c, i.contents) < i.contents {
      let swapA = if mod(i.contents, 2) == 0 { 0 } else { Belt.Array.getExn(c, i.contents) }
      let swapB = i.contents
      let temp = Belt.Array.getExn(current, swapA)
      current[swapA] = Belt.Array.getExn(current, swapB)
      current[swapB] = temp
      Array.push(results, Array.copy(current))
      c[i.contents] = Belt.Array.getExn(c, i.contents) + 1
      i := 0
    } else {
      c[i.contents] = 0
      i := i.contents + 1
    }
  }

  results
}

/** Generate exactly 6! = 720 permutations of a 6-element array. */
let generate6Permutations = (arr: array<'a>): array<array<'a>> => {
  if Array.length(arr) != 6 {
    [arr] // fallback: single "permutation" of wrong-size input
  } else {
    generatePermutations(arr)
  }
}
