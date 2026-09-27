import type { Question } from '../types/question';
import type {
  TestAttempt,
  TestResult,
  ResultQuestionItem,
  StudentAnswerValue,
} from '../types/attempt';

export const GRACE_PERIOD_MS = 60 * 1000; // 60 seconds grace period for network delays

/**
 * Checks whether an answer is considered completely blank/unanswered
 */
export function isAnswerBlank(answer: StudentAnswerValue | undefined): boolean {
  if (answer === undefined || answer === null || answer === '') {
    return true;
  }
  if (Array.isArray(answer)) {
    return answer.length === 0 || answer.every(v => v === null || v === undefined || v === '');
  }
  return false;
}

/**
 * Formats duration in seconds into a friendly human-readable Vietnamese string
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) {
    return `${secs} giây`;
  }
  return `${mins} phút ${secs} giây`;
}

/**
 * Server-Authoritative Grading Engine.
 * Evaluates student answers against the authoritative answer keys.
 * NEVER trusts score or results sent by frontend.
 */
export function gradeAttempt(
  attempt: TestAttempt,
  rawQuestions: Question[],
  finalAnswers?: Record<string, StudentAnswerValue>,
  submissionTime: string = new Date().toISOString()
): TestResult {
  if (!rawQuestions || rawQuestions.length === 0) {
    throw new Error('Không có danh sách câu hỏi để chấm điểm.');
  }

  const answers = finalAnswers || attempt.answers || {};

  let totalScore = 0;
  let totalPoints = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let blankCount = 0;

  const questionResults: ResultQuestionItem[] = [];

  rawQuestions.forEach((q, idx) => {
    const maxPoints = q.points !== undefined && q.points > 0 ? q.points : 1;
    totalPoints += maxPoints;

    const rawStudentAnswer = answers[q.id];
    const isBlank = isAnswerBlank(rawStudentAnswer);

    let isCorrect = false;
    let pointsAwarded = 0;

    if (isBlank) {
      blankCount++;
    } else {
      // Grade based on Question Type
      if (q.type === 'multiple_choice') {
        // Handle student option randomization if applicable
        let mappedAnswer = rawStudentAnswer;
        if (typeof rawStudentAnswer === 'string' && attempt.optionMappings?.[q.id]) {
          const mapping = attempt.optionMappings[q.id];
          const displayedIndex = rawStudentAnswer.charCodeAt(0) - 65; // 'A' -> 0, 'B' -> 1
          if (displayedIndex >= 0 && displayedIndex < mapping.displayToOriginal.length) {
            const origIndex = mapping.displayToOriginal[displayedIndex];
            mappedAnswer = String.fromCharCode(65 + origIndex);
          }
        }

        const expected = String(q.correctAnswer || '').trim().toUpperCase();
        const actual = String(mappedAnswer || '').trim().toUpperCase();

        if (expected && actual === expected) {
          isCorrect = true;
          pointsAwarded = maxPoints;
          correctCount++;
        } else {
          wrongCount++;
        }
      } else if (q.type === 'true_false') {
        // True / False 4 statements (Vietnam GDPT 2018 grading curve)
        const expectedBools = (Array.isArray(q.correctAnswer) ? q.correctAnswer : []) as boolean[];
        const studentBools = (Array.isArray(rawStudentAnswer) ? rawStudentAnswer : []) as boolean[];

        let correctSubItems = 0;
        const totalItems = expectedBools.length || 4;

        for (let i = 0; i < totalItems; i++) {
          if (studentBools[i] !== undefined && studentBools[i] !== null && studentBools[i] === expectedBools[i]) {
            correctSubItems++;
          }
        }

        // Vietnam GDPT 2018 partial scoring curve:
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

        pointsAwarded = Number((ratio * maxPoints).toFixed(2));
        if (correctSubItems === totalItems && totalItems > 0) {
          isCorrect = true;
          correctCount++;
        } else {
          wrongCount++;
        }
      } else if (q.type === 'short_answer') {
        const studentStr = String(rawStudentAnswer || '').trim().toLowerCase();
        const primaryAnswer = String(q.correctAnswer || '').trim().toLowerCase();
        const accepted = (q.acceptedAnswers || []).map(a => String(a).trim().toLowerCase());
        const allAccepted = [primaryAnswer, ...accepted].filter(Boolean);

        const studentNum = parseFloat(studentStr);
        const primaryNum = parseFloat(primaryAnswer);

        if (
          q.numericTolerance !== undefined &&
          q.numericTolerance !== null &&
          !isNaN(studentNum) &&
          !isNaN(primaryNum) &&
          Math.abs(studentNum - primaryNum) <= q.numericTolerance
        ) {
          isCorrect = true;
          pointsAwarded = maxPoints;
          correctCount++;
        } else if (allAccepted.includes(studentStr)) {
          isCorrect = true;
          pointsAwarded = maxPoints;
          correctCount++;
        } else {
          wrongCount++;
        }
      }
    }

    totalScore += pointsAwarded;

    questionResults.push({
      questionId: q.id,
      questionNumber: q.questionNumber || idx + 1,
      type: q.type,
      content: q.content,
      options: q.options || [],
      studentAnswer: rawStudentAnswer ?? null,
      correctAnswer: q.correctAnswer,
      isCorrect,
      points: pointsAwarded,
      maxPoints,
      explanation: q.explanation,
      solutionLinks: q.solutionLinks,
    });
  });

  const finalScore = Number(totalScore.toFixed(2));
  const finalTotalPoints = Number(totalPoints.toFixed(2));
  const scorePercentage =
    finalTotalPoints > 0 ? Number(((finalScore / finalTotalPoints) * 100).toFixed(1)) : 0;

  // Duration calculation
  const startMs = new Date(attempt.startedAt).getTime();
  const submitMs = new Date(submissionTime).getTime();
  const durationSeconds = Math.max(0, Math.floor((submitMs - startMs) / 1000));
  const durationFormatted = formatDuration(durationSeconds);

  return {
    attemptId: attempt.id,
    testId: attempt.testId,
    studentName: attempt.studentName,
    studentId: attempt.studentId,
    score: finalScore,
    totalPoints: finalTotalPoints,
    correctCount,
    wrongCount,
    blankCount,
    startedAt: attempt.startedAt,
    submittedAt: submissionTime,
    duration: durationFormatted,
    durationSeconds,
    questionResults,
    // Aliases
    maxScore: finalTotalPoints,
    scorePercentage,
    totalQuestions: rawQuestions.length,
    answersSummary: {
      answered: rawQuestions.length - blankCount,
      unanswered: blankCount,
    },
    detailedResults: questionResults,
  };
}
