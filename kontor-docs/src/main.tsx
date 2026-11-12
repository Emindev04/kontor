import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initLanguage } from './i18n'
import './fonts.css'
import './styles.css'
import './document.css'

// The interface language loads first: modules build some texts when they load.
await initLanguage()
const { App } = await import('./App')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
