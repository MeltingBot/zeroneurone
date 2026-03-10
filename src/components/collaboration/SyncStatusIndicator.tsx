/**
 * SyncStatusIndicator - Shows sync status (local, connected, syncing, reconnecting, error)
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Wifi, WifiOff, RefreshCw, AlertCircle, X, RotateCcw, Download } from 'lucide-react';
import { useSyncStore } from '../../stores';
import type { MediaSyncProgress } from '../../stores/syncStore';
import { Modal, Button } from '../common';

/** Format bytes to human readable string */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/** Truncate filename for display */
function truncateFilename(name: string, maxLen = 20): string {
  if (name.length <= maxLen) return name;
  const ext = name.lastIndexOf('.');
  if (ext > 0 && name.length - ext <= 5) {
    const extStr = name.slice(ext);
    const base = name.slice(0, maxLen - extStr.length - 1);
    return base + '\u2026' + extStr;
  }
  return name.slice(0, maxLen - 1) + '\u2026';
}

/** Media sync progress badge - shown independently of connection status */
function MediaSyncBadge({ progress }: { progress: MediaSyncProgress }) {
  const { t } = useTranslation('panels');
  const progressPercent = Math.round((progress.completed / progress.total) * 100);

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 text-xs text-warning bg-bg-secondary rounded border border-border-default"
      title={t('collaboration.filesProgress', { completed: progress.completed, total: progress.total })}
    >
      <Download size={14} className="animate-pulse flex-shrink-0" />
      <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-1">
          <span className="font-medium">
            {progress.completed}/{progress.total}
          </span>
          <span className="text-text-tertiary">({progressPercent}%)</span>
          {progress.failed > 0 && (
            <span className="text-error font-medium" title={t('collaboration.filesFailed', { count: progress.failed })}>
              {progress.failed} err
            </span>
          )}
        </div>
        {progress.currentAsset && (
          <span className="text-text-tertiary text-[10px] truncate" title={progress.currentAsset}>
            {truncateFilename(progress.currentAsset)}
          </span>
        )}
        <span className="text-text-tertiary text-[10px]">
          {formatBytes(progress.completedSize)} / {formatBytes(progress.totalSize)}
        </span>
      </div>
    </div>
  );
}

export function SyncStatusIndicator() {
  const { t } = useTranslation('panels');
  const { mode, connected, syncing, reconnecting, error, unshare, mediaSyncProgress } = useSyncStore();
  const [showWarning, setShowWarning] = useState(false);

  const handleDisconnect = () => {
    setShowWarning(true);
  };

  const handleConfirmDisconnect = () => {
    setShowWarning(false);
    unshare();
  };

  // Determine connection status content
  let connectionStatus: React.ReactNode;

  if (mode === 'local') {
    connectionStatus = (
      <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-text-tertiary">
        <WifiOff size={14} />
        <span>{t('collaboration.local')}</span>
      </div>
    );
  } else if (error && !reconnecting) {
    connectionStatus = (
      <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-error" title={error}>
        <AlertCircle size={14} />
        <span>{t('collaboration.error')}</span>
      </div>
    );
  } else if (reconnecting) {
    connectionStatus = (
      <div
        className="flex items-center gap-1.5 px-2 py-1 text-xs text-warning"
        title={t('collaboration.reconnectingTitle')}
      >
        <RotateCcw size={14} className="animate-spin" />
        <span>{t('collaboration.reconnecting')}</span>
      </div>
    );
  } else if (syncing) {
    connectionStatus = (
      <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-warning">
        <RefreshCw size={14} className="animate-spin" />
        <span>{t('collaboration.syncing')}</span>
      </div>
    );
  } else if (connected) {
    connectionStatus = (
      <div className="flex items-center gap-1 px-2 py-1 text-xs text-success" title={t('collaboration.connected')}>
        <Wifi size={14} />
        <button
          onClick={handleDisconnect}
          className="ml-1 p-0.5 rounded hover:bg-bg-tertiary text-text-tertiary hover:text-error transition-colors"
          title={t('collaboration.disconnectTitle')}
        >
          <X size={12} />
        </button>
      </div>
    );
  } else {
    connectionStatus = (
      <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-text-secondary">
        <RefreshCw size={14} className="animate-spin" />
        <span>{t('collaboration.connecting')}</span>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Media sync badge - visible in any non-local state */}
        {mode !== 'local' && mediaSyncProgress && (
          <MediaSyncBadge progress={mediaSyncProgress} />
        )}
        {connectionStatus}
      </div>
      <Modal
        isOpen={showWarning}
        onClose={() => setShowWarning(false)}
        title={t('collaboration.disconnectTitle')}
        width="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowWarning(false)}>
              {t('collaboration.cancel')}
            </Button>
            <Button variant="primary" onClick={handleConfirmDisconnect}>
              {t('collaboration.disconnect')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-secondary">
          {t('collaboration.disconnectWarning')}
        </p>
        <p className="text-sm text-text-secondary mt-2">
          {t('collaboration.disconnectResume')}
        </p>
      </Modal>
    </>
  );
}
