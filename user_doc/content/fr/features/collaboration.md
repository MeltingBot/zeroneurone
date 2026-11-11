---
title: "Collaboration"
weight: 9
---

# Collaboration temps réel

Travaillez à plusieurs sur un dossier en temps réel avec synchronisation sécurisée et chiffrée de bout en bout.


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

## Partager un dossier

### Démarrer le partage

1. Ouvrez le dossier à partager
2. Menu **⋯** → **Partager**
3. Configurez votre nom d'utilisateur
4. Cliquez **Partager**


### Copier le lien

Une fois le partage actif :

1. Cliquez **Copier le lien**
2. Envoyez le lien à vos collaborateurs (email, messagerie...)

### Code d'écriture

Sous le lien, la fenêtre de partage affiche un **code d'écriture** à 6 chiffres :

- **Sans le code**, le lien ouvre le dossier en [lecture seule](#lecture-seule)
- **Avec le code**, saisi en rejoignant, on peut modifier

Envoyez le lien à tous, et le code, par un autre canal, à ceux qui doivent modifier. Avec un relais qui ne connaît pas la lecture seule (antérieur à la 2.94.0), il n'y a pas de code : le lien permet de modifier.


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
| `#id=` | UUID original du dossier |
| `#name=` | Nom du dossier |
| `#wpub=` | Clé publique d'écriture (partage avec code d'écriture) |
| `#wlock=` | Clé privée d'écriture, chiffrée par le code d'écriture |

{{< hint warning >}}
**Important** : Tout ce qui suit `#` (fragment) n'est jamais envoyé au serveur (standard navigateur). L'identifiant de room est dérivé d'un hash de l'UUID + clé de chiffrement, donc le serveur ne peut pas corréler les sessions avec les dossiers. C'est ce qui garantit le chiffrement de bout en bout et la confidentialité des métadonnées.
{{< /hint >}}

---

## Rejoindre une session

### Depuis un lien de partage

1. Cliquez sur le lien reçu
2. Configurez votre nom d'utilisateur
3. Vérifiez l'adresse du serveur
4. Pour modifier, saisissez le **code d'écriture** ; laissé vide, le dossier s'ouvre en lecture seule
5. Cliquez **Rejoindre**


### Première synchronisation

À la connexion :

- Les données du dossier sont téléchargées
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

Les fichiers ajoutés à un dossier partagé passent par un canal à part, chiffré avec la même clé. Chaque poste les reçoit tous, mode asynchrone compris ; le [compagnon mobile]({{< relref "mobile-companion" >}}) ne télécharge un fichier que lorsqu'on l'ouvre, auprès d'un poste en ligne. Un poste resté sur une version antérieure à la 2.93.2 ne voit pas ces fichiers : mettez tous les postes à jour.


---

## Présence des utilisateurs

### Avatars

Les collaborateurs connectés apparaissent dans la barre d'outils :


