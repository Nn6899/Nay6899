import katex from 'katex';

export interface LatexPart {
  type: 'text' | 'inline-math' | 'block-math';
  content: string;
}

/**
 * Parses mixed text and LaTeX formulas into segments
 * Supports $...$, $$...$$, \(...\), \[...\]
 */
export function parseLatexContent(text: string): LatexPart[] {
  if (!text) return [];

  const parts: LatexPart[] = [];
  // Regex to match $$...$$, \[...\], $...$ (can span lines within a block), \(...\)
  const regex = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\$(?:[^\$\n]+|\n(?!\n)[^\$]+)+\$|\\\([\s\S]*?\\\))/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: text.substring(lastIndex, match.index),
      });
    }

    const matchedStr = match[0];
    if (matchedStr.startsWith('$$') && matchedStr.endsWith('$$')) {
      parts.push({
        type: 'block-math',
        content: matchedStr.slice(2, -2).trim(),
      });
    } else if (matchedStr.startsWith('\\[') && matchedStr.endsWith('\\]')) {
      parts.push({
        type: 'block-math',
        content: matchedStr.slice(2, -2).trim(),
      });
    } else if (matchedStr.startsWith('\\(') && matchedStr.endsWith('\\)')) {
      parts.push({
        type: 'inline-math',
        content: matchedStr.slice(2, -2).trim(),
      });
    } else if (matchedStr.startsWith('$') && matchedStr.endsWith('$')) {
      parts.push({
        type: 'inline-math',
        content: matchedStr.slice(1, -1).trim(),
      });
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push({
      type: 'text',
      content: text.substring(lastIndex),
    });
  }

  return parts;
}

/**
 * Render a single formula to HTML string via KaTeX
 */
export function renderFormulaToHtml(formula: string, isBlock = false): string {
  // Phân số, tích phân, tổng, giới hạn trong dòng hiển thị cỡ lớn cho học sinh dễ đọc (như trên đề giấy)
  if (!isBlock && /\\(?:frac|int|iint|oint|sum|prod|lim)\b/.test(formula) && !/\\displaystyle/.test(formula)) {
    formula = `\\displaystyle ${formula}`;
  }
  try {
    return katex.renderToString(formula, {
      displayMode: isBlock,
      throwOnError: false,
      // Chữ tiếng Việt trong \text{} (từ MathType) hiển thị bình thường, không cần cảnh báo
      strict: 'ignore',
      output: 'htmlAndMathml',
    });
  } catch (error) {
    console.error('KaTeX rendering error:', error);
    return `<span class="text-rose-600">[Lỗi công thức: ${formula}]</span>`;
  }
}

/**
 * Validates a single LaTeX formula by attempting strict KaTeX compilation.
 */
export function validateLatexFormula(formula: string): { isValid: boolean; error?: string } {
  if (!formula || formula.trim().length === 0) {
    return { isValid: true };
  }
  try {
    katex.renderToString(formula, {
      throwOnError: true,
      output: 'htmlAndMathml',
    });
    return { isValid: true };
  } catch (err: any) {
    return {
      isValid: false,
      error: err?.message || 'Cú pháp LaTeX không hợp lệ',
    };
  }
}

/**
 * Validates all LaTeX formulas contained within mixed text.
 * Also checks for unclosed single dollar or double dollar delimiters.
 */
export function validateLatexInText(text: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!text) return { isValid: true, errors: [] };

  // Check for unmatched single dollar signs (odd number of '$' not escaped)
  const unescapedDollars = (text.match(/(?<!\\)\$/g) || []).length;
  if (unescapedDollars % 2 !== 0) {
    errors.push('Phát hiện dấu "$" chưa đóng hoặc bị lẻ trong công thức toán học.');
  }

  // Parse all math segments and test compilation
  const parts = parseLatexContent(text);
  for (const part of parts) {
    if (part.type === 'inline-math' || part.type === 'block-math') {
      const res = validateLatexFormula(part.content);
      if (!res.isValid) {
        errors.push(`Công thức "$${part.content}$" bị lỗi: ${res.error}`);
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

