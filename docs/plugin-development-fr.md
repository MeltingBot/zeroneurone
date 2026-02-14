# Guide de developpement de plugins ZeroNeurone

Ce guide explique comment etendre ZeroNeurone avec des plugins. Le systeme de plugins est base sur des slots : vous enregistrez des extensions dans des slots nommes, et les composants ZN les consomment automatiquement.

## Principes

1. **Le registre est vide par defaut** — ZN fonctionne identiquement avec 0 plugins
2. **Aucun code conditionnel** — Les composants ZN iterent sur les slots ; vide = rien rendu
3. **Pas de nouvelle dependance** — Les plugins utilisent React, Zustand, Dexie et JSZip deja presents dans ZN
4. **Zero impact performance si vide** — Des tableaux vides iteres, rien de plus
5. **API stable** — Un breaking change sur un slot = bump majeur ZN

## Demarrage rapide

### 1. Creer votre fichier plugin

```typescript
// src/plugins/myPlugin.ts (ou un package npm separe)
import { registerPlugin } from '../plugins/pluginRegistry';

export function initMyPlugin() {
  // Ajouter une entree de menu contextuel sur les elements
  registerPlugin('contextMenu:element', {
    id: 'my-plugin-action',
    label: 'Analyser avec MyPlugin',
    icon: 'Brain',              // N'importe quel nom d'icone Lucide
    separator: true,            // Ligne horizontale avant cette entree
    action: (context) => {
      console.log('Elements selectionnes:', context.elementIds);
      // Votre logique ici
    },
    visible: (context) => context.elementIds.length > 0,
  });
}
```

### 2. Enregistrer avant le montage de l'app

Dans `src/main.tsx`, appelez votre fonction d'init **avant** le rendu React :

```typescript
import { initMyPlugin } from './plugins/myPlugin';

// 1. Enregistrer les plugins
initMyPlugin();

// 2. Monter React (code existant)
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
```

### 3. Tester dans la console du navigateur

Vous pouvez aussi enregistrer des plugins a l'execution pour tester rapidement :

```javascript
// Ouvrir la console DevTools
import('/src/plugins/pluginRegistry').then(({ registerPlugin }) => {
  registerPlugin('contextMenu:element', {
    id: 'test',
    label: 'Plugin Test',
    icon: 'Star',
    separator: true,
    action: () => alert('Le plugin fonctionne !'),
  });
});
```

Clic droit sur un element pour voir la nouvelle entree de menu.

## Slots disponibles

### `header:right` — Composants du header

Injectez des composants React dans la barre d'outils du header (cote droit, avant le lien Ko-fi).

```typescript
import { registerPlugin } from '../plugins/pluginRegistry';

function MyHeaderButton() {
  return (
    <button
      onClick={() => console.log('clic')}
      className="p-1 text-text-secondary hover:text-text-primary"
      title="Mon Plugin"
    >
      <span className="text-xs">MP</span>
    </button>
  );
}

registerPlugin('header:right', MyHeaderButton);
```

**Props recues :** aucune

### `home:actions` — Actions de la page d'accueil

Injectez des composants React dans la page d'accueil — a la fois dans le footer de la landing (avant le bouton theme) et dans la toolbar de la vue liste.

```typescript
import { registerPlugin } from '../plugins/pluginRegistry';

function MyHomeAction() {
  return (
    <button
      onClick={() => console.log('clic depuis la home')}
      className="inline-flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-secondary transition-colors"
    >
      Mon Action
    </button>
  );
}

registerPlugin('home:actions', MyHomeAction);
```

**Props recues :** aucune

### `panel:right` — Onglets du panneau lateral

Ajoutez un onglet personnalise au panneau lateral droit (a cote de Detail, Insights, Filtres, Vues, Rapport).

```typescript
import { registerPlugin } from '../plugins/pluginRegistry';
import type { PanelPluginProps } from '../types/plugins';

function MyPanel({ investigationId }: PanelPluginProps) {
  return (
    <div className="p-4">
      <h3 className="text-sm font-semibold mb-2">Mon Plugin</h3>
      <p className="text-xs text-text-secondary">
        Investigation : {investigationId}
      </p>
    </div>
  );
}

registerPlugin('panel:right', {
  id: 'my-plugin-panel',
  label: 'Mon Plugin',
  icon: 'Brain',          // Nom d'icone Lucide
  component: MyPanel,
});
```

