# Documentation ZeroNeurone

Documentation utilisateur générée avec [Hugo](https://gohugo.io/) et le thème [hugo-book](https://github.com/alex-shpak/hugo-book).

## Prérequis

- Docker et Docker Compose
- Ou Hugo installé localement (v0.145+)

## Installation du thème

```bash
mkdir -p themes
git clone --depth 1 https://github.com/alex-shpak/hugo-book.git themes/hugo-book
```

## Développement

### Avec Docker (recommandé)

```bash
# Installer le thème d'abord
mkdir -p themes
git clone --depth 1 https://github.com/alex-shpak/hugo-book.git themes/hugo-book

# Lancer le serveur de dev avec live reload
docker compose --profile dev up
```

Ouvrir http://localhost:1313

### Avec Hugo local

```bash
hugo server --buildDrafts
```

## Build

### Avec Docker

```bash
# Générer le site statique dans ./public
docker compose --profile build up
```

### Avec Hugo local

```bash
hugo --minify
```

Les fichiers sont générés dans `./public/`.

## Publication

### Avec Docker Compose

```bash
# Build et lance le serveur nginx
docker compose up -d docs

# Ou rebuild et relance
docker compose up -d --build docs
```

Le site est accessible sur http://localhost:8080

### Avec Traefik (production)

Le `docker-compose.yml` inclut les labels Traefik pour un déploiement avec HTTPS automatique. Adapter le domaine dans les labels.

### Déploiement statique

Copier le contenu de `./public/` vers n'importe quel hébergement statique :

- GitHub Pages
- Netlify
- Vercel
- S3 + CloudFront
- Nginx / Apache

## Structure

```
user_doc/
├── config.toml              # Configuration Hugo
├── content/
│   └── fr/                  # Contenu français
│       ├── _index.md        # Page d'accueil
│       ├── getting-started/ # Prise en main
│       ├── features/        # Fonctionnalités
│       ├── import-export/   # Import/Export
│       ├── reference/       # Référence
│       └── faq.md           # FAQ
├── layouts/
│   └── shortcodes/          # Shortcodes personnalisés
├── static/
│   └── images/
│       └── screenshots/     # Captures d'écran
├── themes/
│   └── hugo-book/           # Thème (à cloner)
├── Dockerfile               # Build multi-stage
├── docker-compose.yml       # Dev + Prod
└── nginx.conf               # Config nginx production
```

## Ajouter des screenshots

1. Placer les images dans `static/images/screenshots/`
2. Utiliser le shortcode dans le markdown :

```markdown
{{</* screenshot "nom-fichier.png" "Description de l'image" */>}}
```

Si l'image n'existe pas, un placeholder est affiché.

Voir `static/images/screenshots/README.md` pour la liste des screenshots à créer.

## Ajouter une langue

1. Ajouter la langue dans `config.toml` :

```toml
[languages.en]
  languageName = "English"
  contentDir = "content/en"
  weight = 2
```

2. Créer le dossier `content/en/` avec la même structure que `content/fr/`

## Personnalisation

### Couleurs et styles

Créer `static/css/custom.css` et l'inclure dans le thème.

### Logo

Placer le logo dans `static/images/logo.png` et configurer dans `config.toml` :

```toml
[params]
  BookLogo = "/images/logo.png"
```
