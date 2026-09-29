/**
 * Đọc cấu hình Firebase từ MỘT biến duy nhất (VITE_FIREBASE_CONFIG).
 * Giáo viên chỉ cần dán nguyên đoạn `firebaseConfig = { apiKey: "...", ... }` lấy từ Firebase Console,
 * cả dạng JSON lẫn dạng JavaScript đều được.
 */
export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId: string;
}

const KEYS: (keyof FirebaseWebConfig)[] = [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
  'measurementId',
];

export function parseFirebaseConfigText(text: string | undefined): Partial<FirebaseWebConfig> {
  const out: Partial<FirebaseWebConfig> = {};
  if (!text) return out;
  // Khớp  apiKey: "xxx"  hoặc  "apiKey": 'xxx'  (dấu nháy thẳng hoặc nháy cong do copy từ Word/Zalo)
  const re = /["']?([A-Za-z]+)["']?\s*:\s*["'“”‘’]([^"'“”‘’\n]*)["'“”‘’]/g;
  for (const m of text.matchAll(re)) {
    const key = m[1] as keyof FirebaseWebConfig;
    if (KEYS.includes(key) && !out[key]) out[key] = m[2].trim();
  }
  return out;
}
