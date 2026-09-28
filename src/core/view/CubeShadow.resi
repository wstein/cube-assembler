@genType type vec3 = (float, float, float)
@genType type floorPoint = (float, float)

@genType let shadowOutlinePoints: int
@genType let shadowFloorY: float => float
@genType let rotateModelPoint: (vec3, float, float) => vec3
@genType let shadowOutline: (float, float, float) => array<floorPoint>
@genType let paddedOutline: array<floorPoint> => Float32Array.t
