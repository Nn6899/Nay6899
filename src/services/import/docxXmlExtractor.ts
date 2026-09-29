/**
 * DOCX XML Extractor with MathType & OMML to LaTeX Conversion
 *
 * Unpacks the .docx file (OpenXML ZIP archive) using JSZip, reads word/document.xml and converts:
 *  - MathType equations (OLE objects Equation.DSMT4/6/7, Equation.3 -> word/embeddings/oleObjectN.bin) -> LaTeX
 *  - Office Math (<m:oMath>, <m:oMathPara>) and MathML (<math>) -> LaTeX ($...$, $$...$$)
 *  - Word auto-numbering ("Câu %1." / "A." / "a)") -> real text, so the question splitter can see it
 *  - Underlined / red / highlighted option letters (common way to mark the correct answer) -> "*" marker
 *  - Embedded images (figures, graphs) -> [[IMG:n]] placeholders + data URIs
 */

import JSZip from 'jszip';
import {
  convertOmmlToLatex,
  convertMathMlToLatex,
  extractMathTypeLatexFromText,
  replaceUnicodeMathSymbolsOutsideMath,
} from './mathtypeConverter';
import { mathTypeOleToLatex } from './mtef';

export interface DocxExtractionResult {
  text: string;
  mathFormulaCount: number;
  hasOmml: boolean;
  hasMathMl: boolean;
  /** Số công thức MathType (OLE) đã chuyển được sang LaTeX */
  mathTypeConverted: number;
  /** Số công thức MathType không đọc được (sẽ hiện [công thức] để giáo viên sửa) */
  mathTypeFailed: number;
  /** Ảnh nhúng trong đề, tham chiếu bằng [[IMG:n]] trong text */
  images: string[];
  /** Số ảnh bị bỏ qua (định dạng WMF/EMF trình duyệt không hiển thị được) */
  skippedImages: number;
}

export const MATH_PLACEHOLDER = '[công thức]';
const IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};
// Firestore giới hạn 1MB mỗi câu hỏi -> bỏ qua ảnh quá lớn
const MAX_IMAGE_BYTES = 350 * 1024;

type Rels = Map<string, string>;

function parseRels(xml: string | null): Rels {
  const rels: Rels = new Map();
  if (!xml) return rels;
  for (const m of xml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = m[0].match(/\bId="([^"]+)"/)?.[1];
    const target = m[0].match(/\bTarget="([^"]+)"/)?.[1];
    if (id && target) rels.set(id, target);
  }
  return rels;
}

function resolveTarget(target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = ('word/' + target).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p !== '.') out.push(p);
  }
  return out.join('/');
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// ---------------------------------------------------------------------------
// Numbering (Word tự đánh số "Câu 1.", "A.", "a)")
// ---------------------------------------------------------------------------

interface LevelDef {
  fmt: string;
  text: string;
  start: number;
}

interface NumberingInfo {
  levels: Map<string, Map<number, LevelDef>>; // numId -> ilvl -> def
  styleNum: Map<string, { numId: string; ilvl: number }>;
}

function parseNumbering(numberingXml: string | null, stylesXml: string | null): NumberingInfo {
  const abstract = new Map<string, Map<number, LevelDef>>();
  const levels = new Map<string, Map<number, LevelDef>>();
  const styleNum = new Map<string, { numId: string; ilvl: number }>();

  if (numberingXml) {
    for (const a of numberingXml.matchAll(/<w:abstractNum\b[^>]*w:abstractNumId="(\d+)"[^>]*>([\s\S]*?)<\/w:abstractNum>/g)) {
      const lvls = new Map<number, LevelDef>();
      for (const l of a[2].matchAll(/<w:lvl\b[^>]*w:ilvl="(\d+)"[^>]*>([\s\S]*?)<\/w:lvl>/g)) {
        lvls.set(Number(l[1]), {
          fmt: l[2].match(/<w:numFmt\b[^>]*w:val="([^"]+)"/)?.[1] || 'decimal',
          text: l[2].match(/<w:lvlText\b[^>]*w:val="([^"]*)"/)?.[1] ?? '',
          start: Number(l[2].match(/<w:start\b[^>]*w:val="(\d+)"/)?.[1] || 1),
        });
      }
      abstract.set(a[1], lvls);
    }
    for (const n of numberingXml.matchAll(/<w:num\b[^>]*w:numId="(\d+)"[^>]*>([\s\S]*?)<\/w:num>/g)) {
      const absId = n[2].match(/<w:abstractNumId\b[^>]*w:val="(\d+)"/)?.[1];
      const base = absId ? abstract.get(absId) : undefined;
      if (!base) continue;
      const lvls = new Map<number, LevelDef>();
      base.forEach((v, k) => lvls.set(k, { ...v }));
      for (const o of n[2].matchAll(/<w:lvlOverride\b[^>]*w:ilvl="(\d+)"[^>]*>([\s\S]*?)<\/w:lvlOverride>/g)) {
        const so = o[2].match(/<w:startOverride\b[^>]*w:val="(\d+)"/)?.[1];
        const def = lvls.get(Number(o[1]));
        if (so && def) def.start = Number(so);
      }
      levels.set(n[1], lvls);
    }
  }

  if (stylesXml) {
    for (const st of stylesXml.matchAll(/<w:style\b[^>]*w:styleId="([^"]+)"[^>]*>([\s\S]*?)<\/w:style>/g)) {
      const numId = st[2].match(/<w:numId\b[^>]*w:val="(\d+)"/)?.[1];
      if (numId) {
        styleNum.set(st[1], { numId, ilvl: Number(st[2].match(/<w:ilvl\b[^>]*w:val="(\d+)"/)?.[1] || 0) });
      }
    }
  }

  return { levels, styleNum };
}

