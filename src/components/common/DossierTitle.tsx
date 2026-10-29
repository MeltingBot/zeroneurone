import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDossierStore } from '../../stores';
import type { Dossier } from '../../types';

/**
 * Dossier name in the page header: double-click to rename, Enter or leaving
 * the field saves, Escape cancels. An empty name keeps the current one.
 */
export function DossierTitle({ dossier }: { dossier: Dossier }) {
  const { t } = useTranslation('modals');
  const updateDossier = useDossierStore((s) => s.updateDossier);
  const [draft, setDraft] = useState<string | null>(null);

  const save = () => {
    const name = draft?.trim();
    setDraft(null);
    if (name && name !== dossier.name) {
      // A closed or locked dossier refuses the change and says why
      updateDossier(dossier.id, { name }).catch(() => { /* reported by the store */ });
    }
  };

  if (draft !== null) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') setDraft(null);
        }}
        onFocus={(e) => e.target.select()}
        aria-label={t('rename.renameDossier')}
        data-testid="dossier-title-input"
        className="min-w-0 w-64 px-1.5 py-0.5 text-sm font-semibold rounded border border-border-default bg-bg-primary text-text-primary focus:outline-none focus:border-accent"
      />
    );
  }

  return (
    <h1
      onDoubleClick={() => setDraft(dossier.name)}
      title={dossier.name}
      data-testid="dossier-title"
      className="text-sm font-semibold text-text-primary truncate cursor-text"
    >
      {dossier.name}
    </h1>
  );
}
