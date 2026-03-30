# ZeroNeurone Plugin Development Guide

This guide explains how to extend ZeroNeurone with plugins. The plugin system is slot-based: you register extensions into named slots, and ZN components consume them automatically.

## Principles

1. **Registry is empty by default** — ZN works identically with 0 plugins
2. **No conditional code** — ZN components iterate over slots; empty = nothing rendered
3. **No new dependencies** — Plugins use React, Zustand, Dexie, and JSZip already present in ZN
4. **Zero performance impact when empty** — Empty arrays iterated, nothing more
5. **Stable API** — A breaking change on a slot = major ZN version bump

## Quick Start

### 1. Create your plugin file

```typescript
// src/plugins/myPlugin.ts (or a separate npm package)
import { registerPlugin } from '../plugins/pluginRegistry';

export function initMyPlugin() {
  // Add a context menu entry on elements
  registerPlugin('contextMenu:element', {
    id: 'my-plugin-action',
    label: 'Analyze with MyPlugin',
    icon: 'Brain',              // Any Lucide icon name
    separator: true,            // Horizontal line before this entry
    action: (context) => {
      console.log('Selected elements:', context.elementIds);
      // Your logic here
    },
    visible: (context) => context.elementIds.length > 0,
  });
}
```

### 2. Register before app mounts

In `src/main.tsx`, call your init function **before** React renders:

```typescript
import { initMyPlugin } from './plugins/myPlugin';

// 1. Register plugins
initMyPlugin();

// 2. Mount React (existing code)
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
```

### 3. Test in the browser console

You can also register plugins at runtime for quick testing:

```javascript
// Open browser DevTools console
import('/src/plugins/pluginRegistry').then(({ registerPlugin }) => {
  registerPlugin('contextMenu:element', {
    id: 'test',
    label: 'Test Plugin',
    icon: 'Star',
    separator: true,
    action: () => alert('Plugin works!'),
  });
});
```

Right-click an element to see the new menu entry.

## Available Slots

### `header:right` — Header Components

Inject React components in the dossier header toolbar (right side, before the Ko-fi link).

```typescript
import { registerPlugin } from '../plugins/pluginRegistry';

function MyHeaderButton() {
  return (
    <button
      onClick={() => console.log('clicked')}
      className="p-1 text-text-secondary hover:text-text-primary"
      title="My Plugin"
    >
      <span className="text-xs">MP</span>
    </button>
  );
}

registerPlugin('header:right', MyHeaderButton);
```

**Props received:** none

### `home:actions` — Home Page Actions

Inject React components in the home page — both in the landing footer (before the theme toggle) and in the list view toolbar. Components receive a `context` prop so they know which page they're on.

```typescript
import { registerPlugin } from '../plugins/pluginRegistry';
import type { HomeActionsProps } from '../types/plugins';

function MyHomeAction({ context }: HomeActionsProps) {
  return (
    <button
      onClick={() => console.log('clicked from', context)}
      className="inline-flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-secondary transition-colors"
    >
      {context === 'landing' ? 'Get Started' : 'My Action'}
    </button>
  );
}

registerPlugin('home:actions', MyHomeAction);
```

**Props received:** `{ context: 'landing' | 'dossiers' }`

### `home:banner` — Full-Width Banner

Inject React components at the top of the home page, above the hero (landing) or the dossier list. The component spans the full available width — ideal for announcements, alerts, or custom branding.

```typescript
import { registerPlugin } from '../plugins/pluginRegistry';

function MyBanner() {
  return (
    <div className="bg-bg-secondary border-b border-border-default px-6 py-3 text-center text-sm text-text-secondary">
      Internal instance — Do not distribute
    </div>
  );
}

registerPlugin('home:banner', MyBanner);
```

**Props received:** none

**Location:** Rendered above the main content in both home page views (landing and list). The component is outside the `max-w-4xl` container, so it spans the full width.

### `home:card` — Structured Extension Card

Register your plugin as a card in the "Extensions" section of the home page. ZN controls the rendering — you declare metadata, not JSX.

```typescript
import { registerPlugin } from '../plugins/pluginRegistry';

registerPlugin('home:card', {
  id: 'my-plugin',
  name: 'My Plugin',
  description: 'Short description of what the plugin does.',
  icon: 'Brain',                    // Lucide icon name
  version: '1.0.0',                 // Optional
  license: 'MIT',                   // Optional
  docUrl: 'https://example.com',    // Optional — Documentation link
  features: ['Analysis', 'Export'], // Optional — feature badges
  onConfigure: () => {              // Optional — settings button
    console.log('Open settings');
  },
});
```

**Interface:**

```typescript
interface HomeCardRegistration {
  id: string;
  name: string;
  description: string;
  icon: string;
  version?: string;
  license?: string;
  docUrl?: string;
  features?: string[];
  onConfigure?: () => void;
  actions?: CardAction[];
}

interface CardAction {
  label: string;
  icon: string;       // Lucide icon name
  onClick: () => void;
}
```

**Location:** "Extensions" section on the landing page, between the features grid and the footer. Only displayed when at least one card is registered. Rendering is handled by ZN — consistent style with existing feature tiles.

#### Home Card Actions

Cards can declare an `actions` array alongside `onConfigure`. Each action renders as a small button in the card footer.

