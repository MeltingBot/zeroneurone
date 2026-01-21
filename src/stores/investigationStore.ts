import { create } from 'zustand';
import * as Y from 'yjs';
import type {
  Investigation,
  InvestigationId,
  Element,
  ElementId,
  Link,
  LinkId,
  Comment,
  CommentId,
  CommentTargetType,
  Asset,
  Position,
  PropertyDefinition,
} from '../types';
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
  updateElement: (id: ElementId, changes: Partial<Element>) => Promise<void>;
  deleteElement: (id: ElementId) => Promise<void>;
  deleteElements: (ids: ElementId[]) => Promise<void>;
  updateElementPosition: (id: ElementId, position: Position) => Promise<void>;
  updateElementPositions: (updates: { id: ElementId; position: Position }[]) => Promise<void>;

  // Actions - Links
  createLink: (fromId: ElementId, toId: ElementId, options?: Partial<Link>) => Promise<Link>;
  updateLink: (id: LinkId, changes: Partial<Link>) => Promise<void>;
  deleteLink: (id: LinkId) => Promise<void>;
  deleteLinks: (ids: LinkId[]) => Promise<void>;

  // Actions - Bulk updates
  updateElements: (ids: ElementId[], changes: Partial<Element>) => Promise<void>;
  updateLinks: (ids: LinkId[], changes: Partial<Link>) => Promise<void>;

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

  // Internal: sync Y.Doc state to Zustand
  _syncFromYDoc: () => void;
}

// ============================================================================
// Y.DOC OBSERVER SETUP
// ============================================================================

let ydocObserverCleanup: (() => void) | null = null;

