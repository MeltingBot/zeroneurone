# zeroneurone

## Concept V1 — Document de référence

---

## 1. Vision et philosophie

### 1.1 Ce que l'outil EST

Un **amplificateur cognitif** pour les analystes et enquêteurs.

L'outil est un **miroir de la pensée de l'analyste**. Il ne pense pas à la place de l'utilisateur. Il étend sa capacité à voir, organiser, et restituer.

C'est un **tableau blanc infini avec de la mémoire** :
- Comme un mur d'enquête physique avec des photos, des post-its, des fils rouges
- Qui se souvient de tout ce qu'on y met
- Qui permet de chercher dedans
- Qui montre des patterns invisibles à l'œil nu
- Qui se transporte et se partage

### 1.2 Ce que l'outil N'EST PAS

- **Pas un outil OSINT** — Pas de transforms automatiques, pas de collecte, pas de magie qui ramène 200 résultats non sollicités
- **Pas un Maltego** — Pas d'ontologie imposée, pas d'enrichissement en chaîne
- **Pas un outil qui décide** — L'utilisateur reste souverain sur ce qui entre, ce qui est lié, ce qui compte

### 1.3 Positionnement

| Outil | Approche | Problème |
|-------|----------|----------|
| Excalidraw | Liberté totale, zéro structure | Pas de métadonnées, pas d'analyse, pas de mémoire |
| Maltego / FlowsInt | Trop de structure, automatisation | Génère du bruit, l'outil décide à ta place |
| Anacrim | Bon équilibre conceptuel | Fermé, vieillissant, pas adapté OSINT moderne |
| **Cet outil** | Liberté + intelligence | Simplicité d'Excalidraw + profondeur d'Anacrim |

### 1.4 L'équation

```
Simplicité d'Excalidraw  +  Intelligence d'Anacrim  =  Cet outil
        (surface)                 (profondeur)
```

L'utilisateur voit un tableau blanc. L'outil voit un graphe.
L'utilisateur dessine. L'outil analyse.

### 1.5 Le mantra

**Facile. Fluide. Fidèle.**

Chaque feature, chaque choix UI, chaque interaction doit passer ce test :

| Critère | Question |
|---------|----------|
| **Facile** | Un utilisateur comprend-il en 2 minutes sans tutoriel ? |
| **Fluide** | Y a-t-il une friction entre l'intention et l'action ? |
| **Fidèle** | L'utilisateur peut-il représenter exactement sa pensée ? |

Si la réponse est non à l'une de ces questions, la feature est à revoir.

---

## 2. Principes fondamentaux

### 2.1 L'humain reste maître

- C'est l'utilisateur qui décide ce qui entre dans l'enquête
- C'est l'utilisateur qui décide ce qui est lié à quoi
- C'est l'utilisateur qui décide ce qui est pertinent
- L'outil ne suggère jamais de manière intrusive
- L'outil ne fait jamais d'action automatique non sollicitée

### 2.2 Le visuel EST l'analyse

