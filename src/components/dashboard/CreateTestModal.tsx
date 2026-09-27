import React, { useState } from 'react';
import { X, Clock, Calendar, CheckSquare, Settings2, Sparkles, AlertCircle } from 'lucide-react';
import type { CreateTestInput, QuizTest } from '../../types/test';
import { validateTestInput } from '../../services/testService';

interface CreateTestModalProps {
  isOpen: boolean;
  initialData?: QuizTest | null;
  onClose: () => void;
  onSubmit: (input: CreateTestInput) => Promise<void>;
}

export const CreateTestModal: React.FC<CreateTestModalProps> = ({
  isOpen,
  initialData,
  onClose,
  onSubmit,
}) => {
  const isEditing = !!initialData;

  const [formData, setFormData] = useState<CreateTestInput>({
    title: initialData?.title || '',
    description: initialData?.description || '',
    duration: initialData?.duration || 45,
    startTime: initialData?.startTime ? initialData.startTime.substring(0, 16) : '',
    endTime: initialData?.endTime ? initialData.endTime.substring(0, 16) : '',
    allowStudentViewScore: initialData?.allowStudentViewScore ?? true,
    allowStudentViewAnswers: initialData?.allowStudentViewAnswers ?? false,
    allowStudentViewSolutions: initialData?.allowStudentViewSolutions ?? false,
    randomizeQuestions: initialData?.randomizeQuestions ?? false,
    randomizeOptions: initialData?.randomizeOptions ?? false,
  });

  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync state if initialData changes
  React.useEffect(() => {
    if (initialData) {
      setFormData({
        title: initialData.title,
        description: initialData.description,
        duration: initialData.duration,
        startTime: initialData.startTime ? initialData.startTime.substring(0, 16) : '',
        endTime: initialData.endTime ? initialData.endTime.substring(0, 16) : '',
        allowStudentViewScore: initialData.allowStudentViewScore,
        allowStudentViewAnswers: initialData.allowStudentViewAnswers,
        allowStudentViewSolutions: initialData.allowStudentViewSolutions,
        randomizeQuestions: initialData.randomizeQuestions,
        randomizeOptions: initialData.randomizeOptions,
      });
    } else {
      setFormData({
        title: '',
        description: '',
        duration: 45,
        startTime: '',
        endTime: '',
        allowStudentViewScore: true,
        allowStudentViewAnswers: false,
        allowStudentViewSolutions: false,
        randomizeQuestions: false,
        randomizeOptions: false,
      });
    }
    setFormError(null);
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleChange = (field: keyof CreateTestInput, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (formError) setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const validation = validateTestInput(formData);
    if (!validation.isValid) {
      setFormError(validation.error || 'Dữ liệu không hợp lệ.');
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit({
        ...formData,
        startTime: formData.startTime ? new Date(formData.startTime).toISOString() : null,
        endTime: formData.endTime ? new Date(formData.endTime).toISOString() : null,
      });
      onClose();
    } catch (err: any) {
      setFormError(err.message || 'Không thể lưu kỳ thi. Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50/80 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 text-blue-700 rounded-xl">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                {isEditing ? 'Chỉnh Sửa Kỳ Thi' : 'Tạo Kỳ Thi Mới'}
              </h3>
              <p className="text-xs text-slate-500">
                Điền thông tin và thiết lập quy chế phòng thi trực tuyến
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-slate-600 p-2 rounded-xl hover:bg-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {formError && (
            <div className="flex items-start gap-3 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {/* Section 1: Thông tin cơ bản */}
          <div className="space-y-4">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              1. Thông Tin Cơ Bản
            </h4>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Tên kỳ thi / Đề kiểm tra <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => handleChange('title', e.target.value)}
                placeholder="Ví dụ: Kiểm tra 1 tiết Toán 12 - Giải tích và Hình học Không gian"
                required
                className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Mô tả / Hướng dẫn làm bài
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => handleChange('description', e.target.value)}
                rows={2}
                placeholder="Ghi chú quy chế thi, số lượng câu hỏi, tài liệu được phép sử dụng..."
                className="w-full px-4 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-slate-500" />
                Thời gian làm bài (Phút) <span className="text-rose-500">*</span>
              </label>
              <div className="relative max-w-xs">
                <input
                  type="number"
                  min="1"
                  max="1440"
                  value={formData.duration}
                  onChange={(e) => handleChange('duration', parseInt(e.target.value, 10) || 0)}
                  required
                  className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <span className="absolute right-3.5 top-2.5 text-xs text-slate-400 font-medium">
                  phút
                </span>
              </div>
            </div>
          </div>

          {/* Section 2: Thời gian mở phòng thi */}
          <div className="space-y-4 pt-2 border-t border-slate-100">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              2. Khung Giờ Mở Thi (Tùy Chọn)
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Thời gian bắt đầu
                </label>
                <input
                  type="datetime-local"
                  value={formData.startTime || ''}
                  onChange={(e) => handleChange('startTime', e.target.value)}
                  className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Thời gian kết thúc
                </label>
                <input
                  type="datetime-local"
                  value={formData.endTime || ''}
                  onChange={(e) => handleChange('endTime', e.target.value)}
                  className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Quy chế & Cài đặt nâng cao */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Settings2 className="w-4 h-4" />
              3. Quy Chế Xem Điểm & Xáo Trộn
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <label className="flex items-center gap-3 p-3 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-200 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={formData.allowStudentViewScore}
                  onChange={(e) => handleChange('allowStudentViewScore', e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-slate-700">Cho xem điểm sau khi nộp</span>
              </label>

              <label className="flex items-center gap-3 p-3 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-200 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={formData.allowStudentViewAnswers}
                  onChange={(e) => handleChange('allowStudentViewAnswers', e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-slate-700">Cho xem đáp án đúng/sai</span>
              </label>

              <label className="flex items-center gap-3 p-3 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-200 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={formData.allowStudentViewSolutions}
                  onChange={(e) => handleChange('allowStudentViewSolutions', e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-slate-700">Cho xem lời giải chi tiết</span>
              </label>

              <label className="flex items-center gap-3 p-3 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-200 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={formData.randomizeQuestions}
                  onChange={(e) => handleChange('randomizeQuestions', e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-slate-700">Xáo trộn thứ tự câu hỏi</span>
              </label>

              <label className="flex items-center gap-3 p-3 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-200 cursor-pointer transition-colors sm:col-span-2">
                <input
                  type="checkbox"
                  checked={formData.randomizeOptions}
                  onChange={(e) => handleChange('randomizeOptions', e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-slate-700">
                  Xáo trộn các đáp án lựa chọn (A, B, C, D)
                </span>
              </label>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-5 py-2.5 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Đang lưu...</span>
                </>
              ) : isEditing ? (
                'Cập Nhật Kỳ Thi'
              ) : (
                'Tạo Kỳ Thi'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
