/**
 * SyncStatusIndicator - Shows sync status (local, connected, syncing, reconnecting, error)
 */

import { useState } from 'react';
import { Wifi, WifiOff, RefreshCw, AlertCircle, X, RotateCcw, Download } from 'lucide-react';
import { useSyncStore } from '../../stores';
import { Modal, Button } from '../common';

/** Format bytes to human readable string */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function SyncStatusIndicator() {
  const { mode, connected, syncing, reconnecting, error, unshare, mediaSyncProgress } = useSyncStore();
  const [showWarning, setShowWarning] = useState(false);

  const handleDisconnect = () => {
    setShowWarning(true);
  };

  const handleConfirmDisconnect = () => {
    setShowWarning(false);
    unshare();
  };

  // Determine status content
  let statusContent: React.ReactNode;

  if (mode === 'local') {
    statusContent = (
      <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-text-tertiary">
        <WifiOff size={14} />
        <span>Local</span>
      </div>
    );
  } else if (error && !reconnecting) {
    statusContent = (
      <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-error" title={error}>
        <AlertCircle size={14} />
        <span>Erreur</span>
      </div>
    );
  } else if (reconnecting) {
    statusContent = (
      <div
        className="flex items-center gap-1.5 px-2 py-1 text-xs text-warning"
        title="Connexion perdue, tentative de reconnexion..."
      >
        <RotateCcw size={14} className="animate-spin" />
        <span>Reconnexion...</span>
      </div>
    );
  } else if (syncing) {
    statusContent = (
      <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-warning">
        <RefreshCw size={14} className="animate-spin" />
        <span>Sync...</span>
      </div>
    );
  } else if (connected) {
    const progressPercent = mediaSyncProgress
      ? Math.round((mediaSyncProgress.completed / mediaSyncProgress.total) * 100)
      : 0;

    statusContent = (
      <div className="flex items-center gap-2">
        {mediaSyncProgress && (
          <div
            className="flex items-center gap-1.5 px-2 py-1 text-xs text-warning bg-bg-secondary rounded border border-border-default"
            title={mediaSyncProgress.currentAsset || `${mediaSyncProgress.completed}/${mediaSyncProgress.total} fichiers`}
          >
            <Download size={14} className="animate-pulse" />
            <div className="flex flex-col">
              <span className="font-medium">
                {mediaSyncProgress.completed}/{mediaSyncProgress.total} ({progressPercent}%)
              </span>
              <span className="text-text-tertiary text-[10px]">
                {formatBytes(mediaSyncProgress.completedSize)} / {formatBytes(mediaSyncProgress.totalSize)}
              </span>
            </div>
          </div>
        )}
        <div className="flex items-center gap-1 px-2 py-1 text-xs text-success" title="Connecté">
          <Wifi size={14} />
          <button
            onClick={handleDisconnect}
            className="ml-1 p-0.5 rounded hover:bg-bg-tertiary text-text-tertiary hover:text-error transition-colors"
            title="Se déconnecter du partage"
          >
            <X size={12} />
          </button>
        </div>
      </div>
    );
  } else {
    statusContent = (
      <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-text-secondary">
        <RefreshCw size={14} className="animate-spin" />
        <span>Connexion...</span>
      </div>
    );
  }

  return (
    <>
      {statusContent}
      <Modal
        isOpen={showWarning}
        onClose={() => setShowWarning(false)}
        title="Se déconnecter du partage"
        width="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowWarning(false)}>
              Annuler
            </Button>
            <Button variant="primary" onClick={handleConfirmDisconnect}>
              Se déconnecter
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-secondary">
          Les autres participants pourront toujours utiliser le lien de partage pour synchroniser leurs modifications et reprendre la collaboration.
        </p>
        <p className="text-sm text-text-secondary mt-2">
          Vous pourrez rejoindre la session plus tard via le meme lien.
        </p>
      </Modal>
    </>
  );
}
