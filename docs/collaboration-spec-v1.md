# zeroneurone — Spécification Collaboration

## Destination : Claude Code

Ce document spécifie l'implémentation du mode collaboratif. À implémenter après la V1 fonctionnelle.

---

## Vue d'ensemble

### Objectif

Permettre à plusieurs utilisateurs de travailler sur la même enquête en temps réel, sans configuration complexe.

### Principes

1. **Zéro friction** — Un clic pour partager, un clic pour rejoindre
2. **Serveur public par défaut** — Ça marche direct
3. **Auto-hébergeable** — Code serveur open source
4. **Local-first** — Fonctionne offline, sync au retour
5. **Chiffrement E2E optionnel** — Pour les enquêtes sensibles

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    zeroneurone (React)                    │  │
│  ├───────────────────────────────────────────────────────────┤  │
│  │                    Stores (Zustand)                       │  │
│  │         Vue réactive sur le Y.Doc                         │  │
│  ├───────────────────────────────────────────────────────────┤  │
│  │                        Yjs                                │  │
│  │              Y.Doc = source de vérité                     │  │
│  ├─────────────────┬─────────────────┬───────────────────────┤  │
│  │  IndexedDB      │   WebSocket     │   (WebRTC futur)      │  │
│  │  Provider       │   Provider      │                       │  │
│  │  (persistance)  │   (sync)        │                       │  │
│  └─────────────────┴────────┬────────┴───────────────────────┘  │
└─────────────────────────────┼───────────────────────────────────┘
                              │
                              │ WebSocket
                              │
┌─────────────────────────────┼───────────────────────────────────┐
│                         SERVEUR                                 │
│  ┌──────────────────────────┴────────────────────────────────┐  │
│  │                  zeroneurone-server                       │  │
│  │                                                           │  │
│  │  • Auth (JWT)                                             │  │
│  │  • Relay WebSocket (y-websocket)                          │  │
│  │  • Persistance Y.Doc                                      │  │
│  │  • Stockage assets                                        │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Partie 1 — Client

### 1.1 Dépendances à ajouter

```bash
npm install yjs y-indexeddb y-websocket
```

### 1.2 Structure Y.Doc

Chaque enquête est un `Y.Doc`. Structure :

```typescript
// types/yjs.ts

import * as Y from 'yjs';

interface YInvestigation {
  meta: Y.Map<string>;           // Métadonnées enquête
  elements: Y.Map<Y.Map<any>>;   // Éléments
  links: Y.Map<Y.Map<any>>;      // Liens
  views: Y.Map<Y.Map<any>>;      // Vues sauvegardées
  assets: Y.Map<Y.Map<any>>;     // Métadonnées assets
}

// Helpers pour accéder aux maps
function getInvestigationMaps(ydoc: Y.Doc): YInvestigation {
  return {
    meta: ydoc.getMap('meta'),
    elements: ydoc.getMap('elements'),
    links: ydoc.getMap('links'),
    views: ydoc.getMap('views'),
    assets: ydoc.getMap('assets'),
  };
}
```

### 1.3 Mapping Element → Y.Map

```typescript
// services/yjs/elementMapper.ts

import * as Y from 'yjs';

function elementToYMap(element: Element, ymap?: Y.Map<any>): Y.Map<any> {
  const map = ymap || new Y.Map();
  
  map.set('id', element.id);
  map.set('label', element.label);
  
  // Notes = Y.Text pour merge collaboratif caractère par caractère
  if (!map.has('notes')) {
    map.set('notes', new Y.Text());
  }
  (map.get('notes') as Y.Text).delete(0, (map.get('notes') as Y.Text).length);
  (map.get('notes') as Y.Text).insert(0, element.notes);
  
  // Tags = Y.Array
  if (!map.has('tags')) {
    map.set('tags', new Y.Array());
  }
  const tagsArray = map.get('tags') as Y.Array<string>;
  tagsArray.delete(0, tagsArray.length);
  tagsArray.push(element.tags);
  
  // Properties = Y.Array de Y.Map
  if (!map.has('properties')) {
    map.set('properties', new Y.Array());
  }
  const propsArray = map.get('properties') as Y.Array<Y.Map<any>>;
  propsArray.delete(0, propsArray.length);
  element.properties.forEach(prop => {
    const propMap = new Y.Map();
    propMap.set('key', prop.key);
    propMap.set('value', prop.value);
    propsArray.push([propMap]);
  });
  
  // Champs simples
  map.set('confidence', element.confidence);
  map.set('source', element.source);
  map.set('date', element.date?.toISOString() || null);
  map.set('dateRange', element.dateRange ? {
    start: element.dateRange.start?.toISOString() || null,
    end: element.dateRange.end?.toISOString() || null,
  } : null);
  
  // Position
  if (!map.has('position')) {
    map.set('position', new Y.Map());
  }
  const posMap = map.get('position') as Y.Map<number>;
  posMap.set('x', element.position.x);
  posMap.set('y', element.position.y);
  
  // Geo
  if (element.geo) {
    if (!map.has('geo')) {
      map.set('geo', new Y.Map());
    }
    const geoMap = map.get('geo') as Y.Map<number>;
    geoMap.set('lat', element.geo.lat);
    geoMap.set('lng', element.geo.lng);
  } else {
    map.set('geo', null);
  }
  
  // Visual
  if (!map.has('visual')) {
    map.set('visual', new Y.Map());
  }
  const visualMap = map.get('visual') as Y.Map<any>;
  visualMap.set('color', element.visual.color);
  visualMap.set('borderColor', element.visual.borderColor);
  visualMap.set('shape', element.visual.shape);
  visualMap.set('size', element.visual.size);
  visualMap.set('icon', element.visual.icon);
  visualMap.set('image', element.visual.image);
  
  // Assets
  if (!map.has('assetIds')) {
    map.set('assetIds', new Y.Array());
  }
  const assetsArray = map.get('assetIds') as Y.Array<string>;
  assetsArray.delete(0, assetsArray.length);
  assetsArray.push(element.assetIds);
  
  // Groupes
  map.set('parentGroupId', element.parentGroupId);
  map.set('isGroup', element.isGroup);
  if (!map.has('childIds')) {
    map.set('childIds', new Y.Array());
  }
  const childIdsArray = map.get('childIds') as Y.Array<string>;
  childIdsArray.delete(0, childIdsArray.length);
  childIdsArray.push(element.childIds);
  
  // Métadonnées
  if (!map.has('_meta')) {
    map.set('_meta', new Y.Map());
  }
  const metaMap = map.get('_meta') as Y.Map<string>;
  metaMap.set('createdAt', element.createdAt.toISOString());
  metaMap.set('updatedAt', new Date().toISOString());
  
  return map;
}

function yMapToElement(ymap: Y.Map<any>): Element {
  const notesText = ymap.get('notes') as Y.Text;
  const tagsArray = ymap.get('tags') as Y.Array<string>;
  const propsArray = ymap.get('properties') as Y.Array<Y.Map<any>>;
  const posMap = ymap.get('position') as Y.Map<number>;
  const geoMap = ymap.get('geo') as Y.Map<number> | null;
  const visualMap = ymap.get('visual') as Y.Map<any>;
  const assetIdsArray = ymap.get('assetIds') as Y.Array<string>;
  const childIdsArray = ymap.get('childIds') as Y.Array<string>;
  const metaMap = ymap.get('_meta') as Y.Map<string>;
  const dateRange = ymap.get('dateRange');
  
  return {
    id: ymap.get('id'),
    investigationId: '', // Géré par le contexte
    label: ymap.get('label'),
    notes: notesText?.toString() || '',
    tags: tagsArray?.toArray() || [],
    properties: propsArray?.toArray().map(pm => ({
      key: pm.get('key'),
      value: pm.get('value'),
    })) || [],
    confidence: ymap.get('confidence'),
    source: ymap.get('source') || '',
    date: ymap.get('date') ? new Date(ymap.get('date')) : null,
    dateRange: dateRange ? {
      start: dateRange.start ? new Date(dateRange.start) : null,
      end: dateRange.end ? new Date(dateRange.end) : null,
    } : null,
    position: {
      x: posMap?.get('x') || 0,
      y: posMap?.get('y') || 0,
    },
    geo: geoMap ? {
      lat: geoMap.get('lat'),
      lng: geoMap.get('lng'),
    } : null,
    visual: {
      color: visualMap?.get('color') || '#ffffff',
      borderColor: visualMap?.get('borderColor') || '#374151',
      shape: visualMap?.get('shape') || 'circle',
      size: visualMap?.get('size') || 'medium',
      icon: visualMap?.get('icon') || null,
      image: visualMap?.get('image') || null,
    },
    assetIds: assetIdsArray?.toArray() || [],
    parentGroupId: ymap.get('parentGroupId'),
    isGroup: ymap.get('isGroup') || false,
    childIds: childIdsArray?.toArray() || [],
    createdAt: metaMap?.get('createdAt') ? new Date(metaMap.get('createdAt')) : new Date(),
    updatedAt: metaMap?.get('updatedAt') ? new Date(metaMap.get('updatedAt')) : new Date(),
  };
}
```

