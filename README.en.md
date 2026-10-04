# ZeroNeurone

<p align="center">
  <img src="media/zeroneurone.png" alt="ZeroNeurone" width="400">
</p>

**Cognitive amplification tool for analysts and investigators**

An infinite whiteboard with graph-analysis capabilities.

*Language: [Français](README.md) | English*

![Version](https://img.shields.io/badge/version-2.59.1-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![React](https://img.shields.io/badge/React-19-61dafb)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6)
![PWA](https://img.shields.io/badge/PWA-ready-5A0FC8)
![i18n](https://img.shields.io/badge/i18n-11%20languages-orange)

User documentation: [doc.zeroneurone.com](https://doc.zeroneurone.com)

## Philosophy

- **The human stays in control** — no automatic actions, no artificial intelligence; suggestions only on demand.
- **100% local by default** — IndexedDB + OPFS, works offline, data never leaves without an explicit action. Two exceptions, both triggered by the user: map tiles and place search (OpenStreetMap/Nominatim).
- **The visual is the analysis** — position, colours and shapes carry the meaning the user gives them.
- **Zero imposed ontology** — users create their own concepts; no entity type is forced.

## Features

### Canvas
- Create elements by double-clicking, links by drag and drop
- Multi-selection, copy/paste, alignment, automatic layouts (force, hierarchical, circular, grid, scatter)
- Customisable appearance: colours, shapes, sizes, Lucide icons or your own SVG icons
- Nested groups, annotations, minimap, snapping grid
- **Tabs**: up to 10 thematic spaces per dossier (hypothesis, actor, period); elements from other tabs linked to the current one show as ghosts
- Undo / redo for every operation, element merges included

### Data
- **Elements and links** with Markdown notes, tags, typed properties, source, dates, geolocation (point or area)
- **Tag sets**: appearance and properties bound to a tag, exported with the dossier
- **Attachments**: images, PDF, documents, EML emails, with preview and text and metadata extraction (EXIF, PDF/DOCX/XLSX, email headers)
- **Information evaluation**, chosen per dossier:
  - confidence from 0 to 100%;
  - Europol 4x4 grid (Article 29 of Regulation (EU) 2016/794): source reliability A/B/C/X and information accuracy 1 to 4;
  - NATO Admiralty 6x6 code.

### Views
- **Canvas**: main graph
- **Map**: MapLibre GL JS, vector and satellite base maps, 3D buildings, time navigation
- **Timeline**: virtualised chronology (10,000+ elements)
- **Matrix**: sortable, filterable and editable table, CSV export

### Search, filters and queries
- Full-text search (`Ctrl+K`)
- Filters by tags, properties, confidence or grading, dates; saved views
- **ZNQuery**: structured query language (`tag = "person" AND confidence > 50`), with a visual builder and saved queries

### Graph analysis
- Communities (Louvain), centrality (degree, betweenness), bridges between clusters
- Shortest path, focus mode on the N-level neighbourhood, isolated nodes
- Label similarity to spot duplicates

### Report and synthesis
- Report written in Markdown with clickable references to elements
- Synthesis generated from the graph (HTML, Markdown, JSON)
- Interactive HTML export (report + navigable graph) and printing through the browser

### Import and export
- **Native**: ZIP (data + attachments, optional encryption) and JSON ([documented format](docs/json-import-format-en.md))
- **Graphs**: CSV, GraphML, GEXF, Gephi Lite, Excalidraw, Mermaid (import, and copy a selection as Mermaid)
- **i2 Analyst's Notebook**: ANX and ANB import, ANX export
- **Intelligence and OSINT**: STIX 2.1, OSINT Industries, Graph Palette, PredicaGraph, OSINTracker
- **Specialised**: GEDCOM 5.5.1/7.0 and GeneWeb (genealogy), FEC (French accounting entries file, as a financial-flow graph)
- **Any JSON** through a mapping assistant with reusable templates; also by pasting onto the canvas
- **Images**: high-resolution PNG, SVG; **geography**: GeoJSON
- Import into the open dossier, with visual placement

### Collaboration
- Real-time sync (Yjs), end-to-end encrypted (AES-256-GCM)
- Sharing by link: the key stays in the URL fragment and is never sent to the server
- Async mode: changes are kept for 7 days for absent collaborators
- Participants' cursors, selections and presence; attachments and tabs are synced
- Hashed room ID: the server cannot correlate sessions

### Security and retention
- Optional **at-rest encryption** of all local data: XSalsa20-Poly1305 for records, AES-256-GCM for files, PBKDF2-SHA256 with 600,000 iterations. Session lock with `Alt+L`. Unrecoverable password, no back door. [Technical documentation](docs/encryption-en.md)
- **Retention**: lifetime per dossier, with a warning, read-only, proposed deletion or redaction on expiry

### Extensions
Slot-based plugin system (menus, panels, header, shortcuts, report, import/export). Without plugins, no impact on the application. [Developer guide](docs/plugin-development-en.md)

### Application
- Installable PWA, works fully offline
- 11 languages: French, English, Spanish, German, Italian, Portuguese, Dutch, Polish, Ukrainian, Basque, Catalan
- Guided tutorial and sample dossier
- Partial accessibility: every modal manages focus, buttons have an accessible name, the matrix is announced as a table. The graph itself (canvas, map, timeline) is not yet keyboard-navigable; WCAG AA conformance is not reached.

## Tech stack

| Layer | Technology |
|-------|------------|
| Framework | React 19 + TypeScript + Vite |
| State | Zustand |
| Storage | Dexie.js (IndexedDB) + OPFS |
| Canvas | React Flow |
| Map | MapLibre GL JS |
| Analysis | Graphology |
| Search | MiniSearch |
| Sync | Yjs + y-websocket |
| Cryptography | Web Crypto API (AES-256-GCM), tweetnacl (XSalsa20-Poly1305) |
| Style | Tailwind CSS |
| Tests | Vitest, Playwright |

## Installation

```bash
git clone https://github.com/MeltingBot/zeroneurone.git
cd zeroneurone
npm install
npm run dev
```

The application runs at `http://localhost:5173`.

For deployment, `docker-compose.yml` provides the application and the relay server behind Traefik.

## Usage

### Keyboard shortcuts

| Action | Shortcut |
|--------|----------|
| Search | `Ctrl+K` |
| Copy / Cut / Paste | `Ctrl+C` / `Ctrl+X` / `Ctrl+V` |
| Duplicate | `Ctrl+D` |
| Undo / Redo | `Ctrl+Z` / `Ctrl+Shift+Z` |
| Delete selection | `Delete` / `Backspace` |
| New element / group / annotation | `E` / `G` / `N` |
| Canvas / Map / Timeline / Matrix view | `1` / `2` / `3` / `4` |
| Lock the session (encryption) | `Alt+L` |

### Canvas

| Action | Result |
|--------|--------|
| Double-click on the canvas | Create an element |
| Drag from one element to another | Create a link |
| Drag from an element to empty space | Create a linked element |
| Right-click | Context menu |
| Mouse wheel | Zoom |

### Collaboration

1. Open a dossier and click **Share**
2. Enter the sync server URL (once)
3. Turn on async mode if collaborators work at different times
4. Send the share link; collaborators open it to join

> In async mode, keep the share link: it is the only way to join the session and decrypt the data.

The bundled relay server (`relay-server.js`) handles real-time and async mode:

```bash
npm run relay-server   # ws://localhost:4444
```

## Architecture

### Storage
- **Metadata** (elements, links, views): IndexedDB via Dexie
- **Files**: OPFS, deduplicated by SHA-256
- **Sync**: Y.Doc with local IndexedDB persistence
- **Search index**: MiniSearch, rebuilt on load

### Collaboration security

```
┌─────────────┐            ┌─────────────────┐            ┌─────────────┐
│  Client A   │◄──────────►│  Relay server   │◄──────────►│  Client B   │
│ Key: xxxxx  │ encrypted  │ (only sees      │ encrypted  │ Key: xxxxx  │
└─────────────┘            │  ciphertext)    │            └─────────────┘
                           └─────────────────┘
```

- Key generated on the client, passed only in the URL fragment (`#key=...`)
- The server only relays encrypted data

## Development

```bash
npm run dev                            # development server
npx tsc --noEmit -p tsconfig.app.json  # TypeScript check
npm run test:unit                      # unit tests (Vitest)
npm run test:e2e                       # end-to-end tests (Playwright)
npm run lint                           # ESLint
npm run build                          # production build
```

The data format is described in [docs/json-import-format-en.md](docs/json-import-format-en.md).

## Contributing

Contributions are welcome: open an issue or a pull request.

## License

[MIT](LICENSE) - Yann PILPRÉ 2026
