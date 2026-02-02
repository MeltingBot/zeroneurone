# Export Rapport HTML Interactif

## Objectif

Générer un fichier HTML autonome contenant :
- Le rapport de l'enquête (Markdown rendu)
- Une visualisation interactive du graphe
- Navigation bidirectionnelle rapport ↔ graphe
- Thumbnails des assets (pas les fichiers complets)

## Contraintes

| Contrainte | Cible |
|------------|-------|
| Fichier unique | Un seul `.html` téléchargeable |
| Autonome | Aucune dépendance externe (CDN, API) |
| Taille | < 2MB sans assets, raisonnable avec thumbnails |
| Compatibilité | Navigateurs modernes (Chrome, Firefox, Safari, Edge) |
| Offline | Fonctionne sans connexion |

## Architecture Technique

### Structure du fichier HTML

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{investigation.name}} - Rapport</title>
  <style>
    /* CSS embarqué - Tailwind minimal ou custom */
  </style>
</head>
<body>
  <div id="app">
    <!-- Header -->
    <header id="header">...</header>

    <!-- Split view -->
    <main id="main">
      <aside id="report-panel">...</aside>
      <section id="graph-panel">...</section>
    </main>
  </div>

  <!-- Données embarquées -->
  <script type="application/json" id="investigation-data">
    {
      "meta": { "name": "...", "createdAt": "...", "exportedAt": "..." },
      "elements": [...],
      "links": [...],
      "report": "# Markdown content...",
      "thumbnails": { "assetId": "data:image/jpeg;base64,..." }
    }
  </script>

  <!-- Code JS embarqué -->
  <script>
    // Application autonome
  </script>
</body>
</html>
```

### Composants JS nécessaires

| Composant | Approche | Taille estimée |
|-----------|----------|----------------|
| Markdown parser | marked.js minifié | ~25kb |
| Graph rendering | Canvas 2D custom | ~15kb (custom) |
| Layout algorithm | Force-directed simplifié | ~5kb |
| Interactions | Vanilla JS | ~10kb |
| **Total JS** | | **~55kb** |

### Alternative : SVG statique + JS minimal

Pour réduire la complexité, on peut pré-calculer les positions :

1. Utiliser les positions existantes du canvas React Flow
2. Générer un SVG statique du graphe
3. Ajouter des event listeners pour l'interactivité

```
Avantages :
- Pas de calcul de layout côté client
- SVG plus léger que canvas lib
- Rendu net à toutes les échelles

Inconvénients :
- Positions figées (pas de re-layout)
- Zoom/pan à implémenter manuellement
```

## Données à exporter

### Elements (simplifié)

```typescript
interface ExportElement {
  id: string;
  label: string;
  notes: string;           // Markdown
  tags: string[];
  properties: Property[];
  position: { x: number; y: number };
  visual: {
    color: string;
    shape: string;
    size: string;
  };
  thumbnailId?: string;    // Référence vers thumbnails map
}
```

### Links (simplifié)

```typescript
interface ExportLink {
  id: string;
  fromId: string;
  toId: string;
  label: string;
  notes: string;
  visual: {
    color: string;
    style: string;
  };
}
```

### Thumbnails

```typescript
interface Thumbnails {
  [assetId: string]: string;  // base64 data URL
}
```

**Génération des thumbnails** :
- Utiliser `<canvas>` pour redimensionner les images
- Taille cible : 200x200px max
- Format : JPEG quality 0.7 (~10-30kb par image)
- Uniquement pour les assets image (pas PDF, pas DOCX)

## Rendu du Rapport

### Parsing des références

Le rapport contient des références aux éléments : `[[el:uuid|Label]]`

```javascript
function parseReferences(markdown) {
  return markdown.replace(
    /\[\[el:([a-f0-9-]+)\|([^\]]+)\]\]/g,
    '<a href="#" class="element-ref" data-element-id="$1">$2</a>'
  );
}
```

### Rendu Markdown

```javascript
// marked.js avec options sécurisées
marked.setOptions({
  sanitize: false,  // On génère nous-même, pas d'input utilisateur externe
  breaks: true,
  gfm: true
});

