# zeroneurone — Guidelines Design

## Destination : Claude Code

Ce document définit l'identité visuelle et les règles de design. **À respecter strictement.**

---

## Philosophie design

**Minimaliste. Professionnel. Efficace.**

L'interface doit disparaître. L'utilisateur voit son travail, pas l'outil.

Pense : éditeur de code, outil pro, application de trading. Pas : app grand public, SaaS marketing, dashboard coloré.

---

## Ce qu'on NE VEUT PAS

| Interdit | Pourquoi |
|----------|----------|
| Emojis dans l'interface | Pas pro |
| "Welcome!", "Great job!", "Oops!" | Texte inutile |
| Coins très arrondis (rounded-xl, rounded-2xl) | Fait "app mobile" |
| Ombres prononcées (shadow-lg, shadow-xl) | Lourd |
| Dégradés colorés | Distraction |
| Animations décoratives | Bruit visuel |
| Icônes colorées | Surcharge |
| Boutons multicolores | Carnaval |
| Cards avec bordures épaisses | Années 2010 |
| Texte en gras partout | Illisible |
| Messages d'encouragement | Infantilisant |
| Placeholders "fun" | Pas pro |
| Tutoriels intrusifs | Friction |

---

## Ce qu'on VEUT

| Principe | Application |
|----------|-------------|
| Densité d'information | Beaucoup d'info visible, peu d'espace perdu |
| Contraste par la typographie | Tailles et graisses, pas couleurs |
| Couleurs fonctionnelles | Couleur = information (sélection, alerte, état) |
| Espace blanc maîtrisé | Respiration sans vide |
| Bordures fines | 1px, couleurs neutres |
| Icônes monochromes | Une seule couleur, style cohérent |
| Textes courts | Libellés concis, pas de phrases |
| États clairs | Visible immédiatement ce qui est actif/sélectionné |

---

## Palette de couleurs

### Couleurs de base

```css
/* Fond */
--bg-primary: #ffffff;        /* Fond principal */
--bg-secondary: #f9fafb;      /* Fond secondaire (panneaux) */
--bg-tertiary: #f3f4f6;       /* Fond tertiaire (hover) */

/* Texte */
--text-primary: #111827;      /* Texte principal */
--text-secondary: #6b7280;    /* Texte secondaire */
--text-tertiary: #9ca3af;     /* Texte désactivé/hint */

/* Bordures */
--border-default: #e5e7eb;    /* Bordure standard */
--border-strong: #d1d5db;     /* Bordure accentuée */

/* Accent (utilisé avec parcimonie) */
--accent: #2563eb;            /* Bleu — sélection, focus, actions principales */
--accent-light: #eff6ff;      /* Fond sélection légère */
```

### Couleurs fonctionnelles

```css
/* États */
--selected: #2563eb;          /* Élément sélectionné */
--hover: #f3f4f6;             /* Survol */
--focus: #2563eb;             /* Focus clavier */

/* Feedback */
--success: #059669;           /* Vert — confirmation */
--warning: #d97706;           /* Orange — attention */
--error: #dc2626;             /* Rouge — erreur */

/* Insights */
--highlight: #fef3c7;         /* Jaune pâle — mise en évidence */
```

### Utilisation

- **Accent bleu** : uniquement pour la sélection, le focus, et le bouton d'action principal
- **Pas de couleurs dans le texte** sauf erreurs/alertes
- **Icônes** : `text-secondary` par défaut, `text-primary` au hover

---

## Typographie

### Police

```css
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
```

Pas de police custom. System font stack = rapide, natif, lisible.

### Échelle

| Usage | Taille | Graisse | Classe Tailwind |
|-------|--------|---------|-----------------|
| Titre page | 18px | 600 | `text-lg font-semibold` |
| Titre section | 14px | 600 | `text-sm font-semibold` |
| Label | 14px | 500 | `text-sm font-medium` |
| Texte courant | 14px | 400 | `text-sm` |
| Texte secondaire | 13px | 400 | `text-xs text-secondary` |
| Hint/placeholder | 13px | 400 | `text-xs text-tertiary` |

### Règles

- Pas de texte en dessous de 12px
- Pas de MAJUSCULES pour les labels (sauf acronymes)
- Pas de gras pour tout un paragraphe
- Line-height confortable : 1.5 pour le texte, 1.25 pour les labels

---

## Espacement

### Échelle (Tailwind)

