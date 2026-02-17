# zeroneurone — Plugin System

## Spécification d'implémentation

## Destination : Claude Code

Ce document spécifie l'implémentation du système de plugins dans ZeroNeurone. C'est un mécanisme générique et MIT ,il ouvre ZN aux extensions tierces.

---

## Principes

1. **Le registre est vide par défaut** — ZN fonctionne identiquement avec 0 plugins
2. **Aucun code conditionnel** — Pas de `if (pluginInstalled)`. Les composants consomment les slots qui sont soit vides, soit remplis
3. **Pas de nouvelle dépendance** — Le plugin system utilise uniquement React, Zustand, Dexie et JSZip déjà présents
4. **Zéro impact performance si vide** — Un registre vide = des tableaux vides itérés, rien de plus
5. **API stable** — Un breaking change sur un slot = bump majeur ZN

---

## 1. Types

### Fichier : `src/types/plugins.ts` (NOUVEAU)

```typescript
import { ComponentType } from 'react';

// ─── Context passé aux extensions de menu ─────────────────────

export interface MenuContext {
  /** IDs des éléments sélectionnés */
  elementIds: string[];
  /** IDs des liens sélectionnés */
  linkIds: string[];
  /** Position du clic droit sur le canvas {x, y} */
  canvasPosition?: { x: number; y: number };
  /** L'élément sélectionné a des assets avec du texte extractible */
  hasTextAssets: boolean;
  /** ID de l'investigation courante */
  investigationId: string;
}

// ─── Extensions de menu contextuel ────────────────────────────

export interface ContextMenuExtension {
  /** Identifiant unique de l'extension */
  id: string;
  /** Clé i18n du label affiché */
  label: string;
  /** Nom de l'icône Lucide (ex: 'Brain', 'Scan') */
  icon: string;
  /** Ajouter un séparateur horizontal avant cette entrée */
  separator?: boolean;
  /** Action déclenchée au clic */
  action: (context: MenuContext) => void;
  /** Condition de visibilité. Si absent ou true → toujours visible */
  visible?: (context: MenuContext) => boolean;
}

// ─── Raccourcis clavier ───────────────────────────────────────

export interface KeyboardShortcut {
  /** Combinaison de touches (format: 'ctrl+shift+n') */
  keys: string;
  /** Action déclenchée */
  action: () => void;
  /** Clé i18n de la description (affichée dans les menus) */
  description: string;
  /** Scope : global = partout, panel = uniquement quand un panneau plugin est ouvert */
  scope: 'global' | 'panel';
}

// ─── Hooks d'export/import ZIP ────────────────────────────────

export interface ExportHook {
  /** Nom du plugin (pour logs et debug) */
  name: string;
  /** Appelé pendant l'export ZIP, après les données ZN de base */
  onExport: (zip: any, investigationId: string) => Promise<void>;
}

export interface ImportHook {
  /** Nom du plugin */
  name: string;
  /** Appelé pendant l'import ZIP, après les données ZN de base */
  onImport: (zip: any, investigationId: string) => Promise<void>;
}

// ─── Extension Dexie ──────────────────────────────────────────

export interface DexieTableDefinition {
  /** Nom de la table */
  name: string;
  /** Schema Dexie (ex: 'id, investigationId, updatedAt') */
  schema: string;
}

// ─── Props injectées aux composants de panneau ────────────────

export interface PanelPluginProps {
  /** ID de l'investigation courante */
  investigationId: string;
}

// ─── Props injectées aux composants de rapport ────────────────

export interface ReportToolbarPluginProps {
  /** ID de l'investigation courante */
  investigationId: string;
}

export interface ReportSectionPluginProps {
  /** ID de la section du rapport */
  sectionId: string;
  /** ID de l'investigation courante */
  investigationId: string;
}

// ─── Le registre complet ──────────────────────────────────────

export interface PluginSlots {
  /** Composants injectés dans le header, à droite (avant le menu principal) */
  'header:right': ComponentType[];
  /** Panneaux latéraux droits (comme le panneau Insights) */
  'panel:right': ComponentType<PanelPluginProps>[];
  /** Entrées de menu contextuel sur un élément */
  'contextMenu:element': ContextMenuExtension[];
  /** Entrées de menu contextuel sur un lien */
  'contextMenu:link': ContextMenuExtension[];
  /** Entrées de menu contextuel sur le canvas (clic droit dans le vide) */
  'contextMenu:canvas': ContextMenuExtension[];
  /** Boutons dans la toolbar du panneau rapport */
  'report:toolbar': ComponentType<ReportToolbarPluginProps>[];
  /** Actions ajoutées par section dans le rapport */
  'report:sectionActions': ComponentType<ReportSectionPluginProps>[];
  /** Raccourcis clavier supplémentaires */
  'keyboard:shortcuts': KeyboardShortcut[];
  /** Hooks appelés lors de l'export ZIP */
  'export:hooks': ExportHook[];
  /** Hooks appelés lors de l'import ZIP */
  'import:hooks': ImportHook[];
  /** Tables Dexie additionnelles (enregistrées au démarrage) */
  'dexie:tables': DexieTableDefinition[];
}
```