### 1.4 Mapping Link → Y.Map

```typescript
// services/yjs/linkMapper.ts

function linkToYMap(link: Link, ymap?: Y.Map<any>): Y.Map<any> {
  const map = ymap || new Y.Map();
  
  map.set('id', link.id);
  map.set('fromId', link.fromId);
  map.set('toId', link.toId);
  map.set('label', link.label);
  
  // Notes = Y.Text
  if (!map.has('notes')) {
    map.set('notes', new Y.Text());
  }
  (map.get('notes') as Y.Text).delete(0, (map.get('notes') as Y.Text).length);
  (map.get('notes') as Y.Text).insert(0, link.notes);
  
  // Properties = Y.Array de Y.Map
  if (!map.has('properties')) {
    map.set('properties', new Y.Array());
  }
  const propsArray = map.get('properties') as Y.Array<Y.Map<any>>;
  propsArray.delete(0, propsArray.length);
  link.properties.forEach(prop => {
    const propMap = new Y.Map();
    propMap.set('key', prop.key);
    propMap.set('value', prop.value);
    propsArray.push([propMap]);
  });
  
  map.set('directed', link.directed);
  map.set('confidence', link.confidence);
  map.set('source', link.source);
  map.set('date', link.date?.toISOString() || null);
  map.set('dateRange', link.dateRange ? {
    start: link.dateRange.start?.toISOString() || null,
    end: link.dateRange.end?.toISOString() || null,
  } : null);
  
  // Visual
  if (!map.has('visual')) {
    map.set('visual', new Y.Map());
  }
  const visualMap = map.get('visual') as Y.Map<any>;
  visualMap.set('color', link.visual.color);
  visualMap.set('style', link.visual.style);
  visualMap.set('thickness', link.visual.thickness);
  
  // Métadonnées
  if (!map.has('_meta')) {
    map.set('_meta', new Y.Map());
  }
  const metaMap = map.get('_meta') as Y.Map<string>;
  metaMap.set('createdAt', link.createdAt.toISOString());
  metaMap.set('updatedAt', new Date().toISOString());
  
  return map;
}

function yMapToLink(ymap: Y.Map<any>): Link {
  // Similaire à yMapToElement
  // ...
}
```

### 1.5 Service de sync

