import { create } from 'zustand';
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
}

export const useInvestigationStore = create<InvestigationState>((set, get) => ({
  currentInvestigation: null,
  elements: [],
  links: [],
  assets: [],
  investigations: [],
  isLoading: false,
  error: null,

  // Investigations
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
      const [investigation, elements, links, assets] = await Promise.all([
        investigationRepository.getById(id),
        elementRepository.getByInvestigation(id),
        linkRepository.getByInvestigation(id),
        fileService.getAssetsByInvestigation(id),
      ]);

      if (!investigation) {
        throw new Error('Investigation not found');
      }

      set({
        currentInvestigation: investigation,
        elements,
        links,
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
    await investigationRepository.delete(id);
    set((state) => ({
      investigations: state.investigations.filter((inv) => inv.id !== id),
      currentInvestigation:
        state.currentInvestigation?.id === id ? null : state.currentInvestigation,
    }));
  },

  unloadInvestigation: () => {
    set({
      currentInvestigation: null,
      elements: [],
      links: [],
      assets: [],
    });
  },

  // Elements
  createElement: async (label: string, position: Position, options?: Partial<Element>) => {
    const { currentInvestigation } = get();
    if (!currentInvestigation) {
      throw new Error('No investigation loaded');
    }

    const element = await elementRepository.create(
      currentInvestigation.id,
      label,
      position,
      options
    );

    set((state) => ({
      elements: [...state.elements, element],
    }));

    return element;
  },

  updateElement: async (id: ElementId, changes: Partial<Element>) => {
    await elementRepository.update(id, changes);
    set((state) => ({
      elements: state.elements.map((el) =>
        el.id === id ? { ...el, ...changes, updatedAt: new Date() } : el
      ),
    }));
  },

  deleteElement: async (id: ElementId) => {
    await elementRepository.delete(id);
    set((state) => ({
      elements: state.elements.filter((el) => el.id !== id),
      links: state.links.filter((link) => link.fromId !== id && link.toId !== id),
    }));
  },

  deleteElements: async (ids: ElementId[]) => {
    await elementRepository.deleteMany(ids);
    set((state) => ({
      elements: state.elements.filter((el) => !ids.includes(el.id)),
      links: state.links.filter(
        (link) => !ids.includes(link.fromId) && !ids.includes(link.toId)
      ),
    }));
  },

  updateElementPosition: async (id: ElementId, position: Position) => {
    await elementRepository.updatePosition(id, position);
    set((state) => ({
      elements: state.elements.map((el) =>
        el.id === id ? { ...el, position, updatedAt: new Date() } : el
      ),
    }));
  },

  updateElementPositions: async (updates: { id: ElementId; position: Position }[]) => {
    await elementRepository.updatePositions(updates);
    set((state) => ({
      elements: state.elements.map((el) => {
        const update = updates.find((u) => u.id === el.id);
        return update ? { ...el, position: update.position, updatedAt: new Date() } : el;
      }),
    }));
  },

  // Links
  createLink: async (fromId: ElementId, toId: ElementId, options?: Partial<Link>) => {
    const { currentInvestigation } = get();
    if (!currentInvestigation) {
      throw new Error('No investigation loaded');
    }

    const link = await linkRepository.create(
      currentInvestigation.id,
      fromId,
      toId,
      options
    );

    set((state) => ({
      links: [...state.links, link],
    }));

    return link;
  },

  updateLink: async (id: LinkId, changes: Partial<Link>) => {
    await linkRepository.update(id, changes);
    set((state) => ({
      links: state.links.map((link) =>
        link.id === id ? { ...link, ...changes, updatedAt: new Date() } : link
      ),
    }));
  },

  deleteLink: async (id: LinkId) => {
    await linkRepository.delete(id);
    set((state) => ({
      links: state.links.filter((link) => link.id !== id),
    }));
  },

  deleteLinks: async (ids: LinkId[]) => {
    await linkRepository.deleteMany(ids);
    set((state) => ({
      links: state.links.filter((link) => !ids.includes(link.id)),
    }));
  },

  // Assets
  addAsset: async (elementId: ElementId, file: File) => {
    const { currentInvestigation } = get();
    if (!currentInvestigation) {
      throw new Error('No investigation loaded');
    }

    const asset = await fileService.saveAsset(currentInvestigation.id, file);
    await elementRepository.addAsset(elementId, asset.id);

    set((state) => ({
      // Update existing asset or add new one
      assets: state.assets.some((a) => a.id === asset.id)
        ? state.assets.map((a) => (a.id === asset.id ? asset : a))
        : [...state.assets, asset],
      elements: state.elements.map((el) =>
        el.id === elementId && !el.assetIds.includes(asset.id)
          ? { ...el, assetIds: [...el.assetIds, asset.id] }
          : el
      ),
    }));

    return asset;
  },

  removeAsset: async (elementId: ElementId, assetId: string) => {
    await elementRepository.removeAsset(elementId, assetId);

    set((state) => ({
      elements: state.elements.map((el) =>
        el.id === elementId
          ? { ...el, assetIds: el.assetIds.filter((id) => id !== assetId) }
          : el
      ),
    }));
  },

  // Settings - Add existing tag for reuse
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

  // Settings - Add suggested property for reuse
  addSuggestedProperty: async (propertyDef: PropertyDefinition) => {
    const { currentInvestigation } = get();
    if (!currentInvestigation) return;

    const suggestedProperties = currentInvestigation.settings.suggestedProperties;
    // Check if property with same key already exists
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

  // Settings - Associate a property with tags (for tag-based property suggestions)
  associatePropertyWithTags: async (propertyDef: PropertyDefinition, tags: string[]) => {
    const { currentInvestigation } = get();
    if (!currentInvestigation || tags.length === 0) return;

    await investigationRepository.associatePropertyWithTags(
      currentInvestigation.id,
      propertyDef,
      tags
    );

    // Update local state
    set((state) => {
      if (!state.currentInvestigation) return state;

      const associations = { ...state.currentInvestigation.settings.tagPropertyAssociations };

      for (const tag of tags) {
        if (!associations[tag]) {
          associations[tag] = [];
        }
        // Check if property with same key already exists
        const existingIndex = associations[tag].findIndex(p => p.key === propertyDef.key);
        if (existingIndex === -1) {
          // Add new property
          associations[tag] = [...associations[tag], propertyDef];
        } else if (associations[tag][existingIndex].type !== propertyDef.type) {
          // Update type if different
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
}));
