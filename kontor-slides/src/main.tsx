import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initLanguage } from './i18n'
import '@fontsource/carlito/400.css'
import '@fontsource/carlito/400-italic.css'
import '@fontsource/carlito/700.css'
import '@fontsource/carlito/700-italic.css'
import '@fontsource/caladea/400.css'
import '@fontsource/caladea/400-italic.css'
import '@fontsource/caladea/700.css'
import '@fontsource/caladea/700-italic.css'
import '@fontsource/lato/400.css'
import '@fontsource/lato/400-italic.css'
import '@fontsource/lato/700.css'
import '@fontsource/lato/700-italic.css'
import '@fontsource/montserrat/400.css'
import '@fontsource/montserrat/400-italic.css'
import '@fontsource/montserrat/700.css'
import '@fontsource/montserrat/700-italic.css'
import '@fontsource/merriweather/400.css'
import '@fontsource/merriweather/400-italic.css'
import '@fontsource/merriweather/700.css'
import '@fontsource/merriweather/700-italic.css'
import '@fontsource/open-sans/400.css'
import '@fontsource/open-sans/400-italic.css'
import '@fontsource/open-sans/700.css'
import '@fontsource/open-sans/700-italic.css'
import '@fontsource/playfair-display/400.css'
import '@fontsource/playfair-display/400-italic.css'
import '@fontsource/playfair-display/700.css'
import '@fontsource/playfair-display/700-italic.css'
import './styles.css'

// The interface language loads first: modules build some texts when they load.
await initLanguage()
const { default: App } = await import('./App')
await import('./render/zoomSetup')
const { store } = await import('./store/store')
const actions = await import('./store/actions')

// Test hook for development builds only.
if (import.meta.env.DEV)
  Object.assign(window, {
    __kontor: {
      store,
      actions,
      loadIo: async () => ({ ...(await import('./io/pptxExport')), ...(await import('./io/pptxImport')), JSZip: (await import('jszip')).default }),
    },
  })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
