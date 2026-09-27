import { GoogleGenAI } from '@google/genai';
import { QUESTION_EXTRACTION_SCHEMA } from '../services/document-ai/question-extractor/schema.ts';

let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('Chưa cấu hình biến môi trường GEMINI_API_KEY trên server.');
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({ apiKey: key });
  }
  return aiClient;
}

/**
 * Handles question extraction request using Gemini 3.8 Flash model
 */
export async function handleAiQuestionExtraction(content: string, fileName?: string): Promise<{ questions: any[]; warnings: string[] }> {
  if (!content || !content.trim()) {
    throw new Error('Nội dung văn bản rỗng.');
  }

  const ai = getAiClient();

  const prompt = `Bạn là một chuyên gia phân tích và bóc tách đề thi trắc nghiệm Việt Nam.
Hãy đọc nội dung đề thi sau từ tệp "${fileName || 'document'}" và trích xuất danh sách tất cả các câu hỏi trắc nghiệm dưới dạng cấu trúc JSON chính xác theo schema.

Quy tắc bắt buộc:
1. Giữ nguyên TOÀN BỘ công thức toán học và ký hiệu khoa học dưới dạng mã LaTeX chuẩn (kẹp giữa $...$ cho inline và $$...$$ cho display/block).
2. Tuyệt đối KHÔNG convert công thức toán thành văn bản thường (plain text).
3. Tuyệt đối KHÔNG trả về thẻ HTML (không dùng <p>, <br>, <b>, <span>, <div>).
4. Phân loại chính xác type: 'multiple_choice' (trắc nghiệm 4 lựa chọn A, B, C, D), 'true_false' (đúng/sai các ý a, b, c, d), hoặc 'short_answer' (trả lời ngắn).
5. Xác định đáp án đúng (correctAnswer) nếu có trong đề bài hoặc bảng đáp án. Nếu không có đáp án, để trống chuỗi rỗng "".
6. Trích xuất lời giải chi tiết (explanation) nếu có.

Nội dung đề thi cần bóc tách:
---
${content}
---`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: QUESTION_EXTRACTION_SCHEMA as any,
    },
  });

  const responseText = response.text || '[]';
  let questions: any[] = [];
  try {
    questions = JSON.parse(responseText);
  } catch (e) {
    console.error('Failed to parse AI JSON response:', responseText);
    throw new Error('Mô hình AI trả về kết quả không khớp cấu trúc JSON.');
  }

  return {
    questions: Array.isArray(questions) ? questions : [],
    warnings: [],
  };
}
