import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryStore } from '../../stores/queryStore';
import { useDossierStore } from '../../stores/dossierStore';
import { RESERVED_FIELDS, OPERATOR_SYMBOLS } from '../../services/query/types';
import type { QueryCondition, QueryOperator, QueryNode, QueryAnd, QueryOr, QueryNot } from '../../services/query/types';
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
      return [...base, 'gt', 'lt', 'gte', 'lte', 'in'];
    case 'string':
      return [...base, 'gt', 'lt', 'gte', 'lte', 'contains', 'starts', 'ends', 'matches', 'in'];
    case 'boolean':
      return base;
    case 'geo':
      return [...base, 'near'];
    default:
      return [...base, 'gt', 'lt', 'gte', 'lte', 'contains', 'starts', 'ends', 'matches', 'in'];
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
    <div className="py-1">
      <div className="flex items-center gap-1">
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
          className="w-20 shrink-0 px-1 py-1 text-xs rounded border border-border-default bg-bg-primary text-text-primary outline-none focus:border-accent"
        >
          {operators.map(op => (
            <option key={op} value={op}>{OPERATOR_SYMBOLS[op]}</option>
          ))}
        </select>

        {/* Value input — inline for simple types */}
        {!isNear && renderValueInput()}

        {/* Remove button */}
        <button
          onClick={onRemove}
          className="shrink-0 p-1 text-text-tertiary hover:text-error rounded hover:bg-bg-secondary transition-colors"
        >
          <X size={12} />
        </button>
      </div>

      {/* NEAR: value inputs on second row to avoid overflow */}
      {isNear && (
        <div className="mt-1 pl-1">
          {renderValueInput()}
        </div>
      )}
    </div>
  );
}

// ── Visual Group (recursive AND/OR with NOT support) ──

const MAX_GROUP_DEPTH = 2;

interface VisualGroupProps {
  node: QueryAnd | QueryOr;
  onChange: (node: QueryNode) => void;
  onRemove?: () => void;
  depth: number;
  availableFields: string[];
  availableTags: string[];
}

