---
title: "Storage and maintenance"
weight: 3
---

# Storage and maintenance

The **Storage** window shows how much space ZeroNeurone takes up in the browser, offers a full backup and gathers the maintenance operations.

To open it: **hard drive** icon in the home page toolbar.

---

## Storage tab

- **Space used** — space taken and quota granted by the browser, split between attached files (OPFS), database (IndexedDB) and Y.js history.
- **Persistent storage** — whether the browser commits to keeping the data when disk space runs low. If protection is not active, the button requests it. Browsers often refuse for a site used rarely: bookmark it and try again later.
- **Stored content** — number of dossiers, elements, links and files.

---

## Backup tab

**Export all** produces a ZIP archive with every dossier, its files and the tag sets. **Import** reads such an archive back: its content is **added** to the existing dossiers, nothing is replaced.

{{< hint warning >}}
The browser remains fragile storage (cache clearing, reinstallation). A regular full backup, kept outside the browser, is the only protection against loss.
{{< /hint >}}

---

## Maintenance tab

### Storage details

IndexedDB and OPFS support in the browser, estimated size of the Y.js history and estimated size of each database table. These figures are estimates, computed from a sample.

### Y.js history per dossier

Each dossier has a Y.js database, the format behind real-time collaboration. It grows over time for two reasons:

- **Edit history.** Every move, every changed field, every deleted element leaves a trace in it, even afterwards. A heavily reworked dossier can weigh twice its content.
- **File copies.** For a participant to receive the files of a shared dossier, they are copied into the Y.js database. Up to version 2.60.0 this copy was made for every dossier, even never shared: each attached file took up twice its size.

The list shows the size of each dossier's database, heaviest first. **Purge history** (on hovering a row) or **Purge all** rebuilds the database from the dossier's current content:

- content is kept exactly as is: elements, links, notes and their formatting, tabs, reports, comments;
- the edit history is dropped;
- file copies are removed, for each file present in local storage whose fingerprint matches; a missing or different file keeps its copy.

Undo (Ctrl+Z) is not affected: it only lasts for the session.

When done, a summary appears under the list:

| Message | Meaning |
|---------|---------|
| **Space freed** | Space recovered across all processed dossiers. |
| **Skipped** | Shared dossiers, or the dossier currently open: they are not changed. |
| **Not processed** | Unreadable content (encrypted dossier without the right key) or a rebuild that did not exactly match the original. **Nothing was changed** for these dossiers. |

{{< hint info >}}
**Operation safety** — the new database is read back and compared with the original before being written, and it is written in one go: on any mismatch, error or interruption, the old database stays intact.
{{< /hint >}}

#### Shared dossiers

A shared dossier is marked **Shared** and cannot be purged: its history is needed to stay in sync with the other participants, and its file copies are what they download. To purge it, stop sharing first (the dossier's **Share** window). If you share it again later, its files are sent again automatically.

#### When to purge

- When the space used grows while the content barely changes.
- Once after updating to 2.60.1, to remove file copies from dossiers never shared: that is where the gain is largest.

Sizes shown are exact once a dossier has been purged. The browser may take a while to hand the space back to the system.

### Delete all dossiers

Erases every dossier, element, link, file and history. Tag sets and the encryption setting are kept. The action asks for two confirmations and cannot be undone: make a full backup first.

---

**See also**: [Data storage]({{< relref "data-storage" >}}) · [At-rest encryption]({{< relref "../features/encryption" >}})
