---
title: "Éléments et liens"
weight: 1
---

# Éléments et liens

Les **éléments** et **liens** sont les briques fondamentales de votre analyse dans ZeroNeurone.

## Éléments

Un élément représente n'importe quel concept : personne, lieu, organisation, objet, événement, document...

### Créer un élément

**Double-clic** sur le canvas pour créer un nouvel élément à cet emplacement.


### Propriétés d'un élément

| Propriété | Description |
|-----------|-------------|
| **Label** | Nom affiché sur le canvas |
| **Notes** | Description libre, texte long |
| **Tags** | Étiquettes pour catégoriser |
| **Confiance / cotation** | Niveau de certitude (0-100%) ou cotation Europol / Amirauté, selon le [modèle d'évaluation]({{< relref "evaluation" >}}) du dossier |
| **Source** | Origine de l'information, avec liens cliquables ([voir ci-dessous](#liens-dans-la-source)) |
| **Date** | Date associée (pour la timeline) |
| **Géolocalisation** | Coordonnées (pour la carte) |
| **Propriétés** | Champs personnalisés (clé/valeur) |

### Liens dans la source

Le champ **Source** contient une source par ligne (**Entrée** pour passer à la ligne suivante) et accepte des liens au format Markdown `[libellé](cible)` :

```text
[Pièce 12](asset:3fa1c2d9)
[Article](https://exemple.fr/a)
```

| Cible | Au clic |
|-------|---------|
| `https://…` | Ouvre la page dans un nouvel onglet ; une adresse écrite seule (sans `[libellé]`) est aussi un lien |
| `asset:` + début de l'empreinte SHA-256 du fichier (8 caractères minimum) | Ouvre l'aperçu du fichier joint du dossier |

Hors édition, seuls les libellés s'affichent, une source par ligne ; au-delà de trois, **+N autres** déplie la liste. Cliquez à côté d'un lien pour modifier le texte brut. Un fichier absent du dossier s'affiche grisé. Les autres cibles restent du texte. Certaines extensions ajoutent leurs propres liens.

Dans la matrice, la timeline, les rapports et les exports ANX et Obsidian, les liens sont remplacés par leur libellé (les liens web restent des liens dans les rapports et Obsidian), et les sources tiennent sur une ligne, séparées par « · ». Les exports CSV et JSON gardent le texte tel quel. Dans la matrice, une source de plusieurs lignes se modifie dans le panneau de détail.

### Apparence visuelle

Personnalisez l'apparence de chaque élément :

| Option | Valeurs |
|--------|---------|
| **Couleur** | Palette de 12 couleurs |
| **Forme** | Cercle, carré, losange, hexagone |
| **Taille** | Petit, moyen, grand |
| **Taille du texte** | XS (8px), S (12px), M (14px), L (18px), XL (22px) |

Sélectionnez un élément pour afficher ses poignées de redimensionnement. Maintenez **Alt (⌥)** pendant le glissement d'une poignée pour **conserver les proportions**.

### Verrouillage de position

Empêchez les déplacements accidentels en verrouillant la position d'un élément.

**Verrouiller/Déverrouiller :**
- **Menu contextuel** (clic-droit) → Verrouiller/Déverrouiller la position
- **Panneau Détail** → Section Apparence → Bouton cadenas

**Comportement :**
- Un élément verrouillé ne peut pas être déplacé
- En multi-sélection, verrouiller s'applique à tous les éléments sélectionnés
- Lors d'un déplacement groupé, les éléments verrouillés restent en place

### Événements

Les éléments peuvent avoir des **événements** associés, chacun avec une date, une description et éventuellement une géolocalisation (point ou zone polygonale).

La ville à droite de l'heure indique son fuseau : cliquez dessus pour saisir une heure dans le fuseau de la source. Voir [Dates et fuseaux horaires]({{< relref "dates-timezones" >}}).

### Extraire un événement en élément

Transformez un événement en un élément autonome sur le canvas :

1. Survolez l'événement dans le panneau de détail
2. Cliquez sur l'icône **↗** (Extraire en élément)
3. Un nouvel élément est créé avec le nom de l'événement, relié à l'élément source
4. Les dates de l'événement sont portées par le **lien** (la relation temporelle)

Cette opération est réversible avec **Ctrl+Z**.

---

## Liens

Un lien représente une relation entre deux éléments. Les liens sont des **citoyens de première classe** : ils ont leurs propres métadonnées, pas seulement un trait entre deux points.

### Créer un lien

1. **Glisser** depuis un élément vers un autre élément
2. Le lien est créé avec un label par défaut


### Créer un élément lié

**Glisser** depuis un élément vers le vide pour créer simultanément un nouvel élément et le lien qui les relie.


### Propriétés d'un lien

| Propriété | Description |
|-----------|-------------|
| **Label** | Type de relation (ex: "connaît", "travaille pour") |
| **Notes** | Description détaillée |
| **Confiance / cotation** | Selon le [modèle d'évaluation]({{< relref "evaluation" >}}) du dossier |
| **Source** | Origine de l'information |
| **Période** | Date de début et fin, avec fuseau de la source si besoin ([Dates et fuseaux horaires]({{< relref "dates-timezones" >}})) |
| **Dirigé** | Flèche indiquant le sens |
| **Propriétés** | Champs personnalisés |

### Apparence des liens

| Option | Valeurs |
|--------|---------|
| **Couleur** | Palette de couleurs |
| **Style** | Continu, pointillé, tirets |
| **Épaisseur** | Fine, normale, épaisse |
| **Taille du texte** | XS (8px), S (12px), M (14px), L (18px), XL (22px) |


---

## Sélection multiple

### Rectangle de sélection

Cliquez-glissez sur le fond du canvas pour dessiner un rectangle de sélection.

### Ajouter à la sélection

**Ctrl+clic** pour ajouter ou retirer un élément de la sélection.

### Opérations groupées

Avec plusieurs éléments sélectionnés :

- Appliquer des tags à tous
- Modifier la couleur/forme de tous
- Modifier la taille du texte de tous
- Supprimer tous
- Déplacer en groupe
- Aligner les éléments
- Distribuer les éléments

### Copier / coller

**Ctrl+C** copie les éléments sélectionnés (et les liens qui les relient), **Ctrl+V** les colle (nouveaux identifiants, position sous le curseur). Le copier/couper/coller est aussi disponible dans le menu contextuel.

Le collage fonctionne **d'une enquête à l'autre** : copiez dans un dossier, ouvrez un autre dossier, collez. Le presse-papiers est conservé en mémoire uniquement (rien n'est écrit sur disque, effacé au rechargement). En collage inter-enquêtes, les **pièces jointes** ne sont pas recopiées (elles restent propres à leur dossier d'origine).

### Alignement et distribution

Quand 2 éléments ou plus sont sélectionnés, un bouton **Aligner** apparaît dans la barre d'outils du canvas.

| Action | Description |
|--------|-------------|
| **Gauche** | Aligne tous les éléments sur la position X la plus à gauche |
| **Centre H** | Aligne sur la moyenne des positions X |
| **Droite** | Aligne sur la position X la plus à droite |
| **Haut** | Aligne sur la position Y la plus haute |
| **Centre V** | Aligne sur la moyenne des positions Y |
| **Bas** | Aligne sur la position Y la plus basse |
| **Distribuer H** | Espace régulièrement sur l'axe horizontal (3+ éléments) |
| **Distribuer V** | Espace régulièrement sur l'axe vertical (3+ éléments) |

#### Objet de référence

Par défaut, l'alignement utilise les positions extrêmes ou moyennes du groupe. Vous pouvez choisir un **objet de référence** dans le menu déroulant : tous les autres éléments s'aligneront sur sa position.

Le dernier élément cliqué individuellement (avant ou pendant la sélection) est proposé comme référence. Vous pouvez aussi changer la référence directement dans le menu.

L'opération est réversible avec **Ctrl+Z**.


---

## Groupes

Organisez vos éléments en **groupes** visuels.

### Créer un groupe

1. Sélectionnez plusieurs éléments
2. Clic-droit → **Grouper**

Après une sélection au lasso (Maj + glisser), le clic-droit se fait sur le cadre de sélection.

Le groupe apparaît comme un cadre englobant ses membres. Les groupes et les éléments déjà dans un groupe ne sont pas repris.


### Manipuler un groupe

- **Clic sur le groupe** : sélectionne le groupe entier
- **Double-clic** : entre dans le groupe pour éditer les membres
- **Glisser un élément** dans/hors du groupe pour modifier l'appartenance

---

## Fusionner deux éléments

Combinez deux éléments en un seul lorsqu'ils représentent le même concept.

### Procédure

1. Sélectionnez exactement **2 éléments** (Ctrl+clic)
2. Clic-droit → **Fusionner**
3. Choisissez quel élément conserver (son label et son apparence seront gardés)
4. Confirmez la fusion

### Ce qui est fusionné

| Donnée | Comportement |
|--------|-------------|
| **Tags** | Union (tous les tags des deux éléments) |
| **Propriétés** | Union (doublons évités) |
| **Événements** | Union (dédupliqués par identifiant) |
| **Notes** | Concaténées (séparées par ---) |
| **Fichiers joints** | Union |
| **Confiance** | Maximum des deux valeurs |
| **Cotation** | Celle de l'élément conservé, sinon celle de l'autre élément |
| **Source** | Combinées si différentes, une par ligne |
| **Liens** | Transférés vers l'élément conservé |

### Gestion des liens en doublon

Si les deux éléments partageaient un lien vers le même tiers, les liens sont fusionnés : labels combinés, propriétés et tags unis.

Les liens directs entre les deux éléments fusionnés sont supprimés.

---

**Voir aussi** : [Tags et propriétés]({{< relref "tags-properties" >}})
