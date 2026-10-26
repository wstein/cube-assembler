@genType
type netRead =
  | @as("read") Read({size: int, facelets: string})
  | @as("unreadable") Unreadable({message: string})

// A net picture's RGBA pixels as the facelets of the cube it shows: six
// blocks of n x n letters in U R F D L B order (face letters for odd cubes,
// color letters W O G R B Y for even ones), or why it cannot be read.
@genType
let readNetImage: (Uint8ClampedArray.t, int, int) => netRead
