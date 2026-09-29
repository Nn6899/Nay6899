import * as pdfjsLib from 'pdfjs-dist';
// Vite đóng gói worker của pdf.js thành một tệp riêng và trả về URL của nó.
// Thiếu dòng này, bản build trên Vercel không đọc được PDF (lỗi "Setting up fake worker failed").
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

if (typeof window !== 'undefined' && typeof Worker !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

export function loadPdfDocument(buffer: ArrayBuffer) {
  return pdfjsLib.getDocument({
    data: new Uint8Array(buffer.slice(0)),
    useWorkerFetch: false,
    useSystemFonts: true,
  } as any).promise;
}

export { pdfjsLib };
