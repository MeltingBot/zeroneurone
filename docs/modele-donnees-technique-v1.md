# zeroneurone — Modèle de données

## Spécification technique

## Destination : Claude Code

Ce document est la spécification technique du modèle de données. Il contient tout ce qui est nécessaire pour implémenter le stockage sans ambiguïté.

---

## 1. Stack technique

### 1.1 Technologies retenues

| Besoin | Technologie | Justification |
|--------|-------------|---------------|
| Framework UI | React 18+ avec TypeScript | Standard, écosystème riche |
| State management | Zustand | Léger, simple, compatible React |
| Stockage métadonnées | IndexedDB via Dexie.js | API simple, requêtes puissantes |
| Stockage fichiers | OPFS (Origin Private File System) | Performant pour gros fichiers |
| Recherche full-text | MiniSearch | Léger, fonctionne côté client |
| Graphe / analyse | Graphology | Algos de graphe complets, JS pur |
| Canvas | React Flow ou tldraw | À décider selon prototype |
| Carte | Leaflet + React-Leaflet | Open source, fiable |
| Timeline | vis-timeline ou custom | À évaluer |
| Export PDF | jsPDF + html2canvas | Client-side |
| Export ZIP | JSZip | Standard |
| Hash fichiers | crypto.subtle (Web Crypto API) | Natif navigateur |

### 1.2 Structure du projet (suggestion)

```
src/
├── components/          # Composants React
│   ├── canvas/          # Canvas et éléments graphiques
│   ├── map/             # Vue cartographique
│   ├── timeline/        # Vue timeline
│   ├── panels/          # Panneaux latéraux (détail, insights)
│   ├── report/          # Mode rapport
│   └── common/          # Composants partagés
├── stores/              # Zustand stores
│   ├── investigationStore.ts
│   ├── selectionStore.ts
│   ├── viewStore.ts
│   └── uiStore.ts
├── db/                  # Couche données
│   ├── database.ts      # Configuration Dexie
│   ├── repositories/    # CRUD par entité
│   └── migrations/      # Migrations de schéma
├── services/            # Logique métier
│   ├── importService.ts
│   ├── exportService.ts
│   ├── searchService.ts
│   ├── insightsService.ts
│   └── fileService.ts
├── types/               # Types TypeScript
│   └── index.ts
├── utils/               # Utilitaires
└── hooks/               # Custom hooks React
```

---

## 2. Types TypeScript

### 2.1 Identifiants

```typescript
// Tous les IDs sont des UUID v4
type UUID = string;

// Types d'identifiants spécifiques (pour la clarté)
type InvestigationId = UUID;
type ElementId = UUID;
type LinkId = UUID;
type AssetId = UUID;
type ViewId = UUID;
type ReportSectionId = UUID;
```

### 2.2 Types utilitaires

```typescript
// Position sur le canvas
interface Position {
  x: number;
  y: number;
}

// Coordonnées géographiques
interface GeoCoordinates {
  lat: number;
  lng: number;
}

// Plage de dates
interface DateRange {
  start: Date | null;
  end: Date | null;
}

// Propriété libre (clé/valeur)
interface Property {
  key: string;
  value: string | number | boolean | Date | null;
}

// Apparence visuelle d'un élément
interface ElementVisual {
  color: string;           // Couleur de fond (hex)
  borderColor: string;     // Couleur de bordure (hex)
  shape: ElementShape;
  size: ElementSize;
  icon: string | null;     // Nom d'icône ou null
  image: AssetId | null;   // ID d'asset pour image custom
}

type ElementShape = 'circle' | 'square' | 'diamond' | 'rectangle' | 'hexagon';
type ElementSize = 'small' | 'medium' | 'large' | number; // number = diamètre en px

// Apparence visuelle d'un lien
interface LinkVisual {
  color: string;           // Couleur (hex)
  style: LinkStyle;
  thickness: number;       // Épaisseur en px
}

type LinkStyle = 'solid' | 'dashed' | 'dotted';

// Niveau de confiance
type Confidence = 0 | 10 | 20 | 30 | 40 | 50 | 60 | 70 | 80 | 90 | 100;
```

### 2.3 Investigation (Enquête)

```typescript
interface Investigation {
  id: InvestigationId;
  name: string;
  description: string;
  
  // Métadonnées
  createdAt: Date;
  updatedAt: Date;
  
  // État du viewport (pour restaurer la vue)
  viewport: {
    x: number;           // Pan X
    y: number;           // Pan Y
    zoom: number;        // Niveau de zoom
  };
  
  // Paramètres de l'enquête
  settings: InvestigationSettings;
}

interface InvestigationSettings {
  // Apparence par défaut des nouveaux éléments
  defaultElementVisual: Partial<ElementVisual>;
  
  // Apparence par défaut des nouveaux liens
  defaultLinkVisual: Partial<LinkVisual>;
  
  // Propriétés suggérées (apprises de l'usage)
  suggestedProperties: string[];
  
  // Tags existants (pour autocomplétion)
  existingTags: string[];
}
```

### 2.4 Element (Nœud du graphe)

```typescript
interface Element {
  id: ElementId;
  investigationId: InvestigationId;
  
  // Contenu principal
  label: string;
  notes: string;
  
  // Organisation
  tags: string[];
  
  // Propriétés libres
  properties: Property[];
  
  // Métadonnées d'investigation
  confidence: Confidence | null;
  source: string;
  
  // Temporalité (pour timeline)
  date: Date | null;              // Date unique (événement ponctuel)
  dateRange: DateRange | null;    // Période (début/fin)
  
  // Spatialité
  position: Position;             // Position sur le canvas
  geo: GeoCoordinates | null;     // Position géographique
  
  // Apparence
  visual: ElementVisual;
  
  // Fichiers attachés
  assetIds: AssetId[];
  
  // Groupe parent (si l'élément est dans un groupe)
  parentGroupId: ElementId | null;
  
  // Si c'est un groupe, contient les IDs des enfants
  isGroup: boolean;
  childIds: ElementId[];          // Vide si pas un groupe
  
  // Métadonnées système
  createdAt: Date;
  updatedAt: Date;
}
```

