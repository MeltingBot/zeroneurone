# zeroneurone — Architecture UI

## Spécification technique

## Destination : Claude Code

Ce document décrit l'architecture de l'interface utilisateur : composants React, stores Zustand, wireframes, et interactions.

---

## 1. Structure des composants

### 1.1 Arbre des composants

```
App
├── DossierProvider              # Context pour l'dossier active
│
├── HomePage                           # Liste des dossiers
│   ├── DossierList
│   │   └── DossierCard
│   ├── CreateDossierModal
│   └── ImportDossierModal
│
└── DossierPage                  # Vue principale d'une dossier
    ├── Header
    │   ├── DossierTitle
    │   ├── ViewSwitcher               # Canvas / Carte / Split / Timeline
    │   ├── SearchBar                  # Ctrl+K
    │   └── MainMenu                   # Export, Settings, etc.
    │
    ├── Toolbar
    │   ├── SelectTool
    │   ├── CreateElementTool
    │   ├── CreateLinkTool
    │   ├── FilterButton
    │   ├── UndoRedo
    │   └── ZoomControls
    │
    ├── MainArea
    │   ├── CanvasView                 # Vue graphe
    │   │   ├── Canvas                 # React Flow / tldraw
    │   │   │   ├── ElementNode
    │   │   │   ├── GroupNode
    │   │   │   └── LinkEdge
    │   │   └── CanvasContextMenu
    │   │
    │   ├── MapView                    # Vue cartographique
    │   │   ├── Map                    # Leaflet
    │   │   │   └── ElementMarker
    │   │   └── MapContextMenu
    │   │
    │   ├── TimelineView               # Vue chronologique
    │   │   ├── Timeline
    │   │   │   ├── TimelineElement
    │   │   │   └── TimelinePeriod
    │   │   └── TimelineControls
    │   │
    │   └── SplitView                  # Canvas + Carte côte à côte
    │       ├── CanvasView
    │       └── MapView
    │
    ├── SidePanel                      # Panneau latéral droit
    │   ├── DetailPanel                # Détail d'un élément/lien
    │   │   ├── ElementDetail
    │   │   │   ├── LabelEditor
    │   │   │   ├── NotesEditor
    │   │   │   ├── TagsEditor
    │   │   │   ├── PropertiesEditor
    │   │   │   ├── MetadataEditor     # Confiance, source, dates
    │   │   │   ├── VisualEditor       # Couleur, forme, taille
    │   │   │   ├── GeoEditor          # Coordonnées GPS
    │   │   │   └── AssetsPanel        # Fichiers attachés
    │   │   └── LinkDetail
    │   │       ├── LabelEditor
    │   │       ├── NotesEditor
    │   │       ├── PropertiesEditor
    │   │       ├── MetadataEditor
    │   │       └── VisualEditor
    │   │
    │   ├── InsightsPanel              # Insights du graphe
    │   │   ├── ClustersSection
    │   │   ├── CentralitySection
    │   │   ├── BridgesSection
    │   │   ├── IsolatedSection
    │   │   └── SimilarSection
    │   │
    │   ├── ViewsPanel                 # Vues sauvegardées
    │   │   ├── ViewList
    │   │   └── CreateViewModal
    │   │
    │   └── FiltersPanel               # Filtres actifs
    │       ├── TagFilter
    │       ├── PropertyFilter
    │       ├── DateFilter
    │       ├── ConfidenceFilter
    │       └── GeoFilter
    │
    ├── BottomBar                      # Barre inférieure
    │   ├── InsightsSummary            # "3 clusters, 2 ponts, 5 isolés"
    │   ├── SelectionInfo              # "3 éléments sélectionnés"
    │   └── ZoomLevel
    │
    └── Modals
        ├── SearchModal                # Ctrl+K
        ├── ImportCSVModal
        ├── ExportModal
        ├── ReportModal
        ├── FocusModal                 # Choix profondeur voisinage
        └── PathsModal                 # Affichage des chemins
```

---

## 2. Stores Zustand

### 2.1 Structure globale

```typescript
// stores/index.ts
export { useDossierStore } from './dossierStore';
export { useSelectionStore } from './selectionStore';
export { useViewStore } from './viewStore';
export { useUIStore } from './uiStore';
export { useInsightsStore } from './insightsStore';
```

### 2.2 Dossier Store

Gère les données de l'dossier active.

