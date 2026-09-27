import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { handleFirestoreError, OperationType } from '../firebase/errors';
import { Question, TestImportMetadata } from '../types/question';
import { applyValidationToQuestion } from './import/questionValidator';

const LOCAL_QUESTIONS_KEY_PREFIX = 'eduquiz_local_questions_';
const LOCAL_IMPORTS_KEY_PREFIX = 'eduquiz_local_imports_';
const LOCAL_TESTS_KEY = 'eduquiz_local_tests';

function getLocalQuestions(testId: string): Question[] {
  try {
    const raw = localStorage.getItem(`${LOCAL_QUESTIONS_KEY_PREFIX}${testId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalQuestions(testId: string, questions: Question[]): void {
  try {
    localStorage.setItem(`${LOCAL_QUESTIONS_KEY_PREFIX}${testId}`, JSON.stringify(questions));
    // Also update test questionCount in local tests
    const rawTests = localStorage.getItem(LOCAL_TESTS_KEY);
    if (rawTests) {
      const tests = JSON.parse(rawTests);
      const idx = tests.findIndex((t: any) => t.id === testId);
      if (idx !== -1) {
        tests[idx].questionCount = questions.length;
        tests[idx].updatedAt = new Date().toISOString();
        localStorage.setItem(LOCAL_TESTS_KEY, JSON.stringify(tests));
      }
    }
  } catch (e) {
    console.error('Failed to save local questions:', e);
  }
}

function getLocalImports(testId: string): TestImportMetadata[] {
  try {
    const raw = localStorage.getItem(`${LOCAL_IMPORTS_KEY_PREFIX}${testId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalImports(testId: string, imports: TestImportMetadata[]): void {
  try {
    localStorage.setItem(`${LOCAL_IMPORTS_KEY_PREFIX}${testId}`, JSON.stringify(imports));
  } catch (e) {
    console.error('Failed to save local imports:', e);
  }
}

/**
 * Question Service handling questions and import metadata for tests
 */
export const questionService = {
  /**
   * Retrieves all questions for a specific test
   */
  async getQuestions(testId: string): Promise<Question[]> {
    if (!testId) throw new Error('Mã bài thi testId không được để trống.');

    try {
      if (db) {
        const questionsRef = collection(db, 'tests', testId, 'questions');
        const snapshot = await getDocs(questionsRef);
        if (!snapshot.empty) {
          const list: Question[] = [];
          snapshot.forEach(docSnap => {
            list.push({ id: docSnap.id, ...(docSnap.data() as any) });
          });
          list.sort((a, b) => (a.questionNumber || 0) - (b.questionNumber || 0));
          return list;
        }
      }
    } catch (e: any) {
      console.warn('Firestore getQuestions failed, falling back to local storage:', e.message);
    }

    return getLocalQuestions(testId);
  },

  /**
   * Batch saves a list of questions into a test (replaces or appends)
   */
  async saveQuestions(testId: string, questions: Question[], teacherId: string): Promise<Question[]> {
    if (!testId) throw new Error('Mã bài thi testId không được để trống.');
    if (!teacherId) throw new Error('Mã giáo viên teacherId không được để trống.');

    const validatedList = questions.map((q, idx) =>
      applyValidationToQuestion({
        ...q,
        testId,
        questionNumber: q.questionNumber || idx + 1,
      })
    );

    try {
      if (db) {
        const batch = writeBatch(db);
        const questionsRef = collection(db, 'tests', testId, 'questions');

        for (const q of validatedList) {
          const qDoc = doc(questionsRef, q.id);
          batch.set(qDoc, q);
        }

        // Update questionCount on test doc
        const testDocRef = doc(db, 'tests', testId);
        batch.update(testDocRef, {
          questionCount: validatedList.length,
          updatedAt: new Date().toISOString(),
        });

        await batch.commit();
      }
    } catch (e: any) {
      console.warn('Firestore saveQuestions failed, persisting locally:', e.message);
      handleFirestoreError(e, OperationType.WRITE, `tests/${testId}/questions`);
    }

    saveLocalQuestions(testId, validatedList);
    return validatedList;
  },

  /**
   * Adds a single question to the test
   */
  async addQuestion(testId: string, questionInput: Omit<Question, 'id'>, teacherId: string): Promise<Question> {
    const existing = await this.getQuestions(testId);
    const newId = `q_${Date.now()}_${existing.length + 1}`;

    const newQuestion: Question = applyValidationToQuestion({
      ...questionInput,
      id: newId,
      testId,
      questionNumber: questionInput.questionNumber || existing.length + 1,
    });

    const updatedList = [...existing, newQuestion];
    await this.saveQuestions(testId, updatedList, teacherId);
    return newQuestion;
  },

  /**
   * Updates an existing question
   */
  async updateQuestion(testId: string, questionId: string, updates: Partial<Question>, teacherId: string): Promise<Question> {
    const existing = await this.getQuestions(testId);
    const index = existing.findIndex(q => q.id === questionId);
    if (index === -1) {
      throw new Error(`Không tìm thấy câu hỏi với ID ${questionId}`);
    }

    const updatedQuestion = applyValidationToQuestion({
      ...existing[index],
      ...updates,
      id: questionId,
      testId,
    });

    existing[index] = updatedQuestion;
    await this.saveQuestions(testId, existing, teacherId);
    return updatedQuestion;
  },

  /**
   * Deletes a question from the test
   */
  async deleteQuestion(testId: string, questionId: string, teacherId: string): Promise<void> {
    const existing = await this.getQuestions(testId);
    const filtered = existing
      .filter(q => q.id !== questionId)
      .map((q, idx) => ({ ...q, questionNumber: idx + 1 })); // Renumber

    try {
      if (db) {
        const qDoc = doc(db, 'tests', testId, 'questions', questionId);
        await deleteDoc(qDoc);
        const testDocRef = doc(db, 'tests', testId);
        await updateDoc(testDocRef, {
          questionCount: filtered.length,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (e: any) {
      console.warn('Firestore deleteQuestion failed:', e.message);
    }

    saveLocalQuestions(testId, filtered);
  },

  /**
   * Records metadata of an import operation into /tests/{testId}/imports
   */
  async recordImportMetadata(
    testId: string,
    metadata: Omit<TestImportMetadata, 'id'>
  ): Promise<TestImportMetadata> {
    const importId = `imp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const fullRecord: TestImportMetadata = {
      id: importId,
      ...metadata,
    };

    try {
      if (db) {
        const importDocRef = doc(db, 'tests', testId, 'imports', importId);
        await setDoc(importDocRef, fullRecord);
      }
    } catch (e: any) {
      console.warn('Firestore recordImportMetadata failed, saving locally:', e.message);
    }

    const currentImports = getLocalImports(testId);
    currentImports.unshift(fullRecord);
    saveLocalImports(testId, currentImports);

    return fullRecord;
  },

  /**
   * Retrieves import metadata history
   */
  async getImportHistory(testId: string): Promise<TestImportMetadata[]> {
    try {
      if (db) {
        const importsRef = collection(db, 'tests', testId, 'imports');
        const snapshot = await getDocs(importsRef);
        if (!snapshot.empty) {
          const list: TestImportMetadata[] = [];
          snapshot.forEach(docSnap => {
            list.push({ id: docSnap.id, ...(docSnap.data() as any) });
          });
          list.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
          return list;
        }
      }
    } catch (e: any) {
      console.warn('Firestore getImportHistory failed:', e.message);
    }

    return getLocalImports(testId);
  },
};
