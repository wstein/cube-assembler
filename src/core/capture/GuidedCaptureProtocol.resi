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

@genType let currentProtocol: string
@genType let isPhysicalProtocol: string => bool
@genType let currentMapping: CaptureFaceMapping.mapping
@genType let seedForProtocol: (Dict.t<CubeTypes.grid>, int, string) => seed

@genType let mirroredProtocol: string
@genType let incompleteProtocol: string
@genType let isCurrentProtocol: string => bool
@genType let mirroredMapping: CaptureFaceMapping.mapping
