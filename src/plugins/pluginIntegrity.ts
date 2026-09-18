/**
 * Plugin integrity verification using SHA-256 hashes.
 *
 * Computes and verifies hex-encoded SHA-256 hashes of plugin source code
 * to ensure plugins haven't been tampered with between publication and loading.
 */

/**
 * Compute the SHA-256 hex hash of a source string.
 */
export async function computeIntegrityHash(source: string): Promise<string> {
  const buffer = new TextEncoder().encode(source);
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Verify plugin source integrity against a declared hash.
 *
 * Fails closed: a manifest entry without an `integrity` field is refused rather
 * than trusted. A plugin runs in the main realm (pluginLoaderService imports it
 * from a blob URL), so deciding which code is loaded is the only control point
 * there is — the permission filter in pluginSandbox shapes the API object, it
 * does not confine the code. `npm run rehash:plugins` regenerates the hashes.
 */
export async function verifyIntegrity(
  source: string,
  expectedHash: string | undefined,
  pluginId: string
): Promise<boolean> {
  if (!expectedHash) {
    console.error(
      `[ZN] Plugin "${pluginId}" declares no integrity hash — refusing to load. ` +
      `Run "npm run rehash:plugins" to regenerate the manifest.`
    );
    return false;
  }

  const actual = await computeIntegrityHash(source);

  if (actual !== expectedHash.toLowerCase()) {
    console.error(
      `[ZN] Integrity check failed for "${pluginId}".\n` +
      `  Expected: ${expectedHash}\n` +
      `  Got:      ${actual}`
    );
    return false;
  }

  return true;
}
