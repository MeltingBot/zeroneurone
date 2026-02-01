# Security Policy

## Security Model

zeroneurone is designed with a **privacy-first, local-first** architecture. Your investigation data stays on your device by default.

### Data Storage

| Data Type | Storage Location | Encryption |
|-----------|------------------|------------|
| Investigation metadata | IndexedDB (browser) | Browser-managed |
| Elements, links, reports | IndexedDB (browser) | Browser-managed |
| File attachments | OPFS (Origin Private File System) | Browser-managed |
| Search index | Memory (rebuilt on load) | N/A |

**Key principles:**
- All data is stored locally in your browser
- No server-side storage unless you explicitly enable collaboration
- No telemetry, analytics, or tracking
- No external API calls for AI/ML features
- Works fully offline

### Collaboration Security

When collaboration is enabled:

| Feature | Security Measure |
|---------|------------------|
| WebRTC connections | Peer-to-peer with DTLS encryption |
| Signaling | Temporary room codes, no persistent server storage |
| Data sync | Yjs CRDT over encrypted WebRTC DataChannel |
| Room discovery | Random UUID-based room IDs |

**Important notes:**
- Collaboration requires explicit user action (sharing a room code)
- Room codes are not stored on any server after the session ends
- Peers connect directly; the signaling server only facilitates initial connection
- All synchronized data travels through encrypted WebRTC channels

### File Handling

- Uploaded files are stored in OPFS with SHA-256 hash deduplication
- Files never leave your browser unless exported
- Export creates a local ZIP file on your device
- Import validates file integrity before processing

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.3.x   | Yes |
| 1.2.x   | Yes |
| 1.1.x   | Security fixes only |
| < 1.1   | No |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do not** open a public GitHub issue for security vulnerabilities
2. Email security concerns to: **zeroneurone.ia8ay@simplelogin.com**
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact assessment
   - Any suggested fixes (optional)

### Response Timeline

| Action | Timeline |
|--------|----------|
| Initial acknowledgment | 48 hours |
| Severity assessment | 1 week |
| Fix development | Depends on severity |
| Public disclosure | After fix is released |

## Security Best Practices for Users

### Browser Security
- Keep your browser updated to the latest version
- Use a browser with strong sandboxing (Chrome, Firefox, Edge)
- Be cautious with browser extensions that can access page content

### Collaboration Security
- Only share room codes with trusted collaborators
- Use unique room codes for each session
- Disconnect collaboration when not needed
- Be aware that collaborators can see all investigation data

### Data Protection
- Regularly export backups of important investigations
- Store exported ZIP files securely (encrypted storage recommended)
- Clear browser data when using shared/public computers

### Import Security
- Only import files from trusted sources
- Be cautious with ZIP files from unknown origins
- Review imported content before relying on it

## Known Limitations

1. **Browser storage limits**: IndexedDB and OPFS have browser-imposed limits
2. **No end-to-end encryption**: Collaboration uses transport encryption (DTLS), not E2E
3. **Browser extensions**: Malicious extensions could potentially access page data
4. **Shared computers**: Data persists in browser storage until manually cleared

## Security Updates

Security updates are released as patch versions (e.g., 1.3.x) and announced in:
- [CHANGELOG.md](./CHANGELOG.md)
- GitHub Releases

## Acknowledgments

We thank all security researchers who responsibly disclose vulnerabilities.
