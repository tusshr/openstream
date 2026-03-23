const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(bytes: Uint8Array): string {
  let out = "";
  let bits = 0;
  let val = 0;
  for (const byte of bytes) {
    val = (val << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(val >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(val << (5 - bits)) & 31];
  return out;
}

function base32Decode(input: string): Uint8Array<ArrayBuffer> {
  const s = input.toUpperCase().replace(/=+$/, "");
  const out: number[] = [];
  let bits = 0;
  let val = 0;
  for (const ch of s) {
    const idx = BASE32.indexOf(ch);
    if (idx < 0) throw new Error(`Invalid base32 char: ${ch}`);
    val = (val << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((val >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  const result = new Uint8Array(out.length);
  result.set(out);
  return result;
}

async function hotp(secret: string, counter: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    base32Decode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const buf = new Uint8Array(new ArrayBuffer(8));
  new DataView(buf.buffer).setUint32(4, counter >>> 0, false);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, buf));
  const offset = sig[sig.length - 1]! & 0x0f;
  const code =
    ((sig[offset]! & 0x7f) << 24) |
    ((sig[offset + 1]! & 0xff) << 16) |
    ((sig[offset + 2]! & 0xff) << 8) |
    (sig[offset + 3]! & 0xff);
  return (code % 1_000_000).toString().padStart(6, "0");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function generateTotpSecret(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return base32Encode(bytes);
}

export function totpUri(secret: string, email: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

// Accepts ±window steps to handle clock drift (each step = 30 s).
export async function verifyTotp(
  secret: string,
  token: string,
  window = 1,
): Promise<boolean> {
  const counter = Math.floor(Date.now() / 30_000);
  for (let i = -window; i <= window; i++) {
    if (safeEqual(await hotp(secret, counter + i), token)) return true;
  }
  return false;
}