```typescript
// stores/dossierStore.ts
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

interface DossierState {
  // Données
  dossier: Dossier | null;
  elements: Map<ElementId, Element>;
  links: Map<LinkId, Link>;
  assets: Map<AssetId, Asset>;
  views: Map<ViewId, View>;
  
  // État de chargement
  isLoading: boolean;
  error: string | null;
  
  // Actions - Dossier
  loadDossier: (id: DossierId) => Promise<void>;
  unloadDossier: () => void;
  updateDossier: (changes: Partial<Dossier>) => Promise<void>;
  
  // Actions - Elements
  createElement: (label: string, position: Position, options?: Partial<Element>) => Promise<Element>;
  updateElement: (id: ElementId, changes: Partial<Element>) => Promise<void>;
  deleteElement: (id: ElementId) => Promise<void>;
  deleteElements: (ids: ElementId[]) => Promise<void>;
  
  // Actions - Links
  createLink: (fromId: ElementId, toId: ElementId, options?: Partial<Link>) => Promise<Link>;
  updateLink: (id: LinkId, changes: Partial<Link>) => Promise<void>;
  deleteLink: (id: LinkId) => Promise<void>;
  
  // Actions - Groups
  createGroup: (name: string, elementIds: ElementId[], position: Position) => Promise<Element>;
  ungroupElements: (groupId: ElementId) => Promise<void>;
  
  // Actions - Assets
  addAsset: (elementId: ElementId, file: File) => Promise<Asset>;
  removeAsset: (elementId: ElementId, assetId: AssetId) => Promise<void>;
  
  // Actions - Views
  saveView: (name: string) => Promise<View>;
  loadView: (viewId: ViewId) => void;
  deleteView: (viewId: ViewId) => Promise<void>;
  
  // Helpers
  getElementById: (id: ElementId) => Element | undefined;
  getLinkById: (id: LinkId) => Link | undefined;
  getElementsByIds: (ids: ElementId[]) => Element[];
  getLinksForElement: (elementId: ElementId) => Link[];
}

export const useDossierStore = create<DossierState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    dossier: null,
    elements: new Map(),
    links: new Map(),
    assets: new Map(),
    views: new Map(),
    isLoading: false,
    error: null,
    
    // Implementations...
    loadDossier: async (id) => {
      set({ isLoading: true, error: null });
      try {
        const dossier = await db.dossiers.get(id);
        const elements = await db.elements.where({ dossierId: id }).toArray();
        const links = await db.links.where({ dossierId: id }).toArray();
        const assets = await db.assets.where({ dossierId: id }).toArray();
        const views = await db.views.where({ dossierId: id }).toArray();
        
        set({
          dossier,
          elements: new Map(elements.map(e => [e.id, e])),
          links: new Map(links.map(l => [l.id, l])),
          assets: new Map(assets.map(a => [a.id, a])),
          views: new Map(views.map(v => [v.id, v])),
          isLoading: false,
        });
        
        // Charger l'index de recherche
        await searchService.loadDossier(id);
        
        // Charger le graphe d'insights
        await insightsService.loadDossier(id);
        
      } catch (error) {
        set({ error: (error as Error).message, isLoading: false });
      }
    },
    
    createElement: async (label, position, options = {}) => {
      const { dossier, elements } = get();
      if (!dossier) throw new Error('No dossier loaded');
      
      const element = await elementRepository.create(
        dossier.id,
        label,
        position,
        options
      );
      
      set({ elements: new Map(elements).set(element.id, element) });
      
      // Mettre à jour l'index de recherche
      await searchService.indexElement(element);
      
      return element;
    },
    
    // ... autres implémentations
    
    getElementById: (id) => get().elements.get(id),
    getLinkById: (id) => get().links.get(id),
    getElementsByIds: (ids) => ids.map(id => get().elements.get(id)).filter(Boolean) as Element[],
    getLinksForElement: (elementId) => {
      const links = Array.from(get().links.values());
      return links.filter(l => l.fromId === elementId || l.toId === elementId);
    },
  }))
);
```

### 2.3 Selection Store

Gère la sélection sur le canvas.

```typescript
// stores/selectionStore.ts
import { create } from 'zustand';

interface SelectionState {
  // Sélection courante
  selectedElementIds: Set<ElementId>;
  selectedLinkIds: Set<LinkId>;
  
  // Élément en cours d'édition (panneau de détail ouvert)
  activeElementId: ElementId | null;
  activeLinkId: LinkId | null;
  
  // Mode de sélection
  selectionMode: 'single' | 'multiple';  // Shift pour multiple
  
  // Actions
  selectElement: (id: ElementId, addToSelection?: boolean) => void;
  selectElements: (ids: ElementId[]) => void;
  selectLink: (id: LinkId, addToSelection?: boolean) => void;
  selectAll: () => void;
  clearSelection: () => void;
  toggleElementSelection: (id: ElementId) => void;
  
  // Élément actif (pour le panneau de détail)
  setActiveElement: (id: ElementId | null) => void;
  setActiveLink: (id: LinkId | null) => void;
  
  // Helpers
  isElementSelected: (id: ElementId) => boolean;
  isLinkSelected: (id: LinkId) => boolean;
  hasSelection: () => boolean;
  getSelectedCount: () => number;
}

export const useSelectionStore = create<SelectionState>((set, get) => ({
  selectedElementIds: new Set(),
  selectedLinkIds: new Set(),
  activeElementId: null,
  activeLinkId: null,
  selectionMode: 'single',
  
  selectElement: (id, addToSelection = false) => {
    const { selectedElementIds } = get();
    
    if (addToSelection) {
      const newSet = new Set(selectedElementIds);
      newSet.add(id);
      set({ selectedElementIds: newSet, activeElementId: id, activeLinkId: null });
    } else {
      set({
        selectedElementIds: new Set([id]),
        selectedLinkIds: new Set(),
        activeElementId: id,
        activeLinkId: null,
      });
    }
  },
  
  selectElements: (ids) => {
    set({
      selectedElementIds: new Set(ids),
      selectedLinkIds: new Set(),
      activeElementId: ids.length === 1 ? ids[0] : null,
      activeLinkId: null,
    });
  },
  
  selectLink: (id, addToSelection = false) => {
    if (addToSelection) {
      const newSet = new Set(get().selectedLinkIds);
      newSet.add(id);
      set({ selectedLinkIds: newSet, activeLinkId: id, activeElementId: null });
    } else {
      set({
        selectedElementIds: new Set(),
        selectedLinkIds: new Set([id]),
        activeElementId: null,
        activeLinkId: id,
      });
    }
  },
  
  selectAll: () => {
    const elements = useDossierStore.getState().elements;
    set({
      selectedElementIds: new Set(elements.keys()),
      activeElementId: null,
    });
  },
  
  clearSelection: () => {
    set({
      selectedElementIds: new Set(),
      selectedLinkIds: new Set(),
      activeElementId: null,
      activeLinkId: null,
    });
  },
  
  toggleElementSelection: (id) => {
    const { selectedElementIds } = get();
    const newSet = new Set(selectedElementIds);
    
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    
    set({ selectedElementIds: newSet });
  },
  
  setActiveElement: (id) => {
    set({ activeElementId: id, activeLinkId: null });
  },
  
  setActiveLink: (id) => {
    set({ activeLinkId: id, activeElementId: null });
  },
  
  isElementSelected: (id) => get().selectedElementIds.has(id),
  isLinkSelected: (id) => get().selectedLinkIds.has(id),
  hasSelection: () => get().selectedElementIds.size > 0 || get().selectedLinkIds.size > 0,
  getSelectedCount: () => get().selectedElementIds.size + get().selectedLinkIds.size,
}));
```

### 2.4 View Store

Gère l'état de la vue (viewport, filtres, mode d'affichage).

