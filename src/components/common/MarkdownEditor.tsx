import { useState, useCallback, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minRows?: number;
  className?: string;
  /** If true, show preview by default when there's content */
  previewByDefault?: boolean;
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder = 'Markdown: **gras**, *italique*, [lien](url)...',
  minRows = 4,
  className = '',
  previewByDefault: _previewByDefault = true,
}: MarkdownEditorProps) {
  // Always start in preview mode, user must click to edit
  const [isEditing, setIsEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Track if we should focus (only when user explicitly clicked to edit)
  const shouldFocusRef = useRef(false);

  // Focus textarea when switching to edit mode via explicit user action
  useEffect(() => {
    if (isEditing && shouldFocusRef.current && textareaRef.current) {
      textareaRef.current.focus();
      shouldFocusRef.current = false;
    }
  }, [isEditing]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  // Switch to preview when leaving the field
  const handleBlur = useCallback(() => {
    setIsEditing(false);
  }, []);

  // When clicking on preview, switch to edit mode (explicit user action)
  const handlePreviewClick = useCallback(() => {
    shouldFocusRef.current = true;
    setIsEditing(true);
  }, []);

  return (
    <div className={className}>
      {isEditing ? (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          className="w-full px-3 py-2 text-sm bg-bg-secondary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary placeholder:text-text-tertiary"
          style={{ minHeight: `${minRows * 24}px`, resize: 'vertical' }}
        />
      ) : (
        <div
          onClick={handlePreviewClick}
          className="w-full px-3 py-2 text-sm bg-bg-secondary border border-border-default rounded cursor-text overflow-auto"
          style={{ minHeight: `${minRows * 24}px` }}
        >
          {value ? (
            <MarkdownPreview content={value} />
          ) : (
            <span className="text-text-tertiary">{placeholder}</span>
          )}
        </div>
      )}
    </div>
  );
}

// Generate slug from heading text for anchor links
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Extract text content from React children
function getTextContent(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(getTextContent).join('');
  if (children && typeof children === 'object' && 'props' in children) {
    return getTextContent((children as React.ReactElement).props.children);
  }
  return '';
}

/** Read-only markdown preview component */
export function MarkdownPreview({ content, className = '' }: { content: string; className?: string }) {
  return (
    <div className={`markdown-preview ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0 text-text-primary">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          h1: ({ children }) => {
            const id = slugify(getTextContent(children));
            return <h1 id={id} className="text-base font-semibold mb-2">{children}</h1>;
          },
          h2: ({ children }) => {
            const id = slugify(getTextContent(children));
            return <h2 id={id} className="text-sm font-semibold mb-2">{children}</h2>;
          },
          h3: ({ children }) => {
            const id = slugify(getTextContent(children));
            return <h3 id={id} className="text-sm font-medium mb-1">{children}</h3>;
          },
          ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          a: ({ href, children }) => {
            // Anchor links (starting with #) - scroll within document
            if (href?.startsWith('#')) {
              return (
                <a
                  href={href}
                  className="text-accent hover:underline"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const targetId = href.slice(1);
                    const target = document.getElementById(targetId);
                    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                >
                  {children}
                </a>
              );
            }
            // External links - open in new tab
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {children}
              </a>
            );
          },
          code: ({ children }) => (
            <code className="px-1 py-0.5 bg-bg-tertiary rounded text-xs font-mono">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="p-2 bg-bg-tertiary rounded overflow-x-auto mb-2 text-xs">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-border-strong pl-3 italic text-text-secondary mb-2">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-2 border-border-default" />,
          table: ({ children }) => (
            <div className="overflow-x-auto mb-2">
              <table className="min-w-full text-xs border border-border-default">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-bg-tertiary">{children}</thead>
          ),
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => (
            <tr className="border-b border-border-default last:border-b-0">{children}</tr>
          ),
          th: ({ children }) => (
            <th className="px-2 py-1.5 text-left font-semibold text-text-primary border-r border-border-default last:border-r-0">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-2 py-1.5 text-text-secondary border-r border-border-default last:border-r-0">
              {children}
            </td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
