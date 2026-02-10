import { create } from 'zustand';
import * as Y from 'yjs';
import type {
  Investigation,
  InvestigationId,
  Element,
  ElementId,
  ElementVisual,
  Link,
  LinkId,
  LinkVisual,
  Comment,
  CommentId,
  CommentTargetType,
  Asset,
  Position,
  PropertyDefinition,
} from '../types';

/** Element changes with partial visual support for collab-safe updates */
type ElementChanges = Omit<Partial<Element>, 'visual'> & { visual?: Partial<ElementVisual> };
/** Link changes with partial visual support for collab-safe updates */
type LinkChanges = Omit<Partial<Link>, 'visual'> & { visual?: Partial<LinkVisual> };
import {
  investigationRepository,
  elementRepository,
  linkRepository,
} from '../db/repositories';
import { fileService } from '../services/fileService';
import { syncService } from '../services/syncService';
import { getYMaps } from '../types/yjs';
import {
  elementToYMap,
  yMapToElement,
  updateElementYMap,
} from '../services/yjs/elementMapper';
import {
  linkToYMap,
  yMapToLink,
  updateLinkYMap,
} from '../services/yjs/linkMapper';
import {
  commentToYMap,
  yMapToComment,
  updateCommentYMap,
} from '../services/yjs/commentMapper';
import { useSyncStore } from './syncStore';
import { arrayBufferToBase64 } from '../utils';

interface InvestigationState {
  // Current investigation
  currentInvestigation: Investigation | null;
  elements: Element[];
  links: Link[];
  comments: Comment[];
  assets: Asset[];

  // All investigations (for home page)
  investigations: Investigation[];

  // Loading states
  isLoading: boolean;
  loadingPhase: string;
  loadingDetail: string;
  loadingProgress: number;
  error: string | null;

  // Actions - Investigations
  loadInvestigations: () => Promise<void>;
  loadInvestigation: (id: InvestigationId) => Promise<void>;
  createInvestigation: (name: string, description?: string) => Promise<Investigation>;
  createInvestigationWithId: (id: InvestigationId, name: string, description?: string) => Promise<Investigation>;
  updateInvestigation: (id: InvestigationId, changes: Partial<Investigation>) => Promise<void>;
  deleteInvestigation: (id: InvestigationId) => Promise<void>;
  unloadInvestigation: () => void;

  // Actions - Elements
  createElement: (label: string, position: Position, options?: Partial<Element>) => Promise<Element>;
  updateElement: (id: ElementId, changes: ElementChanges) => Promise<void>;
  deleteElement: (id: ElementId) => Promise<void>;
  deleteElements: (ids: ElementId[]) => Promise<void>;
  updateElementPosition: (id: ElementId, position: Position) => Promise<void>;
  updateElementPositions: (updates: { id: ElementId; position: Position }[]) => Promise<void>;

  // Actions - Links
  createLink: (fromId: ElementId, toId: ElementId, options?: Partial<Link>) => Promise<Link>;
  updateLink: (id: LinkId, changes: LinkChanges) => Promise<void>;
  deleteLink: (id: LinkId) => Promise<void>;
  deleteLinks: (ids: LinkId[]) => Promise<void>;

  // Actions - Bulk updates
  updateElements: (ids: ElementId[], changes: ElementChanges) => Promise<void>;
  updateLinks: (ids: LinkId[], changes: LinkChanges) => Promise<void>;
  pasteElements: (elements: Element[], links: Link[]) => void;

  // Actions - Groups
  createGroup: (label: string, position: Position, size: { width: number; height: number }, childIds?: ElementId[]) => Promise<Element>;
  addToGroup: (elementIds: ElementId[], groupId: ElementId) => Promise<void>;
  removeFromGroup: (elementIds: ElementId[]) => Promise<void>;
  dissolveGroup: (groupId: ElementId) => Promise<void>;

  // Actions - Assets
  addAsset: (elementId: ElementId, file: File) => Promise<Asset>;
  removeAsset: (elementId: ElementId, assetId: string) => Promise<void>;
  reorderAssets: (elementId: ElementId, assetIds: string[]) => Promise<void>;

  // Actions - Comments
  createComment: (targetId: ElementId | LinkId, targetType: CommentTargetType, content: string) => Promise<Comment>;
  resolveComment: (id: CommentId, resolverName: string) => Promise<void>;
  unresolveComment: (id: CommentId) => Promise<void>;
  deleteComment: (id: CommentId) => Promise<void>;
  getCommentsForTarget: (targetId: ElementId | LinkId) => Comment[];

  // Actions - Settings (for reusable tags/properties)
  addExistingTag: (tag: string) => Promise<void>;
  addSuggestedProperty: (propertyDef: PropertyDefinition) => Promise<void>;
  associatePropertyWithTags: (propertyDef: PropertyDefinition, tags: string[]) => Promise<void>;

  // Actions - Display settings
  toggleConfidenceIndicator: () => Promise<void>;
  togglePropertyDisplay: (propertyKey: string) => Promise<void>;
  clearDisplayedProperties: () => Promise<void>;
  setTagDisplayMode: (mode: 'none' | 'icons' | 'labels' | 'both') => Promise<void>;
  setTagDisplaySize: (size: 'small' | 'medium' | 'large') => Promise<void>;
  setLinkAnchorMode: (mode: 'auto' | 'manual') => Promise<void>;
  setLinkCurveMode: (mode: 'straight' | 'curved' | 'orthogonal') => Promise<void>;

  // Internal: sync Y.Doc state to Zustand
  _syncFromYDoc: () => void;
}

// ============================================================================
// Y.DOC OBSERVER SETUP
// ============================================================================

let ydocObserverCleanup: (() => void) | null = null;

// Skip mechanism for local operations that already updated Zustand
// When a local delete/update updates Zustand first, the next _syncFromYDoc
// can be skipped since state is already correct. A safety re-sync is scheduled
// to catch any concurrent remote changes that arrived during the same debounce window.
let localOpPending = false;
let safetySyncTimer: ReturnType<typeof setTimeout> | null = null;

// Incremental sync: track which elements/links changed between debounced syncs.
// Instead of parsing ALL 3000+ Y.Maps every time, we only re-parse the ones
// that actually changed. This reduces collaborative sync from O(n) to O(changed).
let changedElementIds = new Set<string>();
let changedLinkIds = new Set<string>();
let structuralElementChange = false; // element added/removed
let structuralLinkChange = false;    // link added/removed
let metaChangedFlag = false;
let commentsChangedFlag = false;
let assetsChangedFlag = false;

function setupYDocObserver(
  ydoc: Y.Doc,
  syncToZustand: () => void
): () => void {
  const { meta: metaMap, elements: elementsMap, links: linksMap, comments: commentsMap, assets: assetsMap } = getYMaps(ydoc);

  // Batch Y.Doc observer events using requestAnimationFrame.
  // When the main thread is blocked by React rendering (3.5s on Firefox),
  // multiple Y.js updates accumulate their changedElementIds/changedLinkIds.
  // On thread release, rAF fires ONE _syncFromYDoc that processes ALL accumulated
  // changes at once → fewer renders, better batching.
  // Local operations are protected by localOpPending (set before Y.doc transact).
  let syncRafId: number | null = null;

  const debouncedSync = () => {
    if (syncRafId) return; // Already scheduled — accumulated changes will be included
    syncRafId = requestAnimationFrame(() => {
      syncRafId = null;
      syncToZustand();
    });
  };

  // Observe meta changes (investigation name, description)
  const metaObserver = () => {
    metaChangedFlag = true;
    debouncedSync();
  };
  metaMap.observe(metaObserver);

  // Observe elements changes — extract changed IDs for incremental sync
  const elementsObserver = (events: Y.YEvent<any>[]) => {
    for (const event of events) {
      if (event.path.length === 0) {
        // Top-level: element added or removed from the map
        event.changes.keys.forEach((_change: any, key: string) => {
          changedElementIds.add(key);
          structuralElementChange = true;
        });
      } else {
        // Deep change: field modified in an element — path[0] is the element key/id
        const elementKey = event.path[0] as string;
        if (elementKey) changedElementIds.add(elementKey);
      }
    }
    debouncedSync();
  };
  elementsMap.observeDeep(elementsObserver);

  // Observe links changes — extract changed IDs for incremental sync
  const linksObserver = (events: Y.YEvent<any>[]) => {
    for (const event of events) {
      if (event.path.length === 0) {
        event.changes.keys.forEach((_change: any, key: string) => {
          changedLinkIds.add(key);
          structuralLinkChange = true;
        });
      } else {
        const linkKey = event.path[0] as string;
        if (linkKey) changedLinkIds.add(linkKey);
      }
    }
    debouncedSync();
  };
  linksMap.observeDeep(linksObserver);

  // Observe comments changes
  const commentsObserver = () => {
    commentsChangedFlag = true;
    debouncedSync();
  };
  commentsMap.observeDeep(commentsObserver);

  // Observe assets changes
  const assetsObserver = () => {
    assetsChangedFlag = true;
    debouncedSync();
  };
  assetsMap.observeDeep(assetsObserver);

  // Return cleanup function
  return () => {
    if (syncRafId) {
      cancelAnimationFrame(syncRafId);
    }
    metaMap.unobserve(metaObserver);
    elementsMap.unobserveDeep(elementsObserver);
    linksMap.unobserveDeep(linksObserver);
    commentsMap.unobserveDeep(commentsObserver);
    assetsMap.unobserveDeep(assetsObserver);
  };
}

