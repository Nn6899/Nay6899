import mammoth from 'mammoth';
import { Question, ParseResult } from '../../types/question';
import { applyValidationToQuestion } from './questionValidator';

/**
 * Parses DOCX ArrayBuffer into structured Question array.
 */
export async function parseDocxExam(buffer: ArrayBuffer, fileName = 'exam.docx'): Promise<ParseResult> {
  const warnings: string[] = [];
  const questions: Question[] = [];

  let rawText = '';
  let htmlText = '';

  try {
    const [rawRes, htmlRes] = await Promise.all([
      mammoth.extractRawText({ arrayBuffer: buffer }),
      mammoth.convertToHtml({ arrayBuffer: buffer }),
    ]);
    rawText = rawRes.value;
    htmlText = htmlRes.value;
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

  // 1. Check for Answer Key Table at the bottom (e.g. "BẢNG ĐÁP ÁN" or "ĐÁP ÁN")
  const answerKeyMap = new Map<number, string>();
  const answerKeyRegex = /(?:BẢNG\s+ĐÁP\s+ÁN|ĐÁP\s+ÁN\s+TRẮC\s+NGHIỆM|BẢNG\s+TRẢ\s+LỜI)([\s\S]*)$/i;
  const answerKeyMatch = rawText.match(answerKeyRegex);

  if (answerKeyMatch) {
    const keySection = answerKeyMatch[1];
    // Match pairs like "1.A", "1 - B", "1: C", "1 A"
    const pairRegex = /(\d+)\s*[\.\-:\s]\s*([A-D])/gi;
    let keyPairMatch: RegExpExecArray | null;
    while ((keyPairMatch = pairRegex.exec(keySection)) !== null) {
      const qIndex = parseInt(keyPairMatch[1], 10);
      const ansChar = keyPairMatch[2].toUpperCase();
      answerKeyMap.set(qIndex, ansChar);
    }
  }

  // Strip answer key section from questions parsing body to avoid false positives
  const parsingBody = answerKeyMatch
    ? rawText.slice(0, answerKeyMatch.index)
    : rawText;

  // 2. Split into question blocks by "Câu 1", "Câu 2", "Bài 1", etc.
  const questionMarkerRegex = /(?:^|\n)\s*(?:Câu|Bài)\s*(\d+)[\.:\-\s]/gi;
  const markers = Array.from(parsingBody.matchAll(questionMarkerRegex));

  const questionBlocks: { qNum: number; text: string }[] = [];

  if (markers.length > 0) {
    for (let i = 0; i < markers.length; i++) {
      const currentMarker = markers[i];
      const qNum = parseInt(currentMarker[1], 10) || i + 1;
      const startIndex = (currentMarker.index || 0) + currentMarker[0].length;
      const endIndex = i < markers.length - 1 ? markers[i + 1].index : parsingBody.length;
      const blockText = parsingBody.slice(startIndex, endIndex).trim();

      questionBlocks.push({ qNum, text: blockText });
    }
  } else {
    // Fallback: If no "Câu" marker, attempt splitting by double newlines or single block
    warnings.push('Không nhận diện được từ khóa "Câu 1.", "Câu 2." trong tệp Word. Hệ thống đã đưa nội dung vào chế độ kiểm duyệt.');
    questionBlocks.push({ qNum: 1, text: parsingBody.trim() });
  }

  // 3. Process each question block
  let indexCounter = 1;
  for (const block of questionBlocks) {
    const qNum = block.qNum || indexCounter;
    let currentText = block.text;
    let explanation = '';

    // A. Check for explanation: "Lời giải:", "Hướng dẫn giải:"
    const explMatch = currentText.match(/(?:Lời\s+giải|Hướng\s+dẫn\s+giải|Giải\s+chi\s+tiết)[\.:\s]([\s\S]*)$/i);
    if (explMatch && explMatch.index !== undefined) {
      explanation = explMatch[1].trim();
      currentText = currentText.slice(0, explMatch.index).trim();
    }

    // B. Check for True/False format (a), b), c), d) or a., b., c., d.)
    const tfOptionRegex = /(?:^|\n)\s*([a-d])[\)\.]\s*([\s\S]*?)(?=(?:\n\s*[a-d][\)\.]|$))/gi;
    const tfMatches = Array.from(currentText.matchAll(tfOptionRegex));

    // C. Check for Multiple Choice format (A., B., C., D. or A), B), C), D))
    const mcOptionRegex = /(?:^|\n|\s{2,})([A-D])[\.\)]\s*([\s\S]*?)(?=(?:[A-D][\.\)]|$))/g;
    const mcMatches = Array.from(currentText.matchAll(mcOptionRegex));

    let type: Question['type'] = 'multiple_choice';
    const options: string[] = [];
    let correctAnswer: string | boolean[] | string[] = answerKeyMap.get(qNum) || '';
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
        // Check if marked with (Đúng), (Đ), *, (Sai), (S)
        const isTrue = /\((?:Đúng|Đ)\)|\*/i.test(optText);
        optText = optText.replace(/\((?:Đúng|Sai|Đ|S)\)|\*/gi, '').trim();
        options.push(optText);
        tfAnswers.push(isTrue);
      });

      if (!correctAnswer) {
        correctAnswer = tfAnswers;
      }
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

        // Check if marked as correct with * or [Đúng]
        if (/\*|\((?:Đúng|Đ)\)/i.test(optText) && !detectedLetter) {
          detectedLetter = letter;
        }

        optText = optText.replace(/\*|\((?:Đúng|Sai|Đ|S)\)/gi, '').trim();
        options.push(optText);
      });

      if (!correctAnswer && detectedLetter) {
        correctAnswer = detectedLetter;
      }
    } else {
      // Could be short answer or ambiguous
      const shortAnsMatch = currentText.match(/(?:Đáp\s+án|Đáp\s+số|Kết\s+quả)[\.:\s]\s*([^\n]+)/i);
      if (shortAnsMatch) {
        type = 'short_answer';
        correctAnswer = shortAnsMatch[1].trim();
        content = currentText.replace(shortAnsMatch[0], '').trim();
      } else {
        // Ambiguous question
        warnings.push(`Câu ${qNum}: Không tìm thấy đủ 4 phương án A, B, C, D rõ ràng.`);
      }
    }

    const rawQuestion: Question = {
      id: `q_docx_${Date.now()}_${indexCounter}`,
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
