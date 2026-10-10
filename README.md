# ZeroNeurone

<p align="center">
  <img src="media/zeroneurone.png" alt="ZeroNeurone" width="400">
</p>

**Outil d'amplification cognitive pour analystes et enquêteurs**

Un tableau blanc infini avec des capacités d'analyse de graphe.

*Langue : Français | [English](README.en.md)*

![Version](https://img.shields.io/badge/version-2.64.1-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![React](https://img.shields.io/badge/React-19-61dafb)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6)
![PWA](https://img.shields.io/badge/PWA-ready-5A0FC8)
![i18n](https://img.shields.io/badge/i18n-11%20langues-orange)

Documentation utilisateur : [doc.zeroneurone.com](https://doc.zeroneurone.com)

## Philosophie

- **L'humain reste aux commandes** — aucune action automatique, aucune intelligence artificielle ; les suggestions ne viennent que sur demande.
- **100 % local par défaut** — IndexedDB + OPFS, fonctionne hors ligne, les données ne partent jamais sans action explicite. Deux exceptions, toutes deux déclenchées par l'utilisateur : les tuiles de la carte et la recherche de lieu (OpenStreetMap/Nominatim).
- **Le visuel est l'analyse** — position, couleurs et formes portent le sens que l'utilisateur leur donne.
- **Zéro ontologie imposée** — l'utilisateur crée ses propres concepts ; aucun type d'entité n'est imposé.

## Fonctionnalités

### Canvas
- Création d'éléments par double-clic, liens par glisser-déposer
- Multi-sélection, copier/coller, alignement, dispositions automatiques (force, hiérarchique, circulaire, grille, dispersion)
- Apparence personnalisable : couleurs, formes, tailles, icônes Lucide ou SVG personnels
- Groupes imbriqués, annotations, minimap, grille magnétique
- **Onglets** : jusqu'à 10 espaces thématiques par dossier (hypothèse, acteur, période) ; les éléments d'autres onglets reliés à l'onglet courant apparaissent en transparence
- Annulation / rétablissement de toutes les opérations, fusion d'éléments comprise

### Données
- **Éléments et liens** avec notes Markdown, tags, propriétés typées, source, dates, géolocalisation (point ou zone)
- **Jeux de tags** : apparence et propriétés associées à un tag, exportés avec le dossier
- **Pièces jointes** : images, PDF, documents, emails EML, avec aperçu et extraction de texte et de métadonnées (EXIF, PDF/DOCX/XLSX, en-têtes d'email)
- **Évaluation de l'information**, au choix par dossier :
  - confiance de 0 à 100 % ;
  - grille Europol 4x4 (article 29 du règlement (UE) 2016/794) : fiabilité de la source A/B/C/X et exactitude de l'information 1 à 4 ;
  - code de l'Amirauté / OTAN 6x6.

### Vues
- **Canvas** : graphe principal
- **Carte** : MapLibre GL JS, fonds vectoriels et satellite, bâtiments 3D, navigation temporelle
- **Timeline** : frise chronologique virtualisée (plus de 10 000 éléments)
- **Matrice** : vue tableau triable, filtrable et éditable, export CSV

### Recherche, filtres et requêtes
- Recherche plein texte (`Ctrl+K`)
- Filtres par tags, propriétés, confiance ou cotation, dates ; vues sauvegardées
- **ZNQuery** : langage de requêtes structuré (`tag = "personne" AND confidence > 50`), avec constructeur visuel et requêtes sauvegardées

### Analyse de graphe
- Communautés (Louvain), centralité (degré, intermédiarité), ponts entre clusters
- Plus court chemin, mode focus sur le voisinage à N niveaux, nœuds isolés
- Similarité des libellés pour repérer les doublons

### Rapport et synthèse
- Rapport rédigé en Markdown avec références cliquables vers les éléments
- Synthèse générée à partir du graphe (HTML, Markdown, JSON)
- Export HTML interactif (rapport + graphe navigable) et impression via le navigateur

### Import et export
- **Natif** : ZIP (données + pièces jointes, chiffrement optionnel) et JSON ([format documenté](docs/json-import-format-fr.md))
- **Graphes** : CSV, GraphML, GEXF, Gephi Lite, Excalidraw, Mermaid (import, et copie d'une sélection en Mermaid)
- **i2 Analyst's Notebook** : import ANX et ANB, export ANX
- **Obsidian** : export en coffre (fiches Markdown, relations en wikilinks, canvas par onglet)
- **Renseignement et OSINT** : STIX 2.1, OSINT Industries, Graph Palette, PredicaGraph, OSINTracker
- **Spécialisés** : GEDCOM 5.5.1/7.0 et GeneWeb (généalogie), FEC (fichier des écritures comptables, en graphe de flux financiers)
- **JSON quelconque** par un assistant de mapping, avec modèles réutilisables ; aussi par simple collage sur le canvas
- **Images** : PNG haute résolution, SVG ; **géographie** : GeoJSON
- Import dans le dossier ouvert, avec placement visuel

### Collaboration
- Synchronisation temps réel (Yjs) chiffrée de bout en bout (AES-256-GCM)
- Partage par lien : la clé reste dans le fragment de l'URL et n'est jamais envoyée au serveur
- Mode asynchrone : les modifications sont conservées 7 jours pour les collaborateurs absents
- Curseurs, sélections et présence des participants ; synchronisation des pièces jointes et des onglets
- Identifiant de salle haché : le serveur ne peut pas corréler les sessions

### Sécurité et conservation
- **Chiffrement au repos** optionnel de toutes les données locales : XSalsa20-Poly1305 pour les enregistrements, AES-256-GCM pour les fichiers, PBKDF2-SHA256 600 000 itérations. Verrouillage de session avec `Alt+L`. Mot de passe irrécupérable, sans porte dérobée. [Documentation technique](docs/encryption-fr.md)
- **Rétention** : durée de vie par dossier, avec avertissement, lecture seule, suppression proposée ou caviardage à l'expiration

### Extensions
Système de plugins par emplacements (menus, panneaux, en-tête, raccourcis, rapport, import/export). Sans plugin, aucun impact sur l'application. [Guide du développeur](docs/plugin-development-fr.md)

### Application
- PWA installable, fonctionne entièrement hors ligne
- 11 langues : français, anglais, espagnol, allemand, italien, portugais, néerlandais, polonais, ukrainien, basque, catalan
- Tutoriel guidé et dossier d'exemple
- Accessibilité partielle : toutes les modales gèrent le focus, les boutons ont un nom accessible, la matrice est annoncée comme un tableau. Le graphe lui-même (canvas, carte, timeline) n'est pas encore navigable au clavier ; la conformité WCAG AA n'est pas atteinte.

## Stack technique

| Couche | Technologie |
|--------|-------------|
| Framework | React 19 + TypeScript + Vite |
| État | Zustand |
| Stockage | Dexie.js (IndexedDB) + OPFS |
| Canvas | React Flow |
| Carte | MapLibre GL JS |
| Analyse | Graphology |
| Recherche | MiniSearch |
| Synchronisation | Yjs + y-websocket |
| Cryptographie | Web Crypto API (AES-256-GCM), tweetnacl (XSalsa20-Poly1305) |
| Style | Tailwind CSS |
| Tests | Vitest, Playwright |

## Installation

```bash
git clone https://github.com/MeltingBot/zeroneurone.git
cd zeroneurone
npm install
npm run dev
```

L'application est accessible sur `http://localhost:5173`.

Pour un déploiement, `docker-compose.yml` fournit l'application et le serveur relais derrière Traefik.

## Utilisation

### Raccourcis clavier

| Action | Raccourci |
|--------|-----------|
| Recherche | `Ctrl+K` |
| Copier / Couper / Coller | `Ctrl+C` / `Ctrl+X` / `Ctrl+V` |
| Dupliquer | `Ctrl+D` |
| Annuler / Rétablir | `Ctrl+Z` / `Ctrl+Shift+Z` |
| Supprimer la sélection | `Suppr` / `Retour arrière` |
| Nouvel élément / groupe / annotation | `E` / `G` / `N` |
| Vue Canvas / Carte / Timeline / Matrice | `1` / `2` / `3` / `4` |
| Verrouiller la session (chiffrement) | `Alt+L` |

### Canvas

| Action | Résultat |
|--------|----------|
| Double-clic sur le canvas | Créer un élément |
| Glisser d'un élément à un autre | Créer un lien |
| Glisser d'un élément vers le vide | Créer un élément lié |
| Clic droit | Menu contextuel |
| Molette | Zoom |

### Collaboration

1. Ouvrir un dossier et cliquer sur **Partager**
2. Renseigner l'URL du serveur de synchronisation (une seule fois)
3. Activer le mode asynchrone si les collaborateurs travaillent à des moments différents
4. Transmettre le lien de partage ; les collaborateurs l'ouvrent pour rejoindre

> En mode asynchrone, conservez le lien de partage : c'est le seul moyen de rejoindre la session et de déchiffrer les données.

Le serveur relais fourni (`relay-server.js`) gère le temps réel et le mode asynchrone :

```bash
npm run relay-server   # ws://localhost:4444
```

## Architecture

### Stockage
- **Métadonnées** (éléments, liens, vues) : IndexedDB via Dexie
- **Fichiers** : OPFS, dédupliqués par SHA-256
- **Synchronisation** : Y.Doc avec persistance IndexedDB locale
- **Index de recherche** : MiniSearch, reconstruit au chargement

### Sécurité de la collaboration

```
┌─────────────┐          ┌─────────────────┐          ┌─────────────┐
│  Client A   │◄────────►│  Serveur relais │◄────────►│  Client B   │
│ Clé : xxxxx │ chiffré  │  (ne voit que   │ chiffré  │ Clé : xxxxx │
└─────────────┘          │  du chiffré)    │          └─────────────┘
                         └─────────────────┘
```

- Clé générée côté client, transmise uniquement dans le fragment de l'URL (`#key=...`)
- Le serveur ne relaie que des données chiffrées

## Développement

```bash
npm run dev                          # serveur de développement
npx tsc --noEmit -p tsconfig.app.json  # vérification TypeScript
npm run test:unit                    # tests unitaires (Vitest)
npm run test:e2e                     # tests end-to-end (Playwright)
npm run lint                         # ESLint
npm run build                        # build de production
```

Le format des données est décrit dans [docs/json-import-format-fr.md](docs/json-import-format-fr.md).

## Contribuer

Les contributions sont les bienvenues : ouvrez une issue ou une pull request.

## Licence

[MIT](LICENSE) - Yann PILPRÉ 2026
