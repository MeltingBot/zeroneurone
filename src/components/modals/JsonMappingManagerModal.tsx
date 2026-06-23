import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Trash2, Check, Pencil, Download, Upload } from 'lucide-react';
import { useJsonMappingStore } from '../../stores';
import { exportService } from '../../services/exportService';
import type { JsonMappingTemplate } from '../../utils/jsonMapping';

const FILE_TYPE = 'zeroneurone-mapping-templates';

interface JsonMappingManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Manage saved JSON-import mapping templates: list, rename, delete. */
export function JsonMappingManagerModal({ isOpen, onClose }: JsonMappingManagerModalProps) {
  const { t } = useTranslation('modals');
  const templates = useJsonMappingStore((s) => s.templates);
  const load = useJsonMappingStore((s) => s.load);
  const save = useJsonMappingStore((s) => s.save);
  const rename = useJsonMappingStore((s) => s.rename);
  const remove = useJsonMappingStore((s) => s.remove);

  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (isOpen) load(); }, [isOpen, load]);

  if (!isOpen) return null;

  const commitRename = (id: string) => {
    const n = editName.trim();
    if (n) rename(id, n);
    setEditId(null);
  };

  const exportTemplates = (list: JsonMappingTemplate[]) => {
    if (list.length === 0) return;
    const payload = {
      type: FILE_TYPE,
      version: 1,
      templates: list.map((tpl) => ({ name: tpl.name, signature: tpl.signature, config: tpl.config })),
    };
    const filename = list.length === 1 ? `mapping-${list[0].name}.json` : 'mappings-zeroneurone.json';
    exportService.download(JSON.stringify(payload, null, 2), filename, 'application/json');
  };

  const handleImportFile = async (file: File) => {
    setNotice(null);
    try {
      const data = JSON.parse(await file.text());
      if (data?.type !== FILE_TYPE || !Array.isArray(data.templates)) {
        setNotice(t('importJsonMapping.importTemplatesError'));
        return;
      }
      let count = 0;
      for (const tpl of data.templates) {
        if (!tpl?.name || !tpl?.config || !Array.isArray(tpl?.signature)) continue;
        await save(String(tpl.name), tpl.signature, tpl.config);
        count++;
      }
      setNotice(t('importJsonMapping.importedTemplates', { count }));
    } catch {
      setNotice(t('importJsonMapping.importTemplatesError'));
    }
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
                    <>
                      <button
                        onClick={() => { setEditId(tpl.id); setEditName(tpl.name); }}
                        className="p-1 text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary rounded"
                        title={t('importJsonMapping.rename')}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => exportTemplates([tpl])}
                        className="p-1 text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary rounded"
                        title={t('importJsonMapping.exportTemplate')}
                      >
                        <Download size={14} />
                      </button>
                    </>
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

        {notice && <p className="px-4 pb-1 text-[11px] text-text-secondary">{notice}</p>}

        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-border-default bg-bg-secondary">
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportFile(f); e.target.value = ''; }}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded border border-border-default"
            >
              <Upload size={12} /> {t('importJsonMapping.importTemplates')}
            </button>
            <button
              onClick={() => exportTemplates(templates)}
              disabled={templates.length === 0}
              className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded border border-border-default disabled:opacity-40"
            >
              <Download size={12} /> {t('importJsonMapping.exportAll')}
            </button>
          </div>
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary rounded">
            {t('importJsonMapping.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