---

## 2. Plugin Registry

### Fichier : `src/plugins/pluginRegistry.ts` (NOUVEAU)

```typescript
import type { PluginSlots } from '../types/plugins';

/**
 * Plugin registry — Generic extension system for zeroneurone.
 *
 * Plugins register extensions into named slots.
 * ZN components consume slots via getPlugins().
 * Empty slots = nothing rendered, zero overhead.
 */

// ─── Registre interne ─────────────────────────────────────────

const slots: PluginSlots = {
  'header:right': [],
  'panel:right': [],
  'contextMenu:element': [],
  'contextMenu:link': [],
  'contextMenu:canvas': [],
  'report:toolbar': [],
  'report:sectionActions': [],
  'keyboard:shortcuts': [],
  'export:hooks': [],
  'import:hooks': [],
  'dexie:tables': [],
};

// ─── Listeners pour la réactivité ─────────────────────────────

type SlotListener = () => void;
const listeners = new Set<SlotListener>();

function notifyListeners() {
  listeners.forEach((fn) => fn());
}

// ─── API publique ─────────────────────────────────────────────

/**
 * Enregistre une extension dans un slot.
 * Peut être appelé plusieurs fois pour le même slot (les extensions s'accumulent).
 *
 * @example
 * registerPlugin('contextMenu:element', { id: 'my-action', label: 'my.label', icon: 'Star', action: () => {} });
 * registerPlugin('header:right', MyHeaderComponent);
 */
export function registerPlugin<K extends keyof PluginSlots>(
  slot: K,
  extension: PluginSlots[K][number]
): void {
  (slots[slot] as any[]).push(extension);
  notifyListeners();
}

/**
 * Enregistre plusieurs extensions d'un coup dans un slot.
 *
 * @example
 * registerPlugins('dexie:tables', [
 *   { name: 'myTable', schema: 'id, investigationId' },
 *   { name: 'myOtherTable', schema: 'id, type' },
 * ]);
 */
export function registerPlugins<K extends keyof PluginSlots>(
  slot: K,
  extensions: PluginSlots[K][number][]
): void {
  (slots[slot] as any[]).push(...extensions);
  notifyListeners();
}

/**
 * Récupère toutes les extensions d'un slot.
 * Retourne un tableau (vide si aucun plugin).
 *
 * @example
 * const menuExtensions = getPlugins('contextMenu:element');
 * // → ContextMenuExtension[] (peut être vide)
 */
export function getPlugins<K extends keyof PluginSlots>(
  slot: K
): Readonly<PluginSlots[K]> {
  return slots[slot];
}

/**
 * Supprime toutes les extensions enregistrées (utile pour les tests).
 */
export function clearAllPlugins(): void {
  for (const key of Object.keys(slots) as (keyof PluginSlots)[]) {
    (slots[key] as any[]).length = 0;
  }
  notifyListeners();
}

/**
 * S'abonner aux changements du registre (pour la réactivité React).
 * Retourne une fonction de désabonnement.
 */
export function subscribeToPlugins(listener: SlotListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
```

### Fichier : `src/plugins/usePlugins.ts` (NOUVEAU)

