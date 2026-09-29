/**
 * MTEF binary parser (MTEF v5 = MathType 4+, "Equation.DSMT4/6/7";
 * MTEF v2/v3 = Microsoft Equation Editor 3.0, "Equation.3").
 *
 * Produces the object tree defined in ./types.ts. Throws MtefError on malformed
 * input; callers (see ./index.ts) must catch.
 *
 * Part of a TypeScript port of zhexiao/mtef-go (Apache License 2.0).
 * See ./NOTICE.
 */
import { ByteReader } from './reader';
import {
  MtChar,
  MtEquation,
  MtefError,
  MtItem,
  MtLine,
  MtMatrix,
  MtPile,
  MtTmpl,
  REC,
  TM,
} from './types';

/** Maximum nesting depth of LINE/TMPL/PILE/MATRIX records. */
export const MAX_DEPTH = 64;
/** Maximum number of records in a single equation. */
export const MAX_RECORDS = 200_000;

// Option flags (v5)
const OPT_NUDGE = 0x08;
const OPT_CHAR_EMBELL = 0x01;
const OPT_CHAR_FUNC_START = 0x02;
const OPT_CHAR_ENC_CHAR_8 = 0x04;
const OPT_CHAR_ENC_CHAR_16 = 0x10;
const OPT_CHAR_ENC_NO_MTCODE = 0x20;
const OPT_LINE_NULL = 0x01;
const OPT_LP_RULER = 0x02;
const OPT_LINE_LSPACE = 0x04;
const OPT_COLOR_CMYK = 0x01;
const OPT_COLOR_NAME = 0x04;

// Option flags (v3, stored in the high nibble of the tag byte)
const XF_LMOVE = 0x08;
const XF_EMBELL = 0x02;
const XF_NULL = 0x01;
const XF_RULER = 0x02;
const XF_LSPACE = 0x04;

/** Internal pseudo-item used while reading embellishment lists. */
interface EmbellItem {
  kind: 'embell';
  embell: number;
}
type RawItem = MtItem | EmbellItem;

export function parseMtef(data: Uint8Array): MtEquation {
  const r = new ByteReader(data);
  const version = r.u8();
  if (version === 5) return new V5Parser(r).parse();
  if (version === 2 || version === 3) return new V3Parser(r, version).parse();
  throw new MtefError(`unsupported MTEF version ${version}`);
}

abstract class BaseParser {
  protected records = 0;
  protected readonly fontNames = new Map<number, string>();

  constructor(protected readonly r: ByteReader) {}

  protected countRecord(): void {
    if (++this.records > MAX_RECORDS) throw new MtefError('too many records');
  }

  protected checkDepth(depth: number): void {
    if (depth > MAX_DEPTH) throw new MtefError('nesting too deep');
  }

  protected nudge(): void {
    const dx = this.r.u8();
    const dy = this.r.u8();
    if (dx === 128 && dy === 128) {
      this.r.i16();
      this.r.i16();
    }
  }

  /** RULER body: n_stops, then (type byte, 16-bit offset) per stop. */
  protected rulerBody(): void {
    const n = this.r.u8();
    this.r.skip(n * 3);
  }

  /** SIZE record body (same layout in v3 and v5). */
  protected sizeBody(): void {
    const sel = this.r.u8();
    if (sel === 101) this.r.i16();
    else if (sel === 100) {
      this.r.u8();
      this.r.i16();
    } else this.r.u8();
  }

  /** Split raw items: attach stray EMBELL records to the preceding char. */
  protected finishList(raw: RawItem[]): MtItem[] {
    const out: MtItem[] = [];
    for (const it of raw) {
      if (it.kind === 'embell') {
        const prev = out[out.length - 1];
        if (prev && prev.kind === 'char') prev.embells.push(it.embell);
      } else out.push(it);
    }
    return out;
  }

  protected embellsOf(raw: RawItem[]): number[] {
    const out: number[] = [];
    for (const it of raw) if (it.kind === 'embell') out.push(it.embell);
    return out;
  }
}

// ---------------------------------------------------------------------------
// MTEF v5
// ---------------------------------------------------------------------------

class V5Parser extends BaseParser {
  private fontDefCount = 0;

