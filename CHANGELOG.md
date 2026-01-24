# Changelog

## 0.9.1

### Features
- Toggle actions for clusters in Insights panel (select/deselect, hide/show, group/dissolve)

### Performance
- Batch paste/duplicate operations in single Y.js transaction (instant paste of 300+ elements)
- Freeze edge computation during drag for smooth node movement
- Instant group/dissolve with batched Y.js transactions

### Fixes
- Remove insights overlay popups from canvas (cleaner UI)
- Stabilize cluster detection (consistent results between runs)
- Paste now centers elements at viewport/cursor position instead of original location

## 0.9.0

### Features
- Native SVG export (editable in Inkscape/Illustrator)
- Annotations (sticky notes with markdown support)
- Visual groups (frame containers for organizing elements)
- Alignment guides (snap to grid, align selected elements)
- Draggable minimap
- Element duplication (Ctrl+D)
- New keyboard shortcuts (G for group, A for annotation)

### Performance
- Canvas rendering optimization (stable callbacks, split memo components)
- Edge culling (skip rendering off-screen edges)

### Fixes
- Absolute position resolution for grouped elements in edge culling
- Accept any file extension in import picker with JSON auto-detection

## 0.8.17

### Features
- Excalidraw import with shape, arrow, and image mapping

## 0.8.16

### Features
- Multi-format JSON import with auto-detection

## 0.8.15

### Features
- Collaborative session leave warning dialog

### Fixes
- Improved drag smoothness and immediate visual updates

## 0.8.14

### Changes
- Remove hexagon shape
- Improved border controls UI

## 0.8.13

### Features
- Border width and style controls for elements

## 0.8.11

### Features
- Orthogonal (right-angle) link routing mode

## 0.8.10

### Features
- Link curve mode toggle (straight/curved)

## 0.8.9

### Features
- Link anchor mode with handle-based curves

## 0.8.8

### Features
- Enhanced search with properties display and zoom-to-element

## 0.8.6

### Features
- Bulk editing and improved multi-selection
- PNG export with zoom/scale selection

### Fixes
- Dark mode improvements and viewport persistence per investigation
- Reliable PNG export using html-to-image

## 0.8.5

### Features
- Canvas display settings in Views panel (confidence, tags, properties)
- Tag icons in TagSet manager

## 0.8.0

### Features
- TagSet CSV import/export
- Custom property types (link, country, geo, choice)
- Real-time collaboration improvements (auto-reconnect, asset sync)
- Comments system for elements and links
- Landing page with product presentation
- Layout algorithms (force-directed, circular, hierarchical)
- Property badges on canvas elements
- Docker deployment with security hardening
- Report generation
- Tag sets with suggested properties
- Graph insights (clusters, centrality, bridges)

### Fixes
- Collaboration position sync reliability
- Large file sync improvements
- Deletion persistence

## 0.1.0

### Initial release
- Infinite canvas with React Flow
- Elements (circle, square, rectangle, diamond) with visual customization
- Links with direction, labels, and visual styles
- IndexedDB storage via Dexie.js
- OPFS file attachments with SHA-256 deduplication
- MiniSearch full-text search
- Map view (Leaflet)
- Timeline view
- Import/Export (JSON, CSV, GraphML, ZIP)
- Views and filters system
- Undo/Redo
