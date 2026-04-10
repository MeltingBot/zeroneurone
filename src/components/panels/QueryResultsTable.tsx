import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryStore } from '../../stores/queryStore';
import { useDossierStore } from '../../stores/dossierStore';
import { useSelectionStore } from '../../stores/selectionStore';
import { useViewStore } from '../../stores/viewStore';
import type { Element, Link } from '../../types';
import { ArrowUpDown, ArrowUp, ArrowDown, Upload, Box, Link2 } from 'lucide-react';

interface TableRow {
  id: string;
  type: 'element' | 'link';
  label: string;
  tags: string[];
  confidence: number | null;
  date: Date | null;
  properties: Record<string, unknown>;
}

function buildRows(
  elementIds: Set<string>,
  linkIds: Set<string>,
  elements: Map<string, Element>,
  links: Map<string, Link>,
): TableRow[] {
  const rows: TableRow[] = [];

  for (const id of elementIds) {
    const el = elements.get(id);
    if (!el) continue;
    const props: Record<string, unknown> = {};
    for (const p of el.properties) props[p.key] = p.value;
    rows.push({
      id: el.id,
      type: 'element',
      label: el.label,
      tags: el.tags.filter(Boolean),
      confidence: el.confidence,
      date: el.date || el.dateRange?.start || null,
      properties: props,
    });
  }

  for (const id of linkIds) {
    const lk = links.get(id);
    if (!lk) continue;
    const props: Record<string, unknown> = {};
    for (const p of lk.properties) props[p.key] = p.value;
    rows.push({
      id: lk.id,
      type: 'link',
      label: lk.label,
      tags: lk.tags.filter(Boolean),
      confidence: lk.confidence,
      date: lk.date || lk.dateRange?.start || null,
      properties: props,
    });
  }

  return rows;
}

type SortDir = 'asc' | 'desc' | null;

export function QueryResultsTable() {
  const { t } = useTranslation('panels');
  const results = useQueryStore((s) => s.results);
  const tableColumns = useQueryStore((s) => s.tableColumns);
  const elementsMap = useDossierStore((s) => s.elements);
  const linksMap = useDossierStore((s) => s.links);
  const selectElement = useSelectionStore((s) => s.selectElement);
  const requestViewportChange = useViewStore((s) => s.requestViewportChange);

  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  const rows = useMemo(() => {
    if (!results) return [];
    // Build Map versions for buildRows
    const elMap = new Map<string, Element>();
    for (const el of elementsMap.values()) elMap.set(el.id, el);
    const lkMap = new Map<string, Link>();
    for (const lk of linksMap.values()) lkMap.set(lk.id, lk);
    return buildRows(results.elementIds, results.linkIds, elMap, lkMap);
  }, [results, elementsMap, linksMap]);

  const sortedRows = useMemo(() => {
    if (!sortCol || !sortDir) return rows;
    const sorted = [...rows];
    sorted.sort((a, b) => {
      let va: unknown;
      let vb: unknown;

      switch (sortCol) {
        case 'label': va = a.label; vb = b.label; break;
        case 'type': va = a.type; vb = b.type; break;
        case 'tags': va = a.tags.join(','); vb = b.tags.join(','); break;
        case 'confidence': va = a.confidence ?? -1; vb = b.confidence ?? -1; break;
        case 'date': va = a.date?.getTime() ?? 0; vb = b.date?.getTime() ?? 0; break;
        default: va = a.properties[sortCol]; vb = b.properties[sortCol]; break;
      }

      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;

      let cmp: number;
      if (typeof va === 'number' && typeof vb === 'number') {
        cmp = va - vb;
      } else {
        cmp = String(va).localeCompare(String(vb));
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return sorted;
  }, [rows, sortCol, sortDir]);

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

  const handleRowClick = useCallback((row: TableRow) => {
    if (row.type === 'element') {
      selectElement(row.id);
      // Navigate viewport to element position (#8)
      const el = [...elementsMap.values()].find(e => e.id === row.id);
      if (el) {
        requestViewportChange({ x: el.position.x, y: el.position.y, zoom: 1 });
      }
    }
  }, [selectElement, requestViewportChange]);

  const handleExportCSV = useCallback(() => {
    if (sortedRows.length === 0) return;

    const cols = ['type', ...tableColumns];
    // Collect all property columns from results
    const propCols = new Set<string>();
    for (const row of sortedRows) {
      for (const key of Object.keys(row.properties)) propCols.add(key);
    }
    const allCols = [...cols, ...[...propCols].filter(c => !cols.includes(c))];

    const escape = (v: unknown) => {
      const s = v == null ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };

    const lines = [allCols.join(',')];
    for (const row of sortedRows) {
      const vals = allCols.map(col => {
        switch (col) {
          case 'type': return escape(row.type);
          case 'label': return escape(row.label);
          case 'tags': return escape(row.tags.join(', '));
          case 'confidence': return escape(row.confidence);
          case 'date': return escape(row.date);
          default: return escape(row.properties[col]);
        }
      });
      lines.push(vals.join(','));
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'query-results.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, [sortedRows, tableColumns]);

  if (!results || (results.elementIds.size === 0 && results.linkIds.size === 0)) {
    return (
      <div className="flex items-center justify-center p-8 text-xs text-text-tertiary">
        {t('query.noResults')}
      </div>
    );
  }

  const columns = ['type', ...tableColumns];

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
        </span>
        <button
          onClick={handleExportCSV}
          className="flex items-center gap-1 px-2 py-1 text-xs text-text-secondary hover:text-text-primary rounded hover:bg-bg-secondary transition-colors"
        >
          <Upload size={12} />
          {t('query.exportCSV')}
        </button>
      </div>

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
                    ) : col === 'tags' ? (
                      <span className="text-text-secondary">{row.tags.join(', ')}</span>
                    ) : col === 'confidence' ? (
                      row.confidence != null
                        ? <span className="text-text-secondary">{row.confidence}%</span>
                        : <span className="text-text-tertiary">—</span>
                    ) : col === 'date' ? (
                      row.date
                        ? <span className="text-text-secondary">{row.date.toLocaleDateString()}</span>
                        : <span className="text-text-tertiary">—</span>
                    ) : (
                      <span className="text-text-secondary">
                        {row.properties[col] != null ? String(row.properties[col]) : '—'}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