### 2.5 Valeurs par défaut Element

```typescript
const DEFAULT_ELEMENT_VISUAL: ElementVisual = {
  color: '#ffffff',
  borderColor: '#374151',
  shape: 'circle',
  size: 'medium',
  icon: null,
  image: null,
};

function createDefaultElement(
  investigationId: InvestigationId,
  label: string,
  position: Position
): Element {
  return {
    id: generateUUID(),
    investigationId,
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
  };
}
```

### 2.6 Link (Relation entre éléments)

```typescript
interface Link {
  id: LinkId;
  investigationId: InvestigationId;
  
  // Connexion
  fromId: ElementId;
  toId: ElementId;
  
  // Contenu
  label: string;
  notes: string;
  
  // Propriétés libres
  properties: Property[];
  
  // Direction
  directed: boolean;              // true = flèche, false = trait simple
  
  // Métadonnées d'investigation
  confidence: Confidence | null;
  source: string;
  
  // Temporalité
  date: Date | null;
  dateRange: DateRange | null;
  
  // Apparence
  visual: LinkVisual;
  
  // Métadonnées système
  createdAt: Date;
  updatedAt: Date;
}
```

### 2.7 Valeurs par défaut Link

```typescript
const DEFAULT_LINK_VISUAL: LinkVisual = {
  color: '#6b7280',
  style: 'solid',
  thickness: 2,
};

function createDefaultLink(
  investigationId: InvestigationId,
  fromId: ElementId,
  toId: ElementId
): Link {
  return {
    id: generateUUID(),
    investigationId,
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
  };
}
```

### 2.8 Asset (Fichier attaché)

```typescript
interface Asset {
  id: AssetId;
  investigationId: InvestigationId;
  
  // Métadonnées fichier
  filename: string;
  mimeType: string;
  size: number;                   // Taille en bytes
  
  // Stockage
  hash: string;                   // SHA-256 du fichier
  opfsPath: string;               // Chemin dans OPFS
  
  // Preview (généré)
  thumbnailDataUrl: string | null; // Base64 data URL pour preview
  
  // Contenu extrait (pour recherche)
  extractedText: string | null;   // Texte extrait du PDF/doc
  
  // Métadonnées système
  createdAt: Date;
}
```

### 2.9 View (Vue sauvegardée)

```typescript
interface View {
  id: ViewId;
  investigationId: InvestigationId;
  
  name: string;
  
  // État à restaurer
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
  
  // Filtres actifs
  filters: ViewFilters;
  
  // Éléments explicitement masqués (en plus des filtres)
  hiddenElementIds: ElementId[];
  
  // Mode d'affichage
  displayMode: 'canvas' | 'map' | 'split';
  
  // Métadonnées système
  createdAt: Date;
  updatedAt: Date;
}

interface ViewFilters {
  // Filtre par tags (OR logic : a l'un des tags)
  includeTags: string[];
  
  // Exclure des tags
  excludeTags: string[];
  
  // Filtre par propriété existante
  hasProperty: string | null;
  
  // Filtre par texte (label ou notes contient)
  textSearch: string;
  
  // Filtre par confiance minimum
  minConfidence: Confidence | null;
  
  // Filtre par date
  dateFrom: Date | null;
  dateTo: Date | null;
  
  // Filtre par géolocalisation
  hasGeo: boolean | null;          // true = que les géolocalisés, false = que les non-géo, null = tous
}

const DEFAULT_FILTERS: ViewFilters = {
  includeTags: [],
  excludeTags: [],
  hasProperty: null,
  textSearch: '',
  minConfidence: null,
  dateFrom: null,
  dateTo: null,
  hasGeo: null,
};
```

### 2.10 Report (Rapport)

```typescript
interface Report {
  id: UUID;
  investigationId: InvestigationId;
  
  title: string;
  
  sections: ReportSection[];
  
  // Métadonnées système
  createdAt: Date;
  updatedAt: Date;
}

interface ReportSection {
  id: ReportSectionId;
  
  title: string;
  order: number;                  // Pour le tri
  
  // Contenu
  content: string;                // Texte Markdown
  
  // Éléments inclus dans cette section
  elementIds: ElementId[];
  
  // Capture du graphe (si incluse)
  graphSnapshot: GraphSnapshot | null;
}

interface GraphSnapshot {
  // Image encodée en base64
  imageDataUrl: string;
  
  // Métadonnées de la capture
  viewport: { x: number; y: number; zoom: number };
  capturedAt: Date;
}
```

### 2.11 SearchIndex (Index de recherche)

```typescript
// Structure pour MiniSearch
interface SearchDocument {
  id: string;                     // ElementId ou LinkId
  type: 'element' | 'link';
  investigationId: InvestigationId;
  
  // Champs indexés
  label: string;
  notes: string;
  tags: string;                   // Tags joints par espace
  properties: string;             // Valeurs des propriétés jointes
  extractedText: string;          // Texte des assets
}
```

---

## 3. Structure IndexedDB (Dexie)

### 3.1 Configuration Dexie

