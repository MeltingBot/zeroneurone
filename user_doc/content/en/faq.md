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

Once loaded, ZeroNeurone couldn't care less about internet. Cut the cable, it keeps working. Except for what needs to talk to the outside world: the **map view** (tiles don't fall from the sky), **collaboration** (neither do your colleagues) and **plugins** that call an online service. Everything else lives happily as a hermit.

### Is there a dark mode?

Yes. The **moon** icon in the toolbar. Your eyes at 2 a.m. will thank you.

### What about other languages?

The interface speaks **11 languages**: French, English, German, Spanish, Italian, Portuguese, Dutch, Polish, Catalan, Basque and Ukrainian. Click the little flag in the toolbar and switch.

### Is there a shortcut cheat sheet?

Press **?** in a dossier. Everything shows up. The full list is also in [Keyboard shortcuts]({{< relref "reference/keyboard-shortcuts" >}}).

---

## Data and Privacy

### Where does my data go?

Nowhere. It stays in your browser. No server, no cloud, no "we analyze your data to improve our services". Your dossiers are your business.

Technically:
- Metadata → IndexedDB (a database in your browser)
- Attached files → OPFS (a local file system)

### How do I backup then?

**ZIP export** via the menu. It's your lifeline. Do it regularly. We can't stress this enough.

Can't be bothered to go dossier by dossier? Home page **hard drive** icon → **Backup** → **Export all**. One ZIP, everything in it.

### Can I sync between my PC and laptop?

Not automatically. We're local-first, not cloud-first. The workflow:

1. ZIP export on machine A (or **Export all** to move house in one go)
2. Transfer (USB drive, email, carrier pigeon...)
3. ZIP import on machine B (nothing gets overwritten, promise)

Or use [collaboration]({{< relref "features/collaboration" >}}) to work together in real-time.

### Is it encrypted?

Since v2.17, yes. ZeroNeurone offers **at-rest encryption** for all your local data:

- **AES-256-GCM** for metadata (IndexedDB)
- **XSalsa20-Poly1305** for attached files (OPFS)
- **PBKDF2-SHA256** with 600,000 iterations to derive the key from your password

Enable it from the lock icon on the home page. Once activated, your data is unreadable without the password.

**Never refresh the page during activation, deactivation, or password change.** The operation encrypts/decrypts all your data one by one. Interrupting it can permanently corrupt your data. Wait for it to finish — it may take a while on large dossiers.

### What if I lose my encryption password?

Your data is gone. No "forgot password", no backdoor, no "contact support". That's the price of real security. Make a ZIP export **before** enabling encryption, and keep it safe.

### What's WebAuthn PRF?

Since v2.18, you can unlock your encrypted dossiers with a **hardware security key** (YubiKey, for example) instead of typing your password. That's FIDO2 Level 3 for the connoisseurs.

You can register multiple keys and manage them from the encryption settings. The password always remains available as a fallback.

### How does auto-lock work?

You can configure an **inactivity timeout** (5, 15, 30, or 60 minutes). If you don't touch anything for that long, the dossier locks automatically. You'll need to re-enter the password (or use your security key) to continue.

You can also lock manually with **Alt+L**. Handy when you're getting coffee and don't trust your colleagues.

### What's data retention?

Since v2.18, you can set a **retention period** per dossier (in days). On expiration, four policies are available:

| Policy | Effect |
|--------|--------|
| Warning | A reminder is shown, that's it |
| Read-only | The dossier is locked for viewing only |
| Proposed deletion | You're prompted to delete |
| Permanent redaction | All text content is **irreversibly** replaced with masking characters |

Permanent redaction means business. The graph structure survives, but no readable content remains. That's the point.

### ZeroNeurone is getting fat, is that normal?

A bit. Each dossier remembers everything you moved, tweaked, deleted. And up to v2.60.0, every attached file was stored twice. It adds up.

Diet plan: **hard drive** icon → **Maintenance** → **Purge all**. Content doesn't move a pixel, only the dead weight goes. Shared dossiers are exempt. The details are in [Storage and maintenance]({{< relref "reference/maintenance" >}}).

---

## Usage

### I'm new, where do I start?

With the **guided tutorial**: button in the welcome banner, or the **graduation cap** icon. Bubbles show you where to click, and each step completes when you've actually done it. No "Next" button to hammer. It all happens in a practice dossier you can bin at the end, guilt-free.

### How do I create something?

**Double-click** on the canvas. Boom, an element. Or **E**, for the mouse-averse.

### And to connect them?

**Drag** from one element to another. The link creates itself.

### Delete?

Select, then **Delete** or **Backspace**. Classic.

### I made a mistake, can I undo?

