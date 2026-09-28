import * as pdfjsLib from 'pdfjs-dist';
import { Question, ParseResult } from '../../types/question';
import { applyValidationToQuestion } from './questionValidator';
import { splitTextIntoQuestionBlocks, parseQuestionBlocksToQuestions } from './questionSplitter';
import { replaceUnicodeMathSymbols, extractMathTypeLatexFromText } from './mathtypeConverter';

/**
 * Extracts text content from a PDF ArrayBuffer using pdfjs-dist
 */
export async function extractTextFromPdf(buffer: ArrayBuffer): Promise<{ text: string; numPages: number; avgCharsPerPage: number }> {
  try {
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      useWorkerFetch: false,
      useSystemFonts: true,
    } as any);

    const pdfDoc = await loadingTask.promise;
    const numPages = pdfDoc.numPages;
    const pageTexts: string[] = [];

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageStrings = textContent.items
        .map((item: any) => (item && typeof item.str === 'string' ? item.str : ''))
        .filter(Boolean);
      pageTexts.push(pageStrings.join(' '));
    }

    const fullText = pageTexts.join('\n\n');
    const totalChars = fullText.trim().length;
    const avgCharsPerPage = numPages > 0 ? totalChars / numPages : 0;

    return {
      text: fullText,
      numPages,
      avgCharsPerPage,
    };
  } catch (err: any) {
    throw new Error(`Lỗi đọc cấu trúc PDF: ${err.message || 'Tệp PDF không hợp lệ hoặc được mã hóa bảo mật'}`);
  }
}

/**
 * Parses PDF ArrayBuffer into structured Question array.
 * Emits warnings and requiresOcrOrAi if PDF is scanned or image-based.
 */
export async function parsePdfExam(buffer: ArrayBuffer, fileName = 'exam.pdf'): Promise<ParseResult> {
  const warnings: string[] = [];
  let questions: Question[] = [];

  let text = '';
  let numPages = 0;
  let avgCharsPerPage = 0;

  try {
    const res = await extractTextFromPdf(buffer);
    text = res.text;
    numPages = res.numPages;
    avgCharsPerPage = res.avgCharsPerPage;
  } catch (err: any) {
    return {
      success: false,
      fileType: 'pdf',
      fileName,
      questions: [],
      warnings: [err.message],
      totalParsed: 0,
      validCount: 0,
      needsReviewCount: 0,
    };
  }

  // 1. Scanned / Image PDF Detection
  // If fewer than 30 characters in total or less than 25 chars per page, it is scanned/image-based
  if (text.trim().length < 30 || avgCharsPerPage < 25) {
    warnings.push(
      `Tài liệu PDF (${numPages} trang) không có lớp văn bản số hoặc chủ yếu là hình ảnh/bản scan (chỉ tìm thấy ${text.trim().length} ký tự). Hệ thống không tự động tạo câu hỏi để tránh sai lệch dữ liệu. Vui lòng sử dụng tính năng "Nhận diện nâng cao bằng AI" hoặc tải lên file Word/LaTeX.`
    );

    return {
      success: false,
      fileType: 'pdf',
      fileName,
      questions: [],
      warnings,
      requiresOcrOrAi: true,
      totalParsed: 0,
      validCount: 0,
      needsReviewCount: 0,
      rawTextSample: text.slice(0, 100),
    };
  }

  // 2. Normalize text, convert MathType/LaTeX remnants and Unicode math symbols
  let normalizedText = text
    .replace(/(\w+)-\s*\n\s*(\w+)/g, '$1$2') // rejoin hyphenated words
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');

  normalizedText = extractMathTypeLatexFromText(normalizedText);
  normalizedText = replaceUnicodeMathSymbols(normalizedText);

  // 3. Extract question blocks matching "Câu x.", "Câu x:", "câu x.", "câu x:", "Bài x.", "Bài x:", "bài x.", "bài x:"
  const questionBlocks = splitTextIntoQuestionBlocks(normalizedText);

  if (questionBlocks.length === 1 && questionBlocks[0].qNum === 1 && questionBlocks[0].rawText === normalizedText.trim()) {
    warnings.push('Không nhận diện được từ khóa "Câu 1.", "Câu 1:", "Bài 1.", "Bài 1:" trong tệp PDF. Đã gom toàn bộ văn bản để giáo viên kiểm duyệt.');
  }

  // 4. Parse blocks into structured Question objects
  questions = parseQuestionBlocksToQuestions(questionBlocks);

  const validCount = questions.filter(q => q.validationStatus === 'VALID').length;
  const needsReviewCount = questions.length - validCount;

  return {
    success: questions.length > 0,
    fileType: 'pdf',
    fileName,
    questions,
    warnings,
    totalParsed: questions.length,
    validCount,
    needsReviewCount,
    rawTextSample: text.slice(0, 300),
  };
}