```typescript
import Dexie, { Table } from 'dexie';

class InvestigationDatabase extends Dexie {
  investigations!: Table<Investigation, InvestigationId>;
  elements!: Table<Element, ElementId>;
  links!: Table<Link, LinkId>;
  assets!: Table<Asset, AssetId>;
  views!: Table<View, ViewId>;
  reports!: Table<Report, UUID>;

  constructor() {
    super('InvestigationTool');
    
    this.version(1).stores({
      investigations: 'id, name, createdAt, updatedAt',
      
      elements: 'id, investigationId, label, parentGroupId, createdAt, updatedAt, *tags',
      
      links: 'id, investigationId, fromId, toId, createdAt, updatedAt',
      
      assets: 'id, investigationId, hash, createdAt',
      
      views: 'id, investigationId, name, createdAt',
      
      reports: 'id, investigationId, createdAt, updatedAt',
    });
  }
}

export const db = new InvestigationDatabase();
```

### 3.2 Index expliqués

| Store | Index | Utilité |
|-------|-------|---------|
| investigations | `id` | Clé primaire |
| investigations | `name` | Recherche par nom |
| investigations | `createdAt, updatedAt` | Tri chronologique |
| elements | `id` | Clé primaire |
| elements | `investigationId` | Tous les éléments d'une enquête |
| elements | `label` | Recherche par label |
| elements | `parentGroupId` | Enfants d'un groupe |
| elements | `*tags` | Multi-index sur les tags |
| links | `id` | Clé primaire |
| links | `investigationId` | Tous les liens d'une enquête |
| links | `fromId, toId` | Liens d'un élément |
| assets | `id` | Clé primaire |
| assets | `investigationId` | Assets d'une enquête |
| assets | `hash` | Déduplication |
| views | `id` | Clé primaire |
| views | `investigationId` | Vues d'une enquête |
| reports | `id` | Clé primaire |
| reports | `investigationId` | Rapports d'une enquête |

---

## 4. OPFS (Stockage fichiers)

### 4.1 Structure des répertoires

```
root/
└── investigations/
    └── {investigationId}/
        └── assets/
            ├── {hash1}.pdf
            ├── {hash2}.jpg
            └── ...
```

### 4.2 Service de fichiers

```typescript
class FileService {
  private root: FileSystemDirectoryHandle | null = null;

  async initialize(): Promise<void> {
    this.root = await navigator.storage.getDirectory();
  }

  async saveAsset(
    investigationId: InvestigationId,
    file: File
  ): Promise<Asset> {
    // 1. Calculer le hash
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hash = this.bufferToHex(hashBuffer);

    // 2. Vérifier si déjà existant (dédup)
    const existing = await db.assets
      .where({ investigationId, hash })
      .first();
    if (existing) {
      return existing;
    }

    // 3. Créer le chemin OPFS
    const dirHandle = await this.getAssetDirectory(investigationId);
    const extension = this.getExtension(file.name);
    const filename = `${hash}.${extension}`;
    
    // 4. Écrire le fichier
    const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(arrayBuffer);
    await writable.close();

    // 5. Générer thumbnail si image/PDF
    const thumbnailDataUrl = await this.generateThumbnail(file);

    // 6. Extraire texte si possible
    const extractedText = await this.extractText(file);

    // 7. Créer l'entrée Asset
    const asset: Asset = {
      id: generateUUID(),
      investigationId,
      filename: file.name,
      mimeType: file.type,
      size: file.size,
      hash,
      opfsPath: `investigations/${investigationId}/assets/${filename}`,
      thumbnailDataUrl,
      extractedText,
      createdAt: new Date(),
    };

    await db.assets.add(asset);
    return asset;
  }

  async getAssetFile(asset: Asset): Promise<File> {
    const pathParts = asset.opfsPath.split('/');
    let handle: FileSystemDirectoryHandle = this.root!;
    
    for (const part of pathParts.slice(0, -1)) {
      handle = await handle.getDirectoryHandle(part);
    }
    
    const fileHandle = await handle.getFileHandle(pathParts.at(-1)!);
    return fileHandle.getFile();
  }

  async deleteAsset(asset: Asset): Promise<void> {
    // Supprimer le fichier OPFS
    const pathParts = asset.opfsPath.split('/');
    let handle: FileSystemDirectoryHandle = this.root!;
    
    for (const part of pathParts.slice(0, -1)) {
      handle = await handle.getDirectoryHandle(part);
    }
    
    await handle.removeEntry(pathParts.at(-1)!);
    
    // Supprimer l'entrée DB
    await db.assets.delete(asset.id);
  }

  private async getAssetDirectory(
    investigationId: InvestigationId
  ): Promise<FileSystemDirectoryHandle> {
    const investigations = await this.root!.getDirectoryHandle('investigations', { create: true });
    const investigation = await investigations.getDirectoryHandle(investigationId, { create: true });
    return investigation.getDirectoryHandle('assets', { create: true });
  }

  private bufferToHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private getExtension(filename: string): string {
    return filename.split('.').pop()?.toLowerCase() || 'bin';
  }

  private async generateThumbnail(file: File): Promise<string | null> {
    // Implémentation pour images et PDF première page
    // Retourne un data URL base64 ou null
    // ...
  }

  private async extractText(file: File): Promise<string | null> {
    // Implémentation pour PDF et documents texte
    // Retourne le texte extrait ou null
    // ...
  }
}
```

---

## 5. Repositories (CRUD)

### 5.1 Investigation Repository

