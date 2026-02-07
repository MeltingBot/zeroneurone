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

Une fois chargé, ZeroNeurone se fiche complètement d'internet. Coupez le câble, ça continue de marcher.

---

## Données et vie privée

### Mes données, elles vont où ?

Nulle part. Elles restent dans votre navigateur. Pas de serveur, pas de cloud, pas de "on analyse vos données pour améliorer nos services". Vos enquêtes ne regardent que vous.

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

Le stockage navigateur n'est pas chiffré par défaut. Si vous travaillez sur des données sensibles :

- Activez le chiffrement disque de votre OS (FileVault, BitLocker, LUKS)
- Exportez en ZIP et chiffrez l'archive avec un mot de passe

Pour la collaboration temps réel, là oui : chiffrement AES-256-GCM de bout en bout.

---

## Utilisation

### Comment je crée un truc ?

**Double-clic** sur le canvas. Boom, un élément.

### Et pour les relier ?

**Glissez** d'un élément vers un autre. Le lien se crée tout seul.

### Supprimer ?

Sélectionnez, puis **Suppr** ou **Retour arrière**. Classique.

### J'ai fait une bêtise, je peux annuler ?

**Ctrl+Z** annule. **Ctrl+Shift+Z** rétablit. Comme partout, mais ça marche.

### Comment je groupe des éléments ?

1. Sélectionnez-en plusieurs (Ctrl+clic ou dessinez un rectangle)
2. Clic-droit → **Grouper**

Ils bougent ensemble maintenant. C'est beau.

### Je mets des coordonnées GPS comment ?

1. Sélectionnez l'élément
2. Panneau de détail → **Localisation**
3. Tapez les coordonnées ou cliquez directement sur la carte

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

### Et les grosses enquêtes ?

ZeroNeurone gère des enquêtes avec **1500+ éléments et liens** en mode collaboratif. Au-delà de 500 éléments, les liens sont masqués pendant le pan/zoom pour la fluidité. En local, les performances sont excellentes jusqu'à plusieurs milliers d'éléments.

### Je peux bosser offline pendant une session partagée ?

Oui. Vos modifs sont stockées localement. À la reconnexion et nouveau partage, tout se synchronise.

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