const html = marked.parse(parseReferences(report));
```

## Interactions

### Rapport → Graphe

```javascript
document.querySelectorAll('.element-ref').forEach(el => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    const elementId = e.target.dataset.elementId;
    highlightNode(elementId);
    panToNode(elementId);
  });
});
```

### Graphe → Rapport

```javascript
function onNodeClick(elementId) {
  // Trouver toutes les références à cet élément dans le rapport
  const refs = document.querySelectorAll(`[data-element-id="${elementId}"]`);
  if (refs.length > 0) {
    refs[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    highlightRefs(refs);
  }
  // Afficher le détail de l'élément dans un tooltip/panel
  showElementDetail(elementId);
}
```

## Rendu du Graphe (Canvas 2D)

### Option A : Canvas custom (~15kb)

```javascript
class GraphRenderer {
  constructor(canvas, elements, links) {
    this.ctx = canvas.getContext('2d');
    this.elements = elements;
    this.links = links;
    this.transform = { x: 0, y: 0, scale: 1 };
  }

  render() {
    this.clear();
    this.drawLinks();
    this.drawNodes();
    this.drawLabels();
  }

  drawNode(element) {
    const { x, y } = this.worldToScreen(element.position);
    const size = this.getNodeSize(element.visual.size);

    this.ctx.fillStyle = element.visual.color;

    switch (element.visual.shape) {
      case 'ellipse':
        this.ctx.beginPath();
        this.ctx.arc(x, y, size/2, 0, Math.PI * 2);
        this.ctx.fill();
        break;
      case 'rectangle':
        this.ctx.fillRect(x - size/2, y - size/2, size, size);
        break;
      // ... autres formes
    }
  }

  // Pan & Zoom
  handleWheel(e) { /* zoom */ }
  handleMouseDown(e) { /* pan start */ }
  handleMouseMove(e) { /* pan / hover */ }
  handleMouseUp(e) { /* pan end / click */ }
}
```

### Option B : SVG pré-généré (~5kb JS)

Générer le SVG côté serveur (dans l'app React) :

```typescript
function generateGraphSVG(elements: Element[], links: Link[]): string {
  const bounds = calculateBounds(elements);
  const padding = 50;

  let svg = `<svg viewBox="${bounds.minX - padding} ${bounds.minY - padding} ${bounds.width + padding*2} ${bounds.height + padding*2}">`;

  // Liens
  links.forEach(link => {
    const from = elements.find(e => e.id === link.fromId);
    const to = elements.find(e => e.id === link.toId);
    svg += `<line class="link" data-link-id="${link.id}"
              x1="${from.position.x}" y1="${from.position.y}"
              x2="${to.position.x}" y2="${to.position.y}"
              stroke="${link.visual.color}" />`;
  });

  // Noeuds
  elements.forEach(el => {
    svg += `<g class="node" data-element-id="${el.id}" transform="translate(${el.position.x}, ${el.position.y})">
              <circle r="20" fill="${el.visual.color}" />
              <text dy="30" text-anchor="middle">${el.label}</text>
            </g>`;
  });

  svg += '</svg>';
  return svg;
}
```

**Recommandation** : Option B (SVG) pour la v1, plus simple et suffisant pour un rapport.

## UI Layout

### Desktop (> 768px)

```
┌──────────────────────────────────────────────────────────┐
│  [Logo] Investigation Name                    [Search]   │
├─────────────────────────────┬────────────────────────────┤
│                             │                            │
│     RAPPORT                 │      GRAPHE SVG            │
│     (scrollable)            │      (pan & zoom)          │
│                             │                            │
│     width: 50%              │      width: 50%            │
│                             │                            │
├─────────────────────────────┴────────────────────────────┤
│  [Element Detail Popover - on hover/click]               │
└──────────────────────────────────────────────────────────┘
```

### Mobile (< 768px)

```
┌────────────────────────┐
│  Investigation Name    │
├────────────────────────┤
│  [Tabs: Rapport|Graphe]│
├────────────────────────┤
│                        │
│   Active Tab Content   │
│   (full width)         │
│                        │
└────────────────────────┘
```

## Estimation de taille

| Composant | Taille |
|-----------|--------|
| HTML structure | ~5kb |
| CSS (minimal) | ~10kb |
| JS (marked + custom) | ~40kb |
| Données JSON (100 éléments) | ~50kb |
| SVG graphe (100 noeuds) | ~20kb |
| **Sous-total sans images** | **~125kb** |
| Thumbnails (20 images) | ~400kb |
| **Total typique** | **~525kb** |

## Intégration dans ZeroNeurone

### Nouveau service

```
src/services/
  exportInteractiveReportService.ts
```

### Fonctions principales

```typescript
// Point d'entrée
export async function exportInteractiveReport(
  investigation: Investigation,
  elements: Element[],
  links: Link[],
  report: string,
  assets: Asset[]
): Promise<Blob> {

  // 1. Générer les thumbnails
  const thumbnails = await generateThumbnails(assets);

  // 2. Préparer les données
  const exportData = prepareExportData(investigation, elements, links, report, thumbnails);

  // 3. Générer le SVG du graphe
  const graphSvg = generateGraphSVG(elements, links);

  // 4. Assembler le HTML
  const html = assembleHTML(exportData, graphSvg);

  // 5. Retourner le blob
  return new Blob([html], { type: 'text/html' });
}

// Génération des thumbnails
async function generateThumbnails(assets: Asset[]): Promise<Record<string, string>> {
  const thumbnails: Record<string, string> = {};

  for (const asset of assets) {
    if (asset.mimeType.startsWith('image/')) {
      const thumb = await createThumbnail(asset, 200, 200, 0.7);
      thumbnails[asset.id] = thumb;
    }
  }

  return thumbnails;
}

// Création d'une thumbnail
async function createThumbnail(
  asset: Asset,
  maxWidth: number,
  maxHeight: number,
  quality: number
): Promise<string> {
  const blob = await fileService.getAssetBlob(asset.hash);
  const img = await loadImage(blob);

  const canvas = document.createElement('canvas');
  const scale = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
  canvas.width = img.width * scale;
  canvas.height = img.height * scale;

  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL('image/jpeg', quality);
}
```

### Template HTML

Stocker le template dans :
```
src/templates/
  interactive-report.html
```

Avec des placeholders :
```html
<!-- {{TITLE}} -->
<!-- {{STYLES}} -->
<!-- {{GRAPH_SVG}} -->
<!-- {{DATA_JSON}} -->
<!-- {{SCRIPTS}} -->
```

## Plan d'implémentation

### Phase 1 : Prototype (~2-3h)
- [ ] Créer le template HTML de base
- [ ] Implémenter le rendu SVG du graphe
- [ ] Parser et rendre le Markdown avec références
- [ ] Interactions basiques (highlight)

### Phase 2 : Interactions (~2h)
- [ ] Navigation bidirectionnelle rapport ↔ graphe
- [ ] Pan & zoom sur le SVG
- [ ] Tooltip/popover détail élément
- [ ] Recherche (Ctrl+F amélioré)

### Phase 3 : Assets & Polish (~2h)
- [ ] Génération des thumbnails
- [ ] Affichage des thumbnails dans les détails
- [ ] Responsive mobile (tabs)
- [ ] Thème clair/sombre

### Phase 4 : Intégration (~1h)
- [ ] Bouton export dans l'UI
- [ ] Tests avec vraies enquêtes
- [ ] Optimisation taille

## Questions ouvertes

1. **Groupes** : Comment représenter les groupes dans le SVG ? Rectangles englobants ?
2. **Liens courbes** : Supporter les `curveOffset` ou simplifier en lignes droites ?
3. **Grandes enquêtes** : Limite de noeuds pour garder le fichier utilisable ? (500? 1000?)
4. **Sécurité** : Option de chiffrement JS côté client avec mot de passe ?

## Décisions à prendre

| Question | Options | Recommandation |
|----------|---------|----------------|
| Rendu graphe | Canvas vs SVG | **SVG** (plus simple, suffisant) |
| Markdown lib | marked vs custom | **marked** (25kb, robuste) |
| Layout | Positions existantes vs recalcul | **Positions existantes** |
| Responsive | CSS media queries vs JS | **CSS media queries** |
