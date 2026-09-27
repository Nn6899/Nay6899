import { describe, it, expect } from 'vitest';
import { validateImportFile } from '../src/services/import/fileValidator';
import { parseLatexExam } from '../src/services/import/latexParser';
import { validateQuestion } from '../src/services/import/questionValidator';
import { questionService } from '../src/services/questionService';
import { Question } from '../src/types/question';

describe('Phase 3: Import Pipeline - File Validation', () => {
  it('rejects files larger than 15MB', async () => {
    const largeFile = {
      name: 'large_test.docx',
      size: 16 * 1024 * 1024,
      arrayBuffer: async () => new ArrayBuffer(100),
    };

    const res = await validateImportFile(largeFile);
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('vượt quá giới hạn cho phép');
  });

  it('rejects unsupported file extensions', async () => {
    const invalidFile = {
      name: 'script.exe',
      size: 1024,
      arrayBuffer: async () => new ArrayBuffer(100),
    };

    const res = await validateImportFile(invalidFile);
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('không được hỗ trợ');
  });

  it('validates a valid .tex file', async () => {
    const texText = '\\begin{ex} Cho hàm số $y=f(x)$. \\choice{A}{B}{C}{D} \\end{ex}';
    const encoder = new TextEncoder();
    const buffer = encoder.encode(texText).buffer;

    const texFile = {
      name: 'de_thi.tex',
      size: buffer.byteLength,
      arrayBuffer: async () => buffer,
    };

    const res = await validateImportFile(texFile);
    expect(res.isValid).toBe(true);
    expect(res.fileType).toBe('tex');
  });
});

describe('Phase 3: Import Pipeline - LaTeX Parser', () => {
  it('parses standard Vietnamese LaTeX questions with \\choice and math preservation', () => {
    const texContent = `
\\begin{ex}
  Tập nghiệm của phương trình $\\log_2(x - 1) = 3$ là:
  \\choice
  {$\\mathcal{S} = \\{7\\}$}
  {$\\mathcal{S} = \\{9\\}$}
  {$\\mathcal{S} = \\{8\\}$}
  {$\\mathcal{S} = \\{10\\}$}
  \\loigiai{
    Ta có $x - 1 = 2^3 = 8 \\Rightarrow x = 9$. Vậy chọn B.
  }
\\end{ex}
`;

    const result = parseLatexExam(texContent, 'toan12.tex');
    expect(result.success).toBe(true);
    expect(result.questions.length).toBe(1);

    const q = result.questions[0];
    expect(q.content).toContain('\\log_2(x - 1) = 3');
    expect(q.options.length).toBe(4);
    expect(q.options[0]).toContain('\\mathcal{S} = \\{7\\}');
    expect(q.options[1]).toContain('\\mathcal{S} = \\{9\\}');
    expect(q.correctAnswer).toBe('B');
    expect(q.explanation).toContain('x = 9');
    expect(q.validationStatus).toBe('VALID');
  });

  it('parses True/False questions with \\choiceTF', () => {
    const texContent = `
\\begin{ex}
  Cho hàm số $y = x^3 - 3x$. Các mệnh đề sau đúng hay sai?
  \\choiceTF
  {Hàm số đồng biến trên $(-\\infty; -1)$}
  {Hàm số nghịch biến trên $(-1; 1)$}
  {Điểm cực đại của đồ thị là $(-1; 2)$}
  {Giá trị nhỏ nhất trên $[0; 2]$ bằng $-1$}
\\end{ex}
`;

    const result = parseLatexExam(texContent, 'true_false.tex');
    expect(result.success).toBe(true);
    expect(result.questions.length).toBe(1);

    const q = result.questions[0];
    expect(q.type).toBe('true_false');
    expect(q.options.length).toBe(4);
    expect(q.options[0]).toContain('Hàm số đồng biến');
  });

  it('parses short answer questions with \\shortans', () => {
    const texContent = `
\\begin{ex}
  Tính giới hạn $L = \\lim_{x \\to 0} \\frac{\\sin x}{x}$.
  \\shortans{1}
\\end{ex}
`;

    const result = parseLatexExam(texContent, 'shortans.tex');
    expect(result.success).toBe(true);
    expect(result.questions.length).toBe(1);

    const q = result.questions[0];
    expect(q.type).toBe('short_answer');
    expect(q.correctAnswer).toBe('1');
  });
});

