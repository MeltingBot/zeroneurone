import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryStore } from '../../stores/queryStore';
import { useDossierStore } from '../../stores/dossierStore';
import { useSelectionStore } from '../../stores/selectionStore';
import { revealElement, revealElements } from '../../utils/revealElement';
import type { Element, Link } from '../../types';
import { fieldValue, queryFields } from '../../services/query/evaluator';
import { parseNumericText } from '../../utils/numericText';
import { ArrowUpDown, ArrowUp, ArrowDown, Upload, Box, Link2 } from 'lucide-react';
import { emitExport } from '../../plugins/pluginEventBus';
import { GROUP_FIELDS, buildGroups, type GroupRow } from '../../utils/queryGroups';
import { downloadBlob } from '../../utils/download';

interface TableRow {
  id: string;
  type: 'element' | 'link';
  label: string;
  item: Element | Link;
  properties: Record<string, unknown>;
}

function buildRows(
  elementIds: Set<string>,
  linkIds: Set<string>,
  elements: Map<string, Element>,
  links: Map<string, Link>,
): TableRow[] {
  const rows: TableRow[] = [];
  const push = (item: Element | Link, type: TableRow['type']) => {
    const props: Record<string, unknown> = {};
    for (const p of item.properties) props[p.key] = p.value;
    rows.push({ id: item.id, type, label: item.label, item, properties: props });
  };
  for (const id of elementIds) { const el = elements.get(id); if (el) push(el, 'element'); }
  for (const id of linkIds) { const lk = links.get(id); if (lk) push(lk, 'link'); }
  return rows;
}

/** Text shown for a field value; null when there is none */
function displayText(v: unknown, field: string): string | null {
  if (v == null || v === '') return null;
  if (Array.isArray(v)) {
    const parts = v.map((x) => displayText(x, field)).filter((x): x is string => x !== null);
    return parts.length > 0 ? parts.join(', ') : null;
  }
  if (v instanceof Date) return v.toLocaleDateString();
  if (field.toLowerCase() === 'confidence' && typeof v === 'number') return `${v}%`;
  return String(v);
}

/** Value used to sort a column: numbers (also written as text) and dates by value, the rest as text */
function sortKey(v: unknown, field: string): number | string | null {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = parseNumericText(v);
    if (n !== null) return n;
  }
  return displayText(v, field);
}

type SortDir = 'asc' | 'desc' | null;

