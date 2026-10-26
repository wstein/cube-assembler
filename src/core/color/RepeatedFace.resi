@genType
let repeatLimit: float

@genType
let faceDistance: (array<array<StickerGeometry.rgb>>, array<array<StickerGeometry.rgb>>) => float

@genType
let findRepeatShots: array<option<array<array<StickerGeometry.rgb>>>> => array<(int, int)>
