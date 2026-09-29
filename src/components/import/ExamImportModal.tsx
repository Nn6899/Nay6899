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
  ClipboardList,
  Code2,
  Sigma,
} from 'lucide-react';
import { Question, ParseResult } from '../../types/question';
import { importExamFromFile, parseTextExam } from '../../services/import';
import { extractQuestionsWithAi, extractQuestionsWithAiFromFile } from '../../services/document-ai/question-extractor';
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
type InputMode = 'FILE' | 'PASTE';

export const ExamImportModal: React.FC<ExamImportModalProps> = ({
  testId,
  teacherId,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [currentStep, setCurrentStep] = useState<Step>('UPLOAD');
  const [inputMode, setInputMode] = useState<InputMode>('FILE');
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState('');

  // Formula rendering toggle: KaTeX preview vs raw LaTeX code
  const [showRawLatex, setShowRawLatex] = useState(false);

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
    setInputMode('FILE');
    setSelectedFile(null);
    setPastedText('');
    setProgressPercent(0);
    setProgressMessage('');
    setParseResult(null);
    setQuestions([]);
    setErrorMessage(null);
    setIsAiProcessing(false);
    setShowRawLatex(false);
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
    setProgressMessage('Đang khởi tạo tiến trình đọc tệp và phân tích công thức...');

    const onProgress = (msg: string, pct: number) => {
      setProgressMessage(msg);
      setProgressPercent(pct);
    };

    try {
      // Ảnh chụp đề: chỉ AI mới đọc được
      if (/\.(png|jpe?g|webp)$/i.test(file.name)) {
        const aiResult = await extractQuestionsWithAiFromFile(file, onProgress);
        setParseResult(aiResult);
        setQuestions(aiResult.questions);
        setCurrentStep('REVIEW');
        if (aiResult.questions.length === 0) setErrorMessage(aiResult.warnings.join(' '));
        return;
      }

      let result = await importExamFromFile(file, onProgress);

      // PDF scan (không có lớp chữ): tự động chuyển sang AI OCR
      if (result.requiresOcrOrAi) {
        onProgress('PDF là bản scan/ảnh — đang chuyển sang AI để nhận dạng chữ và công thức...', 20);
        const aiResult = await extractQuestionsWithAiFromFile(file, onProgress);
        if (aiResult.questions.length > 0) {
          result = { ...aiResult, fileType: 'pdf', warnings: ['Đã nhận dạng bản scan bằng AI (OCR). Hãy kiểm tra lại công thức và đáp án.', ...aiResult.warnings] };
        } else {
          result = { ...result, warnings: [...result.warnings, ...aiResult.warnings] };
        }
      }

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

  // Pasted text submission
  const handlePastedTextSubmit = () => {
    if (!pastedText.trim()) {
      setErrorMessage('Vui lòng dán nội dung đề thi trước khi bóc tách.');
      return;
    }

    setErrorMessage(null);
    setCurrentStep('PROCESSING');
    setProgressPercent(40);
    setProgressMessage('Đang nhận diện công thức MathType và phân tách câu hỏi...');

    try {
      const result = parseTextExam(pastedText, 'van_ban_de_thi.txt');
      setProgressPercent(100);
      setParseResult(result);
      setQuestions(result.questions);
      setCurrentStep('REVIEW');

      if (!result.success && result.questions.length === 0) {
        setErrorMessage(result.warnings.join(' '));
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi khi xử lý văn bản đề thi.');
      setCurrentStep('UPLOAD');
    }
  };

  // AI re-extraction handler for scanned PDFs or complex documents
  const handleAiExtraction = async () => {
    if (!selectedFile && !pastedText) return;
    setIsAiProcessing(true);
    setErrorMessage(null);

    try {
      // Gửi TOÀN BỘ đề cho AI (bản cũ chỉ gửi 300 ký tự đầu nên AI không tách được câu)
      const aiRes = selectedFile && inputMode === 'FILE'
        ? await extractQuestionsWithAiFromFile(selectedFile)
        : await extractQuestionsWithAi(pastedText, { fileName: 'pasted_exam.txt' });

      if (aiRes.questions.length > 0) {
        setQuestions(aiRes.questions);
        setParseResult(prev => ({
          ...prev!,
          questions: aiRes.questions,
          warnings: ['Đã bóc tách lại bằng AI. Hãy kiểm tra công thức và đáp án trước khi lưu.', ...aiRes.warnings],
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
        `Hiện có ${needsReview.length} câu hỏi chưa hoàn thiện (Cần xem lại). Bạn có muốn tiếp tục lưu? Bạn có thể chỉnh sửa lại sau trong trình soạn thảo.`
      );
      if (!confirmSave) return;
    }

    setIsSaving(true);
    try {
      // 1. Save questions into test collection
      const saved = await questionService.saveQuestions(testId, questions, teacherId);

      // 2. Record import metadata
      if (parseResult) {
        await questionService.recordImportMetadata(testId, {
          testId,
          teacherId,
          fileName: selectedFile?.name || 'van_ban_nhap_truc_tiep.txt',
          fileSize: selectedFile?.size || pastedText.length,
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
              <h2 className="text-base font-bold text-slate-900">Nhập Đề Thi & Chuyển Đổi MathType</h2>
              <p className="text-xs text-slate-500">
                Tự động tách câu hỏi (Câu x., Câu x:, Bài x., Bài x:) và chuyển đổi công thức MathType sang LaTeX
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
              Tải Lên / Dán Đề Thi
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
              Chuyển MathType & Tách Câu
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
              Kiểm Duyệt Công Thức & Lưu
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
                <span className="font-semibold block mb-0.5">Thông báo:</span>
                <p>{errorMessage}</p>
              </div>
            </div>
          )}

          {/* STEP 1: UPLOAD OR PASTE TEXT */}
          {currentStep === 'UPLOAD' && (
            <div className="space-y-5">
              {/* Mode Switcher: File upload vs Paste text */}
              <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl w-fit">
                <button
                  type="button"
                  onClick={() => setInputMode('FILE')}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    inputMode === 'FILE'
                      ? 'bg-white text-blue-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>Tải Tệp Đề Thi (.docx, .tex, .txt, .pdf)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('PASTE')}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    inputMode === 'PASTE'
                      ? 'bg-white text-blue-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ClipboardList className="w-3.5 h-3.5" />
                  <span>Dán Trực Tiếp Văn Bản Đề Thi</span>
                </button>
              </div>

              {inputMode === 'FILE' ? (
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
                    accept=".docx,.tex,.txt,.pdf,.png,.jpg,.jpeg,.webp"
                    onChange={handleFileInputChange}
                    className="hidden"
                  />

                  <div className="w-16 h-16 rounded-2xl bg-blue-100/60 text-blue-600 flex items-center justify-center mb-4">
                    <UploadCloud className="w-8 h-8" />
                  </div>

                  <h3 className="text-sm sm:text-base font-bold text-slate-800">
                    Kéo thả file đề thi vào đây, hoặc <span className="text-blue-600 hover:underline">duyệt tệp từ máy tính</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-1.5 max-w-md">
                    Hỗ trợ Word (.docx) chứa công thức MathType/Equation, LaTeX (.tex), Văn bản (.txt), PDF (.pdf, kể cả bản scan) và ảnh chụp đề (.jpg/.png). Công thức được chuyển sang LaTeX; bản scan/ảnh được AI nhận dạng.
                  </p>

                  {/* File type badges */}
                  <div className="flex flex-wrap items-center justify-center gap-2.5 mt-6">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-indigo-700 shadow-2xs">
                      <FileText className="w-3.5 h-3.5 text-indigo-600" />
                      Word (.docx) + MathType
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-blue-700 shadow-2xs">
                      <FileCode className="w-3.5 h-3.5 text-blue-600" />
                      LaTeX (.tex)
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-emerald-700 shadow-2xs">
                      <FileText className="w-3.5 h-3.5 text-emerald-600" />
                      Văn bản (.txt)
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-rose-700 shadow-2xs">
                      <FileCheck className="w-3.5 h-3.5 text-rose-600" />
                      PDF (.pdf)
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700">
                      Dán nội dung đề thi (sao chép từ Word, MathType hoặc văn bản):
                    </label>
                    <span className="text-[11px] text-slate-500">
                      Hỗ trợ công thức MathType ($...$, $$...$$, tags XML)
                    </span>
                  </div>
                  <textarea
                    rows={10}
                    value={pastedText}
                    onChange={e => setPastedText(e.target.value)}
                    placeholder={`Ví dụ mẫu:
Câu 1. Cho hàm số y = \\frac{x+1}{x-1}. Đạo hàm của hàm số là:
A. y' = -\\frac{2}{(x-1)^2}*
B. y' = \\frac{2}{(x-1)^2}
C. y' = \\frac{1}{(x-1)^2}
D. y' = -\\frac{1}{(x-1)^2}
Lời giải: Ta có đạo hàm y' = \\frac{-2}{(x-1)^2}.

câu 2: Khẳng định nào sau đây đúng?
a) Hàm số đồng biến trên (1; +\\infty).
b) Đồ thị có tiệm cận đứng x = 1. (Đúng)

Bài 3. Điền giá trị cực tiểu của hàm số:
Đáp án: 3`}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:outline-hidden leading-relaxed"
                  />
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-slate-500 font-mono">
                      {pastedText.length} ký tự
                    </span>
                    <button
                      type="button"
                      onClick={handlePastedTextSubmit}
                      disabled={!pastedText.trim()}
                      className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-all shadow-xs flex items-center gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Bóc Tách Câu Hỏi & Chuyển MathType</span>
                    </button>
                  </div>
                </div>
              )}

              {/* MathType & Splitter Information Banner */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/80 text-xs text-slate-600 space-y-2.5">
                <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <Sigma className="w-4 h-4 text-blue-600" />
                  <span>Quy trình xử lý chuẩn hóa công thức MathType & bóc tách câu hỏi:</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-1">
                    <span className="font-bold text-blue-700 block">1. Tải file lên / Dán đề</span>
                    <p className="text-slate-600 text-[11px] leading-relaxed">
                      Hệ thống tự động đọc cấu trúc văn bản từ Word .docx (OpenXML zip), LaTeX, TXT hoặc PDF.
                    </p>
                  </div>
                  <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-1">
                    <span className="font-bold text-indigo-700 block">2. Chuyển MathType sang LaTeX</span>
                    <p className="text-slate-600 text-[11px] leading-relaxed">
                      Phân tích các thẻ &lt;m:oMath&gt;, MathML và MathType MTEF, chuyển đổi sang mã chuẩn <code>$...$</code>.
                    </p>
                  </div>
                  <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-1">
                    <span className="font-bold text-emerald-700 block">3. Tách câu & Hiển thị KaTeX</span>
                    <p className="text-slate-600 text-[11px] leading-relaxed">
                      Tách chính xác theo <strong>Câu x., Câu x:, Bài x., Bài x:</strong> và hiển thị công thức toán học sắc nét.
                    </p>
                  </div>
                </div>
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
                <h3 className="text-base font-bold text-slate-900">Đang Xử Lý Đề Thi & Công Thức</h3>
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
                {selectedFile ? `${selectedFile.name} (${(selectedFile.size / 1024).toFixed(1)} KB)` : 'Nội dung dán trực tiếp'}
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
              {/* Summary Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-xs text-slate-500 font-medium">Tổng câu hỏi đã bóc tách</span>
                  <p className="text-xl font-bold text-slate-900 mt-0.5">{questions.length} câu</p>
                </div>

                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <span className="text-xs text-emerald-700 font-medium">Câu hỏi đạt chuẩn</span>
                  <p className="text-xl font-bold text-emerald-800 mt-0.5">{validTotal} câu</p>
                </div>

                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl">
                  <span className="text-xs text-amber-700 font-medium">Cần kiểm duyệt bổ sung</span>
                  <p className="text-xl font-bold text-amber-800 mt-0.5">{needsReviewTotal} câu</p>
                </div>
              </div>

              {/* AI re-extraction: luôn hiển thị để giáo viên dùng khi tách câu/công thức chưa đúng */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-purple-50/70 border border-purple-200 rounded-xl">
                <p className="text-xs text-purple-900">
                  Tách câu hoặc công thức chưa đúng (thường gặp với PDF)? Cho AI đọc lại toàn bộ đề — AI tự OCR bản scan, nhận dạng công thức và tìm đáp án.
                </p>
                <button
                  onClick={handleAiExtraction}
                  disabled={isAiProcessing}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold shadow-xs disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{isAiProcessing ? 'AI đang đọc đề (30-90 giây)...' : 'Bóc tách lại bằng AI'}</span>
                </button>
              </div>

              {/* Warnings List & MathType Notice */}
              {parseResult?.warnings && parseResult.warnings.length > 0 && (
                <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-blue-900">
                      <Sigma className="w-4 h-4 text-blue-600" />
                      <span>Thông tin bóc tách & chuyển đổi công thức:</span>
                    </div>

                  </div>
                  <ul className="list-disc list-inside text-xs text-blue-800 space-y-1 pl-1">
                    {parseResult.warnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Controls bar: Status Filters + Formula Display Toggle */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                {/* Status tabs */}
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

                {/* Right controls: KaTeX vs LaTeX code toggle & change file */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowRawLatex(!showRawLatex)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                      showRawLatex
                        ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                    title="Chuyển đổi giữa chế độ xem công thức toán học và xem mã nguồn LaTeX"
                  >
                    {showRawLatex ? <Code2 className="w-3.5 h-3.5 text-indigo-600" /> : <Eye className="w-3.5 h-3.5 text-slate-600" />}
                    <span>{showRawLatex ? 'Đang hiện mã LaTeX ($)' : 'Hiển thị công thức (KaTeX)'}</span>
                  </button>

                  <button
                    onClick={resetAll}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 rounded-lg"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Nhập lại</span>
                  </button>
                </div>
              </div>

              {/* Questions List with Formula Rendering */}
              <div className="space-y-3.5 max-h-[460px] overflow-y-auto pr-1">
                {filteredQuestions.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-xl text-slate-500 text-xs">
                    Không có câu hỏi nào khớp với bộ lọc hiện tại.
                  </div>
                ) : (
                  filteredQuestions.map((q) => (
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
                              ? 'Trắc nghiệm 1 đáp án (A, B, C, D)'
                              : q.type === 'true_false'
                              ? 'Đúng / Sai theo ý (a, b, c, d)'
                              : 'Điền đáp án ngắn'}
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

                      {/* Question Content */}
                      <div className="text-xs sm:text-sm text-slate-800 font-medium py-1">
                        {showRawLatex ? (
                          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs text-slate-700 whitespace-pre-wrap">
                            {q.content || '[Chưa có nội dung câu hỏi]'}
                          </div>
                        ) : (
                          <LatexRenderer content={q.content || '[Chưa có nội dung câu hỏi]'} />
                        )}
                        {q.images && q.images.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {q.images.map((src, imgIdx) => (
                              <figure key={imgIdx} className="text-center">
                                <img src={src} alt={`Hình ${imgIdx + 1}`} className="max-h-40 rounded border border-slate-200 bg-white" />
                                {q.images!.length > 1 && <figcaption className="text-[10px] text-slate-500">Hình {imgIdx + 1}</figcaption>}
                              </figure>
                            ))}
                          </div>
                        )}
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
                                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                                    isCorrect ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
                                  }`}
                                >
                                  {q.type === 'true_false' ? String.fromCharCode(97 + optIdx) : letter}
                                </span>
                                <div className="flex-1 truncate">
                                  {showRawLatex ? (
                                    <span className="font-mono text-[11px]">{opt}</span>
                                  ) : (
                                    <LatexRenderer content={opt} />
                                  )}
                                </div>
                                {isCorrect && (
                                  <span className="text-[10px] text-emerald-700 font-bold uppercase shrink-0">
                                    {q.type === 'true_false' ? 'Đúng' : 'Đáp án'}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Short Answer Preview */}
                      {q.type === 'short_answer' && q.correctAnswer && (
                        <div className="mt-2 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs flex items-center gap-2">
                          <span className="font-bold text-slate-700">Đáp án:</span>
                          <span className="font-semibold text-emerald-700">{String(q.correctAnswer)}</span>
                        </div>
                      )}

                      {/* Explanation Preview */}
                      {q.explanation && (
                        <div className="mt-2 p-2.5 bg-blue-50/50 border border-blue-100 rounded-lg text-xs text-slate-700">
                          <span className="font-bold text-blue-900 block mb-0.5">Lời giải:</span>
                          {showRawLatex ? (
                            <span className="font-mono text-[11px]">{q.explanation}</span>
                          ) : (
                            <LatexRenderer content={q.explanation} />
                          )}
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
