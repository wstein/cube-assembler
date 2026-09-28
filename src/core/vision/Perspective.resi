@genType type point = (float, float)
@genType type homography = array<float>

@genType let homography: (array<point>, array<point>) => homography
@genType let applyHomography: (homography, point) => point
@genType
let warpQuadToSquare: (Uint8ClampedArray.t, int, int, array<point>, int) => Uint8ClampedArray.t
