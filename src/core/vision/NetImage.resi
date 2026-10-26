@genType
type box = {x: int, y: int, width: int, height: int}

@genType
type netRead =
  | @as("read") Read({size: int, facelets: string, faces: array<box>})
  | @as("unreadable") Unreadable({message: string})

// A net picture's RGBA pixels as the facelets of the cube it shows: six
// blocks of n x n letters in U R F D L B order (face letters for odd cubes,
// color letters W O G R B Y for even ones) and each face's rectangle in the
// picture (same order), or why it cannot be read.
@genType
let readNetImage: (Uint8ClampedArray.t, int, int) => netRead
