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

@genType
type fingerprintInput = {
  preset: string,
  seed: int,
  face: string,
  size: int,
  options: JSON.t,
  version: string,
}

// The fingerprint JSON a rendered photo carries.
@genType let fingerprintJson: fingerprintInput => string
