---
title: "Data Storage"
weight: 2
---

# Data Storage

How ZeroNeurone stores your data locally.

## Storage Architecture

ZeroNeurone uses two browser storage technologies:

| Technology | Usage | Data |
|------------|-------|------|
| **IndexedDB** | Database | Metadata (elements, links, investigations) |
| **OPFS** | File system | Attached files (images, PDFs) |


---

## IndexedDB (Dexie.js)

### Tables

| Table | Content |
|-------|---------|
| `investigations` | Investigations and settings |
| `elements` | Graph elements |
| `links` | Links between elements |
| `views` | Saved views |
| `assets` | File metadata |

### Inspection

In browser DevTools:

1. **F12** → **Application** tab
2. **IndexedDB** → **zeroneurone**


---

## OPFS (Origin Private File System)

### Structure

```
/zeroneurone/
└── assets/
    ├── {sha256-hash-1}
    ├── {sha256-hash-2}
    └── ...
```

### Deduplication

Files are stored by their SHA-256 hash:

- An identical file is stored only once
- Saves disk space
- Impossible to have duplicates

---

## Quotas and Limits

### Browser Limits

| Browser | Approximate Quota |
|---------|-------------------|
| Chrome | 60% of disk space |
| Firefox | 50% of disk space |
| Safari | 1 GB by default |
| Edge | 60% of disk space |

### Check Usage

```javascript
// In browser console
navigator.storage.estimate().then(console.log)
```

---

## Persistence

### Persistent Storage

ZeroNeurone requests data persistence:

```javascript
navigator.storage.persist()
```

This prevents the browser from deleting data under memory pressure.

### Check Status

```javascript
navigator.storage.persisted().then(console.log)
```

---

## Backup

### Regular Export

{{< hint warning >}}
**Important**: Regularly export your investigations as ZIP to have an external backup.
{{< /hint >}}

### Loss Risks

Data can be lost if:

- Browser cache cleared
- Browser uninstalled
- Private browsing mode
- Some system cleaners

---

## Privacy

### 100% Local

- ✅ Data stored only on your machine
- ✅ No remote server
- ✅ Works offline
- ✅ No telemetry

### Explicit Sharing

Data only leaves your machine through:

- Manual export (ZIP, JSON, etc.)
- Copy-paste
- Screenshot

---

## Troubleshooting

### Corrupted Data

If the application doesn't load:

1. **F12** → **Console**: Check errors
2. **Application** → **Clear site data**: Reset (⚠️ loses data)

### Insufficient Space

1. Delete unused investigations
2. Delete large attached files
3. Export as ZIP then delete the investigation

### Migration

To change browser or machine:

1. Export all investigations as ZIP
2. Install on new browser
3. Import the ZIPs

---

**See also**: [Export]({{< relref "../import-export/export" >}})
