---
title: "Stockage des données"
weight: 2
---

# Stockage des données

Comment ZeroNeurone stocke vos données localement.

## Architecture de stockage

ZeroNeurone utilise deux technologies de stockage navigateur :

| Technologie | Usage | Données |
|-------------|-------|---------|
| **IndexedDB** | Base de données | Métadonnées (éléments, liens, enquêtes) |
| **OPFS** | Système de fichiers | Fichiers joints (images, PDF) |


---

## IndexedDB (Dexie.js)

### Tables

| Table | Contenu |
|-------|---------|
| `investigations` | Enquêtes et paramètres |
| `elements` | Éléments du graphe |
| `links` | Liens entre éléments |
| `views` | Vues sauvegardées |
| `assets` | Métadonnées des fichiers |

### Consultation

Dans les DevTools du navigateur :

1. **F12** → Onglet **Application**
2. **IndexedDB** → **zeroneurone**


---

## OPFS (Origin Private File System)

### Structure

```
/zeroneurone/
└── assets/
    ├── {sha256-hash-1}
    ├── {sha256-hash-2}
    └── ...
```

### Déduplication

Les fichiers sont stockés par leur hash SHA-256 :

- Un fichier identique n'est stocké qu'une fois
- Économise l'espace disque
- Impossible d'avoir des doublons

---

## Quotas et limites

### Limites navigateur

| Navigateur | Quota approximatif |
|------------|-------------------|
| Chrome | 60% de l'espace disque |
| Firefox | 50% de l'espace disque |
| Safari | 1 Go par défaut |
| Edge | 60% de l'espace disque |

### Vérifier l'utilisation

```javascript
// Dans la console navigateur
navigator.storage.estimate().then(console.log)
```

---

## Persistance

### Storage persistant

ZeroNeurone demande la persistance des données :

```javascript
navigator.storage.persist()
```

Cela empêche le navigateur de supprimer les données en cas de pression mémoire.

### Vérifier le statut

```javascript
navigator.storage.persisted().then(console.log)
```

---

## Sauvegarde

### Export régulier

{{< hint warning >}}
**Important** : Exportez régulièrement vos enquêtes en ZIP pour avoir une sauvegarde externe.
{{< /hint >}}

### Risques de perte

Les données peuvent être perdues si :

- Vidage du cache navigateur
- Désinstallation du navigateur
- Mode navigation privée
- Certains nettoyeurs système

---

## Confidentialité

### 100% local

- ✅ Données stockées uniquement sur votre machine
- ✅ Aucun serveur distant
- ✅ Fonctionne hors-ligne
- ✅ Aucune télémétrie

### Partage explicite

Les données ne quittent votre machine que par :

- Export manuel (ZIP, JSON, etc.)
- Copier-coller
- Capture d'écran

---

## Dépannage

### Données corrompues

Si l'application ne charge pas :

1. **F12** → **Console** : Vérifier les erreurs
2. **Application** → **Clear site data** : Réinitialiser (⚠️ perd les données)

### Espace insuffisant

1. Supprimer les enquêtes inutiles
2. Supprimer les fichiers joints volumineux
3. Exporter en ZIP puis supprimer l'enquête

### Migration

Pour changer de navigateur ou machine :

1. Exporter toutes les enquêtes en ZIP
2. Installer sur le nouveau navigateur
3. Importer les ZIP

---

**Voir aussi** : [Export]({{< relref "../import-export/export" >}})