```typescript
registerPlugin('home:card', {
  id: 'my-plugin',
  name: 'My Plugin',
  description: 'Short description of what the plugin does.',
  icon: 'Brain',
  onConfigure: () => { /* settings */ },
  actions: [
    { label: 'Cross analysis', icon: 'GitCompare', onClick: () => { /* ... */ } },
    { label: 'Export data', icon: 'Download', onClick: () => { /* ... */ } },
  ],
});
```

### `app:global` — Global Components

Inject React components at the App root level. These are always mounted, independent of the current page — ideal for global modals, overlays, or background services that must remain active across navigation.

```typescript
import { registerPlugin } from '../plugins/pluginRegistry';

function GlobalOverlay() {
  // Always mounted, use createPortal for modals
  return null; // or your overlay component
}

registerPlugin('app:global', GlobalOverlay, 'my-plugin');
```

**Props received:** none

Unlike `header:right` or `home:banner`, components in `app:global` are not tied to a specific page. They stay mounted whether the user is on the home page, inside an dossier, or anywhere else.

### `panel:right` — Side Panel Tabs

Add a custom tab to the right side panel (alongside Detail, Insights, Filters, Views, Report).

```typescript
import { registerPlugin } from '../plugins/pluginRegistry';
import type { PanelPluginProps } from '../types/plugins';

function MyPanel({ dossierId }: PanelPluginProps) {
  return (
    <div className="p-4">
      <h3 className="text-sm font-semibold mb-2">My Plugin</h3>
      <p className="text-xs text-text-secondary">
        Dossier: {dossierId}
      </p>
    </div>
  );
}

registerPlugin('panel:right', {
  id: 'my-plugin-panel',
  label: 'My Plugin',
  icon: 'Brain',          // Lucide icon name
  component: MyPanel,
});
```

**Props received:** `{ dossierId: string }`

The panel appears as a new tab in the side panel. The icon is resolved dynamically from `lucide-react`.

### `contextMenu:element` / `contextMenu:link` / `contextMenu:canvas` — Context Menu

Add entries to the right-click context menu. Three separate slots depending on what was clicked.

```typescript
interface ContextMenuExtension {
  id: string;                                    // Unique identifier
  label: string;                                 // Display label
  icon: string;                                  // Lucide icon name
  separator?: boolean;                           // Add horizontal line before
  action: (context: MenuContext) => void;        // Click handler
  visible?: (context: MenuContext) => boolean;   // Visibility condition
}

interface MenuContext {
  elementIds: string[];                          // Selected element IDs
  linkIds: string[];                             // Selected link IDs
  canvasPosition?: { x: number; y: number };     // Right-click position
  hasTextAssets: boolean;                        // Has extractable text
  dossierId: string;                       // Current dossier
}
```

**Example: element action visible only with single selection**

```typescript
registerPlugin('contextMenu:element', {
  id: 'enrich-osint',
  label: 'OSINT Enrichment',
  icon: 'Search',
  separator: true,
  action: (ctx) => {
    const elementId = ctx.elementIds[0];
    // Call your enrichment API...
  },
  visible: (ctx) => ctx.elementIds.length === 1,
});
```

**Example: canvas action (right-click on empty space)**

```typescript
registerPlugin('contextMenu:canvas', {
  id: 'generate-timeline',
  label: 'Generate Timeline Report',
  icon: 'Clock',
  action: (ctx) => {
    console.log('Canvas position:', ctx.canvasPosition);
  },
});
```

### `keyboard:shortcuts` — Keyboard Shortcuts

Register additional keyboard shortcuts. Native ZN shortcuts always take priority.

```typescript
registerPlugin('keyboard:shortcuts', {
  keys: 'ctrl+shift+p',        // Format: modifier+modifier+key
  action: () => {
    console.log('My plugin shortcut triggered');
  },
  description: 'Open My Plugin',
  scope: 'global',              // 'global' or 'panel'
});
```

**Key format:** lowercase, `+` separated. Supported modifiers: `ctrl`, `shift`, `alt`.

**Convention:** Use `Ctrl+Shift+*` (3-key combos) to avoid conflicts with ZN native shortcuts (2-key combos).

### `report:toolbar` — Report Toolbar Buttons

Add buttons to the report panel toolbar (next to export buttons).

```typescript
import type { ReportToolbarPluginProps } from '../types/plugins';

function MyReportButton({ dossierId }: ReportToolbarPluginProps) {
  return (
    <button
      onClick={() => console.log('Generate AI summary for', dossierId)}
      className="p-1 text-text-secondary hover:text-accent"
      title="AI Summary"
    >
      <Brain size={14} />
    </button>
  );
}

registerPlugin('report:toolbar', MyReportButton);
```

**Props received:** `{ dossierId: string }`

### `report:sectionActions` — Report Section Actions

Add action buttons per report section (next to the delete button).

```typescript
import type { ReportSectionPluginProps } from '../types/plugins';

function MySectionAction({ sectionId, dossierId }: ReportSectionPluginProps) {
  return (
    <button
      onClick={() => console.log('Process section', sectionId)}
      className="p-0.5 text-text-secondary hover:text-accent"
      title="Process with AI"
    >
      <Sparkles size={14} />
    </button>
  );
}

registerPlugin('report:sectionActions', MySectionAction);
```

**Props received:** `{ sectionId: string, dossierId: string }`

### `export:hooks` / `import:hooks` — ZIP Lifecycle

Hook into the ZIP export/import process to save/restore your plugin's data.

