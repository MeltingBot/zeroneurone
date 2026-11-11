---
title: "Collaboration"
weight: 9
---

# Real-time Collaboration

Work together on a dossier in real-time with secure, end-to-end encrypted synchronization.


## Security Principles

| Aspect | Protection |
|--------|------------|
| **Encryption** | AES-256-GCM end-to-end |
| **Key** | Generated locally, never sent to server |
| **Transport** | Secure WebSocket (WSS/TLS) |
| **Server** | Cannot read your data |

{{< hint info >}}
**Total confidentiality**: The signaling server relays encrypted messages without being able to decrypt them. Only participants with the complete link can access the data.
{{< /hint >}}

---

## Share a Dossier

### Start Sharing

1. Open the dossier to share
2. Menu **⋯** → **Share**
3. Configure your username
4. Click **Share**


### Copy the Link

Once sharing is active:

1. Click **Copy link**
2. Send the link to your collaborators (email, messaging...)

### Write code

Under the link, the share window shows a 6-digit **write code**:

- **Without the code**, the link opens the dossier [read only](#read-only)
- **With the code**, entered when joining, you can edit

Send the link to everyone, and the code, through another channel, to those who must edit. With a relay that does not know read-only sharing (older than 2.94.0), there is no code: the link can edit.


### Link Format

```
https://zeroneurone.app/join/{roomId}?server=wss://...&async=1#key=xxx&id=uuid&name=...
```

| Part | Content |
|------|---------|
| `/join/{roomId}` | Hashed room identifier (server cannot see original UUID) |
| `?server=` | Signaling server address |
| `?async=1` | Asynchronous mode flag (optional) |
| `#key=` | Encryption key |
| `#id=` | Original dossier UUID |
| `#name=` | Dossier name |
| `#wpub=` | Public write key (share with a write code) |
| `#wlock=` | Private write key, encrypted by the write code |

{{< hint warning >}}
**Important**: Everything after `#` (fragment) is never sent to the server (browser standard). The room ID is derived from a hash of the UUID + encryption key, so the server cannot correlate sessions with dossiers. This is what guarantees end-to-end encryption and metadata privacy.
{{< /hint >}}

---

## Join a Session

### From a Share Link

1. Click on the received link
2. Configure your username
3. Verify the server address
4. To edit, enter the **write code**; left empty, the dossier opens read only
5. Click **Join**


### Initial Synchronization

On connection:

- Dossier data is downloaded
- Attached files are progressively synchronized
- A local copy is created on your machine


---

## Status Indicator

The toolbar displays the connection status:


| Icon | Status | Description |
|------|--------|-------------|
| 📴 | Local | Offline mode |
| 🔄 | Connecting | Connection attempt |
| 📶 | Connected | Active synchronization |
| ⟳ | Sync | Data exchange in progress |
| ↻ | Reconnecting | Lost connection, retrying |
| ⚠️ | Error | Connection failure |

### File Synchronization

When files are being transferred:

- Progress bar
- File count: `3/10 (30%)`
- Size transferred
- Current file name

Files added to a shared dossier travel on a separate channel, encrypted with the same key. Every computer receives them all, async mode included; the [mobile companion]({{< relref "mobile-companion" >}}) downloads a file only when it is opened, from a computer online. A computer left on a version before 2.93.2 does not see these files: update every computer.


---

## User Presence

### Avatars

Connected collaborators appear in the toolbar:


- Initials and unique color per user
- Blue circle = you
- Hover = full name
- `+N` if more than 5 users
- Eye on the avatar = connected read only

### Real-time Cursors

Other users' cursors are visible on the canvas:


### Shared Selection

When a collaborator selects an element:

- Colored halo around the element
- Color = user's color


### Editing in Progress

When someone is editing an element:

- Visual indicator on the element
- Prevents simultaneous editing conflicts


---

## Synchronized Data

| Data | Synchronized |
|------|--------------|
| Elements | ✅ Position, metadata, appearance |
| Links | ✅ All properties |
| Attached files | ✅ Metadata + binaries (on the phone: when opened) |
| Canvas tabs | ✅ Names, members, order (viewport local) |
| Saved views | ✅ |
| Comments | ✅ |
| Dossier settings | ✅ |

---

## Conflict Resolution

ZeroNeurone uses **Yjs**, a CRDT (Conflict-free Replicated Data Type) technology:

- Simultaneous modifications merged automatically
- No data loss
- Works even after temporary disconnection

### Example

If two users modify the same element:

1. User A changes the label → synchronized
2. User B changes the color → synchronized
3. Result: both modifications are preserved

{{< hint info >}}
**Offline-first**: You can work offline. Modifications will be synchronized on reconnection.
{{< /hint >}}

---

## Stop Sharing

### From the Owner

1. Menu **⋯** → **Share**
2. Click **Stop sharing**


### Effect

- The sharing session is closed
- Collaborators lose connection
- Each participant keeps a local copy

{{< hint warning >}}
**Note**: Collaborators keep their local copy. To revoke access to future modifications, you must create a new session with a new link.
{{< /hint >}}

---

## Read only

A computer or phone that joins **without the write code** sees the dossier and receives every change, but changes nothing:

- A **Read-only** banner shows, and any change is refused
- The mode stays when the dossier is reopened
- The reader shows up to the other participants, marked with an eye

### How it is enforced

Without the code, the private write key in the link stays encrypted. Computers that unlocked it prove to the relay, at each connection, that they hold it; from a reader the relay passes on only its presence and sync requests, never a change. Each computer also checks that what it receives matches what was announced to the relay. A reader who altered the app therefore does not change the others' dossier.

The write proof is dated and checked against the relay's clock: a computer whose clock is off sets itself on the relay's. If the relay still refuses writing, a message says so: check the device's time.

### Limits

{{< hint warning >}}
**Reading means reading everything.** The link holds the encryption key: the reader sees the whole dossier, files included, and keeps a copy. They can neither comment nor edit.
{{< /hint >}}

- **The code is a safeguard, not a protection.** It prevents changing the original by mistake. Six digits can be found by trying them all: someone who has the link and is set on editing will manage
- The code cannot be changed: to get another one, stop sharing and share again
- Dossiers shared before 2.94.0 have no code: stop sharing, then share again. The new link replaces the old one: send it to the collaborators again
- Read-only sharing relies on the relay: it takes an up-to-date relay (2.94.0 or later), and a relay altered by whoever runs it could let a reader's changes through. With your own relay, that risk is yours
- **Stop sharing** cuts everyone off, readers and writers alike
- A computer still on a version older than 2.94.0 cannot join a share that has a write code: update every computer
- The eye on the avatar is declared by the reader's device: a marker, not a control. The control is the relay's

---

## Asynchronous Collaboration

ZeroNeurone supports asynchronous collaboration, allowing collaborators to work at different times without being connected simultaneously.

### How It Works

1. **Enable async mode** when starting to share (checkbox "Asynchronous collaboration")
2. Encrypted changes, files included, are kept in memory by the relay for **48 hours** (relay default)
3. Collaborators can join when they want and receive accumulated changes

To open the dossier on a phone, see [Mobile companion]({{< relref "mobile-companion" >}}).

### Keep Your Share Link

{{< hint danger >}}
**Critical**: Save and keep the share link carefully. Without this link:
- You will not be able to rejoin the session
- The dossier cannot be recreated in disconnected async mode
- The encryption key in the URL fragment (`#key=...`) is the only way to decrypt the data
{{< /hint >}}

Recommendations:
- Save the link in a password manager
- Keep a copy in a secure note
- Send the link to yourself by email

### Update After Asynchronous Work

To update your local dossier with remote async changes:

1. **Stop sharing** first (Menu **⋯** → **Share** → **Stop sharing**)
2. Then rejoin using your saved share link
3. Changes from other collaborators will be synchronized

{{< hint info >}}
**Why stop first?** When you stop sharing, your local data becomes the reference. Rejoining then merges the server data with your local copy.
{{< /hint >}}

---

## Signaling Server

### Public Server

No server is set up by default: without one, nothing leaves your browser. To collaborate, enter the project's public server:

```
wss://sync.zeroneurone.com
```

1. **Share** button in the dossier header
2. **Sync server** section
3. Paste the address and save

Participants have nothing to type: the server address is in the share link, and the page it opens offers to save it.

### Custom Server

To use your own server, same steps: enter its full URL in the **Sync server** section.

{{< hint warning >}}
**Required format**: The URL must include the WebSocket protocol:
- `wss://server.example.com` (secure, recommended)
- `ws://server.example.com` (unencrypted, development only)
{{< /hint >}}


### Host a Server

The signaling server is based on `y-websocket`. See technical documentation for hosting.

The relay stores no file on disk. It passes encrypted messages on and, in async mode, keeps them in memory for the buffer's duration. A file sent to a phone that asked for it goes to that phone alone, without going through the buffer. With an older relay, these files are broadcast to every connected participant (still encrypted): it works, but loads the network more. Update the relay along with the app (2.93.2 or later).

---

## Best Practices

### Security

- Only share the link with trusted people
- Use secure channels to transmit the link
- Create a new session if a participant should no longer have access
- Give the write code only to those who must edit the dossier, through another channel than the link

### Performance

- Limit simultaneous collaborators (< 10 recommended)
- Large files can slow initial synchronization
- A good internet connection improves the experience
- Dossiers with **500+ elements**: edges are hidden during pan/zoom for fluidity
- Tested with **10,000 elements and 15,000 links** in collaborative mode
- **All participants should run the same ZeroNeurone version**: some fixes (edits made offline, elements outside tabs) only apply when everyone is up to date

### Organization

- Define who does what to avoid simultaneous edits of the same element
- Use comments to communicate within the dossier
- Save regularly locally (ZIP export)

---

**See also**: [Data storage]({{< relref "../reference/data-storage" >}})
