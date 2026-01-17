# zeroneurone — Guide d'implémentation

## Phase par phase

## Destination : Claude Code

Ce document décrit l'ordre d'implémentation, les critères de validation pour chaque phase, et les cas limites à gérer.

---

## Principes d'implémentation

### Règles générales

1. **Chaque phase doit être fonctionnelle** — Pas de code mort, pas de TODO critiques
2. **Tests manuels avant de passer à la suite** — Vérifier les critères de "done"
3. **Commits atomiques** — Un commit par feature ou fix
4. **Pas d'optimisation prématurée** — D'abord ça marche, ensuite ça marche vite

### Stack confirmée

```
Framework:     React 18 + TypeScript + Vite
State:         Zustand
Storage:       Dexie.js (IndexedDB) + OPFS
Canvas:        React Flow (à confirmer après proto)
Carte:         Leaflet + React-Leaflet
Timeline:      vis-timeline ou custom
Graphe:        Graphology
Recherche:     MiniSearch
Export:        JSZip, jsPDF
Style:         Tailwind CSS
```

---

## Phase 1 — Fondations

### Objectif
Setup du projet, stockage fonctionnel, types de base.

### Tâches

1. **Initialiser le projet**
   ```bash
   npm create vite@latest zeroneurone -- --template react-ts
   cd zeroneurone
   npm install
   ```

2. **Installer les dépendances**
   ```bash
   npm install zustand dexie tailwindcss postcss autoprefixer
   npm install -D @types/node
   npx tailwindcss init -p
   ```

3. **Créer la structure de dossiers**
   ```
   src/
   ├── components/
   ├── stores/
   ├── db/
   ├── services/
   ├── types/
   ├── utils/
   └── hooks/
   ```

4. **Implémenter les types de base**
   - Fichier `src/types/index.ts`
   - Tous les types du document "Modèle de données"

5. **Configurer Dexie**
   - Fichier `src/db/database.ts`
   - Stores: investigations, elements, links, assets, views, reports

6. **Implémenter les repositories**
   - `src/db/repositories/investigationRepository.ts`
   - `src/db/repositories/elementRepository.ts`
   - `src/db/repositories/linkRepository.ts`
   - CRUD complet avec les méthodes du document technique

7. **Implémenter le FileService (OPFS)**
   - `src/services/fileService.ts`
   - saveAsset, getAssetFile, deleteAsset
   - Hash SHA-256 pour déduplication

8. **Créer les stores Zustand de base**
   - `src/stores/investigationStore.ts` (structure de base)
   - `src/stores/uiStore.ts` (structure de base)

### Critères de "done"

- [ ] `npm run dev` démarre sans erreur
- [ ] Types TypeScript compilent sans erreur
- [ ] Peut créer une investigation via la console : `await investigationRepository.create('Test')`
- [ ] Peut créer un élément : `await elementRepository.create(invId, 'Element 1', {x:0, y:0})`
- [ ] Peut créer un lien : `await linkRepository.create(invId, el1Id, el2Id)`
- [ ] Peut sauvegarder un fichier dans OPFS et le récupérer
- [ ] Les données persistent après rechargement de la page

### Cas limites à gérer

| Cas | Comportement attendu |
|-----|----------------------|
| Dexie non supporté (vieux navigateur) | Message d'erreur explicite |
| OPFS non supporté | Fallback sur IndexedDB pour les blobs (dégradé) |
| Quota storage dépassé | Erreur catchée, message utilisateur |

---

## Phase 2 — Page d'accueil

### Objectif
Interface de gestion des enquêtes (liste, création, suppression).

### Tâches

1. **Layout de base**
   - `src/App.tsx` — Router simple (home / investigation/:id)
   - `src/components/Layout.tsx` — Container principal

2. **Page d'accueil**
   - `src/pages/HomePage.tsx`
   - Liste des enquêtes depuis le store
   - Tri par date de modification

3. **Carte d'enquête**
   - `src/components/home/InvestigationCard.tsx`
   - Nom, date modification, compteurs (éléments, liens)
   - Boutons: Ouvrir, Menu (renommer, supprimer, exporter)

