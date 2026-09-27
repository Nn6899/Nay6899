import React, { useState } from 'react';
import { Question } from '../../types/question';
import { LatexRenderer } from '../common/LatexRenderer';
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ExternalLink,
  RotateCcw,
  Check,
  X,
  Award,
} from 'lucide-react';

interface StudentExamPreviewProps {
  testTitle: string;
  durationMinutes: number;
  questions: Question[];
  onExitPreview?: () => void;
}

export const StudentExamPreview: React.FC<StudentExamPreviewProps> = ({
  testTitle,
  durationMinutes,
  questions,
  onExitPreview,
}) => {
  // Student answers state
  // key: questionId or index
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [showSolutions, setShowSolutions] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [activeQuestionIdx, setActiveQuestionIdx] = useState(0);

  const handleSelectChoice = (qId: string, choice: string) => {
    if (submitted) return;
    setAnswers(prev => ({
      ...prev,
      [qId]: choice,
    }));
  };

  const handleToggleTf = (qId: string, optIdx: number, value: boolean, totalOpts: number) => {
    if (submitted) return;
    const current = Array.isArray(answers[qId])
      ? [...answers[qId]]
      : new Array(totalOpts).fill(null);
    current[optIdx] = value;
    setAnswers(prev => ({
      ...prev,
      [qId]: current,
    }));
  };

  const handleShortAnswerChange = (qId: string, val: string) => {
    if (submitted) return;
    setAnswers(prev => ({
      ...prev,
      [qId]: val,
    }));
  };

  const handleReset = () => {
    setAnswers({});
    setSubmitted(false);
    setShowSolutions(false);
  };

  // Grade test simulation
  let totalScore = 0;
  let earnedScore = 0;
  let correctCount = 0;

  questions.forEach(q => {
    const qPoints = q.points || 1;
    totalScore += qPoints;
    const studentAns = answers[q.id];

    if (q.type === 'multiple_choice') {
      if (
        studentAns &&
        String(studentAns).trim().toUpperCase() === String(q.correctAnswer).trim().toUpperCase()
      ) {
        earnedScore += qPoints;
        correctCount++;
      }
    } else if (q.type === 'true_false') {
      if (Array.isArray(studentAns) && Array.isArray(q.correctAnswer)) {
        let allMatched = true;
        for (let i = 0; i < q.options.length; i++) {
          if (studentAns[i] !== q.correctAnswer[i]) {
            allMatched = false;
            break;
          }
        }
        if (allMatched && studentAns.length === q.options.length) {
          earnedScore += qPoints;
          correctCount++;
        }
      }
    } else if (q.type === 'short_answer') {
      if (studentAns !== undefined && studentAns !== null && String(studentAns).trim().length > 0) {
        const studentStr = String(studentAns).trim().toLowerCase();
        const mainAnsStr = String(q.correctAnswer).trim().toLowerCase();
        const accepted = (q.acceptedAnswers || []).map(a => a.trim().toLowerCase());

        let isCorrect = studentStr === mainAnsStr || accepted.includes(studentStr);

        // Numeric tolerance check
        if (!isCorrect && q.numericTolerance !== undefined && !isNaN(Number(studentStr)) && !isNaN(Number(mainAnsStr))) {
          const sNum = parseFloat(studentStr);
          const cNum = parseFloat(mainAnsStr);
          if (Math.abs(sNum - cNum) <= q.numericTolerance) {
            isCorrect = true;
          }
        }

        if (isCorrect) {
          earnedScore += qPoints;
          correctCount++;
        }
      }
    }
  });

  return (
    <div className="space-y-6">
      {/* Simulation Banner */}
      <div className="bg-gradient-to-r from-indigo-900 via-blue-900 to-indigo-950 text-white p-4 sm:p-5 rounded-2xl shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-blue-500/30 text-blue-200 border border-blue-400/40">
              Giao Diện Làm Bài Của Học Sinh
            </span>
            <span className="text-xs text-blue-200">
              ({questions.length} câu • {durationMinutes} phút)
            </span>
          </div>
          <h2 className="text-lg font-bold text-white">{testTitle || 'Kỳ Thi Trắc Nghiệm Trực Tuyến'}</h2>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowSolutions(!showSolutions)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              showSolutions
                ? 'bg-amber-400 text-slate-900 font-bold'
                : 'bg-white/10 hover:bg-white/20 text-white'
            }`}
          >
            {showSolutions ? 'Ẩn Đáp Án & Lời Giải' : 'Hiện Đáp Án & Lời Giải'}
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all"
            title="Làm lại từ đầu"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {onExitPreview && (
            <button
              type="button"
              onClick={onExitPreview}
              className="px-3.5 py-1.5 bg-white text-slate-900 font-bold rounded-xl text-xs hover:bg-slate-100 transition-all shadow-sm"
            >
              Thoát Xem Trước
            </button>
          )}
        </div>
      </div>

      {/* Submitted Result Card */}
      {submitted && (
        <div className="p-5 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-300 rounded-2xl space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-base font-bold text-slate-900">Kết Quả Thi Thử Nghiệm</h4>
                <p className="text-xs text-slate-600">
                  Số câu đúng: <strong className="text-emerald-700">{correctCount}</strong> / {questions.length} câu •
                  Điểm số:{' '}
                  <strong className="text-emerald-700">
                    {earnedScore.toFixed(2)} / {totalScore.toFixed(2)}
                  </strong>
                </p>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
              Đạt {totalScore > 0 ? ((earnedScore / totalScore) * 10).toFixed(1) : 0} / 10 điểm
            </span>
          </div>
        </div>
      )}

      {/* Main Grid: Questions Left, Palette Right */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left: Questions List */}
        <div className="lg:col-span-3 space-y-6">
          {questions.map((q, qIndex) => {
            const studentAns = answers[q.id];
            const isAnswered =
              studentAns !== undefined &&
              (Array.isArray(studentAns) ? studentAns.some(v => v !== null) : String(studentAns).trim() !== '');

            return (
              <div
                key={q.id || qIndex}
                id={`preview-question-${qIndex}`}
                className={`bg-white rounded-2xl border transition-all p-5 sm:p-6 space-y-4 ${
                  activeQuestionIdx === qIndex ? 'border-blue-500 ring-2 ring-blue-100 shadow-sm' : 'border-slate-200'
                }`}
                onClick={() => setActiveQuestionIdx(qIndex)}
              >
                {/* Question Header */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 bg-slate-900 text-white font-bold text-xs rounded-lg">
                      Câu {q.questionNumber || qIndex + 1}
                    </span>
                    <span className="text-xs text-slate-500 font-medium">({q.points || 1} điểm)</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600">
                      {q.type === 'multiple_choice'
                        ? 'Trắc nghiệm chọn 1'
                        : q.type === 'true_false'
                        ? 'Đúng / Sai'
                        : 'Điền đáp số'}
                    </span>
                  </div>

                  {isAnswered && (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600">
                      <Check className="w-3.5 h-3.5" />
                      <span>Đã chọn</span>
                    </span>
                  )}
                </div>

                {/* Content with LaTeX */}
                <div className="text-sm font-medium text-slate-900 leading-relaxed">
                  <LatexRenderer content={q.content} />
                </div>

                {/* Images */}
                {q.images && q.images.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    {q.images.map((imgSrc, i) => (
                      <div
                        key={i}
                        className="rounded-xl overflow-hidden border border-slate-200 bg-slate-50 max-h-64 flex items-center justify-center p-2"
                      >
                        <img
                          src={imgSrc}
                          alt={`Minh họa câu ${q.questionNumber || qIndex + 1}`}
                          className="max-h-56 w-auto object-contain rounded-lg"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* Options Section */}
                <div className="pt-2">
                  {/* Multiple Choice Options */}
                  {q.type === 'multiple_choice' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {q.options.map((opt, optIdx) => {
                        const letter = String.fromCharCode(65 + optIdx);
                        const isSelected = studentAns === letter;
                        const isCorrectAnswer = String(q.correctAnswer).trim().toUpperCase() === letter;

                        let styleClasses = 'bg-slate-50 border-slate-200 hover:border-blue-300 hover:bg-blue-50/40';
                        if (isSelected) {
                          styleClasses = 'bg-blue-50 border-blue-500 font-semibold text-blue-900 shadow-2xs';
                        }
                        if (showSolutions || submitted) {
                          if (isCorrectAnswer) {
                            styleClasses = 'bg-emerald-50 border-emerald-500 text-emerald-950 font-bold';
                          } else if (isSelected && !isCorrectAnswer) {
                            styleClasses = 'bg-rose-50 border-rose-400 text-rose-900';
                          }
                        }

                        return (
                          <button
                            key={optIdx}
                            type="button"
                            onClick={() => handleSelectChoice(q.id, letter)}
                            className={`w-full text-left p-3.5 rounded-xl border transition-all flex items-center gap-3 text-xs leading-relaxed ${styleClasses}`}
                          >
                            <span
                              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
                                isSelected
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-white text-slate-700 border border-slate-300'
                              } ${
                                (showSolutions || submitted) && isCorrectAnswer
                                  ? '!bg-emerald-600 !text-white'
                                  : ''
                              }`}
                            >
                              {letter}
                            </span>
                            <div className="flex-1">
                              <LatexRenderer content={opt} />
                            </div>
                            {(showSolutions || submitted) && isCorrectAnswer && (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* True / False Options */}
                  {q.type === 'true_false' && (
                    <div className="space-y-2.5">
                      {q.options.map((opt, optIdx) => {
                        const letter = String.fromCharCode(97 + optIdx);
                        const choiceVal = Array.isArray(studentAns) ? studentAns[optIdx] : null;
                        const isTrueAns = Array.isArray(q.correctAnswer) ? !!q.correctAnswer[optIdx] : false;

                        return (
                          <div
                            key={optIdx}
                            className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3 text-xs"
                          >
                            <div className="flex items-center gap-2 flex-1">
                              <span className="font-bold text-slate-700 w-5">{letter})</span>
                              <div className="flex-1 font-medium text-slate-800">
                                <LatexRenderer content={opt} />
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleToggleTf(q.id, optIdx, true, q.options.length)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                  choiceVal === true
                                    ? 'bg-blue-600 text-white shadow-xs'
                                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                                } ${
                                  (showSolutions || submitted) && isTrueAns
                                    ? '!bg-emerald-600 !text-white'
                                    : ''
                                }`}
                              >
                                Đúng
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleTf(q.id, optIdx, false, q.options.length)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                  choiceVal === false
                                    ? 'bg-blue-600 text-white shadow-xs'
                                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                                } ${
                                  (showSolutions || submitted) && !isTrueAns
                                    ? '!bg-emerald-600 !text-white'
                                    : ''
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

                  {/* Short Answer */}
                  {q.type === 'short_answer' && (
                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-slate-700">Câu trả lời của bạn:</label>
                      <input
                        type="text"
                        value={studentAns || ''}
                        onChange={e => handleShortAnswerChange(q.id, e.target.value)}
                        placeholder="Điền đáp số hoặc kết quả..."
                        className="w-full max-w-md px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                      />
                      {(showSolutions || submitted) && (
                        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 space-y-1">
                          <p>
                            <strong>Đáp án đúng:</strong> {String(q.correctAnswer)}
                          </p>
                          {q.acceptedAnswers && q.acceptedAnswers.length > 0 && (
                            <p className="text-emerald-700">
                              Đáp án chấp nhận tương đương: {q.acceptedAnswers.join(', ')}
                            </p>
                          )}
                          {q.numericTolerance !== undefined && (
                            <p className="text-emerald-700">Dung sai cho phép: ±{q.numericTolerance}</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Explanation Box (when showSolutions is on) */}
                {(showSolutions || submitted) && q.explanation && (
                  <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-xl text-xs space-y-1.5 animate-in fade-in">
                    <h5 className="font-bold text-blue-900 flex items-center gap-1.5">
                      <HelpCircle className="w-3.5 h-3.5 text-blue-600" />
                      <span>Lời Giải Chi Tiết</span>
                    </h5>
                    <div className="text-blue-950 leading-relaxed">
                      <LatexRenderer content={q.explanation} />
                    </div>
                    {q.solutionLinks && q.solutionLinks.length > 0 && (
                      <div className="pt-2 flex flex-wrap gap-2">
                        {q.solutionLinks.map((link, i) => (
                          <a
                            key={i}
                            href={link}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-white rounded-lg border border-blue-200 text-blue-700 text-[11px] font-semibold hover:underline"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>Tài liệu / Video giải thích #{i + 1}</span>
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

        {/* Right: Question Palette & Submit */}
        <div className="space-y-5">
          {/* Question Palette Card */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4 sticky top-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Mục Lục Câu Hỏi</h3>
              <span className="text-xs text-slate-500 font-medium">
                {Object.keys(answers).length} / {questions.length} đã làm
              </span>
            </div>

            {/* Questions Grid */}
            <div className="grid grid-cols-5 gap-2">
              {questions.map((q, idx) => {
                const isAnswered =
                  answers[q.id] !== undefined &&
                  (Array.isArray(answers[q.id])
                    ? answers[q.id].some((v: any) => v !== null)
                    : String(answers[q.id]).trim() !== '');

                return (
                  <button
                    key={q.id || idx}
                    type="button"
                    onClick={() => {
                      setActiveQuestionIdx(idx);
                      const el = document.getElementById(`preview-question-${idx}`);
                      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }}
                    className={`h-9 rounded-xl font-bold text-xs transition-all flex items-center justify-center ${
                      activeQuestionIdx === idx ? 'ring-2 ring-blue-500 ring-offset-1' : ''
                    } ${
                      isAnswered
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {q.questionNumber || idx + 1}
                  </button>
                );
              })}
            </div>

            {/* Submit / Grade Simulation Button */}
            <div className="pt-2 border-t border-slate-100">
              {!submitted ? (
                <button
                  type="button"
                  onClick={() => setSubmitted(true)}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Nộp Bài & Chấm Điểm Thử</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleReset}
                  className="w-full py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Làm Lại Thử Nghiệm</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
