import { describe, it, expect } from 'vitest';
import {
  splitTextIntoQuestionBlocks,
  parseQuestionBlocksToQuestions,
  hasQuestionMarkers,
} from '../src/services/import/questionSplitter';
import {
  convertOmmlToLatex,
  convertMathMlToLatex,
  extractMathTypeLatexFromText,
  replaceUnicodeMathSymbols,
} from '../src/services/import/mathtypeConverter';
import { parseTextExam } from '../src/services/import/textParser';

describe('Question Splitter (Câu x., Câu x:, Bài x., Bài x:)', () => {
  it('detects presence of question markers', () => {
    expect(hasQuestionMarkers('Câu 1. Cho hàm số')).toBe(true);
    expect(hasQuestionMarkers('câu 2: Tập xác định')).toBe(true);
    expect(hasQuestionMarkers('Bài 3. Tính tích phân')).toBe(true);
    expect(hasQuestionMarkers('bài 4: Cho hình lăng trụ')).toBe(true);
    expect(hasQuestionMarkers('Không có từ khóa')).toBe(false);
  });

  it('splits questions starting with Câu x., Câu x:, Bài x., Bài x:, and lowercase variants', () => {
    const examText = `
Câu 1. Cho hàm số $y = x^3 - 3x$. Điểm cực đại của hàm số là:
A. $x = -1$*
B. $x = 1$
C. $x = 0$
D. $x = 2$
Lời giải: Ta có $y' = 3x^2 - 3 = 0 \\Leftrightarrow x = \\pm 1$.

câu 2: Trong các khẳng định sau, khẳng định nào đúng hay sai?
a) Hàm số nghịch biến trên khoảng (-1; 1). (Đúng)
b) Đồ thị hàm số nhận gốc tọa độ làm tâm đối xứng. (Đúng)
c) Giá trị cực tiểu là $y = 0$. (Sai)
d) Đồ thị có 2 điểm cực trị. (Đúng)

Bài 3. Tìm số nghiệm thực của phương trình $f(x) = 2$.
Đáp số: 3

bài 4: Tính thể tích khối chóp tứ giác đều có cạnh đáy bằng $a$.
A. $V = \\frac{a^3\\sqrt{2}}{6}$*
B. $V = \\frac{a^3}{3}$
C. $V = a^3$
D. $V = \\frac{a^3\\sqrt{3}}{6}
`;

    const blocks = splitTextIntoQuestionBlocks(examText);
    expect(blocks.length).toBe(4);

    expect(blocks[0].qNum).toBe(1);
    expect(blocks[0].prefix).toContain('Câu 1.');

    expect(blocks[1].qNum).toBe(2);
    expect(blocks[1].prefix).toContain('câu 2:');

    expect(blocks[2].qNum).toBe(3);
    expect(blocks[2].prefix).toContain('Bài 3.');

    expect(blocks[3].qNum).toBe(4);
    expect(blocks[3].prefix).toContain('bài 4:');

    const questions = parseQuestionBlocksToQuestions(blocks);
    expect(questions.length).toBe(4);

    // Q1: Multiple choice
    expect(questions[0].type).toBe('multiple_choice');
    expect(questions[0].correctAnswer).toBe('A');
    expect(questions[0].options.length).toBe(4);
    expect(questions[0].explanation).toContain('y\' = 3x^2 - 3');

    // Q2: True/False GDPT 2018
    expect(questions[1].type).toBe('true_false');
    expect(Array.isArray(questions[1].correctAnswer)).toBe(true);
    expect(questions[1].correctAnswer).toEqual([true, true, false, true]);

    // Q3: Short answer
    expect(questions[2].type).toBe('short_answer');
    expect(questions[2].correctAnswer).toBe('3');

    // Q4: Multiple choice
    expect(questions[3].type).toBe('multiple_choice');
    expect(questions[3].correctAnswer).toBe('A');
  });

  it('supports Roman numerals and markdown bold question headers', () => {
    const romanText = `
**Câu I.** Cho hình hộp chữ nhật ABCD.A'B'C'D'. Khẳng định nào sau đây đúng?
A. $AC' = \\sqrt{a^2 + b^2 + c^2}$*
B. $AC' = a + b + c$
C. $AC' = \\sqrt{a^2 + b^2}$
D. $AC' = 2a$

**Bài II:** Cho hình nón có bán kính đáy $r = 3$. Tính diện tích xung quanh.
A. $15\\pi$*
B. $20\\pi$
C. $25\\pi$
D. $30\\pi$
`;

    const blocks = splitTextIntoQuestionBlocks(romanText);
    expect(blocks.length).toBe(2);
    expect(blocks[0].qNum).toBe(1); // Roman I -> 1
    expect(blocks[1].qNum).toBe(2); // Roman II -> 2

    const questions = parseQuestionBlocksToQuestions(blocks);
    expect(questions.length).toBe(2);
    expect(questions[0].type).toBe('multiple_choice');
    expect(questions[0].correctAnswer).toBe('A');
    expect(questions[1].type).toBe('multiple_choice');
    expect(questions[1].correctAnswer).toBe('A');
  });
});

