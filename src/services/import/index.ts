import { FileValidationResult, ParseResult, SupportedFileFormat } from '../../types/question';
import { validateImportFile } from './fileValidator';
import { parseLatexExam } from './latexParser';
import { parseDocxExam } from './docxParser';
import { parsePdfExam } from './pdfParser';
import { extractQuestionsWithAi } from '../document-ai/question-extractor';

export * from './fileValidator';
export * from './questionValidator';
export * from './latexParser';
export * from './docxParser';
export * from './pdfParser';
export { extractQuestionsWithAi };

/**
 * High-level import pipeline orchestrator:
 * FILE -> FILE VALIDATION -> PARSER -> QUESTION EXTRACTION -> QUESTION JSON -> VALIDATION -> READY FOR TEACHER REVIEW
 */
export async function importExamFromFile(
  file: File | { name: string; size: number; type?: string; arrayBuffer: () => Promise<ArrayBuffer> },
  onProgress?: (step: string, percent: number) => void
): Promise<ParseResult> {
  // Step 1: File Validation
  onProgress?.('Đang kiểm tra bảo mật và định dạng tệp...', 15);
  const validation: FileValidationResult = await validateImportFile(file);

  if (!validation.isValid) {
    return {
      success: false,
      fileType: validation.fileType,
      fileName: validation.fileName,
      questions: [],
      warnings: [validation.error || 'Tệp không đạt tiêu chuẩn bảo mật hoặc định dạng.'],
      totalParsed: 0,
      validCount: 0,
      needsReviewCount: 0,
    };
  }

  // Step 2: Reading & Parsing
  onProgress?.('Đang đọc cấu trúc dữ liệu...', 40);
  const buffer = await file.arrayBuffer();

  let result: ParseResult;

  if (validation.fileType === 'tex') {
    onProgress?.('Đang phân tích cú pháp LaTeX và bảo toàn công thức toán...', 70);
    const decoder = new TextDecoder('utf-8');
    const text = decoder.decode(buffer);
    result = parseLatexExam(text, validation.fileName);
  } else if (validation.fileType === 'docx') {
    onProgress?.('Đang trích xuất nội dung văn bản Word...', 70);
    result = await parseDocxExam(buffer, validation.fileName);
  } else if (validation.fileType === 'pdf') {
    onProgress?.('Đang quét các trang PDF và kiểm tra lớp văn bản số...', 70);
    result = await parsePdfExam(buffer, validation.fileName);
  } else {
    return {
      success: false,
      fileType: 'unknown',
      fileName: validation.fileName,
      questions: [],
      warnings: ['Định dạng tệp không được hỗ trợ.'],
      totalParsed: 0,
      validCount: 0,
      needsReviewCount: 0,
    };
  }

  onProgress?.('Đang hoàn tất kiểm tra quy chuẩn câu hỏi...', 100);
  return result;
}
