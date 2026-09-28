/**
 * Question Splitter Utility
 * 
 * Accurately detects and splits raw exam text into individual question blocks based on Vietnamese exam patterns:
 * - "Câu x.", "Câu x:", "câu x.", "câu x:"
 * - "Bài x.", "Bài x:", "bài x.", "bài x:"
 * - Variations: "Câu x -", "Bài x -", "Câu x ", "Bài x ", bold variants "**Câu 1.**", "**Câu 1:**", etc.
 * - Arabic (1, 2, 3, ...) and Roman numerals (I, II, III, IV, ...).
 * 
 * Preserves embedded LaTeX formulas ($...$, $$...$$) and parses options (A-D, a-d), answer keys, and explanations.
 */

import { Question } from '../../types/question';
import { applyValidationToQuestion } from './questionValidator';

export interface SplitQuestionBlock {
  qNum: number;
  prefix: string; // e.g., "Câu 1.", "Bài 2:"
  rawText: string;
}

/**
 * Regex matching question start markers:
 * Matches:
 * - Câu 1., Câu 1:, câu 1., câu 1:, Câu 1 -, Câu 1
 * - Bài 1., Bài 1:, bài 1., bài 1:, Bài 1 -, Bài 1
 * - Câu I., Câu I:, Bài II., Bài II:
 * - Markdown variants: **Câu 1.**, **Câu 1:**, **Bài 1.**, **Bài 1:**, <b>Câu 1:</b>
 */
export const QUESTION_START_REGEX =
  /(?:^|\n)\s*(?:\*{1,2}|<b>)?(?:Câu|câu|Bài|bài)\s*([0-9]+|[IVXLCDMivxlcdm]+)(?:\s*[\.:\-])(?:\*{1,2}|<\/b>)?(?:\s+|$)/g;

/**
 * Checks if a string contains question start markers
 */
export function hasQuestionMarkers(text: string): boolean {
  if (!text) return false;
  const regex = new RegExp(QUESTION_START_REGEX.source, 'i');
  return regex.test(text);
}

/**
 * Splits raw exam text into question blocks based on:
 * "Câu x.", "Câu x:", "câu x.", "câu x:", "Bài x.", "Bài x:", "bài x.", "bài x:"
 */
export function splitTextIntoQuestionBlocks(rawText: string): SplitQuestionBlock[] {
  if (!rawText || !rawText.trim()) return [];

  // Reset regex index
  const regex = new RegExp(QUESTION_START_REGEX.source, 'gi');
  const matches = Array.from(rawText.matchAll(regex));

  if (matches.length === 0) {
    // Fallback: Check if there's any "Câu \d+" or "Bài \d+" without trailing dot/colon
    const fallbackRegex = /(?:^|\n)\s*(?:Câu|câu|Bài|bài)\s*([0-9]+)\s+/gi;
    const fallbackMatches = Array.from(rawText.matchAll(fallbackRegex));

    if (fallbackMatches.length > 0) {
      return extractBlocksFromMatches(rawText, fallbackMatches);
    }

    // Single block fallback
    return [{
      qNum: 1,
      prefix: 'Câu 1.',
      rawText: rawText.trim(),
    }];
  }

  return extractBlocksFromMatches(rawText, matches);
}

/**
 * Helper to slice text between matched marker positions
 */
function extractBlocksFromMatches(fullText: string, matches: RegExpMatchArray[]): SplitQuestionBlock[] {
  const blocks: SplitQuestionBlock[] = [];

  for (let i = 0; i < matches.length; i++) {
    const currentMatch = matches[i];
    const markerText = currentMatch[0].trim();
    const rawNumberStr = currentMatch[1];

    let qNum = parseInt(rawNumberStr, 10);
    if (isNaN(qNum)) {
      // Try roman numeral parse or default to index + 1
      qNum = parseRomanNumeral(rawNumberStr) || (i + 1);
    }

    // Determine content boundaries
    const startIndex = (currentMatch.index ?? 0) + currentMatch[0].length;
    const endIndex = i < matches.length - 1 ? (matches[i + 1].index ?? fullText.length) : fullText.length;
    const blockContent = fullText.slice(startIndex, endIndex).trim();

    blocks.push({
      qNum,
      prefix: markerText,
      rawText: blockContent,
    });
  }

  return blocks;
}

/**
 * Parses Roman numerals to number
 */
function parseRomanNumeral(roman: string): number {
  const romanMap: Record<string, number> = {
    i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000,
  };
  const str = roman.toLowerCase();
  let total = 0;
  for (let i = 0; i < str.length; i++) {
    const current = romanMap[str[i]] || 0;
    const next = romanMap[str[i + 1]] || 0;
    if (current < next) {
      total -= current;
    } else {
      total += current;
    }
  }
  return total > 0 ? total : 0;
}

/**
 * Parses an array of SplitQuestionBlocks into fully structured Question objects.
 * Extracts:
 * - Content (with preserved LaTeX formulas)
 * - Multiple choice options A, B, C, D (handles formulas, inline options, asterisk markers)
 * - True / False 4 sub-items a, b, c, d
 * - Short answer
 * - Explanations (Lời giải / Hướng dẫn giải)
 * - Correct answers from answerKeyMap or inline markers
 */
