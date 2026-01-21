/**
 * SyncStatusIndicator - Shows sync status (local, connected, syncing, reconnecting, error)
 */

import { Wifi, WifiOff, RefreshCw, AlertCircle, X, RotateCcw, Download } from 'lucide-react';
import { useSyncStore } from '../../stores';

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

  const handleDisconnect = () => {
    unshare();
  };

  // Local mode - no indicator needed or minimal
  if (mode === 'local') {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-text-tertiary">
        <WifiOff size={14} />
        <span>Local</span>
      </div>
    );
  }

  // Shared mode with error (only show if not reconnecting)
  if (error && !reconnecting) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-error" title={error}>
        <AlertCircle size={14} />
        <span>Erreur</span>
      </div>
    );
  }

  // Shared mode, reconnecting after disconnect
  if (reconnecting) {
    return (
      <div
        className="flex items-center gap-1.5 px-2 py-1 text-xs text-warning"
        title="Connexion perdue, tentative de reconnexion..."
      >
        <RotateCcw size={14} className="animate-spin" />
        <span>Reconnexion...</span>
      </div>
    );
  }

  // Shared mode, syncing
  if (syncing) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-warning">
        <RefreshCw size={14} className="animate-spin" />
        <span>Sync...</span>
      </div>
    );
  }

  // Shared mode, connected - show icon and disconnect button
  if (connected) {
    // Calculate media sync progress percentage
    const progressPercent = mediaSyncProgress
      ? Math.round((mediaSyncProgress.completed / mediaSyncProgress.total) * 100)
      : 0;

    return (
      <div className="flex items-center gap-2">
        {/* Media sync progress indicator */}
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
        {/* Connection status */}
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
  }

  // Shared mode, connecting...
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-text-secondary">
      <RefreshCw size={14} className="animate-spin" />
      <span>Connexion...</span>
    </div>
  );
}
