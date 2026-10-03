---
title: "Information evaluation"
weight: 2
---

# Information evaluation

Every element and link can carry an evaluation of the information it represents. ZeroNeurone offers three evaluation models, chosen per dossier.

| Model | Principle |
|-------|-----------|
| **ZeroNeurone** (default) | A single confidence level, from 0 to 100% in steps of 10 |
| **Europol (4x4)** | Source reliability (A, B, C, X) and information accuracy (1 to 4) |
| **Admiralty / NATO (6x6)** | Source reliability (A to F) and information credibility (1 to 6) |

Both standard grids evaluate **the source** and **the information** separately. A grading is written with two characters: **B2** means "source mostly reliable, information known personally to the source".

---

## Choose the model of a dossier

1. Open a dossier
2. In the dossier detail panel, open the **Information evaluation** section
3. Pick the model in the list

The model is **shared by every participant** of a collaborative session: a change made by one applies to all.

---

## Europol grid

Grid set by Article 29 of [Regulation (EU) 2016/794](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0794).

| Source | Definition |
|--------|------------|
| **A** | No doubt as to the authenticity, trustworthiness and competence of the source, or the source has proved to be reliable in all instances |
| **B** | The source has in most instances proved to be reliable |
| **C** | The source has in most instances proved to be unreliable |
| **X** | The reliability of the source cannot be assessed |

| Information | Definition |
|-------------|------------|
| **1** | Information whose accuracy is not in doubt |
| **2** | Information known personally to the source but not known personally to the official passing it on |
| **3** | Information not known personally to the source but corroborated by other information already recorded |
| **4** | Information not known personally to the source and which cannot be corroborated |

## Admiralty grid

| Source | | Information | |
|--------|---|-------------|---|
| **A** | Completely reliable | **1** | Confirmed by other sources |
| **B** | Usually reliable | **2** | Probably true |
| **C** | Fairly reliable | **3** | Possibly true |
| **D** | Not usually reliable | **4** | Doubtful |
| **E** | Unreliable | **5** | Improbable |
| **F** | Reliability cannot be judged | **6** | Truth cannot be judged |

---

## Grade an element or a link

In the detail panel, **Metadata** section:

- with the ZeroNeurone model, the confidence slider. The **Clear** button resets the confidence to "not set";
- with the Europol or Admiralty model, two lists: source reliability and information accuracy. The full definition of the chosen code shows when hovering the list.

With a multiple selection, the **Grading** section applies the same grading to every selected element and link; with the ZeroNeurone model, the **Confidence** section can also clear the confidence of the whole selection. In the [matrix view]({{< relref "matrix-view" >}}), the grading column is edited by typing the code directly (e.g. `B2`).

---

## Change the model

Changing the model **never converts** existing gradings: there is no official mapping between the grids.

- Confidence levels stay recorded and reappear if you switch back to the ZeroNeurone model.
- A grading made in another grid is kept and shown **greyed out**, with its scale. It is replaced as soon as you grade the element in the active grid.

When gradings are affected, ZeroNeurone states how many and asks for confirmation before switching.

---

## Display, filters and queries

| Feature | With the Europol / Admiralty model |
|---------|------------------------------------|
| **Canvas indicator** | Badge with the grading (e.g. `B2`), turned on in [Views]({{< relref "filters-views" >}}) |
| **Filters** | Source and information codes to tick; **Reliable sources** quick filter (A-B for Europol, A-C for Admiralty) |
| **Queries** | Fields `evaluation`, `evaluation.source`, `evaluation.info`, `evaluation.scale` (see [queries]({{< relref "queries" >}})) |
| **Synthesis and reports** | Grading column and sorting |
| **Element merge** | The kept element's grading is preserved, otherwise the other element's |

---

## Import and export

| Format | Grading |
|--------|---------|
| **ZeroNeurone ZIP / JSON** | Dossier model and gradings preserved. An empty dossier created for the import adopts the file's model; an existing dossier keeps its own. |
| **CSV** | Columns `cotation_echelle`, `cotation_source`, `cotation_info` (also read as `evaluation_scale`, `evaluation_source`, `evaluation_info`) |
| **GEXF, GeoJSON** | Attributes `evaluation` and `evaluation_scale` |
| **ANX (i2 Analyst's Notebook)** | Source in `GradeOneIndex`, information in `GradeTwoIndex` (position of the code in the grid, A = 1) |

{{< hint info >}}
The ANX export does not write grade labels: i2 shows the positions with its own labels. When importing an ANX file, grades are read as before (grade 1 as confidence, grade 2 as a property).
{{< /hint >}}
