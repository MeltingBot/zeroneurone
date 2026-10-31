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

Existing links always count, even to hidden elements: a pair already linked is never suggested again. Neither are two elements already linked **to the same element**: they are already connected. An element linked to more than 50 others (a unit, a category) does not count as a common element: it joins too much to mean anything.

The column filters of the [matrix view]({{< relref "matrix-view" >}}) apply to the matrix only: the **All views** button turns them into a query applied as a filter, which the analysis follows.

---

## The Rules

Each rule can be ticked or unticked in the panel. To look only for place and time overlaps, for instance, untick **Properties**, **Sources** and **Zones**.

| Rule | What it spots | Settings |
|------|---------------|----------|
| **Properties** | Same value under the same property (phone, IBAN, email, plate…) | Compared properties |
| **Sources** | Same attached file, or same web page cited as source | — |
| **Duplicates** | Two elements that may be one: to **merge**, not to link | Minimum level |
| **Zones** | A point or small zone inside a larger zone (a site in its town) | — |
| **Places within** | Two elements placed closer than a distance, dates ignored | Radius |
| **Meetings within** | Two elements at the same place **at the same time** | Radius, time window, stay length |

Settings are remembered in your browser; they are not shared with other collaborators.

### Properties: Choosing Which to Compare

The button next to **Properties** ("all", or "3/12") unfolds the list of the dossier's text properties, with how many elements carry each. Untick those that identify nothing (a description, a category) to keep only identifiers: phone, IBAN, plate, case number… A filter shows beyond 8 properties, with **All** and **None**.

- The choice is remembered **per dossier**, in your browser.
- A property that appears later is ticked by default.
- Unticking a property does not remove the dismissals about it.

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

### Duplicates

The **Duplicates** rule offers to merge two elements that likely stand for the same thing. Each proposal shows a **level** and its reasons. The level depends on what was found:

| Level | Evidence |
|-------|----------|
| **Very likely** | The same identifier **and** close names (or two names that are the same number written apart) |
| **Likely** | The same identifier alone, or the same name |
| **Possible** | Close names, or names that sound the same, only |

The possible reasons:

| Reason | What is compared |
|--------|------------------|
| **Same phone, IBAN, plate or email** | In the name or the properties, however written. Phones in international format (`06 12 34 56 78` = `+33 6 12 34 56 78`, foreign numbers included; a number without a country code is read as French); IBANs whose check digits are valid; plates `AB-123-CD`, and `1234 AB 56` under a "plate" or "registration" property |
| **Same name** | Case, accents, punctuation and word order aside ("DUPONT Jean" = "Jean Dupont") |
| **Sounds the same** | French phonetic key derived from Phonex ("Dupont" / "Dupond", "Martin" / "Martain") |
| **Close names** | Jaro-Winkler distance, for typos |
| **Shared tags** | Small bonus |

Two reasons take a level off, shown in the warning colour:

- **Different phones (or IBANs…)**: both elements have this kind of identifier but no common value. Two people of one name, or one person with two lines: the pair is still offered, one level lower.
- **Different numbers** in the names ("Lot 3" / "Lot 4"): two things, not a typo.

An element whose name is a number ("06 12 34 56 78"), an IBAN, a plate or an email is compared only with elements of the same kind. A record carrying that number as a property is not its double: the **Properties** rule offers to link them.

Duplicates are searched in **the whole dossier**: a pair is offered as soon as one of its two elements is shown, even when the other is in another tab, filtered out or hidden (two imports each in its own tab, for instance).

The list next to the box picks what is shown: **All** (by default), **Likely and very likely**, **Very likely only**. Duplicates come first, most likely first. Two linked elements are still offered: a link does not prove they are two people.

The phone number library loads only the first time the rule is used.

### Places and Meetings

**Places within** compares the positions of the elements on the map, without dates: two places close to each other.

The radius and the window are typed freely, with their unit (m or km; min, h or days), from 1 m to 100 km and from 1 min to 365 days. The value applies on Enter or when leaving the field.