```typescript
class InvestigationRepository {
  async create(name: string, description: string = ''): Promise<Investigation> {
    const investigation: Investigation = {
      id: generateUUID(),
      name,
      description,
      createdAt: new Date(),
      updatedAt: new Date(),
      viewport: { x: 0, y: 0, zoom: 1 },
      settings: {
        defaultElementVisual: {},
        defaultLinkVisual: {},
        suggestedProperties: [],
        existingTags: [],
      },
    };
    
    await db.investigations.add(investigation);
    return investigation;
  }

  async getById(id: InvestigationId): Promise<Investigation | undefined> {
    return db.investigations.get(id);
  }

  async getAll(): Promise<Investigation[]> {
    return db.investigations.orderBy('updatedAt').reverse().toArray();
  }

  async update(id: InvestigationId, changes: Partial<Investigation>): Promise<void> {
    await db.investigations.update(id, {
      ...changes,
      updatedAt: new Date(),
    });
  }

  async delete(id: InvestigationId): Promise<void> {
    // Supprimer en cascade
    await db.transaction('rw', 
      [db.investigations, db.elements, db.links, db.assets, db.views, db.reports],
      async () => {
        await db.elements.where({ investigationId: id }).delete();
        await db.links.where({ investigationId: id }).delete();
        await db.assets.where({ investigationId: id }).delete();
        await db.views.where({ investigationId: id }).delete();
        await db.reports.where({ investigationId: id }).delete();
        await db.investigations.delete(id);
      }
    );
    
    // Supprimer les fichiers OPFS
    // ...
  }
}
```

### 5.2 Element Repository

```typescript
class ElementRepository {
  async create(
    investigationId: InvestigationId,
    label: string,
    position: Position,
    options: Partial<Element> = {}
  ): Promise<Element> {
    const element = createDefaultElement(investigationId, label, position);
    Object.assign(element, options);
    
    await db.elements.add(element);
    await this.updateInvestigationTimestamp(investigationId);
    
    return element;
  }

  async getById(id: ElementId): Promise<Element | undefined> {
    return db.elements.get(id);
  }

  async getByInvestigation(investigationId: InvestigationId): Promise<Element[]> {
    return db.elements.where({ investigationId }).toArray();
  }

  async getByParentGroup(parentGroupId: ElementId): Promise<Element[]> {
    return db.elements.where({ parentGroupId }).toArray();
  }

  async update(id: ElementId, changes: Partial<Element>): Promise<void> {
    const element = await db.elements.get(id);
    if (!element) return;
    
    await db.elements.update(id, {
      ...changes,
      updatedAt: new Date(),
    });
    
    await this.updateInvestigationTimestamp(element.investigationId);
  }

  async delete(id: ElementId): Promise<void> {
    const element = await db.elements.get(id);
    if (!element) return;
    
    await db.transaction('rw', [db.elements, db.links], async () => {
      // Supprimer les liens associés
      await db.links
        .where('fromId').equals(id)
        .or('toId').equals(id)
        .delete();
      
      // Si c'est un groupe, supprimer les enfants
      if (element.isGroup) {
        await db.elements.where({ parentGroupId: id }).delete();
      }
      
      // Supprimer l'élément
      await db.elements.delete(id);
    });
    
    await this.updateInvestigationTimestamp(element.investigationId);
  }

  async addToGroup(elementId: ElementId, groupId: ElementId): Promise<void> {
    const group = await db.elements.get(groupId);
    if (!group || !group.isGroup) {
      throw new Error('Target is not a group');
    }
    
    await db.elements.update(elementId, { parentGroupId: groupId });
    await db.elements.update(groupId, { 
      childIds: [...group.childIds, elementId],
      updatedAt: new Date(),
    });
  }

  async removeFromGroup(elementId: ElementId): Promise<void> {
    const element = await db.elements.get(elementId);
    if (!element || !element.parentGroupId) return;
    
    const group = await db.elements.get(element.parentGroupId);
    if (group) {
      await db.elements.update(group.id, {
        childIds: group.childIds.filter(id => id !== elementId),
        updatedAt: new Date(),
      });
    }
    
    await db.elements.update(elementId, { parentGroupId: null });
  }

  async createGroup(
    investigationId: InvestigationId,
    name: string,
    elementIds: ElementId[],
    position: Position
  ): Promise<Element> {
    const group = await this.create(investigationId, name, position, {
      isGroup: true,
      childIds: elementIds,
    });
    
    // Mettre à jour les enfants
    await db.elements
      .where('id')
      .anyOf(elementIds)
      .modify({ parentGroupId: group.id });
    
    return group;
  }

  private async updateInvestigationTimestamp(investigationId: InvestigationId): Promise<void> {
    await db.investigations.update(investigationId, { updatedAt: new Date() });
  }
}
```

### 5.3 Link Repository

```typescript
class LinkRepository {
  async create(
    investigationId: InvestigationId,
    fromId: ElementId,
    toId: ElementId,
    options: Partial<Link> = {}
  ): Promise<Link> {
    const link = createDefaultLink(investigationId, fromId, toId);
    Object.assign(link, options);
    
    await db.links.add(link);
    await this.updateInvestigationTimestamp(investigationId);
    
    return link;
  }

  async getById(id: LinkId): Promise<Link | undefined> {
    return db.links.get(id);
  }

  async getByInvestigation(investigationId: InvestigationId): Promise<Link[]> {
    return db.links.where({ investigationId }).toArray();
  }

  async getByElement(elementId: ElementId): Promise<Link[]> {
    return db.links
      .where('fromId').equals(elementId)
      .or('toId').equals(elementId)
      .toArray();
  }

  async getLinkBetween(fromId: ElementId, toId: ElementId): Promise<Link[]> {
    // Liens dans les deux sens (si non-dirigés)
    return db.links
      .where('[fromId+toId]')
      .anyOf([[fromId, toId], [toId, fromId]])
      .toArray();
  }

  async update(id: LinkId, changes: Partial<Link>): Promise<void> {
    const link = await db.links.get(id);
    if (!link) return;
    
    await db.links.update(id, {
      ...changes,
      updatedAt: new Date(),
    });
    
    await this.updateInvestigationTimestamp(link.investigationId);
  }

  async delete(id: LinkId): Promise<void> {
    const link = await db.links.get(id);
    if (!link) return;
    
    await db.links.delete(id);
    await this.updateInvestigationTimestamp(link.investigationId);
  }

  private async updateInvestigationTimestamp(investigationId: InvestigationId): Promise<void> {
    await db.investigations.update(investigationId, { updatedAt: new Date() });
  }
}
```

