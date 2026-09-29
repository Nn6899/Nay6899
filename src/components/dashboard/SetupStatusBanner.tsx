import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, CircleDashed, ChevronDown } from 'lucide-react';
import { isFirebaseConfigured } from '../../firebase/config';

type AiState = 'checking' | 'on' | 'off';

/**
 * Báo cho giáo viên (không rành kỹ thuật) biết site đã sẵn sàng cho học sinh chưa,
 * và còn thiếu gì thì làm gì.
 */
export const SetupStatusBanner: React.FC = () => {
  const [ai, setAi] = useState<AiState>('checking');
  const [open, setOpen] = useState(!isFirebaseConfigured);

  useEffect(() => {
    let alive = true;
    fetch('/api/health')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(d => alive && setAi(d?.ai ? 'on' : 'off'))
      .catch(() => alive && setAi('off'));
    return () => {
      alive = false;
    };
  }, []);

  const allGood = isFirebaseConfigured && ai === 'on';
  if (allGood) return null;

  return (
    <div
      className={`rounded-2xl border p-5 ${
        isFirebaseConfigured ? 'bg-blue-50/60 border-blue-200' : 'bg-amber-50 border-amber-300'
      }`}
      role="status"
    >
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2.5">
          {isFirebaseConfigured ? (
            <CircleDashed className="w-5 h-5 text-blue-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          )}
          <span className="text-sm font-bold text-slate-900">
            {isFirebaseConfigured
              ? 'Site đã sẵn sàng cho học sinh. Còn một tính năng tuỳ chọn chưa bật.'
              : 'Học sinh chưa làm bài được trên máy của các em'}
          </span>
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-4 space-y-3 text-sm text-slate-700">
          <div className="flex gap-2.5">
            {isFirebaseConfigured ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            )}
            <div>
              <p className="font-semibold text-slate-900">Lưu đề và bài làm trên mạng (Firebase)</p>
              {isFirebaseConfigured ? (
                <p>Đã bật. Đề và điểm được lưu trên mạng, học sinh mở link ở máy nào cũng làm được.</p>
              ) : (
                <>
                  <p>
                    Chưa bật. Đề đang <b>chỉ lưu trong trình duyệt này</b>: học sinh mở link ở máy khác sẽ không thấy đề,
                    và điểm không về máy của thầy.
                  </p>
                  <p className="mt-1">
                    Cách bật: làm theo <b>mục 3 trong HUONG-DAN.md</b>. Trên Vercel chỉ cần thêm <b>1 biến</b> tên{' '}
                    <code className="px-1 py-0.5 rounded bg-white border border-amber-200 text-xs">VITE_FIREBASE_CONFIG</code>,
                    giá trị là nguyên khối <code className="px-1 py-0.5 rounded bg-white border border-amber-200 text-xs">firebaseConfig</code>{' '}
                    sao chép từ Firebase, rồi bấm Redeploy.
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="flex gap-2.5">
            {ai === 'on' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <CircleDashed className="w-5 h-5 text-slate-400 shrink-0" />
            )}
            <div>
              <p className="font-semibold text-slate-900">
                AI đọc PDF scan, ảnh chụp đề <span className="font-normal text-slate-500">(tuỳ chọn)</span>
              </p>
              {ai === 'on' ? (
                <p>Đã bật.</p>
              ) : ai === 'checking' ? (
                <p>Đang kiểm tra...</p>
              ) : (
                <p>
                  Chưa bật. Word, PDF có chữ, LaTeX và TXT vẫn nhập bình thường. Chỉ cần bật khi thầy muốn nhập PDF scan
                  hoặc ảnh chụp đề: thêm biến <code className="px-1 py-0.5 rounded bg-white border border-slate-200 text-xs">GEMINI_API_KEY</code>{' '}
                  trên Vercel (khoá miễn phí ở aistudio.google.com/apikey) rồi Redeploy.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
