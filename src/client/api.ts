// Every /api call goes to the Bun server (server/Server.ts, port 3000),
// through Vite's dev proxy. When that server isn't running, the browser
// only reports "Failed to fetch" (large uploads lose the connection) or
// Vite answers an empty 500 - shown as-is, that reads like a problem with
// the cube. The server itself always answers errors with a JSON body.

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const staticSiteWithoutApi = import.meta.env.BASE_URL !== '/' && !apiBaseUrl

export const SERVER_UNREACHABLE = staticSiteWithoutApi
  ? 'This static demo has no cube API. Run npm run dev locally for server-backed actions.'
  : "Can't reach the cube server - start it with npm run dev (it serves /api on port 3000)"

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  if (staticSiteWithoutApi) throw new Error(SERVER_UNREACHABLE)
  let res: Response
  try {
    res = await fetch(`${apiBaseUrl}${path}`, init)
  } catch {
    throw new Error(SERVER_UNREACHABLE)
  }
  // An empty 5xx comes from the proxy, not from the server.
  if (res.status >= 500 && !(await res.clone().text())) throw new Error(SERVER_UNREACHABLE)
  return res
}
