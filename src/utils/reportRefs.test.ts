import { describe, it, expect } from 'vitest';
import { replaceReportRefs, stripReportRefs, reportRefRegex } from './reportRefs';

const UUID = 'AAAAAAAA-bbbb-4ccc-8ddd-eeeeeeeeeeee';

describe('report references', () => {
  it('matches UUIDs in any case and the short ids of hand-written archives', () => {
    const text = `[[Jean|${UUID}]] et [[Marie|p1]] puis [[Lien|el-0]]`;
    expect([...text.matchAll(reportRefRegex())].map((m) => m[2])).toEqual([UUID, 'p1', 'el-0']);
  });

  it('leaves ids that are unsafe in a URL or an attribute alone', () => {
    expect([...'[[X|a"b]] [[Y|a b]]'.matchAll(reportRefRegex())]).toHaveLength(0);
  });

  it('rewrites and strips references', () => {
    expect(replaceReportRefs('voir [[Jean|p1]]', (label, id) => `[[${label}|${id.toUpperCase()}]]`)).toBe('voir [[Jean|P1]]');
    expect(stripReportRefs('voir [[Jean|p1]] et [[Marie|p2]]')).toBe('voir Jean et Marie');
  });
});