```typescript
// services/syncService.ts

import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebsocketProvider } from 'y-websocket';

interface SyncState {
  mode: 'local' | 'shared';
  connected: boolean;
  syncing: boolean;
  error: string | null;
}

class SyncService {
  private ydoc: Y.Doc | null = null;
  private indexeddbProvider: IndexeddbPersistence | null = null;
  private websocketProvider: WebsocketProvider | null = null;
  private investigationId: string | null = null;
  
  private state: SyncState = {
    mode: 'local',
    connected: false,
    syncing: false,
    error: null,
  };
  
  private stateListeners: Set<(state: SyncState) => void> = new Set();
  
  // Serveur public par défaut
  private serverUrl = 'wss://sync.zeroneurone.io';
  
  setServerUrl(url: string) {
    this.serverUrl = url;
  }
  
  getYDoc(): Y.Doc | null {
    return this.ydoc;
  }
  
  getState(): SyncState {
    return this.state;
  }
  
  onStateChange(listener: (state: SyncState) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }
  
  private setState(changes: Partial<SyncState>) {
    this.state = { ...this.state, ...changes };
    this.stateListeners.forEach(l => l(this.state));
  }

  /**
   * Ouvre une enquête en mode local
   */
  async openLocal(investigationId: string): Promise<Y.Doc> {
    await this.close();
    
    this.investigationId = investigationId;
    this.ydoc = new Y.Doc();
    
    // Persistance locale
    this.indexeddbProvider = new IndexeddbPersistence(
      `zeroneurone-${investigationId}`,
      this.ydoc
    );
    
    await this.indexeddbProvider.whenSynced;
    
    this.setState({ mode: 'local', connected: false, syncing: false, error: null });
    
    return this.ydoc;
  }

  /**
   * Ouvre une enquête en mode partagé
   */
  async openShared(
    investigationId: string,
    roomId: string,
    token: string,
    secretKey?: string // Pour E2E encryption
  ): Promise<Y.Doc> {
    await this.close();
    
    this.investigationId = investigationId;
    this.ydoc = new Y.Doc();
    
    // Persistance locale (pour offline)
    this.indexeddbProvider = new IndexeddbPersistence(
      `zeroneurone-${investigationId}`,
      this.ydoc
    );
    
    // Sync WebSocket
    this.websocketProvider = new WebsocketProvider(
      this.serverUrl,
      roomId,
      this.ydoc,
      {
        params: { token },
      }
    );
    
    // Events
    this.websocketProvider.on('status', (event: { status: string }) => {
      this.setState({ connected: event.status === 'connected' });
    });
    
    this.websocketProvider.on('sync', (synced: boolean) => {
      this.setState({ syncing: !synced });
    });
    
    this.websocketProvider.on('connection-error', (error: Error) => {
      this.setState({ error: error.message });
    });
    
    await this.indexeddbProvider.whenSynced;
    
    this.setState({ mode: 'shared', connected: false, syncing: true, error: null });
    
    return this.ydoc;
  }

  /**
   * Convertit une enquête locale en partagée
   */
  async shareInvestigation(
    roomId: string,
    token: string
  ): Promise<void> {
    if (!this.ydoc || !this.investigationId) {
      throw new Error('No investigation open');
    }
    
    // Connecter le WebSocket
    this.websocketProvider = new WebsocketProvider(
      this.serverUrl,
      roomId,
      this.ydoc,
      {
        params: { token },
      }
    );
    
    // Events
    this.websocketProvider.on('status', (event: { status: string }) => {
      this.setState({ connected: event.status === 'connected' });
    });
    
    this.setState({ mode: 'shared' });
  }

  /**
   * Arrête le partage (redevient local)
   */
  async unshare(): Promise<void> {
    if (this.websocketProvider) {
      this.websocketProvider.destroy();
      this.websocketProvider = null;
    }
    this.setState({ mode: 'local', connected: false });
  }

  /**
   * Ferme l'enquête
   */
  async close(): Promise<void> {
    if (this.websocketProvider) {
      this.websocketProvider.destroy();
      this.websocketProvider = null;
    }
    if (this.indexeddbProvider) {
      await this.indexeddbProvider.destroy();
      this.indexeddbProvider = null;
    }
    if (this.ydoc) {
      this.ydoc.destroy();
      this.ydoc = null;
    }
    this.investigationId = null;
    this.setState({ mode: 'local', connected: false, syncing: false, error: null });
  }
}

export const syncService = new SyncService();
```

### 1.6 Store Investigation avec Yjs

