/**
 * SyncStatusIndicator - Shows sync status (local, connected, syncing, reconnecting, error)
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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

  // Determine status content
  let statusContent: React.ReactNode;

  if (mode === 'local') {
    statusContent = (
      <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-text-tertiary">
        <WifiOff size={14} />
        <span>{t('collaboration.local')}</span>
      </div>
    );
  } else if (error && !reconnecting) {
    statusContent = (
      <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-error" title={error}>
        <AlertCircle size={14} />
        <span>{t('collaboration.error')}</span>
      </div>
    );
  } else if (reconnecting) {
    statusContent = (
      <div
        className="flex items-center gap-1.5 px-2 py-1 text-xs text-warning"
        title={t('collaboration.reconnectingTitle')}
      >
        <RotateCcw size={14} className="animate-spin" />
        <span>{t('collaboration.reconnecting')}</span>
      </div>
    );
  } else if (syncing) {
    statusContent = (
      <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-warning">
        <RefreshCw size={14} className="animate-spin" />
        <span>{t('collaboration.syncing')}</span>
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
            title={mediaSyncProgress.currentAsset || t('collaboration.filesProgress', { completed: mediaSyncProgress.completed, total: mediaSyncProgress.total })}
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
      </div>
    );
  } else {
    statusContent = (
      <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-text-secondary">
        <RefreshCw size={14} className="animate-spin" />
        <span>{t('collaboration.connecting')}</span>
      </div>
    );
  }

  return (
    <>
      {statusContent}
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
