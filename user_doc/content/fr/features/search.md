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

{{< hint info >}}
**Texte extrait** : Le contenu textuel des PDF et fichiers texte attaches aux elements est automatiquement indexe. Voir [Fichiers joints - Extraction de texte]({{< relref "attachments#extraction-de-texte" >}}).
{{< /hint >}}

### Recherche floue

La recherche tolère les fautes de frappe mineures :

- "dupond" trouve "Dupont"
- "marie" trouve "Marie", "Mariée"

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

La recherche est optimisée pour rester rapide même sur de gros dossiers :

| Taille | Performance |
|--------|-------------|
| < 1000 éléments | Instantané |
| 1000-10000 | < 100ms |
| > 10000 | < 500ms |

L'index est reconstruit à chaque ouverture de dossier.

---

**Voir aussi** : [Filtres et vues]({{< relref "filters-views" >}})