  parse(): MtEquation {
    const r = this.r;
    const platform = r.u8();
    const product = r.u8();
    const productVersion = r.u8();
    const productSubversion = r.u8();
    const applicationKey = r.cstr();
    const options = r.u8();
    const items = this.finishList(this.readList(0, true));
    return {
      mtefVersion: 5,
      platform,
      product,
      productVersion,
      productSubversion,
      applicationKey,
      inline: (options & 1) === 1,
      items,
      fontNames: this.fontNames,
    };
  }

  /** Read records until END (or EOF when top-level). */
  private readList(depth: number, top = false): RawItem[] {
    this.checkDepth(depth);
    const r = this.r;
    const out: RawItem[] = [];
    for (;;) {
      if (r.eof()) {
        if (top) return out;
        throw new MtefError('unterminated object list');
      }
      const tag = r.u8();
      this.countRecord();
      switch (tag) {
        case REC.END:
          return out;
        case REC.LINE:
          out.push(this.line(depth));
          break;
        case REC.CHAR:
          out.push(this.char(depth));
          break;
        case REC.TMPL:
          out.push(this.tmpl(depth));
          break;
        case REC.PILE:
          out.push(this.pile(depth));
          break;
        case REC.MATRIX:
          out.push(this.matrix(depth));
          break;
        case REC.EMBELL:
          out.push(this.embell());
          break;
        case REC.RULER:
          this.rulerBody();
          break;
        case REC.FONT_STYLE_DEF:
          r.mtUint();
          r.u8();
          break;
        case REC.SIZE:
          this.sizeBody();
          break;
        case REC.FULL:
        case REC.SUB:
        case REC.SUB2:
        case REC.SYM:
        case REC.SUBSYM:
          break;
        case REC.COLOR:
          r.mtUint();
          break;
        case REC.COLOR_DEF: {
          const opts = r.u8();
          r.skip(opts & OPT_COLOR_CMYK ? 8 : 6);
          if (opts & OPT_COLOR_NAME) r.cstr();
          break;
        }
        case REC.FONT_DEF: {
          r.mtUint();
          const name = r.cstr();
          this.fontNames.set(++this.fontDefCount, name);
          break;
        }
        case REC.EQN_PREFS:
          this.eqnPrefs();
          break;
        case REC.ENCODING_DEF:
          r.cstr();
          break;
        default:
          if (tag >= REC.FUTURE) {
            r.skip(r.mtUint());
            break;
          }
          throw new MtefError(`unknown record type ${tag} at offset ${r.pos - 1}`);
      }
    }
  }

  private ruler(): void {
    // The spec writes "[RULER record]"; MathType emits the record tag (7) first.
    if (this.r.peek() === REC.RULER) this.r.u8();
    this.rulerBody();
  }

  private line(depth: number): MtLine {
    const r = this.r;
    const opts = r.u8();
    if (opts & OPT_NUDGE) this.nudge();
    if (opts & OPT_LINE_LSPACE) r.i16();
    if (opts & OPT_LP_RULER) this.ruler();
    const isNull = (opts & OPT_LINE_NULL) !== 0;
    const items = isNull ? [] : this.finishList(this.readList(depth + 1));
    return { kind: 'line', isNull, items };
  }

  private char(depth: number): MtChar {
    const r = this.r;
    const opts = r.u8();
    if (opts & OPT_NUDGE) this.nudge();
    const typeface = r.u8() - 128;
    const code = opts & OPT_CHAR_ENC_NO_MTCODE ? 0 : r.u16();
    let fontPos: number | null = null;
    if (opts & OPT_CHAR_ENC_CHAR_8) fontPos = r.u8();
    if (opts & OPT_CHAR_ENC_CHAR_16) fontPos = r.u16();
    const embells = opts & OPT_CHAR_EMBELL ? this.embellsOf(this.readList(depth + 1)) : [];
    return {
      kind: 'char',
      typeface,
      code,
      fontPos,
      funcStart: (opts & OPT_CHAR_FUNC_START) !== 0,
      embells,
    };
  }

