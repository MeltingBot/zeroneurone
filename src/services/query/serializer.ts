// ZNQuery Serializer — AST → ZNQuery text
// Produces minimal parentheses, dates as ISO, quoted strings.

import type { QueryNode, QueryCondition } from './types';
import { OPERATOR_SYMBOLS } from './types';

// ── Field serialization ──

function serializeField(field: string): string {
  // Quote if contains spaces or special chars
  if (/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(field)) {
    return field;
  }
  return `"${field.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

// ── Value serialization ──

function serializeValue(value: QueryCondition['value'], operator: QueryCondition['operator']): string {
  if (value === null) return '';

  if (value instanceof Date) {
    // ISO date: YYYY-MM-DD
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  // String: check if it's a regex pattern (stored as /pattern/)
  if (typeof value === 'string' && operator === 'matches' && value.startsWith('/') && value.endsWith('/')) {
    return value; // Already in /pattern/ format
  }

  // Regular string: quote it
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

// ── Node serialization ──

type ParentContext = 'root' | 'and' | 'or' | 'not';

function serializeNode(node: QueryNode, parent: ParentContext): string {
  switch (node.type) {
    case 'condition': {
      const field = serializeField(node.field);
      const op = OPERATOR_SYMBOLS[node.operator];
      if (node.operator === 'exists' || node.operator === 'not_exists') {
        return `${field} ${op}`;
      }
      const val = serializeValue(node.value, node.operator);
      return `${field} ${op} ${val}`;
    }

    case 'and': {
      const parts = node.children.map(c => serializeNode(c, 'and'));
      const text = parts.join(' AND ');
      // AND binds tighter than OR, so only wrap in parens if parent is NOT
      if (parent === 'not') {
        return `(${text})`;
      }
      return text;
    }

    case 'or': {
      const parts = node.children.map(c => serializeNode(c, 'or'));
      const text = parts.join(' OR ');
      // Wrap in parens if parent is AND or NOT (AND binds tighter)
      if (parent === 'and' || parent === 'not') {
        return `(${text})`;
      }
      return text;
    }

    case 'not': {
      const inner = serializeNode(node.child, 'not');
      return `NOT ${inner}`;
    }
  }
}

// ── Public API ──

export function serializeQuery(ast: QueryNode): string {
  return serializeNode(ast, 'root');
}