4. **Modal création**
   - `src/components/modals/CreateInvestigationModal.tsx`
   - Champs: nom, description (optionnel)
   - Validation: nom requis

5. **Modal suppression**
   - `src/components/modals/ConfirmDeleteModal.tsx`
   - Réutilisable pour d'autres suppressions

6. **Navigation**
   - Clic sur "Ouvrir" → navigate vers `/investigation/:id`

### Critères de "done"

- [ ] Page d'accueil affiche la liste des enquêtes
- [ ] Peut créer une nouvelle enquête via le bouton
- [ ] Peut renommer une enquête
- [ ] Peut supprimer une enquête (avec confirmation)
- [ ] Clic sur une enquête navigue vers la page investigation
- [ ] Liste vide → message "Aucune enquête"

### Cas limites à gérer

| Cas | Comportement attendu |
|-----|----------------------|
| Nom d'enquête vide | Bouton "Créer" désactivé |
| Nom très long (>100 car) | Tronqué dans la liste |
| Beaucoup d'enquêtes (>50) | Scroll, pas de pagination pour V1 |

---

## Phase 3 — Canvas de base

### Objectif
Canvas fonctionnel avec création et manipulation d'éléments.

### Tâches

1. **Installer React Flow**
   ```bash
   npm install reactflow
   ```

2. **Page Investigation**
   - `src/pages/InvestigationPage.tsx`
   - Charge l'enquête depuis l'URL
   - Layout: header + canvas + sidebar

3. **Composant Canvas**
   - `src/components/canvas/Canvas.tsx`
   - Intégration React Flow
   - Pan et zoom

4. **Nœud personnalisé**
   - `src/components/canvas/ElementNode.tsx`
   - Affiche label, couleur, forme
   - Gère la sélection visuelle

5. **Création d'élément**
   - Double-clic sur canvas → créer élément
   - Position = coordonnées du clic
   - Label par défaut "Nouvel élément"

6. **Déplacement**
   - Drag & drop des éléments
   - Mise à jour de la position dans le store

7. **Sélection**
   - Clic → sélectionne
   - Clic canvas vide → désélectionne
   - Shift+clic → ajoute à la sélection
   - Rectangle de sélection

8. **Suppression**
   - Touche Delete → supprime la sélection

9. **Store de sélection**
   - `src/stores/selectionStore.ts`
   - selectedElementIds, selectedLinkIds
   - Actions: select, deselect, toggle

### Critères de "done"

- [ ] Canvas s'affiche avec pan et zoom fonctionnels
- [ ] Double-clic crée un élément à la position du clic
- [ ] Peut déplacer un élément par drag
- [ ] Clic sélectionne un élément (bordure visible)
- [ ] Shift+clic ajoute à la sélection
- [ ] Rectangle de sélection fonctionne
- [ ] Delete supprime les éléments sélectionnés
- [ ] Les positions sont persistées (rechargement conserve les positions)

### Cas limites à gérer

| Cas | Comportement attendu |
|-----|----------------------|
| Double-clic sur élément | Ne crée pas de nouvel élément (édition future) |
| Drag en dehors du canvas | Élément reste dans les limites visibles |
| Supprimer avec rien de sélectionné | Rien ne se passe |
| Zoom extrême (très petit/grand) | Limites min/max (0.1 à 4) |

---

## Phase 4 — Liens

### Objectif
Création et affichage des liens entre éléments.

### Tâches

1. **Edge personnalisé**
   - `src/components/canvas/LinkEdge.tsx`
   - Affiche le lien avec style (couleur, épaisseur)
   - Label optionnel sur le lien

2. **Création de lien par drag**
   - Drag depuis un élément → ligne provisoire
   - Drop sur un autre élément → créer le lien
   - Drop dans le vide → annuler (ou créer élément, à voir)

3. **Handles de connexion**
   - Points de connexion sur les éléments
   - Visibles au survol ou en mode création de lien

4. **Sélection de lien**
   - Clic sur un lien → sélectionne
   - Affichage différent quand sélectionné

5. **Suppression de lien**
   - Delete quand lien sélectionné

6. **Liens multiples**
   - Permettre plusieurs liens entre deux mêmes éléments
   - Affichage légèrement décalé pour visualiser

### Critères de "done"

