import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  HardDrive,
  Database,
  FolderOpen,
  FileText,
  Link2,
  Image,
  Shield,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  Check,
  X,
  Download,
  Upload,
  Trash2,
  PackageCheck,
} from 'lucide-react';
import { Modal } from '../common';
import {
  getDetailedStorageInfo,
  requestPersistentStorage,
  purgeAllDossiers,
  compactYjsDatabase,
  type StorageInfo,
} from '../../db/database';
import { backupService } from '../../services/backupService';
import { db as dexieDb } from '../../db/database';

interface StorageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataChanged?: () => void;
}

type TabId = 'storage' | 'backup' | 'maintenance';

function formatBytes(bytes: number, locale: string): string {
  if (bytes === 0) return locale === 'fr' ? '0 o' : '0 B';
  const k = 1024;
  const sizes = locale === 'fr' ? ['o', 'Ko', 'Mo', 'Go'] : ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function StorageModal({ isOpen, onClose, onDataChanged }: StorageModalProps) {
  const { t, i18n } = useTranslation('modals');
  const [activeTab, setActiveTab] = useState<TabId>('storage');
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPersisting, setIsPersisting] = useState(false);
  const [persistResult, setPersistResult] = useState<'success' | 'denied' | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isPurgingAll, setIsPurgingAll] = useState(false);
  const [purgeAllStep, setPurgeAllStep] = useState<'idle' | 'confirm1' | 'confirm2'>('idle');
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [purgeAllMessage, setPurgeAllMessage] = useState<string | null>(null);
  const [compactingDb, setCompactingDb] = useState<string | null>(null);
  const [compactMessage, setCompactMessage] = useState<string | null>(null);
  const [dossierNames, setDossierNames] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadStorageInfo = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const info = await getDetailedStorageInfo();
      setStorageInfo(info);
    } catch (error) {
      console.error('Failed to load storage info:', error);
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadStorageInfo();
      setPersistResult(null);
      // Load dossier names for Y.js breakdown
      dexieDb.dossiers.toArray().then(dossiers => {
        const names: Record<string, string> = {};
        for (const d of dossiers) names[d.id] = d.name;
        setDossierNames(names);
      }).catch(() => {});
    }
  }, [isOpen, loadStorageInfo]);

  const handleRequestPersistence = async () => {
    setIsPersisting(true);
    setPersistResult(null);
    try {
      const granted = await requestPersistentStorage();
      setPersistResult(granted ? 'success' : 'denied');
      if (granted) {
        await loadStorageInfo();
      }
    } catch (error) {
      console.error('Failed to request persistent storage:', error);
      setPersistResult('denied');
    } finally {
      setIsPersisting(false);
    }
  };

  const handleExportAll = async () => {
    setIsExporting(true);
    setBackupMessage(null);
    try {
      const blob = await backupService.exportAll();
      const timestamp = new Date().toISOString().slice(0, 10);
      backupService.downloadBlob(blob, `zeroneurone_backup_${timestamp}.zip`);
      setBackupMessage(t('storage.backup.exportSuccess'));
    } catch (error) {
      console.error('Export failed:', error);
      setBackupMessage(t('storage.backup.error'));
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setBackupMessage(null);
    try {
      const result = await backupService.importAll(file, setBackupMessage);
      if (result.success) {
        setBackupMessage(
          t('storage.backup.importSuccess', {
            dossiers: result.dossiers,
            elements: result.elements,
            links: result.links,
          })
        );
        await loadStorageInfo();
        onDataChanged?.();
      } else {
        setBackupMessage(result.errors.join(', ') || t('storage.backup.error'));
      }
    } catch (error) {
      console.error('Import failed:', error);
      setBackupMessage(t('storage.backup.error'));
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleCompactYjs = async (dbName: string) => {
    setCompactingDb(dbName);
    setCompactMessage(null);
    try {
      await compactYjsDatabase(dbName);
      setCompactMessage(t('storage.compact.success'));
      await loadStorageInfo(true);
    } catch (error) {
      console.error('Compact failed:', error);
      setCompactMessage(t('storage.compact.error'));
    } finally {
      setCompactingDb(null);
    }
  };

  const handleCompactAll = async () => {
    if (!storageInfo) return;
    setCompactingDb('__all__');
    setCompactMessage(null);
    try {
      for (const { dbName } of storageInfo.ydocSizes) {
        await compactYjsDatabase(dbName);
      }
      setCompactMessage(t('storage.compact.allSuccess'));
      await loadStorageInfo(true);
    } catch (error) {
      console.error('Compact all failed:', error);
      setCompactMessage(t('storage.compact.error'));
    } finally {
      setCompactingDb(null);
    }
  };

  const handlePurgeAllExecute = async () => {
    setPurgeAllStep('idle');
    setIsPurgingAll(true);
    setPurgeAllMessage(null);
    try {
      await purgeAllDossiers();
      window.location.replace('/');
    } catch (error) {
      console.error('Purge all failed:', error);
      setPurgeAllMessage(t('storage.purgeAll.error'));
      setIsPurgingAll(false);
    }
  };

  const locale = i18n.language;

  const tabs: { id: TabId; label: string; icon: typeof HardDrive }[] = [
    { id: 'storage', label: t('storage.tabs.storage'), icon: HardDrive },
    { id: 'backup', label: t('storage.tabs.backup'), icon: Download },
    { id: 'maintenance', label: t('storage.tabs.maintenance'), icon: Database },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('storage.title')} width="md">
      {/* Tabs */}
      <div className="flex border-b border-border-default -mx-4 px-4 mb-4">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === id
                ? 'border-accent text-accent'
                : 'border-transparent text-text-tertiary hover:text-text-secondary'
            }`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw size={20} className="animate-spin text-text-tertiary" />
          </div>
        ) : storageInfo ? (
          <>
            {/* ── Storage tab ── */}
            {activeTab === 'storage' && (
              <>
                {/* Global storage quota */}
                <div className="p-3 bg-bg-secondary rounded border border-border-default">
                  <div className="flex items-center gap-2 mb-2">
                    <HardDrive size={14} className="text-text-secondary" />
                    <span className="text-xs font-medium text-text-primary">
                      {t('storage.spaceUsed')}
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-text-secondary">
                        {formatBytes(storageInfo.totalUsage, locale)} / {formatBytes(storageInfo.totalQuota, locale)}
                      </span>
                      <span className="text-text-tertiary tabular-nums">
                        {storageInfo.percentUsed.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-2 bg-bg-tertiary rounded overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          storageInfo.percentUsed > 90
                            ? 'bg-error'
                            : storageInfo.percentUsed > 70
                            ? 'bg-warning'
                            : 'bg-accent'
                        }`}
                        style={{ width: `${Math.min(storageInfo.percentUsed, 100)}%` }}
                      />
                    </div>

                    {/* Breakdown: OPFS / Y.js / Dexie / Cache */}
                    {(() => {
                      const dexieSize = storageInfo.tableSizes.reduce((sum, t) => sum + t.size, 0);
                      const measured = storageInfo.opfsSize + storageInfo.ydocEstimatedSize + dexieSize + storageInfo.cacheSize;
                      if (measured === 0) return null;
                      const pct = (v: number) => `${(v / measured) * 100}%`;
                      return (
                        <div className="space-y-1.5 pt-1">
                          <div className="flex items-center justify-between text-[10px] text-text-secondary">
                            <span>{t('storage.breakdown.measured')}</span>
                            <span className="tabular-nums">{formatBytes(measured, locale)}</span>
                          </div>
                          <div className="h-2 bg-bg-tertiary rounded overflow-hidden flex">
                            {storageInfo.opfsSize > 0 && <div className="h-full bg-accent" style={{ width: pct(storageInfo.opfsSize) }} />}
                            {storageInfo.ydocEstimatedSize > 0 && <div className="h-full bg-warning" style={{ width: pct(storageInfo.ydocEstimatedSize) }} />}
                            {dexieSize > 0 && <div className="h-full bg-success/60" style={{ width: pct(dexieSize) }} />}
                            {storageInfo.cacheSize > 0 && <div className="h-full bg-accent/30" style={{ width: pct(storageInfo.cacheSize) }} />}
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-text-tertiary">
                            <span className="flex items-center gap-1">
                              <span className="inline-block w-2 h-2 rounded-full bg-accent" />
                              {t('storage.breakdown.opfs')} {formatBytes(storageInfo.opfsSize, locale)}
                            </span>
                            <span className="flex items-center gap-1">
                              <span className="inline-block w-2 h-2 rounded-full bg-warning" />
                              {t('storage.breakdown.yjs')} ~{formatBytes(storageInfo.ydocEstimatedSize, locale)}
                            </span>
                            <span className="flex items-center gap-1">
                              <span className="inline-block w-2 h-2 rounded-full bg-success/60" />
                              {t('storage.breakdown.indexedDB')} ~{formatBytes(dexieSize, locale)}
                            </span>
                            {storageInfo.cacheSize > 0 && (
                              <span className="flex items-center gap-1">
                                <span className="inline-block w-2 h-2 rounded-full bg-accent/30" />
                                Cache {formatBytes(storageInfo.cacheSize, locale)}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Persistence status */}
                <div className="p-3 bg-bg-secondary rounded border border-border-default">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {storageInfo.isPersistent ? (
                        <ShieldCheck size={14} className="text-success" />
                      ) : (
                        <ShieldAlert size={14} className="text-warning" />
                      )}
                      <div>
                        <span className="text-xs font-medium text-text-primary">
                          {t('storage.persistent.title')}
                        </span>
                        <p className="text-[10px] text-text-tertiary">
                          {storageInfo.isPersistent
                            ? t('storage.persistent.protected')
                            : t('storage.persistent.notProtected')}
                        </p>
                      </div>
                    </div>
                    {!storageInfo.isPersistent && (
                      <button
                        onClick={handleRequestPersistence}
                        disabled={isPersisting}
                        className="flex items-center gap-1 px-2 py-1 text-xs bg-accent text-white rounded hover:bg-accent/90 disabled:opacity-50"
                      >
                        {isPersisting ? (
                          <RefreshCw size={12} className="animate-spin" />
                        ) : (
                          <Shield size={12} />
                        )}
                        {t('common:actions.protect')}
                      </button>
                    )}
                  </div>
                  {persistResult && (
                    <div
                      className={`mt-2 flex items-center gap-1 text-[10px] ${
                        persistResult === 'success' ? 'text-success' : 'text-warning'
                      }`}
                    >
                      {persistResult === 'success' ? (
                        <>
                          <Check size={10} />
                          {t('storage.persistent.success')}
                        </>
                      ) : (
                        <>
                          <X size={10} />
                          {t('storage.persistent.denied')}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Content summary */}
                <div className="p-3 bg-bg-secondary rounded border border-border-default">
                  <div className="flex items-center gap-2 mb-3">
                    <FolderOpen size={14} className="text-text-secondary" />
                    <span className="text-xs font-medium text-text-primary">
                      {t('storage.content.title')}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-2 text-xs">
                      <FolderOpen size={12} className="text-text-tertiary" />
                      <span className="text-text-secondary">{t('storage.content.dossiers')}</span>
                      <span className="ml-auto text-text-primary tabular-nums">
                        {storageInfo.dossierCount}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <FileText size={12} className="text-text-tertiary" />
                      <span className="text-text-secondary">{t('storage.content.elements')}</span>
                      <span className="ml-auto text-text-primary tabular-nums">
                        {storageInfo.elementCount.toLocaleString(locale)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <Link2 size={12} className="text-text-tertiary" />
                      <span className="text-text-secondary">{t('storage.content.links')}</span>
                      <span className="ml-auto text-text-primary tabular-nums">
                        {storageInfo.linkCount.toLocaleString(locale)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <Image size={12} className="text-text-tertiary" />
                      <span className="text-text-secondary">{t('storage.content.files')}</span>
                      <span className="ml-auto text-text-primary tabular-nums">
                        {storageInfo.assetCount.toLocaleString(locale)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Refresh button */}
                <div className="flex justify-end">
                  <button
                    onClick={() => loadStorageInfo()}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded"
                  >
                    <RefreshCw size={12} />
                    {t('common:actions.refresh')}
                  </button>
                </div>
              </>
            )}

            {/* ── Backup tab ── */}
            {activeTab === 'backup' && (
              <>
                <div className="p-3 bg-bg-secondary rounded border border-border-default">
                  <div className="flex items-center gap-2 mb-3">
                    <Download size={14} className="text-text-secondary" />
                    <span className="text-xs font-medium text-text-primary">
                      {t('storage.backup.title')}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleExportAll}
                      disabled={isExporting || isImporting}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-accent text-white rounded hover:bg-accent/90 disabled:opacity-50"
                    >
                      {isExporting ? (
                        <RefreshCw size={12} className="animate-spin" />
                      ) : (
                        <Download size={12} />
                      )}
                      {t('storage.backup.exportAll')}
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isExporting || isImporting}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs border border-border-default text-text-primary rounded hover:bg-bg-tertiary disabled:opacity-50"
                    >
                      {isImporting ? (
                        <RefreshCw size={12} className="animate-spin" />
                      ) : (
                        <Upload size={12} />
                      )}
                      {t('storage.backup.import')}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".zip"
                      onChange={handleImportFile}
                      className="hidden"
                    />
                  </div>

                  {backupMessage && (
                    <p className="mt-2 text-[10px] text-text-tertiary">{backupMessage}</p>
                  )}

                  <p className="mt-2 text-[10px] text-text-tertiary">
                    {t('storage.backup.description')}
                  </p>
                </div>
              </>
            )}

            {/* ── Maintenance tab ── */}
            {activeTab === 'maintenance' && (
              <>
                {/* Storage details */}
                <div className="p-3 bg-bg-secondary rounded border border-border-default">
                  <div className="flex items-center gap-2 mb-3">
                    <Database size={14} className="text-text-secondary" />
                    <span className="text-xs font-medium text-text-primary">
                      {t('storage.details.title')}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            storageInfo.indexedDBSupported ? 'bg-success' : 'bg-error'
                          }`}
                        />
                        <span className="text-text-secondary">{t('storage.details.indexedDB')}</span>
                      </div>
                      <span className="text-text-tertiary">
                        {storageInfo.indexedDBSupported ? t('storage.details.supported') : t('storage.details.notSupported')}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            storageInfo.opfsSupported ? 'bg-success' : 'bg-error'
                          }`}
                        />
                        <span className="text-text-secondary">{t('storage.details.opfs')}</span>
                      </div>
                      <span className="text-text-tertiary">
                        {storageInfo.opfsSupported ? t('storage.details.supported') : t('storage.details.notSupported')}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-warning" />
                        <span className="text-text-secondary">{t('storage.details.yjsHistory')}</span>
                      </div>
                      <span className="text-text-tertiary">
                        ~{formatBytes(storageInfo.ydocEstimatedSize, locale)} ({t('storage.details.databases', { count: storageInfo.ydocDatabases.length })})
                      </span>
                    </div>
                  </div>

                  {/* Table size breakdown */}
                  {storageInfo.tableSizes.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border-default">
                      <span className="text-[10px] font-medium text-text-secondary mb-1.5 block">
                        {t('storage.details.tableSizes')}
                      </span>
                      <div className="space-y-1">
                        {storageInfo.tableSizes.map(({ name, size, count }) => (
                          <div key={name} className="flex items-center justify-between text-[10px]">
                            <span className="text-text-tertiary">
                              {name} <span className="tabular-nums">({count.toLocaleString(locale)})</span>
                            </span>
                            <span className="text-text-secondary tabular-nums">
                              ~{formatBytes(size, locale)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Y.js per-dossier breakdown with compact buttons */}
                  {storageInfo.ydocSizes.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border-default">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-medium text-text-secondary">
                          {t('storage.compact.title')}
                        </span>
                        <button
                          onClick={handleCompactAll}
                          disabled={compactingDb !== null}
                          className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-accent border border-accent/30 rounded hover:bg-accent/10 disabled:opacity-50"
                        >
                          {compactingDb === '__all__' ? (
                            <RefreshCw size={10} className="animate-spin" />
                          ) : (
                            <PackageCheck size={10} />
                          )}
                          {t('storage.compact.all')}
                        </button>
                      </div>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {storageInfo.ydocSizes.map(({ dbName, dossierId, size }) => (
                          <div key={dbName} className="flex items-center justify-between text-[10px] group">
                            <span className="text-text-tertiary truncate flex-1 mr-2" title={dossierId}>
                              {dossierNames[dossierId] || dossierId.slice(0, 8) + '…'}
                            </span>
                            <span className="text-text-secondary tabular-nums mr-2">
                              ~{formatBytes(size, locale)}
                            </span>
                            <button
                              onClick={() => handleCompactYjs(dbName)}
                              disabled={compactingDb !== null}
                              className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 px-1 py-0.5 text-[10px] text-accent hover:bg-accent/10 rounded disabled:opacity-50 transition-opacity"
                              title={t('storage.compact.button')}
                            >
                              {compactingDb === dbName ? (
                                <RefreshCw size={10} className="animate-spin" />
                              ) : (
                                <PackageCheck size={10} />
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                      {compactMessage && (
                        <p className="mt-1 text-[10px] text-text-tertiary">{compactMessage}</p>
                      )}
                    </div>
                  )}

                </div>

                {/* Danger zone: purge all dossiers */}
                <div className="p-3 bg-bg-secondary rounded border border-error/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Trash2 size={14} className="text-error" />
                    <span className="text-xs font-medium text-text-primary">
                      {t('storage.purgeAll.title')}
                    </span>
                  </div>
                  <p className="text-[10px] text-text-tertiary mb-2">
                    {t('storage.purgeAll.description')}
                  </p>

                  {purgeAllStep === 'idle' && (
                    <button
                      onClick={() => setPurgeAllStep('confirm1')}
                      disabled={isPurgingAll}
                      className="flex items-center gap-1 px-2 py-1 text-xs text-error border border-error/30 rounded hover:bg-error/10 disabled:opacity-50"
                    >
                      {isPurgingAll ? (
                        <RefreshCw size={12} className="animate-spin" />
                      ) : (
                        <Trash2 size={12} />
                      )}
                      {t('storage.purgeAll.button')}
                    </button>
                  )}

                  {purgeAllStep === 'confirm1' && (
                    <div className="p-2 border border-error/30 rounded bg-error/5 space-y-2">
                      <p className="text-xs text-error font-medium">{t('storage.purgeAll.confirm')}</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setPurgeAllStep('confirm2')}
                          className="px-2 py-1 text-xs text-white bg-error rounded hover:bg-error/90"
                        >
                          {t('common:actions.continue')}
                        </button>
                        <button
                          onClick={() => setPurgeAllStep('idle')}
                          className="px-2 py-1 text-xs text-text-secondary border border-border-default rounded hover:bg-bg-tertiary"
                        >
                          {t('common:actions.cancel')}
                        </button>
                      </div>
                    </div>
                  )}

                  {purgeAllStep === 'confirm2' && (
                    <div className="p-2 border border-error rounded bg-error/10 space-y-2">
                      <p className="text-xs text-error font-bold">{t('storage.purgeAll.confirmAgain')}</p>
                      <div className="flex gap-2">
                        <button
                          onClick={handlePurgeAllExecute}
                          className="flex items-center gap-1 px-2 py-1 text-xs text-white bg-error rounded hover:bg-error/90"
                        >
                          <Trash2 size={12} />
                          {t('storage.purgeAll.button')}
                        </button>
                        <button
                          onClick={() => setPurgeAllStep('idle')}
                          className="px-2 py-1 text-xs text-text-secondary border border-border-default rounded hover:bg-bg-tertiary"
                        >
                          {t('common:actions.cancel')}
                        </button>
                      </div>
                    </div>
                  )}

                  {purgeAllMessage && (
                    <p className="mt-1 text-[10px] text-text-tertiary">{purgeAllMessage}</p>
                  )}
                </div>
              </>
            )}
          </>
        ) : (
          <div className="text-center py-8">
            <p className="text-sm text-text-tertiary">
              {t('common:errors.generic')}
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
