# Changelog

## 2.5.2

### Performance
- Fix edge cache invalidation: auto anchor handles, link visual properties, and global settings (curveMode, anchorMode, confidence) now correctly bust the cache
- Skip edge computation at first render when node positions are uninitialized (eliminates startup freeze with 1000+ elements)

### UI
- Improved loading screen: phase label + detail counter (element/link counts, file download progress)
- Event loop yield between loading phases ensures counters are painted before heavy sync

## 2.5.1

### Features
- HD image Level of Detail: full-resolution images load automatically from OPFS when a node is large enough on screen (node size × zoom > 250px), with LRU cache (max 30 blob URLs) and automatic eviction

## 2.5.0

### Performance
- Incremental Y.js sync with requestAnimationFrame batching (replaces setTimeout 50ms)
- Double-render elimination: conditional displayNodes (local during drag, store otherwise)
- Edge version debouncing at 300ms (prevents full edges rebuild on every remote position update)
- Blocking crypto warmup before processing real messages (fixes Firefox 3s cold start)
- SimpleEdge component for dense graphs (lighter rendering)
- Adaptive edge hiding threshold: edges hidden during pan/zoom only above 500 elements
- Drag-end timing fix: isDraggingRef set to false after store update (prevents position flash)
- Progressive rendering for large collaborative sync
- Edge capping for stress test scenarios
- Incremental nodeStructures and nodes assembly

### Fixes
- Fix selection loop causing infinite re-renders
- Fix search zoom to center viewport on found element
- Fix delete optimization for large selections
- Fix undo support for collaborative operations
- Fix localOpPending flag to prevent echo from local Y.js operations
- Fix 6 cascading re-sync timers reduced to 1
- Fix joiner logic bug in collaborative sync

### Documentation
- Updated user documentation with app performance limits
- Added large investigation FAQ section (FR + EN)

## 2.0.0

### Features
- Asynchronous collaboration: work with collaborators at different times, changes buffered on server for 7 days
- Auto anchor mode for connectors enabled by default on new investigations

### Fixes
- Sync status no longer stuck on "sync..." when becoming alone in room
- Sync status no longer stuck on "sync..." when starting to share with no peers connected
- Removed debug logs from production build

### Documentation
- Added async collaboration section with link preservation warning
- Updated URL format documentation for v1.7 security changes

## 1.7.0

### Security
- URL hardening: investigation name moved to URL fragment (never sent to server)
- URL hardening: room ID is now SHA-256 hash of UUID + encryption key (server cannot correlate sessions)
- Backwards compatible with pre-1.7 share URLs

### Fixes
- Relay server: increased max message size to 50 MB for large Y.Doc sync

## 1.6.3

