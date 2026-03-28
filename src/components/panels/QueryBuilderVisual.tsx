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

// ── Field type helpers for operator filtering ──

type FieldCategory = 'string' | 'number' | 'date' | 'boolean' | 'geo' | 'any';

const FIELD_CATEGORIES: Record<string, FieldCategory> = {
  label: 'string', notes: 'string', tag: 'string', source: 'string',
  confidence: 'number', type: 'string', country: 'string',
  date: 'date', 'date.start': 'date', 'date.end': 'date',
  created: 'date', updated: 'date',
  has_geo: 'boolean', group: 'boolean', directed: 'boolean',
  'from.label': 'string', 'from.tag': 'string',
  'to.label': 'string', 'to.tag': 'string',
  'geo.lat': 'number', 'geo.lng': 'number',
  'event.date': 'date', 'event.date.end': 'date',
  'event.label': 'string', 'event.description': 'string',
  'event.source': 'string',
  'event.geo': 'geo', 'event.geo.lat': 'number', 'event.geo.lng': 'number',
};

function getOperatorsForField(field: string): QueryOperator[] {
  const cat = FIELD_CATEGORIES[field.toLowerCase()] || 'any';
  const base: QueryOperator[] = ['eq', 'neq', 'exists', 'not_exists'];
  switch (cat) {
    case 'number':
    case 'date':
      return [...base, 'gt', 'lt', 'gte', 'lte'];
    case 'string':
      return [...base, 'gt', 'lt', 'gte', 'lte', 'contains', 'starts', 'ends', 'matches'];
    case 'boolean':
      return base;
    case 'geo':
      return [...base, 'near'];
    default:
      return [...base, 'gt', 'lt', 'gte', 'lte', 'contains', 'starts', 'ends', 'matches'];
  }
}

// Check if a field is a geo-capable field (for NEAR)
function isGeoField(field: string): boolean {
  const lower = field.toLowerCase();
  return lower === 'geo' || lower === 'has_geo' || lower === 'event.geo';
}

// ── NEAR value helpers ──

function parseNearDisplayValue(value: unknown): { lat: string; lng: string; radius: string; unit: string } {
  if (typeof value === 'string' && value.includes(',')) {
    const parts = value.split(',');
    if (parts.length === 3) {
      const radiusKm = parseFloat(parts[2]);
      if (radiusKm < 1) {
        return { lat: parts[0], lng: parts[1], radius: String(Math.round(radiusKm * 1000)), unit: 'm' };
      }
      return { lat: parts[0], lng: parts[1], radius: parts[2], unit: 'km' };
    }
  }
  return { lat: '', lng: '', radius: '10', unit: 'km' };
}

function buildNearValue(lat: string, lng: string, radius: string, unit: string): string {
  const r = parseFloat(radius) || 10;
  const radiusKm = unit === 'm' ? r / 1000 : r;
  return `${lat || 0},${lng || 0},${radiusKm}`;
}

