/**
 * Tách "BẢNG ĐÁP ÁN" và phần "LỜI GIẢI CHI TIẾT" khỏi thân đề trước khi tách câu.
 * Dùng chung cho Word, PDF và văn bản.
 */

export interface PreparedExamText {
  body: string;
  answerKeyMap: Map<number, string>;
  warnings: string[];
}

const ANSWER_KEY_HEADER = /(?:BẢNG\s+ĐÁP\s+ÁN|ĐÁP\s+ÁN\s+TRẮC\s+NGHIỆM|BẢNG\s+TRẢ\s+LỜI)/i;
// Tiêu đề phần lời giải viết HOA đứng riêng một dòng (lặp lại "Câu 1." -> sẽ tạo câu trùng nếu không cắt)
const SOLUTION_SECTION_HEADER = /\n[ \t]*(?:HƯỚNG DẪN GIẢI(?: CHI TIẾT)?|LỜI GIẢI(?: CHI TIẾT)?|ĐÁP ÁN VÀ LỜI GIẢI(?: CHI TIẾT)?|ĐÁP ÁN CHI TIẾT|HƯỚNG DẪN CHẤM)[ \t.:]*\n/;
const QUESTION_START = /(?:^|\n)[ \t]*(?:\*{1,2})?(?:Câu|câu|Bài|bài)[ \t]*(\d+|[IVXLCDMivxlcdm]+)[ \t]*[.:]/;

/**
 * Đọc bảng đáp án. Hỗ trợ:
 *  - "1.A 2.B 3-C 4 D" / "1A 2B"
 *  - Bảng Word (mỗi ô một dòng): hàng số thứ tự "1 2 3 ..." rồi hàng đáp án "A B C ..."
 */
export function parseAnswerKeySection(keySection: string): Map<number, string> {
  const map = new Map<number, string>();

  for (const m of keySection.matchAll(/(?:^|[^\d])(\d{1,3})[ \t]*[.\-:)]?[ \t]*([A-D])(?![A-Za-zÀ-ỹ])/g)) {
    map.set(parseInt(m[1], 10), m[2].toUpperCase());
  }
  if (map.size > 0) return map;

  // Dạng bảng: các dòng chỉ chứa số, tiếp theo các dòng chỉ chứa chữ A-D
  const tokens = keySection
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => /^\d{1,3}$/.test(t) || /^[A-D]$/.test(t));
  let i = 0;
  while (i < tokens.length) {
    const nums: number[] = [];
    while (i < tokens.length && /^\d+$/.test(tokens[i])) nums.push(parseInt(tokens[i++], 10));
    const letters: string[] = [];
    while (i < tokens.length && /^[A-D]$/.test(tokens[i])) letters.push(tokens[i++]);
    if (nums.length === 0 && letters.length === 0) i++;
    nums.forEach((n, k) => {
      if (letters[k]) map.set(n, letters[k]);
    });
  }
  return map;
}

export function prepareExamText(rawText: string): PreparedExamText {
  const warnings: string[] = [];
  let body = rawText;
  let answerKeyMap = new Map<number, string>();

  // 1. Cắt phần lời giải chi tiết ở cuối đề (nếu đã có ít nhất 1 câu phía trước)
  const sol = body.match(SOLUTION_SECTION_HEADER);
  if (sol && sol.index !== undefined && QUESTION_START.test(body.slice(0, sol.index))) {
    const solutionPart = body.slice(sol.index);
    body = body.slice(0, sol.index);
    warnings.push('Đã bỏ qua phần "Lời giải/Hướng dẫn giải" ở cuối đề để không tạo câu trùng.');
    // Bảng đáp án có thể nằm trong phần lời giải
    const inSolution = solutionPart.match(ANSWER_KEY_HEADER);
    if (inSolution && inSolution.index !== undefined) {
      const after = solutionPart.slice(inSolution.index + inSolution[0].length);
      const stop = after.search(QUESTION_START);
      answerKeyMap = parseAnswerKeySection(stop >= 0 ? after.slice(0, stop) : after);
    }
  }

  // 2. Bảng đáp án trong thân đề
  const header = body.match(ANSWER_KEY_HEADER);
  if (header && header.index !== undefined) {
    const after = body.slice(header.index + header[0].length);
    const next = after.search(QUESTION_START);
    const keySection = next >= 0 ? after.slice(0, next) : after;
    body = body.slice(0, header.index) + (next >= 0 ? '\n' + after.slice(next) : '');
    const found = parseAnswerKeySection(keySection);
    found.forEach((v, k) => answerKeyMap.set(k, v));
  }

  if (answerKeyMap.size > 0) {
    warnings.push(`Đã tìm thấy bảng đáp án với ${answerKeyMap.size} đáp án.`);
  }

  // 3. Bỏ dòng tiêu đề phần ("PHẦN II. Câu trắc nghiệm đúng sai...") để không dính vào phương án của câu trước
  body = body.replace(/^[ \t]*(?:\*{1,2})?(?:PHẦN|Phần)[ \t]+(?:[IVX]+|\d+)(?=[ \t.:\-*]|$)[^\n]*$/gm, '');

  return { body, answerKeyMap, warnings };
}
