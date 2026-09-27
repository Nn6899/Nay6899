import React from 'react';
import { AlertCircle, CheckCircle2, Bookmark, X, Send } from 'lucide-react';

interface SubmitConfirmModalProps {
  isOpen: boolean;
  totalQuestions: number;
  answeredCount: number;
  unansweredCount: number;
  reviewCount: number;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirmSubmit: () => void;
}

export const SubmitConfirmModal: React.FC<SubmitConfirmModalProps> = ({
  isOpen,
  totalQuestions,
  answeredCount,
  unansweredCount,
  reviewCount,
  isSubmitting,
  onClose,
  onConfirmSubmit,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div
        className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 space-y-5"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Xác Nhận Nộp Bài Thi</h3>
              <p className="text-xs text-slate-500">Vui lòng kiểm tra lại trước khi gửi kết quả</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Warning if questions unanswered */}
        {unansweredCount > 0 && (
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 text-amber-900">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <strong className="font-semibold block">Bạn vẫn còn câu hỏi chưa trả lời!</strong>
              <p className="text-amber-800 leading-relaxed">
                Còn <span className="font-bold underline">{unansweredCount} câu</span> chưa được chọn đáp án. Những câu này sẽ được tính 0 điểm nếu nộp ngay bây giờ.
              </p>
            </div>
          </div>
        )}

        {/* Breakdown Stats Grid */}
        <div className="grid grid-cols-3 gap-2.5 text-center">
          <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 mx-auto mb-1" />
            <span className="text-lg font-extrabold text-emerald-800">{answeredCount}</span>
            <span className="text-[11px] block font-medium text-emerald-700">Đã làm</span>
          </div>

          <div
            className={`p-3 rounded-xl border ${
              unansweredCount > 0
                ? 'bg-rose-50 border-rose-200 text-rose-800'
                : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            <AlertCircle
              className={`w-4 h-4 mx-auto mb-1 ${
                unansweredCount > 0 ? 'text-rose-600' : 'text-slate-400'
              }`}
            />
            <span
              className={`text-lg font-extrabold ${
                unansweredCount > 0 ? 'text-rose-700' : 'text-slate-800'
              }`}
            >
              {unansweredCount}
            </span>
            <span className="text-[11px] block font-medium">Chưa làm</span>
          </div>

          <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl">
            <Bookmark className="w-4 h-4 text-amber-600 mx-auto mb-1" />
            <span className="text-lg font-extrabold text-amber-800">{reviewCount}</span>
            <span className="text-[11px] block font-medium text-amber-700">Đánh dấu</span>
          </div>
        </div>

        <p className="text-xs text-slate-500 text-center">
          Tổng số câu hỏi: <strong className="text-slate-800">{totalQuestions} câu</strong>. Sau khi nộp, bạn sẽ không thể thay đổi đáp án.
        </p>

        {/* Buttons */}
        <div className="flex items-center gap-2.5 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors disabled:opacity-50"
          >
            Làm Tiếp
          </button>
          <button
            type="button"
            onClick={onConfirmSubmit}
            disabled={isSubmitting}
            className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-all shadow-xs disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {isSubmitting ? (
              <span>Đang Nộp Bài...</span>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>Nộp Bài Ngay</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
