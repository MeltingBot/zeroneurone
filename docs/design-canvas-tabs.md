# Design: Onglets de Canvas par Enquete

## Probleme

Une enquete = un seul canvas avec tous les elements. Sur 200+ elements, l'analyste a besoin de travailler sur des "angles" differents (piste financiere, reseau telephonique, personnages cles) sans voir les elements non pertinents. Les Views offrent des filtres mais pas un concept de workspace persistent avec visibilite des connexions transversales.

## Objectif

Onglets au sein d'une enquete. Chaque onglet = un sous-ensemble d'elements avec son viewport. Les elements lies a d'autres onglets apparaissent en fantome. Canvas, carte, timeline, filtres, insights — tout respecte l'onglet actif.

---

## Decisions de design (converge)

| Decision | Choix | Raison |
|----------|-------|--------|
| Position des elements | **Globale unique** | Pas de positions per-tab — trop complexe, confus pour l'utilisateur |
| Appartenance | **Tab stocke ses membres** (pas tabIds sur Element) | Zero migration, zero changement schema, Y.js additif |
| Elements cross-tab | **Fantomes** (dimmes, bordure pointillee, badge onglet source) | Rend les connexions transversales visibles |
| Filtres/Insights | **Scopes a l'onglet actif** | L'analyste veut la centralite dans son sous-reseau |
| Onglet actif en collab | **Local** (pas synchronise) | Chaque pair travaille sur son angle |
| Export | **Choix onglet actif ou tout** | Partager un angle specifique |
| Rapport | **Onglets → sections** | Structure naturelle de la synthese |

---

## Data model

### CanvasTab (nouveau type)

```typescript
type TabId = string; // UUID

interface CanvasTab {
  id: TabId;
  investigationId: InvestigationId;
  name: string;                    // "Piste financiere"
  order: number;                   // Position dans la tab bar
  memberElementIds: ElementId[];   // Elements assignes
  viewport: { x: number; y: number; zoom: number };
  createdAt: Date;
  updatedAt: Date;
}
```

### Element, Link : AUCUN changement

Pas de migration. Pas de nouveau champ. Enquetes existantes = onglet "Tous" seul.

### Stockage

| Couche | Implementation |
|--------|----------------|
| Dexie | Nouvelle table `canvasTabs` |
| Y.js | Nouveau `Y.Map('canvasTabs')` |
| Zustand | Nouveau `tabStore` |

---

## Visibilite : 3 etats

Sur un onglet specifique (pas "Tous") :

| Etat | Condition | Rendu |
|------|-----------|-------|
| **Visible** | Membre de l'onglet actif | Normal (opaque, selectionnable, editable) |
| **Fantome** | Pas membre, mais lie a un membre | Dimme + bordure pointillee + badge onglet source. Non editable. Clic → naviguer vers son onglet |
| **Cache** | Ni membre, ni lie a un membre | Invisible |

Sur "Tous" : tout visible, comportement actuel inchange.

### Calcul des fantomes

```typescript
const memberSet = new Set(tab.memberElementIds);
const ghostIds = new Set<string>();

for (const link of links) {
  if (memberSet.has(link.fromId) && !memberSet.has(link.toId))
    ghostIds.add(link.toId);
  if (memberSet.has(link.toId) && !memberSet.has(link.fromId))
    ghostIds.add(link.fromId);
}
```

Meme pattern que `getNeighborIds()` du focus mode — deja optimise.

---

## Pipeline de filtrage

```
ONGLET (membres + fantomes + caches)     ← NOUVEAU, premiere couche
  → Filtres (tags, confiance, date, texte)  ← scopes a l'onglet
    → Focus mode (voisinage N-hops)
      → Insights highlighting               ← scopes a l'onglet
```

Chaque couche travaille sur le resultat de la precedente. Sur "Tous" : premiere couche = no-op.

---

## Integration des 3 vues

### Canvas

