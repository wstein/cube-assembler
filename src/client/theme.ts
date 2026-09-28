import type { Theme } from './preferences'

// Marks the page for web/style.css: data-theme="light" or "dark" overrides
// the system color scheme, and no mark follows it.
export function applyTheme(theme: Theme, root = document.documentElement) {
  if (theme === 'system') delete root.dataset.theme
  else root.dataset.theme = theme
}
