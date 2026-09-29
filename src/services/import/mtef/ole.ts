/**
 * Extract the MTEF payload from a MathType / Equation Editor OLE object
 * (word/embeddings/oleObjectN.bin). Browser-safe: uses the `cfb` package and
 * Uint8Array only.
 *
 * Part of a TypeScript port of zhexiao/mtef-go (Apache License 2.0).
 * See ./NOTICE.
 */
import * as CFB from 'cfb';

const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

export function isOleCompoundFile(bytes: Uint8Array): boolean {
  if (bytes.length < 512) return false;
  for (let i = 0; i < OLE_SIGNATURE.length; i++) if (bytes[i] !== OLE_SIGNATURE[i]) return false;
  return true;
}

/** Returns the raw "Equation Native" stream, or null if the container has none. */
export function readEquationNativeStream(oleBytes: Uint8Array): Uint8Array | null {
  if (!isOleCompoundFile(oleBytes)) return null;
  const container = CFB.read(oleBytes, { type: 'array' });
  const entries = container.FileIndex ?? [];
  for (const entry of entries) {
    // type 2 = stream
    if (entry && entry.type === 2 && typeof entry.name === 'string' && entry.name.toLowerCase() === 'equation native') {
      const content = entry.content as unknown;
      if (!content) return null;
      if (content instanceof Uint8Array) return content;
      if (Array.isArray(content)) return Uint8Array.from(content as number[]);
      return null;
    }
  }
  return null;
}

/**
 * Strip the EQNOLEFILEHDR from an "Equation Native" stream.
 *
 *   uint16 cbHdr   (normally 28)
 *   uint32 version
 *   uint16 cf      (clipboard format)
 *   uint32 cbObject (size of MTEF data that follows the header)
 *   uint32 reserved1..4
 *
 * Returns the MTEF bytes, or null if the header is implausible.
 */
export function stripEqnOleHeader(stream: Uint8Array): Uint8Array | null {
  if (stream.length < 8) return null;
  const cbHdr = stream[0] | (stream[1] << 8);
  if (cbHdr < 8 || cbHdr > 256 || cbHdr >= stream.length) return null;
  let end = stream.length;
  if (cbHdr >= 12) {
    const cbObject = (stream[8] | (stream[9] << 8) | (stream[10] << 16)) + stream[11] * 0x1000000;
    if (cbObject > 0 && cbHdr + cbObject <= stream.length) end = cbHdr + cbObject;
  }
  return stream.subarray(cbHdr, end);
}
