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
https://zeroneurone.app/join/{roomId}?server=wss://...&async=1#key=xxx&id=uuid&name=...
```

| Partie | Contenu |
|--------|---------|
| `/join/{roomId}` | Identifiant de room hashé (le serveur ne voit pas l'UUID original) |
| `?server=` | Adresse du serveur de signalisation |
| `?async=1` | Flag mode asynchrone (optionnel) |
| `#key=` | Clé de chiffrement |
| `#id=` | UUID original de l'enquête |
| `#name=` | Nom de l'enquête |

{{< hint warning >}}
**Important** : Tout ce qui suit `#` (fragment) n'est jamais envoyé au serveur (standard navigateur). L'identifiant de room est dérivé d'un hash de l'UUID + clé de chiffrement, donc le serveur ne peut pas corréler les sessions avec les enquêtes. C'est ce qui garantit le chiffrement de bout en bout et la confidentialité des métadonnées.
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
| Onglets du canvas | ✅ Noms, membres, ordre (viewport local) |
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

## Collaboration asynchrone

ZeroNeurone permet la collaboration asynchrone, permettant aux collaborateurs de travailler à des moments différents sans être connectés simultanément.

### Fonctionnement

1. **Activez le mode asynchrone** lors du partage (case "Collaboration asynchrone")
2. Les modifications sont stockées sur le serveur pendant **7 jours**
3. Les collaborateurs peuvent rejoindre quand ils veulent et recevoir les modifications accumulées

### Conservez votre lien de partage

{{< hint danger >}}
**Critique** : Sauvegardez et conservez précieusement le lien de partage. Sans ce lien :
- Vous ne pourrez pas rejoindre la session
- L'enquête ne pourra pas être recréée en mode asynchrone déconnecté
- La clé de chiffrement dans le fragment URL (`#key=...`) est le seul moyen de déchiffrer les données
{{< /hint >}}

Recommandations :
- Sauvegardez le lien dans un gestionnaire de mots de passe
- Gardez une copie dans une note sécurisée
- Envoyez-vous le lien par email

### Mettre à jour après un travail asynchrone

Pour mettre à jour votre enquête locale avec les modifications asynchrones distantes :

1. **Arrêtez d'abord le partage** (Menu **⋯** → **Partager** → **Arrêter le partage**)
2. Puis rejoignez en utilisant votre lien de partage sauvegardé
3. Les modifications des autres collaborateurs seront synchronisées

{{< hint info >}}
**Pourquoi arrêter d'abord ?** Quand vous arrêtez le partage, vos données locales deviennent la référence. Rejoindre ensuite fusionne les données du serveur avec votre copie locale.
{{< /hint >}}

---

## Serveur de signalisation

### Serveur par défaut

ZeroNeurone utilise un serveur de signalisation public par défaut.

### Serveur personnalisé

Pour utiliser votre propre serveur :

1. Menu **⋯** → **Partager**
2. Section **Serveur**
3. Entrez l'URL complète de votre serveur

{{< hint warning >}}
**Format requis** : L'URL doit inclure le protocole WebSocket :
- `wss://serveur.example.com` (sécurisé, recommandé)
- `ws://serveur.example.com` (non chiffré, développement uniquement)
{{< /hint >}}


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
- Enquêtes avec **500+ éléments** : les liens sont masqués pendant le pan/zoom pour la fluidité
- Testé avec **1500+ éléments et liens** en mode collaboratif

### Organisation

- Définissez qui fait quoi pour éviter les éditions simultanées du même élément
- Utilisez les commentaires pour communiquer dans l'enquête
- Sauvegardez régulièrement en local (export ZIP)

---

**Voir aussi** : [Stockage des données]({{< relref "../reference/data-storage" >}})
