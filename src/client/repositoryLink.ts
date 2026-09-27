const REPOSITORY_URL = 'https://github.com/wstein/cube-assembler'

export function repositoryLink(commit: string): {
  href: string
  label: string
} {
  const hash = /^[0-9a-f]{7,40}(?=-dirty$|$)/i.exec(commit)?.[0]
  if (!hash) return { href: REPOSITORY_URL, label: 'GitHub' }
  const dirty = commit.endsWith('-dirty') ? '-dirty' : ''
  return {
    href: `${REPOSITORY_URL}/tree/${hash}`,
    label: `GitHub · ${hash.slice(0, 7)}${dirty}`,
  }
}
