export function generateToken(byteLength = 32): string {
  const buf = new Uint8Array(byteLength);
  crypto.getRandomValues(buf);
  return Buffer.from(buf).toString("hex");
}
