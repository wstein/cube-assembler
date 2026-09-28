// Reviewing saved cube definitions. A cube only sets how much of each
// sticker is sampled (stickerCore), so cubes of one size whose sticker areas
// match are duplicates: they can be merged into one, or deleted in favour of
// the built-in Generic cube they copy.
open ProfileSettings

let fail = message => JsError.throwWithMessage(message)
let core = (cube: cubeSetting) => cube.sampling.stickerCore

let unique = ids => {
  let seen = []
  ids->Array.forEach(id =>
    if !(seen->Array.includes(id)) {
      seen->Array.push(id)
    }
  )
  seen
}

// Groups per size in which every cube's sticker area is within `tolerance`
// of every other one (complete linkage). Built-in cubes take part, but a
// group needs at least one saved cube to be worth reviewing.
let duplicateCubeGroups = (settings: profileSettings, tolerance) =>
  cubeSizes->Array.flatMap(size => {
    let groups =
      allCubes(settings)->Array.filter(cube => cube.size == size)->Array.map(cube => [cube])
    let merging = ref(true)
    while merging.contents {
      let best = ref(None)
      for i in 0 to Array.length(groups) - 1 {
        for j in i + 1 to Array.length(groups) - 1 {
          let worst = ref(0.0)
          groups
          ->Array.getUnsafe(i)
          ->Array.forEach(a =>
            groups
            ->Array.getUnsafe(j)
            ->Array.forEach(b => worst := Math.max(worst.contents, Math.abs(core(a) -. core(b))))
          )
          let better = switch best.contents {
          | Some((bestWorst, _, _)) => worst.contents < bestWorst
          | None => true
          }
          if worst.contents <= tolerance +. 1e-9 && better {
            best := Some((worst.contents, i, j))
          }
        }
      }
      switch best.contents {
      | None => merging := false
      | Some((_, i, j)) =>
        groups->Array.getUnsafe(i)->Array.pushMany(groups->Array.getUnsafe(j))
        groups->Array.splice(~start=j, ~remove=1, ~insert=[])
      }
    }
    groups->Array.filter(group =>
      Array.length(group) > 1 && group->Array.some(cube => !isBuiltinCube(cube.id))
    )
  })

// The saved cubes `ids`, all of one size and none built in.
let savedCubes = (settings: profileSettings, ids) => {
  let ids = unique(ids)
  if ids->Array.some(isBuiltinCube) {
    fail("Cannot change a built-in cube")
  }
  let cubes = ids->Array.map(id => settings.cubes->Array.find(cube => cube.id == id))
  if cubes->Array.some(Option.isNone) {
    fail("Unknown cube")
  }
  let cubes = cubes->Array.filterMap(cube => cube)
  if unique(cubes->Array.map(cube => cube.size))->Array.length > 1 {
    fail("Cubes of different sizes")
  }
  cubes
}

// `settings` with `cubes`, and `keepId` as the size's active cube where one
// of the cubes `gone` was active.
let withoutCubes = (settings: profileSettings, gone, size, keepId, cubes) => {
  let activeCubeBySize = Dict.copy(settings.activeCubeBySize)
  switch settings.activeCubeBySize->Dict.get(Int.toString(size)) {
  | Some(active) if gone(active) => activeCubeBySize->Dict.set(Int.toString(size), keepId)
  | _ => ()
  }
  {...settings, cubes, activeCubeBySize}
}

type merged = {settings: profileSettings, cube: cubeSetting}

