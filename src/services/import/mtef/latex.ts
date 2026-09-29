/**
 * MTEF object tree → KaTeX-compatible LaTeX.
 *
 * Part of a TypeScript port of zhexiao/mtef-go (Apache License 2.0), whose
 * eqn/mtef.go makeLatex() this replaces with a rewritten, spec-driven emitter.
 * See ./NOTICE.
 */
import {
  BIG_OPERATORS,
  FUNCTION_NAMES,
  LIMIT_FUNCTIONS,
  MATH_CHARS,
  RELATIONS,
  SUPERSCRIPT_CHARS,
  fontPositionToUnicode,
  spaceLatex,
  styledLetter,
} from './chars';
import { EMB, FN, MtChar, MtEquation, MtefError, MtItem, MtMatrix, MtPile, MtTmpl, TM } from './types';

/** Hard cap on generated LaTeX length. */
export const MAX_OUTPUT_LENGTH = 100_000;
const MAX_RENDER_DEPTH = 80;
const MAX_MATRIX_CELLS = 10_000;

type AtomKind = 'ord' | 'op' | 'rel' | 'space' | 'text';

interface Atom {
  tex: string;
  kind: AtomKind;
  /** Already carries a subscript / superscript (avoid "double superscript"). */
  sub?: boolean;
  sup?: boolean;
  /** Raw text for mergeable \text{…} atoms. */
  text?: string;
}

interface Ctx {
  depth: number;
  /** Inside a fence template (piles render as array{l}, e.g. systems of equations). */
  inFence?: boolean;
  /** Inside a limit slot of a big operator / lim (piles render as \substack). */
  inLimit?: boolean;
}

const LETTER_RE = /\p{L}/u;
const SMALL_SPACES = new Set(['\\,', '\\:', '\\;', '\\ ']);
const GREEK_RE = /[\u0370-\u03ff]/g;
const SPACE_TEX = new Set(['~', '\\ ', '\\,', '\\:', '\\;', '\\!', '\\quad', '\\qquad']);

function isLetterCode(code: number): boolean {
  return code > 0 && code < 0xe000 && LETTER_RE.test(String.fromCharCode(code));
}

/** Append LaTeX, inserting a space only where a control word would otherwise swallow a letter/digit. */
function appendTex(out: string, s: string): string {
  if (!s) return out;
  if (/\\[A-Za-z]+$/.test(out) && /^[A-Za-z0-9]/.test(s)) return `${out} ${s}`;
  return out + s;
}

function joinAtoms(atoms: Atom[]): string {
  let out = '';
  for (const a of atoms) out = appendTex(out, a.tex);
  return out;
}

const TEXT_ESCAPES: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '{': '\\{',
  '}': '\\}',
  $: '\\$',
  '&': '\\&',
  '#': '\\#',
  '%': '\\%',
  _: '\\_',
  '^': '\\textasciicircum{}',
  '~': '\\textasciitilde{}',
};

