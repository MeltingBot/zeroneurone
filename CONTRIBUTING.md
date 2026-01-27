# Contributing to ZeroNeurone

[Version française ci-dessous](#contribuer-à-zeroneurone)

---

Thank you for your interest in contributing to ZeroNeurone. This document outlines the guidelines for contributing to the project.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment. Harassment, discrimination, and disrespectful behavior will not be tolerated.

## How to Contribute

### Reporting Bugs

1. **Search existing issues** to avoid duplicates
2. **Use the bug report template** when creating a new issue
3. **Include**:
   - Browser and version
   - Steps to reproduce
   - Expected vs actual behavior
   - Screenshots if applicable
   - Console errors (F12 → Console)

### Suggesting Features

1. **Search existing issues** to check if it's already proposed
2. **Use the feature request template**
3. **Describe the use case** — explain why this feature would be useful
4. **Be specific** — vague requests are harder to evaluate

### Submitting Code

#### Prerequisites

- Node.js 18+
- npm or pnpm
- Git

#### Setup

```bash
git clone https://github.com/MeltingBot/zeroneurone.git
cd zeroneurone
npm install
npm run dev
```

#### Workflow

1. **Fork** the repository
2. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes**
4. **Test locally**:
   ```bash
   npm run typecheck
   npm run lint
   npm run build
   ```
5. **Commit** with a clear message:
   ```bash
   git commit -m "feat: add feature X"
   ```
6. **Push** to your fork
7. **Open a Pull Request** against `main`

#### Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

| Prefix | Usage |
|--------|-------|
| `feat:` | New feature |
| `fix:` | Bug fix |
| `docs:` | Documentation only |
| `style:` | Formatting, no code change |
| `refactor:` | Code change without feature/fix |
| `perf:` | Performance improvement |
| `test:` | Adding tests |
| `chore:` | Build, tooling, dependencies |

#### Code Style

- **TypeScript** — strict mode enabled
- **React** — functional components with hooks
- **Tailwind CSS** — utility-first styling
- **No emojis** in UI code
- **No marketing language** in comments

Run `npm run lint` before committing.

### Documentation

Documentation lives in `user_doc/`. It uses Hugo with the hugo-book theme.

```bash
cd user_doc
docker compose --profile dev up
```

Open http://localhost:1313

### Translations

Translations are in `src/locales/{lang}/`. To add a new language:

1. Copy an existing language folder
2. Translate all JSON files
3. Add the language to `src/i18n.ts`
4. Submit a PR

## Pull Request Guidelines

- **One PR per feature/fix** — don't bundle unrelated changes
- **Keep PRs small** — easier to review
- **Update documentation** if your change affects user-facing behavior
- **Add tests** for new features when applicable
- **Respond to review feedback** promptly

## License

By contributing, you agree that your contributions will be licensed under the project's MIT license.

---

# Contribuer à ZeroNeurone

Merci de votre intérêt pour ZeroNeurone. Ce document décrit les règles de contribution au projet.

## Code de conduite

En participant à ce projet, vous vous engagez à maintenir un environnement respectueux et inclusif. Le harcèlement, la discrimination et les comportements irrespectueux ne seront pas tolérés.

## Comment contribuer

### Signaler un bug

1. **Cherchez dans les issues existantes** pour éviter les doublons
2. **Utilisez le template de bug report**
3. **Incluez** :
   - Navigateur et version
   - Étapes pour reproduire
   - Comportement attendu vs observé
   - Captures d'écran si pertinent
   - Erreurs console (F12 → Console)

### Proposer une fonctionnalité

1. **Cherchez dans les issues existantes** pour vérifier si elle n'est pas déjà proposée
2. **Utilisez le template de feature request**
3. **Décrivez le cas d'usage** — expliquez pourquoi cette fonctionnalité serait utile
4. **Soyez précis** — les demandes vagues sont difficiles à évaluer

### Soumettre du code

#### Prérequis

- Node.js 18+
- npm ou pnpm
- Git

#### Installation

```bash
git clone https://github.com/MeltingBot/zeroneurone.git
cd zeroneurone
npm install
npm run dev
```

#### Workflow

1. **Forkez** le dépôt
2. **Créez une branche** depuis `main` :
   ```bash
   git checkout -b feature/nom-de-la-feature
   ```
3. **Faites vos modifications**
4. **Testez localement** :
   ```bash
   npm run typecheck
   npm run lint
   npm run build
   ```
5. **Committez** avec un message clair :
   ```bash
   git commit -m "feat: ajout de la fonctionnalité X"
   ```
6. **Pushez** vers votre fork
7. **Ouvrez une Pull Request** vers `main`

#### Convention de commit

Nous suivons [Conventional Commits](https://www.conventionalcommits.org/) :

| Préfixe | Usage |
|---------|-------|
| `feat:` | Nouvelle fonctionnalité |
| `fix:` | Correction de bug |
| `docs:` | Documentation uniquement |
| `style:` | Formatage, pas de changement de code |
| `refactor:` | Changement de code sans feature/fix |
| `perf:` | Amélioration de performance |
| `test:` | Ajout de tests |
| `chore:` | Build, outillage, dépendances |

#### Style de code

- **TypeScript** — mode strict activé
- **React** — composants fonctionnels avec hooks
- **Tailwind CSS** — styling utility-first
- **Pas d'emojis** dans le code UI
- **Pas de langage marketing** dans les commentaires

Exécutez `npm run lint` avant de committer.

### Documentation

La documentation est dans `user_doc/`. Elle utilise Hugo avec le thème hugo-book.

```bash
cd user_doc
docker compose --profile dev up
```

Ouvrez http://localhost:1313

### Traductions

Les traductions sont dans `src/locales/{lang}/`. Pour ajouter une nouvelle langue :

1. Copiez un dossier de langue existant
2. Traduisez tous les fichiers JSON
3. Ajoutez la langue à `src/i18n.ts`
4. Soumettez une PR

## Règles pour les Pull Requests

- **Une PR par feature/fix** — ne mélangez pas des changements non liés
- **Gardez les PR petites** — plus faciles à reviewer
- **Mettez à jour la documentation** si votre changement affecte le comportement utilisateur
- **Ajoutez des tests** pour les nouvelles fonctionnalités quand c'est applicable
- **Répondez aux retours de review** rapidement

## Licence

En contribuant, vous acceptez que vos contributions soient sous licence MIT, comme le reste du projet.