```typescript
// stores/viewStore.ts
import { create } from 'zustand';

interface ViewState {
  // Mode d'affichage
  displayMode: 'canvas' | 'map' | 'split' | 'timeline';
  
  // Viewport du canvas
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
  
  // Filtres actifs
  filters: ViewFilters;
  
  // Éléments masqués manuellement
  hiddenElementIds: Set<ElementId>;
  
  // Mode focus (voisinage)
  focusMode: {
    active: boolean;
    centerId: ElementId | null;
    depth: number;
    visibleIds: Set<ElementId>;
  };
  
  // Mode chemins
  pathsMode: {
    active: boolean;
    fromId: ElementId | null;
    toId: ElementId | null;
    paths: ElementId[][];
  };
  
  // Actions - Display
  setDisplayMode: (mode: 'canvas' | 'map' | 'split' | 'timeline') => void;
  
  // Actions - Viewport
  setViewport: (viewport: { x: number; y: number; zoom: number }) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomToFit: () => void;
  centerOnElement: (elementId: ElementId) => void;
  
  // Actions - Filters
  setFilters: (filters: Partial<ViewFilters>) => void;
  clearFilters: () => void;
  addTagFilter: (tag: string) => void;
  removeTagFilter: (tag: string) => void;
  
  // Actions - Hidden
  hideElements: (ids: ElementId[]) => void;
  showElements: (ids: ElementId[]) => void;
  showAllElements: () => void;
  
  // Actions - Focus
  enterFocusMode: (elementId: ElementId, depth: number) => void;
  exitFocusMode: () => void;
  
  // Actions - Paths
  enterPathsMode: (fromId: ElementId, toId: ElementId) => void;
  exitPathsMode: () => void;
  
  // Helpers
  isElementVisible: (element: Element) => boolean;
  getVisibleElementIds: () => ElementId[];
}

export const useViewStore = create<ViewState>((set, get) => ({
  displayMode: 'canvas',
  
  viewport: { x: 0, y: 0, zoom: 1 },
  
  filters: {
    includeTags: [],
    excludeTags: [],
    hasProperty: null,
    textSearch: '',
    minConfidence: null,
    dateFrom: null,
    dateTo: null,
    hasGeo: null,
  },
  
  hiddenElementIds: new Set(),
  
  focusMode: {
    active: false,
    centerId: null,
    depth: 1,
    visibleIds: new Set(),
  },
  
  pathsMode: {
    active: false,
    fromId: null,
    toId: null,
    paths: [],
  },
  
  setDisplayMode: (mode) => set({ displayMode: mode }),
  
  setViewport: (viewport) => set({ viewport }),
  
  zoomIn: () => {
    const { viewport } = get();
    set({ viewport: { ...viewport, zoom: Math.min(viewport.zoom * 1.2, 4) } });
  },
  
  zoomOut: () => {
    const { viewport } = get();
    set({ viewport: { ...viewport, zoom: Math.max(viewport.zoom / 1.2, 0.1) } });
  },
  
  zoomToFit: () => {
    // Calcul du viewport pour voir tous les éléments
    const elements = Array.from(useDossierStore.getState().elements.values());
    if (elements.length === 0) return;
    
    const xs = elements.map(e => e.position.x);
    const ys = elements.map(e => e.position.y);
    
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    
    const padding = 100;
    const width = maxX - minX + padding * 2;
    const height = maxY - minY + padding * 2;
    
    // Calculer le zoom pour tout voir (dépend de la taille du canvas)
    // ... implémentation selon la taille du container
    
    set({
      viewport: {
        x: minX - padding,
        y: minY - padding,
        zoom: 1, // À calculer
      },
    });
  },
  
  centerOnElement: (elementId) => {
    const element = useDossierStore.getState().getElementById(elementId);
    if (!element) return;
    
    const { viewport } = get();
    set({
      viewport: {
        ...viewport,
        x: element.position.x - 400, // Centrer (ajuster selon taille canvas)
        y: element.position.y - 300,
      },
    });
  },
  
  setFilters: (newFilters) => {
    set({ filters: { ...get().filters, ...newFilters } });
  },
  
  clearFilters: () => {
    set({
      filters: {
        includeTags: [],
        excludeTags: [],
        hasProperty: null,
        textSearch: '',
        minConfidence: null,
        dateFrom: null,
        dateTo: null,
        hasGeo: null,
      },
    });
  },
  
  addTagFilter: (tag) => {
    const { filters } = get();
    if (!filters.includeTags.includes(tag)) {
      set({
        filters: {
          ...filters,
          includeTags: [...filters.includeTags, tag],
        },
      });
    }
  },
  
  removeTagFilter: (tag) => {
    const { filters } = get();
    set({
      filters: {
        ...filters,
        includeTags: filters.includeTags.filter(t => t !== tag),
      },
    });
  },
  
  hideElements: (ids) => {
    const newSet = new Set(get().hiddenElementIds);
    ids.forEach(id => newSet.add(id));
    set({ hiddenElementIds: newSet });
  },
  
  showElements: (ids) => {
    const newSet = new Set(get().hiddenElementIds);
    ids.forEach(id => newSet.delete(id));
    set({ hiddenElementIds: newSet });
  },
  
  showAllElements: () => {
    set({ hiddenElementIds: new Set() });
  },
  
  enterFocusMode: (elementId, depth) => {
    const visibleIds = insightsService.getNeighborhood(elementId, depth);
    set({
      focusMode: {
        active: true,
        centerId: elementId,
        depth,
        visibleIds: new Set(visibleIds),
      },
    });
  },
  
  exitFocusMode: () => {
    set({
      focusMode: {
        active: false,
        centerId: null,
        depth: 1,
        visibleIds: new Set(),
      },
    });
  },
  
  enterPathsMode: (fromId, toId) => {
    const paths = insightsService.findPaths(fromId, toId);
    const allNodeIds = new Set(paths.flat());
    
    set({
      pathsMode: {
        active: true,
        fromId,
        toId,
        paths,
      },
    });
  },
  
  exitPathsMode: () => {
    set({
      pathsMode: {
        active: false,
        fromId: null,
        toId: null,
        paths: [],
      },
    });
  },
  
  isElementVisible: (element) => {
    const { filters, hiddenElementIds, focusMode } = get();
    
    // Masqué manuellement
    if (hiddenElementIds.has(element.id)) return false;
    
    // Mode focus actif
    if (focusMode.active && !focusMode.visibleIds.has(element.id)) return false;
    
    // Filtres
    if (filters.includeTags.length > 0) {
      if (!filters.includeTags.some(tag => element.tags.includes(tag))) return false;
    }
    
    if (filters.excludeTags.length > 0) {
      if (filters.excludeTags.some(tag => element.tags.includes(tag))) return false;
    }
    
    if (filters.hasProperty) {
      if (!element.properties.some(p => p.key === filters.hasProperty)) return false;
    }
    
    if (filters.minConfidence !== null && element.confidence !== null) {
      if (element.confidence < filters.minConfidence) return false;
    }
    
    if (filters.hasGeo === true && !element.geo) return false;
    if (filters.hasGeo === false && element.geo) return false;
    
    // Filtre texte (basique, la vraie recherche utilise MiniSearch)
    if (filters.textSearch) {
      const search = filters.textSearch.toLowerCase();
      if (!element.label.toLowerCase().includes(search) &&
          !element.notes.toLowerCase().includes(search)) {
        return false;
      }
    }
    
    return true;
  },
  
  getVisibleElementIds: () => {
    const elements = Array.from(useDossierStore.getState().elements.values());
    const { isElementVisible } = get();
    return elements.filter(isElementVisible).map(e => e.id);
  },
}));
```

