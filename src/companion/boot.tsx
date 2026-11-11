import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import CompanionApp from './CompanionApp'
import './companion.css'
import { appPath } from '../utils/basePath'
import { applyTheme, watchSystemTheme } from './theme'

/**
 * Page setup the desktop does not need: the companion's own theme, content
 * under the notch / home indicator handled with safe-area insets, and the
 * browser bar matching the page.
 */
function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    // iPadOS reports itself as a Mac
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function setupPage(): void {
  const root = document.documentElement
  root.classList.add('zn-companion')
  applyTheme()
  watchSystemTheme()

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

  // Edge to edge on iOS only (notch, home indicator). Chrome on Android
  // reports the system bars as safe-area insets even in a browser tab that
  // does not draw under them: the header and tab bar got empty bands.
  const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
  if (viewport) {
    viewport.content = isIOS()
      ? 'width=device-width, initial-scale=1, viewport-fit=cover'
      : 'width=device-width, initial-scale=1'
  }
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
