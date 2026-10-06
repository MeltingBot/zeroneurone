---
title: "Mode temporel"
weight: 6
---

# Mode temporel

Le canvas et la carte partagent la même barre temporelle : placez-vous à une date ou sur une période, et ce qui s'y passe ressort.

---

## Activer

Cliquez sur **Temporel** dans la barre d'outils du canvas ou de la carte. Le bouton n'apparaît que si le dossier contient des dates (événements, périodes de liens).

---

## Barre temporelle

| Contrôle | Fonction |
|----------|----------|
| **⏮ / ⏭** | Date précédente / suivante |
| **▶** | Lecture automatique |
| **Période** (calendrier) | Passer d'une date unique à une période |
| **Curseur** | Choisir la date (deux poignées en mode période) |
| **Champs date** | Saisir une date et une heure précises |
| **n/N** | Position parmi les dates du dossier |

Les pas suivent les dates du dossier. En mode période, ⏮, ⏭ et ▶ font glisser la période en gardant sa largeur.

---

## Sur le canvas

| Objet | Rendu |
|-------|-------|
| Élément ayant un événement à la date (ou dans la période) | Halo, événement affiché sous l'élément |
| Lien dont la période couvre la date | Halo |
| Élément relié par un lien actif | Normal |
| Élément ou lien daté, hors date | Atténué |
| Élément ou lien sans date | Grisé, ou masqué avec l'**œil** de la barre |

Les positions ne changent pas. Un événement en cours (date de fin postérieure) est actif.

### Événement sous l'élément

| Cas | Action |
|-----|--------|
| Un seul événement | Clic : ouvre l'événement dans le panneau de détail |
| Plusieurs événements (`+N`) | Survol : liste datée ; clic sur un événement : l'ouvre dans le panneau |

---

## Sur la carte

| Mode | Affichage |
|------|-----------|
| **Date unique** | Chaque élément à sa dernière position connue à cette date |
| **Période** | Seuls les éléments actifs dans la période, à leur dernière position de la période |

Boutons propres à la carte :

| Bouton | Fonction |
|--------|----------|
| **Suivre** | La caméra suit les événements pendant la lecture |
| **Trace** | Affiche les positions précédentes (limitées à la période en mode période) |

L'événement s'affiche sous le marqueur, avec la même liste qu'au canvas.

---

## Fuseau horaire

Les heures sont affichées dans le fuseau du système, indiqué au bout de la barre (grands écrans) ou au survol des champs date. Voir [Dates et fuseaux horaires]({{< relref "dates-timezones" >}}).

---

**Voir aussi** : [Vue carte]({{< relref "map-view" >}}) | [Timeline]({{< relref "timeline" >}})