**Props recues :** `{ investigationId: string }`

Le panneau apparait comme un nouvel onglet dans le panneau lateral. L'icone est resolue dynamiquement depuis `lucide-react`.

### `contextMenu:element` / `contextMenu:link` / `contextMenu:canvas` — Menu contextuel

Ajoutez des entrees au menu contextuel (clic droit). Trois slots separes selon ce qui a ete clique.

```typescript
interface ContextMenuExtension {
  id: string;                                    // Identifiant unique
  label: string;                                 // Label affiche
  icon: string;                                  // Nom d'icone Lucide
  separator?: boolean;                           // Ligne horizontale avant
  action: (context: MenuContext) => void;        // Handler de clic
  visible?: (context: MenuContext) => boolean;   // Condition de visibilite
}

interface MenuContext {
  elementIds: string[];                          // IDs des elements selectionnes
  linkIds: string[];                             // IDs des liens selectionnes
  canvasPosition?: { x: number; y: number };     // Position du clic droit
  hasTextAssets: boolean;                        // A du texte extractible
  investigationId: string;                       // Investigation courante
}
```

**Exemple : action sur element visible uniquement en selection simple**

```typescript
registerPlugin('contextMenu:element', {
  id: 'enrich-osint',
  label: 'Enrichissement OSINT',
  icon: 'Search',
  separator: true,
  action: (ctx) => {
    const elementId = ctx.elementIds[0];
    // Appel a votre API d'enrichissement...
  },
  visible: (ctx) => ctx.elementIds.length === 1,
});
```

**Exemple : action canvas (clic droit dans le vide)**

```typescript
registerPlugin('contextMenu:canvas', {
  id: 'generate-timeline',
  label: 'Generer rapport chronologique',
  icon: 'Clock',
  action: (ctx) => {
    console.log('Position canvas:', ctx.canvasPosition);
  },
});
```

### `keyboard:shortcuts` — Raccourcis clavier

Enregistrez des raccourcis clavier supplementaires. Les raccourcis natifs ZN sont toujours prioritaires.

```typescript
registerPlugin('keyboard:shortcuts', {
  keys: 'ctrl+shift+p',        // Format : modifieur+modifieur+touche
  action: () => {
    console.log('Raccourci plugin declenche');
  },
  description: 'Ouvrir Mon Plugin',
  scope: 'global',              // 'global' ou 'panel'
});
```

**Format des touches :** minuscules, separes par `+`. Modifieurs supportes : `ctrl`, `shift`, `alt`.

**Convention :** Utilisez `Ctrl+Shift+*` (combinaisons a 3 touches) pour eviter les conflits avec les raccourcis natifs ZN (2 touches).

### `report:toolbar` — Boutons de la toolbar rapport

