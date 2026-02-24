---
title: "At-Rest Encryption"
weight: 14
---

# At-Rest Encryption

ZeroNeurone can encrypt all your local data (investigations, elements, links, attachments) with a password. Without this password, the data stored in the browser is unreadable.

{{< hint info >}}
Encryption is **optional**. ZeroNeurone works normally without it. Enable it if you work on sensitive subjects or on a shared computer.
{{< /hint >}}

---

## Enable Encryption

1. From the home page, click the **lock icon** (bottom-right if no investigations, in the title bar otherwise)
2. In the window that opens, click **Enable Encryption**
3. Choose a password (8 characters minimum)
4. Confirm the password
5. Click **Confirm**

ZeroNeurone migrates all your existing data, then **automatically reloads the page**. On reload, a window asks for your password to unlock access.

{{< hint warning >}}
**Keep your password safe.** ZeroNeurone cannot recover your data if you forget it. No reset is possible.
{{< /hint >}}

---

## Unlocking After Activation

At each application startup (or after a session lock), an unlock window appears.

1. Enter your password
2. Click **Unlock**

The application opens normally. Your data is decrypted on the fly — you will notice no difference in day-to-day use.

---

## Lock the Session

Locking clears the password from memory without closing the browser. Useful if you leave your workstation momentarily.

- **Keyboard shortcut:** `Alt+L`
- **Or:** lock icon → **Lock session** button

On next access, the unlock window reappears.

---

## Change Password

1. Lock icon → **Change password**
2. Enter the old password
3. Enter and confirm the new password
4. Click **Confirm**

The password change is instant. Your data is not re-encrypted — only the protection key changes.

---

## Disable Encryption

1. Lock icon → **Disable encryption**
2. Enter your password to confirm
3. Click **Confirm**

ZeroNeurone decrypts all data, then reloads the page. The application returns to password-free operation.

---

## What Is Encrypted

| Data | Encrypted |
|------|-----------|
| Investigations, elements, links | Yes |
| Attached files (images, PDFs…) | Yes |
| Reports and views | Yes |
| Extension data | Yes |
| Configuration (tag types) | No |

---

## ZIP Export with Password

ZIP export has a protection option independent of at-rest encryption. Check **Protect with password** in the export window to encrypt the ZIP file itself.

These two protections are complementary:
- At-rest encryption protects data on this machine
- ZIP password protects the exported file in transit or in storage

---

## Frequently Asked Questions

**What happens if I forget my password?**
The data is unrecoverable. ZeroNeurone has no recovery mechanism — this is a fundamental property of encryption. Export your investigations as ZIP regularly.

**Does encryption slow down the application?**
Imperceptibly. Encryption uses algorithms optimized for the browser. On a normally-sized investigation, no latency is noticeable.

**Is my data protected if someone steals my computer?**
Yes, if the session is locked or the browser closed. Data stored in the browser is unreadable without the password. However, if your session is unlocked at the time of theft, the data is accessible.

**Can I use the same password across multiple machines?**
Yes. Data is encrypted per machine — each installation has its own key. Exporting/importing an investigation from an encrypted machine to another produces plaintext data in the ZIP (decrypted for export).

---

**See also**: [Data Storage]({{< relref "../reference/data-storage" >}}) · [Export]({{< relref "../import-export/export" >}})
