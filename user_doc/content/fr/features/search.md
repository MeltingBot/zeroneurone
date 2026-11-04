---
title: "Recherche"
weight: 8
---

# Recherche

Trouvez rapidement n'importe quel élément ou lien dans votre dossier.


## Recherche rapide

### Ouvrir la recherche

| Méthode | Action |
|---------|--------|
| **Ctrl+K** | Raccourci clavier |
| **🔍** | Bouton dans la barre d'outils |

### Rechercher

1. Tapez votre recherche
2. Les résultats apparaissent en temps réel
3. Naviguez avec ↑↓
4. Entrée pour sélectionner


---

## Contenu indexé

La recherche porte sur :

| Champ | Poids |
|-------|-------|
| **Label** | Eleve |
| **Notes** | Moyen |
| **Tags** | Moyen |
| **Proprietes** | Normal |
| **Texte extrait** | Normal |
| **Commentaires** | Normal |

{{< hint info >}}
**Texte extrait** : Le contenu textuel des PDF, DOCX, ODT et fichiers texte attaches aux elements est automatiquement indexe. Voir [Fichiers joints - Extraction de texte]({{< relref "attachments#extraction-de-texte" >}}).
{{< /hint >}}

### Large ou Strict

Deux boutons à droite du champ règlent la tolérance. Le choix est mémorisé.

| Mode | Fautes de frappe | Plusieurs mots | Début de mot |
|------|------------------|----------------|--------------|
| **Large** (par défaut) | Tolérées : "dupond" trouve "Dupont" | Un seul suffit | Accepté pour chaque mot |
| **Strict** | Aucune | Tous doivent être présents | Seulement pour le dernier mot tapé |

Exemple : "jean martin" trouve en **Large** tous les Jean et tous les Martin, en **Strict** seulement Jean Martin.

---

## Résultats

### Affichage

Chaque résultat montre :

- **Icône** : Type (élément ou lien)
- **Label** : Nom de l'élément/lien
- **Contexte** : Extrait du texte correspondant
- **Tags** : Premiers tags


### Actions

| Action | Résultat |
|--------|----------|
| **Clic / Entrée** | Sélectionne et centre sur le canvas |
| **Ctrl+clic** | Ajoute à la sélection |
| **Échap** | Ferme la recherche |

---

## Filtres de recherche

### Par type

Préfixez votre recherche pour cibler :

| Préfixe | Recherche |
|---------|-----------|
| `e:` | Éléments uniquement |
| `l:` | Liens uniquement |
| `t:` | Par tag |

Exemples :
- `e:dupont` → Éléments contenant "dupont"
- `t:suspect` → Éléments avec le tag "suspect"

### Par propriété

Recherchez par propriété :

- `prop:telephone` → Éléments ayant une propriété "telephone"
- `prop:telephone:0612` → Valeur contenant "0612"

---

## Historique

Les recherches récentes sont mémorisées :


- Cliquez sur une recherche récente pour la relancer
- L'historique est par dossier

---

## Performance

L'index est reconstruit à chaque ouverture de dossier. Sur un gros dossier, il se construit par tranches : l'écran reste utilisable, et la barre d'activité affiche **Indexation de la recherche** jusqu'à la fin. Une recherche lancée pendant ce temps porte sur la partie déjà indexée ; la fenêtre de recherche la relance une fois l'index complet.

Un mot se trouve en moins de 20 ms sur 10 000 éléments à 50 propriétés. Le début d'un identifiant (numéro, hash) peut prendre 0,4 s quand le dossier contient beaucoup de valeurs uniques. Détail dans [Limites et performances]({{< relref "../reference/performance" >}}).

---

**Voir aussi** : [Filtres et vues]({{< relref "filters-views" >}})