Ajoutez des boutons dans la toolbar du panneau rapport (a cote des boutons d'export).

```typescript
import type { ReportToolbarPluginProps } from '../types/plugins';

function MyReportButton({ investigationId }: ReportToolbarPluginProps) {
  return (
    <button
      onClick={() => console.log('Generer resume IA pour', investigationId)}
      className="p-1 text-text-secondary hover:text-accent"
      title="Resume IA"
    >
      <Brain size={14} />
    </button>
  );
}

registerPlugin('report:toolbar', MyReportButton);
```

**Props recues :** `{ investigationId: string }`

### `report:sectionActions` — Actions par section de rapport

Ajoutez des boutons d'action par section de rapport (a cote du bouton supprimer).

```typescript
import type { ReportSectionPluginProps } from '../types/plugins';

function MySectionAction({ sectionId, investigationId }: ReportSectionPluginProps) {
  return (
    <button
      onClick={() => console.log('Traiter section', sectionId)}
      className="p-0.5 text-text-secondary hover:text-accent"
      title="Traiter avec IA"
    >
      <Sparkles size={14} />
    </button>
  );
}

registerPlugin('report:sectionActions', MySectionAction);
```

**Props recues :** `{ sectionId: string, investigationId: string }`

### `export:hooks` / `import:hooks` — Cycle de vie ZIP

Accrochez-vous au processus d'export/import ZIP pour sauvegarder/restaurer les donnees de votre plugin.

```typescript
registerPlugin('export:hooks', {
  name: 'my-plugin',
  onExport: async (zip, investigationId) => {
    // Lire vos donnees depuis Dexie
    const myData = await db.pluginData
      .where({ pluginId: 'my-plugin', investigationId })
      .toArray();

    // Ajouter au ZIP
    zip.file('plugins/my-plugin.json', JSON.stringify(myData));
  },
});

registerPlugin('import:hooks', {
  name: 'my-plugin',
  onImport: async (zip, investigationId) => {
    const file = zip.file('plugins/my-plugin.json');
    if (!file) return;

    const data = JSON.parse(await file.async('string'));
    // Restaurer vos donnees dans Dexie
    for (const row of data) {
      await db.pluginData.put({ ...row, investigationId });
    }
  },
});
```

**Gestion d'erreur :** Si votre hook lance une exception, ZN l'intercepte, logue un avertissement et continue. L'echec de votre plugin ne bloque jamais l'export/import.

## Persistence des donnees

ZN fournit une table generique `pluginData` dans Dexie pour le stockage des plugins :

```typescript
interface PluginDataRow {
  pluginId: string;        // Identifiant de votre plugin
  investigationId: string; // Investigation associee
  key: string;             // Cle de donnee
  value: any;              // Vos donnees (toute valeur serialisable)
}
```

**Index compose :** `[pluginId+investigationId+key]` — requetes efficaces par plugin par investigation.

### Exemple d'utilisation

```typescript
import { db } from '../db/database';

// Ecriture
await db.pluginData.put({
  pluginId: 'my-plugin',
  investigationId: 'inv-123',
  key: 'settings',
  value: { threshold: 0.5, enabled: true },
});

// Lecture
const row = await db.pluginData.get({
  pluginId: 'my-plugin',
  investigationId: 'inv-123',
  key: 'settings',
});
console.log(row?.value); // { threshold: 0.5, enabled: true }

// Lire toutes les cles d'un plugin dans une investigation
const allRows = await db.pluginData
  .where({ pluginId: 'my-plugin', investigationId: 'inv-123' })
  .toArray();

// Suppression
await db.pluginData.delete(['my-plugin', 'inv-123', 'settings']);
```

## Internationalisation (i18n)

Les plugins gerent leurs propres traductions. Utilisez `i18next.addResourceBundle()` dans votre fonction d'init :

```typescript
import i18n from 'i18next';

export function initMyPlugin() {
  // Ajouter les traductions
  i18n.addResourceBundle('en', 'myPlugin', {
    menuLabel: 'Analyze with MyPlugin',
    panelTitle: 'MyPlugin Results',
  });
  i18n.addResourceBundle('fr', 'myPlugin', {
    menuLabel: 'Analyser avec MyPlugin',
    panelTitle: 'Resultats MyPlugin',
  });

  // Enregistrer les extensions du plugin...
}
```

Puis utilisez `useTranslation('myPlugin')` dans vos composants.

## Regles de design

Respectez strictement les regles de design ZN :

- Pas d'emojis dans l'UI
- Pas de rounded-xl/2xl (utiliser `rounded` uniquement)
- Pas de shadow-lg/xl (sauf modals)
- Pas de degrades ni d'animations decoratives
- Icones monochromes (Lucide React, 16px par defaut, 14px dans les toolbars)
- Affichage dense de l'information
- Un seul bouton bleu primaire par ecran max
- Police systeme uniquement

Voir [design-guidelines-v1.md](design-guidelines-v1.md) pour les specifications completes.

## Gestion des erreurs

ZN encapsule toutes les interactions avec les plugins dans des try/catch. Cependant, vous devriez quand meme gerer les erreurs proprement :

| Scenario | Comportement ZN |
|----------|-----------------|
| `action()` lance une exception | Erreur interceptee, loguee, l'app continue |
| `visible()` lance une exception | Traite comme `false`, pas de crash |
| `onExport()` lance une exception | Avertissement logue, l'export continue |
| `onImport()` lance une exception | Avertissement logue, l'import continue |
| Nom d'icone invalide | Aucune icone affichee, pas de crash |
| Meme `id` enregistre deux fois | Les deux s'affichent (c'est votre responsabilite) |
| Plugin enregistre apres le montage React | `usePlugins` declenche un re-render via `useSyncExternalStore` |

## Reference API

### `registerPlugin(slot, extension)`

Enregistre une extension dans un slot.

```typescript
function registerPlugin<K extends keyof PluginSlots>(
  slot: K,
  extension: PluginSlots[K][number]
): void;
```

### `registerPlugins(slot, extensions)`

