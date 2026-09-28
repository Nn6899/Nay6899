import React, { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Award,
  BookOpen,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ArrowLeft,
  Share2,
  HelpCircle,
} from 'lucide-react';
import type { QuizTest } from '../../types/test';
import type { AttemptGradeResult } from '../../types/attempt';
import { LatexRenderer } from '../common/LatexRenderer';

interface StudentExamResultProps {
  test: QuizTest;
  gradeResult: AttemptGradeResult;
  onBackToHome: () => void;
}

export const StudentExamResult: React.FC<StudentExamResultProps> = ({
  test,
  gradeResult,
  onBackToHome,
}) => {
  const [filterType, setFilterType] = useState<'all' | 'correct' | 'incorrect'>('all');
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null);

  const {
    studentName,
    studentId,
    submittedAt,
    score,
    maxScore,
    scorePercentage,
    correctCount,
    totalQuestions,
    answersSummary,
    detailedResults = [],
  } = gradeResult;

  const filteredQuestions = detailedResults.filter(q => {
    if (filterType === 'correct') return q.isCorrect;
    if (filterType === 'incorrect') return !q.isCorrect;
    return true;
  });

  const canViewScore = test.allowStudentViewScore;
  const canViewAnswers = test.allowStudentViewAnswers;
  const canViewSolutions = test.allowStudentViewSolutions;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Top Banner Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider bg-emerald-50 px-2.5 py-0.5 rounded-md">
                Đã Hoàn Thành & Ghi Nhận
              </span>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">{test.title}</h1>
            </div>
          </div>

          <button
            type="button"
            onClick={onBackToHome}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors self-start sm:self-center"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Về Trang Chủ</span>
          </button>
        </div>

        {/* Student metadata */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-50/80 rounded-xl border border-slate-100 text-xs">
          <div>
            <span className="text-slate-400 block text-[11px]">Thí sinh:</span>
            <strong className="text-slate-800 text-sm">{studentName}</strong>
          </div>
          {studentId && (
            <div>
              <span className="text-slate-400 block text-[11px]">Mã học sinh:</span>
              <strong className="text-slate-800 font-mono text-sm">{studentId}</strong>
            </div>
          )}
          <div>
            <span className="text-slate-400 block text-[11px]">Thời gian nộp bài:</span>
            <strong className="text-slate-700">
              {new Date(submittedAt).toLocaleTimeString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                day: '2-digit',
                month: '2-digit',
              })}
            </strong>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px]">Số câu đã làm:</span>
            <strong className="text-slate-800">
              {answersSummary.answered} / {totalQuestions} câu
            </strong>
          </div>
        </div>

        {/* Score Display (If allowed by teacher) */}
        {canViewScore ? (
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-sm">
            <div className="space-y-1.5 text-center sm:text-left">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-white/20 text-white backdrop-blur-xs">
                <Award className="w-4 h-4" />
                <span>Kết Quả Bài Thi</span>
              </div>
              <h2 className="text-2xl font-bold">Điểm Số Đạt Được</h2>
              <p className="text-blue-100 text-xs max-w-md">
                Kết quả đã được hệ thống tính toán tự động dựa trên barem điểm của đề thi.
              </p>
            </div>

            <div className="flex items-center gap-4 bg-white/10 backdrop-blur-xs p-4 rounded-2xl border border-white/20 shrink-0">
              <div className="text-center px-3">
                <span className="text-4xl sm:text-5xl font-extrabold tracking-tight block">
                  {score}
                </span>
                <span className="text-xs text-blue-200 block mt-0.5">
                  trên thang {maxScore} điểm
                </span>
              </div>
              <div className="h-10 w-px bg-white/20" />
              <div className="text-center px-3">
                <span className="text-2xl sm:text-3xl font-bold block">
                  {scorePercentage}%
                </span>
                <span className="text-xs text-blue-200 block mt-0.5">Tỷ lệ hoàn thành</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-center space-y-1">
            <Award className="w-6 h-6 text-slate-400 mx-auto" />
            <h3 className="text-sm font-bold text-slate-800">Điểm thi đang được xử lý</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Giáo viên đã cài đặt không hiển thị điểm ngay sau khi nộp bài. Kết quả chính thức sẽ được công bố sau.
            </p>
          </div>
        )}

        {/* Stats summary row */}
        {canViewScore && (
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100 text-xs">
              <span className="text-xl font-extrabold text-emerald-700 block">{correctCount}</span>
              <span className="text-emerald-800 font-medium">Số câu đúng</span>
            </div>
            <div className="p-3 bg-rose-50 rounded-xl border border-rose-100 text-xs">
              <span className="text-xl font-extrabold text-rose-700 block">
                {totalQuestions - correctCount}
              </span>
              <span className="text-rose-800 font-medium">Số câu sai hoặc chưa làm</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
              <span className="text-xl font-extrabold text-slate-700 block">
                {answersSummary.unanswered}
              </span>
              <span className="text-slate-600 font-medium">Bỏ trống</span>
            </div>
          </div>
        )}
      </div>

      {/* Review Questions Section (if allowed) */}
      {canViewAnswers && detailedResults.length > 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-blue-600" />
                <span>Xem Lại Chi Tiết Các Câu Hỏi</span>
              </h3>
              <p className="text-xs text-slate-500">
                Đối chiếu bài làm của bạn với đáp án và thang điểm chi tiết
              </p>
            </div>

            {/* Filter buttons */}
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setFilterType('all')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  filterType === 'all'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tất cả ({detailedResults.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterType('correct')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  filterType === 'correct'
                    ? 'bg-white text-emerald-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Đúng ({correctCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterType('incorrect')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  filterType === 'incorrect'
                    ? 'bg-white text-rose-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Sai / Chưa làm ({detailedResults.length - correctCount})
              </button>
            </div>
          </div>

          {/* Question List */}
          <div className="space-y-4">
            {filteredQuestions.map(q => {
              const isExpanded = expandedQuestionId === q.questionId;
              const hasAnswer =
                q.studentAnswer !== undefined &&
                q.studentAnswer !== null &&
                q.studentAnswer !== '';

              return (
                <div
                  key={q.questionId}
                  className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                    q.isCorrect
                      ? 'border-emerald-200 bg-emerald-50/20'
                      : 'border-rose-200 bg-rose-50/20'
                  }`}
                >
                  {/* Item header */}
                  <div className="flex items-center justify-between gap-3 mb-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-slate-900 text-white">
                        Câu {q.questionNumber}
                      </span>
                      {q.isCorrect ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Chính xác (+{q.scoreAwarded}đ)</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800">
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Chưa đúng (0đ / {q.maxPoints}đ)</span>
                        </span>
                      )}
                      <span className="text-[11px] text-slate-500">
                        Thang: {q.maxPoints} điểm
                      </span>
                    </div>

                    {(canViewSolutions || q.explanation) && (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedQuestionId(isExpanded ? null : q.questionId)
                        }
                        className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                      >
                        <span>{isExpanded ? 'Thu gọn' : 'Xem lời giải'}</span>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </div>

                  {/* Question Content */}
                  <div className="text-sm font-medium text-slate-900 py-1 leading-relaxed">
                    <LatexRenderer content={q.content || ''} />
                  </div>

                  {/* Multiple Choice Answers */}
                  {q.type === 'multiple_choice' && q.options && (
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {q.options.map((opt, optIdx) => {
                        const letter = String.fromCharCode(65 + optIdx);
                        const isStudentChoice = q.studentAnswer === letter;
                        const isCorrectChoice = q.correctAnswer === letter;

                        let borderBg = 'bg-slate-50/50 border-slate-200 text-slate-700';
                        if (isCorrectChoice) {
                          borderBg = 'bg-emerald-50 border-emerald-300 font-semibold text-emerald-900';
                        } else if (isStudentChoice && !isCorrectChoice) {
                          borderBg = 'bg-rose-50 border-rose-300 font-semibold text-rose-900';
                        }

                        return (
                          <div
                            key={optIdx}
                            className={`p-2.5 rounded-xl border flex items-center gap-2.5 ${borderBg}`}
                          >
                            <span
                              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                                isCorrectChoice
                                  ? 'bg-emerald-600 text-white'
                                  : isStudentChoice
                                  ? 'bg-rose-600 text-white'
                                  : 'bg-slate-200 text-slate-600'
                              }`}
                            >
                              {letter}
                            </span>
                            <div className="flex-1">
                              <LatexRenderer content={opt} />
                            </div>
                            {isCorrectChoice && (
                              <span className="text-[10px] font-bold text-emerald-700 uppercase">
                                Đáp án đúng
                              </span>
                            )}
                            {isStudentChoice && !isCorrectChoice && (
                              <span className="text-[10px] font-bold text-rose-700 uppercase">
                                Bạn chọn
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* True/False Answers */}
                  {q.type === 'true_false' && q.options && (
                    <div className="mt-3 space-y-2 text-xs">
                      {q.options.map((opt, optIdx) => {
                        const letter = String.fromCharCode(97 + optIdx);
                        const studentVal = Array.isArray(q.studentAnswer)
                          ? q.studentAnswer[optIdx]
                          : null;
                        const correctVal = Array.isArray(q.correctAnswer)
                          ? q.correctAnswer[optIdx]
                          : null;
                        const isSubCorrect = studentVal === correctVal;

                        return (
                          <div
                            key={optIdx}
                            className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 ${
                              isSubCorrect
                                ? 'bg-emerald-50/40 border-emerald-200'
                                : 'bg-rose-50/40 border-rose-200'
                            }`}
                          >
                            <div className="flex items-center gap-2 flex-1">
                              <span className="font-bold text-slate-800">{letter})</span>
                              <div className="flex-1">
                                <LatexRenderer content={opt} />
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[11px] text-slate-500">
                                Bạn chọn:{' '}
                                <strong
                                  className={
                                    studentVal === true
                                      ? 'text-emerald-700'
                                      : studentVal === false
                                      ? 'text-rose-700'
                                      : 'text-slate-400'
                                  }
                                >
                                  {studentVal === true
                                    ? 'Đúng'
                                    : studentVal === false
                                    ? 'Sai'
                                    : 'Chưa chọn'}
                                </strong>
                              </span>
                              <span className="text-slate-300">|</span>
                              <span className="text-[11px] text-slate-500">
                                Đáp án:{' '}
                                <strong className="text-emerald-700">
                                  {correctVal === true ? 'Đúng' : 'Sai'}
                                </strong>
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Short Answer */}
                  {q.type === 'short_answer' && (
                    <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">Câu trả lời của bạn:</span>
                        <strong
                          className={q.isCorrect ? 'text-emerald-700' : 'text-rose-700'}
                        >
                          {String(q.studentAnswer || '[Chưa điền]')}
                        </strong>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">Đáp án chính xác:</span>
                        <strong className="text-emerald-700">
                          {String(q.correctAnswer || '')}
                        </strong>
                      </div>
                    </div>
                  )}

                  {/* Expanded Explanation / Solutions */}
                  {isExpanded && (canViewSolutions || q.explanation) && (
                    <div className="mt-3 p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-950 space-y-2">
                      <strong className="font-bold text-blue-900 block flex items-center gap-1.5">
                        <HelpCircle className="w-4 h-4 text-blue-600" />
                        Lời giải chi tiết:
                      </strong>
                      {q.explanation ? (
                        <div className="leading-relaxed">
                          <LatexRenderer content={q.explanation} />
                        </div>
                      ) : (
                        <p className="text-slate-500 italic">Chưa có lời giải chi tiết cho câu hỏi này.</p>
                      )}

                      {q.solutionLinks && q.solutionLinks.length > 0 && (
                        <div className="pt-2 border-t border-blue-200/60 flex items-center gap-2 flex-wrap">
                          {q.solutionLinks.map((link, lIdx) => (
                            <a
                              key={lIdx}
                              href={link}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-blue-700 bg-white px-2.5 py-1 rounded-lg border border-blue-200 hover:underline"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>Tài liệu tham khảo #{lIdx + 1}</span>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        !canViewAnswers && (
          <div className="p-6 bg-white rounded-2xl border border-slate-200 text-center text-xs text-slate-500 space-y-1">
            <BookOpen className="w-6 h-6 text-slate-400 mx-auto" />
            <p className="font-semibold text-slate-700">Giáo viên đã cài đặt ẩn đáp án chi tiết sau khi nộp</p>
            <p>Vui lòng liên hệ giáo viên phụ trách để nhận giải thích chi tiết về bài thi.</p>
          </div>
        )
      )}

      {/* Back home button */}
      <div className="text-center pt-2">
        <button
          type="button"
          onClick={onBackToHome}
          className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-xs transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Quay Về Trang Chủ</span>
        </button>
      </div>
    </div>
  );
};
