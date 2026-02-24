---
title: "Rétention des enquêtes"
weight: 15
---

# Rétention des enquêtes

ZeroNeurone permet de définir une durée de vie par enquête, en nombre de jours. Cette fonctionnalité répond aux exigences de conformité légale sur la conservation des données d'investigation.

Par défaut, la rétention est **illimitée** — l'enquête est conservée sans restriction de durée.

---

## Configurer la rétention

1. Ouvrez une enquête
2. Dans le panneau de détail (à droite), ouvrez la section **Rétention**
3. Saisissez une durée en jours (minimum 1)
4. Choisissez le comportement à l'expiration
5. Cliquez sur **Appliquer**

La date d'expiration est calculée automatiquement à partir de la date de création de l'enquête.

---

## Comportements à l'expiration

Quatre options sont disponibles :

| Politique | Effet |
|-----------|-------|
| **Avertissement** | Un message s'affiche à l'ouverture de l'enquête. L'enquête reste utilisable normalement. |
| **Lecture seule** | L'enquête est verrouillée en lecture. Aucune modification n'est possible (éléments, liens, propriétés, etc.). |
| **Suppression proposée** | Une fenêtre de confirmation propose la suppression définitive de l'enquête. L'utilisateur peut refuser. |
| **Caviardage définitif** | Une fenêtre propose le caviardage : tous les contenus textuels sont irréversiblement remplacés par des caractères de masquage. La structure du graphe est conservée. |

{{< hint danger >}}
**Le caviardage est irréversible.** Une fois appliqué, aucune restauration n'est possible. Les noms, notes, propriétés et tags de tous les éléments et liens sont définitivement effacés.
{{< /hint >}}

---

## Réinitialiser la rétention

Pour revenir à une durée illimitée :

1. Section **Rétention** dans le panneau de détail
2. Cliquez sur **Réinitialiser**

La rétention est supprimée et l'enquête retrouve une durée de vie illimitée.

---

## Rétention et collaboration

Les paramètres de rétention (durée et politique) sont synchronisés entre les participants en mode collaboratif. Si un participant modifie la rétention, le changement est propagé à tous les pairs connectés.

---

## Rétention et export/import

### Export

Les paramètres de rétention sont inclus dans le fichier ZIP exporté.

### Import

Si le document importé possède une rétention et que la date d'expiration est dépassée, un avertissement est affiché dans le résultat d'import. L'enquête peut néanmoins être importée normalement.

---

## Indicateur d'expiration

Lorsqu'une enquête est expirée, la section Rétention affiche en rouge le nombre de jours écoulés depuis l'expiration.

---

**Voir aussi** : [Chiffrement at-rest]({{< relref "encryption" >}}) · [Export]({{< relref "../import-export/export" >}})