function VisualGroup({ node, onChange, onRemove, depth, availableFields, availableTags }: VisualGroupProps) {
  const { t } = useTranslation('panels');
  const combinator = node.type;

  const toggleCombinator = useCallback(() => {
    const newType = combinator === 'and' ? 'or' : 'and';
    onChange({ ...node, type: newType } as QueryAnd | QueryOr);
  }, [node, combinator, onChange]);

  const updateChild = useCallback((index: number, newChild: QueryNode) => {
    const newChildren = [...node.children];
    newChildren[index] = newChild;
    onChange({ ...node, children: newChildren });
  }, [node, onChange]);

  const removeChild = useCallback((index: number) => {
    const newChildren = node.children.filter((_, i) => i !== index);
    if (newChildren.length === 0) {
      if (onRemove) onRemove();
      else onChange({ type: 'and', children: [] });
    } else if (newChildren.length === 1 && depth > 0) {
      onChange(newChildren[0]); // unwrap single-child sub-group
    } else {
      onChange({ ...node, children: newChildren });
    }
  }, [node, onChange, onRemove, depth]);

  const addCondition = useCallback(() => {
    const newCond: QueryCondition = { type: 'condition', field: '', operator: 'eq', value: '' };
    onChange({ ...node, children: [...node.children, newCond] });
  }, [node, onChange]);

  const addGroup = useCallback(() => {
    const subType = combinator === 'and' ? 'or' : 'and';
    const subGroup: QueryNode = {
      type: subType,
      children: [{ type: 'condition', field: '', operator: 'eq', value: '' }],
    };
    onChange({ ...node, children: [...node.children, subGroup] });
  }, [node, combinator, onChange]);

  const toggleNot = useCallback((index: number) => {
    const child = node.children[index];
    if (child.type === 'not') {
      updateChild(index, (child as QueryNot).child);
    } else {
      updateChild(index, { type: 'not', child } as QueryNot);
    }
  }, [node.children, updateChild]);

  return (
    <div className={depth > 0 ? 'border-l-2 border-accent/20 pl-2 ml-1' : ''}>
      {/* Combinator toggle + group controls */}
      <div className="flex items-center gap-2 mb-1">
        {node.children.length > 1 && (
          <>
            <button
              onClick={toggleCombinator}
              className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded border border-border-default hover:bg-bg-secondary transition-colors"
            >
              {combinator === 'and' ? (
                <><ToggleLeft size={12} /> AND</>
              ) : (
                <><ToggleRight size={12} /> OR</>
              )}
            </button>
            <span className="text-[10px] text-text-tertiary">
              {combinator === 'and' ? t('query.allConditions') : t('query.anyCondition')}
            </span>
          </>
        )}
        {depth > 0 && onRemove && (
          <button
            onClick={onRemove}
            className="ml-auto p-0.5 text-text-tertiary hover:text-error rounded hover:bg-bg-secondary transition-colors"
            title={t('query.removeGroup')}
          >
            <X size={10} />
          </button>
        )}
      </div>

      {/* Children */}
      <div className="space-y-0.5">
        {node.children.map((child, i) => {
          const isNegated = child.type === 'not';
          const innerNode = isNegated ? (child as QueryNot).child : child;
          const isGroup = innerNode.type === 'and' || innerNode.type === 'or';

          return (
            <div key={i}>
              {i > 0 && (
                <div className="text-[10px] text-text-tertiary uppercase font-medium py-0.5 px-1">
                  {combinator.toUpperCase()}
                </div>
              )}
              <div className={isNegated ? 'border-l-2 border-warning/40 pl-1' : ''}>
                {/* NOT toggle — compact, on its own line */}
                <button
                  onClick={() => toggleNot(i)}
                  className={`px-1.5 py-0 text-[10px] font-bold rounded transition-colors ${
                    isNegated
                      ? 'bg-warning/15 text-warning hover:bg-warning/25'
                      : 'text-text-tertiary hover:text-warning hover:bg-warning/10'
                  }`}
                  title={isNegated ? t('query.removeNot') : t('query.addNot')}
                >
                  {isNegated ? '✕ NOT' : '+ NOT'}
                </button>
                {isGroup ? (
                  <VisualGroup
                    node={innerNode as QueryAnd | QueryOr}
                    onChange={(n) => updateChild(i, isNegated ? { type: 'not', child: n } as QueryNot : n)}
                    onRemove={() => removeChild(i)}
                    depth={depth + 1}
                    availableFields={availableFields}
                    availableTags={availableTags}
                  />
                ) : innerNode.type === 'condition' ? (
                  <ConditionRow
                    condition={innerNode}
                    onChange={(c) => updateChild(i, isNegated ? { type: 'not', child: c } as QueryNot : c)}
                    onRemove={() => removeChild(i)}
                    availableFields={availableFields}
                    availableTags={availableTags}
                  />
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add buttons */}
      <div className="flex items-center gap-1 mt-1.5">
        <button
          onClick={addCondition}
          className="flex items-center gap-1 px-2 py-1 text-xs text-text-secondary hover:text-text-primary rounded border border-dashed border-border-default hover:border-accent hover:bg-bg-secondary transition-colors"
        >
          <Plus size={12} />
          {t('query.addCondition')}
        </button>
        {depth < MAX_GROUP_DEPTH && (
          <button
            onClick={addGroup}
            className="flex items-center gap-1 px-2 py-1 text-xs text-text-secondary hover:text-text-primary rounded border border-dashed border-border-default hover:border-accent hover:bg-bg-secondary transition-colors"
          >
            <Plus size={12} />
            {t('query.addGroup')}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Visual Builder (main entry) ──

export function QueryBuilderVisual() {
  const { t } = useTranslation('panels');
  const currentAst = useQueryStore((s) => s.currentAst);
  const setAst = useQueryStore((s) => s.setAst);
  const elements = useDossierStore((s) => s.elements);
  const links = useDossierStore((s) => s.links);

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

  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    for (const el of elements.values()) {
      for (const t of el.tags) if (t) tags.add(t);
    }
    return [...tags].sort();
  }, [elements]);

  // Normalize AST to a root group for the visual editor
  const rootGroup = useMemo((): QueryAnd | QueryOr => {
    if (!currentAst) return { type: 'and', children: [] };
    if (currentAst.type === 'and' || currentAst.type === 'or') return currentAst;
    // Single condition or NOT: wrap in AND group
    return { type: 'and', children: [currentAst] };
  }, [currentAst]);

  const handleRootChange = useCallback((node: QueryNode) => {
    // Simplify: unwrap single-child root group
    if ((node.type === 'and' || node.type === 'or') && node.children.length === 1) {
      setAst(node.children[0]);
    } else if ((node.type === 'and' || node.type === 'or') && node.children.length === 0) {
      setAst(null);
    } else {
      setAst(node);
    }
  }, [setAst]);

  return (
    <div className="p-3">
      <VisualGroup
        node={rootGroup}
        onChange={handleRootChange}
        depth={0}
        availableFields={availableFields}
        availableTags={availableTags}
      />

      {/* Empty state */}
      {rootGroup.children.length === 0 && (
        <p className="mt-4 text-xs text-text-tertiary text-center">
          {t('query.emptyVisual')}
        </p>
      )}
    </div>
  );
}
