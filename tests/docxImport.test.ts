import { describe, it, expect } from 'vitest';
import { parseDocxExam } from '../src/services/import/docxParser';
import { extractDocxTextWithLatex } from '../src/services/import/docxXmlExtractor';
import { parseTextExam } from '../src/services/import/textParser';
import { parseAnswerKeySection } from '../src/services/import/answerKey';
import { findOptionSequence } from '../src/services/import/questionSplitter';
import { pdfItemsToLines } from '../src/services/import/pdfParser';
import { buildDocx, p, r, tab, U, RED, BLUE_BOLD, numbered, drawing, PNG_1PX } from './helpers/buildDocx';

const NUMBERING = `
<w:abstractNum w:abstractNumId="1">
  <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="Câu %1."/></w:lvl>
</w:abstractNum>
<w:abstractNum w:abstractNumId="2">
  <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="upperLetter"/><w:lvlText w:val="%1."/></w:lvl>
</w:abstractNum>
<w:num w:numId="5"><w:abstractNumId w:val="1"/></w:num>
<w:num w:numId="6"><w:abstractNumId w:val="2"/></w:num>
<w:num w:numId="7"><w:abstractNumId w:val="2"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`;

describe('Word import: auto-numbering, correct-answer marks, images', () => {
  it('reads Word auto-numbered "Câu %1." and "A." lists', async () => {
    const buf = await buildDocx({
      numbering: NUMBERING,
      body:
        numbered(5, 0, r('Tập xác định của hàm số '), r('y = log x'), r(' là')) +
        numbered(6, 0, r('(0; +∞)')) +
        numbered(6, 0, r('ℝ')) +
        numbered(6, 0, r('[0; +∞)')) +
        numbered(6, 0, r('ℝ \\ {0}')) +
        numbered(5, 0, r('Cho tam giác ABC vuông tại A. Khẳng định nào đúng?')) +
        numbered(7, 0, r('AB < BC')) +
        numbered(7, 0, r('AB > BC')) +
        numbered(7, 0, r('AB = BC')) +
        numbered(7, 0, r('AC > BC')),
    });
    const res = await parseDocxExam(buf, 'numbered.docx');
    expect(res.questions.length).toBe(2);
    expect(res.questions[0].options.length).toBe(4);
    expect(res.questions[0].options[1]).toContain('\\mathbb{R}');
    // "vuông tại A." trong đề không được coi là phương án A
    expect(res.questions[1].content).toContain('vuông tại A.');
    expect(res.questions[1].options).toEqual(['AB < BC', 'AB > BC', 'AB = BC', 'AC > BC']);
  });

  it('detects the underlined / red option letter as the correct answer', async () => {
    const buf = await buildDocx({
      body:
        p(r('Câu 1. Giá trị của 2 + 3 là')) +
        p(r('A.', BLUE_BOLD), r(' 4'), tab, r('B.', BLUE_BOLD + U), r(' 5'), tab, r('C.', BLUE_BOLD), r(' 6'), tab, r('D.', BLUE_BOLD), r(' 7')) +
        p(r('Câu 2. Thủ đô của Việt Nam là')) +
        p(r('A', RED), r('. Hà Nội')) +
        p(r('B. Huế')) +
        p(r('C. Đà Nẵng')) +
        p(r('D. TP HCM')) +
        p(r('Câu 3. Tất cả phương án cùng màu thì không đoán đáp án')) +
        p(r('A.', RED), r(' x'), tab, r('B.', RED), r(' y'), tab, r('C.', RED), r(' z'), tab, r('D.', RED), r(' t')),
    });
    const res = await parseDocxExam(buf, 'marks.docx');
    expect(res.questions.map(q => q.correctAnswer)).toEqual(['B', 'A', '']);
    expect(res.questions[0].options).toEqual(['4', '5', '6', '7']);
    expect(res.questions[1].options[0]).toBe('Hà Nội');
  });

  it('extracts embedded images and attaches them to the right question', async () => {
    const buf = await buildDocx({
      body:
        p(r('Câu 1. Cho đồ thị như hình vẽ')) +
        p(drawing('rIdImg1')) +
        p(r('Hàm số đồng biến trên khoảng nào?')) +
        p(r('A. (0;1)'), tab, r('B. (1;2)'), tab, r('C. (2;3)'), tab, r('D. (3;4)')) +
        p(r('Câu 2. Không có hình')) +
        p(r('A. 1'), tab, r('B. 2'), tab, r('C. 3'), tab, r('D. 4')),
      rels: [{ id: 'rIdImg1', type: 'image', target: 'media/image1.png' }],
      files: { 'word/media/image1.png': PNG_1PX },
    });
    const res = await parseDocxExam(buf, 'images.docx');
    expect(res.questions.length).toBe(2);
    expect(res.questions[0].images?.length).toBe(1);
    expect(res.questions[0].images?.[0]).toMatch(/^data:image\/png;base64,/);
    expect(res.questions[0].content).not.toContain('[[IMG');
    expect(res.questions[1].images).toBeUndefined();
  });

  it('reads an answer key table (one cell per line) and drops the solutions section', async () => {
    const buf = await buildDocx({
      body:
        p(r('Câu 1. Một cộng một bằng')) +
        p(r('A. 1'), tab, r('B. 2'), tab, r('C. 3'), tab, r('D. 4')) +
        p(r('Câu 2. Hai nhân hai bằng')) +
        p(r('A. 2'), tab, r('B. 3'), tab, r('C. 4'), tab, r('D. 5')) +
        p(r('BẢNG ĐÁP ÁN')) +
        p(r('Câu')) + p(r('1')) + p(r('2')) +
        p(r('Đáp án')) + p(r('B')) + p(r('C')) +
        p(r('LỜI GIẢI CHI TIẾT')) +
        p(r('Câu 1. Một cộng một bằng')) +
        p(r('Lời giải: 1 + 1 = 2')),
    });
    const res = await parseDocxExam(buf, 'key.docx');
    expect(res.questions.length).toBe(2);
    expect(res.questions.map(q => q.correctAnswer)).toEqual(['B', 'C']);
    expect(res.questions.every(q => q.validationStatus === 'VALID')).toBe(true);
  });

  it('converts Word equations (OMML) and keeps them inside $...$', async () => {
    const omml =
      '<m:oMath><m:f><m:num><m:r><m:t>1</m:t></m:r></m:num><m:den><m:r><m:t>2</m:t></m:r></m:den></m:f></m:oMath>';
    const buf = await buildDocx({ body: `<w:p>${r('Câu 1. Tính ')}${omml}</w:p>` + p(r('A. 1'), tab, r('B. 2')) });
    const out = await extractDocxTextWithLatex(buf);
    expect(out?.text).toContain('$\\frac{1}{2}$');
  });
});

