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
  const handleAccept = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    onAccept();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Stockage local des donnees">
      <div className="space-y-5">
        {/* Icon and intro */}
        <div className="flex items-start gap-4">
          <div className="p-3 bg-warning/10 rounded">
            <HardDrive size={24} className="text-warning" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-text-primary font-medium mb-1">
              Vos donnees sont stockees localement
            </p>
            <p className="text-sm text-text-secondary">
              Toutes les enquetes et fichiers sont enregistres dans le stockage
              de votre navigateur (IndexedDB et OPFS).
            </p>
          </div>
        </div>

        {/* Warning box */}
        <div className="bg-warning/5 border border-warning/20 rounded p-4 space-y-3">
          <div className="flex items-center gap-2 text-warning">
            <AlertTriangle size={16} />
            <span className="text-sm font-medium">Important</span>
          </div>
          <ul className="text-sm text-text-secondary space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-warning mt-0.5">•</span>
              <span>
                Les donnees peuvent etre <strong className="text-text-primary">supprimees</strong> si
                vous videz le cache de votre navigateur
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-warning mt-0.5">•</span>
              <span>
                Les donnees ne sont <strong className="text-text-primary">pas synchronisees</strong> entre
                vos appareils
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-warning mt-0.5">•</span>
              <span>
                En navigation privee, les donnees seront <strong className="text-text-primary">perdues</strong> a
                la fermeture
              </span>
            </li>
          </ul>
        </div>

        {/* Recommendation */}
        <div className="flex items-start gap-3 p-3 bg-bg-secondary rounded">
          <Download size={18} className="text-accent mt-0.5" />
          <p className="text-sm text-text-secondary">
            <strong className="text-text-primary">Recommandation :</strong> Exportez
            regulierement vos enquetes via le bouton "Exporter" pour conserver
            une sauvegarde de vos donnees.
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" onClick={handleAccept}>
            J'ai bien compris
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
