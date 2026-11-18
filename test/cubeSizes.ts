// The cube sizes the app accepts, 2 through 15, and their parities. Tests that
// loop over sizes import these so the range lives in one place.
export const ALL_SIZES = Array.from({ length: 14 }, (_, i) => i + 2)
export const ODD_SIZES = ALL_SIZES.filter((n) => n % 2 === 1)
export const EVEN_SIZES = ALL_SIZES.filter((n) => n % 2 === 0)
