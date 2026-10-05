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

Une fois chargé, ZeroNeurone se fiche complètement d'internet. Coupez le câble, ça continue de marcher. Sauf ce qui a besoin de parler au reste du monde : la **vue carte** (les tuiles ne tombent pas du ciel), la **collaboration** (vos collègues non plus) et les **plugins** qui appellent un service en ligne. Le reste vit très bien en ermite.

### Il y a un mode sombre ?

Oui. L'icône **lune** dans la barre d'outils. Vos yeux à 2 h du matin vous remercient.

### Et en anglais ? En espagnol ?

L'interface parle **11 langues** : français, anglais, allemand, espagnol, italien, portugais, néerlandais, polonais, catalan, basque et ukrainien. Le petit drapeau dans la barre d'outils, et on change.

### Il y a une antisèche des raccourcis ?

Touche **?** dans un dossier. Tout s'affiche. La liste complète est aussi dans [Raccourcis clavier]({{< relref "reference/keyboard-shortcuts" >}}).

---

## Données et vie privée

### Mes données, elles vont où ?

Nulle part. Elles restent dans votre navigateur. Pas de serveur, pas de cloud, pas de "on analyse vos données pour améliorer nos services". Vos dossiers ne regardent que vous.

Techniquement :
- Métadonnées → IndexedDB (une base de données dans votre navigateur)
- Fichiers joints → OPFS (un système de fichiers local)

### Comment je sauvegarde alors ?

**Export ZIP** via le menu. C'est votre bouée de sauvetage. Faites-le régulièrement. On ne le répétera jamais assez.

Flemme de faire dossier par dossier ? Icône **disque dur** de l'accueil → **Sauvegarde** → **Exporter tout**. Un seul ZIP, avec tout dedans.

### Je peux synchroniser entre mon PC et mon laptop ?

Pas automatiquement. On est local-first, pas cloud-first. Le workflow :