  private tmpl(depth: number): MtTmpl {
    const r = this.r;
    const opts = r.u8();
    if (opts & OPT_NUDGE) this.nudge();
    const selector = r.u8();
    const v1 = r.u8();
    const variation = v1 & 0x80 ? (v1 & 0x7f) | (r.u8() << 8) : v1;
    const tmplOptions = r.u8();
    const items = this.finishList(this.readList(depth + 1));
    return { kind: 'tmpl', selector, variation, tmplOptions, items };
  }

  private pile(depth: number): MtPile {
    const r = this.r;
    const opts = r.u8();
    if (opts & OPT_NUDGE) this.nudge();
    const halign = r.u8();
    const valign = r.u8();
    if (opts & OPT_LP_RULER) this.ruler();
    const lines = this.finishList(this.readList(depth + 1));
    return { kind: 'pile', halign, valign, lines };
  }

  private matrix(depth: number): MtMatrix {
    const r = this.r;
    const opts = r.u8();
    if (opts & OPT_NUDGE) this.nudge();
    const valign = r.u8();
    const hJust = r.u8();
    const vJust = r.u8();
    const rows = r.u8();
    const cols = r.u8();
    const rowParts = partsLsbFirst(r.bytes((rows + 4) >> 2), rows + 1);
    const colParts = partsLsbFirst(r.bytes((cols + 4) >> 2), cols + 1);
    const cells = this.finishList(this.readList(depth + 1));
    return { kind: 'matrix', valign, hJust, vJust, rows, cols, rowParts, colParts, cells };
  }

  private embell(): EmbellItem {
    const r = this.r;
    const opts = r.u8();
    if (opts & OPT_NUDGE) this.nudge();
    return { kind: 'embell', embell: r.u8() };
  }

  private eqnPrefs(): void {
    const r = this.r;
    r.u8(); // options
    this.dimensionArray(r.u8()); // sizes
    this.dimensionArray(r.u8()); // spaces
    const nStyles = r.u8();
    for (let i = 0; i < nStyles; i++) {
      if (r.u8() !== 0) r.u8();
    }
  }

  /** Nibble-packed dimension array: per value a unit nibble then digit nibbles ending with 0xF. */
  private dimensionArray(count: number): void {
    let remaining = count;
    let inValue = false;
    while (remaining > 0) {
      const b = this.r.u8();
      for (const nib of [b >> 4, b & 0x0f]) {
        if (remaining === 0) break;
        if (!inValue) inValue = true; // unit nibble
        else if (nib === 0x0f) {
          inValue = false;
          remaining--;
        }
      }
    }
  }
}

function partsLsbFirst(bytes: Uint8Array, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const b = bytes[i >> 2] ?? 0;
    out.push((b >> ((i & 3) * 2)) & 3);
  }
  return out;
}

function partsMsbFirst(bytes: Uint8Array, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const b = bytes[i >> 2] ?? 0;
    out.push((b >> (6 - (i & 3) * 2)) & 3);
  }
  return out;
}

// ---------------------------------------------------------------------------
// MTEF v2/v3 (Equation Editor 3.0)
// ---------------------------------------------------------------------------

class V3Parser extends BaseParser {
  constructor(
    r: ByteReader,
    private readonly version: number,
  ) {
    super(r);
  }

  parse(): MtEquation {
    const r = this.r;
    const platform = r.u8();
    const product = r.u8();
    const productVersion = r.u8();
    const productSubversion = r.u8();
    const items = this.finishList(this.readList(0, true));
    return {
      mtefVersion: this.version,
      platform,
      product,
      productVersion,
      productSubversion,
      applicationKey: '',
      inline: false,
      items,
      fontNames: this.fontNames,
    };
  }

