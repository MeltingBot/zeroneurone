import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff } from 'lucide-react';
import { useDossierStore, useSelectionStore, useViewStore, useUIStore, useQueryStore, useInsightsStore, useSuggestionsStore } from '../../stores';
import { insightsService } from '../../services/insightsService';
import { usePlugins } from '../../plugins/usePlugins';
import { useHiddenElementIds } from '../../hooks/useHiddenElementIds';
import { similarQueryText, labelsQueryText, neighbourhoodQueryText, showOnlySplit } from '../../utils/selectionQueries';
import { ContextMenuShell } from '../canvas/contextMenu/ContextMenuShell';
import { usePluginMenuItems } from '../canvas/contextMenu/usePluginMenuItems';
import { analyzeSubmenu, focusSubmenu, organizeSubmenu, selectFromItems } from '../canvas/contextMenu/selectionItems';

interface MapElementMenuProps {
  x: number;
  y: number;
  elementId: string;
  onClose: () => void;
}

/**
 * Menu of an element marker on the map: the canvas entries that make sense
 * without canvas positions (focus, analysis, lock, visibility, selection,
 * plugins). Acts on the whole selection when the element is part of a
 * multiple one, on the element alone otherwise.
 */
function MapElementMenuComponent({ x, y, elementId, onClose }: MapElementMenuProps) {
  const { t } = useTranslation('pages');
  const cm = (key: string) => t(`dossier.contextMenu.${key}`);
  const elements = useDossierStore((s) => s.elements);
  const links = useDossierStore((s) => s.links);
  const updateElement = useDossierStore((s) => s.updateElement);
  const dossierId = useDossierStore((s) => s.currentDossier?.id ?? '');
  const selectedElementIds = useSelectionStore((s) => s.selectedElementIds);
  const hiddenElementIds = useViewStore((s) => s.hiddenElementIds);
  const viewHiddenIds = useHiddenElementIds();
  const elementPlugins = usePlugins('contextMenu:element');

  const element = useMemo(() => elements.find((el) => el.id === elementId), [elements, elementId]);
  const targets = useMemo(() => (
    selectedElementIds.size > 1 && selectedElementIds.has(elementId) ? Array.from(selectedElementIds) : [elementId]
  ), [selectedElementIds, elementId]);
  const byId = useMemo(() => new Map(elements.map((el) => [el.id, el])), [elements]);
  const pathPair: [string, string] | null = targets.length === 2
    ? [elementId, targets.find((id) => id !== elementId)!]
    : null;

  const pluginItems = usePluginMenuItems(elementPlugins, {
    elementIds: targets,
    linkIds: [],
    hasTextAssets: false,
    dossierId,
  });

  const runQuery = useCallback((text: string, execute: boolean) => {
    useQueryStore.getState().setText(text);
    if (execute) useQueryStore.getState().execute();
    useUIStore.getState().setSidePanelTab('query');
  }, []);

  const onFocus = useCallback((depth: number) => {
    const text = neighbourhoodQueryText(targets, elements, depth);
    if (text) runQuery(text, false);
  }, [targets, elements, runQuery]);

  const onFindSimilar = useCallback(() => {
    if (!element) return;
    const text = similarQueryText(element);
    if (!text) {
      useUIStore.getState().showToast('warning', t('dossier.findSimilarNoTags'));
      return;
    }
    runQuery(text, true);
  }, [element, runQuery, t]);

  const onQueryFromSelection = useCallback(() => {
    const text = labelsQueryText(targets.map((id) => byId.get(id)).filter((el) => !!el));
    if (text) runQuery(text, true);
  }, [targets, byId, runQuery]);

  const onFindPaths = useCallback((fromId: string, toId: string) => {
    insightsService.buildGraph(elements, links);
    useInsightsStore.getState().findPaths(fromId, toId);
    useUIStore.getState().setSidePanelTab('insights');
  }, [elements, links]);

  const onFindAllPaths = useCallback((fromId: string, toId: string) => {
    insightsService.buildGraph(elements, links);
    useInsightsStore.getState().findAllPaths(fromId, toId);
    useUIStore.getState().setSidePanelTab('insights');
  }, [elements, links]);

  const onSuggestLinks = useCallback(() => {
    useSuggestionsStore.getState().analyze(targets);
    useUIStore.getState().setSidePanelTab('suggestions');
  }, [targets]);

  // The clicked element's state decides, applied to every target
  const locked = !!element?.isPositionLocked;
  const onToggleLock = useCallback(async () => {
    await Promise.all(targets.map((id) => updateElement(id, { isPositionLocked: !locked })));
  }, [targets, locked, updateElement]);

  const onHide = useCallback(() => {
    const view = useViewStore.getState();
    if (targets.length > 1) {
      view.hideElements(targets);
      useSelectionStore.getState().clearSelection();
    } else {
      view.hideElement(elementId);
    }
  }, [targets, elementId]);

  const split = useMemo(() => showOnlySplit(targets, elements), [targets, elements]);
  const onShowOnly = useCallback(() => {
    const view = useViewStore.getState();
    view.showElements(split.keep);
    view.hideElements(split.hide);
  }, [split]);
  // Already the only ones shown: hiding or showing alone means nothing, showing the others back does
  const shownAlone = hiddenElementIds.size > 0 && split.hide.every((id) => hiddenElementIds.has(id));

  // Elements linked to the targets by a link between two shown elements
  const onSelectNeighbors = useCallback(() => {
    const base = new Set(targets);
    const result = new Set(base);
    for (const link of links) {
      if (viewHiddenIds.has(link.fromId) || viewHiddenIds.has(link.toId)) continue;
      if (base.has(link.fromId)) result.add(link.toId);
      if (base.has(link.toId)) result.add(link.fromId);
    }
    useSelectionStore.getState().selectElements(Array.from(result));
  }, [targets, links, viewHiddenIds]);

  if (!element) return null;

  const label = element.label || t('empty.unnamed', { ns: 'common' });
  const otherLabel = pathPair ? (byId.get(pathPair[1])?.label || t('empty.unnamed', { ns: 'common' })) : '';

  return (
    <ContextMenuShell
      x={x}
      y={y}
      onClose={onClose}
      header={
        <span className="text-xs font-medium text-text-primary truncate block max-w-56">
          {pathPair
            ? `${label}, ${otherLabel}`
            : targets.length > 2
              ? t('dossier.toolbar.selectedCount', { count: targets.length })
              : label}
        </span>
      }
      onHeaderClick={targets.length === 1 ? () => useUIStore.getState().setSidePanelTab('detail') : undefined}
      headerTitle={cm('openDetail')}
      sections={[
        [
          focusSubmenu(cm, onFocus),
          analyzeSubmenu(cm, {
            pathPair,
            onFindPaths,
            onFindAllPaths,
            onFindSimilar: targets.length === 1 ? onFindSimilar : undefined,
            onQueryFromSelection: targets.length > 1 ? onQueryFromSelection : undefined,
            onSuggestLinks,
          }),
          organizeSubmenu(cm, { locked, onToggleLock }),
          ...(shownAlone
            ? [{ id: 'show-hidden', label: t('dossier.contextMenu.showHidden', { count: hiddenElementIds.size }), icon: Eye, onSelect: () => useViewStore.getState().showAllElements() }]
            : [
                { id: 'hide', label: cm('hide'), icon: EyeOff, onSelect: onHide },
                { id: 'show-only', label: cm('showOnly'), icon: Eye, onSelect: onShowOnly },
              ]),
        ],
        selectFromItems(cm, onSelectNeighbors),
        pluginItems,
      ]}
    />
  );
}

export const MapElementMenu = memo(MapElementMenuComponent);