describe('Question splitter & answer key helpers', () => {
  it('parses inline and table answer keys', () => {
    expect([...parseAnswerKeySection('1.A 2.B 3-C 4 D 5D').entries()]).toEqual([
      [1, 'A'], [2, 'B'], [3, 'C'], [4, 'D'], [5, 'D'],
    ]);
    expect([...parseAnswerKeySection('\n1\n2\n3\nA\nC\nB\n4\n5\nD\nA\n').entries()]).toEqual([
      [1, 'A'], [2, 'C'], [3, 'B'], [4, 'D'], [5, 'A'],
    ]);
  });

  it('does not treat "\\mathbb{N}^*" as a correct-answer marker', () => {
    const res = parseTextExam('Câu 1. Tập nào chứa 0?\nA. $\\mathbb{N}$\nB. $\\mathbb{N}^*$\nC. $\\mathbb{Z}^*$\nD. $\\emptyset$', 'x.txt');
    expect(res.questions[0].correctAnswer).toBe('');
    expect(res.questions[0].options[1]).toBe('$\\mathbb{N}^*$');
  });

  it('supports "*A." leading star marker and "Câu 1 (NB):" headers', () => {
    const res = parseTextExam('Câu 1 (NB): Chọn số chẵn\nA. 1\n*B. 2\nC. 3\nD. 5', 'x.txt');
    expect(res.questions.length).toBe(1);
    expect(res.questions[0].correctAnswer).toBe('B');
    expect(res.questions[0].options[1]).toBe('2');
  });

  it('uses the last A-D sequence in a question', () => {
    const seq = findOptionSequence('Cho hình vuông tại A. Biết AB = a.\nA. 1    B. 2    C. 3    D. 4', 'upper');
    expect(seq?.content).toBe('Cho hình vuông tại A. Biết AB = a.');
    expect(seq?.options).toEqual(['1', '2', '3', '4']);
  });

  it('GDPT 2018 parts: answer table letters only apply to Part I', () => {
    const text = [
      'PHẦN I', 'Câu 1. Chọn A', 'A. a    B. b    C. c    D. d',
      'PHẦN III', 'Câu 1. Tính 1+1', 'Đáp án: 2',
      'BẢNG ĐÁP ÁN', '1.A',
    ].join('\n');
    const res = parseTextExam(text, 'x.txt');
    expect(res.questions[0].options[3]).toBe('d'); // "PHẦN III" không dính vào phương án D
    expect(res.questions.map(q => [q.type, q.correctAnswer])).toEqual([
      ['multiple_choice', 'A'],
      ['short_answer', '2'],
    ]);
  });
});

