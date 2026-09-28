@genType
type step = {delta: float, velocity: float}

@genType let stepDragInertia: (float, float) => step
