import './index.css'
import { initI18n } from './i18n'
import { appPath } from './utils/basePath'
import { hasCompanionDossiers } from './companion/hasDossiers'

// Two entries share this page. Paths under /m/ are the mobile companion: a
// light page that joins a shared dossier from a phone, without the canvas,
// Dexie or plugins. Everything else is the desktop app. Both are loaded on
// demand so neither pulls the other's code.
const companionRoot = appPath('m')
const path = window.location.pathname
const isCompanion = path === companionRoot || path.startsWith(`${companionRoot}/`)

// Installed on a phone's home screen, the app starts at the manifest's
// start_url (the desktop app, which a phone screen cannot use). A phone that
// joined dossiers through the companion goes back to it.
function installedCompanion(): boolean {
  try {
    return window.matchMedia('(display-mode: standalone)').matches
      && window.matchMedia('(max-width: 767px)').matches
      && hasCompanionDossiers()
  } catch {
    return false
  }
}

// A desktop share link opened on a phone: same link, companion side (the
// desktop app cannot be used on a phone screen)
function phoneJoinRedirect(): string | null {
  const joinRoot = appPath('join/')
  if (!path.startsWith(joinRoot) || !window.matchMedia('(max-width: 767px)').matches) return null
  return `${appPath('m/')}${path.slice(joinRoot.length)}${window.location.search}${window.location.hash}`
}

const i18nReady = initI18n()
const joinRedirect = isCompanion ? null : phoneJoinRedirect()

if (joinRedirect) {
  window.location.replace(joinRedirect)
} else if (!isCompanion && path === appPath('') && installedCompanion()) {
  window.location.replace(appPath('m/'))
} else if (isCompanion) {
  void import('./companion/boot').then(({ bootCompanion }) => bootCompanion(i18nReady))
} else {
  void import('./bootDesktop').then(({ bootDesktop }) => bootDesktop(i18nReady))
}
