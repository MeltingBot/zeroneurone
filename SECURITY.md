# Security Policy

## Security Model

ZeroNeurone is designed with a **privacy-first, local-first**
architecture. Your investigation data stays on your device.
The editor has no access to your data at any point.

### Data Storage

- Investigation data — IndexedDB (browser), AES-256-GCM encrypted
- File attachments — OPFS (Origin Private File System), AES-256-GCM encrypted
- Search index — Memory only, rebuilt on session load, never persisted
- Internal identifiers — UUIDs v4, stored in clear (contain no investigation data)

**Key principles:**

- All data is stored locally in your browser
- All data is encrypted at rest using AES-256-GCM before writing
  to IndexedDB or OPFS
- No server-side storage unless you explicitly enable collaboration
- No telemetry, analytics, or tracking
- No external API calls for core features
- Works fully offline

### Encryption

ZeroNeurone uses exclusively native browser cryptographic primitives.
No third-party cryptographic library is used.

- **Encryption** — AES-256-GCM via Web Crypto API
- **Key derivation** — PBKDF2 / SHA-256, 600,000 iterations
  (NIST SP 800-132), random salt per instance, via Web Crypto API
- **Random generation** — `crypto.getRandomValues()`
- **Identifiers** — UUID v4 via `crypto.randomUUID()`

The encryption key (DEK) is derived from the user's passphrase at
session start. It resides exclusively in memory during the session
and is destroyed on tab close or session lock.

**Alternative unlock — WebAuthn PRF** (FIDO2 Level 3): a hardware
security key (e.g. YubiKey) can be registered as an alternative
unlock method. The DEK is independently encrypted with a key derived
from the PRF extension output. The passphrase remains the primary
unlock method and is required to register a key.

**The editor has no access to your key. No recovery mechanism exists.
Loss of passphrase means permanent loss of access to your data.**

### Residual Threat: Memory

During an active session, decrypted data resides in memory. An
attacker with physical access to the workstation and a memory dump
tool could theoretically extract this data.

Recommended mitigations:

- Lock the session whenever the workstation is unattended
- Enable full-disk encryption on the host machine
  (BitLocker, FileVault, LUKS)
- Avoid using ZeroNeurone on shared or unmanaged workstations

### Session Management

**Manual lock** — `ALT + L` immediately purges the derived key from
memory and locks the interface. Session resumes after passphrase
entry.

**Automatic lock** — The session locks automatically after a
configurable inactivity period. Behavior is identical to manual lock.

### Investigation Lifecycle

Each investigation can be assigned a retention period. At expiry,
four behaviors are available:

- **Warning** — a notification is shown at investigation load
- **Deletion** — the investigation and all its data are permanently
  erased
- **Read-only** — the investigation is preserved but cannot be
  modified
- **Redaction** — element content is permanently masked, element
  existence is preserved in the graph

Redaction is irreversible. No restoration is possible once applied.

### Collaboration Security

When collaboration is enabled:

- WebRTC connections — peer-to-peer with DTLS encryption
- Signaling — temporary room codes, no persistent server storage
- Data sync — Yjs CRDT over encrypted WebRTC DataChannel
- Room discovery — random UUID-based room IDs

**Important notes:**

- Collaboration requires explicit user action (sharing a room code)
- Room codes are not stored on any server after the session ends
- Peers connect directly; the signaling server only facilitates
  initial connection
- All synchronized data travels through encrypted WebRTC channels

### File Handling

- Uploaded files are stored in OPFS, encrypted at rest (AES-256-GCM)
- Files are deduplicated using SHA-256 hashing
- Files never leave your browser unless exported
- Export creates a local ZIP file on your device
- Import validates file integrity before processing

---

## Reporting a Vulnerability

If you discover a security vulnerability, please report it
responsibly:

1. **Do not** open a public GitHub issue for security vulnerabilities
2. Email: **cybersec@ypsi.fr**
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact assessment
   - Suggested fixes (optional)

**Response timeline:**

- Initial acknowledgment — 48 hours
- Severity assessment — 1 week
- Fix development — depends on severity
- Public disclosure — after fix is released, within 90 days maximum

---

## Security Best Practices for Users

### Workstation Security

- Enable full-disk encryption (BitLocker, FileVault, LUKS)
- Keep your browser updated to the latest version
- Lock your session (`ALT + L`) when leaving your workstation
- Do not use ZeroNeurone on shared or public computers

### Browser Security

- Use a browser with strong sandboxing (Chrome, Edge, Firefox)
- Be cautious with browser extensions that can access page content —
  a malicious extension could read decrypted data from memory
  during an active session
- Keep extensions to a minimum on workstations used for
  sensitive investigations

### Passphrase Management

- Use a strong, unique passphrase
- Store it in a password manager
- Losing your passphrase means permanent loss of access to your data —
  no recovery is possible

### Collaboration Security

- Only share room codes with trusted collaborators
- Use unique room codes for each investigation
- Disconnect collaboration when not needed
- Collaborators can see all investigation data once connected

### Data Protection

- Regularly export backups of important investigations
- Store exported ZIP files on encrypted storage
- Apply retention policies to investigations with defined
  legal or operational end dates

### Import Security

- Only import files from trusted sources
- Review imported content before relying on it

---

## Known Limitations

1. **Memory exposure** — decrypted data resides in memory during
   an active session; mitigated by session lock and automatic timeout
2. **No passphrase recovery** — loss of passphrase means permanent
   data loss
3. **Browser storage quotas** — IndexedDB and OPFS are subject to
   browser-imposed storage limits
4. **Browser extensions** — malicious extensions with page access
   could read in-memory decrypted data
5. **Collaboration transport** — collaboration uses DTLS transport
   encryption, not application-level E2E encryption

---

## Security Updates

Security updates are released as patch versions and announced in:

- [CHANGELOG.md](./CHANGELOG.md)
- GitHub Releases

---

## Acknowledgments

We thank all security researchers who responsibly disclose
vulnerabilities.
