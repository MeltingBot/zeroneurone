---
title: "Onglets du canvas"
weight: 4
---

# Onglets du canvas

Organisez une enquête en **onglets thématiques**. Chaque onglet contient un sous-ensemble d'éléments, permettant de scinder un dossier complexe en espaces de travail ciblés (ex : "Flux financiers", "Personnes d'interet", "Lieux").

## Barre d'onglets

La barre d'onglets apparait sous la barre d'outils des qu'au moins un onglet existe. Elle affiche :

| Element | Description |
|---------|-------------|
| **Tous** | Vue globale, affiche tous les elements sans filtre d'onglet |
| **Onglets nommes** | Un bouton par onglet cree |
| **+** | Bouton de creation d'un nouvel onglet |

---

## Creer un onglet

1. Cliquez sur **+** dans la barre d'onglets
2. Saisissez un nom

Le nombre d'onglets est limite a **10** par enquete.

---

## Gerer les onglets

### Renommer

**Double-clic** sur le nom d'un onglet dans la barre pour le renommer.

### Reordonner

**Glissez-deposez** un onglet dans la barre pour modifier l'ordre.

### Supprimer

Clic-droit sur un onglet → **Supprimer l'onglet**.

{{< hint info >}}
**Suppression sans perte** : Supprimer un onglet ne supprime aucun element. Seule l'organisation en onglet est retiree. Les elements restent dans l'enquete et sont visibles via **Tous**.
{{< /hint >}}

---

## Ajouter et retirer des elements

| Action | Methode |
|--------|---------|
| **Ajouter a un onglet** | Clic-droit sur un element → **Ajouter a l'onglet...** → choisir l'onglet |
| **Retirer d'un onglet** | Clic-droit sur un element → **Retirer de l'onglet** |

---

## Navigation

| Action | Methode |
|--------|---------|
| **Changer d'onglet** | Cliquez sur le nom de l'onglet dans la barre |
| **Voir tout** | Cliquez sur **Tous** |
| **Aller a l'onglet d'un element fantome** | Clic-droit sur l'element → **Aller a l'onglet [nom]** |

---

## Elements fantomes

Un element qui appartient a un autre onglet mais qui est connecte a un element de l'onglet courant apparait comme **element fantome**.

| Caracteristique | Description |
|-----------------|-------------|
| **Apparence** | Semi-transparent |
| **Badge** | Indique le ou les onglets d'appartenance |
| **Navigation** | Clic-droit → **Aller a l'onglet [nom]** pour basculer |

Les elements fantomes assurent la continuite visuelle : les connexions inter-onglets restent visibles sans changer d'onglet.

---

## Collaboration

La structure des onglets est **synchronisee** entre collaborateurs.

| Donnee | Synchronisation |
|--------|-----------------|
| **Noms des onglets** | Synchronise |
| **Membres (elements)** | Synchronise |
| **Ordre des onglets** | Synchronise |
| **Onglet actif** | Local (chaque utilisateur navigue independamment) |
| **Viewport par onglet** | Local |

Les modifications d'onglets (creation, renommage, ajout/retrait d'elements) apparaissent en temps reel pour tous les utilisateurs connectes.

---

## Import / Export

| Scenario | Comportement |
|----------|-------------|
| **Export ZIP / JSON** | Les onglets sont inclus |
| **Import d'une enquete** | Les onglets sont restaures |
| **Import dans une enquete existante (fusion)** | Les elements importes rejoignent l'onglet actif. Les onglets du fichier source ne sont pas importes. |

---

## Interaction avec les autres fonctionnalites

| Fonctionnalite | Comportement |
|----------------|-------------|
| **Recherche** (Ctrl+K) | Si le resultat se trouve dans un autre onglet, la recherche bascule automatiquement vers cet onglet |
| **Vues sauvegardees** | La vue memorise l'onglet actif et le restaure au chargement |
| **Annuler / Refaire** | L'ajout et le retrait d'elements dans un onglet sont reversibles (Ctrl+Z) |
| **Mode Focus** | Fonctionne dans le contexte de l'onglet courant |

---

## Bonnes pratiques

- Decoupez une enquete complexe par **theme** ou **hypothese** (un onglet par axe d'analyse)
- La vue **Tous** affiche toujours l'integralite des elements, quel que soit leur onglet
- Les elements fantomes offrent une vision des connexions inter-onglets sans navigation supplementaire

---

**Voir aussi** : [Filtres et vues]({{< relref "filters-views" >}}), [Collaboration]({{< relref "collaboration" >}})
