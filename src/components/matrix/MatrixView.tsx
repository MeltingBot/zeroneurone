import { useMemo, useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import { propertiesOf, VALUES_SEPARATOR } from '../../utils/propertyRows';
import { useTranslation } from 'react-i18next';
import { ArrowUpDown, ArrowUp, ArrowDown, Columns3, Check, Filter, GripVertical, RotateCcw, Upload, Pin, Copy, Rows3, Search } from 'lucide-react';
import { matrixFiltersToQuery } from '../../utils/matrixFilterQuery';
import { serializeQuery } from '../../services/query/serializer';
import { useDossierStore, useSelectionStore, useViewStore, useInsightsStore, useTabStore, useUIStore, useHistoryStore, useQueryStore } from '../../stores';
import { getDimmedElementIds } from '../../utils/filterUtils';
import { useHiddenElementIds } from '../../hooks/useHiddenElementIds';
import { ViewToolbar } from '../common/ViewToolbar';
import { DropdownPortal } from '../common/DropdownPortal';
import { SourceInline } from '../common/SourceInline';

import i18next from 'i18next';
import type { Element, Link, Confidence, EvaluationModel, Property } from '../../types';
import type { SheetCell, SheetData } from '../../utils/spreadsheetWriter';
import { dateFromInputKeys, dateInputKeys, formatPropertyValue, parsePropertyDate, toLocalDateKey, toLocalTimeKey } from '../../utils/dates';
import { parseFlexibleDate } from '../../utils';
import { evaluationStrength, formatEvaluation, getModelScale, isInModel, sanitizeEvaluation } from '../../utils/evaluation';
import { useEvaluationModel } from '../../hooks/useEvaluationModel';
import { joinSourceLines, sourceToPlainText } from '../../utils/sourceLinks';
import { useTabFilterIds } from '../../hooks/useTabFilterIds';
import { getSourceSchemeNames } from '../../plugins/sourceSchemes';
import { emitExport } from '../../plugins/pluginEventBus';
import { downloadBlob } from '../../utils/download';
import { escapeCsvField } from '../../utils/csv';
import { useShallow } from 'zustand/react/shallow';

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
const COL_DATE = 184;

const isDateProperty = (prop: Property) => prop.type === 'date' || prop.type === 'datetime';

/** What a row shows: an element, or a link (same label, tags, grading, source, properties) */
type MatrixRow = Pick<Element, 'id' | 'label' | 'tags' | 'properties' | 'confidence' | 'source'> & { evaluation?: Element['evaluation'] };
export type MatrixKind = 'elements' | 'links';

/** Columns of the links table that come from the link itself, not editable here */
const LINK_COLUMNS = ['link:from', 'link:to', 'link:start', 'link:end', 'link:direction'] as const;
const isLinkColumn = (key: string) => (LINK_COLUMNS as readonly string[]).includes(key);
const BASE_COLUMNS: Record<MatrixKind, string[]> = {
  elements: ['tags', 'confidence', 'source'],
  links: [...LINK_COLUMNS, 'tags', 'confidence', 'source'],
};

/** What the link columns need besides the row: the elements' names */
interface RowContext {
  model: EvaluationModel;
  labelOf: (id: string) => string;
}

const linkStart = (link: Link): Date | null => link.dateRange?.start ?? link.date ?? null;
const linkEnd = (link: Link): Date | null => link.dateRange?.end ?? null;
const DIRECTION_KEYS: Record<string, string> = {
  none: 'directionNone', forward: 'directionForward', backward: 'directionBackward', both: 'directionBoth',
};
function directionText(link: Link): string {
  const direction = link.direction || (link.directed ? 'forward' : 'none');
  return i18next.t(`panels:detail.labels.${DIRECTION_KEYS[direction] ?? 'directionNone'}`);
}
/** A link date as shown: the day, with its time when it has one */
function linkDateText(date: Date | null, timeZone?: string): string {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const day = d.getHours() === 0 && d.getMinutes() === 0;
  return formatPropertyValue(d, day ? 'date' : 'datetime', i18next.language, timeZone);
}

/** Extract a display value for a property key from a row */
function getPropertyValue(row: MatrixRow, key: string): string {
  // Every value of the key (a merge may leave several)
  return propertiesOf(row.properties, key).map(displayPropertyValue).join(VALUES_SEPARATOR);
}

function displayPropertyValue(prop: Property): string {
  if (prop.value instanceof Date || isDateProperty(prop)) {
    // Date and time with the source hour: "28 oct. 2026, 23:59 (05:59 Tokyo)"
    return formatPropertyValue(prop.value, prop.type, i18next.language, prop.timeZone);
  }
  if (typeof prop.value === 'boolean') {
    return prop.value ? '✓' : '✗';
  }
  return String(prop.value);
}

/** Editable text of a property: dates as `YYYY-MM-DD[ HH:mm]` in their source zone */
function getPropertyEditValue(prop: Property | undefined): string {
  if (!prop || prop.value == null) return '';
  if (prop.value instanceof Date || isDateProperty(prop)) {
    const date = parsePropertyDate(prop.value);
    if (!date) return String(prop.value);
    const keys = dateInputKeys(date, prop.type === 'datetime' ? prop.timeZone : undefined);
    return prop.type === 'date' ? keys.date : `${keys.date} ${keys.time}`;
  }
  return String(prop.value);
}

/**
 * Value typed in a property cell, converted to the property's type; undefined
 * when it cannot be read (the edit is then dropped rather than turning a typed
 * value into text).
 */
function parsePropertyEdit(text: string, prop: Property | undefined): Property['value'] | undefined {
  if (!prop || !prop.type || prop.type === 'text') return text || null;
  if (!text) return null;
  switch (prop.type) {
    case 'number': {
      const num = Number(text.replace(',', '.'));
      return Number.isFinite(num) ? num : undefined;
    }
    case 'boolean':
      return ['true', '1', '✓', 'oui', 'yes', 'vrai'].includes(text.toLowerCase());
    case 'date':
    case 'datetime': {
      const parsed = parseFlexibleDate(text);
      if (!parsed) return undefined;
      // A zone in the text ("…Z", "+02:00") is exact; otherwise it is the source wall clock
      if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) return parsed;
      const timeZone = prop.type === 'datetime' ? prop.timeZone : undefined;
      return dateFromInputKeys(toLocalDateKey(parsed), prop.type === 'date' ? '00:00' : toLocalTimeKey(parsed), timeZone);
    }
    default:
      return text;
  }
}

