import { useTranslation } from 'react-i18next';
import { useProgressStore } from '../../stores/progressStore';

/**
 * Thin accent line under a view toolbar while a long computation runs:
 * filled to the known progress, or a moving segment when it is unknown.
 * Several tasks: the least advanced one sets the fill; all are named on hover.
 */
export function ActivityBar() {
  const { t } = useTranslation('common');
  const tasks = Object.values(useProgressStore((s) => s.tasks));
  if (tasks.length === 0) return null;

  const known = tasks.filter((task) => task.percent !== null).map((task) => task.percent as number);
  const indeterminate = known.length < tasks.length;
  const percent = known.length > 0 ? Math.min(...known) : 0;
  const title = tasks
    .map((task) => (task.percent === null ? t(task.labelKey) : `${t(task.labelKey)} ${Math.round(task.percent)} %`))
    .join(' · ');

  return (
    <div
      className="absolute left-0 right-0 -bottom-px h-0.5 overflow-hidden z-20"
      role="progressbar"
      aria-label={title}
      aria-valuenow={indeterminate ? undefined : Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
      title={title}
    >
      {indeterminate ? (
        <div className="activity-bar-indeterminate h-full w-1/4 bg-accent" />
      ) : (
        <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${Math.max(2, percent)}%` }} />
      )}
    </div>
  );
}
