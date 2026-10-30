---
title: "Suggestions de liens"
weight: 4
---

# Suggestions de liens

ZeroNeurone repère les liens que vos données laissent supposer : deux personnes avec le même numéro de téléphone, des comptes alimentés par le même IBAN, deux suspects au même endroit au même moment… Il les **propose**, vous **décidez** : rien n'est créé sans votre accord.

---

## Lancer l'analyse

- Onglet **Suggestions** du panneau latéral (icône ampoule) → **Analyser le dossier**
- Ou **clic droit** sur une sélection → **Analyser** → **Suggérer des liens** : l'analyse ne garde que les suggestions qui touchent les éléments sélectionnés

L'analyse ne tourne jamais en arrière-plan : elle se lance à la demande.

### Ce qui est analysé

L'analyse porte sur les **éléments affichés** :

- les [filtres]({{< relref "filters-views" >}}) actifs, les éléments masqués et l'[onglet]({{< relref "canvas-tabs" >}}) courant s'appliquent ;
- une [requête ZNQuery]({{< relref "queries" >}}) appliquée en filtre restreint l'analyse à ses résultats.

Une ligne « N éléments affichés » le signale. Tant que l'onglet est ouvert, la liste suit les changements de filtre, de requête ou d'onglet.

Les liens existants comptent toujours, même vers des éléments masqués : une paire déjà reliée n'est jamais reproposée. Deux éléments déjà reliés **au même élément** ne le sont pas non plus : ils sont déjà connectés. Un élément relié à plus de 50 autres (une unité, une catégorie) ne compte pas comme élément commun, il relie trop de choses pour que ce soit significatif.

Les filtres de colonnes de la [vue matrice]({{< relref "matrix-view" >}}) ne s'appliquent qu'à la matrice : le bouton **Toutes les vues** les transforme en requête appliquée en filtre, que l'analyse suit.

---

## Les règles

Chaque règle se coche ou se décoche dans le panneau. Par exemple, pour ne chercher que des recoupements de lieu et de temps, décochez **Propriétés**, **Sources** et **Zones**.

| Règle | Ce qu'elle repère | Réglages |
|-------|-------------------|----------|
| **Propriétés** | Même valeur pour la même propriété (téléphone, IBAN, email, plaque…) | Propriétés comparées |
| **Sources** | Même pièce jointe, ou même page web citée en source | — |
| **Zones** | Un point ou une petite zone à l'intérieur d'une zone plus grande (un site dans sa commune) | — |
| **Lieux à moins de** | Deux éléments placés à moins d'une distance, sans tenir compte des dates | Rayon |
| **Rencontres à moins de** | Deux éléments au même endroit **au même moment** | Rayon, fenêtre de temps, durée des séjours |

Les réglages sont retenus dans votre navigateur ; ils ne sont pas partagés avec les autres collaborateurs.

### Propriétés : choisir celles à comparer

Le bouton à côté de **Propriétés** (« toutes », ou « 3/12 ») déplie la liste des propriétés texte du dossier, avec le nombre d'éléments qui portent chacune. Décochez celles qui n'identifient rien (une description, une catégorie) pour ne garder que les identifiants : téléphone, IBAN, plaque, numéro de procédure… Un filtre apparaît au-delà de 8 propriétés, avec **Toutes** et **Aucune**.

- Le choix est retenu **par dossier**, dans votre navigateur.
- Une propriété apparue ensuite est cochée par défaut.
- Décocher une propriété ne supprime pas les refus qui la concernent.

### Propriétés : comment les valeurs sont comparées

- Seules les propriétés de **même nom** sont comparées, sans tenir compte de la casse ni des accents (« Téléphone » et « telephone » se recoupent).
- Les écritures d'un même numéro se rejoignent : `06 12 34 56 78`, `+33 6 12 34 56 78`, `06.12.34.56.78`. Un email est comparé en minuscules ; un identifiant (IBAN, SIREN, plaque) sans espaces ni tirets.
- **Anti-bruit** : une valeur de texte libre partagée par plus de la moitié des éléments qui ont cette propriété (un statut « En service », une banque, un pays) est ignorée. Une date écrite en texte (`2020-11-27`) est traitée comme du texte libre.
- Un **identifiant** partagé par beaucoup d'éléments n'est **jamais** écarté : 90 victimes qui versent au même IBAN, c'est la trouvaille.