**Meetings within** compares **dated presences**: each element's dated, located events, and the element itself when it has a position and a date. The date properties kept in the [filters]({{< relref "filters-views" >}}) count too, at the element's position: a dossier imported with dates as properties works without events. A `date` property (no time) covers the whole day: pick a window in days.

- Two presences count when they are within the **radius** and their times overlap, give or take the **window**.
- **Stays up to**: a presence longer than this setting (a home, a head office or a lease dated over years) is ignored. It is an existence, not a meeting. 7 days by default; "no limit" brings it back.
- A point crossing more than 10 other elements within the radius is a **crowd** (a stadium, a station, a dense GPS trail): it yields no suggestion. The panel tells how many elements were left out; filtering **between two tags** keeps them.

The reason reads:

- **"Together 33 m apart, 3/12/26, 2:00 PM"** when both were there at the same moment;
- **"50 m apart, … then …"** when the window bridged a gap;
- **"(N times)"** when the pair crossed paths several times.

The time and distance shown are those of the real points.

### Between Two Tags

The **Between [tag] and [tag]** line keeps only the suggestions joining an element of the first tag to an element of the second, for all rules. Only the tags present in the open tab are offered. A single tag compares its elements with each other (the second field shows "same tag"); the cross clears the filter.

In this mode, the **Places within** and **Meetings within** rules compare every element of one tag with every element of the other, with no crowd limit (normally a point with more than 10 neighbors yields nothing). When one of them is a zone (polygon), the distance is measured to the zone's edge; a point inside the zone is reported by the **Zones** rule. On each row, the element of the first tag is listed first.

Examples: offences near sites imported from GeoJSON; offences close in space and time (Offence tag alone, 5 km, ±15 days) to spot series.

{{< hint warning >}}
**A suggestion is not evidence.** A meeting can be a coincidence; a shared value, a typo. Check the original elements before accepting, and keep a small radius for meetings.
{{< /hint >}}

---

## Handle the Suggestions

- **Hover** a suggestion: its elements are highlighted on the canvas and the proposed link shows as a moving dashed line
- **Click** the suggestion: selects its elements
- **Click "Create and link N elements"** (or "Link N elements") on a pivot: unfolds the list of its elements, each name clickable as below
- **Click an element's name**: it is selected alone and centered in the current view (canvas, map or timeline), and a summary shows under the row (tags, first 6 properties, **Open details** link to the Detail tab). Click the name again to hide it. Each element is on its own line; a long name wraps (2 lines at most)
- **Relevance / Distance / Date**, next to the count (shown when suggestions have distances or dates): sorted by distance, places, meetings and zones come first, nearest first (a point in a zone counts as 0 m); sorted by date, meetings come first, latest first (date of the first meeting); the others follow in their order. The button next to it reverses the order, whatever the sort; suggestions without a distance or a date stay at the end
- **✓** accepts, **✕** dismisses. For a duplicate, the merge icon opens the merge dialog: pick the element kept; the other's tags, properties, attachments and links move to it. Ctrl+Z undoes the merge
- **Ticking a row** frames the canvas on its elements and keeps the proposed link dashed, even on another tab of the panel, until it is unticked, accepted or dismissed. This link is not created in the dossier
- **Ticking several rows** (or the header box to tick all) shows **Accept (N)** and **Dismiss (N)**. Duplicates are merged one by one: **Accept (N)** leaves them out
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

The analysis handles dossiers of thousands of elements and tens of thousands of dated events. The list shows suggestions 200 at a time: the **N more** button shows the next 200. Use the search or the filters to narrow down.

If the message **"Meetings stopped: too many positions for this radius and window"** shows, reduce the radius or the window of meetings.

---

**See also**: [Graph analysis]({{< relref "graph-analysis" >}}), [Map view]({{< relref "map-view" >}}), [Elements and links]({{< relref "elements-links" >}})
