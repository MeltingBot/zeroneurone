/**
 * PresenceAvatars - Shows connected users with their colors
 */

import { useSyncStore } from '../../stores';

interface AvatarProps {
  name: string;
  color: string;
  isLocal?: boolean;
}

function Avatar({ name, color, isLocal }: AvatarProps) {
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
      title={isLocal ? `${name} (vous)` : name}
    >
      <span className="text-white drop-shadow-sm">{initials}</span>
    </div>
  );
}

export function PresenceAvatars() {
  const { mode, localUser, remoteUsers } = useSyncStore();

  // Don't show in local mode
  if (mode === 'local') {
    return null;
  }

  const allUsers = [
    { ...localUser, isLocal: true },
    ...remoteUsers.map(u => ({ id: u.odUserId, name: u.name, color: u.color, isLocal: false })),
  ];

  // Limit display to 5 users, show +N for overflow
  const displayUsers = allUsers.slice(0, 5);
  const overflowCount = allUsers.length - 5;

  return (
    <div className="flex items-center -space-x-2">
      {displayUsers.map((user) => (
        <Avatar
          key={user.id}
          name={user.name}
          color={user.color}
          isLocal={user.isLocal}
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
          title={`+${overflowCount} autres`}
        >
          +{overflowCount}
        </div>
      )}
    </div>
  );
}