// Replaces the saved cubes `ids` with one cube named `name` whose sticker
// area is their mean, placed where the first of them was.
let mergeCubes = (settings: profileSettings, ids, name) => {
  let members = savedCubes(settings, ids)
  if Array.length(members) < 2 {
    fail("Pick at least two cubes")
  }
  let trimmed = name->String.trim->String.slice(~start=0, ~end=60)
  if trimmed == "" {
    fail("Cube name required")
  }
  let id = freshId("cube", id => allCubes(settings)->Array.some(cube => cube.id == id))
  let mean =
    members->Array.reduce(0.0, (sum, cube) => sum +. core(cube)) /.
      Int.toFloat(Array.length(members))
  let first = members->Array.getUnsafe(0)
  let cube = {
    id,
    name: trimmed,
    size: first.size,
    sampling: {stickerCore: Math.round(mean *. 1000.0) /. 1000.0},
  }
  let gone = id => members->Array.some(member => member.id == id)
  let cubes = settings.cubes->Array.filter(saved => !gone(saved.id))
  cubes->Array.splice(
    ~start=settings.cubes->Array.findIndex(saved => gone(saved.id)),
    ~remove=0,
    ~insert=[cube],
  )
  {settings: withoutCubes(settings, gone, cube.size, id, cubes), cube}
}

// Deletes the saved cubes `ids` in favour of `keepId` (a built-in Generic
// cube or another saved cube of the same size).
let replaceCubes = (settings: profileSettings, ids, keepId) => {
  let members = savedCubes(settings, ids)
  switch allCubes(settings)->Array.find(cube => cube.id == keepId) {
  | Some(keep) if Array.length(members) > 0 =>
    if members->Array.some(cube => cube.id == keepId) {
      fail("Cannot delete the cube to keep")
    }
    if members->Array.some(cube => cube.size != keep.size) {
      fail("Cubes of different sizes")
    }
    let gone = id => members->Array.some(member => member.id == id)
    withoutCubes(
      settings,
      gone,
      keep.size,
      keepId,
      settings.cubes->Array.filter(cube => !gone(cube.id)),
    )
  | _ => fail("Unknown cube")
  }
}

// Deletes the saved cubes `ids`; a size whose active cube goes falls back
// to its built-in Generic cube.
let deleteCubes = (settings: profileSettings, ids) => {
  let ids = unique(ids)
  if ids->Array.some(isBuiltinCube) {
    fail("Cannot delete a built-in cube")
  }
  if ids->Array.some(id => !(settings.cubes->Array.some(cube => cube.id == id))) {
    fail("Unknown cube")
  }
  ids->Array.reduce(settings, deleteCube)
}

// What deleting `ids` changes, one line per size that loses its active cube.
let cubeDeletionEffects = (settings: profileSettings, ids) =>
  cubeSizes
  ->Array.filter(size =>
    ids->Array.includes(settings.activeCubeBySize->Dict.get(Int.toString(size))->Option.getOr(""))
  )
  ->Array.map(size => {
    let n = Int.toString(size)
    `${n}×${n} then uses ${builtinCube(size).name}`
  })

// Saved cubes whose sticker area equals their size's built-in Generic cube.
let cubesSameAsGeneric = (settings: profileSettings) =>
  settings.cubes
  ->Array.filter(cube => core(cube) == core(builtinCube(cube.size)))
  ->Array.map(cube => cube.id)

// Saved cubes that are not the active cube of their size.
let unusedCubes = (settings: profileSettings) =>
  settings.cubes
  ->Array.filter(cube =>
    settings.activeCubeBySize->Dict.get(Int.toString(cube.size)) != Some(cube.id)
  )
  ->Array.map(cube => cube.id)

type square = {x: float, y: float, w: float, h: float}

// The sampled square of every cell, as fractions of the face: `core` of
// the cell, centered; outer rows and columns `outer` times as wide.
let sampledSquares = (size, core, outer) => {
  let edges = StickerGeometry.cellEdges(size, outer)
  let edge = i => edges->Array.getUnsafe(i)
  let squares = []
  for row in 0 to size - 1 {
    for col in 0 to size - 1 {
      let w = (edge(col + 1) -. edge(col)) *. core
      let h = (edge(row + 1) -. edge(row)) *. core
      squares->Array.push({
        x: (edge(col) +. edge(col + 1)) /. 2.0 -. w /. 2.0,
        y: (edge(row) +. edge(row + 1)) /. 2.0 -. h /. 2.0,
        w,
        h,
      })
    }
  }
  squares
}