| Espace | Valeur | Usage |
|--------|--------|-------|
| `p-1` / `gap-1` | 4px | Entre icône et texte |
| `p-2` / `gap-2` | 8px | Padding interne petit |
| `p-3` / `gap-3` | 12px | Padding standard |
| `p-4` / `gap-4` | 16px | Séparation sections |
| `p-6` / `gap-6` | 24px | Marges de page |

### Règles

- Cohérence : même espacement pour mêmes usages
- Densité : préférer `p-2` et `p-3` à `p-4` et plus
- Pas d'espace excessif entre les éléments

---

## Composants

### Boutons

```jsx
/* Bouton principal — utilisé 1 fois par écran max */
<button className="px-3 py-1.5 text-sm font-medium text-white bg-accent rounded hover:bg-blue-700">
  Créer
</button>

/* Bouton secondaire — le plus courant */
<button className="px-3 py-1.5 text-sm font-medium text-primary bg-transparent border border-default rounded hover:bg-tertiary">
  Annuler
</button>

/* Bouton ghost — pour les actions moins importantes */
<button className="px-2 py-1 text-sm text-secondary hover:text-primary hover:bg-tertiary rounded">
  Supprimer
</button>

/* Bouton icône */
<button className="p-1.5 text-secondary hover:text-primary hover:bg-tertiary rounded">
  <IconX size={16} />
</button>
```

**Règles :**
- Un seul bouton "principal" (bleu) par écran/modal
- Boutons secondaires pour le reste
- Taille compacte (`py-1.5`, pas `py-3`)
- Coins légèrement arrondis (`rounded`, pas `rounded-lg`)

### Inputs

```jsx
/* Input standard */
<input 
  className="w-full px-2 py-1.5 text-sm border border-default rounded focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
  placeholder="Nom de l'élément"
/>

/* Textarea */
<textarea 
  className="w-full px-2 py-1.5 text-sm border border-default rounded resize-none focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
  rows={3}
  placeholder="Notes..."
/>

/* Select */
<select className="px-2 py-1.5 text-sm border border-default rounded focus:outline-none focus:border-accent">
  <option>Option 1</option>
</select>
```

**Règles :**
- Bordure fine, grise
- Focus : bordure bleue + ring subtil
- Placeholder en gris clair, texte court
- Pas de label flottant, label au-dessus

### Tags/Chips

```jsx
/* Tag */
<span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-tertiary text-secondary rounded">
  suspect
  <button className="ml-1 hover:text-primary">
    <IconX size={12} />
  </button>
</span>
```

**Règles :**
- Fond gris neutre, pas de couleur
- Petit (`text-xs`, `py-0.5`)
- Bouton supprimer discret

### Panneaux / Sections

```jsx
/* Panneau latéral */
<aside className="w-72 border-l border-default bg-secondary">
  <div className="p-3 border-b border-default">
    <h2 className="text-sm font-semibold">Détail</h2>
  </div>
  <div className="p-3">
    {/* Contenu */}
  </div>
</aside>

/* Section dans un panneau */
<section className="mb-4">
  <h3 className="mb-2 text-xs font-semibold text-secondary uppercase tracking-wide">
    Propriétés
  </h3>
  {/* Contenu */}
</section>
```

**Règles :**
- Bordures pour séparer, pas de shadows
- Titres de section en petites majuscules, gris
- Padding cohérent

### Listes

```jsx
/* Liste simple */
<ul className="divide-y divide-default">
  <li className="py-2 hover:bg-tertiary cursor-pointer">
    <span className="text-sm">Item 1</span>
  </li>
</ul>

/* Liste avec icône */
<li className="flex items-center gap-2 py-2">
  <IconFile size={16} className="text-secondary" />
  <span className="text-sm truncate">document.pdf</span>
  <span className="text-xs text-tertiary">2.3 MB</span>
</li>
```

### Modals

```jsx
/* Overlay */
<div className="fixed inset-0 bg-black/50 flex items-center justify-center">
  
  /* Modal */
  <div className="bg-primary rounded shadow-lg w-[480px] max-h-[80vh] overflow-hidden">
    
    /* Header */
    <div className="flex items-center justify-between px-4 py-3 border-b border-default">
      <h2 className="text-sm font-semibold">Titre modal</h2>
      <button className="p-1 hover:bg-tertiary rounded">
        <IconX size={16} />
      </button>
    </div>
    
    /* Body */
    <div className="p-4">
      {/* Contenu */}
    </div>
    
    /* Footer */
    <div className="flex justify-end gap-2 px-4 py-3 border-t border-default bg-secondary">
      <button className="...">Annuler</button>
      <button className="...">Confirmer</button>
    </div>
  </div>
</div>
```

