import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTest,
  getTeacherTests,
  getTestById,
  getTestByPublicCode,
  updateTest,
  updateTestStatus,
  deleteTest,
  validateTestInput,
} from '../src/services/testService';
import { generatePublicCode, isValidPublicCode } from '../src/utils/generateCode';

describe('Phase 2: Quiz Test Management & Security System', () => {
  const teacherId1 = 'teacher-abc-123';
  const teacherId2 = 'teacher-xyz-999';

  beforeEach(() => {
    localStorage.clear();
  });

  it('1. should validate test input correctly', () => {
    // Title validations
    expect(validateTestInput({ title: '' }).isValid).toBe(false);
    expect(validateTestInput({ title: '   ' }).isValid).toBe(false);
    expect(validateTestInput({ title: 'ab' }).isValid).toBe(false);
    expect(validateTestInput({ title: 'Hợp lệ' }).isValid).toBe(true);

    // Duration validations
    expect(validateTestInput({ duration: 0 }).isValid).toBe(false);
    expect(validateTestInput({ duration: -10 }).isValid).toBe(false);
    expect(validateTestInput({ duration: 1500 }).isValid).toBe(false);
    expect(validateTestInput({ duration: 45 }).isValid).toBe(true);

    // Start / End time validations
    const now = new Date();
    const past = new Date(now.getTime() - 60000);
    const future = new Date(now.getTime() + 60000);

    expect(
      validateTestInput({
        startTime: future.toISOString(),
        endTime: past.toISOString(),
      }).isValid
    ).toBe(false);

    expect(
      validateTestInput({
        startTime: past.toISOString(),
        endTime: future.toISOString(),
      }).isValid
    ).toBe(true);
  });

  it('2. should generate unique, valid public codes', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const code = generatePublicCode(8);
      expect(isValidPublicCode(code)).toBe(true);
      expect(code).toHaveLength(8);
      // Ensure no ambiguous characters like 0, O, 1, I
      expect(code).not.toMatch(/[01IOil]/);
      codes.add(code);
    }
    // All 50 codes must be unique
    expect(codes.size).toBe(50);
  });

  it('3. should create a new test with default draft status and settings', async () => {
    const test = await createTest(
      teacherId1,
      {
        title: 'Kiểm tra 1 tiết Đại số 10',
        description: 'Đề kiểm tra chương Mệnh đề và Tập hợp',
        duration: 45,
        allowStudentViewScore: true,
        allowStudentViewAnswers: false,
      },
      'Thầy Minh'
    );

    expect(test).toBeDefined();
    expect(test.id).toBeDefined();
    expect(test.title).toBe('Kiểm tra 1 tiết Đại số 10');
    expect(test.teacherId).toBe(teacherId1);
    expect(test.teacherName).toBe('Thầy Minh');
    expect(test.duration).toBe(45);
    expect(test.status).toBe('DRAFT');
    expect(test.allowStudentViewScore).toBe(true);
    expect(test.allowStudentViewAnswers).toBe(false);
    expect(isValidPublicCode(test.publicCode)).toBe(true);

    // Check retrieval
    const tests = await getTeacherTests(teacherId1);
    expect(tests).toHaveLength(1);
    expect(tests[0].id).toBe(test.id);
  });

  it('4. should update test details successfully', async () => {
    const created = await createTest(teacherId1, {
      title: 'Đề kiểm tra ban đầu',
      duration: 30,
    });

    const updated = await updateTest(created.id, teacherId1, {
      title: 'Đề kiểm tra đã cập nhật',
      duration: 60,
      allowStudentViewAnswers: true,
    });

    expect(updated.title).toBe('Đề kiểm tra đã cập nhật');
    expect(updated.duration).toBe(60);
    expect(updated.allowStudentViewAnswers).toBe(true);

    const fetched = await getTestById(created.id, teacherId1);
    expect(fetched?.title).toBe('Đề kiểm tra đã cập nhật');
  });

  it('5. should handle status transitions: PUBLISH, ACTIVATE, CLOSE, ARCHIVE', async () => {
    const test = await createTest(teacherId1, {
      title: 'Đề thi Vật lý 12',
      duration: 50,
    });
    expect(test.status).toBe('DRAFT');

    // Publish test
    const published = await updateTestStatus(test.id, teacherId1, 'PUBLISHED');
    expect(published.status).toBe('PUBLISHED');

    // Activate test
    const active = await updateTestStatus(test.id, teacherId1, 'ACTIVE');
    expect(active.status).toBe('ACTIVE');

    // Close test
    const closed = await updateTestStatus(test.id, teacherId1, 'CLOSED');
    expect(closed.status).toBe('CLOSED');

    // Archive test
    const archived = await updateTestStatus(test.id, teacherId1, 'ARCHIVED');
    expect(archived.status).toBe('ARCHIVED');
  });

  it('6. should enforce permission security: teacher cannot access or modify another teacher test', async () => {
    const test1 = await createTest(teacherId1, {
      title: 'Đề của Thầy 1',
      duration: 45,
    });

    // Teacher 2 attempts to get Teacher 1's test
    await expect(getTestById(test1.id, teacherId2)).rejects.toThrow(
      'Bạn không có quyền truy cập vào kỳ thi này.'
    );

    // Teacher 2 attempts to update Teacher 1's test
    await expect(
      updateTest(test1.id, teacherId2, {
        title: 'Hacked title',
      })
    ).rejects.toThrow('Bạn không có quyền truy cập vào kỳ thi này.');

    // Teacher 2 attempts to delete Teacher 1's test
    await expect(deleteTest(test1.id, teacherId2)).rejects.toThrow(
      'Bạn không có quyền truy cập vào kỳ thi này.'
    );
  });

  it('7. should allow student to access test by publicCode only when PUBLISHED or ACTIVE', async () => {
    const test = await createTest(teacherId1, {
      title: 'Đề thi học sinh vào thi',
      duration: 45,
    });

    // While DRAFT: student cannot access
    const resultDraft = await getTestByPublicCode(test.publicCode);
    expect(resultDraft).toBeNull();

    // After PUBLISHED: student can access
    await updateTestStatus(test.id, teacherId1, 'PUBLISHED');
    const resultPublished = await getTestByPublicCode(test.publicCode);
    expect(resultPublished).not.toBeNull();
    expect(resultPublished?.id).toBe(test.id);

    // After CLOSED: student cannot access
    await updateTestStatus(test.id, teacherId1, 'CLOSED');
    const resultClosed = await getTestByPublicCode(test.publicCode);
    expect(resultClosed).toBeNull();
  });

  it('8. should delete test successfully with owner verification', async () => {
    const test = await createTest(teacherId1, {
      title: 'Đề thi sắp bị xóa',
      duration: 15,
    });

    let tests = await getTeacherTests(teacherId1);
    expect(tests).toHaveLength(1);

    await deleteTest(test.id, teacherId1);

    tests = await getTeacherTests(teacherId1);
    expect(tests).toHaveLength(0);
  });
});
