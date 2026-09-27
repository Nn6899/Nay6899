import { describe, it, expect } from 'vitest';
import { parseLatexContent, renderFormulaToHtml } from '../src/lib/latex';

describe('LaTeX Parsing and Rendering Engine', () => {
  it('should parse plain text without formulas', () => {
    const text = 'Đây là câu hỏi trắc nghiệm vật lý thông thường.';
    const parts = parseLatexContent(text);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toEqual({
      type: 'text',
      content: text,
    });
  });

  it('should parse inline LaTeX $...$', () => {
    const text = 'Tính giá trị của $x^2 + 2x + 1$ khi $x = 2$.';
    const parts = parseLatexContent(text);
    expect(parts).toHaveLength(5);
    expect(parts[0]).toEqual({ type: 'text', content: 'Tính giá trị của ' });
    expect(parts[1]).toEqual({ type: 'inline-math', content: 'x^2 + 2x + 1' });
    expect(parts[2]).toEqual({ type: 'text', content: ' khi ' });
    expect(parts[3]).toEqual({ type: 'inline-math', content: 'x = 2' });
    expect(parts[4]).toEqual({ type: 'text', content: '.' });
  });

  it('should parse block LaTeX $$...$$', () => {
    const text = 'Công thức nghiệm:\n$$\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$';
    const parts = parseLatexContent(text);
    expect(parts).toHaveLength(2);
    expect(parts[0].type).toBe('text');
    expect(parts[1].type).toBe('block-math');
    expect(parts[1].content).toBe('\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}');
  });

  it('should render formula to valid HTML via KaTeX', () => {
    const html = renderFormulaToHtml('E = mc^2', false);
    expect(html).toContain('katex');
    expect(html).toContain('mc');
  });
});