```typescript
registerPlugin('export:hooks', {
  name: 'my-plugin',
  onExport: async (zip, dossierId) => {
    // Read your data from Dexie
    const myData = await db.pluginData
      .where({ pluginId: 'my-plugin', dossierId })
      .toArray();

    // Add to the ZIP
    zip.file('plugins/my-plugin.json', JSON.stringify(myData));
  },
});

registerPlugin('import:hooks', {
  name: 'my-plugin',
  onImport: async (zip, dossierId) => {
    const file = zip.file('plugins/my-plugin.json');
    if (!file) return;

    const data = JSON.parse(await file.async('string'));
    // Restore your data into Dexie
    for (const row of data) {
      await db.pluginData.put({ ...row, dossierId });
    }
  },
});
```

**Error handling:** If your hook throws, ZN catches the error, logs a warning, and continues. Your plugin failing never blocks the export/import.

## Data Persistence

ZN provides a generic `pluginData` table in Dexie for plugin storage:

```typescript
interface PluginDataRow {
  pluginId: string;        // Your plugin identifier
  dossierId: string; // Associated dossier
  key: string;             // Data key
  value: any;              // Your data (any serializable value)
}
```

**Compound index:** `[pluginId+dossierId+key]` — efficient queries per plugin per dossier.

### Usage example

```typescript
import { db } from '../db/database';

// Write
await db.pluginData.put({
  pluginId: 'my-plugin',
  dossierId: 'inv-123',
  key: 'settings',
  value: { threshold: 0.5, enabled: true },
});

// Read
const row = await db.pluginData.get({
  pluginId: 'my-plugin',
  dossierId: 'inv-123',
  key: 'settings',
});
console.log(row?.value); // { threshold: 0.5, enabled: true }

// Read all keys for a plugin in an dossier
const allRows = await db.pluginData
  .where({ pluginId: 'my-plugin', dossierId: 'inv-123' })
  .toArray();

// Delete
await db.pluginData.delete(['my-plugin', 'inv-123', 'settings']);
```

### Scoped API (external plugins)

External plugins loaded via `manifest.json` receive a **scoped** API where `pluginId` is injected automatically. You don't need to pass it:

```javascript
// In register(api):
// api.pluginId is available (e.g. "my-plugin")

// Write (dossierId, key, value — no pluginId needed)
await api.pluginData.set(dossierId, 'settings', { threshold: 0.5 });

// Read
const settings = await api.pluginData.get(dossierId, 'settings');

// Delete
await api.pluginData.remove(dossierId, 'settings');
```

This prevents a plugin from reading or writing another plugin's data.

### Global data (not tied to a dossier)

For data not tied to any dossier (server credentials, preferences, license), use the global methods:

```javascript
// Write (key, value — no pluginId needed for external plugins)
await api.pluginData.setGlobal('serverUrl', 'https://...');
await api.pluginData.setGlobal('apiKey', 'xxx');

// Read
const url = await api.pluginData.getGlobal('serverUrl');

// Delete
await api.pluginData.removeGlobal('serverUrl');
```

**Note:** Global data is NOT affected by dossier deletion.

### Automatic cleanup

When a dossier is deleted, ZN automatically cleans up all `pluginData` associated with that dossier. No need to handle this case in your plugin.

## Event Bus (`api.events`)

Plugins can react to data changes via a pub/sub event bus. Callbacks are always wrapped in try/catch — a failing plugin never crashes ZN.

```javascript
// Subscribe to an event — returns an unsubscribe function
const unsub = api.events.on('element:created', (event) => {
  console.log('New element:', event.entityId, 'in', event.dossierId);
});

// Unsubscribe
unsub();
```

### Available events

| Event | entityId | Fired when |
|-------|----------|------------|
| `dossier:created` | — | New dossier created |
| `dossier:updated` | — | Dossier metadata modified |
| `dossier:deleted` | — | Dossier deleted (fired BEFORE deletion) |
| `dossier:opened` | — | User opens a dossier |
| `dossier:closed` | — | User closes a dossier |
| `element:created` | elementId | Element created on canvas |
| `element:updated` | elementId | Element modified |
| `element:deleted` | elementId | Element deleted |
| `link:created` | linkId | Link created |
| `link:updated` | linkId | Link modified |
| `link:deleted` | linkId | Link deleted |
| `asset:created` | assetId | File attached to an element |
| `asset:deleted` | assetId | File removed |

### Event structure

```typescript
interface PluginEvent {
  type: PluginEventType;
  dossierId: string;
  entityId?: string;
  timestamp: number;  // Date.now()
}
```

### Example: event-driven mode

```javascript
// Replace polling with a listener
api.events.on('dossier:updated', (event) => {
  markDossierDirty(event.dossierId);
  maybeScheduleBackup(event.dossierId);
});

// React to every element modification
api.events.on('element:updated', (event) => {
  refreshAnalysis(event.dossierId, event.entityId);
});
```

## Services (`api.services`)

### `exportDossier(dossierId)`

Produces a complete ZIP snapshot of a dossier (same format as manual export). Calls `export:hooks` plugins.

```javascript
const blob = await api.services.exportDossier(dossierId);
// blob is a ZIP Blob ready to be uploaded or saved
```

### `importDossier(blob, options?)`

Imports a ZIP into an existing or new dossier.