**Ctrl+Z** undoes. **Ctrl+Shift+Z** redoes. It covers everything: creations, deletions, property changes, groups, filters, report sections.

### How do I group elements?

1. Select several (Ctrl+click or draw a rectangle)
2. Right-click → **Group**

They move together now. Beautiful.

### Can I merge two elements?

Yes. Select 2 elements → right-click → **Merge**. Choose which label to keep, the rest (properties, tags, files, links) is merged intelligently. Duplicate links are combined, self-links removed.

### Where are the entity types? Person, company, phone...

There aren't any. On purpose. ZeroNeurone imposes no ontology: an element is whatever you say it is. A **person** is an element tagged `person`. A **place**, same thing. A concept nobody has invented yet? Same again.

**Tags** do all the work: they filter, colour, feed queries. And so you don't retype everything each time, **tag sets** attach a colour, a shape, an icon and suggested properties (date of birth, company number, IBAN...) to a tag. A few sets ship by default, everything is editable, nothing is sacred. Details in [Tags and properties]({{< relref "features/tags-properties" >}}).

### Can I grade my information the Europol way?

Yes. Dossier panel → **Information evaluation** → pick **Europol (4x4)** or **Admiralty / NATO (6x6)**. Each element and link is then graded with two codes (e.g. **B2**: source mostly reliable, information known to the source). The choice applies to the whole dossier, collaborators included. Switching back to the ZeroNeurone model loses nothing: nothing is converted, everything is kept. Details in [Information evaluation]({{< relref "features/evaluation" >}}).

### What are canvas tabs?

**Thematic workspaces** within a single dossier. One tab per hypothesis, per actor type, per time period... Elements from other tabs connected to yours appear semi-transparent. Handy for keeping things organized.

### How do I add GPS coordinates?

1. Select the element
2. Detail panel → **Location**
3. Type the coordinates or click directly on the map

### Can I write my report in it?

Yes. **Report** tab in the side panel: Markdown sections, and `[[` to cite an element. The reference becomes a clickable link to the graph — no more "see appendix 3, page 12". Starting from a blank page? **Synthesis** (toolbar) generates a structured first draft from the dossier, in HTML, Markdown or JSON, or straight to print.

### Filters aren't enough anymore, now what?

**ZNQuery**, the home-grown query language. **Queries** tab in the side panel, or `?` in search (Ctrl+K). Clicks for the shy, text for everyone else:

```
tag = "person" AND confidence > 70
WITHIN 2 HOPS OF tag = "suspect"
```

The second one brings back everything within two links of a suspect. Queries can be saved. The manual is in [Advanced queries]({{< relref "features/queries" >}}).

### What about my photos' EXIF? File metadata?

ZeroNeurone reads it for you. Attach a photo, a PDF, an Office document or an email: it digs in and shows you what it found. Camera, capture date, author, modification dates, sender, an email's originating IP, tracking pixels... Tick what you care about, it becomes properties of the element.

A photo with **GPS coordinates**? The element lands straight on the map. Clicked "Ignore" a bit fast? The **information** icon on the file row runs the analysis again. And it all happens in your browser: your files don't go anywhere to be analysed. Details in [Attached files]({{< relref "features/attachments" >}}).

### Can I move the side panel?

Yes. **⇄** button in the toolbar — cycles between right, bottom, left and detached window. The choice is remembered (except detached mode).

---

## Views

### What's the Matrix view?

A **spreadsheet** of your elements. Press **4** to access it. Sort, per-column filter, inline editing, multi-row selection, CSV export. Like Excel, but with your dossier data.

### And the Timeline?

Chronological view of all dated elements. With a **density heatmap** showing the busiest periods. Click on it to filter by time range.

### Does it find things on its own?

