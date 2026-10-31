---
title: "Analyse de graphe"
weight: 4
---

# Analyse de graphe

ZeroNeurone utilise des algorithmes de théorie des graphes pour révéler des patterns cachés dans vos données.


## Panneau Insights

Accédez aux analyses via le panneau **Insights** (icône graphique à gauche).

### Actualiser l'analyse

Cliquez sur **Actualiser** pour recalculer les métriques après des modifications.

---

## Rôles

La section **Rôles**, en tête du panneau, dit en une phrase qui tient le réseau :

| Phrase | Sens |
|--------|------|
| « X est le seul lien entre le groupe de A et le groupe de B » | Sans X, les deux groupes ne sont plus reliés |
| « Le lien X – Y est le seul passage entre… » | Supprimer ce lien coupe les groupes ; deux liens parallèles entre X et Y ne comptent pas comme un passage unique |
| « X est le seul accès à N éléments, dont Y » | Ces N éléments ne sont reliés au reste du graphe que par X. Y est le plus relié d'entre eux ; jusqu'à trois éléments, tous sont nommés |
| « X fait le lien entre… » | X touche au moins trois groupes et figure parmi les plus fortes intermédiarités, sans en être le seul lien |

Un groupe est un cluster de Louvain, nommé d'après son membre le plus relié, avec son nombre d'éléments entre parenthèses. Les phrases sont classées par nombre d'éléments séparés ; dix s'affichent, **Voir plus** donne la suite. Au-delà de dix phrases, un champ de recherche garde celles qui citent un nom : tapez-en un pour voir le rôle que joue cet élément.

- **Clic sur une phrase** : met en évidence l'élément et les groupes concernés.
- **Clic sur un nom** : sélectionne l'élément et le cadre à l'écran.

### Ajouter au rapport

L'icône au bout d'une phrase l'ajoute au rapport ; **Tout ajouter (N)** ajoute les N phrases, ou seulement celles que garde la recherche, y compris celles que « Voir plus » n'a pas encore affichées. Un ajout au rapport ne s'annule pas avec Ctrl+Z : effacez le texte dans la section. La liste à gauche choisit la section : **Nouvelle section** en crée une, « Rôles structurels », et les ajouts suivants vont dans celle-ci. Le rapport est créé s'il n'existe pas.

Les noms deviennent des références cliquables, et chaque ajout commence par la date de l'analyse. Les groupes dépendent du graphe au moment du calcul : le texte inséré ne change plus, même si le dossier évolue ensuite. Pour un même graphe, l'analyse donne toujours les mêmes groupes.

---

## Clusters (Communautés)

L'algorithme de Louvain détecte automatiquement les **communautés** : groupes d'éléments plus connectés entre eux qu'avec le reste du graphe.


### Utilisation

| Action | Résultat |
|--------|----------|
| **Voir** | Liste des clusters avec leurs membres |
| **Clic** | Met le cluster en évidence et le cadre à l'écran |
| **Colorer** | Applique une couleur distincte à chaque cluster |

### Interprétation

- Un cluster peut représenter une organisation, un réseau, un groupe d'intérêt
- Les éléments **entre** clusters sont souvent des **ponts** importants

---

## Centralité

La **centralité** mesure l'importance relative de chaque élément dans le réseau.

### Centralité de degré

Nombre de connexions d'un élément.

| Degré | Interprétation |
|-------|----------------|
| Élevé | Hub, connecteur principal |
| Faible | Périphérique, peu connecté |


### Centralité d'intermédiarité (Betweenness)

Fréquence de passage sur les plus courts chemins.

| Betweenness | Interprétation |
|-------------|----------------|
| Élevé | Intermédiaire critique, gatekeeper |
| Faible | Pas sur les chemins principaux |


### Affichage

- **Liste triée** des éléments par centralité
- **Clic** pour sélectionner et centrer sur l'élément
- **Taille selon les liens** : activez **Taille des éléments selon le nombre de liens** dans l'onglet **Vues** du panneau latéral (section **Affichage sur le canvas**) pour que chaque élément grossisse avec son nombre de liens

#### Taille des éléments selon le nombre de liens

