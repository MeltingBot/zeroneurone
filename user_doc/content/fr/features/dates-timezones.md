---
title: "Dates et fuseaux horaires"
weight: 6
---

# Dates et fuseaux horaires

---

## Fuseau d'affichage

Toutes les heures sont affichées dans le fuseau du système (réglage de l'ordinateur). Il est indiqué dans le panneau du dossier, section **Dates**.

Une date saisie sans heure correspond à la journée entière.

---

## Fuseau d'un événement ou d'une période

Pour des heures relevées dans un autre fuseau (extraction de téléphone, journal serveur, source étrangère) :

1. Cliquez sur la ville affichée à droite de l'heure (« Paris » par défaut)
2. Choisissez le fuseau de la source (recherche par ville)
3. Saisissez l'heure telle qu'elle figure dans la source

Ailleurs, l'heure est affichée dans votre fuseau, suivie de l'heure d'origine :

```
20 avr. 2024, 02:12 (03:12 Beirut)
```

Disponible sur les événements et sur la période d'un lien. **Système** revient au fuseau normal.

---

## Dates importées à minuit UTC

D'anciens imports (CSV au format `AAAA-MM-JJ`, ANB) enregistraient certaines dates à minuit UTC : elles s'affichent à 01:00, 02:00 ou la veille.

Panneau du dossier, section **Dates** : **Vérifier**, puis **Corriger**. Rien ne change sans confirmation.

---

## Dates incomplètes

L'import généalogique (GEDCOM, GeneWeb) conserve les dates connues seulement à l'année ou au mois, et les dates approximatives :

| Source | Affichage |
|--------|-----------|
| `1890` | 1890 |
| `MAR 1890` | mars 1890 |
| `ABT 1890` | ~1890 |

Sur la timeline et la barre temporelle, ces dates couvrent toute la période. Modifier la date à la main en fait une date complète.

---

## Formats CSV

| Format | Signification |
|--------|---------------|
| `2019` | Année |
| `2019-03` | Mois |
| `2019-03-12` | Jour |
| `2019-03-12 14:30` | Jour et heure |
| `~2019` | Date approximative |

La colonne `fuseau` (ex. `Asia/Beirut`) indique le fuseau des heures de la ligne. Voir [Import]({{< relref "import-export/import" >}}) et [Export]({{< relref "import-export/export" >}}).

---

**Voir aussi** : [Mode temporel]({{< relref "temporal-mode" >}}) | [Timeline]({{< relref "timeline" >}})
