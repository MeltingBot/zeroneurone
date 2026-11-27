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

Cochez les rubriques à inclure. Elles sont écrites dans l'ordre de la liste : les flèches de chaque ligne la montent ou la descendent. L'ordre choisi est gardé pour les synthèses suivantes ; **Ordre par défaut** le rétablit.

| Rubrique | Description |
|--------|-------------|
| Description du dossier | Texte descriptif du dossier |
| Résumé statistique | Nombre d'éléments, liens, tags, etc. |
| Capture du graphe | Image du canvas |
| Capture de la carte | La carte en SVG : fond de carte en image, le reste en vectoriel |
| Capture de la timeline | La timeline en SVG, sur toute la période des éléments |
| Analyse du graphe | Clusters, centralité, ponts, éléments isolés |
| Chronologie | Événements datés triés chronologiquement |
| Liste des éléments | Tous les éléments avec leurs propriétés |
| Liste des liens | Toutes les relations entre éléments |
| Fichiers joints | Liste des pièces jointes |
| Fiches détaillées | Fiche complète pour chaque élément |

### Captures

Les captures sont prises en mode clair, cadrées sur le contenu. La carte est cadrée sur les lieux du périmètre et chaque élément y garde son marqueur : aucun n'est regroupé. Quand la synthèse porte sur un onglet ou une sélection, **seuls les éléments du périmètre** apparaissent dans les captures : le reste du dossier est masqué le temps de la capture, puis la vue revient telle qu'elle était. La sélection n'est pas dessinée.

Les captures figurent dans les exports HTML, DOCX et à l'impression, pas dans le Markdown.

{{< hint info >}}
Avec **Éléments liés**, deux éléments liés au périmètre restent reliés entre eux sur les captures si un lien les unit dans le dossier, alors que la liste des liens de la synthèse l'omet.
{{< /hint >}}

### Mise en page

| Option | Description |
|--------|-------------|
| Une rubrique par page | Chaque rubrique commence sur une nouvelle page, en DOCX et à l'impression |
| Une fiche par page | Avec les fiches détaillées : chaque fiche commence sur une nouvelle page, en DOCX et à l'impression |
| Liens vers les fiches | Avec les fiches détaillées : en HTML et en DOCX, le nom d'un élément (listes, chronologie, relations) mène à sa fiche |

Dans une fiche détaillée, les fichiers joints viennent en premier, avec leur vignette.

Pendant la génération, la fenêtre est bloquée et une barre indique l'étape en cours.

### Sélection d'abord

Avec **Éléments liés**, les éléments du périmètre viennent en premier :
- dans la liste des éléments, puis les autres sous **Éléments liés** ;
- dans les fiches détaillées, puis les autres sous **Fiches liées**.

### Options des éléments

Si vous incluez la liste des éléments :

| Option | Description |
|--------|-------------|
| Propriétés personnalisées | Colonne des propriétés dans la liste des éléments |
| Grouper par tag | Organise les éléments par leurs tags |
| Trier par | Nom, Date ou Confiance (Cotation en modèle Europol / Amirauté) |

### Modèle

Dans l'en-tête de la fenêtre, la disquette (**Enregistrer comme modèle**) garde les options cochées : rubriques, captures, mise en page et options des éléments. Elles sont reprises à chaque ouverture de la synthèse, dans tous les dossiers. Le titre et le périmètre restent propres à chaque synthèse ; l'ordre des rubriques est mémorisé à part.

La flèche circulaire (**Options par défaut**) oublie le modèle et revient au réglage d'origine. Le modèle est gardé dans ce navigateur seulement.

---

## Formats d'export

### HTML

Document web formaté, prêt à visualiser dans un navigateur.

- Mise en page professionnelle
- Images intégrées
- Styles optimisés pour l'impression

### DOCX

Document Word (.docx), modifiable dans Word, LibreOffice ou Google Docs : titres, tableaux, liens des sources cliquables, captures en images. La carte et la timeline y sont en SVG, avec une image de secours pour les logiciels qui ne lisent pas le SVG.

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

### Mention d'origine

Chaque synthèse se termine par la mention « Synthèse générée par ZeroNeurone » avec un lien vers zeroneurone.com. En DOCX, elle figure en pied de chaque page ; à l'impression aussi, avec les navigateurs qui gèrent les marges de page (Chrome, Edge).

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
4. **Format adapté** : HTML pour consultation, DOCX pour retravailler le document, Markdown pour édition, JSON+ pour intégration

---

**Voir aussi** : [Rapport]({{< relref "report" >}}) • [Export]({{< relref "/import-export/export" >}})
