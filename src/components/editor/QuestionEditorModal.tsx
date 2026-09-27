import React, { useState, useRef } from 'react';
import { Question, QuestionType } from '../../types/question';
import { validateSingleQuestionDetailed } from '../../services/examValidator';
import { LatexRenderer } from '../common/LatexRenderer';
import { LatexToolbar } from './LatexToolbar';
import {
  X,
  Check,
  AlertCircle,
  Plus,
  Trash2,
  HelpCircle,
  Image as ImageIcon,
  Link as LinkIcon,
  Upload,
  ExternalLink,
  Info,
} from 'lucide-react';

interface QuestionEditorModalProps {
  question: Question;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedQuestion: Question) => void;
}

export const QuestionEditorModal: React.FC<QuestionEditorModalProps> = ({
  question,
  isOpen,
  onClose,
  onSave,
}) => {
  const [questionNumber, setQuestionNumber] = useState<number>(question.questionNumber || 1);
  const [content, setContent] = useState<string>(question.content || '');
  const [type, setType] = useState<QuestionType>(question.type || 'multiple_choice');
  const [options, setOptions] = useState<string[]>(
    question.options && question.options.length > 0 ? [...question.options] : ['', '', '', '']
  );
  const [correctAnswer, setCorrectAnswer] = useState<string | boolean[] | string[]>(
    question.correctAnswer !== undefined ? question.correctAnswer : 'A'
  );
  const [acceptedAnswers, setAcceptedAnswers] = useState<string[]>(
    question.acceptedAnswers ? [...question.acceptedAnswers] : []
  );
  const [newAcceptedAnswer, setNewAcceptedAnswer] = useState<string>('');
  const [numericTolerance, setNumericTolerance] = useState<number | undefined>(question.numericTolerance);
  const [explanation, setExplanation] = useState<string>(question.explanation || '');
  const [points, setPoints] = useState<number>(question.points || 1);
  const [images, setImages] = useState<string[]>(question.images ? [...question.images] : []);
  const [newImageUrl, setNewImageUrl] = useState<string>('');
  const [solutionLinks, setSolutionLinks] = useState<string[]>(
    question.solutionLinks ? [...question.solutionLinks] : []
  );
  const [newSolutionLink, setNewSolutionLink] = useState<string>('');
  const [showLatexToolbar, setShowLatexToolbar] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'content' | 'options' | 'media' | 'explanation'>('content');

  const contentTextareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Real-time detailed validation
  const currentQuestionDraft: Question = {
    ...question,
    questionNumber,
    type,
    content,
    options,
    correctAnswer,
    acceptedAnswers: acceptedAnswers.filter(a => a.trim().length > 0),
    numericTolerance,
    explanation: explanation.trim() || undefined,
    images,
    solutionLinks,
    points,
  };

  const validationErrors = validateSingleQuestionDetailed(currentQuestionDraft);
  const isValid = validationErrors.filter(e => e.isFatal).length === 0;

  // LaTeX quick insert at cursor
  const handleInsertLatex = (snippet: string) => {
    const textarea = contentTextareaRef.current;
    if (!textarea) {
      setContent(prev => prev + snippet);
      return;
    }

    const startPos = textarea.selectionStart;
    const endPos = textarea.selectionEnd;
    const before = content.substring(0, startPos);
    const after = content.substring(endPos);

    const updated = before + snippet + after;
    setContent(updated);

    // Restore focus and cursor
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(startPos + snippet.length, startPos + snippet.length);
    }, 50);
  };

  const handleOptionChange = (idx: number, val: string) => {
    const updated = [...options];
    updated[idx] = val;
    setOptions(updated);
  };

  const handleAddOption = () => {
    const nextLetter = String.fromCharCode(65 + options.length);
    setOptions([...options, `Phương án ${nextLetter}`]);
    if (type === 'true_false') {
      const bools = (Array.isArray(correctAnswer) ? correctAnswer : []) as boolean[];
      setCorrectAnswer([...bools, false]);
    }
  };

  const handleRemoveOption = (idx: number) => {
    if (options.length <= 2) return;
    const updated = options.filter((_, i) => i !== idx);
    setOptions(updated);

    if (type === 'multiple_choice') {
      const removedLetter = String.fromCharCode(65 + idx);
      if (correctAnswer === removedLetter) {
        setCorrectAnswer('A');
      }
    } else if (type === 'true_false') {
      const bools = (Array.isArray(correctAnswer) ? correctAnswer : []) as boolean[];
      setCorrectAnswer(bools.filter((_, i) => i !== idx));
    }
  };

  // Image handling
  const handleAddImageUrl = () => {
    if (!newImageUrl.trim()) return;
    setImages([...images, newImageUrl.trim()]);
    setNewImageUrl('');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];

    // Check size limit (max 5MB for embedded base64 image)
    if (file.size > 5 * 1024 * 1024) {
      alert('Kích thước ảnh không được vượt quá 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImages(prev => [...prev, reader.result as string]);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRemoveImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  // Solution link handling
  const handleAddSolutionLink = () => {
    if (!newSolutionLink.trim()) return;
    setSolutionLinks([...solutionLinks, newSolutionLink.trim()]);
    setNewSolutionLink('');
  };

  const handleRemoveSolutionLink = (index: number) => {
    setSolutionLinks(solutionLinks.filter((_, i) => i !== index));
  };

  // Short answer accepted answers
  const handleAddAcceptedAnswer = () => {
    if (!newAcceptedAnswer.trim()) return;
    if (!acceptedAnswers.includes(newAcceptedAnswer.trim())) {
      setAcceptedAnswers([...acceptedAnswers, newAcceptedAnswer.trim()]);
    }
    setNewAcceptedAnswer('');
  };

  const handleRemoveAcceptedAnswer = (val: string) => {
    setAcceptedAnswers(acceptedAnswers.filter(a => a !== val));
  };

  const handleSave = () => {
    const finalQuestion: Question = {
      ...currentQuestionDraft,
      validationStatus: isValid ? 'VALID' : 'NEEDS_REVIEW',
      validationErrors: validationErrors.map(e => e.message),
    };
    onSave(finalQuestion);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-blue-600 text-white font-bold flex items-center justify-center text-sm shadow-xs">
              #{questionNumber}
            </span>
            <div>
              <h3 className="text-base font-bold text-slate-900">Trình Soạn Thảo & Chỉnh Sửa Câu Hỏi</h3>
              <p className="text-xs text-slate-500">
                Hỗ trợ công thức LaTeX, hình ảnh minh họa, lời giải chi tiết và kiểm tra hợp lệ tức thì
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs inside Editor */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-slate-100 bg-slate-50/60 shrink-0 text-xs font-semibold text-slate-600 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('content')}
            className={`pb-2.5 px-2 border-b-2 transition-all ${
              activeTab === 'content'
                ? 'border-blue-600 text-blue-600 font-bold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            1. Nội dung & LaTeX
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('options')}
            className={`pb-2.5 px-2 border-b-2 transition-all ${
              activeTab === 'options'
                ? 'border-blue-600 text-blue-600 font-bold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            2. Phương án & Đáp án đúng
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('media')}
            className={`pb-2.5 px-2 border-b-2 transition-all ${
              activeTab === 'media'
                ? 'border-blue-600 text-blue-600 font-bold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            3. Hình ảnh & Tài liệu ({images.length + solutionLinks.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('explanation')}
            className={`pb-2.5 px-2 border-b-2 transition-all ${
              activeTab === 'explanation'
                ? 'border-blue-600 text-blue-600 font-bold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            4. Lời giải chi tiết
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-sm flex-1">
          {/* Validation Notice Bar */}
          {!isValid ? (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1">
              <div className="flex items-center gap-2 text-amber-900 font-semibold text-xs">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Cần hoàn thiện các thông tin sau:</span>
              </div>
              <ul className="list-disc list-inside text-xs text-amber-800 space-y-0.5 pl-1">
                {validationErrors.map((err, idx) => (
                  <li key={idx}>{err.message}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-800 text-xs font-semibold">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Câu hỏi đạt chuẩn, sẵn sàng đưa vào kỳ thi.</span>
            </div>
          )}

          {/* Core Configuration: Number, Type, Points */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Thứ tự câu (#)</label>
              <input
                type="number"
                min="1"
                value={questionNumber}
                onChange={e => setQuestionNumber(parseInt(e.target.value, 10) || 1)}
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Loại câu hỏi</label>
              <select
                value={type}
                onChange={e => {
                  const newType = e.target.value as QuestionType;
                  setType(newType);
                  if (newType === 'true_false') {
                    setCorrectAnswer(new Array(options.length).fill(false));
                  } else if (newType === 'multiple_choice') {
                    setCorrectAnswer('A');
                  } else if (newType === 'short_answer') {
                    setCorrectAnswer('');
                  }
                }}
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              >
                <option value="multiple_choice">Trắc nghiệm 1 đáp án (A, B, C, D)</option>
                <option value="true_false">Đúng / Sai theo từng ý (a, b, c, d)</option>
                <option value="short_answer">Điền đáp án ngắn (Số / Chuỗi)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Điểm câu này</label>
              <input
                type="number"
                min="0.1"
                step="0.25"
                value={points}
                onChange={e => setPoints(parseFloat(e.target.value) || 1)}
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />
            </div>
          </div>

          {/* TAB 1: Content & LaTeX */}
          {activeTab === 'content' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <span>Nội dung câu hỏi</span>
                  <span className="text-[11px] font-normal text-slate-500">(Gõ công thức giữa $...$ hoặc $$...$$)</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowLatexToolbar(!showLatexToolbar)}
                  className="text-xs font-medium text-blue-600 hover:text-blue-800"
                >
                  {showLatexToolbar ? 'Ẩn thanh ký hiệu' : 'Hiện thanh ký hiệu LaTeX'}
                </button>
              </div>

              {/* LaTeX Toolbar */}
              {showLatexToolbar && <LatexToolbar onInsert={handleInsertLatex} />}

              {/* Textarea */}
              <div className="space-y-2">
                <textarea
                  ref={contentTextareaRef}
                  rows={4}
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="Nhập nội dung đề bài (ví dụ: Cho hàm số $y = x^2 + 2x + 1$, hãy xác định tọa độ đỉnh của parabol)..."
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-normal focus:ring-2 focus:ring-blue-500 focus:outline-hidden transition-all font-mono leading-relaxed"
                />

                {/* KaTeX Live Preview */}
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-sm text-slate-900 min-h-[50px]">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 mb-1.5">
                    <span>XEM TRƯỚC HIỂN THỊ (KATEX):</span>
                    {content.includes('$') && <span className="text-blue-600">Đang hiển thị công thức toán</span>}
                  </div>
                  {content.trim() ? (
                    <div className="leading-relaxed">
                      <LatexRenderer content={content} />
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400 italic">Nội dung xem trước sẽ hiển thị ở đây...</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Options & Correct Answer */}
          {activeTab === 'options' && (
            <div className="space-y-4">
              {/* Multiple Choice UI */}
              {type === 'multiple_choice' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-800">Danh Sách Phương Án Lựa Chọn</h4>
                      <p className="text-[11px] text-slate-500">
                        Nhấn vào nút tròn ○ để đánh dấu phương án là đáp án đúng
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddOption}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Thêm phương án ({String.fromCharCode(65 + options.length)})</span>
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    {options.map((opt, idx) => {
                      const letter = String.fromCharCode(65 + idx);
                      const isCorrect = correctAnswer === letter;

                      return (
                        <div
                          key={idx}
                          className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                            isCorrect
                              ? 'bg-emerald-50/70 border-emerald-300 shadow-xs'
                              : 'bg-white border-slate-200'
                          }`}
                        >
                          {/* Radio Button */}
                          <button
                            type="button"
                            onClick={() => setCorrectAnswer(letter)}
                            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all shrink-0 ${
                              isCorrect
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                            title="Chọn làm đáp án đúng"
                          >
                            {letter}
                          </button>

                          {/* Option Input */}
                          <div className="flex-1">
                            <input
                              type="text"
                              value={opt}
                              onChange={e => handleOptionChange(idx, e.target.value)}
                              placeholder={`Nội dung phương án ${letter} (hỗ trợ $...$)...`}
                              className="w-full px-2 py-1 text-xs bg-transparent border-b border-slate-200 focus:border-blue-500 focus:outline-hidden font-medium text-slate-800"
                            />
                          </div>

                          {/* KaTeX Preview if formula included */}
                          {opt.includes('$') && (
                            <div className="px-2.5 py-1 bg-slate-100 rounded-lg text-xs text-slate-800 max-w-[200px] overflow-hidden truncate">
                              <LatexRenderer content={opt} />
                            </div>
                          )}

                          {isCorrect && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              Đáp Án Đúng
                            </span>
                          )}

                          {/* Delete Option */}
                          {options.length > 2 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveOption(idx)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              title="Xóa phương án này"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* True/False UI */}
              {type === 'true_false' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-800">Khẳng Định Đúng / Sai (a, b, c, d)</h4>
                      <p className="text-[11px] text-slate-500">
                        Chọn trạng thái Đúng hoặc Sai tương ứng cho từng ý khẳng định
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddOption}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Thêm khẳng định</span>
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    {options.map((opt, idx) => {
                      const letter = String.fromCharCode(97 + idx); // a, b, c, d
                      const isTrue = Array.isArray(correctAnswer) ? !!correctAnswer[idx] : false;

                      return (
                        <div
                          key={idx}
                          className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-white"
                        >
                          <span className="w-6 font-bold text-xs text-slate-700">{letter})</span>
                          <div className="flex-1">
                            <input
                              type="text"
                              value={opt}
                              onChange={e => handleOptionChange(idx, e.target.value)}
                              placeholder={`Khẳng định ${letter}...`}
                              className="w-full text-xs px-2 py-1 bg-transparent border-b border-slate-200 focus:border-blue-500 focus:outline-hidden"
                            />
                          </div>

                          {opt.includes('$') && (
                            <div className="px-2 py-0.5 bg-slate-100 rounded text-xs max-w-[150px] truncate">
                              <LatexRenderer content={opt} />
                            </div>
                          )}

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                const cur = Array.isArray(correctAnswer)
                                  ? [...correctAnswer]
                                  : new Array(options.length).fill(false);
                                cur[idx] = true;
                                setCorrectAnswer(cur as boolean[]);
                              }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                isTrue
                                  ? 'bg-emerald-600 text-white shadow-xs'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}
                            >
                              Đúng
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const cur = Array.isArray(correctAnswer)
                                  ? [...correctAnswer]
                                  : new Array(options.length).fill(false);
                                cur[idx] = false;
                                setCorrectAnswer(cur as boolean[]);
                              }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                !isTrue
                                  ? 'bg-rose-600 text-white shadow-xs'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}
                            >
                              Sai
                            </button>
                          </div>

                          {options.length > 2 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveOption(idx)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Short Answer UI */}
              {type === 'short_answer' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Đáp án chính thức (Học sinh điền kết quả này)
                    </label>
                    <input
                      type="text"
                      value={String(correctAnswer || '')}
                      onChange={e => setCorrectAnswer(e.target.value)}
                      placeholder="Ví dụ: 3.14 hoặc 1/2 hoặc x = 2..."
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    />
                  </div>

                  {/* Accepted Answers Variants */}
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
                    <label className="block text-xs font-bold text-slate-700">
                      Các đáp án tương đương được chấp nhận (tùy chọn)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newAcceptedAnswer}
                        onChange={e => setNewAcceptedAnswer(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddAcceptedAnswer();
                          }
                        }}
                        placeholder="Thêm biến thể đáp án (vd: 3.1415, pi, 3,14)..."
                        className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                      />
                      <button
                        type="button"
                        onClick={handleAddAcceptedAnswer}
                        className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors"
                      >
                        Thêm
                      </button>
                    </div>

                    {acceptedAnswers.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {acceptedAnswers.map(ans => (
                          <span
                            key={ans}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-mono font-medium text-slate-700"
                          >
                            <span>{ans}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveAcceptedAnswer(ans)}
                              className="text-slate-400 hover:text-rose-600"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Numeric Tolerance */}
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs font-bold text-slate-700">Dung sai số học (Numeric tolerance)</label>
                      <Info className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Học sinh trả lời chênh lệch trong khoảng ± dung sai vẫn được tính là chính xác (ví dụ: đáp số 2.5 với dung sai 0.05).
                    </p>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={numericTolerance !== undefined ? numericTolerance : ''}
                      onChange={e => {
                        const val = e.target.value;
                        setNumericTolerance(val === '' ? undefined : parseFloat(val));
                      }}
                      placeholder="Để trống nếu yêu cầu chính xác 100%"
                      className="w-48 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Images & Solution Links */}
          {activeTab === 'media' && (
            <div className="space-y-5">
              {/* Images Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-blue-600" />
                    <span>Hình Ảnh Minh Họa Cho Đề Bài</span>
                  </h4>
                  <span className="text-[11px] text-slate-500">{images.length} hình ảnh</span>
                </div>

                {/* Add Image Controls */}
                <div className="flex flex-col sm:flex-row items-center gap-2">
                  <div className="flex-1 w-full flex items-center gap-2">
                    <input
                      type="text"
                      value={newImageUrl}
                      onChange={e => setNewImageUrl(e.target.value)}
                      placeholder="Dán link ảnh trực tuyến (URL http/https)..."
                      className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    />
                    <button
                      type="button"
                      onClick={handleAddImageUrl}
                      className="px-3 py-2 bg-slate-800 text-white rounded-xl text-xs font-semibold hover:bg-slate-900 transition-colors shrink-0"
                    >
                      Thêm Link
                    </button>
                  </div>

                  <span className="text-xs text-slate-400">hoặc</span>

                  <div>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      accept="image/*"
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-semibold transition-colors shrink-0"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Tải ảnh từ máy</span>
                    </button>
                  </div>
                </div>

                {/* Image Previews Grid */}
                {images.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                    {images.map((imgSrc, i) => (
                      <div
                        key={i}
                        className="relative group rounded-xl overflow-hidden border border-slate-200 bg-slate-50 aspect-video flex items-center justify-center"
                      >
                        <img
                          src={imgSrc}
                          alt={`Minh họa ${i + 1}`}
                          className="max-h-full max-w-full object-contain"
                          referrerPolicy="no-referrer"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(i)}
                          className="absolute top-2 right-2 p-1.5 bg-rose-600 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                          title="Xóa ảnh"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Solution Links Section */}
              <div className="space-y-3 pt-4 border-t border-slate-100">
                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <LinkIcon className="w-4 h-4 text-blue-600" />
                  <span>Liên Kết Video & Tài Liệu Lời Giải (Solution Links)</span>
                </h4>

                <div className="flex items-center gap-2">
                  <input
                    type="url"
                    value={newSolutionLink}
                    onChange={e => setNewSolutionLink(e.target.value)}
                    placeholder="https://youtube.com/watch?v=... hoặc link bài giảng"
                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={handleAddSolutionLink}
                    className="px-3.5 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 transition-colors shrink-0"
                  >
                    Thêm Link
                  </button>
                </div>

                {solutionLinks.length > 0 && (
                  <div className="space-y-2 pt-1">
                    {solutionLinks.map((link, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0 pr-2">
                          <ExternalLink className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <a
                            href={link}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-blue-600 hover:underline truncate"
                          >
                            {link}
                          </a>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveSolutionLink(i)}
                          className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: Explanation */}
          {activeTab === 'explanation' && (
            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <HelpCircle className="w-4 h-4 text-blue-600" />
                <span>Hướng dẫn giải chi tiết (Học sinh xem sau khi hoàn thành bài thi)</span>
              </label>
              <textarea
                rows={4}
                value={explanation}
                onChange={e => setExplanation(e.target.value)}
                placeholder="Nhập phương pháp giải, các bước biến đổi (hỗ trợ công thức LaTeX $...$)..."
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-normal focus:ring-2 focus:ring-blue-500 focus:outline-hidden font-mono leading-relaxed"
              />

              {explanation.trim() && (
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-800">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Xem trước lời giải:</span>
                  <LatexRenderer content={explanation} />
                </div>
              )}
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
            Đóng
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-xs flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>Lưu Câu Hỏi (#{questionNumber})</span>
          </button>
        </div>
      </div>
    </div>
  );
};
