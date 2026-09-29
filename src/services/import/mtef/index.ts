/**
 * MathType (MTEF) → LaTeX converter.
 *
 * TypeScript port of zhexiao/mtef-go (https://github.com/zhexiao/mtef-go),
 * Copyright (c) zhexiao, licensed under the Apache License, Version 2.0
 * (http://www.apache.org/licenses/LICENSE-2.0). This port restructures the
 * parser and rewrites the LaTeX emitter; see ./NOTICE.
 *
 * Supports:
 *  - MTEF v5 (MathType 4+, OLE ProgID Equation.DSMT4 / DSMT6 / DSMT7)
 *  - MTEF v2/v3 (Microsoft Equation Editor 3.0, ProgID Equation.3)
 *
 * Browser-safe (Uint8Array / cfb only; no Node Buffer / fs). Never throws.
 */
import { readEquationNativeStream, stripEqnOleHeader } from './ole';
import { parseMtef } from './parser';
import { equationToLatex } from './latex';

export type { MtEquation, MtItem } from './types';
export { parseMtef } from './parser';

function isMtefVersionByte(b: number | undefined): boolean {
  return b === 2 || b === 3 || b === 5;
}

/** Accept Uint8Array (incl. Node Buffer / cross-realm arrays), other views and ArrayBuffers. */
function toBytes(input: unknown): Uint8Array | null {
  if (!input || typeof input !== 'object') return null;
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  if (Object.prototype.toString.call(input) === '[object ArrayBuffer]') {
    return new Uint8Array(input as ArrayBuffer);
  }
  return null;
}

/**
 * Convert raw MTEF bytes (the "Equation Native" stream after its 28-byte
 * EQNOLEFILEHDR) to LaTeX without surrounding `$` delimiters.
 *
 * Returns null if the data cannot be parsed or yields an empty equation.
 * Never throws.
 */
export function mtefToLatex(mtef: Uint8Array): string | null {
  try {
    let data = toBytes(mtef);
    if (!data || data.length < 2) return null;
    // Tolerate callers passing the whole "Equation Native" stream (header included).
    if (!isMtefVersionByte(data[0])) {
      const stripped = stripEqnOleHeader(data);
      if (!stripped || !isMtefVersionByte(stripped[0])) return null;
      data = stripped;
    }
    const latex = equationToLatex(parseMtef(data));
    return latex ? latex : null;
  } catch {
    return null;
  }
}

/**
 * Convert a MathType / Equation Editor OLE object (the full contents of
 * word/embeddings/oleObjectN.bin) to LaTeX without surrounding `$` delimiters.
 *
 * Returns null if the object has no parsable "Equation Native" stream.
 * Never throws.
 */
export function mathTypeOleToLatex(oleBytes: Uint8Array): string | null {
  try {
    const bytes = toBytes(oleBytes);
    if (!bytes) return null;
    const stream = readEquationNativeStream(bytes);
    if (!stream) return null;
    const mtef = stripEqnOleHeader(stream);
    if (!mtef) return null;
    return mtefToLatex(mtef);
  } catch {
    return null;
  }
}