/** Get a sortable raw value (number-aware) */
function getSortValue(row: MatrixRow, column: string, ctx: RowContext): string | number {
  const link = row as Link;
  switch (column) {
    case 'label':
      return row.label.toLowerCase();
    case 'tags':
      return (row.tags[0] || '').toLowerCase();
    case 'confidence':
      // Grading models: same order as confidence (weakest first, ungraded lowest)
      if (ctx.model !== 'zeroneurone') return evaluationStrength(row.evaluation, ctx.model);
      return row.confidence ?? -1;
    case 'source':
      return joinSourceLines(sourceToPlainText(row.source, getSourceSchemeNames())).toLowerCase();
    case 'link:from':
      return ctx.labelOf(link.fromId).toLowerCase();
    case 'link:to':
      return ctx.labelOf(link.toId).toLowerCase();
    case 'link:start':
      return linkStart(link) ? new Date(linkStart(link)!).getTime() : '';
    case 'link:end':
      return linkEnd(link) ? new Date(linkEnd(link)!).getTime() : '';
    case 'link:direction':
      return directionText(link).toLowerCase();
    default: {
      const prop = row.properties.find((p) => p.key === column);
      if (!prop || prop.value == null) return '';
      if (typeof prop.value === 'number') return prop.value;
      if (prop.value instanceof Date || isDateProperty(prop)) return parsePropertyDate(prop.value)?.getTime() ?? '';
      return String(prop.value).toLowerCase();
    }
  }
}

/** Render cell value for fixed columns */
function getCellValue(row: MatrixRow, colKey: string, ctx: RowContext): string {
  const link = row as Link;
  switch (colKey) {
    case 'label':
      return row.label || '—';
    case 'tags':
      return row.tags[0] || '—';
    case 'confidence':
      if (ctx.model !== 'zeroneurone') {
        return isInModel(row.evaluation, ctx.model) ? formatEvaluation(row.evaluation) : '—';
      }
      return row.confidence != null ? `${row.confidence}%` : '—';
    case 'source':
      return row.source || '—';
    case 'link:from':
      return ctx.labelOf(link.fromId) || '—';
    case 'link:to':
      return ctx.labelOf(link.toId) || '—';
    case 'link:start':
      return linkDateText(linkStart(link), link.dateRange?.timeZone) || '—';
    case 'link:end':
      return linkDateText(linkEnd(link), link.dateRange?.timeZone) || '—';
    case 'link:direction':
      return directionText(link);
    default:
      return getPropertyValue(row, colKey) || '—';
  }
}

/**
 * Value of a cell for a workbook: numbers as numbers and dates as dates, so
 * the spreadsheet sorts and computes them; the rest as the table shows it.
 */
function getExportValue(row: MatrixRow, colKey: string, ctx: RowContext): SheetCell {
  const link = row as Link;
  switch (colKey) {
    case 'confidence':
      if (ctx.model === 'zeroneurone') return row.confidence ?? null;
      break;
    case 'source':
      return row.source ? joinSourceLines(sourceToPlainText(row.source, getSourceSchemeNames())) : null;
    case 'link:start':
      return linkStart(link) ? new Date(linkStart(link)!) : null;
    case 'link:end':
      return linkEnd(link) ? new Date(linkEnd(link)!) : null;
    case 'label': case 'tags': case 'link:from': case 'link:to': case 'link:direction':
      break;
    default: {
      // One value: typed; several: as the table joins them
      const props = propertiesOf(row.properties, colKey);
      if (props.length === 1) {
        const [prop] = props;
        if (typeof prop.value === 'number') return prop.value;
        if (prop.value instanceof Date || isDateProperty(prop)) return parsePropertyDate(prop.value) ?? null;
      }
    }
  }
  const text = getCellValue(row, colKey, ctx);
  return text === '—' ? null : text;
}

interface MatrixTableProps {
  kind: MatrixKind;
  /** The table on screen: the other one keeps its state, hidden, and listens to no key */
  active: boolean;
  onKindChange: (kind: MatrixKind) => void;
  /** Hands the parent a reader of this table as a workbook sheet */
  registerSheet: (kind: MatrixKind, read: (() => SheetData) | null) => void;
  /** Both tables as a workbook of two sheets */
  onWorkbook: (format: 'xlsx' | 'ods') => void;
}