```javascript
const result = await api.services.importDossier(blob, {
  targetDossierId: existingId,      // optional — if absent, creates a new dossier
  positionOffset: { x: 100, y: 0 }, // optional — offset for merge
  suffix: ' (restored)',             // optional — suffix for new dossier name
  replace: true,                     // optional — clear all existing content before importing
});

console.log(result.dossierId, result.elementsImported, result.success);
```

When `replace: true`, all existing content (elements, links, assets, tabs, reports, views, pluginData) is deleted before importing. The dossier shell (ID, name, metadata) is kept.

### `navigateTo(path)`

Internal react-router navigation. Available routes:
- `/` — Home page
- `/dossier/:id` — Open a dossier

```javascript
api.services.navigateTo(`/dossier/${newDossierId}`);
```

## Toast / Notifications (`api.toast`)

Simplified API for user notifications. Preferred over direct UI store access.

```javascript
api.toast.success('Backup completed');
api.toast.error('Connection failed', { duration: 0 });  // persistent
api.toast.warning('Low disk space');
api.toast.info('Syncing...');

// Dismiss a toast by ID
const id = api.toast.info('Processing...', { duration: 0 });
// ... later
api.toast.dismiss(id);
```

**Default durations:** `error` = 0 (persistent), others = 3000ms.

## At-Rest Encryption

If ZeroNeurone has at-rest encryption enabled, plugins that store their own sensitive data in a Dexie database can participate in the same encryption. The DEK (Data Encryption Key) is never handed to them raw — the API exposes an opaque middleware to apply to their Dexie instance.

### Available API

The `api.encryption` object (available in external plugins via `register(api)`) provides:

| Method | Description |
|--------|-------------|
| `applyToDatabase(dexieInstance, tables)` | Applies the ZN encryption middleware to an external Dexie instance. No-op if encryption is inactive or session is locked. |
| `onReady(cb)` | Callback fired when the DEK is available (after unlock or startup without encryption). Called immediately if already ready. Returns an unlisten function. |
| `onLock(cb)` | Callback fired when the session is locked (DEK erased). Returns an unlisten function. |
| `isEnabled()` | `true` if encryption is enabled in ZeroNeurone. |
| `onBeforeDisable(cb)` | Callback called (and awaited) just before ZN disables encryption and reloads the page. Lets the plugin decrypt its data before restart. |

### Recommended Lifecycle

```javascript
export function register(api) {
  const { db: myDb } = initMyPluginDb();
  const ENCRYPTED_TABLES = ['conversations', 'results'];
  let middlewareInstalled = false;

  // 1. Apply middleware when DEK is available
  const unlistenReady = api.encryption.onReady(() => {
    if (middlewareInstalled) return;
    api.encryption.applyToDatabase(myDb, ENCRYPTED_TABLES);
    middlewareInstalled = true;
    // Migrate existing unencrypted data (idempotent)
    migrateExistingData(myDb, ENCRYPTED_TABLES);
  });

  // 2. Close DB when session is locked (data inaccessible)
  const unlistenLock = api.encryption.onLock(() => {
    myDb.close();
    middlewareInstalled = false;
  });

  // 3. Decrypt data when ZN disables encryption
  const unlistenDisable = api.encryption.onBeforeDisable(async (decryptRecord) => {
    for (const tableName of ENCRYPTED_TABLES) {
      const records = await myDb[tableName].toArray();
      const plainRecords = records.map(decryptRecord);
      await writeViaRawIDB(myDb.name, tableName, plainRecords);
    }
  });

  // Cleanup if plugin is unregistered
  return () => {
    unlistenReady();
    unlistenLock();
    unlistenDisable();
  };
}
```

### Migration Idempotence

The ZN encryption middleware detects already-encrypted fields (prefix `__zn_enc__:`) and skips them. It is safe to call `bulkPut` on partially encrypted data — for example when first enabling encryption on pre-existing data.

### Data Stored via `api.pluginData`