function toRoman(n: number): string {
  const map: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
  return out;
}

function formatNumber(n: number, fmt: string): string {
  switch (fmt) {
    case 'upperLetter': return String.fromCharCode(64 + (((n - 1) % 26) + 1));
    case 'lowerLetter': return String.fromCharCode(96 + (((n - 1) % 26) + 1));
    case 'upperRoman': return toRoman(n);
    case 'lowerRoman': return toRoman(n).toLowerCase();
    default: return String(n);
  }
}

class NumberingCounter {
  private counters = new Map<string, number[]>();
  constructor(private info: NumberingInfo) {}

  label(pXml: string): string {
    const pPr = pXml.match(/<w:pPr>([\s\S]*?)<\/w:pPr>/)?.[1] || '';
    let numId = pPr.match(/<w:numId\b[^>]*w:val="(\d+)"/)?.[1];
    let ilvl = Number(pPr.match(/<w:ilvl\b[^>]*w:val="(\d+)"/)?.[1] || 0);
    if (!numId) {
      const styleId = pPr.match(/<w:pStyle\b[^>]*w:val="([^"]+)"/)?.[1];
      const fromStyle = styleId ? this.info.styleNum.get(styleId) : undefined;
      if (!fromStyle) return '';
      numId = fromStyle.numId;
      if (!/<w:ilvl\b/.test(pPr)) ilvl = fromStyle.ilvl;
    }
    if (!numId || numId === '0') return '';
    const lvls = this.info.levels.get(numId);
    const def = lvls?.get(ilvl);
    if (!lvls || !def || def.fmt === 'bullet' || def.fmt === 'none') return '';

    const counts = this.counters.get(numId) || [];
    for (let i = 0; i < ilvl; i++) if (counts[i] === undefined) counts[i] = (lvls.get(i)?.start ?? 1);
    counts[ilvl] = counts[ilvl] === undefined ? def.start : counts[ilvl] + 1;
    counts.length = ilvl + 1; // reset deeper levels
    this.counters.set(numId, counts);

    return def.text.replace(/%(\d)/g, (_, d) => {
      const lvl = Number(d) - 1;
      return formatNumber(counts[lvl] ?? 1, lvls.get(lvl)?.fmt || 'decimal');
    });
  }
}

// ---------------------------------------------------------------------------

/**
 * Extracts full text from DOCX ArrayBuffer with high-fidelity formula conversion
 */