Hook React pour consommer les plugins de manière réactive :

```typescript
import { useSyncExternalStore } from 'react';
import { getPlugins, subscribeToPlugins } from './pluginRegistry';
import type { PluginSlots } from '../types/plugins';

/**
 * Hook React pour consommer un slot de plugins.
 * Re-render si le slot change (nouveau plugin enregistré).
 *
 * @example
 * const menuExtensions = usePlugins('contextMenu:element');
 */
export function usePlugins<K extends keyof PluginSlots>(
  slot: K
): Readonly<PluginSlots[K]> {
  return useSyncExternalStore(
    subscribeToPlugins,
    () => getPlugins(slot),
    () => getPlugins(slot) // SSR snapshot (identique, pas de SSR dans ZN)
  );
}
```

---

## 3. Intégration dans les composants existants

### 3.1 Header — slot `header:right`

**Fichier à modifier : `src/components/Header.tsx`** (ou équivalent)

Ajouter le rendu des composants plugins à droite du header, avant le menu principal :

```tsx
import { usePlugins } from '../plugins/usePlugins';

function Header() {
  const headerPlugins = usePlugins('header:right');

  return (
    <header className="...">
      {/* ... contenu existant du header ... */}

      {/* Plugins header:right */}
      {headerPlugins.map((PluginComponent, index) => (
        <PluginComponent key={`header-plugin-${index}`} />
      ))}

      {/* Menu principal existant */}
      <MainMenu />
    </header>
  );
}
```

**Si aucun plugin :** le `.map()` itère sur un tableau vide → rien n'est rendu. Aucun changement visuel.

### 3.2 Panneau latéral droit — slot `panel:right`

**Fichier à modifier : `src/components/panels/` ou le layout `InvestigationPage.tsx`**

Les panneaux plugin s'affichent dans la même zone que le panneau Insights/Détail, gérés par `uiStore` :

```tsx
import { usePlugins } from '../plugins/usePlugins';

function RightPanelArea({ investigationId }: { investigationId: string }) {
  const panelPlugins = usePlugins('panel:right');

  // Le uiStore gère quel panneau est actif (detail, insights, ou un plugin)
  const { activeRightPanel } = useUiStore();

  return (
    <aside className="...">
      {/* Panneaux ZN existants */}
      {activeRightPanel === 'detail' && <DetailPanel />}
      {activeRightPanel === 'insights' && <InsightsPanel />}

      {/* Panneaux plugins */}
      {panelPlugins.map((PanelPlugin, index) => (
        <PanelPlugin
          key={`panel-plugin-${index}`}
          investigationId={investigationId}
        />
      ))}
    </aside>
  );
}
```

**Note :** les panneaux plugins gèrent leur propre visibilité. Le plugin décide quand se montrer (via son propre store interne). ZN ne gère pas le toggle du panneau plugin — il fournit juste le point de montage.

### 3.3 Menu contextuel — slots `contextMenu:*`

**Fichier à modifier : `src/components/canvas/CanvasContextMenu.tsx`** (ou équivalent)

Ajouter les entrées plugins en fin de menu, avec séparateur :

```tsx
import { usePlugins } from '../../plugins/usePlugins';
import type { MenuContext } from '../../types/plugins';
import * as LucideIcons from 'lucide-react';

function CanvasContextMenu({ context }: { context: MenuContext }) {
  const elementExtensions = usePlugins('contextMenu:element');
  const linkExtensions = usePlugins('contextMenu:link');
  const canvasExtensions = usePlugins('contextMenu:canvas');

  // Choisir les extensions selon le type de clic droit
  const extensions = context.elementIds.length > 0
    ? elementExtensions
    : context.linkIds.length > 0
      ? linkExtensions
      : canvasExtensions;

  // Filtrer les extensions visibles
  const visibleExtensions = extensions.filter(
    (ext) => !ext.visible || ext.visible(context)
  );

  return (
    <div className="...">
      {/* Entrées de menu ZN existantes */}
      {/* ... */}

      {/* Entrées plugins (si présentes) */}
      {visibleExtensions.map((ext) => {
        const Icon = (LucideIcons as any)[ext.icon];
        return (
          <div key={ext.id}>
            {ext.separator && <hr className="border-t border-default my-1" />}
            <button
              className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left hover:bg-tertiary rounded"
              onClick={() => ext.action(context)}
            >
              {Icon && <Icon size={16} className="text-secondary" />}
              <span>{t(ext.label)}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
```

