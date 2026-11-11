---
title: "Mobile companion"
weight: 9
---

# Mobile companion

Open a shared dossier on a phone, in the browser, with nothing to install: capture in the field (photo, note, location), browse elements, the map and the timeline, edit notes, tags and properties, comment.

The companion relies on [collaboration]({{< relref "collaboration" >}}): the dossier must be shared **in async mode**.

---

## Opening a dossier on the phone

1. On the computer, share the dossier with **Async collaboration** checked
2. In the share window, click **Open on mobile**: a QR code appears
3. Scan it with the phone's camera
4. Enter your name (shown to the other participants), then **Open on this phone**

The dossier is then listed at the `/m/` address: no QR code needed to reopen it.

A desktop share link (`/join/…`) opened on a phone leads to the companion too. On that page you can also **paste the share link** (the desktop `/join/…` link works) or **scan** it with the built-in scanner (Android and iPhone): with no dossier on the phone yet, tap the large QR code on the home page.

{{< hint warning >}}
**The QR code grants access to the dossier.** Like the share link, it holds the encryption key: do not show it to others and do not photograph it with any device but the phone it is meant for. Stopping the share invalidates every link and QR code.
{{< /hint >}}

### Why async mode

The relay server keeps no copy of the dossier: it passes changes between connected participants. In async mode it also keeps changes for **48 hours** (the relay's default) for whoever connects later. Each device receives, when it connects, what it has not received yet, even when alone online: a capture made while the computer is off reaches it when it reconnects. Without async mode, it would only reach it when both are online together.

{{< hint info >}}
Self-hosted relay: this delivery to a device alone needs the relay from version 2.93.1 or later.
{{< /hint >}}

When the dossier is first opened on the phone, a computer that has it open must be online: it sends the content.

---

## New element

**New** tab: a title or a note is enough; photos, files and location are optional. Actions are icons; a long press or a screen reader gives their name.

| Field | Use |
|-------|-----|
| **Title** | Label of the new element (default: "Capture" + date and time) |
| **Source** | Source of the information |
| **Note** | Free text, searchable like notes on the computer |
| Camera | Opens the camera; the photo becomes an attachment of the element |
| Paper clip | Photos, videos, sounds or documents from the phone (several at once), same types as on the computer |
| Pin | The phone's GPS position (the browser asks for permission); the element appears on the map |

The element gets the **collection date** (the moment of capture). It lands on the computer **below the existing elements**, aligned left: successive captures form a column. When a tab is shown, it goes into it. No tag is added automatically. The element's page then opens: tags and properties are added there.

Images are reduced to 2048 pixels on their longest side before sending (an iPhone HEIC photo becomes a JPEG): they stay in every participant's copy of the dossier. Other files are sent as they are, 50 MB at most each.

### Offline

Without a network, the capture is stored on the phone and the header shows **N pending**. It is sent on reconnection, and the counter returns to zero. **Keep the page open until the counter is back to zero.**

---

## Browsing

| Tab | Content |
|-----|---------|
| **Elements** | List and search. The icons above the list sort it: most recent, name, or number of links (shown on each row). A label with a collaborator's name marks the element they are working on (filled while they edit it); a row changed from another device lights up briefly |
| **Map** | Located elements, grouped when close, and the links between them; tap a link to see its ends; location button; satellite basemap |
| **Timeline** | Element periods and events, dated links, grouped by day (the collection date is left out, as on the computer). At the top, a strip of years (or months) with how many entries each holds: tap one to jump to it. The buttons on the right reverse the order (newest first) and jump to a date. Tapping an event opens the element on it |
| **Comments** | Open comments of the dossier (resolved ones on request) |

### Tabs and tags

Below the search, the canvas tabs: tap one to show its elements only (list, map, timeline, search). The settings button on the right creates, renames and deletes tabs; deleting one leaves its elements in the dossier.

Tap a tag on an element page to filter on it; type `#` in the search to get the dossier's tags. Several tags add up; the cross removes one.

### Search

The search bar stays at the top of every screen. Search works as on the computer: typo tolerance, word beginnings, and matching in labels, notes, tags, properties, events, comments, attachment text and links. An element found through one of its events opens on that event. Under each result, an excerpt shows where the word was found.

### Element page

Tags, note, photos (tap to enlarge), details, links, comments.

- **Note**: shown formatted (Markdown); the pencil opens editing, the check mark sends it, the cross cancels
- **Tags**: tap a tag to show the elements carrying it; the dotted button (pencil or +) adds or removes tags already used in the dossier
- **Properties**: tap a value to edit it, with the input suited to its type (text, number, date, yes/no, country from a list), or to delete it (bin, tapped twice); a location can only be deleted
- **+** right of **Details**: pick a name already used in the dossier (its type is kept) or type a new one, then the type (text, number or date) and the value
- **Events**: listed by date
- **Tabs**: tap a tab to put the element in it or take it out
- **+** right of **Links**: pick the other element (search, or create it on the spot, with the collection date), the direction, the label and the source
- **Delete**: the bin on a link row deletes the link; **Delete element**, at the bottom of the page, deletes it with its links. Both ask for confirmation (red bin)
 The **neighbourhood graph** shows the element in the centre with its neighbours; **1** / **2** sets the number of levels, pinch to zoom, tap a neighbour to open it. The phone's back button returns to the previous element.

---

## This phone

{{< hint warning >}}
**Unencrypted copy.** The phone keeps a copy of the dossier to work offline. The computer's local encryption does not apply to this copy: protect the phone with a lock code.
{{< /hint >}}

- **Settings** (gear at the top right): **This dossier** shows the connection and pending changes; **App** sets your name, the theme (light, dark or the phone's) and the language, and holds the about section. The app settings also open from the gear on the home page
- **Forget this dossier** erases the copy and the link from the phone; unsent changes are lost

### iPhone: add to home screen

Safari may erase the data of a site not opened for 7 days, pending captures included. Add the companion to the home screen (Safari's **Share** button → **Add to Home Screen**) to prevent this.

---

## Limits

- Opening a dossier on the phone downloads all of its content, attachments included
- From the phone, an existing element is edited through its note, tags, properties, tabs and links (not its label)
- The phone does not create tags: it offers those already set on the dossier's elements. Tag sets stay on each computer: a tag never used in the dossier is not offered, and a tag added from the phone does not change the element's appearance
- A note, tags or properties edited offline replace the whole version on reconnection: if the computer edited the same note, or the same element's tags or properties, meanwhile, only one of the two versions stays. Avoid editing the same element on both sides while the phone is offline
- A closed dossier is read only; retention, set per computer, does not apply to the phone
- Anyone with the link or QR code can read and edit the dossier: there is no read-only role