- Membres : rendus normalement
- Fantomes : rendus dimmes avec style specifique (bordure pointillee, badge)
- Caches : exclus du rendu (comme hiddenElementIds)
- Liens : visibles si au moins un endpoint est membre (l'autre peut etre fantome)

### Carte (MapView)

- Filtre par membership en amont : seuls les membres + fantomes avec geo apparaissent
- Fantomes = markers attenues

### Timeline (TimelineView)

- Meme filtre : seuls les evenements/dates des membres + fantomes

---

## Insights scopes a l'onglet

- Clusters, centralite, ponts : calcules sur les membres de l'onglet actif (pas les fantomes)
- Sur "Tous" : comportement actuel (tout le graphe)
- Pas de toggle supplementaire — le scope suit l'onglet automatiquement

---

## Export par onglet

### Markdown / HTML

- Choix : "Exporter l'onglet actif" ou "Exporter tout"
- Onglet actif : ses membres, leurs liens internes, les fantomes mentionnes en annexe
- Tout : comportement actuel

### PNG / PDF

- Capture du canvas actuel (respecte l'onglet actif naturellement — le rendu visible = le rendu exporte)

### .zeroneurone (ZIP)

- Toujours tout (elements + links + tabs). Les tabs sont incluses dans l'archive.

---

## Rapport structure par onglets

L'onglet structure naturellement le rapport :

```
# Rapport d'enquete : Affaire Dupont

## 1. Vue globale (onglet "Tous")
   [Graphe complet SVG, stats generales]

## 2. Piste financiere (onglet "Financier")
   [Snapshot SVG du sous-graphe : 30 membres + fantomes attenues]
   [Insights locaux : centralite, clusters dans ce sous-reseau]
   [Connexions vers d'autres onglets mentionnees]

## 3. Reseau telephonique (onglet "Tel.")
   [Snapshot SVG du sous-graphe : 25 membres + fantomes]
   [Chronologie des appels]

## 4. Connexions transversales
   [Snapshot SVG : uniquement les liens cross-tab et leurs endpoints]
   [Elements apparaissant dans plusieurs onglets]
```

### Generation des snapshots SVG/HTML par section

Pour chaque section liee a un onglet :
1. Switch programmatique vers l'onglet (pas de rendu visible, calcul en memoire)
2. Calcul du sous-graphe : membres + fantomes + liens
3. Rendu SVG du sous-graphe avec le meme style que le canvas :
   - Membres : rendu normal (opaque)
   - Fantomes : rendu attenue (~40% opacite, bordure pointillee, badge onglet source)
   - Liens internes : rendu normal
   - Liens cross-tab (vers fantomes) : rendu attenue
4. Export HTML : le SVG est inline dans la section, interactif (hover pour details)

### Section "Connexions transversales"

Snapshot SVG specifique :
- Seuls les elements qui apparaissent dans 2+ onglets sont affiches
- Seuls les liens dont les endpoints sont sur des onglets differents
- Chaque element porte un badge multi-onglet (ex: "Fin. + Tel.")
- Donne une vue synthetique des ponts entre angles d'analyse

### Auto-generation

Le ReportPanel propose auto-generation des sections a partir des onglets :
- Un bouton "Generer depuis les onglets" cree une section par onglet + section transversale
- L'analyste peut reordonner, editer le texte, supprimer des sections
- Les snapshots SVG sont regenerables independamment (bouton "Rafraichir le graphe")

---

## UI

### Tab bar

```
[Tous] [Piste financiere (30)] [Reseau tel. (25)] [+]
```

- Toujours visible au-dessus du canvas/carte/timeline
- "Tous" permanent, non supprimable, non renommable
- `[+]` cree un nouvel onglet
- Double-clic sur nom → renommer inline
- Clic droit → menu contextuel (renommer, supprimer)
- Drag & drop pour reordonner
- Badge nombre de membres

### Assignation d'elements

- Clic droit sur element(s) → "Ajouter a l'onglet..." → sous-menu
- Multi-selection + clic droit → assignation par lot
- Creation d'element sur un onglet → auto-assignation
- Panel de detail : affiche les onglets de l'element

### Fantomes

- Opacite reduite (~40%)
- Bordure pointillee
- Badge petit indiquant l'onglet source
- Non selectionnable, non editable, non deplacable
- Clic → propose de naviguer vers l'onglet source

---

## Recherche (Ctrl+K)

- Les resultats indiquent les onglets de chaque element : `Marcel D. [Fin.] [Tel.]`
- Selectionner un resultat depuis un onglet ou l'element n'est pas membre → proposer "Aller a l'onglet Financier" ou "Voir dans Tous"
- La recherche cherche toujours dans TOUS les elements, quel que soit l'onglet actif (pas de scope)

---

## Minimap

- La minimap respecte l'onglet actif : seuls les membres + fantomes sont affiches
- Les fantomes apparaissent avec une opacite reduite dans la minimap aussi
- Switcher d'onglet met a jour la minimap immediatement

---

## Raccourcis clavier

| Raccourci | Action |
|-----------|--------|
| Ctrl+1..9 | Switcher vers l'onglet N (1 = Tous) |
| Ctrl+T | Creer un nouvel onglet |
| Ctrl+W | Fermer/supprimer l'onglet actif (pas "Tous") |
| Ctrl+Shift+← / → | Onglet precedent / suivant |

Note : les raccourcis existants (1/2/3/4 pour Canvas/Map/Split/Timeline) ne sont PAS en conflit car ils n'utilisent pas Ctrl.

---

## Detail panel : section onglets

Dans le panel de detail d'un element :
- Section "Onglets" avec la liste des onglets auxquels l'element appartient
- Boutons pour ajouter/retirer rapidement d'un onglet
- Si l'element est sur zero onglets : mention "Visible uniquement dans Tous"

---

## Etats speciaux

### Onglet vide (aucun membre)

- Message centre : "Aucun element. Clic droit sur des elements → Ajouter a cet onglet"
- Les fantomes ne s'affichent pas non plus (pas de membres = pas de liens cross-tab)

### Desassignation

- Clic droit sur element(s) → "Retirer de l'onglet actif"
- Si on retire le dernier membre, l'onglet devient vide (pas de suppression auto)
- Retirer d'un onglet ne supprime jamais l'element

### Suppression d'onglet

- Confirmation demandee : "Supprimer l'onglet X ? Les elements ne seront pas supprimes."
- L'utilisateur est redirige vers "Tous" apres suppression

---

## i18n

Nouvelles cles a traduire (11 langues) :

```json
"tabs.all": "Tous",
"tabs.new": "Nouvel onglet",
"tabs.rename": "Renommer",
"tabs.delete": "Supprimer l'onglet",
"tabs.deleteConfirm": "Supprimer l'onglet {{name}} ? Les elements ne seront pas supprimes.",
"tabs.addToTab": "Ajouter a l'onglet...",
"tabs.removeFromTab": "Retirer de l'onglet",
"tabs.emptyState": "Aucun element dans cet onglet",
"tabs.ghostBadge": "Sur {{tabs}}",
"tabs.navigateTo": "Aller a l'onglet {{name}}"
```

---

## Y.js / Collab

### Structure Y.Doc

```
yDoc
 +-- elements (Y.Map)     ← inchange
 +-- links (Y.Map)        ← inchange
 +-- canvasTabs (Y.Map)   ← NOUVEAU
      +-- [tabId] → { name, order, memberElementIds, viewport }
```

### Sync

- Creer/supprimer/renommer onglet : sync immediate
- Assigner/desassigner element : sync immediate
- Onglet actif : LOCAL (chaque pair sur son onglet)
- Snapshot initial (join) : inclut canvasTabs automatiquement (Y.js natif)

---

## Cascades et coherence

| Evenement | Action |
|-----------|--------|
| Suppression d'un element | Retirer de tous les `memberElementIds` |
| Suppression d'un onglet | Aucun impact sur les elements |
| Undo/Redo | Operations de tab dans l'historique |
| Import .zeroneurone | Inclure les `canvasTabs` |
| Export .zeroneurone | Inclure les `canvasTabs` |
| Copier/Coller sur un onglet | Auto-assignation des elements colles |
| Groupe assigne a un onglet | Auto-inclusion des enfants |

---

## Questions ouvertes

1. **Limite d'onglets ?** 20 max, scroll horizontal si > 8 visibles
2. **Element sur zero onglets ?** Oui, visible uniquement sur "Tous"
3. **Groupes ?** Si un groupe est assigne, ses enfants suivent automatiquement
4. **View sauvegardee + onglet ?** Une View peut sauvegarder l'onglet actif dans son etat
5. **Fantomes dans la carte ?** Oui, attenues, pour montrer les connexions geo cross-tab

---

## Phases d'implementation

### Phase 1 : Core (~1-1.5j IA)
- Type `CanvasTab` + table Dexie + tabStore Zustand
- Tab bar UI (creer, renommer, supprimer, switcher)
- Assignation via clic droit / multi-selection
- Filtrage canvas par membership (visible/fantome/cache)
- Viewport per-tab (sauvegarde/restauration au switch)
- Filtrage carte et timeline

### Phase 2 : Collab + integration (~1j IA)
- Y.Map pour canvasTabs + observers dans syncService
- Insights scopes a l'onglet actif
- Filtres scopes a l'onglet
- Undo/Redo pour operations de tab

### Phase 3 : Export + Rapport (~0.5-1j IA)
- Export markdown/HTML par onglet ou tout
- Export .zeroneurone avec canvasTabs
- Auto-generation de sections de rapport a partir des onglets
- Section "Connexions transversales" dans le rapport

**Total estime : ~2.5-3.5j IA**
