/**
 * MathType & Office Math (OMML) to LaTeX Converter
 * 
 * Pipeline:
 * Word / MathType Document -> Extract OMML (<m:oMath>) / MathML / MathType tags
 * -> Convert to clean, standardized LaTeX ($...$ or $$...$$)
 * -> Renderable by KaTeX / MathJax
 */

/**
 * Maps unicode mathematical characters and symbols to LaTeX equivalents
 */
const SYMBOL_MAP: Record<string, string> = {
  '±': '\\pm ',
  '∓': '\\mp ',
  '×': '\\times ',
  '÷': '\\div ',
  '·': '\\cdot ',
  '•': '\\cdot ',
  '≤': '\\le ',
  '≥': '\\ge ',
  '≠': '\\ne ',
  '≈': '\\approx ',
  '≡': '\\equiv ',
  '∈': '\\in ',
  '∉': '\\notin ',
  '⊂': '\\subset ',
  '⊃': '\\supset ',
  '⊆': '\\subseteq ',
  '⊇': '\\supseteq ',
  '∪': '\\cup ',
  '∩': '\\cap ',
  '∅': '\\emptyset ',
  '∞': '\\infty ',
  '→': '\\to ',
  '←': '\\leftarrow ',
  '⇒': '\\Rightarrow ',
  '⇐': '\\Leftarrow ',
  '⇔': '\\Leftrightarrow ',
  '∀': '\\forall ',
  '∃': '\\exists ',
  '∄': '\\nexists ',
  '∠': '\\angle ',
  '⊥': '\\perp ',
  '∥': '\\parallel ',
  '△': '\\triangle ',
  '√': '\\sqrt',
  '°': '^\\circ ',
  '…': '\\dots ',
  '⋯': '\\cdots ',
  '∂': '\\partial ',
  '∇': '\\nabla ',
  '∝': '\\propto ',
  '∫': '\\int ',
  '∬': '\\iint ',
  '∭': '\\iiint ',
  '∮': '\\oint ',
  '∑': '\\sum ',
  '∏': '\\prod ',

  // Greek lowercase
  'α': '\\alpha ',
  'β': '\\beta ',
  'γ': '\\gamma ',
  'δ': '\\delta ',
  'ε': '\\epsilon ',
  'ϵ': '\\varepsilon ',
  'ζ': '\\zeta ',
  'η': '\\eta ',
  'θ': '\\theta ',
  'ϑ': '\\vartheta ',
  'ι': '\\iota ',
  'κ': '\\kappa ',
  'λ': '\\lambda ',
  'μ': '\\mu ',
  'ν': '\\nu ',
  'ξ': '\\xi ',
  'π': '\\pi ',
  'ϖ': '\\varpi ',
  'ρ': '\\rho ',
  'ϱ': '\\varrho ',
  'σ': '\\sigma ',
  'ς': '\\varsigma ',
  'τ': '\\tau ',
  'υ': '\\upsilon ',
  'φ': '\\phi ',
  'ϕ': '\\varphi ',
  'χ': '\\chi ',
  'ψ': '\\psi ',
  'ω': '\\omega ',

  // Greek uppercase
  'Γ': '\\Gamma ',
  'Δ': '\\Delta ',
  'Θ': '\\Theta ',
  'Λ': '\\Lambda ',
  'Ξ': '\\Xi ',
  'Π': '\\Pi ',
  'Σ': '\\Sigma ',
  'Υ': '\\Upsilon ',
  'Φ': '\\Phi ',
  'Ψ': '\\Psi ',
  'Ω': '\\Omega ',

  // Common math sets
  'ℝ': '\\mathbb{R}',
  'ℕ': '\\mathbb{N}',
  'ℤ': '\\mathbb{Z}',
  'ℚ': '\\mathbb{Q}',
  'ℂ': '\\mathbb{C}',
};

/**
 * Replaces unicode math symbols with standard LaTeX representations
 */
