import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from 'firebase/auth';
import { auth, isFirebaseConfigured } from '../firebase/config';
import { getUserProfile, createUserProfile } from './userService';
import type { AppUser, LoginCredentials, RegisterCredentials } from '../types';

const LOCAL_SESSION_KEY = 'quiz_auth_session';

export function getAuthErrorMessage(errorCode: string): string {
  switch (errorCode) {
    case 'auth/invalid-email':
      return 'Địa chỉ email không đúng định dạng.';
    case 'auth/user-disabled':
      return 'Tài khoản giáo viên đã bị vô hiệu hóa.';
    case 'auth/user-not-found':
      return 'Không tìm thấy tài khoản với email này.';
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Email hoặc mật khẩu không chính xác.';
    case 'auth/email-already-in-use':
      return 'Email này đã được đăng ký cho tài khoản khác.';
    case 'auth/weak-password':
      return 'Mật khẩu phải có ít nhất 6 ký tự.';
    case 'auth/too-many-requests':
      return 'Đã thử đăng nhập sai quá nhiều lần. Vui lòng thử lại sau.';
    case 'auth/network-request-failed':
      return 'Lỗi kết nối mạng, vui lòng kiểm tra kết nối internet.';
    case 'auth/not-teacher':
      return 'Tài khoản này không có quyền truy cập dành cho Giáo viên.';
    default:
      return 'Đã xảy ra lỗi đăng nhập. Vui lòng thử lại.';
  }
}

export async function loginTeacher({ email, password }: LoginCredentials): Promise<AppUser> {
  if (!isFirebaseConfigured || !auth) {
    // Development local authentication mode
    const stored = localStorage.getItem(`account_${email}`);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.password !== password) {
        throw new Error('auth/wrong-password');
      }
      if (parsed.role !== 'TEACHER') {
        throw new Error('auth/not-teacher');
      }
      const user: AppUser = {
        id: parsed.id,
        email: parsed.email,
        displayName: parsed.displayName,
        role: 'TEACHER',
        photoURL: parsed.photoURL || null,
        createdAt: parsed.createdAt,
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(user));
      return user;
    }

    // Default mock teacher for development preview when .env is not yet configured
    if (email === 'giaovien@demo.edu.vn' && password === '123456') {
      const demoTeacher: AppUser = {
        id: 'teacher-demo-01',
        email: 'giaovien@demo.edu.vn',
        displayName: 'Thầy Nguyễn Văn An (Demo)',
        role: 'TEACHER',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(demoTeacher));
      return demoTeacher;
    }

    throw new Error('auth/user-not-found');
  }

  // Real Firebase Auth
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  const fbUser = userCredential.user;

  // Retrieve user role from Firestore
  let profile = await getUserProfile(fbUser.uid);
  if (!profile) {
    // Create teacher profile if missing
    profile = {
      id: fbUser.uid,
      email: fbUser.email || email,
      displayName: fbUser.displayName || email.split('@')[0],
      role: 'TEACHER',
      photoURL: fbUser.photoURL,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await createUserProfile(profile);
  }

  if (profile.role !== 'TEACHER') {
    await signOut(auth);
    throw new Error('auth/not-teacher');
  }

  return profile;
}

export async function registerTeacher({
  email,
  password,
  displayName,
  role = 'TEACHER',
}: RegisterCredentials): Promise<AppUser> {
  if (!isFirebaseConfigured || !auth) {
    const existing = localStorage.getItem(`account_${email}`);
    if (existing) {
      throw new Error('auth/email-already-in-use');
    }
    const newId = `teacher_${Date.now()}`;
    const newUser: AppUser = {
      id: newId,
      email,
      displayName: displayName.trim() || email.split('@')[0],
      role,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(`account_${email}`, JSON.stringify({ ...newUser, password }));
    localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(newUser));
    return newUser;
  }

  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const fbUser = userCredential.user;

  const newProfile: AppUser = {
    id: fbUser.uid,
    email: fbUser.email || email,
    displayName: displayName.trim() || fbUser.displayName || email.split('@')[0],
    role,
    photoURL: fbUser.photoURL,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await createUserProfile(newProfile);
  return newProfile;
}

export async function logoutTeacher(): Promise<void> {
  localStorage.removeItem(LOCAL_SESSION_KEY);
  if (auth) {
    await signOut(auth);
  }
}

export function subscribeAuthState(callback: (user: AppUser | null, fbUser: FirebaseUser | null) => void): () => void {
  if (!isFirebaseConfigured || !auth) {
    const raw = localStorage.getItem(LOCAL_SESSION_KEY);
    if (raw) {
      try {
        const user = JSON.parse(raw) as AppUser;
        callback(user, null);
      } catch {
        callback(null, null);
      }
    } else {
      callback(null, null);
    }
    // Return unsubscribe no-op
    return () => {};
  }

  return onAuthStateChanged(auth, async (fbUser) => {
    if (fbUser) {
      try {
        const profile = await getUserProfile(fbUser.uid);
        if (profile && profile.role === 'TEACHER') {
          callback(profile, fbUser);
        } else {
          callback(null, null);
        }
      } catch (err) {
        console.error('Error fetching teacher profile on auth change:', err);
        callback(null, null);
      }
    } else {
      callback(null, null);
    }
  });
}
