import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initI18n } from './i18n'
import './index.css'
import App from './App.tsx'
import { loadExternalPlugins } from './services/pluginLoaderService'

// Order matters: plugins call api.i18n.addResourceBundle() while registering,
// which needs an initialised instance. i18n used to be set up synchronously at
// import time, so this keeps the same sequence. Both must settle before the
// first render — plugins so usePlugins() is correct from the start,
// translations so the UI never flashes raw keys.
initI18n()
  .then(loadExternalPlugins)
  .then(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
