import { describe, expect, it } from "vitest";
import { encryptStream, generateBackupIdentity } from "@/lib/backup/age";

describe("generateBackupIdentity", () => {
  it("produces an age-format secret + recipient pair", async () => {
    const { secret, recipient } = await generateBackupIdentity();
    expect(secret).toMatch(/^AGE-SECRET-KEY-1[0-9A-Z]+$/);
    expect(recipient).toMatch(/^age1[0-9a-z]+$/);
  });

  it("produces a fresh keypair every call", async () => {
    const a = await generateBackupIdentity();
    const b = await generateBackupIdentity();
    expect(a.secret).not.toBe(b.secret);
    expect(a.recipient).not.toBe(b.recipient);
  });
});

describe("encryptStream", () => {
  it("encrypts a stream that decrypts back to the original bytes", async () => {
    const { secret, recipient } = await generateBackupIdentity();
    const cleartext = new TextEncoder().encode(
      "INSERT INTO Profile VALUES ('one', 'two');\nINSERT INTO Sale VALUES ('three', 'four');\n",
    );

    const source = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(cleartext);
        c.close();
      },
    });

    const encrypted = await encryptStream(source, recipient);
    const encryptedBytes = await streamToBytes(encrypted);

    // age files start with the magic bytes "age-encryption.org/v1"
    const header = new TextDecoder().decode(encryptedBytes.slice(0, 21));
    expect(header).toBe("age-encryption.org/v1");

    // Round-trip: decrypt with the matching identity.
    const age = await import("age-encryption");
    const dec = new age.Decrypter();
    dec.addIdentity(secret);
    const decrypted = await dec.decrypt(encryptedBytes);

    const out = decrypted instanceof Uint8Array ? decrypted : await streamToBytes(decrypted);
    expect(new TextDecoder().decode(out)).toBe(new TextDecoder().decode(cleartext));
  });
});

async function streamToBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}
