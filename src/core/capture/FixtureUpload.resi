@genType
type facePlan = {
  face: string,
  photo: string,
  colors: array<array<string>>,
  timestamp: float,
  backgroundColor?: JSON.t,
  previewColorProfile?: JSON.t,
}

@genType @tag("ok")
type plan =
  | @as(true) Ready({faces: array<facePlan>})
  | @as(false) Rejected({message: string})

@genType let planFixtureUpload: (JSON.t, string, array<string>, float) => plan
