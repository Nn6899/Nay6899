import { Question, QuestionValidationStatus } from '../../types/question';

export interface QuestionValidationDetail {
  isValid: boolean;
  status: QuestionValidationStatus;
  errors: string[];
}

/**
 * Normalizes and strictly validates a Question.
 * Returns VALID if all requirements pass, or NEEDS_REVIEW with human-readable error messages.
 */
export function validateQuestion(q: Partial<Question>): QuestionValidationDetail {
  const errors: string[] = [];

  // 1. Validate content
  if (!q.content || typeof q.content !== 'string' || q.content.trim().length === 0) {
    errors.push('Thiếu nội dung câu hỏi.');
  }

  // 2. Validate type
  const validTypes = ['multiple_choice', 'true_false', 'short_answer'];
  if (!q.type || !validTypes.includes(q.type)) {
    errors.push(`Loại câu hỏi không hợp lệ: ${q.type || 'chưa xác định'}.`);
  }

  // 3. Validate options & answer according to type
  const options = Array.isArray(q.options) ? q.options : [];

  if (q.type === 'multiple_choice') {
    if (options.length < 2) {
      errors.push(`Số lượng phương án lựa chọn không đủ (${options.length}/4). Yêu cầu tối thiểu 2 phương án.`);
    }

    // Check for empty or duplicate options
    const trimmedOptions = options.map(o => (typeof o === 'string' ? o.trim() : ''));
    if (trimmedOptions.some(o => o.length === 0)) {
      errors.push('Không được để trống nội dung phương án lựa chọn.');
    }
    const uniqueOptions = new Set(trimmedOptions);
    if (uniqueOptions.size < trimmedOptions.length) {
      errors.push('Các phương án lựa chọn không được trùng lặp nhau.');
    }

    // Check correct answer
    if (q.correctAnswer === undefined || q.correctAnswer === null || q.correctAnswer === '') {
      errors.push('Chưa xác định đáp án đúng cho câu hỏi trắc nghiệm.');
    } else if (typeof q.correctAnswer === 'string') {
      const ansLetter = q.correctAnswer.trim().toUpperCase();
      const letterIndexMap: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5 };

      if (letterIndexMap[ansLetter] !== undefined) {
        const targetIdx = letterIndexMap[ansLetter];
        if (targetIdx >= options.length) {
          errors.push(`Đáp án đúng '${ansLetter}' nằm ngoài số lượng phương án hiện có (${options.length} phương án).`);
        }
      } else {
        // Answer might be direct option text
        const matched = options.some(
          opt => opt.trim().toLowerCase() === q.correctAnswer?.toString().trim().toLowerCase()
        );
        if (!matched) {
          errors.push(`Đáp án đúng '${q.correctAnswer}' không khớp với phương án nào trong danh sách lựa chọn.`);
        }
      }
    }
  } else if (q.type === 'true_false') {
    if (options.length < 2) {
      errors.push(`Câu hỏi Đúng/Sai cần ít nhất 2 khẳng định (hiện có: ${options.length}).`);
    }

    if (q.correctAnswer === undefined || q.correctAnswer === null) {
      errors.push('Chưa thiết lập đáp án Đúng/Sai cho các khẳng định.');
    } else if (Array.isArray(q.correctAnswer)) {
      if (q.correctAnswer.length !== options.length) {
        errors.push(`Số lượng đáp án Đúng/Sai (${q.correctAnswer.length}) không khớp với số khẳng định (${options.length}).`);
      }
    } else if (typeof q.correctAnswer !== 'boolean' && typeof q.correctAnswer !== 'string') {
      errors.push('Định dạng đáp án Đúng/Sai không hợp lệ.');
    }
  } else if (q.type === 'short_answer') {
    if (q.correctAnswer === undefined || q.correctAnswer === null || String(q.correctAnswer).trim() === '') {
      errors.push('Chưa nhập đáp án ngắn (chuỗi kết quả đúng).');
    }
  }

  // 4. Determine status
  const isValid = errors.length === 0;
  const status: QuestionValidationStatus = isValid ? 'VALID' : 'NEEDS_REVIEW';

  return {
    isValid,
    status,
    errors,
  };
}

/**
 * Applies validation directly onto a Question object
 */
export function applyValidationToQuestion(q: Question): Question {
  const result = validateQuestion(q);
  return {
    ...q,
    validationStatus: result.status,
    validationErrors: result.errors,
  };
}
