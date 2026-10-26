@genType let format: string

@genType
type payload = {
  size: int,
  moves: string,
  format: string,
}

@genType let movesText: (array<CubeMoves.cubeTurn>, int) => string
@genType let payload: (array<CubeMoves.cubeTurn>, int) => payload
@genType let escapeForScript: string => string
@genType let json: (array<CubeMoves.cubeTurn>, int) => string
