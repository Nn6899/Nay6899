import React from 'react';
import { ExamValidationResult, Question } from '../../types/question';
import { AlertCircle, AlertTriangle, CheckCircle2, Edit3, X } from 'lucide-react';

interface PublishValidationModalProps {
  isOpen: boolean;
  result: ExamValidationResult;
  onClose: () => void;
  onEditQuestion: (q: Question) => void;
  questions: Question[];
  onConfirmPublish: () => void;
}

export const PublishValidationModal: React.FC<PublishValidationModalProps> = ({
  isOpen,
  result,
  onClose,
  onEditQuestion,
  questions,
  onConfirmPublish,
}) => {
  if (!isOpen) return null;

  const fatalErrors = result.errors.filter(e => e.isFatal);
  const warnings = result.errors.filter(e => !e.isFatal);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                result.canPublish ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
              }`}
            >
              {result.canPublish ? <CheckCircle2 className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {result.canPublish ? 'Kiểm Tra Tiêu Chuẩn Công Bố' : 'Chưa Thể Công Bố Kỳ Thi'}
              </h3>
              <p className="text-xs text-slate-500">
                {result.canPublish
                  ? 'Tất cả câu hỏi đã đáp ứng đầy đủ quy chuẩn và sẵn sàng mở cho học sinh.'
                  : `Phát hiện ${fatalErrors.length} lỗi nghiêm trọng cần được khắc phục trước khi xuất bản.`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs flex-1">
          {/* Summary Stat */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-center">
              <span className="text-slate-400 block text-[11px]">Tổng số câu</span>
              <span className="text-sm font-bold text-slate-800">{result.totalQuestions}</span>
            </div>
            <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-center">
              <span className="text-emerald-700 block text-[11px]">Câu hợp lệ</span>
              <span className="text-sm font-bold text-emerald-800">{result.validQuestions}</span>
            </div>
            <div
              className={`p-3 rounded-xl border text-center ${
                fatalErrors.length > 0
                  ? 'bg-rose-50 border-rose-100 text-rose-800'
                  : 'bg-slate-50 border-slate-100 text-slate-500'
              }`}
            >
              <span className="block text-[11px]">Lỗi nghiêm trọng</span>
              <span className="text-sm font-bold">{fatalErrors.length}</span>
            </div>
          </div>

          {/* Fatal errors list */}
          {fatalErrors.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-bold text-rose-900 flex items-center gap-1.5 text-xs">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>Các lỗi vi phạm quy chế cần sửa:</span>
              </h4>
              <div className="space-y-2">
                {fatalErrors.map((err, idx) => {
                  const targetQuestion = questions.find(q => q.id === err.questionId);

                  return (
                    <div
                      key={idx}
                      className="p-3 bg-rose-50/70 border border-rose-200 rounded-xl flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2">
                        {err.questionNumber > 0 && (
                          <span className="px-2 py-0.5 rounded-md bg-rose-200 text-rose-900 font-bold text-[11px] shrink-0">
                            Câu {err.questionNumber}
                          </span>
                        )}
                        <span className="text-rose-900 font-medium">{err.message}</span>
                      </div>

                      {targetQuestion && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onEditQuestion(targetQuestion);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-rose-100 text-rose-700 font-semibold border border-rose-300 rounded-lg text-xs transition-colors shrink-0"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>Sửa ngay</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Warnings list */}
          {warnings.length > 0 && (
            <div className="space-y-2 pt-2">
              <h4 className="font-bold text-amber-900 flex items-center gap-1.5 text-xs">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Cảnh báo lưu ý (không chặn công bố):</span>
              </h4>
              <ul className="list-disc list-inside space-y-1 text-amber-800 pl-2">
                {warnings.map((w, idx) => (
                  <li key={idx}>{w.message}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between rounded-b-2xl shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white border border-slate-200 rounded-xl transition-all"
          >
            Đóng Lại
          </button>

          {result.canPublish ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                onConfirmPublish();
              }}
              className="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-all shadow-xs flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Tiến Hành Công Bố Kỳ Thi</span>
            </button>
          ) : (
            <div className="text-xs text-rose-600 font-semibold">
              Vui lòng sửa hết các lỗi nghiêm trọng để công bố.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
