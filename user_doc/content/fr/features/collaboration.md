---
title: "Collaboration"
weight: 9
---

# Collaboration temps réel

Travaillez à plusieurs sur une enquête en temps réel avec synchronisation sécurisée et chiffrée de bout en bout.


## Principes de sécurité

| Aspect | Protection |
|--------|------------|
| **Chiffrement** | AES-256-GCM de bout en bout |
| **Clé** | Générée localement, jamais envoyée au serveur |
| **Transport** | WebSocket sécurisé (WSS/TLS) |
| **Serveur** | Ne peut pas lire vos données |

{{< hint info >}}
**Confidentialité totale** : Le serveur de signalisation relaie les messages chiffrés sans pouvoir les déchiffrer. Seuls les participants avec le lien complet peuvent accéder aux données.
{{< /hint >}}

---

## Partager une enquête

### Démarrer le partage

1. Ouvrez l'enquête à partager
2. Menu **⋯** → **Partager**
3. Configurez votre nom d'utilisateur
4. Cliquez **Partager**


### Copier le lien

Une fois le partage actif :

1. Cliquez **Copier le lien**
2. Envoyez le lien à vos collaborateurs (email, messagerie...)


### Format du lien

```
https://zeroneurone.app/join/{id}?server=wss://...&name=...#key=xxx
```

| Partie | Contenu |
|--------|---------|
| `/join/{id}` | Identifiant de l'enquête |
| `?server=` | Adresse du serveur de signalisation |
| `?name=` | Nom de l'enquête |
| `#key=` | Clé de chiffrement (fragment) |

{{< hint warning >}}
**Important** : Le fragment `#key=...` n'est jamais envoyé au serveur (standard navigateur). C'est ce qui garantit le chiffrement de bout en bout.
{{< /hint >}}

---

## Rejoindre une session

### Depuis un lien de partage

1. Cliquez sur le lien reçu
2. Configurez votre nom d'utilisateur
3. Vérifiez l'adresse du serveur
4. Cliquez **Rejoindre**


### Première synchronisation

À la connexion :

- Les données de l'enquête sont téléchargées
- Les fichiers joints sont synchronisés progressivement
- Une copie locale est créée sur votre machine


---

## Indicateur de statut

La barre d'outils affiche l'état de la connexion :


| Icône | État | Description |
|-------|------|-------------|
| 📴 | Local | Mode hors-ligne |
| 🔄 | Connexion | Tentative de connexion |
| 📶 | Connecté | Synchronisation active |
| ⟳ | Sync | Échange de données en cours |
| ↻ | Reconnexion | Connexion perdue, nouvelle tentative |
| ⚠️ | Erreur | Échec de connexion |

### Synchronisation des fichiers

Quand des fichiers sont en cours de transfert :

- Barre de progression
- Nombre de fichiers : `3/10 (30%)`
- Taille transférée
- Nom du fichier en cours


---

## Présence des utilisateurs

### Avatars

Les collaborateurs connectés apparaissent dans la barre d'outils :


- Initiales et couleur unique par utilisateur
- Cercle bleu = vous
- Survol = nom complet
- `+N` si plus de 5 utilisateurs

### Curseurs en temps réel

Les curseurs des autres utilisateurs sont visibles sur le canvas :


### Sélection partagée

Quand un collaborateur sélectionne un élément :

- Halo coloré autour de l'élément
- Couleur = couleur de l'utilisateur


### Édition en cours

Quand quelqu'un édite un élément :

- Indicateur visuel sur l'élément
- Évite les conflits d'édition simultanée


---

## Données synchronisées

| Donnée | Synchronisé |
|--------|-------------|
| Éléments | ✅ Position, métadonnées, apparence |
| Liens | ✅ Toutes les propriétés |
| Fichiers joints | ✅ Métadonnées + binaires |
| Vues sauvegardées | ✅ |
| Commentaires | ✅ |
| Paramètres d'enquête | ✅ |

---

## Résolution des conflits

ZeroNeurone utilise **Yjs**, une technologie CRDT (Conflict-free Replicated Data Type) :

- Modifications simultanées fusionnées automatiquement
- Pas de perte de données
- Fonctionne même après déconnexion temporaire

### Exemple

Si deux utilisateurs modifient le même élément :

1. User A change le label → synchronisé
2. User B change la couleur → synchronisé
3. Résultat : les deux modifications sont conservées

{{< hint info >}}
**Offline-first** : Vous pouvez travailler hors-ligne. Les modifications seront synchronisées à la reconnexion.
{{< /hint >}}

---

## Arrêter le partage

### Depuis le propriétaire

1. Menu **⋯** → **Partager**
2. Cliquez **Arrêter le partage**


### Effet

- La session de partage est fermée
- Les collaborateurs perdent la connexion
- Chaque participant garde une copie locale

{{< hint warning >}}
**Note** : Les collaborateurs conservent leur copie locale. Pour révoquer l'accès à de futures modifications, vous devez créer une nouvelle session avec un nouveau lien.
{{< /hint >}}

---

## Serveur de signalisation

### Serveur par défaut

ZeroNeurone utilise un serveur de signalisation public par défaut.

### Serveur personnalisé

Pour utiliser votre propre serveur :

1. Menu **⋯** → **Partager**
2. Section **Serveur**
3. Entrez l'URL WSS de votre serveur


### Héberger un serveur

Le serveur de signalisation est basé sur `y-websocket`. Consultez la documentation technique pour l'hébergement.

---

## Bonnes pratiques

### Sécurité

- Ne partagez le lien qu'avec des personnes de confiance
- Utilisez des canaux sécurisés pour transmettre le lien
- Créez une nouvelle session si un participant ne doit plus avoir accès

### Performance

- Limitez le nombre de collaborateurs simultanés (< 10 recommandé)
- Les gros fichiers peuvent ralentir la synchronisation initiale
- Une bonne connexion internet améliore l'expérience

### Organisation

- Définissez qui fait quoi pour éviter les éditions simultanées du même élément
- Utilisez les commentaires pour communiquer dans l'enquête
- Sauvegardez régulièrement en local (export ZIP)

---

**Voir aussi** : [Stockage des données]({{< relref "../reference/data-storage" >}})
