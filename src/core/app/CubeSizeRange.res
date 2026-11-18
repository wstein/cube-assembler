// The cube sizes the app handles: one source for the profile list, the size
// cookie and the capture and fixture limits. Raise `maxCubeSize` to widen the range.
let minCubeSize = 2
let maxCubeSize = 15

let cubeSizes = Array.fromInitializer(~length=maxCubeSize - minCubeSize + 1, i => minCubeSize + i)

let isSupportedSize = size => size >= minCubeSize && size <= maxCubeSize
