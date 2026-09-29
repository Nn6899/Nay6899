import { loadPdfDocument } from '../../lib/pdfjs';
import { Question, ParseResult } from '../../types/question';
import { applyValidationToQuestion } from './questionValidator';
import { splitTextIntoQuestionBlocks, parseQuestionBlocksToQuestions } from './questionSplitter';
import { prepareExamText } from './answerKey';
import { replaceUnicodeMathSymbolsOutsideMath, extractMathTypeLatexFromText } from './mathtypeConverter';

/**
 * Ghép các mảnh chữ của pdf.js thành từng dòng theo toạ độ.
 * Giữ xuống dòng để nhận ra "Câu N." ở đầu dòng; khoảng trống ngang lớn (A. ...   B. ...) thành nhiều dấu cách
 * để bộ tách phương án nhận ra các phương án nằm cùng một hàng.
 */
export function pdfItemsToLines(items: any[]): string {
  type Item = { str: string; x: number; y: number; w: number; h: number; eol: boolean };
  const list: Item[] = items
    .filter(it => it && typeof it.str === 'string')
    .map(it => ({
      str: it.str,
      x: it.transform?.[4] ?? 0,
      y: it.transform?.[5] ?? 0,
      w: it.width ?? 0,
      h: Math.abs(it.height || it.transform?.[3] || 10),
      eol: Boolean(it.hasEOL),
    }));

  const lines: string[] = [];
  let line = '';
  let prev: Item | null = null;

  for (const it of list) {
    if (prev) {
      const sameLine = Math.abs(it.y - prev.y) < Math.max(2, Math.min(it.h, prev.h) * 0.5);
      if (!sameLine) {
        lines.push(line);
        line = '';
      } else if (line && it.str) {
        const gap = it.x - (prev.x + prev.w);
        if (gap > prev.h * 1.5) line += '    ';
        else if (gap > prev.h * 0.15 && !line.endsWith(' ') && !it.str.startsWith(' ')) line += ' ';
      }
    }
    line += it.str;
    if (it.eol && it.str === '') {
      lines.push(line);
      line = '';
      prev = null;
      continue;
    }
    prev = it.str ? it : prev;
  }
  if (line) lines.push(line);

  return lines
    .map(l => l.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

/**
 * Extracts text content from a PDF ArrayBuffer using pdfjs-dist
 */
export async function extractTextFromPdf(buffer: ArrayBuffer): Promise<{ text: string; numPages: number; avgCharsPerPage: number }> {
  try {
    const pdfDoc = await loadPdfDocument(buffer);
    const numPages = pdfDoc.numPages;
    const pageTexts: string[] = [];

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      pageTexts.push(pdfItemsToLines(textContent.items as any[]));
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
      `PDF (${numPages} trang) là bản scan/ảnh, gần như không có lớp chữ (${text.trim().length} ký tự) — cần AI nhận dạng (OCR). Nếu chưa bật AI, hãy dùng file Word/LaTeX.`
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
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');

  normalizedText = extractMathTypeLatexFromText(normalizedText);
  normalizedText = replaceUnicodeMathSymbolsOutsideMath(normalizedText);

  // 3. Extract question blocks matching "Câu x.", "Câu x:", "câu x.", "câu x:", "Bài x.", "Bài x:", "bài x.", "bài x:"
  const prepared = prepareExamText(normalizedText);
  warnings.push(...prepared.warnings);
  const questionBlocks = splitTextIntoQuestionBlocks(prepared.body);

  if (questionBlocks.length === 1 && questionBlocks[0].qNum === 1 && questionBlocks[0].rawText === prepared.body.trim()) {
    warnings.push('Không nhận diện được từ khóa "Câu 1.", "Câu 1:", "Bài 1.", "Bài 1:" trong tệp PDF. Đã gom toàn bộ văn bản để giáo viên kiểm duyệt.');
  }

  // 4. Parse blocks into structured Question objects
  questions = parseQuestionBlocksToQuestions(questionBlocks, prepared.answerKeyMap);
  warnings.push('Công thức lấy từ lớp chữ của PDF thường bị vỡ (mũ, phân số, căn). Nếu thấy sai, bấm "Bóc tách lại bằng AI".');

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