- La disposition spatiale a du sens (l'utilisateur décide lequel)
- La position, la taille, la couleur, la forme, la proximité — tout VEUT dire quelque chose
- Le schéma construit reflète la compréhension de l'affaire par l'analyste

### 2.3 Les métadonnées enrichissent sans contraindre

- On peut taguer, dater, sourcer, noter un niveau de confiance
- Mais rien n'est obligatoire
- L'outil s'adapte à l'utilisateur, pas l'inverse

### 2.4 Les insights émergent du travail

- L'outil montre ce que l'utilisateur ne voit pas (centralité, ponts, clusters)
- Mais c'est une observation, pas une directive
- L'outil suggère, ne fait pas

### 2.5 Zéro ontologie imposée

- Pas de types d'entités en dur (Person, Vehicle, Account...)
- L'utilisateur crée ses propres concepts au fil de l'eau
- Ou n'en crée pas du tout — liberté totale

### 2.6 Le rapport est le livrable

- Le graphe n'est pas le livrable. Le rapport l'est.
- Le canvas est l'atelier, pas la vitrine
- L'outil doit permettre de passer du chaos visuel à un document structuré

### 2.7 100% local par défaut

- Stockage client-side (IndexedDB + OPFS)
- Fonctionne sans connexion
- Les données ne sortent jamais sans action explicite de l'utilisateur

---

## 3. Les trois espaces

L'outil s'organise autour de trois espaces conceptuels :

### 3.1 L'Atelier (le canvas)

Espace libre où l'analyste pose, relie, organise. C'est le miroir de sa pensée en cours. Bordélique ou structuré — c'est SON choix.

### 3.2 L'Analyse (la couche invisible)

L'outil observe silencieusement le graphe. Il calcule : clusters, centralités, ponts, chemins. Il ne dit rien sauf si on lui demande.

### 3.3 La Restitution (le rapport)

L'analyste construit un récit à partir de son travail. Sélection d'éléments, narration, export. Le livrable qui sera lu par d'autres.

---

## 4. L'Atelier — Spécifications détaillées

### 4.1 Le canvas infini

Surface blanche sans contrainte.

**Interactions de base :**
| Action | Résultat |
|--------|----------|
| Double-clic sur le canvas | Créer un élément (juste un nom, rien d'autre obligatoire) |
| Drag fichier depuis le bureau | Importer le fichier et créer un élément lié |
| Tirer d'un élément vers un autre | Créer un lien |
| Tirer d'un élément vers le vide | Créer un nouvel élément lié |
| Clic sur un élément | Ouvrir le panneau de détail |
| Clic sur un lien | Ouvrir le panneau de détail du lien |
| Ctrl+K | Recherche globale |
| Clic droit | Menu contextuel |

**Objectif :** En 30 secondes, quelqu'un sait s'en servir.

### 4.2 Les éléments

Un élément est un nœud sur le graphe. Il peut représenter n'importe quoi : une personne, une société, un lieu, un concept, un fait, un document...

**Propriétés d'un élément :**

| Propriété | Description | Obligatoire |
|-----------|-------------|-------------|
| `id` | Identifiant unique | Oui (auto) |
| `label` | Nom affiché | Oui |
| `notes` | Notes libres (texte) | Non |
| `tags` | Liste de tags | Non |
| `properties` | Propriétés clé/valeur libres | Non |
| `confidence` | Niveau de confiance (0-100) | Non |
| `source` | D'où vient l'info | Non |
| `dates` | Date(s) associée(s) (pour timeline) | Non |
| `position` | Coordonnées {x, y} sur le canvas | Oui (auto) |
| `geo` | Coordonnées GPS {lat, lng} | Non |
| `visual` | Apparence {color, shape, size, icon} | Non (défauts) |
| `assets` | Fichiers attachés | Non |
| `createdAt` | Date de création | Oui (auto) |
| `updatedAt` | Date de modification | Oui (auto) |

**Propriétés libres :**

L'utilisateur ajoute les propriétés dont il a besoin :
- "Immatriculation" pour un véhicule
- "SIREN" pour une société
- "Alias" pour une personne
- Ce qu'il veut

L'outil retient les propriétés fréquemment utilisées et les suggère (sans imposer).

### 4.3 Les liens

Un lien est une relation entre deux éléments. Les liens sont des **first-class citizens** : ils portent autant d'information que les nœuds.

**Propriétés d'un lien :**

| Propriété | Description | Obligatoire |
|-----------|-------------|-------------|
| `id` | Identifiant unique | Oui (auto) |
| `from` | ID élément source | Oui |
| `to` | ID élément cible | Oui |
| `label` | Label affiché sur le lien | Non |
| `directed` | Lien orienté ou non | Non (défaut: non) |
| `notes` | Notes libres | Non |
| `properties` | Propriétés clé/valeur libres | Non |
| `confidence` | Niveau de confiance | Non |
| `source` | D'où vient l'info | Non |
| `dates` | Date(s) de la relation | Non |
| `visual` | Apparence {color, style, thickness} | Non (défauts) |
| `createdAt` | Date de création | Oui (auto) |
| `updatedAt` | Date de modification | Oui (auto) |

**Liens multiples :**

Plusieurs liens peuvent exister entre deux mêmes éléments (relation pro + relation familiale par exemple).

### 4.4 Apparence visuelle

L'utilisateur contrôle l'apparence de chaque élément :

| Attribut | Options |
|----------|---------|
| Couleur | Fond, bordure (palette libre) |
| Forme | Rond, carré, losange, rectangle, ou libre |
| Taille | Petite, moyenne, grande, ou valeur custom |
| Icône | Bibliothèque d'icônes ou image custom |

**La signification est libre :**
- Rouge = suspect (pour l'un)
- Rouge = urgent (pour l'autre)
- L'outil ne sait pas ce que ça signifie. L'analyste si.

### 4.5 Disposition spatiale

La position sur le canvas EST une information.

- Proches = liés conceptuellement
- Éloignés = distincts
- En haut = hiérarchie supérieure ?
- À gauche = plus ancien ?

L'analyste organise selon SA logique. L'outil respecte et mémorise.

**Outils de disposition (sur demande) :**

L'utilisateur peut sélectionner un groupe et demander un réarrangement :
- Grille
- Cercle
- Hiérarchie (arbre)
- Force-directed (physique)

Ce n'est jamais automatique. Toujours sur demande, sur une sélection.

### 4.6 Fichiers attachés (Assets)

Tout fichier peut être attaché à un élément :
- Images (PNG, JPG, GIF, WebP)
- Documents (PDF, DOCX, ODT)
- Autres (tout type)

**Stockage :**
- Fichiers stockés en local (OPFS)
- Hash SHA-256 pour déduplication et intégrité
- Thumbnail généré pour les images et PDF (première page)

**Indexation :**
- Texte extrait des PDF (si possible côté client)
- OCR optionnel (si activé)
- Contenu indexé pour la recherche full-text

---

## 5. Outils de lisibilité

### 5.1 Filtres (non-destructifs)

Filtrer ne supprime pas, ça masque temporairement.

**Critères de filtre :**
- Tags (a le tag / n'a pas le tag)
- Propriétés (a la propriété / valeur contient...)
- Dates (créé entre... / modifié entre...)
- Confiance (>= seuil)
- Texte libre (label ou notes contient...)

**Comportement :**
- Les éléments filtrés s'estompent (grisés) ou disparaissent
- Les liens vers des éléments masqués s'estompent aussi
- Un indicateur montre qu'un filtre est actif
- Un clic pour réinitialiser

### 5.2 Focus

Explorer le voisinage d'un élément.

**Interaction :**
- Clic droit sur un élément → "Focus sur cet élément"
- Choisir la profondeur : 1, 2, ou 3 niveaux

**Comportement :**
- Seuls l'élément et ses voisins (à N niveaux) restent visibles
- Le reste s'estompe ou disparaît
- Un clic pour sortir du mode focus

### 5.3 Chemin entre deux éléments

**Interaction :**
- Sélectionner deux éléments
- Clic droit → "Montrer les chemins"

**Comportement :**
- L'outil calcule tous les chemins entre les deux éléments
- Les chemins sont surlignés
- Les autres éléments s'estompent

### 5.4 Recherche globale

Ctrl+K → Barre de recherche omniprésente

**Recherche dans :**
- Labels des éléments
- Notes
- Propriétés (clés et valeurs)
- Tags
- Labels des liens
- Contenu des fichiers (si indexé)

**Comportement :**
- Résultats en temps réel pendant la frappe
- Navigation clavier (flèches, Entrée)
- Entrée → centre la vue sur l'élément sélectionné

### 5.5 Vues sauvegardées

L'utilisateur peut sauvegarder une combinaison de :
- Filtres actifs
- Position du viewport (zoom, pan)
- Éléments sélectionnés

Comme une "photo" de l'état actuel qu'on peut rappeler instantanément.

**Exemples d'usage :**
- "Vue complète" — Tout visible
- "Flux financiers" — Que les comptes et transactions
- "Personnes clés" — Que les éléments tagués "clé"
- "Pour le rapport" — Les éléments à inclure dans le livrable

### 5.6 Groupes manuels

L'utilisateur peut regrouper plusieurs éléments en un seul nœud.

**Interaction :**
- Sélectionner plusieurs éléments
- Clic droit → "Créer un groupe"
- Donner un nom au groupe

**Comportement :**
- Les éléments sont remplacés par UN nœud avec un compteur
- Double-clic sur le groupe → déplie et montre les éléments
- Le groupe est un élément comme les autres (peut avoir des propriétés, des liens)

**Principe clé :** L'outil ne groupe JAMAIS automatiquement. C'est toujours l'utilisateur qui décide.

---

## 6. Vue cartographique

### 6.1 Principe

Les enquêtes ont une dimension spatiale. Les éléments avec coordonnées GPS peuvent être visualisés sur une carte.

### 6.2 Modes d'affichage

| Mode | Description |
|------|-------------|
| Canvas | Vue graphe classique (par défaut) |
| Carte | Vue cartographique seule |
| Split | Canvas et carte côte à côte, synchronisés |

### 6.3 Interactions

- Un élément avec coordonnées apparaît sur les deux vues
- Clic sur un marqueur carte → sélectionne l'élément sur le canvas
- Clic sur un élément canvas (avec coords) → centre la carte dessus
- La sélection est synchronisée entre les vues

### 6.4 Ajout de coordonnées

- Propriété `geo: {lat, lng}` sur l'élément
- Possibilité de cliquer sur la carte pour définir/modifier la position
- Geocoding optionnel (si propriété "adresse" renseignée)

### 6.5 Export cartographique

- Export GeoJSON des éléments géolocalisés
- Compatible avec outils externes (Rhinomap, QGIS, etc.)

---

## 7. Timeline

### 7.1 Principe

L'enquête c'est du temps. La chronologie révèle les causalités.

### 7.2 Données temporelles

Les éléments ET les liens peuvent avoir des dates :

| Champ | Type | Description |
|-------|------|-------------|
| `date` | Date unique | Événement ponctuel |
| `dateStart` | Date | Début d'une période |
| `dateEnd` | Date | Fin d'une période |

### 7.3 Vue Timeline

Représentation horizontale du temps avec :
- Axe temporel (zoomable : année / mois / semaine / jour)
- Éléments positionnés selon leurs dates
- Périodes représentées par des barres
- Événements ponctuels représentés par des marqueurs

### 7.4 Interactions

- Clic sur un événement → sélectionne l'élément sur le canvas
- Sélection d'une période sur la timeline → filtre le canvas
- Zoom temporel avec molette
- Pan avec drag

### 7.5 Ce que la timeline révèle

- Séquences (A puis B puis C)
- Concomitances (A et B en même temps → lien ?)
- Pics d'activité (beaucoup d'événements sur une période)
- Trous (périodes sans rien → suspect ?)

---

## 8. Insights et analyse

### 8.1 Principe

L'outil calcule en permanence mais n'affiche que sur demande. Les insights sont des **observations**, pas des directives.

### 8.2 Types d'insights

| Insight | Description | Utilité |
|---------|-------------|---------|
| **Clusters** | Groupes d'éléments fortement interconnectés | Identifier les communautés |
| **Centralité** | Éléments avec le plus de connexions | Qui est au cœur du réseau |
| **Ponts** | Éléments qui connectent des clusters sinon séparés | Souvent les plus intéressants |
| **Isolés** | Éléments sans liens | À creuser ou à supprimer |
| **Homonymes** | Noms identiques ou très proches | Confusion potentielle à lever |
| **Similaires** | Propriétés en commun | Fusion potentielle |
| **Chemins critiques** | Éléments dont la suppression coupe le graphe | Points de vulnérabilité du réseau |

### 8.3 Interface

Panneau latéral (masquable) :

```
┌─────────────────────────────────────┐
│ INSIGHTS                            │
├─────────────────────────────────────┤
│                                     │
│ Structure                           │
│ ├ 4 clusters détectés          [→]  │
│ ├ 2 ponts identifiés           [→]  │
│ └ 15 éléments isolés           [→]  │
│                                     │
│ Centralité                          │
│ ├ "Société X" : 23 connexions  [→]  │
│ ├ "Jean M." : 18 connexions    [→]  │
│ └ "Compte Y" : 12 connexions   [→]  │
│                                     │
│ Attention                           │
│ ├ 3 homonymes potentiels       [→]  │
│ └ 2 éléments très similaires   [→]  │
│                                     │
└─────────────────────────────────────┘
```

### 8.4 Interaction

- Clic sur une ligne → surligne les éléments concernés sur le canvas
- L'outil montre, l'utilisateur décide quoi en faire
- Aucune action automatique

---

## 9. Rapport et restitution

### 9.1 Principe

Le graphe n'est pas le livrable. Le rapport l'est. L'outil doit permettre de construire un récit à partir du travail d'analyse.

### 9.2 Mode rapport

Interface dédiée à la construction du livrable :

```
┌─────────────────────────┬───────────────────────────────────────┐
│                         │                                       │
│   STRUCTURE             │           APERÇU                      │
│                         │                                       │
│   1. Introduction       │   # Titre de l'enquête               │
│   2. Acteurs clés       │                                       │
│   3. Flux financiers    │   ## Section 1                        │
│   4. Chronologie        │                                       │
│   5. Conclusions        │   Contenu rédigé...                   │
│                         │                                       │
│   [+ Section]           │   [Graphe inséré]                     │
│                         │                                       │
└─────────────────────────┴───────────────────────────────────────┘
```

### 9.3 Workflow de création

1. Créer une section dans le rapport
2. Retourner sur le canvas
3. Sélectionner les éléments pertinents
4. "Ajouter à la section X"
5. L'outil génère un sous-graphe + liste les éléments
6. Rédiger l'analyse autour

### 9.4 Contenu d'une section

- Texte libre (rédigé par l'utilisateur)
- Graphe illustratif (capture d'une vue du canvas)
- Liste des éléments cités avec leurs propriétés
- Fichiers annexes

### 9.5 Annotations duales

Distinction entre :
- **Notes de travail** — Pour l'analyste, pas dans le rapport
- **Notes de rapport** — Apparaissent dans le livrable

### 9.6 Export (V1)

| Format | Usage |
|--------|-------|
| PDF | Impression, archivage |
| Markdown | Édition ultérieure, intégration |
| PNG/SVG | Graphes seuls pour insertion ailleurs |

---

## 10. Import / Export

### 10.1 Import de fichiers

**Fichiers supportés :**
- Images : PNG, JPG, GIF, WebP, SVG
- Documents : PDF, DOCX, ODT, TXT, MD
- Données : CSV, JSON

**Comportement :**
- Drag & drop sur le canvas → crée un élément avec le fichier attaché
- Drag & drop multiple → crée plusieurs éléments

### 10.2 Import CSV assisté

Pour les imports en masse (listes de personnes, sociétés, etc.) :

1. L'utilisateur drop un CSV
2. L'outil affiche un aperçu avec les colonnes détectées
3. L'utilisateur mappe les colonnes :
   - Quelle colonne = label de l'élément
   - Quelles colonnes = propriétés
4. L'utilisateur valide
5. Les éléments sont créés

**Principe :** L'utilisateur valide le mapping. Il garde le contrôle.

### 10.3 Export enquête complète

Format ZIP contenant :

```
enquete-2025-01-16.zip
├── manifest.json          # Métadonnées enquête, version format
├── elements.json          # Tous les éléments
├── links.json             # Tous les liens
├── views.json             # Vues sauvegardées
├── report.json            # Structure du rapport (si présent)
└── assets/
    ├── abc123.pdf
    ├── def456.jpg
    └── ...
```

### 10.4 Autres exports

| Format | Contenu | Usage |
|--------|---------|-------|
| PNG | Image du canvas actuel | Illustration simple |
| SVG | Image vectorielle du canvas | Impression haute qualité |
| JSON | Données structurées (éléments + liens) | Interopérabilité |
| CSV | Liste plate des éléments | Tableur |
| GeoJSON | Éléments géolocalisés | Outils carto |

---

## 11. Stockage et architecture locale

### 11.1 Principe

100% local. Les données ne sortent jamais sans action explicite.

### 11.2 Technologies

| Données | Stockage |
|---------|----------|
| Métadonnées (éléments, liens, vues...) | IndexedDB |
| Fichiers binaires (assets) | OPFS (Origin Private File System) |
| Index de recherche | IndexedDB (index inversé) |

### 11.3 Structure IndexedDB

```
Database: investigation-tool
├── Store: investigations
│   └── {id, name, description, createdAt, updatedAt, settings}
├── Store: elements
│   └── {id, investigationId, label, notes, tags, properties, ...}
├── Store: links
│   └── {id, investigationId, from, to, label, ...}
├── Store: views
│   └── {id, investigationId, name, filters, viewport}
├── Store: assets
│   └── {id, investigationId, filename, mimeType, hash, opfsPath}
└── Store: searchIndex
    └── Index inversé pour full-text search
```

### 11.4 OPFS

Les fichiers sont stockés dans le système de fichiers privé du navigateur :

```
/investigations/{investigationId}/assets/{hash}.{ext}
```

Le hash SHA-256 permet :
- Déduplication (même fichier = un seul stockage)
- Vérification d'intégrité

---

## 12. Enrichissement externe (optionnel)

### 12.1 Principe

- Pas d'enrichissement automatique
- Enrichissement à la demande, contrôlé
- Un appel = une réponse
- L'utilisateur décide quoi garder

### 12.2 Interaction

Clic droit sur un élément → "Enrichir" → Choix de la source

```
┌─────────────────────────────────────┐
│ Enrichir "example.com"              │
├─────────────────────────────────────┤
│ ○ WHOIS                             │
│ ○ DNS records                       │
│ ○ Certificat SSL                    │
│ ○ Archive.org                       │
├─────────────────────────────────────┤
│ [Sources configurées...]            │
└─────────────────────────────────────┘
```

### 12.3 Résultat

Le résultat est affiché. L'utilisateur choisit :
- Ajouter comme propriétés de l'élément
- Créer un nouvel élément lié
- Ignorer

### 12.4 Types d'enrichisseurs (V2+)

| Type | Exemples |
|------|----------|
| Intégrés (gratuits) | WHOIS, DNS, Archive.org |
| Avec clé API | Shodan, VirusTotal, Hunter.io |
| Custom | Webhook REST défini par l'utilisateur |

**Note :** Cette feature est prévue pour V2, pas V1.

---

## 13. IA optionnelle (V2+)

### 13.1 Position

- Absente par défaut
- Activable si l'utilisateur le veut
- Connectable à son propre backend (Ollama local, API externe)
- Jamais intrusive, jamais automatique

### 13.2 Usages potentiels

- Résumer les notes d'un élément
- Aider à rédiger une section du rapport
- Extraire des entités d'un texte (NER)
- OCR intelligent

### 13.3 Principe

L'IA est un **outil**, pas un partenaire. L'utilisateur déclenche, l'utilisateur contrôle.

**Note :** Cette feature est prévue pour V2, pas V1.

---

## 14. Collaboration temps réel (V2+)

### 14.1 Principe

Plusieurs analystes sur la même enquête, en même temps, sans se marcher dessus.

### 14.2 Contraintes

- Sécurisé : données chiffrées, pas de serveur central non maîtrisé
- Temps réel : je vois ce que mon collègue fait
- Conflits gérés : éditions concurrentes fusionnées

### 14.3 Architecture envisagée

- WebRTC pour la communication P2P
- Yjs (CRDT) pour la synchronisation sans conflit
- Signaling server minimal (juste pour établir la connexion)
- Chiffrement E2E

### 14.4 Interface

- Curseurs visibles des autres participants
- Indicateur "X édite cet élément"
- Liste des participants avec statut

### 14.5 Gestion des conflits

CRDT = pas de conflits réels. Les modifications se fusionnent automatiquement.

Suppression = corbeille avec délai (récupérable).

**Note :** Cette feature est prévue pour V2, pas V1.

---

## 15. Scénarios d'usage validés

### 15.1 Analyste OSINT pour un journaliste

- Point de départ : un nom, quelques infos
- Collecte externe (LinkedIn, Societe.com, presse...)
- Import progressif des éléments trouvés
- Construction du réseau relationnel
- Utilisation des insights pour découvrir des patterns
- Production d'un rapport pour le journaliste

**Besoins clés :** Import fichiers, création fluide, tags/couleurs, filtres, focus, insights, rapport.

### 15.2 Enquêteur privé — Corruption et crypto

- Point de départ : nom d'un suspect, relevés bancaires, wallets
- Structuration des flux financiers
- Disposition spatiale = chronologie des flux
- Liens labellisés (montants, dates)
- Identification des tiers via les patterns
- Rapport factuel avec distinction faits/hypothèses

**Besoins clés :** Éléments hétérogènes, métadonnées sur liens, disposition signifiante, chemins, rapport sourcé.

### 15.3 Gendarme — Trafic de véhicules

- Point de départ : plaintes, suspects, véhicules, lieux
- Croisement des témoignages
- Gestion des homonymes
- Vue cartographique pour patterns géographiques
- Export pour la procédure

**Besoins clés :** Propriétés structurées, confiance sur liens, détection homonymes, vue carte, export structuré.

---

## 16. Points de friction identifiés et solutions

### 16.1 Import massif

**Problème :** 50 fichiers d'un coup, comment ça entre ?

**Solution :** Import assisté avec preview. L'utilisateur valide le mapping, garde le contrôle.

### 16.2 Canvas qui déborde

**Problème :** À 100+ éléments, où poser les nouveaux ?

**Solution :**
- Nouvel élément → apparaît près de la sélection actuelle
- Import massif → zone "Inbox" temporaire
- Réarrangement sur demande (pas automatique)

### 16.3 Liens qui se croisent

**Problème :** Beaucoup de liens = spaghetti

**Solution :**
- Liens courbes par défaut
- Focus → liens de l'élément mis en avant, autres estompés
- Agrégation visuelle optionnelle si >5 liens entre deux groupes

### 16.4 Retrouver un élément

**Problème :** 150 éléments, je cherche celui avec le SIREN qui commence par 823...

**Solution :** Ctrl+K omniprésent, recherche full-text instantanée, navigation clavier.

### 16.5 Export pour la procédure

**Problème :** Le gendarme a besoin d'un format spécifique

**Solution :** Export guidé selon l'usage (impression, backup, interop, rapport).

### 16.6 Courbe d'apprentissage

**Problème :** L'outil est puissant, ça peut faire peur

**Solution :**
- Interface progressive (features avancées se découvrent en contexte)
- Premier lancement : UN hint ("Double-cliquez pour créer")
- Raccourcis affichés dans les menus

---

## 17. Arbitrages tranchés

### 17.1 Fidélité vs. Lisibilité

**Décision :** L'outil ne juge pas. Il offre des moyens de lisibilité (filtres, focus, groupes) mais n'impose jamais. Si l'utilisateur veut le chaos, il a le droit.

### 17.2 Offline-first vs. Features avancées

**Décision :** Offline-first non négociable. Les features avancées (OCR, parsing complexe) sont soit dégradées côté client, soit optionnelles via service externe.

### 17.3 Généraliste vs. Métier

**Décision :** Généraliste dans le moteur, orienté enquête dans l'interface.
- Le moteur est agnostique
- L'interface parle "enquête" (pas "nodes/edges" mais "éléments/liens")

### 17.4 Regroupement automatique

**Décision :** Jamais. L'outil propose (insights), l'utilisateur dispose. Le regroupement est toujours manuel.

### 17.5 Suggestions IA

**Décision :** Jamais par défaut. L'IA est optionnelle, externe, déclenchée explicitement.

---

## 18. Scope V1

### 18.1 Ce qui est DANS V1

| Feature | Inclus |
|---------|--------|
| Canvas libre (création, liens, déplacement) | ✓ |
| Métadonnées libres sur éléments et liens | ✓ |
| Import fichiers (images, PDF, docs) | ✓ |
| Import CSV assisté | ✓ |
| Tags, couleurs, formes | ✓ |
| Recherche full-text | ✓ |
| Filtres non-destructifs | ✓ |
| Focus (voisinage N niveaux) | ✓ |
| Chemin entre deux éléments | ✓ |
| Vues sauvegardées | ✓ |
| Groupes manuels | ✓ |
| Insights (clusters, centralité, ponts, isolés, homonymes) | ✓ |
| Timeline | ✓ |
| Vue cartographique | ✓ |
| Synchronisation canvas/carte/timeline | ✓ |
| Export ZIP (JSON + assets) | ✓ |
| Export images (PNG, SVG) | ✓ |
| Export données (JSON, CSV, GeoJSON) | ✓ |
| Mode rapport basique | ✓ |
| Export rapport PDF/Markdown | ✓ |
| 100% local (IndexedDB + OPFS) | ✓ |

### 18.2 Ce qui est HORS V1 (V2+)

| Feature | Version |
|---------|---------|
| Collaboration temps réel | V2 |
| Enrichisseurs externes | V2 |
| IA optionnelle | V2 |
| Mode rapport avancé (DOCX, templates) | V2 |
| Interopérabilité avancée (Rhinomap, etc.) | V2 |
| OCR intégré | V2 |
| Mode mesh (ESP32) | V2+ |

---

## 19. Résumé exécutif

### L'outil en une phrase

Un tableau blanc infini pour enquêteurs, qui comprend ce que vous dessinez et vous aide à voir ce que vous ne voyez pas.

### Les 3 F

- **Facile** — Utilisable en 2 minutes sans formation
- **Fluide** — Zéro friction entre la pensée et sa représentation
- **Fidèle** — Représente exactement ce que l'analyste a en tête

### Les 3 vues

- **Canvas** — Les relations (qui est lié à qui)
- **Carte** — L'espace (où ça se passe)
- **Timeline** — Le temps (quand ça se passe)

### La promesse

L'analyste reste souverain. L'outil amplifie, ne remplace pas. Les données restent locales. Le rapport est le livrable.

---

*Document de référence — V1 — Janvier 2025*
