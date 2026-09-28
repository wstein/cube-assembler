@genType
type photoFile = {name: string, @as("type") type_: string, size: float}
@genType
type named = {name: string}

@genType
type uploadKind = | @as("fixture") Fixture | @as("photos") Photos
@genType let uploadKind: array<named> => uploadKind
@genType let isNamedFaceCrop: string => bool

@genType
type photoFrameMode = | @as("auto") Auto | @as("cropped") Cropped | @as("full") Full
@genType
type captureMode = | @as("cv") Cv | @as("guide") Guide
@genType
type readMode = | @as("aligned") Aligned | @as("fixed") Fixed | @as("cropped") CroppedRead
@genType let photoReadModes: (string, photoFrameMode, captureMode) => array<readMode>

@genType
type order =
  | @as("ordered") Ordered({order: array<int>}) | @as("invalid") Invalid({message: string})
@genType let photoUploadOrder: array<photoFile> => order
