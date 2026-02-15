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

### `home:banner` — Banniere pleine largeur

Injectez des composants React en haut de la page d'accueil, au-dessus du hero (landing) ou de la liste d'investigations. Le composant occupe toute la largeur disponible — ideal pour des annonces, alertes ou branding personnalise.

```typescript
import { registerPlugin } from '../plugins/pluginRegistry';

function MyBanner() {
  return (
    <div className="bg-bg-secondary border-b border-border-default px-6 py-3 text-center text-sm text-text-secondary">
      Instance interne — Ne pas diffuser
    </div>
  );
}

registerPlugin('home:banner', MyBanner);
```

**Props recues :** aucune

**Emplacement :** Rendu au-dessus du contenu principal dans les deux vues de la page d'accueil (landing et liste). Le composant est en dehors du conteneur `max-w-4xl`, il occupe donc toute la largeur.

### `home:card` — Carte d'extension structuree

Enregistrez votre plugin comme une carte dans la section "Extensions" de la page d'accueil. ZN controle le rendu — vous declarez des metadonnees, pas du JSX.

```typescript
import { registerPlugin } from '../plugins/pluginRegistry';

registerPlugin('home:card', {
  id: 'my-plugin',
  name: 'Mon Plugin',
  description: 'Description courte de ce que fait le plugin.',
  icon: 'Brain',                    // Nom d'icone Lucide
  version: '1.0.0',                 // Optionnel
  license: 'MIT',                   // Optionnel
  docUrl: 'https://example.com',    // Optionnel — lien Documentation
  features: ['Analyse', 'Export'],  // Optionnel — badges de fonctionnalites
  onConfigure: () => {              // Optionnel — bouton reglages
    console.log('Ouvrir les parametres');
  },
});
```

