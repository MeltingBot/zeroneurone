---
title: "Stockage et maintenance"
weight: 3
---

# Stockage et maintenance

La fenêtre **Stockage** montre la place occupée par ZeroNeurone dans le navigateur, permet une sauvegarde complète et regroupe les opérations de maintenance.

Pour l'ouvrir : icône **disque dur** dans la barre d'outils de la page d'accueil.

---

## Onglet Stockage

- **Espace utilisé** — place occupée et quota accordé par le navigateur, avec la répartition entre fichiers joints (OPFS), base de données (IndexedDB) et historique Y.js.
- **Stockage persistant** — indique si le navigateur s'engage à ne pas effacer les données quand l'espace disque vient à manquer. Si la protection n'est pas active, le bouton la demande. Un refus est fréquent sur un site peu utilisé : ajoutez-le aux favoris et réessayez plus tard.
- **Contenu stocké** — nombre de dossiers, éléments, liens et fichiers.

---

## Onglet Sauvegarde

**Exporter tout** produit une archive ZIP contenant tous les dossiers, leurs fichiers et les jeux de tags. **Importer** relit une telle archive : son contenu est **ajouté** aux dossiers existants, rien n'est remplacé.

{{< hint warning >}}
Le navigateur reste un stockage fragile (vidage du cache, réinstallation). Une sauvegarde complète régulière, conservée hors du navigateur, est la seule protection contre une perte.
{{< /hint >}}

---

## Onglet Maintenance

### Détails du stockage

Prise en charge d'IndexedDB et d'OPFS par le navigateur, taille estimée de l'historique Y.js et taille estimée de chaque table de la base. Ces chiffres sont des estimations, calculées sur un échantillon.

### Historique Y.js par dossier

Chaque dossier possède une base Y.js, le format qui permet la collaboration en temps réel. Elle grossit avec le temps pour deux raisons :

- **L'historique des modifications.** Chaque déplacement, chaque champ modifié, chaque élément supprimé y laisse une trace, même après coup. Un dossier beaucoup retravaillé peut peser deux fois son contenu.
- **Les copies de fichiers.** Pour qu'un participant reçoive les fichiers d'un dossier partagé, ceux-ci sont copiés dans la base Y.js. Jusqu'à la version 2.60.0, cette copie était faite pour tous les dossiers, même jamais partagés : chaque fichier joint occupait donc deux fois sa taille.

La liste affiche la taille de la base de chaque dossier, la plus lourde en premier. **Purger l'historique** (au survol d'une ligne) ou **Tout purger** reconstruit la base à partir du contenu actuel du dossier :

- le contenu est conservé à l'identique : éléments, liens, notes et leur mise en forme, onglets, rapports, commentaires ;
- l'historique des modifications disparaît ;
- les copies de fichiers sont retirées, pour chaque fichier présent dans le stockage local et dont l'empreinte correspond ; un fichier absent ou différent garde sa copie.

L'annulation (Ctrl+Z) n'est pas concernée : elle ne dure que le temps de la session.

À la fin, un bilan s'affiche sous la liste :

| Message | Signification |
|---------|---------------|
| **Espace libéré** | Place récupérée sur l'ensemble des dossiers traités. |
| **Ignorés** | Dossiers partagés, ou dossier actuellement ouvert : ils ne sont pas modifiés. |
| **Non traités** | Contenu illisible (dossier chiffré sans la bonne clé) ou reconstruction qui ne correspondait pas exactement à l'original. **Rien n'a été modifié** pour ces dossiers. |

{{< hint info >}}
**Sécurité de l'opération** — la nouvelle base est relue et comparée à l'original avant d'être écrite, et l'écriture se fait en une seule fois : en cas d'écart, d'erreur ou d'interruption, l'ancienne base reste intacte.
{{< /hint >}}

#### Dossiers partagés

Un dossier partagé est marqué **Partagé** et ne peut pas être purgé : son historique est nécessaire pour rester synchronisé avec les autres participants, et ses copies de fichiers sont ce qu'ils téléchargent. Pour le purger, arrêtez d'abord le partage (fenêtre **Partager** du dossier). Si vous le partagez de nouveau ensuite, ses fichiers sont renvoyés automatiquement.

#### Quand purger

- Quand l'espace utilisé grossit sans que le contenu change beaucoup.
- Une fois après la mise à jour en 2.60.1, pour retirer les copies de fichiers des dossiers jamais partagés : c'est là que le gain est le plus net.

Les tailles affichées sont exactes une fois un dossier purgé. Le navigateur peut mettre un moment à rendre l'espace au système.

### Supprimer tous les dossiers

Efface tous les dossiers, éléments, liens, fichiers et historiques. Les jeux de tags et le réglage du chiffrement sont conservés. L'action demande deux confirmations et ne peut pas être annulée : faites une sauvegarde complète avant.

---

**Voir aussi** : [Stockage des données]({{< relref "data-storage" >}}) · [Chiffrement at-rest]({{< relref "../features/encryption" >}})
