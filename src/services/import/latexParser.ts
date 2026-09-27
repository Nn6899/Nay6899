import { Question, ParseResult } from '../../types/question';
import { applyValidationToQuestion } from './questionValidator';

/**
 * Extracts balanced curly braces content starting at index where char is '{'.
 * Returns the inner content and the end index of the closing '}'.
 */
export function extractBalancedBraces(text: string, startIndex: number): { content: string; endIndex: number } | null {
  const openIdx = text.indexOf('{', startIndex);
  if (openIdx === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = openIdx; i < text.length; i++) {
    const char = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (char === '\\') {
      escape = true;
      continue;
    }

    if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) {
        return {
          content: text.slice(openIdx + 1, i),
          endIndex: i,
        };
      }
    }
  }

  // Unclosed brace, fallback to remaining text
  return {
    content: text.slice(openIdx + 1),
    endIndex: text.length - 1,
  };
}

/**
 * Removes LaTeX comments (% ...) while preserving escaped \%
 */
export function stripLatexComments(tex: string): string {
  const lines = tex.split('\n');
  const cleanedLines = lines.map(line => {
    let result = '';
    let escape = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (escape) {
        result += c;
        escape = false;
        continue;
      }
      if (c === '\\') {
        result += c;
        escape = true;
        continue;
      }
      if (c === '%') {
        // Comment starts here
        break;
      }
      result += c;
    }
    return result;
  });
  return cleanedLines.join('\n');
}

/**
 * Parses LaTeX exam document string into Question objects.
 */
