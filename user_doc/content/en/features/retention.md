---
title: "Dossier Closure and Retention"
weight: 15
---

# Dossier Closure and Retention

ZeroNeurone lets you close a dossier, which makes it read-only, and set a lifetime per dossier, in days. These features meet legal requirements on data retention.

By default, retention is **unlimited**: the dossier is kept with no time limit.

---

## Closing a dossier

A closed dossier is **read-only**: elements, links, attachments, comments, report, tabs, views and saved queries can no longer be changed, and nothing can be imported into it. Any attempt to change it shows "Dossier closed: read-only."

1. Open the dossier
2. In the detail panel, **Dates** section, **Closure** line, click **Close**
3. Confirm

A "Closed on … — read-only" bar appears below the header, and the dossier card on the home page shows **Closed**.

To resume work, click **Reopen** in the same section. Each past closure stays listed with its reopening date.

Closure is synchronized between participants in collaborative mode. It is not carried over by an import: an imported dossier is always open.

---

## Configuring retention

1. Open a dossier
2. In the detail panel (on the right), open the **Retention** section
3. Enter a duration in days (minimum 1)
4. Choose what happens on expiration
5. Click **Apply**

The **Count from** field sets the starting point:

- **Creation** (default): the period runs from the dossier's creation;
- **Closure**: the period starts at the **first** closure. As long as the dossier has never been closed, it does not expire. Reopening it and closing it again does not push the deadline back.

---

## Expiration behaviors

Four options are available:

| Policy | Effect |
|--------|--------|
| **Warning** | A message is shown when the dossier is opened. The dossier stays fully usable. |
| **Read-only** | The dossier is locked for viewing. No change is possible (elements, links, properties, etc.). |
| **Proposed deletion** | A confirmation window offers to delete the dossier permanently. The user can decline. |
| **Permanent redaction** | A window offers redaction: all text content is irreversibly replaced with masking characters. The graph structure is kept. |

{{< hint danger >}}
**Redaction is irreversible.** Once applied, nothing can be restored. The names, notes, properties and tags of all elements and links are permanently erased.
{{< /hint >}}

---

## Resetting retention

To go back to an unlimited duration:

1. **Retention** section in the detail panel
2. Click **Reset**

Retention is removed and the dossier has an unlimited lifetime again.

---

## Retention and collaboration

Retention settings (duration, policy and starting point) are synchronized between participants in collaborative mode. If a participant changes retention, the change is propagated to all connected peers.

---

## Retention and export/import

### Export

Retention settings are included in the exported ZIP file.

### Import

If the imported document has a retention period and its expiration date has passed, a warning is shown in the import result. The dossier can still be imported normally.

---

## Expiration indicator

When a dossier has expired, the Retention section shows in red the number of days elapsed since expiration.

---

**See also**: [At-Rest Encryption]({{< relref "encryption" >}}) · [Export]({{< relref "../import-export/export" >}})
