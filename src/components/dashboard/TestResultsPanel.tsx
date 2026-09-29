import React, { useCallback, useEffect, useState } from 'react';
import { Users, RefreshCw, Download } from 'lucide-react';
import type { QuizTest } from '../../types/test';
import type { TestAttempt } from '../../types/attempt';
import { attemptService } from '../../services/attemptService';
import { formatDate } from '../../utils/formatDate';

interface TestResultsPanelProps {
  test: QuizTest;
}

function scoreOn10(a: TestAttempt): number | null {
  if (a.score === undefined || a.score === null) return null;
  if (!a.maxScore) return a.score;
  return Math.round((a.score / a.maxScore) * 10 * 100) / 100;
}

function toCsv(test: QuizTest, rows: TestAttempt[]): string {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = ['STT', 'Họ và tên', 'Mã HS', 'Điểm (thang 10)', 'Số câu đúng', 'Tổng số câu', 'Trạng thái', 'Nộp lúc'];
  const lines = rows.map((a, i) => [
    i + 1,
    a.studentName,
    a.studentId || '',
    scoreOn10(a) ?? '',
    a.correctCount ?? '',
    a.totalQuestions ?? '',
    a.status === 'SUBMITTED' ? 'Đã nộp' : a.status === 'EXPIRED' ? 'Hết giờ' : 'Đang làm',
    a.submittedAt ? formatDate(a.submittedAt) : '',
  ].map(esc).join(','));
  // BOM để Excel đọc đúng tiếng Việt
  return '﻿' + [header.map(esc).join(','), ...lines].join('\r\n');
}

export const TestResultsPanel: React.FC<TestResultsPanelProps> = ({ test }) => {
  const [attempts, setAttempts] = useState<TestAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAttempts(await attemptService.listAttempts(test.id));
    } catch (e: any) {
      setError(e?.message || 'Không tải được danh sách bài nộp.');
    } finally {
      setLoading(false);
    }
  }, [test.id]);

  useEffect(() => {
    load();
  }, [load]);

  const submitted = attempts.filter(a => a.status === 'SUBMITTED');

  const handleExport = () => {
    const blob = new Blob([toCsv(test, attempts)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ket-qua-${test.publicCode}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <h3 className="text-base font-bold text-slate-900">Danh Sách Bài Nộp Thí Sinh</h3>
          <p className="text-xs text-slate-500">Điểm quy về thang 10. Bấm "Tải lại" để cập nhật bài mới nộp.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Đã nộp:</span>
          <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-800 text-xs font-bold">{submitted.length}</span>
          <button
            onClick={load}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Tải lại
          </button>
          <button
            onClick={handleExport}
            disabled={attempts.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            Xuất Excel (CSV)
          </button>
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}

      <div className="overflow-x-auto mt-4">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase bg-slate-50/70">
              <th className="py-3 px-4">STT</th>
              <th className="py-3 px-4">Họ Và Tên</th>
              <th className="py-3 px-4">Mã Học Sinh</th>
              <th className="py-3 px-4">Điểm</th>
              <th className="py-3 px-4">Số câu đúng</th>
              <th className="py-3 px-4">Trạng thái</th>
              <th className="py-3 px-4">Thời Gian Nộp</th>
            </tr>
          </thead>
          <tbody>
            {attempts.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400">
                  <Users className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm font-medium text-slate-600">{loading ? 'Đang tải...' : 'Chưa có lượt nộp bài nào'}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Học sinh vào đường link /test/{test.publicCode} để làm bài; kết quả sẽ hiện ở đây.
                  </p>
                </td>
              </tr>
            ) : (
              attempts.map((a, i) => {
                const s10 = scoreOn10(a);
                return (
                  <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                    <td className="py-2.5 px-4 text-slate-500">{i + 1}</td>
                    <td className="py-2.5 px-4 font-medium text-slate-900">{a.studentName}</td>
                    <td className="py-2.5 px-4 text-slate-600">{a.studentId || '—'}</td>
                    <td className="py-2.5 px-4 font-bold text-slate-900">{s10 === null ? '—' : s10}</td>
                    <td className="py-2.5 px-4 text-slate-600">
                      {a.correctCount ?? '—'}{a.totalQuestions ? ` / ${a.totalQuestions}` : ''}
                    </td>
                    <td className="py-2.5 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          a.status === 'SUBMITTED'
                            ? 'bg-emerald-50 text-emerald-700'
                            : a.status === 'EXPIRED'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-blue-50 text-blue-700'
                        }`}
                      >
                        {a.status === 'SUBMITTED' ? 'Đã nộp' : a.status === 'EXPIRED' ? 'Hết giờ' : 'Đang làm'}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-600">{a.submittedAt ? formatDate(a.submittedAt) : '—'}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
