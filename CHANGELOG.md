# Changelog

## 2.39.8

### Features
- **Timeline — focus event on click** — clicking an event item in the timeline (scatter or swimlane mode) now selects the parent element and auto-expands + scrolls to the exact underlying event in the side panel, mirroring the map marker behaviour. `TimelineItem` now carries `eventId` for event-type items

### Fixes
- **Map marker thumbnail** — card markers now render their image thumbnail as a 48×48 square (was 48×36), reducing the aggressive top/bottom crop on square and portrait-oriented medias

## 2.39.7

### Features
- **Map — focus event on marker click** — clicking a marker on the map now selects the parent element and auto-expands + scrolls to the exact underlying event in the side panel. Works across static and temporal mode (new `focusedEventId` on the selection store)
- **Map — co-temporal event markers** — when multiple events share the same minute but carry different coordinates (e.g. GSM multi-cell pings at the same second), each becomes its own marker instead of collapsing into the "active" one. Event markers use a composite `elementId::eventId` key internally and are never clustered, so a vehicle's trajectory no longer disappears into a single cluster
- **Map — temporal trace toggle** — new `Route` button next to follow-camera: when enabled, every past event with geo stays visible as a lightweight breadcrumb, drawing the movement path up to the slider's current time. Off by default (snapshot mode)

### Fixes
- **Static map — latest point event wins** — when an element has both a base geo and more recent point events, the marker now sits on the latest event (movement-tracking semantics) instead of being stuck on an outdated base position. Polygon event overrides for zones are preserved (marker on base, shape from the latest polygon event)

## 2.39.6

### Fixes
- **Side panel perf — thousands of events/properties** — `EventsEditor` and `PropertiesEditor` now virtualize their rows via `@tanstack/react-virtual`. Only visible rows are mounted, so opening the detail panel of an element carrying 6k+ events/properties is now instant instead of freezing for several seconds. Dynamic row measurement preserves the expand/collapse UX for events. Sort is memoized; suggestion lookup in `PropertiesEditor` switched from O(n²) `find` to a `Map`.

## 2.39.5

### Fixes
- **Map temporal — last known position** — elements with events now stay visible at their last known position once their first event is reached, instead of disappearing after their own last event. This matches GPS-breadcrumb semantics for movement tracking when several elements have different event end dates on the same timeline
- **Minute-precision comparisons** — all visibility comparisons (element position, link activity, link-pulled visibility) now round to the minute, so the slider reliably reaches every event even when original dates include seconds or milliseconds

## 2.39.4

### Fixes
- **Map temporal precision** — the temporal slider and position filters now work at minute precision instead of snapping to the day. Events with time-of-day (e.g. 14:30 vs 14:45) are correctly distinguished, enabling minute-by-minute movement tracking from geolocated events. Dates saved without a time still represent a full day for backward compatibility. The manual date input in the temporal slider is now `datetime-local`.

## 2.39.3

### Fixes
- **Timeline "Added" mode** — new toggle in timeline toolbar to display elements and links by their creation date (createdAt) instead of investigation dates, showing how the inquiry was built over time; causality controls are hidden in this mode since they don't apply to system timestamps
- **Tab ghost visual stuck** — switching back to "Tous" tab no longer leaves elements with ghost appearance (dashed border, hatch overlay); the incremental node cache now detects activeTabId changes and forces a full rebuild

## 2.39.2

### Fixes
- **Import/Export icons** — swapped `Upload` / `Download` icons so Import uses the downward arrow (incoming data) and Export uses the upward arrow (outgoing data); applied across DossierPage header, HomePage, LandingSection, DossierCard, TagSetManagerModal, StorageModal backup tab, Import/Export modals, AssetsPanel dropzone, MapView/TimelineView/MatrixView CSV export, ReportPanel, QueryResultsTable
- **ViewToolbar wrapping** — toolbar buttons now wrap cleanly onto multiple lines when the view is resized narrow (via side panel), instead of overflowing horizontally; applies to Canvas, Map, Matrix and Timeline views

## 2.39.1

### Fixes
- **Trusted badge** — verified shield icon on trusted plugin cards (home:card), injected by the loader after plugin registration
- **Manifest plugin IDs** — aligned `oneneurone` / `vaultneurone` IDs with actual plugin card IDs (was `one-neurone` / `vault-neurone`)

## 2.39.0

### Features
- **Plugin security** — integrity verification (SHA-256) and permission sandbox for external plugins
  - **Manifest v2** — new format with `trust` levels (`trusted` / `community`) and `permissions` declaration
  - **Integrity check** — SHA-256 hash verification of plugin files before loading (extracted from inline to `pluginIntegrity.ts`)
  - **Permission sandbox** — community plugins receive a filtered API based on declared permissions; undeclared API members are absent
  - **Read-only store proxy** — Zustand stores exposed in read-only mode preserve selector optimization and referential stability
  - **Slot filtering** — community plugins can only register into slots their permissions allow
  - **Legacy aliases** — `useInvestigationStore` and `investigationRepository` propagated through the sandbox
  - **Default permissions** — community plugins without declared permissions get a safe minimal set (read graph, UI slots, plugin data, events, toast)
  - **Backward compatible** — manifest v1 (no `manifestVersion` field) works as before with full permissions granted
- **Plugin build tooling** — `npm run dev:plugins` / `build:plugins` / `rehash:plugins` to build YPSI plugins, copy to `public/plugins/`, and generate manifest v2 with integrity hashes
- **CLI hash tool** — `scripts/plugin-hash.mjs` for standalone hash generation

## 2.38.13

### Fixes
- **Side panel tabs** — icon-only for inactive tabs (label shown only on active tab) to prevent hidden horizontal scroll with many plugins
- **Plugin docs** — updated FR + EN: async `action`/`visible`, `ContextMenuChild` interface, `children()` submenu, all 3 context menu slots documented

## 2.38.12

### Fixes
- **Element context menu** — `contextMenu:element` plugin extensions now rendered in element right-click menu (same pattern as CanvasContextMenu), with dynamic icon resolution and visibility filtering

## 2.38.11

### Fixes
- **Link direction bug** — fix inverted fromId/toId when dragging from a target-type handle in ConnectionMode.Loose (React Flow normalizes source/target by handle type, not drag origin); also fixes reconnect

## 2.38.10

