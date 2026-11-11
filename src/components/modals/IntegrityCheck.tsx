/**
 * Maintenance > Dossier integrity: lists, read-only, the entries of each
 * dossier that belong to another one (see services/dossierIntegrity.ts).
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck } from 'lucide-react';
import { INTEGRITY_KINDS, scanDossierIntegrity, type DossierIntegrity } from '../../services/dossierIntegrity';

export function IntegrityCheck() {
  const { t } = useTranslation('modals');
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<DossierIntegrity[] | null>(null);
  const [failed, setFailed] = useState(false);

  const run = async () => {
    setRunning(true);
    setFailed(false);
    try {
      setResults(await scanDossierIntegrity());
    } catch (error) {
      console.error('Integrity check failed:', error);
      setFailed(true);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="p-3 bg-bg-secondary rounded border border-border-default" data-testid="integrity-check">
      <div className="flex items-center gap-2 mb-2">
        <ShieldCheck size={14} className="text-text-secondary" />
        <span className="text-xs font-medium text-text-primary flex-1">{t('storage.integrity.title')}</span>
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="px-2 py-1 text-xs font-medium rounded border border-border-default bg-bg-primary text-text-primary hover:bg-bg-tertiary disabled:opacity-50 sketchy-border"
        >
          {running ? t('storage.integrity.checking') : t('storage.integrity.check')}
        </button>
      </div>

      {failed && <p className="text-xs text-error">{t('storage.integrity.error')}</p>}
      {results && results.length === 0 && <p className="text-xs text-success">{t('storage.integrity.none')}</p>}
      {results && results.length > 0 && (
        <ul className="space-y-2">
          {results.map((r) => (
            <li key={r.dossierId} className="text-xs border-t border-border-default pt-2">
              <span className="font-medium text-text-primary">{r.name}</span>
              {r.foreign.map((g) => (
                <div key={g.fromDossierId} className="mt-1 text-text-secondary">
                  <span className="text-error">
                    {INTEGRITY_KINDS.filter((k) => g.counts[k] > 0)
                      .map((k) => t(`storage.integrity.kinds.${k}`, { count: g.counts[k] }))
                      .join(', ')}
                  </span>{' '}
                  {t('storage.integrity.from', { name: g.fromName ?? t('storage.integrity.unknownDossier', { id: g.fromDossierId.slice(0, 8) }) })}
                  {g.samples.length > 0 && <span className="block text-text-tertiary truncate">{g.samples.join(' · ')}</span>}
                </div>
              ))}
              {r.metaNameFrom && (
                <div className="mt-1 text-error">{t('storage.integrity.nameFrom', { name: r.metaNameFrom })}</div>
              )}
              {r.undecryptable > 0 && (
                <div className="mt-1 text-text-tertiary">{t('storage.integrity.undecryptable', { count: r.undecryptable })}</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
