import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Rows3, LayoutList, ChevronDown, Check } from 'lucide-react';
import type { GroupingCriterion } from './useSwimlaneGrouping';

interface SwimlaneToolbarProps {
  mode: 'scatter' | 'swimlane';
  onModeChange: (mode: 'scatter' | 'swimlane') => void;
  criterion: string;
  onCriterionChange: (criterion: string) => void;
  availableCriteria: GroupingCriterion[];
  availableTags: string[];
  activeTags: string[] | null;
  onActiveTagsChange: (tags: string[] | null) => void;
}

export function SwimlaneToolbar({
  mode,
  onModeChange,
  criterion,
  onCriterionChange,
  availableCriteria,
  availableTags,
  activeTags,
  onActiveTagsChange,
}: SwimlaneToolbarProps) {
  const { t } = useTranslation('pages');
  const [criterionDropdownOpen, setCriterionDropdownOpen] = useState(false);
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const criterionRef = useRef<HTMLDivElement>(null);
  const tagRef = useRef<HTMLDivElement>(null);

  // Click outside to close dropdowns
  useEffect(() => {
    if (!criterionDropdownOpen && !tagDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (criterionDropdownOpen && criterionRef.current && !criterionRef.current.contains(e.target as Node)) {
        setCriterionDropdownOpen(false);
      }
      if (tagDropdownOpen && tagRef.current && !tagRef.current.contains(e.target as Node)) {
        setTagDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [criterionDropdownOpen, tagDropdownOpen]);

  const activeCriterionLabel =
    availableCriteria.find(c => c.id === criterion)?.label ??
    t('timeline.groupByTag');

  const allTagsActive = activeTags === null;
  const activeTagSet = new Set(activeTags ?? []);
  const activeCount = allTagsActive ? availableTags.length : activeTags.length;

  const toggleTag = (tag: string) => {
    if (allTagsActive) {
      // Was "all" → switch to all except this one
      onActiveTagsChange(availableTags.filter(t => t !== tag));
    } else if (activeTagSet.has(tag)) {
      const next = activeTags.filter(t => t !== tag);
      onActiveTagsChange(next);
    } else {
      const next = [...activeTags, tag];
      // If all are now selected, reset to null (= all)
      onActiveTagsChange(next.length === availableTags.length ? null : next);
    }
  };

  const toggleAll = () => {
    onActiveTagsChange(allTagsActive ? [] : null);
  };

  // Split criteria into standard (tag, source) and properties
  const standardCriteria = availableCriteria.filter(c => !c.id.startsWith('property:'));
  const propertyCriteria = availableCriteria.filter(c => c.id.startsWith('property:'));

  return (
    <>
      {/* Mode toggle */}
      <div className="flex items-center border border-border-default rounded overflow-hidden">
        <button
          onClick={() => onModeChange('scatter')}
          className={`px-2 h-6 text-[10px] flex items-center gap-1 ${
            mode === 'scatter'
              ? 'bg-accent text-white'
              : 'text-text-secondary hover:bg-bg-tertiary'
          }`}
          title={t('timeline.modeScatter')}
        >
          <Rows3 size={10} />
          {t('timeline.modeScatter')}
        </button>
        <button
          onClick={() => onModeChange('swimlane')}
          className={`px-2 h-6 text-[10px] flex items-center gap-1 ${
            mode === 'swimlane'
              ? 'bg-accent text-white'
              : 'text-text-secondary hover:bg-bg-tertiary'
          }`}
          title={t('timeline.modeSwimlanes')}
        >
          <LayoutList size={10} />
          {t('timeline.modeSwimlanes')}
        </button>
      </div>

      {/* Grouping criterion dropdown (only in swimlane mode) */}
      {mode === 'swimlane' && availableCriteria.length > 0 && (
        <div ref={criterionRef} className="relative ml-1">
          <button
            onClick={() => { setCriterionDropdownOpen(!criterionDropdownOpen); setTagDropdownOpen(false); }}
            className="flex items-center gap-1 px-2 h-6 text-[10px] text-text-secondary hover:bg-bg-tertiary rounded border border-border-default"
          >
            <span className="text-text-tertiary">{t('timeline.groupBy')}</span>
            <span className="font-medium text-text-primary">{activeCriterionLabel}</span>
            <ChevronDown size={10} />
          </button>

          {criterionDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 bg-bg-primary border border-border-default rounded shadow-lg z-50 min-w-[180px] max-h-[300px] overflow-y-auto">
              {/* Standard criteria (Tag, Source) */}
              {standardCriteria.map(c => (
                <button
                  key={c.id}
                  onClick={() => {
                    onCriterionChange(c.id);
                    setCriterionDropdownOpen(false);
                  }}
                  className={`w-full px-3 py-1.5 text-left text-xs hover:bg-bg-secondary ${
                    criterion === c.id
                      ? 'text-accent font-medium'
                      : 'text-text-primary'
                  }`}
                >
                  {c.label}
                </button>
              ))}

              {/* Properties section */}
              {propertyCriteria.length > 0 && (
                <>
                  <div className="px-3 py-1 text-[10px] text-text-tertiary uppercase tracking-wider border-t border-border-default mt-0.5 pt-1.5">
                    {t('timeline.properties')}
                  </div>
                  {propertyCriteria.map(c => (
                    <button
                      key={c.id}
                      onClick={() => {
                        onCriterionChange(c.id);
                        setCriterionDropdownOpen(false);
                      }}
                      className={`w-full px-3 py-1.5 text-left text-xs hover:bg-bg-secondary ${
                        criterion === c.id
                          ? 'text-accent font-medium'
                          : 'text-text-primary'
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tag filter dropdown (only in swimlane mode + tag criterion) */}
      {mode === 'swimlane' && criterion === 'tag' && availableTags.length > 0 && (
        <div ref={tagRef} className="relative">
          <button
            onClick={() => { setTagDropdownOpen(!tagDropdownOpen); setCriterionDropdownOpen(false); }}
            className={`flex items-center gap-1 px-2 h-6 text-[10px] rounded border ${
              allTagsActive
                ? 'text-text-secondary border-border-default hover:bg-bg-tertiary'
                : 'text-accent border-accent/30 bg-accent/5'
            }`}
          >
            <span>{activeCount}/{availableTags.length} tags</span>
            <ChevronDown size={10} />
          </button>

          {tagDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 bg-bg-primary border border-border-default rounded shadow-lg z-50 min-w-[160px] max-h-[300px] overflow-y-auto">
              {/* Select all */}
              <button
                onClick={toggleAll}
                className="w-full px-3 py-1.5 text-left text-xs hover:bg-bg-secondary text-text-secondary border-b border-border-default flex items-center gap-2"
              >
                <span className={`w-3 h-3 rounded-sm border flex items-center justify-center shrink-0 ${
                  allTagsActive ? 'bg-accent border-accent' : 'border-border-default'
                }`}>
                  {allTagsActive && <Check size={10} className="text-white" />}
                </span>
                {t('timeline.allTags')}
              </button>
              {availableTags.map(tag => {
                const isActive = allTagsActive || activeTagSet.has(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`w-full px-3 py-1.5 text-left text-xs hover:bg-bg-secondary flex items-center gap-2 ${
                      isActive ? 'text-text-primary' : 'text-text-tertiary'
                    }`}
                  >
                    <span className={`w-3 h-3 rounded-sm border flex items-center justify-center shrink-0 ${
                      isActive ? 'bg-accent border-accent' : 'border-border-default'
                    }`}>
                      {isActive && <Check size={10} className="text-white" />}
                    </span>
                    {tag}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );
}
