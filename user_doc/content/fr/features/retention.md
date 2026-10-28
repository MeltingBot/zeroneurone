---
title: "Clôture et rétention des dossiers"
weight: 15
---

# Clôture et rétention des dossiers

ZeroNeurone permet de définir une durée de vie par dossier, en nombre de jours. Cette fonctionnalité répond aux exigences de conformité légale sur la conservation des données.

Par défaut, la rétention est **illimitée** — le dossier est conservé sans restriction de durée.

---

## Clôturer un dossier

Un dossier clôturé passe en **lecture seule** : éléments, liens, pièces jointes, commentaires, rapport, onglets, vues et requêtes sauvegardées ne peuvent plus être modifiés, et aucun import n'y est possible. Une tentative de modification affiche « Dossier clôturé : lecture seule ».

1. Ouvrez le dossier
2. Dans le panneau de détail, section **Dates**, ligne **Clôture**, cliquez sur **Clôturer**
3. Confirmez

Un bandeau « Clôturé le … — lecture seule » s'affiche sous l'en-tête, et la carte du dossier porte la mention **Clôturé** sur la page d'accueil.

Pour reprendre le travail, cliquez sur **Rouvrir** dans la même section. Chaque clôture passée reste listée avec sa date de réouverture.

La clôture est synchronisée entre les participants en mode collaboratif. Elle n'est pas reprise à l'import : un dossier importé est toujours ouvert.

---

## Configurer la rétention

1. Ouvrez un dossier
2. Dans le panneau de détail (à droite), ouvrez la section **Rétention**
3. Saisissez une durée en jours (minimum 1)
4. Choisissez le comportement à l'expiration
5. Cliquez sur **Appliquer**

Le champ **Compter depuis** fixe le point de départ :

- **La création** (par défaut) : la durée court dès la création du dossier ;
- **La clôture** : la durée commence à la **première** clôture. Tant que le dossier n'a jamais été clôturé, il n'expire pas. Le rouvrir puis le reclôturer ne repousse pas l'échéance.

---

## Comportements à l'expiration

Quatre options sont disponibles :

| Politique | Effet |
|-----------|-------|
| **Avertissement** | Un message s'affiche à l'ouverture du dossier. Le dossier reste utilisable normalement. |
| **Lecture seule** | Le dossier est verrouillé en lecture. Aucune modification n'est possible (éléments, liens, propriétés, etc.). |
| **Suppression proposée** | Une fenêtre de confirmation propose la suppression définitive du dossier. L'utilisateur peut refuser. |
| **Caviardage définitif** | Une fenêtre propose le caviardage : tous les contenus textuels sont irréversiblement remplacés par des caractères de masquage. La structure du graphe est conservée. |

{{< hint danger >}}
**Le caviardage est irréversible.** Une fois appliqué, aucune restauration n'est possible. Les noms, notes, propriétés et tags de tous les éléments et liens sont définitivement effacés.
{{< /hint >}}

---

## Réinitialiser la rétention

Pour revenir à une durée illimitée :

1. Section **Rétention** dans le panneau de détail
2. Cliquez sur **Réinitialiser**

La rétention est supprimée et le dossier retrouve une durée de vie illimitée.

---

## Rétention et collaboration

Les paramètres de rétention (durée, politique et point de départ) sont synchronisés entre les participants en mode collaboratif. Si un participant modifie la rétention, le changement est propagé à tous les pairs connectés.

---

## Rétention et export/import

### Export

Les paramètres de rétention sont inclus dans le fichier ZIP exporté.

### Import

Si le document importé possède une rétention et que la date d'expiration est dépassée, un avertissement est affiché dans le résultat d'import. Le dossier peut néanmoins être importé normalement.

---

## Indicateur d'expiration

Lorsqu'un dossier est expiré, la section Rétention affiche en rouge le nombre de jours écoulés depuis l'expiration.

---

**Voir aussi** : [Chiffrement at-rest]({{< relref "encryption" >}}) · [Export]({{< relref "../import-export/export" >}})