  private readList(depth: number, top = false): RawItem[] {
    this.checkDepth(depth);
    const r = this.r;
    const out: RawItem[] = [];
    for (;;) {
      if (r.eof()) {
        if (top) return out;
        throw new MtefError('unterminated object list');
      }
      const tag = r.u8();
      this.countRecord();
      const type = tag & 0x0f;
      const opts = tag >> 4;
      switch (type) {
        case REC.END:
          return out;
        case REC.LINE:
          out.push(this.line(opts, depth));
          break;
        case REC.CHAR:
          out.push(this.char(opts, depth));
          break;
        case REC.TMPL:
          out.push(this.tmpl(opts, depth));
          break;
        case REC.PILE:
          out.push(this.pile(opts, depth));
          break;
        case REC.MATRIX:
          out.push(this.matrix(opts, depth));
          break;
        case REC.EMBELL: {
          if (opts & XF_LMOVE) this.nudge();
          const embell = r.u8();
          // Equation Editor 3 writes one extra (zero) byte after the embellishment type.
          if (!r.eof()) r.u8();
          out.push({ kind: 'embell', embell });
          break;
        }
        case REC.RULER:
          this.rulerBody();
          break;
        case REC.FONT_STYLE_DEF: {
          // v3 FONT record: typeface, style, name
          const tf = r.u8() - 128;
          r.u8();
          this.fontNames.set(tf, r.cstr());
          break;
        }
        case REC.SIZE:
          this.sizeBody();
          break;
        case REC.FULL:
        case REC.SUB:
        case REC.SUB2:
        case REC.SYM:
        case REC.SUBSYM:
          break;
        default:
          throw new MtefError(`unknown v3 record type ${type} at offset ${r.pos - 1}`);
      }
    }
  }

  private ruler(): void {
    if (this.r.peek() === REC.RULER) this.r.u8();
    this.rulerBody();
  }

  private line(opts: number, depth: number): MtLine {
    if (opts & XF_LMOVE) this.nudge();
    if (opts & XF_LSPACE) this.r.i16();
    if (opts & XF_RULER) this.ruler();
    const isNull = (opts & XF_NULL) !== 0;
    const items = isNull ? [] : this.finishList(this.readList(depth + 1));
    return { kind: 'line', isNull, items };
  }

  private char(opts: number, depth: number): MtChar {
    const r = this.r;
    if (opts & XF_LMOVE) this.nudge();
    const typeface = r.u8() - 128;
    const code = this.version === 2 ? r.u8() : r.u16();
    const embells = opts & XF_EMBELL ? this.embellsOf(this.readList(depth + 1)) : [];
    // xfAUTO marks automatically-styled characters, not function starts.
    return { kind: 'char', typeface, code, fontPos: null, funcStart: false, embells };
  }

  private tmpl(opts: number, depth: number): MtTmpl {
    const r = this.r;
    if (opts & XF_LMOVE) this.nudge();
    const sel = r.u8();
    const vari = r.u8();
    const tmplOptions = r.u8();
    const items = this.finishList(this.readList(depth + 1));
    const { selector, variation } = mapV3Template(sel, vari);
    return { kind: 'tmpl', selector, variation, tmplOptions, items };
  }

  private pile(opts: number, depth: number): MtPile {
    const r = this.r;
    if (opts & XF_LMOVE) this.nudge();
    const halign = r.u8();
    const valign = r.u8();
    if (opts & XF_RULER) this.ruler();
    const lines = this.finishList(this.readList(depth + 1));
    return { kind: 'pile', halign, valign, lines };
  }

  private matrix(opts: number, depth: number): MtMatrix {
    const r = this.r;
    if (opts & XF_LMOVE) this.nudge();
    const valign = r.u8();
    const hJust = r.u8();
    const vJust = r.u8();
    const rows = r.u8();
    const cols = r.u8();
    const rowParts = partsMsbFirst(r.bytes((rows + 4) >> 2), rows + 1);
    const colParts = partsMsbFirst(r.bytes((cols + 4) >> 2), cols + 1);
    const cells = this.finishList(this.readList(depth + 1));
    return { kind: 'matrix', valign, hJust, vJust, rows, cols, rowParts, colParts, cells };
  }
}

// Limit / big-operator variation bits (v5 numbering)
const BO_LOWER = 0x10;
const BO_UPPER = 0x20;
const BO_SUM = 0x40;

