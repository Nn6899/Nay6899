/**
 * Bounds-checked little-endian byte reader (browser-safe: Uint8Array only).
 *
 * Part of a TypeScript port of zhexiao/mtef-go (Apache License 2.0).
 * See ./NOTICE.
 */
import { MtefError } from './types';

const MAX_CSTRING = 1024;

export class ByteReader {
  pos = 0;

  constructor(private readonly buf: Uint8Array) {}

  get length(): number {
    return this.buf.length;
  }

  eof(): boolean {
    return this.pos >= this.buf.length;
  }

  private need(n: number): void {
    if (this.pos + n > this.buf.length) {
      throw new MtefError(`unexpected end of data at offset ${this.pos}`);
    }
  }

  peek(): number {
    this.need(1);
    return this.buf[this.pos];
  }

  u8(): number {
    this.need(1);
    return this.buf[this.pos++];
  }

  /** Signed 8-bit. */
  i8(): number {
    const v = this.u8();
    return v >= 0x80 ? v - 0x100 : v;
  }

  u16(): number {
    this.need(2);
    const v = this.buf[this.pos] | (this.buf[this.pos + 1] << 8);
    this.pos += 2;
    return v;
  }

  i16(): number {
    const v = this.u16();
    return v >= 0x8000 ? v - 0x10000 : v;
  }

  u32(): number {
    this.need(4);
    const b = this.buf;
    const p = this.pos;
    this.pos += 4;
    return (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16)) + b[p + 3] * 0x1000000;
  }

  /** MTEF v5 "unsigned integer": one byte, or 0xFF followed by a 16-bit value. */
  mtUint(): number {
    const first = this.u8();
    return first === 0xff ? this.u16() : first;
  }

  /** Null-terminated 8-bit string (decoded as Latin-1). */
  cstr(): string {
    let s = '';
    for (let i = 0; ; i++) {
      const c = this.u8();
      if (c === 0) return s;
      if (i < MAX_CSTRING) s += String.fromCharCode(c);
    }
  }

  skip(n: number): void {
    if (n < 0) throw new MtefError('negative skip');
    this.need(n);
    this.pos += n;
  }

  bytes(n: number): Uint8Array {
    this.need(n);
    const out = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }
}
