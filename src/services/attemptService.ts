import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  increment,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import type { QuizTest } from '../types/test';
import type { Question } from '../types/question';
import type {
  TestAttempt,
  StartAttemptInput,
  ClientSanitizedQuestion,
  StudentAnswerValue,
  AttemptGradeResult,
  AttemptQuestionResult,
  OptionMappingInfo,
} from '../types/attempt';
import { questionService } from './questionService';
import { getTestByPublicCode } from './testService';
import { gradeAttempt, GRACE_PERIOD_MS } from './gradingEngine';

const LOCAL_ATTEMPT_KEY_PREFIX = 'eduquiz_attempt_';
const LOCAL_ACTIVE_ATTEMPT_PREFIX = 'eduquiz_active_attempt_';

/**
 * Fisher-Yates array shuffle helper
 */
function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Service managing student exam attempts, question sanitization,
 * autosave, timer validation, and secure grading.
 */
export const attemptService = {
  /**
   * Check if the student has an active (in-progress and non-expired) attempt on this device
   */
  getActiveAttempt(testId: string): TestAttempt | null {
    try {
      const activeId = localStorage.getItem(`${LOCAL_ACTIVE_ATTEMPT_PREFIX}${testId}`);
      if (!activeId) return null;

      const raw = localStorage.getItem(`${LOCAL_ATTEMPT_KEY_PREFIX}${activeId}`);
      if (!raw) return null;

      const attempt: TestAttempt = JSON.parse(raw);
      if (attempt.status !== 'IN_PROGRESS') return null;

      // Check if expired
      const now = Date.now();
      const expires = new Date(attempt.expiresAt).getTime();
      if (now >= expires) {
        // Mark locally expired
        attempt.status = 'EXPIRED';
        localStorage.setItem(`${LOCAL_ATTEMPT_KEY_PREFIX}${activeId}`, JSON.stringify(attempt));
        return null;
      }

      return attempt;
    } catch (e) {
      console.warn('Failed to read active attempt:', e);
      return null;
    }
  },

  /**
   * Sanitizes questions for student view.
   * ABSOLUTE SECURITY MANDATE:
   * Strips correctAnswer, explanation, solutionLinks, acceptedAnswers, numericTolerance.
   */
  sanitizeQuestionsForStudent(
    questions: Question[],
    questionOrder?: string[],
    optionMappings?: Record<string, OptionMappingInfo>
  ): ClientSanitizedQuestion[] {
    // If custom order is specified, sort questions accordingly
    let orderedQuestions = [...questions];
    if (questionOrder && questionOrder.length > 0) {
      const map = new Map<string, Question>();
      questions.forEach(q => map.set(q.id, q));
      orderedQuestions = questionOrder
        .map(id => map.get(id))
        .filter((q): q is Question => q !== undefined);

      // Append any missing questions
      questions.forEach(q => {
        if (!orderedQuestions.some(oq => oq.id === q.id)) {
          orderedQuestions.push(q);
        }
      });
    }

    return orderedQuestions.map((q, idx) => {
      let displayOptions = [...(q.options || [])];

      // Apply option randomization mapping if present
      if (q.type === 'multiple_choice' && optionMappings && optionMappings[q.id]) {
        const mapping = optionMappings[q.id];
        // Reconstruct display options according to displayToOriginal
        displayOptions = mapping.displayToOriginal.map(origIdx => q.options[origIdx]);
      }

      return {
        id: q.id,
        originalIndex: q.questionNumber || idx + 1,
        displayNumber: idx + 1,
        type: q.type,
        content: q.content,
        options: displayOptions,
        images: q.images ? [...q.images] : undefined,
        points: q.points !== undefined ? q.points : 1,
      };
    });
  },

  /**
   * Starts a new exam attempt for a student.
   * Handles question/option randomization and creates safe state.
   */
  async startAttempt(
    input: StartAttemptInput,
    test: QuizTest
  ): Promise<{ attempt: TestAttempt; sanitizedQuestions: ClientSanitizedQuestion[] }> {
    // 1. Fetch raw questions from database (or local storage fallback)
    const rawQuestions = await questionService.getQuestions(test.id);
    if (!rawQuestions || rawQuestions.length === 0) {
      throw new Error('Kỳ thi hiện chưa có câu hỏi nào để làm bài.');
    }

    // 2. Generate random attemptId
    const attemptId = `att_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // 3. Question Randomization
    let questionOrder: string[] = rawQuestions.map(q => q.id);
    if (test.randomizeQuestions) {
      questionOrder = shuffleArray(questionOrder);
    }

    // 4. Option Randomization for multiple choice
    const optionMappings: Record<string, OptionMappingInfo> = {};
    if (test.randomizeOptions) {
      rawQuestions.forEach(q => {
        if (q.type === 'multiple_choice' && q.options && q.options.length > 1) {
          const count = q.options.length;
          // Original indices [0, 1, 2, 3]
          const originalIndices = Array.from({ length: count }, (_, i) => i);
          // Shuffled indices, e.g. [2, 0, 3, 1] means display 0 is original 2
          const displayToOriginal = shuffleArray(originalIndices);
          const originalToDisplay = new Array(count);
          displayToOriginal.forEach((origIdx, dispIdx) => {
            originalToDisplay[origIdx] = dispIdx;
          });

          optionMappings[q.id] = {
            originalToDisplay,
            displayToOriginal,
          };
        }
      });
    }

    // 5. Calculate precise server/client time
    const startedAt = new Date().toISOString();
    const durationMinutes = test.duration || 45;
    const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();

    const attempt: TestAttempt = {
      id: attemptId,
      testId: test.id,
      testPublicCode: test.publicCode,
      studentName: input.studentName.trim(),
      studentId: input.studentId?.trim() || undefined,
      startedAt,
      expiresAt,
      durationMinutes,
      status: 'IN_PROGRESS',
      answers: {},
      markedForReview: [],
      lastSavedAt: startedAt,
      questionOrder,
      optionMappings,
    };

    // 6. Save locally
    localStorage.setItem(`${LOCAL_ATTEMPT_KEY_PREFIX}${attemptId}`, JSON.stringify(attempt));
    localStorage.setItem(`${LOCAL_ACTIVE_ATTEMPT_PREFIX}${test.id}`, attemptId);

    // 7. Save to Firestore if available
    try {
      if (db) {
        const attemptRef = doc(db, 'tests', test.id, 'attempts', attemptId);
        await setDoc(attemptRef, attempt);
      }
    } catch (err) {
      console.warn('Could not save attempt to Firestore immediately (will sync later):', err);
    }

    // 8. Generate sanitized questions
    const sanitizedQuestions = this.sanitizeQuestionsForStudent(
      rawQuestions,
      questionOrder,
      optionMappings
    );

    return { attempt, sanitizedQuestions };
  },

  /**
   * Resumes an existing attempt
   */
  async resumeAttempt(
    attemptId: string,
    test: QuizTest
  ): Promise<{ attempt: TestAttempt; sanitizedQuestions: ClientSanitizedQuestion[] }> {
    let attempt: TestAttempt | null = null;

    // 1. Check local storage
    const raw = localStorage.getItem(`${LOCAL_ATTEMPT_KEY_PREFIX}${attemptId}`);
    if (raw) {
      try {
        attempt = JSON.parse(raw);
      } catch {
        attempt = null;
      }
    }

    // 2. Fallback to Firestore if local missing
    if (!attempt && db) {
      try {
        const docRef = doc(db, 'tests', test.id, 'attempts', attemptId);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          attempt = snap.data() as TestAttempt;
        }
      } catch (err) {
        console.warn('Failed to fetch attempt from Firestore:', err);
      }
    }

    if (!attempt) {
      throw new Error('Không tìm thấy phiên làm bài này.');
    }

    // Check expiry
    const now = Date.now();
    const expires = new Date(attempt.expiresAt).getTime();
    if (now >= expires && attempt.status === 'IN_PROGRESS') {
      attempt.status = 'EXPIRED';
      localStorage.setItem(`${LOCAL_ATTEMPT_KEY_PREFIX}${attemptId}`, JSON.stringify(attempt));
    }

    const rawQuestions = await questionService.getQuestions(test.id);
    const sanitizedQuestions = this.sanitizeQuestionsForStudent(
      rawQuestions,
      attempt.questionOrder,
      attempt.optionMappings
    );

    return { attempt, sanitizedQuestions };
  },

  /**
   * Autosaves student answers and review marks (offline-first with sync)
   */
  async saveAnswers(
    attemptId: string,
    testId: string,
    answers: Record<string, StudentAnswerValue>,
    markedForReview: string[]
  ): Promise<void> {
    const lastSavedAt = new Date().toISOString();

    // 1. Update localStorage immediately (guarantees no loss on refresh)
    try {
      const raw = localStorage.getItem(`${LOCAL_ATTEMPT_KEY_PREFIX}${attemptId}`);
      if (raw) {
        const att: TestAttempt = JSON.parse(raw);
        att.answers = answers;
        att.markedForReview = markedForReview;
        att.lastSavedAt = lastSavedAt;
        localStorage.setItem(`${LOCAL_ATTEMPT_KEY_PREFIX}${attemptId}`, JSON.stringify(att));
      }
    } catch (e) {
      console.error('Failed to update local attempt storage:', e);
    }

    // 2. Sync to Firestore in background
    try {
      if (db && navigator.onLine) {
        const attemptRef = doc(db, 'tests', testId, 'attempts', attemptId);
        await updateDoc(attemptRef, {
          answers,
          markedForReview,
          lastSavedAt,
        });
      }
    } catch (err) {
      // Offline or temporary failure is acceptable, local storage holds the state
      console.warn('Firestore autosave postponed (offline or transient error):', err);
    }
  },

  /**
   * Submits the attempt and grades it securely.
   * Compares student answers against authoritative raw questions on backend/service.
   */
  async submitAttempt(
    attemptId: string,
    testId: string,
    finalAnswers?: Record<string, StudentAnswerValue>
  ): Promise<AttemptGradeResult> {
    // 1. Load latest attempt
    let attempt: TestAttempt | null = null;
    const localRaw = localStorage.getItem(`${LOCAL_ATTEMPT_KEY_PREFIX}${attemptId}`);
    if (localRaw) {
      try {
        attempt = JSON.parse(localRaw);
      } catch {}
    }

    if (!attempt && db) {
      const docRef = doc(db, 'tests', testId, 'attempts', attemptId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        attempt = snap.data() as TestAttempt;
      }
    }

    if (!attempt) {
      throw new Error('Không tìm thấy thông tin bài làm để nộp.');
    }

    if (attempt.testId !== testId) {
      throw new Error('Thông tin kỳ thi không khớp với bài làm.');
    }

    // REQUIREMENT 4: CHỐNG SUBMIT HAI LẦN
    // Nếu attempt đã submitted: Không chấm lại. Trả về kết quả hiện tại.
    if (attempt.status === 'SUBMITTED') {
      const existingResult = await this.getGradeResult(attemptId, testId);
      if (existingResult) {
        return existingResult;
      }
    }

    // Check expiration: If attempt is marked EXPIRED or is past expiration + grace period
    const now = Date.now();
    const expiresMs = new Date(attempt.expiresAt).getTime();
    if (attempt.status === 'EXPIRED' || now > expiresMs + GRACE_PERIOD_MS) {
      const existingResult = await this.getGradeResult(attemptId, testId);
      if (existingResult) {
        return existingResult;
      }
      attempt.status = 'EXPIRED';
      localStorage.setItem(`${LOCAL_ATTEMPT_KEY_PREFIX}${attemptId}`, JSON.stringify(attempt));
      throw new Error('Thời gian làm bài thi đã kết thúc. Bài thi đã bị khóa.');
    }

    const answers = finalAnswers || attempt.answers || {};

    // 2. Retrieve authoritative raw questions with correct answers
    const rawQuestions = await questionService.getQuestions(testId);
    if (!rawQuestions || rawQuestions.length === 0) {
      throw new Error('Không tìm thấy danh sách câu hỏi của kỳ thi.');
    }

    // 3. Grade each question securely
    let totalScore = 0;
    let maxScore = 0;
    let correctCount = 0;
    let answeredCount = 0;

    const detailedResults: AttemptQuestionResult[] = [];

    rawQuestions.forEach((q, idx) => {
      const questionMaxPoints = q.points !== undefined && q.points > 0 ? q.points : 1;
      maxScore += questionMaxPoints;

      // Student's answer for this question
      const rawStudentAnswer = answers[q.id];
      const isAnswered =
        rawStudentAnswer !== undefined &&
        rawStudentAnswer !== null &&
        rawStudentAnswer !== '' &&
        !(Array.isArray(rawStudentAnswer) && rawStudentAnswer.every(v => v === null || v === undefined));

      if (isAnswered) {
        answeredCount++;
      }

      let isCorrect = false;
      let scoreAwarded = 0;

      // Grade based on question type
      if (q.type === 'multiple_choice') {
        // Account for option randomization
        let mappedStudentAnswerLetter = rawStudentAnswer;
        if (typeof rawStudentAnswer === 'string' && attempt?.optionMappings?.[q.id]) {
          const mapping = attempt.optionMappings[q.id];
          const displayedIndex = rawStudentAnswer.charCodeAt(0) - 65; // 'A' -> 0, 'B' -> 1
          if (displayedIndex >= 0 && displayedIndex < mapping.displayToOriginal.length) {
            const origIndex = mapping.displayToOriginal[displayedIndex];
            mappedStudentAnswerLetter = String.fromCharCode(65 + origIndex);
          }
        }

        const expectedAnswer = String(q.correctAnswer || '').trim().toUpperCase();
        const actualAnswer = String(mappedStudentAnswerLetter || '').trim().toUpperCase();
        if (expectedAnswer && actualAnswer === expectedAnswer) {
          isCorrect = true;
          scoreAwarded = questionMaxPoints;
          correctCount++;
        }
      } else if (q.type === 'true_false') {
        // True/False 4 statements (GDPT 2018 format)
        const expectedBools = (Array.isArray(q.correctAnswer) ? q.correctAnswer : []) as boolean[];
        const studentBools = (Array.isArray(rawStudentAnswer) ? rawStudentAnswer : []) as boolean[];

        let correctSubItems = 0;
        const totalItems = expectedBools.length || 4;

        for (let i = 0; i < totalItems; i++) {
          if (studentBools[i] !== undefined && studentBools[i] === expectedBools[i]) {
            correctSubItems++;
          }
        }

        // Vietnam GDPT 2018 grading curve:
        // 1 right = 0.1x, 2 right = 0.25x, 3 right = 0.5x, 4 right = 1.0x
        let ratio = 0;
        if (totalItems === 4) {
          if (correctSubItems === 1) ratio = 0.1;
          else if (correctSubItems === 2) ratio = 0.25;
          else if (correctSubItems === 3) ratio = 0.5;
          else if (correctSubItems === 4) ratio = 1.0;
        } else if (totalItems > 0) {
          ratio = correctSubItems / totalItems;
        }

        scoreAwarded = Number((ratio * questionMaxPoints).toFixed(2));
        if (correctSubItems === totalItems && totalItems > 0) {
          isCorrect = true;
          correctCount++;
        }
      } else if (q.type === 'short_answer') {
        // Short Answer grading
        const studentStr = String(rawStudentAnswer || '').trim().toLowerCase();
        const primaryAnswer = String(q.correctAnswer || '').trim().toLowerCase();
        const accepted = (q.acceptedAnswers || []).map(a => String(a).trim().toLowerCase());
        const allAccepted = [primaryAnswer, ...accepted].filter(Boolean);

        // Check numeric tolerance if applicable
        const studentNum = parseFloat(studentStr);
        const primaryNum = parseFloat(primaryAnswer);

        if (
          q.numericTolerance !== undefined &&
          !isNaN(studentNum) &&
          !isNaN(primaryNum) &&
          Math.abs(studentNum - primaryNum) <= q.numericTolerance
        ) {
          isCorrect = true;
          scoreAwarded = questionMaxPoints;
          correctCount++;
        } else if (allAccepted.includes(studentStr)) {
          isCorrect = true;
          scoreAwarded = questionMaxPoints;
          correctCount++;
        }
      }

      totalScore += scoreAwarded;

      detailedResults.push({
        questionId: q.id,
        questionNumber: q.questionNumber || idx + 1,
        type: q.type,
        content: q.content,
        options: q.options || [],
        studentAnswer: rawStudentAnswer ?? null,
        correctAnswer: q.correctAnswer,
        isCorrect,
        scoreAwarded,
        maxPoints: questionMaxPoints,
        explanation: q.explanation,
        solutionLinks: q.solutionLinks,
      });
    });

    const submittedAt = new Date().toISOString();
    const finalScore = Number(totalScore.toFixed(2));
    const scorePercentage = maxScore > 0 ? Number(((finalScore / maxScore) * 100).toFixed(1)) : 0;

    const gradeResult: AttemptGradeResult = {
      attemptId,
      testId,
      studentName: attempt.studentName,
      studentId: attempt.studentId,
      submittedAt,
      score: finalScore,
      maxScore: Number(maxScore.toFixed(2)),
      scorePercentage,
      correctCount,
      totalQuestions: rawQuestions.length,
      answersSummary: {
        answered: answeredCount,
        unanswered: rawQuestions.length - answeredCount,
      },
      detailedResults,
    };

    // 4. Update attempt state
    attempt.status = 'SUBMITTED';
    attempt.answers = answers;
    attempt.submittedAt = submittedAt;
    attempt.score = finalScore;
    attempt.maxScore = maxScore;
    attempt.correctCount = correctCount;
    attempt.totalQuestions = rawQuestions.length;

    // Save to local storage
    localStorage.setItem(`${LOCAL_ATTEMPT_KEY_PREFIX}${attemptId}`, JSON.stringify(attempt));
    localStorage.setItem(`eduquiz_grade_result_${attemptId}`, JSON.stringify(gradeResult));
    // Clear active pointer
    localStorage.removeItem(`${LOCAL_ACTIVE_ATTEMPT_PREFIX}${testId}`);

    // Update test submissions count in local cache
    try {
      const rawTests = localStorage.getItem('eduquiz_local_tests');
      if (rawTests) {
        const tests = JSON.parse(rawTests);
        const tIdx = tests.findIndex((t: any) => t.id === testId);
        if (tIdx !== -1) {
          tests[tIdx].totalSubmissions = (tests[tIdx].totalSubmissions || 0) + 1;
          localStorage.setItem('eduquiz_local_tests', JSON.stringify(tests));
        }
      }
    } catch {}

    // 5. Update Firestore
    try {
      if (db) {
        const attemptRef = doc(db, 'tests', testId, 'attempts', attemptId);
        await updateDoc(attemptRef, {
          status: 'SUBMITTED',
          answers,
          submittedAt,
          score: finalScore,
          maxScore,
          correctCount,
          totalQuestions: rawQuestions.length,
        });

        // Increment totalSubmissions on test document
        const testRef = doc(db, 'tests', testId);
        await updateDoc(testRef, {
          totalSubmissions: increment(1),
        }).catch(() => {});
      }
    } catch (e) {
      console.warn('Failed to sync submission to Firestore:', e);
    }

    return gradeResult;
  },

  /**
   * Retrieves grade result from storage or Firestore
   */
  async getGradeResult(attemptId: string, testId?: string): Promise<AttemptGradeResult | null> {
    try {
      const raw = localStorage.getItem(`eduquiz_grade_result_${attemptId}`);
      if (raw) {
        return JSON.parse(raw);
      }
      if (db && testId) {
        const snap = await getDoc(doc(db, 'tests', testId, 'results', attemptId));
        if (snap.exists()) {
          return snap.data() as AttemptGradeResult;
        }
      }
      return null;
    } catch {
      return null;
    }
  },
};