/** Map an Equation Editor 3.0 (MTEF v3) template selector/variation onto MTEF v5 numbering. */
export function mapV3Template(sel: number, v: number): { selector: number; variation: number } {
  const fence = (s: number) => ({ selector: s, variation: v === 1 ? 1 : v === 2 ? 2 : 3 });
  const interval = (variation: number) => ({ selector: TM.INTERVAL, variation });
  const limits = (n: number) => (n === 0 ? BO_LOWER : n === 1 ? BO_LOWER | BO_UPPER : 0);
  switch (sel) {
    case 0:
    case 1:
    case 2:
    case 3:
    case 4:
    case 5:
      return fence(sel);
    case 6:
    case 7:
      return { selector: sel, variation: 3 };
    case 8:
      return interval(0x22); // [ [
    case 9:
      return interval(0x33); // ] ]
    case 10:
      return interval(0x23); // ] [
    case 11:
      return interval(0x12); // [ )
    case 12:
      return interval(0x30); // ( ]
    case 13:
      return { selector: TM.ROOT, variation: v ? 1 : 0 };
    case 14:
      return { selector: TM.FRACT, variation: v ? 1 : 0 };
    case 15:
      return { selector: v === 1 ? TM.SUB : v === 2 ? TM.SUBSUP : TM.SUP, variation: 0 };
    case 16:
      return { selector: TM.UBAR, variation: v ? 1 : 0 };
    case 17:
      return { selector: TM.OBAR, variation: v ? 1 : 0 };
    case 18:
    case 19:
    case 20: {
      const dir = sel === 18 ? 0x10 : sel === 19 ? 0x20 : 0x30;
      return { selector: TM.ARROW, variation: dir | (v ? 0x08 : 0x04) };
    }
    case 21:
    case 22:
    case 23: {
      const n = sel - 20;
      const lim = v === 1 || v === 4 ? BO_LOWER : v === 2 ? BO_LOWER | BO_UPPER : 0;
      return { selector: TM.INTEG, variation: n | lim | (v >= 3 ? 0x100 : 0) };
    }
    case 24:
    case 25:
    case 26:
      return { selector: TM.INTEG, variation: (sel - 23) | BO_SUM | (v === 0 ? BO_LOWER | BO_UPPER : BO_LOWER) };
    case 27:
      return { selector: TM.HBRACE, variation: 1 };
    case 28:
      return { selector: TM.HBRACE, variation: 0 };
    case 29:
    case 31:
    case 33:
    case 35:
    case 37: {
      const s = [TM.SUM, TM.PROD, TM.COPROD, TM.UNION, TM.INTER][(sel - 29) / 2];
      return { selector: s, variation: BO_SUM | limits(v) };
    }
    case 30:
    case 32:
    case 34:
    case 36:
    case 38: {
      const s = [TM.SUM, TM.PROD, TM.COPROD, TM.UNION, TM.INTER][(sel - 30) / 2];
      return { selector: s, variation: limits(v) };
    }
    case 39:
      return { selector: TM.LIM, variation: v === 0 ? BO_UPPER : v === 1 ? BO_LOWER : BO_LOWER | BO_UPPER };
    case 40:
      return { selector: TM.LDIV, variation: v === 0 ? 1 : 0 };
    case 41:
      return { selector: TM.FRACT, variation: v === 1 ? 0x6 : v === 2 ? 0x3 : 0x2 };
    case 42:
      return { selector: TM.INTOP, variation: v === 0 ? BO_LOWER : v === 1 ? BO_UPPER : BO_LOWER | BO_UPPER };
    case 43:
      return {
        selector: TM.SUMOP,
        variation: BO_SUM | (v === 0 ? BO_LOWER : v === 1 ? BO_UPPER : BO_LOWER | BO_UPPER),
      };
    case 44:
      return { selector: v === 1 ? TM.SUB : v === 2 ? TM.SUBSUP : TM.SUP, variation: 1 };
    case 45:
      return { selector: TM.DIRAC, variation: v === 1 ? 1 : v === 2 ? 2 : 3 };
    case 46:
      return { selector: TM.VEC, variation: 0x4 | (v === 0 ? 1 : v === 1 ? 2 : 3) };
    case 47:
      return { selector: TM.VEC, variation: v === 0 ? 1 : v === 1 ? 2 : 3 };
    case 48:
      return { selector: TM.OBRACK, variation: 3 };
    default:
      return { selector: 1000 + sel, variation: v };
  }
}