export function replaceUnicodeMathSymbols(text: string): string {
  let result = text;
  for (const [sym, latex] of Object.entries(SYMBOL_MAP)) {
    if (result.includes(sym)) {
      result = result.split(sym).join(latex);
    }
  }
  return result;
}

/**
 * Converts OMML (Office Math Markup Language) XML string into standard LaTeX code.
 * Recursively parses nodes such as m:f (fraction), m:rad (root), m:sSup, m:sSub,
 * m:sSubSup, m:d (delimiter), m:nary (integrals/sums), m:m (matrices), etc.
 */
export function convertOmmlToLatex(ommlXml: string): string {
  if (!ommlXml || !ommlXml.trim()) return '';

  try {
    // Check if DOMParser is available (browser environment)
    if (typeof DOMParser !== 'undefined') {
      const parser = new DOMParser();
      // Wrap in single root with namespace to handle namespaces properly
      const wrappedXml = `<root xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">${ommlXml}</root>`;
      const doc = parser.parseFromString(wrappedXml, 'application/xml');

      // Check for parsing errors
      const parseError = doc.querySelector('parsererror');
      if (parseError) {
        // Fallback to regex-based parser
        return parseOmmlWithRegex(ommlXml);
      }

      const mathElem = doc.querySelector('root');
      if (mathElem) {
        return cleanLatexFormula(parseOmmlNode(mathElem));
      }
    }
  } catch (e) {
    console.warn('DOMParser failed on OMML, using regex fallback:', e);
  }

  return cleanLatexFormula(parseOmmlWithRegex(ommlXml));
}

/**
 * Recursively parses an OMML XML DOM element into LaTeX
 */