**Règle de rendu :** le premier plugin avec `separator: true` crée une ligne de séparation visuelle entre les entrées ZN natives et les entrées plugins. Si aucun plugin → pas de séparateur orphelin.

### 3.4 Panneau Rapport — slots `report:toolbar` et `report:sectionActions`

**Fichier à modifier : `src/components/report/ReportPanel.tsx`** (ou équivalent)

```tsx
import { usePlugins } from '../../plugins/usePlugins';

function ReportToolbar({ investigationId }: { investigationId: string }) {
  const toolbarPlugins = usePlugins('report:toolbar');

  return (
    <div className="flex items-center gap-2">
      {/* Boutons ZN existants */}
      <button>{t('report.addSection')}</button>

      {/* Boutons plugins */}
      {toolbarPlugins.map((ToolbarPlugin, index) => (
        <ToolbarPlugin
          key={`report-toolbar-${index}`}
          investigationId={investigationId}
        />
      ))}
    </div>
  );
}

function ReportSection({ sectionId, investigationId }: { sectionId: string; investigationId: string }) {
  const sectionPlugins = usePlugins('report:sectionActions');

  return (
    <div>
      {/* Contenu de la section existant */}
      {/* ... */}

      {/* Actions plugins par section */}
      {sectionPlugins.map((SectionPlugin, index) => (
        <SectionPlugin
          key={`section-plugin-${index}`}
          sectionId={sectionId}
          investigationId={investigationId}
        />
      ))}
    </div>
  );
}
```

### 3.5 Raccourcis clavier — slot `keyboard:shortcuts`

**Fichier à modifier : le hook ou composant qui gère les raccourcis clavier globaux**

Typiquement un `useEffect` dans `App.tsx` ou un `useKeyboardShortcuts` hook :

```tsx
import { usePlugins } from '../plugins/usePlugins';

function useKeyboardShortcuts() {
  const pluginShortcuts = usePlugins('keyboard:shortcuts');

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Raccourcis ZN existants
      // ... (Ctrl+K, Ctrl+Z, etc.)

      // Raccourcis plugins
      for (const shortcut of pluginShortcuts) {
        if (matchesKeys(e, shortcut.keys)) {
          e.preventDefault();
          shortcut.action();
          return;
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pluginShortcuts]);
}

/**
 * Compare un KeyboardEvent avec une combinaison au format 'ctrl+shift+n'.
 */
function matchesKeys(e: KeyboardEvent, keys: string): boolean {
  const parts = keys.toLowerCase().split('+');
  const needCtrl = parts.includes('ctrl');
  const needShift = parts.includes('shift');
  const needAlt = parts.includes('alt');
  const key = parts.find((p) => !['ctrl', 'shift', 'alt'].includes(p));

  return (
    e.ctrlKey === needCtrl &&
    e.shiftKey === needShift &&
    e.altKey === needAlt &&
    e.key.toLowerCase() === key
  );
}
```

### 3.6 Export ZIP — slot `export:hooks`

**Fichier à modifier : `src/services/exportService.ts`**

Ajouter l'appel aux hooks d'export après la construction du ZIP de base :

```typescript
import { getPlugins } from '../plugins/pluginRegistry';

async function exportInvestigationZip(investigationId: string): Promise<Blob> {
  const zip = new JSZip();

  // Export ZN existant (inchangé)
  zip.file('investigation.json', JSON.stringify(investigationData));
  // ... elements.json, links.json, tabs.json, report.json, assets/

  // Appel des hooks d'export plugins
  const exportHooks = getPlugins('export:hooks');
  for (const hook of exportHooks) {
    try {
      await hook.onExport(zip, investigationId);
    } catch (error) {
      console.warn(`Plugin export hook "${hook.name}" failed:`, error);
      // On ne bloque pas l'export si un plugin échoue
    }
  }

  return zip.generateAsync({ type: 'blob' });
}
```

