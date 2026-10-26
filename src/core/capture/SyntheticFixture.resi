@genType
type input = {
  colors: string,
  size: int,
  preset: string,
  seed: int,
  invalid?: string,
  version: string,
  commit: string,
  photos: Dict.t<string>,
  now: string,
}

@genType let syntheticRequest: input => FixtureZip.fixtureRequest
