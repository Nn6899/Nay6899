import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import katex from 'katex';
import { mathTypeOleToLatex, mtefToLatex } from '../src/services/import/mtef';
import { readEquationNativeStream, stripEqnOleHeader } from '../src/services/import/mtef/ole';
import {
  FUNCTION_NAMES,
  MATH_CHARS,
  SUPERSCRIPT_CHARS,
  fontPositionToUnicode,
  styledLetter,
} from '../src/services/import/mtef/chars';

const FIXTURES = resolve(__dirname, 'fixtures/mathtype');

const norm = (s: string | null) => (s === null ? null : s.replace(/\s+/g, ' ').trim());

/** KaTeX must accept the output. Only missing glyph metrics (e.g. Vietnamese letters in \text) are tolerated. */
function expectKatexRenders(latex: string) {
  expect(() =>
    katex.renderToString(latex, {
      throwOnError: true,
      strict: (code: string) => (code === 'unknownSymbol' ? 'ignore' : 'error'),
    }),
  ).not.toThrow();
  expect(() => katex.renderToString(latex, { throwOnError: true, displayMode: true })).not.toThrow();
}

function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(FIXTURES, name)));
}

// ---------------------------------------------------------------------------
// Real OLE fixtures
// ---------------------------------------------------------------------------

const EXPECTED: Record<string, string> = {
  // zhexiao/mtef-go (README: \frac { -b±\sqrt[] { b ^ { 2 } -4ac } } { 2a })
  'mtefgo-oleObject1.bin': '\\frac{-b\\pm\\sqrt{b^{2}-4ac}}{2a}',
  'mtefgo-oleObject2.bin': '\\oiiint_{222}{11}',
  // jure/mathtype_to_mathml
  'm2m-equation1.bin': 'p_{r}=\\frac{m}{r}\\sum\\limits_{i=0}^{r-1}{\\frac{pi}{r-i+1}}',
  'm2m-equation4.bin': '\\sqrt[3]{27}',
  'm2m-equation13.bin':
    '(a+b)^{c}+[d+f]^{4}+{}_{b}^{a}c+{}_{e}^{d}f+\\left( g-h \\right)^{i}+j_{k}+{}_{l}m+{}^{n}o+p^{r}',
  'm2m-equation14.bin':
    '\\cos^{-1}\\theta\\left( \\frac{\\pi}{2}-\\theta \\right)e^{i\\theta}\\arcsin\\theta\\mathfrak{M}\\infty\\mathbb{Z}\\mathfrak{A}\\Theta\\text{ƛ}\\frac{\\partial^{2}\\Omega}{\\partial u\\partial v}\\left[ 0,1 \\right]\\oiint\\limits_{d}{c}\\int\\limits_{v}^{d}{a}',
  'm2m-equation3.bin':
    '\\sum\\limits_{b=4}^{i=3}{t\\bigcap\\limits_{i=1}^{n}{X_{i}}\\left\\{ \\left[ \\left( \\pm\\ne\\le\\partial\\to\\to\\theta\\pi\\left\\langle d \\middle| b \\right\\rangle \\right) \\right] \\right\\}}\\left( \\begin{array}{lll}a_{11} & \\ldots & a_{1n} \\\\ \\vdots & \\ddots & \\vdots \\\\ a_{m1} & \\cdots & a_{mn}\\end{array} \\right)\\left( \\begin{array}{lll}a_{11} & a_{12} & a_{13} \\\\ a_{21} & a_{22} & a_{23} \\\\ a_{31} & a_{32} & a_{33}\\end{array} \\right)\\left( \\begin{array}{lll}a_{1} & 1 & 0 \\\\ 4 & \\ddots & 2 \\\\ 0 & 3 & a_{n}\\end{array} \\right)',
  'm2m-sums.bin': '\\sum{a+\\sum\\limits_{b}{a}}+\\sum\\limits_{c}^{a}{b}+\\sum_{b}{a}+\\sum_{c}^{a}{b}',
  'm2m-629.bin':
    'P_{x}=r\\frac{\\sum\\limits_{y=1:N}{Y_{y}}}{N}-Y_{x}=\\left\\{ \\begin{array}{l}r\\frac{\\sum\\limits_{s_{y}=C}{Y_{y}}}{N}-Y_{x}\\text{ if }s_{x}=C \\\\ r\\frac{\\sum\\limits_{s_{y}=C}{Y_{y}}}{N}\\text{ if }s_{x}=D\\end{array} \\right.',
  'm2m-281.bin':
    "\\begin{array}{l}\\dot{Q}_{prod}^{'''}=\\text{ rate of internal heat generation per unit volume }\\left[ \\frac{W}{m^{3}} \\right] \\\\ \\lambda\\ =\\text{ dung heat conductivity }\\left[ \\frac{W}{m\\cdot K} \\right] \\\\ r\\ =\\text{ radius }\\left[ m \\right] \\\\ L\\ =\\text{ dung hill length }\\left[ m \\right] \\\\ T\\ =\\text{ temperature }\\left[ {}^{\\circ}C \\right]\\end{array}",
  'm2m-fences.bin':
    '\\begin{array}{l}\\left( a \\right)+\\left[ b \\right]+\\left\\{ c \\right\\}+\\left\\langle d \\right\\rangle+\\left| e \\right|+\\left\\| f \\right\\|+\\left\\lfloor g \\right\\rfloor+ \\\\ \\left\\lceil h \\right\\rceil+\\left[ i \\right)+\\left( j \\right]+\\left| k \\right\\rangle+\\left\\langle l \\right|+\\left[ m \\right[+\\left] n \\right]+ \\\\ \\left] o \\right[+\\llbracket p \\rrbracket+\\left( r \\right.+\\left. s \\right)+\\left[ t \\right.+\\left. u \\right]+\\left\\{ v+\\left. x \\right\\} \\right.+ \\\\ \\left\\langle y \\right.+\\left. z \\right\\rangle+\\left| a \\right.+\\left. b \\right|+\\left\\| a \\right.+\\left. b \\right\\|+\\llbracket a+b \\rrbracket+\\left\\langle a \\middle| b \\right\\rangle+ \\\\ \\overbrace{a}^{b}+\\underbrace{b}_{c}+\\overbracket{a}^{b}+\\underbracket{a}_{b}\\end{array}',
  'm2m-embellishments_roots_long_divisions.bin':
    '\\begin{array}{l}\\widetilde{a+b}+\\widehat{c+d}+\\overset{\\frown}{d+f}+\\overline{e+f}+\\overline{x+y}+ \\\\ \\overline{\\overline{y+t}}+\\underline{l+m}+\\underline{\\underline{k+e}}+\\overrightarrow{kc+3}+\\overleftarrow{a+b}+ \\\\ \\overrightharpoon{y+x}+\\overleftrightarrow{k-4}+\\underrightarrow{c-d}+\\underleftarrow{d+e}+\\underrightarrow{e+f}+ \\\\ \\underleftrightarrow{c+e}+\\text{\\sout{$d+f$}}+\\xcancel{x+z}+\\cancel{e+x}+\\bcancel{y+z} \\\\ \\sqrt{2}+\\sqrt[3]{9}+\\overline{)\\,d+3}+\\begin{array}{r}d+3 \\\\ \\overline{)\\,xy}\\end{array}\\end{array}',
  // jure/mathtype — MTEF v3 (Equation Editor 3.0)
  'mt3-lim_embell.bin':
    'A=\\lim_{\\substack{n\\to\\infty \\\\ \\Delta x_{k}\\to 0}}\\sum\\limits_{k=1}^{n}{f(\\tilde{x}_{k})\\Delta x_{k}}',
  'mt3-sqrt.bin': '\\sigma_{t}=\\sqrt{\\sigma_{R}^{2}+\\sigma_{P}^{2}}',
  'mt3-matrix_2x1.bin':
    '\\omega_{rs}^{*}=\\left\\{ \\begin{array}{l}1\\;\\;if\\;regions\\;r\\;and\\;s\\;share\\;a\\;common\\;boundary\\;(edge) \\\\ 0\\;otherwise\\end{array} \\right.',
  // jure/mathtype — MTEF v5 edge cases (matrix partition lines, MT comment / future records)
  'mt5-matrix-border.bin': '\\begin{array}{|l:}\\hline 1 \\\\ \\hdashline 2 \\\\ \\hline 3\\end{array}',
  'mt5-long_uint_comment.bin':
    'E_{\\text{eq}}=E^{\\varnothing}(\\text{I})-E^{\\varnothing}(\\text{II})+\\frac{RT}{z_{\\text{r}}F}\\ln a_{\\text{M}(\\text{I})}^{\\nu(\\text{I})_{+}}-\\frac{RT}{z_{\\text{r}}F}\\ln a_{\\text{M}(\\text{II})}^{\\nu(\\text{II})_{+}}',
};

