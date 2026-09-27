# Ứng Dụng Web Thi Trắc Nghiệm Trực Tuyến (EduQuiz Pro)

Hệ thống thi trắc nghiệm trực tuyến hoàn chỉnh dành cho Giáo viên và Học sinh, hỗ trợ hiển thị công thức toán học LaTeX (KaTeX), xác thực phân quyền Role-Based (Teacher / Student) qua Firebase Authentication, cơ sở dữ liệu Cloud Firestore với Security Rules chuẩn Zero-Trust, và Firebase Storage.

---

## 🚀 Tính Năng Đã Hoàn Thành Trong PHASE 1 (Nền Tảng Kỹ Thuật)

- **Kiến trúc mã nguồn chuẩn hóa**: Phân tách rõ ràng giữa `components/`, `services/`, `hooks/`, `firebase/`, `lib/`, `types/`, `utils/`, và `tests/`.
- **Firebase Authentication**:
  - Đăng nhập Giáo viên bằng Email & Mật khẩu.
  - Đăng ký tài khoản Giáo viên mới.
  - Phân quyền nghiêm ngặt theo vai trò (`TEACHER`, `STUDENT`).
  - Xử lý lỗi bảo mật và thông báo tiếng Việt trực quan.
  - Đăng xuất an toàn và làm sạch phiên làm việc.
  - Hỗ trợ chế độ Local Session Fallback giúp thẩm định UI/UX ngay cả khi chưa nạp API key.
- **Firebase Firestore & Storage Integration**:
  - Khởi tạo client Firebase App, Auth, Firestore, Storage an toàn.
  - Cơ chế kiểm tra kết nối `checkFirebaseConnection()` sử dụng `getDocFromServer` chuẩn Cloud Firestore.
  - Bộ xử lý lỗi bảo mật `FirestoreErrorInfo` & `handleFirestoreError` bắt đúng ngữ cảnh.
- **Firestore Security Rules & Blueprint**:
  - `firebase-blueprint.json`: Sơ đồ dữ liệu thực thể chuẩn `User`, `Exam` và `QuizTest`.
  - `firestore.rules`: Quy tắc bảo mật Zero-Trust (mặc định đóng `allow read, write: if false;`), giáo viên chỉ có quyền đọc/ghi dữ liệu của chính mình, bảo vệ chống leo thang đặc quyền role.
- **Hỗ trợ Công Thức Toán Học LaTeX (KaTeX)**:
  - Phân tích cú pháp inline `$x^2$` và block `$$\int f(x)dx$$`.
  - Hiển thị trực quan tốc độ cao, giao diện chống lỗi crash.
- **Bộ Kiểm Thử Tự Động (Vitest)**:
  - 100% test pass cho Auth state, Protected Route, Role validation, Login error, Logout và KaTeX engine.

---

## 🎯 Tính Năng Đã Hoàn Thành Trong PHASE 2 (Quản Lý Kỳ Thi Dành Cho Giáo Viên)

- **Collection `tests` trong Firestore & Blueprint**:
  - Lưu trữ chi tiết: `id`, `title`, `description`, `teacherId`, `duration`, `status` (`DRAFT`, `PUBLISHED`, `ACTIVE`, `CLOSED`, `ARCHIVED`), `startTime`, `endTime`, `publicCode`, `allowStudentViewScore`, `allowStudentViewAnswers`, `allowStudentViewSolutions`, `randomizeQuestions`, `randomizeOptions`, `createdAt`, `updatedAt`.
  - Quy tắc `firestore.rules`: Giáo viên chỉ xem/sửa/xóa test của chính mình; người dùng hoặc thí sinh chỉ được đọc thông tin khi test ở trạng thái `PUBLISHED` hoặc `ACTIVE`.
- **Bảng Điều Khiển Giáo Viên (Teacher Dashboard)**:
  - Thống kê thời gian thực: Tổng số kỳ thi, Kỳ thi đang hoạt động, Tổng số lượt làm bài.
  - Tìm kiếm thông minh theo tên đề thi hoặc mã phòng thi (`publicCode`).
  - Bộ lọc trạng thái (Tất cả, DRAFT, PUBLISHED, ACTIVE, CLOSED, ARCHIVED).
  - Sắp xếp linh hoạt (Mới nhất, Cũ nhất, Tên A-Z, Thời lượng).
  - Phân trang giao diện sạch sẽ, chuyên nghiệp.
- **Biểu Mẫu Tạo & Chỉnh Sửa Kỳ Thi (Create / Edit Test)**:
  - Nhập tên kỳ thi, mô tả, thời gian làm bài (> 0 và ≤ 1440 phút), khung giờ mở/đóng thi.
  - Cấu hình quy chế: Cho xem điểm sau nộp, Cho xem đáp án, Cho xem lời giải, Xáo trộn câu hỏi, Xáo trộn đáp án.
  - Validation chi tiết bằng tiếng Việt ngăn chặn dữ liệu không hợp lệ.
