# Hướng dẫn cập nhật & sử dụng site luyện đề

Tài liệu này đi kèm bản sửa lỗi (nhánh `fix/mathtype-ocr-vercel`). Thầy làm lần lượt 4 bước dưới đây. Bước nào xong cũng dùng được ngay; bước 3 (Firebase) là bắt buộc nếu muốn học sinh làm bài trên máy của các em.

---

## 0. Bản sửa này sửa những gì

| Vấn đề thầy gặp | Nguyên nhân tìm được | Đã sửa |
|---|---|---|
| Word có MathType thì mất công thức | Code cũ chỉ đọc công thức *Equation của Word* (OMML). MathType lưu công thức dạng **OLE** (`oleObject.bin`), code cũ bỏ qua hoàn toàn | Thêm bộ đọc MathType (MTEF) → LaTeX, chạy ngay trên trình duyệt |
| PDF không tách được câu | Code gộp cả trang PDF thành **một dòng**, trong khi bộ tách câu tìm “Câu N.” ở **đầu dòng** → mỗi trang chỉ ra 1 câu | Giữ nguyên xuống dòng theo toạ độ chữ trong PDF |
| PDF scan / cần OCR công thức | Nút “Nhận diện bằng AI” gọi `/api/ai/extract-questions`, nhưng API này **chỉ chạy ở máy (npm run dev)**, lên Vercel trả về **404**. Ngoài ra nút này chỉ gửi **300 ký tự đầu** của đề cho AI | Thêm hàm serverless `api/ai/extract-questions.ts` cho Vercel. AI (Gemini) nhận **nguyên PDF / ảnh chụp** → tự OCR + nhận dạng công thức + tách câu + tìm đáp án |
| Word/PDF lỗi đọc PDF trên bản Vercel | pdf.js thiếu cấu hình “worker” | Đã cấu hình |
| Tách câu sai | “vuông tại A.” trong đề bị hiểu là phương án A; “Câu 1.” do Word **tự đánh số** không có trong chữ; bảng đáp án dạng bảng Word không đọc được; phần “LỜI GIẢI CHI TIẾT” cuối đề tạo câu trùng | Đã sửa cả 4. Thêm: nhận đáp án đúng từ chữ cái **gạch chân / tô đỏ / tô nền**, lấy **hình vẽ** trong Word gắn vào câu hỏi |
| Link thi `/test/MÃ` báo 404 trên Vercel | Thiếu cấu hình chuyển trang cho ứng dụng 1 trang (SPA) | Thêm `vercel.json` |
| Học sinh ở máy khác không vào được đề | Site đang **chưa nối Firebase** → mọi dữ liệu chỉ nằm trong trình duyệt của thầy. Kể cả khi nối, luật Firestore cũ **chặn học sinh tìm đề theo mã** | Sửa luật `firestore.rules` + truy vấn tìm đề (đã chạy thử trên Firebase Emulator toàn bộ luồng: giáo viên tạo đề → học sinh tìm đề, làm, nộp → giáo viên xem kết quả; các thao tác gian lận bị chặn) |
| Giáo viên không xem được điểm học sinh | Tab “Kết quả” chỉ là bảng trống viết cứng | Làm bảng kết quả thật + nút **Xuất Excel (CSV)** |

Giao diện học sinh **làm từng câu, bấm Câu tiếp theo** đã có sẵn trong code (bảng số câu bên phải, đánh dấu xem lại, tự lưu, hết giờ tự nộp) — không cần làm thêm.

---

## 1. Đưa code mới lên GitHub

**Cách dễ nhất – dùng Pull Request:** nếu đã có Pull Request gửi vào repo `Nn6899/Nay6899`, thầy chỉ cần mở nó trên GitHub → bấm **Merge pull request** → **Confirm merge**. Vercel sẽ tự build lại sau 1–2 phút.

**Cách thủ công – tải file lên:**
1. Giải nén file zip bản sửa.
2. Trên GitHub, mở repo → **Add file → Upload files**.
3. Kéo **toàn bộ các thư mục/tệp trong zip** (`api`, `src`, `tests`, `vercel.json`, `package.json`, `bun.lock`, `firestore.rules`, `index.html`, `vite.config.ts`, `HUONG-DAN.md`) vào khung. GitHub tự ghi đè tệp cùng tên.
4. Bấm **Commit changes**.
5. (Không bắt buộc) xoá tệp cũ `src/server/geminiHandler.ts` — không còn dùng.

> ⚠️ Không dán code này vào AI Studio rồi để AI Studio “đồng bộ” — AI Studio có thể viết lại các tệp. Xem mục 5.

---

## 2. Bật AI (OCR PDF scan, ảnh chụp đề, bóc tách lại) – miễn phí, **có thể làm sau**

Word, PDF có chữ, LaTeX và TXT nhập được bình thường mà không cần AI. Chỉ làm bước này khi cần nhập PDF scan hoặc ảnh chụp đề.

1. Vào <https://aistudio.google.com/apikey> → **Create API key** → sao chép.
2. Vào <https://vercel.com> → chọn project **nay6899** → **Settings → Environment Variables** → thêm:
   - `GEMINI_API_KEY` = *khoá vừa sao chép*
   - (tuỳ chọn) `GEMINI_MODEL` = `gemini-3.8-flash` (mặc định đã là model này; muốn rẻ/nhanh hơn có thể đổi sang model Flash-Lite)
3. Vào tab **Deployments** → bấm **⋯** ở bản mới nhất → **Redeploy**.

