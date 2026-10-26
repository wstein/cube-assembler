@genType
type fixtureRequest = {
  name?: string,
  // What the default name starts with in place of `cube` (synt for synthetic
  // photos); ignored when a name is given.
  namePrefix?: string,
  gridSize: float,
  colorsURFDLB: JSON.t,
  detectedURFDLB?: JSON.t,
  tags?: array<string>,
  faces: Nullable.t<Dict.t<Dict.t<JSON.t>>>,
  meta?: JSON.t,
}

@genType type photoData = {file: string, base64: string}
@genType type fixtureLayout = {name: string, photos: array<photoData>, meta: JSON.t}

@genType let fixtureLayout: (fixtureRequest, string) => fixtureLayout

@genType type photoRef = {face: string, file: string}
@genType type summary = {photos: array<photoRef>, rows: array<(string, string)>}

@genType let summarizeMeta: JSON.t => summary

// JavaScript's truthiness, and a field of an object value, for reading
// untrusted JSON the way the original TypeScript did.
let truthy: option<JSON.t> => bool
let field: (option<JSON.t>, string) => option<JSON.t>
