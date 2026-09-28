import { QuestionType } from './question';

export type AttemptStatus = 'IN_PROGRESS' | 'SUBMITTED' | 'EXPIRED';

export type StudentAnswerValue = string | boolean[] | string[] | null;

export interface ClientQuestionOption {
  id: string; // usually 'A', 'B', 'C', 'D' or '0', '1', '2', '3'
  text: string;
}

/**
 * Sanitized question sent to student browser.
 * Absolutely NO correctAnswer, NO explanation, NO solutionLinks.
 */
export interface ClientSanitizedQuestion {
  id: string;
  originalIndex: number;
  displayNumber: number;
  type: QuestionType;
  content: string;
  options: string[]; // Options in the order presented to student
  images?: string[];
  points?: number;
}

export interface OptionMappingInfo {
  // Original index -> Displayed index mapping or vice versa
  originalToDisplay: number[];
  displayToOriginal: number[];
}

export interface ResultQuestionItem {
  questionId: string;
  studentAnswer: StudentAnswerValue;
  isCorrect: boolean;
  points: number; // Score points awarded
  scoreAwarded?: number; // Alias for points
  // Optional enriched fields for student review
  questionNumber?: number;
  type?: QuestionType;
  content?: string;
  options?: string[];
  correctAnswer?: string | boolean[] | string[];
  maxPoints?: number;
  explanation?: string;
  solutionLinks?: string[];
}

export type AttemptQuestionResult = ResultQuestionItem;

/**
 * Authoritative Server-Graded Exam Result Model (Phase 6)
 */
export interface TestResult {
  attemptId: string;
  testId: string;
  studentName: string;
  studentId?: string;
  score: number;
  totalPoints: number;
  correctCount: number;
  wrongCount: number;
  blankCount: number;
  startedAt: string;
  submittedAt: string;
  duration: number | string; // Duration in minutes/seconds or formatted string
  durationSeconds?: number;
  questionResults: ResultQuestionItem[];
  // Backwards-compatible aliases
  maxScore: number;
  scorePercentage: number;
  totalQuestions: number;
  answersSummary: {
    answered: number;
    unanswered: number;
  };
  detailedResults?: ResultQuestionItem[];
}

export type AttemptGradeResult = TestResult;

export interface TestAttempt {
  id: string;
  testId: string;
  testPublicCode: string;
  studentName: string;
  studentId?: string;
  startedAt: string;
  expiresAt: string;
  durationMinutes: number;
  status: AttemptStatus;
  answers: Record<string, StudentAnswerValue>;
  markedForReview: string[];
  lastSavedAt: string;
  // Randomization info
  questionOrder?: string[]; // Array of question IDs in student-specific order
  optionMappings?: Record<string, OptionMappingInfo>; // questionId -> mapping
  // Post-submit fields
  submittedAt?: string;
  score?: number;
  maxScore?: number;
  correctCount?: number;
  totalQuestions?: number;
}

export interface StartAttemptInput {
  testId: string;
  testPublicCode: string;
  studentName: string;
  studentId?: string;
}
