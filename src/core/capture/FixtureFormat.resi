@genType
type fixtureColors = {
  colors: Dict.t<array<array<string>>>,
  detected: Null.t<Dict.t<array<array<string>>>>,
}

@genType let readFixtureColors: 'a => Null.t<fixtureColors>