**Règle :** un plugin qui échoue pendant l'export ne bloque pas l'export ZN. L'erreur est loggée, l'export continue.

### 3.7 Import ZIP — slot `import:hooks`

**Fichier à modifier : `src/services/importService.ts`**

Ajouter l'appel aux hooks d'import après l'import des données ZN :

```typescript
import { getPlugins } from '../plugins/pluginRegistry';

async function importInvestigationZip(file: File): Promise<string> {
  const zip = await JSZip.loadAsync(file);

  // Import ZN existant (inchangé)
  const investigationId = await importBaseData(zip);

  // Appel des hooks d'import plugins
  const importHooks = getPlugins('import:hooks');
  for (const hook of importHooks) {
    try {
      await hook.onImport(zip, investigationId);
    } catch (error) {
      console.warn(`Plugin import hook "${hook.name}" failed:`, error);
      // On ne bloque pas l'import si un plugin échoue
    }
  }

  return investigationId;
}
```

**Même règle :** un plugin qui échoue pendant l'import ne bloque pas l'import ZN.

### 3.8 Extension Dexie — slot `dexie:tables`

**Fichier à modifier : `src/db/database.ts`**

Les tables plugins sont enregistrées au démarrage de l'application, AVANT l'ouverture de la base :

```typescript
import { getPlugins } from '../plugins/pluginRegistry';

function createDatabase(): Dexie {
  const db = new Dexie('investigation-tool');

  // Tables ZN de base (inchangées)
  const baseSchema: Record<string, string> = {
    investigations: 'id, name, updatedAt',
    elements: 'id, investigationId, label, *tags',
    links: 'id, investigationId, from, to',
    views: 'id, investigationId',
    assets: 'id, investigationId, hash',
    canvasTabs: 'id, investigationId, order',
    // ... autres tables ZN
  };

  // Tables plugins
  const pluginTables = getPlugins('dexie:tables');
  for (const table of pluginTables) {
    baseSchema[table.name] = table.schema;
  }

  // Version unique avec toutes les tables
  db.version(CURRENT_VERSION).stores(baseSchema);

  return db;
}
```

**Contrainte importante :** les plugins doivent être enregistrés AVANT `createDatabase()`. L'ordre d'initialisation dans `main.ts` est :

```typescript
// 1. Enregistrer les plugins (s'il y en a)
// import { initCustomPlugin} from 'customplugin';
// initCustomPlugin();

// 2. Initialiser la base de données (lit les tables plugins)
initDatabase();

// 3. Monter React
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
```

**Migration :** quand un plugin ajoute une table, Dexie gère automatiquement l'ajout si la version est bumpée. Le `CURRENT_VERSION` doit être incrémenté. Pour simplifier, le plugin system peut détecter un changement de tables et proposer un bump automatique.

---

## 4. Construction du `MenuContext`

Le `MenuContext` est construit au moment du clic droit, avant d'afficher le menu. Il agrège l'état de plusieurs stores :

```typescript
import { useInvestigationStore } from '../../stores/investigationStore';
import { useSelectionStore } from '../../stores/selectionStore';
import type { MenuContext } from '../../types/plugins';

function buildMenuContext(
  canvasPosition?: { x: number; y: number }
): MenuContext {
  const { currentInvestigationId, elements, assets } = useInvestigationStore.getState();
  const { selectedElementIds, selectedLinkIds } = useSelectionStore.getState();

  // Vérifier si les éléments sélectionnés ont des assets texte
  const hasTextAssets = selectedElementIds.some((elId) => {
    const element = elements.find((e) => e.id === elId);
    if (!element?.assets?.length) return false;
    return element.assets.some((assetId) => {
      const asset = assets.find((a) => a.id === assetId);
      return asset && isTextMimeType(asset.mimeType);
    });
  });

  return {
    elementIds: [...selectedElementIds],
    linkIds: [...selectedLinkIds],
    canvasPosition,
    hasTextAssets,
    investigationId: currentInvestigationId ?? '',
  };
}

function isTextMimeType(mimeType: string): boolean {
  return (
    mimeType.startsWith('text/') ||
    mimeType === 'application/pdf' ||
    mimeType === 'application/json' ||
    mimeType.includes('document') ||
    mimeType.includes('sheet')
  );
}
```

