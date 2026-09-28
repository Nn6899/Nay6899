import mammoth from 'mammoth';
import { Question, ParseResult } from '../../types/question';
import { extractDocxTextWithLatex } from './docxXmlExtractor';
import { splitTextIntoQuestionBlocks, parseQuestionBlocksToQuestions } from './questionSplitter';
import { extractMathTypeLatexFromText, replaceUnicodeMathSymbols } from './mathtypeConverter';

/**
 * Parses DOCX ArrayBuffer into structured Question array.
 * Supports MathType formulas, OMML equations, and question patterns:
 * - "Câu x.", "Câu x:", "câu x.", "câu x:"
 * - "Bài x.", "Bài x:", "bài x.", "bài x:"
 * - Preserves all mathematical formulas as valid LaTeX ($...$ / $$...$$).
 */
export async function parseDocxExam(buffer: ArrayBuffer, fileName = 'exam.docx'): Promise<ParseResult> {
  const warnings: string[] = [];
  let rawText = '';
  let formulasConverted = 0;

  // 1. Primary High-Fidelity Extraction via direct OpenXML ZIP inspection (word/document.xml)
  try {
    const xmlResult = await extractDocxTextWithLatex(buffer);
    if (xmlResult && xmlResult.text && xmlResult.text.trim().length > 0) {
      rawText = xmlResult.text;
      formulasConverted = xmlResult.mathFormulaCount;
      if (formulasConverted > 0) {
        warnings.push(`Hệ thống đã tự động nhận diện và chuyển đổi ${formulasConverted} công thức MathType/OMML sang định dạng chuẩn LaTeX.`);
      }
    }
  } catch (err: any) {
    console.warn('Direct OpenXML extraction failed, falling back to Mammoth:', err);
  }

  // 2. Fallback to Mammoth if direct XML extraction did not produce text
  if (!rawText || rawText.trim().length === 0) {
    try {
      const rawRes = await mammoth.extractRawText({ arrayBuffer: buffer });
      let extracted = rawRes.value || '';
      extracted = extractMathTypeLatexFromText(extracted);
      extracted = replaceUnicodeMathSymbols(extracted);
      rawText = extracted;
    } catch (err: any) {
      return {
        success: false,
        fileType: 'docx',
        fileName,
        questions: [],
        warnings: [`Lỗi khi giải nén và đọc file Word (.docx): ${err.message || 'Tệp có thể bị hỏng'}`],
        totalParsed: 0,
        validCount: 0,
        needsReviewCount: 0,
      };
    }
  }

  if (!rawText || rawText.trim().length === 0) {
    return {
      success: false,
      fileType: 'docx',
      fileName,
      questions: [],
      warnings: ['Tệp Word không chứa nội dung văn bản khả dụng.'],
      totalParsed: 0,
      validCount: 0,
      needsReviewCount: 0,
    };
  }

  // 3. Check for Answer Key Table (BẢNG ĐÁP ÁN, ĐÁP ÁN TRẮC NGHIỆM)
  const answerKeyMap = new Map<number, string>();
  const answerKeyHeaderRegex = /(?:BẢNG\s+ĐÁP\s+ÁN|ĐÁP\s+ÁN\s+TRẮC\s+NGHIỆM|BẢNG\s+TRẢ\s+LỜI)/i;
  const headerMatch = rawText.match(answerKeyHeaderRegex);

  let parsingBody = rawText;

  if (headerMatch && headerMatch.index !== undefined) {
    const afterHeader = rawText.slice(headerMatch.index + headerMatch[0].length);
    const nextQuestionMatch = afterHeader.match(/(?:^|\n)\s*(?:Câu|câu|Bài|bài)\s*([0-9]+|[IVXLCDMivxlcdm]+)[\.:\-\s]/i);

    let keySection = '';
    if (nextQuestionMatch && nextQuestionMatch.index !== undefined) {
      keySection = afterHeader.slice(0, nextQuestionMatch.index);
      parsingBody = rawText.slice(0, headerMatch.index) + '\n' + afterHeader.slice(nextQuestionMatch.index);
    } else {
      keySection = afterHeader;
      parsingBody = rawText.slice(0, headerMatch.index);
    }

    const pairRegex = /(\d+)\s*[\.\-:\s]\s*([A-D])/gi;
    let keyPairMatch: RegExpExecArray | null;
    while ((keyPairMatch = pairRegex.exec(keySection)) !== null) {
      const qIndex = parseInt(keyPairMatch[1], 10);
      const ansChar = keyPairMatch[2].toUpperCase();
      answerKeyMap.set(qIndex, ansChar);
    }
    if (answerKeyMap.size > 0) {
      warnings.push(`Đã tìm thấy bảng đáp án với ${answerKeyMap.size} đáp án.`);
    }
  }

  // 4. Split into question blocks using the comprehensive question splitter:
  // "Câu x.", "Câu x:", "câu x.", "câu x:", "Bài x.", "Bài x:", "bài x.", "bài x:"
  const questionBlocks = splitTextIntoQuestionBlocks(parsingBody);

  if (questionBlocks.length === 1 && questionBlocks[0].qNum === 1 && questionBlocks[0].rawText === parsingBody.trim()) {
    warnings.push('Không nhận diện được từ khóa câu hỏi như "Câu 1.", "Câu 1:", "Bài 1.", "Bài 1:". Vui lòng kiểm tra lại cấu trúc văn bản.');
  }

  // 5. Parse blocks into structured Question objects
  const questions: Question[] = parseQuestionBlocksToQuestions(questionBlocks, answerKeyMap);

  const validCount = questions.filter(q => q.validationStatus === 'VALID').length;
  const needsReviewCount = questions.length - validCount;

  return {
    success: questions.length > 0,
    fileType: 'docx',
    fileName,
    questions,
    warnings,
    totalParsed: questions.length,
    validCount,
    needsReviewCount,
    rawTextSample: rawText.slice(0, 300),
  };
}
