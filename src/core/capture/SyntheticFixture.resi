@genType
type input = {
  colors: string,
  size: int,
  preset: string,
  seed: int,
  seeds: Dict.t<int>,
  photoSize: int,
  options: JSON.t,
  invalid?: string,
  version: string,
  commit: string,
  photos: Dict.t<string>,
  now: string,
}

@genType let syntheticRequest: input => FixtureZip.fixtureRequest
