import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Calendar,
  Clock,
  CheckCircle,
  Copy,
  Check,
  Share2,
  Trash2,
  Edit3,
  Archive,
  Lock,
  PlayCircle,
  FileQuestion,
  BarChart3,
  Sliders,
  Users,
  Eye,
  Shuffle,
  HelpCircle,
  ExternalLink,
  Layers,
  UploadCloud,
  Plus,
  AlertCircle,
  CheckCircle2,
  History,
  ChevronUp,
  ChevronDown,
  Sparkles,
  Save,
  ImageIcon,
} from 'lucide-react';
import type { QuizTest, TestStatus } from '../../types/test';
import type { Question, TestImportMetadata, ExamValidationResult } from '../../types/question';
import { formatDate } from '../../utils/formatDate';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { questionService } from '../../services/questionService';
import { ExamImportModal } from '../import/ExamImportModal';
import { QuestionEditorModal } from '../editor/QuestionEditorModal';
import { StudentExamPreview } from '../editor/StudentExamPreview';
import { PublishValidationModal } from '../editor/PublishValidationModal';
import { validateExamForPublish } from '../../services/examValidator';
import { LatexRenderer } from '../common/LatexRenderer';
import { TestResultsPanel } from './TestResultsPanel';

interface TestDetailViewProps {
  test: QuizTest;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => Promise<void>;
  onStatusChange: (status: TestStatus) => Promise<void>;
}

type TabType = 'overview' | 'questions' | 'settings' | 'results' | 'analytics';

