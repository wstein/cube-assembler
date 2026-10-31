@genType
type model = Color | Picture

@genType
type pose = Canonical | Framed

@genType
type entry = {
  id: int,
  n: int,
  model: model,
  pose: pose,
  length: int,
  offset: bigint,
  count: bigint,
}

// The 54 entries of the initial registry in ID order, with their token
// lengths and offsets computed by the allocation rule.
@genType let entries: array<entry>
@genType let entryById: int => option<entry>
// The number of states of a type.
@genType let stateCount: (int, model, pose) => bigint
