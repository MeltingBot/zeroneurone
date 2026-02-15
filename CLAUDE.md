# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**zeroneurone** is a cognitive amplification tool for analysts and investigators - an infinite whiteboard with graph analysis capabilities. Think: Excalidraw's simplicity + Anacrim's analytical depth.

Key philosophy:
- **Human stays in control** - No automatic actions, suggestions only on demand
- **100% local by default** - IndexedDB + OPFS, works offline, data never leaves without explicit action
- **Visual IS the analysis** - Spatial position, colors, shapes all carry meaning defined by the user
- **Zero imposed ontology** - Users create their own concepts, no forced entity types

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | React 18 + TypeScript + Vite |
| State | Zustand |
| Storage | Dexie.js (IndexedDB) + OPFS |
| Canvas | React Flow |
| Map | Leaflet + React-Leaflet |
| Graph Analysis | Graphology |
| Search | MiniSearch |
| Export | JSZip, jsPDF, html2canvas |
| Style | Tailwind CSS |

## Project Structure

```
src/
├── components/
│   ├── canvas/          # Canvas and graph elements (ElementNode, LinkEdge)
│   ├── map/             # Map view (Leaflet integration)
│   ├── timeline/        # Timeline view
│   ├── panels/          # Side panels (detail, insights, filters, views)
│   ├── report/          # Report mode components
│   ├── modals/          # Modal dialogs
│   └── common/          # Shared components
├── stores/              # Zustand stores
│   ├── investigationStore.ts   # Investigation data (elements, links, assets)
│   ├── selectionStore.ts       # Canvas selection state
│   ├── viewStore.ts            # Viewport, filters, display mode
│   ├── uiStore.ts              # UI state (modals, panels, toasts)
│   └── insightsStore.ts        # Graph analysis cache
├── db/
│   ├── database.ts             # Dexie configuration
│   └── repositories/           # CRUD per entity
├── services/
│   ├── searchService.ts        # MiniSearch integration
│   ├── insightsService.ts      # Graphology analysis
│   ├── fileService.ts          # OPFS file handling
│   ├── importService.ts        # ZIP/CSV import
│   └── exportService.ts        # ZIP/PNG/PDF export
├── types/index.ts              # TypeScript types
├── utils/                      # Utilities
└── hooks/                      # Custom React hooks
```

## Key Domain Concepts

- **Investigation**: A complete inquiry/case containing elements, links, views, and reports
- **Element**: A node in the graph (person, company, location, concept, document, etc.)
- **Link**: A relationship between two elements (first-class citizen with its own metadata)
- **Asset**: File attached to an element (stored in OPFS, deduplicated by SHA-256)
- **View**: Saved combination of filters, viewport, and hidden elements
- **Insights**: Computed graph analysis (clusters, centrality, bridges, isolated nodes)

## Commands

```bash
# Development
npm run dev              # Start dev server

# Build
npm run build            # Production build
npm run preview          # Preview production build

# Type checking
npm run typecheck        # Run TypeScript compiler check
```

## Architecture Decisions

### Storage Strategy
- **Metadata** (elements, links, views): IndexedDB via Dexie
- **Binary files** (assets): OPFS with SHA-256 hash for deduplication
- **Search index**: MiniSearch, rebuilt on investigation load

### State Management Pattern
Zustand stores are organized by concern:
- `investigationStore`: Source of truth for investigation data
- `selectionStore`: What's selected on canvas
- `viewStore`: How things are displayed (viewport, filters, focus mode)
- `uiStore`: UI state (modals, panels, toasts, active tool)
- `insightsStore`: Cached graph analysis results

### Graph Analysis
Graphology library for:
- **Clusters**: Louvain community detection
- **Centrality**: Degree, betweenness centrality
- **Bridges**: Nodes connecting otherwise separate clusters
- **Paths**: Shortest path between two elements
- **Neighborhood**: N-level neighbor extraction for focus mode

## Design Guidelines (STRICT)

### What NOT to do
- No emojis in UI
- No "Welcome!", "Great job!", "Oops!" messages
- No `rounded-xl`, `rounded-2xl` (use `rounded` only)
- No `shadow-lg`, `shadow-xl` (except modals)
- No gradients
- No decorative animations
- No colored icons
- No multi-colored buttons

### What TO do
- Dense information display
- Contrast through typography (size, weight), not colors
- Functional colors only (selection, alerts, states)
- Fine borders (1px, neutral colors)
- Monochrome icons (Lucide React, 16px default)
- Short labels (1-3 words)
- One blue primary button per screen max

### Color Palette
```css
--bg-primary: #ffffff;
--bg-secondary: #f9fafb;
--bg-tertiary: #f3f4f6;
--text-primary: #111827;
--text-secondary: #6b7280;
--text-tertiary: #9ca3af;
--border-default: #e5e7eb;
--accent: #2563eb;
--success: #059669;
--warning: #d97706;
--error: #dc2626;
```

