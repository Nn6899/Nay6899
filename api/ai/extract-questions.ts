/**
 * Vercel Serverless Function: POST /api/ai/extract-questions
 *
 * Bóc tách đề thi bằng Gemini. Nhận 1 trong 2 dạng đầu vào:
 *  - { content: string }                        -> văn bản (đã có công thức LaTeX) từ Word/LaTeX/TXT
 *  - { files: [{ mimeType, data(base64) }] }    -> PDF (kể cả bản scan) hoặc ảnh chụp đề -> Gemini tự OCR + nhận dạng công thức
 *
 * File này tự chứa (không import file nội bộ) để Vercel build ổn định.
 * Khi chạy `npm run dev`, vite.config.ts cũng gọi chính hàm extractQuestions() bên dưới.
 *
 * Biến môi trường (Vercel > Project > Settings > Environment Variables):
 *  - GEMINI_API_KEY  (bắt buộc)  lấy miễn phí tại https://aistudio.google.com/apikey
 *  - GEMINI_MODEL    (tuỳ chọn)  mặc định 'gemini-3.8-flash'
 */
import { GoogleGenAI } from '@google/genai';

export const config = {
  maxDuration: 300,
};

const DEFAULT_MODEL = 'gemini-3.8-flash';
const ALLOWED_MIME = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
// Vercel giới hạn body request ~4.5MB, nên client tự chia nhỏ trước khi gửi.
const MAX_BASE64_CHARS = 4_300_000;
const MAX_TEXT_CHARS = 400_000;

export interface ExtractPayload {
  content?: string;
  files?: { mimeType: string; data: string }[];
  fileName?: string;
  /** Ghi chú thêm cho AI, ví dụ "trang 5-8 của đề" */
  contextHint?: string;
}

export interface ExtractResponse {
  questions: any[];
  warnings: string[];
}

const QUESTION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    questions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          questionNumber: { type: 'INTEGER', description: 'Số thứ tự câu trong đề (Câu 1 -> 1).' },
          type: { type: 'STRING', enum: ['multiple_choice', 'true_false', 'short_answer'] },
          content: {
            type: 'STRING',
            description: 'Nội dung câu hỏi, KHÔNG gồm chữ "Câu 1." và KHÔNG gồm các phương án. Công thức viết LaTeX trong $...$.',
          },
          options: {
            type: 'ARRAY',
            items: { type: 'STRING' },
            description: 'multiple_choice: 4 phương án A-D (bỏ chữ "A."). true_false: các ý a-d (bỏ chữ "a)"). short_answer: mảng rỗng.',
          },
          correctAnswer: {
            type: 'STRING',
            description: 'multiple_choice: một chữ A/B/C/D. true_false: chuỗi Đ/S theo thứ tự các ý, ví dụ "ĐSSĐ". short_answer: kết quả, ví dụ "2,5". Không biết thì để "".',
          },
          explanation: { type: 'STRING', description: 'Lời giải nếu đề có, LaTeX trong $...$. Không có thì "".' },
          hasFigure: { type: 'BOOLEAN', description: 'true nếu câu có hình vẽ / đồ thị / bảng biến thiên cần giáo viên chèn ảnh.' },
        },
        required: ['questionNumber', 'type', 'content', 'options', 'correctAnswer'],
      },
    },
  },
  required: ['questions'],
};

function buildPrompt(fileName: string, contextHint?: string, hasText?: boolean): string {
  return `Bạn là chuyên gia số hoá đề thi Việt Nam (THPT, chương trình GDPT 2018).
Nhiệm vụ: đọc đề "${fileName}"${contextHint ? ` (${contextHint})` : ''} và bóc tách TẤT CẢ câu hỏi thành JSON theo schema.

Quy tắc:
1. Mỗi "Câu N" là một phần tử. Giữ đúng số thứ tự N của đề. Không bỏ sót, không gộp câu.
2. Loại câu:
   - multiple_choice: câu có 4 phương án A, B, C, D (Phần I).
   - true_false: câu có các ý a), b), c), d) để chọn Đúng/Sai (Phần II).
   - short_answer: câu trả lời ngắn điền số (Phần III), hoặc câu tự luận.
3. MỌI công thức, ký hiệu toán/lý/hoá phải viết bằng LaTeX chuẩn KaTeX, đặt trong $...$ (công thức riêng dòng dùng $$...$$).
   Ví dụ: $\\frac{1}{2}$, $\\sqrt{x^2+1}$, $\\overrightarrow{AB}$, $\\left[ 1;2 \\right)$, $\\int_{0}^{1} f(x)\\,dx$, $60^\\circ$, $\\mathrm{H_2SO_4}$.
   Hệ phương trình dùng $\\left\\{ \\begin{array}{l} ... \\\\ ... \\end{array} \\right.$
4. KHÔNG dùng HTML, KHÔNG dùng Markdown (**, #).
5. Đáp án đúng: lấy từ BẢNG ĐÁP ÁN cuối đề, hoặc phương án được gạch chân / tô màu / in đậm khác thường / có dấu *, hoặc từ lời giải. Không chắc thì để "".
6. Nếu câu có hình vẽ, đồ thị, bảng biến thiên: vẫn bóc phần chữ, đặt hasFigure = true và chèn "[HÌNH]" vào đúng vị trí trong content.
7. Bỏ qua phần đầu đề (tên trường, mã đề, họ tên thí sinh...) và bảng đáp án (chỉ dùng để lấy correctAnswer).
${hasText ? '' : '8. Tài liệu có thể là bản scan/ảnh chụp: hãy đọc kỹ từng trang (OCR), kể cả công thức viết tay hoặc in mờ.\n'}`;
}

