---
title: "Tags et propriétés"
weight: 2
---

# Tags et propriétés

Enrichissez vos éléments et liens avec des **tags** pour la catégorisation et des **propriétés** pour les données structurées.

## Tags

Les tags sont des étiquettes libres pour catégoriser vos éléments et liens.

### Ajouter des tags

1. Sélectionnez un élément ou lien
2. Dans le panneau de détail, section **Tags**
3. Tapez un nouveau tag ou sélectionnez un existant


### Tags suggérés

ZeroNeurone suggère les tags déjà utilisés dans le dossier pour maintenir la cohérence.

### Renommer un tag

Renommez un tag partout dans le dossier courant :

1. Dans le panneau de détail, survolez le tag et cliquez sur l'icône **crayon** (ou double-cliquez sur le nom)
2. Saisissez le nouveau nom, validez avec **Entrée** (Échap pour annuler)

Le renommage s'applique à **tous les éléments et liens du dossier courant** qui portent ce tag, ainsi qu'à la liste de suggestions. Si le tag correspond à un jeu de tags, son apparence (icône, couleur, forme) est reprise sous le nouveau nom. Les autres dossiers ne sont pas affectés.

### Filtrer par tags

Utilisez le panneau **Filtres** pour afficher uniquement les éléments avec certains tags.


### Jeux de tags

Les jeux de tags sont des modèles prédéfinis qui associent à chaque tag une apparence et des propriétés suggérées.

**Accéder au gestionnaire** : Menu **⋯** → **Paramètres** → **Jeux de tags**

Chaque jeu de tags définit :

| Attribut | Description |
|----------|-------------|
| **Nom** | Nom unique du tag |
| **Description** | Description du concept |
| **Couleur** | Couleur par défaut appliquée à l'élément |
| **Forme** | Forme par défaut (cercle, carré, losange, rectangle, hexagone) |
| **Icône** | Icône associée |
| **Propriétés suggérées** | Liste de propriétés pré-typées proposées à l'ajout du tag |

Lorsque vous appliquez un tag issu d'un jeu à un élément, son apparence (couleur, forme) est automatiquement définie et les propriétés suggérées sont proposées.

**Import/Export** : Les jeux de tags peuvent être exportés et importés au format JSON ou CSV pour les partager entre dossiers. Les icônes personnalisées référencées sont embarquées dans le JSON. Les jeux de tags utilisés dans un dossier sont également inclus dans l'export du dossier (ZIP/JSON) et recréés à l'import s'ils n'existent pas déjà.

### Icônes personnalisées (SVG)

En plus des icônes intégrées (Lucide), vous pouvez importer vos propres icônes SVG — par exemple des logos de services (GitHub, Discord…) téléchargés depuis [Simple Icons](https://simpleicons.org) :

1. Ouvrez le sélecteur d'icône (jeu de tags, ou icône d'un tag dans le panneau de détail)
2. Dans la section **Mes icônes**, cliquez sur le bouton d'import et choisissez un fichier `.svg` (64 Ko max)
3. L'icône est nettoyée (scripts et références externes supprimés), passée en monochrome et suit automatiquement la couleur du thème

Les icônes importées sont globales (disponibles dans tous les dossiers) et voyagent dans les exports de dossiers et de jeux de tags. Pour en supprimer une, survolez-la dans le sélecteur et cliquez sur la corbeille.

> **Licences** : ZeroNeurone n'embarque aucun logo de marque. Si vous importez le logo d'un service, son usage relève de votre responsabilité (droit des marques).

**Jeux intégrés** : ZeroNeurone fournit des jeux de tags par défaut (Personne, Entreprise, Compte bancaire, Lieu…). Ils ne peuvent pas être supprimés mais peuvent être modifiés. Le bouton **Réinitialiser** restaure les jeux par défaut.

### Affichage des tags sur le canvas

Dans le panneau **Vues**, configurez l'affichage des tags :

| Option | Description |
|--------|-------------|
| **Aucun** | Tags masqués |
| **Premier** | Affiche seulement le premier tag |
| **Tous** | Affiche tous les tags |

---

## Propriétés personnalisées

Les propriétés permettent d'ajouter des données structurées à vos éléments et liens.

### Types de propriétés

| Type | Utilisation |
|------|-------------|
| **Texte** | Chaîne libre |
| **Nombre** | Valeur numérique |
| **Date** | Date avec sélecteur |
| **Booléen** | Oui/Non |
| **URL** | Lien cliquable |
| **Email** | Adresse email |
| **Téléphone** | Numéro de téléphone |
| **Date & heure** | Date et heure avec sélecteur |
| **Choix** | Liste déroulante avec options prédéfinies |
| **Géo** | Coordonnées géographiques (point ou polygone) |
| **Pays** | Sélecteur de pays (avec drapeau) |
| **Lien** | Référence vers un autre élément du dossier |

### Ajouter une propriété

1. Sélectionnez un élément
2. Section **Propriétés** dans le panneau de détail
3. Cliquez **+ Ajouter une propriété**
4. Choisissez le type et entrez la valeur


### Propriétés prédéfinies

Créez des modèles de propriétés pour accélérer la saisie :

1. Menu **⋯** → **Paramètres** → **Propriétés**
2. Définissez vos propriétés avec nom, type et valeurs par défaut


### Afficher les propriétés sur le canvas

1. Panneau **Vues** → **Affichage des propriétés**
2. Cochez les propriétés à afficher comme badges


### Extraire une propriete en element

Transformez une propriete en un element autonome sur le canvas :

1. Survolez la propriete dans le panneau de detail
2. Cliquez sur l'icone **↗** (Extraire en element)
3. Un nouvel element est cree avec le nom de la propriete, relie a l'element source

L'operation est reversible avec **Ctrl+Z**.

---

## Confiance et source

### Niveau de confiance

Chaque élément et lien peut avoir un niveau de confiance (0-100%).


| Niveau | Signification suggérée |
|--------|------------------------|
| 0-25% | Rumeur, non vérifié |
| 25-50% | Source unique, à confirmer |
| 50-75% | Sources multiples |
| 75-100% | Vérifié, documenté |

### Indicateur visuel

Activez l'indicateur de confiance dans **Vues** pour voir le niveau directement sur le canvas (bordure colorée).


### Source

Documentez l'origine de chaque information :

- Document de référence
- Témoignage
- Base de données
- Observation directe

---

## Dates et périodes

### Date simple

Pour les éléments : une date unique (événement ponctuel).

### Période (liens)

Pour les liens : date de début et date de fin optionnelle.


Ces dates sont utilisées par la **Timeline** pour la visualisation chronologique.

---

**Voir aussi** : [Filtres et vues]({{< relref "filters-views" >}})
