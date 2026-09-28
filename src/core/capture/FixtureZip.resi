@genType
type fixtureRequest = {
  name?: string,
  gridSize: float,
  colorsURFDLB: JSON.t,
  detectedURFDLB?: JSON.t,
  faces: Nullable.t<Dict.t<Dict.t<JSON.t>>>,
  meta?: JSON.t,
}

@genType type photoData = {file: string, base64: string}
@genType type fixtureLayout = {name: string, photos: array<photoData>, meta: JSON.t}

@genType let fixtureLayout: (fixtureRequest, string) => fixtureLayout

@genType type photoRef = {face: string, file: string}
@genType type summary = {photos: array<photoRef>, rows: array<(string, string)>}

@genType let summarizeMeta: JSON.t => summary
