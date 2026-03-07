---
title: "FAQ"
weight: 5
---

# Questions fréquentes

Parce que vous avez des questions. Et c'est normal.

---

## Général

### C'est quoi ZeroNeurone exactement ?

Un tableau blanc infini qui comprend les relations. Imaginez Excalidraw qui aurait fait des études en analyse criminelle. Vous dessinez, vous reliez, et l'outil vous aide à voir ce que vous n'auriez pas vu seul.

### C'est gratuit ?

Oui. Open-source, gratuit, sans compte, sans tracking, sans "période d'essai de 14 jours". Vraiment gratuit.

### Ça marche sur quoi ?

| Navigateur | Verdict |
|------------|---------|
| Chrome/Edge | ✅ Parfait |
| Firefox | ✅ Parfait |
| Safari | ⚠️ Ça passe, mais Apple a des opinions sur le stockage local |

### Et sans internet ?

Une fois chargé, ZeroNeurone se fiche complètement d'internet. Coupez le câble, ça continue de marcher. Seule exception : la **vue carte** a besoin d'internet pour charger les tuiles OpenStreetMap ou satellite.

---

## Données et vie privée

### Mes données, elles vont où ?

Nulle part. Elles restent dans votre navigateur. Pas de serveur, pas de cloud, pas de "on analyse vos données pour améliorer nos services". Vos dossiers ne regardent que vous.

Techniquement :
- Métadonnées → IndexedDB (une base de données dans votre navigateur)
- Fichiers joints → OPFS (un système de fichiers local)

### Comment je sauvegarde alors ?

**Export ZIP** via le menu. C'est votre bouée de sauvetage. Faites-le régulièrement. On ne le répétera jamais assez. 

### Je peux synchroniser entre mon PC et mon laptop ?

Pas automatiquement. On est local-first, pas cloud-first. Le workflow :

1. Export ZIP sur la machine A
2. Transfert (clé USB, email, pigeon voyageur...)
3. Import ZIP sur la machine B

Ou utilisez la [collaboration]({{< relref "features/collaboration" >}}) pour travailler à plusieurs en temps réel.

### C'est chiffré ?

Depuis la v2.17, oui. ZeroNeurone propose un **chiffrement au repos** de toutes vos données locales :

- **AES-256-GCM** pour les métadonnées (IndexedDB)
- **XSalsa20-Poly1305** pour les fichiers joints (OPFS)
- **PBKDF2-SHA256** avec 600 000 itérations pour dériver la clé depuis votre mot de passe

Activez-le depuis l'icône cadenas sur la page d'accueil. Une fois activé, vos données sont illisibles sans le mot de passe.

**Ne rafraîchissez jamais la page pendant l'activation, la désactivation ou le changement de mot de passe.** L'opération chiffre/déchiffre toutes vos données une par une. L'interrompre peut les corrompre définitivement. Attendez que l'opération se termine — ça peut prendre un moment sur les gros dossiers.

### Et si je perds mon mot de passe de chiffrement ?

Vos données sont perdues. Pas de "mot de passe oublié", pas de backdoor, pas de "contactez le support". C'est le prix de la vraie sécurité. Faites un export ZIP **avant** d'activer le chiffrement, et gardez-le précieusement.

### C'est quoi WebAuthn PRF ?

Depuis la v2.18, vous pouvez déverrouiller vos dossiers chiffrés avec une **clé de sécurité matérielle** (YubiKey, par exemple) au lieu de taper votre mot de passe. C'est FIDO2 Level 3 pour les connaisseurs.

Vous pouvez enregistrer plusieurs clés et les gérer depuis les paramètres de chiffrement. Le mot de passe reste toujours disponible en secours.

### Le verrouillage automatique, ça marche comment ?

Vous pouvez configurer un **délai d'inactivité** (5, 15, 30 ou 60 minutes). Si vous ne touchez plus à rien pendant ce délai, le dossier se verrouille automatiquement. Il faut re-saisir le mot de passe (ou utiliser votre clé de sécurité) pour continuer.

Vous pouvez aussi verrouiller manuellement avec **Alt+L**. Pratique quand vous allez chercher un café et que vous ne faites pas confiance à vos collègues.

### C'est quoi la rétention des données ?

Depuis la v2.18, vous pouvez définir une **durée de rétention** par dossier (en jours). À l'expiration, quatre politiques possibles :

| Politique | Effet |
|-----------|-------|
| Avertissement | Un rappel s'affiche, c'est tout |
| Lecture seule | Le dossier est verrouillé en consultation |
| Suppression proposée | On vous suggère de supprimer |
| Rédaction permanente | Tout le texte est **irréversiblement** remplacé par des caractères de masquage |