function parseOmmlNode(node: Node): string {
  if (node.nodeType === 3) {
    // Text node
    return node.nodeValue || '';
  }

  if (node.nodeType !== 1) {
    return '';
  }

  const el = node as Element;
  const localName = el.localName || el.nodeName.replace(/^.*:/, '');

  switch (localName) {
    case 'oMath':
    case 'oMathPara':
    case 'root': {
      let res = '';
      for (let i = 0; i < el.childNodes.length; i++) {
        res += parseOmmlNode(el.childNodes[i]);
      }
      return res;
    }

    // Fraction: <m:f> <m:num>...</m:num> <m:den>...</m:den> </m:f>
    case 'f': {
      const numNode = findChildByLocalName(el, 'num');
      const denNode = findChildByLocalName(el, 'den');
      const num = numNode ? parseOmmlNode(numNode) : '';
      const den = denNode ? parseOmmlNode(denNode) : '';
      return `\\frac{${num.trim()}}{${den.trim()}}`;
    }

    // Radical / Square root: <m:rad> <m:deg>...</m:deg> <m:e>...</m:e> </m:rad>
    case 'rad': {
      const degNode = findChildByLocalName(el, 'deg');
      const eNode = findChildByLocalName(el, 'e');
      const deg = degNode ? parseOmmlNode(degNode).trim() : '';
      const e = eNode ? parseOmmlNode(eNode).trim() : '';
      if (deg && deg.length > 0) {
        return `\\sqrt[${deg}]{${e}}`;
      }
      return `\\sqrt{${e}}`;
    }

    // Superscript: <m:sSup> <m:e>...</m:e> <m:sup>...</m:sup> </m:sSup>
    case 'sSup': {
      const eNode = findChildByLocalName(el, 'e');
      const supNode = findChildByLocalName(el, 'sup');
      const e = eNode ? parseOmmlNode(eNode).trim() : '';
      const sup = supNode ? parseOmmlNode(supNode).trim() : '';
      return `${wrapBaseIfNeeded(e)}^{${sup}}`;
    }

    // Subscript: <m:sSub> <m:e>...</m:e> <m:sub>...</m:sub> </m:sSub>
    case 'sSub': {
      const eNode = findChildByLocalName(el, 'e');
      const subNode = findChildByLocalName(el, 'sub');
      const e = eNode ? parseOmmlNode(eNode).trim() : '';
      const sub = subNode ? parseOmmlNode(subNode).trim() : '';
      return `${wrapBaseIfNeeded(e)}_{${sub}}`;
    }

    // Subscript & Superscript together: <m:sSubSup> <m:e>...</m:e> <m:sub>...</m:sub> <m:sup>...</m:sup> </m:sSubSup>
    case 'sSubSup': {
      const eNode = findChildByLocalName(el, 'e');
      const subNode = findChildByLocalName(el, 'sub');
      const supNode = findChildByLocalName(el, 'sup');
      const e = eNode ? parseOmmlNode(eNode).trim() : '';
      const sub = subNode ? parseOmmlNode(subNode).trim() : '';
      const sup = supNode ? parseOmmlNode(supNode).trim() : '';
      return `${wrapBaseIfNeeded(e)}_{${sub}}^{${sup}}`;
    }

    // Delimiters (parentheses, brackets, curly braces, absolute value): <m:d>
    case 'd': {
      const dPr = findChildByLocalName(el, 'dPr');
      let begChr = '(';
      let endChr = ')';
      let sepChr = '';

      if (dPr) {
        const begNode = findChildByLocalName(dPr, 'begChr');
        const endNode = findChildByLocalName(dPr, 'endChr');
        const sepNode = findChildByLocalName(dPr, 'sepChr');
        if (begNode && begNode.getAttribute('m:val')) begChr = begNode.getAttribute('m:val')!;
        else if (begNode && begNode.getAttribute('val')) begChr = begNode.getAttribute('val')!;

        if (endNode && endNode.getAttribute('m:val')) endChr = endNode.getAttribute('m:val')!;
        else if (endNode && endNode.getAttribute('val')) endChr = endNode.getAttribute('val')!;

        if (sepNode && sepNode.getAttribute('m:val')) sepChr = sepNode.getAttribute('m:val')!;
        else if (sepNode && sepNode.getAttribute('val')) sepChr = sepNode.getAttribute('val')!;
      }

      // Collect all <m:e> children
      const elements: string[] = [];
      for (let i = 0; i < el.childNodes.length; i++) {
        const child = el.childNodes[i] as Element;
        if (child.nodeType === 1 && (child.localName === 'e' || child.nodeName.endsWith(':e'))) {
          elements.push(parseOmmlNode(child));
        }
      }

      const inner = elements.join(sepChr || ', ');

      // Format left and right delimiters for LaTeX
      const leftDelim = formatLatexDelimiter(begChr, 'left');
      const rightDelim = formatLatexDelimiter(endChr, 'right');

      return `${leftDelim}${inner.trim()}${rightDelim}`;
    }

    // N-ary operator (integrals, sums, products): <m:nary>
    case 'nary': {
      const naryPr = findChildByLocalName(el, 'naryPr');
      let chr = '∫';
      if (naryPr) {
        const chrNode = findChildByLocalName(naryPr, 'chr');
        if (chrNode && chrNode.getAttribute('m:val')) chr = chrNode.getAttribute('m:val')!;
        else if (chrNode && chrNode.getAttribute('val')) chr = chrNode.getAttribute('val')!;
      }

      const subNode = findChildByLocalName(el, 'sub');
      const supNode = findChildByLocalName(el, 'sup');
      const eNode = findChildByLocalName(el, 'e');

      const sub = subNode ? parseOmmlNode(subNode).trim() : '';
      const sup = supNode ? parseOmmlNode(supNode).trim() : '';
      const e = eNode ? parseOmmlNode(eNode).trim() : '';

      let op = '\\int';
      if (chr === '∑') op = '\\sum';
      else if (chr === '∏') op = '\\prod';
      else if (chr === '∬') op = '\\iint';
      else if (chr === '∭') op = '\\iiint';
      else if (chr === '∮') op = '\\oint';

      let res = op;
      if (sub) res += `_{${sub}}`;
      if (sup) res += `^{${sup}}`;
      if (e) res += ` {${e}}`;
      return res;
    }

    // Function: <m:func> <m:fName>...</m:fName> <m:e>...</m:e> </m:func>
    case 'func': {
      const fNameNode = findChildByLocalName(el, 'fName');
      const eNode = findChildByLocalName(el, 'e');
      const fName = fNameNode ? parseOmmlNode(fNameNode).trim() : '';
      const e = eNode ? parseOmmlNode(eNode).trim() : '';

      // Standard math functions
      const standardFuncs = ['sin', 'cos', 'tan', 'cot', 'ln', 'log', 'lim', 'max', 'min', 'exp'];
      if (standardFuncs.includes(fName.toLowerCase())) {
        return `\\${fName.toLowerCase()}{${e}}`;
      }
      return `${fName}{${e}}`;
    }

    // Matrix / Table: <m:m> <m:mr> <m:e>...</m:e> </m:mr> </m:m>
    case 'm': {
      const rows: string[] = [];
      for (let i = 0; i < el.childNodes.length; i++) {
        const child = el.childNodes[i] as Element;
        if (child.nodeType === 1 && (child.localName === 'mr' || child.nodeName.endsWith(':mr'))) {
          const cells: string[] = [];
          for (let j = 0; j < child.childNodes.length; j++) {
            const cellChild = child.childNodes[j] as Element;
            if (cellChild.nodeType === 1 && (cellChild.localName === 'e' || cellChild.nodeName.endsWith(':e'))) {
              cells.push(parseOmmlNode(cellChild).trim());
            }
          }
          rows.push(cells.join(' & '));
        }
      }
      return `\\begin{matrix} ${rows.join(' \\\\ ')} \\end{matrix}`;
    }

    // Accent (vector, hat, bar, etc.): <m:acc>
    case 'acc': {
      const accPr = findChildByLocalName(el, 'accPr');
      let chr = '⃗'; // default vector arrow
      if (accPr) {
        const chrNode = findChildByLocalName(accPr, 'chr');
        if (chrNode && chrNode.getAttribute('m:val')) chr = chrNode.getAttribute('m:val')!;
        else if (chrNode && chrNode.getAttribute('val')) chr = chrNode.getAttribute('val')!;
      }
      const eNode = findChildByLocalName(el, 'e');
      const e = eNode ? parseOmmlNode(eNode).trim() : '';

      if (chr === '⃗' || chr === '→') return `\\vec{${e}}`;
      if (chr === '^' || chr === '̂') return `\\hat{${e}}`;
      if (chr === '¯' || chr === '̄') return `\\bar{${e}}`;
      if (chr === '˙') return `\\dot{${e}}`;
      if (chr === '¨') return `\\ddot{${e}}`;
      return `\\vec{${e}}`;
    }

    // Overline / Underline: <m:bar>
    case 'bar': {
      const barPr = findChildByLocalName(el, 'barPr');
      let isBottom = false;
      if (barPr) {
        const posNode = findChildByLocalName(barPr, 'pos');
        if (posNode && (posNode.getAttribute('m:val') === 'bot' || posNode.getAttribute('val') === 'bot')) {
          isBottom = true;
        }
      }
      const eNode = findChildByLocalName(el, 'e');
      const e = eNode ? parseOmmlNode(eNode).trim() : '';
      return isBottom ? `\\underline{${e}}` : `\\overline{${e}}`;
    }

    // Text run: <m:r> with <m:t>
    case 'r': {
      const tNode = findChildByLocalName(el, 't');
      if (tNode) {
        const rawContent = tNode.textContent || '';
        return replaceUnicodeMathSymbols(rawContent);
      }
      return '';
    }

    case 't': {
      return replaceUnicodeMathSymbols(el.textContent || '');
    }

    // General container: parse children
    default: {
      let res = '';
      for (let i = 0; i < el.childNodes.length; i++) {
        res += parseOmmlNode(el.childNodes[i]);
      }
      return res;
    }
  }
}

