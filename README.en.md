# ZeroNeurone

<p align="center">
  <img src="media/zeroneurone.png" alt="ZeroNeurone" width="400">
</p>

**Cognitive amplification tool for analysts and investigators**

An infinite whiteboard with graph-analysis capabilities.

*Language: [Français](README.md) | English*

![Version](https://img.shields.io/badge/version-2.42.5-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![React](https://img.shields.io/badge/React-19-61dafb)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6)
![PWA](https://img.shields.io/badge/PWA-ready-5A0FC8)
![i18n](https://img.shields.io/badge/i18n-11%20languages-orange)

## Philosophy

- **The human stays in control** — No automatic actions, no artificial intelligence; suggestions only on demand
- **100% local by default** — IndexedDB + OPFS, works offline, data never leaves without an explicit action
- **The visual IS the analysis** — Spatial position, colours and shapes carry meaning defined by the user
- **Zero imposed ontology** — Users create their own concepts, no forced entity types

## Features

### Interactive Canvas
- Create elements by double-clicking
- Link elements by drag-and-drop
- Multi-selection and group manipulation
- Smooth zoom and navigation
- Visual customisation (colours, shapes, sizes, icons)
- Nested visual groups
- Annotations (sticky notes)
- **Canvas tabs**: thematic spaces per hypothesis, actor type, period (max 10 per dossier)
- Ghost elements: elements from other tabs connected to the current tab, shown translucent
- Context menu with selection actions and tab management
- Minimap for quick navigation
- Magnetic alignment grid

### Data Management
- **Elements**: graph nodes (people, companies, places, concepts, documents…)
- **Links**: relationships between elements with full metadata
- **Properties**: customisable key/value pairs
- **Tags**: free organisation and filtering
- **Attachments**: images, PDF, documents with text extraction (EXIF, PDF/DOCX/XLSX metadata)
- **Markdown description**: full support with tables, anchor links, code, quotes

### Graph Analysis
- Community detection (Louvain)
- Centrality (degree, betweenness)
- Bridge identification between clusters (Tarjan O(V+E))
- Shortest path between elements
- Focus mode (N-level neighbourhood)
- Isolated-node detection
- Label-similarity analysis

### Multiple Views
- **Canvas**: main graph view
- **Map**: geographic visualisation (MapLibre GL JS) with satellite view
- **Timeline**: virtualised chronological view (10k+ elements)

### Real-time Collaboration
- Synchronisation over WebSocket with E2E encryption (AES-256-GCM)
- Link sharing with the key in the URL fragment (never sent to the server)
- **Asynchronous mode**: collaborators work at different times, data buffered for 7 days
- Collaborators' cursors and selections visible
- Attachment synchronisation
- Canvas-tab synchronisation (names, members, order — viewport stays local per user)
- Presence detection with heartbeat
- Optimised incremental sync
- Hashed Room ID (the server cannot correlate sessions)

### Export & Import
- Full ZIP export (JSON + assets)
- High-resolution PNG export (configurable zoom/scale)
- Native SVG export (vector)
- PDF export of the canvas
- CSV export (with positions/groups)
- Interactive HTML export (report + navigable graph, light/dark theme, TOC, stats)
- CSV import for tabular data
- GraphML / GEXF (Gephi) / Gephi Lite JSON import for graph data
- Excalidraw import
- ANX (i2 Analyst's Notebook - XML) and ANB (i2 Analyst's Notebook - binary) import
- STIX 2.1 import (cyber threat intelligence)
- OSINT Industries, Graph Palette, PredicaGraph, OSINTracker import
- GEDCOM 5.5.1/7.0 and GeneWeb import for genealogical data (name, dates, places, occupation, nickname, title, notes)
- ZIP import (full restore with tabs)
- Import into current dossier (merge with visual placement)
- **JSON mapping import**: an assistant to map any JSON's fields onto elements — auto-detection (record source, label, date/country/geo/identifiers), linked sub-elements, ID-reference links and **pivot nodes** (shared value), media as attachments, geo polygons, **multi-condition filter** + cap, reusable **templates** (exportable); also via direct paste (Ctrl+V) onto the canvas
- Report panel (Markdown writing with references to elements)
- Synthesis generation (automatic report with graph analysis)
- [Documented JSON import format](docs/json-import-format-en.md) ([FR](docs/json-import-format-fr.md))

### Automatic Layouts
- Force-directed (clusters)
- Hierarchical (trees, org charts)
- Circular
- Grid
- Scatter

### At-rest Encryption
- Encryption of all local data (IndexedDB + OPFS files)
- AES-256-GCM for files, XSalsa20-Poly1305 for records
- DEK/KEK architecture with PBKDF2-SHA256 derivation (600k iterations)
- Session lock (`Alt+L`) without closing the browser
- Encrypted ZIP export with optional password
- Unrecoverable password — no backdoor
- [Technical documentation](docs/encryption-en.md) ([FR](docs/encryption-fr.md))

### PWA & Offline
- Install on mobile and desktop
- Works 100% offline
- Smart caching of OpenStreetMap tiles
- Service Worker with automatic updates

### Accessibility (WCAG AA)
- ARIA labels on all interactive controls
- Full keyboard navigation
- Focus trap in modals
- Skip link for quick access to content
- Sufficient contrast

### Internationalisation
11 supported languages:
- Français (fr)
- English (en)
- Español (es)
- Deutsch (de)
- Català (ca)
- Euskara (eu)
- Italiano (it)
- Polski (pl)
- Português (pt)
- Українська (ua)
- Nederlands (nl)

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | React 19 + TypeScript + Vite |
| State | Zustand |
| Storage | Dexie.js (IndexedDB) + OPFS |
| Canvas | React Flow |
| Map | MapLibre GL JS |
| Analysis | Graphology |
| Search | MiniSearch |
| Sync | Yjs + y-websocket + y-indexeddb |
| Collab crypto | Web Crypto API (AES-256-GCM) |
| At-rest crypto | tweetnacl (XSalsa20-Poly1305) + Web Crypto (AES-256-GCM) |
| PWA | vite-plugin-pwa |
| Style | Tailwind CSS |
| E2E tests | Playwright |

## Installation

```bash
# Clone the repo
git clone https://github.com/your-username/zeroneurone.git
cd zeroneurone

# Install dependencies
npm install

# Run in development
npm run dev
```

The app will be available at `http://localhost:5173`

## Usage

### Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Search | `Ctrl+K` |
| Copy | `Ctrl+C` |
| Cut | `Ctrl+X` |
| Paste | `Ctrl+V` |
| Duplicate | `Ctrl+D` |
| Undo | `Ctrl+Z` |
| Redo | `Ctrl+Shift+Z` |
| Delete selection | `Delete` / `Backspace` |
| Focus mode | `F` |
| New element | `E` |
| New group | `G` |
| New annotation | `N` |
| Canvas view | `1` |
| Map view | `2` |
| Timeline view | `3` |

### Canvas Interactions

| Action | Result |
|--------|--------|
| Double-click on the canvas | Create an element |
| Drag from element to element | Create a link |
| Drag from element to empty space | Create a new linked element |
| Right-click | Context menu |
| Wheel | Zoom |
| Middle-click + drag | Pan |

### Collaboration

1. Open a dossier
2. Click "Share" in the toolbar
3. Configure the signalling server URL (once)
4. Enable asynchronous mode if needed (collaborators working at different times)
5. Copy the share link
6. Collaborators open the link to join

> **Important**: in asynchronous mode, keep the share link. It is the only way to rejoin the session and decrypt the data.

See the [documentation](https://doc.zeroneurone.com) for details.

## Architecture

```
src/
├── components/
│   ├── canvas/          # Canvas and graph elements
│   ├── map/             # Map view (MapLibre GL JS)
│   ├── timeline/        # Chronological view
│   ├── panels/          # Side panels
│   ├── collaboration/   # Collaboration UI
│   ├── modals/          # Modal dialogs
│   └── common/          # Shared components
├── stores/              # Zustand stores
├── db/                  # Dexie config + repositories
├── services/            # Sync, crypto, search, insights, files, import/export
├── workers/             # Web Workers (analysis, layout)
├── i18n/                # Translations (11 languages)
├── types/               # TypeScript types
└── utils/               # Utilities
```

### Storage

- **Metadata** (elements, links, views): IndexedDB via Dexie
- **Binary files** (assets): OPFS with SHA-256 deduplication
- **Synchronisation**: Y.Doc with local IndexedDB persistence
- **At-rest encryption**: Dexie middleware (XSalsa20-Poly1305) + OPFS (AES-256-GCM), opt-in via password
- **Search index**: MiniSearch, rebuilt on load

### Collaboration Security

- End-to-end encryption (E2E) with AES-256-GCM
- Encryption key generated client-side
- Key transmitted only via the URL fragment (`#key=...`)
- The signalling server only ever sees encrypted data
- No cleartext data passes through the server

## Development

```bash
npm run dev          # Development with hot-reload
npm run typecheck    # TypeScript check
npm run test:e2e     # E2E tests
npm run lint         # Linting
npm run build        # Production build
npm run preview      # Preview the build
```

### Signalling Server

For collaboration you can use the bundled y-websocket server (`npm run sync-server`) or deploy your own.

## Roadmap (selected)

- **v1.0 — Stabilisation** ✓ (E2E tests, PWA, WCAG AA, i18n, user docs, STIX2 import)
- **v2.0 — Asynchronous collaboration** ✓ (offset work, 7-day buffer, hashed room ID)
- **v2.8 — Canvas tabs** ✓
- **v2.12 — Plugin system** ✓ (slot-based registry, [developer docs](docs/plugin-development-en.md))
- **v2.17 — At-rest encryption** ✓ (DEK/KEK, session lock, encrypted ZIP)
- **v2.42 — JSON mapping import** ✓ (field mapping, linked sub-elements, pivot nodes, ID-reference links, media attachments, multi-condition filter + cap, reusable templates, native-format recognition on paste)
- **Future ideas**: custom theming, presentation mode, WebGL large-graph view (Sigma + graphology) for very large datasets

## Contributing

Contributions are welcome! Feel free to open an issue or a pull request.

## License

[MIT](LICENSE) - Yann PILPRÉ 2026
