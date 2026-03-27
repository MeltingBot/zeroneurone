import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryStore } from '../../stores/queryStore';
import { useDossierStore } from '../../stores/dossierStore';
import { RESERVED_FIELDS, OPERATOR_SYMBOLS } from '../../services/query/types';
import type { QueryCondition, QueryOperator } from '../../services/query/types';
import { Plus, X, ToggleLeft, ToggleRight } from 'lucide-react';

// ── Condition Row ──

interface ConditionRowProps {
  condition: QueryCondition;
  onChange: (cond: QueryCondition) => void;
  onRemove: () => void;
  availableFields: string[];
  availableTags: string[];
}

function ConditionRow({ condition, onChange, onRemove, availableFields, availableTags }: ConditionRowProps) {
  const { t } = useTranslation('panels');
  const isExistence = condition.operator === 'exists' || condition.operator === 'not_exists';

  const handleFieldChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({ ...condition, field: e.target.value });
  }, [condition, onChange]);

  const handleOperatorChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const op = e.target.value as QueryOperator;
    const isExist = op === 'exists' || op === 'not_exists';
    onChange({ ...condition, operator: op, value: isExist ? null : condition.value ?? '' });
  }, [condition, onChange]);

  const handleValueChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const raw = e.target.value;
    // Try to parse as number
    const num = parseFloat(raw);
    if (!isNaN(num) && String(num) === raw) {
      onChange({ ...condition, value: num });
    } else if (raw === 'true') {
      onChange({ ...condition, value: true });
    } else if (raw === 'false') {
      onChange({ ...condition, value: false });
    } else {
      onChange({ ...condition, value: raw });
    }
  }, [condition, onChange]);

  const operators: QueryOperator[] = ['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'contains', 'starts', 'ends', 'matches', 'exists', 'not_exists'];

  const isTagField = ['tag', 'from.tag', 'to.tag'].includes(condition.field.toLowerCase());

  return (
    <div className="flex items-center gap-1 py-1">
      {/* Field select */}
      <select
        value={condition.field}
        onChange={handleFieldChange}
        className="flex-1 min-w-0 px-2 py-1 text-xs rounded border border-border-default bg-bg-primary text-text-primary outline-none focus:border-accent"
      >
        <option value="">{t('query.selectField')}</option>
        <optgroup label={t('query.systemFields')}>
          {[...RESERVED_FIELDS].map(f => (
            <option key={f} value={f}>{f}</option>
          ))}
        </optgroup>
        {availableFields.length > 0 && (
          <optgroup label={t('query.properties')}>
            {availableFields.map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </optgroup>
        )}
      </select>

      {/* Operator select */}
      <select
        value={condition.operator}
        onChange={handleOperatorChange}
        className="w-20 px-1 py-1 text-xs rounded border border-border-default bg-bg-primary text-text-primary outline-none focus:border-accent"
      >
        {operators.map(op => (
          <option key={op} value={op}>{OPERATOR_SYMBOLS[op]}</option>
        ))}
      </select>

      {/* Value input */}
      {!isExistence && (
        isTagField && availableTags.length > 0 ? (
          <select
            value={String(condition.value ?? '')}
            onChange={handleValueChange}
            className="flex-1 min-w-0 px-2 py-1 text-xs rounded border border-border-default bg-bg-primary text-text-primary outline-none focus:border-accent"
          >
            <option value="">{t('query.selectValue')}</option>
            {availableTags.map(tag => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={condition.value instanceof Date
              ? condition.value.toISOString().slice(0, 10)
              : String(condition.value ?? '')}
            onChange={handleValueChange}
            placeholder={t('query.valuePlaceholder')}
            className="flex-1 min-w-0 px-2 py-1 text-xs rounded border border-border-default bg-bg-primary text-text-primary outline-none focus:border-accent"
          />
        )
      )}

      {/* Remove button */}
      <button
        onClick={onRemove}
        className="p-1 text-text-tertiary hover:text-error rounded hover:bg-bg-secondary transition-colors"
      >
        <X size={12} />
      </button>
    </div>
  );
}

// ── Visual Builder ──

export function QueryBuilderVisual() {
  const { t } = useTranslation('panels');
  const currentAst = useQueryStore((s) => s.currentAst);
  const setAst = useQueryStore((s) => s.setAst);
  const elements = useDossierStore((s) => s.elements);
  const links = useDossierStore((s) => s.links);

  // Collect available property keys
  const availableFields = useMemo(() => {
    const keys = new Set<string>();
    for (const el of elements.values()) {
      for (const p of el.properties) keys.add(p.key);
    }
    for (const lk of links.values()) {
      for (const p of lk.properties) keys.add(p.key);
    }
    return [...keys].sort();
  }, [elements, links]);

  // Collect available tags
  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    for (const el of elements.values()) {
      for (const t of el.tags) if (t) tags.add(t);
    }
    return [...tags].sort();
  }, [elements]);

  // Parse AST into flat conditions with combinator
  // Default: AND group with conditions
  const { combinator, conditions } = useMemo(() => {
    if (!currentAst) return { combinator: 'and' as const, conditions: [] as QueryCondition[] };

    if (currentAst.type === 'condition') {
      return { combinator: 'and' as const, conditions: [currentAst] };
    }
    if (currentAst.type === 'and' || currentAst.type === 'or') {
      const conds = currentAst.children.filter((c): c is QueryCondition => c.type === 'condition');
      return { combinator: currentAst.type, conditions: conds };
    }
    // Complex AST: show as single condition group (lossy for deeply nested)
    return { combinator: 'and' as const, conditions: [] as QueryCondition[] };
  }, [currentAst]);

  const rebuildAst = useCallback((conds: QueryCondition[], comb: 'and' | 'or') => {
    if (conds.length === 0) {
      setAst(null);
    } else if (conds.length === 1) {
      setAst(conds[0]);
    } else {
      setAst({ type: comb, children: conds });
    }
  }, [setAst]);

  const handleConditionChange = useCallback((index: number, cond: QueryCondition) => {
    const newConds = [...conditions];
    newConds[index] = cond;
    rebuildAst(newConds, combinator);
  }, [conditions, combinator, rebuildAst]);

  const handleRemoveCondition = useCallback((index: number) => {
    const newConds = conditions.filter((_, i) => i !== index);
    rebuildAst(newConds, combinator);
  }, [conditions, combinator, rebuildAst]);

  const handleAddCondition = useCallback(() => {
    const newCond: QueryCondition = { type: 'condition', field: '', operator: 'eq', value: '' };
    rebuildAst([...conditions, newCond], combinator);
  }, [conditions, combinator, rebuildAst]);

  const handleToggleCombinator = useCallback(() => {
    const newComb = combinator === 'and' ? 'or' : 'and';
    rebuildAst(conditions, newComb);
  }, [conditions, combinator, rebuildAst]);

  return (
    <div className="p-3">
      {/* Combinator toggle */}
      {conditions.length > 1 && (
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={handleToggleCombinator}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border border-border-default hover:bg-bg-secondary transition-colors"
          >
            {combinator === 'and' ? (
              <><ToggleLeft size={12} /> AND</>
            ) : (
              <><ToggleRight size={12} /> OR</>
            )}
          </button>
          <span className="text-xs text-text-tertiary">
            {combinator === 'and' ? t('query.allConditions') : t('query.anyCondition')}
          </span>
        </div>
      )}

      {/* Conditions */}
      <div className="space-y-0.5">
        {conditions.map((cond, i) => (
          <div key={i}>
            {i > 0 && (
              <div className="text-[10px] text-text-tertiary uppercase font-medium py-0.5 px-1">
                {combinator.toUpperCase()}
              </div>
            )}
            <ConditionRow
              condition={cond}
              onChange={(c) => handleConditionChange(i, c)}
              onRemove={() => handleRemoveCondition(i)}
              availableFields={availableFields}
              availableTags={availableTags}
            />
          </div>
        ))}
      </div>

      {/* Add condition */}
      <button
        onClick={handleAddCondition}
        className="flex items-center gap-1 mt-2 px-2 py-1.5 text-xs text-text-secondary hover:text-text-primary rounded border border-dashed border-border-default hover:border-accent hover:bg-bg-secondary transition-colors w-full justify-center"
      >
        <Plus size={12} />
        {t('query.addCondition')}
      </button>

      {/* Empty state */}
      {conditions.length === 0 && (
        <p className="mt-4 text-xs text-text-tertiary text-center">
          {t('query.emptyVisual')}
        </p>
      )}
    </div>
  );
}