### 2.5 UI Store

Gère l'état de l'interface (modals, panels, etc.).

```typescript
// stores/uiStore.ts
import { create } from 'zustand';

interface UIState {
  // Panneaux
  sidePanelOpen: boolean;
  sidePanelTab: 'detail' | 'insights' | 'views' | 'filters';
  
  // Modals
  activeModal: ModalType | null;
  modalData: any;
  
  // Outils
  activeTool: 'select' | 'create-element' | 'create-link';
  
  // Recherche
  searchOpen: boolean;
  searchQuery: string;
  searchResults: SearchResult[];
  
  // Toast / Notifications
  toasts: Toast[];
  
  // Drag & Drop
  isDragging: boolean;
  dragData: any;
  
  // Actions - Panels
  toggleSidePanel: () => void;
  setSidePanelTab: (tab: 'detail' | 'insights' | 'views' | 'filters') => void;
  
  // Actions - Modals
  openModal: (type: ModalType, data?: any) => void;
  closeModal: () => void;
  
  // Actions - Tools
  setActiveTool: (tool: 'select' | 'create-element' | 'create-link') => void;
  
  // Actions - Search
  openSearch: () => void;
  closeSearch: () => void;
  setSearchQuery: (query: string) => void;
  setSearchResults: (results: SearchResult[]) => void;
  
  // Actions - Toasts
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  
  // Actions - Drag
  startDrag: (data: any) => void;
  endDrag: () => void;
}

type ModalType = 
  | 'create-dossier'
  | 'import-dossier'
  | 'import-csv'
  | 'export'
  | 'report'
  | 'focus'
  | 'paths'
  | 'create-view'
  | 'create-group'
  | 'confirm-delete';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  duration?: number;
}

export const useUIStore = create<UIState>((set, get) => ({
  sidePanelOpen: true,
  sidePanelTab: 'detail',
  
  activeModal: null,
  modalData: null,
  
  activeTool: 'select',
  
  searchOpen: false,
  searchQuery: '',
  searchResults: [],
  
  toasts: [],
  
  isDragging: false,
  dragData: null,
  
  toggleSidePanel: () => set({ sidePanelOpen: !get().sidePanelOpen }),
  
  setSidePanelTab: (tab) => set({ sidePanelTab: tab, sidePanelOpen: true }),
  
  openModal: (type, data = null) => set({ activeModal: type, modalData: data }),
  
  closeModal: () => set({ activeModal: null, modalData: null }),
  
  setActiveTool: (tool) => set({ activeTool: tool }),
  
  openSearch: () => set({ searchOpen: true }),
  
  closeSearch: () => set({ searchOpen: false, searchQuery: '', searchResults: [] }),
  
  setSearchQuery: async (query) => {
    set({ searchQuery: query });
    
    if (query.trim()) {
      const results = searchService.search(query);
      set({ searchResults: results });
    } else {
      set({ searchResults: [] });
    }
  },
  
  setSearchResults: (results) => set({ searchResults: results }),
  
  addToast: (toast) => {
    const id = generateUUID();
    const newToast = { ...toast, id };
    
    set({ toasts: [...get().toasts, newToast] });
    
    // Auto-remove après duration
    if (toast.duration !== 0) {
      setTimeout(() => {
        get().removeToast(id);
      }, toast.duration || 3000);
    }
  },
  
  removeToast: (id) => {
    set({ toasts: get().toasts.filter(t => t.id !== id) });
  },
  
  startDrag: (data) => set({ isDragging: true, dragData: data }),
  
  endDrag: () => set({ isDragging: false, dragData: null }),
}));
```

### 2.6 Insights Store

Cache les résultats d'analyse.

```typescript
// stores/insightsStore.ts
import { create } from 'zustand';

interface InsightsState {
  // Résultats
  clusters: Cluster[];
  centrality: CentralityResult[];
  bridges: ElementId[];
  isolated: ElementId[];
  similarPairs: SimilarPair[];
  
  // État
  isComputing: boolean;
  lastUpdated: Date | null;
  
  // Actions
  recompute: () => Promise<void>;
  highlightCluster: (clusterId: number) => void;
  highlightBridges: () => void;
  highlightIsolated: () => void;
  highlightSimilar: (pair: SimilarPair) => void;
  clearHighlight: () => void;
}

export const useInsightsStore = create<InsightsState>((set, get) => ({
  clusters: [],
  centrality: [],
  bridges: [],
  isolated: [],
  similarPairs: [],
  
  isComputing: false,
  lastUpdated: null,
  
  recompute: async () => {
    set({ isComputing: true });
    
    try {
      const dossierId = useDossierStore.getState().dossier?.id;
      if (!dossierId) return;
      
      await insightsService.loadDossier(dossierId);
      
      set({
        clusters: insightsService.getClusters(),
        centrality: insightsService.getCentrality(),
        bridges: insightsService.getBridges(),
        isolated: insightsService.getIsolated(),
        similarPairs: insightsService.detectSimilarLabels(),
        isComputing: false,
        lastUpdated: new Date(),
      });
    } catch (error) {
      set({ isComputing: false });
    }
  },
  
  highlightCluster: (clusterId) => {
    const cluster = get().clusters.find(c => c.id === clusterId);
    if (cluster) {
      useSelectionStore.getState().selectElements(cluster.elementIds);
    }
  },
  
  highlightBridges: () => {
    useSelectionStore.getState().selectElements(get().bridges);
  },
  
  highlightIsolated: () => {
    useSelectionStore.getState().selectElements(get().isolated);
  },
  
  highlightSimilar: (pair) => {
    useSelectionStore.getState().selectElements([pair.elementId1, pair.elementId2]);
  },
  
  clearHighlight: () => {
    useSelectionStore.getState().clearSelection();
  },
}));
```