/**
 * Finds child element by local name ignoring XML namespace prefix
 */
function findChildByLocalName(parent: Element, targetLocalName: string): Element | null {
  for (let i = 0; i < parent.childNodes.length; i++) {
    const child = parent.childNodes[i];
    if (child.nodeType === 1) {
      const el = child as Element;
      const lName = el.localName || el.nodeName.replace(/^.*:/, '');
      if (lName === targetLocalName) {
        return el;
      }
    }
  }
  return null;
}

/**
 * Wraps base in braces if it contains multiple characters or commands
 */
function wrapBaseIfNeeded(base: string): string {
  if (!base) return '';
  if (base.length === 1 && !base.startsWith('\\')) return base;
  if (base.startsWith('{') && base.endsWith('}')) return base;
  return `{${base}}`;
}

/**
 * Formats delimiter characters to LaTeX \left and \right
 */
function formatLatexDelimiter(char: string, side: 'left' | 'right'): string {
  const prefix = side === 'left' ? '\\left' : '\\right';
  if (!char || char === '') return `${prefix}.`;
  if (char === '(' || char === ')') return `${prefix}${char}`;
  if (char === '[' || char === ']') return `${prefix}${char}`;
  if (char === '{' || char === '}') return `${prefix}\\${char}`;
  if (char === '|' || char === '│') return `${prefix}|`;
  if (char === '‖' || char === '||') return `${prefix}\\|`;
  return `${prefix}${char}`;
}

