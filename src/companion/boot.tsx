import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import CompanionApp from './CompanionApp'
import './companion.css'
import { appPath } from '../utils/basePath'

/**
 * Page setup the desktop does not need: the system theme (the companion has
 * no theme switch), content under the notch / home indicator handled with
 * safe-area insets, and the browser bar matching the page.
 */
function setupPage(): void {
  const root = document.documentElement
  root.classList.add('zn-companion')
  const dark = window.matchMedia('(prefers-color-scheme: dark)')
  const applyTheme = () => {
    root.setAttribute('data-theme', dark.matches ? 'dark' : 'light')
    const bg = getComputedStyle(root).getPropertyValue('--color-bg-primary').trim()
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'theme-color'
      document.head.appendChild(meta)
    }
    if (bg) meta.content = bg
  }
  applyTheme()
  dark.addEventListener('change', applyTheme)

  // Its own manifest: installed from here, the app opens on the companion
  // (the desktop manifest starts on the desktop home) with ZN's icons. The
  // dev server serves no manifest at all, so a phone had no icon to install.
  let manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
  if (!manifest) {
    manifest = document.createElement('link')
    manifest.rel = 'manifest'
    document.head.appendChild(manifest)
  }
  manifest.href = appPath('companion.webmanifest')

  const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
  if (viewport) viewport.content = 'width=device-width, initial-scale=1, viewport-fit=cover'
  document.title = 'ZeroNeurone'
}

export async function bootCompanion(i18nReady: Promise<unknown>): Promise<void> {
  setupPage()
  await i18nReady
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <CompanionApp />
    </StrictMode>,
  )
}
