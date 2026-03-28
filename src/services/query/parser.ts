// ZNQuery Parser — Lexer + Recursive Descent Parser
// Text → AST (QueryNode) following grammar in spec §3.1
//
// Grammar:
//   query     := clause (LOGIC clause)*
//   clause    := '(' query ')' | NOT clause | condition
//   LOGIC     := 'AND' | 'OR'
//   NOT       := 'NOT'
//   condition := field OPERATOR value
//              | field 'EXISTS'
//              | field 'NOT EXISTS'
//              | field 'NEAR' NUMBER ',' NUMBER NUMBER ('km'|'m')
//   field     := IDENTIFIER | '"' STRING '"'
//   value     := '"' STRING '"' | NUMBER | DATE | BOOLEAN | REGEX

import type { QueryNode, QueryCondition, QueryOperator, QueryValue, ParseResult, ParseError } from './types';

// ── Token types ──

type TokenType =
  | 'IDENTIFIER'   // unquoted field name or keyword
  | 'STRING'       // "quoted string"
  | 'NUMBER'       // 42, 3.14, -7
  | 'DATE'         // 2024-01-15
  | 'BOOLEAN'      // true, false
  | 'REGEX'        // /pattern/
  | 'LPAREN'       // (
  | 'RPAREN'       // )
  | 'COMMA'        // ,
  | 'OP_EQ'        // =
  | 'OP_NEQ'       // !=
  | 'OP_GTE'       // >=
  | 'OP_LTE'       // <=
  | 'OP_GT'        // >
  | 'OP_LT'        // <
  | 'EOF';

interface Token {
  type: TokenType;
  value: string;
  position: number;
}

// ── Lexer ──

// Date pattern: YYYY-MM-DD
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function tokenize(input: string): Token[] | ParseError {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    // Skip whitespace
    if (/\s/.test(input[i])) {
      i++;
      continue;
    }

    const pos = i;

    // Comment: -- to end of line
    if (input[i] === '-' && input[i + 1] === '-' && (i + 2 >= input.length || input[i + 2] !== ' && false')) {
      // Actually check for -- comments properly
      if (input[i] === '-' && input[i + 1] === '-') {
        while (i < input.length && input[i] !== '\n') i++;
        continue;
      }
    }

    // Parentheses
    if (input[i] === '(') {
      tokens.push({ type: 'LPAREN', value: '(', position: pos });
      i++;
      continue;
    }
    if (input[i] === ')') {
      tokens.push({ type: 'RPAREN', value: ')', position: pos });
      i++;
      continue;
    }
    if (input[i] === ',') {
      tokens.push({ type: 'COMMA', value: ',', position: pos });
      i++;
      continue;
    }

    // Two-char operators: !=, >=, <=
    if (input[i] === '!' && input[i + 1] === '=') {
      tokens.push({ type: 'OP_NEQ', value: '!=', position: pos });
      i += 2;
      continue;
    }
    if (input[i] === '>' && input[i + 1] === '=') {
      tokens.push({ type: 'OP_GTE', value: '>=', position: pos });
      i += 2;
      continue;
    }
    if (input[i] === '<' && input[i + 1] === '=') {
      tokens.push({ type: 'OP_LTE', value: '<=', position: pos });
      i += 2;
      continue;
    }

    // Single-char operators: = > <
    if (input[i] === '=') {
      tokens.push({ type: 'OP_EQ', value: '=', position: pos });
      i++;
      continue;
    }
    if (input[i] === '>') {
      tokens.push({ type: 'OP_GT', value: '>', position: pos });
      i++;
      continue;
    }
    if (input[i] === '<') {
      tokens.push({ type: 'OP_LT', value: '<', position: pos });
      i++;
      continue;
    }

    // Quoted string: "..."
    if (input[i] === '"') {
      i++;
      let str = '';
      while (i < input.length && input[i] !== '"') {
        if (input[i] === '\\' && i + 1 < input.length) {
          // Escape sequences
          i++;
          if (input[i] === '"') str += '"';
          else if (input[i] === '\\') str += '\\';
          else if (input[i] === 'n') str += '\n';
          else str += input[i];
        } else {
          str += input[i];
        }
        i++;
      }
      if (i >= input.length) {
        return { message: 'Unterminated string', position: pos, expected: '"' };
      }
      i++; // skip closing "
      tokens.push({ type: 'STRING', value: str, position: pos });
      continue;
    }

    // Regex: /pattern/
    if (input[i] === '/') {
      i++;
      let pattern = '';
      while (i < input.length && input[i] !== '/') {
        if (input[i] === '\\' && i + 1 < input.length) {
          pattern += input[i] + input[i + 1];
          i += 2;
        } else {
          pattern += input[i];
          i++;
        }
      }
      if (i >= input.length) {
        return { message: 'Unterminated regex', position: pos, expected: '/' };
      }
      i++; // skip closing /
      tokens.push({ type: 'REGEX', value: pattern, position: pos });
      continue;
    }

    // Numbers (including negative): -42, 3.14, etc.
    // Negative numbers: only if '-' is followed by a digit and the previous token
    // is an operator or start of input (to avoid ambiguity with identifiers)
    if (input[i] === '-' && i + 1 < input.length && /\d/.test(input[i + 1])) {
      const prev = tokens[tokens.length - 1];
      const isAfterOperator = !prev || prev.type.startsWith('OP_') || prev.type === 'LPAREN' || prev.type === 'COMMA'
        || (prev.type === 'IDENTIFIER' && ['CONTAINS', 'STARTS', 'ENDS', 'MATCHES', 'NEAR'].includes(prev.value.toUpperCase()));
      if (isAfterOperator) {
        let num = '-';
        i++;
        while (i < input.length && /[\d.]/.test(input[i])) {
          num += input[i];
          i++;
        }
        // Check if it's a date: -YYYY-MM-DD won't happen (dates don't start with -)
        tokens.push({ type: 'NUMBER', value: num, position: pos });
        continue;
      }
    }

    // Number or Date: starts with digit
    if (/\d/.test(input[i])) {
      let num = '';
      while (i < input.length && /[\d.\-]/.test(input[i])) {
        num += input[i];
        i++;
      }
      if (DATE_RE.test(num)) {
        tokens.push({ type: 'DATE', value: num, position: pos });
      } else {
        tokens.push({ type: 'NUMBER', value: num, position: pos });
      }
      continue;
    }

    // Identifier or keyword: starts with letter, _, or dot-prefixed
    if (/[a-zA-Z_]/.test(input[i])) {
      let id = '';
      while (i < input.length && /[a-zA-Z0-9_.]/.test(input[i])) {
        id += input[i];
        i++;
      }
      const upper = id.toUpperCase();
      if (upper === 'TRUE' || upper === 'FALSE') {
        tokens.push({ type: 'BOOLEAN', value: upper === 'TRUE' ? 'true' : 'false', position: pos });
      } else {
        tokens.push({ type: 'IDENTIFIER', value: id, position: pos });
      }
      continue;
    }

    // Unknown character
    return { message: `Unexpected character: '${input[i]}'`, position: pos };
  }

  tokens.push({ type: 'EOF', value: '', position: input.length });
  return tokens;
}

