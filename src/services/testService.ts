import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { handleFirestoreError, OperationType } from '../firebase/errors';
import type { QuizTest, CreateTestInput, UpdateTestInput, TestFilterOptions, TestStatus } from '../types/test';
import { generatePublicCode } from '../utils/generateCode';

const TESTS_COLLECTION = 'tests';
const LOCAL_TESTS_KEY = 'eduquiz_local_tests';

function getLocalTests(): QuizTest[] {
  try {
    const raw = localStorage.getItem(LOCAL_TESTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalTests(tests: QuizTest[]): void {
  try {
    localStorage.setItem(LOCAL_TESTS_KEY, JSON.stringify(tests));
  } catch (e) {
    console.error('Failed to save local tests:', e);
  }
}

/**
 * Validates input for creating or updating a test
 */
export function validateTestInput(input: Partial<CreateTestInput>): { isValid: boolean; error?: string } {
  if (input.title !== undefined) {
    const cleanTitle = input.title.trim();
    if (!cleanTitle) {
      return { isValid: false, error: 'Tên kỳ thi không được để trống.' };
    }
    if (cleanTitle.length < 3) {
      return { isValid: false, error: 'Tên kỳ thi phải có ít nhất 3 ký tự.' };
    }
    if (cleanTitle.length > 250) {
      return { isValid: false, error: 'Tên kỳ thi không được vượt quá 250 ký tự.' };
    }
  }

  if (input.duration !== undefined) {
    if (typeof input.duration !== 'number' || isNaN(input.duration) || input.duration <= 0) {
      return { isValid: false, error: 'Thời gian làm bài phải là số nguyên dương lớn hơn 0 phút.' };
    }
    if (input.duration > 1440) {
      return { isValid: false, error: 'Thời gian làm bài không thể vượt quá 1440 phút (24 giờ).' };
    }
  }

  if (input.startTime && input.endTime) {
    const start = new Date(input.startTime).getTime();
    const end = new Date(input.endTime).getTime();
    if (!isNaN(start) && !isNaN(end) && end <= start) {
      return { isValid: false, error: 'Thời gian kết thúc phải diễn ra sau thời gian bắt đầu.' };
    }
  }

  return { isValid: true };
}

/**
 * Generates a unique public code for tests
 */
async function generateUniquePublicCode(): Promise<string> {
  let attempts = 0;
  while (attempts < 10) {
    const code = generatePublicCode(8);
    if (!db) {
      const local = getLocalTests();
      if (!local.some((t) => t.publicCode === code)) {
        return code;
      }
    } else {
      const q = query(collection(db, TESTS_COLLECTION), where('publicCode', '==', code));
      const snap = await getDocs(q);
      if (snap.empty) {
        return code;
      }
    }
    attempts++;
  }
  return generatePublicCode(10);
}

/**
 * Creates a new quiz test
 */
export async function createTest(
  teacherId: string,
  input: CreateTestInput,
  teacherName?: string
): Promise<QuizTest> {
  if (!teacherId) {
    throw new Error('Định danh giáo viên (teacherId) là bắt buộc.');
  }

  const validation = validateTestInput(input);
  if (!validation.isValid) {
    throw new Error(validation.error);
  }

  const now = new Date().toISOString();
  const testId = `test_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const publicCode = await generateUniquePublicCode();

  const newTest: QuizTest = {
    id: testId,
    title: input.title.trim(),
    description: (input.description || '').trim(),
    teacherId,
    teacherName: teacherName || 'Giáo viên',
    duration: Math.round(input.duration),
    status: 'DRAFT',
    startTime: input.startTime || null,
    endTime: input.endTime || null,
    publicCode,
    allowStudentViewScore: input.allowStudentViewScore ?? true,
    allowStudentViewAnswers: input.allowStudentViewAnswers ?? false,
    allowStudentViewSolutions: input.allowStudentViewSolutions ?? false,
    randomizeQuestions: input.randomizeQuestions ?? false,
    randomizeOptions: input.randomizeOptions ?? false,
    questionCount: 0,
    totalSubmissions: 0,
    createdAt: now,
    updatedAt: now,
  };

  if (!db) {
    const local = getLocalTests();
    local.unshift(newTest);
    saveLocalTests(local);
    return newTest;
  }

  try {
    const docRef = doc(db, TESTS_COLLECTION, testId);
    await setDoc(docRef, newTest);
    return newTest;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${TESTS_COLLECTION}/${testId}`);
  }
}

/**
 * Retrieves tests owned by a specific teacher with filtering and sorting
 */
export async function getTeacherTests(
  teacherId: string,
  options: TestFilterOptions = {}
): Promise<QuizTest[]> {
  if (!teacherId) return [];

  let tests: QuizTest[] = [];

  if (!db) {
    tests = getLocalTests().filter((t) => t.teacherId === teacherId);
  } else {
    try {
      const q = query(collection(db, TESTS_COLLECTION), where('teacherId', '==', teacherId));
      const snap = await getDocs(q);
      snap.forEach((d) => {
        tests.push(d.data() as QuizTest);
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, TESTS_COLLECTION);
    }
  }

  // Filter by status
  if (options.status && options.status !== 'ALL') {
    tests = tests.filter((t) => t.status === options.status);
  }

  // Filter by search query
  if (options.searchQuery && options.searchQuery.trim()) {
    const qLower = options.searchQuery.trim().toLowerCase();
    tests = tests.filter(
      (t) =>
        t.title.toLowerCase().includes(qLower) ||
        t.publicCode.toLowerCase().includes(qLower) ||
        t.description.toLowerCase().includes(qLower)
    );
  }

  // Sort
  const sortBy = options.sortBy || 'createdAt_desc';
  tests.sort((a, b) => {
    switch (sortBy) {
      case 'createdAt_asc':
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case 'title_asc':
        return a.title.localeCompare(b.title, 'vi');
      case 'duration_desc':
        return b.duration - a.duration;
      case 'createdAt_desc':
      default:
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
  });

  return tests;
}

/**
 * Gets a single test by ID with ownership verification
 */
export async function getTestById(testId: string, requestingTeacherId?: string): Promise<QuizTest | null> {
  if (!testId) return null;

  let test: QuizTest | null = null;

  if (!db) {
    const local = getLocalTests();
    test = local.find((t) => t.id === testId) || null;
  } else {
    try {
      const docRef = doc(db, TESTS_COLLECTION, testId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        test = snap.data() as QuizTest;
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `${TESTS_COLLECTION}/${testId}`);
    }
  }

  if (!test) return null;

  // Permission check: If requesting as teacher, must be owner unless published
  if (requestingTeacherId && test.teacherId !== requestingTeacherId) {
    throw new Error('Bạn không có quyền truy cập vào kỳ thi này.');
  }

  return test;
}

/**
 * Retrieves a published or active test by public code (for student access)
 */
export async function getTestByPublicCode(publicCode: string): Promise<QuizTest | null> {
  if (!publicCode) return null;
  const cleanCode = publicCode.trim().toUpperCase();

  if (!db) {
    const local = getLocalTests();
    const found = local.find((t) => t.publicCode.toUpperCase() === cleanCode);
    if (!found) return null;
    if (found.status !== 'PUBLISHED' && found.status !== 'ACTIVE') {
      return null;
    }
    return found;
  }

  try {
    const q = query(
      collection(db, TESTS_COLLECTION),
      where('publicCode', '==', cleanCode)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const test = snap.docs[0].data() as QuizTest;
    if (test.status !== 'PUBLISHED' && test.status !== 'ACTIVE') {
      return null;
    }
    return test;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${TESTS_COLLECTION}?publicCode=${cleanCode}`);
  }
}

/**
 * Updates test metadata (teacher must own the test)
 */
export async function updateTest(
  testId: string,
  teacherId: string,
  input: UpdateTestInput
): Promise<QuizTest> {
  const current = await getTestById(testId, teacherId);
  if (!current) {
    throw new Error('Không tìm thấy kỳ thi hoặc bạn không có quyền sở hữu.');
  }

  const validation = validateTestInput(input);
  if (!validation.isValid) {
    throw new Error(validation.error);
  }

  const now = new Date().toISOString();
  const updated: QuizTest = {
    ...current,
    title: input.title !== undefined ? input.title.trim() : current.title,
    description: input.description !== undefined ? input.description.trim() : current.description,
    duration: input.duration !== undefined ? Math.round(input.duration) : current.duration,
    startTime: input.startTime !== undefined ? input.startTime : current.startTime,
    endTime: input.endTime !== undefined ? input.endTime : current.endTime,
    allowStudentViewScore: input.allowStudentViewScore ?? current.allowStudentViewScore,
    allowStudentViewAnswers: input.allowStudentViewAnswers ?? current.allowStudentViewAnswers,
    allowStudentViewSolutions: input.allowStudentViewSolutions ?? current.allowStudentViewSolutions,
    randomizeQuestions: input.randomizeQuestions ?? current.randomizeQuestions,
    randomizeOptions: input.randomizeOptions ?? current.randomizeOptions,
    status: input.status ?? current.status,
    updatedAt: now,
  };

  if (!db) {
    const local = getLocalTests();
    const idx = local.findIndex((t) => t.id === testId);
    if (idx !== -1) {
      local[idx] = updated;
      saveLocalTests(local);
    }
    return updated;
  }

  try {
    const docRef = doc(db, TESTS_COLLECTION, testId);
    await updateDoc(docRef, {
      title: updated.title,
      description: updated.description,
      duration: updated.duration,
      startTime: updated.startTime,
      endTime: updated.endTime,
      allowStudentViewScore: updated.allowStudentViewScore,
      allowStudentViewAnswers: updated.allowStudentViewAnswers,
      allowStudentViewSolutions: updated.allowStudentViewSolutions,
      randomizeQuestions: updated.randomizeQuestions,
      randomizeOptions: updated.randomizeOptions,
      status: updated.status,
      updatedAt: updated.updatedAt,
    });
    return updated;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${TESTS_COLLECTION}/${testId}`);
  }
}

/**
 * Updates status of a test (DRAFT, PUBLISHED, ACTIVE, CLOSED, ARCHIVED)
 */
export async function updateTestStatus(
  testId: string,
  teacherId: string,
  status: TestStatus
): Promise<QuizTest> {
  return await updateTest(testId, teacherId, { status });
}

/**
 * Deletes a test (teacher must own the test)
 */
export async function deleteTest(testId: string, teacherId: string): Promise<void> {
  const current = await getTestById(testId, teacherId);
  if (!current) {
    throw new Error('Không tìm thấy kỳ thi hoặc bạn không có quyền xóa.');
  }

  if (!db) {
    const local = getLocalTests().filter((t) => t.id !== testId);
    saveLocalTests(local);
    return;
  }

  try {
    const docRef = doc(db, TESTS_COLLECTION, testId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${TESTS_COLLECTION}/${testId}`);
  }
}
