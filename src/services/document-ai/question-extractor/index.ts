import { Question, ParseResult, SupportedFileFormat } from '../../../types/question';
import { applyValidationToQuestion } from '../../import/questionValidator';
import { extractDocxTextWithLatex } from '../../import/docxXmlExtractor';
import { loadPdfDocument } from '../../../lib/pdfjs';

export interface AiExtractionOptions {
  fileName?: string;
  contextHint?: string;
}

type AiFilePart = { mimeType: string; data: string };
type ProgressFn = (message: string, percent: number) => void;

// Vercel giới hạn body ~4.5MB -> mỗi lần gửi tối đa ~3MB dữ liệu base64.
const MAX_BATCH_BASE64 = 3_000_000;
const PAGE_RENDER_WIDTH = 1500;

function emptyResult(fileName: string, fileType: ParseResult['fileType'], warning: string): ParseResult {
  return {
    success: false,
    fileType,
    fileName,
    questions: [],
    warnings: [warning],
    totalParsed: 0,
    validCount: 0,
    needsReviewCount: 0,
  };
}

async function callAiEndpoint(body: {
  content?: string;
  files?: AiFilePart[];
  fileName: string;
  contextHint?: string;
}): Promise<{ questions: any[]; warnings: string[] }> {
  const response = await fetch('/api/ai/extract-questions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    if (response.status === 404) {
      throw new Error('Không tìm thấy dịch vụ AI (/api/ai/extract-questions). Hãy kiểm tra thư mục api/ đã được đẩy lên GitHub và Vercel đã deploy lại.');
    }
    throw new Error(errorData.error || `Yêu cầu AI thất bại (mã ${response.status}).`);
  }
  const data = await response.json();
  return {
    questions: Array.isArray(data.questions) ? data.questions : [],
    warnings: Array.isArray(data.warnings) ? data.warnings : [],
  };
}

function stripHtml(s: unknown): string {
  return String(s ?? '').replace(/<[^>]*>?/gm, '').trim();
}

/** "ĐSSĐ", "Đ,S,S,Đ", "TFFT", "Đúng Sai..." -> [true,false,false,true] */
export function parseTrueFalseKey(raw: unknown, count: number): boolean[] | '' {
  const text = String(raw ?? '').toUpperCase();
  const tokens = text.match(/ĐÚNG|SAI|Đ|S|TRUE|FALSE|T|F/g);
  if (!tokens || tokens.length === 0) return '';
  const values = tokens.map(t => t === 'Đ' || t === 'ĐÚNG' || t === 'T' || t === 'TRUE');
  return count > 0 ? values.slice(0, count) : values;
}

/** Chuẩn hoá một câu hỏi AI trả về thành Question của hệ thống */
export function normalizeAiQuestion(q: any, idx: number): Question {
  const type: Question['type'] = ['multiple_choice', 'true_false', 'short_answer'].includes(q?.type)
    ? q.type
    : 'multiple_choice';

  const content = stripHtml(q?.content).replace(/^(?:Câu|Bài)\s*\d+\s*[.:)]\s*/i, '');
  let options: string[] = Array.isArray(q?.options) ? q.options.map(stripHtml) : [];
  if (type === 'multiple_choice') {
    options = options.map(o => o.replace(/^[A-D]\s*[.)]\s*/, ''));
  } else if (type === 'true_false') {
    options = options.map(o => o.replace(/^[a-d]\s*[.)]\s*/, ''));
  } else {
    options = [];
  }

  let correctAnswer: Question['correctAnswer'] = '';
  if (type === 'multiple_choice') {
    const letter = String(q?.correctAnswer ?? '').trim().toUpperCase().match(/^[A-D]/);
    correctAnswer = letter ? letter[0] : '';
  } else if (type === 'true_false') {
    correctAnswer = parseTrueFalseKey(q?.correctAnswer, options.length);
  } else {
    correctAnswer = String(q?.correctAnswer ?? '').trim();
  }

  const explanation = stripHtml(q?.explanation);

  return applyValidationToQuestion({
    id: `q_ai_${Date.now()}_${idx + 1}`,
    questionNumber: Number(q?.questionNumber) || idx + 1,
    type,
    content,
    options,
    correctAnswer,
    explanation: explanation || undefined,
    points: 1,
  });
}

