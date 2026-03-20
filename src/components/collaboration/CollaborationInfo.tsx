import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Share2 } from 'lucide-react';
import { LocalUserAvatar } from './LocalUserAvatar';
import { SyncStatusIndicator } from './SyncStatusIndicator';
import { PresenceAvatars } from './PresenceAvatars';
import { ShareModal } from './ShareModal';

export function CollaborationInfo() {
  const { t } = useTranslation('pages');
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  return (
    <>
      <LocalUserAvatar />
      <div className="w-px h-4 bg-border-default" />
      <SyncStatusIndicator />
      <PresenceAvatars />
      <button
        onClick={() => setIsShareModalOpen(true)}
        className="p-1.5 text-text-secondary hover:bg-bg-tertiary rounded transition-colors"
        title={t('dossier.toolbar.share')}
      >
        <Share2 size={16} />
      </button>
      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
      />
    </>
  );
}