**Règles :**
- `shadow-lg` accepté pour les modals (seule exception)
- Largeur fixe, pas trop large (480px standard)
- Header/footer séparés par bordures

### Toasts

```jsx
/* Toast container — en bas à droite */
<div className="fixed bottom-4 right-4 flex flex-col gap-2">
  
  /* Toast */
  <div className="flex items-center gap-2 px-3 py-2 bg-primary border border-default rounded shadow-md">
    <IconCheck size={16} className="text-success" />
    <span className="text-sm">Élément créé</span>
  </div>
</div>
```

**Règles :**
- Discret, en bas à droite
- Icône colorée, texte neutre
- Disparaît après 3s
- Pas de "Success!", juste l'info

---

## Icônes

### Bibliothèque

Utiliser **Lucide React** (fork de Feather, bien maintenu).

```bash
npm install lucide-react
```

### Tailles

| Usage | Taille |
|-------|--------|
| Dans bouton/input | 16px |
| Dans liste | 16px |
| Action principale toolbar | 20px |
| État vide | 48px |

### Style

```jsx
import { Plus, Search, Trash2, X } from 'lucide-react';

/* Usage standard */
<Search size={16} className="text-secondary" />

/* Au hover */
<Search size={16} className="text-secondary hover:text-primary" />
```

