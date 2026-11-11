/**
 * PresenceAvatars - Shows connected users with their colors
 */

import { useTranslation } from 'react-i18next';
import { Eye } from 'lucide-react';
import { useDossierStore, useSyncStore } from '../../stores';
import { useShallow } from 'zustand/react/shallow';

interface AvatarProps {
  name: string;
  color: string;
  isLocal?: boolean;
  reader?: boolean;
  youLabel: string;
  readerLabel: string;
}

function Avatar({ name, color, isLocal, reader, youLabel, readerLabel }: AvatarProps) {
  // Get initials (first letter of first two words)
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map(word => word[0]?.toUpperCase() || '')
    .join('');

  return (
    <div
      className={`
        relative flex items-center justify-center
        w-7 h-7 rounded-full text-xs font-medium
        border-2 border-bg-primary
        ${isLocal ? 'ring-2 ring-accent ring-offset-1 ring-offset-bg-primary' : ''}
      `}
      style={{ backgroundColor: color }}
      title={[name, isLocal ? `(${youLabel})` : null, reader ? `(${readerLabel})` : null].filter(Boolean).join(' ')}
      data-reader={reader ? 'true' : undefined}
    >
      <span className="text-white drop-shadow-sm">{initials}</span>
      {reader && (
        <span className="absolute -bottom-1 -right-1 flex items-center justify-center w-3.5 h-3.5 rounded-full bg-bg-primary text-text-secondary border border-border-default">
          <Eye size={9} />
        </span>
      )}
    </div>
  );
}

export function PresenceAvatars() {
  const { t } = useTranslation('panels');
  const { mode, localUser, remoteUsers } = useSyncStore(useShallow((s) => ({ mode: s.mode, localUser: s.localUser, remoteUsers: s.remoteUsers })));
  const isReader = useDossierStore((s) => s.isShareReadOnly);

  // Don't show in local mode
  if (mode === 'local') {
    return null;
  }

  const allUsers = [
    { ...localUser, isLocal: true, reader: isReader },
    ...remoteUsers.map(u => ({ id: u.odUserId, name: u.name, color: u.color, isLocal: false, reader: !!u.reader })),
  ];

  // Limit display to 5 users, show +N for overflow
  const displayUsers = allUsers.slice(0, 5);
  const overflowCount = allUsers.length - 5;

  const youLabel = t('collaboration.you');
  const othersLabel = t('collaboration.others');
  const readerLabel = t('collaboration.reader');

  return (
    <div className="flex items-center -space-x-2">
      {displayUsers.map((user) => (
        <Avatar
          key={user.id}
          name={user.name}
          color={user.color}
          isLocal={user.isLocal}
          reader={user.reader}
          youLabel={youLabel}
          readerLabel={readerLabel}
        />
      ))}
      {overflowCount > 0 && (
        <div
          className="
            flex items-center justify-center
            w-7 h-7 rounded-full text-xs font-medium
            bg-bg-tertiary text-text-secondary
            border-2 border-bg-primary
          "
          title={`+${overflowCount} ${othersLabel}`}
        >
          +{overflowCount}
        </div>
      )}
    </div>
  );
}
