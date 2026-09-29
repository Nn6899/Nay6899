/**
 * GET /api/health
 * Cho trang giáo viên biết AI (Gemini) đã được cấu hình chưa. Chỉ trả về true/false, không lộ khoá.
 */
export default function handler(_req: any, res: any) {
  const key = process.env.GEMINI_API_KEY;
  res.status(200).json({ ai: Boolean(key && key !== 'MY_GEMINI_API_KEY') });
}
