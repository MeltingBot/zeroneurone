/**
 * Mobile companion: a light web page that joins a shared dossier from a phone
 * to capture (photo, note, position), look up elements and comment.
 *
 * Rendered by main.tsx instead of the desktop app for paths under /m/, before
 * plugins load: no canvas, map, Dexie or plugins in this chunk.
 *
 *   /m/                 dossiers already joined on this phone
 *   /m/{roomId}?…#key=… join from a share link (QR code of the share window)
 *   /m/d/{dossierId}    an open dossier (the key stays out of the URL)
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ChevronRight, Settings } from 'lucide-react';
import { isValidKeyString } from '../services/cryptoService';
import { parseJoinLink } from '../utils/joinUrl';
import { getSession, listSessions, pendingDeletions, saveSession, type CompanionSession } from './sessions';
import { eraseLocalCopy } from './erase';
import { getLocalUser, hasChosenName, setLocalUserName } from './presence';
import { DossierView } from './DossierView';
import { LinkEntry } from './LinkEntry';
import { AppSettings } from './AppSettings';
import { currentRoute, navigate, type Route } from './router';
import { primaryButton, inputClass, secondaryButton } from './ui';

export default function CompanionApp() {
  const [route, setRoute] = useState<Route>(currentRoute);

  useEffect(() => {
    const onPop = () => setRoute(currentRoute());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  if (route.kind === 'join') return <JoinScreen roomId={route.roomId} />;
  if (route.kind === 'app') return <AppSettingsScreen />;
  if (route.kind === 'dossier') {
    const session = getSession(route.dossierId);
    if (session) return <DossierView key={session.dossierId} session={session} />;
  }
  return <HomeScreen />;
}

function Shell({ children, title, onBack, onSettings }: {
  children: React.ReactNode;
  title?: string;
  onBack?: () => void;
  onSettings?: () => void;
}) {
  const { t } = useTranslation('companion');
  return (
    <div className="min-h-dvh bg-bg-primary text-text-primary flex flex-col">
      <header className={`flex items-center gap-1 border-b border-border-default ${onBack || onSettings ? 'px-2 py-1.5' : 'px-4 py-3'}`}>
        {onBack && (
          <button type="button" className="w-10 h-10 flex items-center justify-center rounded text-text-secondary active:bg-bg-secondary" onClick={onBack} aria-label={t('back')}>
            <ArrowLeft size={20} />
          </button>
        )}
        <span className={`flex-1 text-sm font-semibold ${onBack ? '' : onSettings ? 'px-2' : ''}`}>{title ?? 'ZeroNeurone'}</span>
        {onSettings && (
          <button type="button" className="w-10 h-10 flex items-center justify-center rounded text-text-secondary active:bg-bg-secondary" onClick={onSettings} aria-label={t('tabs.settings')} title={t('tabs.settings')}>
            <Settings size={20} />
          </button>
        )}
      </header>
      <main className="flex-1 px-4 py-4">{children}</main>
    </div>
  );
}

function AppSettingsScreen() {
  const { t } = useTranslation('companion');
  // Back to the home page they were opened from, or to it when opened directly
  const back = () => ((window.history.state as { fromHome?: boolean } | null)?.fromHome ? window.history.back() : navigate('', true));
  return (
    <Shell title={t('tabs.settings')} onBack={back}>
      <AppSettings />
    </Shell>
  );
}

function HomeScreen() {
  const { t } = useTranslation('companion');
  const sessions = listSessions();
  const [toErase, setToErase] = useState(() => pendingDeletions());
  // Erasing from the start when copies are pending: retried at each visit
  const [erasing, setErasing] = useState(() => pendingDeletions().length > 0);
  const runErase = useCallback(async () => {
    for (const id of pendingDeletions()) await eraseLocalCopy(id);
    setToErase(pendingDeletions());
    setErasing(false);
  }, []);
  const retryErase = () => {
    setErasing(true);
    void runErase();
  };
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      for (const id of pendingDeletions()) await eraseLocalCopy(id);
      if (cancelled) return;
      setToErase(pendingDeletions());
      setErasing(false);
    })();
    return () => { cancelled = true; };
  }, []);
  return (
    <Shell onSettings={() => navigate('app', false, { fromHome: true })}>
      <div className="space-y-6">
        {toErase.length > 0 && (
          <div className="flex items-center gap-3 p-3 rounded border border-warning bg-bg-secondary text-sm">
            <span className="flex-1">{t('home.erasePending', { count: toErase.length })}</span>
            <button type="button" className={secondaryButton} onClick={retryErase} disabled={erasing}>
              {t('elements.retry')}
            </button>
          </div>
        )}
        {sessions.length > 0 && (
          <section>
            <h1 className="text-xs text-text-secondary font-medium uppercase tracking-wider mb-2">{t('home.title')}</h1>
            <ul className="divide-y divide-border-default border border-border-default rounded">
              {sessions.map((s) => (
                <li key={s.dossierId}>
                  <button
                    type="button"
                    className="w-full min-h-12 flex items-center gap-2 px-3 py-3 text-left active:bg-bg-secondary"
                    onClick={() => navigate(`d/${encodeURIComponent(s.dossierId)}`)}
                  >
                    <span className="flex-1 text-sm truncate">{s.name || t('home.untitled')}</span>
                    <ChevronRight size={16} className="text-text-tertiary" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section>
          {sessions.length > 0 && (
            <h2 className="text-xs text-text-secondary font-medium uppercase tracking-wider mb-2">{t('home.add')}</h2>
          )}
          <LinkEntry empty={sessions.length === 0} />
        </section>
      </div>
    </Shell>
  );
}

function JoinScreen({ roomId }: { roomId: string }) {
  const { t } = useTranslation('companion');
  const [link] = useState(() => parseJoinLink(roomId, window.location.search, window.location.hash));
  const [name, setName] = useState(() => (hasChosenName() ? getLocalUser().name : ''));
  const [error, setError] = useState<string | null>(null);

  const validKey = !!link.encryptionKey && isValidKeyString(link.encryptionKey);
  const server = link.server ?? '';
  const known = getSession(link.dossierId);

  const join = useCallback(() => {
    if (!validKey || !server) {
      setError(t('join.invalidLink'));
      return;
    }
    if (!link.asyncEnabled) {
      setError(t('join.notAsync'));
      return;
    }
    const trimmed = name.trim();
    if (trimmed) setLocalUserName(trimmed);
    const session: CompanionSession = {
      dossierId: link.dossierId,
      roomId: link.roomId,
      encryptionKey: link.encryptionKey!,
      server,
      name: link.name ?? known?.name ?? '',
      joinedAt: new Date().toISOString(),
    };
    saveSession(session);
    // Replace: the key leaves the address bar and the history
    navigate(`d/${encodeURIComponent(session.dossierId)}`, true);
  }, [validKey, server, link, name, known, t]);

  let host = server;
  try { host = new URL(server).host; } catch { /* shown as given */ }

  return (
    <Shell>
      <div className="space-y-4">
        <div>
          <h1 className="text-lg font-semibold">{link.name || t('join.title')}</h1>
          <p className="text-xs text-text-tertiary mt-1">{t('join.server', { host: host || '—' })}</p>
        </div>
        {!validKey || !server ? (
          <p className="text-sm text-error">{t('join.invalidLink')}</p>
        ) : (
          <>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-text-primary">{t('join.yourName')}</span>
              <input
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={getLocalUser().name}
                autoComplete="nickname"
              />
            </label>
            {error && <p className="text-sm text-error">{error}</p>}
            <button type="button" className={`${primaryButton} w-full`} onClick={join}>
              {t('join.join')}
            </button>
          </>
        )}
      </div>
    </Shell>
  );
}
