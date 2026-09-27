import React, { useMemo } from 'react';
import { parseLatexContent, renderFormulaToHtml } from '../../lib/latex';

interface LatexRendererProps {
  content: string;
  className?: string;
}

export const LatexRenderer: React.FC<LatexRendererProps> = ({ content, className = '' }) => {
  const parts = useMemo(() => parseLatexContent(content), [content]);

  return (
    <span className={`inline-block ${className}`}>
      {parts.map((part, index) => {
        if (part.type === 'text') {
          return <span key={index}>{part.content}</span>;
        }

        const isBlock = part.type === 'block-math';
        const html = renderFormulaToHtml(part.content, isBlock);

        if (isBlock) {
          return (
            <div
              key={index}
              className="my-2 overflow-x-auto text-center"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        }

        return (
          <span
            key={index}
            className="inline-block mx-1"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      })}
    </span>
  );
};