Avec ce réglage, un élément est dessiné plus grand selon son nombre de liens : ×1,25 avec 4 liens, ×1,5 avec 9, ×2 avec 25, et au plus ×3 à partir de 81 liens. Un élément qui n'a qu'un lien garde sa taille. L'élément grossit autour de son centre. Tous les liens du dossier comptent, même ceux masqués par un filtre ou situés dans un autre onglet.

- L'agrandissement dépend des seuls liens de l'élément : ajouter un lien ne change pas la taille des autres éléments. Dans un dossier où tous les éléments ont beaucoup de liens, ils grossissent donc tous.
- Le réglage ne déplace pas les éléments : après l'avoir activé, relancez la mise en page automatique, qui laisse la place aux éléments agrandis.
- Seul l'affichage change : désactiver le réglage rend à chaque élément sa taille habituelle. La mise en page automatique et l'export SVG en tiennent compte.
- Le réglage est personnel : il est retenu pour ce dossier sur cet appareil, et les collaborateurs en session partagée gardent leur propre affichage.
- Un élément redimensionné à la main est agrandi à partir de sa propre taille. Le redimensionner pendant que le réglage est actif règle sa taille de base : il continue de suivre ses liens et reprend cette taille quand le réglage est désactivé. Les groupes et les annotations gardent leur taille.

---

## Ponts (Bridges)

Les **ponts** sont les éléments qui connectent des clusters autrement séparés.


### Importance

Supprimer un pont fragmenterait le réseau. Ces éléments sont souvent :

- Intermédiaires clés
- Points de vulnérabilité
- Personnes multi-casquettes

---

## Éléments isolés

Liste des éléments **sans aucune connexion**.


### Actions

- Identifier des données manquantes (liens à créer)
- Nettoyer des éléments orphelins
- Filtrer pour se concentrer sur le réseau connecté

---

## Chemins

Trouvez le **plus court chemin** entre deux éléments.


### Utilisation

1. Sélectionnez deux éléments (Ctrl+clic)
2. **Insights** → **Chemin**
3. Le chemin est surligné sur le canvas

### Interprétation

- **Chemin court** : éléments proches dans le réseau
- **Chemin long** : éléments éloignés, peu de liens directs
- **Pas de chemin** : éléments dans des composantes séparées

### Tous les chemins

