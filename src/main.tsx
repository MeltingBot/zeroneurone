import './index.css'
import { initI18n } from './i18n'
import { appPath } from './utils/basePath'
import { listSessions } from './companion/sessions'

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
      && listSessions().length > 0
  } catch {
    return false
  }
}

const i18nReady = initI18n()

if (!isCompanion && path === appPath('') && installedCompanion()) {
  window.location.replace(appPath('m/'))
} else if (isCompanion) {
  void import('./companion/boot').then(({ bootCompanion }) => bootCompanion(i18nReady))
} else {
  void import('./bootDesktop').then(({ bootDesktop }) => bootDesktop(i18nReady))
}
