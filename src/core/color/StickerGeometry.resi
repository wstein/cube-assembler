@genType
type rgb = {r: float, g: float, b: float}

@genType
type samplingGeometry = {stickerCore: float}

@genType let defaultSampling: samplingGeometry
@genType let cellEdges: (int, float) => array<float>

@genType
type rect = {x: float, y: float, width: float, height: float}

@genType
let stickerSampleRect: (int, int, int, float, float, samplingGeometry, float) => rect
@genType let stickerColors: Dict.t<rgb>
