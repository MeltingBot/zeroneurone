import { useCallback, useMemo, isValidElement, Fragment, cloneElement } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useInvestigationStore, useSelectionStore, useViewStore } from '../../stores';

interface ReportMarkdownPreviewProps {
  content: string;
  className?: string;
}

// Regex to match [[Label|uuid]] element links (case-insensitive for UUID)
const ELEMENT_LINK_REGEX = /\[\[([^\]|]+)\|([a-fA-F0-9-]+)\]\]/g;

// Size mapping for element visual size (same as svgExportService)
const SIZE_MAP: Record<string, number> = { small: 40, medium: 56, large: 72 };
function getElementSizePixels(size: string | number | undefined): number {
  if (typeof size === 'number') return size;
  if (typeof size === 'string') return SIZE_MAP[size] ?? 56;
  return 56; // Default medium
}

// Generate slug from heading text for anchor links
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Extract text content from React children
function getTextContent(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(getTextContent).join('');
  if (isValidElement<{ children?: React.ReactNode }>(children)) {
    return getTextContent(children.props.children);
  }
  return '';
}

// Component to render element links inline
function ElementLinkRenderer({
  text,
  existingIds,
  onElementClick,
}: {
  text: string;
  existingIds: Set<string>;
  onElementClick: (id: string) => void;
}) {
  // Split text by element link pattern and render
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  const regex = new RegExp(ELEMENT_LINK_REGEX.source, 'g');

  while ((match = regex.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const [, label, id] = match;
    const exists = existingIds.has(id);

    if (exists) {
      parts.push(
        <button
          key={`${id}-${match.index}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onElementClick(id);
          }}
          className="text-accent hover:underline cursor-pointer font-medium"
        >
          {label}
        </button>
      );
    } else {
      parts.push(
        <span key={`${id}-${match.index}`} className="line-through text-text-tertiary">
          {label} <span className="text-xs">(deleted)</span>
        </span>
      );
    }

    lastIndex = regex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <>{parts}</>;
}

// Process children to find and replace element links
function processChildren(
  children: React.ReactNode,
  existingIds: Set<string>,
  onElementClick: (id: string) => void
): React.ReactNode {
  if (typeof children === 'string') {
    if (ELEMENT_LINK_REGEX.test(children)) {
      // Reset regex since test() advances lastIndex
      ELEMENT_LINK_REGEX.lastIndex = 0;
      return (
        <ElementLinkRenderer
          text={children}
          existingIds={existingIds}
          onElementClick={onElementClick}
        />
      );
    }
    return children;
  }

  if (Array.isArray(children)) {
    return children.map((child, i) => (
      <Fragment key={i}>{processChildren(child, existingIds, onElementClick)}</Fragment>
    ));
  }

  if (isValidElement(children)) {
    const childrenProp = (children.props as { children?: React.ReactNode }).children;
    if (childrenProp) {
      return cloneElement(
        children,
        children.props as Record<string, unknown>,
        processChildren(childrenProp, existingIds, onElementClick)
      );
    }
  }

  return children;
}

export function ReportMarkdownPreview({ content, className = '' }: ReportMarkdownPreviewProps) {
  const { elements, links } = useInvestigationStore();
  const { selectElement, clearSelection } = useSelectionStore();
  const { requestViewportChange, setDisplayMode, displayMode } = useViewStore();

  // Build maps for quick lookup
  const elementMap = useMemo(() => new Map(elements.map((el) => [el.id, el])), [elements]);
  const linkMap = useMemo(() => new Map(links.map((link) => [link.id, link])), [links]);

  // Combined ID set for existence check (elements + links)
  const existingIds = useMemo(() => {
    const ids = new Set<string>();
    elements.forEach((el) => ids.add(el.id));
    links.forEach((link) => ids.add(link.id));
    return ids;
  }, [elements, links]);

  // Handle element/link click
  const handleElementClick = useCallback(
    (id: string) => {
      const element = elementMap.get(id);
      const link = linkMap.get(id);

      if (!element && !link) return;

      // Switch to canvas view if not already
      if (displayMode !== 'canvas') {
        setDisplayMode('canvas');
      }

      clearSelection();

      if (element) {
        selectElement(element.id);

        // Center viewport on element
        const targetZoom = 1.0;
        const canvasWidth = window.innerWidth - 350;
        const canvasHeight = window.innerHeight;
        const elementWidth = getElementSizePixels(element.visual?.size);
        const elementHeight = Math.round(elementWidth * 0.4);
        const centerX = element.position.x + elementWidth / 2;
        const centerY = element.position.y + elementHeight / 2;

        setTimeout(() => {
          requestViewportChange({
            x: -centerX * targetZoom + canvasWidth / 2,
            y: -centerY * targetZoom + canvasHeight / 2,
            zoom: targetZoom,
          });
        }, 50);
      } else if (link) {
        // For links, select both connected elements
        selectElement(link.fromId);
        selectElement(link.toId);

        // Center on midpoint between the two elements
        const fromEl = elementMap.get(link.fromId);
        const toEl = elementMap.get(link.toId);
        if (fromEl && toEl) {
          const centerX = (fromEl.position.x + toEl.position.x) / 2;
          const centerY = (fromEl.position.y + toEl.position.y) / 2;
          const targetZoom = 0.8;
          const canvasWidth = window.innerWidth - 350;
          const canvasHeight = window.innerHeight;

          setTimeout(() => {
            requestViewportChange({
              x: -centerX * targetZoom + canvasWidth / 2,
              y: -centerY * targetZoom + canvasHeight / 2,
              zoom: targetZoom,
            });
          }, 50);
        }
      }
    },
    [elementMap, linkMap, selectElement, clearSelection, requestViewportChange, setDisplayMode, displayMode]
  );

  return (
    <div className={`markdown-preview ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => (
            <p className="mb-2 last:mb-0 text-text-primary">
              {processChildren(children, existingIds, handleElementClick)}
            </p>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold">
              {processChildren(children, existingIds, handleElementClick)}
            </strong>
          ),
          em: ({ children }) => (
            <em className="italic">
              {processChildren(children, existingIds, handleElementClick)}
            </em>
          ),
          h1: ({ children }) => {
            const id = slugify(getTextContent(children));
            return (
              <h1 id={id} className="text-base font-semibold mb-2">
                {processChildren(children, existingIds, handleElementClick)}
              </h1>
            );
          },
          h2: ({ children }) => {
            const id = slugify(getTextContent(children));
            return (
              <h2 id={id} className="text-sm font-semibold mb-2">
                {processChildren(children, existingIds, handleElementClick)}
              </h2>
            );
          },
          h3: ({ children }) => {
            const id = slugify(getTextContent(children));
            return (
              <h3 id={id} className="text-sm font-medium mb-1">
                {processChildren(children, existingIds, handleElementClick)}
              </h3>
            );
          },
          ul: ({ children }) => (
            <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>
          ),
          li: ({ children }) => (
            <li>{processChildren(children, existingIds, handleElementClick)}</li>
          ),
          a: ({ href, children }) => {
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
            <code className="px-1 py-0.5 bg-bg-tertiary rounded text-xs font-mono">{children}</code>
          ),
          pre: ({ children }) => (
            <pre className="p-2 bg-bg-tertiary rounded overflow-x-auto mb-2 text-xs">{children}</pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-border-strong pl-3 italic text-text-secondary mb-2">
              {processChildren(children, existingIds, handleElementClick)}
            </blockquote>
          ),
          hr: () => <hr className="my-2 border-border-default" />,
          table: ({ children }) => (
            <div className="overflow-x-auto mb-2">
              <table className="min-w-full text-xs border border-border-default">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-bg-tertiary">{children}</thead>,
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => (
            <tr className="border-b border-border-default last:border-b-0">{children}</tr>
          ),
          th: ({ children }) => (
            <th className="px-2 py-1.5 text-left font-semibold text-text-primary border-r border-border-default last:border-r-0">
              {processChildren(children, existingIds, handleElementClick)}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-2 py-1.5 text-text-secondary border-r border-border-default last:border-r-0">
              {processChildren(children, existingIds, handleElementClick)}
            </td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
