import * as pdfjsLib from 'pdfjs-dist';
import { Question, ParseResult } from '../../types/question';
import { applyValidationToQuestion } from './questionValidator';

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
  const questions: Question[] = [];

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

  // 2. Normalize text linebreaks & hyphens
  const normalizedText = text
    .replace(/(\w+)-\s*\n\s*(\w+)/g, '$1$2') // rejoin hyphenated words
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');

  // 3. Extract question blocks matching "Câu 1", "Câu 2", "Bài 1"
  const questionMarkerRegex = /(?:^|\n)\s*(?:Câu|Bài)\s*(\d+)[\.:\-\s]/gi;
  const markers = Array.from(normalizedText.matchAll(questionMarkerRegex));

  const questionBlocks: { qNum: number; text: string }[] = [];

  if (markers.length > 0) {
    for (let i = 0; i < markers.length; i++) {
      const currentMarker = markers[i];
      const qNum = parseInt(currentMarker[1], 10) || i + 1;
      const startIndex = (currentMarker.index || 0) + currentMarker[0].length;
      const endIndex = i < markers.length - 1 ? markers[i + 1].index : normalizedText.length;
      const blockText = normalizedText.slice(startIndex, endIndex).trim();

      questionBlocks.push({ qNum, text: blockText });
    }
  } else {
    warnings.push('Không nhận diện được từ khóa "Câu 1.", "Câu 2." trong tệp PDF. Đã gom toàn bộ văn bản để giáo viên kiểm duyệt.');
    questionBlocks.push({ qNum: 1, text: normalizedText.trim() });
  }

  // 4. Process each block
  let indexCounter = 1;
  for (const block of questionBlocks) {
    const qNum = block.qNum || indexCounter;
    let currentText = block.text;
    let explanation = '';

    // Check for explanation: Lời giải, Hướng dẫn
    const explMatch = currentText.match(/(?:Lời\s+giải|Hướng\s+dẫn\s+giải|Giải\s+chi\s+tiết)[\.:\s]([\s\S]*)$/i);
    if (explMatch && explMatch.index !== undefined) {
      explanation = explMatch[1].trim();
      currentText = currentText.slice(0, explMatch.index).trim();
    }

    // Check for Multiple Choice options: A., B., C., D.
    const mcOptionRegex = /(?:^|\n|\s{2,})([A-D])[\.\)]\s*([\s\S]*?)(?=(?:[A-D][\.\)]|$))/g;
    const mcMatches = Array.from(currentText.matchAll(mcOptionRegex));

    // Check for True/False: a), b), c), d)
    const tfOptionRegex = /(?:^|\n)\s*([a-d])[\)\.]\s*([\s\S]*?)(?=(?:\n\s*[a-d][\)\.]|$))/gi;
    const tfMatches = Array.from(currentText.matchAll(tfOptionRegex));

    let type: Question['type'] = 'multiple_choice';
    const options: string[] = [];
    let correctAnswer: string | boolean[] | string[] = '';
    let content = currentText;

    if (tfMatches.length >= 3) {
      type = 'true_false';
      const firstTfIndex = currentText.search(/(?:^|\n)\s*[a-d][\)\.]/i);
      if (firstTfIndex > 0) {
        content = currentText.slice(0, firstTfIndex).trim();
      }

      const tfAnswers: boolean[] = [];
      tfMatches.forEach(m => {
        let optText = m[2].trim();
        const isTrue = /\((?:Đúng|Đ)\)|\*/i.test(optText);
        optText = optText.replace(/\((?:Đúng|Sai|Đ|S)\)|\*/gi, '').trim();
        options.push(optText);
        tfAnswers.push(isTrue);
      });
      correctAnswer = tfAnswers;
    } else if (mcMatches.length >= 2) {
      type = 'multiple_choice';
      const firstMcIndex = currentText.search(/(?:^|\n|\s{2,})[A-D][\.\)]/);
      if (firstMcIndex > 0) {
        content = currentText.slice(0, firstMcIndex).trim();
      }

      let detectedLetter = '';
      mcMatches.forEach(m => {
        const letter = m[1].toUpperCase();
        let optText = m[2].trim();

        if (/\*|\((?:Đúng|Đ)\)/i.test(optText) && !detectedLetter) {
          detectedLetter = letter;
        }

        optText = optText.replace(/\*|\((?:Đúng|Sai|Đ|S)\)/gi, '').trim();
        options.push(optText);
      });

      correctAnswer = detectedLetter;
    } else {
      warnings.push(`Câu ${qNum}: Bố cục các phương án chưa rõ ràng từ file PDF.`);
    }

    const rawQuestion: Question = {
      id: `q_pdf_${Date.now()}_${indexCounter}`,
      questionNumber: qNum,
      type,
      content: content.trim(),
      options,
      correctAnswer,
      explanation: explanation || undefined,
      points: 1,
      rawText: block.text,
    };

    const validatedQ = applyValidationToQuestion(rawQuestion);
    questions.push(validatedQ);
    indexCounter++;
  }

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