- [ ] Peut créer un lien en tirant d'un élément vers un autre
- [ ] Lien s'affiche correctement entre les deux éléments
- [ ] Peut sélectionner un lien
- [ ] Peut supprimer un lien
- [ ] Suppression d'un élément supprime ses liens
- [ ] Plusieurs liens entre deux éléments possibles

### Cas limites à gérer

| Cas | Comportement attendu |
|-----|----------------------|
| Lien vers soi-même | Interdit (pas de self-loop) |
| Lien déjà existant | Crée un second lien (multi autorisé) |
| Drag annulé (Escape) | Ligne provisoire disparaît |
| Élément supprimé | Tous ses liens supprimés |

---

## Phase 5 — Panneau de détail

### Objectif
Édition des métadonnées des éléments et liens.

### Tâches

1. **Panneau latéral**
   - `src/components/panels/SidePanel.tsx`
   - Affichage conditionnel selon sélection
   - Tabs: Détail, Insights, Vues, Filtres (pour plus tard)

2. **Détail élément**
   - `src/components/panels/ElementDetail.tsx`
   - Champs: label (input), notes (textarea)
   - Sauvegarde automatique (debounce 500ms)

3. **Éditeur de tags**
   - `src/components/panels/TagsEditor.tsx`
   - Affichage en chips
   - Input pour ajouter, X pour supprimer

4. **Éditeur de propriétés**
   - `src/components/panels/PropertiesEditor.tsx`
   - Liste clé/valeur
   - Bouton "Ajouter propriété"
   - Supprimer une propriété

5. **Métadonnées**
   - Confiance (slider 0-100)
   - Source (input texte)
   - Date (date picker)

6. **Apparence**
   - `src/components/panels/VisualEditor.tsx`
   - Couleur (color picker)
   - Forme (select)
   - Taille (select ou slider)

7. **Détail lien**
   - `src/components/panels/LinkDetail.tsx`
   - Label, notes, propriétés
   - Dirigé (checkbox)
   - Apparence (couleur, style, épaisseur)

### Critères de "done"

- [ ] Sélectionner un élément ouvre le panneau de détail
- [ ] Peut modifier le label → mis à jour sur le canvas
- [ ] Peut ajouter/modifier/supprimer des tags
- [ ] Peut ajouter/modifier/supprimer des propriétés
- [ ] Peut changer la confiance, source, date
- [ ] Peut changer la couleur → élément change sur le canvas
- [ ] Sélectionner un lien affiche le détail du lien
- [ ] Modifications sauvegardées automatiquement
- [ ] Changements persistent après rechargement

### Cas limites à gérer

| Cas | Comportement attendu |
|-----|----------------------|
| Label vide | Autorisé (mais warning visuel) |
| Tag en double | Ignoré silencieusement |
| Propriété sans clé | Non ajoutée |
| Sélection multiple | Panneau affiche "X éléments sélectionnés" (édition batch V2) |

---

## Phase 6 — Fichiers attachés

### Objectif
Attacher des fichiers aux éléments.

### Tâches

1. **Zone de drop sur le panneau**
   - `src/components/panels/AssetsPanel.tsx`
   - Zone "Glisser des fichiers ici"
   - Input file en fallback

2. **Drop sur le canvas**
   - Fichier droppé sur canvas vide → nouvel élément avec fichier
   - Fichier droppé sur élément → attaché à l'élément

3. **Liste des fichiers attachés**
   - Affichage dans le panneau détail
   - Thumbnail pour images
   - Nom + taille pour les autres
   - Bouton supprimer

4. **Prévisualisation**
   - Clic sur fichier → modal preview
   - Images: affichage direct
   - PDF: affichage première page ou lien téléchargement

5. **Génération thumbnail**
   - Images: resize côté client
   - PDF: canvas render première page (si possible)

### Critères de "done"

- [ ] Peut dropper un fichier sur le canvas → crée élément avec fichier
- [ ] Peut dropper un fichier sur un élément → ajoute à l'élément
- [ ] Peut dropper via la zone du panneau de détail
- [ ] Fichiers listés dans le panneau avec thumbnail
- [ ] Peut supprimer un fichier attaché
- [ ] Fichiers persistent après rechargement
- [ ] Peut télécharger un fichier attaché