// ── Parser ──

class Parser {
  private tokens: Token[];
  private pos: number;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.pos = 0;
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private advance(): Token {
    const t = this.tokens[this.pos];
    this.pos++;
    return t;
  }

  private expect(type: TokenType): Token {
    const t = this.peek();
    if (t.type !== type) {
      throw this.error(`Expected ${type}, got ${t.type} '${t.value}'`, t.position);
    }
    return this.advance();
  }

  private error(message: string, position: number, expected?: string): ParseError {
    return { message, position, expected };
  }

  // query := clause (LOGIC clause)*
  // Handle operator precedence: AND binds tighter than OR
  parse(): QueryNode {
    const node = this.parseOr();
    const eof = this.peek();
    if (eof.type !== 'EOF') {
      throw this.error(`Unexpected token '${eof.value}'`, eof.position);
    }
    return node;
  }

  // OR level: clause (OR clause)*
  private parseOr(): QueryNode {
    const children: QueryNode[] = [this.parseAnd()];

    while (this.peek().type === 'IDENTIFIER' && this.peek().value.toUpperCase() === 'OR') {
      this.advance(); // consume OR
      children.push(this.parseAnd());
    }

    if (children.length === 1) return children[0];
    return { type: 'or', children };
  }

  // AND level: clause (AND clause)*
  private parseAnd(): QueryNode {
    const children: QueryNode[] = [this.parseClause()];

    while (this.peek().type === 'IDENTIFIER' && this.peek().value.toUpperCase() === 'AND') {
      this.advance(); // consume AND
      children.push(this.parseClause());
    }

    if (children.length === 1) return children[0];
    return { type: 'and', children };
  }

  // clause := '(' query ')' | NOT clause | condition
  private parseClause(): QueryNode {
    const t = this.peek();

    // Parenthesized group
    if (t.type === 'LPAREN') {
      this.advance(); // consume (
      const node = this.parseOr();
      this.expect('RPAREN');
      return node;
    }

    // NOT clause
    if (t.type === 'IDENTIFIER' && t.value.toUpperCase() === 'NOT') {
      // Check if this is "NOT EXISTS" (part of a condition) or standalone NOT
      // Look ahead: NOT followed by EXISTS means it's part of the preceding condition
      // But since we parse conditions starting from the field, and "NOT" at clause level
      // is a logical negation, we just consume NOT and parse the next clause
      // However, "field NOT EXISTS" is handled inside parseCondition.
      // At clause level, "NOT (...)" or "NOT condition" is logical NOT.
      this.advance(); // consume NOT
      const child = this.parseClause();
      return { type: 'not', child };
    }

    // Condition
    return this.parseCondition();
  }

