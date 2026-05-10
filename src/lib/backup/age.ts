/**
 * age-encryption wrapper — Phase 4.5
 *
 * Thin server-side wrapper that loads the `age-encryption` library
 * lazily (it ships ESM-only, and dynamic import keeps it out of any
 * cold-path bundle that doesn't actually use it).
 *
 * The browser-side pieces (keypair generation, private-key download)
 * import the package directly in the setup page. This module is the
 * server-side encrypt-stream helper for the download endpoint.
 */

/**
 * Encrypt a streaming source to age format using the given recipient.
 * Both halves use Web Streams so the entire pipeline can hand off to
 * `Response.body` without buffering the dump in memory.
 *
 * @param source — the cleartext byte stream (the SQL dump)
 * @param recipient — an age public key string ("age1…")
 * @returns a stream of age-encrypted bytes
 */
export async function encryptStream(
  source: ReadableStream<Uint8Array>,
  recipient: string,
): Promise<ReadableStream<Uint8Array>> {
  const { Encrypter } = await import("age-encryption");
  const enc = new Encrypter();
  enc.addRecipient(recipient);
  return enc.encrypt(source);
}

/**
 * Generate a new age identity (secret) and derive the recipient (public).
 * Used by the setup page when an admin first registers a backup keypair.
 *
 * Returned shape:
 *   - secret:    "AGE-SECRET-KEY-1…" — store offline, never persist
 *   - recipient: "age1…"             — save on Profile.backupPublicKey
 */
export async function generateBackupIdentity(): Promise<{
  secret: string;
  recipient: string;
}> {
  const { generateIdentity, identityToRecipient } = await import("age-encryption");
  const secret = await generateIdentity();
  const recipient = await identityToRecipient(secret);
  return { secret, recipient };
}