### Cas limites à gérer

| Cas | Comportement attendu |
|-----|----------------------|
| Fichier >50MB | Warning, mais autorisé |
| Fichier type inconnu | Stocké sans preview |
| Même fichier deux fois | Dédupliqué par hash (un seul stockage) |
| Drop multiple fichiers | Plusieurs éléments créés (si sur canvas vide) |
| Quota OPFS dépassé | Erreur explicite, suggestion de nettoyer |

---

## Phase 7 — Recherche

### Objectif
Recherche full-text sur tous les éléments.

### Tâches

1. **Installer MiniSearch**
   ```bash
   npm install minisearch
   ```

2. **Service de recherche**
   - `src/services/searchService.ts`
   - Index: label, notes, tags, propriétés
   - Méthodes: loadInvestigation, search, indexElement, removeElement

3. **Barre de recherche header**
   - `src/components/header/SearchBar.tsx`
   - Input avec icône loupe
   - Affiche "Ctrl+K" comme hint

4. **Modal de recherche**
   - `src/components/modals/SearchModal.tsx`
   - S'ouvre avec Ctrl+K
   - Input focus automatique
   - Résultats en temps réel

5. **Affichage résultats**
   - Liste avec icône type, label, extrait
   - Navigation clavier (↑↓)
   - Enter → sélectionne et centre sur l'élément

6. **Indexation incrémentale**
   - Mise à jour index à chaque modification d'élément
   - Rebuild complet au chargement de l'enquête

### Critères de "done"

- [ ] Ctrl+K ouvre la modal de recherche
- [ ] Taper du texte affiche les résultats instantanément
- [ ] Recherche fonctionne sur label, notes, tags, propriétés
- [ ] Navigation clavier fonctionne
- [ ] Enter sur un résultat ferme la modal et centre sur l'élément
- [ ] Escape ferme la modal
- [ ] L'élément trouvé est sélectionné

### Cas limites à gérer

| Cas | Comportement attendu |
|-----|----------------------|
| Recherche vide | Pas de résultats affichés |
| Aucun résultat | Message "Aucun résultat pour X" |
| Beaucoup de résultats | Limiter à 20, afficher "et X autres..." |
| Caractères spéciaux | Échappés correctement |
| Recherche pendant frappe | Debounce 100ms |

---

## Phase 8 — Filtres et vues

### Objectif
Filtrer les éléments visibles, sauvegarder des vues.

### Tâches

1. **Store de vue**
   - `src/stores/viewStore.ts`
   - filters, hiddenElementIds, viewport
   - Actions: setFilters, clearFilters, hideElements, showElements

2. **Panneau filtres**
   - `src/components/panels/FiltersPanel.tsx`
   - Filtre par tags (multiselect)
   - Filtre par propriété existante
   - Filtre par confiance minimum
   - Bouton "Effacer les filtres"

3. **Application des filtres**
   - Éléments non-filtrés → opacité réduite (dimmed)
   - Liens vers éléments filtrés → aussi dimmed
   - Indicateur dans la toolbar "Filtres actifs"

4. **Vues sauvegardées**
   - `src/components/panels/ViewsPanel.tsx`
   - Liste des vues
   - Bouton "Sauvegarder la vue actuelle"
   - Clic sur une vue → restaure filtres + viewport

5. **Focus (voisinage)**
   - Clic droit → "Focus sur cet élément"
   - Modal pour choisir la profondeur (1, 2, 3)
   - Seuls l'élément et ses voisins restent visibles
   - Barre inférieure: "Focus sur X [Quitter]"

### Critères de "done"

- [ ] Peut filtrer par tag → éléments sans le tag sont dimmed
- [ ] Peut combiner plusieurs filtres
- [ ] Peut effacer tous les filtres
- [ ] Indicateur de filtres actifs visible
- [ ] Peut sauvegarder une vue
- [ ] Peut charger une vue sauvegardée
- [ ] Focus sur un élément masque les éléments éloignés
- [ ] Peut quitter le mode focus

### Cas limites à gérer

