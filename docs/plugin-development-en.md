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

Inject React components in the investigation header toolbar (right side, before the Ko-fi link).

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

### `panel:right` — Side Panel Tabs

Add a custom tab to the right side panel (alongside Detail, Insights, Filters, Views, Report).

```typescript
import { registerPlugin } from '../plugins/pluginRegistry';
import type { PanelPluginProps } from '../types/plugins';

function MyPanel({ investigationId }: PanelPluginProps) {
  return (
    <div className="p-4">
      <h3 className="text-sm font-semibold mb-2">My Plugin</h3>
      <p className="text-xs text-text-secondary">
        Investigation: {investigationId}
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

**Props received:** `{ investigationId: string }`

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
  investigationId: string;                       // Current investigation
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

function MyReportButton({ investigationId }: ReportToolbarPluginProps) {
  return (
    <button
      onClick={() => console.log('Generate AI summary for', investigationId)}
      className="p-1 text-text-secondary hover:text-accent"
      title="AI Summary"
    >
      <Brain size={14} />
    </button>
  );
}

registerPlugin('report:toolbar', MyReportButton);
```

**Props received:** `{ investigationId: string }`

### `report:sectionActions` — Report Section Actions

Add action buttons per report section (next to the delete button).

```typescript
import type { ReportSectionPluginProps } from '../types/plugins';

function MySectionAction({ sectionId, investigationId }: ReportSectionPluginProps) {
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

**Props received:** `{ sectionId: string, investigationId: string }`

### `export:hooks` / `import:hooks` — ZIP Lifecycle

Hook into the ZIP export/import process to save/restore your plugin's data.

```typescript
registerPlugin('export:hooks', {
  name: 'my-plugin',
  onExport: async (zip, investigationId) => {
    // Read your data from Dexie
    const myData = await db.pluginData
      .where({ pluginId: 'my-plugin', investigationId })
      .toArray();

    // Add to the ZIP
    zip.file('plugins/my-plugin.json', JSON.stringify(myData));
  },
});

registerPlugin('import:hooks', {
  name: 'my-plugin',
  onImport: async (zip, investigationId) => {
    const file = zip.file('plugins/my-plugin.json');
    if (!file) return;

    const data = JSON.parse(await file.async('string'));
    // Restore your data into Dexie
    for (const row of data) {
      await db.pluginData.put({ ...row, investigationId });
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
  investigationId: string; // Associated investigation
  key: string;             // Data key
  value: any;              // Your data (any serializable value)
}
```

**Compound index:** `[pluginId+investigationId+key]` — efficient queries per plugin per investigation.

### Usage example

```typescript
import { db } from '../db/database';

// Write
await db.pluginData.put({
  pluginId: 'my-plugin',
  investigationId: 'inv-123',
  key: 'settings',
  value: { threshold: 0.5, enabled: true },
});

// Read
const row = await db.pluginData.get({
  pluginId: 'my-plugin',
  investigationId: 'inv-123',
  key: 'settings',
});
console.log(row?.value); // { threshold: 0.5, enabled: true }

// Read all keys for a plugin in an investigation
const allRows = await db.pluginData
  .where({ pluginId: 'my-plugin', investigationId: 'inv-123' })
  .toArray();

// Delete
await db.pluginData.delete(['my-plugin', 'inv-123', 'settings']);
```

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

### `registerPlugin(slot, extension)`

Register a single extension into a slot.

```typescript
function registerPlugin<K extends keyof PluginSlots>(
  slot: K,
  extension: PluginSlots[K][number]
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

function OsintPanel({ investigationId }: PanelPluginProps) {
  // Your panel UI here
  return <div className="p-4 text-sm">OSINT results for {investigationId}</div>;
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
        investigationId: ctx.investigationId,
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
    onExport: async (zip, investigationId) => {
      const data = await db.pluginData
        .where({ pluginId: 'osint', investigationId })
        .toArray();
      if (data.length > 0) {
        zip.file('plugins/osint.json', JSON.stringify(data));
      }
    },
  });

  registerPlugin('import:hooks', {
    name: 'osint',
    onImport: async (zip, investigationId) => {
      const file = zip.file('plugins/osint.json');
      if (!file) return;
      const data = JSON.parse(await file.async('string'));
      for (const row of data) {
        await db.pluginData.put({ ...row, investigationId });
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

## Slots Reference Table

| Slot | Type | Props/Interface | Location |
|------|------|-----------------|----------|
| `header:right` | `ComponentType` | none | Investigation header toolbar |
| `panel:right` | `PanelPluginRegistration` | `{ investigationId }` | Side panel tabs |
| `contextMenu:element` | `ContextMenuExtension` | `MenuContext` | Element right-click |
| `contextMenu:link` | `ContextMenuExtension` | `MenuContext` | Link right-click |
| `contextMenu:canvas` | `ContextMenuExtension` | `MenuContext` | Canvas right-click |
| `report:toolbar` | `ComponentType<ReportToolbarPluginProps>` | `{ investigationId }` | Report panel toolbar |
| `report:sectionActions` | `ComponentType<ReportSectionPluginProps>` | `{ sectionId, investigationId }` | Report section header |
| `keyboard:shortcuts` | `KeyboardShortcut` | — | Global keydown handler |
| `export:hooks` | `ExportHook` | `(zip, investigationId)` | ZIP export |
| `import:hooks` | `ImportHook` | `(zip, investigationId)` | ZIP import |
