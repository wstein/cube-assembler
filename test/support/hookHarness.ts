// A minimal stand-in for `preact/hooks` so a hook runs in the node test environment without a DOM: state
// and refs persist between renders, effects run after a render when their dependencies changed, and a state
// change marks the hook dirty (`renderHook(...).flush()` renders again). Use it through
// `vi.mock('preact/hooks', () => import('./support/hookHarness'))`.
interface Slot {
  value?: unknown
  deps?: unknown[]
  cleanup?: (() => void) | void
  ran?: boolean
}
interface Context {
  slots: Slot[]
  index: number
  dirty: boolean
  pending: { slot: Slot; run: () => (() => void) | void }[]
}
let active: Context | null = null

const slotOf = (): [Slot, Context] => {
  if (!active) throw new Error('hook outside renderHook')
  const ctx = active
  ctx.slots[ctx.index] ??= {}
  return [ctx.slots[ctx.index++], ctx]
}

export function useState<T>(
  initial: T | (() => T),
): [T, (next: T | ((value: T) => T)) => void] {
  const [slot, ctx] = slotOf()
  if (!slot.ran) {
    slot.ran = true
    slot.value =
      typeof initial === 'function' ? (initial as () => T)() : initial
  }
  const set = (next: T | ((value: T) => T)) => {
    slot.value =
      typeof next === 'function'
        ? (next as (value: T) => T)(slot.value as T)
        : next
    ctx.dirty = true
  }
  return [slot.value as T, set]
}

export function useRef<T>(initial: T): { current: T } {
  const [slot] = slotOf()
  if (!slot.ran) {
    slot.ran = true
    slot.value = { current: initial }
  }
  return slot.value as { current: T }
}

export function useEffect(
  run: () => (() => void) | void,
  deps?: unknown[],
): void {
  const [slot, ctx] = slotOf()
  const changed =
    !slot.ran ||
    deps === undefined ||
    !slot.deps ||
    deps.length !== slot.deps.length ||
    deps.some((value, i) => !Object.is(value, slot.deps?.[i]))
  slot.ran = true
  if (changed) {
    slot.deps = deps
    ctx.pending.push({ slot, run })
  }
}

// `deferEffects`: effects wait for `flushEffects()`, as in preact, where they run after the paint.
export function renderHook<P, R>(
  hook: (props: P) => R,
  first: P,
  options: { deferEffects?: boolean } = {},
) {
  const ctx: Context = { slots: [], index: 0, dirty: false, pending: [] }
  const result = { current: undefined as unknown as R }
  const render = (props: P) => {
    ctx.index = 0
    ctx.dirty = false
    active = ctx
    try {
      result.current = hook(props)
    } finally {
      active = null
    }
    if (!options.deferEffects) runEffects()
  }
  const runEffects = () => {
    const pending = ctx.pending
    ctx.pending = []
    for (const { slot, run } of pending) {
      if (typeof slot.cleanup === 'function') slot.cleanup()
      slot.cleanup = run()
    }
  }
  let props = first
  render(props)
  return {
    result,
    // Renders again with new props.
    rerender(next: P) {
      props = next
      render(props)
    },
    // Runs the effects of the last render (with `deferEffects`).
    flushEffects: runEffects,
    // Renders again while state changes are pending.
    flush() {
      for (let i = 0; i < 20 && ctx.dirty; i += 1) render(props)
    },
    unmount() {
      for (const slot of ctx.slots)
        if (typeof slot.cleanup === 'function') slot.cleanup()
    },
  }
}
