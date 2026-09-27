import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  FileText,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  X,
  Edit3,
  Trash2,
  Sparkles,
  RefreshCw,
  Eye,
  FileCode,
  FileCheck,
} from 'lucide-react';
import { Question, ParseResult } from '../../types/question';
import { importExamFromFile } from '../../services/import';
import { extractQuestionsWithAi } from '../../services/document-ai/question-extractor';
import { questionService } from '../../services/questionService';
import { QuestionEditModal } from './QuestionEditModal';
import { LatexRenderer } from '../common/LatexRenderer';

interface ExamImportModalProps {
  testId: string;
  teacherId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (savedQuestions: Question[]) => void;
}

type Step = 'UPLOAD' | 'PROCESSING' | 'REVIEW';

export const ExamImportModal: React.FC<ExamImportModalProps> = ({
  testId,
  teacherId,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [currentStep, setCurrentStep] = useState<Step>('UPLOAD');
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Progress state
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [isAiProcessing, setIsAiProcessing] = useState(false);

  // Parse result & questions state
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'VALID' | 'NEEDS_REVIEW'>('ALL');

  // Editing modal state
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);

  // Saving state
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const resetAll = () => {
    setCurrentStep('UPLOAD');
    setSelectedFile(null);
    setProgressPercent(0);
    setProgressMessage('');
    setParseResult(null);
    setQuestions([]);
    setErrorMessage(null);
    setIsAiProcessing(false);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  };

  const handleFileSelected = async (file: File) => {
    setSelectedFile(file);
    setErrorMessage(null);
    setCurrentStep('PROCESSING');
    setProgressPercent(10);
    setProgressMessage('Đang khởi tạo tiến trình kiểm tra tệp...');

    try {
      const result = await importExamFromFile(file, (msg, pct) => {
        setProgressMessage(msg);
        setProgressPercent(pct);
      });

      setParseResult(result);
      setQuestions(result.questions);
      setCurrentStep('REVIEW');

      if (!result.success && result.questions.length === 0) {
        setErrorMessage(result.warnings.join(' '));
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Có lỗi xảy ra trong quá trình đọc và phân tích tệp.');
      setCurrentStep('UPLOAD');
    }
  };

  // AI re-extraction handler for scanned PDFs or complex documents
  const handleAiExtraction = async () => {
    if (!selectedFile) return;
    setIsAiProcessing(true);
    setErrorMessage(null);

    try {
      let content = parseResult?.rawTextSample || '';
      if (!content && selectedFile) {
        // Read text from file
        const textDecoder = new TextDecoder('utf-8');
        const buf = await selectedFile.arrayBuffer();
        content = textDecoder.decode(buf).slice(0, 10000);
      }

      const aiRes = await extractQuestionsWithAi(content, {
        fileName: selectedFile.name,
      });

      if (aiRes.questions.length > 0) {
        setQuestions(aiRes.questions);
        setParseResult(prev => ({
          ...prev!,
          questions: aiRes.questions,
          warnings: [...(prev?.warnings || []), 'Đã hoàn tất trích xuất nâng cao bằng mô hình AI.'],
          requiresOcrOrAi: false,
          validCount: aiRes.validCount,
          needsReviewCount: aiRes.needsReviewCount,
        }));
      } else {
        setErrorMessage(aiRes.warnings.join(' ') || 'AI không thể trích xuất câu hỏi từ dữ liệu này.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi khi gọi dịch vụ AI trích xuất câu hỏi.');
    } finally {
      setIsAiProcessing(false);
    }
  };

  const handleUpdateQuestion = (updated: Question) => {
    setQuestions(prev => prev.map(q => (q.id === updated.id ? updated : q)));
  };

  const handleDeleteQuestion = (id: string) => {
    setQuestions(prev =>
      prev
        .filter(q => q.id !== id)
        .map((q, idx) => ({ ...q, questionNumber: idx + 1 }))
    );
  };

  const handleSaveToExam = async () => {
    if (questions.length === 0) {
      alert('Không có câu hỏi nào để lưu vào kỳ thi.');
      return;
    }

    const needsReview = questions.filter(q => q.validationStatus === 'NEEDS_REVIEW');
    if (needsReview.length > 0) {
      const confirmSave = window.confirm(
        `Hiện có ${needsReview.length} câu hỏi chưa hoàn thiện (Cần xem lại). Bạn có muốn tiếp tục lưu? Học sinh sẽ không thể làm các câu hỏi bị lỗi cho đến khi bạn sửa lại.`
      );
      if (!confirmSave) return;
    }

    setIsSaving(true);
    try {
      // 1. Save questions into test collection
      const saved = await questionService.saveQuestions(testId, questions, teacherId);

      // 2. Record import metadata
      if (selectedFile && parseResult) {
        await questionService.recordImportMetadata(testId, {
          testId,
          teacherId,
          fileName: selectedFile.name,
          fileSize: selectedFile.size,
          fileType: (parseResult.fileType as any) || 'docx',
          uploadedAt: new Date().toISOString(),
          totalParsed: questions.length,
          validCount: questions.filter(q => q.validationStatus === 'VALID').length,
          needsReviewCount: questions.filter(q => q.validationStatus === 'NEEDS_REVIEW').length,
        });
      }

      onSuccess(saved);
      onClose();
      resetAll();
    } catch (err: any) {
      alert(err.message || 'Không thể lưu câu hỏi vào kỳ thi.');
    } finally {
      setIsSaving(false);
    }
  };

  // Filter questions for review
  const filteredQuestions = questions.filter(q => {
    if (filterStatus === 'VALID') return q.validationStatus === 'VALID';
    if (filterStatus === 'NEEDS_REVIEW') return q.validationStatus === 'NEEDS_REVIEW';
    return true;
  });

  const validTotal = questions.filter(q => q.validationStatus === 'VALID').length;
  const needsReviewTotal = questions.length - validTotal;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 my-auto">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Nhập Đề Thi Tự Động</h2>
              <p className="text-xs text-slate-500">
                Hỗ trợ tệp LaTeX (.tex), Word (.docx) và PDF với chuẩn công thức toán học
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              onClose();
              resetAll();
            }}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Pipeline Step Indicator */}
        <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                currentStep === 'UPLOAD'
                  ? 'bg-blue-600 text-white'
                  : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              1
            </span>
            <span className={currentStep === 'UPLOAD' ? 'font-bold text-slate-900' : 'text-slate-500'}>
              Tải Lên Tệp
            </span>
          </div>

          <div className="h-0.5 w-12 bg-slate-200" />

          <div className="flex items-center gap-2">
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                currentStep === 'PROCESSING'
                  ? 'bg-blue-600 text-white'
                  : currentStep === 'REVIEW'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              2
            </span>
            <span className={currentStep === 'PROCESSING' ? 'font-bold text-slate-900' : 'text-slate-500'}>
              Bóc Tách & Phân Tích
            </span>
          </div>

          <div className="h-0.5 w-12 bg-slate-200" />

          <div className="flex items-center gap-2">
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                currentStep === 'REVIEW'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              3
            </span>
            <span className={currentStep === 'REVIEW' ? 'font-bold text-slate-900' : 'text-slate-500'}>
              Kiểm Duyệt & Lưu
            </span>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* Error notice if present */}
          {errorMessage && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-xs text-rose-800 animate-in fade-in">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-semibold block mb-0.5">Lỗi xử lý tệp:</span>
                <p>{errorMessage}</p>
              </div>
            </div>
          )}

          {/* STEP 1: UPLOAD */}
          {currentStep === 'UPLOAD' && (
            <div className="space-y-6">
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-all flex flex-col items-center justify-center ${
                  dragActive
                    ? 'border-blue-500 bg-blue-50/50 scale-[0.99]'
                    : 'border-slate-200 hover:border-blue-400 bg-slate-50/50 hover:bg-slate-50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".tex,.docx,.pdf"
                  onChange={handleFileInputChange}
                  className="hidden"
                />

                <div className="w-16 h-16 rounded-2xl bg-blue-100/60 text-blue-600 flex items-center justify-center mb-4">
                  <UploadCloud className="w-8 h-8" />
                </div>

                <h3 className="text-sm sm:text-base font-bold text-slate-800">
                  Kéo thả file đề thi vào đây, hoặc <span className="text-blue-600 hover:underline">duyệt tệp</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1.5 max-w-sm">
                  Hệ thống hỗ trợ file .tex (LaTeX chuẩn), file .docx (Microsoft Word) và file .pdf (tài liệu số). Dung lượng tối đa 15MB.
                </p>

                {/* File type badges */}
                <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 shadow-2xs">
                    <FileCode className="w-3.5 h-3.5 text-blue-600" />
                    LaTeX (.tex)
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 shadow-2xs">
                    <FileText className="w-3.5 h-3.5 text-indigo-600" />
                    Word (.docx)
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 shadow-2xs">
                    <FileCheck className="w-3.5 h-3.5 text-rose-600" />
                    PDF (.pdf)
                  </span>
                </div>
              </div>

              {/* Security & Pipeline Information */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/80 text-xs text-slate-600 space-y-2">
                <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Quy trình bảo mật và kiểm duyệt đề thi:</span>
                </div>
                <ul className="list-disc list-inside space-y-1 pl-1 text-slate-600 leading-relaxed">
                  <li>
                    <strong>Bảo toàn công thức:</strong> Giữ nguyên định dạng toán học LaTeX ($...$), không chuyển thành chữ thô.
                  </li>
                  <li>
                    <strong>Ưu tiên Parser:</strong> Phân tích cú pháp trực tiếp từ mã nguồn LaTeX và tài liệu Word trước khi gọi AI.
                  </li>
                  <li>
                    <strong>Kiểm soát chất lượng:</strong> Không tự động công bố hoặc lưu trực tiếp. Giáo viên luôn kiểm duyệt và sửa câu hỏi trước khi đưa vào đề thi.
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* STEP 2: PROCESSING */}
          {currentStep === 'PROCESSING' && (
            <div className="py-12 px-6 flex flex-col items-center justify-center text-center space-y-6 max-w-md mx-auto">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center animate-pulse">
                  <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
                </div>
              </div>

              <div className="space-y-1.5 w-full">
                <h3 className="text-base font-bold text-slate-900">Đang Xử Lý Đề Thi</h3>
                <p className="text-xs text-slate-500">{progressMessage || 'Vui lòng chờ trong giây lát...'}</p>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              <div className="text-xs text-slate-400 font-mono">
                {selectedFile?.name} ({(selectedFile ? selectedFile.size / 1024 : 0).toFixed(1)} KB)
              </div>

              <button
                onClick={resetAll}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800 underline pt-2"
              >
                Hủy bỏ tiến trình
              </button>
            </div>
          )}

          {/* STEP 3: REVIEW & TEACHER INSPECTION */}
          {currentStep === 'REVIEW' && (
            <div className="space-y-5">
              {/* Summary Stats & Warning Banner */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-xs text-slate-500 font-medium">Tổng câu hỏi trích xuất</span>
                  <p className="text-xl font-bold text-slate-900 mt-0.5">{questions.length} câu</p>
                </div>

                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <span className="text-xs text-emerald-700 font-medium">Câu hỏi hợp lệ</span>
                  <p className="text-xl font-bold text-emerald-800 mt-0.5">{validTotal} câu</p>
                </div>

                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl">
                  <span className="text-xs text-amber-700 font-medium">Cần kiểm duyệt (Thiếu dữ liệu)</span>
                  <p className="text-xl font-bold text-amber-800 mt-0.5">{needsReviewTotal} câu</p>
                </div>
              </div>

              {/* Warnings List */}
              {parseResult?.warnings && parseResult.warnings.length > 0 && (
                <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      <span>Cảnh báo từ bộ phân tích cú pháp:</span>
                    </div>

                    {parseResult.requiresOcrOrAi && (
                      <button
                        onClick={handleAiExtraction}
                        disabled={isAiProcessing}
                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold shadow-xs disabled:opacity-50"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>{isAiProcessing ? 'Đang trích xuất AI...' : 'Nhận diện nâng cao bằng AI'}</span>
                      </button>
                    )}
                  </div>
                  <ul className="list-disc list-inside text-xs text-amber-800 space-y-1 pl-1">
                    {parseResult.warnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Filter Tabs & Question List Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-fit">
                  <button
                    onClick={() => setFilterStatus('ALL')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                      filterStatus === 'ALL'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Tất cả ({questions.length})
                  </button>
                  <button
                    onClick={() => setFilterStatus('VALID')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                      filterStatus === 'VALID'
                        ? 'bg-white text-emerald-700 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Hợp lệ ({validTotal})
                  </button>
                  <button
                    onClick={() => setFilterStatus('NEEDS_REVIEW')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                      filterStatus === 'NEEDS_REVIEW'
                        ? 'bg-white text-amber-700 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Cần xem lại ({needsReviewTotal})
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={resetAll}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 rounded-lg"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Tải tệp khác</span>
                  </button>
                </div>
              </div>

              {/* Questions List */}
              <div className="space-y-3.5 max-h-[460px] overflow-y-auto pr-1">
                {filteredQuestions.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-xl text-slate-500 text-xs">
                    Không có câu hỏi nào khớp với bộ lọc hiện tại.
                  </div>
                ) : (
                  filteredQuestions.map((q, idx) => (
                    <div
                      key={q.id}
                      className={`p-4 rounded-xl border transition-all ${
                        q.validationStatus === 'VALID'
                          ? 'bg-white border-slate-200 hover:border-slate-300'
                          : 'bg-amber-50/40 border-amber-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-slate-100 text-slate-800">
                            Câu {q.questionNumber}
                          </span>
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-50 text-blue-700">
                            {q.type === 'multiple_choice'
                              ? 'Trắc nghiệm (1 đáp án)'
                              : q.type === 'true_false'
                              ? 'Đúng / Sai'
                              : 'Trả lời ngắn'}
                          </span>

                          {q.validationStatus === 'VALID' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                              <CheckCircle2 className="w-3 h-3" />
                              Hợp lệ
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-100 text-amber-900">
                              <AlertCircle className="w-3 h-3" />
                              Cần xem lại
                            </span>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => setEditingQuestion(q)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-blue-600 transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Sửa</span>
                          </button>
                          <button
                            onClick={() => handleDeleteQuestion(q.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Xóa câu hỏi này"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Question Content with LaTeX rendering */}
                      <div className="text-xs sm:text-sm text-slate-800 font-medium py-1">
                        <LatexRenderer content={q.content || '[Chưa có nội dung câu hỏi]'} />
                      </div>

                      {/* Options preview */}
                      {q.options && q.options.length > 0 && (
                        <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          {q.options.map((opt, optIdx) => {
                            const letter = String.fromCharCode(65 + optIdx);
                            const isCorrect =
                              q.type === 'multiple_choice'
                                ? q.correctAnswer === letter
                                : q.type === 'true_false' && Array.isArray(q.correctAnswer)
                                ? !!q.correctAnswer[optIdx]
                                : false;

                            return (
                              <div
                                key={optIdx}
                                className={`p-2 rounded-lg border text-xs flex items-center gap-2 ${
                                  isCorrect
                                    ? 'bg-emerald-50 border-emerald-300 font-semibold text-emerald-900'
                                    : 'bg-slate-50/60 border-slate-200 text-slate-700'
                                }`}
                              >
                                <span
                                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${
                                    isCorrect ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
                                  }`}
                                >
                                  {q.type === 'true_false' ? String.fromCharCode(97 + optIdx) : letter}
                                </span>
                                <div className="flex-1 truncate">
                                  <LatexRenderer content={opt} />
                                </div>
                                {isCorrect && (
                                  <span className="text-[10px] text-emerald-700 font-bold uppercase">
                                    {q.type === 'true_false' ? 'Đúng' : 'Đáp án'}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Validation errors hint if invalid */}
                      {q.validationErrors && q.validationErrors.length > 0 && (
                        <div className="mt-2 text-[11px] text-amber-800 bg-amber-100/60 px-2.5 py-1 rounded-lg">
                          <strong>Vấn đề: </strong> {q.validationErrors.join(', ')}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between rounded-b-2xl">
          <button
            onClick={() => {
              onClose();
              resetAll();
            }}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white border border-slate-200 rounded-xl transition-all"
          >
            Đóng
          </button>

          {currentStep === 'REVIEW' && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveToExam}
                disabled={isSaving || questions.length === 0}
                className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl transition-all shadow-xs flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isSaving ? 'Đang lưu vào đề thi...' : `Lưu ${questions.length} Câu Hỏi Vào Kỳ Thi`}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Editing Modal */}
      {editingQuestion && (
        <QuestionEditModal
          question={editingQuestion}
          isOpen={!!editingQuestion}
          onClose={() => setEditingQuestion(null)}
          onSave={handleUpdateQuestion}
        />
      )}
    </div>
  );
};
