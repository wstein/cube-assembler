@genType let physicalProtocol: string
@genType let legacyProtocol: string
@genType let physicalMapping: CaptureFaceMapping.mapping
@genType
type seed = {
  mapping: CaptureFaceMapping.mapping,
  validation: CaptureFaceMapping.validation,
  canonicalTransform: Null.t<int>,
}
@genType let physicalSeed: (Dict.t<CubeTypes.grid>, int) => seed