/**
 * Regex-based OMML parser for fallback when DOMParser is unavailable or fails
 */
function parseOmmlWithRegex(xml: string): string {
  let result = xml;

  // Fractions: <m:f>...<m:num>...</m:num>...<m:den>...</m:den>...</m:f>
  result = result.replace(/<m:f[^>]*>[\s\S]*?<m:num[^>]*>([\s\S]*?)<\/m:num>[\s\S]*?<m:den[^>]*>([\s\S]*?)<\/m:den>[\s\S]*?<\/m:f>/gi, (_, num, den) => {
    return `\\frac{${parseOmmlWithRegex(num).trim()}}{${parseOmmlWithRegex(den).trim()}}`;
  });

  // Radicals: <m:rad>...<m:deg>...</m:deg>...<m:e>...</m:e>...</m:rad>
  result = result.replace(/<m:rad[^>]*>[\s\S]*?<m:deg[^>]*>([\s\S]*?)<\/m:deg>[\s\S]*?<m:e[^>]*>([\s\S]*?)<\/m:e>[\s\S]*?<\/m:rad>/gi, (_, deg, e) => {
    const degText = parseOmmlWithRegex(deg).trim();
    const eText = parseOmmlWithRegex(e).trim();
    return degText ? `\\sqrt[${degText}]{${eText}}` : `\\sqrt{${eText}}`;
  });

  result = result.replace(/<m:rad[^>]*>[\s\S]*?<m:e[^>]*>([\s\S]*?)<\/m:e>[\s\S]*?<\/m:rad>/gi, (_, e) => {
    return `\\sqrt{${parseOmmlWithRegex(e).trim()}}`;
  });

  // Superscript: <m:sSup>...<m:e>...</m:e>...<m:sup>...</m:sup>...</m:sSup>
  result = result.replace(/<m:sSup[^>]*>[\s\S]*?<m:e[^>]*>([\s\S]*?)<\/m:e>[\s\S]*?<m:sup[^>]*>([\s\S]*?)<\/m:sup>[\s\S]*?<\/m:sSup>/gi, (_, e, sup) => {
    return `${wrapBaseIfNeeded(parseOmmlWithRegex(e).trim())}^{${parseOmmlWithRegex(sup).trim()}}`;
  });

  // Subscript: <m:sSub>...<m:e>...</m:e>...<m:sub>...</m:sub>...</m:sSub>
  result = result.replace(/<m:sSub[^>]*>[\s\S]*?<m:e[^>]*>([\s\S]*?)<\/m:e>[\s\S]*?<m:sub[^>]*>([\s\S]*?)<\/m:sub>[\s\S]*?<\/m:sSub>/gi, (_, e, sub) => {
    return `${wrapBaseIfNeeded(parseOmmlWithRegex(e).trim())}_{${parseOmmlWithRegex(sub).trim()}}`;
  });

  // Delimiters: <m:d>...<m:e>...</m:e>...</m:d>
  result = result.replace(/<m:d[^>]*>[\s\S]*?<m:e[^>]*>([\s\S]*?)<\/m:e>[\s\S]*?<\/m:d>/gi, (_, e) => {
    return `\\left(${parseOmmlWithRegex(e).trim()}\\right)`;
  });

  // Text runs: <m:t>text</m:t>
  result = result.replace(/<m:t[^>]*>([\s\S]*?)<\/m:t>/gi, (_, t) => {
    return replaceUnicodeMathSymbols(t);
  });

  // Strip all remaining XML tags
  result = result.replace(/<[^>]+>/g, '');

  return replaceUnicodeMathSymbols(result).trim();
}