  // condition := field OPERATOR value | field EXISTS | field NOT EXISTS
  private parseCondition(): QueryNode {
    const field = this.parseField();

    // Check for operator
    const t = this.peek();

    // Symbol operators: = != > < >= <=
    if (t.type === 'OP_EQ') {
      this.advance();
      return this.buildCondition(field, 'eq');
    }
    if (t.type === 'OP_NEQ') {
      this.advance();
      return this.buildCondition(field, 'neq');
    }
    if (t.type === 'OP_GT') {
      this.advance();
      return this.buildCondition(field, 'gt');
    }
    if (t.type === 'OP_LT') {
      this.advance();
      return this.buildCondition(field, 'lt');
    }
    if (t.type === 'OP_GTE') {
      this.advance();
      return this.buildCondition(field, 'gte');
    }
    if (t.type === 'OP_LTE') {
      this.advance();
      return this.buildCondition(field, 'lte');
    }

    // Keyword operators
    if (t.type === 'IDENTIFIER') {
      const kw = t.value.toUpperCase();

      if (kw === 'CONTAINS') {
        this.advance();
        return this.buildCondition(field, 'contains');
      }
      if (kw === 'STARTS') {
        this.advance();
        return this.buildCondition(field, 'starts');
      }
      if (kw === 'ENDS') {
        this.advance();
        return this.buildCondition(field, 'ends');
      }
      if (kw === 'MATCHES') {
        this.advance();
        return this.buildCondition(field, 'matches');
      }
      if (kw === 'IN') {
        this.advance(); // consume IN
        return this.parseIn(field);
      }
      if (kw === 'NEAR') {
        this.advance(); // consume NEAR
        return this.parseNear(field);
      }
      if (kw === 'EXISTS') {
        this.advance();
        return { type: 'condition', field: field.value, operator: 'exists', value: null } as QueryCondition;
      }
      if (kw === 'NOT') {
        // Look ahead for EXISTS
        const next = this.tokens[this.pos + 1];
        if (next && next.type === 'IDENTIFIER' && next.value.toUpperCase() === 'EXISTS') {
          this.advance(); // consume NOT
          this.advance(); // consume EXISTS
          return { type: 'condition', field: field.value, operator: 'not_exists', value: null } as QueryCondition;
        }
      }
    }

    throw this.error(
      `Expected operator after field '${field.value}'`,
      t.position,
      '=, !=, >, <, >=, <=, CONTAINS, STARTS, ENDS, MATCHES, EXISTS, NOT EXISTS, IN, NEAR',
    );
  }

  // IN ["a", "b", "c"]  →  value = string[]
  private parseIn(field: { value: string; position: number }): QueryCondition {
    // Expect [ as IDENTIFIER "[" or LPAREN — we use "[" which lexes as unknown char
    // Since '[' is not in our lexer, we'll accept parentheses or just a list of strings
    // Syntax: field IN ["a", "b"] or field IN ("a", "b")
    const opener = this.peek();
    const useParen = opener.type === 'LPAREN';
    // For bracket syntax, we consume the IDENTIFIER that starts with "["
    // Actually our lexer doesn't handle "[", so let's use parentheses: field IN ("a", "b", "c")
    if (!useParen) {
      throw this.error('Expected ( after IN', opener.position, '(');
    }
    this.advance(); // consume (

    const values: string[] = [];
    while (this.peek().type !== 'RPAREN' && this.peek().type !== 'EOF') {
      const vt = this.peek();
      if (vt.type === 'STRING') {
        values.push(vt.value);
        this.advance();
      } else if (vt.type === 'NUMBER') {
        values.push(vt.value);
        this.advance();
      } else if (vt.type === 'IDENTIFIER') {
        values.push(vt.value);
        this.advance();
      } else if (vt.type === 'COMMA') {
        this.advance(); // skip comma separators
      } else {
        throw this.error(`Unexpected token in IN list: '${vt.value}'`, vt.position);
      }
    }
    this.expect('RPAREN');

    if (values.length === 0) {
      throw this.error('IN list cannot be empty', opener.position);
    }

    return {
      type: 'condition',
      field: field.value,
      operator: 'in',
      value: values,
    };
  }

