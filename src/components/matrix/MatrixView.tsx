import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUpDown, ArrowUp, ArrowDown, Columns3, Check, GripVertical, RotateCcw, Download } from 'lucide-react';
import { useInvestigationStore, useSelectionStore, useViewStore, useInsightsStore, useTabStore, useUIStore, useHistoryStore } from '../../stores';
import { getDimmedElementIds, getNeighborIds } from '../../utils/filterUtils';
import { ViewToolbar } from '../common/ViewToolbar';
import type { Element, Confidence } from '../../types';

type SortDirection = 'asc' | 'desc';
interface SortState {
  column: string;
  direction: SortDirection;
}

interface ColumnDef {
  key: string;
  label: string;
  width: number; // px
  fixed?: boolean; // always visible, not toggleable
  alignRight?: boolean;
}

const ROW_HEIGHT = 32;
const BUFFER_ROWS = 10;
const HEADER_HEIGHT = 32;
const MIN_COL_WIDTH = 48;

// Column widths
const COL_LABEL = 192;
const COL_TAGS = 128;
const COL_CONFIDENCE = 80;
const COL_SOURCE = 128;
const COL_PROPERTY = 144;

/** Extract a display value for a property key from an element */
function getPropertyValue(element: Element, key: string): string {
  const prop = element.properties.find((p) => p.key === key);
  if (!prop || prop.value == null) return '';
  if (prop.value instanceof Date) {
    return prop.value.toLocaleDateString();
  }
  if (typeof prop.value === 'boolean') {
    return prop.value ? '✓' : '✗';
  }
  return String(prop.value);
}

/** Get a sortable raw value (number-aware) */
function getSortValue(element: Element, column: string): string | number {
  switch (column) {
    case 'label':
      return element.label.toLowerCase();
    case 'tags':
      return (element.tags[0] || '').toLowerCase();
    case 'confidence':
      return element.confidence ?? -1;
    case 'source':
      return element.source.toLowerCase();
    default: {
      const prop = element.properties.find((p) => p.key === column);
      if (!prop || prop.value == null) return '';
      if (typeof prop.value === 'number') return prop.value;
      if (prop.value instanceof Date) return prop.value.getTime();
      return String(prop.value).toLowerCase();
    }
  }
}

/** Render cell value for fixed columns */
function getCellValue(el: Element, colKey: string): string {
  switch (colKey) {
    case 'label':
      return el.label || '—';
    case 'tags':
      return el.tags[0] || '—';
    case 'confidence':
      return el.confidence != null ? `${el.confidence}%` : '—';
    case 'source':
      return el.source || '—';
    default:
      return getPropertyValue(el, colKey) || '—';
  }
}