/**
 * Converts MathML XML string into LaTeX
 */
export function convertMathMlToLatex(mathml: string): string {
  if (!mathml || !mathml.trim()) return '';

  let res = mathml;

  // Fractions: <mfrac><mi>a</mi><mi>b</mi></mfrac>
  res = res.replace(/<mfrac[^>]*>([\s\S]*?)<\/mfrac>/gi, (_, inner) => {
    // Split into first element and second element
    const items = inner.match(/<m[a-z]+[^>]*>[\s\S]*?<\/m[a-z]+>/gi) || [];
    if (items.length >= 2) {
      const num = convertMathMlToLatex(items[0]);
      const den = convertMathMlToLatex(items[1]);
      return `\\frac{${num.trim()}}{${den.trim()}}`;
    }
    return `\\frac{${convertMathMlToLatex(inner)}}{}`;
  });

  // Square root: <msqrt>...</msqrt>
  res = res.replace(/<msqrt[^>]*>([\s\S]*?)<\/msqrt>/gi, (_, inner) => {
    return `\\sqrt{${convertMathMlToLatex(inner).trim()}}`;
  });

  // Root with degree: <mroot><mi>x</mi><mn>3</mn></mroot>
  res = res.replace(/<mroot[^>]*>([\s\S]*?)<\/mroot>/gi, (_, inner) => {
    const items = inner.match(/<m[a-z]+[^>]*>[\s\S]*?<\/m[a-z]+>/gi) || [];
    if (items.length >= 2) {
      const base = convertMathMlToLatex(items[0]);
      const deg = convertMathMlToLatex(items[1]);
      return `\\sqrt[${deg.trim()}]{${base.trim()}}`;
    }
    return `\\sqrt{${convertMathMlToLatex(inner)}}`;
  });

  // Superscript: <msup><mi>x</mi><mn>2</mn></msup>
  res = res.replace(/<msup[^>]*>([\s\S]*?)<\/msup>/gi, (_, inner) => {
    const items = inner.match(/<m[a-z]+[^>]*>[\s\S]*?<\/m[a-z]+>/gi) || [];
    if (items.length >= 2) {
      const base = convertMathMlToLatex(items[0]);
      const sup = convertMathMlToLatex(items[1]);
      return `${wrapBaseIfNeeded(base.trim())}^{${sup.trim()}}`;
    }
    return inner;
  });

  // Subscript: <msub><mi>x</mi><mn>1</mn></msub>
  res = res.replace(/<msub[^>]*>([\s\S]*?)<\/msub>/gi, (_, inner) => {
    const items = inner.match(/<m[a-z]+[^>]*>[\s\S]*?<\/m[a-z]+>/gi) || [];
    if (items.length >= 2) {
      const base = convertMathMlToLatex(items[0]);
      const sub = convertMathMlToLatex(items[1]);
      return `${wrapBaseIfNeeded(base.trim())}_{${sub.trim()}}`;
    }
    return inner;
  });

  // Parentheses: <mfenced open="(" close=")">...</mfenced>
  res = res.replace(/<mfenced(?:\s+open=["']([^"']*)["'])?(?:\s+close=["']([^"']*)["'])?[^>]*>([\s\S]*?)<\/mfenced>/gi, (_, open, close, inner) => {
    const o = open || '(';
    const c = close || ')';
    return `${formatLatexDelimiter(o, 'left')}${convertMathMlToLatex(inner).trim()}${formatLatexDelimiter(c, 'right')}`;
  });

  // Clean tags <mi>, <mn>, <mo>, <mtext>
  res = res.replace(/<(?:mi|mn|mo|mtext)[^>]*>([\s\S]*?)<\/(?:mi|mn|mo|mtext)>/gi, (_, text) => {
    return replaceUnicodeMathSymbols(text.trim());
  });

  // Remove other XML tags
  res = res.replace(/<[^>]+>/g, '');

  return cleanLatexFormula(replaceUnicodeMathSymbols(res));
}