If your plugin stores data in `api.pluginData` (ZN's generic table), it is automatically encrypted by the ZN middleware — no action needed. Only Dexie databases **managed by the plugin itself** require explicit integration.

For the full cryptographic architecture, see [encryption-en.md](encryption-en.md).

## Internationalization (i18n)

Plugins manage their own translations. Use `i18next.addResourceBundle()` in your init function:

```typescript
import i18n from 'i18next';

export function initMyPlugin() {
  // Add translations
  i18n.addResourceBundle('en', 'myPlugin', {
    menuLabel: 'Analyze with MyPlugin',
    panelTitle: 'MyPlugin Results',
  });
  i18n.addResourceBundle('fr', 'myPlugin', {
    menuLabel: 'Analyser avec MyPlugin',
    panelTitle: 'Resultats MyPlugin',
  });

  // Register plugin extensions...
}
```

Then use `useTranslation('myPlugin')` in your components.

## Design Guidelines

Follow ZN design rules strictly:

- No emojis in UI
- No rounded-xl/2xl (use `rounded` only)
- No shadow-lg/xl (except modals)
- No gradients or decorative animations
- Monochrome icons (Lucide React, 16px default, 14px in toolbars)
- Dense information display
- One blue primary button max per screen
- System font stack only

See [design-guidelines-v1.md](design-guidelines-v1.md) for full specifications.

## Error Handling

ZN wraps all plugin interactions in try/catch. However, you should still handle errors gracefully:

| Scenario | ZN behavior |
|----------|-------------|
| `action()` throws | Error caught, logged, app continues |
| `visible()` throws | Treated as `false`, no crash |
| `onExport()` throws | Warning logged, export continues |
| `onImport()` throws | Warning logged, import continues |
| Invalid icon name | No icon rendered, no crash |
| Same `id` registered twice | Both displayed (your responsibility to avoid) |
| Plugin registered after React mount | `usePlugins` triggers re-render via `useSyncExternalStore` |

## API Reference

### `registerPlugin(slot, extension, pluginId?)`

Register a single extension into a slot. The optional `pluginId` parameter links this extension to a plugin registered in `home:card`, enabling the disable/enable feature.

```typescript
function registerPlugin<K extends keyof PluginSlots>(
  slot: K,
  extension: PluginSlots[K][number],
  pluginId?: string
): void;
```

### `registerPlugins(slot, extensions)`

Register multiple extensions at once.

```typescript
function registerPlugins<K extends keyof PluginSlots>(
  slot: K,
  extensions: PluginSlots[K][number][]
): void;
```

### `unregisterPlugin(slot, predicate)`

Remove the first extension matching the predicate from a slot. Useful for dynamic plugins that need to clean up.

```typescript
function unregisterPlugin<K extends keyof PluginSlots>(
  slot: K,
  predicate: (ext: PluginSlots[K][number]) => boolean
): void;
```

**Example:**

```typescript
// Remove a panel plugin by id
unregisterPlugin('panel:right', (p) => p.id === 'my-plugin-panel');
```

### `getPlugins(slot)`

Get all extensions for a slot (returns readonly array). Use this outside React components.

```typescript
function getPlugins<K extends keyof PluginSlots>(
  slot: K
): Readonly<PluginSlots[K]>;
```

### `clearAllPlugins()`

Remove all registered extensions (useful for testing).

```typescript
function clearAllPlugins(): void;
```

### `usePlugins(slot)`

React hook for reactive slot consumption. Re-renders when the slot changes.

```typescript
function usePlugins<K extends keyof PluginSlots>(
  slot: K
): Readonly<PluginSlots[K]>;
```

## Complete Plugin Example

Here's a full plugin that adds an OSINT enrichment feature:

```typescript
// src/plugins/osintPlugin.ts
import { registerPlugin, registerPlugins } from '../plugins/pluginRegistry';
import { db } from '../db/database';
import i18n from 'i18next';
import type { PanelPluginProps, ReportToolbarPluginProps } from '../types/plugins';

// ─── i18n ────────────────────────────────────────────────────

const translations = {
  en: {
    menuEnrich: 'OSINT Enrichment',
    panelTitle: 'OSINT Results',
    shortcutDesc: 'Open OSINT panel',
    noResults: 'No results yet. Right-click an element to enrich.',
  },
  fr: {
    menuEnrich: 'Enrichissement OSINT',
    panelTitle: 'Resultats OSINT',
    shortcutDesc: 'Ouvrir le panneau OSINT',
    noResults: 'Aucun resultat. Clic droit sur un element pour enrichir.',
  },
};

// ─── Components ──────────────────────────────────────────────

function OsintPanel({ dossierId }: PanelPluginProps) {
  // Your panel UI here
  return <div className="p-4 text-sm">OSINT results for {dossierId}</div>;
}

// ─── Init ────────────────────────────────────────────────────

export function initOsintPlugin() {
  // i18n
  for (const [lang, bundle] of Object.entries(translations)) {
    i18n.addResourceBundle(lang, 'osint', bundle);
  }

  // Context menu: enrich selected element
  registerPlugin('contextMenu:element', {
    id: 'osint-enrich',
    label: 'OSINT Enrichment',
    icon: 'Search',
    separator: true,
    action: async (ctx) => {
      const elementId = ctx.elementIds[0];
      // Call OSINT API, store results in pluginData...
      await db.pluginData.put({
        pluginId: 'osint',
        dossierId: ctx.dossierId,
        key: `result-${elementId}`,
        value: { /* enrichment data */ },
      });
    },
    visible: (ctx) => ctx.elementIds.length === 1,
  });

  // Side panel tab
  registerPlugin('panel:right', {
    id: 'osint-panel',
    label: 'OSINT',
    icon: 'Search',
    component: OsintPanel,
  });

  // Keyboard shortcut
  registerPlugin('keyboard:shortcuts', {
    keys: 'ctrl+shift+o',
    action: () => {
      // Toggle OSINT panel visibility
    },
    description: 'Open OSINT panel',
    scope: 'global',
  });

  // Export/import hooks
  registerPlugin('export:hooks', {
    name: 'osint',
    onExport: async (zip, dossierId) => {
      const data = await db.pluginData
        .where({ pluginId: 'osint', dossierId })
        .toArray();
      if (data.length > 0) {
        zip.file('plugins/osint.json', JSON.stringify(data));
      }
    },
  });

  registerPlugin('import:hooks', {
    name: 'osint',
    onImport: async (zip, dossierId) => {
      const file = zip.file('plugins/osint.json');
      if (!file) return;
      const data = JSON.parse(await file.async('string'));
      for (const row of data) {
        await db.pluginData.put({ ...row, dossierId });
      }
    },
  });
}
```

## File Structure

```
src/
├── plugins/
│   ├── pluginRegistry.ts    # Registry + API
│   ├── usePlugins.ts        # React hook
│   └── myPlugin.ts          # Your plugin(s)
├── types/
│   └── plugins.ts           # Plugin type definitions
└── main.tsx                 # Plugin init before React mount
```

## Plugin Disable/Enable

Users can disable plugins from the home page "Extensions" section. When disabled, a plugin's contributions to ALL slots are filtered out.

### How It Works

For the disable to work across all slots, ZN must know which extensions belong to which plugin. Three mechanisms, in priority order:

**1. Third argument to `registerPlugin`** (required for `ComponentType` slots):

```typescript
const PLUGIN_ID = 'my-plugin';

registerPlugin('home:card', { id: PLUGIN_ID, ... });
registerPlugin('home:actions', MyActionComponent, PLUGIN_ID);
registerPlugin('home:banner', MyBannerComponent, PLUGIN_ID);
registerPlugin('header:right', MyHeaderButton, PLUGIN_ID);
registerPlugin('app:global', MyGlobalOverlay, PLUGIN_ID);
registerPlugin('report:toolbar', MyToolbar, PLUGIN_ID);
```

**2. `pluginId` field on extension objects**:

```typescript
registerPlugin('contextMenu:element', {
  id: 'my-action',
  label: 'Analyze',
  icon: 'Brain',
  pluginId: 'my-plugin',  // ← links to home:card id
  action: (ctx) => { ... },
});

registerPlugin('panel:right', {
  id: 'my-panel',
  label: 'My Panel',
  icon: 'Brain',
  pluginId: 'my-plugin',  // ← links to home:card id
  component: MyPanelComponent,
});
```

**3. Automatic for `home:card`**: The `id` field of `HomeCardRegistration` is the canonical plugin ID. No extra configuration needed.

### Best Practice

Use a shared constant for your plugin ID:

```typescript
export const PLUGIN_ID = 'my-plugin';

// All registrations reference the same ID
registerPlugin('home:card', { id: PLUGIN_ID, name: '...', ... });
registerPlugin('header:right', MyHeaderButton, PLUGIN_ID);
registerPlugin('contextMenu:element', { ..., pluginId: PLUGIN_ID });
registerPlugin('keyboard:shortcuts', { ..., pluginId: PLUGIN_ID });
registerPlugin('export:hooks', { ..., pluginId: PLUGIN_ID });
```

### API

```typescript
import { isPluginDisabled } from '../plugins/pluginRegistry';

// Check if your plugin is disabled (useful for conditional logic)
if (isPluginDisabled('my-plugin')) return;
```

## Slots Reference Table

| Slot | Type | Props/Interface | Location |
|------|------|-----------------|----------|
| `header:right` | `ComponentType` | none | Dossier header toolbar |
| `home:actions` | `ComponentType<HomeActionsProps>` | `{ context: 'landing' \| 'dossiers' }` | Home page (landing footer + list toolbar) |
| `home:banner` | `ComponentType` | none | Home page (full-width, above hero/list) |
| `home:card` | `HomeCardRegistration` | structured metadata | Landing "Extensions" section |
| `app:global` | `ComponentType` | none | Always mounted at app root, independent of page |
| `panel:right` | `PanelPluginRegistration` | `{ dossierId }` | Side panel tabs |
| `contextMenu:element` | `ContextMenuExtension` | `MenuContext` | Element right-click |
| `contextMenu:link` | `ContextMenuExtension` | `MenuContext` | Link right-click |
| `contextMenu:canvas` | `ContextMenuExtension` | `MenuContext` | Canvas right-click |
| `report:toolbar` | `ComponentType<ReportToolbarPluginProps>` | `{ dossierId }` | Report panel toolbar |
| `report:sectionActions` | `ComponentType<ReportSectionPluginProps>` | `{ sectionId, dossierId }` | Report section header |
| `keyboard:shortcuts` | `KeyboardShortcut` | — | Global keydown handler |
| `export:hooks` | `ExportHook` | `(zip, dossierId)` | ZIP export |
| `import:hooks` | `ImportHook` | `(zip, dossierId)` | ZIP import |

## External Plugins (Local Loading)

External plugins are standalone JavaScript files placed in the `plugins/` folder alongside the app. They are loaded dynamically at startup — no recompilation needed. No internet access, no download — the admin controls what gets deployed.

### How It Works

1. On startup, ZN fetches `/plugins/manifest.json`
2. For each plugin entry, ZN dynamically imports the JS file
3. Each plugin's `register(api)` function is called with the ZN plugin API
4. React mounts after all plugins are loaded — `usePlugins()` returns correct data from the first render

If `manifest.json` is missing or empty, the app boots normally with zero overhead.

### Manifest Format

```json
{
  "plugins": [
    { "id": "my-plugin", "file": "my-plugin.js", "integrity": "a1b2c3..." },
    { "id": "other-plugin", "file": "other-plugin.js" }
  ]
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique plugin identifier |
| `file` | Yes | JS filename relative to `/plugins/` |
| `name` | No | Display name (used in auto-generated home card) |
| `description` | No | Short description |
| `integrity` | No | SHA-256 hex hash of the JS file. If set, ZN verifies the file content before execution. Mismatched files are skipped with a warning. |

**Generating the integrity hash:**
```bash
sha256sum plugins/my-plugin.js | cut -d' ' -f1
# or in Node.js:
node -e "const fs=require('fs');const c=require('crypto');console.log(c.createHash('sha256').update(fs.readFileSync('plugins/my-plugin.js')).digest('hex'))"
```

Place this file at `dist/plugins/manifest.json` (or `public/plugins/manifest.json` during development).

### Plugin File Format

Each plugin is an ES module that exports a `register` function:

```javascript
// plugins/my-plugin.js
export function register(api) {
  const { registerPlugin, React, icons } = api;

  // Register card on home page
  registerPlugin('home:card', {
    id: 'my-plugin',
    name: 'My Plugin',
    description: 'What this plugin does.',
    icon: 'Brain',
    version: '1.0.0',
  });

  // Register into other slots with pluginId for disable/enable support
  registerPlugin('contextMenu:element', {
    id: 'my-plugin-action',
    label: 'My Action',
    icon: 'Brain',
    pluginId: 'my-plugin',
    action: (ctx) => { console.log('Selected:', ctx.elementIds); },
  });
}
```

### API Surface

The `api` object passed to `register()` provides:

**Plugin registration:**

| Property | Description |
|----------|-------------|
| `registerPlugin(slot, extension, pluginId?)` | Register an extension into a slot |
| `registerPlugins(slot, extensions, pluginId?)` | Register multiple extensions at once |
| `isPluginDisabled(id)` | Check if a plugin is disabled |

**React & UI:**

| Property | Description |
|----------|-------------|
| `React` | The app's React instance (same instance — hooks work) |
| `icons` | All lucide-react icons |
| `i18n` | i18next instance (`addResourceBundle`, `t()`) |

**Zustand stores (read/write app state):**

| Property | Description |
|----------|-------------|
| `stores.useDossierStore` | Elements, links, assets, comments, CRUD actions |
| `stores.useSelectionStore` | Current canvas selection (element/link IDs) |
| `stores.useViewStore` | Current dossier ID, viewport, filters |
| `stores.useReportStore` | Report sections, add/update/delete |
| `stores.useInsightsStore` | Graph analysis: clusters, centrality, bridges |
| `stores.useTagSetStore` | TagSets: create, update, suggested properties |
| `stores.useTabStore` | Canvas tabs: create, rename, members |
| `stores.useUIStore` | UI state: toasts, modals (prefer `api.toast` for notifications) |

**Database repositories (direct DB access):**

| Property | Description |
|----------|-------------|
| `repositories.elementRepository` | `getByDossier(id)`, `getById(id)`, etc. |
| `repositories.linkRepository` | `getByDossier(id)`, `getById(id)`, etc. |
| `repositories.dossierRepository` | `getAll()`, `getById(id)` |

**Services & utilities:**

| Property | Description |
|----------|-------------|
| `db` | Dexie database instance (direct IndexedDB access) |
| `fileService` | OPFS file management (`getAssetFile`, `getAssetUrl`, `extractAssetText`) |
| `generateUUID()` | Generate a UUID v4 |
| `pluginData.get(dossierId, key)` | Read from persistent plugin storage (pluginId auto-injected) |
| `pluginData.set(dossierId, key, value)` | Write to persistent plugin storage |
| `pluginData.remove(dossierId, key)` | Delete from persistent plugin storage |
| `pluginData.getGlobal(key)` | Read global data (not tied to a dossier) |
| `pluginData.setGlobal(key, value)` | Write global data |
| `pluginData.removeGlobal(key)` | Delete global data |
| `pluginId` | The plugin's ID (from manifest) |

**Services (export, import, navigation):**

| Property | Description |
|----------|-------------|
| `services.exportDossier(dossierId)` | Produce a complete ZIP snapshot of a dossier (returns `Promise<Blob>`) |
| `services.importDossier(blob, options?)` | Import a ZIP into an existing or new dossier |
| `services.navigateTo(path)` | Internal react-router navigation (`/`, `/dossier/:id`) |

**Event bus (react to data changes):**

| Property | Description |
|----------|-------------|
| `events.on(eventType, callback)` | Subscribe to an event. Returns an unsubscribe function |

**Toast / Notifications:**

| Property | Description |
|----------|-------------|
| `toast.success(message, options?)` | Success notification (default duration: 3000ms) |
| `toast.error(message, options?)` | Error notification (default duration: persistent) |
| `toast.warning(message, options?)` | Warning notification |
| `toast.info(message, options?)` | Info notification |
| `toast.dismiss(id)` | Dismiss a toast by its ID |

**At-rest encryption:**

| Property | Description |
|----------|-------------|
| `encryption.applyToDatabase(dexieInstance, tables)` | Apply ZN encryption middleware to an external Dexie instance |
| `encryption.onReady(cb)` | Callback when DEK is available. Returns unlisten |
| `encryption.onLock(cb)` | Callback when session is locked. Returns unlisten |
| `encryption.isEnabled()` | True if encryption is active |
| `encryption.isUnlocked()` | True if the DEK is unlocked (available in memory) |
| `encryption.encrypt(plaintext)` | Encrypt an ArrayBuffer with the ZN DEK (AES-256-GCM). Rejects if session is locked |
| `encryption.decrypt(ciphertext)` | Decrypt an ArrayBuffer produced by `encrypt()`. Rejects if session is locked |
| `encryption.onBeforeDisable(cb)` | Callback before encryption is disabled (to decrypt plugin data) |

**TypeScript types:** Copy `src/types/plugin-api.d.ts` into your plugin project for full type definitions (`PluginAPI`, `Element`, `Link`, `ReportSection`, etc.).

### React Components Without JSX

External plugins are plain JavaScript — no JSX transpilation. Use `React.createElement` directly:

```javascript
export function register(api) {
  const { registerPlugin, React } = api;
  const h = React.createElement;

  function MyPanel({ dossierId }) {
    const [count, setCount] = React.useState(0);

    return h('div', { className: 'p-4 text-sm' },
      h('p', null, 'Dossier: ' + dossierId),
      h('button', {
        className: 'px-2 py-1 text-xs bg-bg-secondary border border-border-default rounded',
        onClick: () => setCount(c => c + 1),
      }, 'Clicked: ' + count)
    );
  }

  registerPlugin('panel:right', {
    id: 'my-panel',
    label: 'My Panel',
    icon: 'Brain',
    pluginId: 'my-plugin',
    component: MyPanel,
  });
}
```

### Pre-Built Plugins (with JSX)

For larger plugins, use a bundler (Vite, esbuild, Rollup) with shared libraries marked as external. ZN exposes `React`, `ReactDOM`, the JSX runtime, and `Dexie` as globals before loading plugins, so bare `import` specifiers just need to be redirected to the globals.

**Important — Shared dependencies must be externalized:**

ZN and your plugin must share a single instance of these libraries. If your bundler inlines them into the plugin bundle, you will get runtime errors (e.g. "Two different versions of Dexie loaded", broken React hooks).

| Library | ZN auto-rewrites `from "..."` | Must be `external` in bundler |
|---------|-------------------------------|-------------------------------|
| `react` | Yes | **Yes** |
| `react-dom` | Yes | **Yes** |
| `react/jsx-runtime` | Yes | **Yes** |
| `react/jsx-dev-runtime` | Yes | **Yes** |
| `dexie` | Yes | **Yes** |

ZN's plugin loader automatically rewrites bare import specifiers (`from "react"`, `from "dexie"`, etc.) to Blob URL shims that point to the app's instances. But this only works if your bundler **keeps them as bare imports** — if it bundles the library code inline, ZN can't intercept it.

**Vite config for the plugin:**

```javascript
// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: 'src/index.tsx',
      formats: ['es'],
      fileName: 'my-plugin',
    },
    rollupOptions: {
      external: [
        'react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime',
        'dexie',
      ],
    },
  },
});
```

With `external` configured, your bundler keeps `from "react"` and `from "dexie"` as-is in the output. ZN then rewrites them to Blob URL shims at load time.

**Plugin entry point:**

```typescript
// src/index.tsx
import { useState } from 'react';  // kept as bare import → ZN rewrites to its React
import Dexie from 'dexie';          // kept as bare import → ZN rewrites to its Dexie