- Initiales et couleur unique par utilisateur
- Cercle bleu = vous
- Survol = nom complet
- `+N` si plus de 5 utilisateurs
- Œil sur l'avatar = connecté en lecture seule

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
| Fichiers joints | ✅ Métadonnées + binaires (sur le téléphone : à l'ouverture) |
| Onglets du canvas | ✅ Noms, membres, ordre (viewport local) |
| Vues sauvegardées | ✅ |
| Commentaires | ✅ |
| Paramètres du dossier | ✅ |

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

## Lecture seule

Un poste ou un téléphone qui rejoint **sans le code d'écriture** voit le dossier et reçoit toutes les modifications, mais ne change rien :

- Un bandeau **Lecture seule** s'affiche, et toute modification est refusée
- Le mode reste à la réouverture du dossier
- Le lecteur apparaît aux autres participants, marqué d'un œil

### Comment c'est garanti

Sans le code, la clé privée d'écriture contenue dans le lien reste chiffrée. Les postes qui l'ont déverrouillée prouvent au relais, à chaque connexion, qu'ils la détiennent ; le relais ne transmet d'un lecteur que sa présence et ses demandes de synchronisation, jamais de modification. Chaque poste vérifie en plus que ce qu'il reçoit correspond à ce qui a été annoncé au relais. Un lecteur qui modifierait l'application ne change donc pas le dossier des autres.

La preuve d'écriture est datée et vérifiée à l'heure du relais : un poste dont l'horloge est décalée se cale sur le relais. Si le relais refuse quand même l'écriture, un message l'indique : vérifiez l'heure de l'appareil.

### Limites

{{< hint warning >}}
**Lire, c'est tout lire.** Le lien contient la clé de chiffrement : le lecteur voit tout le dossier, fichiers compris, et en garde une copie. Il ne peut ni commenter ni modifier.
{{< /hint >}}

- **Le code est un garde-fou, pas une protection.** Il évite une modification de l'original par erreur. Six chiffres se retrouvent en les essayant tous : quelqu'un qui a le lien et veut à tout prix modifier y parvient
- Le code ne se change pas : pour en avoir un autre, arrêtez le partage et partagez à nouveau
- Les dossiers partagés avant la 2.94.0 n'ont pas de code : arrêtez le partage, puis partagez à nouveau. Le nouveau lien remplace l'ancien : renvoyez-le aux collaborateurs
- La lecture seule repose sur le relais : il faut un relais à jour (2.94.0 ou plus récent), et un relais modifié par son exploitant pourrait laisser passer les modifications d'un lecteur. Avec votre propre relais, ce risque est le vôtre
- **Arrêter le partage** coupe tout le monde, lecteurs comme rédacteurs
- Un poste resté sur une version antérieure à la 2.94.0 ne peut pas rejoindre un partage qui a un code d'écriture : mettez tous les postes à jour
- L'œil sur l'avatar est déclaré par l'appareil du lecteur : c'est un repère, pas un contrôle. Le contrôle est celui du relais

---

## Collaboration asynchrone

ZeroNeurone permet la collaboration asynchrone, permettant aux collaborateurs de travailler à des moments différents sans être connectés simultanément.

### Fonctionnement

1. **Activez le mode asynchrone** lors du partage (case "Collaboration asynchrone")
2. Les modifications chiffrées, fichiers compris, sont gardées en mémoire par le relais pendant **48 heures** (réglage par défaut du relais)
3. Les collaborateurs peuvent rejoindre quand ils veulent et recevoir les modifications accumulées

Pour ouvrir le dossier sur un téléphone, voir [Compagnon mobile]({{< relref "mobile-companion" >}}).

### Conservez votre lien de partage

{{< hint danger >}}
**Critique** : Sauvegardez et conservez précieusement le lien de partage. Sans ce lien :
- Vous ne pourrez pas rejoindre la session
- Le dossier ne pourra pas être recréé en mode asynchrone déconnecté
- La clé de chiffrement dans le fragment URL (`#key=...`) est le seul moyen de déchiffrer les données
{{< /hint >}}

Recommandations :
- Sauvegardez le lien dans un gestionnaire de mots de passe
- Gardez une copie dans une note sécurisée
- Envoyez-vous le lien par email

### Mettre à jour après un travail asynchrone

Pour mettre à jour votre dossier local avec les modifications asynchrones distantes :

1. **Arrêtez d'abord le partage** (Menu **⋯** → **Partager** → **Arrêter le partage**)
2. Puis rejoignez en utilisant votre lien de partage sauvegardé
3. Les modifications des autres collaborateurs seront synchronisées

{{< hint info >}}
**Pourquoi arrêter d'abord ?** Quand vous arrêtez le partage, vos données locales deviennent la référence. Rejoindre ensuite fusionne les données du serveur avec votre copie locale.
{{< /hint >}}

---

## Serveur de signalisation

### Serveur public

Aucun serveur n'est configuré d'office : sans serveur, rien ne sort de votre navigateur. Pour collaborer, renseignez le serveur public du projet :

```
wss://sync.zeroneurone.com
```

1. Bouton **Partager** dans l'en-tête du dossier
2. Section **Serveur de synchronisation**
3. Collez l'adresse et enregistrez

Les participants n'ont rien à saisir : l'adresse du serveur est dans le lien de partage, et la page qui s'ouvre leur propose de l'enregistrer.

### Serveur personnalisé

Pour utiliser votre propre serveur, même démarche : entrez son URL complète dans la section **Serveur de synchronisation**.

{{< hint warning >}}
**Format requis** : L'URL doit inclure le protocole WebSocket :
- `wss://serveur.example.com` (sécurisé, recommandé)
- `ws://serveur.example.com` (non chiffré, développement uniquement)
{{< /hint >}}


### Héberger un serveur

Le serveur de signalisation est basé sur `y-websocket`. Consultez la documentation technique pour l'hébergement.

Le relais ne stocke aucun fichier sur disque. Il transmet les messages chiffrés et, en mode asynchrone, les garde en mémoire le temps du tampon. Un fichier envoyé à un téléphone qui l'a demandé est remis à ce seul téléphone, sans passer par le tampon. Avec un relais plus ancien, ces fichiers sont diffusés à tous les participants connectés (toujours chiffrés) : cela fonctionne, mais charge davantage le réseau. Mettez le relais à jour en même temps que l'application (2.93.2 ou plus récent).

---

## Bonnes pratiques

### Sécurité

- Ne partagez le lien qu'avec des personnes de confiance
- Utilisez des canaux sécurisés pour transmettre le lien
- Créez une nouvelle session si un participant ne doit plus avoir accès
- Ne donnez le code d'écriture qu'à qui doit modifier le dossier, et par un autre canal que le lien

### Performance

- Limitez le nombre de collaborateurs simultanés (< 10 recommandé)
- Les gros fichiers peuvent ralentir la synchronisation initiale
- Une bonne connexion internet améliore l'expérience
- Dossiers avec **500+ éléments** : les liens sont masqués pendant le pan/zoom pour la fluidité
- Testé avec **10 000 éléments et 15 000 liens** en mode collaboratif
- **Tous les participants doivent utiliser la même version** de ZeroNeurone : certaines corrections (modifications faites hors connexion, éléments hors onglet) ne jouent que si chacun est à jour

### Organisation

- Définissez qui fait quoi pour éviter les éditions simultanées du même élément
- Utilisez les commentaires pour communiquer dans le dossier
- Sauvegardez régulièrement en local (export ZIP)

---

**Voir aussi** : [Stockage des données]({{< relref "../reference/data-storage" >}})