function escapeText(s: string): string {
  return s.replace(/[\\{}$&#%_^~]/g, (c) => TEXT_ESCAPES[c]);
}

function textAtom(raw: string): Atom {
  return { tex: `\\text{${escapeText(raw)}}`, kind: 'text', text: raw };
}

/** A single token that can take \hat / \tilde / a bare script without braces. */
function isSingleToken(tex: string): boolean {
  return /^(?:[A-Za-z0-9]|\\[A-Za-z]+)$/.test(tex);
}

const LEFT_DELIMS: Record<number, string> = {
  [TM.ANGLE]: '\\langle',
  [TM.PAREN]: '(',
  [TM.BRACE]: '\\{',
  [TM.BRACK]: '[',
  [TM.BAR]: '|',
  [TM.DBAR]: '\\|',
  [TM.FLOOR]: '\\lfloor',
  [TM.CEILING]: '\\lceil',
  [TM.OBRACK]: '\\llbracket',
};
const RIGHT_DELIMS: Record<number, string> = {
  [TM.ANGLE]: '\\rangle',
  [TM.PAREN]: ')',
  [TM.BRACE]: '\\}',
  [TM.BRACK]: ']',
  [TM.BAR]: '|',
  [TM.DBAR]: '\\|',
  [TM.FLOOR]: '\\rfloor',
  [TM.CEILING]: '\\rceil',
  [TM.OBRACK]: '\\rrbracket',
};
/** tmINTERVAL fence codes: 0 "(", 1 ")", 2 "[", 3 "]". */
const INTERVAL_DELIMS = ['(', ')', '[', ']'];

const BIG_OP_SELECTOR: Record<number, string> = {
  [TM.SUM]: '\\sum',
  [TM.PROD]: '\\prod',
  [TM.COPROD]: '\\coprod',
  [TM.UNION]: '\\bigcup',
  [TM.INTER]: '\\bigcap',
  [TM.INTOP]: '\\int',
  [TM.SUMOP]: '\\sum',
};

const BO_SUM = 0x40;

function alignChar(halign: number): string {
  return halign === 2 ? 'c' : halign === 3 || halign === 5 ? 'r' : 'l';
}

class LatexWriter {
  equation(eq: MtEquation): string {
    const ctx: Ctx = { depth: 0 };
    let out = '';
    for (const it of eq.items) out = appendTex(out, this.object(it, ctx));
    return out;
  }

  // ---------------------------------------------------------------------
  // Containers
  // ---------------------------------------------------------------------

  private next(ctx: Ctx, extra: Partial<Ctx> = {}): Ctx {
    if (ctx.depth + 1 > MAX_RENDER_DEPTH) throw new MtefError('render depth exceeded');
    return { ...ctx, ...extra, depth: ctx.depth + 1 };
  }

  /** Render any structural object (slot contents). */
  private object(it: MtItem | undefined, ctx: Ctx): string {
    if (!it) return '';
    switch (it.kind) {
      case 'line':
        return it.isNull ? '' : joinAtoms(this.atoms(it.items, this.next(ctx)));
      case 'pile':
        return this.pile(it, this.next(ctx));
      case 'matrix':
        return this.matrix(it, this.next(ctx));
      default:
        return joinAtoms(this.atoms([it], this.next(ctx)));
    }
  }

  private pile(p: MtPile, ctx: Ctx): string {
    const lines = p.lines.filter((l) => l.kind !== 'char');
    if (lines.length === 0) return '';
    if (lines.length === 1) return this.object(lines[0], ctx);
    if (ctx.inLimit) {
      return `\\substack{${lines.map((l) => this.object(l, { ...ctx, inLimit: false })).join(' \\\\ ')}}`;
    }
    const inner: Ctx = { ...ctx, inFence: false };
    if (p.halign === 4 && !ctx.inFence) {
      // Relational alignment: align lines at their first relation symbol.
      const rows = lines.map((l) => {
        if (l.kind !== 'line' || l.isNull) return `&${this.object(l, inner)}`;
        const atoms = this.atoms(l.items, this.next(inner));
        const k = atoms.findIndex((a) => a.kind === 'rel');
        return k < 0 ? `&${joinAtoms(atoms)}` : `${joinAtoms(atoms.slice(0, k))}&${joinAtoms(atoms.slice(k))}`;
      });
      return `\\begin{aligned}${rows.join(' \\\\ ')}\\end{aligned}`;
    }
    const col = alignChar(p.halign);
    return `\\begin{array}{${col}}${lines.map((l) => this.object(l, inner)).join(' \\\\ ')}\\end{array}`;
  }

  private matrix(m: MtMatrix, ctx: Ctx): string {
    const rows = Math.max(1, m.rows);
    const cols = Math.max(1, m.cols);
    if (rows * cols > MAX_MATRIX_CELLS) throw new MtefError('matrix too large');
    const cells = m.cells.filter((c) => c.kind !== 'char');
    const inner: Ctx = { ...ctx, inFence: false, inLimit: false };
    const line = (style: number | undefined, vertical: boolean) =>
      !style ? '' : style === 1 ? (vertical ? '|' : '\\hline ') : vertical ? ':' : '\\hdashline ';
    const colAlign = m.hJust === 1 ? 'l' : m.hJust === 3 ? 'r' : 'c';
    let spec = '';
    for (let c = 0; c <= cols; c++) {
      spec += line(m.colParts[c], true);
      if (c < cols) spec += colAlign;
    }
    const rowTex: string[] = [];
    for (let r = 0; r < rows; r++) {
      const cellTex: string[] = [];
      for (let c = 0; c < cols; c++) cellTex.push(this.object(cells[r * cols + c], inner));
      rowTex.push(line(m.rowParts[r], false) + cellTex.join(' & '));
    }
    let body = rowTex.join(' \\\\ ');
    const last = line(m.rowParts[rows], false);
    if (last) body += ` \\\\ ${last.trim()}`;
    return `\\begin{array}{${spec}}${body}\\end{array}`;
  }

  // ---------------------------------------------------------------------
  // Line contents
  // ---------------------------------------------------------------------

  private atoms(items: MtItem[], ctx: Ctx): Atom[] {
    const atoms: Atom[] = [];
    const push = (a: Atom) => {
      const prev = atoms[atoms.length - 1];
      if (
        a.kind === 'text' &&
        prev &&
        prev.kind === 'text' &&
        prev.text !== undefined &&
        a.text !== undefined &&
        !prev.sub &&
        !prev.sup
      ) {
        atoms[atoms.length - 1] = textAtom(prev.text + a.text);
        return;
      }
      // text · single space · text  →  one \text{…} (words separated by MathType spaces)
      const prev2 = atoms[atoms.length - 2];
      if (
        a.kind === 'text' &&
        a.text !== undefined &&
        prev &&
        prev.kind === 'space' &&
        SMALL_SPACES.has(prev.tex) &&
        prev2 &&
        prev2.kind === 'text' &&
        prev2.text !== undefined &&
        !prev2.sub &&
        !prev2.sup
      ) {
        atoms.pop();
        atoms[atoms.length - 1] = textAtom(`${prev2.text} ${a.text}`);
        return;
      }
      if (a.tex || a.kind === 'space') atoms.push(a);
    };

    // Letter runs already examined (and found not to be text) end before this index.
    let scannedUntil = 0;
    for (let i = 0; i < items.length; ) {
      const it = items[i];
      if (it.kind !== 'char') {
        if (it.kind === 'tmpl') this.template(it, atoms, push, ctx);
        else if (it.kind === 'line') {
          for (const a of this.atoms(it.items, this.next(ctx))) push(a);
        } else push({ tex: this.object(it, ctx), kind: 'ord' });
        i++;
        continue;
      }

      const tf = it.typeface;
      if (tf === FN.MARKER) {
        i++;
        continue;
      }

      // Text-style run → \text{…}
      if (tf === FN.TEXT || tf === FN.TEXT_FE) {
        let j = i;
        let raw = '';
        while (j < items.length) {
          const c = items[j];
          if (c.kind !== 'char' || (c.typeface !== FN.TEXT && c.typeface !== FN.TEXT_FE)) break;
          const ch = textCharOf(c);
          if (ch === null) break;
          raw += ch;
          j++;
        }
        if (j > i) {
          this.textRun(raw.normalize('NFC'), items.slice(i, j) as MtChar[], push, atoms);
          i = j;
          continue;
        }
      }

      // Function-style letters → \sin, \log, \operatorname{…}
      if (tf === FN.FUNCTION && isLetterCode(codeOf(it)) && it.embells.length === 0) {
        let j = i;
        let word = '';
        while (j < items.length) {
          const c = items[j];
          if (c.kind !== 'char' || c.typeface !== FN.FUNCTION || c.embells.length > 0) break;
          const code = codeOf(c);
          if (!isLetterCode(code)) break;
          if (j > i && c.funcStart) break;
          word += String.fromCharCode(code);
          j++;
        }
        push(functionAtom(word.normalize('NFC')));
        i = j;
        continue;
      }

      // Runs of letters that must be typeset as text (Vietnamese words in math styles).
      if (i >= scannedUntil && tf !== FN.SYMBOL && tf !== FN.SPACE && tf !== FN.EXPAND && tf !== FN.FUNCTION) {
        let j = i;
        let raw = '';
        let nonAscii = false;
        let spaces = 0;
        let letters = 0;
        // Explicit-font (negative typeface) runs may contain spaces; style-based runs may not.
        const explicitFont = tf < 0;
        while (j < items.length) {
          const c = items[j];
          if (c.kind !== 'char' || c.embells.length > 0) break;
          const ctf = c.typeface;
          if (ctf === FN.TEXT || ctf === FN.TEXT_FE || ctf === FN.FUNCTION || ctf === FN.SYMBOL) break;
          if ((ctf < 0) !== explicitFont) break;
          const code = codeOf(c);
          if (code === 0x20 && explicitFont) {
            spaces++;
            raw += ' ';
          } else if (isLetterCode(code) && !(code in MATH_CHARS) && !styledLetter(code)) {
            letters++;
            if (code > 0x7f) nonAscii = true;
            raw += String.fromCharCode(code);
          } else break;
          j++;
        }
        if (j > i && (nonAscii || (spaces > 0 && letters >= 2))) {
          push(textAtom(raw.normalize('NFC')));
          i = j;
          continue;
        }
        scannedUntil = j;
      }

      this.charAtom(it, atoms, push);
      i++;
    }
    // Trailing spacing is invisible padding in MathType; drop it.
    while (atoms.length && atoms[atoms.length - 1].kind === 'space') atoms.pop();
    return atoms;
  }

  private textRun(raw: string, chars: MtChar[], push: (a: Atom) => void, atoms: Atom[]): void {
    // Only non-Greek letters make a run "real" text; Greek / digits / punctuation stay math.
    if (LETTER_RE.test(raw.replace(GREEK_RE, ''))) {
      push(textAtom(raw));
      return;
    }
    if (/^\s+$/.test(raw)) {
      push({ tex: '\\ ', kind: 'space' });
      return;
    }
    // Digits / punctuation / Greek typed in text style: keep them as math.
    for (const c of chars) {
      if (codeOf(c) === 0x20) push({ tex: '\\ ', kind: 'space' });
      else this.charAtom(c, atoms, push);
    }
  }

  private charAtom(c: MtChar, atoms: Atom[], push: (a: Atom) => void): void {
    const code = codeOf(c);
    const tf = c.typeface;

    if (tf === FN.SPACE || (code >= 0xef00 && code <= 0xef08)) {
      const s = spaceLatex(code) ?? MATH_CHARS[code] ?? '';
      if (s) push({ tex: s, kind: 'space' });
      return;
    }

    if (code in SUPERSCRIPT_CHARS && c.embells.length === 0) {
      attachScripts(atoms, push, '', SUPERSCRIPT_CHARS[code], false);
      return;
    }

    let tex = mathCharTex(code);
    if (!tex) return;
    if (tf === FN.VECTOR) {
      if (/^[A-Za-z0-9]$/.test(tex)) tex = `\\mathbf{${tex}}`;
      else if (/^\\[A-Za-z]+$/.test(tex)) tex = `\\boldsymbol{${tex}}`;
    }
    if (SPACE_TEX.has(tex) && c.embells.length === 0) {
      push({ tex, kind: 'space' });
      return;
    }
    let atom: Atom = { tex, kind: RELATIONS.has(tex) ? 'rel' : 'ord' };
    for (const e of c.embells) atom = applyEmbell(atom, e);
    push(atom);
  }

  // ---------------------------------------------------------------------
  // Templates
  // ---------------------------------------------------------------------

  private template(t: MtTmpl, atoms: Atom[], push: (a: Atom) => void, ctx: Ctx): void {
    const slots = t.items.filter((x) => x.kind !== 'char');
    const chars = t.items.filter((x): x is MtChar => x.kind === 'char');
    const v = t.variation;
    const inner = this.next(ctx, { inFence: false, inLimit: false });
    const S = (i: number, extra: Partial<Ctx> = {}) => this.object(slots[i], { ...inner, ...extra });
    const sel = t.selector;

    switch (sel) {
      case TM.ANGLE:
      case TM.PAREN:
      case TM.BRACE:
      case TM.BRACK:
      case TM.BAR:
      case TM.DBAR:
      case TM.FLOOR:
      case TM.CEILING:
      case TM.OBRACK:
      case TM.INTERVAL: {
        let left: string;
        let right: string;
        if (sel === TM.INTERVAL) {
          left = INTERVAL_DELIMS[v & 3];
          right = INTERVAL_DELIMS[(v >> 4) & 3];
        } else {
          const bits = v & 3 || 3;
          left = bits & 1 ? LEFT_DELIMS[sel] : '.';
          right = bits & 2 ? RIGHT_DELIMS[sel] : '.';
        }
        const body = S(0, { inFence: true });
        if (sel === TM.OBRACK) {
          // KaTeX has no stretchy white brackets; use static ones.
          const l = left === '.' ? '' : `${left} `;
          const r = right === '.' ? '' : ` ${right}`;
          push({ tex: `${l}${body}${r}`, kind: 'ord' });
          return;
        }
        push({ tex: `\\left${left} ${body} \\right${right}`, kind: 'ord' });
        return;
      }

      case TM.ROOT: {
        const main = S(0);
        const index = S(1);
        push({ tex: index ? `\\sqrt[${index}]{${main}}` : `\\sqrt{${main}}`, kind: 'ord' });
        return;
      }

      case TM.FRACT: {
        const num = S(0);
        const den = S(1);
        if (v & 0x2) {
          const wrap = (x: string) => (isSingleToken(x) || /^[0-9.]+$/.test(x) ? x : `{${x}}`);
          push({ tex: `${wrap(num)}/${wrap(den)}`, kind: 'ord' });
        } else if (v & 0x1) push({ tex: `\\tfrac{${num}}{${den}}`, kind: 'ord' });
        else push({ tex: `\\frac{${num}}{${den}}`, kind: 'ord' });
        return;
      }

      case TM.UBAR:
      case TM.OBAR: {
        const cmd = sel === TM.UBAR ? '\\underline' : '\\overline';
        let tex = `${cmd}{${S(0)}}`;
        if (v & 1) tex = `${cmd}{${tex}}`;
        push({ tex, kind: 'ord' });
        return;
      }

      case TM.ARROW: {
        const top = S(0);
        const bottom = S(1);
        let cmd: string;
        if (v & 0x1) cmd = '\\xrightleftarrows';
        else if (v & 0x2) cmd = '\\xrightleftharpoons';
        else {
          const dir = v & 0x30;
          cmd = dir === 0x10 ? '\\xleftarrow' : dir === 0x30 ? '\\xleftrightarrow' : '\\xrightarrow';
        }
        push({ tex: `${cmd}${bottom ? `[${bottom}]` : ''}{${top}}`, kind: 'rel' });
        return;
      }

      case TM.INTEG:
      case TM.SUM:
      case TM.PROD:
      case TM.COPROD:
      case TM.UNION:
      case TM.INTER:
      case TM.INTOP:
      case TM.SUMOP: {
        const main = S(0);
        const lower = S(1, { inLimit: true });
        const upper = S(2, { inLimit: true });
        let op: string;
        if (sel === TM.INTEG) {
          const n = v & 0x3 || 1;
          const loop = (v & 0xc) !== 0;
          op = loop ? ['\\oint', '\\oiint', '\\oiiint'][n - 1] : ['\\int', '\\iint', '\\iiint'][n - 1];
        } else {
          const glyph = chars.length ? codeOf(chars[chars.length - 1]) : 0;
          op =
            sel === TM.INTOP || sel === TM.SUMOP
              ? BIG_OPERATORS[glyph] ?? (mathCharTex(glyph) || BIG_OP_SELECTOR[sel])
              : BIG_OP_SELECTOR[sel];
        }
        let tex = op;
        if (v & BO_SUM && (lower || upper)) tex += '\\limits';
        if (lower) tex += `_{${lower}}`;
        if (upper) tex += `^{${upper}}`;
        if (main) tex += `{${main}}`;
        push({ tex, kind: 'op', sub: !main && !!lower, sup: !main && !!upper });
        return;
      }

      case TM.LIM: {
        const main = S(0);
        const lower = S(1, { inLimit: true });
        const upper = S(2, { inLimit: true });
        let op = LIMIT_FUNCTIONS.has(main) || Object.values(FUNCTION_NAMES).includes(main) ? main : '';
        if (!op && /^[A-Za-z]+$/.test(main) && FUNCTION_NAMES[main]) op = FUNCTION_NAMES[main];
        let tex = op || `\\mathop{${main}}\\limits`;
        if (lower) tex += `_{${lower}}`;
        if (upper) tex += `^{${upper}}`;
        push({ tex, kind: 'op', sub: !!lower, sup: !!upper });
        return;
      }

      case TM.HBRACE:
      case TM.HBRACK: {
        const main = S(0);
        const label = S(1);
        const kind = sel === TM.HBRACE ? 'brace' : 'bracket';
        const tex =
          v & 1
            ? `\\over${kind}{${main}}${label ? `^{${label}}` : ''}`
            : `\\under${kind}{${main}}${label ? `_{${label}}` : ''}`;
        push({ tex, kind: 'ord', sub: !(v & 1) && !!label, sup: !!(v & 1) && !!label });
        return;
      }

      case TM.LDIV: {
        const dividend = S(0);
        const quotient = S(1);
        const box = `\\overline{)\\,${dividend}}`;
        push({
          tex: quotient ? `\\begin{array}{r}${quotient} \\\\ ${box}\\end{array}` : box,
          kind: 'ord',
        });
        return;
      }

      case TM.SUB:
      case TM.SUP:
      case TM.SUBSUP: {
        const sub = sel === TM.SUP ? '' : S(0);
        const sup = sel === TM.SUB ? '' : S(1);
        attachScripts(atoms, push, sub, sup, (v & 1) === 1);
        return;
      }

      case TM.DIRAC: {
        const left = S(0);
        const right = S(1);
        const bits = v & 3 || 3;
        let tex: string;
        if (bits === 3) tex = `\\left\\langle ${left} \\middle| ${right} \\right\\rangle`;
        else if (bits === 1) tex = `\\left\\langle ${left} \\right|`;
        else tex = `\\left| ${right} \\right\\rangle`;
        push({ tex, kind: 'ord' });
        return;
      }

      case TM.VEC: {
        const main = S(0);
        const under = (v & 0x4) !== 0;
        const harpoon = (v & 0x8) !== 0;
        const dir = v & 0x3;
        let cmd: string;
        if (under) {
          cmd = dir === 3 ? '\\underleftrightarrow' : dir === 1 ? '\\underleftarrow' : '\\underrightarrow';
        } else if (harpoon) {
          cmd = dir === 1 ? '\\overleftharpoon' : '\\overrightharpoon';
        } else {
          cmd = dir === 3 ? '\\overleftrightarrow' : dir === 1 ? '\\overleftarrow' : '\\overrightarrow';
        }
        push({ tex: `${cmd}{${main}}`, kind: 'ord' });
        return;
      }

      case TM.TILDE:
      case TM.HAT: {
        const main = S(0);
        const narrow = isSingleToken(main);
        const cmd = sel === TM.TILDE ? (narrow ? '\\tilde' : '\\widetilde') : narrow ? '\\hat' : '\\widehat';
        push({ tex: `${cmd}{${main}}`, kind: 'ord' });
        return;
      }

      case TM.ARC:
        push({ tex: `\\overset{\\frown}{${S(0)}}`, kind: 'ord' });
        return;

      case TM.JSTATUS:
        push({ tex: `\\overline{${S(0)}}`, kind: 'ord' });
        return;

      case TM.STRIKE: {
        const main = S(0);
        if (v & 0x1) {
          push({ tex: strikeOut(main), kind: 'ord' });
          return;
        }
        let cmd: string;
        if ((v & 0x6) === 0x6) cmd = '\\xcancel';
        else if (v & 0x4) cmd = '\\bcancel';
        else cmd = '\\cancel';
        push({ tex: `${cmd}{${main}}`, kind: 'ord' });
        return;
      }

      case TM.BOX:
        push({ tex: `\\boxed{${S(0)}}`, kind: 'ord' });
        return;

      default: {
        // Unknown template: keep the slot contents in order.
        let tex = '';
        for (let k = 0; k < slots.length; k++) tex = appendTex(tex, S(k));
        push({ tex, kind: 'ord' });
      }
    }
  }
}

/** Attach sub/superscripts to the preceding atom (or to an empty base). */
function attachScripts(atoms: Atom[], push: (a: Atom) => void, sub: string, sup: string, precedes: boolean): void {
  let s = '';
  if (sub) s += `_{${sub}}`;
  if (sup) s += `^{${sup}}`;
  if (!s) return;
  const prev = atoms[atoms.length - 1];
  if (
    precedes ||
    !prev ||
    prev.kind === 'space' ||
    (sub && prev.sub) ||
    (sup && prev.sup)
  ) {
    push({ tex: `{}${s}`, kind: 'ord', sub: !!sub, sup: !!sup });
    return;
  }
  prev.tex += s;
  prev.text = undefined;
  if (sub) prev.sub = true;
  if (sup) prev.sup = true;
}

function codeOf(c: MtChar): number {
  if (c.code) return c.code;
  if (c.fontPos === null) return 0;
  const symbolFont = c.typeface === FN.SYMBOL || c.typeface === FN.LCGREEK || c.typeface === FN.UCGREEK;
  return fontPositionToUnicode(c.fontPos, symbolFont);
}

/** Character of a text-style CHAR, or null if it cannot live inside \text{…}. */
function textCharOf(c: MtChar): string | null {
  const code = codeOf(c);
  if (code === 0x20 || code === 0xa0) return ' ';
  if (spaceLatex(code) !== null) return ' ';
  if (code < 0x20 || (code >= 0xe000 && code <= 0xf8ff) || code === 0) return null;
  if (c.embells.length > 0) return null;
  return String.fromCharCode(code);
}

function functionAtom(word: string): Atom {
  if (/^[A-Za-z]+$/.test(word)) {
    const cmd = FUNCTION_NAMES[word];
    return { tex: cmd ?? `\\operatorname{${word}}`, kind: 'op' };
  }
  return textAtom(word);
}

/** LaTeX for a single math-mode character. */
function mathCharTex(code: number): string {
  if (!code) return '';
  const mapped = MATH_CHARS[code];
  if (mapped !== undefined) return mapped;
  const styled = styledLetter(code);
  if (styled) return styled;
  const space = spaceLatex(code);
  if (space !== null) return space;
  if (code === 0x20) return '';
  if (code > 0x20 && code < 0x7f) return String.fromCharCode(code);
  if (code < 0x20 || (code >= 0x7f && code < 0xa0)) return '';
  if (code >= 0xe000 && code <= 0xf8ff) return ''; // unknown private-use glyph
  if (code >= 0x300 && code <= 0x36f) return ''; // stray combining mark
  return `\\text{${escapeText(String.fromCharCode(code))}}`;
}

/** Horizontal strike-through (KaTeX only supports \sout in text mode). */
function strikeOut(tex: string): string {
  return `\\text{\\sout{$${tex}$}}`;
}

function applyEmbell(atom: Atom, e: number): Atom {
  const base = atom.tex;
  const wrap = (cmd: string): Atom => ({ ...atom, tex: `${cmd}{${base}}`, text: undefined });
  const under = (mark: string): Atom => ({ ...atom, tex: `\\underset{${mark}}{${base}}`, text: undefined });
  switch (e) {
    case EMB.DOT1:
      return wrap('\\dot');
    case EMB.DOT2:
      return wrap('\\ddot');
    case EMB.DOT3:
      return wrap('\\dddot');
    case EMB.DOT4:
      return wrap('\\ddddot');
    case EMB.PRIME1:
      return { ...atom, tex: `${base}'`, text: undefined };
    case EMB.PRIME2:
      return { ...atom, tex: `${base}''`, text: undefined };
    case EMB.PRIME3:
      return { ...atom, tex: `${base}'''`, text: undefined };
    case EMB.BPRIME:
      return { ...atom, tex: `{}^{\\backprime}${base}`, text: undefined };
    case EMB.TILDE:
      return wrap('\\tilde');
    case EMB.HAT:
      return wrap('\\hat');
    case EMB.NOT:
      return wrap('\\not');
    case EMB.UP_BAR:
      return wrap('\\cancel');
    case EMB.DOWN_BAR:
      return wrap('\\bcancel');
    case EMB.X_BARS:
      return wrap('\\xcancel');
    case EMB.RARROW:
      return wrap('\\vec');
    case EMB.LARROW:
      return wrap('\\overleftarrow');
    case EMB.BARROW:
      return wrap('\\overleftrightarrow');
    case EMB.R1ARROW:
      return wrap('\\overrightharpoon');
    case EMB.L1ARROW:
      return wrap('\\overleftharpoon');
    case EMB.MBAR:
      return { ...atom, tex: strikeOut(base), text: undefined };
    case EMB.OBAR:
      return wrap('\\bar');
    case EMB.FROWN:
      return { ...atom, tex: `\\overset{\\frown}{${base}}`, text: undefined };
    case EMB.SMILE:
      return { ...atom, tex: `\\overset{\\smile}{${base}}`, text: undefined };
    case EMB.U_DOT1:
      return under('\\cdot');
    case EMB.U_DOT2:
      return under('\\cdot\\cdot');
    case EMB.U_DOT3:
      return under('\\cdot\\cdot\\cdot');
    case EMB.U_DOT4:
      return under('\\cdot\\cdot\\cdot\\cdot');
    case EMB.U_BAR:
      return wrap('\\underline');
    case EMB.U_TILDE:
      return wrap('\\utilde');
    case EMB.U_FROWN:
      return under('\\frown');
    case EMB.U_SMILE:
      return under('\\smile');
    case EMB.U_RARROW:
    case EMB.U_R1ARROW:
      return wrap('\\underrightarrow');
    case EMB.U_LARROW:
    case EMB.U_L1ARROW:
      return wrap('\\underleftarrow');
    case EMB.U_BARROW:
      return wrap('\\underleftrightarrow');
    default:
      return atom;
  }
}

/** Convert a parsed equation to LaTeX (throws MtefError on pathological input). */
const LEADING_SPACE = /^(?:\\[,:;! ]|\\q?quad(?![A-Za-z])|~|\s)+/;
const TRAILING_SPACE = /(?:\\[,:;!]|\\q?quad|~)$/;

/** Leading / trailing spacing commands around the whole equation carry no meaning. */
function trimEdgeSpaces(s: string): string {
  let out = s.replace(LEADING_SPACE, '');
  for (;;) {
    if (/\s$/.test(out)) {
      // A trailing space preceded by an odd number of backslashes is a control space ("\ ").
      let n = 0;
      for (let k = out.length - 2; k >= 0 && out[k] === '\\'; k--) n++;
      out = out.slice(0, n % 2 === 1 ? -2 : -1);
      continue;
    }
    const next = out.replace(TRAILING_SPACE, '');
    if (next === out) return out;
    out = next;
  }
}

export function equationToLatex(eq: MtEquation): string {
  const out = new LatexWriter().equation(eq).replace(/ {2,}/g, ' ');
  const trimmed = trimEdgeSpaces(out.trim());
  if (trimmed.length > MAX_OUTPUT_LENGTH) throw new MtefError('output too long');
  return trimmed;
}
