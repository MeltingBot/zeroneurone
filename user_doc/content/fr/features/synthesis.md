---
title: "Synthèse"
weight: 10
---

# Génération de Synthèse

Générez des rapports structurés automatiques à partir de votre dossier.

---

## Accéder à la synthèse

Barre d'outils → Bouton **Synthèse** (icône document)

---

## Configurer la synthèse

### Titre

Personnalisez le titre du document généré. Par défaut, le nom du dossier est utilisé.

### Périmètre

La synthèse porte sur le **dossier entier**, sur un **onglet**, ou sur la **sélection** du canvas (proposée quand il y en a une).

- Les liens retenus sont ceux entre les éléments retenus. Un lien sélectionné apporte ses deux éléments, un groupe ses enfants.
- **Éléments liés** ajoute les voisins directs de ces éléments et les liens vers eux, comme les fantômes d'un onglet. Deux voisins ne sont pas reliés entre eux dans la synthèse.
- Les fichiers joints, les statistiques et l'analyse du graphe ne portent que sur ce périmètre.

{{< hint warning >}}
La fenêtre s'ouvre sur la sélection en cours s'il y en a une, sinon sur l'onglet ouvert. Vérifiez le périmètre avant de générer une synthèse du dossier entier.
{{< /hint >}}

### Contenu à inclure

Sélectionnez les sections à inclure dans la synthèse :

| Option | Description |
|--------|-------------|
| Description du dossier | Texte descriptif du dossier |
| Résumé statistique | Nombre d'éléments, liens, tags, etc. |
| Analyse du graphe | Clusters, centralité, ponts, éléments isolés |
| Chronologie | Événements datés triés chronologiquement |
| Liste des éléments | Tous les éléments avec leurs propriétés |
| Liste des liens | Toutes les relations entre éléments |
| Propriétés personnalisées | Tableau des propriétés par élément |
| Fichiers joints | Liste des pièces jointes |
| Fiches détaillées | Fiche complète pour chaque élément |

### Capture d'écran

Cochez **Inclure le graphe** pour ajouter une capture du canvas.

{{< hint info >}}
La capture est effectuée en pleine largeur et en mode clair pour une meilleure lisibilité.
{{< /hint >}}

### Options des éléments

Si vous incluez la liste des éléments :

| Option | Description |
|--------|-------------|
| Grouper par tag | Organise les éléments par leurs tags |
| Trier par | Nom, Date ou Confiance (Cotation en modèle Europol / Amirauté) |

---

## Formats d'export

### HTML

Document web formaté, prêt à visualiser dans un navigateur.

- Mise en page professionnelle
- Images intégrées
- Styles optimisés pour l'impression

### Markdown

Texte brut avec syntaxe Markdown.

- Portable et léger
- Éditable dans tout éditeur de texte
- Compatible avec les wikis et documentation

### JSON+

Export structuré enrichi avec données d'analyse.

```json
{
  "investigation": { ... },
  "elements": [ ... ],
  "links": [ ... ],
  "analysis": {
    "clusters": [ ... ],
    "centrality": [ ... ],
    "bridges": [ ... ]
  }
}
```

Utile pour :
- Intégration avec d'autres outils
- Analyse programmatique
- Archivage structuré

### Imprimer / PDF

Ouvre une fenêtre d'impression avec le document HTML formaté. Pour un PDF, choisir **Enregistrer au format PDF** comme imprimante : le texte reste sélectionnable et la recherche fonctionne dans le PDF.

---

## Contenu généré

### Résumé statistique

Le résumé inclut :
- Nombre total d'éléments
- Nombre total de liens
- Nombre de tags uniques
- Nombre de fichiers joints
- Éléments avec coordonnées géographiques
- Éléments avec dates

### Analyse du graphe

Si l'analyse est incluse, la synthèse contient :

**Clusters identifiés**
- Groupes d'éléments fortement connectés entre eux
- Nombre de membres par cluster

**Éléments centraux**
- Éléments avec le plus de connexions
- Score de centralité

**Éléments ponts**
- Éléments connectant différents clusters
- Rôle dans la structure du graphe

**Éléments isolés**
- Éléments sans aucune connexion

### Chronologie

Tableau chronologique avec :
- Date de l'événement
- Élément concerné
- Description

### Fiches détaillées

Pour chaque élément :
- Identité (label)
- Tags
- Notes
- Propriétés
- Relations (liens entrants et sortants)
- Fichiers joints

---

## Bonnes pratiques

1. **Sélectionnez le contenu pertinent** : N'incluez que les sections utiles à votre destinataire
2. **Utilisez les captures** : Le graphe visuel aide à comprendre les relations
3. **Groupez par tag** : Organise logiquement les éléments
4. **Format adapté** : HTML pour consultation, Markdown pour édition, JSON+ pour intégration

---

**Voir aussi** : [Rapport]({{< relref "report" >}}) • [Export]({{< relref "/import-export/export" >}})