export function parseLatexExam(rawTex: string, fileName = 'exam.tex'): ParseResult {
  const warnings: string[] = [];
  const questions: Question[] = [];

  if (!rawTex || rawTex.trim().length === 0) {
    return {
      success: false,
      fileType: 'tex',
      fileName,
      questions: [],
      warnings: ['Nội dung tệp LaTeX rỗng.'],
      totalParsed: 0,
      validCount: 0,
      needsReviewCount: 0,
    };
  }

  // 1. Strip comments
  let text = stripLatexComments(rawTex);

  // 2. Extract document body if \begin{document} is present
  const docMatch = text.match(/\\begin\{document\}([\s\S]*?)\\end\{document\}/);
  if (docMatch) {
    text = docMatch[1];
  }

  // 3. Match questions by environment: \begin{ex}...\end{ex}, \begin{bt}...\end{bt}, \begin{cau}...\end{cau}
  const envRegex = /\\begin\{(ex|bt|cau|question)\}([\s\S]*?)\\end\{\1\}/g;
  let match: RegExpExecArray | null;
  const rawBlocks: string[] = [];

  while ((match = envRegex.exec(text)) !== null) {
    rawBlocks.push(match[2].trim());
  }

  // Fallback: If no \begin{ex} environments found, attempt split by "Câu \d+" or "\textbf{Câu \d+}"
  if (rawBlocks.length === 0) {
    const splitRegex = /(?:^|\n)(?:\\textbf\{)?(?:Câu|Bài)\s*\d+[\.:\s]/gi;
    const matches = Array.from(text.matchAll(splitRegex));

    if (matches.length > 0) {
      for (let i = 0; i < matches.length; i++) {
        const start = (matches[i].index || 0) + matches[i][0].length;
        const end = i < matches.length - 1 ? matches[i + 1].index : text.length;
        const block = text.slice(start, end).trim();
        if (block) {
          rawBlocks.push(block);
        }
      }
      warnings.push(`Không tìm thấy cấu trúc \\begin{ex}...\\end{ex}. Đã phân tách đề theo từ khóa 'Câu/Bài' (${rawBlocks.length} mục).`);
    } else {
      // Entire text might be a single question or custom format
      warnings.push('Không nhận diện được cấu trúc câu hỏi LaTeX chuẩn (ví dụ \\begin{ex}...\\end{ex} hoặc Câu 1:). Vui lòng kiểm tra lại cấu trúc file.');
      rawBlocks.push(text.trim());
    }
  }

  // 4. Parse each question block
  let qNum = 1;
  for (const block of rawBlocks) {
    let currentBlock = block;
    let explanation = '';

    // A. Extract \loigiai{...} or \huongdan{...}
    const loigiaiMatch = currentBlock.match(/\\(loigiai|huongdan)\s*\{/);
    if (loigiaiMatch && loigiaiMatch.index !== undefined) {
      const braceRes = extractBalancedBraces(currentBlock, loigiaiMatch.index + loigiaiMatch[0].length - 1);
      if (braceRes) {
        explanation = braceRes.content.trim();
        // Remove loigiai part from block
        currentBlock = currentBlock.slice(0, loigiaiMatch.index) + currentBlock.slice(braceRes.endIndex + 1);
      }
    }

    // B. Check for \choiceTF, \choice, or \shortans
    const isChoiceTF = /\\choiceTF(?:\s*\[[^\]]*\])?\s*\{/.test(currentBlock);
    const isShortAns = /\\shortans\s*\{/.test(currentBlock);
    const isChoice = /\\choice(?:\s*\[[^\]]*\])?\s*\{/.test(currentBlock);

    let type: Question['type'] = 'multiple_choice';
    const options: string[] = [];
    let correctAnswer: string | boolean[] | string[] = '';
    let content = currentBlock;

    if (isChoiceTF) {
      type = 'true_false';
      const marker = currentBlock.match(/\\choiceTF(?:\s*\[[^\]]*\])?\s*\{/);
      if (marker && marker.index !== undefined) {
        content = currentBlock.slice(0, marker.index).trim();
        let cursor = marker.index + marker[0].indexOf('{');
        const tfAnswers: boolean[] = [];

        // Extract up to 4 items
        for (let i = 0; i < 4; i++) {
          const res = extractBalancedBraces(currentBlock, cursor);
          if (!res) break;

          let optText = res.content.trim();
          const isTrue = /\\True\b|\\true\b/i.test(optText);
          optText = optText.replace(/\\True\b|\\true\b/gi, '').trim();

          options.push(optText);
          tfAnswers.push(isTrue);
          cursor = res.endIndex + 1;
        }

        correctAnswer = tfAnswers;
      }
    } else if (isShortAns) {
      type = 'short_answer';
      const marker = currentBlock.match(/\\shortans\s*\{/);
      if (marker && marker.index !== undefined) {
        content = currentBlock.slice(0, marker.index).trim();
        const res = extractBalancedBraces(currentBlock, marker.index + marker[0].length - 1);
        if (res) {
          correctAnswer = res.content.trim();
        }
      }
    } else if (isChoice) {
      type = 'multiple_choice';
      const marker = currentBlock.match(/\\choice(?:\s*\[[^\]]*\])?\s*\{/);
      if (marker && marker.index !== undefined) {
        content = currentBlock.slice(0, marker.index).trim();
        let cursor = marker.index + marker[0].indexOf('{');
        const optionLetters = ['A', 'B', 'C', 'D', 'E', 'F'];
        let detectedAns = '';

        for (let i = 0; i < 6; i++) {
          const res = extractBalancedBraces(currentBlock, cursor);
          if (!res) break;

          let optText = res.content.trim();
          const hasTrue = /\\True\b|\\true\b/i.test(optText);
          if (hasTrue && !detectedAns) {
            detectedAns = optionLetters[i];
          }

          optText = optText.replace(/\\True\b|\\true\b/gi, '').trim();
          options.push(optText);
          cursor = res.endIndex + 1;

          // Check if there is another '{' ahead (ignoring whitespace)
          const nextOpen = currentBlock.slice(cursor).search(/\S/);
          if (nextOpen === -1 || currentBlock[cursor + nextOpen] !== '{') {
            break;
          }
          cursor += nextOpen;
        }

        correctAnswer = detectedAns;
      }
    }

    // Fallback: If correctAnswer was not detected via \True, check in \loigiai / explanation
    if (!correctAnswer && explanation && type === 'multiple_choice') {
      const ansMatch = explanation.match(/(?:chọn|đáp án|đáp số|kết quả)\s*(?:là|:)?\s*([A-F])\b/i);
      if (ansMatch) {
        correctAnswer = ansMatch[1].toUpperCase();
      }
    }

    if (!isChoiceTF && !isShortAns && !isChoice) {
      // Check if options are written inline like A. ... B. ... C. ... D.
      const inlineOptRegex = /(?:^|\s)(?:[A-D]\.|\([A-D]\))\s*([\s\S]*?)(?=(?:[A-D]\.|\([A-D]\)|$))/g;
      const inlineMatches = Array.from(currentBlock.matchAll(inlineOptRegex));
      if (inlineMatches.length >= 2) {
        type = 'multiple_choice';
        const firstOptIndex = currentBlock.search(/(?:^|\s)(?:[A-D]\.|\([A-D]\))\s*/);
        if (firstOptIndex > 0) {
          content = currentBlock.slice(0, firstOptIndex).trim();
        }

        inlineMatches.forEach((m, idx) => {
          let optText = m[1].trim();
          if (/\*|\\True/i.test(optText) && !correctAnswer) {
            correctAnswer = ['A', 'B', 'C', 'D'][idx] || '';
            optText = optText.replace(/\*|\\True/gi, '').trim();
          }
          options.push(optText);
        });
      }
    }

    // Clean up content: strip leading tags like [2D1-1] or [Mức độ 1] or "Câu 1:"
    content = content
      .replace(/^\[[^\]]*\]\s*/, '')
      .replace(/^(?:Câu|Bài)\s*\d+[\.:\s]*/i, '')
      .trim();

    const rawQuestion: Question = {
      id: `q_tex_${Date.now()}_${qNum}`,
      questionNumber: qNum,
      type,
      content,
      options,
      correctAnswer,
      explanation: explanation || undefined,
      points: 1,
      rawText: block,
    };

    const validatedQ = applyValidationToQuestion(rawQuestion);
    questions.push(validatedQ);
    qNum++;
  }

  const validCount = questions.filter(q => q.validationStatus === 'VALID').length;
  const needsReviewCount = questions.length - validCount;

  return {
    success: questions.length > 0,
    fileType: 'tex',
    fileName,
    questions,
    warnings,
    totalParsed: questions.length,
    validCount,
    needsReviewCount,
    rawTextSample: rawTex.slice(0, 300),
  };
}