export function parseQuestionBlocksToQuestions(
  blocks: SplitQuestionBlock[],
  answerKeyMap: Map<number, string> = new Map()
): Question[] {
  const questions: Question[] = [];
  let indexCounter = 1;

  for (const block of blocks) {
    const qNum = block.qNum || indexCounter;
    let currentText = block.rawText;
    let explanation = '';

    // 1. Extract explanation: "Lời giải:", "Hướng dẫn giải:", "Giải chi tiết:", "HD:"
    const explMatch = currentText.match(
      /(?:^|\n)\s*(?:\*{1,2}|<b>)?(?:Lời\s+giải|Hướng\s+dẫn\s+giải|Giải\s+chi\s+tiết|HD|Lời\s+giải\s+chi\s+tiết)[\.:\s\-](?:\*{1,2}|<\/b>)?([\s\S]*)$/i
    );
    if (explMatch && explMatch.index !== undefined) {
      explanation = explMatch[1].trim();
      currentText = currentText.slice(0, explMatch.index).trim();
    }

    // 2. Check for Multiple Choice format (A., B., C., D. or A), B), C), D))
    // Strict uppercase only, can be at line start or preceded by space/formula
    const mcOptionRegex = /(?:^|\n|\s{2,}|(?<=[^\$]\s))(?:\*{1,2}|<b>)?([A-D])[\.\)](?:\*{1,2}|<\/b>)?\s*([\s\S]*?)(?=(?:(?:\n|\s{2,}|(?<=[^\$]\s))(?:\*{1,2}|<b>)?[A-D][\.\)]|$))/g;
    const mcMatches = Array.from(currentText.matchAll(mcOptionRegex));

    // 3. Check for True/False format: strict lowercase (a), b), c), d) or a., b., c., d.)
    const tfOptionRegex = /(?:^|\n|\s{2,})(?:\*{1,2}|<b>)?([a-d])[\)\.](?:\*{1,2}|<\/b>)?\s*([\s\S]*?)(?=(?:(?:\n|\s{2,})(?:\*{1,2}|<b>)?[a-d][\)\.]|$))/g;
    const tfMatches = Array.from(currentText.matchAll(tfOptionRegex));

    let type: Question['type'] = 'multiple_choice';
    const options: string[] = [];
    let correctAnswer: string | boolean[] | string[] = answerKeyMap.get(qNum) || '';
    let content = currentText;

    if (mcMatches.length >= 2) {
      // Multiple Choice format
      type = 'multiple_choice';
      const firstMcIndex = currentText.search(/(?:^|\n|\s{2,})(?:\*{1,2}|<b>)?[A-D][\.\)]/);
      if (firstMcIndex > 0) {
        content = currentText.slice(0, firstMcIndex).trim();
      }

      let detectedLetter = '';
      mcMatches.forEach(m => {
        const letter = m[1].toUpperCase();
        let optText = m[2].trim();

        // Check if marked as correct with * or [Đúng] or (Đúng)
        if (/\*|\((?:Đúng|Đ)\)|\[(?:Đúng|Đ)\]/i.test(optText) && !detectedLetter) {
          detectedLetter = letter;
        }

        optText = optText.replace(/\*|\((?:Đúng|Sai|Đ|S)\)|\[(?:Đúng|Sai|Đ|S)\]/gi, '').trim();
        options.push(optText);
      });

      if (!correctAnswer && detectedLetter) {
        correctAnswer = detectedLetter;
      }
    } else if (tfMatches.length >= 3) {
      // True/False GDPT 2018 format
      type = 'true_false';
      const firstTfIndex = currentText.search(/(?:^|\n|\s{2,})(?:\*{1,2}|<b>)?[a-d][\)\.]/);
      if (firstTfIndex > 0) {
        content = currentText.slice(0, firstTfIndex).trim();
      }

      const tfAnswers: boolean[] = [];
      tfMatches.forEach(m => {
        let optText = m[2].trim();
        // Check if marked with (Đúng), (Đ), *, [Đ], (Sai), (S)
        const isTrue = /\((?:Đúng|Đ)\)|\[(?:Đúng|Đ)\]|\*/i.test(optText);
        optText = optText.replace(/\((?:Đúng|Sai|Đ|S)\)|\[(?:Đúng|Sai|Đ|S)\]|\*/gi, '').trim();
        options.push(optText);
        tfAnswers.push(isTrue);
      });

      if (!correctAnswer || typeof correctAnswer === 'string') {
        correctAnswer = tfAnswers;
      }
    } else {
      // Could be short answer question
      const shortAnsMatch = currentText.match(
        /(?:^|\n)\s*(?:Đáp\s+án|Đáp\s+số|Kết\s+quả|Trả\s+lời)[\.:\s]\s*([^\n]+)/i
      );
      if (shortAnsMatch) {
        type = 'short_answer';
        correctAnswer = shortAnsMatch[1].trim();
        content = currentText.replace(shortAnsMatch[0], '').trim();
      }
    }

    // Clean up content: strip leading tags like [2D1-1] or [Mức độ 1]
    content = content.replace(/^\[[^\]]*\]\s*/, '').trim();

    const rawQuestion: Question = {
      id: `q_split_${Date.now()}_${indexCounter}`,
      questionNumber: qNum,
      type,
      content,
      options,
      correctAnswer,
      explanation: explanation || undefined,
      points: 1,
      rawText: block.rawText,
    };

    const validatedQ = applyValidationToQuestion(rawQuestion);
    questions.push(validatedQ);
    indexCounter++;
  }

  return questions;
}