function ConditionRow({ condition, onChange, onRemove, availableFields, availableTags }: ConditionRowProps) {
  const { t } = useTranslation('panels');
  const isExistence = condition.operator === 'exists' || condition.operator === 'not_exists';
  const isNear = condition.operator === 'near';
  const geoField = isGeoField(condition.field);

  const handleFieldChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const newField = e.target.value;
    const newOps = getOperatorsForField(newField);
    // If current operator isn't valid for new field, reset to 'eq'
    const newOp = newOps.includes(condition.operator) ? condition.operator : 'eq';
    onChange({ ...condition, field: newField, operator: newOp });
  }, [condition, onChange]);

  const handleOperatorChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const op = e.target.value as QueryOperator;
    const isExist = op === 'exists' || op === 'not_exists';
    if (op === 'near') {
      onChange({ ...condition, operator: op, value: '0,0,10' });
    } else {
      onChange({ ...condition, operator: op, value: isExist ? null : condition.value ?? '' });
    }
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

  const operators = useMemo(() => {
    const ops = getOperatorsForField(condition.field);
    // Also add NEAR for geo fields if not already included
    if (geoField && !ops.includes('near')) ops.push('near');
    return ops;
  }, [condition.field, geoField]);

  const isTagField = ['tag', 'from.tag', 'to.tag'].includes(condition.field.toLowerCase());
  const fieldCategory = FIELD_CATEGORIES[condition.field.toLowerCase()] || 'any';
  const isBooleanField = fieldCategory === 'boolean';
  const isDateField = fieldCategory === 'date';
  const isNumberField = fieldCategory === 'number';

  // NEAR value parts
  const nearParts = isNear ? parseNearDisplayValue(condition.value) : null;

  const handleNearPartChange = useCallback((part: 'lat' | 'lng' | 'radius' | 'unit', val: string) => {
    if (!nearParts) return;
    const updated = { ...nearParts, [part]: val };
    onChange({ ...condition, value: buildNearValue(updated.lat, updated.lng, updated.radius, updated.unit) });
  }, [condition, onChange, nearParts]);

  const handleDateChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value; // "YYYY-MM-DD"
    if (raw) {
      onChange({ ...condition, value: new Date(raw + 'T00:00:00') });
    } else {
      onChange({ ...condition, value: '' });
    }
  }, [condition, onChange]);

  const handleBooleanChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({ ...condition, value: e.target.value === 'true' });
  }, [condition, onChange]);

  const handleNumberChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const num = parseFloat(raw);
    onChange({ ...condition, value: isNaN(num) ? raw : num });
  }, [condition, onChange]);

  const inputClass = "flex-1 min-w-0 px-2 py-1 text-xs rounded border border-border-default bg-bg-primary text-text-primary outline-none focus:border-accent";

  // Format date value for input[type="date"]
  const dateInputValue = useMemo(() => {
    const v = condition.value;
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
    return '';
  }, [condition.value]);

  // Render the appropriate value input
  const renderValueInput = () => {
    if (isExistence) return null;

    // NEAR: lat, lng, radius, unit
    if (isNear && nearParts) {
      const smallInput = "w-16 px-1 py-1 text-xs rounded border border-border-default bg-bg-primary text-text-primary outline-none focus:border-accent";
      return (
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <input type="number" step="any" value={nearParts.lat} onChange={(e) => handleNearPartChange('lat', e.target.value)} placeholder="lat" className={smallInput} />
          <span className="text-xs text-text-tertiary">,</span>
          <input type="number" step="any" value={nearParts.lng} onChange={(e) => handleNearPartChange('lng', e.target.value)} placeholder="lng" className={smallInput} />
          <input type="number" step="any" min="0" value={nearParts.radius} onChange={(e) => handleNearPartChange('radius', e.target.value)} placeholder="10" className="w-14 px-1 py-1 text-xs rounded border border-border-default bg-bg-primary text-text-primary outline-none focus:border-accent" />
          <select value={nearParts.unit} onChange={(e) => handleNearPartChange('unit', e.target.value)} className="w-12 px-1 py-1 text-xs rounded border border-border-default bg-bg-primary text-text-primary outline-none focus:border-accent">
            <option value="km">km</option>
            <option value="m">m</option>
          </select>
        </div>
      );
    }

    // Boolean: true/false select
    if (isBooleanField) {
      return (
        <select value={String(condition.value ?? '')} onChange={handleBooleanChange} className={inputClass}>
          <option value="">—</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      );
    }

    // Tag: select from existing tags
    if (isTagField && availableTags.length > 0) {
      return (
        <select value={String(condition.value ?? '')} onChange={handleValueChange} className={inputClass}>
          <option value="">{t('query.selectValue')}</option>
          {availableTags.map(tag => (
            <option key={tag} value={tag}>{tag}</option>
          ))}
        </select>
      );
    }

    // Date: native date picker
    if (isDateField) {
      return <input type="date" value={dateInputValue} onChange={handleDateChange} className={inputClass} />;
    }

    // Number: numeric input
    if (isNumberField) {
      return <input type="number" step="any" value={String(condition.value ?? '')} onChange={handleNumberChange} placeholder={t('query.valuePlaceholder')} className={inputClass} />;
    }

    // Default: text input
    return (
      <input
        type="text"
        value={condition.value instanceof Date ? condition.value.toISOString().slice(0, 10) : String(condition.value ?? '')}
        onChange={handleValueChange}
        placeholder={t('query.valuePlaceholder')}
        className={inputClass}
      />
    );
  };

  return (
    <div className="flex items-center gap-1 py-1 flex-wrap">
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

      {/* Value input — adapts to field type */}
      {renderValueInput()}

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
