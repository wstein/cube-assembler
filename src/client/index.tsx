import { render } from 'preact'
import '@fontsource/space-grotesk/500.css'
import '@fontsource/space-grotesk/600.css'
import '@fontsource/space-grotesk/700.css'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
import '../../web/style.css'
import '../../web/shell-controls.css'
import '../../web/capture.css'
import '../../web/capture-overlay.css'
import '../../web/review.css'
import { useScannerAppModel } from './useScannerAppModel'
import { ScannerAppView } from './scannerAppView'
import { applyTheme } from './theme'
import { selectedTheme } from './preferences'

function App() {
  return <ScannerAppView model={useScannerAppModel()} />
}

// Hydrate
// ─────────────────────────────────────────────────────────────────────────────

applyTheme(selectedTheme(document.cookie))
const app = document.querySelector('#app')
if (app) {
  render(<App />, app)
}