export async function extractDocxTextWithLatex(buffer: ArrayBuffer): Promise<DocxExtractionResult | null> {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const docFile = zip.file('word/document.xml');
    if (!docFile) return null;

    const xml = await docFile.async('text');
    const rels = parseRels(await zip.file('word/_rels/document.xml.rels')?.async('text') ?? null);
    const numbering = parseNumbering(
      (await zip.file('word/numbering.xml')?.async('text')) ?? null,
      (await zip.file('word/styles.xml')?.async('text')) ?? null
    );

    let mathFormulaCount = 0;
    let mathTypeConverted = 0;
    let mathTypeFailed = 0;
    let skippedImages = 0;
    const images: string[] = [];
    const hasOmml = xml.includes('<m:oMath');
    const hasMathMl = xml.includes('<math') || xml.includes('«math');

    // Step 0: Bỏ nhánh Fallback của AlternateContent (tránh lặp chữ/ảnh 2 lần)
    let processedXml = xml.replace(/<mc:Fallback\b[\s\S]*?<\/mc:Fallback>/g, '');

    // Step 1: MathType / Equation Editor OLE objects -> LaTeX
    const objectMatches = Array.from(processedXml.matchAll(/<w:object\b[\s\S]*?<\/w:object>/g));
    const objectLatex = new Map<string, string>();
    for (const m of objectMatches) {
      const obj = m[0];
      const ole = obj.match(/<o:OLEObject\b[^>]*>/)?.[0] || '';
      const progId = ole.match(/ProgID="([^"]+)"/)?.[1] || '';
      if (!/^Equation\./i.test(progId)) continue;
      const rid = ole.match(/r:id="([^"]+)"/)?.[1];
      const target = rid ? rels.get(rid) : undefined;
      let latex: string | null = null;
      if (target) {
        const bin = await zip.file(resolveTarget(target))?.async('uint8array');
        if (bin) latex = mathTypeOleToLatex(bin);
      }
      if (latex && latex.trim()) {
        mathTypeConverted++;
        objectLatex.set(obj, ` $${latex.trim()}$ `);
      } else {
        mathTypeFailed++;
        objectLatex.set(obj, ` ${MATH_PLACEHOLDER} `);
      }
    }
    if (objectLatex.size > 0) {
      processedXml = processedXml.replace(/<w:object\b[\s\S]*?<\/w:object>/g, obj =>
        objectLatex.has(obj) ? `<w:t xml:space="preserve">${escapeXml(objectLatex.get(obj)!)}</w:t>` : obj
      );
    }

    // Step 2: Block math equations: <m:oMathPara>...</m:oMathPara>
    processedXml = processedXml.replace(/<m:oMathPara\b[^>]*>([\s\S]*?)<\/m:oMathPara>/g, (_, inner) => {
      mathFormulaCount++;
      const latex = convertOmmlToLatex(inner);
      return `<w:r><w:t xml:space="preserve"> $$${escapeXml(latex)}$$ </w:t></w:r>`;
    });

    // Step 3: Inline math equations: <m:oMath>...</m:oMath>
    processedXml = processedXml.replace(/<m:oMath\b[^>]*>[\s\S]*?<\/m:oMath>/g, match => {
      mathFormulaCount++;
      const latex = convertOmmlToLatex(match);
      return `<w:r><w:t xml:space="preserve"> $${escapeXml(latex)}$ </w:t></w:r>`;
    });

    // Step 4: MathML: <math>...</math>
    processedXml = processedXml.replace(/<math\b[^>]*>([\s\S]*?)<\/math>/g, (_, inner) => {
      mathFormulaCount++;
      const latex = convertMathMlToLatex(inner);
      return `<w:r><w:t xml:space="preserve"> $${escapeXml(latex)}$ </w:t></w:r>`;
    });

    // Step 5: Images (<w:drawing> / <w:pict>) -> [[IMG:n]]
    const imageCache = new Map<string, number>();
    const imageTokens = new Map<string, string>();
    for (const m of processedXml.matchAll(/<w:drawing\b[\s\S]*?<\/w:drawing>|<w:pict\b[\s\S]*?<\/w:pict>/g)) {
      const block = m[0];
      const rid = block.match(/<a:blip\b[^>]*r:embed="([^"]+)"/)?.[1] || block.match(/<v:imagedata\b[^>]*r:id="([^"]+)"/)?.[1];
      const target = rid ? rels.get(rid) : undefined;
      if (!target || imageTokens.has(block)) continue;
      const path = resolveTarget(target);
      const ext = path.split('.').pop()?.toLowerCase() || '';
      const mime = IMAGE_MIME[ext];
      if (!mime) {
        skippedImages++;
        imageTokens.set(block, ' [HÌNH] ');
        continue;
      }
      let idx = imageCache.get(path);
      if (idx === undefined) {
        const bytes = await zip.file(path)?.async('uint8array');
        if (!bytes || bytes.length > MAX_IMAGE_BYTES) {
          skippedImages++;
          imageTokens.set(block, ' [HÌNH] ');
          continue;
        }
        idx = images.length;
        images.push(`data:${mime};base64,${toBase64(bytes)}`);
        imageCache.set(path, idx);
      }
      imageTokens.set(block, ` [[IMG:${idx}]] `);
    }
    if (imageTokens.size > 0) {
      processedXml = processedXml.replace(/<w:drawing\b[\s\S]*?<\/w:drawing>|<w:pict\b[\s\S]*?<\/w:pict>/g, block =>
        imageTokens.has(block) ? `<w:t xml:space="preserve">${imageTokens.get(block)}</w:t>` : ''
      );
    }

    // Step 6: Extract paragraphs <w:p>
    const counter = new NumberingCounter(numbering);
    const paragraphs: string[] = [];
    const pRegex = /<w:p(?:[\s>][\s\S]*?<\/w:p>|\/>)/g;
    let pMatch: RegExpExecArray | null;

    while ((pMatch = pRegex.exec(processedXml)) !== null) {
      const pXml = pMatch[0];
      const label = counter.label(pXml);
      const pText = extractParagraphText(pXml);
      paragraphs.push(label ? `${label} ${pText}`.trim() : pText);
    }

    let fullText = paragraphs.join('\n');

    // Step 7: Process any remaining MathType comments or symbols
    fullText = extractMathTypeLatexFromText(fullText);
    fullText = replaceUnicodeMathSymbolsOutsideMath(fullText);

    return {
      text: fullText,
      mathFormulaCount: mathFormulaCount + mathTypeConverted,
      hasOmml,
      hasMathMl,
      mathTypeConverted,
      mathTypeFailed,
      images,
      skippedImages,
    };
  } catch (err) {
    console.warn('extractDocxTextWithLatex encountered an issue, falling back to standard mammoth:', err);
    return null;
  }
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

