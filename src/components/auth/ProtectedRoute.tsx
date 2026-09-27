import React from 'react';
import { useAuth } from '../../hooks/useAuth';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { LoginForm } from './LoginForm';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, initialized, loading } = useAuth();

  if (!initialized || loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <LoadingSpinner message="Đang kiểm tra phiên đăng nhập và phân quyền..." />
      </div>
    );
  }

  if (!user || user.role !== 'TEACHER') {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center p-4">
        <LoginForm />
      </div>
    );
  }

  return <>{children}</>;
};
