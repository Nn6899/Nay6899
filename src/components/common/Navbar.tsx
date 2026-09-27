import React from 'react';
import { LogOut, GraduationCap, UserCircle2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

interface NavbarProps {
  onNavigateHome?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onNavigateHome }) => {
  const { user, logout, loading } = useAuth();
  const [showCodeInput, setShowCodeInput] = React.useState(false);
  const [inputCode, setInputCode] = React.useState('');

  const handleEnterExam = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputCode.trim()) return;
    window.history.pushState({}, '', `/test/${inputCode.trim().toUpperCase()}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
    setShowCodeInput(false);
    setInputCode('');
  };

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
        <button
          onClick={onNavigateHome}
          className="flex items-center gap-3 text-left focus:outline-none group cursor-pointer"
        >
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/20 group-hover:bg-blue-700 transition-colors">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <span className="font-bold text-lg text-slate-900 tracking-tight group-hover:text-blue-600 transition-colors">
              EduQuiz <span className="text-emerald-700 text-xs font-semibold uppercase ml-1 px-1.5 py-0.5 bg-emerald-50 rounded">Live Exam</span>
            </span>

            <p className="text-xs text-slate-500 hidden sm:block">Hệ thống thi trắc nghiệm trực tuyến</p>
          </div>
        </button>

        <div className="flex items-center gap-3">
          {/* Nút nhập mã thi cho học sinh */}
          {!showCodeInput ? (
            <button
              onClick={() => setShowCodeInput(true)}
              className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors hidden sm:inline-flex items-center gap-1.5"
            >
              <span>Vào thi bằng mã</span>
            </button>
          ) : (
            <form onSubmit={handleEnterExam} className="flex items-center gap-1.5 animate-in fade-in">
              <input
                type="text"
                placeholder="Mã phòng thi..."
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                autoFocus
                maxLength={12}
                className="px-2.5 py-1 text-xs uppercase font-mono font-bold bg-slate-50 border border-blue-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 w-28"
              />
              <button
                type="submit"
                className="px-2.5 py-1 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Vào
              </button>
              <button
                type="button"
                onClick={() => setShowCodeInput(false)}
                className="text-xs text-slate-400 hover:text-slate-600 px-1"
              >
                ✕
              </button>
            </form>
          )}

          {user && (
            <div className="flex items-center gap-3">
              <div className="hidden md:flex items-center gap-2.5 px-3 py-1.5 bg-slate-100 rounded-lg">
                <UserCircle2 className="w-5 h-5 text-slate-600" />
                <div className="text-left text-xs">
                  <p className="font-semibold text-slate-800 leading-tight">{user.displayName}</p>
                  <p className="text-blue-600 font-medium">Giáo viên</p>
                </div>
              </div>

              <button
                id="logout-button"
                type="button"
                onClick={() => logout()}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-50"
              >
                <LogOut className="w-4 h-4" />
                <span>Đăng xuất</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

