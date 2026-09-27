export const QUESTION_EXTRACTION_SCHEMA = {
  type: 'ARRAY',
  description: 'Danh sách các câu hỏi trắc nghiệm được trích xuất từ tài liệu',
  items: {
    type: 'OBJECT',
    properties: {
      questionNumber: {
        type: 'INTEGER',
        description: 'Số thứ tự câu hỏi (ví dụ: 1, 2, 3...)',
      },
      type: {
        type: 'STRING',
        enum: ['multiple_choice', 'true_false', 'short_answer'],
        description: 'Loại câu hỏi trắc nghiệm',
      },
      content: {
        type: 'STRING',
        description: 'Nội dung câu hỏi. Giữ nguyên công thức toán học dưới dạng LaTeX kẹp giữa $...$ hoặc $$...$$. Tuyệt đối không dùng mã HTML.',
      },
      options: {
        type: 'ARRAY',
        description: 'Danh sách các lựa chọn (A, B, C, D) hoặc khẳng định (a, b, c, d)',
        items: {
          type: 'STRING',
        },
      },
      correctAnswer: {
        type: 'STRING',
        description: 'Đáp án đúng. Với trắc nghiệm chọn 1 đáp án: ký tự A, B, C hoặc D. Với câu hỏi ngắn: giá trị kết quả.',
      },
      explanation: {
        type: 'STRING',
        description: 'Lời giải hoặc hướng dẫn chi tiết nếu có trong tài liệu. Giữ nguyên công thức toán LaTeX.',
      },
    },
    required: ['questionNumber', 'type', 'content', 'options'],
  },
};