### Deux éléments ou plus

| Partagée par | Proposition |
|--------------|-------------|
| 2 éléments | Un **lien** entre eux |
| 3 éléments ou plus | Un **pivot** : créer un élément pour la valeur (le téléphone, l'IBAN, le document) et le relier à tous |
| — | Si un élément porte déjà cette valeur comme nom, la proposition est de **relier à cet élément** plutôt que d'en créer un second |

### Lieux et rencontres

**Lieux à moins de** compare la position des éléments sur la carte, sans les dates : deux lieux proches.

Le rayon et la fenêtre se saisissent librement, avec leur unité (m ou km ; min, h ou jours), de 1 m à 100 km et de 1 min à 365 jours. La valeur s'applique à l'Entrée ou en quittant le champ.

**Rencontres à moins de** compare les **présences datées** : les événements datés et géolocalisés de chaque élément, et l'élément lui-même s'il a une position et une date. Les propriétés de date retenues dans les [filtres]({{< relref "filters-views" >}}) comptent aussi, à la position de l'élément : un dossier importé avec des dates en propriétés fonctionne sans événements. Une propriété `date` (sans heure) couvre la journée : choisissez alors une fenêtre en jours.

- Deux présences comptent si elles sont à moins du **rayon** et que leurs moments se recouvrent, à la **fenêtre** près.
- **Séjours jusqu'à** : une présence plus longue que ce réglage (un domicile, un siège ou un bail datés sur des années) est ignorée. C'est une existence, pas une rencontre. Par défaut 7 jours ; « sans limite » la réintègre.
- Un point qui croise plus de 10 autres éléments dans le rayon est une **foule** (un stade, une gare, une trace GPS dense) : il ne produit pas de suggestion. Le panneau indique combien d'éléments ont été ignorés ; filtrer **entre deux tags** les garde.

La raison indique :

- **« Ensemble à 33 m, 12/03/2026 14:00 »** quand les deux étaient là au même moment ;
- **« À 50 m, 12/03/2026 09:00 puis 12/03/2026 10:50 »** quand la fenêtre a toléré un écart ;
- **« (N fois) »** quand la paire s'est croisée à plusieurs reprises.

L'heure et la distance affichées sont celles des points réels.

### Entre deux tags

La ligne **Entre [tag] et [tag]** restreint les suggestions à celles qui relient un élément du premier tag à un élément du second, pour toutes les règles. Seuls les tags présents dans l'onglet ouvert sont proposés. Un seul tag compare ses éléments entre eux (le second champ affiche « même tag ») ; la croix efface le filtre.

Dans ce mode, les règles **Lieux à moins de** et **Rencontres à moins de** comparent chaque élément d'un tag à chaque élément de l'autre, sans limite de foule (d'ordinaire, un point qui a plus de 10 voisins ne produit rien). Quand l'un des deux est une zone (polygone), la distance est mesurée jusqu'au bord de la zone ; un point situé dans la zone est signalé par la règle **Zones**. Sur chaque ligne, l'élément du premier tag est cité en premier.

Exemples : des infractions à proximité de sites importés en GeoJSON ; des infractions proches dans l'espace et le temps (tag Infraction seul, 5 km, ±15 jours) pour repérer des séries.

{{< hint warning >}}
**Une suggestion n'est pas une preuve.** Une rencontre peut être une coïncidence ; une valeur partagée, une erreur de saisie. Vérifiez les éléments d'origine avant d'accepter, et gardez un petit rayon pour les rencontres.
{{< /hint >}}

---

## Traiter les suggestions

- **Survol** d'une suggestion : ses éléments sont mis en évidence sur le canvas et le lien proposé apparaît en pointillés animés
- **Clic** sur la suggestion : sélectionne ses éléments
- **Clic sur « Créer et relier N éléments »** (ou « Relier N éléments ») d'un pivot : déplie la liste de ses éléments, dont chaque nom se clique comme ci-dessous
- **Clic sur le nom** d'un élément : il est sélectionné seul et centré dans la vue courante (canvas, carte ou timeline), et un résumé s'affiche sous la ligne (tags, 6 premières propriétés, lien **Ouvrir la fiche** vers l'onglet Détail). Un second clic sur le nom le masque. Chaque élément est sur sa propre ligne ; un nom long passe à la ligne (2 lignes au plus)
- **Pertinence / Distance / Date**, à côté du compteur (affiché quand des suggestions ont une distance ou une date) : en tri par distance, les lieux, rencontres et zones passent en tête, du plus proche au plus loin (un point dans une zone compte pour 0 m) ; en tri par date, les rencontres passent en tête, de la plus récente à la plus ancienne (date de la première rencontre) ; les autres suivent dans leur ordre. Le bouton à côté inverse l'ordre, quel que soit le tri ; les suggestions sans distance ou sans date restent en fin de liste
- **✓** accepte, **✕** écarte
- **Cocher une ligne** cadre le canvas sur ses éléments et garde le lien proposé en pointillés, même en passant sur un autre onglet du panneau, jusqu'à ce qu'elle soit décochée, acceptée ou écartée. Ce lien n'est pas créé dans le dossier
- **Cocher plusieurs lignes** (ou la case de tête pour tout cocher) affiche **Accepter (N)** et **Écarter (N)**
- Le champ **Rechercher** filtre la liste par nom d'élément ou par texte des raisons

Accepter et écarter s'annulent avec **Ctrl+Z**, y compris une acceptation groupée (un seul Ctrl+Z).

### Ce que garde un lien accepté

Le lien créé conserve la preuve qui l'a justifié :

| Champ du lien | Contenu |
|---------------|---------|
| **Libellé** | La raison principale : « même téléphone », « même source », « situé dans », « à proximité », « co-présence » |
| **Notes** | Le texte complet de toutes les raisons, tel qu'affiché dans le panneau |
| **Propriétés** | Chaque valeur partagée (`téléphone = 06 12 34 56 78`) |
| **Source** | La page web ou la pièce jointe partagée |
| **Date / période** | Le moment de la rencontre : le lien apparaît sur la [timeline]({{< relref "timeline" >}}) |

Un pivot accepté crée l'élément (avec la propriété en tag, et la pièce jointe ou la page s'il s'agit d'une source) et le relie à tous les éléments concernés.

---

## Suggestions écartées

Une suggestion écartée ne revient pas aux analyses suivantes.

- Le lien **Écartées (N)** affiche les suggestions écartées ; **Rétablir** les remet dans la liste (annulable avec Ctrl+Z).
- Un refus porte sur **une raison** : écarter « à 80 m » n'empêche pas la même paire d'être proposée plus tard pour un téléphone partagé.
- Les refus sont **partagés** en [collaboration]({{< relref "collaboration" >}}) et conservés à l'export ZIP.
- Ils ne contiennent **aucune valeur en clair** (numéro, IBAN) et sont nettoyés automatiquement quand les éléments ou les valeurs concernés disparaissent du dossier. Décocher une règle ne supprime jamais ses refus.

---

## Gros dossiers

L'analyse tient des dossiers de plusieurs milliers d'éléments et de dizaines de milliers d'événements datés. La liste affiche les suggestions par tranches de 200 : le bouton **N de plus** affiche les 200 suivantes. Utilisez la recherche ou les filtres pour cibler.

Si le message **« Rencontres interrompues : trop de positions pour ce rayon et cette fenêtre »** apparaît, réduisez le rayon ou la fenêtre des rencontres.

---

**Voir aussi** : [Analyse de graphe]({{< relref "graph-analysis" >}}), [Vue carte]({{< relref "map-view" >}}), [Éléments et liens]({{< relref "elements-links" >}})
