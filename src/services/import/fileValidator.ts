import { FileValidationResult, SupportedFileFormat } from '../../types/question';

export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB

const ALLOWED_EXTENSIONS: Record<string, SupportedFileFormat> = {
  tex: 'tex',
  docx: 'docx',
  pdf: 'pdf',
  txt: 'txt',
};

const MAGIC_BYTES = {
  pdf: [0x25, 0x50, 0x44, 0x46], // %PDF
  docx: [0x50, 0x4b, 0x03, 0x04], // PK.. (ZIP archive)
};

/**
 * Validates file properties: size, extension, MIME type, and magic bytes.
 */
export async function validateImportFile(file: File | { name: string; size: number; type?: string; arrayBuffer: () => Promise<ArrayBuffer> }): Promise<FileValidationResult> {
  const fileName = file.name || '';
  const fileSize = file.size || 0;
  const mimeType = file.type || '';

  // 1. Check file size
  if (fileSize <= 0) {
    return {
      isValid: false,
      fileType: 'unknown',
      fileName,
      fileSize,
      mimeType,
      error: 'Tệp tải lên rỗng (0 bytes). Vui lòng chọn tệp hợp lệ.',
    };
  }

  if (fileSize > MAX_FILE_SIZE_BYTES) {
    return {
      isValid: false,
      fileType: 'unknown',
      fileName,
      fileSize,
      mimeType,
      error: `Dung lượng tệp (${(fileSize / (1024 * 1024)).toFixed(2)} MB) vượt quá giới hạn cho phép (tối đa 15 MB).`,
    };
  }

  // 2. Check extension
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  const detectedFormat = ALLOWED_EXTENSIONS[extension];

  if (!detectedFormat) {
    return {
      isValid: false,
      fileType: 'unknown',
      fileName,
      fileSize,
      mimeType,
      error: `Định dạng tệp .${extension} không được hỗ trợ. Hệ thống chỉ chấp nhận .tex, .docx, .pdf.`,
    };
  }

  // 3. Inspect magic bytes / headers
  try {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer.slice(0, 16));

    if (detectedFormat === 'pdf') {
      const isPdf =
        bytes[0] === MAGIC_BYTES.pdf[0] &&
        bytes[1] === MAGIC_BYTES.pdf[1] &&
        bytes[2] === MAGIC_BYTES.pdf[2] &&
        bytes[3] === MAGIC_BYTES.pdf[3];

      if (!isPdf) {
        return {
          isValid: false,
          fileType: 'pdf',
          fileName,
          fileSize,
          mimeType,
          error: 'Tệp không phải là định dạng PDF hợp lệ (chữ ký tệp / magic bytes không khớp %PDF).',
        };
      }
    } else if (detectedFormat === 'docx') {
      const isZip =
        bytes[0] === MAGIC_BYTES.docx[0] &&
        bytes[1] === MAGIC_BYTES.docx[1] &&
        bytes[2] === MAGIC_BYTES.docx[2] &&
        bytes[3] === MAGIC_BYTES.docx[3];

      if (!isZip) {
        return {
          isValid: false,
          fileType: 'docx',
          fileName,
          fileSize,
          mimeType,
          error: 'Tệp không phải là định dạng Word .docx hợp lệ (chữ ký tệp nén OpenXML không đúng).',
        };
      }
    } else if (detectedFormat === 'tex' || detectedFormat === 'txt') {
      // Check for binary/null bytes to ensure it's plain text
      let hasNullByte = false;
      const sampleSize = Math.min(bytes.length, 512);
      for (let i = 0; i < sampleSize; i++) {
        if (bytes[i] === 0x00) {
          hasNullByte = true;
          break;
        }
      }

      if (hasNullByte) {
        return {
          isValid: false,
          fileType: detectedFormat,
          fileName,
          fileSize,
          mimeType,
          error: `Tệp .${detectedFormat} chứa ký tự nhị phân không hợp lệ. Vui lòng lưu tệp với mã hóa văn bản UTF-8.`,
        };
      }
    }

    return {
      isValid: true,
      fileType: detectedFormat,
      fileName,
      fileSize,
      mimeType: mimeType || `application/${detectedFormat}`,
    };
  } catch (err: any) {
    return {
      isValid: false,
      fileType: detectedFormat,
      fileName,
      fileSize,
      mimeType,
      error: `Không thể đọc nội dung tệp: ${err.message || 'Lỗi không xác định'}`,
    };
  }
}
