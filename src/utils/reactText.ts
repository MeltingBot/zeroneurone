import { isValidElement, type ReactNode } from 'react';

/** The plain text of rendered React children (a heading's content, say) */
export function getTextContent(children: ReactNode): string {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(getTextContent).join('');
  if (isValidElement<{ children?: ReactNode }>(children)) {
    return getTextContent(children.props.children);
  }
  return '';
}
