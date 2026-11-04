---
title: "Limites et performances"
weight: 4
---

# Limites et performances

Ce que ZeroNeurone tient, mesuré, et ce qui ne l'a pas encore été.

{{< hint info >}}
**Conditions de mesure** : version 2.89.2 de production, Chromium, chiffrement désactivé, un poste de développement récent, une mesure par taille. Sur une machine plus modeste, avec le chiffrement ou dans un autre navigateur, comptez plus lent. Ce sont des ordres de grandeur, pas des garanties.
{{< /hint >}}

## Le principe

Un dossier ouvert est chargé **entier en mémoire**. Ce n'est donc pas la place sur le disque qui limite (500 000 propriétés tiennent en moins de 70 Mo), mais la mémoire de l'onglet et le temps d'ouverture.

ZeroNeurone est fait pour un **graphe d'analyse** : quelques milliers à 10 000 éléments, quelques dizaines de propriétés chacun. Il n'est pas fait pour stocker des données brutes en masse. Au-delà de quelques centaines de milliers de propriétés, triez avant d'importer.

## Mesures

Dossiers fictifs, 1,5 lien par élément, une valeur de propriété sur deux unique (numéros, identifiants), l'autre répétée.

| Dossier | Propriétés au total | Import | Ouverture | Plus long gel à l'ouverture | Mémoire |
|---|---|---|---|---|---|
| 500 éléments × 10 propriétés | 5 000 | 2,4 s | 1,2 s | moins de 0,1 s | 46 Mo |
| 2 000 × 20 | 40 000 | 3,5 s | 1,2 s | 0,2 s | 69 Mo |
| 5 000 × 50 | 250 000 | 9,5 s | 2,6 s | 0,6 s | 185 Mo |
| 10 000 × 50 | 500 000 | 20 s | 3,2 s | 1,2 s | 350 Mo |

- **Ouverture** : de la page rechargée au dossier affiché.
- **Plus long gel** : le plus long moment où l'écran ne répond pas. Sur un gros dossier, c'est la lecture du dossier stocké.
- **Modifier une propriété** ne fige pas l'écran, même à 10 000 × 50.

## Recherche

L'index est reconstruit à chaque ouverture. Sur un gros dossier, il se construit par tranches : l'écran reste utilisable, et la barre d'activité affiche **Indexation de la recherche** jusqu'à la fin (moins d'une seconde à 10 000 × 50).

| Recherche, à 10 000 × 50 | Temps |
|---|---|
| Un mot, exact ou avec faute de frappe | moins de 20 ms |
| Le début d'un identifiant (`+3360…`) | 0,4 s |

Le début d'un identifiant est plus lent quand le dossier contient beaucoup de valeurs uniques : chaque numéro est un mot distinct de l'index. À 40 000 propriétés, c'est 40 ms.

## Matrice

La matrice affiche une colonne par clé de propriété. C'est le **nombre de clés différentes** qui compte, pas le nombre d'éléments.

| Clés différentes | Défilement |
|---|---|
| 50 | fluide |
| 400 | saccadé (une image sur deux en retard, pics à 0,1 s) |

Avec beaucoup de clés, masquez les colonnes inutiles (bouton **Afficher/masquer les colonnes**).

## Pas encore mesuré

- Avec le **chiffrement** activé.
- Sur **Firefox** et **Safari**.
- En **collaboration**, sur un gros dossier.
- Avec beaucoup de **fichiers joints** dont le texte est extrait (il est lu à l'ouverture).

**Voir aussi** : [FAQ — Et les gros dossiers ?]({{< relref "../faq" >}}), [Onglets du canvas]({{< relref "../features/canvas-tabs" >}})