  // NEAR lat,lng radiusUnit  →  value = "lat,lng,radiusKm"
  private parseNear(field: { value: string; position: number }): QueryCondition {
    // Parse latitude
    const latToken = this.peek();
    if (latToken.type !== 'NUMBER') {
      throw this.error('Expected latitude after NEAR', latToken.position, 'number');
    }
    this.advance();
    const lat = parseFloat(latToken.value);

    // Expect comma
    const comma = this.peek();
    if (comma.type !== 'COMMA') {
      throw this.error('Expected comma between latitude and longitude', comma.position, ',');
    }
    this.advance();

    // Parse longitude (may be negative)
    const lngToken = this.peek();
    if (lngToken.type !== 'NUMBER') {
      throw this.error('Expected longitude after comma', lngToken.position, 'number');
    }
    this.advance();
    const lng = parseFloat(lngToken.value);

    // Parse radius with unit: "10km" or "500m" — lexed as NUMBER + IDENTIFIER or single IDENTIFIER
    const radiusToken = this.peek();
    let radiusKm: number;

    if (radiusToken.type === 'NUMBER') {
      // Number followed by optional unit identifier
      this.advance();
      radiusKm = parseFloat(radiusToken.value);
      const unitToken = this.peek();
      if (unitToken.type === 'IDENTIFIER') {
        const unit = unitToken.value.toLowerCase();
        if (unit === 'km') {
          this.advance();
        } else if (unit === 'm') {
          this.advance();
          radiusKm = radiusKm / 1000;
        } else {
          // No unit — default to km
        }
      }
    } else if (radiusToken.type === 'IDENTIFIER') {
      // e.g. "10km" lexed as single identifier — extract number + unit
      const match = radiusToken.value.match(/^(\d+(?:\.\d+)?)(km|m)$/i);
      if (!match) {
        throw this.error('Expected radius (e.g. 10km, 500m)', radiusToken.position, 'radius');
      }
      this.advance();
      radiusKm = parseFloat(match[1]);
      if (match[2].toLowerCase() === 'm') radiusKm /= 1000;
    } else {
      throw this.error('Expected radius after coordinates', radiusToken.position, 'radius (e.g. 10km)');
    }

    // Encode as "lat,lng,radiusKm" string value
    return {
      type: 'condition',
      field: field.value,
      operator: 'near',
      value: `${lat},${lng},${radiusKm}`,
    };
  }

  private parseField(): { value: string; position: number } {
    const t = this.peek();
    if (t.type === 'IDENTIFIER') {
      this.advance();
      return { value: t.value, position: t.position };
    }
    if (t.type === 'STRING') {
      this.advance();
      return { value: t.value, position: t.position };
    }
    throw this.error(
      `Expected field name, got ${t.type} '${t.value}'`,
      t.position,
      'field name',
    );
  }

  private buildCondition(field: { value: string; position: number }, operator: QueryOperator): QueryCondition {
    const value = this.parseValue();
    return { type: 'condition', field: field.value, operator, value };
  }

  private parseValue(): QueryValue {
    const t = this.peek();

    if (t.type === 'STRING') {
      this.advance();
      return t.value;
    }
    if (t.type === 'NUMBER') {
      this.advance();
      const n = parseFloat(t.value);
      if (isNaN(n)) {
        throw this.error(`Invalid number: '${t.value}'`, t.position, 'number');
      }
      return n;
    }
    if (t.type === 'DATE') {
      this.advance();
      const d = new Date(t.value + 'T00:00:00');
      if (isNaN(d.getTime())) {
        throw this.error(`Invalid date: '${t.value}'`, t.position, 'YYYY-MM-DD');
      }
      return d;
    }
    if (t.type === 'BOOLEAN') {
      this.advance();
      return t.value === 'true';
    }
    if (t.type === 'REGEX') {
      this.advance();
      // Store regex as string prefixed with / for evaluator to recognize
      return '/' + t.value + '/';
    }

    throw this.error(
      `Expected value, got ${t.type} '${t.value}'`,
      t.position,
      'string, number, date, boolean, or regex',
    );
  }
}

// ── Public API ──

export function parseQuery(input: string): ParseResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return {
      ast: null,
      error: { message: 'Empty query', position: 0 },
    };
  }

  const tokens = tokenize(trimmed);
  if (!Array.isArray(tokens)) {
    // tokens is a ParseError
    return { ast: null, error: tokens };
  }

  // Only EOF token = empty after comment stripping
  if (tokens.length === 1 && tokens[0].type === 'EOF') {
    return {
      ast: null,
      error: { message: 'Empty query', position: 0 },
    };
  }

  try {
    const parser = new Parser(tokens);
    const ast = parser.parse();
    return { ast, error: null };
  } catch (e) {
    if (e && typeof e === 'object' && 'message' in e && 'position' in e) {
      return { ast: null, error: e as ParseError };
    }
    throw e;
  }
}