### Fixes
- **Landing footer** — icon-only for secondary items (theme toggle, about, documentation, GitHub, Ko-fi, language) to reduce clutter; functional items (encryption, storage) keep labels

## 2.38.9

### Fixes
- **Link context menu** — right-click on links: edit label, delete with undo/redo, plugin extensions support (`contextMenu:link` slot)
- **Undo/redo link deletion** — `delete-link` action with full restore on undo (Canvas + historyStore)
- **Undo/redo link label edit** — label changes are now recorded in the history stack
- **Y.js compaction fix** — open dossiers compact via active provider to avoid IndexedDB lock conflicts (no more `deleteDatabase blocked` warnings)
- **encryptedIndexeddbPersistence** — fix missing `return` in compact promise chain
- **Plugin API** — `ContextMenuChild` interface, async `visible()` and `children()` on `ContextMenuExtension` for dynamic submenus
- **GoNeurone** added to plugins manifest
- **i18n** — link context menu translations (11 languages)

## 2.38.8

### Fixes
- **Plugin API**: `api.services.importJSON(jsonString, dossierId)` — direct JSON import for plugins (auto-detects ZN native, OSINT Industries, PredicaGraph, Excalidraw, STIX2, Gephi Lite formats)
- **Plugin API**: `element:tagAdded` / `element:tagRemoved` events on `api.events.on()` — granular tag change notifications with `meta.tagName` payload

## 2.38.7

### Fixes
- **Plugin API**: `api.encryption.getRecoveryMeta()` — exposes encryption metadata (salt, encryptedDEK, dekIV, version) as base64 strings for offline backup recovery tools (read-only, no security reduction)

## 2.38.6

