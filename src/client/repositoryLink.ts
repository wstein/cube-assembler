// The footer's link to the repository at the built commit: typed entry
// point for src/core/app/AppLinks.res.
import { repositoryLink as repositoryLinkRes } from '../core/app/AppLinks.gen'

export function repositoryLink(commit: string): {
  href: string
  label: string
} {
  return repositoryLinkRes(commit)
}
