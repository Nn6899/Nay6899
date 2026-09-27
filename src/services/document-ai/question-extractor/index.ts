import { Question, ParseResult } from '../../../types/question';
import { applyValidationToQuestion } from '../../import/questionValidator';

export interface AiExtractionOptions {
  fileName?: string;
  contextHint?: string;
}

/**
 * Invokes server-side AI Question Extractor endpoint.
 * Ensures strict JSON schema and no arbitrary HTML.
 */
export async function extractQuestionsWithAi(
  rawContent: string,
  options: AiExtractionOptions = {}
): Promise<ParseResult> {
  const fileName = options.fileName || 'document_ai.txt';

  if (!rawContent || rawContent.trim().length === 0) {
    return {
      success: false,
      fileType: 'unknown',
      fileName,
      questions: [],
      warnings: ['Nội dung gửi đến AI rỗng.'],
      totalParsed: 0,
      validCount: 0,
      needsReviewCount: 0,
    };
  }

  try {
    const response = await fetch('/api/ai/extract-questions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: rawContent,
        fileName,
        contextHint: options.contextHint,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Yêu cầu AI thất bại với mã trạng thái ${response.status}`);
    }

    const data = await response.json();
    const rawQuestions = Array.isArray(data.questions) ? data.questions : [];

    const parsedQuestions: Question[] = rawQuestions.map((q: any, idx: number) => {
      const cleanContent = (q.content || '').replace(/<[^>]*>?/gm, ''); // strip any accidental HTML
      const cleanExplanation = q.explanation ? q.explanation.replace(/<[^>]*>?/gm, '') : undefined;
      const cleanOptions = Array.isArray(q.options)
        ? q.options.map((opt: string) => String(opt || '').replace(/<[^>]*>?/gm, '').trim())
        : [];

      const rawQ: Question = {
        id: `q_ai_${Date.now()}_${idx + 1}`,
        questionNumber: q.questionNumber || idx + 1,
        type: q.type || 'multiple_choice',
        content: cleanContent,
        options: cleanOptions,
        correctAnswer: q.correctAnswer || '',
        explanation: cleanExplanation,
        points: 1,
      };

      return applyValidationToQuestion(rawQ);
    });

    const validCount = parsedQuestions.filter(q => q.validationStatus === 'VALID').length;

    return {
      success: parsedQuestions.length > 0,
      fileType: 'unknown',
      fileName,
      questions: parsedQuestions,
      warnings: data.warnings || [],
      totalParsed: parsedQuestions.length,
      validCount,
      needsReviewCount: parsedQuestions.length - validCount,
      rawTextSample: rawContent.slice(0, 300),
    };
  } catch (error: any) {
    return {
      success: false,
      fileType: 'unknown',
      fileName,
      questions: [],
      warnings: [`Lỗi khi gọi AI trích xuất câu hỏi: ${error.message || 'Không kết nối được dịch vụ AI'}`],
      totalParsed: 0,
      validCount: 0,
      needsReviewCount: 0,
      rawTextSample: rawContent.slice(0, 300),
    };
  }
}