function setupYDocObserver(
  ydoc: Y.Doc,
  syncToZustand: () => void
): () => void {
  const { meta: metaMap, elements: elementsMap, links: linksMap, comments: commentsMap, assets: assetsMap } = getYMaps(ydoc);

  // Throttle the sync to avoid excessive re-renders during rapid changes
  let syncTimeout: ReturnType<typeof setTimeout> | null = null;
  let lastSyncTime = 0;
  const THROTTLE_MS = 50; // Minimum time between syncs

  const throttledSync = () => {
    const now = Date.now();
    const timeSinceLastSync = now - lastSyncTime;

    if (syncTimeout) {
      clearTimeout(syncTimeout);
    }

    if (timeSinceLastSync >= THROTTLE_MS) {
      // Sync immediately if enough time has passed
      lastSyncTime = now;
      syncToZustand();
    } else {
      // Schedule sync for later
      syncTimeout = setTimeout(() => {
        lastSyncTime = Date.now();
        syncToZustand();
        syncTimeout = null;
      }, THROTTLE_MS - timeSinceLastSync);
    }
  };

  // Observe meta changes (investigation name, description)
  const metaObserver = () => {
    throttledSync();
  };
  metaMap.observe(metaObserver);

  // Observe elements changes
  const elementsObserver = () => {
    throttledSync();
  };
  elementsMap.observeDeep(elementsObserver);

  // Observe links changes
  const linksObserver = () => {
    throttledSync();
  };
  linksMap.observeDeep(linksObserver);

  // Observe comments changes
  const commentsObserver = () => {
    throttledSync();
  };
  commentsMap.observeDeep(commentsObserver);

  // Observe assets changes
  const assetsObserver = () => {
    throttledSync();
  };
  assetsMap.observeDeep(assetsObserver);

  // Return cleanup function
  return () => {
    if (syncTimeout) {
      clearTimeout(syncTimeout);
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
    set({ isLoading: true, error: null });
    try {
      // Load investigation metadata from Dexie
      let [investigation, assets] = await Promise.all([
        investigationRepository.getById(id),
        fileService.getAssetsByInvestigation(id),
      ]);

      if (!investigation) {
        throw new Error('Investigation not found');
      }

      // Check if Y.Doc is already open for this investigation (e.g., from JoinPage)
      let ydoc = syncService.getYDoc();
      const currentInvestigationId = syncService.getInvestigationId();

      if (!ydoc || currentInvestigationId !== id) {
        // Open Y.Doc in local mode (creates or loads from IndexedDB)
        ydoc = await syncService.openLocal(id);
      }

      // Check if Y.Doc has existing data
      const { meta: metaMap, elements: elementsMap, links: linksMap } = getYMaps(ydoc);

      // Check if we have meta from Y.Doc (from a shared session)
      const metaName = metaMap.get('name') as string | undefined;
      const metaDescription = metaMap.get('description') as string | undefined;

      // If Y.Doc has meta but local investigation has default values, update local
      if (metaName && investigation.description?.startsWith('Session partagée rejointe')) {
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

      // Always update meta map with investigation metadata (so peers can see it)
      // Only update if we're the source of truth (not a joiner with default values)
      if (!investigation.description?.startsWith('Session partagée rejointe')) {
        ydoc.transact(() => {
          metaMap.set('name', investigation.name);
          metaMap.set('description', investigation.description || '');
        });

        // Also sync existing local assets to Y.Doc (for sharing with peers)
        const { assets: assetsMap } = getYMaps(ydoc);
        for (const asset of assets) {
          if (!assetsMap.has(asset.id)) {
            try {
              // Load file from OPFS and convert to base64
              const file = await fileService.getAssetFile(asset);
              const arrayBuffer = await file.arrayBuffer();
              const base64 = btoa(
                new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
              );

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
            } catch (error) {
              console.warn('Failed to sync asset to Y.Doc:', asset.id, error);
            }
          }
        }
      } else {
        // Joiner: sync assets from Y.Doc to local storage
        const { assets: assetsMap } = getYMaps(ydoc);
        const assetsFromYDoc: Asset[] = [];

        // Collect assets to process
        const assetEntries: Y.Map<any>[] = [];
        assetsMap.forEach((ymap) => {
          assetEntries.push(ymap as Y.Map<any>);
        });

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
        }

        // Add synced assets to local assets list
        assets = [...assets, ...assetsFromYDoc];
      }

      // Setup Y.Doc observer to sync to Zustand
      if (ydocObserverCleanup) {
        ydocObserverCleanup();
      }
      ydocObserverCleanup = setupYDocObserver(ydoc, () => get()._syncFromYDoc());

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

      set({
        currentInvestigation: investigation,
        elements: Array.from(elementsById.values()),
        links: Array.from(linksById.values()),
        assets,
        isLoading: false,
      });

      // If in shared mode, schedule additional syncs to catch late-arriving data
      // This handles the case where Y.Doc updates arrive after the initial load
      // Use longer delays for slow networks (Docker/Cloudflare can add latency)
      const syncState = syncService.getState();
      if (syncState.mode === 'shared' && syncState.connected) {
        // Re-sync after delays to catch late data (links often arrive after elements)
        setTimeout(() => get()._syncFromYDoc(), 300);
        setTimeout(() => get()._syncFromYDoc(), 800);
        setTimeout(() => get()._syncFromYDoc(), 1500);
        setTimeout(() => get()._syncFromYDoc(), 3000);
      }
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
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
    await investigationRepository.update(id, changes);
    set((state) => ({
      investigations: state.investigations.map((inv) =>
        inv.id === id ? { ...inv, ...changes, updatedAt: new Date() } : inv
      ),
      currentInvestigation:
        state.currentInvestigation?.id === id
          ? { ...state.currentInvestigation, ...changes, updatedAt: new Date() }
          : state.currentInvestigation,
    }));
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

  updateElement: async (id: ElementId, changes: Partial<Element>) => {
    const ydoc = syncService.getYDoc();
    if (!ydoc) {
      throw new Error('Y.Doc not available');
    }

    const { elements: elementsMap } = getYMaps(ydoc);
    const ymap = elementsMap.get(id) as Y.Map<any> | undefined;

    if (!ymap) {
      throw new Error('Element not found');
    }

    // Update Y.Doc
    updateElementYMap(ymap, changes, ydoc);

    // Also update Dexie for backwards compatibility
    await elementRepository.update(id, changes).catch(() => {
      // Ignore Dexie errors - Y.Doc is source of truth
    });
  },

  deleteElement: async (id: ElementId) => {
    const ydoc = syncService.getYDoc();
    if (!ydoc) {
      throw new Error('Y.Doc not available');
    }

    const { elements: elementsMap, links: linksMap } = getYMaps(ydoc);

    // Find and delete connected links
    const linksToDelete: string[] = [];
    linksMap.forEach((ymap, linkId) => {
      const map = ymap as Y.Map<any>;
      if (map.get('fromId') === id || map.get('toId') === id) {
        linksToDelete.push(linkId);
      }
    });

    ydoc.transact(() => {
      // Delete connected links
      linksToDelete.forEach(linkId => {
        linksMap.delete(linkId);
      });
      // Delete element
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

    // Find and delete connected links
    const linksToDelete: string[] = [];
    linksMap.forEach((ymap, linkId) => {
      const map = ymap as Y.Map<any>;
      if (ids.includes(map.get('fromId')) || ids.includes(map.get('toId'))) {
        linksToDelete.push(linkId);
      }
    });

    ydoc.transact(() => {
      // Delete connected links
      linksToDelete.forEach(linkId => {
        linksMap.delete(linkId);
      });
      // Delete elements
      ids.forEach(id => {
        elementsMap.delete(id);
      });
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

  updateLink: async (id: LinkId, changes: Partial<Link>) => {
    const ydoc = syncService.getYDoc();
    if (!ydoc) {
      throw new Error('Y.Doc not available');
    }

    const { links: linksMap } = getYMaps(ydoc);
    const ymap = linksMap.get(id) as Y.Map<any> | undefined;

    if (!ymap) {
      throw new Error('Link not found');
    }

    // Update Y.Doc
    updateLinkYMap(ymap, changes, ydoc);

    // Also update Dexie
    await linkRepository.update(id, changes).catch(() => {});
  },

  deleteLink: async (id: LinkId) => {
    const ydoc = syncService.getYDoc();
    if (!ydoc) {
      throw new Error('Y.Doc not available');
    }

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

    const { links: linksMap } = getYMaps(ydoc);
    ydoc.transact(() => {
      ids.forEach(id => {
        linksMap.delete(id);
      });
    });

    // Also delete from Dexie
    await linkRepository.deleteMany(ids).catch(() => {});
  },

  // ============================================================================
  // BULK UPDATES
  // ============================================================================

  updateElements: async (ids: ElementId[], changes: Partial<Element>) => {
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
      ids.map(id => elementRepository.update(id, changes).catch(() => {}))
    );
  },

  updateLinks: async (ids: LinkId[], changes: Partial<Link>) => {
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
      ids.map(id => linkRepository.update(id, changes).catch(() => {}))
    );
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

    // Update element in Y.Doc
    const ydoc = syncService.getYDoc();
    if (ydoc) {
      const { elements: elementsMap, assets: assetsMap } = getYMaps(ydoc);
      const ymap = elementsMap.get(elementId) as Y.Map<any> | undefined;
      if (ymap) {
        // assetIds is stored as plain array, not Y.Array
        const currentAssetIds = ymap.get('assetIds') || [];
        const assetIdsArray = Array.isArray(currentAssetIds) ? currentAssetIds : [];
        if (!assetIdsArray.includes(asset.id)) {
          ymap.set('assetIds', [...assetIdsArray, asset.id]);
        }
      }

      // Store asset data in Y.Doc for sync with peers
      // Convert file to base64 for transmission
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

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
      assetYMap.set('data', base64); // Binary data as base64
      assetsMap.set(asset.id, assetYMap);
    }

    // Also update Dexie
    await elementRepository.addAsset(elementId, asset.id).catch(() => {});

    set((state) => ({
      assets: state.assets.some((a) => a.id === asset.id)
        ? state.assets.map((a) => (a.id === asset.id ? asset : a))
        : [...state.assets, asset],
    }));

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

  // ============================================================================
  // INTERNAL: SYNC FROM Y.DOC
  // ============================================================================

  _syncFromYDoc: () => {
    const ydoc = syncService.getYDoc();
    const { currentInvestigation, assets: currentAssets, elements: currentElements } = get();
    if (!ydoc || !currentInvestigation) {
      return;
    }

    const { meta: metaMap, elements: elementsMap, links: linksMap, comments: commentsMap, assets: assetsMap } = getYMaps(ydoc);

    // Sync investigation metadata from Y.Doc
    const metaName = metaMap.get('name') as string | undefined;
    const metaDescription = metaMap.get('description') as string | undefined;

    // Update local investigation if meta has changed
    let updatedInvestigation = currentInvestigation;
    if (metaName && (metaName !== currentInvestigation.name || metaDescription !== currentInvestigation.description)) {
      updatedInvestigation = {
        ...currentInvestigation,
        name: metaName,
        description: metaDescription || '',
      };
      // Persist to IndexedDB
      investigationRepository.update(currentInvestigation.id, {
        name: metaName,
        description: metaDescription || '',
      }).catch(() => {});
    }

    // Use Map to deduplicate by ID (defensive against any race conditions)
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

    const commentsById = new Map<string, Comment>();
    commentsMap.forEach((ymap) => {
      try {
        const comment = yMapToComment(ymap as Y.Map<any>);
        if (comment.id) {
          commentsById.set(comment.id, comment);
        }
      } catch {
        // Skip invalid comments
      }
    });

    const elements = Array.from(elementsById.values());
    const links = Array.from(linksById.values());
    const comments = Array.from(commentsById.values());

    // DEFENSIVE: Don't wipe state if Y.Doc appears empty due to sync issues
    // But DO allow sync if elementsMap is genuinely empty (user deleted all elements)
    const stateElements = get().elements;
    if (elements.length === 0 && stateElements.length > 0 && elementsMap.size > 0) {
      // elementsMap has entries but we couldn't parse them - likely a sync issue
      console.warn('[_syncFromYDoc] Y.Doc parsing failed. elementsMap.size:', elementsMap.size, 'but parsed 0 elements. Skipping sync.');
      return;
    }

    // Sync assets from Y.Doc
    // Check for new assets from peers and save them locally
    const currentAssetIds = new Set(currentAssets.map(a => a.id));
    const newAssetsToSave: Array<{ assetData: any; base64Data: string }> = [];

    assetsMap.forEach((ymap) => {
      try {
        const map = ymap as Y.Map<any>;
        const assetId = map.get('id') as string;

        // Only process assets we don't have locally
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
      } catch {
        // Skip invalid assets
      }
    });

    // Save new assets to OPFS in background - update state progressively with progress tracking
    if (newAssetsToSave.length > 0) {
      console.log(`[Sync] Saving ${newAssetsToSave.length} new asset(s) from peers...`);

      // Calculate total size for progress tracking
      const totalSize = newAssetsToSave.reduce((sum, item) => sum + (item.assetData.size || 0), 0);

      // Start progress tracking
      const syncStore = useSyncStore.getState();
      syncStore.startMediaSync(newAssetsToSave.length, totalSize);

      let completedCount = 0;
      let completedSize = 0;

      // Save each asset and update state + progress immediately when done
      for (const { assetData, base64Data } of newAssetsToSave) {
        // Update current asset being synced
        syncStore.updateMediaSyncProgress(completedCount, completedSize, assetData.filename);

        fileService.saveAssetFromBase64(assetData, base64Data)
          .then((savedAsset) => {
            if (savedAsset) {
              console.log(`[Sync] Asset saved: ${savedAsset.filename}`);
              // Update state immediately with this asset
              set((state) => ({
                assets: [...state.assets.filter(a => a.id !== savedAsset.id), savedAsset],
              }));

              // Update progress
              completedCount++;
              completedSize += assetData.size || 0;
              syncStore.updateMediaSyncProgress(completedCount, completedSize, null);

              // If all done, clear progress
              if (completedCount === newAssetsToSave.length) {
                setTimeout(() => syncStore.completeMediaSync(), 500);
              }
            }
          })
          .catch((error) => {
            console.warn(`[Sync] Failed to save asset ${assetData.filename}:`, error);
            // Still count as completed for progress (failed)
            completedCount++;
            syncStore.updateMediaSyncProgress(completedCount, completedSize, null);

            if (completedCount === newAssetsToSave.length) {
              setTimeout(() => syncStore.completeMediaSync(), 500);
            }
          });
      }
    }

    set({
      currentInvestigation: updatedInvestigation,
      elements,
      links,
      comments,
    });

    // Also persist to IndexedDB so stats work on home page
    // Only upsert - deletions are handled explicitly in deleteElements/deleteLinks
    const investigationId = currentInvestigation.id;

    Promise.all([
      elementRepository.bulkUpsert(elements.map(el => ({ ...el, investigationId }))),
      linkRepository.bulkUpsert(links.map(lk => ({ ...lk, investigationId }))),
    ]).catch(() => {
      // Silently ignore IndexedDB errors during sync
    });
  },
}));
