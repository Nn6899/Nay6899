import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { handleFirestoreError, OperationType } from '../firebase/errors';
import type { AppUser } from '../types/user';

const USERS_COLLECTION = 'users';

export async function getUserProfile(userId: string): Promise<AppUser | null> {
  if (!db) {
    // Local fallback if Firebase not configured
    const local = localStorage.getItem(`user_${userId}`);
    if (local) {
      try {
        return JSON.parse(local) as AppUser;
      } catch {
        return null;
      }
    }
    return null;
  }

  const userDocRef = doc(db, USERS_COLLECTION, userId);
  try {
    const snap = await getDoc(userDocRef);
    if (!snap.exists()) {
      return null;
    }
    return snap.data() as AppUser;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${USERS_COLLECTION}/${userId}`);
  }
}

export async function createUserProfile(user: AppUser): Promise<void> {
  if (!db) {
    localStorage.setItem(`user_${user.id}`, JSON.stringify(user));
    return;
  }

  const userDocRef = doc(db, USERS_COLLECTION, user.id);
  try {
    await setDoc(userDocRef, {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      photoURL: user.photoURL || null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${USERS_COLLECTION}/${user.id}`);
  }
}

export async function updateUserProfile(userId: string, data: Partial<AppUser>): Promise<void> {
  if (!db) {
    const local = localStorage.getItem(`user_${userId}`);
    if (local) {
      const existing = JSON.parse(local);
      localStorage.setItem(`user_${userId}`, JSON.stringify({ ...existing, ...data, updatedAt: new Date().toISOString() }));
    }
    return;
  }

  const userDocRef = doc(db, USERS_COLLECTION, userId);
  try {
    await updateDoc(userDocRef, {
      ...data,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${USERS_COLLECTION}/${userId}`);
  }
}