describe('Phase 3: Import Pipeline - Question Validation', () => {
  it('flags question with missing content as NEEDS_REVIEW', () => {
    const res = validateQuestion({
      content: '',
      type: 'multiple_choice',
      options: ['A', 'B', 'C', 'D'],
      correctAnswer: 'A',
    });

    expect(res.isValid).toBe(false);
    expect(res.status).toBe('NEEDS_REVIEW');
    expect(res.errors).toContain('Thiếu nội dung câu hỏi.');
  });

  it('flags question with duplicate options as NEEDS_REVIEW', () => {
    const res = validateQuestion({
      content: 'Phương trình $x^2 = 4$ có bao nhiêu nghiệm?',
      type: 'multiple_choice',
      options: ['2 nghiệm', '2 nghiệm', '3 nghiệm', '4 nghiệm'],
      correctAnswer: 'A',
    });

    expect(res.isValid).toBe(false);
    expect(res.errors).toContain('Các phương án lựa chọn không được trùng lặp nhau.');
  });

  it('accepts a fully valid multiple-choice question', () => {
    const res = validateQuestion({
      content: 'Công thức diện tích hình tròn bán kính $R$ là:',
      type: 'multiple_choice',
      options: ['$S = \\pi R^2$', '$S = 2\\pi R$', '$S = 4\\pi R^2$', '$S = \\frac{4}{3}\\pi R^3$'],
      correctAnswer: 'A',
    });

    expect(res.isValid).toBe(true);
    expect(res.status).toBe('VALID');
    expect(res.errors.length).toBe(0);
  });
});

describe('Phase 3: Question Service Persistence', () => {
  it('saves, retrieves, updates and deletes questions', async () => {
    const testId = 'test_persistence_123';
    const teacherId = 'teacher_abc';

    const sampleQuestion: Question = {
      id: 'q_test_1',
      testId,
      questionNumber: 1,
      type: 'multiple_choice',
      content: 'Hàm số nào sau đây liên tục trên $\\mathbb{R}$?',
      options: ['$y = x^2$', '$y = \\frac{1}{x}$', '$y = \\tan x$', '$y = \\sqrt{x}$'],
      correctAnswer: 'A',
      points: 1,
      validationStatus: 'VALID',
    };

    // Save
    await questionService.saveQuestions(testId, [sampleQuestion], teacherId);

    // Retrieve
    const questions = await questionService.getQuestions(testId);
    expect(questions.length).toBe(1);
    expect(questions[0].content).toContain('\\mathbb{R}');
    expect(questions[0].correctAnswer).toBe('A');

    // Update
    await questionService.updateQuestion(testId, 'q_test_1', { points: 2 }, teacherId);
    const updated = await questionService.getQuestions(testId);
    expect(updated[0].points).toBe(2);

    // Delete
    await questionService.deleteQuestion(testId, 'q_test_1', teacherId);
    const remaining = await questionService.getQuestions(testId);
    expect(remaining.length).toBe(0);
  });

  it('records and retrieves import metadata history', async () => {
    const testId = 'test_meta_456';
    const teacherId = 'teacher_abc';

    await questionService.recordImportMetadata(testId, {
      testId,
      teacherId,
      fileName: 'de_thi_hoc_ky.tex',
      fileSize: 4520,
      fileType: 'tex',
      uploadedAt: new Date().toISOString(),
      totalParsed: 50,
      validCount: 48,
      needsReviewCount: 2,
    });

    const history = await questionService.getImportHistory(testId);
    expect(history.length).toBeGreaterThan(0);
    expect(history[0].fileName).toBe('de_thi_hoc_ky.tex');
    expect(history[0].totalParsed).toBe(50);
  });
});
