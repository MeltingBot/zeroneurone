---
title: "At-Rest Encryption"
weight: 14
---

# At-Rest Encryption

ZeroNeurone can encrypt all your local data (dossiers, elements, links, attachments) with a password. Without this password, the data stored in the browser is unreadable.

{{< hint info >}}
Encryption is **optional**. ZeroNeurone works normally without it. Enable it if you work on sensitive subjects or on a shared computer.
{{< /hint >}}

---

## Enable Encryption

1. From the home page, click the **lock icon** (bottom-right if no dossiers, in the title bar otherwise)
2. In the window that opens, click **Enable Encryption**
3. Choose a password (8 characters minimum)
4. Confirm the password
5. Click **Confirm**

ZeroNeurone migrates all your existing data, then **automatically reloads the page**. On reload, a window asks for your password to unlock access.

{{< hint danger >}}
**Never refresh the page during activation.** The operation encrypts all your data one by one. Interrupting it can permanently corrupt your data. Wait for it to finish — it may take a while on large dossiers.
{{< /hint >}}

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

### Auto-lock

ZeroNeurone can automatically lock the session after a configurable inactivity period.

1. Lock icon → in the **Auto-lock** section
2. Choose a delay: 5, 15, 30, or 60 minutes (or Disabled)

Inactivity is detected on mouse movements, keyboard, clicks, and scroll. If the tab is hidden (tab switch, minimization) for longer than the configured delay, the session is locked when you return.

The setting persists in the browser and applies to every session.

{{< hint info >}}
Auto-lock is only available when encryption is enabled.
{{< /hint >}}

---

## Unlock with Security Key (WebAuthn)

If your browser and security key support WebAuthn PRF (FIDO2 Level 3), you can register a hardware key (YubiKey, etc.) as an alternative unlock method.

1. Lock icon → **WebAuthn Security Keys**
2. Click **Register a key**
3. Name the key, then touch your hardware key
4. The key is registered — a button appears on the unlock screen

At unlock, you can choose between the password or the hardware key.

{{< hint warning >}}
The hardware key is a **complement** to the password. The password remains necessary to enable encryption, change the password, or register new keys.
{{< /hint >}}

---

## Change Password

1. Lock icon → **Change password**
2. Enter the old password
3. Enter and confirm the new password
4. Click **Confirm**

The password change is instant. Your data is not re-encrypted — only the protection key changes.

{{< hint danger >}}
**Never refresh the page during a password change.** The operation updates the protection key for all your data. Interrupting it can permanently corrupt your data.
{{< /hint >}}

---

## Disable Encryption

1. Lock icon → **Disable encryption**
2. Enter your password to confirm
3. Click **Confirm**

ZeroNeurone decrypts all data, then reloads the page. The application returns to password-free operation.

{{< hint danger >}}
**Never refresh the page during deactivation.** The operation decrypts all your data one by one. Interrupting it can permanently corrupt your data. Wait for it to finish.
{{< /hint >}}

---

## What Is Encrypted

| Data | Encrypted |
|------|-----------|
| Dossiers, elements, links | Yes |
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
The data is unrecoverable. ZeroNeurone has no recovery mechanism — this is a fundamental property of encryption. Export your dossiers as ZIP regularly.

**Does encryption slow down the application?**
Imperceptibly. Encryption uses algorithms optimized for the browser. On a normally-sized dossier, no latency is noticeable.

**Is my data protected if someone steals my computer?**
Yes, if the session is locked or the browser closed. Data stored in the browser is unreadable without the password. However, if your session is unlocked at the time of theft, the data is accessible.

**Can I use the same password across multiple machines?**
Yes. Data is encrypted per machine — each installation has its own key. Exporting/importing a dossier from an encrypted machine to another produces plaintext data in the ZIP (decrypted for export).

---

**Does auto-lock work if I switch tabs?**
Yes. If the tab is hidden for longer than the configured delay, the session is locked as soon as you return to the tab.

**Does the hardware key replace the password?**
No. The hardware key is an alternative unlock method. The password remains essential for administrative operations (activation, password change, key registration).

---

**See also**: [Data Storage]({{< relref "../reference/data-storage" >}}) · [Export]({{< relref "../import-export/export" >}})