```typescript
// stores/investigationStore.ts

import { create } from 'zustand';
import * as Y from 'yjs';
import { syncService } from '../services/syncService';

interface InvestigationState {
  // État
  investigationId: string | null;
  isLoading: boolean;
  error: string | null;
  
  // Données (dérivées du Y.Doc)
  elements: Map<ElementId, Element>;
  links: Map<LinkId, Link>;
  views: Map<ViewId, View>;
  assets: Map<AssetId, Asset>;
  
  // Sync state
  syncMode: 'local' | 'shared';
  connected: boolean;
  syncing: boolean;
  
  // Actions
  openInvestigation: (id: string, shared?: { roomId: string; token: string }) => Promise<void>;
  closeInvestigation: () => Promise<void>;
  
  // CRUD Elements
  createElement: (label: string, position: Position, options?: Partial<Element>) => Element;
  updateElement: (id: ElementId, changes: Partial<Element>) => void;
  deleteElement: (id: ElementId) => void;
  
  // CRUD Links
  createLink: (fromId: ElementId, toId: ElementId, options?: Partial<Link>) => Link;
  updateLink: (id: LinkId, changes: Partial<Link>) => void;
  deleteLink: (id: LinkId) => void;
  
  // Partage
  shareInvestigation: () => Promise<{ roomId: string; inviteUrl: string }>;
  unshareInvestigation: () => Promise<void>;
}

export const useInvestigationStore = create<InvestigationState>((set, get) => {
  // Observer pour mettre à jour le state depuis le Y.Doc
  let unsubscribe: (() => void) | null = null;
  
  function subscribeToYDoc(ydoc: Y.Doc) {
    const { elements, links, views, assets } = getInvestigationMaps(ydoc);
    
    const updateState = () => {
      set({
        elements: new Map(
          Array.from(elements.entries()).map(([id, ymap]) => [id, yMapToElement(ymap)])
        ),
        links: new Map(
          Array.from(links.entries()).map(([id, ymap]) => [id, yMapToLink(ymap)])
        ),
        // ... views, assets
      });
    };
    
    elements.observeDeep(updateState);
    links.observeDeep(updateState);
    views.observeDeep(updateState);
    assets.observeDeep(updateState);
    
    // Initial state
    updateState();
    
    // Unsubscribe
    return () => {
      elements.unobserveDeep(updateState);
      links.unobserveDeep(updateState);
      views.unobserveDeep(updateState);
      assets.unobserveDeep(updateState);
    };
  }
  
  // Sync state listener
  syncService.onStateChange((state) => {
    set({
      syncMode: state.mode,
      connected: state.connected,
      syncing: state.syncing,
    });
  });
  
  return {
    investigationId: null,
    isLoading: false,
    error: null,
    elements: new Map(),
    links: new Map(),
    views: new Map(),
    assets: new Map(),
    syncMode: 'local',
    connected: false,
    syncing: false,
    
    openInvestigation: async (id, shared) => {
      set({ isLoading: true, error: null });
      
      try {
        if (unsubscribe) {
          unsubscribe();
        }
        
        let ydoc: Y.Doc;
        
        if (shared) {
          ydoc = await syncService.openShared(id, shared.roomId, shared.token);
        } else {
          ydoc = await syncService.openLocal(id);
        }
        
        unsubscribe = subscribeToYDoc(ydoc);
        
        set({ investigationId: id, isLoading: false });
        
      } catch (error) {
        set({ error: (error as Error).message, isLoading: false });
      }
    },
    
    closeInvestigation: async () => {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
      await syncService.close();
      set({
        investigationId: null,
        elements: new Map(),
        links: new Map(),
        views: new Map(),
        assets: new Map(),
      });
    },
    
    createElement: (label, position, options = {}) => {
      const ydoc = syncService.getYDoc();
      if (!ydoc) throw new Error('No investigation open');
      
      const element: Element = {
        id: generateUUID(),
        investigationId: get().investigationId!,
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
        visual: { ...DEFAULT_ELEMENT_VISUAL },
        assetIds: [],
        parentGroupId: null,
        isGroup: false,
        childIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        ...options,
      };
      
      const elements = ydoc.getMap('elements');
      elements.set(element.id, elementToYMap(element));
      
      return element;
    },
    
    updateElement: (id, changes) => {
      const ydoc = syncService.getYDoc();
      if (!ydoc) return;
      
      const elements = ydoc.getMap('elements');
      const ymap = elements.get(id) as Y.Map<any>;
      if (!ymap) return;
      
      // Appliquer les changements
      ydoc.transact(() => {
        if (changes.label !== undefined) ymap.set('label', changes.label);
        if (changes.notes !== undefined) {
          const notesText = ymap.get('notes') as Y.Text;
          notesText.delete(0, notesText.length);
          notesText.insert(0, changes.notes);
        }
        if (changes.tags !== undefined) {
          const tagsArray = ymap.get('tags') as Y.Array<string>;
          tagsArray.delete(0, tagsArray.length);
          tagsArray.push(changes.tags);
        }
        if (changes.position !== undefined) {
          const posMap = ymap.get('position') as Y.Map<number>;
          posMap.set('x', changes.position.x);
          posMap.set('y', changes.position.y);
        }
        if (changes.visual !== undefined) {
          const visualMap = ymap.get('visual') as Y.Map<any>;
          Object.entries(changes.visual).forEach(([key, value]) => {
            visualMap.set(key, value);
          });
        }
        // ... autres champs
        
        const metaMap = ymap.get('_meta') as Y.Map<string>;
        metaMap.set('updatedAt', new Date().toISOString());
      });
    },
    
    deleteElement: (id) => {
      const ydoc = syncService.getYDoc();
      if (!ydoc) return;
      
      ydoc.transact(() => {
        // Supprimer les liens associés
        const links = ydoc.getMap('links');
        links.forEach((ymap, linkId) => {
          if (ymap.get('fromId') === id || ymap.get('toId') === id) {
            links.delete(linkId);
          }
        });
        
        // Supprimer l'élément
        const elements = ydoc.getMap('elements');
        elements.delete(id);
      });
    },
    
    createLink: (fromId, toId, options = {}) => {
      const ydoc = syncService.getYDoc();
      if (!ydoc) throw new Error('No investigation open');
      
      const link: Link = {
        id: generateUUID(),
        investigationId: get().investigationId!,
        fromId,
        toId,
        label: '',
        notes: '',
        properties: [],
        directed: false,
        confidence: null,
        source: '',
        date: null,
        dateRange: null,
        visual: { ...DEFAULT_LINK_VISUAL },
        createdAt: new Date(),
        updatedAt: new Date(),
        ...options,
      };
      
      const links = ydoc.getMap('links');
      links.set(link.id, linkToYMap(link));
      
      return link;
    },
    
    updateLink: (id, changes) => {
      // Similaire à updateElement
    },
    
    deleteLink: (id) => {
      const ydoc = syncService.getYDoc();
      if (!ydoc) return;
      
      const links = ydoc.getMap('links');
      links.delete(id);
    },
    
    shareInvestigation: async () => {
      const { investigationId } = get();
      if (!investigationId) throw new Error('No investigation open');
      
      // Appeler l'API pour créer la room
      const response = await fetch(`${API_URL}/investigations/${investigationId}/share`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) throw new Error('Failed to share');
      
      const { roomId, token } = await response.json();
      
      // Connecter le WebSocket
      await syncService.shareInvestigation(roomId, token);
      
      // Générer l'URL d'invitation
      const inviteUrl = `${window.location.origin}/join/${roomId}`;
      
      return { roomId, inviteUrl };
    },
    
    unshareInvestigation: async () => {
      await syncService.unshare();
    },
  };
});
```

### 1.7 Awareness (présence)

```typescript
// services/awarenessService.ts

import { Awareness } from 'y-protocols/awareness';
import { WebsocketProvider } from 'y-websocket';

interface UserPresence {
  id: string;
  name: string;
  color: string;
  cursor: { x: number; y: number } | null;
  selection: string[];  // IDs des éléments sélectionnés
}

class AwarenessService {
  private awareness: Awareness | null = null;
  private localUser: Omit<UserPresence, 'cursor' | 'selection'> | null = null;
  
  initialize(provider: WebsocketProvider, user: { id: string; name: string; color: string }) {
    this.awareness = provider.awareness;
    this.localUser = user;
    
    // Set initial state
    this.awareness.setLocalState({
      user,
      cursor: null,
      selection: [],
    });
  }
  
  updateCursor(x: number, y: number) {
    if (!this.awareness || !this.localUser) return;
    
    const state = this.awareness.getLocalState() || {};
    this.awareness.setLocalState({
      ...state,
      cursor: { x, y },
    });
  }
  
  clearCursor() {
    if (!this.awareness || !this.localUser) return;
    
    const state = this.awareness.getLocalState() || {};
    this.awareness.setLocalState({
      ...state,
      cursor: null,
    });
  }
  
  updateSelection(elementIds: string[]) {
    if (!this.awareness || !this.localUser) return;
    
    const state = this.awareness.getLocalState() || {};
    this.awareness.setLocalState({
      ...state,
      selection: elementIds,
    });
  }
  
  getOtherUsers(): UserPresence[] {
    if (!this.awareness) return [];
    
    const states: UserPresence[] = [];
    
    this.awareness.getStates().forEach((state, clientId) => {
      if (clientId !== this.awareness!.clientID && state.user) {
        states.push({
          id: state.user.id,
          name: state.user.name,
          color: state.user.color,
          cursor: state.cursor,
          selection: state.selection || [],
        });
      }
    });
    
    return states;
  }
  
  onUsersChange(callback: (users: UserPresence[]) => void): () => void {
    if (!this.awareness) return () => {};
    
    const handler = () => callback(this.getOtherUsers());
    this.awareness.on('change', handler);
    
    return () => this.awareness?.off('change', handler);
  }
  
  destroy() {
    this.awareness = null;
    this.localUser = null;
  }
}

export const awarenessService = new AwarenessService();
```

