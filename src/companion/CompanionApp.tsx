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
import { ArrowLeft, ChevronRight, Paperclip, Settings } from 'lucide-react';
import { isValidKeyString } from '../services/cryptoService';
import { parseJoinLink } from '../utils/joinUrl';
import { unlockSeed } from '../services/writeAccess';
import { getSession, listSessions, pendingDeletions, saveSession, type CompanionSession } from './sessions';
import { eraseLocalCopy } from './erase';
import { getLocalUser, hasChosenName, setLocalUserName } from './presence';
import { DossierView } from './DossierView';
import { LinkEntry } from './LinkEntry';
import { AppSettings } from './AppSettings';
import { LockScreen } from './LockScreen';
import { isPrompting, lockEnabled, readLock, unlockedKey } from './lockState';
import { captureFromShare, deleteShare, dropOldShares, readShare, type SharedItem } from './shareInbox';
import { currentRoute, navigate, type Route } from './router';
import { primaryButton, inputClass, secondaryButton } from './ui';

/**
 * The lock in front of everything: locked at start (nothing of the dossiers
 * readable), and covered again after the chosen time in the background. The
 * cover leaves the app as it was underneath (a capture form in progress, a
 * photo being taken in the camera app).
 */
export default function CompanionApp() {
  const [unlocked, setUnlocked] = useState(() => !lockEnabled() || !!unlockedKey());
  const [covered, setCovered] = useState(false);

  useEffect(() => {
    let hiddenAt: number | null = null;
    const onVisibility = () => {
      // The passkey prompt itself hides the page: not a time in the background
      if (isPrompting()) return;
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        return;
      }
      const lock = readLock();
      if (lock && unlockedKey() && hiddenAt !== null && Date.now() - hiddenAt >= lock.timeoutMin * 60_000) setCovered(true);
      hiddenAt = null;
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  if (!unlocked) return <LockScreen onUnlocked={() => setUnlocked(true)} />;
  return (
    <>
      <div inert={covered || undefined}>
        <Routes />
      </div>
      {covered && <LockScreen cover onUnlocked={() => setCovered(false)} />}
    </>
  );
}

function Routes() {
  const [route, setRoute] = useState<Route>(currentRoute);

  useEffect(() => {
    const onPop = () => setRoute(currentRoute());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  if (route.kind === 'join') return <JoinScreen roomId={route.roomId} />;
  if (route.kind === 'app') return <AppSettingsScreen />;
  if (route.kind === 'share') return <ShareScreen shareId={route.shareId} />;
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

/** A share from another app: the dossier it goes into, then the capture form */
function ShareScreen({ shareId }: { shareId: string }) {
  const { t } = useTranslation('companion');
  const sessions = listSessions();
  const [item, setItem] = useState<SharedItem | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void dropOldShares().catch(() => undefined);
    readShare(shareId)
      .then((found) => { if (!cancelled) setItem(found); })
      .catch(() => { if (!cancelled) setItem(null); });
    return () => { cancelled = true; };
  }, [shareId]);

  const pick = useCallback((dossierId: string) => {
    navigate(`d/${encodeURIComponent(dossierId)}`, true, { shareId });
  }, [shareId]);

  // A single dossier on the phone: straight to it
  const only = sessions.length === 1 ? sessions[0].dossierId : null;
  useEffect(() => {
    if (item && only) pick(only);
  }, [item, only, pick]);

  const summary = item ? captureFromShare(item) : null;
  return (
    <Shell title={t('share.title')} onBack={() => { void deleteShare(shareId).catch(() => undefined); navigate('', true); }}>
      {item === undefined ? null : !item || !summary ? (
        <p className="text-sm text-text-secondary text-center pt-8">{t('share.missing')}</p>
      ) : (
        <div className="space-y-6">
          <div className="p-3 rounded border border-border-default bg-bg-secondary space-y-1 text-sm">
            {summary.label && <p className="font-medium truncate">{summary.label}</p>}
            {summary.notes && <p className="text-text-secondary line-clamp-3 break-words">{summary.notes}</p>}
            {summary.source && <p className="text-xs text-text-tertiary truncate">{summary.source}</p>}
            {item.files.length > 0 && (
              <p className="flex items-center gap-1.5 text-xs text-text-secondary">
                <Paperclip size={13} />
                {t('share.files', { count: item.files.length })}
              </p>
            )}
          </div>
          {sessions.length === 0 ? (
            <p className="text-sm text-text-secondary text-center">{t('share.noDossier')}</p>
          ) : (
            <section>
              <h1 className="text-xs text-text-secondary font-medium uppercase tracking-wider mb-2">{t('share.pick')}</h1>
              <ul className="divide-y divide-border-default border border-border-default rounded">
                {sessions.map((s) => (
                  <li key={s.dossierId}>
                    <button
                      type="button"
                      className="w-full min-h-12 flex items-center gap-2 px-3 py-3 text-left active:bg-bg-secondary"
                      onClick={() => pick(s.dossierId)}
                    >
                      <span className="flex-1 text-sm truncate">{s.name || t('home.untitled')}</span>
                      <ChevronRight size={16} className="text-text-tertiary" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Shell>
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
  /** Write code: empty, the phone joins read-only */
  const [writeCode, setWriteCode] = useState('');
  const asksWriteCode = !!link.writeLock && !!link.access && !link.access.seed;

  const validKey = !!link.encryptionKey && isValidKeyString(link.encryptionKey);
  const server = link.server ?? '';
  const known = getSession(link.dossierId);

  const join = useCallback(async () => {
    if (!validKey || !server) {
      setError(t('join.invalidLink'));
      return;
    }
    if (!link.asyncEnabled) {
      setError(t('join.notAsync'));
      return;
    }
    let access = link.access;
    if (access && !access.seed && link.writeLock && writeCode.trim()) {
      const seed = await unlockSeed(access.publicKey, link.writeLock, writeCode);
      if (!seed) {
        setError(t('join.wrongWriteCode'));
        return;
      }
      access = { publicKey: access.publicKey, seed };
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
      ...(access ? { access } : {}),
    };
    saveSession(session);
    // Replace: the key leaves the address bar and the history
    navigate(`d/${encodeURIComponent(session.dossierId)}`, true);
  }, [validKey, server, link, name, known, writeCode, t]);

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
            {asksWriteCode && (
              <label className="block space-y-1">
                <span className="text-xs font-medium text-text-primary">{t('join.writeCode')}</span>
                <input
                  className={inputClass}
                  value={writeCode}
                  onChange={(e) => { setWriteCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(null); }}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="000000"
                />
                <span className="block text-xs text-text-tertiary">{t('join.writeCodeHint')}</span>
              </label>
            )}
            {error && <p className="text-sm text-error">{error}</p>}
            <button type="button" className={`${primaryButton} w-full`} onClick={() => void join()}>
              {t('join.join')}
            </button>
          </>
        )}
      </div>
    </Shell>
  );
}
