import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { ConnectionStatusCard } from './ConnectionStatusCard';
import { LatexRenderer } from '../common/LatexRenderer';
import { CreateTestModal } from './CreateTestModal';
import { TestDetailView } from './TestDetailView';
import { ConfirmDialog } from '../common/ConfirmDialog';
import {
  getTeacherTests,
  createTest,
  updateTest,
  updateTestStatus,
  deleteTest,
} from '../../services/testService';
import type { QuizTest, CreateTestInput, TestStatus } from '../../types/test';
import { formatDate } from '../../utils/formatDate';
import {
  FileText,
  Users,
  PlusCircle,
  Code2,
  Calendar,
  KeyRound,
  Sparkles,
  Search,
  Filter,
  ArrowUpDown,
  Clock,
  Copy,
  Check,
  Eye,
  Trash2,
  Edit3,
  CheckCircle,
  Lock,
  Archive,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Activity,
} from 'lucide-react';

export const TeacherDashboard: React.FC = () => {
  const { user } = useAuth();

  // Tests list state
  const [tests, setTests] = useState<QuizTest[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter & Sort state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<TestStatus | 'ALL'>('ALL');
  const [sortBy, setSortBy] = useState<'createdAt_desc' | 'createdAt_asc' | 'title_asc' | 'duration_desc'>('createdAt_desc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 6;

  // Modals & Navigation state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [editingTest, setEditingTest] = useState<QuizTest | null>(null);
  const [selectedTestId, setSelectedTestId] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant: 'danger' | 'warning' | 'primary';
    action: () => Promise<void>;
  }>({
    isOpen: false,
    title: '',
    message: '',
    variant: 'danger',
    action: async () => {},
  });
  const [isActionLoading, setIsActionLoading] = useState(false);

  // KaTeX Playground Demo Text (from Phase 1)
  const [latexDemoText, setLatexDemoText] = useState<string>(
    'Phương trình bậc hai: $ax^2 + bx + c = 0$\nNghiệm: $$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$\nTích phân: $$\\int_{0}^{\\pi} \\sin(x)dx = 2$$'
  );

  // Fetch tests
  const fetchTests = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      setError(null);
      const data = await getTeacherTests(user.id, {
        searchQuery,
        status: statusFilter,
        sortBy,
      });
      setTests(data);
    } catch (err: any) {
      setError(err.message || 'Không thể tải danh sách kỳ thi.');
    } finally {
      setLoading(false);
    }
  }, [user?.id, searchQuery, statusFilter, sortBy]);

  useEffect(() => {
    fetchTests();
  }, [fetchTests]);

  // Copy code handler
  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Metrics calculations
  const metrics = useMemo(() => {
    const totalTests = tests.length;
    const activeTests = tests.filter((t) => t.status === 'ACTIVE' || t.status === 'PUBLISHED').length;
    const totalSubmissions = tests.reduce((sum, t) => sum + (t.totalSubmissions || 0), 0);
    return { totalTests, activeTests, totalSubmissions };
  }, [tests]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(tests.length / itemsPerPage));
  const paginatedTests = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return tests.slice(start, start + itemsPerPage);
  }, [tests, currentPage]);

  // Handle Create Test
  const handleCreateTestSubmit = async (input: CreateTestInput) => {
    if (!user?.id) return;
    if (editingTest) {
      await updateTest(editingTest.id, user.id, input);
      setEditingTest(null);
    } else {
      await createTest(user.id, input, user.displayName);
    }
    await fetchTests();
  };

  // Handle Delete Test
  const handleDeleteTest = async (testId: string) => {
    if (!user?.id) return;
    await deleteTest(testId, user.id);
    if (selectedTestId === testId) {
      setSelectedTestId(null);
    }
    await fetchTests();
  };

  // Handle Status Change
  const handleStatusChange = async (testId: string, newStatus: TestStatus) => {
    if (!user?.id) return;
    await updateTestStatus(testId, user.id, newStatus);
    await fetchTests();
  };

  // Render detail view if a test is selected
  const activeSelectedTest = tests.find((t) => t.id === selectedTestId);
  if (selectedTestId && activeSelectedTest) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <TestDetailView
          test={activeSelectedTest}
          onBack={() => setSelectedTestId(null)}
          onEdit={() => {
            setEditingTest(activeSelectedTest);
            setIsCreateModalOpen(true);
          }}
          onDelete={async () => {
            await handleDeleteTest(activeSelectedTest.id);
            setSelectedTestId(null);
          }}
          onStatusChange={async (status) => {
            await handleStatusChange(activeSelectedTest.id, status);
          }}
        />

        {/* Modal edit within detail view */}
        <CreateTestModal
          isOpen={isCreateModalOpen}
          initialData={editingTest}
          onClose={() => {
            setIsCreateModalOpen(false);
            setEditingTest(null);
          }}
          onSubmit={handleCreateTestSubmit}
        />
      </div>
    );
  }

  const getStatusBadge = (status: TestStatus) => {
    switch (status) {
      case 'PUBLISHED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
            PUBLISHED
          </span>
        );
      case 'ACTIVE':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
            ACTIVE
          </span>
        );
      case 'CLOSED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
            CLOSED
          </span>
        );
      case 'ARCHIVED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300">
            ARCHIVED
          </span>
        );
      case 'DRAFT':
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-200">
            DRAFT
          </span>
        );
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Welcome Banner */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Cổng Quản Trị Giáo Viên • Phase 2 Hoạt Động</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              Xin chào, {user?.displayName || 'Thầy/Cô'}!
            </h1>
            <p className="text-slate-500 text-sm mt-1.5 max-w-2xl">
              Hệ thống quản lý kỳ thi trắc nghiệm trực tuyến. Bạn có thể tạo kỳ thi mới, thiết lập thời gian, quy chế phòng thi và chia sẻ mã dự thi cho học sinh.
            </p>

            <div className="flex flex-wrap items-center gap-4 mt-4 text-xs text-slate-600">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span>Tham gia: {formatDate(user?.createdAt || new Date())}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 text-slate-400" />
                <span>
                  UID:{' '}
                  <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-[11px]">
                    {user?.id}
                  </code>
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full font-semibold">
                  Vai trò: {user?.role === 'TEACHER' ? 'GIÁO VIÊN' : user?.role}
                </span>
              </div>
            </div>
          </div>

          <div className="shrink-0">
            <button
              id="create-test-btn"
              type="button"
              onClick={() => {
                setEditingTest(null);
                setIsCreateModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-6 py-3.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-2xl shadow-md shadow-blue-500/20 transition-all cursor-pointer"
            >
              <PlusCircle className="w-5 h-5" />
              <span>Tạo Kỳ Thi Mới</span>
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Section: tổng số kỳ thi, kỳ thi đang hoạt động, số lượt làm bài */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Tổng Số Kỳ Thi
            </span>
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
              <FileText className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-bold text-slate-900">{metrics.totalTests}</div>
          <span className="text-xs text-slate-400 mt-1 block">Tất cả bài thi đã khởi tạo</span>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Kỳ Thi Đang Hoạt Động
            </span>
            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
              <Activity className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-bold text-emerald-600">{metrics.activeTests}</div>
          <span className="text-xs text-slate-400 mt-1 block">Trạng thái ACTIVE & PUBLISHED</span>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Số Lượt Làm Bài
            </span>
            <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-bold text-purple-600">{metrics.totalSubmissions}</div>
          <span className="text-xs text-slate-400 mt-1 block">Lượt thí sinh đã nộp bài</span>
        </div>
      </div>

      {/* Main Content Area: Test Management Section */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
        {/* Header & Controls: Search, Filter, Sort */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Danh Sách Kỳ Thi</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Quản lý, chỉnh sửa, công bố hoặc theo dõi các bài thi trắc nghiệm
            </p>
          </div>

          {/* Search, Filter, Sort Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Search Input */}
            <div className="relative min-w-[220px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Tìm tên hoặc mã thi..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as any);
                  setCurrentPage(1);
                }}
                aria-label="Lọc theo trạng thái"
                className="bg-transparent text-xs text-slate-700 font-medium focus:outline-none cursor-pointer"
              >
                <option value="ALL">Tất cả trạng thái</option>
                <option value="DRAFT">Bản nháp (DRAFT)</option>
                <option value="PUBLISHED">Đã công bố (PUBLISHED)</option>
                <option value="ACTIVE">Đang diễn ra (ACTIVE)</option>
                <option value="CLOSED">Đã đóng (CLOSED)</option>
                <option value="ARCHIVED">Lưu trữ (ARCHIVED)</option>
              </select>
            </div>

            {/* Sort By */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                aria-label="Sắp xếp danh sách kỳ thi"
                className="bg-transparent text-xs text-slate-700 font-medium focus:outline-none cursor-pointer"
              >
                <option value="createdAt_desc">Mới nhất</option>
                <option value="createdAt_asc">Cũ nhất</option>
                <option value="title_asc">Tên (A-Z)</option>
                <option value="duration_desc">Thời lượng nhiều nhất</option>
              </select>
            </div>

            {/* Refresh Button */}
            <button
              onClick={fetchTests}
              title="Làm mới danh sách"
              className="p-2 text-slate-500 hover:text-slate-800 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={fetchTests} className="text-xs font-semibold underline ml-4">
              Thử lại
            </button>
          </div>
        )}

        {/* Tests Table or Grid */}
        {loading && tests.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-blue-600" />
            <p className="text-sm">Đang tải danh sách kỳ thi...</p>
          </div>
        ) : paginatedTests.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-14 h-14 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mx-auto">
              <FileText className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-slate-800">Chưa có kỳ thi nào phù hợp</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {searchQuery || statusFilter !== 'ALL'
                ? 'Không tìm thấy kỳ thi với bộ lọc hiện tại. Hãy thử thay đổi từ khóa hoặc bộ lọc.'
                : 'Bắt đầu bằng cách tạo kỳ thi đầu tiên để phân phát cho học sinh làm bài.'}
            </p>
            <div className="pt-2">
              <button
                onClick={() => {
                  setEditingTest(null);
                  setIsCreateModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-xl hover:bg-blue-700 transition-colors"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Tạo Kỳ Thi Mới</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase bg-slate-50/50">
                  <th className="py-3 px-4">Tên Kỳ Thi</th>
                  <th className="py-3 px-4">Trạng Thái</th>
                  <th className="py-3 px-4">Thời Lượng</th>
                  <th className="py-3 px-4">Mã Phòng Thi</th>
                  <th className="py-3 px-4">Số Câu / Lượt Thi</th>
                  <th className="py-3 px-4">Ngày Tạo</th>
                  <th className="py-3 px-4 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedTests.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="py-3.5 px-4 max-w-xs">
                      <button
                        onClick={() => setSelectedTestId(t.id)}
                        className="font-bold text-slate-900 hover:text-blue-600 text-left transition-colors block truncate"
                        title={t.title}
                      >
                        {t.title}
                      </button>
                      {t.description && (
                        <p className="text-xs text-slate-400 truncate mt-0.5">{t.description}</p>
                      )}
                    </td>

                    <td className="py-3.5 px-4">{getStatusBadge(t.status)}</td>

                    <td className="py-3.5 px-4 text-xs font-medium text-slate-700">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>{t.duration} phút</span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="inline-flex items-center gap-1.5 bg-slate-100 px-2 py-1 rounded-lg">
                        <span className="font-mono text-xs font-bold text-blue-700 tracking-wider">
                          {t.publicCode}
                        </span>
                        <button
                          onClick={() => handleCopyCode(t.publicCode)}
                          title="Sao chép mã"
                          className="text-slate-400 hover:text-blue-600 transition-colors"
                        >
                          {copiedCode === t.publicCode ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-xs text-slate-600">
                      <span>{t.questionCount || 0} câu</span> /{' '}
                      <span className="font-semibold text-slate-800">
                        {t.totalSubmissions || 0} nộp
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-xs text-slate-400">
                      {formatDate(t.createdAt)}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Xem chi tiết */}
                        <button
                          onClick={() => setSelectedTestId(t.id)}
                          title="Xem chi tiết kỳ thi"
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {/* Chỉnh sửa */}
                        <button
                          onClick={() => {
                            setEditingTest(t);
                            setIsCreateModalOpen(true);
                          }}
                          title="Chỉnh sửa kỳ thi"
                          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>

                        {/* Nút chuyển trạng thái nhanh */}
                        {t.status === 'DRAFT' && (
                          <button
                            onClick={() =>
                              setConfirmDialog({
                                isOpen: true,
                                title: 'Công Bố Kỳ Thi',
                                message: `Bạn có muốn công bố kỳ thi "${t.title}" để học sinh có thể tham gia?`,
                                variant: 'primary',
                                action: async () => handleStatusChange(t.id, 'PUBLISHED'),
                              })
                            }
                            title="Công bố kỳ thi"
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                        )}

                        {(t.status === 'PUBLISHED' || t.status === 'ACTIVE') && (
                          <button
                            onClick={() =>
                              setConfirmDialog({
                                isOpen: true,
                                title: 'Đóng Phòng Thi',
                                message: `Bạn có chắc chắn muốn đóng phòng thi "${t.title}"?`,
                                variant: 'warning',
                                action: async () => handleStatusChange(t.id, 'CLOSED'),
                              })
                            }
                            title="Đóng phòng thi"
                            className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                          >
                            <Lock className="w-4 h-4" />
                          </button>
                        )}

                        {t.status !== 'ARCHIVED' && (
                          <button
                            onClick={() =>
                              setConfirmDialog({
                                isOpen: true,
                                title: 'Lưu Trữ Kỳ Thi',
                                message: `Chuyển kỳ thi "${t.title}" vào lưu trữ?`,
                                variant: 'warning',
                                action: async () => handleStatusChange(t.id, 'ARCHIVED'),
                              })
                            }
                            title="Lưu trữ kỳ thi"
                            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                          >
                            <Archive className="w-4 h-4" />
                          </button>
                        )}

                        {/* Xóa với dialog */}
                        <button
                          onClick={() =>
                            setConfirmDialog({
                              isOpen: true,
                              title: 'Xóa Kỳ Thi',
                              message: `Bạn có chắc chắn muốn xóa vĩnh viễn kỳ thi "${t.title}"? Dữ liệu không thể phục hồi.`,
                              variant: 'danger',
                              action: async () => handleDeleteTest(t.id),
                            })
                          }
                          title="Xóa kỳ thi"
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4 border-t border-slate-100 text-xs text-slate-500">
            <span>
              Trang {currentPage} trên {totalPages} ({tests.length} kỳ thi)
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Connection Card & KaTeX Playground from Phase 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ConnectionStatusCard />
        </div>

        {/* LaTeX Math Preview Live Engine */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 rounded-xl bg-purple-50 text-purple-600">
              <Code2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Bộ Xử Lý Toán Học (KaTeX)</h3>
              <p className="text-xs text-slate-500">Hỗ trợ LaTeX inline ($) và block ($$)</p>
            </div>
          </div>

          <div className="space-y-3 flex-1 flex flex-col">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Nhập công thức mẫu để thử nghiệm:
              </label>
              <textarea
                value={latexDemoText}
                onChange={(e) => setLatexDemoText(e.target.value)}
                rows={3}
                className="w-full p-2.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div className="flex-1 flex flex-col">
              <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Kết quả hiển thị trực quan:
              </span>
              <div className="p-4 bg-purple-50/50 border border-purple-100 rounded-xl text-slate-800 text-sm overflow-x-auto min-h-[90px] flex items-center justify-center">
                <LatexRenderer content={latexDemoText} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Create & Edit Modal */}
      <CreateTestModal
        isOpen={isCreateModalOpen}
        initialData={editingTest}
        onClose={() => {
          setIsCreateModalOpen(false);
          setEditingTest(null);
        }}
        onSubmit={handleCreateTestSubmit}
      />

      {/* Global Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        variant={confirmDialog.variant}
        loading={isActionLoading}
        onConfirm={async () => {
          setIsActionLoading(true);
          try {
            await confirmDialog.action();
            setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
          } catch (err: any) {
            alert(err.message || 'Thao tác không thành công');
          } finally {
            setIsActionLoading(false);
          }
        }}
        onClose={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