export function register(api: any) {
  const { registerPlugin } = api;
  // ... use JSX, React hooks, and Dexie normally
}
```

**Why this is needed:** Plugins are loaded via Blob URL (`fetch` + `import(blobUrl)`). In this context, bare specifiers like `import React from 'react'` or `import Dexie from 'dexie'` can't resolve through the module system. ZN's loader rewrites them to Blob URL shims that re-export from globals set before any plugin loads. If your bundler inlines these libraries instead, you get duplicate instances and runtime errors.

### Deployment

1. Build or write your plugin as a `.js` ES module
2. Copy it to `dist/plugins/` (next to the ZN app)
3. Add an entry to `dist/plugins/manifest.json`
4. Reload the app

### Error Handling

- If `manifest.json` is missing (404): app boots normally, no error
- If a plugin file fails to load: warning logged, other plugins still load
- If `register()` throws: warning logged, other plugins still load
- Plugin errors never crash the app

### Plugin Modals (createPortal)

External plugins cannot add components to the React root. To render modals or overlays, use `React.createPortal` to portal into `document.body`:

```javascript
export function register(api) {
  const { registerPlugin, React } = api;
  const { useState, createElement: h } = React;
  const { createPortal } = await import('react-dom');

  function MyHeaderButton() {
    const [showModal, setShowModal] = useState(false);

    return h(React.Fragment, null,
      h('button', { onClick: () => setShowModal(true) }, 'Open'),
      showModal && createPortal(
        h('div', { className: 'fixed inset-0 z-50 flex items-center justify-center bg-black/30' },
          h('div', { className: 'bg-bg-primary border border-border-default rounded shadow-lg p-6 max-w-md' },
            h('p', null, 'Modal content'),
            h('button', { onClick: () => setShowModal(false) }, 'Close')
          )
        ),
        document.body
      )
    );
  }

  registerPlugin('header:right', MyHeaderButton, 'my-plugin');
}
```

### Legacy aliases (backward compatibility)

Since v2.20.0, ZN renamed "Investigation" to "Dossier" everywhere. To avoid breaking existing plugins, temporary aliases are exposed:

| Old name | New name | Support |
|----------|----------|---------|
| `stores.useInvestigationStore` | `stores.useDossierStore` | Alias available |
| `repositories.investigationRepository` | `repositories.dossierRepository` | Alias available |
| `getState().currentInvestigation` | `getState().currentDossier` | Alias available |
| `element.investigationId` | `element.dossierId` | **No alias** — data uses `dossierId` |

> **These aliases will be removed in a future major version.** Migrate your code to the new names as soon as possible. In particular, any filtering on `element.investigationId` returns `undefined` — use `element.dossierId`.

### Security

- Plugins run in the same JS context as the app (no sandbox)
- Only the server administrator can place files in `dist/plugins/`
- No plugin downloading or remote loading — files are served locally
- Review plugin code before deployment, as plugins have full access to the ZN API and IndexedDB data
