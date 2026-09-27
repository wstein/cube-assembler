import type { Server } from 'node:http'

export function createFixtureUploadServer(
  rootDir: string,
  log?: (line: string) => void,
): Server
