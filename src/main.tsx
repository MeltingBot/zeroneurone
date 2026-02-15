import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n' // Initialize i18n before app
import './index.css'
import App from './App.tsx'
import { loadExternalPlugins } from './services/pluginLoaderService'

// Load external plugins from /plugins/manifest.json before mounting React.
// This ensures usePlugins() returns the correct data from the first render.
loadExternalPlugins().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
