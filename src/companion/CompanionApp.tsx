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
import { ChevronRight, QrCode } from 'lucide-react';
import { isValidKeyString } from '../services/cryptoService';
import { parseJoinLink } from '../utils/joinUrl';
import { getSession, listSessions, saveSession, type CompanionSession } from './sessions';
import { getLocalUser, hasChosenName, setLocalUserName } from './presence';
import { DossierView } from './DossierView';
import { LinkEntry } from './LinkEntry';
import { currentRoute, navigate, type Route } from './router';
import { primaryButton, inputClass } from './ui';

export default function CompanionApp() {
  const [route, setRoute] = useState<Route>(currentRoute);

  useEffect(() => {
    const onPop = () => setRoute(currentRoute());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  if (route.kind === 'join') return <JoinScreen roomId={route.roomId} />;
  if (route.kind === 'dossier') {
    const session = getSession(route.dossierId);
    if (session) return <DossierView key={session.dossierId} session={session} />;
  }
  return <HomeScreen />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg-primary text-text-primary flex flex-col">
      <header className="flex items-center gap-2 px-4 py-3 border-b border-border-default">
        <span className="text-sm font-semibold">ZeroNeurone</span>
      </header>
      <main className="flex-1 px-4 py-4">{children}</main>
    </div>
  );
}

function HomeScreen() {
  const { t } = useTranslation('companion');
  const sessions = listSessions();
  return (
    <Shell>
      <div className="space-y-6">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center text-center gap-3 pt-8 text-text-secondary">
            <QrCode size={32} className="text-text-tertiary" />
            <p className="text-sm">{t('home.empty')}</p>
          </div>
        ) : (
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
          <LinkEntry />
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