| Cas | Comportement attendu |
|-----|----------------------|
| Tous les éléments filtrés | Message "Aucun élément visible" |
| Vue sauvegardée avec éléments supprimés | Vue chargée, éléments manquants ignorés |
| Focus sur élément isolé | Seul cet élément visible |
| Supprimer vue actuelle | Vue déchargée, filtres effacés |

---

## Phase 9 — Insights

### Objectif
Calcul et affichage des insights (clusters, centralité, ponts).

### Tâches

1. **Installer Graphology**
   ```bash
   npm install graphology graphology-metrics graphology-communities-louvain graphology-shortest-path
   ```

2. **Service d'insights**
   - `src/services/insightsService.ts`
   - Construction du graphe Graphology
   - Méthodes: getClusters, getCentrality, getBridges, getIsolated, detectSimilarLabels

3. **Store d'insights**
   - `src/stores/insightsStore.ts`
   - Cache des résultats
   - Action recompute

4. **Panneau insights**
   - `src/components/panels/InsightsPanel.tsx`
   - Sections: Structure, Centralité, Attention
   - Chaque item cliquable → highlight sur canvas

5. **Highlight**
   - Éléments concernés surlignés (halo)
   - Autres éléments légèrement dimmed

6. **Chemins entre deux éléments**
   - Sélectionner 2 éléments → clic droit → "Chemins entre A et B"
   - Affiche les chemins trouvés
   - Chemins surlignés sur le canvas

7. **Rafraîchissement**
   - Bouton refresh dans le panneau
   - Recalcul automatique au chargement
   - Pas de recalcul automatique à chaque modification (trop coûteux)

### Critères de "done"

- [ ] Panneau insights affiche les clusters détectés
- [ ] Affiche les éléments les plus centraux
- [ ] Affiche les ponts
- [ ] Affiche les éléments isolés
- [ ] Affiche les homonymes potentiels
- [ ] Clic sur un insight highlight les éléments concernés
- [ ] Peut voir les chemins entre deux éléments
- [ ] Bouton refresh fonctionne

### Cas limites à gérer

| Cas | Comportement attendu |
|-----|----------------------|
| Graphe vide | "Aucun insight disponible" |
| Graphe non connexe | Plusieurs clusters affichés |
| Calcul long (>1000 éléments) | Indicateur de chargement |
| Aucun chemin entre A et B | "Aucun chemin trouvé" |

---

## Phase 10 — Timeline

### Objectif
Vue chronologique des éléments datés.

### Tâches

1. **Évaluer vis-timeline ou custom**
   ```bash
   npm install vis-timeline vis-data
   ```
   
   Alternative: composant custom avec canvas/SVG

2. **Vue Timeline**
   - `src/components/timeline/TimelineView.tsx`
   - Axe horizontal = temps
   - Éléments positionnés selon leur date

3. **Types d'affichage**
   - Événement ponctuel (date) → marqueur
   - Période (dateRange) → barre

4. **Contrôles**
   - Zoom temporel (année/mois/semaine/jour)
   - Pan horizontal
   - Sélecteur de période

5. **Synchronisation**
   - Clic sur élément timeline → sélectionne dans le canvas
   - Sélection canvas → highlight dans timeline

6. **Filtrage temporel**
   - Sélectionner une période → filtre le canvas

7. **Switcher de vue**
   - Header: boutons Canvas / Carte / Timeline / Split
   - Touche 4 → Timeline

### Critères de "done"

- [ ] Vue timeline affiche les éléments avec date
- [ ] Éléments sans date non affichés dans timeline
- [ ] Zoom temporel fonctionne
- [ ] Clic sur élément le sélectionne aussi sur le canvas
- [ ] Peut basculer entre canvas et timeline
- [ ] Périodes (dateRange) affichées comme barres

### Cas limites à gérer

| Cas | Comportement attendu |
|-----|----------------------|
| Aucun élément daté | Message "Aucun élément avec date" |
| Dates très espacées (1900-2024) | Zoom auto adapté |
| Beaucoup d'éléments même date | Empilés verticalement |
| Date invalide | Ignorée, warning en console |

---

## Phase 11 — Vue cartographique

### Objectif
Afficher les éléments géolocalisés sur une carte.

### Tâches

