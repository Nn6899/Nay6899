export type TestStatus = 'DRAFT' | 'PUBLISHED' | 'ACTIVE' | 'CLOSED' | 'ARCHIVED';

export interface QuizTest {
  id: string;
  title: string;
  description: string;
  teacherId: string;
  teacherName?: string;
  duration: number; // in minutes
  status: TestStatus;
  startTime: string | null; // ISO String
  endTime: string | null; // ISO String
  publicCode: string; // Random hard-to-guess alphanumeric string
  allowStudentViewScore: boolean;
  allowStudentViewAnswers: boolean;
  allowStudentViewSolutions: boolean;
  randomizeQuestions: boolean;
  randomizeOptions: boolean;
  requireStudentId?: boolean;
  questionCount?: number;
  totalSubmissions?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTestInput {
  title: string;
  description?: string;
  duration: number;
  startTime?: string | null;
  endTime?: string | null;
  allowStudentViewScore?: boolean;
  allowStudentViewAnswers?: boolean;
  allowStudentViewSolutions?: boolean;
  randomizeQuestions?: boolean;
  randomizeOptions?: boolean;
  requireStudentId?: boolean;
}

export interface UpdateTestInput extends Partial<CreateTestInput> {
  status?: TestStatus;
}

export interface TestFilterOptions {
  searchQuery?: string;
  status?: TestStatus | 'ALL';
  sortBy?: 'createdAt_desc' | 'createdAt_asc' | 'title_asc' | 'duration_desc';
}
