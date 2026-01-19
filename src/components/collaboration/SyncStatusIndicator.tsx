/**
 * SyncStatusIndicator - Shows sync status (local, connected, syncing, reconnecting, error)
 */

import { Wifi, WifiOff, RefreshCw, AlertCircle, X, RotateCcw } from 'lucide-react';
import { useSyncStore } from '../../stores';

export function SyncStatusIndicator() {
  const { mode, connected, syncing, reconnecting, error, unshare } = useSyncStore();

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
    return (
      <div className="flex items-center gap-1 px-2 py-1 text-xs text-success">
        <Wifi size={14} title="Connecté" />
        <button
          onClick={handleDisconnect}
          className="ml-1 p-0.5 rounded hover:bg-bg-tertiary text-text-tertiary hover:text-error transition-colors"
          title="Se déconnecter du partage"
        >
          <X size={12} />
        </button>
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
