export type UserRole = 'TEACHER' | 'STUDENT';

export interface AppUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  photoURL?: string | null;
  createdAt: string;
  updatedAt: string;
}