---

## 3. Wireframes

### 3.1 Page d'accueil (Liste des dossiers)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   zeroneurone                                        [Importer] [Nouvelle]  │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Mes dossiers                                           Trier: Récent ▼   │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │ 📁 Affaire Dupont                                                   │   │
│   │    Modifié il y a 2 heures • 45 éléments • 62 liens                │   │
│   │    [Ouvrir]                                      [⋮]                │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │ 📁 Réseau Trafic Est                                                │   │
│   │    Modifié hier • 128 éléments • 203 liens                         │   │
│   │    [Ouvrir]                                      [⋮]                │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │ 📁 Dossier Crypto                                                   │   │
│   │    Modifié la semaine dernière • 67 éléments • 89 liens            │   │
│   │    [Ouvrir]                                      [⋮]                │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Vue principale — Canvas

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ← Affaire Dupont                    [Canvas ▼] [🔍 Rechercher...]   [≡]    │
├─────────────────────────────────────────────────────────────────────────────┤
│ [↖][+○][+─]│[Filtres]              [↩][↪]                    [−][+][⊡]    │
├─────────────────────────────────────────────────────────┬───────────────────┤
│                                                         │                   │
│                                                         │ DÉTAIL            │
│           ┌───────┐                                     │                   │
│           │ Jean  │                                     │ Jean Martin       │
│           │Martin │──────────┐                          │ ─────────────────│
│           └───────┘          │                          │                   │
│               │              │                          │ Notes:            │
│               │              │                          │ [Suspect principal│
│               ▼              ▼                          │  dans l'affaire]  │
│           ┌───────┐     ┌───────┐                      │                   │
│           │Société│     │Société│                      │ Tags:             │
│           │   A   │     │   B   │                      │ [suspect] [+]     │
│           └───────┘     └───────┘                      │                   │
│               │              │                          │ Propriétés:       │
│               └──────┬───────┘                          │ + Ajouter         │
│                      │                                  │                   │
│                      ▼                                  │ Confiance: ●●●○○  │
│                  ┌───────┐                              │ Source: ________  │
│                  │Compte │                              │                   │
│                  │Bancaire│                             │ Fichiers:         │
│                  └───────┘                              │ 📎 photo.jpg      │
│                                                         │ [+ Ajouter]       │
│                                                         │                   │
│                                                         ├───────────────────┤
│                                                         │ INSIGHTS    [↻]   │
│                                                         │                   │
│    [Glisser des fichiers ici]                          │ ▸ 2 clusters      │
│                                                         │ ▸ 1 pont          │
│                                                         │ ▸ 3 isolés        │
│                                                         │                   │
├─────────────────────────────────────────────────────────┴───────────────────┤
│ 3 clusters • 1 pont • 5 isolés                    1 sélectionné    Zoom 100%│
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Vue Split (Canvas + Carte)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ← Réseau Trafic Est                 [Split ▼] [🔍 Rechercher...]    [≡]    │
├─────────────────────────────────────────────────────────────────────────────┤
│ [↖][+○][+─]│[Filtres: 2 actifs ✕]  [↩][↪]                    [−][+][⊡]    │
├────────────────────────────────┬────────────────────────────┬───────────────┤
│                                │                            │               │
│        CANVAS                  │         CARTE              │ DÉTAIL        │
│                                │                            │               │
│     ┌───┐     ┌───┐           │    ┌──────────────────┐    │ Garage Est    │
│     │ A │─────│ B │           │    │      ○           │    │               │
│     └───┘     └───┘           │    │   ○     ○       │    │ 📍 48.8566,   │
│        \       /              │    │          ○      │    │    2.3522     │
│         \     /               │    │     [carte]     │    │               │
│          \   /                │    │                  │    │ Tags:         │
│         ┌───┐                 │    │        ○        │    │ [lieu][garage]│
│         │ C │                 │    │   ○             │    │               │
│         └───┘                 │    └──────────────────┘    │               │
│                                │                            │               │
│                                │                            │               │
├────────────────────────────────┴────────────────────────────┴───────────────┤
│ 12 éléments géolocalisés                              2 sélectionnés   75%  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.4 Vue Timeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ← Dossier Crypto                   [Timeline▼] [🔍 Rechercher...]   [≡]    │
├─────────────────────────────────────────────────────────────────────────────┤
│ [Zoom: Mois ▼]  2024: [Jan][Fév][Mar][Avr][Mai][Jun]         [←Avant][→]   │
├─────────────────────────────────────────────────────────────┬───────────────┤
│                                                             │               │
│ Jan       Fév       Mar       Avr       Mai       Jun       │ DÉTAIL        │
│  │         │         │         │         │         │        │               │
│  │         │         │         │         │         │        │ Transaction   │
│  │    ═════════════════════  [Thomas employé]     │        │ 15 mars 2024  │
│  │         │         │         │         │         │        │               │
│  │         │    ▲    │         │         │         │        │ Montant:      │
│  │         │  Vol 1  │         │         │         │        │ 2.3 ETH       │
│  │         │         ▲         │         │         │        │               │
│  │         │       Vol 2       │         │         │        │ De: Wallet A  │
│  │         │         │    ▲    │         │         │        │ Vers: Wallet B│
│  │         │         │  Trans  │         │         │        │               │
│  │         │         │   BTC   │         │         │        │ Confiance:    │
│  │         │         │         │    ▲    │         │        │ ●●●●○         │
│  │         │         │         │ Arrest. │         │        │               │
│  │         │         │         │         │         │        │               │
│                                                             │               │
├─────────────────────────────────────────────────────────────┴───────────────┤
│ 23 événements • Période: Jan-Jun 2024                         1 sélectionné │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.5 Modal de recherche (Ctrl+K)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                    ┌─────────────────────────────────────┐                  │
│                    │ 🔍 martin                          │                  │
│                    ├─────────────────────────────────────┤                  │
│                    │                                     │                  │
│                    │ ○ Jean Martin                      │                  │
│                    │   Personne • 5 connexions           │                  │
│                    │                                     │                  │
│                    │ ○ Martin & Associés                │                  │
│                    │   Société • SIREN: 823456789        │                  │
│                    │                                     │                  │
│                    │ ○ Note: "Appeler Martin demain"    │                  │
│                    │   Dans: Jean Martin                 │                  │
│                    │                                     │                  │
│                    │ ─────────────────────────────────── │                  │
│                    │ ↑↓ Naviguer  ⏎ Sélectionner  Esc   │                  │
│                    └─────────────────────────────────────┘                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.6 Panneau Insights déplié

```
┌───────────────────────────────────────┐
│ INSIGHTS                        [↻]   │
├───────────────────────────────────────┤
│                                       │
│ ▾ Structure                           │
│   ├─ 3 clusters détectés        [→]   │
│   │  • Cluster A (12 éléments)        │
│   │  • Cluster B (8 éléments)         │
│   │  • Cluster C (5 éléments)         │
│   │                                   │
│   ├─ 2 ponts identifiés         [→]   │
│   │  • Jean Martin                    │
│   │  • Société Holding X              │
│   │                                   │
│   └─ 7 éléments isolés          [→]   │
│                                       │
│ ▾ Centralité (top 5)                  │
│   1. Société A — 23 connexions  [→]   │
│   2. Jean Martin — 18 connexions[→]   │
│   3. Compte CH — 12 connexions  [→]   │
│   4. Wallet 0x... — 9 connexions[→]   │
│   5. Marie D. — 7 connexions    [→]   │
│                                       │
│ ▾ Attention                           │
│   ⚠ 2 homonymes potentiels      [→]   │
│     • "Martin Jean" / "Jean Martin"   │
│   ⚠ 3 éléments similaires       [→]   │
│                                       │
└───────────────────────────────────────┘
```

### 3.7 Menu contextuel (clic droit sur élément)

```
                    ┌─────────────────────────┐
                    │ ✏️  Éditer               │
                    │ 🔍 Focus (voisinage)    │
                    │ 🛤️  Chemins vers...      │
                    ├─────────────────────────┤
                    │ 📋 Copier               │
                    │ 📑 Dupliquer            │
                    ├─────────────────────────┤
                    │ 🏷️  Ajouter tag         │
                    │ 🎨 Changer couleur      │
                    │ 📐 Changer forme        │
                    ├─────────────────────────┤
                    │ 📁 Créer groupe         │
                    │ 👁️  Masquer              │
                    ├─────────────────────────┤
                    │ 🗑️  Supprimer            │
                    └─────────────────────────┘
```

### 3.8 Modal Import CSV

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   Import CSV                                                         [✕]   │
│   ─────────────────────────────────────────────────────────────────────    │
│                                                                             │
│   Fichier: suspects.csv (47 lignes détectées)                              │
│                                                                             │
│   Mapping des colonnes:                                                     │
│   ┌─────────────────┬─────────────────┬─────────────────┐                  │
│   │ Colonne CSV     │ Utilisation     │ Aperçu          │                  │
│   ├─────────────────┼─────────────────┼─────────────────┤                  │
│   │ nom             │ [Label      ▼]  │ "Dupont"        │                  │
│   │ prenom          │ [Propriété  ▼]  │ "Jean"          │                  │
│   │ ville           │ [Propriété  ▼]  │ "Paris"         │                  │
│   │ telephone       │ [Propriété  ▼]  │ "0612345678"    │                  │
│   │ tags            │ [Tags       ▼]  │ "suspect;vip"   │                  │
│   │ notes           │ [Ignorer    ▼]  │ "..."           │                  │
│   └─────────────────┴─────────────────┴─────────────────┘                  │
│                                                                             │
│   Aperçu: 47 éléments seront créés                                         │
│                                                                             │
│   ☐ Détecter les liens automatiquement (colonnes avec IDs)                 │
│                                                                             │
│                                          [Annuler]  [Importer]              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.9 Mode Rapport

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ← Retour au canvas                   RAPPORT                         [≡]   │
├────────────────────────┬────────────────────────────────────────────────────┤
│                        │                                                    │
│ STRUCTURE              │  APERÇU                                           │
│                        │                                                    │
│ ▾ 1. Introduction      │  # Affaire Dupont                                 │
│   [↑][↓][✕]           │                                                    │
│                        │  ## 1. Introduction                               │
│ ▾ 2. Acteurs clés      │                                                    │
│   • Jean Martin        │  Cette dossier porte sur les activités            │
│   • Société A          │  financières suspectes de Jean Martin...          │
│   • [+ Ajouter]        │                                                    │
│   [↑][↓][✕]           │  ## 2. Acteurs clés                               │
│                        │                                                    │
│ ▸ 3. Flux financiers   │  Les principaux acteurs identifiés sont:          │
│   [↑][↓][✕]           │                                                    │
│                        │  [GRAPHE: Acteurs clés]                           │
│ ▸ 4. Conclusions       │  ┌─────────────────────────────┐                  │
│   [↑][↓][✕]           │  │    ○───────○                │                  │
│                        │  │    │       │                │                  │
│ [+ Section]            │  │    ○───────○                │                  │
│                        │  └─────────────────────────────┘                  │
│                        │                                                    │
│                        │  Jean Martin présente des connexions...            │
│                        │                                                    │
├────────────────────────┴────────────────────────────────────────────────────┤
│                           [Export PDF]  [Export Markdown]                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Composants principaux — Props et responsabilités

### 4.1 ElementNode

Représente un élément sur le canvas (React Flow custom node).

```typescript
// components/canvas/ElementNode.tsx

interface ElementNodeProps {
  id: ElementId;
  data: {
    element: Element;
    isSelected: boolean;
    isHighlighted: boolean;  // Pour les insights
    isDimmed: boolean;       // Filtré ou hors focus
  };
}

// Responsabilités:
// - Afficher l'élément avec son apparence (couleur, forme, taille, icône)
// - Afficher le label
// - Afficher un badge si fichiers attachés
// - Gérer le double-clic (ouvrir détail)
// - Gérer le drag (déplacement)
// - Afficher l'état de sélection
// - Appliquer l'opacité si dimmed
```

### 4.2 LinkEdge

Représente un lien sur le canvas (React Flow custom edge).

```typescript
// components/canvas/LinkEdge.tsx

interface LinkEdgeProps {
  id: LinkId;
  source: ElementId;
  target: ElementId;
  data: {
    link: Link;
    isSelected: boolean;
    isHighlighted: boolean;
    isDimmed: boolean;
  };
}

// Responsabilités:
// - Afficher le lien avec son apparence (couleur, style, épaisseur)
// - Afficher le label si présent
// - Afficher la flèche si directed
// - Gérer le clic (sélection)
// - Appliquer l'opacité si dimmed
```

### 4.3 DetailPanel

Panneau de détail pour l'élément ou lien sélectionné.

```typescript
// components/panels/DetailPanel.tsx

interface DetailPanelProps {
  // Pas de props, utilise les stores
}

// Responsabilités:
// - Afficher ElementDetail ou LinkDetail selon activeElementId/activeLinkId
// - Afficher un message si rien de sélectionné
// - Gérer les mises à jour via les stores
```

### 4.4 ElementDetail

Formulaire d'édition d'un élément.

```typescript
// components/panels/ElementDetail.tsx

interface ElementDetailProps {
  elementId: ElementId;
}

// Responsabilités:
// - Afficher et éditer: label, notes, tags, properties
// - Afficher et éditer: confidence, source, dates
// - Afficher et éditer: visual (couleur, forme, taille)
// - Afficher et éditer: geo
// - Gérer les fichiers attachés (liste, ajout, suppression)
// - Sauvegarder les modifications (debounced)
```

### 4.5 PropertiesEditor

Éditeur de propriétés clé/valeur.

```typescript
// components/panels/PropertiesEditor.tsx

interface PropertiesEditorProps {
  properties: Property[];
  onChange: (properties: Property[]) => void;
  suggestedKeys?: string[];  // Pour autocomplétion
}

// Responsabilités:
// - Afficher la liste des propriétés
// - Ajouter une nouvelle propriété
// - Éditer clé et valeur
// - Supprimer une propriété
// - Autocomplétion sur les clés suggérées
```

### 4.6 TagsEditor

Éditeur de tags.

```typescript
// components/panels/TagsEditor.tsx

interface TagsEditorProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  existingTags?: string[];  // Pour autocomplétion
}

// Responsabilités:
// - Afficher les tags comme des chips
// - Ajouter un nouveau tag (input + Enter)
// - Supprimer un tag (clic sur X)
// - Autocomplétion sur les tags existants
```

### 4.7 SearchModal

Modal de recherche globale (Ctrl+K).

```typescript
// components/modals/SearchModal.tsx

interface SearchModalProps {
  // Pas de props, utilise UIStore
}

// Responsabilités:
// - Afficher l'input de recherche
// - Afficher les résultats en temps réel
// - Navigation clavier (↑↓ Enter Esc)
// - Cliquer sur un résultat → centrer et sélectionner
// - Fermer la modal
```

### 4.8 InsightsPanel

Panneau des insights.

```typescript
// components/panels/InsightsPanel.tsx

interface InsightsPanelProps {
  // Pas de props, utilise InsightsStore
}

// Responsabilités:
// - Afficher les sections: Structure, Centralité, Attention
// - Chaque item est cliquable → highlight sur le canvas
// - Bouton refresh pour recalculer
// - Afficher l'état de calcul
```

### 4.9 FiltersPanel

Panneau des filtres.

```typescript
// components/panels/FiltersPanel.tsx

interface FiltersPanelProps {
  // Pas de props, utilise ViewStore
}

// Responsabilités:
// - Afficher les filtres actifs
// - Ajouter/supprimer des filtres par tag
// - Filtre par propriété
// - Filtre par date
// - Filtre par confiance
// - Filtre par géolocalisation
// - Bouton "Effacer tous les filtres"
```

### 4.10 MapView

Vue cartographique.

```typescript
// components/map/MapView.tsx

interface MapViewProps {
  // Pas de props, utilise les stores
}

// Responsabilités:
// - Afficher la carte Leaflet
// - Afficher les marqueurs pour les éléments géolocalisés
// - Synchroniser la sélection avec le canvas
// - Permettre de cliquer pour définir/modifier les coords d'un élément
```

### 4.11 TimelineView

Vue chronologique.

```typescript
// components/timeline/TimelineView.tsx

interface TimelineViewProps {
  // Pas de props, utilise les stores
}

// Responsabilités:
// - Afficher la timeline avec les éléments datés
// - Afficher les périodes (dateRange)
// - Zoom temporel (année/mois/semaine/jour)
// - Synchroniser la sélection avec le canvas
// - Filtrer le canvas sur une période sélectionnée
```

---

## 5. Interactions détaillées

### 5.1 Création d'un élément

| Déclencheur | Action |
|-------------|--------|
| Double-clic sur canvas vide | Créer élément à cette position |
| Bouton "+" dans toolbar | Activer le mode création, prochain clic crée |
| Drag fichier sur canvas | Créer élément avec fichier attaché à cette position |
| Ctrl+V (avec texte copié) | Créer élément avec le texte comme label |

**Comportement création:**
1. Élément créé avec label "Nouvel élément" (ou texte collé, ou nom de fichier)
2. Position = là où l'utilisateur a cliqué
3. Élément automatiquement sélectionné
4. Panneau de détail s'ouvre
5. Focus sur le champ label (édition immédiate)

### 5.2 Création d'un lien

| Déclencheur | Action |
|-------------|--------|
| Drag depuis un élément vers un autre | Créer lien entre les deux |
| Sélectionner 2 éléments + raccourci L | Créer lien entre eux |
| Bouton "lien" toolbar + clic élément source + clic élément cible | Créer lien |

**Comportement création lien:**
1. Pendant le drag, afficher une ligne provisoire
2. Si relâché sur un élément → créer le lien
3. Si relâché dans le vide → créer un nouvel élément ET le lien
4. Lien créé non-dirigé par défaut
5. Lien sélectionné, panneau de détail du lien s'ouvre

### 5.3 Sélection

| Action | Comportement |
|--------|--------------|
| Clic sur élément | Sélectionne uniquement cet élément |
| Shift+clic sur élément | Ajoute à la sélection |
| Clic sur canvas vide | Désélectionne tout |
| Drag rectangle sur canvas | Sélectionne tous les éléments dans le rectangle |
| Ctrl+A | Sélectionne tous les éléments visibles |

### 5.4 Suppression

| Action | Comportement |
|--------|--------------|
| Suppr / Backspace avec sélection | Supprime les éléments ET leurs liens |
| Suppr sur un lien sélectionné | Supprime le lien uniquement |

**Confirmation:**
- Si >5 éléments sélectionnés → demander confirmation
- Sinon → suppression directe

### 5.5 Raccourcis clavier

| Raccourci | Action |
|-----------|--------|
| Ctrl+K | Ouvrir la recherche |
| Ctrl+A | Tout sélectionner |
| Ctrl+C | Copier (labels dans le presse-papier) |
| Ctrl+V | Coller (créer éléments depuis texte) |
| Ctrl+Z | Annuler |
| Ctrl+Shift+Z | Refaire |
| Ctrl+G | Grouper la sélection |
| Ctrl+Shift+G | Dégrouper |
| Delete / Backspace | Supprimer la sélection |
| Escape | Désélectionner / Fermer modal |
| F | Focus sur la sélection (ouvrir modal profondeur) |
| L | Créer lien entre 2 éléments sélectionnés |
| + / = | Zoom in |
| - | Zoom out |
| 0 | Zoom to fit |
| 1 | Vue Canvas |
| 2 | Vue Carte |
| 3 | Vue Split |
| 4 | Vue Timeline |

### 5.6 Drag & Drop fichiers

| Source | Cible | Comportement |
|--------|-------|--------------|
| Fichier(s) du système | Canvas vide | Crée un élément par fichier |
| Fichier(s) du système | Élément existant | Attache les fichiers à l'élément |
| Fichier(s) du système | Zone drop du panneau détail | Attache à l'élément actif |

**Types de fichiers:**
- Images (jpg, png, gif, webp) → thumbnail généré
- PDF → thumbnail première page, texte extrait
- Documents (docx, odt, txt) → texte extrait si possible
- Autres → stockés sans traitement

---

## 6. États visuels

### 6.1 États d'un élément

| État | Apparence |
|------|-----------|
| Normal | Couleur et style définis par l'utilisateur |
| Sélectionné | Bordure bleue épaisse + ombre |
| Survolé | Légère ombre |
| En cours d'édition | Bordure en pointillés |
| Filtré (dimmed) | Opacité 30% |
| Highlighté (insight) | Halo coloré autour |
| Dans un groupe (replié) | Non visible |

### 6.2 États d'un lien

| État | Apparence |
|------|-----------|
| Normal | Couleur et style définis |
| Sélectionné | Bleu + épaisseur augmentée |
| Survolé | Épaisseur légèrement augmentée |
| Filtré (dimmed) | Opacité 30% |
| Highlighté (chemin) | Couleur vive + animation |

### 6.3 Indicateurs globaux

| Indicateur | Position | Information |
|------------|----------|-------------|
| Filtres actifs | Toolbar | Badge avec nombre + bouton clear |
| Mode focus | Barre inférieure | "Focus sur X (profondeur 2) [Quitter]" |
| Mode chemins | Barre inférieure | "Chemins de A vers B (3 trouvés) [Quitter]" |
| Sélection | Barre inférieure | "X éléments sélectionnés" |
| Zoom | Barre inférieure | "75%" |

---

## 7. Gestion des erreurs et états de chargement

### 7.1 États de chargement

| Action | Indicateur |
|--------|------------|
| Chargement dossier | Spinner pleine page + "Chargement..." |
| Import fichier | Progress bar dans modal |
| Calcul insights | Spinner dans le panneau insights |
| Export | Progress bar dans modal + "Préparation..." |
| Sauvegarde | Indicateur discret "Sauvegardé" dans header |

### 7.2 Gestion des erreurs

| Erreur | Comportement |
|--------|--------------|
| Échec chargement dossier | Message + bouton "Réessayer" |
| Échec import | Toast erreur + détails |
| Fichier trop gros | Toast warning + limite affichée |
| Format non supporté | Toast info + formats acceptés |
| Quota stockage dépassé | Modal explicatif + options (supprimer, exporter) |

### 7.3 Toasts

```typescript
// Types de toasts
type ToastType = 'success' | 'error' | 'warning' | 'info';

// Exemples
{ type: 'success', message: 'Élément créé' }
{ type: 'success', message: '47 éléments importés' }
{ type: 'error', message: 'Échec de l\'import: format invalide' }
{ type: 'warning', message: 'Fichier volumineux (>10MB), l\'import peut être lent' }
{ type: 'info', message: '2 homonymes potentiels détectés' }
```

---

## 8. Responsive et accessibilité

### 8.1 Breakpoints

| Taille | Comportement |
|--------|--------------|
| Desktop (>1200px) | Layout complet, panneau latéral visible |
| Tablet (768-1200px) | Panneau latéral en overlay |
| Mobile (<768px) | Non supporté (message explicatif) |

### 8.2 Accessibilité

| Élément | Accessibilité |
|---------|---------------|
| Tous les boutons | aria-label explicite |
| Modals | Focus trap, Escape pour fermer |
| Canvas | Navigation clavier (Tab entre éléments) |
| Recherche | Résultats annoncés au screen reader |
| Couleurs | Contraste suffisant, pas uniquement la couleur pour l'info |

---

*Architecture UI — V1 — Janvier 2025*