// ============================================================================
// STORE IMPLEMENTATION
// ============================================================================

export const useInvestigationStore = create<InvestigationState>((set, get) => ({
  currentInvestigation: null,
  elements: [],
  links: [],
  comments: [],
  assets: [],
  investigations: [],
  isLoading: false,
  loadingPhase: '',
  loadingDetail: '',
  loadingProgress: 0,
  error: null,

  // ============================================================================
  // INVESTIGATION LIFECYCLE
  // ============================================================================

  loadInvestigations: async () => {
    set({ isLoading: true, error: null });
    try {
      const investigations = await investigationRepository.getAll();
      set({ investigations, isLoading: false });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  loadInvestigation: async (id: InvestigationId) => {
    set({ isLoading: true, loadingPhase: 'opening', loadingDetail: '', loadingProgress: 10, error: null });
    try {
      // Load investigation metadata from Dexie
      let [investigation, assets] = await Promise.all([
        investigationRepository.getById(id),
        fileService.getAssetsByInvestigation(id),
      ]);

      if (!investigation) {
        throw new Error('Investigation not found');
      }

      set({ loadingPhase: 'syncing', loadingDetail: investigation.name, loadingProgress: 30 });
      await new Promise(resolve => setTimeout(resolve, 0));

      // Check if Y.Doc is already open for this investigation (e.g., from JoinPage)
      let ydoc = syncService.getYDoc();
      const currentInvestigationId = syncService.getInvestigationId();

      if (!ydoc || currentInvestigationId !== id) {
        // Open Y.Doc in local mode (creates or loads from IndexedDB)
        ydoc = await syncService.openLocal(id);
      }

      // If in shared mode, wait for initial WebSocket sync before reading Y.Doc.
      // Without this, the joiner may read stale IndexedDB data (old positions/labels)
      // and never receive a safety re-sync if WebSocket isn't connected yet.
      const initialSyncState = syncService.getState();
      if (initialSyncState.mode === 'shared') {
        await syncService.waitForSync(5000);
      }

      // Check if Y.Doc has existing data
      const { meta: metaMap, elements: elementsMap, links: linksMap } = getYMaps(ydoc);

      // Check if we have meta from Y.Doc (from a shared session)
      const metaName = metaMap.get('name') as string | undefined;
      const metaDescription = metaMap.get('description') as string | undefined;

      // Capture joiner status BEFORE updating description (used later for
      // deciding whether to broadcast meta/assets or receive them)
      const isJoiner = investigation.description?.startsWith('Session partagée rejointe') ?? false;

      // If Y.Doc has meta but local investigation has default values, update local
      if (metaName && isJoiner) {
        investigation = {
          ...investigation,
          name: metaName,
          description: metaDescription || '',
        };
        // Persist to IndexedDB
        await investigationRepository.update(id, {
          name: metaName,
          description: metaDescription || '',
        });
      }

      // Migrate data from Dexie if Y.Doc is empty
      if (elementsMap.size === 0) {
        const [dexieElements, dexieLinks] = await Promise.all([
          elementRepository.getByInvestigation(id),
          linkRepository.getByInvestigation(id),
        ]);

        // Migrate elements to Y.Doc
        ydoc.transact(() => {
          dexieElements.forEach(element => {
            const ymap = elementToYMap(element);
            elementsMap.set(element.id, ymap);
          });

          dexieLinks.forEach(link => {
            const ymap = linkToYMap(link);
            linksMap.set(link.id, ymap);
          });
        });
      }

      // Joiner: download assets from Y.Doc before canvas renders.
      // Source path (meta broadcast + asset upload) deferred to after
      // initial render to avoid blocking during main thread contention.
      if (isJoiner) {
        // Sync assets from Y.Doc to local storage
        const { assets: assetsMap } = getYMaps(ydoc);
        const assetsFromYDoc: Asset[] = [];

        // Collect assets to process
        const assetEntries: Y.Map<any>[] = [];
        assetsMap.forEach((ymap) => {
          assetEntries.push(ymap as Y.Map<any>);
        });

        const totalAssets = assetEntries.length;
        set({ loadingPhase: 'files', loadingDetail: totalAssets > 0 ? `0 / ${totalAssets}` : '', loadingProgress: 55 });

        let assetsDone = 0;
        for (const map of assetEntries) {
          try {
            const assetId = map.get('id') as string;
            const base64Data = map.get('data') as string;

            if (assetId && base64Data) {
              // Check if we already have this asset locally
              const existingAsset = assets.find(a => a.id === assetId);
              if (!existingAsset) {
                const savedAsset = await fileService.saveAssetFromBase64({
                  id: assetId,
                  investigationId: map.get('investigationId') || investigation.id,
                  filename: map.get('filename') || 'unknown',
                  mimeType: map.get('mimeType') || 'application/octet-stream',
                  size: map.get('size') || 0,
                  hash: map.get('hash') || '',
                  thumbnailDataUrl: map.get('thumbnailDataUrl') || null,
                  extractedText: map.get('extractedText') || null,
                  createdAt: map.get('createdAt') ? new Date(map.get('createdAt')) : new Date(),
                }, base64Data);

                if (savedAsset) {
                  assetsFromYDoc.push(savedAsset);
                }
              }
            }
          } catch (error) {
            console.warn('Failed to load asset from Y.Doc:', error);
          }
          assetsDone++;
          if (totalAssets > 3) {
            set({ loadingDetail: `${assetsDone} / ${totalAssets}`, loadingProgress: 55 + Math.round((assetsDone / totalAssets) * 15) });
          }
        }

        // Add synced assets to local assets list
        assets = [...assets, ...assetsFromYDoc];
      }

      // Setup Y.Doc observer to sync to Zustand
      if (ydocObserverCleanup) {
        ydocObserverCleanup();
      }
      ydocObserverCleanup = setupYDocObserver(ydoc, () => get()._syncFromYDoc());

      set({ loadingPhase: 'elements', loadingDetail: `${elementsMap.size}|${linksMap.size}`, loadingProgress: 75 });

      // Yield to event loop so the browser paints the loading detail before heavy sync
      await new Promise(resolve => setTimeout(resolve, 0));

      // Initial sync from Y.Doc to Zustand (with deduplication)
      const elementsById = new Map<string, Element>();
      elementsMap.forEach((ymap) => {
        try {
          const element = yMapToElement(ymap as Y.Map<any>);
          if (element.id) {
            elementsById.set(element.id, element);
          }
        } catch {
          // Skip invalid elements
        }
      });

      const linksById = new Map<string, Link>();
      linksMap.forEach((ymap) => {
        try {
          const link = yMapToLink(ymap as Y.Map<any>);
          if (link.id) {
            linksById.set(link.id, link);
          }
        } catch {
          // Skip invalid links
        }
      });

      const loadedElements = Array.from(elementsById.values());
      const loadedLinks = Array.from(linksById.values());

      set({
        currentInvestigation: investigation,
        elements: loadedElements,
        links: loadedLinks,
        assets,
        isLoading: false,
        loadingPhase: '',
        loadingDetail: '',
        loadingProgress: 100,
      });

      // In shared mode, schedule safety re-syncs to catch data that arrives
      // after the initial Y.Doc read. This covers:
      // - Async buffer delivery (data arrives after initial connection)
      // - Reconnection scenarios (stale local data before peer re-syncs)
      // - Late WebSocket sync (initial read happened before sync completed)
      const syncState = syncService.getState();
      if (syncState.mode === 'shared') {
        // Immediate safety re-sync if already connected
        if (syncState.connected) {
          setTimeout(() => get()._syncFromYDoc(), 2500);
        }
        // Also listen for future connection/sync events to trigger re-sync.
        // This handles the case where WebSocket connects AFTER initial load.
        let unsubSyncWatch: (() => void) | null = null;
        unsubSyncWatch = syncService.onStateChange((state) => {
          if (state.mode !== 'shared') {
            unsubSyncWatch?.();
            return;
          }
          if (state.connected && !state.syncing) {
            // Connection established and sync complete — re-sync from Y.Doc
            unsubSyncWatch?.();
            setTimeout(() => get()._syncFromYDoc(), 500);
          }
        });
      }

      // Source: broadcast meta + upload assets to Y.Doc in background.
      // Deferred from initial load to let React render first, avoiding
      // send SLOW caused by main thread contention during rendering.
      if (!isJoiner) {
        const srcInvestigation = investigation;
        const srcAssets = assets;
        setTimeout(async () => {
          const deferredYdoc = syncService.getYDoc();
          if (!deferredYdoc) return;
          const { meta: deferredMeta, assets: deferredAssetsMap } = getYMaps(deferredYdoc);

          deferredYdoc.transact(() => {
            deferredMeta.set('name', srcInvestigation.name);
            deferredMeta.set('description', srcInvestigation.description || '');
          });

          for (const asset of srcAssets) {
            if (!deferredAssetsMap.has(asset.id)) {
              try {
                const file = await fileService.getAssetFile(asset);
                const arrayBuffer = await file.arrayBuffer();
                const base64 = arrayBufferToBase64(arrayBuffer);
                const assetYMap = new Y.Map();
                assetYMap.set('id', asset.id);
                assetYMap.set('investigationId', asset.investigationId);
                assetYMap.set('filename', asset.filename);
                assetYMap.set('mimeType', asset.mimeType);
                assetYMap.set('size', asset.size);
                assetYMap.set('hash', asset.hash);
                assetYMap.set('thumbnailDataUrl', asset.thumbnailDataUrl);
                assetYMap.set('extractedText', asset.extractedText);
                assetYMap.set('createdAt', asset.createdAt.toISOString());
                assetYMap.set('data', base64);
                deferredAssetsMap.set(asset.id, assetYMap);
              } catch (error) {
                console.warn('Failed to sync asset to Y.Doc:', asset.id, error);
              }
            }
          }
        }, 200);
      }
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false, loadingPhase: '', loadingDetail: '', loadingProgress: 0 });
    }
  },

  createInvestigation: async (name: string, description?: string) => {
    const investigation = await investigationRepository.create(name, description);
    set((state) => ({
      investigations: [investigation, ...state.investigations],
    }));
    return investigation;
  },

  createInvestigationWithId: async (id: InvestigationId, name: string, description?: string) => {
    const investigation = await investigationRepository.createWithId(id, name, description);
    // Only add to list if it's not already there
    set((state) => {
      const exists = state.investigations.some(inv => inv.id === id);
      if (exists) {
        return state;
      }
      return {
        investigations: [investigation, ...state.investigations],
      };
    });
    return investigation;
  },

  updateInvestigation: async (id: InvestigationId, changes: Partial<Investigation>) => {
    // Update Zustand FIRST (synchronous) for instant UI response
    // _syncFromYDoc will skip heavy parsing and schedule safety re-sync
    localOpPending = true;
    set((state) => ({
      investigations: state.investigations.map((inv) =>
        inv.id === id ? { ...inv, ...changes, updatedAt: new Date() } : inv
      ),
      currentInvestigation:
        state.currentInvestigation?.id === id
          ? { ...state.currentInvestigation, ...changes, updatedAt: new Date() }
          : state.currentInvestigation,
    }));

    // Then update Y.Doc for collaborative sync
    // The observer will trigger _syncFromYDoc, but since Zustand already has the new value,
    // no change will be detected (Y.Doc value == Zustand value)
    const ydoc = syncService.getYDoc();
    if (ydoc) {
      const { meta: metaMap } = getYMaps(ydoc);
      ydoc.transact(() => {
        if (changes.name !== undefined) metaMap.set('name', changes.name);
        if (changes.description !== undefined) metaMap.set('description', changes.description);
        if (changes.creator !== undefined) metaMap.set('creator', changes.creator);
        if (changes.startDate !== undefined) metaMap.set('startDate', changes.startDate ? changes.startDate.toISOString() : null);
        if (changes.tags !== undefined) metaMap.set('tags', changes.tags);
        if (changes.properties !== undefined) metaMap.set('properties', changes.properties);
      });
    }

    // Persist to IndexedDB (async, can happen after UI is updated)
    await investigationRepository.update(id, changes);
  },

  deleteInvestigation: async (id: InvestigationId) => {
    await fileService.deleteInvestigationAssets(id);
    await syncService.deleteLocalData(id);
    await investigationRepository.delete(id);
    set((state) => ({
      investigations: state.investigations.filter((inv) => inv.id !== id),
      currentInvestigation:
        state.currentInvestigation?.id === id ? null : state.currentInvestigation,
    }));
  },

  unloadInvestigation: () => {
    // Cleanup Y.Doc observer
    if (ydocObserverCleanup) {
      ydocObserverCleanup();
      ydocObserverCleanup = null;
    }

    // Don't close sync connection here - it breaks React StrictMode
    // and shared mode. The connection is closed explicitly via:
    // - handleGoHome in InvestigationPage
    // - syncService.close() when opening a different investigation

    set({
      currentInvestigation: null,
      elements: [],
      links: [],
      comments: [],
      assets: [],
    });
  },

  // ============================================================================
  // ELEMENTS - Via Y.Doc
  // ============================================================================

  createElement: async (label: string, position: Position, options?: Partial<Element>) => {
    const { currentInvestigation } = get();
    if (!currentInvestigation) {
      throw new Error('No investigation loaded');
    }

    const ydoc = syncService.getYDoc();
    if (!ydoc) {
      throw new Error('Y.Doc not available');
    }

    const now = new Date();
    const element: Element = {
      id: crypto.randomUUID(),
      investigationId: currentInvestigation.id,
      label,
      notes: '',
      tags: [],
      properties: [],
      confidence: null,
      source: '',
      date: null,
      dateRange: null,
      position,
      isPositionLocked: false,
      geo: null,
      events: [],
      visual: {
        color: '#ffffff',
        borderColor: '#e5e7eb',
        shape: 'rectangle',
        size: 'medium',
        icon: null,
        image: null,
      },
      assetIds: [],
      parentGroupId: null,
      isGroup: false,
      isAnnotation: false,
      childIds: [],
      createdAt: now,
      updatedAt: now,
      ...options,
    };

    // Add to Y.Doc
    const { elements: elementsMap } = getYMaps(ydoc);
    ydoc.transact(() => {
      const ymap = elementToYMap(element);
      elementsMap.set(element.id, ymap);
    });

    // Also persist in Dexie for backwards compatibility (with same ID!)
    await elementRepository.create(
      currentInvestigation.id,
      label,
      position,
      { ...options, id: element.id }
    ).catch(() => {
      // Ignore Dexie errors - Y.Doc is source of truth
    });

    return element;
  },

  updateElement: async (id: ElementId, changes: ElementChanges) => {
    const ydoc = syncService.getYDoc();
    if (!ydoc) {
      throw new Error('Y.Doc not available');
    }

    const { elements: elementsMap } = getYMaps(ydoc);
    const ymap = elementsMap.get(id) as Y.Map<any> | undefined;

    if (!ymap) {
      throw new Error('Element not found');
    }

    // Update Zustand FIRST (synchronous) for instant UI response
    // _syncFromYDoc will skip heavy parsing and schedule safety re-sync
    localOpPending = true;
    set((state) => ({
      elements: state.elements.map((el) => {
        if (el.id !== id) return el;
        // Merge partial visual with existing visual to avoid overwriting concurrent remote changes
        const mergedVisual = changes.visual !== undefined
          ? { ...el.visual, ...changes.visual }
          : el.visual;
        return { ...el, ...changes, visual: mergedVisual, updatedAt: new Date() };
      }),
    }));

    // Update Y.Doc for collaborative sync
    updateElementYMap(ymap, changes, ydoc);

    // Also update Dexie for backwards compatibility
    await elementRepository.update(id, changes as any).catch(() => {
      // Ignore Dexie errors - Y.Doc is source of truth
    });
  },

  deleteElement: async (id: ElementId) => {
    const ydoc = syncService.getYDoc();
    if (!ydoc) {
      throw new Error('Y.Doc not available');
    }

    const { elements: elementsMap, links: linksMap } = getYMaps(ydoc);

    // Find connected links
    const linksToDelete: string[] = [];
    linksMap.forEach((ymap, linkId) => {
      const map = ymap as Y.Map<any>;
      if (map.get('fromId') === id || map.get('toId') === id) {
        linksToDelete.push(linkId);
      }
    });

    // Update Zustand FIRST (synchronous) for instant UI response
    // _syncFromYDoc will skip heavy parsing and schedule safety re-sync
    localOpPending = true;
    const linksToDeleteSet = new Set(linksToDelete);
    set((state) => ({
      elements: state.elements.filter(el => el.id !== id),
      links: state.links.filter(lk => !linksToDeleteSet.has(lk.id)),
    }));

    ydoc.transact(() => {
      linksToDelete.forEach(linkId => linksMap.delete(linkId));
      elementsMap.delete(id);
    });

    // Also delete from Dexie for backwards compatibility
    await elementRepository.delete(id).catch(() => {});
  },

  deleteElements: async (ids: ElementId[]) => {
    const ydoc = syncService.getYDoc();
    if (!ydoc) {
      throw new Error('Y.Doc not available');
    }

    const { elements: elementsMap, links: linksMap } = getYMaps(ydoc);

    // Use Set for O(1) lookups
    const idsSet = new Set(ids);

    // Find connected links
    const linksToDelete: string[] = [];
    linksMap.forEach((ymap, linkId) => {
      const map = ymap as Y.Map<any>;
      if (idsSet.has(map.get('fromId')) || idsSet.has(map.get('toId'))) {
        linksToDelete.push(linkId);
      }
    });

    // Update Zustand FIRST (synchronous) for instant UI response
    // _syncFromYDoc will skip heavy parsing and schedule safety re-sync
    localOpPending = true;
    const linksToDeleteSet = new Set(linksToDelete);
    set((state) => ({
      elements: state.elements.filter(el => !idsSet.has(el.id)),
      links: state.links.filter(lk => !linksToDeleteSet.has(lk.id)),
    }));

    ydoc.transact(() => {
      linksToDelete.forEach(linkId => linksMap.delete(linkId));
      ids.forEach(id => elementsMap.delete(id));
    });

    // Also delete from Dexie for backwards compatibility
    await elementRepository.deleteMany(ids).catch(() => {});
  },

  updateElementPosition: async (id: ElementId, position: Position) => {
    const ydoc = syncService.getYDoc();
    if (!ydoc) {
      throw new Error('Y.Doc not available');
    }

    const { elements: elementsMap } = getYMaps(ydoc);
    const ymap = elementsMap.get(id) as Y.Map<any> | undefined;

    if (!ymap) {
      throw new Error('Element not found');
    }

    // Update Zustand FIRST
    localOpPending = true;
    set((state) => ({
      elements: state.elements.map(el =>
        el.id === id ? { ...el, position } : el
      ),
    }));

    updateElementYMap(ymap, { position }, ydoc);

    // Also update Dexie
    await elementRepository.updatePosition(id, position).catch(() => {});
  },

  updateElementPositions: async (updates: { id: ElementId; position: Position }[]) => {
    const ydoc = syncService.getYDoc();
    if (!ydoc) {
      throw new Error('Y.Doc not available');
    }

    const { elements: elementsMap } = getYMaps(ydoc);

    // Update Zustand FIRST for instant local response
    // _syncFromYDoc will skip heavy parsing via localOpPending
    localOpPending = true;
    const updatesMap = new Map(updates.map(u => [u.id, u.position]));
    set((state) => ({
      elements: state.elements.map(el => {
        const pos = updatesMap.get(el.id);
        return pos ? { ...el, position: pos } : el;
      }),
    }));

    ydoc.transact(() => {
      updates.forEach(({ id, position }) => {
        const ymap = elementsMap.get(id) as Y.Map<any> | undefined;
        if (ymap) {
          // Position stored as separate fields for better CRDT conflict resolution
          ymap.set('positionX', position.x);
          ymap.set('positionY', position.y);
          // Also update legacy nested object for backwards compatibility
          ymap.set('position', { x: position.x, y: position.y });
          // Update timestamp - _meta is also stored as plain object
          const currentMeta = ymap.get('_meta') || {};
          ymap.set('_meta', { ...currentMeta, updatedAt: new Date().toISOString() });
        } else {
          console.warn('[updateElementPositions] ymap not found for', id.slice(0, 8));
        }
      });
    });

    // Also update Dexie
    await elementRepository.updatePositions(updates).catch(() => {});
  },

  // ============================================================================
  // LINKS - Via Y.Doc
  // ============================================================================

  createLink: async (fromId: ElementId, toId: ElementId, options?: Partial<Link>) => {
    const { currentInvestigation } = get();
    if (!currentInvestigation) {
      throw new Error('No investigation loaded');
    }

    const ydoc = syncService.getYDoc();
    if (!ydoc) {
      throw new Error('Y.Doc not available');
    }

    const now = new Date();
    const link: Link = {
      id: crypto.randomUUID(),
      investigationId: currentInvestigation.id,
      fromId,
      toId,
      sourceHandle: null,
      targetHandle: null,
      label: '',
      notes: '',
      tags: [],
      properties: [],
      directed: false,
      direction: 'none',
      confidence: null,
      source: '',
      date: null,
      dateRange: null,
      visual: {
        color: '#9ca3af',
        style: 'solid',
        thickness: 2,
      },
      curveOffset: { x: 0, y: 0 },
      createdAt: now,
      updatedAt: now,
      ...options,
    };

    // Add to Y.Doc
    const { links: linksMap } = getYMaps(ydoc);
    ydoc.transact(() => {
      const ymap = linkToYMap(link);
      linksMap.set(link.id, ymap);
    });

    // Also persist in Dexie for backwards compatibility (with same ID!)
    await linkRepository.create(
      currentInvestigation.id,
      fromId,
      toId,
      { ...options, id: link.id }
    ).catch(() => {});

    return link;
  },

  updateLink: async (id: LinkId, changes: LinkChanges) => {
    const ydoc = syncService.getYDoc();
    if (!ydoc) {
      throw new Error('Y.Doc not available');
    }

    const { links: linksMap } = getYMaps(ydoc);
    const ymap = linksMap.get(id) as Y.Map<any> | undefined;

    if (!ymap) {
      throw new Error('Link not found');
    }

    // Update Zustand FIRST (synchronous) for instant UI response
    // _syncFromYDoc will skip heavy parsing and schedule safety re-sync
    localOpPending = true;
    set((state) => ({
      links: state.links.map((lk) => {
        if (lk.id !== id) return lk;
        // Merge partial visual with existing visual to avoid overwriting concurrent remote changes
        const mergedVisual = changes.visual !== undefined
          ? { ...lk.visual, ...changes.visual }
          : lk.visual;
        return { ...lk, ...changes, visual: mergedVisual, updatedAt: new Date() };
      }),
    }));

    // Update Y.Doc for collaborative sync
    updateLinkYMap(ymap, changes, ydoc);

    // Also update Dexie
    await linkRepository.update(id, changes as any).catch(() => {});
  },

  deleteLink: async (id: LinkId) => {
    const ydoc = syncService.getYDoc();
    if (!ydoc) {
      throw new Error('Y.Doc not available');
    }

    // Update Zustand FIRST (synchronous) for instant UI response
    set((state) => ({
      links: state.links.filter(lk => lk.id !== id),
    }));

    const { links: linksMap } = getYMaps(ydoc);
    ydoc.transact(() => {
      linksMap.delete(id);
    });

    // Also delete from Dexie
    await linkRepository.delete(id).catch(() => {});
  },

  deleteLinks: async (ids: LinkId[]) => {
    const ydoc = syncService.getYDoc();
    if (!ydoc) {
      throw new Error('Y.Doc not available');
    }

    // Update Zustand FIRST (synchronous) for instant UI response
    const idsSet = new Set(ids);
    set((state) => ({
      links: state.links.filter(lk => !idsSet.has(lk.id)),
    }));

    const { links: linksMap } = getYMaps(ydoc);
    ydoc.transact(() => {
      ids.forEach(id => linksMap.delete(id));
    });

    // Also delete from Dexie
    await linkRepository.deleteMany(ids).catch(() => {});
  },

  // ============================================================================
  // BULK UPDATES
  // ============================================================================

  updateElements: async (ids: ElementId[], changes: ElementChanges) => {
    const ydoc = syncService.getYDoc();
    if (!ydoc) {
      throw new Error('Y.Doc not available');
    }

    const { elements: elementsMap } = getYMaps(ydoc);

    ydoc.transact(() => {
      ids.forEach(id => {
        const ymap = elementsMap.get(id) as Y.Map<any> | undefined;
        if (ymap) {
          updateElementYMap(ymap, changes, ydoc);
        }
      });
    });

    // Also update Dexie for backwards compatibility
    await Promise.all(
      ids.map(id => elementRepository.update(id, changes as any).catch(() => {}))
    );
  },

  updateLinks: async (ids: LinkId[], changes: LinkChanges) => {
    const ydoc = syncService.getYDoc();
    if (!ydoc) {
      throw new Error('Y.Doc not available');
    }

    const { links: linksMap } = getYMaps(ydoc);

    ydoc.transact(() => {
      ids.forEach(id => {
        const ymap = linksMap.get(id) as Y.Map<any> | undefined;
        if (ymap) {
          updateLinkYMap(ymap, changes, ydoc);
        }
      });
    });

    // Also update Dexie
    await Promise.all(
      ids.map(id => linkRepository.update(id, changes as any).catch(() => {}))
    );
  },

  // Batch paste: create all elements and links in a single Y.js transaction
  pasteElements: (newElements: Element[], newLinks: Link[]) => {
    const ydoc = syncService.getYDoc();
    if (!ydoc) return;

    const { elements: elementsMap, links: linksMap } = getYMaps(ydoc);

    ydoc.transact(() => {
      for (const element of newElements) {
        const ymap = elementToYMap(element);
        elementsMap.set(element.id, ymap);
      }
      for (const link of newLinks) {
        const ymap = linkToYMap(link);
        linksMap.set(link.id, ymap);
      }
    });

    // Persist to Dexie in background (fire-and-forget)
    const invId = get().currentInvestigation?.id;
    if (invId) {
      for (const el of newElements) {
        elementRepository.create(invId, el.label, el.position, { ...el }).catch(() => {});
      }
      for (const link of newLinks) {
        linkRepository.create(invId, link.fromId, link.toId, { ...link }).catch(() => {});
      }
    }
  },

  // ============================================================================
  // GROUPS
  // ============================================================================

  createGroup: async (label: string, position: Position, size: { width: number; height: number }, childIds?: ElementId[]) => {
    const { createElement, elements } = get();

    const group = await createElement(label, position, {
      isGroup: true,
      childIds: childIds || [],
      visual: {
        color: '#ffffff',
        borderColor: '#e5e7eb',
        borderStyle: 'dashed',
        shape: 'rectangle',
        size: 'medium',
        icon: null,
        image: null,
        customWidth: size.width,
        customHeight: size.height,
      },
    });

    // Batch all child updates in a single Y.js transaction for instant visual update
    if (childIds && childIds.length > 0) {
      const ydoc = syncService.getYDoc();
      if (ydoc) {
        const { elements: elementsMap } = getYMaps(ydoc);

        ydoc.transact(() => {
          for (const childId of childIds) {
            const child = elements.find(el => el.id === childId);
            if (child) {
              const ymap = elementsMap.get(childId) as any;
              if (ymap) {
                const relX = child.position.x - position.x;
                const relY = child.position.y - position.y;
                ymap.set('parentGroupId', group.id);
                ymap.set('positionX', relX);
                ymap.set('positionY', relY);
                ymap.set('position', { x: relX, y: relY });
              }
            }
          }
        });

        // Persist to Dexie in background
        for (const childId of childIds) {
          const child = elements.find(el => el.id === childId);
          if (child) {
            elementRepository.update(childId, {
              parentGroupId: group.id,
              position: {
                x: child.position.x - position.x,
                y: child.position.y - position.y,
              },
            }).catch(() => {});
          }
        }
      }
    }

    return group;
  },

  addToGroup: async (elementIds: ElementId[], groupId: ElementId) => {
    const { elements, updateElement } = get();
    const group = elements.find(el => el.id === groupId);
    if (!group || !group.isGroup) return;

    const newChildIds = [...group.childIds];

    for (const elementId of elementIds) {
      const child = elements.find(el => el.id === elementId);
      if (!child || child.isGroup) continue; // Don't nest groups
      if (child.parentGroupId === groupId) continue; // Already in this group

      // Remove from previous group if any
      if (child.parentGroupId) {
        const prevGroup = elements.find(el => el.id === child.parentGroupId);
        if (prevGroup) {
          await updateElement(prevGroup.id, {
            childIds: prevGroup.childIds.filter(id => id !== elementId),
          });
        }
      }

      // Convert position to relative (subtract group position)
      await updateElement(elementId, {
        parentGroupId: groupId,
        position: {
          x: child.position.x - group.position.x,
          y: child.position.y - group.position.y,
        },
      });

      if (!newChildIds.includes(elementId)) {
        newChildIds.push(elementId);
      }
    }

    await updateElement(groupId, { childIds: newChildIds });
  },

  removeFromGroup: async (elementIds: ElementId[]) => {
    const { elements, updateElement } = get();

    for (const elementId of elementIds) {
      const child = elements.find(el => el.id === elementId);
      if (!child || !child.parentGroupId) continue;

      const group = elements.find(el => el.id === child.parentGroupId);
      if (group) {
        // Convert position back to absolute (add group position)
        await updateElement(elementId, {
          parentGroupId: null,
          position: {
            x: child.position.x + group.position.x,
            y: child.position.y + group.position.y,
          },
        });

        // Remove from group's childIds
        await updateElement(group.id, {
          childIds: group.childIds.filter(id => id !== elementId),
        });
      } else {
        // Group not found, just clear parentGroupId
        await updateElement(elementId, { parentGroupId: null });
      }
    }
  },

  dissolveGroup: async (groupId: ElementId) => {
    const { elements } = get();
    const group = elements.find(el => el.id === groupId);
    if (!group || !group.isGroup) return;

    const ydoc = syncService.getYDoc();
    if (!ydoc) return;

    const { elements: elementsMap } = getYMaps(ydoc);

    // Batch all updates in a single transaction for instant visual update
    ydoc.transact(() => {
      // Convert all children to absolute positions
      for (const childId of group.childIds) {
        const child = elements.find(el => el.id === childId);
        if (child) {
          const ymap = elementsMap.get(childId) as any;
          if (ymap) {
            const absX = child.position.x + group.position.x;
            const absY = child.position.y + group.position.y;
            ymap.set('parentGroupId', null);
            ymap.set('positionX', absX);
            ymap.set('positionY', absY);
            ymap.set('position', { x: absX, y: absY });
          }
        }
      }

      // Delete the group element
      elementsMap.delete(groupId);
    });

    // Persist to Dexie in background
    for (const childId of group.childIds) {
      const child = elements.find(el => el.id === childId);
      if (child) {
        elementRepository.update(childId, {
          parentGroupId: null,
          position: {
            x: child.position.x + group.position.x,
            y: child.position.y + group.position.y,
          },
        }).catch(() => {});
      }
    }
    elementRepository.delete(groupId).catch(() => {});
  },

  // ============================================================================
  // ASSETS - Via OPFS (unchanged)
  // ============================================================================

  addAsset: async (elementId: ElementId, file: File) => {
    const { currentInvestigation } = get();
    if (!currentInvestigation) {
      throw new Error('No investigation loaded');
    }

    // Warn about large files in shared mode (sync can be slow or fail)
    const LARGE_FILE_WARNING_SIZE = 10 * 1024 * 1024; // 10 MB
    const syncState = syncService.getState();
    if (syncState.mode === 'shared' && file.size > LARGE_FILE_WARNING_SIZE) {
      const { toast } = await import('./toastStore');
      toast.warning(
        `Fichier volumineux (${Math.round(file.size / 1024 / 1024)} MB). La synchronisation peut être lente ou échouer.`,
        8000
      );
    }

    const asset = await fileService.saveAsset(currentInvestigation.id, file);

    // Update element's assetIds in Y.Doc
    const ydoc = syncService.getYDoc();
    if (ydoc) {
      const { elements: elementsMap } = getYMaps(ydoc);
      const ymap = elementsMap.get(elementId) as Y.Map<any> | undefined;
      if (ymap) {
        const currentAssetIds = ymap.get('assetIds') || [];
        const assetIdsArray = Array.isArray(currentAssetIds) ? currentAssetIds : [];
        if (!assetIdsArray.includes(asset.id)) {
          ymap.set('assetIds', [...assetIdsArray, asset.id]);
        }
      }
    }

    // Update Zustand + Dexie immediately so the UI shows the thumbnail
    localOpPending = true;
    set((state) => ({
      assets: state.assets.some((a) => a.id === asset.id)
        ? state.assets.map((a) => (a.id === asset.id ? asset : a))
        : [...state.assets, asset],
    }));
    elementRepository.addAsset(elementId, asset.id).catch(() => {});

    // Store asset binary in Y.Doc for peer sync (deferred — base64 conversion is slow)
    if (ydoc) {
      const { assets: assetsMap } = getYMaps(ydoc);
      file.arrayBuffer().then(arrayBuffer => {
        const base64 = arrayBufferToBase64(arrayBuffer);
        const assetYMap = new Y.Map();
        assetYMap.set('id', asset.id);
        assetYMap.set('investigationId', asset.investigationId);
        assetYMap.set('filename', asset.filename);
        assetYMap.set('mimeType', asset.mimeType);
        assetYMap.set('size', asset.size);
        assetYMap.set('hash', asset.hash);
        assetYMap.set('thumbnailDataUrl', asset.thumbnailDataUrl);
        assetYMap.set('extractedText', asset.extractedText);
        assetYMap.set('createdAt', asset.createdAt.toISOString());
        assetYMap.set('data', base64);
        assetsMap.set(asset.id, assetYMap);
      }).catch(() => {});
    }

    return asset;
  },

  removeAsset: async (elementId: ElementId, assetId: string) => {
    // Update element in Y.Doc
    const ydoc = syncService.getYDoc();
    if (ydoc) {
      const { elements: elementsMap, assets: assetsMap } = getYMaps(ydoc);
      const ymap = elementsMap.get(elementId) as Y.Map<any> | undefined;
      if (ymap) {
        // assetIds is stored as plain array, not Y.Array
        const currentAssetIds = ymap.get('assetIds') || [];
        const assetIdsArray = Array.isArray(currentAssetIds) ? currentAssetIds : [];
        ymap.set('assetIds', assetIdsArray.filter((id: string) => id !== assetId));
      }

      // Remove asset from Y.Doc assets map
      assetsMap.delete(assetId);
    }

    // Also update Dexie
    await elementRepository.removeAsset(elementId, assetId).catch(() => {});

    // Remove from local state
    set((state) => ({
      assets: state.assets.filter((a) => a.id !== assetId),
    }));
  },

  reorderAssets: async (elementId: ElementId, assetIds: string[]) => {
    // Update element in Y.Doc
    const ydoc = syncService.getYDoc();
    if (ydoc) {
      const { elements: elementsMap } = getYMaps(ydoc);
      const ymap = elementsMap.get(elementId) as Y.Map<any> | undefined;
      if (ymap) {
        ymap.set('assetIds', assetIds);
      }
    }

    // Also update Dexie
    await elementRepository.update(elementId, { assetIds }).catch(() => {});

    // Update local Zustand state
    set((state) => ({
      elements: state.elements.map((el) =>
        el.id === elementId ? { ...el, assetIds } : el
      ),
    }));
  },

  // ============================================================================
  // COMMENTS - Via Y.Doc
  // ============================================================================

  createComment: async (targetId, targetType, content) => {
    const { currentInvestigation } = get();
    if (!currentInvestigation) {
      throw new Error('No investigation loaded');
    }

    const ydoc = syncService.getYDoc();
    if (!ydoc) {
      throw new Error('Y.Doc not available');
    }

    // Get user info from syncStore (always available, even offline)
    const { localUser } = useSyncStore.getState();
    const authorName = localUser.name;
    const authorColor = localUser.color;

    const comment: Comment = {
      id: crypto.randomUUID(),
      investigationId: currentInvestigation.id,
      targetId,
      targetType,
      authorName,
      authorColor,
      content,
      resolved: false,
      resolvedBy: null,
      resolvedAt: null,
      createdAt: new Date(),
    };

    // Add to Y.Doc
    const { comments: commentsMap } = getYMaps(ydoc);
    ydoc.transact(() => {
      const ymap = commentToYMap(comment);
      commentsMap.set(comment.id, ymap);
    });

    return comment;
  },

  resolveComment: async (id, resolverName) => {
    const ydoc = syncService.getYDoc();
    if (!ydoc) {
      throw new Error('Y.Doc not available');
    }

    const { comments: commentsMap } = getYMaps(ydoc);
    const ymap = commentsMap.get(id) as Y.Map<any> | undefined;

    if (!ymap) {
      throw new Error('Comment not found');
    }

    updateCommentYMap(ymap, {
      resolved: true,
      resolvedBy: resolverName,
      resolvedAt: new Date(),
    }, ydoc);
  },

  unresolveComment: async (id) => {
    const ydoc = syncService.getYDoc();
    if (!ydoc) {
      throw new Error('Y.Doc not available');
    }

    const { comments: commentsMap } = getYMaps(ydoc);
    const ymap = commentsMap.get(id) as Y.Map<any> | undefined;

    if (!ymap) {
      throw new Error('Comment not found');
    }

    updateCommentYMap(ymap, {
      resolved: false,
      resolvedBy: null,
      resolvedAt: null,
    }, ydoc);
  },

  deleteComment: async (id) => {
    const ydoc = syncService.getYDoc();
    if (!ydoc) {
      throw new Error('Y.Doc not available');
    }

    const { comments: commentsMap } = getYMaps(ydoc);
    ydoc.transact(() => {
      commentsMap.delete(id);
    });
  },

  getCommentsForTarget: (targetId) => {
    const { comments } = get();
    return comments.filter(c => c.targetId === targetId);
  },

  // ============================================================================
  // SETTINGS - Via Dexie (unchanged)
  // ============================================================================

  addExistingTag: async (tag: string) => {
    const { currentInvestigation } = get();
    if (!currentInvestigation) return;

    const existingTags = currentInvestigation.settings.existingTags;
    if (existingTags.includes(tag)) return;

    await investigationRepository.addTag(currentInvestigation.id, tag);

    set((state) => ({
      currentInvestigation: state.currentInvestigation
        ? {
            ...state.currentInvestigation,
            settings: {
              ...state.currentInvestigation.settings,
              existingTags: [...state.currentInvestigation.settings.existingTags, tag],
            },
          }
        : null,
    }));
  },

  addSuggestedProperty: async (propertyDef: PropertyDefinition) => {
    const { currentInvestigation } = get();
    if (!currentInvestigation) return;

    const suggestedProperties = currentInvestigation.settings.suggestedProperties;
    if (suggestedProperties.some(p => p.key === propertyDef.key)) return;

    await investigationRepository.addSuggestedProperty(currentInvestigation.id, propertyDef);

    set((state) => ({
      currentInvestigation: state.currentInvestigation
        ? {
            ...state.currentInvestigation,
            settings: {
              ...state.currentInvestigation.settings,
              suggestedProperties: [
                ...state.currentInvestigation.settings.suggestedProperties,
                propertyDef,
              ],
            },
          }
        : null,
    }));
  },

  associatePropertyWithTags: async (propertyDef: PropertyDefinition, tags: string[]) => {
    const { currentInvestigation } = get();
    if (!currentInvestigation || tags.length === 0) return;

    await investigationRepository.associatePropertyWithTags(
      currentInvestigation.id,
      propertyDef,
      tags
    );

    set((state) => {
      if (!state.currentInvestigation) return state;

      const associations = { ...state.currentInvestigation.settings.tagPropertyAssociations };

      for (const tag of tags) {
        if (!associations[tag]) {
          associations[tag] = [];
        }
        const existingIndex = associations[tag].findIndex(p => p.key === propertyDef.key);
        if (existingIndex === -1) {
          associations[tag] = [...associations[tag], propertyDef];
        } else if (associations[tag][existingIndex].type !== propertyDef.type) {
          associations[tag] = associations[tag].map((p, i) =>
            i === existingIndex ? propertyDef : p
          );
        }
      }

      return {
        currentInvestigation: {
          ...state.currentInvestigation,
          settings: {
            ...state.currentInvestigation.settings,
            tagPropertyAssociations: associations,
          },
        },
      };
    });
  },

  // ============================================================================
  // DISPLAY SETTINGS
  // ============================================================================

  toggleConfidenceIndicator: async () => {
    const { currentInvestigation } = get();
    if (!currentInvestigation) return;

    const newValue = !currentInvestigation.settings.showConfidenceIndicator;

    await investigationRepository.update(currentInvestigation.id, {
      settings: {
        ...currentInvestigation.settings,
        showConfidenceIndicator: newValue,
      },
    });

    set((state) => {
      if (!state.currentInvestigation) return state;
      return {
        currentInvestigation: {
          ...state.currentInvestigation,
          settings: {
            ...state.currentInvestigation.settings,
            showConfidenceIndicator: newValue,
          },
        },
      };
    });
  },

  togglePropertyDisplay: async (propertyKey: string) => {
    const { currentInvestigation } = get();
    if (!currentInvestigation) return;

    const currentDisplayed = currentInvestigation.settings.displayedProperties || [];
    const isDisplayed = currentDisplayed.includes(propertyKey);
    const newDisplayed = isDisplayed
      ? currentDisplayed.filter(k => k !== propertyKey)
      : [...currentDisplayed, propertyKey];

    await investigationRepository.update(currentInvestigation.id, {
      settings: {
        ...currentInvestigation.settings,
        displayedProperties: newDisplayed,
      },
    });

    set((state) => {
      if (!state.currentInvestigation) return state;
      return {
        currentInvestigation: {
          ...state.currentInvestigation,
          settings: {
            ...state.currentInvestigation.settings,
            displayedProperties: newDisplayed,
          },
        },
      };
    });
  },

  clearDisplayedProperties: async () => {
    const { currentInvestigation } = get();
    if (!currentInvestigation) return;

    await investigationRepository.update(currentInvestigation.id, {
      settings: {
        ...currentInvestigation.settings,
        displayedProperties: [],
      },
    });

    set((state) => {
      if (!state.currentInvestigation) return state;
      return {
        currentInvestigation: {
          ...state.currentInvestigation,
          settings: {
            ...state.currentInvestigation.settings,
            displayedProperties: [],
          },
        },
      };
    });
  },

  setTagDisplayMode: async (mode: 'none' | 'icons' | 'labels' | 'both') => {
    const { currentInvestigation } = get();
    if (!currentInvestigation) return;

    await investigationRepository.update(currentInvestigation.id, {
      settings: {
        ...currentInvestigation.settings,
        tagDisplayMode: mode,
      },
    });

    set((state) => {
      if (!state.currentInvestigation) return state;
      return {
        currentInvestigation: {
          ...state.currentInvestigation,
          settings: {
            ...state.currentInvestigation.settings,
            tagDisplayMode: mode,
          },
        },
      };
    });
  },

  setTagDisplaySize: async (size: 'small' | 'medium' | 'large') => {
    const { currentInvestigation } = get();
    if (!currentInvestigation) return;

    await investigationRepository.update(currentInvestigation.id, {
      settings: {
        ...currentInvestigation.settings,
        tagDisplaySize: size,
      },
    });

    set((state) => {
      if (!state.currentInvestigation) return state;
      return {
        currentInvestigation: {
          ...state.currentInvestigation,
          settings: {
            ...state.currentInvestigation.settings,
            tagDisplaySize: size,
          },
        },
      };
    });
  },

  setLinkAnchorMode: async (mode: 'auto' | 'manual') => {
    const { currentInvestigation } = get();
    if (!currentInvestigation) return;

    await investigationRepository.update(currentInvestigation.id, {
      settings: {
        ...currentInvestigation.settings,
        linkAnchorMode: mode,
      },
    });

    set((state) => {
      if (!state.currentInvestigation) return state;
      return {
        currentInvestigation: {
          ...state.currentInvestigation,
          settings: {
            ...state.currentInvestigation.settings,
            linkAnchorMode: mode,
          },
        },
      };
    });
  },

  setLinkCurveMode: async (mode: 'straight' | 'curved' | 'orthogonal') => {
    const { currentInvestigation } = get();
    if (!currentInvestigation) return;

    await investigationRepository.update(currentInvestigation.id, {
      settings: {
        ...currentInvestigation.settings,
        linkCurveMode: mode,
      },
    });

    set((state) => {
      if (!state.currentInvestigation) return state;
      return {
        currentInvestigation: {
          ...state.currentInvestigation,
          settings: {
            ...state.currentInvestigation.settings,
            linkCurveMode: mode,
          },
        },
      };
    });
  },

  // ============================================================================
  // INTERNAL: SYNC FROM Y.DOC
  // ============================================================================

  _syncFromYDoc: () => {
    const ydoc = syncService.getYDoc();
    const { currentInvestigation, elements: stateElements, links: stateLinks, comments: stateComments, assets: currentAssets } = get();
    if (!ydoc || !currentInvestigation) {
      return;
    }

    // Fast path: if a local operation already updated Zustand, skip heavy parsing.
    // Schedule a safety re-sync to catch any concurrent remote changes.
    // Don't clear change tracking flags — safety re-sync will process them.
    if (localOpPending) {
      localOpPending = false;
      if (!safetySyncTimer) {
        safetySyncTimer = setTimeout(() => {
          safetySyncTimer = null;
          get()._syncFromYDoc();
        }, 500);
      }
      return;
    }

    // Capture and reset change tracking flags atomically.
    // If no flags are set (safety re-sync with no new observer events),
    // all sections are skipped → function returns early with no state change.
    const elIdsChanged = changedElementIds;
    const lkIdsChanged = changedLinkIds;
    const structuralElChange = structuralElementChange;
    const structuralLkChange = structuralLinkChange;
    const metaChanged = metaChangedFlag;
    const commentsNeedSync = commentsChangedFlag;
    const assetsNeedSync = assetsChangedFlag;

    changedElementIds = new Set<string>();
    changedLinkIds = new Set<string>();
    structuralElementChange = false;
    structuralLinkChange = false;
    metaChangedFlag = false;
    commentsChangedFlag = false;
    assetsChangedFlag = false;

    const { meta: metaMap, elements: elementsMap, links: linksMap, comments: commentsMap, assets: assetsMap } = getYMaps(ydoc);

    // --- META: only process when observer detected changes ---
    let updatedInvestigation = currentInvestigation;
    if (metaChanged) {
      const metaName = metaMap.get('name') as string | undefined;
      const metaDescription = metaMap.get('description') as string | undefined;
      const metaCreator = metaMap.get('creator') as string | undefined;
      const metaStartDate = metaMap.get('startDate') as string | null | undefined;
      const metaTags = metaMap.get('tags') as string[] | undefined;
      const metaProperties = metaMap.get('properties') as any[] | undefined;

      const hasMetaChanges =
        (metaName !== undefined && metaName !== currentInvestigation.name) ||
        (metaDescription !== undefined && metaDescription !== currentInvestigation.description) ||
        (metaCreator !== undefined && metaCreator !== (currentInvestigation.creator || '')) ||
        (metaStartDate !== undefined && metaStartDate !== (currentInvestigation.startDate?.toISOString() || null)) ||
        (metaTags !== undefined && JSON.stringify(metaTags) !== JSON.stringify(currentInvestigation.tags || [])) ||
        (metaProperties !== undefined && JSON.stringify(metaProperties) !== JSON.stringify(currentInvestigation.properties || []));

      if (hasMetaChanges) {
        const changes: Partial<Investigation> = {};
        if (metaName !== undefined) changes.name = metaName;
        if (metaDescription !== undefined) changes.description = metaDescription;
        if (metaCreator !== undefined) changes.creator = metaCreator;
        if (metaStartDate !== undefined) changes.startDate = metaStartDate ? new Date(metaStartDate) : null;
        if (metaTags !== undefined) changes.tags = metaTags;
        if (metaProperties !== undefined) changes.properties = metaProperties;

        updatedInvestigation = {
          ...currentInvestigation,
          ...changes,
        };
        investigationRepository.update(currentInvestigation.id, changes).catch(() => {});
      }
    }

    // --- ELEMENTS: incremental sync ---
    // structuralElChange (add/remove) → full rebuild
    // elIdsChanged (field updates) → re-parse only changed elements, merge into state
    // neither → keep existing state (no change)
    let elements = stateElements;
    let elementsDidChange = false;

    if (structuralElChange) {
      const elementsById = new Map<string, Element>();
      elementsMap.forEach((ymap) => {
        try {
          const element = yMapToElement(ymap as Y.Map<any>);
          if (element.id) elementsById.set(element.id, element);
        } catch {}
      });
      const newElements = Array.from(elementsById.values());
      // Defensive: don't wipe state if Y.Doc parsing failed
      if (newElements.length === 0 && stateElements.length > 0 && elementsMap.size > 0) {
        console.warn('[_syncFromYDoc] Y.Doc parsing failed on structural element change. Skipping elements.');
      } else {
        elements = newElements;
        elementsDidChange = true;
      }
    } else if (elIdsChanged.size > 0) {
      // Incremental: only re-parse changed elements, keep all others as-is
      const stateMap = new Map(stateElements.map(e => [e.id, e]));
      let changed = false;
      for (const id of elIdsChanged) {
        const ymap = elementsMap.get(id) as Y.Map<any> | undefined;
        if (ymap) {
          try {
            const updated = yMapToElement(ymap);
            if (updated.id) {
              stateMap.set(updated.id, updated);
              changed = true;
            }
          } catch {}
        }
      }
      if (changed) {
        elements = Array.from(stateMap.values());
        elementsDidChange = true;
      }
    }

    // --- LINKS: incremental sync ---
    let links = stateLinks;
    let linksDidChange = false;

    if (structuralLkChange) {
      const linksById = new Map<string, Link>();
      linksMap.forEach((ymap) => {
        try {
          const link = yMapToLink(ymap as Y.Map<any>);
          if (link.id) linksById.set(link.id, link);
        } catch {}
      });
      links = Array.from(linksById.values());
      linksDidChange = true;
    } else if (lkIdsChanged.size > 0) {
      const stateMap = new Map(stateLinks.map(l => [l.id, l]));
      let changed = false;
      for (const id of lkIdsChanged) {
        const ymap = linksMap.get(id) as Y.Map<any> | undefined;
        if (ymap) {
          try {
            const updated = yMapToLink(ymap);
            if (updated.id) {
              stateMap.set(updated.id, updated);
              changed = true;
            }
          } catch {}
        }
      }
      if (changed) {
        links = Array.from(stateMap.values());
        linksDidChange = true;
      }
    }

    // --- COMMENTS: only process when observer detected changes ---
    let comments = stateComments;
    let commentsDidChange = false;

    if (commentsNeedSync) {
      const commentsById = new Map<string, Comment>();
      commentsMap.forEach((ymap) => {
        try {
          const comment = yMapToComment(ymap as Y.Map<any>);
          if (comment.id) commentsById.set(comment.id, comment);
        } catch {}
      });
      const newComments = Array.from(commentsById.values());
      commentsDidChange = newComments.length !== stateComments.length ||
        newComments.some((c) => {
          const sc = stateComments.find(sc => sc.id === c.id);
          return !sc || sc.content !== c.content || sc.resolved !== c.resolved;
        });
      if (commentsDidChange) {
        comments = newComments;
      }
    }

    // Skip state update entirely if nothing changed
    if (!elementsDidChange && !linksDidChange && !commentsDidChange &&
        updatedInvestigation === currentInvestigation && !assetsNeedSync) {
      return;
    }

    // --- ASSETS: only process when observer detected changes ---
    if (assetsNeedSync) {
      const currentAssetIds = new Set(currentAssets.map(a => a.id));
      const newAssetsToSave: Array<{ assetData: any; base64Data: string }> = [];

      assetsMap.forEach((ymap) => {
        try {
          const map = ymap as Y.Map<any>;
          const assetId = map.get('id') as string;

          if (assetId && !currentAssetIds.has(assetId)) {
            const base64Data = map.get('data') as string;
            if (base64Data) {
              newAssetsToSave.push({
                assetData: {
                  id: assetId,
                  investigationId: map.get('investigationId') || currentInvestigation.id,
                  filename: map.get('filename') || 'unknown',
                  mimeType: map.get('mimeType') || 'application/octet-stream',
                  size: map.get('size') || 0,
                  hash: map.get('hash') || '',
                  thumbnailDataUrl: map.get('thumbnailDataUrl') || null,
                  extractedText: map.get('extractedText') || null,
                  createdAt: map.get('createdAt') ? new Date(map.get('createdAt')) : new Date(),
                },
                base64Data,
              });
            }
          }
        } catch {}
      });

      if (newAssetsToSave.length > 0) {
        const totalSize = newAssetsToSave.reduce((sum, item) => sum + (item.assetData.size || 0), 0);
        const syncStore = useSyncStore.getState();
        syncStore.startMediaSync(newAssetsToSave.length, totalSize);
        let completedCount = 0;
        let completedSize = 0;

        for (const { assetData, base64Data } of newAssetsToSave) {
          syncStore.updateMediaSyncProgress(completedCount, completedSize, assetData.filename);
          fileService.saveAssetFromBase64(assetData, base64Data)
            .then((savedAsset) => {
              if (savedAsset) {
                set((state) => ({
                  assets: [...state.assets.filter(a => a.id !== savedAsset.id), savedAsset],
                }));
                completedCount++;
                completedSize += assetData.size || 0;
                syncStore.updateMediaSyncProgress(completedCount, completedSize, null);
                if (completedCount === newAssetsToSave.length) {
                  setTimeout(() => syncStore.completeMediaSync(), 500);
                }
              }
            })
            .catch((error) => {
              console.warn(`[Sync] Failed to save asset ${assetData.filename}:`, error);
              completedCount++;
              syncStore.updateMediaSyncProgress(completedCount, completedSize, null);
              if (completedCount === newAssetsToSave.length) {
                setTimeout(() => syncStore.completeMediaSync(), 500);
              }
            });
        }
      }
    }

    // Update Zustand state
    set({
      currentInvestigation: updatedInvestigation,
      elements,
      links,
      comments,
    });

    // Persist to IndexedDB — only changed collections
    const investigationId = currentInvestigation.id;
    const dbPromises: Promise<any>[] = [];
    if (elementsDidChange) {
      if (structuralElChange) {
        // Full rebuild — upsert all
        dbPromises.push(elementRepository.bulkUpsert(elements.map(el => ({ ...el, investigationId }))));
      } else {
        // Incremental — only upsert changed elements
        const changedEls = elements.filter(el => elIdsChanged.has(el.id));
        if (changedEls.length > 0) {
          dbPromises.push(elementRepository.bulkUpsert(changedEls.map(el => ({ ...el, investigationId }))));
        }
      }
    }
    if (linksDidChange) {
      if (structuralLkChange) {
        dbPromises.push(linkRepository.bulkUpsert(links.map(lk => ({ ...lk, investigationId }))));
      } else {
        const changedLks = links.filter(lk => lkIdsChanged.has(lk.id));
        if (changedLks.length > 0) {
          dbPromises.push(linkRepository.bulkUpsert(changedLks.map(lk => ({ ...lk, investigationId }))));
        }
      }
    }
    if (dbPromises.length > 0) {
      Promise.all(dbPromises).catch(() => {});
    }
  },
}));
