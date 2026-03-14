---
title: "Vue carte"
weight: 5
---

# Vue carte

Visualisez vos éléments géolocalisés sur une carte interactive avec rendu 3D.

## Activer la vue carte

| Méthode | Action |
|---------|--------|
| Touche **2** | Mode carte |
| Bouton vue | Clic sur l'icône carte |

---

## Géolocaliser un élément

### Depuis le panneau de détail

1. Sélectionnez un élément
2. Section **Localisation**
3. Cliquez pour ouvrir le sélecteur de position
4. Cherchez une adresse ou cliquez sur la carte pour placer le marqueur
5. Confirmez la position

Le marqueur est déplaçable : glissez-le pour ajuster la position.

---

## Interactions sur la carte

### Navigation

| Action | Résultat |
|--------|----------|
| **Glisser** | Déplacer la carte |
| **Molette** | Zoom |
| **Double-clic** | Zoom avant |
| **Clic droit + glisser** | Inclinaison (pitch) et rotation |

### Sélection

| Action | Résultat |
|--------|----------|
| **Clic marqueur** | Sélectionne l'élément |
| **Glisser marqueur** | Déplace la position de l'élément |

---

## Recherche de lieu

Le champ de recherche dans la barre d'outils permet de localiser un lieu sur la carte :

1. Tapez un nom de lieu ou une adresse
2. Appuyez sur **Entrée** ou cliquez sur la loupe
3. La carte se centre sur le résultat avec un marqueur temporaire (8 secondes)

La recherche utilise Nominatim (OpenStreetMap) et respecte la langue de l'interface.

---

## Mode 3D

La carte utilise MapLibre GL JS avec rendu WebGL. Le mode 3D est activé par défaut.

### Globe

Au dézoom maximal, la carte se transforme en globe terrestre. La transition vers la projection Mercator classique est automatique en zoomant.

### Terrain 3D

Le relief est affiché grâce aux données d'élévation. Les montagnes, vallées et plaines sont visibles en inclinant la carte.

### Bâtiments 3D

À partir du zoom 14, les bâtiments sont affichés en volume avec leur hauteur réelle. Activez/désactivez cette option avec le bouton **Bâtiments** dans la barre d'outils.

### Toggle 3D

Le bouton **3D** dans la barre d'outils permet de basculer entre :
- **Mode 3D** : globe, terrain en relief, inclinaison à 45°
- **Mode 2D** : carte plate classique (projection Mercator)

---

## Apparence des marqueurs

Les marqueurs reprennent l'apparence des éléments :

| Propriété | Affichage carte |
|-----------|-----------------|
| **Couleur** | Couleur du marqueur |
| **Image** | Miniature si l'élément a une pièce jointe |
| **Sélection** | Bordure accentuée |

### Clusters

Les marqueurs proches sont automatiquement regroupés. Cliquez sur un cluster pour zoomer et voir les marqueurs individuels.

---

## Liens sur la carte

Les liens entre éléments géolocalisés sont affichés comme des lignes sur la carte.

- Les liens reprennent leur couleur et style (continu, pointillé)
- Les liens dirigés affichent une flèche
- Cliquez sur un lien pour le sélectionner

---

## Zones géographiques

Les zones permettent de définir des surfaces sur la carte (périmètres de surveillance, zones d'intérêt, secteurs d'intervention…).

### Créer une zone

Le bouton **Zone** dans la barre d'outils propose trois formes via un menu déroulant :

| Forme | Dessin |
|-------|--------|
| **Polygone** | Cliquez pour placer chaque sommet, double-clic ou clic sur le premier point pour fermer |
| **Cercle** | 1er clic = centre, déplacez la souris pour ajuster le rayon (affiché en temps réel), 2e clic = valider |
| **Carré** | 1er clic = centre, déplacez la souris pour ajuster la taille, 2e clic = valider |

Appuyez sur **Échap** pour annuler le dessin en cours.

Un élément de type Zone est créé avec les propriétés **Surface** et **Rayon** (pour les cercles).

### Modifier une zone

Double-cliquez sur une zone pour entrer en mode édition :

| Type | Mode d'édition |
|------|---------------|
| **Polygone / Carré** | Glissez les sommets pour les déplacer. Cliquez sur les points intermédiaires pour ajouter un sommet. |
| **Cercle** | Quatre poignées cardinales (N, E, S, O) permettent de redimensionner le rayon par glisser-déposer. |

Cliquez en dehors de la zone pour sauvegarder. Appuyez sur **Échap** pour annuler.

### Déplacer une zone

Glissez le marqueur central de la zone pour la déplacer. La forme (polygone, cercle, carré) est conservée.

### Éditer le GeoJSON

Pour les événements avec zone, un éditeur texte permet de copier/coller du GeoJSON depuis un outil externe (QGIS, geojson.io…). Les formats acceptés : `Polygon` (Geometry, Feature ou FeatureCollection).

---

## Fonds de carte

Quatre fonds de carte sont disponibles via le sélecteur dans la barre d'outils :

| Fond | Description |
|------|-------------|
| **OpenStreetMap** | Carte standard avec noms locaux |
| **OSM Latin** | Noms de lieux en alphabet latin (par défaut) |
| **CartoDB** | Carte claire et épurée (bascule auto en mode sombre) |
| **Satellite** | Imagerie satellite (Esri) |

---

## Mode temporel

Si vos éléments ont des dates ou des événements avec positions, activez le **mode temporel** :

1. Cliquez sur **Temporel** dans la barre d'outils
2. Utilisez le curseur pour naviguer dans le temps
3. Les marqueurs apparaissent/disparaissent selon leur période d'activité

Contrôles :
- **Lecture** : animation automatique
- **Pas à pas** : avancer/reculer d'un événement

---

## Barre d'outils

| Bouton | Action |
|--------|--------|
| **Recherche** | Rechercher un lieu (Nominatim) |
| **Fond de carte** | Choisir entre 4 fonds de carte |
| **3D** | Activer/désactiver le mode 3D |
| **Bâtiments** | Afficher/masquer les bâtiments 3D |
| **Temporel** | Activer/désactiver le mode temporel |
| **Sélection** | Zoomer sur les éléments sélectionnés |
| **Zone** | Dessiner une zone (polygone, cercle ou carré) |
| **Ajuster** | Ajuster la vue pour voir tous les marqueurs |
| **Export CSV** | Exporter les données de la carte en CSV |

---

## Exports

### Export CSV

Cliquez sur l'icône de téléchargement dans la barre d'outils pour exporter les éléments géolocalisés en CSV.

### Export GeoJSON

Menu **...** → **Exporter** → **GeoJSON**

Exporte les éléments géolocalisés dans un format compatible SIG (QGIS, ArcGIS).

### Contenu de l'export

| Élément | Format GeoJSON |
|---------|----------------|
| Éléments géolocalisés | Point |
| Zones géographiques | Polygon |
| Liens (si deux extrémités géolocalisées) | LineString |

---

**Voir aussi** : [Timeline]({{< relref "timeline" >}})
