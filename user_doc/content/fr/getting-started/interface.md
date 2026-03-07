---
title: "L'interface"
weight: 2
---

# Comprendre l'interface

L'interface de ZeroNeurone est organisée autour du canvas central, avec des panneaux latéraux contextuels.


## Zones principales

### 1. Barre d'outils supérieure


| Icône | Action |
|-------|--------|
| ← | Retour à la liste des dossiers |
| Nom | Nom du dossier (cliquez pour renommer) |
| 🔍 | Recherche rapide (Ctrl+K) |
| Vues | Bascule Canvas / Carte / Timeline |
| ⇄ | Changer la position du panneau (droite / bas / gauche / détaché) |
| ⋯ | Menu : Export, Import, Paramètres |

### 2. Canvas central

Zone de travail principale où vous créez et organisez vos éléments.

- **Zoom** : Molette ou pincement
- **Déplacement** : Clic-glisser sur le fond
- **Sélection** : Clic sur un élément ou rectangle de sélection

### 3. Panneau latéral

Le panneau unique regroupe tous les onglets :

| Onglet | Fonction |
|--------|----------|
| **Détail** | Métadonnées, tags, propriétés, fichiers, connexions |
| **Filtres** | Filtrer par tags, confiance, propriétés |
| **Insights** | Analyse de graphe (clusters, centralité) |
| **Vues** | Sauvegarder/charger des configurations |
| **Rapport** | Rédiger et exporter un rapport |

#### Position du panneau

Le bouton ⇄ dans la barre d'outils cycle entre 4 positions :

| Position | Description |
|----------|-------------|
| **Droite** | Position par défaut, panneau à droite du canvas |
| **Bas** | Panneau en bas, style DevTools — redimensionnable verticalement |
| **Gauche** | Panneau à gauche |
| **Détaché** | Fenêtre séparée — idéal pour le multi-écran |

Le choix est mémorisé entre les sessions (sauf le mode détaché qui revient à droite au rechargement).


## Modes de vue

ZeroNeurone propose 4 modes de visualisation :

| Touche | Mode | Description |
|--------|------|-------------|
| **1** | Canvas | Vue graphe par défaut |
| **2** | Carte | Éléments géolocalisés sur carte |
| **3** | Timeline | Vue chronologique |
| **4** | Matrice | Tableau triable et filtrable |


## Navigation clavier

| Raccourci | Action |
|-----------|--------|
| Ctrl+K | Recherche rapide |
| Suppr | Supprimer la sélection |
| Ctrl+Z | Annuler |
| Ctrl+Shift+Z | Rétablir |
| F | Mode focus (voisinage) |
| Échap | Désélectionner / Fermer |
| 1-4 | Changer de mode de vue |

---

**Prochaine étape** : [Éléments et liens]({{< relref "../features/elements-links" >}})
