# RGPD — Applicabilité à ZeroNeurone

## Synthèse

ZeroNeurone est un outil local-first. Les données d'dossier
sont stockées exclusivement dans le navigateur de l'utilisateur
(IndexedDB + OPFS). Aucune donnée n'est transmise à un serveur sauf
activation explicite de la collaboration.

Ce document analyse l'applicabilité du RGPD (Règlement UE 2016/679)
à l'usage de ZeroNeurone dans un contexte professionnel.

---

## 1. ZeroNeurone traite-t-il des données personnelles ?

**Potentiellement oui.** ZeroNeurone est un outil d'dossier
générique. Les éléments du graphe (personnes, organisations, lieux,
documents) peuvent contenir des données à caractère personnel au
sens de l'article 4(1) du RGPD :

- Noms, prénoms, pseudonymes
- Adresses, coordonnées géographiques
- Numéros de téléphone, adresses email
- Relations entre personnes
- Photographies, documents joints
- Notes d'analyse contenant des informations identifiantes

**L'outil lui-même ne collecte aucune donnée personnelle.** C'est
l'utilisateur qui saisit les données. La qualification RGPD dépend
donc du contenu des dossiers, pas de l'outil.

---

## 2. Qui est responsable de traitement ?

L'éditeur de ZeroNeurone **n'est pas** responsable de traitement.
Il ne détermine ni les finalités ni les moyens du traitement des
données saisies par l'utilisateur.

Le **responsable de traitement** est :

- L'organisation qui déploie ZeroNeurone pour ses analystes
- Ou l'utilisateur individuel s'il l'utilise à titre personnel
  dans un cadre professionnel

L'éditeur n'a **aucun accès** aux données stockées dans le
navigateur de l'utilisateur.

---

## 3. Base légale du traitement

La base légale dépend du contexte d'utilisation :

| Contexte | Base légale probable | Article RGPD |
|----------|---------------------|--------------|
| Enquête judiciaire | Obligation légale | Art. 6(1)(c) |
| Enquête administrative | Mission d'intérêt public | Art. 6(1)(e) |
| Dossier interne (entreprise) | Intérêt légitime | Art. 6(1)(f) |
| Recherche OSINT | Intérêt légitime | Art. 6(1)(f) |
| Journalisme d'dossier | Dérogation presse | Art. 85 |
| Usage personnel non professionnel | Exception domestique | Art. 2(2)(c) |

**Note :** le traitement de données sensibles (art. 9) ou de
données pénales (art. 10) peut nécessiter des garanties
supplémentaires selon le droit national.

---

## 4. Mesures techniques intégrées (Privacy by Design)

ZeroNeurone intègre des mesures conformes à l'article 25 du RGPD
(protection des données dès la conception) :

### Minimisation des données (art. 5(1)(c))

- Aucune collecte automatique de données
- Pas de télémétrie, analytics ou tracking
- Pas d'appels API externes pour les fonctions principales
- L'utilisateur décide de chaque donnée saisie

### Sécurité du traitement (art. 32)

- Chiffrement at-rest AES-256-GCM (IndexedDB + OPFS)
- Dérivation de clé PBKDF2 600 000 itérations
- Clé de chiffrement en mémoire uniquement, jamais persistée
- Verrouillage manuel (Alt+L) et automatique sur inactivité
- Déverrouillage alternatif par clé physique (WebAuthn PRF)

### Limitation de la conservation (art. 5(1)(e))

- Durée de rétention configurable par dossier (en jours)
- Quatre actions à l'expiration : avertissement, lecture seule,
  suppression, caviardage définitif
- Le caviardage remplace irréversiblement les contenus textuels
  tout en préservant la structure du graphe

### Portabilité (art. 20)

- Export complet en ZIP (JSON + fichiers joints)
- Format ouvert et documenté
- Import/export sans perte de données

### Droit à l'effacement (art. 17)

- Suppression d'éléments individuels ou d'dossiers entières
- Suppression effective des fichiers en OPFS
- Caviardage disponible pour anonymiser sans supprimer la structure

---

## 5. Collaboration et transferts

### Mode local (par défaut)

Aucun transfert de données. Le RGPD s'applique uniquement au
traitement local par l'utilisateur.

### Mode collaboratif

- Connexion pair-à-pair (WebRTC, chiffrement DTLS)
- Serveur de signalisation temporaire (aucune donnée persistée)
- Les données synchronisées transitent par des canaux chiffrés
- **Attention :** la collaboration implique un partage de données
  entre pairs. Le responsable de traitement doit s'assurer que
  tous les collaborateurs sont habilités à accéder aux données

### Export ZIP

- L'export crée un fichier local sur le poste de l'utilisateur
- Le transfert du fichier ZIP à un tiers constitue une
  communication de données soumise au RGPD
- Les exports chiffrés sont protégés par le mot de passe de
  l'dossier source

---

## 6. Registre des traitements (art. 30)

Les organisations utilisant ZeroNeurone pour traiter des données
personnelles doivent inscrire ce traitement dans leur registre.
Modèle d'entrée :

| Champ | Valeur suggérée |
|-------|-----------------|
| Finalité | Analyse d'dossier / Recherche OSINT |
| Catégories de données | Identité, relations, localisation, documents |
| Catégories de personnes | Personnes impliquées dans l'dossier |
| Destinataires | Analystes habilités (collaboration P2P) |
| Transferts hors UE | Non (stockage local navigateur) |
| Durée de conservation | Configurable par dossier (rétention) |
| Mesures de sécurité | Chiffrement AES-256-GCM, PBKDF2, verrouillage auto |

---

## 7. Analyse d'impact (AIPD / DPIA)

Une analyse d'impact (art. 35) est **probablement nécessaire** si :

- L'dossier porte sur des données sensibles (art. 9)
- L'dossier implique une surveillance systématique
- Le traitement concerne un grand nombre de personnes
- Les données incluent des antécédents pénaux (art. 10)

L'architecture locale de ZeroNeurone réduit significativement les
risques par rapport à une solution cloud, mais ne dispense pas de
l'AIPD si les critères ci-dessus sont remplis.

---

## 8. Recommandations pour les organisations

1. **Identifier la base légale** applicable à chaque type
   d'dossier
2. **Activer le chiffrement** at-rest pour toute dossier
   contenant des données personnelles
3. **Définir des durées de rétention** conformes aux obligations
   légales et à la finalité du traitement
4. **Limiter la collaboration** aux personnes habilitées
5. **Documenter** le traitement dans le registre des activités
6. **Réaliser une AIPD** si le traitement remplit les critères
   de l'article 35
7. **Former les analystes** à l'utilisation des fonctions de
   sécurité (chiffrement, verrouillage, rétention)
8. **Activer le verrouillage automatique** pour limiter
   l'exposition en cas d'absence du poste

---

## 9. Limites

- ZeroNeurone ne gère pas les droits d'accès des personnes
  concernées (droit d'accès, rectification, opposition). Ces
  obligations incombent au responsable de traitement.
- Le chiffrement protège les données au repos mais pas en
  mémoire pendant une session active.
- La collaboration P2P utilise le chiffrement de transport
  (DTLS), pas un chiffrement de bout en bout applicatif.
- L'effacement dans IndexedDB/OPFS dépend de l'implémentation
  du navigateur. Un effacement sécurisé au niveau matériel
  nécessite le chiffrement du disque hôte.

---

*Ce document est fourni à titre informatif et ne constitue pas un
avis juridique. Consultez votre délégué à la protection des données
(DPO) pour une analyse adaptée à votre contexte.*