describe('PDF text layout', () => {
  it('keeps line breaks and wide gaps so questions can be split', () => {
    const item = (str: string, x: number, y: number, w = str.length * 5) => ({ str, transform: [10, 0, 0, 10, x, y], width: w, height: 10, hasEOL: false });
    const text = pdfItemsToLines([
      item('Câu 1. Hỏi gì?', 50, 700),
      item('A. 1', 50, 685), item('B. 2', 150, 685), item('C. 3', 250, 685), item('D. 4', 350, 685),
      item('Câu 2. Hỏi tiếp?', 50, 670),
    ]);
    expect(text.split('\n')[0]).toBe('Câu 1. Hỏi gì?');
    expect(text.split('\n')[2]).toBe('Câu 2. Hỏi tiếp?');
    const res = parseTextExam(text, 'pdf.txt');
    expect(res.questions.length).toBe(2);
    expect(res.questions[0].options).toEqual(['1', '2', '3', '4']);
  });
});

import { parseFirebaseConfigText } from '../src/firebase/parseConfig';

describe('Firebase config in one variable', () => {
  it('reads the block copied from Firebase Console (JS style, straight quotes)', () => {
    const cfg = parseFirebaseConfigText(`
      // Your web app's Firebase configuration
      const firebaseConfig = {
        apiKey: "AIzaSyABC-123",
        authDomain: "lop12.firebaseapp.com",
        projectId: "lop12",
        storageBucket: "lop12.firebasestorage.app",
        messagingSenderId: "1234567890",
        appId: "1:1234567890:web:abcdef",
      };`);
    expect(cfg.apiKey).toBe('AIzaSyABC-123');
    expect(cfg.projectId).toBe('lop12');
    expect(cfg.appId).toBe('1:1234567890:web:abcdef');
    expect(cfg.authDomain).toBe('lop12.firebaseapp.com');
  });

  it('reads JSON and curly quotes pasted from chat apps', () => {
    expect(parseFirebaseConfigText('{"apiKey":"K1","projectId":"P1"}')).toMatchObject({ apiKey: 'K1', projectId: 'P1' });
    expect(parseFirebaseConfigText('apiKey: “K2”,\nprojectId: “P2”')).toMatchObject({ apiKey: 'K2', projectId: 'P2' });
  });

  it('returns nothing for empty or unrelated text', () => {
    expect(parseFirebaseConfigText(undefined)).toEqual({});
    expect(parseFirebaseConfigText('hello')).toEqual({});
  });
});
