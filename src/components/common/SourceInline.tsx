import { Fragment, useMemo, type ReactNode } from 'react';
import { SOURCE_LINE_SEPARATOR, parseSourceLinks, splitSourceItems } from '../../utils/sourceLinks';
import { useSourceLinkRenderer } from '../../hooks/useSourceLinkRenderer';

/** A Source on one line (table cell): its sources separated by " · ", links clickable. */
export function SourceInline({ value }: { value: string }) {
  const { schemeNames, renderSegment, preview } = useSourceLinkRenderer();
  const items = useMemo(() => splitSourceItems(parseSourceLinks(value, schemeNames)), [value, schemeNames]);
  const content: ReactNode[] = items.map((item, i) => (
    <Fragment key={i}>
      {i > 0 && <span className="text-text-tertiary">{SOURCE_LINE_SEPARATOR}</span>}
      {item.map(renderSegment)}
    </Fragment>
  ));
  return (
    <>
      <span className="truncate">{content}</span>
      {preview}
    </>
  );
}
