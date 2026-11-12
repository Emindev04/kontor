import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initLanguage } from './i18n'
import '@fontsource/carlito/400.css'
import '@fontsource/carlito/700.css'
import '@fontsource/carlito/400-italic.css'
import '@fontsource/carlito/700-italic.css'
import './styles.css'
import './sheets.css'

// The interface language loads first: modules build some texts when they load.
await initLanguage()
const { App } = await import('./App')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
