import { describe, it, expect, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../src/hooks/useAuth';
import { ProtectedRoute } from '../src/components/auth/ProtectedRoute';
import { getAuthErrorMessage, loginTeacher, registerTeacher, logoutTeacher } from '../src/services/authService';
import type { AppUser } from '../src/types';

describe('Authentication & User Role System', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('1. should translate auth error codes to clear Vietnamese messages', () => {
    expect(getAuthErrorMessage('auth/wrong-password')).toBe('Email hoặc mật khẩu không chính xác.');
    expect(getAuthErrorMessage('auth/user-not-found')).toBe('Không tìm thấy tài khoản với email này.');
    expect(getAuthErrorMessage('auth/not-teacher')).toBe('Tài khoản này không có quyền truy cập dành cho Giáo viên.');
    expect(getAuthErrorMessage('auth/invalid-email')).toBe('Địa chỉ email không đúng định dạng.');
  });

  it('2. should authenticate teacher with demo credentials', async () => {
    const teacher = await loginTeacher({
      email: 'giaovien@demo.edu.vn',
      password: '123456',
    });

    expect(teacher).toBeDefined();
    expect(teacher.email).toBe('giaovien@demo.edu.vn');
    expect(teacher.role).toBe('TEACHER');
    expect(teacher.displayName).toContain('Thầy');
  });

  it('3. should throw error when non-existent user logs in', async () => {
    await expect(
      loginTeacher({
        email: 'unknown@school.edu.vn',
        password: 'wrongpassword',
      })
    ).rejects.toThrow('auth/user-not-found');
  });

  it('4. should register a new teacher and enforce TEACHER role', async () => {
    const newTeacher = await registerTeacher({
      email: 'thayminh@school.edu.vn',
      password: 'secretpassword123',
      displayName: 'Thầy Lê Văn Minh',
      role: 'TEACHER',
    });

    expect(newTeacher.email).toBe('thayminh@school.edu.vn');
    expect(newTeacher.role).toBe('TEACHER');
    expect(newTeacher.displayName).toBe('Thầy Lê Văn Minh');

    // Should be able to log in with new credentials
    const logged = await loginTeacher({
      email: 'thayminh@school.edu.vn',
      password: 'secretpassword123',
    });
    expect(logged.id).toBe(newTeacher.id);
  });

  it('5. should reject login if password is incorrect', async () => {
    await registerTeacher({
      email: 'teacher2@school.edu.vn',
      password: 'correct-password',
      displayName: 'Cô Mai',
      role: 'TEACHER',
    });

    await expect(
      loginTeacher({
        email: 'teacher2@school.edu.vn',
        password: 'wrong-password',
      })
    ).rejects.toThrow('auth/wrong-password');
  });

  it('6. should logout successfully and clear session', async () => {
    await loginTeacher({
      email: 'giaovien@demo.edu.vn',
      password: '123456',
    });

    expect(localStorage.getItem('quiz_auth_session')).not.toBeNull();

    await logoutTeacher();
    expect(localStorage.getItem('quiz_auth_session')).toBeNull();
  });

  it('7. should protect teacher routes: renders Login when unauthenticated', async () => {
    render(
      <AuthProvider>
        <ProtectedRoute>
          <div data-testid="protected-content">Nội dung quản trị kỳ thi</div>
        </ProtectedRoute>
      </AuthProvider>
    );

    // Initial check: Since not logged in, should show login form
    expect(screen.queryByTestId('protected-content')).toBeNull();
    expect(screen.getByText('Đăng Nhập Giáo Viên')).toBeInTheDocument();
  });

  it('8. should render protected content when user is logged in as TEACHER', async () => {
    const mockTeacher: AppUser = {
      id: 'teacher-101',
      email: 'teacher@test.edu.vn',
      displayName: 'Thầy Tuấn',
      role: 'TEACHER',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem('quiz_auth_session', JSON.stringify(mockTeacher));

    render(
      <AuthProvider>
        <ProtectedRoute>
          <div data-testid="protected-content">Nội dung quản trị kỳ thi</div>
        </ProtectedRoute>
      </AuthProvider>
    );

    // Should render protected content
    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    expect(screen.getByText('Nội dung quản trị kỳ thi')).toBeInTheDocument();
  });
});