function buildResult(fileName: string, fileType: ParseResult['fileType'], rawQuestions: any[], warnings: string[]): ParseResult {
  // Gộp các câu trùng số (do chia trang chồng lấn): giữ bản có nội dung dài hơn
  const byNumber = new Map<number, any>();
  const unnumbered: any[] = [];
  for (const q of rawQuestions) {
    const n = Number(q?.questionNumber);
    if (!n) {
      unnumbered.push(q);
      continue;
    }
    const prev = byNumber.get(n);
    const score = (x: any) => String(x?.content || '').length + (Array.isArray(x?.options) ? x.options.join('').length : 0);
    if (!prev || score(q) > score(prev)) byNumber.set(n, q);
  }
  const merged = [...byNumber.entries()].sort((a, b) => a[0] - b[0]).map(([, q]) => q).concat(unnumbered);
  const questions = merged.map(normalizeAiQuestion);
  const validCount = questions.filter(q => q.validationStatus === 'VALID').length;

  return {
    success: questions.length > 0,
    fileType,
    fileName,
    questions,
    warnings: [...new Set(warnings)],
    totalParsed: questions.length,
    validCount,
    needsReviewCount: questions.length - validCount,
  };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function dataUrlToPart(dataUrl: string): AiFilePart {
  const [header, data] = dataUrl.split(',');
  const mimeType = header.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
  return { mimeType, data };
}

/** Thu nhỏ ảnh to (ảnh chụp điện thoại) để không vượt giới hạn gửi */
async function imageFileToPart(file: File): Promise<AiFilePart> {
  const buf = await file.arrayBuffer();
  const b64 = arrayBufferToBase64(buf);
  if (b64.length <= MAX_BATCH_BASE64) {
    return { mimeType: file.type || 'image/jpeg', data: b64 };
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return dataUrlToPart(canvas.toDataURL('image/jpeg', 0.8));
}

/** Render từng trang PDF thành ảnh JPEG (dùng khi PDF quá lớn để gửi nguyên tệp) */
async function renderPdfPages(buffer: ArrayBuffer, onProgress?: ProgressFn): Promise<AiFilePart[]> {
  const pdf = await loadPdfDocument(buffer);
  const pages: AiFilePart[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    onProgress?.(`Đang chuyển trang ${i}/${pdf.numPages} thành ảnh để AI đọc...`, 10 + Math.round((i / pdf.numPages) * 30));
    const page = await pdf.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: PAGE_RENDER_WIDTH / base.width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport } as any).promise;
    pages.push(dataUrlToPart(canvas.toDataURL('image/jpeg', 0.72)));
  }
  return pages;
}

/** Chia các trang thành từng đợt < giới hạn, chồng lấn 1 trang để không cắt đôi câu hỏi */
function batchPages(pages: AiFilePart[]): { parts: AiFilePart[]; from: number; to: number }[] {
  const batches: { parts: AiFilePart[]; from: number; to: number }[] = [];
  let start = 0;
  while (start < pages.length) {
    let size = 0;
    let end = start;
    while (end < pages.length && (end === start || size + pages[end].data.length <= MAX_BATCH_BASE64)) {
      size += pages[end].data.length;
      end++;
    }
    batches.push({ parts: pages.slice(start, end), from: start + 1, to: end });
    if (end >= pages.length) break;
    start = end - 1 > start ? end - 1 : end; // chồng lấn 1 trang
  }
  return batches;
}

function detectType(name: string): SupportedFileFormat | 'image' | 'unknown' {
  const ext = name.toLowerCase().split('.').pop() || '';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  if (ext === 'tex') return 'tex';
  if (ext === 'txt') return 'txt';
  if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) return 'image';
  return 'unknown';
}