---

## 6. Service de recherche

### 6.1 Configuration MiniSearch

```typescript
import MiniSearch from 'minisearch';

class SearchService {
  private index: MiniSearch<SearchDocument>;
  private investigationId: InvestigationId | null = null;

  constructor() {
    this.index = new MiniSearch<SearchDocument>({
      fields: ['label', 'notes', 'tags', 'properties', 'extractedText'],
      storeFields: ['id', 'type', 'investigationId'],
      searchOptions: {
        boost: { label: 3, tags: 2, notes: 1 },
        fuzzy: 0.2,
        prefix: true,
      },
    });
  }

  async loadInvestigation(investigationId: InvestigationId): Promise<void> {
    this.index.removeAll();
    this.investigationId = investigationId;

    // Indexer les éléments
    const elements = await db.elements.where({ investigationId }).toArray();
    const assets = await db.assets.where({ investigationId }).toArray();
    const assetTextMap = new Map(assets.map(a => [a.id, a.extractedText || '']));

    const elementDocs: SearchDocument[] = elements.map(el => ({
      id: el.id,
      type: 'element',
      investigationId,
      label: el.label,
      notes: el.notes,
      tags: el.tags.join(' '),
      properties: el.properties.map(p => `${p.key} ${p.value}`).join(' '),
      extractedText: el.assetIds.map(id => assetTextMap.get(id) || '').join(' '),
    }));

    // Indexer les liens
    const links = await db.links.where({ investigationId }).toArray();
    const linkDocs: SearchDocument[] = links.map(link => ({
      id: link.id,
      type: 'link',
      investigationId,
      label: link.label,
      notes: link.notes,
      tags: '',
      properties: link.properties.map(p => `${p.key} ${p.value}`).join(' '),
      extractedText: '',
    }));

    this.index.addAll([...elementDocs, ...linkDocs]);
  }

  search(query: string): SearchResult[] {
    if (!query.trim()) return [];
    
    return this.index.search(query).map(result => ({
      id: result.id,
      type: result.type as 'element' | 'link',
      score: result.score,
      matches: result.match,
    }));
  }

  // Mise à jour incrémentale
  async indexElement(element: Element): Promise<void> {
    const assets = await db.assets.where('id').anyOf(element.assetIds).toArray();
    const extractedText = assets.map(a => a.extractedText || '').join(' ');

    const doc: SearchDocument = {
      id: element.id,
      type: 'element',
      investigationId: element.investigationId,
      label: element.label,
      notes: element.notes,
      tags: element.tags.join(' '),
      properties: element.properties.map(p => `${p.key} ${p.value}`).join(' '),
      extractedText,
    };

    // Remove if exists, then add
    try { this.index.remove({ id: element.id }); } catch {}
    this.index.add(doc);
  }

  removeElement(elementId: ElementId): void {
    try { this.index.remove({ id: elementId }); } catch {}
  }
}

interface SearchResult {
  id: string;
  type: 'element' | 'link';
  score: number;
  matches: Record<string, string[]>;
}
```

---

## 7. Service d'insights (Graphology)

### 7.1 Construction du graphe

