import { useTranslation } from 'react-i18next';
import { Modal, Button } from '../common';
import { HardDrive, AlertTriangle, Download } from 'lucide-react';

const STORAGE_KEY = 'zeroneurone_local_storage_acknowledged';

interface LocalStorageDisclaimerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept: () => void;
}

export function LocalStorageDisclaimerModal({
  isOpen,
  onClose,
  onAccept,
}: LocalStorageDisclaimerModalProps) {
  const { t } = useTranslation('modals');

  const handleAccept = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    onAccept();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('localStorage.title')}>
      <div className="space-y-5">
        {/* Icon and intro */}
        <div className="flex items-start gap-4">
          <div className="p-3 bg-warning/10 rounded">
            <HardDrive size={24} className="text-warning" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-text-primary font-medium mb-1">
              {t('localStorage.warning')}
            </p>
            <p className="text-sm text-text-secondary">
              {t('localStorage.description')}
            </p>
          </div>
        </div>

        {/* Warning box */}
        <div className="bg-warning/5 border border-warning/20 rounded p-4 space-y-3">
          <div className="flex items-center gap-2 text-warning">
            <AlertTriangle size={16} />
            <span className="text-sm font-medium">{t('common:status.warning')}</span>
          </div>
          <ul className="text-sm text-text-secondary space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-warning mt-0.5">•</span>
              <span dangerouslySetInnerHTML={{ __html: t('localStorage.bullets.deleted') }} />
            </li>
            <li className="flex items-start gap-2">
              <span className="text-warning mt-0.5">•</span>
              <span dangerouslySetInnerHTML={{ __html: t('localStorage.bullets.notSynced') }} />
            </li>
            <li className="flex items-start gap-2">
              <span className="text-warning mt-0.5">•</span>
              <span dangerouslySetInnerHTML={{ __html: t('localStorage.bullets.privateMode') }} />
            </li>
          </ul>
        </div>

        {/* Recommendation */}
        <div className="flex items-start gap-3 p-3 bg-bg-secondary rounded">
          <Download size={18} className="text-accent mt-0.5" />
          <p className="text-sm text-text-secondary">
            {t('localStorage.recommendation')}
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button variant="primary" onClick={handleAccept} data-testid="disclaimer-accept">
            {t('localStorage.acknowledge')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Check if the user has already acknowledged the local storage disclaimer
 */
export function hasAcknowledgedLocalStorage(): boolean {
  return localStorage.getItem(STORAGE_KEY) === 'true';
}