export function MatrixView() {
  const { t } = useTranslation('pages');
  const containerRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef<HTMLDivElement>(null);

  const elements = useInvestigationStore((s) => s.elements);
  const links = useInvestigationStore((s) => s.links);
  const updateElement = useInvestigationStore((s) => s.updateElement);
  const investigationName = useInvestigationStore((s) => s.currentInvestigation?.name ?? 'export');
  const { selectElement, selectElements, toggleElement, selectedElementIds } = useSelectionStore();
  const pushAction = useHistoryStore((s) => s.pushAction);
  const historyUndo = useHistoryStore((s) => s.undo);
  const historyRedo = useHistoryStore((s) => s.redo);
  const { filters, hiddenElementIds, focusElementId, focusDepth } = useViewStore();
  const { highlightedElementIds: insightsHighlightedIds } = useInsightsStore();
  const activeTabId = useTabStore((s) => s.activeTabId);
  const tabMemberSet = useTabStore((s) => s.memberSet);
  const anonymousMode = useUIStore((s) => s.anonymousMode);

  const [sort, setSort] = useState<SortState>({ column: 'label', direction: 'asc' });
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => new Set());
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const lastClickedRowRef = useRef<number>(-1);

  // Compute dimmed element IDs (same logic as Timeline/Map)
  const dimmedElementIds = useMemo(() => {
    if (insightsHighlightedIds.size > 0) {
      const dimmed = new Set<string>();
      elements.forEach((el) => {
        if (!insightsHighlightedIds.has(el.id)) dimmed.add(el.id);
      });
      return dimmed;
    }
    if (focusElementId) {
      const visibleIds = getNeighborIds(focusElementId, links, focusDepth);
      const dimmed = new Set<string>();
      elements.forEach((el) => {
        if (!visibleIds.has(el.id)) dimmed.add(el.id);
      });
      return dimmed;
    }
    return getDimmedElementIds(elements, filters, hiddenElementIds);
  }, [elements, links, filters, hiddenElementIds, focusElementId, focusDepth, insightsHighlightedIds]);

  // Filter elements: exclude groups, annotations, hidden; respect tabs
  const visibleElements = useMemo(() => {
    return elements.filter((el) => {
      if (el.isGroup || el.isAnnotation) return false;
      if (hiddenElementIds.has(el.id)) return false;
      if (activeTabId && !tabMemberSet.has(el.id)) return false;
      return true;
    });
  }, [elements, hiddenElementIds, activeTabId, tabMemberSet]);

  // Collect all unique property keys across visible elements
  const propertyKeys = useMemo(() => {
    const keyCount = new Map<string, number>();
    visibleElements.forEach((el) => {
      el.properties.forEach((p) => {
        keyCount.set(p.key, (keyCount.get(p.key) || 0) + 1);
      });
    });
    return Array.from(keyCount.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([key]) => key);
  }, [visibleElements]);

  // Sync column order when property keys change
  useEffect(() => {
    setColumnOrder((prev) => {
      const allKeys = ['tags', 'confidence', 'source', ...propertyKeys];
      if (prev.length === 0) return allKeys;
      const existing = prev.filter((k) => allKeys.includes(k));
      const newKeys = allKeys.filter((k) => !prev.includes(k));
      return [...existing, ...newKeys];
    });
  }, [propertyKeys]);

  // Build all column definitions (respecting user order)
  const allColumns: ColumnDef[] = useMemo(() => {
    const colMap: Record<string, ColumnDef> = {
      tags: { key: 'tags', label: t('matrix.type'), width: COL_TAGS },
      confidence: { key: 'confidence', label: t('matrix.confidence'), width: COL_CONFIDENCE, alignRight: true },
      source: { key: 'source', label: t('matrix.source'), width: COL_SOURCE },
    };
    propertyKeys.forEach((key) => {
      colMap[key] = { key, label: key, width: COL_PROPERTY };
    });
    const ordered = columnOrder.filter((k) => k in colMap).map((k) => colMap[k]);
    return [
      { key: 'label', label: t('matrix.label'), width: COL_LABEL, fixed: true },
      ...ordered,
    ];
  }, [t, propertyKeys, columnOrder]);

  // Helper: effective column width (custom or default)
  const getColWidth = useCallback((col: ColumnDef) =>
    columnWidths[col.key] ?? col.width,
  [columnWidths]);

  // Visible columns (respecting hiddenColumns)
  const visibleCols = useMemo(() =>
    allColumns.filter((col) => col.fixed || !hiddenColumns.has(col.key)),
  [allColumns, hiddenColumns]);

  // Total row width for horizontal scroll
  const totalRowWidth = useMemo(() =>
    visibleCols.reduce((sum, col) => sum + getColWidth(col), 0),
  [visibleCols, getColWidth]);

  // Toggle column visibility
  const toggleColumn = useCallback((key: string) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Show all / hide all columns
  const showAllColumns = useCallback(() => {
    setHiddenColumns(new Set());
  }, []);

  const hideAllColumns = useCallback(() => {
    setHiddenColumns(new Set(columnOrder));
  }, [columnOrder]);

  // Reset matrix view to defaults
  const resetView = useCallback(() => {
    setSort({ column: 'label', direction: 'asc' });
    setHiddenColumns(new Set());
    setColumnOrder(['tags', 'confidence', 'source', ...propertyKeys]);
    setColumnWidths({});
    setColumnFilters({});
  }, [propertyKeys]);

  const hasActiveFilters = Object.values(columnFilters).some((v) => v.length > 0);

  const hasCustomizations = hiddenColumns.size > 0
    || Object.keys(columnWidths).length > 0
    || sort.column !== 'label' || sort.direction !== 'asc'
    || hasActiveFilters
    || (columnOrder.length > 0 && columnOrder.join(',') !== ['tags', 'confidence', 'source', ...propertyKeys].join(','));

  // Mouse-based column reorder on table headers with ghost
  const draggingColRef = useRef<string | null>(null);
  const dragOverColRef = useRef<string | null>(null);
  const [draggingCol, setDraggingCol] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null);

  const handleHeaderMouseDown = useCallback((e: React.MouseEvent, key: string) => {
    const target = e.target as HTMLElement;
    if (!target.closest('[data-grip]')) return;
    e.preventDefault();
    draggingColRef.current = key;
    setDraggingCol(key);
    setGhostPos({ x: e.clientX, y: e.clientY });
  }, []);

  const handleHeaderMouseEnter = useCallback((key: string) => {
    if (!draggingColRef.current) return;
    dragOverColRef.current = key;
    setDragOverCol(key);
  }, []);

  useEffect(() => {
    if (!draggingCol) return;
    const handleMouseMove = (e: MouseEvent) => {
      setGhostPos({ x: e.clientX, y: e.clientY });
    };
    const handleMouseUp = () => {
      const source = draggingColRef.current;
      const target = dragOverColRef.current;
      if (source && target && source !== target) {
        setColumnOrder((prev) => {
          const next = [...prev];
          const fromIdx = next.indexOf(source);
          const toIdx = next.indexOf(target);
          if (fromIdx === -1 || toIdx === -1) return prev;
          next.splice(fromIdx, 1);
          next.splice(toIdx, 0, source);
          return next;
        });
      }
      draggingColRef.current = null;
      dragOverColRef.current = null;
      setDraggingCol(null);
      setDragOverCol(null);
      setGhostPos(null);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingCol]);

  // Column resize
  const resizingColRef = useRef<string | null>(null);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(0);
  const [resizingCol, setResizingCol] = useState<string | null>(null);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent, col: ColumnDef) => {
    e.preventDefault();
    e.stopPropagation();
    resizingColRef.current = col.key;
    resizeStartXRef.current = e.clientX;
    resizeStartWidthRef.current = columnWidths[col.key] ?? col.width;
    setResizingCol(col.key);
  }, [columnWidths]);

  useEffect(() => {
    if (!resizingCol) return;
    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - resizeStartXRef.current;
      const newWidth = Math.max(MIN_COL_WIDTH, resizeStartWidthRef.current + delta);
      setColumnWidths((prev) => ({ ...prev, [resizingCol]: newWidth }));
    };
    const handleMouseUp = () => {
      resizingColRef.current = null;
      setResizingCol(null);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingCol]);

  // Close columns dropdown on outside click
  useEffect(() => {
    if (!columnsOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (columnsRef.current && !columnsRef.current.contains(e.target as Node)) {
        setColumnsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [columnsOpen]);

  // Filter by column values
  const filteredElements = useMemo(() => {
    const activeFilters = Object.entries(columnFilters).filter(([, v]) => v.length > 0);
    if (activeFilters.length === 0) return visibleElements;
    return visibleElements.filter((el) =>
      activeFilters.every(([colKey, filterText]) => {
        const value = getCellValue(el, colKey).toLowerCase();
        return value.includes(filterText.toLowerCase());
      })
    );
  }, [visibleElements, columnFilters]);

  // Sort
  const sortedElements = useMemo(() => {
    const sorted = [...filteredElements];
    sorted.sort((a, b) => {
      const aVal = getSortValue(a, sort.column);
      const bVal = getSortValue(b, sort.column);
      let cmp: number;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        cmp = aVal - bVal;
      } else {
        cmp = String(aVal).localeCompare(String(bVal));
      }
      return sort.direction === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [filteredElements, sort]);

  // Column sort toggle
  const handleSort = useCallback((column: string) => {
    setSort((prev) => ({
      column,
      direction: prev.column === column && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  }, []);

  // Row click → select element (with Ctrl/Shift modifiers for multi-select)
  const handleRowClick = useCallback((e: React.MouseEvent, id: string, rowIndex: number) => {
    if (e.ctrlKey || e.metaKey) {
      // Ctrl+click: toggle individual selection
      toggleElement(id);
      lastClickedRowRef.current = rowIndex;
    } else if (e.shiftKey && lastClickedRowRef.current >= 0) {
      // Shift+click: range select from last clicked to current
      const from = Math.min(lastClickedRowRef.current, rowIndex);
      const to = Math.max(lastClickedRowRef.current, rowIndex);
      const rangeIds = sortedElements.slice(from, to + 1).map((el) => el.id);
      selectElements(rangeIds);
    } else {
      // Normal click: single select
      selectElement(id);
      lastClickedRowRef.current = rowIndex;
    }
  }, [selectElement, selectElements, toggleElement, sortedElements]);

  // Inline cell editing
  const [editingCell, setEditingCell] = useState<{ rowId: string; colKey: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input when entering edit mode
  useEffect(() => {
    if (editingCell && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingCell]);

  /** Get raw editable value (without formatting like % or —) */
  const getRawEditValue = useCallback((el: Element, colKey: string): string => {
    switch (colKey) {
      case 'label': return el.label;
      case 'tags': return el.tags.join(', ');
      case 'confidence': return el.confidence != null ? String(el.confidence) : '';
      case 'source': return el.source;
      default: return getPropertyValue(el, colKey);
    }
  }, []);

  const handleCellDoubleClick = useCallback((el: Element, colKey: string) => {
    if (anonymousMode) return;
    setEditingCell({ rowId: el.id, colKey });
    setEditValue(getRawEditValue(el, colKey));
  }, [anonymousMode, getRawEditValue]);

  const handleCellSave = useCallback(() => {
    if (!editingCell) return;
    const el = elements.find((e) => e.id === editingCell.rowId);
    if (!el) { setEditingCell(null); return; }

    const { colKey } = editingCell;
    const trimmed = editValue.trim();

    switch (colKey) {
      case 'label': {
        if (trimmed && trimmed !== el.label) {
          const old = el.label;
          updateElement(el.id, { label: trimmed });
          pushAction({ type: 'update-element', undo: { elementId: el.id, changes: { label: old } }, redo: { elementId: el.id, changes: { label: trimmed } } });
        }
        break;
      }
      case 'tags': {
        const newTags = trimmed ? trimmed.split(',').map((t) => t.trim()).filter(Boolean) : [];
        if (newTags.join(',') !== el.tags.join(',')) {
          const old = el.tags;
          updateElement(el.id, { tags: newTags });
          pushAction({ type: 'update-element', undo: { elementId: el.id, changes: { tags: old } }, redo: { elementId: el.id, changes: { tags: newTags } } });
        }
        break;
      }
      case 'confidence': {
        const num = trimmed === '' ? null : Math.round(Math.max(0, Math.min(100, parseInt(trimmed, 10) || 0)) / 10) * 10 as Confidence;
        if (num !== el.confidence) {
          const old = el.confidence;
          updateElement(el.id, { confidence: num });
          pushAction({ type: 'update-element', undo: { elementId: el.id, changes: { confidence: old } }, redo: { elementId: el.id, changes: { confidence: num } } });
        }
        break;
      }
      case 'source': {
        if (trimmed !== el.source) {
          const old = el.source;
          updateElement(el.id, { source: trimmed });
          pushAction({ type: 'update-element', undo: { elementId: el.id, changes: { source: old } }, redo: { elementId: el.id, changes: { source: trimmed } } });
        }
        break;
      }
      default: {
        // Property column
        const oldProps = el.properties;
        const existing = oldProps.find((p) => p.key === colKey);
        const newProps = existing
          ? oldProps.map((p) => p.key === colKey ? { ...p, value: trimmed } : p)
          : [...oldProps, { key: colKey, value: trimmed }];
        updateElement(el.id, { properties: newProps });
        pushAction({ type: 'update-element', undo: { elementId: el.id, changes: { properties: oldProps } }, redo: { elementId: el.id, changes: { properties: newProps } } });
        break;
      }
    }
    setEditingCell(null);
  }, [editingCell, editValue, elements, updateElement, pushAction]);

  const handleCellCancel = useCallback(() => {
    setEditingCell(null);
  }, []);

  /** Navigate to an adjacent cell: save current, then open the target */
  const navigateToCell = useCallback((rowDelta: number, colDelta: number) => {
    if (!editingCell) return;
    const rowIdx = sortedElements.findIndex((el) => el.id === editingCell.rowId);
    const colIdx = visibleCols.findIndex((c) => c.key === editingCell.colKey);
    if (rowIdx === -1 || colIdx === -1) return;
    const newRowIdx = Math.max(0, Math.min(sortedElements.length - 1, rowIdx + rowDelta));
    const newColIdx = Math.max(0, Math.min(visibleCols.length - 1, colIdx + colDelta));
    const newEl = sortedElements[newRowIdx];
    const newCol = visibleCols[newColIdx];
    if (newEl && newCol) {
      // Save current first (handleCellSave clears editingCell), then open new
      handleCellSave();
      // Use setTimeout to let state settle after save
      setTimeout(() => {
        setEditingCell({ rowId: newEl.id, colKey: newCol.key });
        setEditValue(getRawEditValue(newEl, newCol.key));
      }, 0);
    }
  }, [editingCell, sortedElements, visibleCols, handleCellSave, getRawEditValue]);

  const handleCellKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleCellSave(); }
    else if (e.key === 'Escape') { e.preventDefault(); handleCellCancel(); }
    else if (e.key === 'Tab') {
      e.preventDefault();
      navigateToCell(0, e.shiftKey ? -1 : 1);
      return; // skip stopPropagation — already prevented
    }
    else if (e.key === 'ArrowUp') { e.preventDefault(); navigateToCell(-1, 0); return; }
    else if (e.key === 'ArrowDown') { e.preventDefault(); navigateToCell(1, 0); return; }
    e.stopPropagation();
  }, [handleCellSave, handleCellCancel, navigateToCell]);

  // Build TSV text from selected rows for clipboard
  const buildSelectedTSV = useCallback(() => {
    const selectedRows = sortedElements.filter((el) => selectedElementIds.has(el.id));
    if (selectedRows.length === 0) return '';
    const headers = visibleCols.map((c) => c.label).join('\t');
    const rows = selectedRows.map((el) =>
      visibleCols.map((col) => {
        const v = getCellValue(el, col.key);
        return v === '—' ? '' : v;
      }).join('\t')
    );
    return [headers, ...rows].join('\n');
  }, [sortedElements, selectedElementIds, visibleCols]);

  // Export CSV
  const handleExportCSV = useCallback(() => {
    const escape = (v: string) => {
      if (v.includes(',') || v.includes('"') || v.includes('\n')) return `"${v.replace(/"/g, '""')}"`;
      return v;
    };
    const headers = visibleCols.map((c) => escape(c.label)).join(',');
    const rows = sortedElements.map((el) =>
      visibleCols.map((col) => {
        const v = getCellValue(el, col.key);
        return escape(v === '—' ? '' : v);
      }).join(',')
    );
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const slug = investigationName.replace(/[^a-zA-Z0-9À-ÿ_-]/g, '_').replace(/_+/g, '_');
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const ts = `${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear()}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    a.download = `${slug}_matrice_${ts}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [sortedElements, visibleCols]);

  // Keyboard shortcuts (Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y / Ctrl+C)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip when typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const isCtrlOrMeta = e.ctrlKey || e.metaKey;
      if (e.key === 'z' && isCtrlOrMeta && !e.shiftKey) {
        e.preventDefault();
        historyUndo();
      }
      if ((e.key === 'z' && isCtrlOrMeta && e.shiftKey) || (e.key === 'y' && isCtrlOrMeta)) {
        e.preventDefault();
        historyRedo();
      }
      // Ctrl+C: copy selected rows as TSV
      if (e.key === 'c' && isCtrlOrMeta && selectedElementIds.size > 0) {
        e.preventDefault();
        const tsv = buildSelectedTSV();
        if (tsv) navigator.clipboard.writeText(tsv);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [historyUndo, historyRedo, selectedElementIds, buildSelectedTSV]);

  // Virtualisation - resize observer
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      setContainerHeight(entries[0].contentRect.height);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const totalContentHeight = sortedElements.length * ROW_HEIGHT;
  const firstVisibleRow = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS);
  const lastVisibleRow = Math.min(
    sortedElements.length - 1,
    Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + BUFFER_ROWS
  );
  const visibleRows = sortedElements.slice(firstVisibleRow, lastVisibleRow + 1);

  const SortIcon = useCallback(({ column }: { column: string }) => {
    if (sort.column !== column) return <ArrowUpDown size={12} className="text-text-tertiary" />;
    return sort.direction === 'asc'
      ? <ArrowUp size={12} className="text-text-primary" />
      : <ArrowDown size={12} className="text-text-primary" />;
  }, [sort]);

  const elementCount = visibleElements.length;
  const hiddenCount = hiddenColumns.size;
  const nonFixedColumns = allColumns.filter((c) => !c.fixed);

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden">
      <ViewToolbar
        showMediaToggle={false}
        showCommentBadgesToggle={false}
        leftContent={
          <div className="flex items-center gap-3">
            <span className="text-xs text-text-secondary shrink-0">
              {t('matrix.count', { count: sortedElements.length, total: elementCount })}
              {' · '}
              {t('matrix.properties', { count: propertyKeys.length })}
            </span>

            {/* Column visibility toggle */}
            <div ref={columnsRef} className="relative">
              <button
                onClick={() => setColumnsOpen((v) => !v)}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
                  columnsOpen || hiddenCount > 0
                    ? 'bg-accent-light text-accent'
                    : 'hover:bg-bg-tertiary text-text-secondary'
                }`}
                title={t('matrix.columns')}
              >
                <Columns3 size={14} />
                {hiddenCount > 0 && (
                  <span className="text-[10px]">({allColumns.length - hiddenCount - 1}/{allColumns.length - 1})</span>
                )}
              </button>

              {columnsOpen && (
                <div className="absolute left-0 top-full mt-1 w-64 max-h-80 overflow-y-auto bg-bg-primary border border-border-default rounded shadow-md z-50">
                  {/* Select all / none */}
                  <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border-default">
                    <button
                      onClick={showAllColumns}
                      className="text-xs text-accent hover:underline"
                    >
                      {t('matrix.all')}
                    </button>
                    <span className="text-text-tertiary text-xs">/</span>
                    <button
                      onClick={hideAllColumns}
                      className="text-xs text-accent hover:underline"
                    >
                      {t('matrix.none')}
                    </button>
                  </div>
                  {nonFixedColumns.map((col) => {
                    const isVisible = !hiddenColumns.has(col.key);
                    return (
                      <button
                        key={col.key}
                        onClick={() => toggleColumn(col.key)}
                        className="flex items-center gap-2 w-full px-3 py-1 text-xs hover:bg-bg-secondary text-left"
                      >
                        <span className={`w-4 h-4 flex items-center justify-center rounded border shrink-0 ${
                          isVisible
                            ? 'bg-accent border-accent text-white'
                            : 'border-border-default'
                        }`}>
                          {isVisible && <Check size={10} />}
                        </span>
                        <span className="truncate text-text-primary">{col.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Export CSV */}
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors hover:bg-bg-tertiary text-text-secondary"
              title={t('matrix.exportCsv')}
            >
              <Download size={14} />
            </button>

            {/* Reset view */}
            <button
              onClick={resetView}
              disabled={!hasCustomizations}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
                hasCustomizations ? 'hover:bg-bg-tertiary text-text-secondary' : 'opacity-30 cursor-not-allowed text-text-tertiary'
              }`}
              title={t('matrix.reset')}
            >
              <RotateCcw size={14} />
            </button>
          </div>
        }
      />

      {/* Table container with both horizontal and vertical scroll */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto"
        onScroll={handleScroll}
      >
        {sortedElements.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-text-tertiary">
            {t('matrix.empty')}
          </div>
        ) : (
          <div style={{ minWidth: totalRowWidth }}>
            {/* Sticky header + filter row */}
            <div className="sticky top-0 z-10" style={{ width: totalRowWidth }}>
              {/* Column headers */}
              <div
                className="flex bg-bg-secondary border-b border-border-default"
                style={{ height: HEADER_HEIGHT, width: totalRowWidth }}
              >
                {visibleCols.map((col) => {
                  const isDragged = draggingCol === col.key;
                  const isOver = dragOverCol === col.key && draggingCol !== col.key;
                  const w = getColWidth(col);
                  return (
                    <div
                      key={col.key}
                      onMouseDown={(e) => !col.fixed && handleHeaderMouseDown(e, col.key)}
                      onMouseEnter={() => !col.fixed && handleHeaderMouseEnter(col.key)}
                      className={`relative flex items-center gap-1 px-2 text-xs font-medium text-text-secondary shrink-0 border-r border-border-default ${
                        col.fixed ? 'sticky left-0 z-20 bg-bg-secondary' : ''
                      } ${isDragged ? 'opacity-40' : ''} ${isOver ? 'border-l-2 border-l-accent' : ''}`}
                      style={{ width: w }}
                    >
                      {!col.fixed && (
                        <span
                          data-grip
                          className="cursor-grab active:cursor-grabbing shrink-0 select-none p-0.5 rounded hover:bg-bg-tertiary"
                        >
                          <GripVertical size={12} className="text-text-tertiary" />
                        </span>
                      )}
                      <button
                        onClick={() => handleSort(col.key)}
                        className="flex items-center gap-1 flex-1 min-w-0 hover:text-text-primary"
                      >
                        <span className="truncate">{col.label}</span>
                        <SortIcon column={col.key} />
                      </button>
                      {/* Resize handle */}
                      <div
                        onMouseDown={(e) => handleResizeMouseDown(e, col)}
                        className={`absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent/40 ${
                          resizingCol === col.key ? 'bg-accent/60' : ''
                        }`}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Filter row */}
              <div
                className="flex bg-bg-primary border-b border-border-default"
                style={{ height: 28, width: totalRowWidth }}
              >
                {visibleCols.map((col) => (
                  <div
                    key={col.key}
                    className={`shrink-0 border-r border-border-default ${
                      col.fixed ? 'sticky left-0 z-20 bg-bg-primary' : ''
                    }`}
                    style={{ width: getColWidth(col) }}
                  >
                    <input
                      type="text"
                      value={columnFilters[col.key] || ''}
                      onChange={(e) => setColumnFilters((prev) => ({ ...prev, [col.key]: e.target.value }))}
                      placeholder={t('matrix.filter')}
                      className="w-full h-full px-2 text-xs bg-transparent outline-none text-text-primary placeholder:text-text-tertiary"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Virtual rows container */}
            <div style={{ height: totalContentHeight, position: 'relative', width: totalRowWidth }}>
              {visibleRows.map((el, i) => {
                const rowIndex = firstVisibleRow + i;
                const isDimmed = dimmedElementIds.has(el.id);
                const isSelected = selectedElementIds.has(el.id);

                return (
                  <div
                    key={el.id}
                    onClick={(e) => handleRowClick(e, el.id, rowIndex)}
                    className={`flex cursor-pointer select-none border-b border-border-default transition-colors ${
                      isSelected ? 'bg-accent-light' : 'bg-bg-primary hover:bg-bg-secondary'
                    } ${isDimmed ? 'opacity-40' : ''}`}
                    style={{
                      position: 'absolute',
                      top: rowIndex * ROW_HEIGHT,
                      height: ROW_HEIGHT,
                      width: totalRowWidth,
                    }}
                  >
                    {visibleCols.map((col) => {
                      const value = getCellValue(el, col.key);
                      const isEmpty = value === '—';
                      const redact = anonymousMode && col.key !== 'confidence' && !isEmpty;
                      const isEditing = editingCell?.rowId === el.id && editingCell?.colKey === col.key;
                      return (
                        <div
                          key={col.key}
                          onDoubleClick={(e) => { e.stopPropagation(); handleCellDoubleClick(el, col.key); }}
                          className={`flex items-center px-3 text-sm shrink-0 border-r border-border-default ${
                            isEditing ? 'bg-accent/20' : ''
                          } ${
                            col.fixed ? 'sticky left-0 z-10 bg-inherit font-medium text-text-primary' : ''
                          } ${col.alignRight ? 'justify-end' : ''} ${
                            isEmpty && !col.fixed ? 'text-text-tertiary' : ''
                          } ${!col.fixed && !isEmpty ? 'text-text-primary' : ''}`}
                          style={{ width: getColWidth(col) }}
                          title={!isEmpty && !redact ? value : undefined}
                        >
                          {isEditing ? (
                            <input
                              ref={editInputRef}
                              type={col.key === 'confidence' ? 'number' : 'text'}
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={handleCellKeyDown}
                              onBlur={handleCellSave}
                              className="w-full h-full bg-transparent outline-none ring-0 shadow-none text-sm text-text-primary"
                              style={{ outline: 'none', boxShadow: 'none' }}
                              min={col.key === 'confidence' ? 0 : undefined}
                              max={col.key === 'confidence' ? 100 : undefined}
                            />
                          ) : redact ? (
                            <span
                              className="inline-block bg-text-primary rounded-sm"
                              style={{ width: `${Math.max(1.5, Math.min(value.length * 0.45, 7))}em`, height: '0.8em' }}
                            />
                          ) : (
                            <span className="truncate">{value}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Floating ghost while dragging a column */}
      {draggingCol && ghostPos && (() => {
        const col = visibleCols.find((c) => c.key === draggingCol);
        if (!col) return null;
        return (
          <div
            className="fixed pointer-events-none z-[9999] flex items-center gap-1 px-2 text-xs font-medium text-text-primary bg-bg-primary border border-accent rounded shadow-md"
            style={{
              left: ghostPos.x + 12,
              top: ghostPos.y - 14,
              height: HEADER_HEIGHT,
              opacity: 0.9,
            }}
          >
            <GripVertical size={12} className="text-accent" />
            <span>{col.label}</span>
          </div>
        );
      })()}
    </div>
  );
}
