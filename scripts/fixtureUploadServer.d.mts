import type { Server } from 'node:http'

export const DEFAULT_ALLOWED_ORIGINS: string[]

export function createFixtureUploadServer(
  rootDir: string,
  log?: (line: string) => void,
  options?: { allowedOrigins?: string[] },
): Server
