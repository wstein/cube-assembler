@genType let magneticEase: float => float
@genType let turnEase: (float, bool) => float
@genType let defaultTurnMs: float
@genType let settleDuration: (float, float) => float
@genType let scrambleDuration: float => float
@genType let turnClickGain: (float, bool) => float

@genType
type modeLevel =
  | @as("wide") Wide
  | @as("cube") Cube

@genType type note = {frequency: float, start: float, duration: float}
@genType let modeCueNotes: modeLevel => array<note>
@genType let modeCueGain: float
@genType let magnetReach: float
@genType let magneticDragAngle: float => float
@genType let magnetImpact: float
@genType let magneticSettleAngle: (float, float, float, float, float) => float
