---
title: "Rapport"
weight: 9
---

# Panel Rapport

Rédigez des rapports structurés avec références aux éléments de votre dossier.

---

## Accéder au rapport

Panneau latéral → Onglet **Rapport**

---

## Créer un rapport

Si aucun rapport n'existe, cliquez sur **Créer un rapport**.

Un rapport est composé de :
- Un **titre** (modifiable en haut du panneau)
- Des **sections** contenant du texte Markdown

---

## Gérer les sections

### Ajouter une section

Cliquez sur **Ajouter une section** en bas du panneau.

### Réorganiser les sections

Glissez-déposez la poignée à gauche de chaque section.

### Supprimer une section

Cliquez sur l'icône de suppression dans l'en-tête de la section.

### Développer/Réduire

Cliquez sur la flèche pour développer ou réduire le contenu d'une section.

---

## Éditer le contenu

### Mode lecture / écriture

Chaque section dispose d'un bouton crayon/check :

| Icône | Mode | Comportement |
|-------|------|--------------|
| ✏️ Crayon | Lecture | Cliquer sur un lien navigue vers l'élément |
| ✓ Check | Écriture | Le texte est modifiable |

- **Mode lecture** : Visualisez le rendu Markdown. Les liens vers les éléments sont cliquables et vous amènent sur le canvas.
- **Mode écriture** : Éditez le contenu. Cliquez sur ✓ pour valider et synchroniser.

### Édition collaborative

En travail collaboratif :
- Un **indicateur de verrouillage** apparaît quand un autre utilisateur édite une section
- Le nom et la couleur de l'utilisateur sont affichés sous l'éditeur
- Attendez qu'il termine (clic sur ✓) avant de pouvoir éditer cette section
- Les modifications se synchronisent automatiquement après validation

### Syntaxe Markdown

Le contenu supporte le Markdown complet :

```markdown
## Titre de section
Texte normal avec **gras** et *italique*.

- Liste à puces
- Autre élément

1. Liste numérotée
2. Second point

> Citation

`code inline`

[Lien externe](https://example.com)
```

---

## Référencer des éléments

### Insérer un lien

1. Passez en mode écriture (crayon)
2. Tapez `[[`
3. Sélectionnez l'élément dans la liste déroulante
4. Le lien s'insère au format `[[Nom|uuid]]`

### Format des liens

```
[[Sophie Fontaine|0041b30f-89c6-4d38-9899-be0ebce0ea25]]
```

Le label peut être personnalisé :
```
[[La directrice|0041b30f-89c6-4d38-9899-be0ebce0ea25]]
```

### Comportement des liens

| Mode | Clic sur lien | Résultat |
|------|---------------|----------|
| Lecture | Clic normal | Navigue vers l'élément sur le canvas |
| Écriture | Clic normal | Révèle le format `[[...]]` pour édition |

### Éléments supprimés

Si un élément référencé est supprimé, le lien apparaît barré avec la mention "(deleted)".

---

## Exporter le rapport

### Barre d'export

En haut du panneau, utilisez :

| Icône | Fonction |
|-------|----------|
| 🔗 / 🔗̸ | Basculer entre export avec/sans liens internes |
| ⬇️ | Télécharger en Markdown |
| 🌐 | Exporter en HTML interactif |

### Export HTML interactif

Crée un fichier HTML autonome contenant :
- Le contenu du rapport rendu en HTML
- Un graphe SVG interactif avec pan & zoom
- Navigation bidirectionnelle (clic références → zoom sur l'élément, clic nœuds → défilement vers les références)
- Table des matières repliable
- Modale infos avec métadonnées du dossier et statistiques
- Basculement thème clair/sombre
- Bouton export Markdown (sans liens internes)
- **Recherche** (Ctrl+K) : recherche par label et tags avec navigation clavier
- **Filtrage par tags** : popover dans l'en-tête pour filtrer les nœuds et liens par tag
- **Images embarquées** : miniatures affichées directement dans les formes du graphe SVG
- **Inversion du layout** : bouton pour permuter rapport/graphe gauche-droite (persisté)
- **Colonnes redimensionnables** : poignée de redimensionnement entre le rapport et le graphe

{{< hint info >}}
Idéal pour partager des rapports avec des personnes n'ayant pas ZeroNeurone.
{{< /hint >}}

### Avec liens internes

Le format `[[Label|uuid]]` est conservé. Utile si vous réimportez le rapport plus tard.

### Sans liens internes

Les liens sont remplacés par le label seul. Exemple :
- Avant : `[[Sophie Fontaine|abc123]]`
- Après : `Sophie Fontaine`

---

## Copier et coller

### Coller depuis le canvas

Copiez des éléments sur le canvas (Ctrl+C) puis collez dans le rapport (Ctrl+V). Les références sont automatiquement insérées au format `[[Label|uuid]]`.

### Copier depuis le rapport

Quand vous sélectionnez du texte dans le rapport et copiez (Ctrl+C), les liens vers les éléments sont préservés au format `[[Label|uuid]]`. Vous pouvez les coller :
- Dans une autre section du même rapport
- Dans un autre rapport
- Dans un éditeur de texte externe (le format est conservé)

---

## Bonnes pratiques

1. **Structurez en sections** : Utilisez des sections distinctes pour contexte, analyse, conclusions
2. **Utilisez les références** : Liez les éléments clés pour faciliter la navigation
3. **Labels personnalisés** : Adaptez le texte affiché au contexte du rapport
4. **Export régulier** : Sauvegardez en Markdown pour archivage externe

---

**Voir aussi** : [Éléments et liens]({{< relref "elements-links" >}})
