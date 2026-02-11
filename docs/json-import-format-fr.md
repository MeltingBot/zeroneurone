# Format JSON d'import Zeroneurone

Reference complete du format JSON natif d'import de Zeroneurone.

## Vue d'ensemble

Zeroneurone peut importer des donnees d'investigation depuis un fichier JSON (autonome ou dans une archive ZIP). Le format natif est auto-detecte par la presence des trois champs obligatoires de premier niveau : `version`, `elements` et `links`.

Lors de l'import, **tous les IDs sont regeneres** en nouveaux UUIDs. Les references internes (element vers element, lien vers element, onglets, rapports) sont automatiquement remappees. Les horodatages (`createdAt`, `updatedAt`) sont toujours ecrases par la date courante.

---

## Structure de premier niveau

```json
{
  "version": "1.1.0",
  "exportedAt": "2026-02-11T10:00:00.000Z",
  "investigation": { ... },
  "elements": [ ... ],
  "links": [ ... ],
  "tabs": [ ... ],
  "report": { ... },
  "assets": [ ... ]
}
```

| Champ | Obligatoire | Type | Description |
|-------|-------------|------|-------------|
| `version` | **Oui** | `string` | Version du format (ex. `"1.1.0"`). Doit etre truthy. |
| `exportedAt` | Non | `string` | Horodatage ISO 8601. Informatif uniquement, non valide. |
| `investigation` | Non | `object` | Metadonnees de l'investigation. Inclus dans les exports pour reference mais **non utilise** lors de l'import JSON natif. |
| `elements` | **Oui** | `Element[]` | Tableau d'objets element. Peut etre vide. |
| `links` | **Oui** | `Link[]` | Tableau d'objets lien. Peut etre vide. |
| `tabs` | Non | `CanvasTab[]` | Definitions des onglets canvas. Importes uniquement pour les nouvelles investigations (pas les fusions). |
| `report` | Non | `Report` | Rapport avec sections. Ignore si un rapport existe deja pour l'investigation cible. |
| `assets` | Non | `ExportedAssetMeta[]` | Metadonnees des fichiers joints. Utile uniquement dans les imports ZIP ; ignore en JSON autonome. |

Si `version`, `elements` ou `links` est absent, l'import echoue avec : `"Format JSON invalide: champs manquants"`.

---

## Objet Element

Chaque element represente un noeud sur le canvas (personne, entreprise, lieu, concept, document, etc.).

```json
{
  "id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  "investigationId": "00000000-0000-0000-0000-000000000001",
  "label": "Jean Dupont",
  "notes": "Notes en texte libre",
  "tags": ["personne", "suspect"],
  "properties": [
    { "key": "email", "value": "jean@exemple.fr", "type": "text" }
  ],
  "confidence": 80,
  "source": "Sources ouvertes",
  "date": "2025-06-15T00:00:00.000Z",
  "dateRange": {
    "start": "2025-01-01T00:00:00.000Z",
    "end": "2025-12-31T00:00:00.000Z"
  },
  "position": { "x": 100, "y": 200 },
  "isPositionLocked": false,
  "geo": { "lat": 48.8566, "lng": 2.3522 },
  "events": [],
  "visual": {
    "color": "#fcd34d",
    "borderColor": "#a8a29e",
    "borderWidth": 2,
    "borderStyle": "solid",
    "shape": "circle",
    "size": "medium",
    "icon": null,
    "image": null,
    "fontSize": "md"
  },
  "assetIds": [],
  "parentGroupId": null,
  "isGroup": false,
  "isAnnotation": false,
  "childIds": [],
  "createdAt": "2025-06-01T00:00:00.000Z",
  "updatedAt": "2025-06-10T00:00:00.000Z"
}
```

### Reference des champs Element