La rédaction permanente ne plaisante pas. La structure du graphe survit, mais plus aucun contenu lisible. C'est fait pour ça.

---

## Utilisation

### Comment je crée un truc ?

**Double-clic** sur le canvas. Boom, un élément.

### Et pour les relier ?

**Glissez** d'un élément vers un autre. Le lien se crée tout seul.

### Supprimer ?

Sélectionnez, puis **Suppr** ou **Retour arrière**. Classique.

### J'ai fait une bêtise, je peux annuler ?

**Ctrl+Z** annule. **Ctrl+Shift+Z** rétablit. Ça couvre tout : créations, suppressions, modifications de propriétés, groupes, filtres, sections de rapport.

### Comment je groupe des éléments ?

1. Sélectionnez-en plusieurs (Ctrl+clic ou dessinez un rectangle)
2. Clic-droit → **Grouper**

Ils bougent ensemble maintenant. C'est beau.

### Je peux fusionner deux éléments ?

Oui. Sélectionnez 2 éléments → clic-droit → **Fusionner**. Choisissez le label à garder, le reste (propriétés, tags, fichiers, liens) est fusionné intelligemment. Les liens en double sont combinés, les auto-liens supprimés.

### C'est quoi les onglets canvas ?

Des **espaces de travail thématiques** au sein d'un même dossier. Un onglet par hypothèse, par acteur, par période... Les éléments d'autres onglets connectés au vôtre apparaissent en transparence. Pratique pour ne pas tout mélanger.

### Je mets des coordonnées GPS comment ?

1. Sélectionnez l'élément
2. Panneau de détail → **Localisation**
3. Tapez les coordonnées ou cliquez directement sur la carte

### Je peux déplacer le panneau latéral ?

Oui. Bouton **⇄** dans la barre d'outils — cycle entre droite, bas, gauche et fenêtre détachée. Le choix est mémorisé (sauf le mode détaché).

---

## Vues

### C'est quoi la vue Matrice ?

Un **tableur** de vos éléments. Touche **4** pour y accéder. Tri, filtrage par colonne, édition en ligne, sélection multiple, export CSV. Comme Excel, mais avec vos données de dossier.

### Et la Timeline ?

Vue chronologique de tous les éléments datés. Avec une **barre de densité** qui montre les périodes les plus chargées. Cliquez dessus pour filtrer par période.

---

## Import / Export

### Quel format pour sauvegarder ?

**ZIP**. Il embarque tout : métadonnées ET fichiers joints. Les autres formats (JSON, CSV) c'est pour l'interopérabilité, pas pour la sauvegarde.

### J'ai un Excel, ça marche ?

Exportez votre Excel en CSV d'abord, puis importez le CSV. ZeroNeurone ne parle pas le `.xlsx`.

### C'est compatible avec Gephi ?

Oui. Export **GraphML** → Import dans Gephi. Vos analyses de réseau vous attendent.

### Et QGIS ?

Export **GeoJSON** → Import dans QGIS. Vos points et lignes arrivent avec toutes leurs propriétés.

### Le format STIX ça passe ?

Oui, bundles STIX 2.1 supportés. Pour les amateurs de cyber threat intelligence.

### Le rapport HTML, ça fait quoi exactement ?

Un **fichier HTML autonome** avec votre rapport et un graphe SVG interactif. Pas besoin de ZeroNeurone pour le consulter. Depuis la v2.19 :

- Recherche (Ctrl+K) avec navigation clavier
- Filtrage par tags via un popover
- Images embarquées dans les formes du graphe
- Layout réversible (rapport à gauche ou à droite)
- Colonnes redimensionnables entre rapport et graphe
- Table des matières, thème clair/sombre, export Markdown

Le tout dans un seul fichier. Envoyez-le par email, et c'est immédiatement lisible.

### L'export ZIP peut être chiffré ?

Oui. Quand le chiffrement au repos est activé, l'export ZIP peut être protégé par mot de passe (format `.znzip`). Le destinataire devra connaître le mot de passe pour l'ouvrir.

---

## Plugins

### ZeroNeurone a des plugins ?

Oui. Un système d'extensions par slots. Les plugins peuvent ajouter des onglets, des entrées de menu contextuel, des raccourcis clavier, des hooks d'export/import, et plus encore. Zéro impact quand aucun plugin n'est installé.

### Comment j'installe un plugin ?

Déposez le fichier `.js` et son `manifest.json` dans le dossier `dist/plugins/`. Pour Docker, copiez-les dans `plugins/` avant le build. Pas de marketplace, pas de store — c'est un fichier, on le pose, ça marche.

### C'est sécurisé ?

