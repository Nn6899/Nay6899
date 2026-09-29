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
import { prepareExamText } from './answerKey';
import { extractMathTypeLatexFromText, replaceUnicodeMathSymbolsOutsideMath } from './mathtypeConverter';

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
  text = replaceUnicodeMathSymbolsOutsideMath(text);

  // 2. Tách bảng đáp án + phần lời giải cuối đề
  const prepared = prepareExamText(text);
  const answerKeyMap = prepared.answerKeyMap;
  const parsingBody = prepared.body;
  warnings.push(...prepared.warnings);

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