1. **Installer Leaflet**
   ```bash
   npm install leaflet react-leaflet
   npm install -D @types/leaflet
   ```

2. **Vue carte**
   - `src/components/map/MapView.tsx`
   - Carte Leaflet avec tiles OpenStreetMap
   - Marqueurs pour les éléments avec geo

3. **Marqueurs personnalisés**
   - `src/components/map/ElementMarker.tsx`
   - Couleur selon l'élément
   - Popup avec label

4. **Synchronisation**
   - Clic marqueur → sélectionne l'élément
   - Sélection canvas → highlight sur carte

5. **Vue Split**
   - `src/components/views/SplitView.tsx`
   - Canvas à gauche, carte à droite
   - Synchronisation sélection

6. **Ajout de coordonnées**
   - Dans le panneau détail: section Géolocalisation
   - Input lat/lng manuel
   - Ou: clic sur carte pour placer

7. **Export GeoJSON**
   - Ajouter dans les options d'export
   - Format GeoJSON standard

### Critères de "done"

- [ ] Vue carte affiche les éléments géolocalisés
- [ ] Clic sur marqueur sélectionne l'élément
- [ ] Vue split fonctionne (canvas + carte)
- [ ] Peut ajouter des coordonnées à un élément
- [ ] Peut exporter en GeoJSON
- [ ] Basculer entre vues fonctionne (touches 1,2,3)

### Cas limites à gérer

| Cas | Comportement attendu |
|-----|----------------------|
| Aucun élément géolocalisé | Carte vide, message info |
| Coordonnées invalides | Ignorées, warning |
| Beaucoup de marqueurs même endroit | Clustering ou décalage |
| Offline (pas de tiles) | Message erreur carte |

---

## Phase 12 — Import/Export

### Objectif
Import/Export complet des enquêtes.

### Tâches

1. **Installer JSZip et jsPDF**
   ```bash
   npm install jszip jspdf html2canvas
   ```

2. **Export ZIP**
   - `src/services/exportService.ts`
   - Méthode exportInvestigation → Blob ZIP
   - Contenu: manifest.json, investigation.json, elements.json, links.json, views.json, assets/

3. **Import ZIP**
   - `src/services/importService.ts`
   - Méthode importInvestigation(file) → InvestigationId
   - Validation du format
   - Génération de nouveaux IDs

4. **Import CSV**
   - Modal d'import avec mapping des colonnes
   - Prévisualisation
   - Création des éléments

5. **Export images**
   - PNG du canvas actuel
   - SVG si possible
   - Capture via html2canvas ou React Flow export

6. **Export données**
   - JSON (éléments + liens)
   - CSV (liste plate des éléments)
   - GeoJSON (déjà fait en phase 11)

7. **Modal d'export**
   - `src/components/modals/ExportModal.tsx`
   - Choix du format selon l'usage

### Critères de "done"

- [ ] Peut exporter une enquête en ZIP
- [ ] Peut importer une enquête depuis un ZIP
- [ ] Import restaure tous les éléments, liens, fichiers
- [ ] Peut importer un CSV avec mapping des colonnes
- [ ] Peut exporter en PNG
- [ ] Peut exporter en JSON, CSV

### Cas limites à gérer

| Cas | Comportement attendu |
|-----|----------------------|
| ZIP corrompu | Erreur explicite |
| Version incompatible | Erreur avec numéro de version |
| Fichiers manquants dans ZIP | Import partiel, warning |
| CSV mal formé | Erreur explicite, ligne problématique indiquée |
| Export enquête énorme | Progress bar, possibilité d'annuler |

---

## Phase 13 — Rapport

### Objectif
Génération de rapports structurés.

### Tâches

1. **Mode rapport**
   - `src/pages/ReportPage.tsx`
   - Layout: structure à gauche, preview à droite

2. **Structure du rapport**
   - Liste de sections ordonnables
   - Drag & drop pour réordonner
   - Ajouter/supprimer section

3. **Édition de section**
   - Titre
   - Contenu texte (Markdown ou WYSIWYG simple)
   - Éléments inclus (sélection depuis le canvas)

4. **Capture graphe**
   - Snapshot de la vue actuelle
   - Inséré comme image dans la section