```typescript
import Graph from 'graphology';
import { 
  degreeCentrality,
  betweennessCentrality,
  closenessCentrality,
} from 'graphology-metrics/centrality';
import louvain from 'graphology-communities-louvain';
import { bidirectional } from 'graphology-shortest-path';

class InsightsService {
  private graph: Graph | null = null;
  private investigationId: InvestigationId | null = null;

  async loadInvestigation(investigationId: InvestigationId): Promise<void> {
    this.investigationId = investigationId;
    this.graph = new Graph({ multi: true, allowSelfLoops: false });

    const elements = await db.elements.where({ investigationId }).toArray();
    const links = await db.links.where({ investigationId }).toArray();

    // Ajouter les nœuds (exclure ceux dans un groupe fermé)
    for (const el of elements) {
      if (!el.parentGroupId) {
        this.graph.addNode(el.id, { label: el.label, element: el });
      }
    }

    // Ajouter les arêtes
    for (const link of links) {
      if (this.graph.hasNode(link.fromId) && this.graph.hasNode(link.toId)) {
        this.graph.addEdge(link.fromId, link.toId, { link });
      }
    }
  }

  // Insights
  
  getClusters(): Cluster[] {
    if (!this.graph) return [];
    
    const communities = louvain(this.graph);
    const clusterMap = new Map<number, ElementId[]>();
    
    for (const [nodeId, communityId] of Object.entries(communities)) {
      if (!clusterMap.has(communityId)) {
        clusterMap.set(communityId, []);
      }
      clusterMap.get(communityId)!.push(nodeId);
    }
    
    return Array.from(clusterMap.entries())
      .map(([id, elementIds]) => ({ id, elementIds, size: elementIds.length }))
      .filter(c => c.size > 1)
      .sort((a, b) => b.size - a.size);
  }

  getCentrality(): CentralityResult[] {
    if (!this.graph) return [];
    
    const degree = degreeCentrality(this.graph);
    
    return Object.entries(degree)
      .map(([id, score]) => ({
        elementId: id,
        degree: this.graph!.degree(id),
        score,
      }))
      .sort((a, b) => b.degree - a.degree)
      .slice(0, 20);
  }

  getBridges(): ElementId[] {
    if (!this.graph) return [];
    
    const betweenness = betweennessCentrality(this.graph);
    const threshold = 0.1; // À ajuster
    
    return Object.entries(betweenness)
      .filter(([_, score]) => score > threshold)
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id);
  }

  getIsolated(): ElementId[] {
    if (!this.graph) return [];
    
    return this.graph
      .nodes()
      .filter(id => this.graph!.degree(id) === 0);
  }

  findPaths(fromId: ElementId, toId: ElementId): ElementId[][] {
    if (!this.graph) return [];
    
    const path = bidirectional(this.graph, fromId, toId);
    
    if (!path) return [];
    
    // Pour l'instant, retourne juste le plus court chemin
    // TODO: implémenter tous les chemins si besoin
    return [path];
  }

  getNeighborhood(elementId: ElementId, depth: number = 1): ElementId[] {
    if (!this.graph || !this.graph.hasNode(elementId)) return [];
    
    const visited = new Set<string>([elementId]);
    let frontier = [elementId];
    
    for (let d = 0; d < depth; d++) {
      const newFrontier: string[] = [];
      for (const nodeId of frontier) {
        for (const neighbor of this.graph.neighbors(nodeId)) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            newFrontier.push(neighbor);
          }
        }
      }
      frontier = newFrontier;
    }
    
    return Array.from(visited);
  }

  detectSimilarLabels(): SimilarPair[] {
    if (!this.graph) return [];
    
    const nodes = this.graph.nodes();
    const pairs: SimilarPair[] = [];
    
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const label1 = this.graph.getNodeAttribute(nodes[i], 'label');
        const label2 = this.graph.getNodeAttribute(nodes[j], 'label');
        
        const similarity = this.levenshteinSimilarity(label1, label2);
        
        if (similarity > 0.8) {
          pairs.push({
            elementId1: nodes[i],
            elementId2: nodes[j],
            similarity,
          });
        }
      }
    }
    
    return pairs.sort((a, b) => b.similarity - a.similarity);
  }

  private levenshteinSimilarity(a: string, b: string): number {
    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;
    
    if (longer.length === 0) return 1;
    
    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];
    
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b[i - 1] === a[j - 1]) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[b.length][a.length];
  }
}

interface Cluster {
  id: number;
  elementIds: ElementId[];
  size: number;
}

interface CentralityResult {
  elementId: ElementId;
  degree: number;
  score: number;
}

interface SimilarPair {
  elementId1: ElementId;
  elementId2: ElementId;
  similarity: number;
}
```

---

## 8. Service d'import/export

### 8.1 Export ZIP

```typescript
import JSZip from 'jszip';

class ExportService {
  async exportInvestigation(investigationId: InvestigationId): Promise<Blob> {
    const zip = new JSZip();
    
    // Récupérer toutes les données
    const investigation = await db.investigations.get(investigationId);
    const elements = await db.elements.where({ investigationId }).toArray();
    const links = await db.links.where({ investigationId }).toArray();
    const views = await db.views.where({ investigationId }).toArray();
    const reports = await db.reports.where({ investigationId }).toArray();
    const assets = await db.assets.where({ investigationId }).toArray();
    
    // Manifest
    const manifest = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      investigation: {
        id: investigation!.id,
        name: investigation!.name,
      },
      counts: {
        elements: elements.length,
        links: links.length,
        assets: assets.length,
        views: views.length,
      },
    };
    
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));
    zip.file('investigation.json', JSON.stringify(investigation, null, 2));
    zip.file('elements.json', JSON.stringify(elements, null, 2));
    zip.file('links.json', JSON.stringify(links, null, 2));
    zip.file('views.json', JSON.stringify(views, null, 2));
    zip.file('reports.json', JSON.stringify(reports, null, 2));
    
    // Assets (fichiers)
    const assetsFolder = zip.folder('assets');
    const fileService = new FileService();
    
    for (const asset of assets) {
      const file = await fileService.getAssetFile(asset);
      const arrayBuffer = await file.arrayBuffer();
      assetsFolder!.file(`${asset.hash}.${this.getExtension(asset.filename)}`, arrayBuffer);
    }
    
    zip.file('assets.json', JSON.stringify(assets, null, 2));
    
    return zip.generateAsync({ type: 'blob' });
  }

  async exportAsGeoJSON(investigationId: InvestigationId): Promise<string> {
    const elements = await db.elements.where({ investigationId }).toArray();
    
    const features = elements
      .filter(el => el.geo !== null)
      .map(el => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [el.geo!.lng, el.geo!.lat],
        },
        properties: {
          id: el.id,
          label: el.label,
          tags: el.tags,
          ...Object.fromEntries(el.properties.map(p => [p.key, p.value])),
        },
      }));
    
    return JSON.stringify({
      type: 'FeatureCollection',
      features,
    }, null, 2);
  }

  async exportAsCSV(investigationId: InvestigationId): Promise<string> {
    const elements = await db.elements.where({ investigationId }).toArray();
    
    // Collecter toutes les clés de propriétés
    const allPropertyKeys = new Set<string>();
    for (const el of elements) {
      for (const prop of el.properties) {
        allPropertyKeys.add(prop.key);
      }
    }
    
    const headers = ['id', 'label', 'notes', 'tags', 'confidence', 'source', ...allPropertyKeys];
    
    const rows = elements.map(el => {
      const propMap = new Map(el.properties.map(p => [p.key, p.value]));
      return [
        el.id,
        el.label,
        el.notes,
        el.tags.join(';'),
        el.confidence ?? '',
        el.source,
        ...Array.from(allPropertyKeys).map(key => propMap.get(key) ?? ''),
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });
    
    return [headers.join(','), ...rows].join('\n');
  }

  private getExtension(filename: string): string {
    return filename.split('.').pop()?.toLowerCase() || 'bin';
  }
}
```

