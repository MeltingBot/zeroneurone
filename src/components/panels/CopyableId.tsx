import { useTranslation } from 'react-i18next';
import { toast } from '../../stores';

/**
 * Id of an element or link, shown small at the foot of the detail panel:
 * a click copies it (for a ZNQuery `_id = "…"`, for instance).
 */
export function CopyableId({ id }: { id: string }) {
  const { t } = useTranslation('panels');
  const copy = () => {
    navigator.clipboard.writeText(id)
      .then(() => toast.success(t('detail.timestamps.idCopied')))
      .catch(() => {});
  };
  return (
    <button
      type="button"
      onClick={copy}
      title={id}
      className="mt-1 block max-w-full truncate text-left font-mono text-[10px] text-text-tertiary hover:text-text-secondary"
    >
      _id {id}
    </button>
  );
}
