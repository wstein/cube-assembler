import { describe, expect, it } from 'vitest'
import { readWithProfile } from '../src/client/capture/readWithProfile'

const profile = (id: string) => ({ id, name: id, colors: {} })
const face = (id?: string) =>
  ({
    colors: [],
    timestamp: 0,
    previewColorProfile: id && profile(id),
  }) as never

describe('the profile a capture was read with', () => {
  const order = ['a', 'b', 'c', 'd']

  it('is the profile that read most faces', () => {
    const captured = { a: face('x'), b: face('y'), c: face('y'), d: face('y') }
    expect(readWithProfile(captured, order)?.id).toBe('y')
  })

  it('is the first one to read the most on a tie', () => {
    const captured = { a: face('x'), b: face('y'), c: face('y'), d: face('x') }
    expect(readWithProfile(captured, order)?.id).toBe('x')
  })

  it('is null when no face recorded a profile', () => {
    expect(readWithProfile({ a: face(), b: face() }, order)).toBeNull()
  })
})
