# ZeroNeurone

<p align="center">
  <img src="media/zeroneurone.png" alt="ZeroNeurone" width="400">
</p>

**Outil d'amplification cognitive pour analystes et enqueteurs**

Un tableau blanc infini avec des capacites d'analyse de graphe.

![Version](https://img.shields.io/badge/version-0.5.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![React](https://img.shields.io/badge/React-19-61dafb)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6)

## Philosophie

- **L'humain reste aux commandes** — Pas d'actions automatiques, Ni d'intelligence artificielle, suggestions uniquement sur demande
- **100% local par defaut** — IndexedDB + OPFS, fonctionne hors-ligne, les donnees ne partent jamais sans action explicite
- **Le visuel EST l'analyse** — Position spatiale, couleurs, formes portent un sens defini par l'utilisateur
- **Zero ontologie imposee** — Les utilisateurs creent leurs propres concepts, pas de types d'entites forces

## Fonctionnalites

### Canvas Interactif
- Creation d'elements par double-clic
- Liens entre elements par glisser-deposer
- Multi-selection et manipulation groupee
- Zoom et navigation fluides
- Personnalisation visuelle (couleurs, formes, tailles, icones)

### Gestion des Donnees
- **Elements** : Noeuds du graphe (personnes, entreprises, lieux, concepts, documents...)
- **Liens** : Relations entre elements avec metadonnees completes
- **Proprietes** : Paires cle/valeur personnalisables
- **Tags** : Organisation libre et filtrage
- **Pieces jointes** : Images, PDF, documents avec extraction de texte

### Analyse de Graphe
- Detection de communautes (Louvain)
- Centralite (degre, intermediaire)
- Identification des ponts entre clusters
- Plus court chemin entre elements
- Mode focus (voisinage a N niveaux)

### Vues Multiples
- **Canvas** : Vue graphe principale
- **Carte** : Visualisation geographique (Leaflet)
- **Timeline** : Frise chronologique des evenements
- **Vue partagee** : Combinaison carte/canvas

### Collaboration Temps Reel
- Synchronisation via WebSocket avec chiffrement E2E (AES-256-GCM)
- Partage par lien avec cle dans le fragment URL (jamais envoyee au serveur)
- Curseurs et selections des collaborateurs visibles
- Synchronisation des pieces jointes
- Detection de presence avec heartbeat

### Export & Import
- Export ZIP complet (JSON + assets)
- Export PNG/PDF du canvas
- Import CSV pour donnees tabulaires
- Import GraphML pour donnees de graphes
- Rapports personnalisables

## Stack Technique

| Couche | Technologie |
|--------|-------------|
| Framework | React 19 + TypeScript + Vite |
| Etat | Zustand |
| Stockage | Dexie.js (IndexedDB) + OPFS |
| Canvas | React Flow |
| Carte | Leaflet + React-Leaflet |
| Analyse | Graphology |
| Recherche | MiniSearch |
| Sync | Yjs + y-websocket + y-indexeddb |
| Crypto | Web Crypto API (AES-256-GCM) |
| Style | Tailwind CSS |

## Installation

```bash
# Cloner le repo
git clone https://github.com/votre-username/zeroneurone.git
cd zeroneurone

# Installer les dependances
npm install

# Lancer en developpement
npm run dev
```

L'application sera accessible sur `http://localhost:5173`

## Utilisation

### Raccourcis Clavier

| Action | Raccourci |
|--------|-----------|
| Recherche | `Ctrl+K` |
| Supprimer selection | `Delete` / `Backspace` |
| Annuler | `Ctrl+Z` |
| Retablir | `Ctrl+Shift+Z` |
| Mode focus | `F` |
| Vue Canvas | `1` |
| Vue Carte | `2` |
| Vue Partagee | `3` |
| Vue Timeline | `4` |

### Interactions Canvas

| Action | Resultat |
|--------|----------|
| Double-clic sur le canvas | Creer un element |
| Glisser d'element a element | Creer un lien |
| Glisser d'element vers le vide | Creer un nouvel element lie |
| Clic droit | Menu contextuel |
| Molette | Zoom |
| Clic molette + glisser | Pan |

### Collaboration

1. Ouvrir une enquete
2. Cliquer sur "Partager" dans la barre d'outils
3. Configurer l'URL du serveur de signalisation (une seule fois)
4. Copier le lien de partage
5. Les collaborateurs ouvrent le lien pour rejoindre

Le lien contient :
- L'ID de l'enquete (dans le path)
- L'URL du serveur (query param)
- La cle de chiffrement (dans le fragment `#key=...`, jamais envoyee au serveur)

## Architecture

```
src/
├── components/
│   ├── canvas/          # Canvas et elements graphiques
│   ├── map/             # Vue carte (Leaflet)
│   ├── timeline/        # Vue chronologique
│   ├── panels/          # Panneaux lateraux
│   ├── collaboration/   # UI de collaboration
│   ├── modals/          # Dialogues modaux
│   └── common/          # Composants partages
├── stores/              # Stores Zustand
│   ├── investigationStore.ts   # Donnees (elements, liens, assets)
│   ├── selectionStore.ts       # Etat de selection
│   ├── viewStore.ts            # Viewport, filtres, mode d'affichage
│   ├── uiStore.ts              # Etat UI (modals, panels, toasts)
│   ├── syncStore.ts            # Etat de synchronisation
│   └── insightsStore.ts        # Cache d'analyse de graphe
├── db/
│   ├── database.ts             # Configuration Dexie
│   └── repositories/           # CRUD par entite
├── services/
│   ├── syncService.ts          # Gestion Y.Doc et providers
│   ├── cryptoService.ts        # Chiffrement E2E
│   ├── searchService.ts        # Integration MiniSearch
│   ├── insightsService.ts      # Analyse Graphology
│   ├── fileService.ts          # Gestion OPFS
│   ├── importService.ts        # Import ZIP/CSV
│   └── exportService.ts        # Export ZIP/PNG/PDF
├── types/                      # Types TypeScript
└── utils/                      # Utilitaires
```

### Stockage

- **Metadonnees** (elements, liens, vues) : IndexedDB via Dexie
- **Fichiers binaires** (assets) : OPFS avec deduplication SHA-256
- **Synchronisation** : Y.Doc avec persistence IndexedDB locale
- **Index de recherche** : MiniSearch, reconstruit au chargement

### Securite Collaboration

```
┌─────────────┐         ┌─────────────────┐         ┌─────────────┐
│  Client A   │◄───────►│ Serveur Signal  │◄───────►│  Client B   │
│             │  Donnees│   (y-websocket) │  Donnees│             │
│ Cle: xxxxx  │ chiffrees    Relais      │ chiffrees│ Cle: xxxxx  │
└─────────────┘         └─────────────────┘         └─────────────┘
```

- Chiffrement de bout en bout (E2E) avec AES-256-GCM
- Cle de chiffrement generee cote client
- Cle transmise uniquement via fragment URL (`#key=...`)
- Le serveur de signalisation ne voit que des donnees chiffrees
- Aucune donnee en clair ne transite par le serveur

## Developpement

```bash
# Developpement avec hot-reload
npm run dev

# Verification TypeScript
npx tsc --noEmit

# Linting
npm run lint

# Build production
npm run build

# Previsualisation du build
npm run preview
```

### Serveur de Signalisation

Pour la collaboration, vous pouvez utiliser :

```bash
# Serveur y-websocket inclus
npm run sync-server
```

Ou deployer votre propre serveur y-websocket.

## Modele de Donnees

### Element
```typescript
{
  id: UUID
  investigationId: UUID
  label: string
  notes: string
  tags: string[]
  properties: Property[]
  confidence: number | null      // 0-100
  source: string
  date: Date | null
  dateRange: { start, end } | null
  position: { x, y }
  geo: { lat, lng } | null
  visual: {
    color: string
    borderColor: string
    shape: 'rectangle' | 'ellipse' | 'diamond' | 'hexagon'
    size: 'small' | 'medium' | 'large'
    icon: string | null
    image: string | null
  }
  assetIds: string[]
  isGroup: boolean
  parentGroupId: UUID | null
  childIds: UUID[]
}
```

### Link
```typescript
{
  id: UUID
  investigationId: UUID
  fromId: UUID
  toId: UUID
  label: string
  notes: string
  tags: string[]
  properties: Property[]
  directed: boolean
  direction: 'none' | 'forward' | 'backward' | 'both'
  confidence: number | null
  visual: {
    color: string
    style: 'solid' | 'dashed' | 'dotted'
    thickness: number
  }
  curveOffset: { x, y }
}
```

## Roadmap

- [ ] Analyse temporelle avancee
- [ ] Templates d'enquete
- [ ] Plugins et extensibilite
- [ ] Application desktop (Tauri)
- [ ] Mode presentation

## Contribuer

Les contributions sont les bienvenues ! N'hesitez pas a ouvrir une issue ou une pull request.

## Licence

[MIT](LICENSE) - Yann PILPRÉ 2026
