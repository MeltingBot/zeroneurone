import { useTranslation } from 'react-i18next';
import type { Evaluation, EvaluationScale } from '../../types';
import { EVALUATION_GRIDS, formatEvaluation, isInModel } from '../../utils/evaluation';

interface EvaluationInputProps {
  /** Current grading of the item (possibly in another scale) */
  value: Evaluation | null | undefined;
  /** Scale of the dossier's active model */
  scale: EvaluationScale;
  onChange: (next: Evaluation | null) => void;
}

const selectClass =
  'w-full px-2 py-1.5 text-sm rounded border border-border-default bg-bg-primary text-text-primary focus:outline-none focus:border-accent';

/**
 * Two-axis grading input (source reliability + information accuracy) for the
 * Europol and Admiralty models. A grading made in another scale is shown
 * greyed and replaced as soon as a code of the active scale is picked.
 */
export function EvaluationInput({ value, scale, onChange }: EvaluationInputProps) {
  const { t } = useTranslation('common');
  const grid = EVALUATION_GRIDS[scale];
  const inModel = isInModel(value, scale);
  const current = inModel ? value! : null;

  const update = (axis: 'source' | 'info', code: string) => {
    const next: Evaluation = {
      scale,
      source: current?.source ?? null,
      info: current?.info ?? null,
      [axis]: code || null,
    };
    onChange(next.source === null && next.info === null ? null : next);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-text-secondary">{t('evaluation.label')}</label>
        <span className="text-xs text-text-tertiary">
          {current ? formatEvaluation(current) : t('evaluation.notGraded')}
        </span>
      </div>

      {value && !inModel && (
        <div className="flex items-center justify-between gap-2 text-xs text-text-tertiary">
          <span>
            {t('evaluation.outOfModel', {
              scale: t(`evaluation.scales.${value.scale}`),
              code: formatEvaluation(value),
            })}
          </span>
          <button
            onClick={() => onChange(null)}
            className="px-1.5 py-0.5 text-xs text-text-secondary border border-border-default rounded hover:bg-bg-secondary"
          >
            {t('evaluation.clear')}
          </button>
        </div>
      )}

      <div className="space-y-1">
        <label className="text-xs text-text-secondary">{t('evaluation.sourceLabel')}</label>
        <select
          value={current?.source ?? ''}
          onChange={(e) => update('source', e.target.value)}
          title={current?.source ? t(`evaluation.${scale}.sourcesHelp.${current.source}`) : undefined}
          className={selectClass}
        >
          <option value="">{t('evaluation.notGraded')}</option>
          {grid.sources.map((code) => (
            <option key={code} value={code}>
              {code} — {t(`evaluation.${scale}.sources.${code}`)}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-text-secondary">{t('evaluation.infoLabel')}</label>
        <select
          value={current?.info ?? ''}
          onChange={(e) => update('info', e.target.value)}
          title={current?.info ? t(`evaluation.${scale}.infosHelp.${current.info}`) : undefined}
          className={selectClass}
        >
          <option value="">{t('evaluation.notGraded')}</option>
          {grid.infos.map((code) => (
            <option key={code} value={code}>
              {code} — {t(`evaluation.${scale}.infos.${code}`)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