### 1.8 Store Présence

```typescript
// stores/presenceStore.ts

import { create } from 'zustand';
import { awarenessService, UserPresence } from '../services/awarenessService';

interface PresenceState {
  users: UserPresence[];
  
  initialize: (provider: WebsocketProvider, user: { id: string; name: string; color: string }) => void;
  updateCursor: (x: number, y: number) => void;
  clearCursor: () => void;
  updateSelection: (elementIds: string[]) => void;
  destroy: () => void;
}

export const usePresenceStore = create<PresenceState>((set) => {
  let unsubscribe: (() => void) | null = null;
  
  return {
    users: [],
    
    initialize: (provider, user) => {
      awarenessService.initialize(provider, user);
      
      unsubscribe = awarenessService.onUsersChange((users) => {
        set({ users });
      });
    },
    
    updateCursor: (x, y) => {
      awarenessService.updateCursor(x, y);
    },
    
    clearCursor: () => {
      awarenessService.clearCursor();
    },
    
    updateSelection: (elementIds) => {
      awarenessService.updateSelection(elementIds);
    },
    
    destroy: () => {
      if (unsubscribe) unsubscribe();
      awarenessService.destroy();
      set({ users: [] });
    },
  };
});
```

---

## Partie 2 — Serveur

### 2.1 Structure du projet

```
zeroneurone-server/
├── src/
│   ├── index.ts           # Point d'entrée
│   ├── config.ts          # Configuration
│   ├── auth/
│   │   ├── jwt.ts
│   │   └── middleware.ts
│   ├── routes/
│   │   ├── auth.ts
│   │   ├── investigations.ts
│   │   └── assets.ts
│   ├── ws/
│   │   └── sync.ts        # WebSocket handler
│   ├── storage/
│   │   ├── db.ts          # SQLite
│   │   └── files.ts       # Stockage fichiers
│   └── types.ts
├── Dockerfile
├── docker-compose.yml
├── package.json
└── README.md
```

### 2.2 Dépendances serveur

```json
{
  "name": "zeroneurone-server",
  "version": "1.0.0",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "ws": "^8.14.2",
    "y-websocket": "^1.5.0",
    "better-sqlite3": "^9.2.2",
    "jsonwebtoken": "^9.0.2",
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/ws": "^8.5.10",
    "@types/better-sqlite3": "^7.6.8",
    "@types/jsonwebtoken": "^9.0.5",
    "@types/bcryptjs": "^2.4.6",
    "@types/cors": "^2.8.17",
    "tsx": "^4.6.2",
    "typescript": "^5.3.2"
  }
}
```

### 2.3 Configuration

```typescript
// src/config.ts

import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000'),
  
  jwtSecret: process.env.JWT_SECRET || 'change-me-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  
  dbPath: process.env.DB_PATH || './data/zeroneurone.db',
  storagePath: process.env.STORAGE_PATH || './data/storage',
  
  corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:5173'],
  
  // Limites
  maxInvestigationsPerUser: parseInt(process.env.MAX_INVESTIGATIONS || '100'),
  maxCollaboratorsPerInvestigation: parseInt(process.env.MAX_COLLABORATORS || '20'),
  maxAssetSizeMb: parseInt(process.env.MAX_ASSET_SIZE_MB || '50'),
};
```

### 2.4 Base de données

```typescript
// src/storage/db.ts

import Database from 'better-sqlite3';
import { config } from '../config';

const db = new Database(config.dbPath);

// Créer les tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS investigations (
    id TEXT PRIMARY KEY,
    room_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (owner_id) REFERENCES users(id)
  );
  
  CREATE TABLE IF NOT EXISTS investigation_members (
    investigation_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
    joined_at TEXT NOT NULL,
    PRIMARY KEY (investigation_id, user_id),
    FOREIGN KEY (investigation_id) REFERENCES investigations(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  
  CREATE TABLE IF NOT EXISTS invitations (
    id TEXT PRIMARY KEY,
    investigation_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_by TEXT,
    used_at TEXT,
    FOREIGN KEY (investigation_id) REFERENCES investigations(id) ON DELETE CASCADE
  );
  
  CREATE INDEX IF NOT EXISTS idx_investigations_owner ON investigations(owner_id);
  CREATE INDEX IF NOT EXISTS idx_members_user ON investigation_members(user_id);
  CREATE INDEX IF NOT EXISTS idx_invitations_investigation ON invitations(investigation_id);
`);

export { db };
```

### 2.5 Routes Auth

```typescript
// src/routes/auth.ts

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { db } from '../storage/db';
import { config } from '../config';

const router = Router();

// Couleurs pour les avatars
const COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password and name required' });
    }
    
    // Vérifier si l'email existe
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    
    // Créer l'utilisateur
    const id = uuid();
    const passwordHash = await bcrypt.hash(password, 10);
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const now = new Date().toISOString();
    
    db.prepare(`
      INSERT INTO users (id, email, password_hash, name, color, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, email, passwordHash, name, color, now, now);
    
    // Générer le token
    const token = jwt.sign({ userId: id }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
    
    res.json({ token, user: { id, email, name, color } });
    
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    // Trouver l'utilisateur
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Vérifier le mot de passe
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Générer le token
    const token = jwt.sign({ userId: user.id }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
    
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, color: user.color },
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, email, name, color FROM users WHERE id = ?').get(req.userId) as any;
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({ user });
});

export { router as authRouter };
```

### 2.6 Routes Investigations

```typescript
// src/routes/investigations.ts

import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../storage/db';
import { authMiddleware } from '../auth/middleware';

const router = Router();

// Toutes les routes nécessitent une auth
router.use(authMiddleware);

// Liste des enquêtes de l'utilisateur
router.get('/', (req, res) => {
  const investigations = db.prepare(`
    SELECT i.*, im.role
    FROM investigations i
    JOIN investigation_members im ON i.id = im.investigation_id
    WHERE im.user_id = ?
    ORDER BY i.updated_at DESC
  `).all(req.userId);
  
  res.json({ investigations });
});

// Créer une enquête partagée
router.post('/', (req, res) => {
  const { name } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: 'Name required' });
  }
  
  const id = uuid();
  const roomId = uuid();  // ID pour le WebSocket
  const now = new Date().toISOString();
  
  db.transaction(() => {
    // Créer l'enquête
    db.prepare(`
      INSERT INTO investigations (id, room_id, name, owner_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, roomId, name, req.userId, now, now);
    
    // Ajouter le créateur comme owner
    db.prepare(`
      INSERT INTO investigation_members (investigation_id, user_id, role, joined_at)
      VALUES (?, ?, 'owner', ?)
    `).run(id, req.userId, now);
  })();
  
  res.json({
    investigation: { id, roomId, name, role: 'owner', createdAt: now },
  });
});