### Fixes
- Relay server: allow dots in room IDs, extract last URL segment (handles proxy paths)
- Documentation: clarify WebSocket server URL format (must include wss:// or ws://)

## 1.6.2

### Features
- Mobile-friendly interactive HTML export: tabs (Report/Graph) instead of split, touch pan/pinch-to-zoom, bottom sheet tooltip

## 1.6.1

### Fixes
- Named links (relations) referenced in reports now render correctly in ZIP export (were showing as strikethrough)

## 1.6.0

### Features
- Investigation tags: add tags to investigations for organization (Cyber, Client-X, Archive...)
- Search and filter on home page: search by name/description, filter by tags
- Favorites: star button to pin important investigations at the top
- Sort options: by modification date, creation date, or name
- Modal for editing investigation tags with suggestions from existing tags

## 1.5.3

### Features
- Auto fit-to-view after import: graph automatically fits to show all elements

### Fixes
- Group elements now display correctly (full rectangle instead of line at top)
- Report export in ZIP now properly includes all sections from Y.Doc storage
- Element and link references in reports preserved during import (ID remapping)

## 1.5.2

### Features
- Position lock for elements: prevent accidental moves via context menu or detail panel
- Lock/unlock applies to all selected elements in multi-selection
- Locked elements stay in place when dragging multi-selection
- No canvas panning when attempting to drag locked elements

## 1.5.1

### Fixes
- Group navigation in interactive HTML export now works (zoom to group center)

## 1.5.0

### Features
- Interactive HTML report export with embedded graph visualization
- Bidirectional navigation between report and graph (click element refs to zoom, click nodes to scroll)
- Report info modal with investigation metadata and statistics
- Collapsible table of contents for long reports
- Export markdown (without element links) from HTML report
- Dark/light theme toggle in exported HTML
- Tags included in SVG node data attributes
- Click on link reference now selects the link and both connected elements

### Fixes
- Link selection in report panel now correctly highlights the link (not just target element)

## 1.4.2

### Features
- Hierarchy layout available in layout menu (for any investigation, not just genealogy)
- GEDCOM import: NICK (nickname) and TITL (title) fields now imported as properties

## 1.4.1

### Fixes
- Marriage links now end at first spouse's death (no longer infinite on timeline)

## 1.4.0

### Features
- GEDCOM 5.5.1 and 7.0 genealogy file import (.ged)
- GeneWeb genealogy file import (.gw)
- Automatic family tree layout after import (generations organized vertically)
- GPS coordinates from places imported into events for map display
- Support for birth, death, residence events with dates and locations
- Marriage and parent-child relationship links

### Fixes
- Historical dates (before year 1000) now display correctly
- Timeline events no longer appear as infinite ranges

## 1.3.6

### Fixes
- Fix flash/flicker when typing in InvestigationDetail fields (name, description, creator, date)
- Add EditableField component with lock/edit pattern (click to edit, blur to save)
- Change Y.Doc observer from throttle to pure debounce to prevent sync race conditions

## 1.3.5

### Features
- Collaborative locking with remote user indicator in Report sections
- Copy elements with Markdown link format [[Label|id]]
- Paste from canvas now works correctly without duplicates

### Fixes
- Optimize typing performance (defer serialization to validation)
- Fix flash/flicker on content sync between local and remote
- Add stopPropagation on paste to prevent canvas interference

## 1.3.0

### Features
- Report panel: new side panel tab for writing investigation reports
- Markdown editor with sections (add, reorder, delete)
- Element/link references with [[Label|uuid]] syntax
- Autocomplete dropdown triggered by [[ for quick insertion
- Clickable links in preview mode (navigates to element on canvas)
- Report persistence with Yjs collaborative sync
- Rename "Report" modal to "Synthesis" for clarity

## 1.2.0

### Features
- Import into current investigation: merge elements from a ZIP file into the active canvas
- Click-to-place import with visual preview (bounding box follows cursor)
- Zoom and pan during import placement mode
- Escape key to cancel import placement
- Proper handling of grouped elements (preserve relative positions)

## 1.1.0

### Features
- Timeline temporal filter with range slider for date-based filtering
- Animation controls (play/pause) to animate through time periods
- Step forward/backward buttons for manual navigation
- Draggable range to shift the entire filter window
- Date input fields for precise date selection

## 1.0.12

### Fixes
- Fix date input reset issue when manually typing dates (especially in Brave browser)
- Use local state for date/datetime inputs to prevent reset during field navigation

## 1.0.11

### Features
- Add sticky note icon indicator on annotations

### Fixes
- Improve note text contrast based on background color (auto dark/light)

## 1.0.10

### Fixes
- Apply redaction (anonymous mode) to group labels
- Apply redaction to annotation/note content
- Hide displayed properties on groups in anonymous mode

## 1.0.9

### Features
- Map view: add satellite imagery layer (ArcGIS World Imagery)
- Layer control to switch between OpenStreetMap and Satellite views

### Fixes
- Limit satellite layer zoom to 18 (no imagery beyond this level)
- Auto-adjust zoom when switching to satellite if currently above 18

## 1.0.8

### Features
- Map view: add satellite imagery layer (ArcGIS World Imagery)
- Layer control to switch between OpenStreetMap and Satellite views

## 1.0.7

### Improvements
- Complete i18n for collaboration UI (status indicator, user avatar, presence)
- All 11 locales updated with collaboration strings

### Changes
- License updated with full author name
- README roadmap updated (STIX2 marked complete)

## 1.0.6

### Fixes
- Fix collaborative sync for element resize (customWidth/customHeight)
- Fix collaborative sync for all visual properties (border, icon, image)
- Fix collaborative sync for link visual properties (style, thickness, curveOffset, direction, handles)
- Fix collaborative sync for element/link dates and source fields

## 1.0.5

### Fixes
- Fix map geo position not persisting after view change (add geo to Y.Doc differential sync comparison)
- Fix map drag prioritizing element.geo over event.geo for manually positioned markers

## 1.0.4

### Fixes
- Fix map cluster closing immediately after spiderfy (use ref instead of state for isSpiderfied flag to avoid triggering effect re-runs)

## 1.0.3

### Fixes
- Events now support hours/minutes (datetime-local input instead of date-only)
- Events dates stacked vertically for better visibility in narrow panels
- SidePanel collapse button always visible (was hidden at default width)
- Map cluster no longer closes when clicking on spiderfied element
- Map drag now saves position correctly (dragged positions override event-based positions)
- Fix PropertiesEditor dropdown isOpen type error

## 1.0.2

### Fixes
- Fix timeline tooltip cut off at bottom of screen (now displays above element when needed)

## 1.0.1

### Fixes
- Fix geo coordinates reverting after save (use flushSync + read from Y.Doc)
- Fix map picker not centering on existing coordinates when reopening
- Fix choice-type properties not showing dropdown list from TagSets
- Add free text input for choice properties (can enter value not in list)
- Fix modal focus stealing when typing in input fields

## 1.0.0

### Features
- GeoJSON export for map data
- STIX 2.1 import support for cyber threat intelligence

### Fixes
- Enable Ctrl+wheel zoom on timeline
- All TypeScript errors resolved

## 0.9.8

### Features
- Storage management modal with detailed breakdown (IndexedDB, OPFS, Y.js history)
- Persistent storage protection (`navigator.storage.persist()`) to prevent browser eviction
- Full backup export/import (all investigations, elements, links, files, tags in one ZIP)
- Y.js history purge option to free up storage space

### Fixes
- Version display in About modal now reads from package.json (was stuck at 0.5.0)

## 0.9.7

### Performance
- Progressive list rendering in panels (ProgressiveList component) — clusters, bridges, isolated, tags, hidden elements load incrementally instead of all-at-once DOM rendering

### Fixes
- Clear selection and insights when switching between investigations
- Show loading phases ("Ouverture...", "Synchronisation...", "Fichiers...", "Elements...") instead of static "Chargement..." text
- Scrollable properties/events lists with add button at top (avoids losing access to other accordion sections)
- Timeline vertical virtualization for 10,000+ items
- Undo/redo support for map marker drag (geo position changes)

## 0.9.5

### Performance
- Web Worker for graph computations (insights, layout) — UI stays responsive during heavy analysis
- Tarjan O(V+E) bridge detection replacing brute-force O(n²*(n+m))
- Sorted + sliding window for similar labels replacing O(n²) pairwise comparison
- Incremental Y.js sync with structural sharing (only changed elements trigger re-render)
- Incremental search index (MiniSearch syncs diffs instead of full rebuild)
- Optimized Zustand store subscriptions (individual selectors, no bulk destructuring)
- Remote user presence lifted to Canvas level (1 subscription instead of n+m)

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