**Interface :**

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
}
```

**Emplacement :** Section "Extensions" sur la landing page, entre la grille de fonctionnalites et le footer. Affichee uniquement si au moins une carte est enregistree. Le rendu est gere par ZN — style coherent avec les tuiles existantes.

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

### `registerPlugin(slot, extension, pluginId?)`

Enregistre une extension dans un slot. Le parametre optionnel `pluginId` lie cette extension a un plugin enregistre dans `home:card`, activant la fonctionnalite de desactivation/activation.

```typescript
function registerPlugin<K extends keyof PluginSlots>(
  slot: K,
  extension: PluginSlots[K][number],
  pluginId?: string
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

### `unregisterPlugin(slot, predicate)`

Retire la premiere extension correspondant au predicat d'un slot. Utile pour les plugins dynamiques qui doivent se nettoyer.

```typescript
function unregisterPlugin<K extends keyof PluginSlots>(
  slot: K,
  predicate: (ext: PluginSlots[K][number]) => boolean
): void;
```

**Exemple :**

```typescript
// Retirer un plugin de panneau par id
unregisterPlugin('panel:right', (p) => p.id === 'my-plugin-panel');
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

## Desactivation des plugins

Les utilisateurs peuvent desactiver des plugins depuis la section "Extensions" de la page d'accueil. Quand un plugin est desactive, ses contributions a TOUS les slots sont filtrees.

### Fonctionnement

Pour que la desactivation fonctionne sur tous les slots, ZN doit savoir quelles extensions appartiennent a quel plugin. Trois mecanismes, par ordre de priorite :

**1. Troisieme argument de `registerPlugin`** (requis pour les slots `ComponentType`) :

```typescript
const PLUGIN_ID = 'my-plugin';

registerPlugin('home:card', { id: PLUGIN_ID, ... });
registerPlugin('home:actions', MyActionComponent, PLUGIN_ID);
registerPlugin('home:banner', MyBannerComponent, PLUGIN_ID);
registerPlugin('header:right', MyHeaderButton, PLUGIN_ID);
registerPlugin('report:toolbar', MyToolbar, PLUGIN_ID);
```

**2. Champ `pluginId` sur les objets d'extension** :

```typescript
registerPlugin('contextMenu:element', {
  id: 'my-action',
  label: 'Analyser',
  icon: 'Brain',
  pluginId: 'my-plugin',  // ← lie au id de home:card
  action: (ctx) => { ... },
});

registerPlugin('panel:right', {
  id: 'my-panel',
  label: 'Mon Panneau',
  icon: 'Brain',
  pluginId: 'my-plugin',  // ← lie au id de home:card
  component: MyPanelComponent,
});
```

**3. Automatique pour `home:card`** : Le champ `id` de `HomeCardRegistration` est l'identifiant canonique du plugin. Aucune configuration supplementaire necessaire.

### Bonne pratique

Utilisez une constante partagee pour l'ID de votre plugin :

```typescript
export const PLUGIN_ID = 'my-plugin';

// Toutes les inscriptions referencent le meme ID
registerPlugin('home:card', { id: PLUGIN_ID, name: '...', ... });
registerPlugin('header:right', MyHeaderButton, PLUGIN_ID);
registerPlugin('contextMenu:element', { ..., pluginId: PLUGIN_ID });
registerPlugin('keyboard:shortcuts', { ..., pluginId: PLUGIN_ID });
registerPlugin('export:hooks', { ..., pluginId: PLUGIN_ID });
```

### API

```typescript
import { isPluginDisabled } from '../plugins/pluginRegistry';

// Verifier si votre plugin est desactive (utile pour la logique conditionnelle)
if (isPluginDisabled('my-plugin')) return;
```

## Tableau de reference des slots

| Slot | Type | Props/Interface | Emplacement |
|------|------|-----------------|-------------|
| `header:right` | `ComponentType` | aucune | Toolbar du header |
| `home:actions` | `ComponentType` | aucune | Page d'accueil (footer landing + toolbar liste) |
| `home:banner` | `ComponentType` | aucune | Page d'accueil (pleine largeur, au-dessus du hero/liste) |
| `home:card` | `HomeCardRegistration` | metadonnees structurees | Section "Extensions" de la landing |
| `panel:right` | `PanelPluginRegistration` | `{ investigationId }` | Onglets du panneau lateral |
| `contextMenu:element` | `ContextMenuExtension` | `MenuContext` | Clic droit sur element |
| `contextMenu:link` | `ContextMenuExtension` | `MenuContext` | Clic droit sur lien |
| `contextMenu:canvas` | `ContextMenuExtension` | `MenuContext` | Clic droit sur canvas |
| `report:toolbar` | `ComponentType<ReportToolbarPluginProps>` | `{ investigationId }` | Toolbar du panneau rapport |
| `report:sectionActions` | `ComponentType<ReportSectionPluginProps>` | `{ sectionId, investigationId }` | Header de section rapport |
| `keyboard:shortcuts` | `KeyboardShortcut` | — | Handler keydown global |
| `export:hooks` | `ExportHook` | `(zip, investigationId)` | Export ZIP |
| `import:hooks` | `ImportHook` | `(zip, investigationId)` | Import ZIP |

## Plugins externes (chargement local)

Les plugins externes sont des fichiers JavaScript autonomes places dans le dossier `plugins/` a cote de l'application. Ils sont charges dynamiquement au demarrage — aucune recompilation necessaire. Pas d'acces internet, pas de telechargement — l'administrateur controle ce qui est deploye.

### Fonctionnement

1. Au demarrage, ZN recupere `/plugins/manifest.json`
2. Pour chaque entree, ZN importe dynamiquement le fichier JS
3. La fonction `register(api)` de chaque plugin est appelee avec l'API ZN
4. React se monte apres le chargement de tous les plugins — `usePlugins()` retourne les bonnes donnees des le premier rendu

Si `manifest.json` est absent ou vide, l'application demarre normalement sans impact.

### Format du manifeste

```json
{
  "plugins": [
    { "id": "my-plugin", "file": "my-plugin.js" },
    { "id": "other-plugin", "file": "other-plugin.js" }
  ]
}
```

Placez ce fichier dans `dist/plugins/manifest.json` (ou `public/plugins/manifest.json` en developpement).

### Format d'un fichier plugin

Chaque plugin est un module ES qui exporte une fonction `register` :

```javascript
// plugins/my-plugin.js
export function register(api) {
  const { registerPlugin, React, icons } = api;

  // Enregistrer la carte sur la page d'accueil
  registerPlugin('home:card', {
    id: 'my-plugin',
    name: 'Mon Plugin',
    description: 'Ce que fait ce plugin.',
    icon: 'Brain',
    version: '1.0.0',
  });

  // S'enregistrer dans d'autres slots avec pluginId pour la desactivation
  registerPlugin('contextMenu:element', {
    id: 'my-plugin-action',
    label: 'Mon Action',
    icon: 'Brain',
    pluginId: 'my-plugin',
    action: (ctx) => { console.log('Selection:', ctx.elementIds); },
  });
}
```

### Surface de l'API

L'objet `api` passe a `register()` fournit :

| Propriete | Description |
|-----------|-------------|
| `registerPlugin(slot, extension, pluginId?)` | Enregistrer une extension dans un slot |
| `registerPlugins(slot, extensions, pluginId?)` | Enregistrer plusieurs extensions d'un coup |
| `isPluginDisabled(id)` | Verifier si un plugin est desactive |
| `React` | L'instance React de l'app (meme instance — les hooks fonctionnent) |
| `icons` | Toutes les icones lucide-react |
| `pluginData.get(pluginId, investigationId, key)` | Lire depuis le stockage persistant |
| `pluginData.set(pluginId, investigationId, key, value)` | Ecrire dans le stockage persistant |
| `pluginData.remove(pluginId, investigationId, key)` | Supprimer du stockage persistant |

### Composants React sans JSX

Les plugins externes sont du JavaScript pur — pas de transpilation JSX. Utilisez `React.createElement` directement :

```javascript
export function register(api) {
  const { registerPlugin, React } = api;
  const h = React.createElement;

  function MyPanel({ investigationId }) {
    const [count, setCount] = React.useState(0);

    return h('div', { className: 'p-4 text-sm' },
      h('p', null, 'Investigation: ' + investigationId),
      h('button', {
        className: 'px-2 py-1 text-xs bg-bg-secondary border border-border-default rounded',
        onClick: () => setCount(c => c + 1),
      }, 'Clics: ' + count)
    );
  }

  registerPlugin('panel:right', {
    id: 'my-panel',
    label: 'Mon Panneau',
    icon: 'Brain',
    pluginId: 'my-plugin',
    component: MyPanel,
  });
}
```

### Plugins pre-compiles (avec JSX)

Pour des plugins plus complexes, utilisez un bundler (Vite, esbuild, Rollup) avec React marque comme externe :

```javascript
// vite.config.js pour le plugin
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
      external: ['react'],
      output: {
        globals: { react: 'React' },
      },
    },
  },
});
```

Le fichier compile utilise l'instance `React` fournie par l'API ZN :

```typescript
// src/index.tsx
export function register(api: any) {
  // Surcharge le React global pour que le JSX utilise l'instance ZN
  (window as any).React = api.React;

  const { registerPlugin } = api;
  // ... utiliser le JSX normalement
}
```

### Deploiement

1. Compilez ou ecrivez votre plugin comme un module ES `.js`
2. Copiez-le dans `dist/plugins/` (a cote de l'app ZN)
3. Ajoutez une entree dans `dist/plugins/manifest.json`
4. Rechargez l'application

### Gestion des erreurs

- Si `manifest.json` est absent (404) : l'app demarre normalement, pas d'erreur
- Si un fichier plugin ne charge pas : avertissement logue, les autres plugins chargent
- Si `register()` leve une exception : avertissement logue, les autres plugins chargent
- Les erreurs de plugins ne font jamais crasher l'application

### Securite

- Les plugins s'executent dans le meme contexte JS que l'app (pas de sandbox)
- Seul l'administrateur du serveur peut placer des fichiers dans `dist/plugins/`
- Pas de telechargement ni de chargement distant — les fichiers sont servis localement
- Verifiez le code des plugins avant deploiement, car ils ont un acces complet a l'API ZN et aux donnees IndexedDB