// Obtenir les détails d'une enquête
router.get('/:id', (req, res) => {
  const { id } = req.params;
  
  // Vérifier l'accès
  const member = db.prepare(`
    SELECT role FROM investigation_members
    WHERE investigation_id = ? AND user_id = ?
  `).get(id, req.userId) as any;
  
  if (!member) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  const investigation = db.prepare('SELECT * FROM investigations WHERE id = ?').get(id) as any;
  
  const members = db.prepare(`
    SELECT u.id, u.name, u.color, im.role
    FROM investigation_members im
    JOIN users u ON im.user_id = u.id
    WHERE im.investigation_id = ?
  `).all(id);
  
  res.json({
    investigation: { ...investigation, role: member.role },
    members,
  });
});

// Créer un lien d'invitation
router.post('/:id/invitations', (req, res) => {
  const { id } = req.params;
  const { role = 'editor' } = req.body;
  
  if (!['editor', 'viewer'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  
  // Vérifier que l'utilisateur est owner ou editor
  const member = db.prepare(`
    SELECT role FROM investigation_members
    WHERE investigation_id = ? AND user_id = ?
  `).get(id, req.userId) as any;
  
  if (!member || member.role === 'viewer') {
    return res.status(403).json({ error: 'Cannot invite' });
  }
  
  const invitationId = uuid();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 jours
  
  db.prepare(`
    INSERT INTO invitations (id, investigation_id, role, created_by, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(invitationId, id, role, req.userId, now.toISOString(), expiresAt.toISOString());
  
  res.json({
    invitationId,
    inviteUrl: `/join/${invitationId}`,
    expiresAt: expiresAt.toISOString(),
  });
});

// Accepter une invitation
router.post('/join/:invitationId', (req, res) => {
  const { invitationId } = req.params;
  
  const invitation = db.prepare(`
    SELECT * FROM invitations WHERE id = ? AND used_by IS NULL
  `).get(invitationId) as any;
  
  if (!invitation) {
    return res.status(404).json({ error: 'Invitation not found or already used' });
  }
  
  if (new Date(invitation.expires_at) < new Date()) {
    return res.status(410).json({ error: 'Invitation expired' });
  }
  
  // Vérifier si déjà membre
  const existing = db.prepare(`
    SELECT 1 FROM investigation_members
    WHERE investigation_id = ? AND user_id = ?
  `).get(invitation.investigation_id, req.userId);
  
  if (existing) {
    return res.status(409).json({ error: 'Already a member' });
  }
  
  const now = new Date().toISOString();
  
  db.transaction(() => {
    // Ajouter comme membre
    db.prepare(`
      INSERT INTO investigation_members (investigation_id, user_id, role, joined_at)
      VALUES (?, ?, ?, ?)
    `).run(invitation.investigation_id, req.userId, invitation.role, now);
    
    // Marquer l'invitation comme utilisée
    db.prepare(`
      UPDATE invitations SET used_by = ?, used_at = ? WHERE id = ?
    `).run(req.userId, now, invitationId);
  })();
  
  const investigation = db.prepare('SELECT * FROM investigations WHERE id = ?')
    .get(invitation.investigation_id) as any;
  
  res.json({
    investigation: { ...investigation, role: invitation.role },
  });
});

// Token temporaire pour la connexion WebSocket
router.post('/:id/ws-token', (req, res) => {
  const { id } = req.params;
  
  // Vérifier l'accès
  const member = db.prepare(`
    SELECT role FROM investigation_members
    WHERE investigation_id = ? AND user_id = ?
  `).get(id, req.userId) as any;
  
  if (!member) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  const investigation = db.prepare('SELECT room_id FROM investigations WHERE id = ?').get(id) as any;
  
  // Token courte durée pour le WebSocket
  const wsToken = jwt.sign(
    { userId: req.userId, roomId: investigation.room_id, role: member.role },
    config.jwtSecret,
    { expiresIn: '1h' }
  );
  
  res.json({
    roomId: investigation.room_id,
    wsToken,
  });
});

export { router as investigationsRouter };
```

### 2.7 WebSocket Sync

```typescript
// src/ws/sync.ts

import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import { setupWSConnection } from 'y-websocket/bin/utils';
import { config } from '../config';

export function setupWebSocket(server: any) {
  const wss = new WebSocketServer({ server });
  
  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    // Extraire le token et le roomId de l'URL
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const roomId = url.pathname.split('/').pop();
    const token = url.searchParams.get('token');
    
    if (!roomId || !token) {
      ws.close(4001, 'Missing roomId or token');
      return;
    }
    
    // Vérifier le token
    try {
      const payload = jwt.verify(token, config.jwtSecret) as any;
      
      if (payload.roomId !== roomId) {
        ws.close(4003, 'Token roomId mismatch');
        return;
      }
      
      // Stocker les infos utilisateur sur la connexion
      (ws as any).userId = payload.userId;
      (ws as any).role = payload.role;
      
      // Utiliser le handler y-websocket
      setupWSConnection(ws, req, {
        docName: roomId,
        // Callback pour la persistance
        // persistence: leveldbPersistence,
      });
      
    } catch (error) {
      ws.close(4002, 'Invalid token');
    }
  });
  
  return wss;
}
```

### 2.8 Point d'entrée serveur

```typescript
// src/index.ts

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { config } from './config';
import { authRouter } from './routes/auth';
import { investigationsRouter } from './routes/investigations';
import { setupWebSocket } from './ws/sync';

const app = express();

// Middleware
app.use(cors({ origin: config.corsOrigins }));
app.use(express.json());

// Routes
app.use('/auth', authRouter);
app.use('/investigations', investigationsRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Créer le serveur HTTP
const server = createServer(app);

// Setup WebSocket
setupWebSocket(server);

// Démarrer
server.listen(config.port, () => {
  console.log(`zeroneurone-server running on port ${config.port}`);
});
```

### 2.9 Dockerfile

```dockerfile
FROM node:20-slim

WORKDIR /app

# Dépendances pour better-sqlite3
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

# Créer le dossier data
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/zeroneurone.db
ENV STORAGE_PATH=/app/data/storage

EXPOSE 3000

CMD ["node", "dist/index.js"]
```

### 2.10 docker-compose.yml

```yaml
version: '3.8'

services:
  zeroneurone-server:
    build: .
    ports:
      - "3000:3000"
    environment:
      - JWT_SECRET=${JWT_SECRET:-change-me-in-production}
      - CORS_ORIGINS=${CORS_ORIGINS:-http://localhost:5173}
    volumes:
      - zeroneurone-data:/app/data
    restart: unless-stopped

volumes:
  zeroneurone-data:
```

---

## Partie 3 — UI Collaboration

### 3.1 Composants à ajouter

```
src/components/
├── collaboration/
│   ├── ShareModal.tsx           # Modal pour partager une enquête
│   ├── JoinModal.tsx            # Modal pour rejoindre via invitation
│   ├── CollaboratorsList.tsx    # Liste des collaborateurs
│   ├── PresenceIndicator.tsx    # Qui est en ligne
│   ├── UserCursor.tsx           # Curseur d'un autre utilisateur
│   ├── SyncStatus.tsx           # Indicateur de sync
│   └── InviteModal.tsx          # Générer un lien d'invitation
```

### 3.2 ShareModal

```typescript
// components/collaboration/ShareModal.tsx

import { useState } from 'react';
import { useInvestigationStore } from '../../stores/investigationStore';
import { Copy, Check, Link } from 'lucide-react';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ShareModal({ isOpen, onClose }: ShareModalProps) {
  const { shareInvestigation, syncMode } = useInvestigationStore();
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const handleShare = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const { inviteUrl } = await shareInvestigation();
      setInviteUrl(inviteUrl);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };
  
  const handleCopy = async () => {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded shadow-lg w-[400px]">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="text-sm font-semibold">Partager l'enquête</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X size={16} />
          </button>
        </div>
        
        <div className="p-4">
          {syncMode === 'local' && !inviteUrl && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Cette enquête est actuellement locale. La partager permettra à d'autres personnes de collaborer en temps réel.
              </p>
              
              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}
              
              <button
                onClick={handleShare}
                disabled={loading}
                className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Création...' : 'Partager cette enquête'}
              </button>
            </div>
          )}
          
          {(syncMode === 'shared' || inviteUrl) && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Copiez ce lien et envoyez-le aux personnes que vous souhaitez inviter.
              </p>
              
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={inviteUrl || ''}
                  className="flex-1 px-3 py-2 text-sm border rounded bg-gray-50"
                />
                <button
                  onClick={handleCopy}
                  className="px-3 py-2 border rounded hover:bg-gray-50"
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>
              
              <p className="text-xs text-gray-500">
                Ce lien expire dans 7 jours.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

### 3.3 PresenceIndicator

```typescript
// components/collaboration/PresenceIndicator.tsx

import { usePresenceStore } from '../../stores/presenceStore';

export function PresenceIndicator() {
  const { users } = usePresenceStore();
  
  if (users.length === 0) return null;
  
  return (
    <div className="flex items-center gap-1">
      {users.slice(0, 3).map((user) => (
        <div
          key={user.id}
          className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-medium"
          style={{ backgroundColor: user.color }}
          title={user.name}
        >
          {user.name.charAt(0).toUpperCase()}
        </div>
      ))}
      
      {users.length > 3 && (
        <div className="w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 text-xs">
          +{users.length - 3}
        </div>
      )}
    </div>
  );
}
```

### 3.4 SyncStatus

```typescript
// components/collaboration/SyncStatus.tsx

import { useInvestigationStore } from '../../stores/investigationStore';
import { Cloud, CloudOff, Loader } from 'lucide-react';

export function SyncStatus() {
  const { syncMode, connected, syncing } = useInvestigationStore();
  
  if (syncMode === 'local') {
    return (
      <div className="flex items-center gap-1 text-xs text-gray-500" title="Mode local">
        <CloudOff size={14} />
        <span>Local</span>
      </div>
    );
  }
  
  if (syncing) {
    return (
      <div className="flex items-center gap-1 text-xs text-blue-600" title="Synchronisation...">
        <Loader size={14} className="animate-spin" />
        <span>Sync...</span>
      </div>
    );
  }
  
  if (connected) {
    return (
      <div className="flex items-center gap-1 text-xs text-green-600" title="Connecté">
        <Cloud size={14} />
        <span>Connecté</span>
      </div>
    );
  }
  
  return (
    <div className="flex items-center gap-1 text-xs text-orange-500" title="Hors ligne">
      <CloudOff size={14} />
      <span>Hors ligne</span>
    </div>
  );
}
```

### 3.5 UserCursor (sur le canvas)

```typescript
// components/collaboration/UserCursor.tsx

interface UserCursorProps {
  name: string;
  color: string;
  x: number;
  y: number;
}

export function UserCursor({ name, color, x, y }: UserCursorProps) {
  return (
    <div
      className="absolute pointer-events-none z-50"
      style={{ left: x, top: y }}
    >
      {/* Curseur */}
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        style={{ color }}
      >
        <path
          d="M5.65376 12.4563L8.39408 20.6139C8.74051 21.6623 10.1695 21.7087 10.5813 20.6856L12.4709 15.9369C12.5737 15.6879 12.7525 15.4765 12.9841 15.3295L17.0306 12.8091C17.9306 12.2461 17.7958 10.8843 16.7963 10.5166L6.77865 6.83583C5.82321 6.48405 4.89611 7.40654 5.24223 8.36379L7.12006 13.6898"
          fill="currentColor"
        />
      </svg>
      
      {/* Nom */}
      <div
        className="absolute left-4 top-4 px-1.5 py-0.5 text-xs text-white rounded whitespace-nowrap"
        style={{ backgroundColor: color }}
      >
        {name}
      </div>
    </div>
  );
}
```

### 3.6 Intégration dans le Header

```typescript
// Dans le header principal, ajouter :

<div className="flex items-center gap-3">
  <SyncStatus />
  <PresenceIndicator />
  
  {syncMode === 'local' && (
    <button
      onClick={() => setShowShareModal(true)}
      className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50"
    >
      Partager
    </button>
  )}
  
  {syncMode === 'shared' && (
    <button
      onClick={() => setShowInviteModal(true)}
      className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50"
    >
      Inviter
    </button>
  )}
</div>
```

---

## Partie 4 — Migration V1 → Collab

### 4.1 Stratégie

La V1 utilise Dexie directement. Pour passer à Yjs :

1. **Garder Dexie pour les enquêtes locales non-partagées** (optionnel, simplifie la migration)
2. **Ou migrer tout vers Yjs** (plus propre à long terme)

**Recommandation : Tout migrer vers Yjs.** Une enquête locale = un Y.Doc sans WebSocket.

### 4.2 Script de migration

```typescript
// services/migration.ts

import * as Y from 'yjs';
import { db } from '../db/database';

export async function migrateInvestigationToYDoc(investigationId: string): Promise<Y.Doc> {
  const ydoc = new Y.Doc();
  
  // Charger les données depuis Dexie
  const investigation = await db.investigations.get(investigationId);
  const elements = await db.elements.where({ investigationId }).toArray();
  const links = await db.links.where({ investigationId }).toArray();
  const views = await db.views.where({ investigationId }).toArray();
  const assets = await db.assets.where({ investigationId }).toArray();
  
  if (!investigation) {
    throw new Error('Investigation not found');
  }
  
  // Remplir le Y.Doc
  ydoc.transact(() => {
    // Meta
    const meta = ydoc.getMap('meta');
    meta.set('id', investigation.id);
    meta.set('name', investigation.name);
    meta.set('description', investigation.description);
    meta.set('createdAt', investigation.createdAt.toISOString());
    
    // Elements
    const yElements = ydoc.getMap('elements');
    for (const element of elements) {
      yElements.set(element.id, elementToYMap(element));
    }
    
    // Links
    const yLinks = ydoc.getMap('links');
    for (const link of links) {
      yLinks.set(link.id, linkToYMap(link));
    }
    
    // Views
    const yViews = ydoc.getMap('views');
    for (const view of views) {
      yViews.set(view.id, viewToYMap(view));
    }
    
    // Assets (métadonnées seulement)
    const yAssets = ydoc.getMap('assets');
    for (const asset of assets) {
      yAssets.set(asset.id, assetToYMap(asset));
    }
  });
  
  return ydoc;
}

export async function migrateAllInvestigations(): Promise<void> {
  const investigations = await db.investigations.toArray();
  
  for (const investigation of investigations) {
    console.log(`Migrating ${investigation.name}...`);
    
    // Créer le Y.Doc
    const ydoc = await migrateInvestigationToYDoc(investigation.id);
    
    // Sauvegarder dans IndexedDB via y-indexeddb
    const persistence = new IndexeddbPersistence(
      `zeroneurone-${investigation.id}`,
      ydoc
    );
    
    await persistence.whenSynced;
    
    console.log(`Migrated ${investigation.name}`);
  }
  
  // Optionnel : supprimer les anciennes données Dexie
  // await db.elements.clear();
  // await db.links.clear();
  // etc.
}
```

### 4.3 Détection et migration automatique

```typescript
// Au chargement d'une enquête, vérifier si elle est déjà migrée

async function openInvestigation(id: string) {
  // Vérifier si le Y.Doc existe dans IndexedDB
  const yjsKey = `zeroneurone-${id}`;
  const yjsExists = await checkIndexedDBExists(yjsKey);
  
  if (!yjsExists) {
    // Migration nécessaire
    const ydoc = await migrateInvestigationToYDoc(id);
    const persistence = new IndexeddbPersistence(yjsKey, ydoc);
    await persistence.whenSynced;
  }
  
  // Ouvrir normalement avec Yjs
  return syncService.openLocal(id);
}
```

---

## Partie 5 — Checklist d'implémentation

### Phase 1 — Fondations Yjs (client)
- [ ] Installer yjs, y-indexeddb, y-websocket
- [ ] Créer les mappers Element/Link ↔ Y.Map
- [ ] Créer SyncService
- [ ] Adapter InvestigationStore pour utiliser Yjs
- [ ] Tester en mode local (sans serveur)

### Phase 2 — Migration
- [ ] Script de migration Dexie → Yjs
- [ ] Détection automatique et migration au chargement
- [ ] Vérifier que tout fonctionne comme avant

### Phase 3 — Serveur
- [ ] Créer le projet zeroneurone-server
- [ ] Implémenter auth (register/login)
- [ ] Implémenter routes investigations
- [ ] Implémenter WebSocket avec y-websocket
- [ ] Dockerfile et docker-compose
- [ ] Tester en local

### Phase 4 — UI Collaboration
- [ ] ShareModal
- [ ] SyncStatus
- [ ] PresenceIndicator
- [ ] Intégrer dans le header
- [ ] JoinModal (accepter invitation)

### Phase 5 — Présence
- [ ] AwarenessService
- [ ] PresenceStore
- [ ] UserCursor sur le canvas
- [ ] Sélection des autres visible

### Phase 6 — Polish
- [ ] Gestion des erreurs réseau
- [ ] Reconnexion automatique
- [ ] Indicateurs de sync clairs
- [ ] Tests avec plusieurs utilisateurs

### Phase 7 — Déploiement serveur public
- [ ] Héberger le serveur (VPS, fly.io, railway...)
- [ ] Configurer le domaine sync.zeroneurone.io
- [ ] SSL/TLS
- [ ] Monitoring basique

---

## Récapitulatif

| Composant | Techno | Rôle |
|-----------|--------|------|
| Y.Doc | Yjs | Source de vérité collaborative |
| y-indexeddb | Yjs provider | Persistance locale |
| y-websocket | Yjs provider | Sync temps réel |
| zeroneurone-server | Node.js + y-websocket | Relay + Auth + Stockage |
| Awareness | Yjs protocol | Présence temps réel |

**Flux :**
1. Enquête ouverte → Y.Doc chargé depuis IndexedDB
2. Si partagée → WebSocket connecté au serveur
3. Modifications → Y.Doc mis à jour → propagé aux autres
4. Offline → modifications locales → sync au retour

**Zéro friction :**
- Clic "Partager" → lien généré
- Clic sur lien → enquête ouverte, sync automatique

---

*Spécification Collaboration — zeroneurone — Janvier 2025*
