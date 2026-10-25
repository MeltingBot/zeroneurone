---
title: "Onglets du canvas"
weight: 4
---

# Onglets du canvas

Organisez un dossier en **onglets thématiques**. Chaque onglet contient un sous-ensemble d'éléments, permettant de scinder un dossier complexe en espaces de travail ciblés (ex : "Flux financiers", "Personnes d'interet", "Lieux").

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

Le nombre d'onglets est limite a **10** par dossier.

---

## Gerer les onglets

### Renommer

**Double-clic** sur le nom d'un onglet dans la barre pour le renommer.

### Reordonner

**Glissez-deposez** un onglet dans la barre pour modifier l'ordre.

### Supprimer

Clic-droit sur un onglet → **Supprimer l'onglet**.

{{< hint info >}}
**Suppression sans perte** : Supprimer un onglet ne supprime aucun element. Seule l'organisation en onglet est retiree. Les elements restent dans le dossier et sont visibles via **Tous**.
{{< /hint >}}

---

## Ajouter et retirer des elements

Clic-droit sur un element ou sur une selection, puis sous-menu **Onglets** :

| Action | Effet |
|--------|-------|
| **Nouvel onglet avec la selection** | Cree un onglet contenant la selection et l'ouvre. Depuis un onglet, la selection quitte l'onglet d'origine |
| **Deplacer vers l'onglet...** | La selection rejoint l'onglet choisi et quitte l'onglet ouvert (visible uniquement dans un onglet) |
| **Ajouter a l'onglet...** | La selection rejoint l'onglet choisi et reste aussi ou elle etait |
| **Retirer de l'onglet** | La selection quitte l'onglet ouvert |

Ces actions s'annulent avec **Ctrl+Z**.

{{< hint info >}}
**Un element peut n'appartenir a aucun onglet.** Un element cree dans **Tous**, ou retire de son dernier onglet, reste dans le dossier et visible dans **Tous**. Il n'est jamais range automatiquement dans un onglet.
{{< /hint >}}

---

## Navigation

| Action | Methode |
|--------|---------|
| **Changer d'onglet** | Cliquez sur le nom de l'onglet dans la barre |
| **Voir tout** | Cliquez sur **Tous** |
| **Aller a l'onglet d'un element fantome** | Clic-droit sur l'element → **Aller a l'onglet [nom]** |

Chaque onglet retient son **zoom et son cadrage** : en revenant sur un onglet, la vue est celle que vous aviez laissee (enregistree sur le poste). Un onglet ouvert pour la premiere fois se cadre sur ses elements. **Tous** retient aussi sa vue, le temps de la session. C'est vrai quelle que soit la facon de changer d'onglet (barre, Alt+fleches, recherche, Ctrl+Z, vues enregistrees).
---

## Elements fantomes

Un element qui appartient a un autre onglet mais qui est connecte a un element de l'onglet courant apparait comme **element fantome**.

| Caracteristique | Description |
|-----------------|-------------|
| **Apparence** | Semi-transparent, hachure, bordure en pointilles |
| **Onglets d'appartenance** | Affiches dans l'onglet **Detail** de l'element |
| **Navigation** | Clic-droit → **Onglets** → **Aller a l'onglet [nom]** pour basculer |
| **Ramener ici** | Clic-droit → **Onglets** → **Deplacer dans cet onglet** : l'element rejoint l'onglet ouvert et quitte ses autres onglets |

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
| **Import d'un dossier** | Les onglets sont restaures |
| **Import dans un dossier existant (fusion)** | Vous choisissez les onglets de l'archive a importer ; ils sont recrees (fusionnes avec un onglet du meme nom) ou tout va dans l'onglet actif. Voir [Importer]({{< relref "import-export/import" >}}). |

---

## Requetes, filtres et disposition dans un onglet

Dans un onglet, tout porte sur **ses elements** :

| Fonctionnalite | Comportement dans un onglet |
|----------------|-----------------------------|
| **Requetes et filtres** | Resultats, compteurs, **Selectionner** et **Inverser** se limitent aux elements de l'onglet. La requete est relancee quand on change d'onglet |
| **Arranger** | Seuls les elements de l'onglet bougent, autour de leur position actuelle. Le resultat est place sans chevaucher les autres elements du dossier : la vue **Tous** reste lisible |
| **Analyses** | Clusters, centralite, ponts, isoles, chemins et cycles du panneau Analyses portent sur l'onglet. « Trouver les chemins » depuis le clic droit cherche dans tout le dossier |
| **Compteurs** | La barre du canvas affiche le nombre d'elements de l'onglet et de liens entre eux |
| **Extensions** (OneNeurone...) | Recoivent les elements de l'onglet |

{{< hint warning >}}
**Elements partages** : un element present dans plusieurs onglets n'a qu'une position. Arranger un onglet le deplace aussi dans les autres. Le menu **Arranger** l'indique (« Inclut N elements d'autres onglets »).
{{< /hint >}}

Dans **Tous**, le panneau **Filtres** propose un filtre **Onglets** : cochez un ou plusieurs onglets pour ne garder que leurs elements, dans toutes les vues (canvas, carte, timeline, matrice).

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

- Decoupez un dossier complexe par **theme** ou **hypothese** (un onglet par axe d'analyse)
- La vue **Tous** affiche toujours l'integralite des elements, quel que soit leur onglet
- Les elements fantomes offrent une vision des connexions inter-onglets sans navigation supplementaire

---

**Voir aussi** : [Filtres et vues]({{< relref "filters-views" >}}), [Collaboration]({{< relref "collaboration" >}})
