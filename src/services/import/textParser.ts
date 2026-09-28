/**
 * Text & Pasted Exam Parser
 * 
 * Parses plain text files (.txt) and pasted exam text.
 * Automatically converts MathType tags, MathML, and unicode symbols into LaTeX ($...$),
 * splits questions by "Câu x.", "Câu x:", "câu x.", "câu x:", "Bài x.", "Bài x:", "bài x.", "bài x:"
 * and extracts options, answer keys, and explanations.
 */

import { Question, ParseResult } from '../../types/question';
import { splitTextIntoQuestionBlocks, parseQuestionBlocksToQuestions } from './questionSplitter';
import { extractMathTypeLatexFromText, replaceUnicodeMathSymbols } from './mathtypeConverter';

export function parseTextExam(rawContent: string, fileName = 'exam.txt'): ParseResult {
  const warnings: string[] = [];

  if (!rawContent || rawContent.trim().length === 0) {
    return {
      success: false,
      fileType: 'txt',
      fileName,
      questions: [],
      warnings: ['Nội dung đề thi rỗng.'],
      totalParsed: 0,
      validCount: 0,
      needsReviewCount: 0,
    };
  }

  // 1. Process MathType comments, MathML tags, and symbols
  let text = extractMathTypeLatexFromText(rawContent);
  text = replaceUnicodeMathSymbols(text);

  // 2. Check for separate Answer Key section (BẢNG ĐÁP ÁN, ĐÁP ÁN TRẮC NGHIỆM)
  const answerKeyMap = new Map<number, string>();
  const answerKeyHeaderRegex = /(?:BẢNG\s+ĐÁP\s+ÁN|ĐÁP\s+ÁN\s+TRẮC\s+NGHIỆM|BẢNG\s+TRẢ\s+LỜI)/i;
  const headerMatch = text.match(answerKeyHeaderRegex);

  let parsingBody = text;

  if (headerMatch && headerMatch.index !== undefined) {
    const afterHeader = text.slice(headerMatch.index + headerMatch[0].length);
    // Check if there is a question start after this header
    const nextQuestionMatch = afterHeader.match(/(?:^|\n)\s*(?:Câu|câu|Bài|bài)\s*([0-9]+|[IVXLCDMivxlcdm]+)[\.:\-\s]/i);

    let keySection = '';
    if (nextQuestionMatch && nextQuestionMatch.index !== undefined) {
      keySection = afterHeader.slice(0, nextQuestionMatch.index);
      parsingBody = text.slice(0, headerMatch.index) + '\n' + afterHeader.slice(nextQuestionMatch.index);
    } else {
      keySection = afterHeader;
      parsingBody = text.slice(0, headerMatch.index);
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

  // 3. Split by Câu x., Câu x:, Bài x., Bài x:
  const blocks = splitTextIntoQuestionBlocks(parsingBody);

  if (blocks.length === 1 && blocks[0].qNum === 1 && blocks[0].rawText === parsingBody.trim()) {
    warnings.push('Không nhận diện được từ khóa câu hỏi như "Câu 1.", "Câu 1:", "Bài 1.", "Bài 1:". Vui lòng kiểm tra lại cấu trúc văn bản.');
  }

  // 4. Parse blocks into structured Question objects
  const questions: Question[] = parseQuestionBlocksToQuestions(blocks, answerKeyMap);

  const validCount = questions.filter(q => q.validationStatus === 'VALID').length;
  const needsReviewCount = questions.length - validCount;

  return {
    success: questions.length > 0,
    fileType: 'txt',
    fileName,
    questions,
    warnings,
    totalParsed: questions.length,
    validCount,
    needsReviewCount,
    rawTextSample: rawContent.slice(0, 300),
  };
}
