import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Clock,
  Send,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Wifi,
  WifiOff,
  CloudCheck,
  Menu,
  X,
  HelpCircle,
} from 'lucide-react';
import type { QuizTest } from '../../types/test';
import type {
  TestAttempt,
  ClientSanitizedQuestion,
  StudentAnswerValue,
  AttemptGradeResult,
} from '../../types/attempt';
import { attemptService } from '../../services/attemptService';
import { LatexRenderer } from '../common/LatexRenderer';
import { SubmitConfirmModal } from './SubmitConfirmModal';

interface StudentExamTakingProps {
  test: QuizTest;
  attempt: TestAttempt;
  sanitizedQuestions: ClientSanitizedQuestion[];
  onExamSubmitted: (result: AttemptGradeResult) => void;
}

export const StudentExamTaking: React.FC<StudentExamTakingProps> = ({
  test,
  attempt: initialAttempt,
  sanitizedQuestions,
  onExamSubmitted,
}) => {
  const [attempt, setAttempt] = useState<TestAttempt>(initialAttempt);
  const [answers, setAnswers] = useState<Record<string, StudentAnswerValue>>(
    () => initialAttempt.answers || {}
  );
  const [markedForReview, setMarkedForReview] = useState<string[]>(
    () => initialAttempt.markedForReview || []
  );
  const [currentIndex, setCurrentIndex] = useState<number>(0);

  // Connection & sync state
  const [isOnline, setIsOnline] = useState<boolean>(() => navigator.onLine);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'offline'>('saved');

  // Submit modal & process
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExamLocked, setIsExamLocked] = useState(false);
  const [autoSubmitMessage, setAutoSubmitMessage] = useState<string | null>(null);

  // Mobile Question Palette drawer
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);

  // Precise Server-based Timer calculation
  const expiresAtMs = useRef<number>(new Date(initialAttempt.expiresAt).getTime());
  const [secondsRemaining, setSecondsRemaining] = useState<number>(() => {
    const diff = Math.floor((expiresAtMs.current - Date.now()) / 1000);
    return Math.max(0, diff);
  });

  // Current active question
  const currentQuestion = sanitizedQuestions[currentIndex] || sanitizedQuestions[0];

  // Autosave debouncer reference
  const autosaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Helper to trigger save
  const triggerSave = useCallback(
    (newAnswers: Record<string, StudentAnswerValue>, newReview: string[]) => {
      setSaveStatus(navigator.onLine ? 'saving' : 'offline');

      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
      }

      autosaveTimeoutRef.current = setTimeout(async () => {
        try {
          await attemptService.saveAnswers(attempt.id, test.id, newAnswers, newReview);
          setSaveStatus(navigator.onLine ? 'saved' : 'offline');
        } catch {
          setSaveStatus('offline');
        }
      }, 500);
    },
    [attempt.id, test.id]
  );

  // Warn on page close if in-progress
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isExamLocked && attempt.status === 'IN_PROGRESS') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isExamLocked, attempt.status]);

  // Online / Offline listener
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Immediately sync current answers
      triggerSave(answers, markedForReview);
    };
    const handleOffline = () => {
      setIsOnline(false);
      setSaveStatus('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [answers, markedForReview, triggerSave]);

  // Submit Handler
  const handleSubmitExam = useCallback(
    async (isForceTimeout = false) => {
      if (isSubmitting || isExamLocked) return;

      setIsSubmitting(true);
      setIsExamLocked(true);

      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
      }

      try {
        const gradeResult = await attemptService.submitAttempt(attempt.id, test.id, answers);
        onExamSubmitted(gradeResult);
      } catch (err: any) {
        console.error('Error submitting exam:', err);
        alert(err.message || 'Lỗi khi nộp bài. Vui lòng thử lại hoặc chụp màn hình liên hệ giáo viên.');
        setIsSubmitting(false);
        if (!isForceTimeout) {
          setIsExamLocked(false);
        }
      }
    },
    [isSubmitting, isExamLocked, attempt.id, test.id, answers, onExamSubmitted]
  );

  // Timer Tick: Based strictly on expiresAt timestamp
  useEffect(() => {
    if (isExamLocked) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const remaining = Math.floor((expiresAtMs.current - now) / 1000);

      if (remaining <= 0) {
        setSecondsRemaining(0);
        clearInterval(interval);
        setAutoSubmitMessage('Hết thời gian làm bài! Hệ thống đang tự động nộp bài của bạn...');
        handleSubmitExam(true);
      } else {
        setSecondsRemaining(remaining);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isExamLocked, handleSubmitExam]);

  // Periodic autosave interval (every 20 seconds as safety net)
  useEffect(() => {
    const autoSaveInterval = setInterval(() => {
      if (!isExamLocked) {
        triggerSave(answers, markedForReview);
      }
    }, 20000);

    return () => clearInterval(autoSaveInterval);
  }, [answers, markedForReview, isExamLocked, triggerSave]);

  // Answer change handlers
  const handleSelectMultipleChoice = (optionLetter: string) => {
    if (isExamLocked || !currentQuestion) return;
    const newAnswers = {
      ...answers,
      [currentQuestion.id]: optionLetter,
    };
    setAnswers(newAnswers);
    triggerSave(newAnswers, markedForReview);
  };

  const handleToggleTrueFalse = (subIndex: number, value: boolean) => {
    if (isExamLocked || !currentQuestion) return;
    const currentArray = (Array.isArray(answers[currentQuestion.id])
      ? answers[currentQuestion.id]
      : [null, null, null, null]) as (boolean | null)[];

    const updatedArray = [...currentArray];
    updatedArray[subIndex] = value;

    const newAnswers = {
      ...answers,
      [currentQuestion.id]: updatedArray as boolean[],
    };
    setAnswers(newAnswers);
    triggerSave(newAnswers, markedForReview);
  };

  const handleShortAnswerChange = (val: string) => {
    if (isExamLocked || !currentQuestion) return;
    const newAnswers = {
      ...answers,
      [currentQuestion.id]: val,
    };
    setAnswers(newAnswers);
    triggerSave(newAnswers, markedForReview);
  };

  // Toggle Review flag
  const handleToggleReview = (questionId: string) => {
    const isMarked = markedForReview.includes(questionId);
    const newReview = isMarked
      ? markedForReview.filter(id => id !== questionId)
      : [...markedForReview, questionId];
    setMarkedForReview(newReview);
    triggerSave(answers, newReview);
  };

  // Check answered status of any question
  const isQuestionAnswered = (q: ClientSanitizedQuestion): boolean => {
    const ans = answers[q.id];
    if (ans === undefined || ans === null || ans === '') return false;
    if (q.type === 'true_false' && Array.isArray(ans)) {
      return ans.some(v => v !== null && v !== undefined);
    }
    return true;
  };

  // Format timer
  const formatTimer = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    const pad = (n: number) => String(n).padStart(2, '0');
    if (hours > 0) {
      return `${hours}:${pad(mins)}:${pad(secs)}`;
    }
    return `${pad(mins)}:${pad(secs)}`;
  };

  const timerColorClass =
    secondsRemaining <= 60
      ? 'bg-rose-600 text-white animate-pulse'
      : secondsRemaining <= 300
      ? 'bg-amber-500 text-white'
      : 'bg-slate-900 text-white';

  // Stats calculation
  const totalCount = sanitizedQuestions.length;
  const answeredCount = sanitizedQuestions.filter(q => isQuestionAnswered(q)).length;
  const unansweredCount = totalCount - answeredCount;
  const reviewCount = markedForReview.length;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Auto-submit Lock Overlay */}
      {autoSubmitMessage && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 sm:p-8 max-w-md w-full text-center space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="w-14 h-14 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto animate-bounce">
              <Clock className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">{autoSubmitMessage}</h3>
            <p className="text-xs text-slate-500">
              Vui lòng không đóng trình duyệt trong khi hệ thống đang ghi nhận bài nộp...
            </p>
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div className="bg-blue-600 h-full w-full animate-pulse" />
            </div>
          </div>
        </div>
      )}

      {/* STICKY TOP HEADER */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-xs">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2">
          {/* Left info */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setIsPaletteOpen(true)}
              className="lg:hidden p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
              title="Danh sách câu hỏi"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="min-w-0">
              <h1 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                {test.title}
              </h1>
              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                <span className="font-semibold text-slate-700 truncate max-w-[120px] sm:max-w-none">
                  {attempt.studentName}
                </span>
                {attempt.studentId && (
                  <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded-sm">
                    {attempt.studentId}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Center / Right: Timer, Save Status & Submit */}
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {/* Sync status */}
            <div className="hidden sm:flex items-center gap-1 text-[11px]">
              {!isOnline ? (
                <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200">
                  <WifiOff className="w-3.5 h-3.5" />
                  <span>Mất mạng (Lưu máy bạn)</span>
                </span>
              ) : saveStatus === 'saving' ? (
                <span className="inline-flex items-center gap-1 text-blue-600 bg-blue-50 px-2 py-1 rounded-lg">
                  <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
                  <span>Đang lưu...</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-slate-400">
                  <CloudCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Đã lưu</span>
                </span>
              )}
            </div>

            {/* Countdown Timer */}
            <div
              className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl flex items-center gap-1.5 sm:gap-2 font-mono font-bold text-xs sm:text-sm shadow-xs ${timerColorClass}`}
            >
              <Clock className="w-4 h-4 shrink-0" />
              <span>{formatTimer(secondsRemaining)}</span>
            </div>

            {/* Submit button */}
            <button
              type="button"
              onClick={() => setIsSubmitModalOpen(true)}
              disabled={isExamLocked}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs transition-colors disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Nộp Bài</span>
              <span className="sm:hidden">Nộp</span>
              <span className="bg-emerald-700 text-emerald-100 text-[10px] font-mono px-1.5 py-0.5 rounded-full">
                {answeredCount}/{totalCount}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <div className="max-w-7xl mx-auto w-full px-3 sm:px-6 py-4 sm:py-6 flex-1 flex flex-col lg:flex-row gap-6">
        {/* LEFT COLUMN: ACTIVE QUESTION CARD */}
        <main className="flex-1 flex flex-col min-w-0">
          {currentQuestion ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs flex-1 flex flex-col overflow-hidden">
              {/* Question Header */}
              <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between gap-3 bg-slate-50/50">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-3 py-1 rounded-xl text-xs font-bold bg-slate-900 text-white">
                    Câu {currentQuestion.displayNumber} / {totalCount}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-blue-50 text-blue-700">
                    {currentQuestion.type === 'multiple_choice'
                      ? 'Trắc nghiệm chọn 1'
                      : currentQuestion.type === 'true_false'
                      ? 'Đúng / Sai'
                      : 'Trả lời ngắn'}
                  </span>
                  <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                    {currentQuestion.points || 1} điểm
                  </span>
                </div>

                {/* Flag for review button */}
                <button
                  type="button"
                  onClick={() => handleToggleReview(currentQuestion.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                    markedForReview.includes(currentQuestion.id)
                      ? 'bg-amber-100 text-amber-900 border border-amber-300'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <Bookmark
                    className={`w-3.5 h-3.5 ${
                      markedForReview.includes(currentQuestion.id)
                        ? 'fill-amber-600 text-amber-600'
                        : ''
                    }`}
                  />
                  <span>
                    {markedForReview.includes(currentQuestion.id) ? 'Đã đánh dấu' : 'Đánh dấu xem lại'}
                  </span>
                </button>
              </div>

              {/* Question Content */}
              <div className="p-4 sm:p-6 flex-1 space-y-4 overflow-y-auto">
                <div className="text-sm sm:text-base font-medium text-slate-900 leading-relaxed">
                  <LatexRenderer content={currentQuestion.content} />
                </div>

                {/* Attached Images */}
                {currentQuestion.images && currentQuestion.images.length > 0 && (
                  <div className="my-3 flex items-center gap-3 flex-wrap">
                    {currentQuestion.images.map((src, imgIdx) => (
                      <div
                        key={imgIdx}
                        className="max-h-64 rounded-xl overflow-hidden border border-slate-200 bg-slate-50 p-1"
                      >
                        <img
                          src={src}
                          alt={`Minh họa câu ${currentQuestion.displayNumber}`}
                          className="max-h-60 max-w-full object-contain mx-auto"
                          referrerPolicy="no-referrer"
                        />
                        {currentQuestion.images!.length > 1 && (
                          <p className="text-center text-xs text-slate-500 mt-1">Hình {imgIdx + 1}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Options / Input based on question type */}
                <div className="pt-2">
                  {/* 1. Multiple Choice */}
                  {currentQuestion.type === 'multiple_choice' && currentQuestion.options && (
                    <div className="grid grid-cols-1 gap-2.5">
                      {currentQuestion.options.map((optionText, optIdx) => {
                        const letter = String.fromCharCode(65 + optIdx);
                        const isSelected = answers[currentQuestion.id] === letter;

                        return (
                          <button
                            key={optIdx}
                            type="button"
                            onClick={() => handleSelectMultipleChoice(letter)}
                            disabled={isExamLocked}
                            className={`w-full text-left p-3 sm:p-4 rounded-xl border-2 transition-all flex items-center gap-3.5 ${
                              isSelected
                                ? 'bg-blue-50/70 border-blue-600 text-blue-950 font-semibold shadow-xs'
                                : 'bg-white border-slate-200 hover:border-slate-300 text-slate-800'
                            }`}
                          >
                            <span
                              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
                                isSelected
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {letter}
                            </span>
                            <div className="flex-1 text-xs sm:text-sm">
                              <LatexRenderer content={optionText} />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* 2. True / False (4 statements) */}
                  {currentQuestion.type === 'true_false' && currentQuestion.options && (
                    <div className="space-y-3">
                      <p className="text-xs text-slate-500 font-medium">
                        Chọn [Đúng] hoặc [Sai] cho từng phát biểu dưới đây:
                      </p>
                      {currentQuestion.options.map((statement, sIdx) => {
                        const letter = String.fromCharCode(97 + sIdx);
                        const currentChoices = (Array.isArray(answers[currentQuestion.id])
                          ? answers[currentQuestion.id]
                          : []) as (boolean | null)[];
                        const choice = currentChoices[sIdx];

                        return (
                          <div
                            key={sIdx}
                            className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="flex items-start gap-2.5 flex-1 text-xs sm:text-sm text-slate-900">
                              <span className="font-bold text-slate-700 shrink-0">
                                {letter})
                              </span>
                              <div className="flex-1">
                                <LatexRenderer content={statement} />
                              </div>
                            </div>

                            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                              <button
                                type="button"
                                onClick={() => handleToggleTrueFalse(sIdx, true)}
                                disabled={isExamLocked}
                                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                  choice === true
                                    ? 'bg-emerald-600 text-white shadow-xs'
                                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-emerald-50'
                                }`}
                              >
                                Đúng
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleTrueFalse(sIdx, false)}
                                disabled={isExamLocked}
                                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                  choice === false
                                    ? 'bg-rose-600 text-white shadow-xs'
                                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-rose-50'
                                }`}
                              >
                                Sai
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* 3. Short Answer */}
                  {currentQuestion.type === 'short_answer' && (
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-slate-700">
                        Nhập câu trả lời của bạn vào ô bên dưới:
                      </label>
                      <input
                        type="text"
                        value={String(answers[currentQuestion.id] || '')}
                        onChange={e => handleShortAnswerChange(e.target.value)}
                        disabled={isExamLocked}
                        placeholder="Ví dụ: 3.14 hoặc 15 hoặc kết quả số học..."
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                      />
                      <p className="text-[11px] text-slate-500">
                        * Đối với câu hỏi số học, nhập số dạng thập phân nếu cần (ví dụ: 2.5).
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Navigation footer */}
              <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
                  disabled={currentIndex === 0}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Câu Trước</span>
                </button>

                <span className="text-xs text-slate-500 font-medium hidden sm:inline">
                  Dùng phím mũi tên hoặc bấm số câu để di chuyển nhanh
                </span>

                <button
                  type="button"
                  onClick={() =>
                    setCurrentIndex(prev => Math.min(sanitizedQuestions.length - 1, prev + 1))
                  }
                  disabled={currentIndex === sanitizedQuestions.length - 1}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold disabled:opacity-40 transition-colors shadow-xs"
                >
                  <span>Câu Tiếp</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="p-12 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
              Không có câu hỏi nào.
            </div>
          )}
        </main>

        {/* RIGHT COLUMN: QUESTION PALETTE GRID (DESKTOP) */}
        <aside className="hidden lg:block w-80 shrink-0">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs sticky top-20 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">Danh Sách Câu Hỏi</h3>
              <span className="text-xs font-bold text-blue-600">
                {answeredCount} / {totalCount} đã làm
              </span>
            </div>

            {/* Legend */}
            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 bg-slate-50 p-2.5 rounded-xl">
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded-sm bg-blue-600" />
                <span>Đã trả lời</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded-sm bg-white border border-slate-300" />
                <span>Chưa trả lời</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded-sm bg-amber-400" />
                <span>Đánh dấu xem lại</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded-sm border-2 border-slate-900 bg-slate-100" />
                <span>Đang chọn</span>
              </div>
            </div>

            {/* Grid of buttons */}
            <div className="grid grid-cols-5 gap-2 max-h-[360px] overflow-y-auto pr-1">
              {sanitizedQuestions.map((q, qIdx) => {
                const isAnswered = isQuestionAnswered(q);
                const isCurrent = currentIndex === qIdx;
                const isReview = markedForReview.includes(q.id);

                let btnStyle = 'bg-white border-slate-200 text-slate-700 hover:border-slate-400';
                if (isAnswered) {
                  btnStyle = 'bg-blue-600 border-blue-600 text-white font-bold shadow-xs';
                }

                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setCurrentIndex(qIdx)}
                    className={`relative h-10 rounded-xl border text-xs flex items-center justify-center transition-all ${btnStyle} ${
                      isCurrent ? 'ring-2 ring-slate-900 ring-offset-1 font-extrabold' : ''
                    }`}
                  >
                    <span>{q.displayNumber}</span>
                    {isReview && (
                      <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-500 rounded-full border-2 border-white" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Quick Submit button */}
            <div className="pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsSubmitModalOpen(true)}
                disabled={isExamLocked}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center justify-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Nộp Bài Thi ({answeredCount}/{totalCount})</span>
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* MOBILE DRAWER: QUESTION PALETTE */}
      {isPaletteOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
            onClick={() => setIsPaletteOpen(false)}
          />
          <div className="relative ml-auto max-w-xs w-full bg-white h-full p-5 flex flex-col shadow-2xl z-10 animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">Danh Sách Câu Hỏi</h3>
              <button
                type="button"
                onClick={() => setIsPaletteOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="my-3 text-xs font-bold text-blue-600">
              Đã làm: {answeredCount} / {totalCount} câu
            </div>

            {/* Grid */}
            <div className="grid grid-cols-4 gap-2.5 flex-1 overflow-y-auto py-2">
              {sanitizedQuestions.map((q, qIdx) => {
                const isAnswered = isQuestionAnswered(q);
                const isCurrent = currentIndex === qIdx;
                const isReview = markedForReview.includes(q.id);

                let btnStyle = 'bg-white border-slate-200 text-slate-700';
                if (isAnswered) {
                  btnStyle = 'bg-blue-600 border-blue-600 text-white font-bold';
                }

                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => {
                      setCurrentIndex(qIdx);
                      setIsPaletteOpen(false);
                    }}
                    className={`relative h-11 rounded-xl border text-xs flex items-center justify-center font-semibold ${btnStyle} ${
                      isCurrent ? 'ring-2 ring-slate-900' : ''
                    }`}
                  >
                    <span>{q.displayNumber}</span>
                    {isReview && (
                      <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-500 rounded-full border-2 border-white" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setIsPaletteOpen(false);
                  setIsSubmitModalOpen(true);
                }}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center justify-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Nộp Bài ({answeredCount}/{totalCount})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUBMIT CONFIRMATION MODAL */}
      <SubmitConfirmModal
        isOpen={isSubmitModalOpen}
        totalQuestions={totalCount}
        answeredCount={answeredCount}
        unansweredCount={unansweredCount}
        reviewCount={reviewCount}
        isSubmitting={isSubmitting}
        onClose={() => setIsSubmitModalOpen(false)}
        onConfirmSubmit={() => {
          setIsSubmitModalOpen(false);
          handleSubmitExam(false);
        }}
      />
    </div>
  );
};