| Champ | Type | Obligatoire | Defaut | Description |
|-------|------|-------------|--------|-------------|
| `id` | `string` (UUID v4) | **Oui** | Remappe | ID original utilise pour les references croisees ; remplace par un nouvel UUID a l'import. |
| `investigationId` | `string` (UUID v4) | Non | Ecrase | Toujours defini sur l'ID de l'investigation cible. |
| `label` | `string` | Recommande | `""` | Nom affiche sur le canvas. |
| `notes` | `string` | Non | `""` | Notes en texte libre (supporte le Markdown). |
| `tags` | `string[]` | Non | `[]` | Tags definis par l'utilisateur pour le filtrage et la categorisation. |
| `properties` | `Property[]` | Non | `[]` | Paires cle/valeur typees. Voir [Property](#property). |
| `confidence` | `number \| null` | Non | `null` | Niveau de confiance. Multiple de 10 de 0 a 100, ou `null`. |
| `source` | `string` | Non | `""` | Attribution de la source. |
| `date` | `string \| null` | Non | `null` | Date ISO 8601 pour le positionnement sur la timeline. |
| `dateRange` | `DateRange \| null` | Non | `null` | Plage de dates avec champs `start` et `end`. Voir [DateRange](#daterange). |
| `position` | `Position` | Recommande | `{x: 0, y: 0}` | Coordonnees canvas `{x, y}`. |
| `isPositionLocked` | `boolean` | Non | `false` | Si `true`, l'element ne peut pas etre deplace sur le canvas. |
| `geo` | `GeoCoordinates \| null` | Non | `null` | Coordonnees geographiques pour la vue carte. Voir [GeoCoordinates](#geocoordinates). |
| `events` | `ElementEvent[]` | Non | `[]` | Occurrences temporelles rattachees a cet element. Voir [ElementEvent](#elementevent). |
| `visual` | `ElementVisual` | Non | Depuis le JSON | Parametres d'apparence. Voir [ElementVisual](#elementvisual). |
| `assetIds` | `string[]` | Non | `[]` | References aux fichiers joints. Les assets non importes sont silencieusement supprimes. |
| `parentGroupId` | `string \| null` | Non | Remappe ou `null` | ID de l'element groupe parent. Remappe a l'import. |
| `isGroup` | `boolean` | Non | `false` | Si cet element est un conteneur de groupe. |
| `isAnnotation` | `boolean` | Non | `false` | Si c'est une annotation (texte/fleche sur le canvas). |
| `childIds` | `string[]` | Non | `[]` | IDs des elements enfants (pour les groupes). Remappes a l'import. |
| `createdAt` | `string` | Ecrase | `new Date()` | Toujours remplace par l'horodatage d'import. |
| `updatedAt` | `string` | Ecrase | `new Date()` | Toujours remplace par l'horodatage d'import. |

---

## Objet Lien (Link)

Chaque lien represente une relation entre deux elements (une arete dans le graphe).

```json
{
  "id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  "investigationId": "00000000-0000-0000-0000-000000000001",
  "fromId": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  "toId": "cccccccc-cccc-cccc-cccc-cccccccccccc",
  "sourceHandle": null,
  "targetHandle": null,
  "label": "connait",
  "notes": "",
  "tags": [],
  "properties": [],
  "directed": true,
  "direction": "forward",
  "confidence": 70,
  "source": "",
  "date": null,
  "dateRange": null,
  "visual": {
    "color": "#9ca3af",
    "style": "solid",
    "thickness": 2,
    "fontSize": "sm"
  },
  "curveOffset": { "x": 0, "y": 0 },
  "createdAt": "2025-06-01T00:00:00.000Z",
  "updatedAt": "2025-06-01T00:00:00.000Z"
}
```

### Reference des champs Lien

| Champ | Type | Obligatoire | Defaut | Description |
|-------|------|-------------|--------|-------------|
| `id` | `string` (UUID v4) | **Oui** | Remappe | Remplace par un nouvel UUID a l'import. |
| `investigationId` | `string` (UUID v4) | Non | Ecrase | Toujours defini sur l'ID de l'investigation cible. |
| `fromId` | `string` (UUID v4) | **Oui** | Remappe | ID de l'element source. Doit referencer un element dans l'import. **Les liens referencant des elements absents sont ignores.** |
| `toId` | `string` (UUID v4) | **Oui** | Remappe | ID de l'element cible. Doit referencer un element dans l'import. **Les liens referencant des elements absents sont ignores.** |
| `sourceHandle` | `string \| null` | Non | `null` | Identifiant du handle source React Flow. |
| `targetHandle` | `string \| null` | Non | `null` | Identifiant du handle cible React Flow. |
| `label` | `string` | Non | `""` | Libelle affiche pour la relation. |
| `notes` | `string` | Non | `""` | Notes en texte libre. |
| `tags` | `string[]` | Non | `[]` | Tags definis par l'utilisateur. |
| `properties` | `Property[]` | Non | `[]` | Paires cle/valeur typees. |
| `directed` | `boolean` | Non | `false` | **Deprecie.** Utilise comme fallback quand `direction` est absent. |
| `direction` | `string` | Non | Infere | `"none"`, `"forward"`, `"backward"` ou `"both"`. Si absent, infere depuis `directed` : `true` -> `"forward"`, sinon `"none"`. |
| `confidence` | `number \| null` | Non | `null` | Niveau de confiance (0-100, multiples de 10). |
| `source` | `string` | Non | `""` | Attribution de la source. |
| `date` | `string \| null` | Non | `null` | Date ISO 8601. |
| `dateRange` | `DateRange \| null` | Non | `null` | Plage de dates avec `start` et `end`. |
| `visual` | `LinkVisual` | Non | Depuis le JSON | Parametres d'apparence. Voir [LinkVisual](#linkvisual). |
| `curveOffset` | `{x, y}` | Non | `{x: 0, y: 0}` | Decalage du point de controle de la courbe. |
| `createdAt` | `string` | Ecrase | `new Date()` | Toujours remplace par l'horodatage d'import. |
| `updatedAt` | `string` | Ecrase | `new Date()` | Toujours remplace par l'horodatage d'import. |

**Important** : Les liens dont `fromId` ou `toId` ne correspondent a aucun element importe sont **silencieusement ignores** avec un avertissement dans les logs.

---

## Objet Onglet Canvas (CanvasTab)

Les onglets canvas organisent les elements en vues separees au sein de la meme investigation.

```json
{
  "id": "dddddddd-dddd-dddd-dddd-dddddddddddd",
  "investigationId": "00000000-0000-0000-0000-000000000001",
  "name": "Vue principale",
  "order": 0,
  "memberElementIds": ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"],
  "excludedElementIds": [],
  "createdAt": "2025-06-01T00:00:00.000Z",
  "updatedAt": "2025-06-01T00:00:00.000Z"
}
```

### Reference des champs Onglet

| Champ | Type | Obligatoire | Defaut | Description |
|-------|------|-------------|--------|-------------|
| `id` | `string` (UUID v4) | **Oui** | Remappe | Remplace par un nouvel UUID. |
| `investigationId` | `string` (UUID v4) | Non | Ecrase | Defini sur l'ID de l'investigation cible. |
| `name` | `string` | Non | `""` | Nom affiche de l'onglet. |
| `order` | `number` | Non | `0` | Ordre d'affichage (base 0). |
| `memberElementIds` | `string[]` | Non | `[]` | IDs des elements appartenant a cet onglet. Remappes ; les elements manquants sont supprimes. |
| `excludedElementIds` | `string[]` | Non | `[]` | IDs des elements exclus (elements fantomes rejetes par l'utilisateur). Remappes. |
| `createdAt` | `string` | Ecrase | `new Date()` | Toujours remplace. |
| `updatedAt` | `string` | Ecrase | `new Date()` | Toujours remplace. |

**Notes** :
- Les onglets ne sont **importes que pour les nouvelles investigations**. Lors d'une fusion dans une investigation existante (avec decalage de position), les onglets sont ignores et les elements importes rejoignent l'onglet actif.
- Le champ `viewport` (s'il est present) est toujours **reinitialise** a `{x: 0, y: 0, zoom: 1}`.

---

## Objet Rapport (Report)

Les rapports sont des documents structures avec des sections pouvant referencer des elements.

```json
{
  "id": "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
  "investigationId": "00000000-0000-0000-0000-000000000001",
  "title": "Rapport d'investigation",
  "sections": [
    {
      "id": "ffffffff-ffff-ffff-ffff-ffffffffffff",
      "title": "Introduction",
      "order": 0,
      "content": "Ce rapport couvre [[Personne A|aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa]].",
      "elementIds": ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"],
      "graphSnapshot": null
    }
  ],
  "createdAt": "2025-06-01T00:00:00.000Z",
  "updatedAt": "2025-06-01T00:00:00.000Z"
}
```

### Reference des champs Rapport

| Champ | Type | Obligatoire | Defaut | Description |
|-------|------|-------------|--------|-------------|
| `id` | `string` (UUID v4) | **Oui** | Remappe | Remplace par un nouvel UUID. |
| `investigationId` | `string` (UUID v4) | Non | Ecrase | Defini sur l'ID de l'investigation cible. |
| `title` | `string` | Non | `"Rapport importe"` | Titre du rapport. |
| `sections` | `ReportSection[]` | **Oui** | - | Doit contenir au moins une section pour que le rapport soit importe. |
| `createdAt` | `string` | Ecrase | `new Date()` | Toujours remplace. |
| `updatedAt` | `string` | Ecrase | `new Date()` | Toujours remplace. |

### Champs ReportSection

| Champ | Type | Obligatoire | Defaut | Description |
|-------|------|-------------|--------|-------------|
| `id` | `string` (UUID v4) | **Oui** | Remappe | Remplace par un nouvel UUID. |
| `title` | `string` | Non | `""` | Titre de la section. |
| `order` | `number` | Non | Index du tableau | Ordre d'affichage. |
| `content` | `string` | Non | `""` | Contenu Markdown. Les references elements/liens utilisent la syntaxe `[[Label\|UUID]]` ; les UUIDs sont automatiquement remappes. |
| `elementIds` | `string[]` | Non | `[]` | IDs des elements references. Remappes a l'import. |
| `graphSnapshot` | `GraphSnapshot \| null` | Non | `null` | Capture du canvas avec `imageDataUrl`, `viewport` et `capturedAt`. |

**Notes** :
- Si un rapport existe deja pour l'investigation cible, le rapport importe est **ignore**.
- La syntaxe `[[Label|UUID]]` dans le contenu est automatiquement remappee vers les nouveaux UUIDs.

---

## Types de sous-objets

### Property

Paire cle/valeur typee pour les metadonnees.

```json
{ "key": "email", "value": "jean@exemple.fr", "type": "text" }
```

| Champ | Type | Obligatoire | Description |
|-------|------|-------------|-------------|
| `key` | `string` | **Oui** | Nom de la propriete. |
| `value` | `string \| number \| boolean \| Date \| null` | **Oui** | Valeur de la propriete. |
| `type` | `string` | Non | Un parmi : `"text"`, `"number"`, `"date"`, `"datetime"`, `"boolean"`, `"choice"`, `"geo"`, `"country"`, `"link"`. `"text"` par defaut si omis. |

### Position

```json
{ "x": 100, "y": 200 }
```

Coordonnees canvas en pixels. L'origine `{0, 0}` est le centre du canvas.

### GeoCoordinates

```json
{ "lat": 48.8566, "lng": 2.3522 }
```

Coordonnees WGS84 pour l'affichage sur la vue carte.

### DateRange

```json
{
  "start": "2025-01-01T00:00:00.000Z",
  "end": "2025-12-31T00:00:00.000Z"
}
```

`start` et `end` sont individuellement optionnels (peuvent etre `null`). Les dates sont des chaines ISO 8601.

### ElementEvent

Occurrence temporelle rattachee a un element.

```json
{
  "id": "evt-001",
  "date": "2025-03-15T00:00:00.000Z",
  "dateEnd": "2025-03-16T00:00:00.000Z",
  "label": "Reunion a Paris",
  "description": "Observe sur place",
  "geo": { "lat": 48.8566, "lng": 2.3522 },
  "properties": [],
  "source": "Surveillance"
}
```

| Champ | Type | Obligatoire | Description |
|-------|------|-------------|-------------|
| `id` | `string` | **Oui** | Identifiant unique. |
| `date` | `string` | **Oui** | Date ISO 8601 de l'evenement. |
| `dateEnd` | `string` | Non | Date de fin pour les evenements avec duree. |
| `label` | `string` | **Oui** | Libelle de l'evenement. |
| `description` | `string` | Non | Description de l'evenement. |
| `geo` | `GeoCoordinates` | Non | Localisation de l'evenement. |
| `properties` | `Property[]` | Non | Metadonnees typees supplementaires. |
| `source` | `string` | Non | Source de l'information. |

### ElementVisual

Controle l'apparence d'un element sur le canvas.

```json
{
  "color": "#fcd34d",
  "borderColor": "#a8a29e",
  "borderWidth": 2,
  "borderStyle": "solid",
  "shape": "circle",
  "size": "medium",
  "icon": null,
  "image": null,
  "fontSize": "md",
  "customWidth": 120,
  "customHeight": 80
}
```

| Champ | Type | Defaut | Valeurs autorisees |
|-------|------|--------|-------------------|
| `color` | `string` | `"#f5f5f4"` | Toute couleur CSS |
| `borderColor` | `string` | `"#a8a29e"` | Toute couleur CSS |
| `borderWidth` | `number` | `2` | Pixels |
| `borderStyle` | `string` | `"solid"` | `"solid"`, `"dashed"`, `"dotted"` |
| `shape` | `string` | `"circle"` | `"circle"`, `"square"`, `"diamond"`, `"rectangle"` |
| `size` | `string \| number` | `"medium"` | `"small"`, `"medium"`, `"large"`, ou un nombre (pixels) |
| `icon` | `string \| null` | `null` | Nom d'icone Lucide (ex. `"user"`, `"building"`, `"map-pin"`) |
| `image` | `string \| null` | `null` | ID d'asset utilise comme image d'affichage |
| `fontSize` | `string` | - | `"xs"`, `"sm"`, `"md"`, `"lg"`, `"xl"` |
| `customWidth` | `number` | - | Largeur personnalisee en pixels |
| `customHeight` | `number` | - | Hauteur personnalisee en pixels |

### LinkVisual

Controle l'apparence d'un lien sur le canvas.

```json
{
  "color": "#9ca3af",
  "style": "solid",
  "thickness": 2,
  "fontSize": "sm"
}
```

| Champ | Type | Defaut | Valeurs autorisees |
|-------|------|--------|-------------------|
| `color` | `string` | `"var(--color-text-tertiary)"` | Toute couleur CSS |
| `style` | `string` | `"solid"` | `"solid"`, `"dashed"`, `"dotted"` |
| `thickness` | `number` | `2` | Epaisseur du trait en pixels |
| `fontSize` | `string` | - | `"xs"`, `"sm"`, `"md"`, `"lg"`, `"xl"` |

### Confidence

```
type Confidence = 0 | 10 | 20 | 30 | 40 | 50 | 60 | 70 | 80 | 90 | 100
```

Doit etre un multiple de 10 de 0 a 100, ou `null`.

### Direction du lien (LinkDirection)

```
type LinkDirection = "none" | "forward" | "backward" | "both"
```

- `"none"` : lien non dirige (pas de fleches)
- `"forward"` : fleche de la source vers la cible
- `"backward"` : fleche de la cible vers la source
- `"both"` : fleches dans les deux sens

---

## Comportement de l'import

### Remappage des IDs

Tous les IDs (`id`, `investigationId`, IDs d'assets, IDs d'onglets, IDs de rapport/sections) sont regeneres en nouveaux UUID v4. Un mapping interne (ancien ID -> nouvel ID) est maintenu pour remapper :
- `fromId` / `toId` dans les liens
- `parentGroupId` / `childIds` dans les elements
- `assetIds` dans les elements
- `memberElementIds` / `excludedElementIds` dans les onglets
- `elementIds` et les references `[[Label|UUID]]` dans les sections de rapport

### Gestion des dates

- Tous les champs de date sont attendus en chaines ISO 8601 (ex. `"2025-06-15T00:00:00.000Z"`).
- Parses avec `new Date()`.
- `createdAt` et `updatedAt` sur les elements, liens, onglets et rapports sont **toujours ecrases** par l'horodatage courant.

### Fusion vs Nouvelle investigation

- **Nouvelle investigation** : toutes les donnees sont importees, y compris les onglets.
- **Fusion** (import dans une investigation existante avec un decalage de position) :
  - Les onglets ne sont **pas importes** ; les elements rejoignent l'onglet actif.
  - Un decalage de position `{x, y}` est applique uniquement aux elements de premier niveau (pas aux enfants de groupes).

### References orphelines

- Les liens referencant des elements absents de l'import sont **silencieusement ignores**.
- Les IDs d'assets referencant des assets non importes sont **silencieusement supprimes**.
- Les references enfant/parent vers des elements manquants sont mises a `null` ou filtrees.

### Parametres post-import

Quand des liens sont importes, les parametres d'affichage de l'investigation sont automatiquement definis sur :
- `linkAnchorMode: "auto"`
- `linkCurveMode: "curved"`

---

## Limites de taille (imports ZIP)

| Limite | Valeur |
|--------|--------|
| Elements maximum | 50 000 |
| Liens maximum | 100 000 |
| Assets maximum | 5 000 |
| Taille JSON maximum | 50 Mo |
| Taille ZIP maximum | 500 Mo |
| Taille decompressee maximum | 2 Go |
| Fichiers dans le ZIP maximum | 10 000 |
| Fichier individuel maximum | 100 Mo |
| Ratio de compression maximum | 100x |

---

## Types MIME autorises pour les assets

Les assets ne sont importes que depuis des fichiers ZIP. Les imports JSON autonomes ignorent les metadonnees d'assets.

| Categorie | Types |
|-----------|-------|
| Images | jpeg, png, gif, webp, svg+xml, bmp, tiff, x-icon |
| Documents | pdf, msword, docx, xls, xlsx, ppt, pptx, odt, ods, odp |
| Texte | plain, csv, html, markdown, xml, json |
| Archives | zip |
| Audio | mpeg, mp3, wav, ogg, webm, aac, flac |
| Video | mp4, webm, ogg, quicktime, x-msvideo |

---

## Exemple minimal fonctionnel

Le plus petit JSON valide importable :

```json
{
  "version": "1.0.0",
  "elements": [],
  "links": []
}
```

Cela cree une investigation vide.

## Exemple avec deux elements lies

```json
{
  "version": "1.1.0",
  "elements": [
    {
      "id": "elem-001",
      "label": "Alice",
      "position": { "x": 0, "y": 0 },
      "notes": "",
      "tags": [],
      "properties": [],
      "confidence": null,
      "source": "",
      "date": null,
      "dateRange": null,
      "isPositionLocked": false,
      "geo": null,
      "events": [],
      "visual": {
        "color": "#f5f5f4",
        "borderColor": "#a8a29e",
        "borderWidth": 2,
        "borderStyle": "solid",
        "shape": "circle",
        "size": "medium",
        "icon": null,
        "image": null
      },
      "assetIds": [],
      "parentGroupId": null,
      "isGroup": false,
      "isAnnotation": false,
      "childIds": []
    },
    {
      "id": "elem-002",
      "label": "Bob",
      "position": { "x": 300, "y": 0 },
      "notes": "",
      "tags": [],
      "properties": [],
      "confidence": null,
      "source": "",
      "date": null,
      "dateRange": null,
      "isPositionLocked": false,
      "geo": null,
      "events": [],
      "visual": {
        "color": "#f5f5f4",
        "borderColor": "#a8a29e",
        "borderWidth": 2,
        "borderStyle": "solid",
        "shape": "circle",
        "size": "medium",
        "icon": null,
        "image": null
      },
      "assetIds": [],
      "parentGroupId": null,
      "isGroup": false,
      "isAnnotation": false,
      "childIds": []
    }
  ],
  "links": [
    {
      "id": "link-001",
      "fromId": "elem-001",
      "toId": "elem-002",
      "sourceHandle": null,
      "targetHandle": null,
      "label": "connait",
      "notes": "",
      "tags": [],
      "properties": [],
      "direction": "forward",
      "confidence": null,
      "source": "",
      "date": null,
      "dateRange": null,
      "visual": {
        "color": "#9ca3af",
        "style": "solid",
        "thickness": 2
      },
      "curveOffset": { "x": 0, "y": 0 }
    }
  ]
}
```

## Exemple avec groupes et onglets

```json
{
  "version": "1.1.0",
  "elements": [
    {
      "id": "group-001",
      "label": "Organisation",
      "position": { "x": 0, "y": 0 },
      "notes": "",
      "tags": [],
      "properties": [],
      "confidence": null,
      "source": "",
      "date": null,
      "dateRange": null,
      "isPositionLocked": false,
      "geo": null,
      "events": [],
      "visual": {
        "color": "#e0e7ff",
        "borderColor": "#6366f1",
        "borderWidth": 2,
        "borderStyle": "dashed",
        "shape": "rectangle",
        "size": "large",
        "icon": null,
        "image": null
      },
      "assetIds": [],
      "parentGroupId": null,
      "isGroup": true,
      "isAnnotation": false,
      "childIds": ["elem-001", "elem-002"]
    },
    {
      "id": "elem-001",
      "label": "Alice",
      "position": { "x": 50, "y": 50 },
      "notes": "",
      "tags": [],
      "properties": [],
      "confidence": null,
      "source": "",
      "date": null,
      "dateRange": null,
      "isPositionLocked": false,
      "geo": null,
      "events": [],
      "visual": {
        "color": "#f5f5f4",
        "borderColor": "#a8a29e",
        "shape": "circle",
        "size": "medium",
        "icon": "user",
        "image": null
      },
      "assetIds": [],
      "parentGroupId": "group-001",
      "isGroup": false,
      "isAnnotation": false,
      "childIds": []
    },
    {
      "id": "elem-002",
      "label": "Bob",
      "position": { "x": 200, "y": 50 },
      "notes": "",
      "tags": [],
      "properties": [],
      "confidence": null,
      "source": "",
      "date": null,
      "dateRange": null,
      "isPositionLocked": false,
      "geo": null,
      "events": [],
      "visual": {
        "color": "#f5f5f4",
        "borderColor": "#a8a29e",
        "shape": "circle",
        "size": "medium",
        "icon": "user",
        "image": null
      },
      "assetIds": [],
      "parentGroupId": "group-001",
      "isGroup": false,
      "isAnnotation": false,
      "childIds": []
    }
  ],
  "links": [],
  "tabs": [
    {
      "id": "tab-001",
      "name": "Toutes les entites",
      "order": 0,
      "memberElementIds": ["group-001", "elem-001", "elem-002"]
    },
    {
      "id": "tab-002",
      "name": "Analyse",
      "order": 1,
      "memberElementIds": ["elem-001"]
    }
  ]
}
```

---

## Autres formats JSON supportes

Zeroneurone detecte et importe egalement ces formats externes :

| Format | Detection | Description |
|--------|-----------|-------------|
| Excalidraw | `{ type: "excalidraw", elements: [...] }` | Export de tableau blanc Excalidraw |
| STIX 2.1 | `{ type: "bundle", objects: [...] }` | Structured Threat Information eXpression |
| OSINT Industries | Tableau avec `module`, `query`, `status` | Sortie API OSINT Industries |
| OI Graph Palette | `{ nodes }` avec `textNode`/`moduleNode`/`imageNode` | Export OI Graph |
| PredicaGraph | `{ nodes, edges }` avec des donnees de noeud typees | Export PredicaGraph |

Si aucun format ne correspond, l'import echoue avec : `"Format JSON non reconnu"`.
