import type { Element } from '../types';
import type { QueryCondition, QueryNode } from '../services/query/types';
import { RESERVED_FIELDS } from '../services/query/types';

/**
 * The matrix column filters as a ZNQuery, so that the other views (and the
 * link suggestions) can apply them too.
 *
 * A column filter keeps the rows whose displayed cell contains the text, case
 * aside: `field CONTAINS "text"` does the same on text. The tags column
 * filters on the first tag, the query on any of them (what the filter means).
 * Columns shown in another form than stored (confidence as "80 %", dates and
 * booleans formatted), a property named like a reserved field, or a filter on
 * the empty-cell dash have no exact query: they are returned as `unsupported` and
 * nothing is built, rather than a query keeping other rows than the matrix.
 */
export function matrixFiltersToQuery(
  columnFilters: Record<string, string>,
  elements: readonly Element[],
): { ast: QueryNode | null; unsupported: string[] } {
  const active = Object.entries(columnFilters).filter(([, text]) => text.trim() !== '');
  const unsupported: string[] = [];
  const conditions: QueryCondition[] = [];

  for (const [column, text] of active) {
    if (text.includes('—')) { unsupported.push(column); continue; }
    let field: string;
    if (column === 'label') field = 'label';
    else if (column === 'source') field = 'source';
    else if (column === 'tags') field = 'tag';
    else if (column === 'confidence') { unsupported.push(column); continue; }
    else if (RESERVED_FIELDS.has(column.toLowerCase()) || !isPlainText(column, elements)) { unsupported.push(column); continue; }
    else field = column;
    conditions.push({ type: 'condition', field, operator: 'contains', value: text });
  }

  if (unsupported.length > 0 || conditions.length === 0) return { ast: null, unsupported };
  return { ast: conditions.length === 1 ? conditions[0] : { type: 'and', children: conditions }, unsupported };
}

/**
 * Whether the matrix shows this property as stored (text, numbers): neither a
 * date nor a boolean, and no other key differing only by case (the query reads
 * keys case aside, the matrix does not)
 */
function isPlainText(key: string, elements: readonly Element[]): boolean {
  const lower = key.toLowerCase();
  for (const el of elements) {
    for (const prop of el.properties) {
      if (prop.key.toLowerCase() !== lower) continue;
      if (prop.key !== key) return false;
      if (prop.type === 'date' || prop.type === 'datetime' || prop.type === 'boolean') return false;
      if (prop.value instanceof Date || typeof prop.value === 'boolean') return false;
    }
  }
  return true;
}