**Règles :**
- Toujours `text-secondary` par défaut
- Pas de couleurs (sauf icônes d'état : check vert, x rouge)
- Même taille dans un même contexte

---

## États et feedback

### Sélection

```jsx
/* Élément sélectionné dans une liste */
<li className="py-2 bg-accent-light border-l-2 border-accent">
  ...
</li>

/* Ou avec fond plus subtil */
<li className="py-2 bg-blue-50">
  ...
</li>
```

### Hover

```jsx
/* Hover standard */
className="hover:bg-tertiary"

/* Hover sur texte */
className="hover:text-primary"
```

### Disabled

```jsx
/* Élément désactivé */
className="opacity-50 cursor-not-allowed pointer-events-none"
```

### Loading

```jsx
/* Spinner simple */
<svg className="animate-spin h-4 w-4 text-secondary" viewBox="0 0 24 24">
  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
</svg>

/* Texte de chargement */
<span className="text-sm text-secondary">Chargement...</span>
```

**Pas de :**
- Skeleton loaders élaborés
- Animations de progression fantaisistes
- Messages "Please wait while we load your data!"

---

## Mise en page

### Structure principale

```jsx
<div className="h-screen flex flex-col">
  
  /* Header */
  <header className="h-12 flex items-center px-4 border-b border-default bg-primary">
    ...
  </header>
  
  /* Main */
  <div className="flex-1 flex overflow-hidden">
    
    /* Toolbar */
    <aside className="w-12 border-r border-default bg-secondary flex flex-col items-center py-2 gap-1">
      ...
    </aside>
    
    /* Canvas */
    <main className="flex-1 overflow-hidden">
      ...
    </main>
    
    /* Side panel */
    <aside className="w-72 border-l border-default bg-secondary overflow-y-auto">
      ...
    </aside>
  </div>
  
  /* Footer */
  <footer className="h-8 flex items-center px-4 border-t border-default bg-secondary text-xs text-secondary">
    ...
  </footer>
</div>
```

### Règles de layout

- Header : 48px de haut
- Footer : 32px de haut
- Panneau latéral : 288px (w-72) de large
- Toolbar : 48px (w-12) de large
- Pas de marges excessives
- Utiliser toute la hauteur de l'écran

---

## Textes de l'interface

### Principes

| Mauvais | Bon |
|---------|-----|
| "Create a new dossier" | "Nouvelle dossier" |
| "Are you sure you want to delete this element? This action cannot be undone." | "Supprimer cet élément ?" |
| "No elements found. Try creating one!" | "Aucun élément" |
| "Welcome back! 👋" | (rien, ou juste le nom) |
| "Great! Your element has been created successfully." | "Élément créé" |
| "Oops! Something went wrong." | "Erreur : [message précis]" |
| "Loading your data, please wait..." | "Chargement..." |
| "Enter a name for your dossier" | "Nom" |

### Labels

- Courts : 1-3 mots
- Pas de ponctuation finale
- Pas de "Please", "Your", "My"
- Verbes à l'infinitif pour les actions : "Créer", "Supprimer", "Exporter"

### Messages d'erreur

- Précis : dire ce qui ne va pas
- Actionnable : dire quoi faire
- Court

```
// Mauvais
"Oops! Something went wrong while trying to save your dossier. Please try again later."

// Bon
"Échec de la sauvegarde. Réessayer."
```

### Placeholders

- Exemple de valeur attendue, pas d'instruction

```
// Mauvais
placeholder="Enter the name of the person here..."

// Bon
placeholder="Jean Dupont"
```

---

## À NE PAS FAIRE — Exemples concrets

### ❌ Mauvais header

```jsx
<header className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6 rounded-b-2xl shadow-xl">
  <h1 className="text-3xl font-bold">🔍 Welcome to zeroneurone!</h1>
  <p className="text-blue-100 mt-2">Your powerful dossier companion</p>
</header>
```

### ✅ Bon header

```jsx
<header className="h-12 flex items-center justify-between px-4 border-b border-default">
  <div className="flex items-center gap-4">
    <button className="p-1 hover:bg-tertiary rounded">
      <ArrowLeft size={16} />
    </button>
    <h1 className="text-sm font-semibold">Affaire Dupont</h1>
  </div>
  <div className="flex items-center gap-2">
    <button className="...">Exporter</button>
  </div>
</header>
```

### ❌ Mauvaise card

```jsx
<div className="bg-white rounded-2xl shadow-xl p-6 hover:shadow-2xl transition-all duration-300 border-2 border-blue-100">
  <div className="flex items-center gap-3 mb-4">
    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
      📁
    </div>
    <div>
      <h3 className="text-xl font-bold text-gray-800">My Dossier</h3>
      <p className="text-gray-500">Created 2 days ago</p>
    </div>
  </div>
  <p className="text-gray-600 mb-4">This is a great dossier about something really important!</p>
  <button className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700">
    Open Dossier →
  </button>
</div>
```

### ✅ Bonne card

```jsx
<div className="border border-default rounded hover:bg-tertiary cursor-pointer">
  <div className="p-3">
    <div className="flex items-center justify-between">
      <h3 className="text-sm font-medium">Affaire Dupont</h3>
      <button className="p-1 hover:bg-secondary rounded">
        <MoreHorizontal size={14} />
      </button>
    </div>
    <p className="text-xs text-secondary mt-1">
      Modifié il y a 2h • 45 éléments
    </p>
  </div>
</div>
```

### ❌ Mauvaise modal

```jsx
<div className="bg-white rounded-3xl p-8 shadow-2xl max-w-lg">
  <div className="text-center mb-6">
    <div className="text-6xl mb-4">🎉</div>
    <h2 className="text-2xl font-bold text-gray-800">Create New Dossier</h2>
    <p className="text-gray-500 mt-2">Let's get started on your next big case!</p>
  </div>
  <input className="w-full p-4 rounded-xl border-2 border-gray-200 text-lg" placeholder="Enter dossier name..." />
  <button className="w-full mt-6 bg-gradient-to-r from-blue-600 to-purple-600 text-white py-4 rounded-xl text-lg font-bold">
    🚀 Create Dossier
  </button>
</div>
```

### ✅ Bonne modal

```jsx
<div className="bg-primary rounded shadow-lg w-[400px]">
  <div className="flex items-center justify-between px-4 py-3 border-b border-default">
    <h2 className="text-sm font-semibold">Nouvelle dossier</h2>
    <button className="p-1 hover:bg-tertiary rounded">
      <X size={16} />
    </button>
  </div>
  <div className="p-4">
    <label className="block text-sm font-medium mb-1">Nom</label>
    <input className="w-full px-2 py-1.5 text-sm border border-default rounded" placeholder="Affaire..." />
  </div>
  <div className="flex justify-end gap-2 px-4 py-3 border-t border-default bg-secondary">
    <button className="px-3 py-1.5 text-sm">Annuler</button>
    <button className="px-3 py-1.5 text-sm text-white bg-accent rounded">Créer</button>
  </div>
</div>
```

---

## Checklist avant de coder un composant

- [ ] Pas d'emoji
- [ ] Texte concis (1-3 mots pour les labels)
- [ ] Pas de rounded-lg ou plus (juste rounded)
- [ ] Pas de shadow sauf modal
- [ ] Couleurs neutres (gris) sauf sélection/état
- [ ] Icônes en gris, 16px
- [ ] Padding compact (p-2, p-3)
- [ ] Un seul bouton bleu par vue
- [ ] Pas de message "Welcome/Great/Oops"

---

*Guidelines Design — zeroneurone — V1 — Janvier 2025*
