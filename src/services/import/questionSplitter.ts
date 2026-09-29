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
  /(?:^|\n)[ \t]*(?:\*{1,2}|<b>)?(?:Câu|câu|CÂU|Bài|bài|BÀI)[ \t]*([0-9]+|[IVXLCDMivxlcdm]+)[ \t]*(?:\([^)\n]{0,40}\)|\[[^\]\n]{0,40}\])?[ \t]*[\.:\-](?:\*{1,2}|<\/b>)?/g;

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

interface OptionSequence {
  content: string;
  options: string[];
}

/**
 * Tìm dãy phương án theo thứ tự (A. B. C. D. hoặc a) b) c) d)) trong một câu.
 * - Nhãn phải đứng đầu dòng hoặc sau khoảng trắng (không bắt "ABCD.A'B'C'D'").
 * - Chọn dãy bắt đầu bằng A/a xuất hiện SAU CÙNG mà có đủ B, C, D phía sau -> không nhầm "vuông tại A." trong đề.
 * - Cho phép dấu * đánh dấu đáp án đúng đứng trước nhãn: "*A." hoặc "*a)".
 */
export function findOptionSequence(text: string, kind: 'upper' | 'lower'): OptionSequence | null {
  const letters = kind === 'upper' ? ['A', 'B', 'C', 'D'] : ['a', 'b', 'c', 'd'];
  const punct = kind === 'upper' ? '[.)]' : '[).]';
  const re = new RegExp(`(^|\\n|[ \\t\\u00a0])(\\*?)(?:\\*\\*|<b>)?([${letters.join('')}])${punct}(?:\\*\\*|<\\/b>)?(?=\\s|$|\\*|\\$)`, 'g');

  type Cand = { letter: string; start: number; end: number; star: boolean };
  const cands: Cand[] = [];
  for (const m of text.matchAll(re)) {
    const lead = m[1] || '';
    const start = (m.index ?? 0) + lead.length;
    cands.push({ letter: m[3], start, end: (m.index ?? 0) + m[0].length, star: m[2] === '*' });
  }

  const minCount = kind === 'upper' ? 2 : 3;
  for (let i = cands.length - 1; i >= 0; i--) {
    if (cands[i].letter !== letters[0]) continue;
    const seq: Cand[] = [cands[i]];
    for (let j = i + 1; j < cands.length && seq.length < 4; j++) {
      if (cands[j].letter === letters[seq.length]) seq.push(cands[j]);
    }
    if (seq.length < minCount) continue;

    const options = seq.map((c, k) => {
      const endPos = k + 1 < seq.length ? seq[k + 1].start : text.length;
      const body = text.slice(c.end, endPos).trim();
      return c.star ? `*${body}` : body;
    });
    return { content: text.slice(0, seq[0].start).trim(), options };
  }
  return null;
}

/**
 * Nhận biết và gỡ dấu đánh dấu đáp án đúng trong một phương án:
 *  "*..." (dấu * đầu), "...*" (dấu * cuối, không phải ^* trong công thức), "(Đúng)", "[Đ]"...
 */
export function stripCorrectMarker(option: string): { text: string; isMarked: boolean; isFalseMarked: boolean } {
  let text = option.trim();
  let isMarked = false;
  let isFalseMarked = false;

  if (/^\*(?!\*)/.test(text)) {
    isMarked = true;
    text = text.slice(1).trim();
  }
  if (/[^\^_\\*]\*$/.test(text) || text === '*') {
    isMarked = true;
    text = text.slice(0, -1).trim();
  }
  if (/\((?:Đúng|Đ)\)|\[(?:Đúng|Đ)\]/i.test(text)) isMarked = true;
  if (/\((?:Sai|S)\)|\[(?:Sai|S)\]/i.test(text)) isFalseMarked = true;
  text = text.replace(/\s*(?:\((?:Đúng|Sai|Đ|S)\)|\[(?:Đúng|Sai|Đ|S)\])\s*/gi, ' ').trim();

  return { text, isMarked, isFalseMarked };
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
  // Đề GDPT 2018 đánh số lại từ Câu 1 ở mỗi PHẦN -> bảng đáp án A-D chỉ áp dụng cho phần đầu
  let partIndex = 0;
  let lastNum = 0;

  for (const block of blocks) {
    const qNum = block.qNum || indexCounter;
    if (qNum <= lastNum) partIndex++;
    lastNum = qNum;
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

    // 2. Tìm dãy phương án A-D (trắc nghiệm) hoặc a-d (đúng/sai).
    // Lấy dãy A,B,C,D (theo thứ tự) nằm CUỐI câu để tránh nhầm "vuông tại A." trong đề bài.
    const mc = findOptionSequence(currentText, 'upper');
    const tf = mc ? null : findOptionSequence(currentText, 'lower');

    let type: Question['type'] = 'multiple_choice';
    const options: string[] = [];
    let correctAnswer: string | boolean[] | string[] = (partIndex === 0 && answerKeyMap.get(qNum)) || '';
    let content = currentText;

    if (mc) {
      type = 'multiple_choice';
      content = mc.content;

      const marked: string[] = [];
      mc.options.forEach((opt, i) => {
        const { text, isMarked } = stripCorrectMarker(opt);
        if (isMarked) marked.push(String.fromCharCode(65 + i));
        options.push(text);
      });

      // Chỉ nhận khi đúng 1 phương án được đánh dấu (tránh nhầm khi cả 4 cùng định dạng)
      if (!correctAnswer && marked.length === 1) {
        correctAnswer = marked[0];
      }
    } else if (tf) {
      // True/False GDPT 2018 format
      type = 'true_false';
      content = tf.content;

      const tfAnswers: boolean[] = [];
      tf.options.forEach(opt => {
        const { text, isMarked, isFalseMarked } = stripCorrectMarker(opt);
        options.push(text);
        tfAnswers.push(isMarked && !isFalseMarked);
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