export async function extractQuestions(payload: ExtractPayload): Promise<ExtractResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw Object.assign(
      new Error('Chưa cấu hình GEMINI_API_KEY. Vào Vercel > Settings > Environment Variables để thêm khoá (lấy miễn phí tại aistudio.google.com/apikey), rồi Redeploy.'),
      { status: 500 }
    );
  }

  const fileName = String(payload.fileName || 'de-thi').slice(0, 200);
  const text = typeof payload.content === 'string' ? payload.content : '';
  const files = Array.isArray(payload.files) ? payload.files : [];

  if (!text.trim() && files.length === 0) {
    throw Object.assign(new Error('Không có nội dung để gửi cho AI.'), { status: 400 });
  }
  if (text.length > MAX_TEXT_CHARS) {
    throw Object.assign(new Error('Văn bản đề quá dài.'), { status: 413 });
  }

  let totalBase64 = 0;
  for (const f of files) {
    if (!f || !ALLOWED_MIME.includes(f.mimeType) || typeof f.data !== 'string') {
      throw Object.assign(new Error(`Định dạng tệp gửi AI không hỗ trợ: ${f?.mimeType}`), { status: 400 });
    }
    totalBase64 += f.data.length;
  }
  if (totalBase64 > MAX_BASE64_CHARS) {
    throw Object.assign(new Error('Tệp gửi AI quá lớn (tối đa ~3MB mỗi lần).'), { status: 413 });
  }

  const parts: any[] = [{ text: buildPrompt(fileName, payload.contextHint, Boolean(text.trim())) }];
  for (const f of files) {
    parts.push({ inlineData: { mimeType: f.mimeType, data: f.data } });
  }
  if (text.trim()) {
    parts.push({ text: `Nội dung đề (công thức đã ở dạng LaTeX):\n---\n${text}\n---` });
  }

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
    contents: [{ role: 'user', parts }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: QUESTION_SCHEMA as any,
      temperature: 0,
    },
  });

  const raw = response.text || '{}';
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw Object.assign(new Error('AI trả về dữ liệu không đúng định dạng JSON. Hãy thử lại.'), { status: 502 });
  }

  const questions = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.questions) ? parsed.questions : [];
  const warnings: string[] = [];
  const figureCount = questions.filter((q: any) => q?.hasFigure).length;
  if (figureCount > 0) {
    warnings.push(`${figureCount} câu có hình vẽ/bảng biến thiên (đánh dấu [HÌNH]) — cần chèn ảnh thủ công khi duyệt.`);
  }
  return { questions, warnings };
}

function sameOrigin(req: any): boolean {
  const origin = req.headers?.origin;
  const host = req.headers?.['x-forwarded-host'] || req.headers?.host;
  if (!origin || !host) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }
  if (!sameOrigin(req)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const result = await extractQuestions(body);
    res.status(200).json(result);
  } catch (err: any) {
    let message = String(err?.message || 'Lỗi xử lý AI');
    let status = Number(err?.status) || 500;
    if (/quota|RESOURCE_EXHAUSTED/i.test(message) || status === 429) {
      status = 429;
      message = 'Đã hết lượt gọi AI miễn phí trong phút/ngày này. Vui lòng đợi rồi thử lại.';
    } else if (/API key not valid|API_KEY_INVALID|PERMISSION_DENIED/i.test(message)) {
      message = 'GEMINI_API_KEY không hợp lệ hoặc chưa được cấp quyền. Kiểm tra lại khoá trên Vercel rồi Redeploy.';
    } else if (/not found|NOT_FOUND/i.test(message) && /model/i.test(message)) {
      message = `Model "${process.env.GEMINI_MODEL || DEFAULT_MODEL}" không tồn tại. Sửa biến GEMINI_MODEL trên Vercel.`;
    } else if (/overloaded|UNAVAILABLE|503/i.test(message)) {
      status = 503;
      message = 'Máy chủ AI đang quá tải, vui lòng thử lại sau ít phút.';
    }
    res.status(status).json({ error: message });
  }
}
