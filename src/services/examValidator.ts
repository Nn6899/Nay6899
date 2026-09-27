import { Question, ExamValidationResult, ValidationErrorItem } from '../types/question';
import { validateLatexInText } from '../lib/latex';

/**
 * Validates a single URL string for protocol and format
 */
export function isValidUrl(url: string, allowDataUri = false): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (allowDataUri && trimmed.startsWith('data:image/')) return true;
  if (trimmed.startsWith('/') || trimmed.startsWith('./')) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validates a single question thoroughly against all business rules
 */
export function validateSingleQuestionDetailed(q: Question): ValidationErrorItem[] {
  const errors: ValidationErrorItem[] = [];
  const qNum = q.questionNumber || 1;
  const qId = q.id || `q_${qNum}`;

  // 1. Content check
  if (!q.content || typeof q.content !== 'string' || q.content.trim().length === 0) {
    errors.push({
      questionId: qId,
      questionNumber: qNum,
      field: 'content',
      message: `Câu ${qNum}: Thiếu nội dung câu hỏi.`,
      isFatal: true,
    });
  } else {
    // LaTeX in content check
    const latexCheck = validateLatexInText(q.content);
    if (!latexCheck.isValid) {
      errors.push({
        questionId: qId,
        questionNumber: qNum,
        field: 'content_latex',
        message: `Câu ${qNum}: Lỗi công thức LaTeX trong nội dung câu hỏi (${latexCheck.errors.join('; ')}).`,
        isFatal: true,
      });
    }
  }

  // 2. Type and options validation
  const options = Array.isArray(q.options) ? q.options : [];

  if (q.type === 'multiple_choice') {
    if (options.length < 2) {
      errors.push({
        questionId: qId,
        questionNumber: qNum,
        field: 'options_count',
        message: `Câu ${qNum}: Trắc nghiệm cần tối thiểu 2 phương án lựa chọn (hiện có: ${options.length}).`,
        isFatal: true,
      });
    }

    const trimmedOptions = options.map(o => (typeof o === 'string' ? o.trim() : ''));
    if (trimmedOptions.some(o => o.length === 0)) {
      errors.push({
        questionId: qId,
        questionNumber: qNum,
        field: 'options_empty',
        message: `Câu ${qNum}: Không được để trống phương án lựa chọn.`,
        isFatal: true,
      });
    }

    const uniqueOpts = new Set(trimmedOptions);
    if (uniqueOpts.size < trimmedOptions.length) {
      errors.push({
        questionId: qId,
        questionNumber: qNum,
        field: 'options_duplicate',
        message: `Câu ${qNum}: Các phương án lựa chọn không được trùng lặp nhau.`,
        isFatal: true,
      });
    }

    // Options LaTeX validation
    options.forEach((opt, idx) => {
      const letter = String.fromCharCode(65 + idx);
      const optCheck = validateLatexInText(opt);
      if (!optCheck.isValid) {
        errors.push({
          questionId: qId,
          questionNumber: qNum,
          field: `option_${letter}_latex`,
          message: `Câu ${qNum}: Lỗi công thức LaTeX ở phương án ${letter}.`,
          isFatal: true,
        });
      }
    });

    // Check correct answer
    if (q.correctAnswer === undefined || q.correctAnswer === null || q.correctAnswer === '') {
      errors.push({
        questionId: qId,
        questionNumber: qNum,
        field: 'correctAnswer',
        message: `Câu ${qNum}: Chưa chọn đáp án đúng cho câu hỏi trắc nghiệm.`,
        isFatal: true,
      });
    } else if (typeof q.correctAnswer === 'string') {
      const ansLetter = q.correctAnswer.trim().toUpperCase();
      const letterIndexMap: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7 };
      if (letterIndexMap[ansLetter] !== undefined) {
        if (letterIndexMap[ansLetter] >= options.length) {
          errors.push({
            questionId: qId,
            questionNumber: qNum,
            field: 'correctAnswer',
            message: `Câu ${qNum}: Đáp án đúng (${ansLetter}) vượt quá số phương án hiện có (${options.length}).`,
            isFatal: true,
          });
        }
      } else {
        const matched = options.some(opt => opt.trim().toLowerCase() === q.correctAnswer?.toString().trim().toLowerCase());
        if (!matched) {
          errors.push({
            questionId: qId,
            questionNumber: qNum,
            field: 'correctAnswer',
            message: `Câu ${qNum}: Đáp án đúng "${q.correctAnswer}" không khớp với bất kỳ phương án nào.`,
            isFatal: true,
          });
        }
      }
    }
  } else if (q.type === 'true_false') {
    if (options.length < 2) {
      errors.push({
        questionId: qId,
        questionNumber: qNum,
        field: 'options_tf_count',
        message: `Câu ${qNum}: Câu Đúng/Sai cần ít nhất 2 khẳng định (hiện có: ${options.length}).`,
        isFatal: true,
      });
    }

    const trimmedOptions = options.map(o => (typeof o === 'string' ? o.trim() : ''));
    if (trimmedOptions.some(o => o.length === 0)) {
      errors.push({
        questionId: qId,
        questionNumber: qNum,
        field: 'options_tf_empty',
        message: `Câu ${qNum}: Không được để trống nội dung khẳng định Đúng/Sai.`,
        isFatal: true,
      });
    }

    if (q.correctAnswer === undefined || q.correctAnswer === null) {
      errors.push({
        questionId: qId,
        questionNumber: qNum,
        field: 'correctAnswer',
        message: `Câu ${qNum}: Chưa thiết lập đáp án Đúng/Sai cho các khẳng định.`,
        isFatal: true,
      });
    } else if (Array.isArray(q.correctAnswer)) {
      if (q.correctAnswer.length !== options.length) {
        errors.push({
          questionId: qId,
          questionNumber: qNum,
          field: 'correctAnswer',
          message: `Câu ${qNum}: Số đáp án Đúng/Sai (${q.correctAnswer.length}) không khớp với số khẳng định (${options.length}).`,
          isFatal: true,
        });
      }
    }
  } else if (q.type === 'short_answer') {
    if (q.correctAnswer === undefined || q.correctAnswer === null || String(q.correctAnswer).trim().length === 0) {
      errors.push({
        questionId: qId,
        questionNumber: qNum,
        field: 'correctAnswer',
        message: `Câu ${qNum}: Chưa nhập đáp án đúng cho câu trả lời ngắn.`,
        isFatal: true,
      });
    }

    if (q.numericTolerance !== undefined && q.numericTolerance < 0) {
      errors.push({
        questionId: qId,
        questionNumber: qNum,
        field: 'numericTolerance',
        message: `Câu ${qNum}: Dung sai số học không được là số âm.`,
        isFatal: false, // warning
      });
    }
  }

  // 3. Explanation LaTeX check
  if (q.explanation && q.explanation.trim().length > 0) {
    const expCheck = validateLatexInText(q.explanation);
    if (!expCheck.isValid) {
      errors.push({
        questionId: qId,
        questionNumber: qNum,
        field: 'explanation_latex',
        message: `Câu ${qNum}: Lỗi công thức LaTeX trong phần lời giải.`,
        isFatal: true,
      });
    }
  }

  // 4. Images validation
  if (q.images && Array.isArray(q.images)) {
    q.images.forEach((imgUrl, i) => {
      if (!isValidUrl(imgUrl, true)) {
        errors.push({
          questionId: qId,
          questionNumber: qNum,
          field: `images_${i}`,
          message: `Câu ${qNum}: Đường dẫn hình ảnh #${i + 1} không hợp lệ.`,
          isFatal: true,
        });
      }
    });
  }

  // 5. Solution links validation
  if (q.solutionLinks && Array.isArray(q.solutionLinks)) {
    q.solutionLinks.forEach((link, i) => {
      if (!isValidUrl(link, false)) {
        errors.push({
          questionId: qId,
          questionNumber: qNum,
          field: `solution_link_${i}`,
          message: `Câu ${qNum}: Liên kết lời giải #${i + 1} ("${link}") không phải URL hợp lệ.`,
          isFatal: true,
        });
      }
    });
  }

  return errors;
}

