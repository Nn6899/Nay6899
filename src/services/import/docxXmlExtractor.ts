/**
 * DOCX XML Extractor with MathType & OMML to LaTeX Conversion
 * 
 * Unpacks the .docx file (OpenXML ZIP archive) using JSZip, reads word/document.xml,
 * and transforms all Office Math (<m:oMath>, <m:oMathPara>), MathML (<math>),
 * and embedded MathType formulas into pristine LaTeX code ($...$, $$...$$).
 */

import JSZip from 'jszip';
import {
  convertOmmlToLatex,
  convertMathMlToLatex,
  extractMathTypeLatexFromText,
  replaceUnicodeMathSymbols,
} from './mathtypeConverter';

export interface DocxExtractionResult {
  text: string;
  mathFormulaCount: number;
  hasOmml: boolean;
  hasMathMl: boolean;
}

/**
 * Extracts full text from DOCX ArrayBuffer with high-fidelity formula conversion
 */
export async function extractDocxTextWithLatex(buffer: ArrayBuffer): Promise<DocxExtractionResult | null> {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const docFile = zip.file('word/document.xml');
    if (!docFile) return null;

    const xml = await docFile.async('text');
    let mathFormulaCount = 0;
    let hasOmml = false;
    let hasMathMl = false;

    // Check for presence of math elements
    if (xml.includes('<m:oMath') || xml.includes('<m:oMathPara')) {
      hasOmml = true;
    }
    if (xml.includes('<math') || xml.includes('«math')) {
      hasMathMl = true;
    }

    // Step 1: Pre-process block math equations: <m:oMathPara>...</m:oMathPara>
    let processedXml = xml.replace(/<m:oMathPara[^>]*>([\s\S]*?)<\/m:oMathPara>/gi, (_, inner) => {
      mathFormulaCount++;
      const latex = convertOmmlToLatex(inner);
      return `<w:r><w:t xml:space="preserve"> $$${latex}$$ </w:t></w:r>`;
    });

    // Step 2: Pre-process inline math equations: <m:oMath>...</m:oMath>
    processedXml = processedXml.replace(/<m:oMath[^>]*>([\s\S]*?)<\/m:oMath>/gi, (match) => {
      mathFormulaCount++;
      const latex = convertOmmlToLatex(match);
      return `<w:r><w:t xml:space="preserve"> $${latex}$ </w:t></w:r>`;
    });

    // Step 3: Pre-process MathML: <math>...</math>
    processedXml = processedXml.replace(/<math[^>]*>([\s\S]*?)<\/math>/gi, (_, inner) => {
      mathFormulaCount++;
      const latex = convertMathMlToLatex(inner);
      return `<w:r><w:t xml:space="preserve"> $${latex}$ </w:t></w:r>`;
    });

    // Step 4: Extract paragraphs <w:p>
    const paragraphs: string[] = [];
    const pRegex = /<w:p(?:[\s>][\s\S]*?<\/w:p>|\/>)/gi;
    let pMatch: RegExpExecArray | null;

    while ((pMatch = pRegex.exec(processedXml)) !== null) {
      const pXml = pMatch[0];
      const pText = extractParagraphText(pXml);
      if (pText !== null) {
        paragraphs.push(pText);
      }
    }

    let fullText = paragraphs.join('\n');

    // Step 5: Process any remaining MathType comments or symbols
    fullText = extractMathTypeLatexFromText(fullText);
    fullText = replaceUnicodeMathSymbols(fullText);

    return {
      text: fullText,
      mathFormulaCount,
      hasOmml,
      hasMathMl,
    };
  } catch (err) {
    console.warn('extractDocxTextWithLatex encountered an issue, falling back to standard mammoth:', err);
    return null;
  }
}

/**
 * Extracts plain text + converted math runs from a single <w:p> XML element
 */
function extractParagraphText(pXml: string): string {
  let line = '';

  // Match text runs <w:t>, breaks <w:br/>, tabs <w:tab/>
  const tokenRegex = /<w:t[^>]*>([\s\S]*?)<\/w:t>|<w:br\/>|<w:cr\/>|<w:tab\/>/gi;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(pXml)) !== null) {
    const matchedToken = match[0];
    if (matchedToken.startsWith('<w:t')) {
      const textContent = match[1] || '';
      // Decode basic XML entities
      line += decodeXmlEntities(textContent);
    } else if (matchedToken.includes('br') || matchedToken.includes('cr')) {
      line += '\n';
    } else if (matchedToken.includes('tab')) {
      line += '    ';
    }
  }

  return line.trim();
}

/**
 * Decodes XML entities
 */
function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}
