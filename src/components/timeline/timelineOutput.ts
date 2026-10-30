/** Timeline colours (density, causal gaps) and its CSV export */

import { toLocalDateKey } from '../../utils/dates';
import { type TimelineItem } from './timelineItems';
import { emitExport } from '../../plugins/pluginEventBus';
import { downloadBlob } from '../../utils/download';
import { escapeCsvField } from '../../utils/csv';

export function exportTimelineToCSV(items: TimelineItem[], filename: string): void {
  const typeLabels: Record<string, string> = { link: 'lien', event: 'evenement', property: 'propriete', created: 'ajout' };
  const formatDate = (d: Date) => toLocalDateKey(d);

  const sorted = [...items].sort((a, b) => a.start.getTime() - b.start.getTime());

  const header = 'date_debut,date_fin,type,label,sublabel,couleur';
  const rows = sorted.map(item => [
    formatDate(item.start),
    item.end ? formatDate(item.end) : '',
    typeLabels[item.type] || item.type,
    escapeCsvField(item.label),
    escapeCsvField((item.sublabel || '').replace(/\n/g, ' | ')),
    item.color,
  ].join(','));

  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, filename);
  emitExport('timeline-csv');
}

/** Gap between two causally linked events: short, medium, long */
export const CAUSAL_COLORS = {
  short: 'var(--color-success)',
  medium: 'var(--color-warning)',
  long: 'var(--color-error)',
} as const;

const accentShade = (percent: number) => `color-mix(in srgb, var(--color-accent) ${percent}%, transparent)`;

export function getDensityColor(count: number, max: number): string {
  if (count === 0) return accentShade(4);
  const ratio = count / max;
  if (ratio < 0.2) return accentShade(15);
  if (ratio < 0.4) return accentShade(30);
  if (ratio < 0.6) return accentShade(50);
  if (ratio < 0.8) return accentShade(70);
  return accentShade(90);
}