interface RunInfo {
  text: string;
  marked: boolean;
}

function isRunMarked(rPr: string): boolean {
  const u = rPr.match(/<w:u\b[^>]*w:val="([^"]+)"/)?.[1] ?? (/<w:u\s*\/>/.test(rPr) ? 'single' : undefined);
  if (u && u !== 'none') return true;
  if (/<w:highlight\b[^>]*w:val="(?!none)[^"]+"/.test(rPr)) return true;
  if (/<w:shd\b[^>]*w:fill="(?!auto|FFFFFF|ffffff)[0-9A-Fa-f]{6}"/.test(rPr)) return true;
  const color = rPr.match(/<w:color\b[^>]*w:val="([0-9A-Fa-f]{6})"/)?.[1];
  if (color) {
    const r = parseInt(color.slice(0, 2), 16);
    const g = parseInt(color.slice(2, 4), 16);
    const b = parseInt(color.slice(4, 6), 16);
    if (r >= 0xb0 && g <= 0x60 && b <= 0x60) return true; // đỏ
  }
  return false;
}

/**
 * Extracts plain text + converted math runs from a single <w:p> XML element.
 * Nhãn phương án (A. / B. / a) ...) được gạch chân / tô đỏ / tô nền sẽ được đánh dấu "*" (đáp án đúng).
 */
function extractParagraphText(pXml: string): string {
  const runs: RunInfo[] = [];
  const tokenRegex = /<w:r\b[^>]*>([\s\S]*?)<\/w:r>|<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(pXml)) !== null) {
    if (match[1] !== undefined) {
      const runXml = match[1];
      const rPr = runXml.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/)?.[1] || '';
      let text = '';
      for (const t of runXml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:br\b[^>]*\/>|<w:cr\/>|<w:tab\/>/g)) {
        if (t[0].startsWith('<w:tab')) text += '    ';
        else if (t[0].startsWith('<w:t')) text += decodeXmlEntities(t[1] || '');
        else text += '\n';
      }
      runs.push({ text, marked: isRunMarked(rPr) });
    } else {
      // <w:t> đứng ngoài <w:r> (do bước thay công thức/ảnh chèn vào)
      runs.push({ text: decodeXmlEntities(match[2] || ''), marked: false });
    }
  }

  let line = '';
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    if (run.marked) {
      // Nhãn phương án nằm đầu run: "A." / "A" (dấu chấm ở run sau) / "a)"
      const lm = run.text.match(/^(\s*)([A-Da-d])([.)]?)/);
      const prevChar = line.slice(-1);
      const atBoundary = line.length === 0 || /\s/.test(prevChar);
      if (lm && atBoundary) {
        const hasPunct = Boolean(lm[3]);
        const nextStartsPunct = !hasPunct && /^[.)]/.test(runs[i + 1]?.text || '');
        if (hasPunct || nextStartsPunct || run.text.trim().length === 1) {
          line += `${lm[1]}*${run.text.slice(lm[1].length)}`;
          continue;
        }
      }
    }
    line += run.text;
  }

  return line.trim();
}

/**
 * Decodes XML entities
 */
function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');
}
