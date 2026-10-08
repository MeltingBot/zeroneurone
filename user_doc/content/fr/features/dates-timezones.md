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

## Fuseau d'un événement, d'une période ou d'une propriété

Pour des heures relevées dans un autre fuseau (extraction de téléphone, journal serveur, source étrangère) :

1. Cliquez sur la ville affichée à droite de l'heure (« Paris » par défaut)
2. Choisissez le fuseau de la source (recherche par ville)
3. Saisissez l'heure telle qu'elle figure dans la source

Ailleurs, l'heure est affichée dans votre fuseau, suivie de l'heure d'origine :

```
20 avr. 2024, 02:12 (03:12 Beirut)
```

Disponible sur les événements, sur la période d'un lien et sur les propriétés **date/heure**. **Système** revient au fuseau normal.

---

## Dates importées à minuit UTC

D'anciens imports (CSV au format `AAAA-MM-JJ`, ANB) enregistraient certaines dates à minuit UTC : elles s'affichent à 01:00, 02:00 ou la veille.

Panneau du dossier, section **Dates** : **Vérifier**, puis **Corriger**. Rien ne change sans confirmation.

Propriétés date/heure d'une archive antérieure à la 2.61 : minuit UTC reste minuit dans votre fuseau, les autres heures sont lues exactement.

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

## Autres formats

| Format | Fuseau de la source |
|--------|---------------------|
| ZIP / JSON | Conservé |
| CSV | Colonne `fuseau` ; propriétés date/heure dans votre fuseau |
| Obsidian | Heure d'origine après la date : `2024-04-20T02:12 (03:12 Asia/Beirut)` |
| GeoJSON | Propriété `timeZone` des liens |
| i2 (ANX) | Non transmis : heures dans votre fuseau |
| Rapports | Heure d'origine entre parenthèses |
| Import JSON | Horodatages avec fuseau (`Z`, `+02:00`) lus exactement |

---

**Voir aussi** : [Mode temporel]({{< relref "temporal-mode" >}}) | [Timeline]({{< relref "timeline" >}})
