/**
 * MTEF (MathType Equation Format) object model.
 *
 * Part of a TypeScript port of zhexiao/mtef-go (Apache License 2.0).
 * See ./NOTICE.
 */

/** A LINE record ("slot"): a horizontal run of objects. */
export interface MtLine {
  kind: 'line';
  /** mtefOPT_LINE_NULL — placeholder line with no content. */
  isNull: boolean;
  items: MtItem[];
}

/** A CHAR record. */
export interface MtChar {
  kind: 'char';
  /** Typeface value with the +128 bias already removed (fnTEXT = 1, fnVARIABLE = 3, …; negative = explicit font). */
  typeface: number;
  /** Unicode / MTCode value (0 when absent). */
  code: number;
  /** 8- or 16-bit font position, if written. */
  fontPos: number | null;
  /** mtefOPT_CHAR_FUNC_START — first character of a function name. */
  funcStart: boolean;
  /** Embellishment types (emb1DOT, embHAT, …) applied to this char, in order. */
  embells: number[];
}

/** A TMPL record (fraction, radical, fence, script, big operator, …). */
export interface MtTmpl {
  kind: 'tmpl';
  selector: number;
  variation: number;
  tmplOptions: number;
  /** Sub-objects in stream order: slots (LINE / PILE) and characters (fence / operator glyphs). */
  items: MtItem[];
}

/** A PILE record: vertical stack of lines. */
export interface MtPile {
  kind: 'pile';
  halign: number;
  valign: number;
  lines: MtItem[];
}

/** A MATRIX record. */
export interface MtMatrix {
  kind: 'matrix';
  valign: number;
  hJust: number;
  vJust: number;
  rows: number;
  cols: number;
  /** rows + 1 partition line styles: 0 none, 1 solid, 2 dashed, 3 dotted. */
  rowParts: number[];
  /** cols + 1 partition line styles. */
  colParts: number[];
  cells: MtItem[];
}

export type MtItem = MtLine | MtChar | MtTmpl | MtPile | MtMatrix;

export interface MtEquation {
  mtefVersion: number;
  platform: number;
  product: number;
  productVersion: number;
  productSubversion: number;
  applicationKey: string;
  inline: boolean;
  /** Top-level structural objects (normally a single LINE or PILE). */
  items: MtItem[];
  /** FONT_DEF / FONT records: font names by index (v5) or by typeface (v3). */
  fontNames: Map<number, string>;
}

/** Thrown internally on malformed input; never escapes the public API. */
export class MtefError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MtefError';
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const REC = {
  END: 0,
  LINE: 1,
  CHAR: 2,
  TMPL: 3,
  PILE: 4,
  MATRIX: 5,
  EMBELL: 6,
  RULER: 7,
  FONT_STYLE_DEF: 8, // v3: FONT
  SIZE: 9,
  FULL: 10,
  SUB: 11,
  SUB2: 12,
  SYM: 13,
  SUBSYM: 14,
  COLOR: 15,
  COLOR_DEF: 16,
  FONT_DEF: 17,
  EQN_PREFS: 18,
  ENCODING_DEF: 19,
  FUTURE: 100,
} as const;

/** Typeface (style) values. */
export const FN = {
  TEXT: 1,
  FUNCTION: 2,
  VARIABLE: 3,
  LCGREEK: 4,
  UCGREEK: 5,
  SYMBOL: 6,
  VECTOR: 7,
  NUMBER: 8,
  USER1: 9,
  USER2: 10,
  MTEXTRA: 11,
  TEXT_FE: 12,
  EXPAND: 22,
  MARKER: 23,
  SPACE: 24,
} as const;

/** Template selectors. */
export const TM = {
  ANGLE: 0,
  PAREN: 1,
  BRACE: 2,
  BRACK: 3,
  BAR: 4,
  DBAR: 5,
  FLOOR: 6,
  CEILING: 7,
  OBRACK: 8,
  INTERVAL: 9,
  ROOT: 10,
  FRACT: 11,
  UBAR: 12,
  OBAR: 13,
  ARROW: 14,
  INTEG: 15,
  SUM: 16,
  PROD: 17,
  COPROD: 18,
  UNION: 19,
  INTER: 20,
  INTOP: 21,
  SUMOP: 22,
  LIM: 23,
  HBRACE: 24,
  HBRACK: 25,
  LDIV: 26,
  SUB: 27,
  SUP: 28,
  SUBSUP: 29,
  DIRAC: 30,
  VEC: 31,
  TILDE: 32,
  HAT: 33,
  ARC: 34,
  JSTATUS: 35,
  STRIKE: 36,
  BOX: 37,
} as const;

/** Embellishment types. */
export const EMB = {
  DOT1: 2,
  DOT2: 3,
  DOT3: 4,
  PRIME1: 5,
  PRIME2: 6,
  BPRIME: 7,
  TILDE: 8,
  HAT: 9,
  NOT: 10,
  RARROW: 11,
  LARROW: 12,
  BARROW: 13,
  R1ARROW: 14,
  L1ARROW: 15,
  MBAR: 16,
  OBAR: 17,
  PRIME3: 18,
  FROWN: 19,
  SMILE: 20,
  X_BARS: 21,
  UP_BAR: 22,
  DOWN_BAR: 23,
  DOT4: 24,
  U_DOT1: 25,
  U_DOT2: 26,
  U_DOT3: 27,
  U_DOT4: 28,
  U_BAR: 29,
  U_TILDE: 30,
  U_FROWN: 31,
  U_SMILE: 32,
  U_RARROW: 33,
  U_LARROW: 34,
  U_BARROW: 35,
  U_R1ARROW: 36,
  U_L1ARROW: 37,
} as const;
