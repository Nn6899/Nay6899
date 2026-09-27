import React, { useState, useEffect } from 'react';
import { AuthProvider } from './hooks/useAuth';
import { Navbar } from './components/common/Navbar';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { TeacherDashboard } from './components/dashboard/TeacherDashboard';
import { StudentTestLobby } from './components/student/StudentTestLobby';

export default function App() {
  const [currentPath, setCurrentPath] = useState<string>(() => window.location.pathname);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (path: string) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
  };

  // Check if current route is student test route: /test/:publicCode
  const testRouteMatch = currentPath.match(/^\/test\/([a-zA-Z0-9_-]+)$/);
  const studentPublicCode = testRouteMatch ? testRouteMatch[1] : null;

  const [isTakingExam, setIsTakingExam] = useState(false);

  return (
    <AuthProvider>
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
        {!isTakingExam && <Navbar onNavigateHome={() => navigateTo('/')} />}
        <main className="flex-1">
          {studentPublicCode ? (
            <StudentTestLobby
              publicCode={studentPublicCode}
              onBackToHome={() => navigateTo('/')}
              onExamStateChange={setIsTakingExam}
            />
          ) : (
            <ProtectedRoute>
              <TeacherDashboard />
            </ProtectedRoute>
          )}
        </main>
        {!isTakingExam && (
          <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-400">
            <p>
              © {new Date().getFullYear()} EduQuiz Pro - Nền Tảng Thi Trắc Nghiệm Trực Tuyến Hỗ Trợ
              LaTeX & Firebase
            </p>
          </footer>
        )}
      </div>
    </AuthProvider>
  );

}