---

## 5. Structure des fichiers

```
src/
├── plugins/                        # ← NOUVEAU
│   ├── pluginRegistry.ts           # Registre + API (register, get, clear, subscribe)
│   └── usePlugins.ts               # Hook React réactif
├── types/
│   ├── index.ts                    # ← inchangé
│   └── plugins.ts                  # ← NOUVEAU (types du plugin system)
├── components/
│   ├── canvas/
│   │   └── CanvasContextMenu.tsx   # ← modifié (consomme contextMenu:*)
│   ├── panels/                     # ← modifié (consomme panel:right)
│   ├── report/
│   │   └── ReportPanel.tsx         # ← modifié (consomme report:*)
│   └── Header.tsx                  # ← modifié (consomme header:right)
├── services/
│   ├── exportService.ts            # ← modifié (appelle export:hooks)
│   └── importService.ts            # ← modifié (appelle import:hooks)
├── db/
│   └── database.ts                 # ← modifié (consomme dexie:tables)
└── App.tsx ou hooks/               # ← modifié (consomme keyboard:shortcuts)
```

---

## 6. Tâches d'implémentation

### Tâche 1 — Types et registre

1. Créer `src/types/plugins.ts` avec tous les types ci-dessus
2. Créer `src/plugins/pluginRegistry.ts` avec les fonctions `registerPlugin`, `registerPlugins`, `getPlugins`, `clearAllPlugins`, `subscribeToPlugins`
3. Créer `src/plugins/usePlugins.ts` avec le hook
4. Exporter tout depuis un `src/plugins/index.ts` barrel

### Tâche 2 — Intégration Header

1. Modifier `Header.tsx` pour consommer `header:right`
2. Vérifier : sans plugin, le header est identique visuellement

### Tâche 3 — Intégration Menu contextuel

1. Implémenter `buildMenuContext()` 
2. Modifier `CanvasContextMenu.tsx` pour consommer `contextMenu:element`, `contextMenu:link`, `contextMenu:canvas`
3. Résolution dynamique des icônes Lucide par nom de string
4. Gestion du séparateur conditionnel
5. Vérifier : sans plugin, le menu contextuel est identique

### Tâche 4 — Intégration Panneau droit

1. Modifier le layout `InvestigationPage` ou le conteneur de panneaux pour monter `panel:right`
2. Passer `investigationId` en prop
3. Vérifier : sans plugin, les panneaux existants fonctionnent identiquement

### Tâche 5 — Intégration Rapport

1. Modifier `ReportPanel.tsx` (ou équivalent) pour consommer `report:toolbar`
2. Modifier les composants de section pour consommer `report:sectionActions`
3. Vérifier : sans plugin, le rapport est identique

### Tâche 6 — Intégration Raccourcis clavier

1. Modifier le handler de raccourcis pour itérer sur `keyboard:shortcuts`
2. Implémenter `matchesKeys()` pour parser le format `'ctrl+shift+n'`
3. Les raccourcis plugins sont évalués APRÈS les raccourcis ZN natifs (priorité aux natifs)
4. Vérifier : sans plugin, les raccourcis existants fonctionnent identiquement

### Tâche 7 — Intégration Export/Import

1. Modifier `exportService.ts` pour appeler `export:hooks` après le ZIP de base
2. Modifier `importService.ts` pour appeler `import:hooks` après l'import de base
3. Wrapping try/catch : un plugin qui échoue ne bloque pas l'opération
4. Vérifier : sans plugin, l'export/import fonctionne identiquement

### Tâche 8 — Intégration Dexie

1. Modifier `database.ts` pour inclure les `dexie:tables` dans le schéma
2. S'assurer que l'ordre d'initialisation est correct (plugins enregistrés AVANT `createDatabase`)
3. Vérifier : sans plugin, la base est identique

---

## 7. Critères de "done"

