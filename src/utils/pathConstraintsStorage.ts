import type { PathConstraints } from '../services/graph/constrainedPaths';

/** Path search constraints of the Insights panel, kept per dossier in this browser */
const PREFIX = 'zn-path-constraints:';

/** Dates come back from JSON as strings */
function revive(raw: unknown): PathConstraints {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const c = { ...(raw as PathConstraints) };
  if (c.period) {
    const date = (v: unknown) => {
      if (typeof v !== 'string' && !(v instanceof Date)) return null;
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? null : d;
    };
    c.period = { ...c.period, start: date(c.period.start), end: date(c.period.end) };
  }
  return c;
}

export function readPathConstraints(dossierId: string | null): PathConstraints {
  if (!dossierId) return {};
  try {
    return revive(JSON.parse(localStorage.getItem(PREFIX + dossierId) ?? '{}'));
  } catch {
    return {};
  }
}

export function writePathConstraints(dossierId: string | null, constraints: PathConstraints): void {
  if (!dossierId) return;
  try {
    localStorage.setItem(PREFIX + dossierId, JSON.stringify(constraints));
  } catch {
    // Storage unavailable (private mode, quota): the constraints last the session
  }
}