describe('MathType & OMML to LaTeX Converter', () => {
  it('converts OMML fractions (<m:f>) to LaTeX \\frac', () => {
    const ommlFraction = `
      <m:oMath>
        <m:f>
          <m:num><m:r><m:t>x^2 + 1</m:t></m:r></m:num>
          <m:den><m:r><m:t>x - 1</m:t></m:r></m:den>
        </m:f>
      </m:oMath>
    `;
    const latex = convertOmmlToLatex(ommlFraction);
    expect(latex).toBe('\\frac{x^2 + 1}{x - 1}');
  });

  it('converts OMML square roots and nth roots (<m:rad>)', () => {
    const sqrtXml = `
      <m:oMath>
        <m:rad>
          <m:e><m:r><m:t>x + 2</m:t></m:r></m:e>
        </m:rad>
      </m:oMath>
    `;
    expect(convertOmmlToLatex(sqrtXml)).toBe('\\sqrt{x + 2}');

    const nthRootXml = `
      <m:oMath>
        <m:rad>
          <m:deg><m:r><m:t>3</m:t></m:r></m:deg>
          <m:e><m:r><m:t>8x</m:t></m:r></m:e>
        </m:rad>
      </m:oMath>
    `;
    expect(convertOmmlToLatex(nthRootXml)).toBe('\\sqrt[3]{8x}');
  });

  it('converts OMML superscripts and subscripts (<m:sSup>, <m:sSub>)', () => {
    const supXml = `
      <m:oMath>
        <m:sSup>
          <m:e><m:r><m:t>x</m:t></m:r></m:e>
          <m:sup><m:r><m:t>3</m:t></m:r></m:sup>
        </m:sSup>
      </m:oMath>
    `;
    expect(convertOmmlToLatex(supXml)).toBe('x^{3}');

    const subXml = `
      <m:oMath>
        <m:sSub>
          <m:e><m:r><m:t>x</m:t></m:r></m:e>
          <m:sub><m:r><m:t>1</m:t></m:r></m:sub>
        </m:sSub>
      </m:oMath>
    `;
    expect(convertOmmlToLatex(subXml)).toBe('x_{1}');
  });

  it('converts MathML to LaTeX', () => {
    const mathml = `
      <math xmlns="http://www.w3.org/1998/Math/MathML">
        <mfrac>
          <mrow><mi>a</mi><mo>+</mo><mi>b</mi></mrow>
          <mi>c</mi>
        </mfrac>
      </math>
    `;
    const latex = convertMathMlToLatex(mathml);
    expect(latex).toContain('\\frac');
  });

  it('extracts and cleans MathType MTEF clipboard and comments', () => {
    const textWithMathType = `
%MathType!MTEF!2!1!+-
%MathType!Translator!DSP MathType 6.0 Translators!LaTeX 2.09 and later.tdl!
\\[ \\int_0^1 x dx = \\frac{1}{2} \\]
Nghiệm của phương trình là:
`;
    const cleaned = extractMathTypeLatexFromText(textWithMathType);
    expect(cleaned).not.toContain('%MathType!');
    expect(cleaned).toContain('\\int_0^1 x dx');
  });

  it('replaces common unicode math symbols with standard LaTeX', () => {
    const text = 'x ∈ ℝ, a ± b, c ≤ d, e ≥ f, α + β = π';
    const result = replaceUnicodeMathSymbols(text);
    expect(result).toContain('\\in ');
    expect(result).toContain('\\mathbb{R}');
    expect(result).toContain('\\pm ');
    expect(result).toContain('\\le ');
    expect(result).toContain('\\ge ');
    expect(result).toContain('\\alpha ');
    expect(result).toContain('\\beta ');
    expect(result).toContain('\\pi ');
  });
});

describe('Full Text Exam Parsing Pipeline', () => {
  it('parses raw text exam with MathType and separates questions accurately', () => {
    const rawExam = `
BẢNG ĐÁP ÁN
1.A 2.B

Câu 1. Cho hàm số $f(x) = x^2$. Đạo hàm tại $x = 1$ là:
A. 2
B. 1
C. 0
D. -2

Bài 2: Tính diện tích hình tròn bán kính $R = 2$.
A. $2\\pi$
B. $4\\pi$
C. $8\\pi$
D. $16\\pi$
`;

    const res = parseTextExam(rawExam);
    expect(res.success).toBe(true);
    expect(res.questions.length).toBe(2);
    expect(res.questions[0].questionNumber).toBe(1);
    expect(res.questions[0].correctAnswer).toBe('A');
    expect(res.questions[1].questionNumber).toBe(2);
    expect(res.questions[1].correctAnswer).toBe('B');
  });
});