/**
 * Bóc tách đề bằng AI (Gemini) trực tiếp từ tệp:
 *  - PDF (kể cả bản scan): gửi nguyên PDF, hoặc ảnh từng trang nếu tệp lớn -> AI OCR + nhận dạng công thức
 *  - Ảnh chụp đề (.jpg/.png): gửi ảnh
 *  - Word/LaTeX/TXT: gửi toàn bộ văn bản (công thức MathType/Equation đã đổi sang LaTeX)
 */
export async function extractQuestionsWithAiFromFile(file: File, onProgress?: ProgressFn): Promise<ParseResult> {
  const fileName = file.name;
  const kind = detectType(fileName);
  const fileType: ParseResult['fileType'] = kind === 'image' ? 'unknown' : kind;

  try {
    if (kind === 'pdf') {
      const buffer = await file.arrayBuffer();
      const b64 = arrayBufferToBase64(buffer);
      if (b64.length <= MAX_BATCH_BASE64) {
        onProgress?.('AI đang đọc toàn bộ PDF (OCR + công thức)... có thể mất 30-90 giây', 50);
        const res = await callAiEndpoint({ files: [{ mimeType: 'application/pdf', data: b64 }], fileName });
        return buildResult(fileName, fileType, res.questions, res.warnings);
      }
      const pages = await renderPdfPages(buffer, onProgress);
      const batches = batchPages(pages);
      const all: any[] = [];
      const warnings: string[] = [];
      for (let i = 0; i < batches.length; i++) {
        const b = batches[i];
        onProgress?.(`AI đang đọc trang ${b.from}-${b.to}/${pages.length}...`, 40 + Math.round(((i + 1) / batches.length) * 55));
        const res = await callAiEndpoint({
          files: b.parts,
          fileName,
          contextHint: `đây là trang ${b.from} đến ${b.to} trong tổng ${pages.length} trang; câu bị cắt dở ở trang cuối thì vẫn trả về phần đọc được`,
        });
        all.push(...res.questions);
        warnings.push(...res.warnings);
      }
      return buildResult(fileName, fileType, all, warnings);
    }

    if (kind === 'image') {
      onProgress?.('AI đang đọc ảnh chụp đề...', 50);
      const part = await imageFileToPart(file);
      const res = await callAiEndpoint({ files: [part], fileName });
      return buildResult(fileName, fileType, res.questions, res.warnings);
    }

    let text = '';
    if (kind === 'docx') {
      const extracted = await extractDocxTextWithLatex(await file.arrayBuffer());
      text = extracted?.text || '';
    } else {
      text = new TextDecoder('utf-8').decode(await file.arrayBuffer());
    }
    return await extractQuestionsWithAi(text, { fileName }, onProgress);
  } catch (error: any) {
    return emptyResult(fileName, fileType, `Lỗi khi gọi AI: ${error.message || 'Không kết nối được dịch vụ AI'}`);
  }
}

/**
 * Bóc tách đề bằng AI từ văn bản (đã có công thức LaTeX).
 */
export async function extractQuestionsWithAi(
  rawContent: string,
  options: AiExtractionOptions = {},
  onProgress?: ProgressFn
): Promise<ParseResult> {
  const fileName = options.fileName || 'document_ai.txt';

  if (!rawContent || rawContent.trim().length === 0) {
    return emptyResult(fileName, 'unknown', 'Nội dung gửi đến AI rỗng.');
  }

  try {
    onProgress?.('AI đang phân tích và tách câu... có thể mất 30-60 giây', 60);
    const res = await callAiEndpoint({ content: rawContent, fileName, contextHint: options.contextHint });
    const result = buildResult(fileName, 'unknown', res.questions, res.warnings);
    result.rawTextSample = rawContent.slice(0, 300);
    return result;
  } catch (error: any) {
    return emptyResult(fileName, 'unknown', `Lỗi khi gọi AI trích xuất câu hỏi: ${error.message || 'Không kết nối được dịch vụ AI'}`);
  }
}
