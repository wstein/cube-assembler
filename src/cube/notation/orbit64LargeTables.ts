// Orbit64 6x6/7x7 slot tables, derived in Orbit64.res from the 4x4/5x5
// reference tables.
import { largeTables as largeTablesRes } from './Orbit64.gen'

export function largeTables(n: 6 | 7): {
  corner: number[][]
  midge: number[][]
  wings: number[][][]
  centres: number[][]
} {
  return largeTablesRes(n)
}
