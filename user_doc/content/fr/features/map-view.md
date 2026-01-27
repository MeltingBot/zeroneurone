---
title: "Vue carte"
weight: 5
---

# Vue carte

Visualisez vos éléments géolocalisés sur une carte interactive.


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

### Sélection

| Action | Résultat |
|--------|----------|
| **Clic marqueur** | Sélectionne l'élément |
| **Glisser marqueur** | Déplace la position de l'élément |

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
| **Temporel** | Activer/désactiver le mode temporel |
| **Sélection** | Zoomer sur les éléments sélectionnés |
| **Ajuster** | Ajuster la vue pour voir tous les marqueurs |

---

## Export cartographique

### Export GeoJSON

Menu **...** → **Exporter** → **GeoJSON**

Exporte les éléments géolocalisés dans un format compatible SIG (QGIS, ArcGIS).

### Contenu de l'export

| Élément | Format GeoJSON |
|---------|----------------|
| Éléments géolocalisés | Point |
| Liens (si deux extrémités géolocalisées) | LineString |

---

**Voir aussi** : [Timeline]({{< relref "timeline" >}})
