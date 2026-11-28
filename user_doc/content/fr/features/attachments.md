---
title: "Fichiers joints"
weight: 7
---

# Fichiers joints

Attachez des documents, images et fichiers à vos éléments, et à vos liens, pour enrichir votre documentation.


{{< screenshot "files-section.png" "Section Fichiers d'un élément" >}}

## Formats supportés

| Catégorie | Formats |
|-----------|---------|
| **Images** | PNG, JPG, GIF, WebP, SVG, TIFF |
| **Documents** | PDF, DOCX, XLSX, PPTX |
| **Emails** | EML (RFC 822) |
| **Autres** | Tout fichier (stocké, prévisualisation limitée) |

---

## Ajouter des fichiers

### Glisser-déposer

1. Sélectionnez un élément
2. Glissez un fichier depuis votre explorateur
3. Déposez sur le panneau de détail ou sur l'élément


### Bouton d'ajout

1. Sélectionnez un élément
2. Panneau de détail → Section **Fichiers**
3. Cliquez **+ Ajouter un fichier**
4. Sélectionnez le fichier


### Coller une image

1. Copiez une image (capture d'écran, image web…)
2. Sélectionnez un élément
3. **Ctrl+V** : l'image est attachée à l'élément

> Tout ajout de fichier (collage, glisser-déposer, bouton) est annulable avec **Ctrl+Z** ; **Ctrl+Y** le rétablit.


### Fichiers sur un lien

Une pièce peut prouver la relation elle-même plutôt que l'une des deux parties : l'acte de vente d'une transaction, un ordre de virement, un relevé d'appels. Sélectionnez le lien : son panneau de détail a lui aussi une section **Fichiers**, avec le même glisser-déposer, le même bouton et le même collage (**Ctrl+V** avec le lien sélectionné).

- Sur le canvas, un trombone suivi du nombre de fichiers s'affiche sous le libellé du lien (à masquer dans le panneau **Vues**, section **Liaisons**, groupe **Afficher**).
- Le texte extrait des fichiers d'un lien est indexé : la recherche (Ctrl+K) retrouve le lien.
- Ils figurent dans la synthèse (tableau des liens et liste des fichiers joints), dans le rapport interactif (un clic sur le trombone d'un lien affiche ses fichiers), dans l'export Obsidian (la ligne de relation pointe vers leur copie dans `attachments/`) et sur le compagnon mobile (sous le lien, dans la fiche de chacun de ses deux éléments).
- Les fichiers d'un lien n'ont ni miniature sur le canvas ni import de métadonnées (ces métadonnées alimentent les propriétés et la position d'un élément).
- Quand deux éléments sont fusionnés et que deux de leurs liens identiques n'en font plus qu'un, le lien conservé garde les fichiers des deux.

{{< hint info >}}
**Lien ou élément ?** Une relation entre deux parties, prouvée par une pièce : un fichier sur le lien suffit. Une transaction à plusieurs parties (vendeur, acheteur, notaire, bien) ou portant plusieurs pièces se représente mieux par un élément « Vente du … » relié à chacune.
{{< /hint >}}


---

## Prévisualisation

### Images

Les images s'affichent en miniature sur le canvas. Lorsque vous zoomez ou redimensionnez un noeud au-dela de 250px a l'ecran, l'image en pleine resolution se charge automatiquement depuis le stockage local. Un retour au dezoom revient a la miniature legere. Jusqu'a 30 images HD sont mises en cache simultanement.

**Masquer le média sur un élément** — dans le panneau **Fichiers**, le lien « Masquer le média sur le nœud » affiche le **label** de l'élément à la place de son image sur le canvas. Le fichier reste attaché ; seul l'affichage change. Ce réglage est propre à l'élément (distinct du bouton global « flouter les médias » de la barre d'outils).

**Médias floutés à l'ouverture** — pour un dossier sensible, cochez **Médias floutés à l'ouverture** dans les **Options** du dossier : les médias sont floutés à chaque ouverture du dossier, et dès que l'option est activée (y compris par un collaborateur en session partagée). Le bouton « flouter les médias » de la barre d'outils les rend visibles le temps de la session.

**Aperçu plein écran** — l'icône œil de la ligne du fichier ouvre l'image avec des contrôles de zoom, de 40 % à 300 %. L'image s'ouvre ajustée à la largeur et la fenêtre défile autour d'elle une fois agrandie : utile pour lire un document scanné ou examiner un détail sur une photo de scène. Les mêmes contrôles s'appliquent à l'aperçu PDF.


### PDF

Les PDF s'ouvrent dans une visionneuse intégrée. Les pages défilent en continu ; le compteur suit la page en cours et les flèches sautent d'une page à l'autre.

- **Ajuster** — « Largeur de la page » ou « Page entière ». Le mode choisi est conservé si le panneau change de taille ; zoomer à la main le quitte.
- **Rechercher** — la loupe à côté de la pagination, ou Ctrl+F dans l'aperçu. La recherche ignore la casse et les accents ; les résultats sont surlignés, Entrée passe au suivant, Maj+Entrée au précédent, Échap ferme la recherche.
- **Sélectionner** — le texte se sélectionne et se copie comme dans un document ; relâcher la souris dans une zone vide arrête la sélection à cet endroit.


### Autres fichiers

Les autres formats affichent une icône et permettent le téléchargement.

---

## Gestion des fichiers

### Actions disponibles

| Action | Description |
|--------|-------------|
| **Prévisualiser** | Ouvrir dans la visionneuse |
| **Télécharger** | Sauvegarder sur votre machine |
| **Extraire le texte** | Lancer ou relancer l'extraction du contenu textuel |
| **Effacer le texte** | Supprimer le texte extrait de l'index |
| **Supprimer** | Retirer le fichier de l'élément ou du lien |


### Fichiers partagés

Un même fichier peut être attaché à plusieurs éléments et liens :

- Le fichier n'est stocké qu'une fois (déduplication)
- Le retirer d'un élément ou d'un lien le laisse sur les autres
- Quand plus rien ne l'utilise (ni élément, ni lien, ni image d'élément, ni source qui le cite), le retirer l'**efface** du navigateur : il ne revient pas au rechargement et ne part plus dans les exports
- Exceptions : si un élément ou un lien supprimé qui le portait peut encore revenir par **Ctrl+Z**, ou si le dossier est partagé (l'annulation d'un collaborateur peut en avoir besoin), le fichier reste stocké, sans partir dans les exports ; voir **Fichiers inutilisés** ci-dessous

### Fichiers inutilisés

Les fichiers des éléments et liens supprimés restent stockés dans le navigateur pour qu'une annulation (**Ctrl+Z**) les ramène. Ils ne partent dans aucun export, mais ils ne sont pas effacés d'eux-mêmes, même après un rechargement.

Pour les restaurer ou les effacer : panneau du dossier, section **Rétention**, liste **Fichiers inutilisés** (nom, taille, aperçu au survol, total en tête). Cochez des fichiers, ou **Tout sélectionner**, puis utilisez les icônes en tête de liste :

- **Restaurer** : crée un élément par fichier au centre de la vue, le fichier joint et le nom du fichier en libellé ; **Ctrl+Z** les retire et remet les fichiers dans la liste
- **Effacer** (corbeille), puis confirmer. Une annulation ne les ramènera plus, ni la vôtre ni celle d'un collaborateur dans un dossier partagé. La liste n'apparaît que s'il y en a.

---

## Stockage

### Stockage local

Les fichiers sont stockés **localement** dans votre navigateur via OPFS (Origin Private File System).

{{< hint info >}}
**100% local** : Vos fichiers ne quittent jamais votre machine sans action explicite.
{{< /hint >}}

### Déduplication

ZeroNeurone utilise le hash SHA-256 pour éviter les doublons :

- Même fichier attaché 10 fois = stocké 1 seule fois
- Économise l'espace de stockage

### Limites

| Limite | Valeur |
|--------|--------|
| **Taille max par fichier** | Dépend du navigateur (~2 Go) |
| **Espace total** | Quota navigateur |

---

## Extraction de métadonnées

ZeroNeurone extrait automatiquement les métadonnées des fichiers joints et propose de les importer comme propriétés de l'élément.

### Formats supportés

| Format | Métadonnées extraites |
|--------|----------------------|
| **JPEG, TIFF, WebP** | Date de prise de vue, appareil (fabricant/modèle), dimensions, exposition, ouverture, ISO, focale, **coordonnées GPS** |
| **PDF** | Créateur, producteur, dates création/modification, nombre de pages |
| **DOCX, XLSX, PPTX** | Auteur, modifié par, dates création/modification, titre, sujet, nombre de pages/mots |
| **EML** | Expéditeur, destinataires, sujet, date d'envoi, Message-ID, client de messagerie, IP d'origine (dernier relais public), chemin de retour et Répondre-à s'ils diffèrent de l'expéditeur, pièces jointes, liens du corps et images distantes (pixels de tracking) |

### Processus d'import

Lorsque vous ajoutez un fichier contenant des métadonnées :

1. Une fenêtre affiche les métadonnées détectées
2. Sélectionnez celles à importer (toutes cochées par défaut)
3. Cliquez **Importer** ou **Ignorer**

Les métadonnées importées deviennent des propriétés de l'élément.

Pour plusieurs fichiers ajoutés en une fois, cochez **Appliquer aux fichiers suivants** : le même choix (importer ces métadonnées, ou ignorer) vaut pour les autres fichiers de l'ajout, y compris ceux encore en chargement.

### Relancer l'extraction

Si vous avez cliqué **Ignorer**, ou si vous souhaitez simplement y revenir plus tard, le bouton **Extraire les métadonnées** (icône information) de la ligne du fichier relance l'analyse. Il est disponible sur tous les types de fichiers, y compris les images, où il permet de récupérer les coordonnées GPS d'une photo après coup. Si le fichier n'en contient aucune, un message vous le signale.

### Géolocalisation automatique

Si une image contient des **coordonnées GPS** (EXIF) :

- Une option "Coordonnées GPS" apparaît dans la liste
- Si importées, l'élément est automatiquement géolocalisé
- L'élément devient visible sur la vue carte

{{< hint info >}}
**Astuce** : Les photos de smartphones contiennent souvent des coordonnées GPS. Importez-les pour placer automatiquement vos éléments sur la carte.
{{< /hint >}}

---

## Extraction de texte

ZeroNeurone extrait automatiquement le contenu textuel des fichiers PDF, DOCX, ODT et texte (TXT, Markdown, CSV...) lors de l'ajout a un element. Ce texte est indexe pour la recherche globale (Ctrl+K).

### Formats supportes

| Format | Extraction |
|--------|-----------|
| **PDF** | Texte selectionnable (jusqu'a 100 pages) |
| **DOCX** | Contenu textuel extrait du XML Word |
| **ODT** | Contenu textuel extrait du format OpenDocument |
| **TXT, MD, CSV** | Contenu integral |

### Visualisation

Le texte extrait est indique sous le nom de fichier par un compteur de caracteres. Cliquez dessus pour deplier un apercu du contenu.

### Actions

| Action | Icone | Description |
|--------|-------|-------------|
| **Extraire / Re-extraire** | ScanText | Lancer l'extraction a la demande (ou la relancer) |
| **Effacer** | FileX2 | Supprimer le texte extrait de l'index |

### Recherche

Le texte extrait est automatiquement indexe dans le moteur de recherche. Un Ctrl+K avec un mot present dans un PDF retrouvera l'element auquel le fichier est attache.

{{< hint info >}}
**Astuce** : Si l'extraction automatique echoue (PDF scanne sans texte selectionnable), le bouton ScanText permet de relancer l'extraction a tout moment.
{{< /hint >}}

---

## Export avec fichiers

### Export ZIP

L'export **ZIP** inclut les fichiers joints aux éléments et aux liens. Les fichiers que plus rien n'utilise (ceux d'un élément ou d'un lien supprimé, gardés pour pouvoir annuler la suppression) n'y figurent pas :

```
enquete.zip
├── dossier.json          # Métadonnées
└── assets/              # Fichiers joints
    ├── abc123.pdf
    ├── def456.png
    └── ...
```


### Autres formats

Les exports JSON, CSV, GraphML n'incluent **pas** les fichiers (métadonnées uniquement).

---

## Import avec fichiers

### Import ZIP

L'import ZIP restaure automatiquement les fichiers joints.


### Correspondance

Les fichiers sont réassociés aux éléments et aux liens via leur identifiant dans le JSON.

---

**Voir aussi** : [Recherche]({{< relref "search" >}})