- **Trang Chi Tiết Kỳ Thi (`/teacher/tests/[testId]`)**:
  - Gồm 5 tabs: **Tổng quan**, **Câu hỏi** (chuẩn bị cho Phase 3), **Cài đặt**, **Kết quả**, **Thống kê** (placeholder có cấu trúc chuẩn, không tạo dữ liệu giả).
  - Hộp mã phòng thi công khai (`publicCode`) kèm nút sao chép đường dẫn dự thi 1-click.
- **Quản Lý Vòng Đời Kỳ Thi (Lifecycle & Status Transitions)**:
  - Đầy đủ các thao tác: Tạo mới, Xem chi tiết, Chỉnh sửa, Công bố (`PUBLISHED`), Bắt đầu (`ACTIVE`), Đóng phòng thi (`CLOSED`), Lưu trữ (`ARCHIVED`), và Xóa.
  - **Hộp thoại xác nhận (Confirmation Dialog)**: Ngăn chặn tuyệt đối việc xóa nhầm hoặc đổi trạng thái bằng một cú click chuột.
- **Mã Phòng Thi Ngẫu Nhiên (`publicCode`) & Route `/test/[publicCode]`**:
  - Thuật toán sinh mã ngẫu nhiên, khó đoán (8 ký tự loại trừ các ký tự dễ nhầm lẫn như 0, O, 1, I).
  - Kiểm tra tính duy nhất (uniqueness check) trước khi lưu.
  - Route thí sinh `/test/[publicCode]`: Phòng chờ hiển thị thông tin bài thi, thời gian, giáo viên và quy chế phòng thi cho học sinh.
- **Bảo Mật Quyền Sở Hữu (Ownership Security)**:
  - Giáo viên khác không thể truy cập, sửa đổi hoặc xóa kỳ thi không thuộc quyền sở hữu của mình.
- **Bộ Kiểm Thử Toàn Diện Cho Test Service (`tests/testService.test.ts`)**:
  - Kiểm thử 8 nhóm tính năng: Create test, Validation, Update test, Status transitions, Permission security, PublicCode uniqueness, Student publicCode access, Delete test.
  - **100% 20/20 test cases pass**.

---

## 🛠️ Hướng Dẫn Cài Đặt & Chạy Cục Bộ (Local)

### 1. Cài đặt Dependencies
```bash
npm install
```

### 2. Thiết lập Firebase Project

1. Truy cập [Firebase Console](https://console.firebase.google.com/) và nhấn **Add project** (Tạo dự án mới).
2. Đặt tên dự án (ví dụ: `eduquiz-online`).
3. **Bật Authentication**:
   - Vào mục **Build** > **Authentication** > tab **Sign-in method**.
   - Kích hoạt nhà cung cấp **Email/Password** (Email/Mật khẩu).
4. **Tạo Cloud Firestore**:
   - Vào mục **Build** > **Firestore Database** > nhấn **Create database**.
   - Chọn vị trí Cloud Region (ví dụ: `asia-southeast1` hoặc gần nhất).
   - Chọn chế độ **Production mode** (sau đó triển khai file `firestore.rules` của dự án).
5. **Tạo Firebase Storage**:
   - Vào mục **Build** > **Storage** > nhấn **Get started** và hoàn tất tạo bucket.

### 3. Cấu hình Biến Môi Trường (.env)

Sao chép tệp mẫu:
```bash
cp .env.example .env
```

Điền thông tin SDK từ Firebase Console (Project Settings > General > Your apps > Web app):
```env
VITE_FIREBASE_API_KEY="AIzaSy..."
VITE_FIREBASE_AUTH_DOMAIN="eduquiz-online.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="eduquiz-online"
VITE_FIREBASE_STORAGE_BUCKET="eduquiz-online.appspot.com"
VITE_FIREBASE_MESSAGING_SENDER_ID="123456789"
VITE_FIREBASE_APP_ID="1:123456789:web:abcdef"
VITE_FIREBASE_MEASUREMENT_ID="G-XXXXXXXXXX"
```

### 4. Chạy Ứng Dụng ở Môi Trường Development
```bash
npm run dev
```
Ứng dụng sẽ chạy tại: `http://localhost:3000`

### 5. Chạy Kiểm Thử (Unit Tests)
```bash
npm test
```

### 6. Chạy Kiểm Tra Kiểu (Typecheck) & Build Production
```bash
npm run lint
npm run build
```

---

## 👤 Tài Khoản Giáo Viên Mẫu (Thử Nghiệm Nhanh)

Khi chưa điền thông tin Firebase vào `.env`, hệ thống tự động cung cấp tài khoản giáo viên demo để thẩm định ngay:
- **Email**: `giaovien@demo.edu.vn`
- **Mật khẩu**: `123456`
- **Vai trò**: `TEACHER`

*(Bạn có thể bấm nút **"Nạp tài khoản Giáo viên mẫu (1 click)"** ngay trên màn hình Đăng nhập).*
