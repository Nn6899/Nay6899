import React, { useState } from 'react';
import { Sigma, HelpCircle } from 'lucide-react';

interface LatexToolbarProps {
  onInsert: (snippet: string) => void;
}

interface MathItem {
  label: string;
  latex: string;
  tooltip: string;
}

const COMMON_MATH_ITEMS: MathItem[] = [
  { label: 'x²', latex: 'x^{2}', tooltip: 'Số mũ / Lũy thừa' },
  { label: 'x₁', latex: 'x_{1}', tooltip: 'Chỉ số dưới' },
  { label: 'a/b', latex: '\\frac{a}{b}', tooltip: 'Phân số' },
  { label: '√x', latex: '\\sqrt{x}', tooltip: 'Căn bậc hai' },
  { label: '∛x', latex: '\\sqrt[3]{x}', tooltip: 'Căn bậc ba' },
  { label: '±', latex: '\\pm', tooltip: 'Cộng trừ' },
  { label: '≠', latex: '\\ne', tooltip: 'Khác' },
  { label: '≤', latex: '\\le', tooltip: 'Nhỏ hơn hoặc bằng' },
  { label: '≥', latex: '\\ge', tooltip: 'Lớn hơn hoặc bằng' },
  { label: '≈', latex: '\\approx', tooltip: 'Xấp xỉ' },
  { label: '∞', latex: '\\infty', tooltip: 'Vô cực' },
  { label: 'π', latex: '\\pi', tooltip: 'Số Pi' },
  { label: 'α', latex: '\\alpha', tooltip: 'Alpha' },
  { label: 'β', latex: '\\beta', tooltip: 'Beta' },
  { label: 'Δ', latex: '\\Delta', tooltip: 'Delta' },
  { label: '∈', latex: '\\in', tooltip: 'Thuộc tập hợp' },
  { label: '⊂', latex: '\\subset', tooltip: 'Tập con' },
  { label: '∪', latex: '\\cup', tooltip: 'Hợp tập hợp' },
  { label: '∩', latex: '\\cap', tooltip: 'Giao tập hợp' },
  { label: 'ℝ', latex: '\\mathbb{R}', tooltip: 'Tập số thực' },
  { label: 'ℕ', latex: '\\mathbb{N}', tooltip: 'Tập số tự nhiên' },
  { label: 'ℤ', latex: '\\mathbb{Z}', tooltip: 'Tập số nguyên' },
  { label: 'lim', latex: '\\lim_{x \\to 0}', tooltip: 'Giới hạn' },
  { label: '∫', latex: '\\int_{a}^{b} f(x)\\,dx', tooltip: 'Tích phân' },
  { label: '∑', latex: '\\sum_{i=1}^{n}', tooltip: 'Tổng sigma' },
  { label: 'vec', latex: '\\vec{v}', tooltip: 'Vectơ' },
  { label: 'hệ pt', latex: '\\begin{cases} ax + by = c \\\\ dx + ey = f \\end{cases}', tooltip: 'Hệ phương trình' },
];

export const LatexToolbar: React.FC<LatexToolbarProps> = ({ onInsert }) => {
  const [showHelper, setShowHelper] = useState(false);

  return (
    <div className="bg-slate-50 border border-slate-200/90 rounded-xl p-2 space-y-1.5">
      <div className="flex items-center justify-between text-xs text-slate-600 px-1">
        <div className="flex items-center gap-1.5 font-semibold text-slate-700">
          <Sigma className="w-3.5 h-3.5 text-blue-600" />
          <span>Thanh công cụ ký hiệu toán học nhanh</span>
        </div>
        <button
          type="button"
          onClick={() => setShowHelper(!showHelper)}
          className="text-[11px] text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
        >
          <HelpCircle className="w-3 h-3" />
          <span>{showHelper ? 'Ẩn hướng dẫn' : 'Quy ước $...$'}</span>
        </button>
      </div>

      {showHelper && (
        <div className="p-2.5 bg-blue-50/70 border border-blue-100 rounded-lg text-xs text-blue-900 leading-relaxed">
          <p>
            • Đặt công thức toán trong cặp dấu <code className="bg-white px-1 py-0.5 rounded font-mono text-blue-700">$...$</code> cho công thức trên cùng dòng.
          </p>
          <p>
            • Dùng cặp dấu <code className="bg-white px-1 py-0.5 rounded font-mono text-blue-700">$$...$$</code> để công thức hiển thị ở giữa dòng (khối riêng biệt).
          </p>
          <p>
            • Ví dụ: <code className="bg-white px-1 py-0.5 rounded font-mono text-blue-700">$x^2 + 2x + 1 = 0$</code> sẽ hiển thị thành phương trình đại số tuyệt đẹp.
          </p>
        </div>
      )}

      {/* Buttons strip */}
      <div className="flex flex-wrap items-center gap-1">
        {COMMON_MATH_ITEMS.map(item => (
          <button
            key={item.label}
            type="button"
            title={item.tooltip}
            onClick={() => onInsert(`$${item.latex}$`)}
            className="px-2 py-1 bg-white hover:bg-blue-50 hover:text-blue-700 border border-slate-200 hover:border-blue-300 rounded-lg text-xs font-mono font-medium text-slate-700 transition-colors shadow-2xs active:scale-95"
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
};
