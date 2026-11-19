// Renders Preact function components to plain data without a DOM: component vnodes are called with
// their props (the components under test use no hooks), elements become `{ tag, props, children }`.
import type { ComponentChild, VNode } from 'preact'

export interface Node {
  tag: string
  props: Record<string, unknown>
  children: (Node | string)[]
}

export function expand(child: ComponentChild): (Node | string)[] {
  if (child === null || child === undefined || typeof child === 'boolean')
    return []
  if (typeof child === 'string' || typeof child === 'number')
    return [String(child)]
  if (Array.isArray(child)) return child.flatMap(expand)
  const vnode = child as VNode<Record<string, unknown>>
  const props = vnode.props
  if (typeof vnode.type === 'function') {
    const render = vnode.type as (p: Record<string, unknown>) => ComponentChild
    return expand(render(props))
  }
  return [
    {
      tag: vnode.type as string,
      props,
      children: expand(props.children as ComponentChild),
    },
  ]
}

export const text = (node: Node | string): string =>
  typeof node === 'string' ? node : node.children.map(text).join('')

export function findAll(
  nodes: (Node | string)[],
  test: (node: Node) => boolean,
): Node[] {
  return nodes.flatMap((node) =>
    typeof node === 'string'
      ? []
      : [...(test(node) ? [node] : []), ...findAll(node.children, test)],
  )
}

export const classOf = (node: Node): string[] =>
  (typeof node.props.class === 'string' ? node.props.class : '')
    .split(/\s+/)
    .filter(Boolean)