### 8.2 Import ZIP

```typescript
class ImportService {
  async importInvestigation(file: File): Promise<InvestigationId> {
    const zip = await JSZip.loadAsync(file);
    
    // Lire le manifest
    const manifestJson = await zip.file('manifest.json')?.async('string');
    if (!manifestJson) throw new Error('Invalid archive: missing manifest');
    
    const manifest = JSON.parse(manifestJson);
    
    // Vérifier la version
    if (!this.isCompatibleVersion(manifest.version)) {
      throw new Error(`Incompatible version: ${manifest.version}`);
    }
    
    // Lire les données
    const investigation = JSON.parse(await zip.file('investigation.json')!.async('string'));
    const elements = JSON.parse(await zip.file('elements.json')!.async('string'));
    const links = JSON.parse(await zip.file('links.json')!.async('string'));
    const views = JSON.parse(await zip.file('views.json')!.async('string'));
    const reports = JSON.parse(await zip.file('reports.json')!.async('string'));
    const assetsMeta = JSON.parse(await zip.file('assets.json')!.async('string'));
    
    // Générer un nouvel ID pour éviter les conflits
    const newInvestigationId = generateUUID();
    const idMap = new Map<string, string>();
    idMap.set(investigation.id, newInvestigationId);
    
    // Mapper tous les IDs
    for (const el of elements) {
      idMap.set(el.id, generateUUID());
    }
    for (const link of links) {
      idMap.set(link.id, generateUUID());
    }
    for (const asset of assetsMeta) {
      idMap.set(asset.id, generateUUID());
    }
    
    // Importer les assets d'abord
    const fileService = new FileService();
    await fileService.initialize();
    
    for (const asset of assetsMeta) {
      const ext = this.getExtension(asset.filename);
      const assetFile = zip.file(`assets/${asset.hash}.${ext}`);
      if (assetFile) {
        const arrayBuffer = await assetFile.async('arraybuffer');
        // Sauvegarder dans OPFS avec le nouvel ID
        // ...
      }
    }
    
    // Transformer et insérer
    investigation.id = newInvestigationId;
    investigation.createdAt = new Date(investigation.createdAt);
    investigation.updatedAt = new Date();
    
    const transformedElements = elements.map((el: any) => ({
      ...el,
      id: idMap.get(el.id),
      investigationId: newInvestigationId,
      parentGroupId: el.parentGroupId ? idMap.get(el.parentGroupId) : null,
      childIds: el.childIds.map((id: string) => idMap.get(id)),
      assetIds: el.assetIds.map((id: string) => idMap.get(id)),
      createdAt: new Date(el.createdAt),
      updatedAt: new Date(el.updatedAt),
      date: el.date ? new Date(el.date) : null,
      dateRange: el.dateRange ? {
        start: el.dateRange.start ? new Date(el.dateRange.start) : null,
        end: el.dateRange.end ? new Date(el.dateRange.end) : null,
      } : null,
    }));
    
    const transformedLinks = links.map((link: any) => ({
      ...link,
      id: idMap.get(link.id),
      investigationId: newInvestigationId,
      fromId: idMap.get(link.fromId),
      toId: idMap.get(link.toId),
      createdAt: new Date(link.createdAt),
      updatedAt: new Date(link.updatedAt),
      date: link.date ? new Date(link.date) : null,
      dateRange: link.dateRange ? {
        start: link.dateRange.start ? new Date(link.dateRange.start) : null,
        end: link.dateRange.end ? new Date(link.dateRange.end) : null,
      } : null,
    }));
    
    // Insérer en base
    await db.transaction('rw', 
      [db.investigations, db.elements, db.links, db.views, db.reports, db.assets],
      async () => {
        await db.investigations.add(investigation);
        await db.elements.bulkAdd(transformedElements);
        await db.links.bulkAdd(transformedLinks);
        // ... views, reports, assets
      }
    );
    
    return newInvestigationId;
  }

  async importCSV(
    investigationId: InvestigationId,
    file: File,
    mapping: CSVMapping
  ): Promise<ElementId[]> {
    const text = await file.text();
    const rows = this.parseCSV(text);
    
    if (rows.length < 2) throw new Error('CSV is empty');
    
    const headers = rows[0];
    const elementIds: ElementId[] = [];
    
    // Position de départ (inbox)
    let x = 100;
    let y = 100;
    const spacing = 150;
    const perRow = 10;
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowData = Object.fromEntries(headers.map((h, idx) => [h, row[idx]]));
      
      // Extraire le label
      const label = rowData[mapping.labelColumn] || `Import ${i}`;
      
      // Extraire les propriétés
      const properties: Property[] = mapping.propertyColumns.map(col => ({
        key: col,
        value: rowData[col] || null,
      })).filter(p => p.value !== null);
      
      // Extraire les tags
      const tags = mapping.tagsColumn && rowData[mapping.tagsColumn]
        ? rowData[mapping.tagsColumn].split(';').map((t: string) => t.trim())
        : [];
      
      // Position
      const position = {
        x: x + ((i - 1) % perRow) * spacing,
        y: y + Math.floor((i - 1) / perRow) * spacing,
      };
      
      const element = await new ElementRepository().create(
        investigationId,
        label,
        position,
        { properties, tags }
      );
      
      elementIds.push(element.id);
    }
    
    return elementIds;
  }

  private parseCSV(text: string): string[][] {
    // Implémentation simple, utiliser une lib si besoin (papaparse)
    const rows: string[][] = [];
    let current = '';
    let inQuotes = false;
    let row: string[] = [];
    
    for (const char of text) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        row.push(current);
        current = '';
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        if (current || row.length > 0) {
          row.push(current);
          rows.push(row);
          row = [];
          current = '';
        }
      } else {
        current += char;
      }
    }
    
    if (current || row.length > 0) {
      row.push(current);
      rows.push(row);
    }
    
    return rows;
  }

  private isCompatibleVersion(version: string): boolean {
    const [major] = version.split('.');
    return major === '1';
  }

  private getExtension(filename: string): string {
    return filename.split('.').pop()?.toLowerCase() || 'bin';
  }
}

interface CSVMapping {
  labelColumn: string;
  propertyColumns: string[];
  tagsColumn: string | null;
}
```

