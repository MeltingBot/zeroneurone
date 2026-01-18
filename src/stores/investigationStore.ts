import { create } from 'zustand';
import * as Y from 'yjs';
import type {
  Investigation,
  InvestigationId,
  Element,
  ElementId,
  Link,
  LinkId,
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

interface InvestigationState {
  // Current investigation
  currentInvestigation: Investigation | null;
  elements: Element[];
  links: Link[];
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

  // Actions - Assets
  addAsset: (elementId: ElementId, file: File) => Promise<Asset>;
  removeAsset: (elementId: ElementId, assetId: string) => Promise<void>;

  // Actions - Settings (for reusable tags/properties)
  addExistingTag: (tag: string) => Promise<void>;
  addSuggestedProperty: (propertyDef: PropertyDefinition) => Promise<void>;
  associatePropertyWithTags: (propertyDef: PropertyDefinition, tags: string[]) => Promise<void>;

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
  const { meta: metaMap, elements: elementsMap, links: linksMap, assets: assetsMap } = getYMaps(ydoc);

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

    // Also persist in Dexie for backwards compatibility
    await elementRepository.create(
      currentInvestigation.id,
      label,
      position,
      options
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
          // Position is stored as plain object, not Y.Map
          ymap.set('position', { x: position.x, y: position.y });
          // Update timestamp - _meta is also stored as plain object
          const currentMeta = ymap.get('_meta') || {};
          ymap.set('_meta', { ...currentMeta, updatedAt: new Date().toISOString() });
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

    // Also persist in Dexie for backwards compatibility
    await linkRepository.create(
      currentInvestigation.id,
      fromId,
      toId,
      options
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
  // ASSETS - Via OPFS (unchanged)
  // ============================================================================

  addAsset: async (elementId: ElementId, file: File) => {
    const { currentInvestigation } = get();
    if (!currentInvestigation) {
      throw new Error('No investigation loaded');
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
  // INTERNAL: SYNC FROM Y.DOC
  // ============================================================================

  _syncFromYDoc: () => {
    const ydoc = syncService.getYDoc();
    const { currentInvestigation, assets: currentAssets } = get();
    if (!ydoc || !currentInvestigation) {
      return;
    }

    const { meta: metaMap, elements: elementsMap, links: linksMap, assets: assetsMap } = getYMaps(ydoc);

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

    const elements = Array.from(elementsById.values());
    const links = Array.from(linksById.values());

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

    // Save new assets to OPFS in background
    if (newAssetsToSave.length > 0) {
      Promise.all(
        newAssetsToSave.map(({ assetData, base64Data }) =>
          fileService.saveAssetFromBase64(assetData, base64Data)
        )
      ).then((savedAssets) => {
        // Update state with newly saved assets
        const validAssets = savedAssets.filter((a): a is Asset => a !== null);
        if (validAssets.length > 0) {
          set((state) => ({
            assets: [...state.assets, ...validAssets],
          }));
        }
      }).catch((error) => {
        console.warn('Failed to save assets from peers:', error);
      });
    }

    set({
      currentInvestigation: updatedInvestigation,
      elements,
      links,
    });

    // Also persist to IndexedDB so stats work on home page
    // Use bulkPut to upsert all elements/links
    const investigationId = currentInvestigation.id;
    Promise.all([
      elementRepository.bulkUpsert(elements.map(el => ({ ...el, investigationId }))),
      linkRepository.bulkUpsert(links.map(lk => ({ ...lk, investigationId }))),
    ]).catch(() => {
      // Silently ignore IndexedDB errors during sync
    });
  },
}));