function MatrixTable({ kind, active, onKindChange, registerSheet, onWorkbook }: MatrixTableProps) {
  const { t } = useTranslation('pages');
  // Export: this table as CSV, or both as a workbook
  const exportBtnRef = useRef<HTMLButtonElement>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const columnsBtnRef = useRef<HTMLButtonElement>(null);
  const columnsDropdownRef = useRef<HTMLDivElement>(null);
  const [columnsDropdownPos, setColumnsDropdownPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const elements = useDossierStore((s) => s.elements);
  const links = useDossierStore((s) => s.links);
  const updateElement = useDossierStore((s) => s.updateElement);
  const evaluationModel = useEvaluationModel();
  const dossierName = useDossierStore((s) => s.currentDossier?.name ?? 'export');
  const updateLink = useDossierStore((s) => s.updateLink);
  const selection = useSelectionStore(useShallow((s) => ({
    selectElement: s.selectElement, selectElements: s.selectElements, toggleElement: s.toggleElement, selectedElementIds: s.selectedElementIds,
    selectLink: s.selectLink, selectLinks: s.selectLinks, toggleLink: s.toggleLink, selectedLinkIds: s.selectedLinkIds,
  })));
  // Rows are elements or links: selection follows
  const isLinks = kind === 'links';
  const selectedIds: Set<string> = isLinks ? selection.selectedLinkIds : selection.selectedElementIds;
  const selectRow = isLinks ? (id: string) => selection.selectLink(id) : (id: string) => selection.selectElement(id);
  const selectRows = isLinks ? (ids: string[]) => selection.selectLinks(ids) : (ids: string[]) => selection.selectElements(ids);
  const toggleRow = isLinks ? (id: string) => selection.toggleLink(id) : (id: string) => selection.toggleElement(id);
  const pushAction = useHistoryStore((s) => s.pushAction);
  const historyUndo = useHistoryStore((s) => s.undo);
  const historyRedo = useHistoryStore((s) => s.redo);
  const { filters, hiddenElementIds } = useViewStore(useShallow((s) => ({ filters: s.filters, hiddenElementIds: s.hiddenElementIds })));
  // Hidden by hand, or outside the filters when the user chose to hide them
  const viewHiddenIds = useHiddenElementIds();
  const { highlightedElementIds: insightsHighlightedIds } = useInsightsStore(useShallow((s) => ({ highlightedElementIds: s.highlightedElementIds })));
  const queryFilterActive = useQueryStore((s) => s.isFilterActive);
  const queryMatchElementIds = useQueryStore((s) => s.matchingElementIds);
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
  const [firstColumnPinned, setFirstColumnPinned] = useState(true);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; elementId: string; colKey: string } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastClickedRowRef = useRef<number>(-1);

  // Compute dimmed element IDs (same logic as Timeline/Map/Canvas)
  const tabFilterIds = useTabFilterIds();
  const dimmedElementIds = useMemo(() => {
    let dimmed: Set<string>;
    if (insightsHighlightedIds.size > 0) {
      dimmed = new Set<string>();
      elements.forEach((el) => {
        if (!insightsHighlightedIds.has(el.id)) dimmed.add(el.id);
      });
    } else {
      dimmed = getDimmedElementIds(elements, filters, hiddenElementIds, evaluationModel, tabFilterIds);
    }
    // ZNQuery filter: dim elements not matching the query
    if (queryFilterActive && queryMatchElementIds.size > 0) {
      for (const el of elements) {
        if (!queryMatchElementIds.has(el.id)) {
          dimmed.add(el.id);
        }
      }
    }
    return dimmed;
  }, [elements, links, filters, hiddenElementIds, insightsHighlightedIds, queryFilterActive, queryMatchElementIds, evaluationModel, tabFilterIds]);

  // Filter elements: exclude groups, annotations, hidden; respect tabs
  const visibleElements = useMemo(() => {
    return elements.filter((el) => {
      if (el.isGroup || el.isAnnotation) return false;
      if (viewHiddenIds.has(el.id)) return false;
      if (activeTabId && !tabMemberSet.has(el.id)) return false;
      return true;
    });
  }, [elements, viewHiddenIds, activeTabId, tabMemberSet]);

  // Links whose two ends show: not hidden, and in the active tab
  const visibleLinks = useMemo(() => {
    if (!isLinks) return [];
    const shown = new Set(elements
      .filter((el) => !viewHiddenIds.has(el.id) && (!activeTabId || tabMemberSet.has(el.id)))
      .map((el) => el.id));
    return links.filter((l) => shown.has(l.fromId) && shown.has(l.toId));
  }, [isLinks, links, elements, viewHiddenIds, activeTabId, tabMemberSet]);
  const tableRows: MatrixRow[] = isLinks ? visibleLinks : visibleElements;

  // Element names, for the ends of links
  const ctx = useMemo((): RowContext => {
    const names = new Map(elements.map((el) => [el.id, el.label]));
    return { model: evaluationModel, labelOf: (id) => names.get(id) ?? '' };
  }, [elements, evaluationModel]);

  // Collect all unique property keys across visible rows
  const propertyKeys = useMemo(() => {
    const keyCount = new Map<string, number>();
    tableRows.forEach((row) => {
      row.properties.forEach((p) => {
        keyCount.set(p.key, (keyCount.get(p.key) || 0) + 1);
      });
    });
    return Array.from(keyCount.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([key]) => key);
  }, [tableRows]);
  const baseColumns = BASE_COLUMNS[kind];

  // Sync column order when property keys change
  useEffect(() => {
    setColumnOrder((prev) => {
      const allKeys = [...baseColumns, ...propertyKeys];
      if (prev.length === 0) return allKeys;
      const existing = prev.filter((k) => allKeys.includes(k));
      const newKeys = allKeys.filter((k) => !prev.includes(k));
      return [...existing, ...newKeys];
    });
  }, [propertyKeys, baseColumns]);

  // Build all column definitions (respecting user order)
  const allColumns: ColumnDef[] = useMemo(() => {
    const colMap: Record<string, ColumnDef> = {
      tags: { key: 'tags', label: t('matrix.type'), width: COL_TAGS },
      confidence: {
        key: 'confidence',
        label: evaluationModel === 'zeroneurone' ? t('matrix.confidence') : t('matrix.evaluation'),
        width: COL_CONFIDENCE,
        alignRight: true,
      },
      source: { key: 'source', label: t('matrix.source'), width: COL_SOURCE },
      'link:from': { key: 'link:from', label: t('matrix.from'), width: COL_LABEL },
      'link:to': { key: 'link:to', label: t('matrix.to'), width: COL_LABEL },
      'link:start': { key: 'link:start', label: t('matrix.start'), width: COL_DATE },
      'link:end': { key: 'link:end', label: t('matrix.end'), width: COL_DATE },
      'link:direction': { key: 'link:direction', label: t('matrix.direction'), width: COL_TAGS },
    };
    propertyKeys.forEach((key) => {
      colMap[key] = { key, label: key, width: COL_PROPERTY };
    });
    const ordered = columnOrder.filter((k) => k in colMap).map((k) => colMap[k]);
    return [
      { key: 'label', label: isLinks ? t('matrix.linkLabel') : t('matrix.label'), width: COL_LABEL, fixed: true },
      ...ordered,
    ];
  }, [t, propertyKeys, columnOrder, evaluationModel, isLinks]);

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

  const toggleColumn = useCallback((key: string) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const showAllColumns = useCallback(() => {
    setHiddenColumns(new Set());
  }, []);

  const hideAllColumns = useCallback(() => {
    setHiddenColumns(new Set(columnOrder));
  }, [columnOrder]);

  const resetView = useCallback(() => {
    setSort({ column: 'label', direction: 'asc' });
    setHiddenColumns(new Set());
    setColumnOrder([...baseColumns, ...propertyKeys]);
    setColumnWidths({});
    setColumnFilters({});
    setFirstColumnPinned(true);
  }, [propertyKeys, baseColumns]);

  const hasActiveFilters = Object.values(columnFilters).some((v) => v.length > 0);

  // Column filters handed to the other views as a ZNQuery filter (added to
  // the query already applied, if any). The column filters stay: the matrix
  // only dims what a query leaves out, it would show every row again
  // (elements only: a query selects elements)
  const filterQuery = useMemo(
    () => (isLinks ? { ast: null, unsupported: [] } : matrixFiltersToQuery(columnFilters, elements)),
    [columnFilters, elements, isLinks],
  );
  const queryText = useQueryStore((s) => s.currentText);
  const filtersApplied = !!filterQuery.ast && queryFilterActive && queryText.includes(serializeQuery(filterQuery.ast));
  const applyFiltersToViews = useCallback(() => {
    if (!filterQuery.ast) return;
    const query = useQueryStore.getState();
    const ast = query.isFilterActive && query.currentAst
      ? { type: 'and' as const, children: [query.currentAst, filterQuery.ast] }
      : filterQuery.ast;
    if (query.outputMode !== 'canvas' && query.outputMode !== 'both') query.setOutputMode('canvas');
    query.setAst(ast);
  }, [filterQuery]);

  const hasCustomizations = hiddenColumns.size > 0
    || Object.keys(columnWidths).length > 0
    || sort.column !== 'label' || sort.direction !== 'asc'
    || hasActiveFilters
    || !firstColumnPinned
    || (columnOrder.length > 0 && columnOrder.join(',') !== [...baseColumns, ...propertyKeys].join(','));

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
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(0);
  const [resizingCol, setResizingCol] = useState<string | null>(null);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent, col: ColumnDef) => {
    e.preventDefault();
    e.stopPropagation();
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
      setResizingCol(null);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingCol]);

  // Position columns dropdown when opened
  useLayoutEffect(() => {
    if (!columnsOpen || !columnsDropdownRef.current || !columnsBtnRef.current) return;
    const btnRect = columnsBtnRef.current.getBoundingClientRect();
    const menu = columnsDropdownRef.current;
    const menuRect = menu.getBoundingClientRect();
    let x = btnRect.left;
    let y = btnRect.bottom + 4;
    if (x + menuRect.width > window.innerWidth - 8) x = window.innerWidth - menuRect.width - 8;
    if (x < 8) x = 8;
    if (y + menuRect.height > window.innerHeight - 8) y = btnRect.top - menuRect.height - 4;
    setColumnsDropdownPos({ x, y });
  }, [columnsOpen]);

  // Filter by column values
  const filteredRows = useMemo(() => {
    const activeFilters = Object.entries(columnFilters).filter(([, v]) => v.length > 0);
    if (activeFilters.length === 0) return tableRows;
    return tableRows.filter((row) =>
      activeFilters.every(([colKey, filterText]) => {
        const value = getCellValue(row, colKey, ctx).toLowerCase();
        return value.includes(filterText.toLowerCase());
      })
    );
  }, [tableRows, columnFilters, ctx]);

  const sortedRows = useMemo(() => {
    const sorted = [...filteredRows];
    sorted.sort((a, b) => {
      const aVal = getSortValue(a, sort.column, ctx);
      const bVal = getSortValue(b, sort.column, ctx);
      let cmp: number;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        cmp = aVal - bVal;
      } else {
        cmp = String(aVal).localeCompare(String(bVal));
      }
      return sort.direction === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [filteredRows, sort, ctx]);

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
      toggleRow(id);
      lastClickedRowRef.current = rowIndex;
    } else if (e.shiftKey && lastClickedRowRef.current >= 0) {
      // Shift+click: range select from last clicked to current
      const from = Math.min(lastClickedRowRef.current, rowIndex);
      const to = Math.max(lastClickedRowRef.current, rowIndex);
      const rangeIds = sortedRows.slice(from, to + 1).map((row) => row.id);
      selectRows(rangeIds);
    } else {
      // Normal click: single select
      selectRow(id);
      lastClickedRowRef.current = rowIndex;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, isLinks, sortedRows]);

  // Inline cell editing
  const [editingCell, setEditingCell] = useState<{ rowId: string; colKey: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);
  // Source: one source per line, edited in a multi-line box anchored to the cell
  const sourceCellRef = useRef<HTMLDivElement>(null);
  const sourceTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus input when entering edit mode
  useEffect(() => {
    const field = editInputRef.current ?? sourceTextareaRef.current;
    if (editingCell && field) {
      field.focus();
      field.select();
    }
  }, [editingCell]);

  /** Get raw editable value (without formatting like % or —) */
  const getRawEditValue = useCallback((el: MatrixRow, colKey: string): string => {
    switch (colKey) {
      case 'label': return el.label;
      case 'tags': return el.tags.join(', ');
      case 'confidence':
        if (evaluationModel !== 'zeroneurone') {
          return isInModel(el.evaluation, evaluationModel) ? formatEvaluation(el.evaluation) : '';
        }
        return el.confidence != null ? String(el.confidence) : '';
      case 'source': return el.source;
      default: return getPropertyEditValue(el.properties.find((p) => p.key === colKey));
    }
  }, [evaluationModel]);


  const handleCellDoubleClick = useCallback((el: MatrixRow, colKey: string) => {
    // The ends, dates and direction of a link are edited on the canvas
    if (anonymousMode || isLinkColumn(colKey)) return;
    setEditingCell({ rowId: el.id, colKey });
    setEditValue(getRawEditValue(el, colKey));
  }, [anonymousMode, getRawEditValue]);

  /** Write a change of the row, element or link, undoable */
  const saveRow = useCallback((id: string, changes: Partial<Element> & Partial<Link>, old: Partial<Element> & Partial<Link>) => {
    if (isLinks) {
      updateLink(id, changes as Partial<Link>);
      pushAction({ type: 'update-link', undo: { linkId: id, linkChanges: old }, redo: { linkId: id, linkChanges: changes } });
    } else {
      updateElement(id, changes as Partial<Element>);
      pushAction({ type: 'update-element', undo: { elementId: id, changes: old }, redo: { elementId: id, changes } });
    }
  }, [isLinks, updateLink, updateElement, pushAction]);

  const handleCellSave = useCallback(() => {
    if (!editingCell) return;
    const el = tableRows.find((e) => e.id === editingCell.rowId);
    if (!el) { setEditingCell(null); return; }

    const { colKey } = editingCell;
    const trimmed = editValue.trim();

    switch (colKey) {
      case 'label': {
        // A link may have no label; an element needs one
        if ((trimmed || isLinks) && trimmed !== el.label) saveRow(el.id, { label: trimmed }, { label: el.label });
        break;
      }
      case 'tags': {
        const newTags = trimmed ? trimmed.split(',').map((t) => t.trim()).filter(Boolean) : [];
        if (newTags.join(',') !== el.tags.join(',')) saveRow(el.id, { tags: newTags }, { tags: el.tags });
        break;
      }
      case 'confidence': {
        const evaluationScale = getModelScale(evaluationModel);
        if (evaluationScale) {
          // "B2", "b 2", "B-" or "-2"; empty clears the grading
          const compact = trimmed.replace(/\s+/g, '').toUpperCase();
          const next = compact === ''
            ? null
            : sanitizeEvaluation({
                scale: evaluationScale,
                source: compact[0] === '-' ? null : compact[0],
                info: compact[1] && compact[1] !== '-' ? compact[1] : null,
              });
          if (compact !== '' && !next) break;
          if (formatEvaluation(next) !== formatEvaluation(isInModel(el.evaluation, evaluationModel) ? el.evaluation : null)) {
            saveRow(el.id, { evaluation: next }, { evaluation: el.evaluation ?? null });
          }
          break;
        }
        const num = trimmed === '' ? null : Math.round(Math.max(0, Math.min(100, parseInt(trimmed, 10) || 0)) / 10) * 10 as Confidence;
        if (num !== el.confidence) saveRow(el.id, { confidence: num }, { confidence: el.confidence });
        break;
      }
      case 'source': {
        if (trimmed !== el.source) saveRow(el.id, { source: trimmed }, { source: el.source });
        break;
      }
      default: {
        // Property column
        const oldProps = el.properties;
        const existing = oldProps.find((p) => p.key === colKey);
        // Unchanged text keeps the stored value (a date stays a date, with its zone)
        if (trimmed === getPropertyEditValue(existing).trim()) break;
        const value = parsePropertyEdit(trimmed, existing);
        if (value === undefined) break;
        const newProps = existing
          ? oldProps.map((p) => p.key === colKey ? { ...p, value } : p)
          : [...oldProps, { key: colKey, value }];
        saveRow(el.id, { properties: newProps }, { properties: oldProps });
        break;
      }
    }
    setEditingCell(null);
  }, [editingCell, editValue, tableRows, saveRow, evaluationModel, isLinks]);

  const handleCellCancel = useCallback(() => {
    setEditingCell(null);
  }, []);

  /** Navigate to an adjacent cell: save current, then open the target */
  const navigateToCell = useCallback((rowDelta: number, colDelta: number) => {
    if (!editingCell) return;
    const rowIdx = sortedRows.findIndex((el) => el.id === editingCell.rowId);
    // The columns that can be edited: a link's ends, dates and direction are skipped
    const editable = visibleCols.filter((c) => !isLinkColumn(c.key));
    const colIdx = editable.findIndex((c) => c.key === editingCell.colKey);
    if (rowIdx === -1 || colIdx === -1) return;
    const newRowIdx = Math.max(0, Math.min(sortedRows.length - 1, rowIdx + rowDelta));
    const newColIdx = Math.max(0, Math.min(editable.length - 1, colIdx + colDelta));
    const newEl = sortedRows[newRowIdx];
    const newCol = editable[newColIdx];
    if (newEl && newCol) {
      // Save current first (handleCellSave clears editingCell), then open new
      handleCellSave();
      // Use setTimeout to let state settle after save
      setTimeout(() => {
        setEditingCell({ rowId: newEl.id, colKey: newCol.key });
        setEditValue(getRawEditValue(newEl, newCol.key));
      }, 0);
    }
  }, [editingCell, sortedRows, visibleCols, handleCellSave, getRawEditValue]);

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

  // Multi-line source: Enter adds a line, Ctrl/Cmd+Enter saves, arrows move the caret
  const handleSourceKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleCellSave(); }
    else if (e.key === 'Escape') { e.preventDefault(); handleCellCancel(); }
    else if (e.key === 'Tab') { e.preventDefault(); navigateToCell(0, e.shiftKey ? -1 : 1); return; }
    e.stopPropagation();
  }, [handleCellSave, handleCellCancel, navigateToCell]);

  // Build TSV text from selected rows for clipboard
  const buildSelectedTSV = useCallback(() => {
    const selectedRows = sortedRows.filter((el) => selectedIds.has(el.id));
    if (selectedRows.length === 0) return '';
    const headers = visibleCols.map((c) => c.label).join('\t');
    const rows = selectedRows.map((el) =>
      visibleCols.map((col) => {
        const v = getCellValue(el, col.key, ctx);
        return v === '—' ? '' : v;
      }).join('\t')
    );
    return [headers, ...rows].join('\n');
  }, [sortedRows, selectedIds, visibleCols, ctx]);

  // Context menu handlers
  const handleContextMenu = useCallback((e: React.MouseEvent, elementId: string, colKey: string) => {
    e.preventDefault();
    e.stopPropagation();
    // Auto-select the row if not already selected
    if (!selectedIds.has(elementId)) selectRow(elementId);
    setContextMenu({ x: e.clientX, y: e.clientY, elementId, colKey });
    setContextMenuPos({ x: e.clientX, y: e.clientY });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, selection, isLinks]);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleCopyCell = useCallback(() => {
    if (!contextMenu) return;
    const el = tableRows.find((e) => e.id === contextMenu.elementId);
    if (!el) return;
    const value = getCellValue(el, contextMenu.colKey, ctx);
    navigator.clipboard.writeText(value === '—' ? '' : value);
    closeContextMenu();
  }, [contextMenu, tableRows, closeContextMenu, ctx]);

  const handleCopyRow = useCallback(() => {
    if (!contextMenu) return;
    const el = tableRows.find((e) => e.id === contextMenu.elementId);
    if (!el) return;
    const headers = visibleCols.map((c) => c.label).join('\t');
    const row = visibleCols.map((col) => {
      const v = getCellValue(el, col.key, ctx);
      return v === '—' ? '' : v;
    }).join('\t');
    navigator.clipboard.writeText(`${headers}\n${row}`);
    closeContextMenu();
  }, [contextMenu, tableRows, visibleCols, closeContextMenu, ctx]);

  // Right-clicked cell value as a ZNQuery (exact value, case aside), when the
  // column has an equivalent query
  const contextCell = useMemo(() => {
    // A query selects elements: none on a link's value
    if (!contextMenu || isLinks) return null;
    const el = elements.find((e) => e.id === contextMenu.elementId);
    if (!el) return null;
    const value = getCellValue(el, contextMenu.colKey, ctx);
    const { ast } = value === '—'
      ? { ast: null }
      : matrixFiltersToQuery({ [contextMenu.colKey]: value }, elements);
    const query = ast?.type === 'condition' ? { ...ast, operator: 'eq' as const } : null;
    return { query };
  }, [contextMenu, elements, ctx, isLinks]);

  const handleQueryOnValue = useCallback(() => {
    if (!contextCell?.query) return;
    useQueryStore.getState().setText(serializeQuery(contextCell.query));
    useUIStore.getState().setSidePanelTab('query');
    closeContextMenu();
  }, [contextCell, closeContextMenu]);

  const handleCopySelection = useCallback(() => {
    const tsv = buildSelectedTSV();
    if (tsv) navigator.clipboard.writeText(tsv);
    closeContextMenu();
  }, [buildSelectedTSV, closeContextMenu]);

  // Viewport clamping for context menu
  useLayoutEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return;
    const rect = contextMenuRef.current.getBoundingClientRect();
    const padding = 8;
    let newX = contextMenu.x;
    let newY = contextMenu.y;
    if (newX + rect.width > window.innerWidth - padding) newX = window.innerWidth - rect.width - padding;
    if (newY + rect.height > window.innerHeight - padding) newY = window.innerHeight - rect.height - padding;
    if (newX < padding) newX = padding;
    if (newY < padding) newY = padding;
    if (newX !== contextMenuPos.x || newY !== contextMenuPos.y) {
      setContextMenuPos({ x: newX, y: newY });
    }
  }, [contextMenu, contextMenuPos.x, contextMenuPos.y]);

  // Close context menu on scroll
  useEffect(() => {
    if (!contextMenu) return;
    const handleScroll = () => closeContextMenu();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeContextMenu();
    };
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu, closeContextMenu]);

  const handleExportCSV = useCallback(() => {
    const escape = (v: string) => escapeCsvField(v);
    const headers = visibleCols.map((c) => escape(c.label)).join(',');
    const rows = sortedRows.map((el) =>
      visibleCols.map((col) => {
        const v = getCellValue(el, col.key, ctx);
        return escape(v === '—' ? '' : v);
      }).join(',')
    );
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const slug = dossierName.replace(/[^a-zA-Z0-9À-ÿ_-]/g, '_').replace(/_+/g, '_');
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const ts = `${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear()}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    downloadBlob(blob, `${slug}_${isLinks ? 'matrice-liens' : 'matrice'}_${ts}.csv`);
    emitExport('matrix-csv', { rows: kind });
  }, [sortedRows, visibleCols, ctx, dossierName, isLinks, kind]);

  // This table as a workbook sheet: its columns, sort and filters, typed values
  useEffect(() => {
    registerSheet(kind, () => ({
      name: isLinks ? t('matrix.sheetLinks') : t('matrix.sheetElements'),
      columns: visibleCols.map((c) => c.label),
      rows: sortedRows.map((row) => visibleCols.map((col) => getExportValue(row, col.key, ctx))),
    }));
    return () => registerSheet(kind, null);
  }, [registerSheet, kind, isLinks, t, visibleCols, sortedRows, ctx]);

  // Keyboard shortcuts (Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y / Ctrl+C)
  useEffect(() => {
    // The hidden table listens to no key: two would undo twice
    if (!active) return;
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
      if (e.key === 'c' && isCtrlOrMeta && selectedIds.size > 0) {
        e.preventDefault();
        const tsv = buildSelectedTSV();
        if (tsv) navigator.clipboard.writeText(tsv);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active, historyUndo, historyRedo, selectedIds, buildSelectedTSV]);

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

  const totalContentHeight = sortedRows.length * ROW_HEIGHT;
  const firstVisibleRow = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS);
  const lastVisibleRow = Math.min(
    sortedRows.length - 1,
    Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + BUFFER_ROWS
  );
  const windowRows = sortedRows.slice(firstVisibleRow, lastVisibleRow + 1);

  const SortIcon = useCallback(({ column }: { column: string }) => {
    if (sort.column !== column) return <ArrowUpDown size={12} className="text-text-tertiary" />;
    return sort.direction === 'asc'
      ? <ArrowUp size={12} className="text-text-primary" />
      : <ArrowDown size={12} className="text-text-primary" />;
  }, [sort]);

  const rowCount = tableRows.length;
  const hiddenCount = hiddenColumns.size;
  const nonFixedColumns = allColumns.filter((c) => !c.fixed);

  return (
    <div className={`absolute inset-0 flex flex-col overflow-hidden ${active ? '' : 'hidden'}`} data-testid={`matrix-${kind}`}>
      <ViewToolbar
        showMediaToggle={false}
        showCommentBadgesToggle={false}
        leftContent={
          <div className="flex items-center gap-3">
            {/* Rows: elements or links */}
            <div className="flex items-center rounded border border-border-default overflow-hidden shrink-0" role="tablist">
              {(['elements', 'links'] as const).map((k) => (
                <button
                  key={k}
                  role="tab"
                  aria-selected={k === kind}
                  onClick={() => onKindChange(k)}
                  data-testid={`matrix-kind-${k}`}
                  className={`px-2 py-0.5 text-xs transition-colors ${k === kind ? 'bg-accent-light text-accent' : 'text-text-secondary hover:bg-bg-tertiary'}`}
                >
                  {t(k === 'elements' ? 'matrix.kindElements' : 'matrix.kindLinks')}
                </button>
              ))}
            </div>
            <span className="text-xs text-text-secondary shrink-0">
              {t(isLinks ? 'matrix.countLinks' : 'matrix.count', { count: sortedRows.length, total: rowCount })}
              {' · '}
              {t('matrix.properties', { count: propertyKeys.length })}
            </span>

            {/* Column visibility toggle */}
            <div>
              <button
                ref={columnsBtnRef}
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
            </div>

            <button
              ref={exportBtnRef}
              onClick={() => setExportOpen((v) => !v)}
              data-testid="matrix-export"
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${exportOpen ? 'bg-accent-light text-accent' : 'hover:bg-bg-tertiary text-text-secondary'}`}
              title={t('matrix.export')}
            >
              <Upload size={14} />
            </button>
            <DropdownPortal anchorRef={exportBtnRef} isOpen={exportOpen && active} onClose={() => setExportOpen(false)} className="py-1 min-w-44">
              {([
                ['csv', t('matrix.exportCsvShort'), handleExportCSV],
                ['xlsx', t('matrix.exportXlsx'), () => onWorkbook('xlsx')],
                ['ods', t('matrix.exportOds'), () => onWorkbook('ods')],
              ] as const).map(([id, label, run]) => (
                <button
                  key={id}
                  onClick={() => { setExportOpen(false); run(); }}
                  data-testid={`matrix-export-${id}`}
                  className="w-full px-3 py-1.5 text-left text-sm text-text-primary hover:bg-bg-tertiary transition-colors"
                >
                  {label}
                </button>
              ))}
            </DropdownPortal>

            {/* Column filters → filter of every view */}
            {hasActiveFilters && !isLinks && (
              <button
                onClick={applyFiltersToViews}
                disabled={!filterQuery.ast || filtersApplied}
                data-testid="matrix-apply-filters"
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
                  filterQuery.ast && !filtersApplied ? 'hover:bg-bg-tertiary text-text-secondary' : 'opacity-30 cursor-not-allowed text-text-tertiary'
                }`}
                title={filtersApplied
                  ? t('matrix.filtersApplied')
                  : filterQuery.ast
                  ? t('matrix.applyFilters')
                  : t('matrix.applyFiltersUnsupported', { columns: filterQuery.unsupported.map((c) => allColumns.find((col) => col.key === c)?.label ?? c).join(', ') })}
              >
                <Filter size={14} />
                {t('matrix.applyFiltersShort')}
              </button>
            )}

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
        role="grid"
        aria-label={t('dossier.views.matrix')}
        aria-rowcount={sortedRows.length + 1}
        aria-colcount={visibleCols.length}
        className="flex-1 overflow-auto"
        onScroll={handleScroll}
      >
        {/* Empty only with nothing to show at all: a column filter that keeps
            no row leaves the headers and the filter row up, to correct it */}
        {tableRows.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-text-tertiary">
            {t(isLinks ? 'matrix.emptyLinks' : 'matrix.empty')}
          </div>
        ) : (
          <div style={{ minWidth: totalRowWidth }}>
            {/* Sticky header + filter row */}
            <div className="sticky top-0 z-10" style={{ width: totalRowWidth }}>
              {/* Column headers */}
              <div
                role="row"
                aria-rowindex={1}
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
                      role="columnheader"
                      aria-sort={
                        sort.column === col.key
                          ? (sort.direction === 'asc' ? 'ascending' : 'descending')
                          : 'none'
                      }
                      onMouseDown={(e) => !col.fixed && handleHeaderMouseDown(e, col.key)}
                      onMouseEnter={() => !col.fixed && handleHeaderMouseEnter(col.key)}
                      className={`relative flex items-center gap-1 px-2 text-xs font-medium text-text-secondary shrink-0 border-r border-border-default ${
                        col.fixed && firstColumnPinned ? 'sticky left-0 z-20 bg-bg-secondary' : ''
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
                      {col.fixed && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setFirstColumnPinned((v) => !v); }}
                          className={`shrink-0 p-0.5 rounded transition-colors ${
                            firstColumnPinned ? 'text-accent' : 'text-text-tertiary hover:text-text-secondary'
                          }`}
                          title={firstColumnPinned ? t('matrix.unpinColumn') : t('matrix.pinColumn')}
                        >
                          <Pin size={12} />
                        </button>
                      )}
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
                      col.fixed && firstColumnPinned ? 'sticky left-0 z-20 bg-bg-primary' : ''
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

            {sortedRows.length === 0 && (
              <div className="sticky left-0 px-3 py-2 text-sm text-text-tertiary">{t('matrix.noResults')}</div>
            )}

            {/* Virtual rows container */}
            <div style={{ height: totalContentHeight, position: 'relative', width: totalRowWidth }}>
              {windowRows.map((el, i) => {
                const rowIndex = firstVisibleRow + i;
                // A link is dimmed with either of its ends
                const isDimmed = isLinks
                  ? dimmedElementIds.has((el as Link).fromId) || dimmedElementIds.has((el as Link).toId)
                  : dimmedElementIds.has(el.id);
                const isSelected = selectedIds.has(el.id);

                return (
                  <div
                    key={el.id}
                    role="row"
                    aria-rowindex={rowIndex + 2}
                    aria-selected={isSelected}
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
                      const rawValue = getCellValue(el, col.key, ctx);
                      // Source: show link labels, not the Markdown syntax (editing stays raw)
                      const value = col.key === 'source' && el.source ? joinSourceLines(sourceToPlainText(rawValue, getSourceSchemeNames())) : rawValue;
                      const isEmpty = value === '—';
                      const redact = anonymousMode && col.key !== 'confidence' && !isEmpty;
                      const isEditing = editingCell?.rowId === el.id && editingCell?.colKey === col.key;
                      const isEditingSource = isEditing && col.key === 'source';
                      return (
                        <div
                          key={col.key}
                          ref={isEditingSource ? sourceCellRef : undefined}
                          role="gridcell"
                          onContextMenu={(e) => handleContextMenu(e, el.id, col.key)}
                          onDoubleClick={(e) => { e.stopPropagation(); handleCellDoubleClick(el, col.key); }}
                          className={`flex items-center px-3 text-sm shrink-0 border-r border-border-default ${
                            isEditing ? 'bg-accent/20' : ''
                          } ${
                            col.fixed ? `font-medium text-text-primary${firstColumnPinned ? ' sticky left-0 z-10 bg-inherit' : ''}` : ''
                          } ${col.alignRight ? 'justify-end' : ''} ${
                            isEmpty && !col.fixed ? 'text-text-tertiary' : ''
                          } ${!col.fixed && !isEmpty ? 'text-text-primary' : ''}`}
                          style={{ width: getColWidth(col) }}
                          title={!isEmpty && !redact ? value : undefined}
                        >
                          {isEditingSource ? (
                            <>
                              <span className="truncate">{value}</span>
                              <DropdownPortal anchorRef={sourceCellRef} isOpen className="p-1">
                                <textarea
                                  ref={sourceTextareaRef}
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onKeyDown={handleSourceKeyDown}
                                  onBlur={handleCellSave}
                                  rows={Math.min(8, Math.max(3, editValue.split('\n').length + 1))}
                                  className="block w-80 max-w-[90vw] px-2 py-1.5 text-sm rounded border border-border-default bg-bg-primary text-text-primary resize-y focus:outline-none focus:border-accent"
                                />
                              </DropdownPortal>
                            </>
                          ) : isEditing ? (
                            <input
                              ref={editInputRef}
                              type={col.key === 'confidence' && evaluationModel === 'zeroneurone' ? 'number' : 'text'}
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={handleCellKeyDown}
                              onBlur={handleCellSave}
                              className="w-full h-full bg-transparent outline-none ring-0 shadow-none text-sm text-text-primary"
                              style={{ outline: 'none', boxShadow: 'none' }}
                              min={col.key === 'confidence' && evaluationModel === 'zeroneurone' ? 0 : undefined}
                              max={col.key === 'confidence' && evaluationModel === 'zeroneurone' ? 100 : undefined}
                            />
                          ) : redact ? (
                            <span
                              className="inline-block bg-text-primary rounded-sm"
                              style={{ width: `${Math.max(1.5, Math.min(value.length * 0.45, 7))}em`, height: '0.8em' }}
                            />
                          ) : col.key === 'source' && el.source ? (
                            <SourceInline value={el.source} />
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

      {/* Columns dropdown (fixed positioning to escape overflow clipping) */}
      {columnsOpen && active && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setColumnsOpen(false)}
          />
          <div
            ref={columnsDropdownRef}
            className="fixed z-50 w-max min-w-48 max-w-80 max-h-80 overflow-y-auto bg-bg-primary border border-border-default rounded shadow-md"
            style={{ left: columnsDropdownPos.x, top: columnsDropdownPos.y }}
          >
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
        </>
      )}

      {/* Context menu */}
      {contextMenu && active && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={closeContextMenu}
            onContextMenu={(e) => { e.preventDefault(); closeContextMenu(); }}
          />
          <div
            ref={contextMenuRef}
            className="fixed z-50 min-w-44 py-1 bg-bg-primary border border-border-default rounded shadow-md"
            style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
          >
            {contextCell?.query && (
              <>
                <button
                  onClick={handleQueryOnValue}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-bg-tertiary transition-colors"
                >
                  <Search size={14} className="text-text-secondary" />
                  {t('matrix.queryOnValue')}
                </button>
                <div className="my-1 border-t border-border-default" />
              </>
            )}
            <button
              onClick={handleCopyCell}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-bg-tertiary transition-colors"
            >
              <Copy size={14} className="text-text-secondary" />
              {t('matrix.copyCell')}
            </button>
            <button
              onClick={handleCopyRow}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-bg-tertiary transition-colors"
            >
              <Rows3 size={14} className="text-text-secondary" />
              {t('matrix.copyRow')}
            </button>
            {selectedIds.size > 1 && (
              <button
                onClick={handleCopySelection}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-bg-tertiary transition-colors"
              >
                <Copy size={14} className="text-text-secondary" />
                {t('matrix.copySelection', { count: selectedIds.size })}
              </button>
            )}
          </div>
        </>
      )}

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

/**
 * The matrix: a table of the elements, or of the links. The links table is
 * mounted the first time it is shown, then kept (hidden) with its sort,
 * filters and columns; a workbook export takes both tables as they stand.
 */
export function MatrixView() {
  const [kind, setKind] = useState<MatrixKind>('elements');
  const [linksMounted, setLinksMounted] = useState(false);
  const dossierName = useDossierStore((s) => s.currentDossier?.name ?? 'export');
  const sheets = useRef(new Map<MatrixKind, () => SheetData>());
  const [sheetsReady, setSheetsReady] = useState(0);
  const registerSheet = useCallback((k: MatrixKind, read: (() => SheetData) | null) => {
    if (read) sheets.current.set(k, read); else sheets.current.delete(k);
    setSheetsReady((n) => n + 1);
  }, []);
  const showKind = useCallback((k: MatrixKind) => {
    if (k === 'links') setLinksMounted(true);
    setKind(k);
  }, []);

  // A workbook asked before the links table was ever shown: mount it, then write
  const [pendingWorkbook, setPendingWorkbook] = useState<'xlsx' | 'ods' | null>(null);
  const writeWorkbook = useCallback(async (format: 'xlsx' | 'ods') => {
    const read = (['elements', 'links'] as const).map((k) => sheets.current.get(k)).filter((r): r is () => SheetData => !!r);
    const data = read.map((r) => r());
    const { buildXlsx, buildOds } = await import('../../utils/spreadsheetWriter');
    const blob = format === 'xlsx' ? await buildXlsx(data) : await buildOds(data);
    const slug = dossierName.replace(/[^a-zA-Z0-9À-ÿ_-]/g, '_').replace(/_+/g, '_');
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const ts = `${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear()}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    downloadBlob(blob, `${slug}_matrice_${ts}.${format}`);
    emitExport(`matrix-${format}`);
  }, [dossierName]);
  const exportWorkbook = useCallback((format: 'xlsx' | 'ods') => {
    if (!sheets.current.has('links')) { setLinksMounted(true); setPendingWorkbook(format); return; }
    void writeWorkbook(format);
  }, [writeWorkbook]);
  useEffect(() => {
    if (!pendingWorkbook || !sheets.current.has('links')) return;
    setPendingWorkbook(null);
    void writeWorkbook(pendingWorkbook);
  }, [pendingWorkbook, sheetsReady, writeWorkbook]);

  return (
    <>
      <MatrixTable kind="elements" active={kind === 'elements'} onKindChange={showKind} registerSheet={registerSheet} onWorkbook={exportWorkbook} />
      {linksMounted && (
        <MatrixTable kind="links" active={kind === 'links'} onKindChange={showKind} registerSheet={registerSheet} onWorkbook={exportWorkbook} />
      )}
    </>
  );
}