Enregistre plusieurs extensions d'un coup.

```typescript
function registerPlugins<K extends keyof PluginSlots>(
  slot: K,
  extensions: PluginSlots[K][number][]
): void;
```

### `getPlugins(slot)`

Recupere toutes les extensions d'un slot (retourne un tableau readonly). A utiliser en dehors des composants React.

```typescript
function getPlugins<K extends keyof PluginSlots>(
  slot: K
): Readonly<PluginSlots[K]>;
```

### `clearAllPlugins()`

Supprime toutes les extensions enregistrees (utile pour les tests).

```typescript
function clearAllPlugins(): void;
```

### `usePlugins(slot)`

Hook React pour la consommation reactive d'un slot. Re-render quand le slot change.

```typescript
function usePlugins<K extends keyof PluginSlots>(
  slot: K
): Readonly<PluginSlots[K]>;
```

## Exemple complet de plugin

Voici un plugin complet qui ajoute une fonctionnalite d'enrichissement OSINT :

```typescript
// src/plugins/osintPlugin.ts
import { registerPlugin } from '../plugins/pluginRegistry';
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

// ─── Composants ──────────────────────────────────────────────

function OsintPanel({ investigationId }: PanelPluginProps) {
  // Votre UI de panneau ici
  return <div className="p-4 text-sm">Resultats OSINT pour {investigationId}</div>;
}

// ─── Init ────────────────────────────────────────────────────

export function initOsintPlugin() {
  // i18n
  for (const [lang, bundle] of Object.entries(translations)) {
    i18n.addResourceBundle(lang, 'osint', bundle);
  }

  // Menu contextuel : enrichir l'element selectionne
  registerPlugin('contextMenu:element', {
    id: 'osint-enrich',
    label: 'Enrichissement OSINT',
    icon: 'Search',
    separator: true,
    action: async (ctx) => {
      const elementId = ctx.elementIds[0];
      // Appel API OSINT, stocker les resultats dans pluginData...
      await db.pluginData.put({
        pluginId: 'osint',
        investigationId: ctx.investigationId,
        key: `result-${elementId}`,
        value: { /* donnees d'enrichissement */ },
      });
    },
    visible: (ctx) => ctx.elementIds.length === 1,
  });

  // Onglet panneau lateral
  registerPlugin('panel:right', {
    id: 'osint-panel',
    label: 'OSINT',
    icon: 'Search',
    component: OsintPanel,
  });

  // Raccourci clavier
  registerPlugin('keyboard:shortcuts', {
    keys: 'ctrl+shift+o',
    action: () => {
      // Basculer la visibilite du panneau OSINT
    },
    description: 'Ouvrir le panneau OSINT',
    scope: 'global',
  });

  // Hooks export/import
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

## Structure des fichiers

```
src/
├── plugins/
│   ├── pluginRegistry.ts    # Registre + API
│   ├── usePlugins.ts        # Hook React
│   └── myPlugin.ts          # Votre/vos plugin(s)
├── types/
│   └── plugins.ts           # Definitions de types plugins
└── main.tsx                 # Init plugins avant le montage React
```

## Tableau de reference des slots

| Slot | Type | Props/Interface | Emplacement |
|------|------|-----------------|-------------|
| `header:right` | `ComponentType` | aucune | Toolbar du header |
| `home:actions` | `ComponentType` | aucune | Page d'accueil (footer landing + toolbar liste) |
| `panel:right` | `PanelPluginRegistration` | `{ investigationId }` | Onglets du panneau lateral |
| `contextMenu:element` | `ContextMenuExtension` | `MenuContext` | Clic droit sur element |
| `contextMenu:link` | `ContextMenuExtension` | `MenuContext` | Clic droit sur lien |
| `contextMenu:canvas` | `ContextMenuExtension` | `MenuContext` | Clic droit sur canvas |
| `report:toolbar` | `ComponentType<ReportToolbarPluginProps>` | `{ investigationId }` | Toolbar du panneau rapport |
| `report:sectionActions` | `ComponentType<ReportSectionPluginProps>` | `{ sectionId, investigationId }` | Header de section rapport |
| `keyboard:shortcuts` | `KeyboardShortcut` | — | Handler keydown global |
| `export:hooks` | `ExportHook` | `(zip, investigationId)` | Export ZIP |
| `import:hooks` | `ImportHook` | `(zip, investigationId)` | Import ZIP |
