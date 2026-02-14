---
title: "Fichiers joints"
weight: 7
---

# Fichiers joints

Attachez des documents, images et fichiers à vos éléments pour enrichir votre documentation.


## Formats supportés

| Catégorie | Formats |
|-----------|---------|
| **Images** | PNG, JPG, GIF, WebP, SVG, TIFF |
| **Documents** | PDF, DOCX, XLSX, PPTX |
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


---

## Prévisualisation

### Images

Les images s'affichent en miniature sur le canvas. Lorsque vous zoomez ou redimensionnez un noeud au-dela de 250px a l'ecran, l'image en pleine resolution se charge automatiquement depuis le stockage local. Un retour au dezoom revient a la miniature legere. Jusqu'a 30 images HD sont mises en cache simultanement.


### PDF

Les PDF s'ouvrent dans une visionneuse intégrée.


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
| **Supprimer** | Retirer le fichier de l'élément |


### Fichiers partagés

Un même fichier peut être attaché à plusieurs éléments :

- Le fichier n'est stocké qu'une fois (déduplication)
- Supprimer d'un élément ne supprime pas des autres

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

### Processus d'import

Lorsque vous ajoutez un fichier contenant des métadonnées :

1. Une fenêtre affiche les métadonnées détectées
2. Sélectionnez celles à importer (toutes cochées par défaut)
3. Cliquez **Importer** ou **Ignorer**

Les métadonnées importées deviennent des propriétés de l'élément.

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

ZeroNeurone extrait automatiquement le contenu textuel des fichiers PDF et texte (TXT, Markdown, CSV...) lors de l'ajout a un element. Ce texte est indexe pour la recherche globale (Ctrl+K).

### Formats supportes

| Format | Extraction |
|--------|-----------|
| **PDF** | Texte selectionnable (jusqu'a 100 pages) |
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

L'export **ZIP** inclut tous les fichiers joints :

```
enquete.zip
├── investigation.json    # Métadonnées
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

Les fichiers sont réassociés aux éléments via leur identifiant dans le JSON.

---

**Voir aussi** : [Recherche]({{< relref "search" >}})
