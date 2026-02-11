---
title: "Collaboration"
weight: 9
---

# Real-time Collaboration

Work together on an investigation in real-time with secure, end-to-end encrypted synchronization.


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

## Share an Investigation

### Start Sharing

1. Open the investigation to share
2. Menu **⋯** → **Share**
3. Configure your username
4. Click **Share**


### Copy the Link

Once sharing is active:

1. Click **Copy link**
2. Send the link to your collaborators (email, messaging...)


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
| `#id=` | Original investigation UUID |
| `#name=` | Investigation name |

{{< hint warning >}}
**Important**: Everything after `#` (fragment) is never sent to the server (browser standard). The room ID is derived from a hash of the UUID + encryption key, so the server cannot correlate sessions with investigations. This is what guarantees end-to-end encryption and metadata privacy.
{{< /hint >}}

---

## Join a Session

### From a Share Link

1. Click on the received link
2. Configure your username
3. Verify the server address
4. Click **Join**


### Initial Synchronization

On connection:

- Investigation data is downloaded
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


---

## User Presence

### Avatars

Connected collaborators appear in the toolbar:


- Initials and unique color per user
- Blue circle = you
- Hover = full name
- `+N` if more than 5 users

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
| Attached files | ✅ Metadata + binaries |
| Canvas tabs | ✅ Names, members, order (viewport local) |
| Saved views | ✅ |
| Comments | ✅ |
| Investigation settings | ✅ |

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

## Asynchronous Collaboration

ZeroNeurone supports asynchronous collaboration, allowing collaborators to work at different times without being connected simultaneously.

### How It Works

1. **Enable async mode** when starting to share (checkbox "Asynchronous collaboration")
2. Changes are stored on the server for **7 days**
3. Collaborators can join when they want and receive accumulated changes

### Keep Your Share Link

{{< hint danger >}}
**Critical**: Save and keep the share link carefully. Without this link:
- You will not be able to rejoin the session
- The investigation cannot be recreated in disconnected async mode
- The encryption key in the URL fragment (`#key=...`) is the only way to decrypt the data
{{< /hint >}}

Recommendations:
- Save the link in a password manager
- Keep a copy in a secure note
- Send the link to yourself by email

### Update After Asynchronous Work

To update your local investigation with remote async changes:

1. **Stop sharing** first (Menu **⋯** → **Share** → **Stop sharing**)
2. Then rejoin using your saved share link
3. Changes from other collaborators will be synchronized

{{< hint info >}}
**Why stop first?** When you stop sharing, your local data becomes the reference. Rejoining then merges the server data with your local copy.
{{< /hint >}}

---

## Signaling Server

### Default Server

ZeroNeurone uses a public signaling server by default.

### Custom Server

To use your own server:

1. Menu **⋯** → **Share**
2. **Server** section
3. Enter your server's full URL

{{< hint warning >}}
**Required format**: The URL must include the WebSocket protocol:
- `wss://server.example.com` (secure, recommended)
- `ws://server.example.com` (unencrypted, development only)
{{< /hint >}}


### Host a Server

The signaling server is based on `y-websocket`. See technical documentation for hosting.

---

## Best Practices

### Security

- Only share the link with trusted people
- Use secure channels to transmit the link
- Create a new session if a participant should no longer have access

### Performance

- Limit simultaneous collaborators (< 10 recommended)
- Large files can slow initial synchronization
- A good internet connection improves the experience
- Investigations with **500+ elements**: edges are hidden during pan/zoom for fluidity
- Tested with **1500+ elements and links** in collaborative mode

### Organization

- Define who does what to avoid simultaneous edits of the same element
- Use comments to communicate within the investigation
- Save regularly locally (ZIP export)

---

**See also**: [Data storage]({{< relref "../reference/data-storage" >}})
