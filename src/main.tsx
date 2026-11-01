import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initI18n } from './i18n'
import './index.css'
import App from './App.tsx'
import { loadExternalPlugins } from './services/pluginLoaderService'
import { getRequiredPluginFailures } from './plugins/requiredPlugins'
import { RequiredPluginsBlocked } from './components/common/RequiredPluginsBlocked'
import { db } from './db/database'

// In a fresh Chromium profile, a database created before ours slows every
// write to ours about 2.5 times, for good. Plugins create theirs while
// registering, so ours is created first. Only when it does not exist yet: an
// existing one may be encrypted, and Dexie must not open it (nor run schema
// upgrades) before the unlock installs the encryption middleware. Bounded so
// a stuck open never holds the start.
async function createDatabaseFirst(): Promise<void> {
  try {
    const existing = await indexedDB.databases()
    if (existing.some((d) => d.name === db.name)) return
    await Promise.race([db.open(), new Promise((resolve) => setTimeout(resolve, 2000))])
  } catch (err) {
    console.warn('[ZN] Early database creation failed', err)
  }
}

// Order matters: plugins call api.i18n.addResourceBundle() while registering,
// which needs an initialised instance. i18n used to be set up synchronously at
// import time, so this keeps the same sequence. Both must settle before the
// first render — plugins so usePlugins() is correct from the start,
// translations so the UI never flashes raw keys.
Promise.all([initI18n(), createDatabaseFirst()])
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