### Typography
System font stack only: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
- Page title: `text-lg font-semibold` (18px)
- Section title: `text-sm font-semibold` (14px)
- Label: `text-sm font-medium`
- Body: `text-sm`
- Hint: `text-xs text-secondary`

## Implementation Phases

The project follows a phased implementation (see `guide-implementation-v1.md`):
1. Foundations (types, Dexie, OPFS, repositories)
2. Home page (investigation list)
3. Canvas basics (React Flow, element creation, selection)
4. Links (edge creation, handles)
5. Detail panel (metadata editing)
6. File attachments (drag & drop, OPFS storage)
7. Search (MiniSearch, Ctrl+K)
8. Filters and views
9. Insights (Graphology analysis)
10. Timeline
11. Map view
12. Import/Export
13. Report mode
14. Polish and optimizations

## Key Interactions

| Action | Result |
|--------|--------|
| Double-click canvas | Create element |
| Drag from element to element | Create link |
| Drag from element to void | Create new linked element |
| Ctrl+K | Open search |
| Delete/Backspace | Delete selection |
| Ctrl+Z / Ctrl+Shift+Z | Undo/Redo |
| F | Focus mode (neighborhood) |
| 1/2/3/4 | Switch view (Canvas/Map/Split/Timeline) |

## Data Model Highlights

Elements and Links are first-class citizens with:
- Free-form properties (key/value pairs)
- Tags (user-defined)
- Confidence level (0-100)
- Source attribution
- Dates (single date or date range for timeline)
- Geo coordinates (for map view)
- Custom visual appearance (color, shape, size)

All IDs are UUID v4. Positions are `{x, y}` coordinates on the canvas.

## Plugin System

Slot-based extension system. Plugins register into named slots; components consume slots via `usePlugins()`. Empty slots = nothing rendered, zero overhead.

### Architecture
```
src/
├── types/plugins.ts          # All plugin types (PluginSlots, MenuContext, etc.)
├── plugins/
│   ├── pluginRegistry.ts     # registerPlugin(), getPlugins(), clearAllPlugins()
│   └── usePlugins.ts         # React hook (useSyncExternalStore)
```

### Available Slots
| Slot | Type | Consumed by |
|------|------|-------------|
| `header:right` | `ComponentType[]` | InvestigationPage header |
| `home:actions` | `ComponentType[]` | HomePage (landing footer + list toolbar) |
| `home:banner` | `ComponentType[]` | HomePage (full-width, above hero/list content) |
| `home:card` | `HomeCardRegistration[]` | LandingSection "Extensions" section |
| `panel:right` | `PanelPluginRegistration[]` | SidePanel tabs |
| `contextMenu:element` | `ContextMenuExtension[]` | CanvasContextMenu (when selection) |
| `contextMenu:link` | `ContextMenuExtension[]` | CanvasContextMenu |
| `contextMenu:canvas` | `ContextMenuExtension[]` | CanvasContextMenu (always) |
| `report:toolbar` | `ComponentType<ReportToolbarPluginProps>[]` | ReportPanel toolbar |
| `report:sectionActions` | `ComponentType<ReportSectionPluginProps>[]` | ReportSectionEditor |
| `keyboard:shortcuts` | `KeyboardShortcut[]` | InvestigationPage keydown |
| `export:hooks` | `ExportHook[]` | exportService.exportToZip() |
| `import:hooks` | `ImportHook[]` | importService.importFromZip() |

### Plugin Data Storage
Generic `pluginData` table in Dexie (v6): `{ pluginId, investigationId, key, value }` with compound index `[pluginId+investigationId+key]`.

### Key Patterns
- Plugin errors never crash the app: always `try/catch` with `console.warn`
- Native shortcuts take priority over plugin shortcuts
- Context menu icons resolved dynamically via `icons` from `lucide-react`
- `useSyncExternalStore` for React reactivity

## Release Process

When the user asks for a **bump** (feat, new feature) or **minibump** (fix, patch):

### Pre-release check
- If work was done on a feature branch, ask the user whether to merge into `main` before releasing (merge commit or squash).

### Bump (feat) — minor/major version
1. Bump version in `package.json`
2. Update `CHANGELOG.md` with new section
3. Add/update i18n translations for any new UI strings (11 languages)
4. Update user documentation at `doc.zeroneurone.com` if applicable
5. Update version badge in `README.md`
6. `npx tsc --noEmit` + `npm run build` — must pass
7. Commit with message `feat: vX.Y.Z - <description>`
8. Tag: `git tag -a vX.Y.Z -m "<description>"`
9. Push commit + tags: `git push && git push --tags`

### Minibump (fix) — patch version
1. Bump version in `package.json`
2. Update `CHANGELOG.md` with new section
3. Update version badge in `README.md`
4. `npx tsc --noEmit` + `npm run build` — must pass
5. Commit with message `fix: vX.Y.Z - <description>`
6. Tag: `git tag -a vX.Y.Z -m "<description>"`
7. Push commit + tags: `git push && git push --tags`
