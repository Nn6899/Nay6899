import React, { useState, useEffect } from 'react';
import {
  Clock,
  Calendar,
  AlertTriangle,
  CheckCircle,
  ArrowLeft,
  ShieldCheck,
  HelpCircle,
  Play,
  User,
  Hash,
  RotateCw,
  Award,
  Sparkles,
  Shuffle,
} from 'lucide-react';
import type { QuizTest } from '../../types/test';
import type {
  TestAttempt,
  ClientSanitizedQuestion,
  AttemptGradeResult,
} from '../../types/attempt';
import { getTestByPublicCode } from '../../services/testService';
import { questionService } from '../../services/questionService';
import { attemptService } from '../../services/attemptService';
import { formatDate } from '../../utils/formatDate';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { StudentExamTaking } from './StudentExamTaking';
import { StudentExamResult } from './StudentExamResult';

interface StudentTestLobbyProps {
  publicCode: string;
  onBackToHome: () => void;
  onExamStateChange?: (isInExam: boolean) => void;
}

type LobbyStage = 'LOBBY' | 'EXAM' | 'RESULT';

export const StudentTestLobby: React.FC<StudentTestLobbyProps> = ({
  publicCode,
  onBackToHome,
  onExamStateChange,
}) => {
  const [stage, setStage] = useState<LobbyStage>('LOBBY');

  useEffect(() => {
    onExamStateChange?.(stage === 'EXAM');
  }, [stage, onExamStateChange]);
  const [test, setTest] = useState<QuizTest | null>(null);
  const [questionCount, setQuestionCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form inputs
  const [studentName, setStudentName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  // Active attempt state for resume
  const [existingAttempt, setExistingAttempt] = useState<TestAttempt | null>(null);

  // Active exam session state
  const [activeAttempt, setActiveAttempt] = useState<TestAttempt | null>(null);
  const [sanitizedQuestions, setSanitizedQuestions] = useState<ClientSanitizedQuestion[]>([]);
  const [gradeResult, setGradeResult] = useState<AttemptGradeResult | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadTest() {
      try {
        setLoading(true);
        setError(null);

        const data = await getTestByPublicCode(publicCode);
        if (!isMounted) return;

        if (!data) {
          setError('Không tìm thấy kỳ thi với mã này hoặc kỳ thi chưa được công bố.');
          setLoading(false);
          return;
        }

        setTest(data);

        // Fetch question count
        try {
          const qList = await questionService.getQuestions(data.id);
          if (isMounted) {
            setQuestionCount(qList.length);
          }
        } catch {}

        // Check if student has an existing active attempt on this device
        const active = attemptService.getActiveAttempt(data.id);
        if (isMounted && active) {
          setExistingAttempt(active);
          setStudentName(active.studentName);
          if (active.studentId) setStudentId(active.studentId);
        }
      } catch (err: any) {
        if (!isMounted) return;
        setError(err.message || 'Lỗi khi tải thông tin kỳ thi.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadTest();
    return () => {
      isMounted = false;
    };
  }, [publicCode]);

  // Handle starting a new attempt
  const handleStartExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!test) return;

    if (!studentName.trim()) {
      setFormError('Vui lòng nhập họ và tên của bạn.');
      return;
    }

    if (test.requireStudentId && !studentId.trim()) {
      setFormError('Kỳ thi này yêu cầu nhập Mã học sinh / Số báo danh.');
      return;
    }

    setFormError(null);
    setIsStarting(true);

    try {
      const { attempt, sanitizedQuestions } = await attemptService.startAttempt(
        {
          testId: test.id,
          testPublicCode: test.publicCode,
          studentName: studentName.trim(),
          studentId: studentId.trim() || undefined,
        },
        test
      );

      setActiveAttempt(attempt);
      setSanitizedQuestions(sanitizedQuestions);
      setStage('EXAM');
    } catch (err: any) {
      setFormError(err.message || 'Không thể bắt đầu bài thi. Vui lòng thử lại.');
    } finally {
      setIsStarting(false);
    }
  };

  // Handle resuming an ongoing attempt
  const handleResumeExam = async () => {
    if (!test || !existingAttempt) return;

    setIsStarting(true);
    setFormError(null);

    try {
      const { attempt, sanitizedQuestions } = await attemptService.resumeAttempt(
        existingAttempt.id,
        test
      );

      setActiveAttempt(attempt);
      setSanitizedQuestions(sanitizedQuestions);
      setStage('EXAM');
    } catch (err: any) {
      setFormError(err.message || 'Không thể tiếp tục phiên làm bài.');
    } finally {
      setIsStarting(false);
    }
  };

  // Callback when exam is submitted
  const handleExamSubmitted = (result: AttemptGradeResult) => {
    setGradeResult(result);
    setStage('RESULT');
  };

  // 1. Loading state
  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
        <LoadingSpinner />
        <p className="text-sm text-slate-500 mt-4">Đang kết nối vào phòng thi...</p>
      </div>
    );
  }

  // 2. Error state
  if (error || !test) {
    return (
      <div className="max-w-md mx-auto my-12 p-6 bg-white rounded-2xl border border-slate-200 shadow-sm text-center space-y-4">
        <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-bold text-slate-900">Không Thể Vào Phòng Thi</h3>
        <p className="text-sm text-slate-600 leading-relaxed">
          {error || 'Mã phòng thi không hợp lệ hoặc đã bị khóa.'}
        </p>
        <div className="pt-2">
          <button
            onClick={onBackToHome}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Quay về trang chủ</span>
          </button>
        </div>
      </div>
    );
  }

  // 3. Taking Exam Stage
  if (stage === 'EXAM' && activeAttempt && sanitizedQuestions.length > 0) {
    return (
      <StudentExamTaking
        test={test}
        attempt={activeAttempt}
        sanitizedQuestions={sanitizedQuestions}
        onExamSubmitted={handleExamSubmitted}
      />
    );
  }

  // 4. Result Stage
  if (stage === 'RESULT' && gradeResult) {
    return (
      <StudentExamResult
        test={test}
        gradeResult={gradeResult}
        onBackToHome={onBackToHome}
      />
    );
  }

  // 5. Lobby / Join Stage
  return (
    <div className="max-w-2xl mx-auto my-6 sm:my-10 px-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-6 p-6 sm:p-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <button
            type="button"
            onClick={onBackToHome}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Về trang chủ</span>
          </button>
          <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200">
            PHÒNG THI: {test.publicCode}
          </span>
        </div>

        {/* Title & Description */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md">
            <CheckCircle className="w-3.5 h-3.5" />
            <span>Phòng Thi Đang Mở</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 leading-tight">
            {test.title}
          </h1>
          {test.description && (
            <p className="text-sm text-slate-600 leading-relaxed">{test.description}</p>
          )}
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100 text-xs">
          <div className="flex items-center gap-2.5">
            <Clock className="w-4 h-4 text-blue-600 shrink-0" />
            <div>
              <span className="text-slate-400 block text-[11px]">Thời gian làm bài</span>
              <strong className="text-slate-800 text-sm">{test.duration} phút</strong>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Award className="w-4 h-4 text-purple-600 shrink-0" />
            <div>
              <span className="text-slate-400 block text-[11px]">Số lượng câu hỏi</span>
              <strong className="text-slate-800 text-sm">
                {questionCount || test.questionCount || 0} câu
              </strong>
            </div>
          </div>

          <div className="flex items-center gap-2.5 col-span-2 sm:col-span-1">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <div>
              <span className="text-slate-400 block text-[11px]">Người tổ chức</span>
              <strong className="text-slate-800 truncate block max-w-[140px]">
                {test.teacherName || 'Giáo viên'}
              </strong>
            </div>
          </div>
        </div>

        {/* Security & Randomization tags */}
        {(test.randomizeQuestions || test.randomizeOptions) && (
          <div className="flex items-center gap-2 flex-wrap text-xs text-slate-600 bg-blue-50/50 p-3 rounded-xl border border-blue-100">
            <Shuffle className="w-4 h-4 text-blue-600 shrink-0" />
            <span className="font-semibold text-blue-900">Tính năng xáo trộn bảo mật:</span>
            {test.randomizeQuestions && (
              <span className="bg-white text-blue-700 px-2 py-0.5 rounded-md border border-blue-200 text-[11px] font-medium">
                Xáo trộn thứ tự câu hỏi
              </span>
            )}
            {test.randomizeOptions && (
              <span className="bg-white text-blue-700 px-2 py-0.5 rounded-md border border-blue-200 text-[11px] font-medium">
                Xáo trộn thứ tự đáp án
              </span>
            )}
          </div>
        )}

        {/* Resume Box if attempt exists */}
        {existingAttempt && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-3">
            <div className="flex items-start gap-3">
              <RotateCw className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <strong className="text-sm font-bold text-emerald-900 block">
                  Phát hiện phiên làm bài đang diễn ra!
                </strong>
                <p className="text-xs text-emerald-800 leading-relaxed">
                  Bạn có một bài làm dang dở với tên <strong>{existingAttempt.studentName}</strong>
                  {existingAttempt.studentId ? ` (${existingAttempt.studentId})` : ''}. Hệ thống đã tự động lưu lại các câu đã trả lời.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleResumeExam}
              disabled={isStarting}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center justify-center gap-2"
            >
              <RotateCw className="w-4 h-4" />
              <span>Tiếp Tục Phiên Làm Bài</span>
            </button>
          </div>
        )}

        {/* Registration Form */}
        <form onSubmit={handleStartExam} className="space-y-4 pt-2 border-t border-slate-100">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-800">Thông Tin Thí Sinh</h3>
            <p className="text-xs text-slate-500">
              Nhập thông tin của bạn để bắt đầu tính giờ làm bài
            </p>
          </div>

          {formError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label
                htmlFor="student-name-input"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Họ và Tên thí sinh <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  id="student-name-input"
                  type="text"
                  required
                  value={studentName}
                  onChange={e => setStudentName(e.target.value)}
                  placeholder="Ví dụ: Nguyễn Văn An"
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="student-id-input"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Mã học sinh / Số báo danh {test.requireStudentId && <span className="text-rose-500">*</span>}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Hash className="w-4 h-4" />
                </div>
                <input
                  id="student-id-input"
                  type="text"
                  required={Boolean(test.requireStudentId)}
                  value={studentId}
                  onChange={e => setStudentId(e.target.value)}
                  placeholder={test.requireStudentId ? "Bắt buộc nhập số báo danh" : "Tùy chọn (nếu có)"}
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Action button */}
          <div className="pt-3">
            <button
              type="submit"
              disabled={isStarting}
              className="w-full py-3.5 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-xs transition-all hover:shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isStarting ? (
                <span>Đang chuẩn bị đề thi...</span>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  <span>Bắt Đầu Làm Bài Ngay</span>
                </>
              )}
            </button>
            <p className="text-[11px] text-slate-400 text-center mt-2">
              Thời gian đếm ngược {test.duration} phút sẽ bắt đầu ngay sau khi bạn bấm bắt đầu.
            </p>
          </div>
        </form>

        {/* Rules note */}
        <div className="border-t border-slate-100 pt-4 text-xs text-slate-500 space-y-1">
          <h4 className="font-semibold text-slate-700 flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
            Lưu ý khi làm bài
          </h4>
          <ul className="list-disc list-inside space-y-0.5 text-slate-500 text-[11px] pl-1">
            <li>Hệ thống tự động lưu câu trả lời sau mỗi thao tác.</li>
            <li>Nếu vô tình đóng hoặc tải lại trang, bài làm sẽ tự động khôi phục.</li>
            <li>Khi hết giờ, hệ thống sẽ tự động khóa và nộp bài thi.</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
