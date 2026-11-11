/**
 * Canvas tabs on the phone: a bar to show one tab's elements only (list,
 * map, timeline, search), the management of the tabs themselves, and an
 * element's own tabs on its page.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Settings2, Trash2, X } from 'lucide-react';
import type { CanvasTab, Element } from '../types';
import { createTab, deleteTab, renameTab, setTabMember } from './actions';
import type { useCompanionSession } from './useCompanionSession';
import { choiceButton, inputClass, primaryButton, secondaryButton, sectionTitle } from './ui';

type Session = ReturnType<typeof useCompanionSession>;

const chip = (active: boolean) =>
  `flex-shrink-0 h-9 px-3 inline-flex items-center rounded-full border text-sm whitespace-nowrap ${
    active ? 'border-accent bg-accent-light text-accent font-medium' : 'border-border-default text-text-secondary'
  }`;

export function TabsBar({ tabs, active, onSelect, onManage, writable }: {
  tabs: CanvasTab[];
  active: string | null;
  onSelect: (id: string | null) => void;
  onManage: () => void;
  writable: boolean;
}) {
  const { t } = useTranslation('companion');
  if (tabs.length === 0 && !writable) return null;
  return (
    <div className="flex items-center gap-2 pl-3 pr-1 py-1.5 border-b border-border-default bg-bg-primary">
      <div className="flex-1 min-w-0 flex gap-2 overflow-x-auto overscroll-contain [scrollbar-width:none]" role="tablist" aria-label={t('tabsBar.label')}>
        <button type="button" role="tab" aria-selected={active === null} className={chip(active === null)} onClick={() => onSelect(null)}>
          {t('tabsBar.all')}
        </button>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            className={chip(active === tab.id)}
            onClick={() => onSelect(tab.id)}
          >
            {tab.name || t('tabsBar.untitled')}
          </button>
        ))}
      </div>
      {writable && (
        <button
          type="button"
          className="w-10 h-10 flex-shrink-0 flex items-center justify-center text-text-secondary"
          onClick={onManage}
          aria-label={t('tabsBar.manage')}
          title={t('tabsBar.manage')}
        >
          <Settings2 size={18} />
        </button>
      )}
    </div>
  );
}

export function TabsManager({ s, onClose }: { s: Session; onClose: () => void }) {
  const { t } = useTranslation('companion');
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const write = (run: (ydoc: NonNullable<Session['ydoc']>) => void) => {
    const ydoc = s.ydoc;
    if (ydoc) void s.track(() => run(ydoc));
  };

  return (
    <div className="fixed inset-0 z-40 bg-bg-primary flex flex-col" role="dialog" aria-modal="true" aria-label={t('tabsBar.manage')}>
      <header className="flex items-center gap-1 px-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2 border-b border-border-default">
        <button type="button" className="w-10 h-10 flex items-center justify-center text-text-secondary" onClick={onClose} aria-label={t('close')}>
          <X size={20} />
        </button>
        <span className="flex-1 text-base font-semibold">{t('tabsBar.manage')}</span>
      </header>
      <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-5">
        <ul className="divide-y divide-border-default border border-border-default rounded">
          {s.data.tabs.map((tab) => (
            <li key={tab.id} className="px-3 py-2">
              {renaming?.id === tab.id ? (
                <div className="space-y-2">
                  <input
                    className={inputClass}
                    value={renaming.name}
                    onChange={(e) => setRenaming({ id: tab.id, name: e.target.value })}
                    aria-label={t('tabsBar.name')}
                    autoFocus
                  />
                  <div className="flex justify-end gap-2">
                    <button type="button" className={secondaryButton} onClick={() => setRenaming(null)}>{t('cancel')}</button>
                    <button
                      type="button"
                      className={primaryButton}
                      disabled={!renaming.name.trim()}
                      onClick={() => {
                        write((ydoc) => renameTab(ydoc, s.dossierId, tab.id, renaming.name, s.syncState.connected));
                        setRenaming(null);
                      }}
                    >
                      {t('edit.save')}
                    </button>
                  </div>
                </div>
              ) : confirmDelete === tab.id ? (
                <div className="flex items-center gap-2">
                  <span className="flex-1 min-w-0 text-sm">{t('tabsBar.confirmDelete', { name: tab.name })}</span>
                  <button type="button" className={secondaryButton} onClick={() => setConfirmDelete(null)}>{t('cancel')}</button>
                  <button
                    type="button"
                    className={`${secondaryButton} text-error`}
                    onClick={() => {
                      write((ydoc) => deleteTab(ydoc, s.dossierId, tab.id, s.syncState.connected));
                      setConfirmDelete(null);
                    }}
                  >
                    {t('delete.confirm')}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm truncate">{tab.name || t('tabsBar.untitled')}</span>
                    <span className="block text-xs text-text-tertiary">{t('element.count', { count: tab.memberElementIds.length })}</span>
                  </span>
                  <button
                    type="button"
                    className="w-10 h-10 flex items-center justify-center text-text-secondary"
                    onClick={() => setRenaming({ id: tab.id, name: tab.name })}
                    aria-label={t('tabsBar.rename', { name: tab.name })}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    className="w-10 h-10 flex items-center justify-center text-text-tertiary"
                    onClick={() => setConfirmDelete(tab.id)}
                    aria-label={t('tabsBar.delete', { name: tab.name })}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>

        <section className="space-y-2">
          <h2 className={sectionTitle}>{t('tabsBar.new')}</h2>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} aria-label={t('tabsBar.name')} />
          <button
            type="button"
            className={`${primaryButton} w-full`}
            disabled={!name.trim()}
            onClick={() => {
              write((ydoc) => createTab(ydoc, s.dossierId, name, s.syncState.connected));
              setName('');
            }}
          >
            {t('tabsBar.create')}
          </button>
        </section>
      </div>
    </div>
  );
}

/** An element's tabs, toggled from its page */
export function TabMembership({ element, s, writable }: { element: Element; s: Session; writable: boolean }) {
  const { t } = useTranslation('companion');
  if (s.data.tabs.length === 0) return null;
  const toggle = (tab: CanvasTab, member: boolean) => {
    const ydoc = s.ydoc;
    if (!ydoc || !writable) return;
    void s.track(() => setTabMember(ydoc, s.dossierId, tab.id, element.id, member, s.syncState.connected));
  };
  return (
    <section className="space-y-2">
      <h2 className={sectionTitle}>{t('tabsBar.title')}</h2>
      <div className="flex flex-wrap gap-2">
        {s.data.tabs.map((tab) => {
          const member = tab.memberElementIds.includes(element.id);
          return (
            <button
              key={tab.id}
              type="button"
              disabled={!writable}
              aria-pressed={member}
              className={`${choiceButton(member)} min-h-10`}
              onClick={() => toggle(tab, !member)}
            >
              {tab.name || t('tabsBar.untitled')}
            </button>
          );
        })}
      </div>
    </section>
  );
}
