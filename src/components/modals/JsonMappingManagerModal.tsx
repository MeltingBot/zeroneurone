import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Trash2, Check, Pencil } from 'lucide-react';
import { useJsonMappingStore } from '../../stores';

interface JsonMappingManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Manage saved JSON-import mapping templates: list, rename, delete. */
export function JsonMappingManagerModal({ isOpen, onClose }: JsonMappingManagerModalProps) {
  const { t } = useTranslation('modals');
  const templates = useJsonMappingStore((s) => s.templates);
  const load = useJsonMappingStore((s) => s.load);
  const rename = useJsonMappingStore((s) => s.rename);
  const remove = useJsonMappingStore((s) => s.remove);

  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => { if (isOpen) load(); }, [isOpen, load]);

  if (!isOpen) return null;

  const commitRename = (id: string) => {
    const n = editName.trim();
    if (n) rename(id, n);
    setEditId(null);
  };

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/40">
      <div className="bg-bg-primary border border-border-default sketchy-border-soft modal-shadow w-[90vw] max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
          <h2 className="text-sm font-semibold text-text-primary">{t('importJsonMapping.manageTitle')}</h2>
          <button onClick={onClose} className="p-1 hover:bg-bg-tertiary rounded transition-colors">
            <X size={18} className="text-text-secondary" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {templates.length === 0 ? (
            <p className="text-xs text-text-tertiary text-center py-6">{t('importJsonMapping.noTemplates')}</p>
          ) : (
            <div className="divide-y divide-border-default">
              {templates.map((tpl) => (
                <div key={tpl.id} className="flex items-center gap-2 py-2">
                  <div className="flex-1 min-w-0">
                    {editId === tpl.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={editName}
                          autoFocus
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') commitRename(tpl.id); if (e.key === 'Escape') setEditId(null); }}
                          className="flex-1 px-2 py-1 text-sm bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary"
                        />
                        <button onClick={() => commitRename(tpl.id)} className="p-1 text-success hover:bg-bg-tertiary rounded">
                          <Check size={14} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="text-sm text-text-primary truncate">{tpl.name}</div>
                        <div className="text-[10px] text-text-tertiary">{t('importJsonMapping.templateFields', { count: tpl.signature.length })}</div>
                      </>
                    )}
                  </div>
                  {editId !== tpl.id && (
                    <button
                      onClick={() => { setEditId(tpl.id); setEditName(tpl.name); }}
                      className="p-1 text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary rounded"
                      title={t('importJsonMapping.rename')}
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                  {confirmDelete === tpl.id ? (
                    <button
                      onClick={() => { remove(tpl.id); setConfirmDelete(null); }}
                      className="px-2 py-1 text-xs bg-error text-white rounded"
                    >
                      {t('importJsonMapping.confirmDelete')}
                    </button>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(tpl.id)}
                      className="p-1 text-text-tertiary hover:text-error hover:bg-bg-tertiary rounded"
                      title={t('importJsonMapping.delete')}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end px-4 py-3 border-t border-border-default bg-bg-secondary">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary rounded">
            {t('importJsonMapping.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