/**
 * Parses MathType clipboard or embedded LaTeX comments:
 * e.g. % MathType!MTEF!2!1!+-...% ... \[ \frac{a}{b} \]
 */
export function extractMathTypeLatexFromText(rawText: string): string {
  if (!rawText) return '';

  let text = rawText;

  // Check for MathType translator blocks:
  // % MathType!MTEF!... followed by \[...\] or $$...$$ or $...$
  text = text.replace(/%[\s]*MathType!MTEF![\s\S]*?(?:%[\s]*MathType!Translator![\s\S]*?)?\s*(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\$[^\$\n]+?\$)/gi, (_, formula) => {
    return formula;
  });

  // Strip remaining solitary MathType header comments (any line starting with % MathType!)
  text = text.replace(/%[\s]*MathType![^\n]*/gi, '');

  // MathType Word export format: «math xmlns="..."»...«/math»
  text = text.replace(/«math[^»]*»([\s\S]*?)«\/math»/gi, (_, mathml) => {
    const latex = convertMathMlToLatex(mathml);
    return ` $${latex}$ `;
  });

  // Standard <math>...</math> tags
  text = text.replace(/<math[^>]*>([\s\S]*?)<\/math>/gi, (_, mathml) => {
    const latex = convertMathMlToLatex(mathml);
    return ` $${latex}$ `;
  });

  return text;
}

/**
 * Cleans up and normalizes LaTeX formula strings for crisp KaTeX rendering
 */
export function cleanLatexFormula(latex: string): string {
  if (!latex) return '';

  let res = latex
    .replace(/\s+/g, ' ')
    .replace(/\\left\s*([(\[{|])/g, '\\left$1')
    .replace(/\\right\s*([)\]}|])/g, '\\right$1')
    .replace(/\\\s+/g, '\\')
    .replace(/\^\s*\{/g, '^{')
    .replace(/_\s*\{/g, '_{')
    .trim();

  // If starts and ends with dollar, clean inside
  if (res.startsWith('$') && res.endsWith('$') && !res.startsWith('$$')) {
    res = `$${res.slice(1, -1).trim()}$`;
  }

  return res;
}

/**
 * Đổi ký hiệu unicode (≤, π, ...) ngoài công thức sang LaTeX và bọc trong $...$ để KaTeX hiển thị.
 * Không đụng vào phần đã nằm trong $...$.
 */
export function replaceUnicodeMathSymbolsOutsideMath(text: string): string {
  return text
    .split(/(\$\$[\s\S]*?\$\$|\$[^$\n]*\$)/g)
    .map((seg, i) => {
      if (i % 2 === 1) return seg;
      return seg
        .replace(/√\s*(\d+|[A-Za-z])/g, (_, arg) => `$\\sqrt{${arg}}$`)
        .replace(/[^\x00-\x7F]/g, ch => {
          const latex = replaceUnicodeMathSymbols(ch);
          return latex === ch ? ch : `$${latex.trim()}$`;
        });
    })
    .join('');
}
