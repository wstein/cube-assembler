// Moves `target` from where `from` was to where it is now (FLIP) - how a
// just-captured face flies from the scan square into its net slot.
// Skipped under prefers-reduced-motion.
export function flyInto(target: HTMLElement, from: DOMRect) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const to = target.getBoundingClientRect()
  if (to.width === 0) return
  target.animate(
    [
      {
        transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width})`,
        transformOrigin: 'top left',
        opacity: 0.6,
      },
      { transform: 'none', transformOrigin: 'top left', opacity: 1 },
    ],
    { duration: 500, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
  )
}

// Flies a copy of `source` onto `target`'s position and size (FLIP-style,
// via a fixed-position clone so neither real element has to move). Resolves
// once the clone has landed, with a callback that removes it - the caller
// decides when, so the clone can cover the target until the real content
// has re-rendered underneath. Skipped entirely under prefers-reduced-motion.
export function morphInto(
  source: HTMLElement,
  target: HTMLElement,
): Promise<() => void> {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    return Promise.resolve(() => {})
  const from = source.getBoundingClientRect()
  const to = target.getBoundingClientRect()
  const clone = source.cloneNode(true) as HTMLElement
  Object.assign(clone.style, {
    position: 'fixed',
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
    margin: '0',
    zIndex: '10000',
    pointerEvents: 'none',
    transformOrigin: 'top left',
  })
  document.body.appendChild(clone)
  const scale = to.width / from.width
  const anim = clone.animate(
    [
      { transform: 'none' },
      {
        transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${scale})`,
      },
    ],
    {
      duration: 450,
      easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      fill: 'forwards',
    },
  )
  const remove = () => clone.remove()
  // Browsers freeze animation timelines in background tabs, so `finished`
  // alone could leave the pick hanging until the tab is visible again -
  // force-finish after a grace period (timers still fire when hidden).
  const fallback = setTimeout(() => anim.finish(), 800)
  return anim.finished.then(
    () => {
      clearTimeout(fallback)
      return remove
    },
    () => {
      clearTimeout(fallback)
      return remove
    },
  )
}