5. **Preview**
   - Rendu en temps réel
   - Style document

6. **Export**
   - PDF via jsPDF
   - Markdown

### Critères de "done"

- [ ] Peut créer un rapport avec sections
- [ ] Peut ajouter du texte à une section
- [ ] Peut inclure des éléments dans une section
- [ ] Peut capturer le graphe comme illustration
- [ ] Preview en temps réel
- [ ] Export PDF fonctionnel
- [ ] Export Markdown fonctionnel

### Cas limites à gérer

| Cas | Comportement attendu |
|-----|----------------------|
| Rapport vide | Export quand même (document vide) |
| Texte très long | Pagination automatique en PDF |
| Image très grande | Redimensionnée pour tenir dans la page |
| Éléments supprimés après ajout au rapport | Ignorés lors de l'export |

---

## Phase 14 — Polish et optimisations

### Objectif
Finitions, performance, UX.

### Tâches

1. **Performance canvas**
   - Virtualisation si >500 éléments
   - Debounce des updates
   - Lazy loading des thumbnails

2. **Raccourcis clavier**
   - Implémenter tous les raccourcis listés
   - Afficher dans un modal "?" 

3. **Undo/Redo**
   - Historique des actions
   - Ctrl+Z, Ctrl+Shift+Z

4. **Toasts**
   - Système de notifications
   - Success, error, warning, info

5. **États vides**
   - Messages explicites partout
   - Illustrations ou icônes

6. **Loading states**
   - Spinners appropriés
   - Skeleton loaders si pertinent

7. **Accessibilité**
   - aria-labels
   - Focus management
   - Contraste couleurs

8. **Tests manuels complets**
   - Parcourir tous les scénarios
   - Tester les cas limites

### Critères de "done"

- [ ] Pas de freeze avec 200 éléments
- [ ] Tous les raccourcis fonctionnent
- [ ] Undo/Redo fonctionne pour les actions principales
- [ ] Toasts s'affichent pour les actions importantes
- [ ] Pas d'état "vide sans explication"
- [ ] Navigation clavier possible partout

---

## Récapitulatif des phases

| Phase | Objectif | Estimation |
|-------|----------|------------|
| 1 | Fondations | 1-2 jours |
| 2 | Page d'accueil | 0.5 jour |
| 3 | Canvas de base | 1-2 jours |
| 4 | Liens | 0.5-1 jour |
| 5 | Panneau de détail | 1-2 jours |
| 6 | Fichiers attachés | 1 jour |
| 7 | Recherche | 0.5-1 jour |
| 8 | Filtres et vues | 1-2 jours |
| 9 | Insights | 1-2 jours |
| 10 | Timeline | 1-2 jours |
| 11 | Carte | 1 jour |
| 12 | Import/Export | 1-2 jours |
| 13 | Rapport | 1-2 jours |
| 14 | Polish | 2-3 jours |

**Total estimé : 15-25 jours de développement**

---

## Checklist finale V1

### Fonctionnalités core

- [ ] Créer/modifier/supprimer des enquêtes
- [ ] Créer/modifier/supprimer des éléments
- [ ] Créer/modifier/supprimer des liens
- [ ] Métadonnées libres (tags, propriétés, confiance, source, dates)
- [ ] Apparence personnalisable (couleur, forme, taille)
- [ ] Fichiers attachés
- [ ] Recherche full-text
- [ ] Filtres non-destructifs
- [ ] Vues sauvegardées
- [ ] Focus (voisinage)
- [ ] Insights (clusters, centralité, ponts, isolés, homonymes)
- [ ] Chemins entre deux éléments
- [ ] Vue timeline
- [ ] Vue cartographique
- [ ] Vue split
- [ ] Import/Export ZIP
- [ ] Import CSV
- [ ] Export images, JSON, CSV, GeoJSON
- [ ] Mode rapport
- [ ] Export PDF/Markdown

### Qualité

- [ ] Pas d'erreur console en usage normal
- [ ] Données persistent correctement
- [ ] Performance acceptable (200 éléments fluide)
- [ ] UI cohérente et utilisable
- [ ] Messages d'erreur explicites

---

*Guide d'implémentation — V1 — Janvier 2025*
