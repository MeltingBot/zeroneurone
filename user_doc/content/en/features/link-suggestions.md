---
title: "Link Suggestions"
weight: 4
---

# Link Suggestions

ZeroNeurone spots the links your data points to: two people with the same phone number, accounts fed by the same IBAN, two suspects at the same place at the same time… It **suggests**, you **decide**: nothing is created without your consent.

---

## Run the Analysis

- **Suggestions** tab of the side panel (light bulb icon) → **Analyze dossier**
- Or **right-click** a selection → **Analyze** → **Suggest links**: only the suggestions touching the selected elements are kept

The analysis never runs in the background: it runs on demand.

### What Is Analyzed

The analysis covers the **shown elements**:

- active [filters]({{< relref "filters-views" >}}), hidden elements and the current [tab]({{< relref "canvas-tabs" >}}) apply;
- a [ZNQuery]({{< relref "queries" >}}) applied as a filter restricts the analysis to its results.

A "N shown elements" line says so. While the tab is open, the list follows filter, query and tab changes.

Existing links always count, even to hidden elements: a pair already linked is never suggested again.

---

## The Rules

Each rule can be ticked or unticked in the panel. To look only for place and time overlaps, for instance, untick **Properties**, **Sources** and **Zones**.

| Rule | What it spots | Settings |
|------|---------------|----------|
| **Properties** | Same value under the same property (phone, IBAN, email, plate…) | — |
| **Sources** | Same attached file, or same web page cited as source | — |
| **Zones** | A point or small zone inside a larger zone (a site in its town) | — |
| **Places within** | Two elements placed closer than a distance, dates ignored | Radius |
| **Meetings within** | Two elements at the same place **at the same time** | Radius, time window, stay length |

Settings are remembered in your browser; they are not shared with other collaborators.

### Properties: How Values Are Compared

- Only properties with the **same name** are compared, regardless of case and accents ("Téléphone" and "telephone" match).
- Spellings of the same number meet: `06 12 34 56 78`, `+33 6 12 34 56 78`, `06.12.34.56.78`. An email is compared in lowercase; an identifier (IBAN, company number, plate) without spaces or dashes.
- **Noise filter**: a free-text value shared by more than half of the elements having that property (a status, a bank, a country) is ignored. A date written as text (`2020-11-27`) is treated as free text.
- An **identifier** shared by many elements is **never** discarded: 90 victims paying the same IBAN is the finding.

### Two Elements or More

| Shared by | Suggestion |
|-----------|------------|
| 2 elements | A **link** between them |
| 3 elements or more | A **pivot**: create an element for the value (the phone, the IBAN, the document) and link it to all of them |
| — | If an element already carries the value as its name, the suggestion is to **link to that element** instead of creating a second one |

### Places and Meetings

**Places within** compares the positions of the elements on the map, without dates: two places close to each other.

**Meetings within** compares **dated presences**: each element's dated, located events, and the element itself when it has a position and a date.

- Two presences count when they are within the **radius** and their times overlap, give or take the **window** (±15 min to ±7 days).
- **Stays up to**: a presence longer than this setting (a home, a head office or a lease dated over years) is ignored. It is an existence, not a meeting. 7 days by default; "no limit" brings it back.
- A point crossing more than 10 other elements within the radius is a **crowd** (a stadium, a station, a dense GPS trail): it yields no suggestion.

The reason reads:

- **"Together 33 m apart, 3/12/26, 2:00 PM"** when both were there at the same moment;
- **"50 m apart, … then …"** when the window bridged a gap;
- **"(N times)"** when the pair crossed paths several times.

The time and distance shown are those of the real points.

{{< hint warning >}}
**A suggestion is not evidence.** A meeting can be a coincidence; a shared value, a typo. Check the original elements before accepting, and keep a small radius for meetings.
{{< /hint >}}

---

## Handle the Suggestions

- **Hover** a suggestion: its elements are highlighted on the canvas
- **Click** the suggestion: selects its elements
- **✓** accepts, **✕** dismisses
- **Ticking several rows** (or the header box to tick all) shows **Accept (N)** and **Dismiss (N)**
- The **Search** field filters the list by element name or reason text

Accepting and dismissing can be undone with **Ctrl+Z**, including a bulk acceptance (a single Ctrl+Z).

### What an Accepted Link Keeps

The created link keeps the evidence behind it:

| Link field | Content |
|------------|---------|
| **Label** | The main reason: "same phone", "same source", "located in", "nearby", "co-presence" |
| **Notes** | The full text of all reasons, as shown in the panel |
| **Properties** | Each shared value (`phone = 06 12 34 56 78`) |
| **Source** | The shared web page or attached file |
| **Date / period** | When the meeting happened: the link shows on the [timeline]({{< relref "timeline" >}}) |

An accepted pivot creates the element (with the property as tag, and the file or page for a source) and links it to every element concerned.

---

## Dismissed Suggestions

A dismissed suggestion does not come back in later analyses.

- The **Dismissed (N)** link shows the dismissed suggestions; **Restore** puts them back in the list (undoable with Ctrl+Z).
- A dismissal covers **one reason**: dismissing "80 m away" does not stop the same pair from being suggested later for a shared phone.
- Dismissals are **shared** in [collaboration]({{< relref "collaboration" >}}) and kept in ZIP exports.
- They hold **no value in clear** (number, IBAN) and are cleaned up automatically when the elements or values concerned leave the dossier. Unticking a rule never deletes its dismissals.

---

## Large Dossiers

The analysis handles dossiers of thousands of elements and tens of thousands of dated events. The list shows the first 200 suggestions; use the search or the filters to narrow down.

If the message **"Meetings stopped: too many positions for this radius and window"** shows, reduce the radius or the window of meetings.

---

**See also**: [Graph analysis]({{< relref "graph-analysis" >}}), [Map view]({{< relref "map-view" >}}), [Elements and links]({{< relref "elements-links" >}})
