import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiFetch, SERVER_UNREACHABLE } from '../src/client/api'

describe('apiFetch', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('names the missing server when the request cannot connect', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(apiFetch('/api/fixtures', { method: 'POST' })).rejects.toThrow(SERVER_UNREACHABLE)
  })

  it("names the missing server for the dev proxy's empty 5xx", async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })))
    await expect(apiFetch('/api/parity')).rejects.toThrow(SERVER_UNREACHABLE)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 502 })))
    await expect(apiFetch('/api/parity')).rejects.toThrow(SERVER_UNREACHABLE)
  })

  it("passes the server's own errors through", async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'bad cube' }), { status: 500 })))
    const res = await apiFetch('/api/parity')
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'bad cube' })
  })
})