### Fixes
- **Security: XSS interactive report** — sanitiseHtml() whitelist strips unauthorized HTML tags after markdown conversion, protocol validation on links (https/mailto/# only), meta CSP in exported HTML
- **Security: CSP nginx** — Content-Security-Policy header added to nginx.conf (script-src, img-src, connect-src, worker-src, frame-ancestors, base-uri)
- **Security: PDF iframe sandbox** — `sandbox="allow-same-origin"` on PDF preview iframes (Canvas, AssetsPanel)
- **Security: WebAuthn logs** — removed debug console.log/debug from webauthnService (PRF material no longer exposed)
- **Security: sync asset hash** — SHA-256 re-verification on assets received via sync
- **Security: URL validation** — toUrl() / isUrl() guard against dangerous protocols (ElementDetail, LinkDetail)
- **Security: element references** — quote/angle bracket escaping in parseElementReferences (interactive report)
- **Security: Vite config** — removed allowedHosts tunnel domain
- **Plugin API**: scoped pluginData methods (getForDossier/setForDossier/removeForDossier), plugin manifest integrity field, updated plugin-api.d.ts typings
- **Plugin docs**: updated FR + EN guides with scoped pluginData and integrity verification

## 2.38.5

### Fixes
- **Plugin API evolutions**: event bus (`api.events.on()`), services (`exportDossier`, `importDossier`, `navigateTo`), toast notifications (`api.toast.*`), global pluginData (`getGlobal`/`setGlobal`/`removeGlobal`), encryption utilities (`encrypt`/`decrypt`/`isUnlocked`), 3 new stores (`useTagSetStore`, `useTabStore`, `useUIStore`)
- **pluginData cleanup**: automatic cleanup of `pluginData` and `canvasTabs` when a dossier is deleted
- **Plugin docs**: updated FR + EN plugin development guides with all new APIs

## 2.38.4

### Fixes
- **NEAR map picker**: interactive map modal for the NEAR operator — click to place center, live circle preview with adjustable radius, Nominatim geocoding search, pre-populated from existing values
- **i18n**: 4 new keys for the map picker across 11 languages

## 2.38.3

### Fixes
- **Visual builder NOT support**: NOT toggle per condition/group with border-left indicator, no layout overflow
- **Visual builder nested groups**: recursive AND/OR sub-groups (max depth 2), combinator toggle
- **Visual builder NEAR layout**: NEAR inputs (lat, lng, radius, unit) on dedicated row to prevent overflow
- **IN operator**: parser, serializer, evaluator support for `field IN ("a", "b", "c")`
- **Query history**: last 5 queries tracked in-session, reapply from history section
- **Select all results**: button to select all matching elements/links on canvas
- **Save as View**: create a saved view from current query results
- **Zero results feedback**: visual indicator when query matches nothing
- **Auto re-execute**: query re-runs automatically when dossier data changes
- **Viewport navigation**: click table row to navigate canvas to element position
- **Find Similar feedback**: toast warning when element has no tags
- **i18n syntax examples**: hardcoded French examples replaced with i18n keys (11 languages)
- **Search modal query hint**: `?` prefix hint in Ctrl+K footer

## 2.38.2

### Fixes
- **Docker build speed**: add BuildKit cache mount for `npm ci` — reuses npm download cache across builds even when package.json changes
- **Query auto-execution**: remove redundant Execute button in text mode (queries auto-execute on valid parse); fix regression where removing the button broke canvas filter activation
- **Autocomplete operator preservation**: fix token walk-back regex so applying a tag/value suggestion no longer eats the preceding operator (`=`, `>`, etc.)

## 2.38.1

### Fixes
- **Query context menu**: "Find similar" and "Query from selection" actions now appear in the element context menu (right-click on a node), not only in the canvas-level context menu

## 2.38.0

### Features
- **ZNQuery structured query system**: mini-language textuel + builder visuel with shared AST, autocompletion, saved queries, and two result modes (canvas filter + table)
- **Query text mode**: recursive descent parser supporting AND/OR/NOT/parentheses, all operators (=, !=, >, <, >=, <=, CONTAINS, STARTS_WITH, ENDS_WITH, MATCHES, EXISTS, NOT EXISTS, IN, NEAR), reserved fields (label, notes, tag, confidence, source, date, type, group, country, has_geo, geo.lat, geo.lng, from.*, to.*, event.*, directed), free-form properties, date literals, regex literals
- **Query visual mode**: chainable condition rows with typed inputs (date picker, boolean select, number input, tag dropdown, NEAR lat/lng/radius/unit), AND/OR combinator, auto-execution on change
- **Query results**: canvas filter mode (dim non-matching elements), table mode with dynamic columns, sorting, CSV export, click-to-select
- **Saved queries**: persist, load, rename, delete queries per dossier (IndexedDB v11)
- **Query filtering across all views**: Canvas, Map (with cluster dimming and active count), Timeline, and Matrix views all support query-based dimming
- **Link dimming exception**: links matching the query stay visible even when their endpoints are dimmed
- **Context menu integration**: "Find similar" (single selection) and "Query from selection" (multi) in canvas right-click menu
- **Search integration**: `?` prefix in Ctrl+K search opens the query panel with pre-filled text
- **Autocompletion**: context-aware suggestions for fields, operators, values, and keywords at cursor position
- **User documentation**: complete query system documentation (FR + EN)

## 2.37.2

### Fixes
- **Swimlane link display**: zoom-based adaptive height (detailed above 0.5 px/day, compact below); label stays visible when item starts off-screen left; deduplicate links in lanes when both parent elements share the same grouping key

## 2.37.1

### Fixes
- **Swimlane link rendering**: links toggle (off by default) in toolbar; adaptive display — thin 8px bars when zoomed in, full-height chips with label when wide enough (>150px visible); viewport-clipped collision stacking prevents massive lane heights at high zoom; visual distinction (dashed border, lighter background) from element items

## 2.37.0

### Features
- **Timeline swimlane mode**: new display mode grouping elements into horizontal lanes by criterion (tag, source, property); multi-tag grouping (elements appear in all matching lanes); tag filter dropdown with select/deselect all; drag & drop lane reordering with persistent custom order; collapsible lanes with item count; dated links appear in parent element lanes; state persisted across view switches (canvas/map/timeline)
- **Timeline fit-all on first load**: timeline auto-fits all items on first visit in both scatter and swimlane modes
- **User documentation**: timeline page rewritten with swimlane mode documentation (FR + EN)

## 2.36.2

### Fixes
- **Import modal (ImportExportModal)**: add missing .anb file type to accept filter and processing branch

## 2.36.1

### Fixes
- **ANB import**: fix relational link type name extraction — scan before SIG pattern (offsets +192–224) instead of after (was picking up description text, causing misattributed link labels)

## 2.36.0

### Features
- **i2 Analyst's Notebook binary import** (.anb): reverse-engineered OLE2/CFB binary format; entities with labels, positions (from binary coordinates), typed properties (DatabaseProperty, Attribute), COLORREF colors, icon mapping, confidence grades (1-5 → 20-100), intelligence cards (0x818D records) imported as linked events; links with direction, thickness, style (solid/dashed/dotted); real i2 spatial coordinates preserved via unified coordinate normalization across all record types
- **User documentation**: ANB binary import section added (FR + EN) with limitations and reverse-engineering caveats

## 2.35.0

### Features
- **i2 Analyst's Notebook import** (.anx): entities with labels, positions, typed properties (DatabaseProperty, Attribute), type hierarchy tags, COLORREF colors, icon mapping, confidence grades (1-5 → 20-100), intelligence cards as events, source attribution; links with direction, thickness, style (solid/dashed/dotted via Strength), colors; auto-detection of ANX content in .xml files; XML sanitization for malformed i2 exports
- **User documentation**: GEXF, Gephi Lite JSON and ANX import sections added (FR + EN)

## 2.34.0

### Features
- **Native Gephi import** (GEXF + Gephi Lite JSON): nodes with positions, colors, sizes (proportional scaling), shapes; edges with colors, thickness (ranking), direction; node/edge properties with auto type inference; appearance palettes (partition/fixed); metadata into dossier description
- **STIX 2.1 import expanded**: full SCO support (IPv4/IPv6, domain, URL, email, file, network-traffic, MAC, user-account, process, software, directory, registry key, autonomous-system, x509-certificate, artifact), additional SDO fields (observed-data, opinion, first/last observed), object marking refs
- **i18n `importData` namespace** (11 languages): all import services (STIX2, Gephi, GEDCOM) now use localized strings for labels, errors, and property names

## 2.33.4

### Fixes
- Timeline: century and decade zoom levels (presets "Siècle" / "10 ans", axis labels every 100/10 years)
- Timeline: negative years (BC) displayed correctly on year/decade/century scales
- Timeline: tooltip close button no longer hidden behind title text
- Map: disable world wrapping in 2D mode (`renderWorldCopies: false`)

## 2.33.3

### Fixes
- Production relay (Docker): port all v3 improvements — token hashing, TRUST_PROXY, backpressure, native Redis Buffer, partial buffer flush, JSON metrics health endpoint, orphaned room cleanup, improved graceful shutdown

## 2.33.2

### Fixes
- Dev relay server v3: graceful shutdown (SIGTERM/SIGINT) for clean Docker restarts
- Dev relay server: orphaned room cleanup after 24h inactivity (fixes memory leak on tokens/asyncRooms)
- Dev relay server: health endpoint returns JSON metrics (rooms, clients, uptime, buffer stats)
- Dev relay server: backpressure on relay — skip clients with >4MB send buffer
- Dev relay server: X-Forwarded-For only trusted with `TRUST_PROXY=1` env var
- Dev relay server: room tokens stored as SHA-256 hashes instead of plain text
- Dev relay server: Redis buffer uses native Buffer instead of base64 (+33% overhead removed)
- Dev relay server: partial buffer flush preserves unsent messages on client disconnect

## 2.33.1

### Fixes
- WebSocket: graceful disconnect on page unload (prevents "connection interrupted" browser errors)
- WebSocket: proactive reconnection on tab visibility change instead of waiting for backoff timer
- WebSocket: 5-second grace period on initial connection suppresses transient error flashes
- WebSocket: `isClosing` guard prevents event handlers from firing during teardown

## 2.33.0

### Features
- Map temporal follow camera: Crosshair toggle button during temporal playback that follows events with cinematic flyTo animations (adaptive speed, dezoom arc, moveend-chained advancement)
- Hierarchy layout powered by dagre (Sugiyama algorithm): minimized edge crossings, greedy cycle breaking, adaptive node/rank spacing

### Fixes
- Hierarchy/force layout: `estimateNodeWidth` now matches ElementNode rendering dimensions, improved AABB overlap removal (15 passes, early exit, gap=24)
- Map clustering: clusters properly break at high zoom (Supercluster maxZoom 20, follow camera zooms to 22 for co-located elements)
- Map temporal follow camera: moveend-based chaining prevents animation interruption, timestamp guard ignores spurious moveend from interrupted previous flyTo

## 2.32.1

### Fixes
- Matrix: right-click context menu with copy cell, copy row, copy selection
- Matrix: pin/unpin toggle to freeze/unfreeze first column
- Matrix: columns dropdown no longer clipped by toolbar overflow (fixed positioning)
- Map: 3D buildings toggle always visible, buildings preserved when disabling 3D terrain
- Collaboration info (avatars, sync, share) moved from view toolbars to main header bar
- Archive toggle no longer changes dossier modification date

## 2.32.0

### Features
- Dossier archiving: archive/unarchive dossiers from the card dropdown menu, archived dossiers hidden by default with toggle button to show them
- Collaboration info (sync status, presence avatars, share button) now visible on all views (canvas, map, timeline, matrix), not just canvas
- Tab delete confirmation: modal confirmation before deleting a tab, tooltip on long tab names
- Compact header: DossierPage header reduced to h-10, view switcher shows text+icon labels, overflow menu on small screens
- HomePage header restructured: New Dossier + Import centered, utilities on right

### Fixes
- Dropdown menus on dossier cards no longer hidden behind cards below (z-index via CSS `:has()`)
- Archived dossier card opacity no longer affects dropdown menu
- Detached panel: fix React scheduler conflict ("Should not already be working") by deferring `window.open()` to next tick
- ImportModal: fix scoping error for `dossierId`/`createdNewDossier` in catch block
- ViewToolbar: fix left content overflow on narrow screens

## 2.31.7

### Fixes
- Canvas: diamond shapes with media — label no longer clipped, displayed below the shape (same fix as circle/hexagon)
- Map: auto-zoom to selected element when switching from canvas to map view
- Map: search (Ctrl+K) now zooms to element on map
- Map: "View on map" button added to element location panel (next to "Pick on map")
- Map: polygon "View on map" button now works when switching from canvas (delayed event dispatch)
- Map: default base layer changed to OSM (standard), OSM FR/DE available as option
- Timeline: search (Ctrl+K) now scrolls to element on timeline

## 2.31.6

### Fixes
- Canvas: circle/hexagon shapes with media — label no longer clipped, displayed below the shape
- Map: localized tiles adapt to app language (FR → OSM France, DE → OSM Deutschland, other → default OSM)
- Map: "OSM Latin" renamed to "OSM Localized" with automatic language-based tile resolution

## 2.31.5

### Fixes
- Canvas: context menu i18n — all labels were hardcoded in French, now use existing translation keys

## 2.31.4

### Fixes
- Synthesis: i18n for interactive HTML report (11 languages) — all UI strings were hardcoded in French
- Synthesis: fix report content translations not resolving (wrong i18n namespace `report.content` → `synthesis.content`)
- Synthesis: "Synthèse générée le..." instead of "Rapport généré le..." in all languages

## 2.31.3

### Fixes
- Canvas: alignment now works for elements inside groups (absolute/relative position conversion)
- Canvas: distribute uses measured node dimensions for proper spacing
- Canvas: align dropdown closes reliably (capture phase + selection change listener)
- Canvas: toolbar dropdown menus no longer clipped by overflow

## 2.31.2

### Fixes
- Map: fix "Rendered more hooks" error (useEffect after early return)
- Map: fix blank map when switching tabs (early return removed map container from DOM)
- Map toolbar: fix controls wrapping to second line (overflow-x-auto instead of flex-wrap)

## 2.31.1

### Fixes
- Canvas: hexagon shape no longer reverts to square on selection (removed erroneous Yjs migration)
- Canvas: diamond shape connection handles now accessible (z-index fix)
- Canvas: hexagon shape sizing in getDefaultDimensions

### Documentation
- Import JSON format: updated GeoData type documentation (FR + EN)

## 2.31.0

### Features
- Map: geographic zones with three shapes (polygon, circle, square)
- Map: zone editing (vertex drag for polygons, radius resize for circles)
- Map: zone movement by dragging the central marker
- Map: GeoJSON text editor for events (copy/paste from QGIS, geojson.io)
- Map: real-time preview during zone drawing (area, radius display)
- Map: zone shape selector dropdown on the Zone toolbar button
- Export: GeoJSON export includes zones as Polygon features

### Improvements
- Map: full element name displayed when selected (no truncation)
- Map: "Fit" button uses icon instead of text label
- Map: zone properties (area, radius) stored on elements
- Types: GeoPolygon supports shapeOrigin, radius, altitude, extrude fields
- Yjs: sync preserves all GeoPolygon fields across collaboration

### Documentation
- Map view: added Geographic Zones section (FR + EN)
- Tags & properties: added Tag Sets Manager section and 5 missing property types (FR + EN)
- Attachments: added DOCX/ODT text extraction support (FR + EN)
- Search: updated indexed content to include DOCX/ODT (FR + EN)
- Elements & links: clarified event geolocation supports zones (FR + EN)

## 2.30.1

### Fixes
- Map: persist base layer, 3D and buildings preferences across views
- Map: 3D mode disabled by default
- Map: disabling 3D now also hides buildings
- Map: buildings opacity increased (0.7 → 0.85)
- Map: links no longer hidden behind buildings on base layer switch
- Map: fix "Style is not done loading" error on init
- Docker: sync package-lock.json with new dependencies

## 2.30.0

### Features
- Map: migrate from Leaflet to MapLibre GL JS (WebGL rendering)
- Map: globe projection with automatic mercator transition on zoom
- Map: 3D terrain with real elevation data (Terrarium tiles)
- Map: 3D buildings extrusion from OpenFreeMap vector tiles (zoom 14+)
- Map: Nominatim place search with temporary marker and flyTo
- Map: CartoDB tiles auto-switch between light/dark based on app theme
- Map: toggle 3D mode on/off (globe + pitch + terrain)
- Map: toggle 3D buildings on/off
- Map: pitch control via right-click drag, compass visualization
- Map: client-side clustering via Supercluster (replaces leaflet.markercluster)
- Timeline: CSV export
- Map: CSV export

### Improvements
- Map: OSM Latin as default base layer
- Map: 4 base layers (OSM, OSM Latin, CartoDB, Satellite)
- Canvas: ViewToolbar responsive flex-wrap
- Canvas: annotation resize handle sizing
- Canvas: AlignDropdown scrollable for >5 elements

## 2.23.0

### Features
- Search: extracted text snippets shown in results with highlighted match and centered window
- Search: notes highlight with centered window on long text
- Assets: text file preview (txt, md, json, xml, csv, yaml, log, etc.)
- Assets: DOCX and ODT text extraction via JSZip XML parsing
- Assets: DOCX and ODT preview (extracted text view)

### Fixes
- Import: support OSINTracker v2 format (investigation table + investigationId)

## 2.22.2

### Fixes
- Import: support OSINTracker v2 format (investigation table + investigationId)

## 2.22.1

### Fixes
- Timeline: restore vertical scroll (missing min-h-0 on flex container)

## 2.22.0

### Features
- Canvas: alignment tools (left, center, right, top, middle, bottom) with key object reference picker
- Canvas: distribute horizontally/vertically for 3+ selected elements
- Multi-selection: bulk property editing with full PropertiesEditor (intersection of common properties)

### Improvements
- Collaboration: sequential asset sync with linear progress feedback
- Collaboration: media sync badge shows current filename, error count, visible in all connection states
- Collaboration: toast notification on asset sync failure
- Report: unsaved changes modal when leaving write mode without validating
- Events: date editing no longer causes immediate re-sorting (blur-based sync)

## 2.21.4

### Fixes
- Report: fix link rendering on write→read toggle (force DOM node recreation via React keys)
- Report: preprocess `[[Label|uuid]]` to anchor format before Markdown rendering (GFM pipe conflict)

## 2.21.3

### Fixes
- Report: edited links now render immediately on validation (no tab switch needed)

## 2.21.2

### Improvements
- Relay: all configuration values exposed as environment variables (RATE_WINDOW_MS, MAX_ROOM_ID_LENGTH, PONG_TIMEOUT_MS)
- Relay: startup banner displays all active limits

## 2.21.1

### Fixes
- Report: CRDT-safe collaborative sync — sections stored as Y.Map per section instead of plain array (no more data loss on concurrent edits)
- Relay: increase default MAX_CONNECTIONS_PER_IP from 10 to 50 (fixes disconnections behind NAT/corporate networks)
- Map: add OSM Latin and CartoDB Light base layer options

## 2.21.0

### Features
- Panel docking: cycle between right, bottom, left and detached window (DevTools-style)
- Detached panel opens in a separate browser window with full styling and theme sync
- Bottom dock with vertical resize handle

### Fixes
- Map: reduce link arrow z-index from 500 to 50 (was overlapping modals)
- Map: isolate Leaflet stacking context so map z-indexes never cover modals/overlays
- SynthesisModal: fix capture overlay z-index (100 → 1000) to stay above map

## 2.20.8

### Improvements
- Splash screen with logo and version on app startup (eliminates white flash)
- Version injected automatically via Vite `transformIndexHtml` plugin
- StorageModal: refresh button no longer hides content (spinner only on initial load)

## 2.20.7

### Fixes
- StorageModal: fix OPFS cleanup on "Purge all dossiers" (was targeting wrong directory `assets/` instead of `dossiers/`)
- StorageModal: clean orphaned OPFS directories on startup (legacy `investigations/`, `media/`)
- StorageModal: fix recovery migration crash when `investigations` table doesn't exist
- Remove `compactAllYjsDatabases()` from startup (caused Firefox crash)

### Improvements
- StorageModal: per-dossier Y.js compact buttons + "Compact all" in Maintenance tab
- Y.js compaction on dossier close (replaces all updates with single snapshot)
- Unified Y.js persistence layer (`EncryptedIndexeddbPersistence` for both encrypted and plain)
- Reduced `PREFERRED_TRIM_SIZE` for more frequent auto-compaction

## 2.20.6

### Fixes
- PDF thumbnails: add `.mjs` to service worker precache patterns, fixing pdf.js worker loading in production

## 2.20.5

### Fixes
- Backup restore: remap element/link ID references in report sections (`[[Label|old-id]]` → `[[Label|new-id]]`)
- Backup restore: remap `elementIds` in report sections, `hiddenElementIds` and `elementPositions` in views
- Backup restore: track link ID mapping (`linkIdMap`) for complete reference remapping

## 2.20.4

### Fixes
- StorageModal: refresh dossier list after backup import (`onDataChanged` callback)

### Improvements
- Landing page: add Storage and Encryption buttons in footer (remove fixed bottom-right button)
- StorageModal: add "Purge all dossiers" with CSS-based double confirmation and app reload
- i18n: add `encryption` label for all 11 languages

## 2.20.3

### Fixes
- Backup import: fix `tagSets.where('name')` crash (`name` not indexed since v7), use `toArray()` + filter
- Backup import: handle legacy backups with `investigationId` instead of `dossierId` in all tables
- Y.Doc mappers: defensive `Array.isArray` guards on `properties`, `tags`, `events`, `assetIds`, `childIds` to prevent `.map` crash on corrupted data
- ElementDetail/LinkDetail: guard `properties.map` in SuggestedPropertiesPopup

## 2.20.2

### Fixes
- Encryption: fix double-encryption of dossier data during v8 migration (recursive `decryptObject` unwraps all layers)

## 2.20.1

### Fixes
- DossierCard: defensive `Array.isArray` guard on tags to prevent crash when stale cached JS reads migrated DB

## 2.20.0

### Features
- Renamed core concept "Investigation/Enquête" → "Dossier" across entire application
- Dexie DB migration v8/v9: automatic data migration from `investigations` to `dossiers` table
- Legacy backward compatibility: import of old ZIP files (`investigation.json`), URL redirect (`/investigation/:id`)
- i18n: all 11 languages updated with localized term (FR: dossier, DE: Akte, IT: fascicolo, ES: expediente, PT: dossiê, PL: teczka, UA: справа, NL: dossier, CA/EU: expedient)

## 2.19.1

### Fixes
- Canvas: ghost elements (group children) appearing at top-left on other tabs (relative position without parent)
- Canvas: element positions incorrect after group dissolve/ungroup (Zustand update delay via rAF)
- Canvas: removeFromGroup stale childIds when removing multiple children in loop
- Assets: added confirmation modal before deleting attachments
- Docs: encryption warning (never refresh during operations), WebAuthn/auto-lock sections in EN

## 2.19.0

### Features
- Interactive HTML report: search overlay (Ctrl+K) with keyboard navigation
- Interactive HTML report: tag filtering via popover dropdown
- Interactive HTML report: thumbnail images embedded in SVG node shapes
- Interactive HTML report: layout toggle (report left/right) with persistence
- Interactive HTML report: resizable columns between report and graph panels
- Interactive HTML report: ultracompact code generation (86% size reduction)
- Side panel: toggle panel position (left/right) with persistent preference

## 2.18.3

### Fixes
- Canvas: displayed properties not updating on toggle (incremental cache invalidation)
- Canvas: auto-set reference date on paste/drop of images and files
- Dates: split datetime-local into date + time inputs (date-only input now works, defaults to 00:00)
- Handles: enlarged invisible hitbox (24px) for easier link creation without visual change
- Canvas: increased connectionRadius to 40px for easier target snapping

## 2.18.2

### Fixes
- Relay: keepalive ping/pong (30s) to prevent zombie connections and NAT timeout
- Relay: solo echo to keep y-websocket alive (prevents 30s reconnection loop for solo clients)
- Relay: throttled join/leave logs (solo reconnections summarized every 5 min)
- Relay: all limits configurable via environment variables (13 env vars documented)
- Relay: buffer retention changed to 48h / 100K messages (from 7d / 10K)

## 2.18.1

### Fixes
- Relay: throttle "Quota exceeded" log to one message per room (avoids log spam when buffer is full)
- Relay: flush buffered messages only when a 2nd client joins the room (prevents echo loop when a solo client reconnects and re-receives its own messages)

## 2.18.0

### Features
- WebAuthn PRF (FIDO2 Level 3): unlock with a hardware security key (YubiKey) as an alternative to the passphrase. Register, list, and delete credentials from the encryption settings.
- Investigation retention: configurable retention period per investigation (days). Four expiration policies: warning, read-only, proposed deletion, permanent redaction.
- Read-only enforcement: `assertWritable` guards on all 22 mutation actions in investigationStore. Expiration with read-only or redact policy locks the investigation.
- Permanent redaction: irreversibly replaces all text content (labels, notes, properties, tags) with masking characters while preserving graph structure.
- Auto-lock on inactivity: configurable idle timeout (5/15/30/60 min) with activity detection (mouse, keyboard, touch, scroll) and visibility change handling. Setting persisted in `_encryptionMeta`.
- Retention collaboration sync: retentionDays and retentionPolicy synchronized via Y.Doc in collaborative sessions.
- Import expiration warning: ZIP import shows a warning if the source document's retention period has expired.
- SECURITY.md: updated with WebAuthn PRF, PBKDF2 600k iterations, 4 retention policies.
- RGPD.md: GDPR applicability analysis for ZeroNeurone usage.
- User documentation: encryption page updated (auto-lock, WebAuthn), new retention page.
- i18n: all new features translated into 11 languages.

## 2.17.0

### Features
- At-rest encryption: all IndexedDB data and OPFS attached files can be encrypted with a password (AES-256-GCM / XSalsa20-Poly1305 via tweetnacl). DEK/KEK architecture with PBKDF2-SHA256 (600k iterations). Activation, deactivation, and password change via the lock icon on the home page.
- Session lock (Alt+L): lock the session without closing the browser. Data becomes unreadable until the next password entry.
- Encrypted ZIP export: optional password protection for exported archives (.znzip).
- Plugin encryption API: `api.encryption.applyToDatabase()`, `onReady()`, `onLock()`, `onBeforeDisable()`, `isEnabled()` — external plugins can encrypt their own Dexie instances using the same key.
- i18n: EncryptionModal and PasswordModal fully translated into 11 languages, including structured risk warnings on activation.

## 2.16.2

### Fixes
- Increase font size for plugin card footer lines (license, documentation, settings, about)
- Fix deselection toggle for similar pairs in Insights duplicate detection panel

## 2.16.1

### Fixes
- Enable merge button in Insights panel duplicate detection — similar pairs can now be merged directly from the analysis view

## 2.16.0

### Features
- Merge two elements: select 2 elements → right-click → Merge. Choose which label to keep; properties, events, tags, assets and links are merged. Duplicate links (same target) are combined, self-links are removed.

## 2.15.9

### Fixes
- Expose `unregisterPlugin` in the external plugin API — plugins can now dynamically remove/update their registrations (e.g. refresh `home:card` on license or language change)

## 2.15.8

### Fixes
- Fix duplicate plugin cards on license change: `unregisterPlugin` now removes all matching entries, not just the first one

## 2.15.7

### Fixes
- Fix stale chunk crash after deploy: lazy-loaded views (Canvas, Map, Timeline, Matrix) now auto-reload the page once on chunk load failure instead of showing an error screen

## 2.15.6

### Fixes
- Fix Dexie version conflict: plugins now use ZN's Dexie instance via Blob URL shim (same pattern as React) — no more "Two different versions of Dexie loaded" error
- Add `preview:plugins` npm script for local plugin testing with `npm run preview:plugins`

## 2.15.5

### Fixes
- Docker: support baking plugins into the image via `plugins/` directory — copy `.js` + `manifest.json` before `docker build`
- Added gitignored `plugins/` directory for Docker plugin integration

## 2.15.4

### Fixes
- `home:actions` slot: components now receive `{ context: 'landing' | 'investigations' }` prop — plugins can adapt rendering without querying the DB
- New `app:global` slot: always mounted at the app root, independent of current page — plugins can mount global overlays/modals without duplicating across `header:right` and `home:banner`
- `home:card` actions: cards now support an `actions` array (`{ label, icon, onClick }[]`) alongside `onConfigure` for multiple entry points
- Plugins disabled by default (opt-in via localStorage whitelist)
- Auto-rewrite bare React/ReactDOM/JSX-runtime imports to Blob URL shims in plugin loader
- Auto-register `home:card` for plugins that don't provide one
- Add `process.env` shim for plugins referencing `NODE_ENV`
- Await async plugin `register()` to prevent race conditions
- Replace Eye/EyeOff toggle with proper switch component for plugin enable/disable

## 2.15.2

### Fixes
- Expose `React` and `ReactDOM` as globals (`globalThis.React`, `globalThis.ReactDOM`) before loading external plugins — pre-compiled plugins can now resolve bare `import { useState } from 'react'` via Blob URL loading
- Plugin docs (EN + FR): updated pre-built plugins section with `global-externals` Rollup plugin config, removed manual `(window as any).React = api.React` workaround

## 2.15.1

### Fixes
- Extended plugin API: expose Zustand stores, repositories, db, fileService, generateUUID, i18n to external plugins
- Added `plugin-api.d.ts` type definitions for external plugin developers
- Plugin docs (EN + FR): expanded API surface table, createPortal pattern for plugin modals

## 2.15.0

### Features
- External plugin loading: standalone JS plugins in `dist/plugins/` loaded dynamically at startup via manifest — no recompilation needed
- Plugin API (`pluginAPI`): exposes `registerPlugin`, `React`, `icons`, and `pluginData` persistence helpers to external plugins
- Plugin loader: fetch manifest + Blob URL dynamic import, works in both Vite dev and production
- Service worker exclusion: plugins always fetched fresh (not precached by PWA)

### Docs
- Plugin development guides (FR + EN): new "External Plugins" section with manifest format, API surface, React without JSX, pre-built plugins, deployment, security

## 2.14.0

### Features
- Plugin system: `home:card` slot for structured plugin metadata cards on the home page (name, description, icon, version, license, features, configure callback)
- Plugin disable/enable: toggle plugins on/off from the home page; disabled plugins are filtered from all slots app-wide (context menus, panels, shortcuts, export/import hooks)
- Plugin ID tracking: `pluginId` field on all slot interfaces + 3rd argument on `registerPlugin()` for cross-slot association
- Accordion UI: collapsible Extensions section on home page with count badge, state persisted to localStorage

### Fixes
- MinResolutionGuard: lowered minimum resolution from 1280x720 to 1024x600, now dismissible per session (sessionStorage), fully localized across 11 languages
- Plugin registry: fix infinite re-render loop caused by `useSyncExternalStore` receiving new array references on every `getPlugins()` call — added version-based filtered cache

### i18n
- New keys `enablePlugin`, `disablePlugin` translated across all 11 locales
- New keys `resolution.title`, `resolution.message`, `resolution.dismiss`, `resolution.current`, `resolution.minimum` translated across all 11 locales

### Docs
- Plugin development guides (FR + EN): documented `home:card`, `home:banner` slots, plugin disable/enable system, `pluginId` mechanisms

## 2.13.2

### Features
- Plugin system: new `home:banner` slot for full-width content above home page (landing hero and investigation list)
- PDF text extraction: increase page limit from 10 to 100 pages

## 2.13.1

### Fixes
- Canvas: prevent unintentional element creation from rapid double-clicks (500ms cooldown + drag/viewport guards)
- Context menu: annotations now show a notes excerpt instead of "Sans nom" when label is empty
- SidePanel: persist width to localStorage so it survives page reloads

## 2.13.0

### Features
- PDF/text file content extraction: text from PDF (up to 10 pages) and text files (TXT, MD, CSV) is automatically extracted and indexed for full-text search (Ctrl+K)
- Extracted text preview in asset panel: character count indicator, expandable text preview
- On-demand text extraction: ScanText button to extract or re-extract text at any time
- Clear extracted text: FileX2 button to remove indexed text from an asset

### Fixes
- Fix PDF text extraction: `generatePdfThumbnail()` was detaching the ArrayBuffer (transferred to pdf.js worker), causing `extractPdfText()` to silently fail. Fixed by copying the buffer before thumbnail generation.
- Connect extracted text to MiniSearch index: `searchService.elementToDocument()` now includes concatenated `extractedText` from linked assets (was hardcoded to empty string)

### i18n
- New keys `extractText`, `reExtractText`, `toggleText` translated across all 11 locales

## 2.12.3

### Features
- Plugin registry: `unregisterPlugin(slot, predicate)` to dynamically remove registered plugins
- Plugin registry: immutable slot updates — `registerPlugin`/`registerPlugins` now create new array references (fixes `useSyncExternalStore` reactivity for dynamic add/remove)
- SidePanel: auto-switch to "detail" tab when active plugin tab is unregistered

## 2.12.2

### Features
- Plugin system: new `home:actions` slot for extending the home page (landing and list views)
  - Rendered in the landing footer (before theme toggle) and in the list view toolbar
  - Accepts `ComponentType[]` — same pattern as `header:right`

## 2.12.1

### Fixes
- MarkdownEditor: textarea auto-resizes to fit content (no more manual drag to see full text)

## 2.12.0

### Features
- Plugin system: slot-based extension architecture with 10 named slots
  - `header:right` — inject components in the investigation header
  - `panel:right` — add custom side panel tabs (dynamic icon, label, component)
  - `contextMenu:element` / `contextMenu:link` / `contextMenu:canvas` — context menu entries with dynamic Lucide icons and visibility conditions
  - `report:toolbar` / `report:sectionActions` — report panel extensions
  - `keyboard:shortcuts` — additional keyboard shortcuts (native shortcuts always take priority)
  - `export:hooks` / `import:hooks` — ZIP export/import lifecycle hooks
- Plugin registry (`registerPlugin`, `registerPlugins`, `getPlugins`, `clearAllPlugins`)
- React hook `usePlugins()` using `useSyncExternalStore` for reactive slot consumption
- Generic `pluginData` Dexie table for plugin persistence (`[pluginId+investigationId+key]` compound index)
- Plugin errors never crash the app (all hooks wrapped in try/catch with console.warn)
- Zero runtime impact when no plugins registered (empty arrays iterated, nothing rendered)

### Documentation
- Plugin developer guide in English (`docs/plugin-development-en.md`)
- Plugin developer guide in French (`docs/plugin-development-fr.md`)

## 2.11.0

### Features
- Insights: betweenness centrality computed (graphology-metrics) and displayed as percentage next to degree in the centrality ranking
- Timeline: density heatmap bar below the time axis — adaptive bucket sizing (7/14/30/90/365 days based on zoom), click to set temporal filter, toggleable via toolbar button

### i18n
- Density bar labels translated across all 11 locales (fr, en, de, es, it, pt, nl, pl, ca, eu, ua)
- Betweenness centrality label translated across all 11 locales

## 2.10.2

### Fixes
- Canvas: paste now targets mouse cursor position instead of viewport center (fallback to center if cursor outside canvas)
- Canvas: duplicate (Ctrl+D) preserves parent group membership when the group is also selected
- Canvas: Escape key deselects all elements and links
- Canvas: arrow keys move selected elements (1px, Shift+arrow = 10px) with undo/redo support

## 2.10.1

### Fixes
- Report editor: fix empty content when entering write mode (contentEditable was never populated on initial edit)

## 2.10.0

### Features
- Matrix view: new tabular display mode for investigating data in a spreadsheet-like format
  - Virtual scroll for large datasets (3000+ elements)
  - Column sort, resize, reorder (drag & drop), and visibility toggle
  - Per-column text filter
  - Inline cell editing (double-click) with undo/redo support
  - Keyboard navigation between cells (Tab, Shift+Tab, Arrow keys)
  - Multi-row selection (Ctrl+click, Shift+click)
  - CSV export with investigation-named file
  - Copy selected rows as TSV (Ctrl+C)
  - Anonymous mode, focus mode, and insights highlighting supported
  - Respects canvas tabs membership
- ViewToolbar: added `showMediaToggle` and `showCommentBadgesToggle` props for view-specific toolbar customization

### i18n
- Matrix view labels translated across all 11 locales (fr, en, de, es, it, pt, nl, pl, ca, eu, ua)

## 2.9.1

### Fixes
- SVG export now embeds media thumbnails (images clipped to element shape with proper sizing)
- Canvas: media elements now respect their shape (circle, diamond) instead of always rendering as rectangles

## 2.9.0

### Features
- Comprehensive undo/redo: all destructive actions are now undoable (Ctrl+Z / Ctrl+Shift+Z)
  - Element/link metadata: label, notes, source, confidence, dates, geolocation, visual properties
  - Properties and events: add, edit, delete on elements and links
  - Groups: create group, dissolve group, remove from group
  - Canvas tabs: delete tab
  - Saved views: delete view
  - Report sections: delete section
  - Filters: clear all filters
  - Layout fallback: undo layout when no prior positions exist
- Extract property to element: promote a property to its own element on the canvas, linked to the source
- Extract event to element: promote an event to its own element, with temporal data (date, period) carried by the link

### Fixes
- Event extraction: dates now placed on the link (relationship) instead of the extracted element, matching the semantic model

## 2.8.0

### Features
- Canvas tabs: organize investigations into thematic workspaces (e.g., per hypothesis, per actor type, per time period)
- Tab bar with "All" global view, named tabs, and "+" creation button (max 10 per investigation)
- Ghost elements: elements from other tabs connected to the current tab appear semi-transparent with a badge
- Right-click context menu: add/remove elements from tabs, navigate to ghost element's source tab
- Tabs synchronized via Y.js in collaborative mode (names, members, order — viewport remains local per user)
- Tabs included in ZIP/JSON export and restored on import
- Search (Ctrl+K) auto-switches to the correct tab when selecting a result
- Saved views remember and restore the active tab
- Undo/redo tracks tab membership changes (add/remove elements from tabs)

## 2.7.3

### Fixes
- Collab media sync: serialized encrypted send queue (Promise chain) prevents out-of-order messages and data loss for large payloads
- Collab unshare: `flush()` awaits all pending encrypted messages before disconnect (replaces unreliable 200ms timeout)
- Base64 encoding: chunked `arrayBufferToBase64()` utility (32KB chunks) replaces O(n) string concatenation
- Version check: detect stale cached code on tab focus via `/version.json` polling with cache-busting, persistent toast notification

## 2.7.2

### Fixes
- Collab sync status: "Sync..." indicator no longer stays active when only one user remains (ignore sync events when no peers)

## 2.7.1

### Fixes
- Collab sync: visual property changes (fontSize, shape, color, etc.) no longer overwrite other visual properties on remote peers (partial visual merge instead of full spread)
- Minimap dark mode: background, mask, and node colors adapt to dark theme
- Remove deprecated `apple-mobile-web-app-capable` meta tag (replaced with `mobile-web-app-capable`)
- Remove noisy `[_syncFromYDoc] SLOW` diagnostic logs from console

## 2.7.0

### Features
- Per-element/link font size: XS (8px), S (12px), M (14px), L (18px), XL (22px) presets in Appearance panel
- Font size applies to elements, annotations, groups, links, and multi-selection
- Element resize from all corners now preserves position (not just bottom-right)

### Fixes
- Map temporal mode: day-level comparison for accurate element visibility (no time-of-day drift)
- GeoPicker centers on event's existing coordinates when editing event location
- Asset upload: deferred base64 encoding for faster UI response

## 2.6.0

### Features
- Import all supported formats into current investigation (CSV, JSON, GraphML, GEDCOM, GeneWeb, OSINTracker, Excalidraw, STIX 2.1) — not just ZIP
- All imports enter placement mode: click on the canvas to choose where imported elements are positioned
- Estimated bounding box preview follows cursor with element count badge

### Performance
- Batch undo/redo for multi-select delete: single Y.Doc transaction via `pasteElements` instead of sequential createElement/createLink calls

### Fixes
- Restore collaboration session (WebSocket) after import placement (save/restore shared mode state)

## 2.5.6

### Fixes
- Fix map temporal mode hooks crash: move early return after all hooks to respect React rules
- Fix map temporal mode UX: keep map and timeline visible when temporal filter empties geolocated elements
- Improve map cluster spiderfy spacing with `spiderfyDistanceMultiplier: 2`
- Prevent map link click events from bubbling to map container (`bubblingMouseEvents: false`)

## 2.5.5

### Fixes
- Improve hide media blur: pixelated rendering + stronger blur (16px) + grayscale for better content anonymization

## 2.5.4

### Fixes
- Fix initial sync race condition: joiner could display stale positions/labels from IndexedDB cache when WebSocket sync hadn't completed yet
- Add `waitForSync()` to await WebSocket Y.js sync before reading Y.Doc on shared session join
- Add state-change listener to trigger safety re-sync when WebSocket connection/sync completes after initial load

## 2.5.3

### Fixes
- Fix minimap not showing nodes: persist React Flow dimension measurements on user nodes so `nodeHasDimensions()` check passes in controlled mode
- Eliminate edge flicker during zoom on small graphs (cullingViewport ref + referential stability)
- Fix HD image race condition on first open after refresh (shared inflight promises)

### i18n
- Localize loading screen phases across 11 languages

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
