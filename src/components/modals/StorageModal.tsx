import { useState, useEffect, useCallback, useRef } from 'react';
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
} from 'lucide-react';
import { Modal } from '../common';
import {
  getDetailedStorageInfo,
  requestPersistentStorage,
  purgeYjsDatabases,
  type StorageInfo,
} from '../../db/database';
import { backupService } from '../../services/backupService';

interface StorageModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 o';
  const k = 1024;
  const sizes = ['o', 'Ko', 'Mo', 'Go'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function StorageModal({ isOpen, onClose }: StorageModalProps) {
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPersisting, setIsPersisting] = useState(false);
  const [persistResult, setPersistResult] = useState<'success' | 'denied' | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isPurging, setIsPurging] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [purgeMessage, setPurgeMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadStorageInfo = useCallback(async () => {
    setIsLoading(true);
    try {
      const info = await getDetailedStorageInfo();
      setStorageInfo(info);
    } catch (error) {
      console.error('Failed to load storage info:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadStorageInfo();
      setPersistResult(null);
    }
  }, [isOpen, loadStorageInfo]);

  const handleRequestPersistence = async () => {
    setIsPersisting(true);
    setPersistResult(null);
    try {
      const granted = await requestPersistentStorage();
      setPersistResult(granted ? 'success' : 'denied');
      if (granted) {
        // Refresh storage info to reflect new status
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
      setBackupMessage('Export terminé');
    } catch (error) {
      console.error('Export failed:', error);
      setBackupMessage('Erreur lors de l\'export');
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
          `Import réussi: ${result.investigations} enquête(s), ${result.elements} élément(s), ${result.links} lien(s)`
        );
        await loadStorageInfo();
      } else {
        setBackupMessage(result.errors.join(', ') || 'Erreur lors de l\'import');
      }
    } catch (error) {
      console.error('Import failed:', error);
      setBackupMessage('Erreur lors de l\'import');
    } finally {
      setIsImporting(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handlePurgeYjs = async () => {
    if (!confirm('Purger l\'historique Y.js ?\n\nCela libérera de l\'espace mais supprimera l\'historique d\'annulation. Les données seront conservées.')) {
      return;
    }

    setIsPurging(true);
    setPurgeMessage(null);
    try {
      const result = await purgeYjsDatabases();
      if (result.errors.length > 0) {
        setPurgeMessage(`${result.deleted} base(s) supprimée(s), ${result.errors.length} erreur(s)`);
      } else {
        setPurgeMessage(`${result.deleted} base(s) supprimée(s)`);
      }
      await loadStorageInfo();
    } catch (error) {
      console.error('Purge failed:', error);
      setPurgeMessage('Erreur lors de la purge');
    } finally {
      setIsPurging(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Stockage" width="md">
      <div className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw size={20} className="animate-spin text-text-tertiary" />
          </div>
        ) : storageInfo ? (
          <>
            {/* Global storage quota */}
            <div className="p-3 bg-bg-secondary rounded border border-border-default">
              <div className="flex items-center gap-2 mb-2">
                <HardDrive size={14} className="text-text-secondary" />
                <span className="text-xs font-medium text-text-primary">
                  Espace utilisé
                </span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-secondary">
                    {formatBytes(storageInfo.totalUsage)} / {formatBytes(storageInfo.totalQuota)}
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
                      Stockage persistant
                    </span>
                    <p className="text-[10px] text-text-tertiary">
                      {storageInfo.isPersistent
                        ? 'Protection active (désactivable via paramètres navigateur)'
                        : 'Le navigateur peut supprimer les données si l\'espace est insuffisant'}
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
                    Protéger
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
                      Stockage protégé avec succès
                    </>
                  ) : (
                    <>
                      <X size={10} />
                      Refusé par le navigateur (ajoutez le site aux favoris ou utilisez-le régulièrement)
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Storage breakdown */}
            <div className="p-3 bg-bg-secondary rounded border border-border-default">
              <div className="flex items-center gap-2 mb-3">
                <Database size={14} className="text-text-secondary" />
                <span className="text-xs font-medium text-text-primary">
                  Détails du stockage
                </span>
              </div>

              <div className="space-y-2">
                {/* IndexedDB */}
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        storageInfo.indexedDBSupported ? 'bg-success' : 'bg-error'
                      }`}
                    />
                    <span className="text-text-secondary">IndexedDB</span>
                  </div>
                  <span className="text-text-tertiary">
                    {storageInfo.indexedDBSupported ? 'Supporté' : 'Non supporté'}
                  </span>
                </div>

                {/* OPFS */}
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        storageInfo.opfsSupported ? 'bg-success' : 'bg-error'
                      }`}
                    />
                    <span className="text-text-secondary">OPFS (fichiers)</span>
                  </div>
                  <span className="text-text-tertiary">
                    {storageInfo.opfsSupported ? 'Supporté' : 'Non supporté'}
                  </span>
                </div>

                {/* Y.js databases */}
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-warning" />
                    <span className="text-text-secondary">Historique Y.js</span>
                  </div>
                  <span className="text-text-tertiary">
                    ~{formatBytes(storageInfo.ydocEstimatedSize)} ({storageInfo.ydocDatabases.length} base{storageInfo.ydocDatabases.length !== 1 ? 's' : ''})
                  </span>
                </div>
              </div>

              {/* Y.js purge option */}
              {storageInfo.ydocDatabases.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border-default">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-text-tertiary flex-1">
                      L'historique Y.js stocke les modifications pour l'annulation. Purger libère de l'espace.
                    </p>
                    <button
                      onClick={handlePurgeYjs}
                      disabled={isPurging}
                      className="ml-2 flex items-center gap-1 px-2 py-1 text-xs text-warning border border-warning/30 rounded hover:bg-warning/10 disabled:opacity-50"
                    >
                      {isPurging ? (
                        <RefreshCw size={12} className="animate-spin" />
                      ) : (
                        <Trash2 size={12} />
                      )}
                      Purger
                    </button>
                  </div>
                  {purgeMessage && (
                    <p className="mt-1 text-[10px] text-text-tertiary">{purgeMessage}</p>
                  )}
                </div>
              )}
            </div>

            {/* Content summary */}
            <div className="p-3 bg-bg-secondary rounded border border-border-default">
              <div className="flex items-center gap-2 mb-3">
                <FolderOpen size={14} className="text-text-secondary" />
                <span className="text-xs font-medium text-text-primary">
                  Contenu stocké
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2 text-xs">
                  <FolderOpen size={12} className="text-text-tertiary" />
                  <span className="text-text-secondary">Enquêtes</span>
                  <span className="ml-auto text-text-primary tabular-nums">
                    {storageInfo.investigationCount}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <FileText size={12} className="text-text-tertiary" />
                  <span className="text-text-secondary">Éléments</span>
                  <span className="ml-auto text-text-primary tabular-nums">
                    {storageInfo.elementCount.toLocaleString('fr-FR')}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Link2 size={12} className="text-text-tertiary" />
                  <span className="text-text-secondary">Liens</span>
                  <span className="ml-auto text-text-primary tabular-nums">
                    {storageInfo.linkCount.toLocaleString('fr-FR')}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Image size={12} className="text-text-tertiary" />
                  <span className="text-text-secondary">Fichiers</span>
                  <span className="ml-auto text-text-primary tabular-nums">
                    {storageInfo.assetCount.toLocaleString('fr-FR')}
                  </span>
                </div>
              </div>
            </div>

            {/* Backup section */}
            <div className="p-3 bg-bg-secondary rounded border border-border-default">
              <div className="flex items-center gap-2 mb-3">
                <Download size={14} className="text-text-secondary" />
                <span className="text-xs font-medium text-text-primary">
                  Sauvegarde complète
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
                  Exporter tout
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
                  Importer
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
                Toutes les enquêtes, fichiers et tags. L'import ajoute sans remplacer.
              </p>
            </div>

            {/* Refresh button */}
            <div className="flex justify-end">
              <button
                onClick={loadStorageInfo}
                className="flex items-center gap-1 px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded"
              >
                <RefreshCw size={12} />
                Actualiser
              </button>
            </div>
          </>
        ) : (
          <div className="text-center py-8">
            <p className="text-sm text-text-tertiary">
              Impossible de récupérer les informations de stockage
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
