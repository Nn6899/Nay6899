import React, { useState } from 'react';
import { Mail, Lock, LogIn, Sparkles, UserPlus, GraduationCap, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { Alert } from '../common/Alert';
import { RegisterModal } from './RegisterModal';
import { LatexRenderer } from '../common/LatexRenderer';

export const LoginForm: React.FC = () => {
  const { login, loading, error, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (!email.trim()) {
      setLocalError('Vui lòng nhập email giáo viên');
      return;
    }
    if (!password) {
      setLocalError('Vui lòng nhập mật khẩu');
      return;
    }

    try {
      await login({ email: email.trim(), password });
    } catch {
      // Error handled in AuthContext
    }
  };

  const handleFillDemo = () => {
    setEmail('giaovien@demo.edu.vn');
    setPassword('123456');
    setLocalError(null);
    clearError();
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/60 border border-slate-200/80 p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-500/25 mb-4">
            <GraduationCap className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Đăng Nhập Giáo Viên</h2>
          <p className="text-sm text-slate-500 mt-1">
            Cổng quản lý kỳ thi trắc nghiệm trực tuyến
          </p>
        </div>

        {(localError || error) && (
          <div className="mb-6">
            <Alert
              type="error"
              message={localError || error || ''}
              onClose={() => {
                setLocalError(null);
                clearError();
              }}
            />
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Email giáo viên
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="login-email-input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teacher@example.edu.vn"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-900 transition-all"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Mật khẩu
              </label>
              <span className="text-xs text-slate-400">Tối thiểu 6 ký tự</span>
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="login-password-input"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-900 transition-all"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              id="submit-login-button"
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm transition-all shadow-md shadow-blue-500/20 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              {loading ? 'Đang xác thực...' : 'Đăng nhập vào Hệ Thống'}
            </button>
          </div>
        </form>

        <div className="mt-6 pt-6 border-t border-slate-100 flex flex-col gap-3">
          <button
            id="fill-demo-credentials-button"
            type="button"
            onClick={handleFillDemo}
            className="w-full py-2.5 px-3 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4 text-amber-600" />
            <span>Nạp tài khoản Giáo viên mẫu (giaovien@demo.edu.vn / 123456)</span>
          </button>

          <button
            id="open-register-button"
            type="button"
            onClick={() => setIsRegisterOpen(true)}
            className="w-full py-2 px-3 text-slate-600 hover:text-blue-600 text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
          >
            <UserPlus className="w-4 h-4" />
            <span>Chưa có tài khoản? Đăng ký Giáo viên mới</span>
          </button>
        </div>

        {/* Feature badge */}
        <div className="mt-6 bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs text-slate-500 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-slate-700">Hỗ trợ công thức LaTeX chuẩn toán học:</p>
            <div className="mt-1 text-slate-600 font-mono">
              <LatexRenderer content="Ví dụ: $\Delta = b^2 - 4ac$ và $x = \frac{-b \pm \sqrt{\Delta}}{2a}$" />
            </div>
          </div>
        </div>
      </div>

      <RegisterModal
        isOpen={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
      />
    </div>
  );
};
