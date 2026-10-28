import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initI18n } from './i18n'
import './index.css'
import App from './App.tsx'
import { loadExternalPlugins } from './services/pluginLoaderService'
import { getRequiredPluginFailures } from './plugins/requiredPlugins'
import { RequiredPluginsBlocked } from './components/common/RequiredPluginsBlocked'

// Order matters: plugins call api.i18n.addResourceBundle() while registering,
// which needs an initialised instance. i18n used to be set up synchronously at
// import time, so this keeps the same sequence. Both must settle before the
// first render — plugins so usePlugins() is correct from the start,
// translations so the UI never flashes raw keys.
initI18n()
  // Wrapped: loadExternalPlugins now takes an optional skipIds array, and
  // passing it as a .then callback handed it the i18n instance instead.
  .then(() => loadExternalPlugins())
  .then(() => {
    // A plugin the host requires is missing: the app does not start without it
    const failures = getRequiredPluginFailures()
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        {failures.length > 0 ? <RequiredPluginsBlocked failures={failures} /> : <App />}
      </StrictMode>,
    )
  })