1. Export ZIP sur la machine A (ou **Exporter tout** pour déménager d'un coup)
2. Transfert (clé USB, email, pigeon voyageur...)
3. Import ZIP sur la machine B (rien n'est écrasé, promis)

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

### ZeroNeurone grossit, c'est normal ?

Un peu. Chaque dossier garde la trace de tout ce que vous avez bougé, retouché, supprimé. Et jusqu'à la v2.60.0, chaque fichier joint était stocké en double. Ça pèse.

Cure d'amaigrissement : icône **disque dur** → **Maintenance** → **Tout purger**. Le contenu ne bouge pas d'un pixel, seul le superflu part. Les dossiers partagés sont dispensés. Le détail est dans [Stockage et maintenance]({{< relref "reference/maintenance" >}}).

---

## Utilisation

### Je débute, par où je commence ?

Par le **tutoriel guidé** : bouton dans le bandeau d'accueil, ou l'icône **chapeau de diplômé**. Des bulles vous montrent où cliquer, et chaque étape se valide quand vous l'avez vraiment faite. Pas de « Suivant » à marteler. Le tout se passe dans un dossier d'entraînement, à jeter à la fin sans remords.

### Comment je crée un truc ?

**Double-clic** sur le canvas. Boom, un élément. Ou **E**, pour les allergiques à la souris.

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

### Où sont les types d'entités ? Personne, entreprise, téléphone...

Il n'y en a pas. Exprès. ZeroNeurone n'impose aucune ontologie : un élément est ce que vous en dites. Une **personne**, c'est un élément avec le tag `personne`. Un **lieu**, pareil. Un concept que personne n'a encore inventé ? Pareil aussi.

Les **tags** font tout le travail : ils filtrent, colorent, servent dans les requêtes. Et pour ne pas tout ressaisir à chaque fois, les **jeux de tags** associent à un tag une couleur, une forme, une icône et des propriétés suggérées (date de naissance, SIREN, IBAN...). Quelques jeux sont fournis d'office, tout se modifie, rien n'est sacré. Détails dans [Tags et propriétés]({{< relref "features/tags-properties" >}}).

### Je peux coter mes infos façon Europol ?

Oui. Panneau du dossier → **Évaluation de l'information** → choisissez **Europol (4x4)** ou **Amirauté / OTAN (6x6)**. Chaque élément et lien se cote alors avec deux codes (ex. **B2** : source le plus souvent fiable, information connue de la source). Le choix vaut pour tout le dossier, collaborateurs compris. Revenir au modèle ZeroNeurone ne perd rien : rien n'est converti, tout est conservé. Détails dans [Évaluation de l'information]({{< relref "features/evaluation" >}}).

### C'est quoi les onglets canvas ?

Des **espaces de travail thématiques** au sein d'un même dossier. Un onglet par hypothèse, par acteur, par période... Les éléments d'autres onglets connectés au vôtre apparaissent en transparence. Pratique pour ne pas tout mélanger.

### Je mets des coordonnées GPS comment ?

1. Sélectionnez l'élément
2. Panneau de détail → **Localisation**
3. Tapez les coordonnées ou cliquez directement sur la carte

### Je peux rédiger mon rapport dedans ?

Oui. Onglet **Rapport** du panneau latéral : des sections en Markdown, et `[[` pour citer un élément. La référence devient un lien cliquable vers le graphe — fini les « cf. annexe 3, page 12 ». Vous partez d'une page blanche ? La **Synthèse** (barre d'outils) génère un premier jet structuré à partir du dossier, en HTML, Markdown ou JSON, ou directement à l'impression.

### Les filtres ne suffisent plus, je fais comment ?

**ZNQuery**, le langage de requêtes maison. Onglet **Requêtes** du panneau latéral, ou `?` dans la recherche (Ctrl+K). Du clic pour les timides, du texte pour les autres :

```
tag = "personne" AND confidence > 70
WITHIN 2 HOPS OF tag = "suspect"
```

La deuxième ramène tout ce qui est à deux liens d'un suspect. Les requêtes se sauvegardent. Le mode d'emploi est dans [Requêtes avancées]({{< relref "features/queries" >}}).

### Et les EXIF de mes photos ? Les métadonnées des fichiers ?

ZeroNeurone les lit pour vous. Joignez une photo, un PDF, un document Office ou un e-mail : il fouille dedans et vous montre ce qu'il a trouvé. Appareil, date de prise de vue, auteur, dates de modification, expéditeur, IP d'origine d'un mail, pixels de tracking... Vous cochez ce qui vous intéresse, ça devient des propriétés de l'élément.

Une photo avec des **coordonnées GPS** ? L'élément atterrit directement sur la carte. Vous aviez cliqué « Ignorer » un peu vite ? L'icône **information** sur la ligne du fichier relance l'analyse. Et tout se passe dans votre navigateur : vos fichiers ne partent nulle part pour être analysés. Détails dans [Fichiers joints]({{< relref "features/attachments" >}}).

### Je peux déplacer le panneau latéral ?

Oui. Bouton **⇄** dans la barre d'outils — cycle entre droite, bas, gauche et fenêtre détachée. Le choix est mémorisé (sauf le mode détaché).

---

## Vues

### C'est quoi la vue Matrice ?

Un **tableur** de vos éléments. Touche **4** pour y accéder. Tri, filtrage par colonne, édition en ligne, sélection multiple, export CSV. Comme Excel, mais avec vos données de dossier.

### Et la Timeline ?

Vue chronologique de tous les éléments datés. Avec une **barre de densité** qui montre les périodes les plus chargées. Cliquez dessus pour filtrer par période.

### Il trouve des choses tout seul ?

Seulement quand vous lui demandez. Le panneau **Insights** passe le graphe à la moulinette : **clusters** (qui traîne avec qui), **centralité** (qui est au milieu de tout), **ponts** (ceux qui relient deux mondes), éléments isolés, cycles. Sélectionnez deux éléments et il trouve le **plus court chemin** entre eux. Il montre, vous concluez. Détails dans [Analyse de graphe]({{< relref "features/graph-analysis" >}}).

### Mon graphe ressemble à un plat de spaghettis

Classique passé 200 éléments. Trois remèdes :

- les **filtres**, pour n'afficher que ce qui compte (tags, confiance, propriétés...) ;
- le mode **Focus** (touche **F**), pour isoler un élément et son voisinage ;
- les **vues**, pour sauvegarder une configuration et y revenir d'un clic.

Détails dans [Filtres et vues]({{< relref "features/filters-views" >}}).

### Je ne retrouve plus un élément

**Ctrl+K**. La recherche fouille les labels, notes, tags, propriétés... et même le texte des PDF et documents joints. Elle pardonne les fautes de frappe : « dupond » trouve « Dupont ».

---

## Import / Export

### Quel format pour sauvegarder ?

**ZIP**. Il embarque tout : métadonnées ET fichiers joints. Les autres formats (JSON, CSV) c'est pour l'interopérabilité, pas pour la sauvegarde.

### J'ai un Excel, ça marche ?

Exportez votre Excel en CSV d'abord, puis importez le CSV. ZeroNeurone ne parle pas le `.xlsx`.

### C'est compatible avec Gephi ?

Oui, dans les deux sens. Export **GraphML** ou **GEXF** → Gephi, et retour par GEXF ou Gephi Lite. Vos analyses de réseau vous attendent.

### Et i2 Analyst's Notebook ?

Oui, aller-retour compris : import **ANX** et **ANB**, export **ANX**. Analyst's Notebook l'ouvre sans broncher.

### Obsidian, Mermaid ?

Oui et oui. Un **coffre Obsidian** avec une fiche par élément, et du **Mermaid** à coller dans votre wiki.

### Et le reste ?

Excalidraw, OSINT Industries, GEDCOM, FEC comptable... La liste complète est dans [Import]({{< relref "import-export/import" >}}) et [Export]({{< relref "import-export/export" >}}). Elle est longue.

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

### Je peux chercher dans un PDF joint ?

Oui. Aperçu (icône œil) → **Ctrl+F**. Ça surligne, ça ignore les accents, **Entrée** pour le suivant. Un PDF scanné sans texte, en revanche, n'aura pas de texte à rechercher.

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

### Il faut un serveur ?

Oui, un relais. Le projet en met un à disposition : `wss://sync.zeroneurone.com`. À coller une fois dans **Partager** → **Serveur de synchronisation**, et c'est parti. Vos invités, eux, le reçoivent avec le lien. Vous préférez le vôtre ? Il s'héberge, voir [Collaboration]({{< relref "features/collaboration" >}}).

### C'est vraiment sécurisé ?

La clé de chiffrement est dans l'URL, après le `#`. Ce fragment n'est jamais envoyé au serveur (c'est un standard web). Le serveur voit passer des octets chiffrés, point.

### On peut discuter d'un élément sans toucher à ses notes ?

Oui, avec les **commentaires** : section dédiée dans le panneau de détail d'un élément ou d'un lien. Un badge signale sur le canvas ceux qui attendent une réponse, et on les marque comme résolus une fois l'affaire réglée. Les notes restent propres, la discussion a sa place.

### Combien de personnes max ?

Techniquement, pas de limite. Pratiquement, au-delà de 10 ça peut devenir confus. Mais ça marche.

### Et les gros dossiers ?

ZeroNeurone gère des dossiers avec **1500+ éléments et liens** en mode collaboratif. Au-delà de 500 éléments, les liens sont masqués pendant le pan/zoom pour la fluidité. En local, les performances sont excellentes jusqu'à plusieurs milliers d'éléments.

### Je peux bosser offline pendant une session partagée ?

Oui. Vos modifs sont stockées localement. Rouvrez le dossier une fois reconnecté, il retrouve la session tout seul.

### Les fichiers joints suivent ?

Oui, jusqu'à **50 Mo** par fichier. Au-delà, il reste chez vous. Au-dessus de 10 Mo, prévoyez un café.

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