describe('mathTypeOleToLatex — real OLE fixtures', () => {
  const files = readdirSync(FIXTURES).filter((f) => f.endsWith('.bin'));

  it('has fixtures to test', () => {
    expect(files.length).toBeGreaterThanOrEqual(20);
  });

  for (const [name, expected] of Object.entries(EXPECTED)) {
    it(`converts ${name}`, () => {
      expect(norm(mathTypeOleToLatex(fixture(name)))).toBe(norm(expected));
    });
  }

  for (const name of files) {
    it(`${name} produces KaTeX-renderable LaTeX`, () => {
      const latex = mathTypeOleToLatex(fixture(name));
      expect(latex).toBeTypeOf('string');
      expect(latex!.length).toBeGreaterThan(0);
      expect(latex).not.toMatch(/ {2}/); // no stray double spaces
      expect(latex).not.toMatch(/\\sqrt\[\]/); // no empty radical index
      expect(latex).not.toMatch(/[±≤≥≠×÷∞→∈]/); // common symbols are mapped to commands
      expectKatexRenders(latex!);
    });
  }

  it('mtefToLatex accepts the raw MTEF payload and the full Equation Native stream', () => {
    const stream = readEquationNativeStream(fixture('mtefgo-oleObject1.bin'))!;
    expect(stream).not.toBeNull();
    const mtef = stripEqnOleHeader(stream)!;
    expect(mtef[0]).toBe(5);
    expect(mtefToLatex(mtef)).toBe('\\frac{-b\\pm\\sqrt{b^{2}-4ac}}{2a}');
    expect(mtefToLatex(stream)).toBe('\\frac{-b\\pm\\sqrt{b^{2}-4ac}}{2a}');
  });

  it('accepts an ArrayBuffer or a Uint8Array view into a larger buffer', () => {
    const bytes = fixture('mtefgo-oleObject1.bin');
    const expected = '\\frac{-b\\pm\\sqrt{b^{2}-4ac}}{2a}';
    expect(mathTypeOleToLatex(bytes.slice().buffer as unknown as Uint8Array)).toBe(expected);
    const padded = new Uint8Array(bytes.length + 16);
    padded.set(bytes, 8);
    expect(mathTypeOleToLatex(padded.subarray(8, 8 + bytes.length))).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// Synthetic MTEF v5 builder (Vietnamese exam constructs)
// ---------------------------------------------------------------------------

const TF = { TEXT: 1, FUNC: 2, VAR: 3, LCGREEK: 4, UCGREEK: 5, SYM: 6, VEC: 7, NUM: 8, EXTRA: 11, EXPAND: 22, SPACE: 24 };
type Bytes = number[];

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const header = (): Bytes => [5, 1, 0, 7, 0, ...ascii('DSMT7'), 0, 0];

function char(ch: string | number, tf: number = TF.VAR, embells: number[] = []): Bytes {
  const code = typeof ch === 'number' ? ch : ch.codePointAt(0)!;
  const out = [2, embells.length ? 1 : 0, tf + 128, code & 0xff, code >> 8];
  if (embells.length) {
    for (const e of embells) out.push(6, 0, e);
    out.push(0);
  }
  return out;
}
/** Characters with MathType's automatic styles: digits → number, letters → variable, rest → symbol. */
function math(s: string): Bytes {
  return [...s].flatMap((c) => char(c, /[0-9]/.test(c) ? TF.NUM : /\p{L}/u.test(c) ? TF.VAR : TF.SYM));
}
const text = (s: string) => [...s].flatMap((c) => char(c, TF.TEXT));
const func = (s: string) => [...s].flatMap((c, i) => {
  const b = char(c, TF.FUNC);
  if (i === 0) b[1] |= 0x02; // mtefOPT_CHAR_FUNC_START
  return b;
});
const line = (...items: Bytes[]): Bytes => [1, 0, ...items.flat(), 0];
const nullLine = (): Bytes => [1, 1];
function tmpl(sel: number, variation: number, ...items: Bytes[]): Bytes {
  const v = variation < 0x80 ? [variation] : [(variation & 0x7f) | 0x80, variation >> 8];
  return [3, 0, sel, ...v, 0, ...items.flat(), 0];
}
const pile = (halign: number, ...lines: Bytes[]): Bytes => [4, 0, halign, 1, ...lines.flat(), 0];
function matrix(rows: number, cols: number, ...cells: Bytes[]): Bytes {
  const parts = (n: number) => new Array((n + 4) >> 2).fill(0);
  return [5, 0, 0, 2, 0, rows, cols, ...parts(rows), ...parts(cols), ...cells.flat(), 0];
}
const eq = (...items: Bytes[]) => Uint8Array.from([...header(), ...items.flat(), 0]);
const sup = (...items: Bytes[]) => tmpl(28, 0, nullLine(), line(...items));
const sub = (...items: Bytes[]) => tmpl(27, 0, line(...items), nullLine());
const frac = (num: Bytes, den: Bytes) => tmpl(11, 0, line(num), line(den));

const SYNTHETIC: Array<[string, Uint8Array, string]> = [
  ['vector over AB (tmVEC)', eq(line(tmpl(31, 0x2, line(math('AB')), char(0x20d7, TF.EXTRA)))), '\\overrightarrow{AB}'],
  [
    'system of equations (left brace + pile)',
    eq(line(tmpl(2, 0x1, line(pile(1, line(math('x+y=3')), line(math('2x-y=0')))), char('{', TF.EXPAND)))),
    '\\left\\{ \\begin{array}{l}x+y=3 \\\\ 2x-y=0\\end{array} \\right.',
  ],
  [
    'half-open interval [1;2)',
    eq(line(math('x'), char(0x2208, TF.SYM), tmpl(9, 0x12, line(math('1;2')), char('[', TF.EXPAND), char(')', TF.EXPAND)))),
    'x\\in\\left[ 1;2 \\right)',
  ],
  [
    'interval (-∞;3]',
    eq(line(tmpl(9, 0x30, line(char(0x2212, TF.SYM), char(0x221e, TF.SYM), math(';3')), char('(', TF.EXPAND), char(']', TF.EXPAND)))),
    '\\left( -\\infty;3 \\right]',
  ],
  [
    'angle in degrees (hat template + superscript 0)',
    eq(line(tmpl(33, 0, line(math('ABC')), char(0x5e, TF.EXTRA)), math('=60'), sup(math('0')))),
    '\\widehat{ABC}=60^{0}',
  ],
  ['degree sign', eq(line(math('60'), char(0xb0, TF.SYM))), '60^{\\circ}'],
  [
    'definite integral',
    eq(line(tmpl(15, 0x31, line(math('f'), char('(', TF.FUNC), math('x'), char(')', TF.FUNC), math('dx')), line(math('0')), line(math('1')), char(0x222b, TF.SYM)))),
    '\\int_{0}^{1}{f(x)dx}',
  ],
  [
    'limit (tmLIM with function-style lim)',
    eq(line(tmpl(23, 0x10, line(func('lim')), line(math('x'), char(0x2192, TF.SYM), math('0')), nullLine()), frac([...func('sin'), ...math('x')], math('x')), math('=1'))),
    '\\lim_{x\\to 0}\\frac{\\sin x}{x}=1',
  ],
  [
    'limit to infinity via subscript',
    eq(line(func('lim'), sub(math('x'), char(0x2192, TF.SYM), char(0x2b, TF.SYM), char(0x221e, TF.SYM)), math('f'), char('(', TF.FUNC), math('x'), char(')', TF.FUNC))),
    '\\lim_{x\\to+\\infty}f(x)',
  ],
  ['logarithm with base', eq(line(func('log'), sub(math('2')), math('x'))), '\\log_{2}x'],
  [
    'trig identity with function-style names',
    eq(line(func('sin'), sup(math('2')), math('x+'), func('cos'), sup(math('2')), math('x=1'))),
    '\\sin^{2}x+\\cos^{2}x=1',
  ],
  ['tan / cot / ln', eq(line(func('tan'), math('x'), char(0x22c5, TF.SYM), func('cot'), math('x'), math('+'), func('ln'), math('e'))), '\\tan x\\cdot\\cot x+\\ln e'],
  [
    'Vietnamese text (text style)',
    eq(line(math('x=1'), text(' hoặc '), math('x=2'))),
    'x=1\\text{ hoặc }x=2',
  ],
  ['Vietnamese word typed in math style', eq(line(math('Đường'), char(0x3d, TF.SYM), math('x'))), '\\text{Đường}=x'],
  [
    'explicit-font Vietnamese phrase with spaces',
    eq(line(math('x'), [...' thỏa mãn'].flatMap((c) => char(c, -2)))),
    'x\\text{ thỏa mãn}',
  ],
  ['set of reals (Unicode ℝ)', eq(line(math('x'), char(0x2208, TF.SYM), char(0x211d, TF.SYM))), 'x\\in\\mathbb{R}'],
  ['set of reals (MathType private-use ℝ)', eq(line(math('x'), char(0x2208, TF.SYM), char(0xf091, TF.EXTRA))), 'x\\in\\mathbb{R}'],
  ['prime embellishment', eq(line(char('f', TF.VAR, [5]), char('(', TF.FUNC), math('x'), char(')', TF.FUNC))), "f'(x)"],
  ['relations', eq(line(math('a'), char(0x2264, TF.SYM), math('b'), char(0x2265, TF.SYM), math('c'), char(0x2260, TF.SYM), math('d'))), 'a\\le b\\ge c\\ne d'],
  ['× ÷ ± ∞', eq(line(math('2'), char(0xd7, TF.SYM), math('3'), char(0xf7, TF.SYM), math('4'), char(0xb1, TF.SYM), char(0x221e, TF.SYM))), '2\\times 3\\div 4\\pm\\infty'],
  ['parallel / perpendicular', eq(line(math('AB'), char(0x2225, TF.SYM), math('CD'), math(','), math('AB'), char(0x22a5, TF.SYM), math('CD'))), 'AB\\parallel CD,AB\\perp CD'],
  ['Greek letters', eq(line(char(0x3b1, TF.LCGREEK), char(0x2b, TF.SYM), char(0x3b2, TF.LCGREEK), char(0x3d, TF.SYM), char(0x3c0, TF.LCGREEK), char(0x2c, TF.SYM), char(0x394, TF.UCGREEK), char(0x3a9, TF.UCGREEK))), '\\alpha+\\beta=\\pi,\\Delta\\Omega'],
  ['absolute value', eq(line(tmpl(4, 3, line(math('x-1')), char('|', TF.EXPAND), char('|', TF.EXPAND)))), '\\left| x-1 \\right|'],
  ['nth root', eq(line(tmpl(10, 1, line(math('x+1')), line(math('3'))))), '\\sqrt[3]{x+1}'],
  ['square root (no empty index)', eq(line(tmpl(10, 0, line(math('x')), nullLine()))), '\\sqrt{x}'],
  ['slash fraction', eq(line(tmpl(11, 0x2, line(math('1')), line(math('2'))))), '1/2'],
  [
    'sum with limits',
    eq(line(tmpl(16, 0x70, line(math('k'), sup(math('2'))), line(math('k=1')), line(math('n')), char(0x2211, TF.SYM)))),
    '\\sum\\limits_{k=1}^{n}{k^{2}}',
  ],
  [
    'determinant (matrix inside bars)',
    eq(line(tmpl(4, 3, line(matrix(2, 2, line(math('1')), line(math('2')), line(math('3')), line(math('4')))), char('|', TF.EXPAND), char('|', TF.EXPAND)))),
    '\\left| \\begin{array}{cc}1 & 2 \\\\ 3 & 4\\end{array} \\right|',
  ],
  [
    'relational pile → aligned',
    eq(pile(4, line(math('x'), math('=1')), line(math('y+z'), math('=2')))),
    '\\begin{aligned}x&=1 \\\\ y+z&=2\\end{aligned}',
  ],
  ['double superscript is protected', eq(line(math('x'), sup(math('2')), sup(math('3')))), 'x^{2}{}^{3}'],
  ['script at start of line gets an empty base', eq(line(sup(math('2')), math('x'))), '{}^{2}x'],
  ['pre-script (tvSU_PRECEDES)', eq(line(tmpl(29, 1, line(math('6')), line(math('14'))), math('C'))), '{}_{6}^{14}C'],
  ['text escaping', eq(line(text('a_b{c}#'))), '\\text{a\\_b\\{c\\}\\#}'],
  ['digits / percent typed in text style stay math', eq(line(text('50%'))), '50\\%'],
  ['bold vector style', eq(line(char('v', TF.VEC), char(0x3d, TF.SYM), char(0x3b1, TF.VEC))), '\\mathbf{v}=\\boldsymbol{\\alpha}'],
  ['arc (cung AB)', eq(line(tmpl(34, 0, line(math('AB')), char(0x2322, TF.EXTRA)))), '\\overset{\\frown}{AB}'],
  ['overbar', eq(line(tmpl(13, 0, line(math('AB'))))), '\\overline{AB}'],
  [
    'MathType spaces between text words are merged',
    eq(line(text('khi'), char(0xef04, TF.SPACE), text('và'), char(0xef05, TF.SPACE), math('x'))),
    '\\text{khi và}\\quad x',
  ],
  [
    'leading / trailing MathType spaces are dropped',
    eq(line(char(0xef05, TF.SPACE), math('x'), char(0xef04, TF.SPACE), text('  '))),
    'x',
  ],
  [
    'no MTCode: Symbol-font position fallback',
    Uint8Array.from([...header(), ...line([2, 0x24, TF.LCGREEK + 128, 0x61]), 0]),
    '\\alpha',
  ],
];

describe('mtefToLatex — synthetic MTEF v5 (Vietnamese exam constructs)', () => {
  for (const [label, bytes, expected] of SYNTHETIC) {
    it(label, () => {
      const latex = mtefToLatex(bytes);
      expect(norm(latex)).toBe(norm(expected));
      expectKatexRenders(latex!);
    });
  }
});

// ---------------------------------------------------------------------------
// Robustness
// ---------------------------------------------------------------------------

function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s;
  };
}

describe('robustness — never throws on malformed input', () => {
  it('rejects empty / non-OLE / tiny inputs', () => {
    expect(mathTypeOleToLatex(new Uint8Array(0))).toBeNull();
    expect(mathTypeOleToLatex(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(mathTypeOleToLatex(new TextEncoder().encode('not an ole file'.repeat(100)))).toBeNull();
    expect(mtefToLatex(new Uint8Array(0))).toBeNull();
    expect(mtefToLatex(new Uint8Array([4, 1, 0]))).toBeNull(); // unsupported MTEF version
    expect(mathTypeOleToLatex(undefined as unknown as Uint8Array)).toBeNull();
    expect(mtefToLatex(null as unknown as Uint8Array)).toBeNull();
  });

  it('handles every truncation of every fixture payload', () => {
    for (const name of readdirSync(FIXTURES).filter((f) => f.endsWith('.bin'))) {
      const mtef = stripEqnOleHeader(readEquationNativeStream(fixture(name))!)!;
      for (let n = 0; n < mtef.length; n++) {
        const out = mtefToLatex(mtef.subarray(0, n));
        expect(out === null || typeof out === 'string').toBe(true);
      }
    }
  });

  it('handles random byte corruption of MTEF payloads', () => {
    const rand = prng(12345);
    for (const name of ['mtefgo-oleObject1.bin', 'm2m-equation3.bin', 'mt3-lim_embell.bin', 'm2m-fences.bin']) {
      const mtef = stripEqnOleHeader(readEquationNativeStream(fixture(name))!)!;
      for (let k = 0; k < 300; k++) {
        const copy = Uint8Array.from(mtef);
        const flips = 1 + (rand() % 4);
        for (let f = 0; f < flips; f++) copy[6 + (rand() % (copy.length - 6))] = rand() & 0xff;
        const out = mtefToLatex(copy);
        expect(out === null || typeof out === 'string').toBe(true);
      }
    }
  });

  it('handles random garbage and corrupted OLE containers', () => {
    const rand = prng(99);
    for (let k = 0; k < 200; k++) {
      const len = 1 + (rand() % 600);
      const buf = new Uint8Array(len);
      for (let i = 0; i < len; i++) buf[i] = rand() & 0xff;
      buf[0] = [2, 3, 5][k % 3];
      expect(() => mtefToLatex(buf)).not.toThrow();
    }
    const ole = fixture('m2m-equation1.bin');
    for (let k = 0; k < 100; k++) {
      const copy = Uint8Array.from(ole);
      for (let f = 0; f < 8; f++) copy[rand() % copy.length] = rand() & 0xff;
      expect(() => mathTypeOleToLatex(copy)).not.toThrow();
    }
    expect(mathTypeOleToLatex(ole.subarray(0, 700))).toBeNull();
  });

  it('returns null for an empty equation', () => {
    expect(mtefToLatex(eq(line()))).toBeNull();
    expect(mtefToLatex(eq(nullLine()))).toBeNull();
  });

  it('caps nesting depth instead of overflowing the stack', () => {
    const depth = 5000;
    const open: number[] = [];
    for (let i = 0; i < depth; i++) open.push(3, 0, 11, 0, 0, 1, 0); // TMPL(frac) + LINE
    const close: number[] = [];
    for (let i = 0; i < depth; i++) close.push(0, 1, 1, 0); // END line, null denominator, END tmpl
    const bytes = Uint8Array.from([...header(), 1, 0, ...open, ...math('x'), ...close, 0, 0]);
    expect(mtefToLatex(bytes)).toBeNull();
  });

  it('still converts moderately deep equations', () => {
    let inner = line(math('x'));
    for (let i = 0; i < 20; i++) inner = line(tmpl(10, 0, inner, nullLine()));
    const latex = mtefToLatex(Uint8Array.from([...header(), ...inner, 0]));
    expect(latex).toBe(`${'\\sqrt{'.repeat(20)}x${'}'.repeat(20)}`);
  });
});

// ---------------------------------------------------------------------------
// Character tables
// ---------------------------------------------------------------------------

describe('character tables', () => {
  it('font-position fallback tables are complete', () => {
    expect(fontPositionToUnicode(0x20, true)).toBe(0x20);
    expect(fontPositionToUnicode(0x61, true)).toBe(0x3b1); // alpha
    expect(fontPositionToUnicode(0x7e, true)).toBe(0x223c); // similar
    expect(fontPositionToUnicode(0xa3, true)).toBe(0x2264); // less-or-equal
    expect(fontPositionToUnicode(0xfe, true)).toBe(0x23ad);
    expect(fontPositionToUnicode(0x9f, false)).toBe(0x178);
    expect(fontPositionToUnicode(0x41, false)).toBe(0x41);
  });

  it('every mapped character renders in KaTeX', () => {
    const bad: string[] = [];
    const check = (tex: string, label: string) => {
      try {
        katex.renderToString(`x ${tex} y`, {
          throwOnError: true,
          strict: (code: string) => (code === 'unknownSymbol' ? 'ignore' : 'error'),
        });
      } catch (e) {
        bad.push(`${label}: ${tex} (${(e as Error).message})`);
      }
    };
    for (const [code, tex] of Object.entries(MATH_CHARS)) check(tex, Number(code).toString(16));
    for (const [code, tex] of Object.entries(SUPERSCRIPT_CHARS)) check(`^{${tex}}`, Number(code).toString(16));
    for (const tex of Object.values(FUNCTION_NAMES)) check(tex, 'fn');
    for (let code = 0xf000; code <= 0xf133; code++) {
      const tex = styledLetter(code);
      if (tex) check(tex, code.toString(16));
    }
    expect(bad).toEqual([]);
  });
});
