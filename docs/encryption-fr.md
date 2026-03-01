# Chiffrement at-rest ZeroNeurone

Ce document décrit l'architecture, les primitives cryptographiques et le cycle de vie du chiffrement at-rest de ZeroNeurone.

## Pourquoi le chiffrement at-rest

ZeroNeurone stocke des dossiers potentiellement sensibles (personnes, organisations, lieux, documents) dans IndexedDB et OPFS. Ces bases sont lisibles par n'importe quel script de la même origine, et accessibles en clair via les DevTools du navigateur.

Le chiffrement at-rest garantit que les données sont illisibles sans le mot de passe — même si quelqu'un a accès au profil du navigateur sur la machine.

**Ce que le chiffrement protège :**
- Le contenu des dossiers (éléments, liens, assets, rapports, vues)
- Les fichiers joints (OPFS)
- Les documents Yjs de collaboration (y-indexeddb)
- Les données stockées par les plugins (`pluginData`)

**Ce que le chiffrement ne protège pas :**
- Les données en mémoire pendant une session active
- Les exports ZIP (protégés séparément par un mot de passe si l'option est activée)
- La configuration (`tagSets`, `_encryptionMeta`)

---

## Architecture des clés

```
Mot de passe utilisateur
        │
        ▼
  PBKDF2-SHA256
  600 000 itérations
  sel aléatoire 128 bits
        │
        ▼
  KEK (Key Encryption Key)
  AES-256-GCM
        │
        ▼ chiffre
  DEK (Data Encryption Key)
  256 bits, générée une seule fois
        │
        ▼
  XSalsa20-Poly1305 (tweetnacl secretbox)
  chiffre chaque champ non-indexé
```

### DEK — Data Encryption Key

- Générée une seule fois à l'activation du chiffrement (`crypto.getRandomValues`)
- 256 bits (32 octets)
- Stockée **chiffrée** dans la table `_encryptionMeta` d'IndexedDB
- Présente en mémoire uniquement pendant une session déverrouillée
- Effacée à la fermeture du navigateur ou au verrouillage de session (Alt+L)

**Changer le mot de passe** = re-chiffrer la DEK avec la nouvelle KEK. Les données ne sont jamais re-chiffrées lors d'un changement de mot de passe.

### KEK — Key Encryption Key

- Dérivée du mot de passe via **PBKDF2-SHA256**
- 600 000 itérations (recommandation NIST SP 800-132, 2023) — schéma v2
- Sel aléatoire 128 bits, généré à l'activation, stocké en clair dans `_encryptionMeta`
- Utilisée uniquement pour chiffrer/déchiffrer la DEK, jamais pour les données
- Jamais stockée en mémoire après le déverrouillage

### Migrations de schéma PBKDF2

| Version | Itérations | Statut |
|---------|-----------|--------|
| v1 | 100 000 | Legacy — upgrade automatique au prochain déverrouillage |
| v2 | 600 000 | Actuel (NIST SP 800-132, 2023) |

L'upgrade est silencieux : au premier déverrouillage d'un meta v1, ZN re-chiffre la DEK avec 600 000 itérations et persiste le nouveau meta.

---

## Chiffrement des données Dexie

### Middleware DBCore

Le chiffrement est implémenté comme un middleware Dexie v4 (interface `DBCore`). Il s'intercale dans la chaîne de traitement de toutes les transactions IndexedDB.

**À l'écriture (`mutate`) :** chaque champ non-indexé de l'objet est chiffré individuellement avec `secretbox` (XSalsa20-Poly1305). Les champs indexés (UUIDs, timestamps) restent en clair pour permettre les requêtes Dexie.

**À la lecture (`get`, `getMany`, `query`, `openCursor`) :** chaque champ chiffré est déchiffré à la volée. Si un champ n'est pas chiffré (données créées avant activation), il est retourné tel quel — la migration est idempotente.

**Format de stockage :** les valeurs chiffrées sont encodées en base64 avec le préfixe `__zn_enc__:nonce+ciphertext`.

### Algorithme de chiffrement des champs

```
secretbox (tweetnacl)
  = XSalsa20 (chiffrement par flux)
  + Poly1305 (authentification MAC)

Pour chaque champ non-indexé :
  nonce = 24 octets aléatoires
  ciphertext = XSalsa20-Poly1305(JSON.stringify(valeur), nonce, DEK)
  stocké = base64(nonce + ciphertext)
```

Tweetnacl est utilisé pour sa propriété **synchrone** — les transactions IndexedDB n'autorisent pas les opérations asynchrones dans leur scope. Web Crypto API (async) est réservée à la dérivation de clé (PBKDF2, AES-GCM).

### Tables chiffrées

| Table | Contenu | Chiffrée |
|-------|---------|----------|
| `dossiers` | Métadonnées des dossiers | Oui |
| `elements` | Nœuds du graphe | Oui |
| `links` | Relations entre éléments | Oui |
| `assets` | Métadonnées des fichiers joints | Oui |
| `views` | Vues sauvegardées | Oui |
| `reports` | Rapports | Oui |
| `canvasTabs` | Onglets canvas | Oui |
| `pluginData` | Données des plugins | Oui |
| `_encryptionMeta` | Sel + DEK chiffrée | Non (données techniques) |
| `tagSets` | Configuration des types de tags | Non (non sensible) |

---

## Chiffrement des fichiers OPFS

Les fichiers joints (assets binaires) stockés dans OPFS sont chiffrés séparément, avec **AES-256-GCM** (Web Crypto API).

```
Pour chaque fichier :
  IV = 12 octets aléatoires
  ciphertext = AES-256-GCM(contenu_binaire, IV, DEK)
  stocké = magic_header(4 octets) + IV + ciphertext
```

Le header magique permet de détecter si un fichier est déjà chiffré (migration idempotente).

---

## Chiffrement des documents Yjs (y-indexeddb)

Chaque dossier a une base IndexedDB `zeroneurone-ydoc-{id}` contenant les mises à jour Yjs pour la collaboration temps réel. Ces bases sont chiffrées lors de la migration, update par update, via leur propre mécanisme de chiffrement (couche distincte du middleware Dexie).

---

## Cycle de vie

### Activation du chiffrement

```
Utilisateur définit un mot de passe
  → Génération DEK (aléatoire)
  → PBKDF2(password, sel) → KEK
  → AES-GCM.encrypt(DEK, KEK) → DEK chiffrée
  → Stockage _encryptionMeta dans Dexie
  → Middleware Dexie installé (db.use())
  → Migration : bulkPut de tous les enregistrements existants
    (le middleware chiffre à l'écriture)
  → Migration OPFS + y-indexeddb
  → window.location.reload()
```

Le rechargement est obligatoire : Dexie doit réouvrir la connexion **après** installation du middleware depuis le tout début. Sans rechargement, des transactions peuvent s'être ouvertes sans middleware.

### Démarrage (chiffrement actif)

```
EncryptionGate lit _encryptionMeta via IndexedDB natif
  (pas via Dexie — évite d'ouvrir la connexion sans middleware)
  → Affiche PasswordModal
  → Utilisateur saisit le mot de passe
  → PBKDF2(password, sel) → KEK
  → AES-GCM.decrypt(DEK chiffrée, KEK) → DEK
  → db.applyEncryption(DEK) — middleware installé
  → Dexie s'ouvre avec middleware
  → App accessible
```

### Verrouillage de session (Alt+L)

```
useEncryptionStore.lock()
  → DEK effacée de la mémoire
  → isLocked = true
  → PasswordModal affichée
  → Dexie inaccessible jusqu'au déverrouillage
```

Le verrouillage ne ferme pas la connexion Dexie mais bloque toute nouvelle requête via le store `isReady = false`.

### Changement de mot de passe

```
Vérification ancien mot de passe
  → PBKDF2(nouveau_mdp, nouveau_sel) → KEK2
  → AES-GCM.encrypt(DEK_en_mémoire, KEK2) → DEK chiffrée2
  → Mise à jour _encryptionMeta
  (les données ne sont pas re-chiffrées)
```

### Désactivation du chiffrement

```
Vérification mot de passe
  → Lecture de toutes les données via Dexie (déchiffrement)
  → Réécriture via IndexedDB natif (bypass du middleware)
    (Dexie v4 n'a pas d'unuse() — impossible de retirer le middleware)
  → Migration OPFS + y-indexeddb vers le clair
  → Suppression _encryptionMeta
  → window.location.reload()
```

---

## Propriétés de sécurité

| Propriété | Valeur |
|-----------|--------|
| Algorithme données | XSalsa20-Poly1305 (tweetnacl secretbox) |
| Algorithme fichiers | AES-256-GCM |
| Dérivation de clé | PBKDF2-SHA256, 600 000 itérations |
| Taille DEK | 256 bits |
| Taille sel PBKDF2 | 128 bits |
| Taille nonce XSalsa20 | 192 bits (24 octets) |
| Taille IV AES-GCM | 96 bits (12 octets) |
| Authentification | Oui (Poly1305 + GCM) |
| Forward secrecy | Non (DEK fixe par activation) |
| Stockage DEK brute | Jamais (ni disque ni localStorage) |

**Résistance brute-force :** 600 000 itérations PBKDF2 ≈ 600 ms par tentative sur CPU moderne → environ 1,5 tentative/seconde → 1,3×10⁹ années pour 8 chars aléatoires (jeu 95 chars).

---

## Ce que le chiffrement ne fait pas

- **Pas de protection contre un attaquant avec session ouverte** — la DEK est en mémoire, le contenu est lisible dans DevTools.
- **Pas de protection des indexes** — les UUIDs et timestamps sont en clair pour permettre les requêtes. Un attaquant connaissant la structure de la DB peut compter les éléments, voir les dates.
- **Pas de chiffrement de `tagSets`** — les types de tags définis ne sont pas considérés sensibles.
- **Pas de forward secrecy** — si le mot de passe est compromis, toutes les données historiques peuvent être déchiffrées (la DEK ne change pas).
- **Pas de protection contre une extension malveillante** — les extensions navigateur de la même origine ont accès à IndexedDB.

---

## Export ZIP chiffré

L'export ZIP dispose d'une option de chiffrement indépendante : le contenu du ZIP est chiffré par mot de passe (AES-256-CTR via JSZip). Ce chiffrement est orthogonal au chiffrement at-rest : un export depuis une instance chiffrée produit un ZIP chiffré contenant des données en clair (déchiffrées pour l'export).
