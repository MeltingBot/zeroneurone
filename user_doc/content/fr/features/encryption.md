---
title: "Chiffrement at-rest"
weight: 14
---

# Chiffrement at-rest

ZeroNeurone peut chiffrer l'intégralité de vos données locales (enquêtes, éléments, liens, fichiers joints) avec un mot de passe. Sans ce mot de passe, les données stockées dans le navigateur sont illisibles.

{{< hint info >}}
Le chiffrement est **optionnel**. ZeroNeurone fonctionne normalement sans lui. Activez-le si vous travaillez sur des sujets sensibles ou sur une machine partagée.
{{< /hint >}}

---

## Activer le chiffrement

1. Depuis la page d'accueil, cliquez sur l'icône **cadenas** (en bas à droite si aucune enquête, dans la barre de titre sinon)
2. Dans la fenêtre qui s'ouvre, cliquez sur **Activer le chiffrement**
3. Choisissez un mot de passe (8 caractères minimum)
4. Confirmez le mot de passe
5. Cliquez sur **Confirmer**

ZeroNeurone migre toutes vos données existantes, puis **recharge automatiquement la page**. À ce rechargement, une fenêtre vous demande votre mot de passe pour déverrouiller l'accès.

{{< hint warning >}}
**Conservez votre mot de passe précieusement.** ZeroNeurone ne peut pas récupérer vos données si vous l'oubliez. Aucune réinitialisation n'est possible.
{{< /hint >}}

---

## Se connecter après activation

À chaque démarrage de l'application (ou après un verrouillage de session), une fenêtre de déverrouillage apparaît.

1. Saisissez votre mot de passe
2. Cliquez sur **Déverrouiller**

L'application s'ouvre normalement. Vos données sont déchiffrées à la volée — vous ne remarquez aucune différence dans l'utilisation quotidienne.

---

## Verrouiller la session

Le verrouillage efface le mot de passe de la mémoire sans fermer le navigateur. Utile si vous quittez votre poste momentanément.

- **Raccourci clavier :** `Alt+L`
- **Ou :** icône cadenas → bouton **Verrouiller la session**

Au prochain accès, la fenêtre de déverrouillage réapparaît.

---

## Changer le mot de passe

1. Icône cadenas → **Changer le mot de passe**
2. Saisissez l'ancien mot de passe
3. Saisissez et confirmez le nouveau mot de passe
4. Cliquez sur **Confirmer**

Le changement de mot de passe est instantané. Vos données ne sont pas re-chiffrées — seule la clé de protection change.

---

## Désactiver le chiffrement

1. Icône cadenas → **Désactiver le chiffrement**
2. Saisissez votre mot de passe pour confirmer
3. Cliquez sur **Confirmer**

ZeroNeurone déchiffre toutes les données, puis recharge la page. L'application retrouve son fonctionnement sans mot de passe.

---

## Ce qui est chiffré

| Données | Chiffrées |
|---------|-----------|
| Enquêtes, éléments, liens | Oui |
| Fichiers joints (images, PDF…) | Oui |
| Rapports et vues | Oui |
| Données des extensions | Oui |
| Configuration (types de tags) | Non |

---

## Export ZIP avec mot de passe

L'export ZIP dispose d'une option de protection indépendante du chiffrement at-rest. Cochez **Protéger par mot de passe** dans la fenêtre d'export pour chiffrer le fichier ZIP lui-même.

Ces deux protections sont complémentaires :
- Le chiffrement at-rest protège les données sur cette machine
- Le mot de passe ZIP protège le fichier exporté en transit ou à l'archivage

---

## Questions fréquentes

**Que se passe-t-il si j'oublie mon mot de passe ?**
Les données sont irrécupérables. ZeroNeurone n'a aucun mécanisme de récupération — c'est une propriété fondamentale du chiffrement. Exportez régulièrement vos enquêtes en ZIP.

**Le chiffrement ralentit-il l'application ?**
Imperceptiblement. Le chiffrement utilise des algorithmes optimisés pour le navigateur. Sur une enquête de taille normale, aucune latence n'est visible.

**Mes données sont-elles protégées si quelqu'un vole mon ordinateur ?**
Oui, si la session est verrouillée ou le navigateur fermé. Les données stockées dans le navigateur sont illisibles sans le mot de passe. En revanche, si votre session est déverrouillée au moment du vol, les données sont accessibles.

**Puis-je utiliser le même mot de passe sur plusieurs machines ?**
Oui. Les données sont chiffrées par machine — chaque installation a sa propre clé. Exporter/importer une enquête depuis une machine chiffrée vers une autre produit des données en clair dans le ZIP (déchiffrées pour l'export).

---

**Voir aussi** : [Stockage des données]({{< relref "../reference/data-storage" >}}) · [Export]({{< relref "../import-export/export" >}})