Activez **Tous les chemins** pour lister **plusieurs routes** entre les deux éléments (jusqu'aux 200 plus courtes), et non plus seulement la plus courte. Réglez la **profondeur maximale** (nombre de liens, 1 à 8) pour borner la recherche et éviter l'explosion combinatoire sur les réseaux denses. Chaque chemin trouvé est listé (trié du plus court au plus long) ; l'ensemble des routes est surligné sur le canvas, et un clic sur un chemin de la liste met en évidence celui-ci uniquement. Accessible aussi via clic droit sur deux éléments → **Tous les chemins**.


### Contraintes

Le bloc **Contraintes** restreint les liens qu'un chemin peut emprunter :

- **Libellés** et **Tags** : n'emprunter que les liens qui portent l'une des valeurs choisies (**Inclure**), ou jamais ceux-là (**Exclure**) ;
- **Période** : seulement les liens datés dans la période. **Garder les liens non datés** laisse passer ceux qui n'ont pas de date ;
- **Confiance minimale** (modèle ZeroNeurone) ou **cotation minimale** (modèles Europol et Admiralty) : un code retient ce code et tous les codes plus forts, par exemple B sur l'axe source retient A et B. **Garder les liens non cotés** laisse passer les liens sans confiance ni cotation ;
- **Respecter le sens des liens** : un lien orienté ne se parcourt que dans son sens, un lien neutre ou bidirectionnel dans les deux.

Seuls les liens réellement empruntés sont surlignés sur le canvas. Un résultat filtré porte la mention **contraintes appliquées**. Si un chemin existe mais que les contraintes l'excluent, le panneau l'indique, au lieu d'annoncer qu'il n'y a aucun chemin.

Les contraintes sont mémorisées pour chaque dossier, dans ce navigateur. Elles ne s'appliquent qu'aux recherches lancées depuis le panneau : les entrées **Trouver les chemins** et **Tous les chemins** du clic droit cherchent toujours sans contraintes.

---

## Cycles

Détectez les **cycles** (boucles fermées de relations, sans élément répété) dans le réseau. Utile pour repérer des **circuits** — chaînes de transactions circulaires, structures de participations croisées, relations en boucle.

### Utilisation

1. **Insights** → **Détecter les cycles**
2. Réglez la **longueur maximale** (nombre d'éléments dans la boucle, 3 à 10) pour borner la recherche
3. Les cycles trouvés sont listés (triés du plus court au plus long) ; l'ensemble est surligné sur le canvas, un clic sur un cycle met en évidence celui-ci seul

Sur le canvas, seuls les liens qui forment les cycles sont lumineux, parcourus par un pointillé animé. Avec **Respecter le sens des liens**, le pointillé avance dans le sens du circuit : on le suit d'un coup d'œil. Sans ce réglage, la boucle n'a pas de sens : le pointillé fait l'aller-retour, comme pour un lien que deux cycles affichés parcourent en sens opposés. Une relation entre deux éléments d'un cycle qui n'en fait pas partie (une corde) reste normale. Si le système demande de réduire les animations, le pointillé reste fixe.

Un clic sur un **élément** dans la liste met en évidence son cycle, centre la vue sur lui et lui donne une lueur plus forte : on repère d'un coup d'œil où il se trouve dans la boucle. Un clic ailleurs sur la ligne revient au cycle seul.

Chaque cycle n'est listé qu'une fois (les rotations et le sens de parcours équivalents sont dédupliqués). Par défaut la recherche est **non orientée** : la boucle existe indépendamment du sens des liens.

Cochez **Respecter le sens des liens** pour ne garder que les **circuits dirigés** — chaque lien doit être franchi dans son sens (A→B→C→A en suivant les flèches). C'est le mode pertinent pour les circuits financiers ou les flux. Un lien `forward` n'est franchissable que de la source vers la cible, un lien `backward` que dans l'autre sens ; les liens **sans direction** (ou bidirectionnels) restent franchissables dans les deux sens et ne bloquent donc pas un circuit.

---

## Métriques globales

| Métrique | Description |
|----------|-------------|
| **Nœuds** | Nombre total d'éléments |
| **Liens** | Nombre total de connexions |
| **Densité** | Ratio liens existants / liens possibles |
| **Composantes** | Nombre de sous-graphes déconnectés |
| **Diamètre** | Plus long des plus courts chemins |


---

## Layouts automatiques

Réarrangez automatiquement les éléments selon différents algorithmes via le bouton **Arranger** dans la barre d'outils.

### Types de layout

| Layout | Description | Utilisation |
|--------|-------------|-------------|
| **Force (clusters)** | Algorithme physique qui regroupe les éléments connectés | Visualiser les communautés |
| **Hiérarchie** | Organisation par niveaux (arbres, organigrammes) | Structures hiérarchiques |
| **Circulaire** | Disposition en cercle (1 000 éléments au plus) | Vue d'ensemble équilibrée |
| **Grille** | Alignement régulier | Organisation ordonnée |
| **Dispersion** | Répartition aléatoire | Redistribuer les éléments |

### Conseils

- Utilisez **Ctrl+Z** pour annuler un layout
- Au-delà de 1 000 éléments, **Circulaire** est grisé : un seul cercle serait plus large que l'écran, même au zoom minimum. Sélectionnez une partie des éléments (ou travaillez dans un onglet) pour l'utiliser
- Le layout **Hiérarchie** détecte automatiquement les racines (éléments sans liens entrants)
- Le layout **Force** s'adapte à la taille du graphe (optimisé pour les grands réseaux). Les éléments à un seul lien sont rangés en anneaux autour de l'élément qui les porte, niveau par niveau (un groupe et ses objets autour d'un élément central) : un élément très relié reste lisible au lieu d'éparpiller ses voisins
- Un **groupe** se déplace d'un bloc avec ses éléments, quel que soit le layout
- Sélectionner seulement des éléments d'un même groupe les arrange **à l'intérieur** du groupe

---

**Voir aussi** : [Vue carte]({{< relref "map-view" >}})
