import mammoth from 'mammoth';
import { Question, ParseResult } from '../../types/question';
import { applyValidationToQuestion } from './questionValidator';
import { extractDocxTextWithLatex, MATH_PLACEHOLDER } from './docxXmlExtractor';
import { splitTextIntoQuestionBlocks, parseQuestionBlocksToQuestions } from './questionSplitter';
import { prepareExamText } from './answerKey';
import { extractMathTypeLatexFromText, replaceUnicodeMathSymbolsOutsideMath } from './mathtypeConverter';

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
  let images: string[] = [];

  // 1. Primary High-Fidelity Extraction via direct OpenXML ZIP inspection (word/document.xml)
  try {
    const xmlResult = await extractDocxTextWithLatex(buffer);
    if (xmlResult && xmlResult.text && xmlResult.text.trim().length > 0) {
      rawText = xmlResult.text;
      formulasConverted = xmlResult.mathFormulaCount;
      images = xmlResult.images;
      if (formulasConverted > 0) {
        warnings.push(`Đã chuyển ${formulasConverted} công thức (MathType: ${xmlResult.mathTypeConverted}, Equation Word: ${formulasConverted - xmlResult.mathTypeConverted}) sang LaTeX.`);
      }
      if (xmlResult.mathTypeFailed > 0) {
        warnings.push(`${xmlResult.mathTypeFailed} công thức MathType không đọc được, hiển thị là "${MATH_PLACEHOLDER}" — hãy sửa tay hoặc dùng "Bóc tách lại bằng AI".`);
      }
      if (images.length > 0) {
        warnings.push(`Đã lấy ${images.length} hình ảnh trong đề và gắn vào câu hỏi tương ứng.`);
      }
      if (xmlResult.skippedImages > 0) {
        warnings.push(`${xmlResult.skippedImages} hình dạng WMF/EMF hoặc quá lớn không hiển thị được trên web (đánh dấu [HÌNH]) — hãy chèn lại ảnh PNG/JPG khi duyệt.`);
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
      extracted = replaceUnicodeMathSymbolsOutsideMath(extracted);
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

  // 3. Tách bảng đáp án + phần lời giải cuối đề
  const prepared = prepareExamText(rawText);
  const answerKeyMap = prepared.answerKeyMap;
  const parsingBody = prepared.body;
  warnings.push(...prepared.warnings);

  // 4. Split into question blocks using the comprehensive question splitter:
  // "Câu x.", "Câu x:", "câu x.", "câu x:", "Bài x.", "Bài x:", "bài x.", "bài x:"
  const questionBlocks = splitTextIntoQuestionBlocks(parsingBody);

  if (questionBlocks.length === 1 && questionBlocks[0].qNum === 1 && questionBlocks[0].rawText === parsingBody.trim()) {
    warnings.push('Không nhận diện được từ khóa câu hỏi như "Câu 1.", "Câu 1:", "Bài 1.", "Bài 1:". Vui lòng kiểm tra lại cấu trúc văn bản.');
  }

  // 5. Parse blocks into structured Question objects
  const questions: Question[] = attachImagesToQuestions(
    parseQuestionBlocksToQuestions(questionBlocks, answerKeyMap),
    images
  );

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

/**
 * Chuyển các chỗ [[IMG:n]] trong nội dung/phương án/lời giải thành ảnh đính kèm của câu hỏi.
 */
export function attachImagesToQuestions(questions: Question[], images: string[]): Question[] {
  if (images.length === 0) return questions;
  const token = /\s*\[\[IMG:(\d+)\]\]\s*/g;
  return questions.map(q => {
    const found: string[] = [];
    const take = (s: string) =>
      s.replace(token, (_, n) => {
        const src = images[Number(n)];
        if (src && !found.includes(src)) found.push(src);
        return ' ';
      }).trim();
    const content = take(q.content);
    // Phương án chỉ là hình (vd chọn đồ thị đúng) -> ghi "Hình k" để học sinh đối chiếu với ảnh bên dưới đề
    const options = q.options.map(opt => {
      const before = found.length;
      const text = take(opt);
      return text || (found.length > before ? `Hình ${found.length}` : text);
    });
    const updated: Question = {
      ...q,
      content,
      options,
      explanation: q.explanation ? take(q.explanation) : q.explanation,
    };
    if (found.length > 0) {
      updated.images = [...(q.images || []), ...found];
    }
    return found.length > 0 ? applyValidationToQuestion(updated) : updated;
  });
}