export const TestDetailView: React.FC<TestDetailViewProps> = ({
  test,
  onBack,
  onEdit,
  onDelete,
  onStatusChange,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [copied, setCopied] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'delete' | 'publish' | 'close' | 'archive' | 'activate';
    title: string;
    message: string;
    variant: 'danger' | 'warning' | 'primary';
  } | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Phase 3 & 4: Question, Editor, and Import state
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [importHistory, setImportHistory] = useState<TestImportMetadata[]>([]);
  const [showImportHistory, setShowImportHistory] = useState(false);

  // Phase 4: Preview & Autosave & Publish Validation state
  const [questionViewMode, setQuestionViewMode] = useState<'edit' | 'preview'>('edit');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isAutosaving, setIsAutosaving] = useState(false);
  const [publishValidationResult, setPublishValidationResult] = useState<ExamValidationResult | null>(null);
  const [isPublishValidationOpen, setIsPublishValidationOpen] = useState(false);

  // Warn on leave if unsaved changes exist
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const loadQuestions = async () => {
    setIsLoadingQuestions(true);
    try {
      const list = await questionService.getQuestions(test.id);
      setQuestions(list);
      const history = await questionService.getImportHistory(test.id);
      setImportHistory(history);
      setHasUnsavedChanges(false);
    } catch (e) {
      console.error('Error loading questions:', e);
    } finally {
      setIsLoadingQuestions(false);
    }
  };

  useEffect(() => {
    loadQuestions();
  }, [test.id]);

  // Batch save helper
  const saveQuestionsBatch = async (newQuestions: Question[]) => {
    setIsAutosaving(true);
    try {
      await questionService.saveQuestions(test.id, newQuestions, test.teacherId);
      setHasUnsavedChanges(false);
    } catch (err) {
      console.error('Lỗi khi lưu bộ câu hỏi:', err);
      setHasUnsavedChanges(true);
    } finally {
      setIsAutosaving(false);
    }
  };

  const handleAddNewQuestion = () => {
    const newQ: Question = {
      id: `q_manual_${Date.now()}`,
      testId: test.id,
      questionNumber: questions.length + 1,
      type: 'multiple_choice',
      content: '',
      options: ['Phương án A', 'Phương án B', 'Phương án C', 'Phương án D'],
      correctAnswer: 'A',
      points: 1,
      validationStatus: 'NEEDS_REVIEW',
      validationErrors: ['Thiếu nội dung câu hỏi.'],
    };
    setEditingQuestion(newQ);
  };

  const handleSaveQuestion = async (saved: Question) => {
    try {
      const exists = questions.some(q => q.id === saved.id);
      let updatedList: Question[];
      if (exists) {
        updatedList = questions.map(q => (q.id === saved.id ? saved : q));
        await questionService.updateQuestion(test.id, saved.id, saved, test.teacherId);
      } else {
        updatedList = [...questions, saved];
        await questionService.saveQuestions(test.id, updatedList, test.teacherId);
      }
      setQuestions(updatedList);
      setHasUnsavedChanges(false);
    } catch (err: any) {
      alert(err.message || 'Lỗi khi lưu câu hỏi');
    }
  };

  const handleDeleteQuestion = async (qId: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa câu hỏi này?')) return;
    try {
      await questionService.deleteQuestion(test.id, qId, test.teacherId);
      const remaining = questions.filter(q => q.id !== qId);
      const renumbered = remaining.map((q, idx) => ({
        ...q,
        questionNumber: idx + 1,
      }));
      setQuestions(renumbered);
      if (renumbered.length > 0) {
        await saveQuestionsBatch(renumbered);
      }
    } catch (err: any) {
      alert(err.message || 'Lỗi khi xóa câu hỏi');
    }
  };

  // Phase 4: Reorder question up or down
  const handleMoveQuestion = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= questions.length) return;

    const updated = [...questions];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;

    const renumbered = updated.map((q, idx) => ({
      ...q,
      questionNumber: idx + 1,
    }));

    setQuestions(renumbered);
    await saveQuestionsBatch(renumbered);
  };

  // Phase 4: Duplicate question
  const handleDuplicateQuestion = async (q: Question, index: number) => {
    const copyId = `q_dup_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const cloned: Question = {
      ...q,
      id: copyId,
      content: `${q.content} (Bản sao)`,
      images: q.images ? [...q.images] : undefined,
      solutionLinks: q.solutionLinks ? [...q.solutionLinks] : undefined,
      options: [...q.options],
      correctAnswer: Array.isArray(q.correctAnswer) ? (q.correctAnswer as any) : q.correctAnswer,
      acceptedAnswers: q.acceptedAnswers ? [...q.acceptedAnswers] : undefined,
    };

    const updated = [...questions];
    updated.splice(index + 1, 0, cloned);

    const renumbered = updated.map((item, idx) => ({
      ...item,
      questionNumber: idx + 1,
    }));

    setQuestions(renumbered);
    await saveQuestionsBatch(renumbered);
  };

  // Phase 4: Inline points change
  const handlePointsChange = async (index: number, newPoints: number) => {
    if (isNaN(newPoints) || newPoints < 0) return;
    const updated = [...questions];
    updated[index] = { ...updated[index], points: newPoints };
    setQuestions(updated);
    await saveQuestionsBatch(updated);
  };

  // Phase 4: Batch distribute points evenly across 10 points
  const handleDistributePointsEvenly = async () => {
    if (questions.length === 0) return;
    const targetTotal = 10;
    const perQuestion = Number((targetTotal / questions.length).toFixed(2));
    const updated = questions.map(q => ({
      ...q,
      points: perQuestion,
    }));
    setQuestions(updated);
    await saveQuestionsBatch(updated);
  };

  // Phase 4: Initiate publish with strict validation check
  const handleInitiatePublish = () => {
    const result = validateExamForPublish(questions);
    setPublishValidationResult(result);
    if (!result.canPublish) {
      setIsPublishValidationOpen(true);
      return;
    }
    setConfirmAction({
      type: 'publish',
      title: 'Công Bố Kỳ Thi',
      message:
        'Kỳ thi sẽ chuyển sang trạng thái PUBLISHED và học sinh có thể dùng mã truy cập để tham gia. Bạn có chắc chắn muốn công bố?',
      variant: 'primary',
    });
  };

  const testUrl = `${window.location.origin}/test/${test.publicCode}`;

  const copyPublicLink = () => {
    navigator.clipboard.writeText(testUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getStatusBadge = (status: TestStatus) => {
    switch (status) {
      case 'PUBLISHED':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
            Đã Công Bố (PUBLISHED)
          </span>
        );
      case 'ACTIVE':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200 animate-pulse">
            Đang Diễn Ra (ACTIVE)
          </span>
        );
      case 'CLOSED':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
            Đã Đóng (CLOSED)
          </span>
        );
      case 'ARCHIVED':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300">
            Đã Lưu Trữ (ARCHIVED)
          </span>
        );
      case 'DRAFT':
      default:
        return (
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-200">
            Bản Nháp (DRAFT)
          </span>
        );
    }
  };

  const handleConfirm = async () => {
    if (!confirmAction) return;
    setIsActionLoading(true);
    try {
      if (confirmAction.type === 'delete') {
        await onDelete();
      } else if (confirmAction.type === 'publish') {
        await onStatusChange('PUBLISHED');
      } else if (confirmAction.type === 'activate') {
        await onStatusChange('ACTIVE');
      } else if (confirmAction.type === 'close') {
        await onStatusChange('CLOSED');
      } else if (confirmAction.type === 'archive') {
        await onStatusChange('ARCHIVED');
      }
      setConfirmAction(null);
    } catch (e: any) {
      alert(e.message || 'Thao tác thất bại');
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Top navigation & action bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors w-fit"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Quay lại danh sách kỳ thi</span>
        </button>

        {/* Action buttons */}
        <div className="flex items-center flex-wrap gap-2">
          {test.status === 'DRAFT' && (
            <button
              onClick={handleInitiatePublish}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-all shadow-xs"
            >
              <CheckCircle className="w-4 h-4" />
              <span>Công Bố</span>
            </button>
          )}

          {test.status === 'PUBLISHED' && (
            <button
              onClick={() =>
                setConfirmAction({
                  type: 'activate',
                  title: 'Bắt Đầu Làm Bài',
                  message:
                    'Kỳ thi sẽ chuyển sang trạng thái ACTIVE (đang diễn ra). Học sinh có thể bấm bắt đầu làm bài ngay.',
                  variant: 'primary',
                })
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-xs"
            >
              <PlayCircle className="w-4 h-4" />
              <span>Kích Hoạt (ACTIVE)</span>
            </button>
          )}

          {(test.status === 'PUBLISHED' || test.status === 'ACTIVE') && (
            <button
              onClick={() =>
                setConfirmAction({
                  type: 'close',
                  title: 'Đóng Phòng Thi',
                  message:
                    'Học sinh sẽ không thể bắt đầu làm bài mới nữa. Bạn có chắc chắn muốn đóng phòng thi?',
                  variant: 'warning',
                })
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-amber-800 bg-amber-100 hover:bg-amber-200 rounded-xl transition-all"
            >
              <Lock className="w-4 h-4" />
              <span>Đóng Phòng Thi</span>
            </button>
          )}

          {test.status !== 'ARCHIVED' && (
            <button
              onClick={() =>
                setConfirmAction({
                  type: 'archive',
                  title: 'Lưu Trữ Kỳ Thi',
                  message:
                    'Chuyển kỳ thi vào mục lưu trữ. Kỳ thi này sẽ bị ẩn khỏi các hoạt động thường ngày.',
                  variant: 'warning',
                })
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
            >
              <Archive className="w-4 h-4" />
              <span>Lưu Trữ</span>
            </button>
          )}

          <button
            onClick={onEdit}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl transition-colors"
          >
            <Edit3 className="w-4 h-4" />
            <span>Sửa Cài Đặt</span>
          </button>

          <button
            onClick={() =>
              setConfirmAction({
                type: 'delete',
                title: 'Xóa Kỳ Thi',
                message: `Bạn có chắc chắn muốn xóa kỳ thi "${test.title}"? Hành động này không thể hoàn tác.`,
                variant: 'danger',
              })
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-xl transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            <span>Xóa</span>
          </button>
        </div>
      </div>

      {/* Test Title & Public Code Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              {getStatusBadge(test.status)}
              <span className="text-xs text-slate-400">ID: {test.id}</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{test.title}</h1>
            {test.description && (
              <p className="text-sm text-slate-600 max-w-3xl leading-relaxed">{test.description}</p>
            )}
          </div>

          {/* Public Access Code Box */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col gap-2 min-w-[280px]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Mã Phòng Thi (Public Code)
              </span>
              <span className="text-xs text-blue-600 font-medium">Bảo mật</span>
            </div>
            <div className="flex items-center justify-between bg-white px-3.5 py-2 rounded-lg border border-slate-200">
              <span className="text-lg font-mono font-bold tracking-widest text-blue-700">
                {test.publicCode}
              </span>
              <button
                onClick={copyPublicLink}
                title="Sao chép link làm bài"
                className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
              <span>Đường dẫn làm bài:</span>
              <div className="flex items-center gap-3">
                <button
                  onClick={copyPublicLink}
                  className="text-blue-600 hover:underline inline-flex items-center gap-1 font-medium"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>{copied ? 'Đã sao chép!' : 'Copy Link'}</span>
                </button>
                <a
                  href={`/test/${test.publicCode}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-600 hover:underline inline-flex items-center gap-1 font-medium"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Vào thi</span>
                </a>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-slate-200">
        <nav className="flex space-x-8" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('overview')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'overview'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Tổng Quan</span>
          </button>

          <button
            onClick={() => setActiveTab('questions')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'questions'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <FileQuestion className="w-4 h-4" />
            <span>Câu Hỏi ({questions.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'settings'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Cài Đặt</span>
          </button>

          <button
            onClick={() => setActiveTab('results')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'results'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Kết Quả</span>
          </button>

          <button
            onClick={() => setActiveTab('analytics')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'analytics'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Thống Kê</span>
          </button>
        </nav>
      </div>

      {/* Tab 1: Tổng Quan */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            {/* Thẻ chỉ số chính */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <span className="text-xs text-slate-500 font-medium">Thời gian thi</span>
                <p className="text-xl font-bold text-slate-900 mt-1 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-blue-600" />
                  {test.duration} phút
                </p>
              </div>
              <div>
                <span className="text-xs text-slate-500 font-medium">Số lượng câu hỏi</span>
                <p className="text-xl font-bold text-slate-900 mt-1 flex items-center gap-1.5">
                  <FileQuestion className="w-4 h-4 text-purple-600" />
                  {test.questionCount || 0} câu
                </p>
              </div>
              <div>
                <span className="text-xs text-slate-500 font-medium">Số lượt nộp bài</span>
                <p className="text-xl font-bold text-slate-900 mt-1 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-emerald-600" />
                  {test.totalSubmissions || 0} lượt
                </p>
              </div>
            </div>

            {/* Khung giờ mở thi */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-4">
              <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-600" />
                Lịch Trình Mở Phòng Thi
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-xs text-slate-500 block mb-1">Thời gian bắt đầu</span>
                  <p className="font-semibold text-slate-800">
                    {test.startTime ? formatDate(test.startTime) : 'Mở tự do (Không giới hạn)'}
                  </p>
                </div>
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-xs text-slate-500 block mb-1">Thời gian kết thúc</span>
                  <p className="font-semibold text-slate-800">
                    {test.endTime ? formatDate(test.endTime) : 'Không giới hạn thời hạn'}
                  </p>
                </div>
              </div>
            </div>

            {/* Quy chế thi */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-3">
              <h3 className="text-base font-semibold text-slate-900">Quy Chế & Bảo Mật Phòng Thi</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2.5 text-slate-700">
                  <Eye className="w-4 h-4 text-slate-400" />
                  <span>Xem điểm ngay:</span>
                  <strong className={test.allowStudentViewScore ? 'text-emerald-600' : 'text-slate-400'}>
                    {test.allowStudentViewScore ? 'Cho phép' : 'Tắt'}
                  </strong>
                </div>

                <div className="flex items-center gap-2.5 text-slate-700">
                  <Check className="w-4 h-4 text-slate-400" />
                  <span>Xem đáp án đúng:</span>
                  <strong className={test.allowStudentViewAnswers ? 'text-emerald-600' : 'text-slate-400'}>
                    {test.allowStudentViewAnswers ? 'Cho phép' : 'Tắt'}
                  </strong>
                </div>

                <div className="flex items-center gap-2.5 text-slate-700">
                  <HelpCircle className="w-4 h-4 text-slate-400" />
                  <span>Xem lời giải chi tiết:</span>
                  <strong className={test.allowStudentViewSolutions ? 'text-emerald-600' : 'text-slate-400'}>
                    {test.allowStudentViewSolutions ? 'Cho phép' : 'Tắt'}
                  </strong>
                </div>

                <div className="flex items-center gap-2.5 text-slate-700">
                  <Shuffle className="w-4 h-4 text-slate-400" />
                  <span>Xáo trộn câu hỏi:</span>
                  <strong className={test.randomizeQuestions ? 'text-blue-600' : 'text-slate-400'}>
                    {test.randomizeQuestions ? 'Bật' : 'Tắt'}
                  </strong>
                </div>

                <div className="flex items-center gap-2.5 text-slate-700">
                  <Shuffle className="w-4 h-4 text-slate-400" />
                  <span>Xáo trộn phương án:</span>
                  <strong className={test.randomizeOptions ? 'text-blue-600' : 'text-slate-400'}>
                    {test.randomizeOptions ? 'Bật' : 'Tắt'}
                  </strong>
                </div>
              </div>
            </div>
          </div>

          {/* Cột phải: Thông tin hệ thống */}
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-4">
              <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">
                Thông Tin Kỹ Thuật
              </h3>
              <div className="space-y-3 text-xs text-slate-600">
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-400">Người tạo:</span>
                  <span className="font-medium text-slate-800">{test.teacherName || 'Giáo viên'}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-400">Teacher ID:</span>
                  <span className="font-mono text-slate-600 truncate max-w-[140px]">{test.teacherId}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-400">Ngày tạo:</span>
                  <span>{formatDate(test.createdAt)}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-400">Cập nhật lần cuối:</span>
                  <span>{formatDate(test.updatedAt)}</span>
                </div>
              </div>
            </div>

            {/* Card link thử nghiệm */}
            <div className="p-5 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl space-y-3">
              <h4 className="text-sm font-bold text-blue-900">Liên Kết Trực Tiếp Cho Học Sinh</h4>
              <p className="text-xs text-blue-700 leading-relaxed">
                Học sinh truy cập địa chỉ bên dưới và nhập mã dự thi hoặc vào thẳng phòng thi:
              </p>
              <div className="p-2.5 bg-white rounded-xl border border-blue-200 text-xs font-mono text-blue-900 break-all select-all">
                {testUrl}
              </div>
              <a
                href={`/test/${test.publicCode}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline"
              >
                <span>Mở thử trang thí sinh</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Câu Hỏi */}
      {activeTab === 'questions' && (
        <div className="space-y-5">
          {/* Header Toolbar */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div>
                <h3 className="text-base font-bold text-slate-900">Danh Sách Câu Hỏi</h3>
                <p className="text-xs text-slate-500">
                  Tổng số: <strong className="text-slate-800">{questions.length} câu</strong> | Tổng điểm:{' '}
                  <strong className="text-slate-800">
                    {questions.reduce((sum, q) => sum + (q.points || 1), 0).toFixed(2)} điểm
                  </strong>
                </p>
              </div>

              {questions.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {questions.filter(q => q.validationStatus === 'VALID').length} Hợp Lệ
                  </span>
                  {questions.some(q => q.validationStatus === 'NEEDS_REVIEW') && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {questions.filter(q => q.validationStatus === 'NEEDS_REVIEW').length} Cần Xem Lại
                    </span>
                  )}
                </div>
              )}

              {/* Autosave Status Indicator */}
              <div className="flex items-center gap-1 text-xs">
                {isAutosaving ? (
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 animate-pulse flex items-center gap-1">
                    <Save className="w-3 h-3 animate-spin" />
                    <span>Đang tự động lưu...</span>
                  </span>
                ) : hasUnsavedChanges ? (
                  <button
                    type="button"
                    onClick={() => saveQuestionsBatch(questions)}
                    className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300 flex items-center gap-1 transition-colors"
                  >
                    <Save className="w-3 h-3" />
                    <span>Lưu ngay</span>
                  </button>
                ) : (
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-50 text-slate-500 border border-slate-200 flex items-center gap-1">
                    <Check className="w-3 h-3 text-emerald-600" />
                    <span>Đã đồng bộ</span>
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* EDIT / PREVIEW Mode Switcher */}
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setQuestionViewMode('edit')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    questionViewMode === 'edit'
                      ? 'bg-white text-blue-600 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Chỉnh Sửa</span>
                </button>
                <button
                  type="button"
                  onClick={() => setQuestionViewMode('preview')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    questionViewMode === 'preview'
                      ? 'bg-white text-blue-600 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Xem Trước (Học Sinh)</span>
                </button>
              </div>

              {/* Batch Points Distribute */}
              {questions.length > 0 && questionViewMode === 'edit' && (
                <button
                  type="button"
                  onClick={handleDistributePointsEvenly}
                  title="Chia đều thang 10 điểm cho tất cả câu hỏi"
                  className="inline-flex items-center gap-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  <span>Chia đều 10đ</span>
                </button>
              )}

              {importHistory.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowImportHistory(!showImportHistory)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
                >
                  <History className="w-3.5 h-3.5" />
                  <span>Lịch sử ({importHistory.length})</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleAddNewQuestion}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
              >
                <Plus className="w-3.5 h-3.5 text-blue-600" />
                <span>Thêm Câu Hỏi</span>
              </button>

              <button
                type="button"
                onClick={() => setIsImportModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition-all shadow-xs"
              >
                <UploadCloud className="w-4 h-4" />
                <span>Nhập Đề Tự Động (.tex, .docx, .pdf)</span>
              </button>
            </div>
          </div>

          {/* Import History Drawer / Card if toggled */}
          {showImportHistory && (
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <History className="w-4 h-4 text-blue-600" />
                  <span>Nhật Ký Nhập Đề Thi</span>
                </h4>
                <button
                  onClick={() => setShowImportHistory(false)}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  Đóng
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-white text-slate-500 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">Tên tệp</th>
                      <th className="py-2 px-3">Định dạng</th>
                      <th className="py-2 px-3">Thời gian</th>
                      <th className="py-2 px-3 text-center">Bóc tách</th>
                      <th className="py-2 px-3 text-center">Hợp lệ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {importHistory.map((item, idx) => (
                      <tr key={item.id || idx} className="hover:bg-white/60">
                        <td className="py-2 px-3 font-medium text-slate-800">{item.fileName}</td>
                        <td className="py-2 px-3 uppercase text-[11px] font-bold text-slate-500">{item.fileType}</td>
                        <td className="py-2 px-3 text-slate-400">{formatDate(item.uploadedAt)}</td>
                        <td className="py-2 px-3 text-center font-semibold text-slate-700">{item.totalParsed} câu</td>
                        <td className="py-2 px-3 text-center">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            {item.validCount} câu
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* PREVIEW MODE RENDERING */}
          {questionViewMode === 'preview' ? (
            <StudentExamPreview
              testTitle={test.title}
              durationMinutes={test.duration || 45}
              questions={questions}
              onExitPreview={() => setQuestionViewMode('edit')}
            />
          ) : (
            /* EDIT MODE RENDERING */
            <>
              {isLoadingQuestions ? (
                <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center text-slate-500 text-xs">
                  Đang tải danh sách câu hỏi...
                </div>
              ) : questions.length === 0 ? (
                <div className="bg-white p-10 sm:p-12 rounded-2xl border border-slate-200 text-center space-y-4">
                  <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto">
                    <FileQuestion className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-slate-900">Kỳ thi chưa có câu hỏi nào</h3>
                    <p className="text-xs text-slate-500 max-w-md mx-auto">
                      Bạn có thể tải lên tệp đề thi có sẵn dạng Word (.docx), LaTeX (.tex) hoặc PDF để hệ thống tự động bóc
                      tách và giữ nguyên công thức toán, hoặc tự tạo câu hỏi thủ công.
                    </p>
                  </div>

                  <div className="pt-3 flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => setIsImportModalOpen(true)}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 transition-colors shadow-xs"
                    >
                      <UploadCloud className="w-4 h-4" />
                      <span>Nhập Đề Thi Tự Động (.tex, .docx, .pdf)</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleAddNewQuestion}
                      className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-50 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Soạn Câu Hỏi Thủ Công</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {questions.map((q, idx) => (
                    <div
                      key={q.id || idx}
                      className={`bg-white p-5 rounded-2xl border transition-all ${
                        q.validationStatus === 'VALID'
                          ? 'border-slate-200 hover:border-slate-300'
                          : 'border-amber-300 bg-amber-50/20'
                      }`}
                    >
                      {/* Card Header */}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Reorder Buttons */}
                          <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                            <button
                              type="button"
                              onClick={() => handleMoveQuestion(idx, 'up')}
                              disabled={idx === 0}
                              title="Di chuyển lên"
                              className="p-1 text-slate-600 hover:text-slate-900 disabled:opacity-30 disabled:hover:text-slate-600 transition-colors"
                            >
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveQuestion(idx, 'down')}
                              disabled={idx === questions.length - 1}
                              title="Di chuyển xuống"
                              className="p-1 text-slate-600 hover:text-slate-900 disabled:opacity-30 disabled:hover:text-slate-600 transition-colors"
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-900 text-white">
                            Câu {q.questionNumber || idx + 1}
                          </span>
                          <span className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-blue-50 text-blue-700">
                            {q.type === 'multiple_choice'
                              ? 'Trắc nghiệm chọn 1'
                              : q.type === 'true_false'
                              ? 'Đúng / Sai'
                              : 'Trả lời ngắn'}
                          </span>

                          {/* Inline Points Edit */}
                          <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5">
                            <span className="text-[11px] font-medium text-slate-500">Điểm:</span>
                            <input
                              type="number"
                              min="0"
                              step="0.25"
                              value={q.points !== undefined ? q.points : 1}
                              onChange={e => handlePointsChange(idx, parseFloat(e.target.value) || 0)}
                              className="w-12 text-xs font-bold text-slate-800 bg-transparent text-center focus:outline-hidden"
                            />
                          </div>

                          {q.validationStatus === 'VALID' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                              <CheckCircle2 className="w-3 h-3" />
                              Hợp lệ
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-900">
                              <AlertCircle className="w-3 h-3" />
                              Cần xem lại
                            </span>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingQuestion(q)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-blue-600 transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Sửa</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDuplicateQuestion(q, idx)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 transition-colors"
                            title="Nhân bản câu hỏi này"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            <span>Nhân bản</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteQuestion(q.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Xóa câu hỏi này"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Question Content */}
                      <div className="text-sm font-medium text-slate-900 py-1 leading-relaxed">
                        <LatexRenderer content={q.content || '[Chưa có nội dung câu hỏi]'} />
                      </div>

                      {/* Attached Images */}
                      {q.images && q.images.length > 0 && (
                        <div className="my-2.5 flex items-center gap-2 flex-wrap">
                          {q.images.map((imgSrc, imgIdx) => (
                            <div
                              key={imgIdx}
                              className="w-24 h-16 rounded-lg overflow-hidden border border-slate-200 bg-slate-50 flex items-center justify-center p-1"
                            >
                              <img
                                src={imgSrc}
                                alt={`Minh họa ${imgIdx + 1}`}
                                className="max-h-full max-w-full object-contain"
                                referrerPolicy="no-referrer"
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Options Section */}
                      {q.type === 'multiple_choice' && q.options && q.options.length > 0 && (
                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          {q.options.map((opt, optIdx) => {
                            const letter = String.fromCharCode(65 + optIdx);
                            const isCorrect = q.correctAnswer === letter;

                            return (
                              <div
                                key={optIdx}
                                className={`p-2.5 rounded-xl border text-xs flex items-center gap-2.5 ${
                                  isCorrect
                                    ? 'bg-emerald-50/80 border-emerald-300 font-semibold text-emerald-900'
                                    : 'bg-slate-50/50 border-slate-200 text-slate-700'
                                }`}
                              >
                                <span
                                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                                    isCorrect ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
                                  }`}
                                >
                                  {letter}
                                </span>
                                <div className="flex-1">
                                  <LatexRenderer content={opt} />
                                </div>
                                {isCorrect && (
                                  <span className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider">
                                    Đáp Án Đúng
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* True / False Display */}
                      {q.type === 'true_false' && q.options && q.options.length > 0 && (
                        <div className="mt-3 space-y-2 text-xs">
                          {q.options.map((opt, optIdx) => {
                            const letter = String.fromCharCode(97 + optIdx);
                            const isTrue = Array.isArray(q.correctAnswer) ? !!q.correctAnswer[optIdx] : false;

                            return (
                              <div
                                key={optIdx}
                                className="p-2.5 bg-slate-50/60 border border-slate-200 rounded-xl flex items-center justify-between gap-3 text-xs"
                              >
                                <div className="flex items-center gap-2 flex-1">
                                  <span className="font-bold text-slate-700">{letter})</span>
                                  <div className="flex-1 text-slate-800">
                                    <LatexRenderer content={opt} />
                                  </div>
                                </div>
                                <span
                                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                    isTrue ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                                  }`}
                                >
                                  {isTrue ? 'Đúng' : 'Sai'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Short Answer Display */}
                      {q.type === 'short_answer' && (
                        <div className="mt-2.5 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-500">Đáp án chính thức:</span>
                            <span className="font-bold text-emerald-700">{String(q.correctAnswer || '[Chưa điền]')}</span>
                          </div>
                          {q.acceptedAnswers && q.acceptedAnswers.length > 0 && (
                            <div className="text-[11px] text-slate-500">
                              Chấp nhận tương đương: {q.acceptedAnswers.join(', ')}
                            </div>
                          )}
                          {q.numericTolerance !== undefined && (
                            <div className="text-[11px] text-slate-500">
                              Dung sai số học: ±{q.numericTolerance}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Solution Links */}
                      {q.solutionLinks && q.solutionLinks.length > 0 && (
                        <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                          {q.solutionLinks.map((link, lIdx) => (
                            <a
                              key={lIdx}
                              href={link}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline bg-blue-50/60 px-2.5 py-1 rounded-lg border border-blue-100"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>Tài liệu giải thích #{lIdx + 1}</span>
                            </a>
                          ))}
                        </div>
                      )}

                      {/* Explanation if exists */}
                      {q.explanation && (
                        <div className="mt-3 p-3 bg-blue-50/60 border border-blue-100 rounded-xl text-xs text-blue-900 space-y-1">
                          <span className="font-bold text-blue-800 block">Lời giải chi tiết:</span>
                          <LatexRenderer content={q.explanation} />
                        </div>
                      )}

                      {/* Errors hint */}
                      {q.validationErrors && q.validationErrors.length > 0 && (
                        <div className="mt-3 text-xs text-amber-900 bg-amber-50 border border-amber-200 p-2.5 rounded-xl flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                            <span>
                              <strong>Cần khắc phục: </strong> {q.validationErrors.join(', ')}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setEditingQuestion(q)}
                            className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shrink-0 transition-colors"
                          >
                            Sửa ngay
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Tab 3: Cài Đặt */}
      {activeTab === 'settings' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Cấu Hình Kỳ Thi</h3>
              <p className="text-xs text-slate-500">Chỉnh sửa thông số, thời gian và quyền xem bài thi</p>
            </div>
            <button
              onClick={onEdit}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors shadow-xs"
            >
              Mở Trình Chỉnh Sửa
            </button>
          </div>

          <div className="divide-y divide-slate-100 text-sm">
            <div className="py-3 flex justify-between items-center">
              <div>
                <p className="font-semibold text-slate-800">Tên kỳ thi</p>
                <p className="text-xs text-slate-500">{test.title}</p>
              </div>
            </div>
            <div className="py-3 flex justify-between items-center">
              <div>
                <p className="font-semibold text-slate-800">Thời gian làm bài</p>
                <p className="text-xs text-slate-500">{test.duration} phút</p>
              </div>
            </div>
            <div className="py-3 flex justify-between items-center">
              <div>
                <p className="font-semibold text-slate-800">Xáo trộn nội dung</p>
                <p className="text-xs text-slate-500">
                  Câu hỏi: {test.randomizeQuestions ? 'Bật' : 'Tắt'} | Đáp án:{' '}
                  {test.randomizeOptions ? 'Bật' : 'Tắt'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Kết Quả (Placeholder có cấu trúc chuyên nghiệp, KHÔNG tạo dữ liệu giả) */}
      {activeTab === 'results' && (
        <div className="space-y-4">
          <TestResultsPanel test={test} />
        </div>
      )}

      {/* Tab 5: Thống Kê (Placeholder có cấu trúc chuyên nghiệp, KHÔNG tạo dữ liệu giả) */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200">
              <span className="text-xs font-medium text-slate-400">Điểm trung bình</span>
              <p className="text-2xl font-bold text-slate-800 mt-1">-- / 10</p>
              <span className="text-xs text-slate-400">Chưa có dữ liệu</span>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200">
              <span className="text-xs font-medium text-slate-400">Điểm cao nhất</span>
              <p className="text-2xl font-bold text-emerald-600 mt-1">-- / 10</p>
              <span className="text-xs text-slate-400">Chưa có dữ liệu</span>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200">
              <span className="text-xs font-medium text-slate-400">Điểm thấp nhất</span>
              <p className="text-2xl font-bold text-rose-600 mt-1">-- / 10</p>
              <span className="text-xs text-slate-400">Chưa có dữ liệu</span>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200">
              <span className="text-xs font-medium text-slate-400">Tỷ lệ hoàn thành</span>
              <p className="text-2xl font-bold text-blue-600 mt-1">--%</p>
              <span className="text-xs text-slate-400">Chưa có dữ liệu</span>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 text-center py-12">
            <BarChart3 className="w-10 h-10 mx-auto text-slate-300 mb-3" />
            <h4 className="text-base font-bold text-slate-800">Biểu Đồ Phổ Điểm & Ma Trận Câu Hỏi</h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
              Hệ thống sẽ tự động tổng hợp biểu đồ tần suất điểm số, câu hỏi khó nhất và độ phân hóa
              ngay khi có học sinh nộp bài.
            </p>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      {confirmAction && (
        <ConfirmDialog
          isOpen={true}
          title={confirmAction.title}
          message={confirmAction.message}
          variant={confirmAction.variant}
          loading={isActionLoading}
          onConfirm={handleConfirm}
          onClose={() => setConfirmAction(null)}
        />
      )}

      {/* Phase 3: Exam Import Modal */}
      <ExamImportModal
        isOpen={isImportModalOpen}
        testId={test.id}
        teacherId={test.teacherId}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={async () => {
          await loadQuestions();
        }}
      />

      {/* Phase 4: Question Editor Modal */}
      {editingQuestion && (
        <QuestionEditorModal
          isOpen={!!editingQuestion}
          question={editingQuestion}
          onClose={() => setEditingQuestion(null)}
          onSave={handleSaveQuestion}
        />
      )}

      {/* Phase 4: Pre-publish Validation Modal */}
      {isPublishValidationOpen && publishValidationResult && (
        <PublishValidationModal
          isOpen={isPublishValidationOpen}
          result={publishValidationResult}
          questions={questions}
          onClose={() => setIsPublishValidationOpen(false)}
          onEditQuestion={q => {
            setIsPublishValidationOpen(false);
            setEditingQuestion(q);
          }}
          onConfirmPublish={() => {
            setIsPublishValidationOpen(false);
            setConfirmAction({
              type: 'publish',
              title: 'Công Bố Kỳ Thi (Bỏ Qua Cảnh Báo)',
              message:
                'Kỳ thi còn một số cảnh báo nhưng không có lỗi nghiêm trọng. Bạn có chắc chắn muốn công bố ngay?',
              variant: 'primary',
            });
          }}
        />
      )}
    </div>
  );
};