Only when you ask. The **Insights** panel puts the graph through the wringer: **clusters** (who hangs out with whom), **centrality** (who's in the middle of everything), **bridges** (those linking two worlds), isolated elements, cycles. Select two elements and it finds the **shortest path** between them. It shows, you conclude. Details in [Graph analysis]({{< relref "features/graph-analysis" >}}).

### My graph looks like a plate of spaghetti

A classic past 200 elements. Three remedies:

- **filters**, to show only what matters (tags, confidence, properties...);
- **Focus** mode (**F** key), to isolate an element and its neighbourhood;
- **views**, to save a setup and come back to it in one click.

Details in [Filters and views]({{< relref "features/filters-views" >}}).

### I can't find an element anymore

**Ctrl+K**. Search digs through labels, notes, tags, properties... and even the text of attached PDFs and documents. It forgives typos: "dupond" finds "Dupont".

---

## Import / Export

### What format for backup?

**ZIP**. It includes everything: metadata AND attached files. Other formats (JSON, CSV) are for interoperability, not backup.

### I have an Excel, does it work?

Export your Excel to CSV first, then import the CSV. ZeroNeurone doesn't speak `.xlsx`.

### Is it compatible with Gephi?

Yes, both ways. **GraphML** or **GEXF** export → Gephi, and back via GEXF or Gephi Lite. Your network analyses await.

### And i2 Analyst's Notebook?

Yes, round trip included: **ANX** and **ANB** import, **ANX** export. Analyst's Notebook opens it without a fuss.

### Obsidian, Mermaid?

Yes and yes. An **Obsidian vault** with one note per element, and **Mermaid** to paste into your wiki.

### What else?

Excalidraw, OSINT Industries, GEDCOM, French FEC accounting files... The full list is in [Import]({{< relref "import-export/import" >}}) and [Export]({{< relref "import-export/export" >}}). It's a long one.

### And QGIS?

**GeoJSON** export → Import in QGIS. Your points and lines arrive with all their properties.

### Does STIX format work?

Yes, STIX 2.1 bundles supported. For cyber threat intelligence enthusiasts.

### What does the HTML report do exactly?

A **self-contained HTML file** with your report and an interactive SVG graph. No need for ZeroNeurone to view it. Since v2.19:

- Search (Ctrl+K) with keyboard navigation
- Tag filtering via popover
- Images embedded in graph shapes
- Reversible layout (report on left or right)
- Resizable columns between report and graph
- Table of contents, light/dark theme, Markdown export

All in a single file. Email it, it just works.

### Can ZIP export be encrypted?

Yes. When at-rest encryption is enabled, ZIP exports can be password-protected (`.znzip` format). The recipient will need the password to open it.

---

## Plugins

### Does ZeroNeurone have plugins?

Yes. A slot-based extension system. Plugins can add tabs, context menu entries, keyboard shortcuts, export/import hooks, and more. Zero overhead when no plugins are installed.

### How do I install a plugin?

Drop the `.js` file and its `manifest.json` in the `dist/plugins/` folder. For Docker, copy them to `plugins/` before building. No marketplace, no store — it's a file, you drop it, it works.

### Is it secure?

Plugin errors never crash the application. But a plugin has access to your dossier data. Only install plugins you trust.

### I've heard about OneNeurone?

That's the AI plugin for ZeroNeurone. **OneNeurone** adds an intelligent assistant to your dossier: chat with the graph in context, entity and relationship extraction (NER), report generation in 5 registers (judicial, intelligence, corporate, journalistic, CERT), pattern and anomaly detection, and cross-dossier analysis.

Philosophy: **"The Neurone suggests, the analyst decides."** It never modifies the graph directly, no data is sent without your explicit action, and it works 100% offline with Ollama or LM Studio. Multi-provider: Ollama, LM Studio, Anthropic, OpenAI, or custom endpoint.

Remove it, and ZeroNeurone works exactly the same. It's a plugin, not a dependency.

OneNeurone is paid — because the open-source project has to eat too.

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

### Can I search inside an attached PDF?

Yes. Preview (eye icon) → **Ctrl+F**. It highlights, ignores accents, **Enter** for the next one. A scanned PDF with no text, however, has nothing to say to you.

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

### Do I need a server?

Yes, a relay. The project provides one: `wss://sync.zeroneurone.com`. Paste it once into **Share** → **Sync server**, and off you go. Your guests get it with the link. Rather run your own? It can be self-hosted, see [Collaboration]({{< relref "features/collaboration" >}}).

### Is it really secure?

The encryption key is in the URL, after the `#`. This fragment is never sent to the server (it's a web standard). The server sees encrypted bytes passing through, period.

### Can we discuss an element without touching its notes?

Yes, with **comments**: a dedicated section in the detail panel of an element or a link. A badge on the canvas flags the ones awaiting an answer, and you mark them resolved once settled. Notes stay clean, the discussion has its own place.

### How many people max?

Technically, no limit. Practically, beyond 10 it can get confusing. But it works.

### What about large dossiers?

ZeroNeurone handles dossiers with **1500+ elements and links** in collaborative mode. Beyond 500 elements, edges are hidden during pan/zoom for fluidity. Locally, performance is excellent up to several thousand elements.

### Can I work offline during a shared session?

Yes. Your edits are stored locally. Reopen the dossier once you're back online, it finds the session on its own.

### Do attached files follow?

Yes, up to **50 MB** per file. Beyond that, it stays with you. Above 10 MB, grab a coffee.

### Does retention sync in collab?

Yes. Retention duration and policy are synchronized between all participants via Y.Doc.

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
