@genType let liveHoldFrames: int

@genType
type liveHold<'a> = {shown: Null.t<'a>, weak: int}

@genType let noHold: unit => liveHold<'a>

@genType
type held<'a> = {hold: liveHold<'a>, show: 'a, visible: bool}

@genType let holdConfirmedFace: (liveHold<'a>, 'a, bool) => held<'a>
