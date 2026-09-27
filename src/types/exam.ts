export type ExamStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED';

export interface Exam {
  id: string;
  title: string;
  description?: string;
  teacherId: string;
  teacherName: string;
  durationMinutes: number;
  totalQuestions: number;
  status: ExamStatus;
  accessCode?: string;
  createdAt: string;
  updatedAt: string;
}
