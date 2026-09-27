import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import type { AppUser, LoginCredentials, RegisterCredentials } from '../types';
import {
  loginTeacher,
  registerTeacher,
  logoutTeacher,
  subscribeAuthState,
  getAuthErrorMessage,
} from '../services/authService';

interface AuthContextType {
  user: AppUser | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  initialized: boolean;
  error: string | null;
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (credentials: RegisterCredentials) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [initialized, setInitialized] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeAuthState((currentUser, currentFbUser) => {
      setUser(currentUser);
      setFirebaseUser(currentFbUser);
      setInitialized(true);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const login = async (credentials: LoginCredentials) => {
    setLoading(true);
    setError(null);
    try {
      const loggedUser = await loginTeacher(credentials);
      setUser(loggedUser);
    } catch (err: unknown) {
      const errCode = err instanceof Error ? err.message : 'auth/unknown';
      const friendlyMsg = getAuthErrorMessage(errCode);
      setError(friendlyMsg);
      throw new Error(friendlyMsg);
    } finally {
      setLoading(false);
    }
  };

  const register = async (credentials: RegisterCredentials) => {
    setLoading(true);
    setError(null);
    try {
      const newUser = await registerTeacher(credentials);
      setUser(newUser);
    } catch (err: unknown) {
      const errCode = err instanceof Error ? err.message : 'auth/unknown';
      const friendlyMsg = getAuthErrorMessage(errCode);
      setError(friendlyMsg);
      throw new Error(friendlyMsg);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await logoutTeacher();
      setUser(null);
      setFirebaseUser(null);
    } catch (err: unknown) {
      console.error('Logout error:', err);
    } finally {
      setLoading(false);
    }
  };

  const clearError = () => setError(null);

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        loading,
        initialized,
        error,
        login,
        register,
        logout,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