export function QueryResultsTable() {
  const { t } = useTranslation('panels');
  const results = useQueryStore((s) => s.results);
  const currentAst = useQueryStore((s) => s.currentAst);
  const elementsMap = useDossierStore((s) => s.elements);
  const linksMap = useDossierStore((s) => s.links);
  const selectElement = useSelectionStore((s) => s.selectElement);
  const selectBoth = useSelectionStore((s) => s.selectBoth);
  const selectLink = useSelectionStore((s) => s.selectLink);

  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [groupBy, setGroupBy] = useState('');

  const maps = useMemo(() => {
    const elMap = new Map<string, Element>();
    for (const el of elementsMap.values()) elMap.set(el.id, el);
    const lkMap = new Map<string, Link>();
    for (const lk of linksMap.values()) lkMap.set(lk.id, lk);
    return { elMap, lkMap };
  }, [elementsMap, linksMap]);

  const rows = useMemo(() => {
    if (!results) return [];
    return buildRows(results.elementIds, results.linkIds, maps.elMap, maps.lkMap);
  }, [results, maps]);

  // The label, then the fields the query tests
  const fieldColumns = useMemo(
    () => queryFields(currentAst).filter((f) => !['label', 'type'].includes(f.toLowerCase())),
    [currentAst]
  );
  const columns = useMemo(() => ['type', 'label', ...fieldColumns], [fieldColumns]);

  const cellValue = useCallback(
    (row: TableRow, col: string): unknown => (col === 'label' ? row.label : fieldValue(row.item, col, maps.elMap)),
    [maps]
  );

  // Properties found in the results, offered after the fixed group fields
  const groupPropertyKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const row of rows) for (const key of Object.keys(row.properties)) keys.add(key);
    return [...keys].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const groups = useMemo(() => {
    if (!results || !groupBy) return null;
    return buildGroups(results.elementIds, results.linkIds, maps.elMap, maps.lkMap, groupBy);
  }, [results, maps, groupBy]);

  const groupLabel = useCallback(
    (g: GroupRow) => g.value ?? t('query.groupNoValue'),
    [t]
  );

  const sortedRows = useMemo(() => {
    if (!sortCol || !sortDir) return rows;
    const sorted = [...rows];
    sorted.sort((a, b) => {
      const va = sortCol === 'type' ? a.type : sortKey(cellValue(a, sortCol), sortCol);
      const vb = sortCol === 'type' ? b.type : sortKey(cellValue(b, sortCol), sortCol);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp = typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb));
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return sorted;
  }, [rows, sortCol, sortDir, cellValue]);

  const handleSort = useCallback((col: string) => {
    if (sortCol === col) {
      if (sortDir === 'asc') setSortDir('desc');
      else if (sortDir === 'desc') { setSortCol(null); setSortDir(null); }
      else setSortDir('asc');
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  }, [sortCol, sortDir]);

  // Select the row and bring it on screen (canvas, map or timeline); a link
  // is shown with its two ends
  const handleRowClick = useCallback((row: TableRow) => {
    if (row.type === 'element') {
      selectElement(row.id);
      revealElement(row.id);
      return;
    }
    const link = maps.lkMap.get(row.id);
    if (!link) return;
    selectLink(row.id);
    revealElements([link.fromId, link.toId]);
  }, [selectElement, selectLink, maps]);

  const handleGroupClick = useCallback((g: GroupRow) => {
    selectBoth(g.elementIds, g.linkIds);
    const ends = g.linkIds.flatMap((id) => {
      const link = maps.lkMap.get(id);
      return link ? [link.fromId, link.toId] : [];
    });
    revealElements([...g.elementIds, ...ends]);
  }, [selectBoth, maps]);

  const handleExportCSV = useCallback(() => {
    if (sortedRows.length === 0) return;

    const escape = (v: unknown) => {
      const s = v == null ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };
    const download = (lines: string[]) => {
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
      downloadBlob(blob, 'query-results.csv');
      emitExport('query-csv');
    };

    // Grouped: one line per value with its count
    if (groups) {
      download([
        `${escape(groupBy)},count`,
        ...groups.map((g) => `${escape(groupLabel(g))},${g.elementIds.length + g.linkIds.length}`),
      ]);
      return;
    }

    // Shown columns, then the other properties of the results
    const propCols = new Set<string>();
    for (const row of sortedRows) {
      for (const key of Object.keys(row.properties)) propCols.add(key);
    }
    const shown = new Set(columns.map((c) => c.toLowerCase()));
    const extra = [...propCols].filter((c) => !shown.has(c.toLowerCase()));
    const allCols = [...columns, ...extra];

    const lines = [allCols.map(escape).join(',')];
    for (const row of sortedRows) {
      lines.push(allCols.map((col) => {
        if (col === 'type') return escape(row.type);
        if (extra.includes(col)) return escape(displayText(row.properties[col], col));
        return escape(displayText(cellValue(row, col), col));
      }).join(','));
    }
    download(lines);
  }, [sortedRows, columns, cellValue, groups, groupBy, groupLabel]);

  if (!results || (results.elementIds.size === 0 && results.linkIds.size === 0)) {
    return (
      <div className="flex items-center justify-center p-8 text-xs text-text-tertiary">
        {t('query.noResults')}
      </div>
    );
  }

  const SortIcon = ({ col }: { col: string }) => {
    if (sortCol !== col) return <ArrowUpDown size={10} className="text-text-tertiary" />;
    if (sortDir === 'asc') return <ArrowUp size={10} className="text-accent" />;
    return <ArrowDown size={10} className="text-accent" />;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border-default">
        <span className="text-xs text-text-secondary">
          {sortedRows.length} {t('query.resultCount')}
          {groups && <> · {t('query.groupCount', { count: groups.length })}</>}
        </span>
        <div className="flex items-center gap-1">
        <select
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value)}
          aria-label={t('query.groupBy')}
          className="max-w-[140px] px-1.5 py-0.5 text-xs rounded border border-border-default bg-bg-primary text-text-secondary outline-none focus:border-accent"
        >
          <option value="">{t('query.groupBy')}</option>
          {GROUP_FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
          {groupPropertyKeys.length > 0 && (
            <optgroup label={t('query.properties')}>
              {groupPropertyKeys.map((k) => <option key={k} value={k}>{k}</option>)}
            </optgroup>
          )}
        </select>
        <button
          onClick={handleExportCSV}
          className="flex items-center gap-1 px-2 py-1 text-xs text-text-secondary hover:text-text-primary rounded hover:bg-bg-secondary transition-colors"
        >
          <Upload size={12} />
          {t('query.exportCSV')}
        </button>
        </div>
      </div>

      {groups ? (
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-bg-secondary">
            <tr>
              <th className="px-2 py-1.5 text-left font-medium text-text-secondary border-b border-border-default">{groupBy}</th>
              <th className="px-2 py-1.5 text-right font-medium text-text-secondary border-b border-border-default w-16">{t('query.groupSize')}</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr
                key={g.value ?? '\u0000'}
                onClick={() => handleGroupClick(g)}
                title={t('query.groupSelect')}
                className="cursor-pointer hover:bg-bg-secondary transition-colors border-b border-border-default/50"
              >
                <td className={`px-2 py-1.5 truncate max-w-[240px] ${g.value === null ? 'text-text-tertiary' : 'font-medium'}`}>{groupLabel(g)}</td>
                <td className="px-2 py-1.5 text-right text-text-secondary tabular-nums">{g.elementIds.length + g.linkIds.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      ) : (
      <>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-bg-secondary">
            <tr>
              {columns.map(col => (
                <th
                  key={col}
                  onClick={() => handleSort(col)}
                  className="px-2 py-1.5 text-left font-medium text-text-secondary cursor-pointer hover:text-text-primary border-b border-border-default select-none"
                >
                  <span className="flex items-center gap-1">
                    {col === 'type' ? '' : col}
                    <SortIcon col={col} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map(row => (
              <tr
                key={row.id}
                onClick={() => handleRowClick(row)}
                className="cursor-pointer hover:bg-bg-secondary transition-colors border-b border-border-default/50"
              >
                {columns.map(col => (
                  <td key={col} className="px-2 py-1.5 truncate max-w-[200px]">
                    {col === 'type' ? (
                      row.type === 'element'
                        ? <Box size={12} className="text-text-tertiary" />
                        : <Link2 size={12} className="text-text-tertiary" />
                    ) : col === 'label' ? (
                      <span className="font-medium">{row.label}</span>
                    ) : (() => {
                      const text = displayText(cellValue(row, col), col);
                      return text === null
                        ? <span className="text-text-tertiary">—</span>
                        : <span className="text-text-secondary" title={text}>{text}</span>;
                    })()}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </>
      )}
    </div>
  );
}