/**
 * Validates an entire exam's questions before Publishing.
 * Rejects publish if there are any fatal errors or duplicate IDs or 0 questions.
 */
export function validateExamForPublish(questions: Question[]): ExamValidationResult {
  const allErrors: ValidationErrorItem[] = [];

  // 1. Must have questions
  if (!questions || questions.length === 0) {
    allErrors.push({
      questionId: 'root',
      questionNumber: 0,
      field: 'questions',
      message: 'Kỳ thi chưa có câu hỏi nào. Cần có ít nhất 1 câu hỏi để công bố.',
      isFatal: true,
    });
    return {
      canPublish: false,
      totalQuestions: 0,
      validQuestions: 0,
      fatalErrorCount: 1,
      warningCount: 0,
      errors: allErrors,
    };
  }

  // 2. Check duplicate IDs
  const idMap = new Map<string, number>();
  questions.forEach(q => {
    if (q.id) {
      idMap.set(q.id, (idMap.get(q.id) || 0) + 1);
    }
  });

  idMap.forEach((count, id) => {
    if (count > 1) {
      allErrors.push({
        questionId: id,
        questionNumber: 0,
        field: 'duplicate_id',
        message: `Phát hiện ID câu hỏi bị trùng lặp: ${id} (${count} lần).`,
        isFatal: true,
      });
    }
  });

  // 3. Validate every question
  let validCount = 0;
  questions.forEach(q => {
    const qErrors = validateSingleQuestionDetailed(q);
    const fatalInQ = qErrors.filter(e => e.isFatal);
    if (fatalInQ.length === 0) {
      validCount++;
    }
    allErrors.push(...qErrors);
  });

  const fatalErrors = allErrors.filter(e => e.isFatal);
  const warnings = allErrors.filter(e => !e.isFatal);

  return {
    canPublish: fatalErrors.length === 0,
    totalQuestions: questions.length,
    validQuestions: validCount,
    fatalErrorCount: fatalErrors.length,
    warningCount: warnings.length,
    errors: allErrors,
  };
}