Les erreurs de plugins ne plantent jamais l'application. Mais un plugin a accès à vos données de dossier. N'installez que des plugins de confiance.

### On m'a parlé de OneNeurone ?

C'est le plugin IA de ZeroNeurone. **OneNeurone** ajoute un assistant intelligent à votre dossier : dialogue avec le graphe en contexte, extraction d'entités et relations (NER), génération de rapports selon 5 registres (judiciaire, renseignement, corporate, journalistique, CERT), détection de patterns et anomalies, et analyse croisée inter-dossiers.

Philosophie : **"Le Neurone propose, l'analyste dispose."** Il ne modifie jamais le graphe directement, aucune donnée n'est envoyée sans votre action explicite, et il fonctionne 100% hors-ligne avec Ollama ou LM Studio. Multi-provider : Ollama, LM Studio, Anthropic, OpenAI, ou endpoint custom.

Si vous le retirez, ZeroNeurone fonctionne à l'identique. C'est un plugin, pas une dépendance.

OneNeurone est payant — parce qu'il faut bien faire vivre le projet open-source.

---

## Quand ça ne marche pas

### L'appli ne charge pas

1. **Ctrl+Shift+R** (hard refresh)
2. **F12** → Console → regardez les erreurs rouges
3. Essayez un autre navigateur

Si rien ne marche, c'est peut-être nous. Ouvrez une issue.

### J'ai perdu mes données

Si vous avez vidé le cache navigateur... elles sont parties. Pour de bon.

C'est pour ça qu'on insiste sur l'export ZIP régulier. On ne juge pas, on compatit.

### L'export PNG est bizarre

- Canvas trop zoomé ? Dézoomez.
- Essayez une résolution plus basse (1x au lieu de 4x)
- Les éléments très loin du centre peuvent être coupés

### Les fichiers joints ne s'affichent pas

- Le fichier est bien dans la liste ?
- Certains formats n'ont pas de prévisualisation (mais le téléchargement marche)
- Essayez de re-télécharger pour vérifier qu'il n'est pas corrompu

### L'import CSV plante

Checklist :
- Encodage UTF-8 ? (Excel aime bien mettre autre chose)
- Colonnes `type` et `label` présentes ?
- Téléchargez notre modèle CSV et comparez

---

## Collaboration

### Comment ça marche la collab ?

Temps réel, chiffré, sans compte :

- **WebSocket sécurisé** pour la synchro instantanée
- **AES-256-GCM** pour que personne ne lise vos données (même pas nous)
- **CRDT** pour fusionner les modifs sans conflit
- **Curseurs partagés** pour voir qui fait quoi

### C'est vraiment sécurisé ?

La clé de chiffrement est dans l'URL, après le `#`. Ce fragment n'est jamais envoyé au serveur (c'est un standard web). Le serveur voit passer des octets chiffrés, point.

### Combien de personnes max ?

Techniquement, pas de limite. Pratiquement, au-delà de 10 ça peut devenir confus. Mais ça marche.

### Et les gros dossiers ?

ZeroNeurone gère des dossiers avec **1500+ éléments et liens** en mode collaboratif. Au-delà de 500 éléments, les liens sont masqués pendant le pan/zoom pour la fluidité. En local, les performances sont excellentes jusqu'à plusieurs milliers d'éléments.

### Je peux bosser offline pendant une session partagée ?

Oui. Vos modifs sont stockées localement. À la reconnexion et nouveau partage, tout se synchronise.

### La rétention se synchronise en collab ?

Oui. La durée et la politique de rétention sont synchronisées entre tous les participants via Y.Doc.

---

## Le futur

### Version mobile ?

Non. L'interface est pensée pour un écran, un clavier, une souris. Sur téléphone ce serait frustrant pour tout le monde.

### Une API ?

Non plus. ZeroNeurone tourne entièrement dans votre navigateur. Pas de backend = pas d'API.

### Et si je veux une feature ?

Ouvrez une issue sur GitHub. On lit tout. On ne promet rien, mais on lit tout.

---

## Support

### Bug ?

[GitHub Issues](https://github.com/MeltingBot/zeroneurone/issues). Décrivez ce qui s'est passé, ce que vous attendiez, et si possible une capture d'écran.

### Je veux contribuer

Le code est sur GitHub, les PR sont bienvenues. Lisez le CONTRIBUTING.md d'abord.

### J'ai encore des questions

- Cette doc (vous y êtes)
- Les issues GitHub (souvent quelqu'un a déjà demandé)
- Les discussions GitHub (pour les questions ouvertes)
- [Le Discord *Oscar Zulu*](https://discord.gg/WrWZq9QY6d)


On fait de notre mieux pour répondre. Pas en temps réel, mais on répond.
