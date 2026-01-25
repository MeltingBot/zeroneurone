import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Link2, Network, CircleOff, GitBranch, Copy } from 'lucide-react';
import { useInvestigationStore, useInsightsStore } from '../../stores';

interface StatItemProps {
  icon: React.ReactNode;
  value: number;
  label: string;
  onClick?: () => void;
  highlight?: boolean;
}

function StatItem({ icon, value, label, onClick, highlight }: StatItemProps) {
  const baseClasses = "flex flex-col items-center p-2 rounded transition-colors";
  const interactiveClasses = onClick
    ? "cursor-pointer hover:bg-bg-secondary"
    : "";
  const highlightClasses = highlight
    ? "bg-accent/10 text-accent"
    : "text-text-secondary";

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`${baseClasses} ${interactiveClasses} ${highlightClasses}`}
      title={label}
    >
      <div className="flex items-center gap-1">
        {icon}
        <span className="text-sm font-semibold text-text-primary">{value}</span>
      </div>
      <span className="text-[10px] text-text-tertiary">{label}</span>
    </button>
  );
}

interface StatsOverviewProps {
  onStatClick?: (stat: 'elements' | 'links' | 'clusters' | 'isolated' | 'bridges' | 'duplicates') => void;
  activeStat?: string | null;
}

export function StatsOverview({ onStatClick, activeStat }: StatsOverviewProps) {
  const { t } = useTranslation('common');
  const { elements, links } = useInvestigationStore();
  const { clusters, isolated, bridges, similarLabels } = useInsightsStore();

  const stats = useMemo(() => ({
    elements: elements.length,
    links: links.length,
    clusters: clusters.length,
    isolated: isolated.length,
    bridges: bridges.length,
    duplicates: similarLabels.length,
  }), [elements.length, links.length, clusters.length, isolated.length, bridges.length, similarLabels.length]);

  return (
    <div className="grid grid-cols-3 gap-1 p-2 bg-bg-secondary border-b border-border-default">
      <StatItem
        icon={<Box size={12} />}
        value={stats.elements}
        label={t('stats.elements')}
        onClick={onStatClick ? () => onStatClick('elements') : undefined}
        highlight={activeStat === 'elements'}
      />
      <StatItem
        icon={<Link2 size={12} />}
        value={stats.links}
        label={t('stats.links')}
        onClick={onStatClick ? () => onStatClick('links') : undefined}
        highlight={activeStat === 'links'}
      />
      <StatItem
        icon={<Network size={12} />}
        value={stats.clusters}
        label={t('stats.clusters')}
        onClick={onStatClick ? () => onStatClick('clusters') : undefined}
        highlight={activeStat === 'clusters'}
      />
      <StatItem
        icon={<CircleOff size={12} />}
        value={stats.isolated}
        label={t('stats.isolated')}
        onClick={onStatClick ? () => onStatClick('isolated') : undefined}
        highlight={activeStat === 'isolated'}
      />
      <StatItem
        icon={<GitBranch size={12} />}
        value={stats.bridges}
        label={t('stats.bridges')}
        onClick={onStatClick ? () => onStatClick('bridges') : undefined}
        highlight={activeStat === 'bridges'}
      />
      <StatItem
        icon={<Copy size={12} />}
        value={stats.duplicates}
        label={t('stats.duplicates')}
        onClick={onStatClick ? () => onStatClick('duplicates') : undefined}
        highlight={activeStat === 'duplicates'}
      />
    </div>
  );
}
