---
title: "FAQ"
weight: 5
---

# Frequently Asked Questions

Because you have questions. And that's perfectly normal.

---

## General

### What exactly is ZeroNeurone?

An infinite whiteboard that understands relationships. Imagine Excalidraw that went to criminal analysis school. You draw, you connect, and the tool helps you see what you wouldn't have seen alone.

### Is it free?

Yes. Open-source, free, no account, no tracking, no "14-day trial period". Actually free.

### What does it run on?

| Browser | Verdict |
|---------|---------|
| Chrome/Edge | ✅ Perfect |
| Firefox | ✅ Perfect |
| Safari | ⚠️ Works, but Apple has opinions about local storage |

### And without internet?

Once loaded, ZeroNeurone couldn't care less about internet. Cut the cable, it keeps working.

---

## Data and Privacy

### Where does my data go?

Nowhere. It stays in your browser. No server, no cloud, no "we analyze your data to improve our services". Your investigations are your business.

Technically:
- Metadata → IndexedDB (a database in your browser)
- Attached files → OPFS (a local file system)

### How do I backup then?

**ZIP export** via the menu. It's your lifeline. Do it regularly. We can't stress this enough.

### Can I sync between my PC and laptop?

Not automatically. We're local-first, not cloud-first. The workflow:

1. ZIP export on machine A
2. Transfer (USB drive, email, carrier pigeon...)
3. ZIP import on machine B

Or use [collaboration]({{< relref "features/collaboration" >}}) to work together in real-time.

### Is it encrypted?

Browser storage isn't encrypted by default. If you work with sensitive data:

- Enable your OS disk encryption (FileVault, BitLocker, LUKS)
- Export as ZIP and encrypt the archive with a password

For real-time collaboration, yes: end-to-end AES-256-GCM encryption.

---

## Usage

### How do I create something?

**Double-click** on the canvas. Boom, an element.

### And to connect them?

**Drag** from one element to another. The link creates itself.

### Delete?

Select, then **Delete** or **Backspace**. Classic.

### I made a mistake, can I undo?

**Ctrl+Z** undoes. **Ctrl+Shift+Z** redoes. Like everywhere, but it works.

### How do I group elements?

1. Select several (Ctrl+click or draw a rectangle)
2. Right-click → **Group**

They move together now. Beautiful.

### How do I add GPS coordinates?

1. Select the element
2. Detail panel → **Location**
3. Type the coordinates or click directly on the map

---

## Import / Export

### What format for backup?

**ZIP**. It includes everything: metadata AND attached files. Other formats (JSON, CSV) are for interoperability, not backup.

### I have an Excel, does it work?

Export your Excel to CSV first, then import the CSV. ZeroNeurone doesn't speak `.xlsx`.

### Is it compatible with Gephi?

Yes. **GraphML** export → Import in Gephi. Your network analyses await.

### And QGIS?

**GeoJSON** export → Import in QGIS. Your points and lines arrive with all their properties.

### Does STIX format work?

Yes, STIX 2.1 bundles supported. For cyber threat intelligence enthusiasts.

---

## When Things Don't Work

### The app won't load

1. **Ctrl+Shift+R** (hard refresh)
2. **F12** → Console → look at red errors
3. Try another browser

If nothing works, it might be us. Open an issue.

### I lost my data

If you cleared the browser cache... it's gone. For good.

That's why we insist on regular ZIP exports. We don't judge, we sympathize.

### PNG export is weird

- Canvas too zoomed? Zoom out.
- Try a lower resolution (1x instead of 4x)
- Elements far from center might be cut off

### Attached files don't display

- Is the file in the list?
- Some formats don't have preview (but download works)
- Try re-downloading to check it's not corrupted

### CSV import crashes

Checklist:
- UTF-8 encoding? (Excel likes to use something else)
- `type` and `label` columns present?
- Download our CSV template and compare

---

## Collaboration

### How does collab work?

Real-time, encrypted, no account:

- **Secure WebSocket** for instant sync
- **AES-256-GCM** so nobody reads your data (not even us)
- **CRDT** to merge edits without conflict
- **Shared cursors** to see who's doing what

### Is it really secure?

The encryption key is in the URL, after the `#`. This fragment is never sent to the server (it's a web standard). The server sees encrypted bytes passing through, period.

### How many people max?

Technically, no limit. Practically, beyond 10 it can get confusing. But it works.

### What about large investigations?

ZeroNeurone handles investigations with **1500+ elements and links** in collaborative mode. Beyond 500 elements, edges are hidden during pan/zoom for fluidity. Locally, performance is excellent up to several thousand elements.

### Can I work offline during a shared session?

Yes. Your edits are stored locally. On reconnection and new share, everything syncs.

---

## The Future

### Mobile version?

No. The interface is designed for a screen, a keyboard, a mouse. On phone it would be frustrating for everyone.

### An API?

No either. ZeroNeurone runs entirely in your browser. No backend = no API.

### What if I want a feature?

Open an issue on GitHub. We read everything. We don't promise anything, but we read everything.

---

## Support

### Bug?

[GitHub Issues](https://github.com/MeltingBot/zeroneurone/issues). Describe what happened, what you expected, and if possible a screenshot.

### I want to contribute

The code is on GitHub, PRs are welcome. Read CONTRIBUTING.md first.

### I still have questions

- This doc (you're here)
- GitHub issues (often someone already asked)
- GitHub discussions (for open questions)
- [The *Oscar Zulu* Discord](https://discord.gg/WrWZq9QY6d)


We do our best to answer. Not in real-time, but we answer.