---

## 9. Utilitaires

### 9.1 Génération UUID

```typescript
function generateUUID(): string {
  return crypto.randomUUID();
}
```

### 9.2 Dates

```typescript
function serializeDate(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

function deserializeDate(str: string | null): Date | null {
  return str ? new Date(str) : null;
}
```

### 9.3 Couleurs

```typescript
const DEFAULT_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#6b7280', // gray
];

function getRandomColor(): string {
  return DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)];
}
```

---

## 10. Migrations

### 10.1 Stratégie

Dexie gère les migrations via les versions. Chaque changement de schéma incrémente la version.

```typescript
class InvestigationDatabase extends Dexie {
  constructor() {
    super('InvestigationTool');
    
    // Version 1 - Initial
    this.version(1).stores({
      investigations: 'id, name, createdAt, updatedAt',
      elements: 'id, investigationId, label, parentGroupId, *tags',
      links: 'id, investigationId, fromId, toId',
      assets: 'id, investigationId, hash',
      views: 'id, investigationId, name',
      reports: 'id, investigationId',
    });
    
    // Version 2 - Exemple d'ajout d'index
    // this.version(2).stores({
    //   elements: 'id, investigationId, label, parentGroupId, *tags, confidence',
    // });
    
    // Version 3 - Exemple de migration de données
    // this.version(3).stores({...}).upgrade(tx => {
    //   return tx.table('elements').toCollection().modify(el => {
    //     el.newField = 'defaultValue';
    //   });
    // });
  }
}
```

---

## 11. Tests — Structure suggérée

```typescript
// tests/repositories/elementRepository.test.ts
describe('ElementRepository', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  describe('create', () => {
    it('should create an element with default values', async () => {
      const repo = new ElementRepository();
      const element = await repo.create('inv-1', 'Test', { x: 0, y: 0 });
      
      expect(element.id).toBeDefined();
      expect(element.label).toBe('Test');
      expect(element.visual).toEqual(DEFAULT_ELEMENT_VISUAL);
    });
  });

  describe('createGroup', () => {
    it('should create a group and update children', async () => {
      const repo = new ElementRepository();
      const el1 = await repo.create('inv-1', 'A', { x: 0, y: 0 });
      const el2 = await repo.create('inv-1', 'B', { x: 100, y: 0 });
      
      const group = await repo.createGroup('inv-1', 'Group', [el1.id, el2.id], { x: 50, y: 50 });
      
      expect(group.isGroup).toBe(true);
      expect(group.childIds).toContain(el1.id);
      expect(group.childIds).toContain(el2.id);
      
      const updatedEl1 = await repo.getById(el1.id);
      expect(updatedEl1?.parentGroupId).toBe(group.id);
    });
  });
});
```

---

## 12. Checklist d'implémentation

### Phase 1 — Fondations
- [ ] Setup projet (Vite + React + TypeScript)
- [ ] Configuration Dexie
- [ ] Types de base
- [ ] Repositories (CRUD)
- [ ] FileService (OPFS)

### Phase 2 — Canvas de base
- [ ] Intégration React Flow ou tldraw
- [ ] Création d'éléments
- [ ] Création de liens
- [ ] Sélection et déplacement
- [ ] Panneau de détail

### Phase 3 — Métadonnées
- [ ] Propriétés libres
- [ ] Tags
- [ ] Apparence visuelle
- [ ] Attachement de fichiers

### Phase 4 — Recherche et filtres
- [ ] Intégration MiniSearch
- [ ] Barre de recherche (Ctrl+K)
- [ ] Filtres non-destructifs
- [ ] Focus (voisinage)

### Phase 5 — Insights
- [ ] Intégration Graphology
- [ ] Panneau d'insights
- [ ] Clusters
- [ ] Centralité
- [ ] Ponts
- [ ] Homonymes

### Phase 6 — Timeline
- [ ] Vue timeline
- [ ] Synchronisation avec canvas
- [ ] Filtrage temporel

### Phase 7 — Carte
- [ ] Intégration Leaflet
- [ ] Synchronisation avec canvas
- [ ] Mode split

### Phase 8 — Vues et groupes
- [ ] Vues sauvegardées
- [ ] Groupes manuels
- [ ] Dépliage/repliage

### Phase 9 — Import/Export
- [ ] Export ZIP
- [ ] Import ZIP
- [ ] Import CSV assisté
- [ ] Export GeoJSON, CSV, PNG

### Phase 10 — Rapport
- [ ] Mode rapport
- [ ] Sections
- [ ] Capture graphe
- [ ] Export PDF/Markdown

---

*Spécification technique — V1 — Janvier 2025*