- [ ] `npm run typecheck` passe sans erreur
- [ ] `npm run build` passe sans erreur
- [ ] L'application démarre et fonctionne identiquement sans aucun plugin enregistré
- [ ] Le menu contextuel affiche ses entrées normales, sans séparateur orphelin
- [ ] Le header, le rapport, les raccourcis, l'export, l'import fonctionnent identiquement
- [ ] Test manuel : enregistrer un plugin fictif via la console et vérifier qu'il apparaît :
  ```javascript
  import { registerPlugin } from './plugins/pluginRegistry';
  registerPlugin('contextMenu:element', {
    id: 'test',
    label: 'Test Plugin',
    icon: 'Star',
    separator: true,
    action: () => alert('Plugin works!'),
  });
  ```
- [ ] Le menu contextuel affiche "Test Plugin" avec l'icône Star après un séparateur
- [ ] `clearAllPlugins()` vide le registre et le menu revient à la normale

---

## 8. Cas limites

| Cas | Comportement attendu |
|-----|----------------------|
| 0 plugins enregistrés | ZN identique à avant. Aucun élément visuel ajouté |
| Plugin avec `icon` invalide (nom Lucide inexistant) | Pas d'icône affichée, pas de crash |
| Plugin qui throw dans `action()` | Erreur catchée, loggée, app continue |
| Plugin qui throw dans `visible()` | Considéré comme `visible: false`, pas de crash |
| Plugin qui throw dans `onExport()` | Warning loggé, export continue sans ce plugin |
| Plugin qui throw dans `onImport()` | Warning loggé, import continue |
| Même `id` enregistré deux fois dans un menu | Les deux s'affichent (pas de dédoublonnage, c'est la responsabilité du plugin) |
| Plugin enregistré APRÈS le montage React | Le hook `usePlugins` re-render via `useSyncExternalStore` |
| Plugin enregistré APRÈS `createDatabase()` pour `dexie:tables` | Table ignorée (trop tard). Log warning |

---

## 9. Ce qui ne change PAS

| Composant | Impact |
|-----------|--------|
| Stores Zustand existants | Aucune modification de leur interface |
| Types dans `types/index.ts` | Aucune modification |
| React Flow, Leaflet, Graphology | Aucune modification |
| MiniSearch, OPFS, FileService | Aucune modification |
| Undo/Redo | Aucune modification |
| Collaboration Y.js | Aucune modification |
| i18n (11 langues) | Aucune modification (les plugins apportent leurs propres traductions) |
| Design guidelines | Strictement inchangées |
| Tous les raccourcis clavier existants | Inchangés, prioritaires sur les raccourcis plugins |

---

## 10. CLAUDE.md — Section à ajouter

Après implémentation, ajouter dans le CLAUDE.md de ZeroNeurone :

```markdown
## Plugin System

ZeroNeurone exposes a generic plugin registry (`src/plugins/pluginRegistry.ts`).

### Available slots
- `header:right` — Components injected in the header (right side)
- `panel:right` — Right side panels (same area as Insights)
- `contextMenu:element` / `contextMenu:link` / `contextMenu:canvas` — Context menu entries
- `report:toolbar` / `report:sectionActions` — Report panel extensions
- `keyboard:shortcuts` — Additional keyboard shortcuts
- `export:hooks` / `import:hooks` — ZIP export/import hooks
- `dexie:tables` — Additional Dexie tables (must register BEFORE database init)

### Rules
- The registry is empty by default. ZN works identically with 0 plugins
- Components consume plugins via `usePlugins()` hook or `getPlugins()` function
- NEVER write conditional code like `if (pluginInstalled)` in ZN components
- Plugin errors are always caught and logged, never crash the app
- Slot API is a stable contract. Breaking change on a slot = major version bump
- Plugin keyboard shortcuts use `Ctrl+Shift+*` (3 keys) to avoid conflicts with ZN shortcuts (2 keys)
```

---

## 11. i18n

Aucune clé i18n à ajouter pour le plugin system lui-même. Les plugins apportent leurs propres traductions.

Le mécanisme recommandé pour les plugins : appeler `i18n.addResourceBundle()` dans leur fonction d'initialisation, avec leur namespace propre.

---

*Document technique — Plugin System — Février 2026*
