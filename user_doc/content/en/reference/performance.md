---
title: "Limits and performance"
weight: 4
---

# Limits and performance

What ZeroNeurone handles, as measured, and what has not been measured yet.

{{< hint info >}}
**Measurement conditions**: production build of version 2.89.2, Chromium, encryption off, a recent development machine, one run per size. On a more modest machine, with encryption or in another browser, expect slower. These are orders of magnitude, not guarantees.
{{< /hint >}}

## The principle

An open dossier is loaded **whole in memory**. So disk space is not the limit (500,000 properties take less than 70 MB), but the tab's memory and the opening time.

ZeroNeurone is built for an **analysis graph**: a few thousand to 10,000 elements, a few dozen properties each. It is not built to store raw data in bulk. Beyond a few hundred thousand properties, sort before importing.

## Measurements

Fictitious dossiers, 1.5 links per element, one property value in two unique (numbers, identifiers), the other repeated.

| Dossier | Total properties | Import | Opening | Longest freeze on opening | Memory |
|---|---|---|---|---|---|
| 500 elements × 10 properties | 5,000 | 2.4 s | 1.2 s | under 0.1 s | 46 MB |
| 2,000 × 20 | 40,000 | 3.5 s | 1.2 s | 0.2 s | 69 MB |
| 5,000 × 50 | 250,000 | 9.5 s | 2.6 s | 0.6 s | 185 MB |
| 10,000 × 50 | 500,000 | 20 s | 3.2 s | 1.2 s | 350 MB |

- **Opening**: from the reloaded page to the dossier on screen.
- **Longest freeze**: the longest time the screen does not respond. On a large dossier, it is reading the stored dossier.
- **Editing a property** does not freeze the screen, even at 10,000 × 50.

## Search

The index is rebuilt each time a dossier opens. On a large dossier, it is built in slices: the screen stays usable, and the activity bar shows **Indexing for search** until it ends (under a second at 10,000 × 50).

| Search, at 10,000 × 50 | Time |
|---|---|
| A word, exact or with a typo | under 20 ms |
| The start of an identifier (`+3360…`) | 0.4 s |

The start of an identifier is slower when the dossier holds many unique values: each number is a distinct word in the index. At 40,000 properties, it takes 40 ms.

## Matrix

The matrix shows one column per property key. What counts is the **number of distinct keys**, not the number of elements.

| Distinct keys | Scrolling |
|---|---|
| 50 | smooth |
| 400 | jerky (one frame in two late, peaks at 0.1 s) |

With many keys, hide the columns you do not need (**Show/hide columns** button).

## Not measured yet

- With **encryption** on.
- On **Firefox** and **Safari**.
- In **collaboration**, on a large dossier.
- With many **attachments** whose text is extracted (it is read on opening).

**See also**: [FAQ — What about large dossiers?]({{< relref "../faq" >}}), [Canvas tabs]({{< relref "../features/canvas-tabs" >}})