Gói miễn phí của Gemini có giới hạn số lượt/phút và /ngày. Khi hết lượt, site báo “Đã hết lượt gọi AI miễn phí…”, đợi một lúc rồi thử lại.

---

## 3. Nối Firebase (để học sinh làm bài trên máy của các em)

Hiện site chưa có Firebase nên **đề và bài làm chỉ lưu trong trình duyệt của thầy**; học sinh mở link trên máy khác sẽ không thấy đề.

1. <https://console.firebase.google.com> → **Add project** (đặt tên bất kỳ, tắt Google Analytics cũng được). Gói **Spark (miễn phí)** là đủ.
2. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable → Save.**
3. **Build → Firestore Database → Create database** → chọn vị trí `asia-southeast1` → **Production mode**.
4. Trong Firestore → tab **Rules** → xoá hết, dán **toàn bộ nội dung tệp `firestore.rules`** (bản mới) → **Publish**.
5. **Project settings (bánh răng) → General → Your apps → biểu tượng `</>` (Web)** → đặt tên → **Register app** → sẽ thấy đoạn `firebaseConfig = { apiKey: ..., authDomain: ..., ... }`.
6. Trên Vercel → **Settings → Environment Variables**, thêm **1 biến**:
   - **Name:** `VITE_FIREBASE_CONFIG`
   - **Value:** dán **nguyên khối** `firebaseConfig` vừa thấy ở bước 5 (từ `const firebaseConfig = {` đến `};`, dán cả dòng chú thích cũng được). Site tự đọc `apiKey`, `projectId`... trong đó.

   (Cách cũ dùng 6 biến `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_PROJECT_ID`... vẫn hoạt động nếu thầy thích.)
7. **Redeploy** (như bước 2.3).
8. Mở site: đầu trang giáo viên có thẻ **tình trạng** báo còn thiếu gì; khi hết cảnh báo là xong. **Đăng ký tài khoản giáo viên mới** (tài khoản demo `giaovien@demo.edu.vn` chỉ dùng khi chưa có Firebase). Đề tạo trước khi nối Firebase nằm trong trình duyệt cũ, cần nhập lại.

Không cần bật Firebase **Storage** (bản này không dùng đến).

---

## 4. Cách dùng

1. **Tạo kỳ thi** → mở kỳ thi → tab **Câu hỏi** → **Nhập từ tệp**.
2. Chọn tệp:
   - **Word (.docx)**: đọc được MathType, Equation của Word, hình vẽ, đánh số tự động.
   - **PDF có chữ**: tách câu nhanh; công thức trong PDF thường bị vỡ → bấm **“Bóc tách lại bằng AI”**.
   - **PDF scan / ảnh chụp đề (.jpg, .png)**: tự chuyển sang AI để OCR.
   - **LaTeX (.tex)**, **TXT**, hoặc dán văn bản.
3. Màn hình duyệt: sửa câu “Cần kiểm duyệt” (thiếu đáp án, thiếu phương án…). Câu có hình WMF cũ hoặc có đánh dấu **[HÌNH]** → mở câu để chèn ảnh.
4. **Lưu** → **Công bố** → gửi học sinh link `https://nay6899.vercel.app/test/MÃ-PHÒNG`.
5. Xem điểm ở tab **Kết quả** → **Xuất Excel (CSV)**.

### Để máy tự nhận đáp án đúng, soạn đề theo 1 trong các cách:
- Có **BẢNG ĐÁP ÁN** ở cuối (dạng `1.A 2.B …` hoặc bảng Word 2 hàng: số câu / đáp án).
- Chữ cái phương án đúng được **gạch chân**, **tô đỏ** hoặc **tô nền** (chỉ 1 phương án mỗi câu).
- Thêm dấu `*` trước phương án đúng: `*B. 5`.
- Câu Đúng/Sai: ghi `(Đúng)` / `(Sai)` sau mỗi ý, hoặc gạch chân chữ `a)`, `b)`… của ý đúng.
- Câu trả lời ngắn: có dòng `Đáp án: 2,5`.

### Nếu vẫn có công thức MathType không đọc được (hiện `[công thức]`)
Trong Word: tab **MathType → Convert Equations → chọn “Microsoft Word equations (Office 2007 and later)” → Convert**, lưu lại rồi nhập lại. Hoặc dùng nút **“Bóc tách lại bằng AI”**.

---

## 5. Tránh việc AI Studio làm rối code

- **Luôn làm trên nhánh riêng.** Trên GitHub: mỗi lần muốn sửa, tạo nhánh mới (ví dụ `thu-nghiem`). Vercel tự tạo **link xem thử (Preview)** cho nhánh đó; thấy ổn mới **Merge** vào `main`. Site chính không bao giờ bị hỏng.
- Trước khi merge, xem tab **Files changed** trên GitHub: nếu AI sửa cả những tệp không liên quan (nhất là `src/services/import/*`, `api/`, `firestore.rules`, `vercel.json`) thì **không merge**.
- Dự án có sẵn bộ kiểm thử. Người sửa code chạy `npm test` trước khi đẩy lên; nếu có test đỏ nghĩa là tính năng cũ đã bị phá.
- Công cụ AI chạy trực tiếp trên thư mục code (sửa đúng chỗ, không viết lại cả dự án) sẽ ổn định hơn AI Studio: ví dụ **Gemini CLI** hoặc **Claude Code**.

---

## 6. Chạy ở máy (cho người sửa code)

```bash
bun install          # hoặc: npm install --legacy-peer-deps
cp .env.example .env # điền GEMINI_API_KEY (và Firebase nếu có)
npm run dev          # mở http://localhost:3000
npm test             # chạy kiểm thử
```
