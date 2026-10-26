// A sticker the equal color share or a hand moved to another color: the final
// color fills the upper left half, what it read as before the lower right.
export function diagonalSplit(finalColor: string, firstGuess: string): string {
  return `linear-gradient(135deg, ${finalColor} 50%, ${firstGuess} 50%)`
}
