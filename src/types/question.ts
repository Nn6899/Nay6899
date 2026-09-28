export type QuestionType = 'multiple_choice' | 'true_false' | 'short_answer';

export type QuestionValidationStatus = 'VALID' | 'NEEDS_REVIEW';

export interface Question {
  id: string;
  testId?: string;
  questionNumber: number;
  type: QuestionType;
  content: string; // Nội dung câu hỏi (chứa công thức LaTeX nếu có)
  options: string[]; // Danh sách các lựa chọn (A, B, C, D) hoặc khẳng định (a, b, c, d)
  correctAnswer: string | boolean[] | string[]; // Vd: "A" hoặc [true, false, true, false] hoặc "2.5"
  acceptedAnswers?: string[]; // Các đáp án tương đương được chấp nhận cho câu trả lời ngắn
  numericTolerance?: number; // Sai số dung sai cho đáp án số học (vd: 0.05)
  explanation?: string; // Lời giải chi tiết (chứa công thức LaTeX nếu có)
  solutionLinks?: string[]; // Danh sách liên kết video hoặc tài liệu giải thích
  images?: string[]; // Danh sách hình ảnh đính kèm (URL hoặc data URI)
  points?: number;
  validationStatus?: QuestionValidationStatus;
  validationErrors?: string[];
  rawText?: string;
}

export interface ValidationErrorItem {
  questionId: string;
  questionNumber: number;
  field: string;
  message: string;
  isFatal: boolean;
}

export interface ExamValidationResult {
  canPublish: boolean;
  totalQuestions: number;
  validQuestions: number;
  fatalErrorCount: number;
  warningCount: number;
  errors: ValidationErrorItem[];
}

export type SupportedFileFormat = 'tex' | 'docx' | 'pdf' | 'txt';

export interface FileValidationResult {
  isValid: boolean;
  fileType: SupportedFileFormat | 'unknown';
  fileName: string;
  fileSize: number;
  mimeType: string;
  error?: string;
}

export interface ParseWarning {
  code: string;
  message: string;
  questionNumber?: number;
}

export interface ParseResult {
  success: boolean;
  fileType: SupportedFileFormat | 'unknown';
  fileName: string;
  questions: Question[];
  warnings: string[];
  requiresOcrOrAi?: boolean;
  totalParsed: number;
  validCount: number;
  needsReviewCount: number;
  rawTextSample?: string;
}

export interface TestImportMetadata {
  id: string;
  testId: string;
  teacherId: string;
  fileName: string;
  fileSize: number;
  fileType: SupportedFileFormat;
  storageUrl?: string;
  uploadedAt: string;
  totalParsed: number;
  validCount: number;
  needsReviewCount: number;
}
