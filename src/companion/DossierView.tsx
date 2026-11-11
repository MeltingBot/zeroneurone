/**
 * An open dossier on the phone: element list and detail, comments, capture,
 * settings. Reads and writes the shared Y.Doc through useCompanionSession.
 */

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Y from 'yjs';
import {
  ArrowDownAZ, ArrowLeft, Camera, Check, ChevronRight, Clock, FileText, Link2, List, Loader2, Paperclip, Plus, Tag, Trash2, Map as MapIcon, MapPin, MessageSquare, Pencil, RotateCcw, Search, Send, Settings, Waypoints, X,
} from 'lucide-react';
import type { Comment, Element, Link, LinkDirection } from '../types';
import { getYMaps } from '../types/yjs';
import { assembleChunks } from '../services/assetSync';
import { eraseLocalCopy } from './erase';
import { safeDataImageUrl } from '../utils/escapeHtml';
import type { CompanionSession } from './sessions';
import { removeSession } from './sessions';
import { clearPending } from './pending';
import { closeCompanionSession, useCompanionSession, type AssetEntry } from './useCompanionSession';
import { addComment, createCapture, deleteElement, deleteLink, updateLink, FileTooLargeError, setCommentResolved, UnsupportedFileError } from './actions';
import { ATTACHMENT_ACCEPT, isAllowedAttachment } from '../utils/attachmentTypes';
import { navigate } from './router';
import { AppSettings } from './AppSettings';
import { IconAction } from './IconAction';
import { useRevealed } from './reveal';
import { EventsSection } from './Events';
import { locateOnce } from './geolocate';
import { captureFromShare, deleteShare, readShare } from './shareInbox';
import { usePeerMarks, useRemoteTouches, type PeerMark } from './activity';
import { linkCounts, readSort, saveSort, sortElements, type ElementSort } from './sorting';

const SORTS = [
  { id: 'recent', Icon: Clock },
  { id: 'name', Icon: ArrowDownAZ },
  { id: 'links', Icon: Waypoints },
] as const;
import { NeighborhoodGraph } from './NeighborhoodGraph';
import { AddProperty, ElementTags, LabelEditor, NotesSection, PropertyRows } from './ElementEditors';
import { DirectionIcon, LinkCreator } from './LinkCreator';
import { DIRECTIONS } from './linkDirections';
import { TabMembership, TabsBar, TabsManager } from './Tabs';
import type { CompanionData } from './useCompanionSession';
import { useCompanionSearch, useSearchIndex, type Excerpt } from './search';
import { CompanionTimeline } from './CompanionTimeline';
import { formatPreciseDate } from '../utils/dates';

const CompanionMap = lazy(() => import('./CompanionMap'));
import { choiceButton, inputClass, primaryButton, dangerButton, secondaryButton, sectionTitle } from './ui';

type Tab = 'elements' | 'map' | 'timeline' | 'comments' | 'capture' | 'settings';

type Session = ReturnType<typeof useCompanionSession>;

export function DossierView({ session }: { session: CompanionSession }) {
  const { t } = useTranslation('companion');
  const s = useCompanionSession(session);
  /** A share from another app to turn into a capture (Android "Share to") */
  const [shareId, setShareId] = useState<string | null>(
    () => (window.history.state as { shareId?: string } | null)?.shareId ?? null,
  );
  const [tab, setTab] = useState<Tab>(() => (shareId ? 'capture' : 'elements'));
  // The open element lives in the history entry, so the phone's back gesture
  // or button closes it instead of leaving the dossier
  const [selected, setSelected] = useState<string | null>(() => readSelected());
  /** The open element's name being edited */
  const [renaming, setRenaming] = useState(false);
  /** Event to bring into view on the open element (a search hit in its events) */
  const [focusedEvent, setFocusedEvent] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [managingTabs, setManagingTabs] = useState(false);
  // Shown canvas tab, remembered per dossier on this phone
  const tabKey = `zeroneurone-companion-tab:${session.dossierId}`;
  const [activeTab, setActiveTab] = useState<string | null>(() => {
    try { return localStorage.getItem(tabKey); } catch { return null; }
  });
  const selectTab = (id: string | null) => {
    setActiveTab(id);
    try {
      if (id) localStorage.setItem(tabKey, id);
      else localStorage.removeItem(tabKey);
    } catch { /* storage unavailable */ }
  };
  const shownTab = activeTab ? s.data.tabs.find((tab) => tab.id === activeTab) ?? null : null;
  /** The dossier as the shown tab sees it: its elements, links between them */
  /** Tags every shown element must carry */
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const view = useMemo<CompanionData>(() => {
    if (!shownTab && tagFilter.length === 0) return s.data;
    const members = shownTab ? new Set(shownTab.memberElementIds) : null;
    const elements = s.data.elements.filter((e) =>
      (!members || members.has(e.id)) && tagFilter.every((tag) => e.tags.includes(tag)));
    const kept = new Set(elements.map((e) => e.id));
    return {
      ...s.data,
      elements,
      links: s.data.links.filter((l) => kept.has(l.fromId) && kept.has(l.toId)),
    };
  }, [s.data, shownTab, tagFilter]);
  /** Shows the elements carrying this tag (added to the tags already chosen) */
  const filterByTag = (tag: string) => {
    setTagFilter((current) => (current.includes(tag) ? current : [...current, tag]));
    setQuery('');
    if (readSelected()) window.history.back();
    setTab('elements');
  };
  const mainRef = useRef<HTMLElement>(null);
  /** Scroll of the list a detail was opened from, restored when it closes */
  const listScroll = useRef(0);
  useSearchIndex(s.data);

  // The page under the fixed view must not scroll (browser bars, bounce)
  useEffect(() => {
    document.documentElement.classList.add('zn-companion-locked');
    return () => document.documentElement.classList.remove('zn-companion-locked');
  }, []);

  useEffect(() => {
    const onPop = () => {
      const next = readSelected();
      setSelected(next);
      setFocusedEvent((window.history.state as { companionEvent?: string | null } | null)?.companionEvent ?? null);
      if (!next) requestAnimationFrame(() => mainRef.current?.scrollTo(0, listScroll.current));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const open = (id: string, eventId?: string) => {
    if (!readSelected()) listScroll.current = mainRef.current?.scrollTop ?? 0;
    window.history.pushState({ ...(window.history.state ?? {}), companionElement: id, companionEvent: eventId ?? null }, '');
    setSelected(id);
    setRenaming(false);
    setFocusedEvent(eventId ?? null);
    mainRef.current?.scrollTo(0, 0);
  };
  const closeDetail = () => {
    if (readSelected()) window.history.back();
    else setSelected(null);
  };

  const title = s.data.name || session.name || t('home.untitled');
  const element = selected ? s.data.elements.find((e) => e.id === selected) ?? null : null;
  const openComments = s.data.comments.filter((c) => !c.resolved).length;

  const tabs: { id: Tab; icon: typeof List; label: string; badge?: number }[] = [
    { id: 'elements', icon: List, label: t('tabs.elements') },
    { id: 'map', icon: MapIcon, label: t('tabs.map') },
    { id: 'timeline', icon: Clock, label: t('tabs.timeline') },
    { id: 'comments', icon: MessageSquare, label: t('tabs.comments'), badge: openComments },
    { id: 'capture', icon: Plus, label: t('tabs.capture') },
  ];

  const searchFor = (q: string) => {
    setQuery(q);
    if (!q) return;
    if (element) closeDetail();
    if (tab !== 'elements') {
      setTab('elements');
      mainRef.current?.scrollTo(0, 0);
    }
  };

  const switchTab = (id: Tab) => {
    if (element) closeDetail();
    listScroll.current = 0;
    setTab(id);
    mainRef.current?.scrollTo(0, 0);
  };

  return (
    // Fixed to the screen: only <main> scrolls. A scrolling page made the
    // browser hide its address bar and the tab bar jump with it.
    <div className="fixed inset-0 bg-bg-primary text-text-primary flex flex-col">
      <header className="flex items-center gap-1 px-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2 border-b border-border-default">
        <button
          type="button"
          className="w-10 h-10 flex items-center justify-center rounded text-text-secondary active:bg-bg-secondary"
          onClick={() => (element ? closeDetail() : navigate(''))}
          aria-label={t('back')}
        >
          <ArrowLeft size={20} />
        </button>
        <span className="flex-1 min-w-0 text-base font-semibold truncate">
          {element ? element.label || t('element.untitled') : title}
        </span>
        {element && !s.data.closed && !renaming && (
          <button
            type="button"
            className="w-9 h-10 flex items-center justify-center text-text-tertiary flex-shrink-0"
            onClick={() => setRenaming(true)}
            aria-label={t('edit.label')}
            title={t('edit.label')}
          >
            <Pencil size={15} />
          </button>
        )}
        {s.pending > 0 && (
          <button
            type="button"
            className="text-xs text-warning whitespace-nowrap px-1"
            onClick={() => switchTab('settings')}
          >
            {t('status.pending', { count: s.pending })}
          </button>
        )}
        <SettingsButton session={s} active={tab === 'settings' && !element} onClick={() => switchTab('settings')} />
      </header>

      {/* Search, on every screen: typing shows the results */}
      <SearchBar
        query={query}
        onQuery={searchFor}
        tags={tagFilter}
        onRemoveTag={(tag) => setTagFilter((current) => current.filter((t) => t !== tag))}
      />
      <TabsBar
        tabs={s.data.tabs}
        active={shownTab?.id ?? null}
        onSelect={(id) => { selectTab(id); if (element) closeDetail(); }}
        onManage={() => setManagingTabs(true)}
        writable={!s.data.closed}
      />
      {managingTabs && <TabsManager s={s} onClose={() => setManagingTabs(false)} />}

      {s.error && <p className="px-4 py-2 text-xs text-error border-b border-border-default">{s.error}</p>}
      {s.syncState.error && !s.error && (
        <p className="px-4 py-2 text-xs text-error border-b border-border-default">{s.syncState.error}</p>
      )}
      {s.data.closed && (
        <p className="px-4 py-2 text-xs text-text-secondary bg-bg-secondary border-b border-border-default">{t('status.closed')}</p>
      )}

      <main ref={mainRef} className={`flex-1 min-h-0 overscroll-contain ${tab === 'map' && !element ? 'relative overflow-hidden' : 'overflow-y-auto'}`}>
        {element ? (
          <ElementDetail key={element.id} element={element} s={s} renaming={renaming} onRenamed={() => setRenaming(false)} onOpen={open} onDeleted={closeDetail} tabId={shownTab?.id ?? null} focusedEventId={focusedEvent} onTag={filterByTag} />
        ) : tab === 'elements' ? (
          <>
            <InstallHint />
            <ElementsTab s={s} data={view} query={query} onOpen={open} onTag={filterByTag} viewKey={`${shownTab?.id ?? ''}|${tagFilter.join('|')}`} />
          </>
        ) : tab === 'map' ? (
          <Suspense fallback={<div className="flex justify-center pt-16"><Loader2 size={20} className="animate-spin text-text-tertiary" /></div>}>
            <CompanionMap elements={view.elements} links={view.links} assets={s.data.assets} onOpen={open} />
          </Suspense>
        ) : tab === 'timeline' ? (
          <CompanionTimeline elements={view.elements} links={view.links} onOpen={open} scroller={mainRef} viewKey={`${shownTab?.id ?? ''}|${tagFilter.join('|')}`} />
        ) : tab === 'comments' ? (
          <CommentsTab s={s} onOpen={open} />
        ) : tab === 'capture' ? (
          <CaptureTab
            s={s}
            tabId={shownTab?.id ?? null}
            shareId={shareId}
            onCreated={(id) => {
              if (shareId) {
                void deleteShare(shareId).catch(() => undefined);
                setShareId(null);
              }
              setTab('elements');
              open(id);
            }}
          />
        ) : (
          <SettingsTab s={s} session={session} />
        )}
      </main>

      <nav className="grid grid-cols-5 border-t border-border-default bg-bg-secondary pb-[env(safe-area-inset-bottom)]">
        {tabs.map(({ id, icon: Icon, label, badge }) => {
          const active = tab === id && !element;
          return (
            <button
              key={id}
              type="button"
              onClick={() => switchTab(id)}
              aria-current={active ? 'page' : undefined}
              className={`relative flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[11px] leading-tight ${active ? 'text-accent' : 'text-text-secondary'}`}
            >
              <span className="relative">
                <Icon size={20} />
                {!!badge && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-4 h-4 px-1 rounded-full bg-accent text-white text-[10px] leading-4 text-center">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </span>
              {label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function readSelected(): string | null {
  const state = window.history.state as { companionElement?: string } | null;
  return state?.companionElement ?? null;
}

function SettingsButton({ session: s, active, onClick }: { session: Session; active: boolean; onClick: () => void }) {
  const { t } = useTranslation('companion');
  const { connected, reconnecting, peerCount } = s.syncState;
  const status = connected
    ? t('status.connected', { count: peerCount })
    : reconnecting ? t('status.reconnecting') : t('status.offline');
  const color = connected ? 'bg-success' : reconnecting ? 'bg-warning' : 'bg-text-tertiary';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative w-10 h-10 flex items-center justify-center rounded active:bg-bg-secondary ${active ? 'text-accent' : 'text-text-secondary'}`}
      title={status}
      aria-label={`${t('tabs.settings')} · ${status}`}
    >
      <Settings size={20} />
      <span className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full border-2 border-bg-primary ${color}`} />
    </button>
  );
}

/** iOS outside the home screen: Safari may wipe the site's data after ~7 days unused */
function needsInstall(): boolean {
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return isIos && !standalone;
}

const INSTALL_HINT_KEY = 'zeroneurone-companion-install-hint';

function InstallHint() {
  const { t } = useTranslation('companion');
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(INSTALL_HINT_KEY) === '1'; } catch { return false; }
  });
  if (hidden || !needsInstall()) return null;
  return (
    <div className="flex items-start gap-1 pl-4 pr-1 py-1 text-xs text-text-secondary bg-bg-secondary border-b border-border-default">
      <span className="flex-1 py-2">{t('install.hint')}</span>
      <button
        type="button"
        className="w-9 h-9 flex items-center justify-center text-text-tertiary"
        aria-label={t('install.dismiss')}
        onClick={() => {
          try { localStorage.setItem(INSTALL_HINT_KEY, '1'); } catch { /* storage unavailable */ }
          setHidden(true);
        }}
      >
        <X size={16} />
      </button>
    </div>
  );
}

// ============================================================================
// ELEMENTS
// ============================================================================

function ElementsTab({ s, data, query, onOpen, onTag, viewKey }: {
  s: Session;
  /** The dossier, or the shown tab's part of it */
  data: CompanionData;
  query: string;
  onOpen: (id: string, eventId?: string) => void;
  onTag: (tag: string) => void;
  /** Which part of the dossier is shown (canvas tab, tags) */
  viewKey: string;
}) {
  const { t, i18n } = useTranslation('companion');
  const peers = usePeerMarks(s.ydoc, s.syncState.connected);
  const touched = useRemoteTouches(s.ydoc);
  // "#…" looks for a tag, not for text
  const tagQuery = query.startsWith('#') ? query.slice(1).trim().toLowerCase() : null;
  const hits = useCompanionSearch(data, tagQuery === null ? query : '', t('element.untitled'));
  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of data.elements) for (const tag of e.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [data.elements]);
  const [sort, setSort] = useState<ElementSort>(readSort);
  // Links counted over the whole dossier, whatever tab is shown
  const counts = useMemo(() => linkCounts(s.data.links), [s.data.links]);
  const recent = useMemo(
    () => sortElements(data.elements.filter((e) => !e.isAnnotation), sort, counts, i18n.language),
    [data.elements, sort, counts, i18n.language],
  );
  const pickSort = (next: ElementSort) => {
    setSort(next);
    saveSort(next);
  };
  const byId = useMemo(() => new Map(data.elements.map((e) => [e.id, e])), [data.elements]);
  // Shown in batches: thousands of rows at once took seconds on a phone
  const { count: shownRows, more: moreRows, sentinel: rowsSentinel } = useRevealed((hits ?? recent).length, `${viewKey}|${sort}|${query}`);

  if (s.data.elements.length === 0 && s.openFailed && !s.ydoc) {
    return (
      <div className="flex flex-col items-center gap-3 px-8 pt-16 text-center text-text-secondary">
        <p className="text-sm">{t('elements.openFailed')}</p>
        <IconAction icon={RotateCcw} label={t('elements.retry')} onClick={() => window.location.reload()} />
      </div>
    );
  }

  if (s.data.elements.length === 0) {
    const fetching = !s.ydoc || (s.syncState.connected && s.syncState.syncing);
    return (
      <div className="flex flex-col items-center gap-3 px-8 pt-16 text-center text-text-secondary">
        {fetching && <Loader2 size={20} className="animate-spin text-text-tertiary" />}
        <p className="text-sm">{fetching ? t('elements.loading') : s.syncState.peerCount === 0 ? t('elements.waitingPeer') : t('elements.emptyDossier')}</p>
      </div>
    );
  }

  if (tagQuery !== null) {
    const matching = tagCounts.filter(([tag]) => tag.toLowerCase().includes(tagQuery));
    return matching.length === 0 ? (
      <p className="text-sm text-text-tertiary text-center pt-8">{t('tags.none')}</p>
    ) : (
      <ul className="divide-y divide-border-default">
        {matching.map(([tag, count]) => (
          <li key={tag}>
            <button
              type="button"
              className="w-full min-h-12 flex items-center gap-3 px-4 py-2 text-left active:bg-bg-secondary"
              onClick={() => onTag(tag)}
            >
              <Tag size={16} className="text-text-tertiary flex-shrink-0" />
              <span className="flex-1 min-w-0 text-sm truncate">{tag}</span>
              <span className="text-xs text-text-tertiary tabular-nums">{count}</span>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div>
      {hits && <p className="px-4 pt-2 pb-1 text-xs text-text-tertiary">{t('elements.results', { count: hits.length })}</p>}
      {!hits && recent.length > 1 && (
        <div className="flex justify-end gap-1 px-2 pt-1" role="group" aria-label={t('sort.title')}>
          {SORTS.map(({ id, Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={sort === id}
              aria-label={t(`sort.${id}`)}
              title={t(`sort.${id}`)}
              onClick={() => pickSort(id)}
              className={`w-9 h-9 flex items-center justify-center rounded ${sort === id ? 'text-accent bg-accent-light' : 'text-text-tertiary'}`}
            >
              <Icon size={17} />
            </button>
          ))}
        </div>
      )}
      {!hits && data.elements.length === 0 && (
        <p className="text-sm text-text-tertiary text-center pt-8">{t('elements.noMatch')}</p>
      )}

      {hits && hits.length === 0 ? (
        <p className="text-sm text-text-tertiary text-center pt-8">{t('elements.noMatch')}</p>
      ) : (
        <ul className="divide-y divide-border-default">
          {hits
            ? hits.slice(0, shownRows).map((hit, i) => {
                const el = byId.get(hit.elementId);
                return (
                  <ResultRow
                    key={`${hit.elementId}-${i}`}
                    title={hit.title}
                    subtitle={hit.isLink ? null : el && el.tags.length > 0 ? el.tags.join(', ') : null}
                    excerpt={hit.excerpt}
                    thumb={!hit.isLink && el ? firstThumbnail(el, data.assets) : null}
                    isLink={hit.isLink}
                    peers={hit.isLink ? undefined : peers.get(hit.elementId)}
                    touched={!hit.isLink && touched.has(hit.elementId)}
                    onClick={() => onOpen(hit.elementId, hit.eventId)}
                  />
                );
              })
            : recent.slice(0, shownRows).map((e) => (
                <ResultRow
                  key={e.id}
                  title={e.label || t('element.untitled')}
                  subtitle={e.tags.length > 0 ? e.tags.join(', ') : null}
                  excerpt={null}
                  thumb={firstThumbnail(e, data.assets)}
                  isLink={false}
                  peers={peers.get(e.id)}
                  touched={touched.has(e.id)}
                  linkCount={sort === 'links' ? counts.get(e.id) ?? 0 : undefined}
                  onClick={() => onOpen(e.id)}
                />
              ))}
        </ul>
      )}
      {moreRows && <div ref={rowsSentinel} data-rows-limited className="h-px" />}
    </div>
  );
}

function SearchBar({ query, onQuery, tags, onRemoveTag }: {
  query: string;
  onQuery: (q: string) => void;
  tags: string[];
  onRemoveTag: (tag: string) => void;
}) {
  const { t } = useTranslation('companion');
  return (
    <div className="px-3 py-2 border-b border-border-default bg-bg-primary space-y-2">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
        <input
          type="text"
          inputMode="search"
          enterKeyHint="search"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className={`${inputClass} pl-9 ${query ? 'pr-10' : ''}`}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          placeholder={t('elements.searchHint')}
          aria-label={t('elements.search')}
        />
        {query && (
          <button
            type="button"
            className="absolute right-0 top-0 h-full w-10 flex items-center justify-center text-text-tertiary"
            onClick={() => onQuery('')}
            aria-label={t('elements.clear')}
          >
            <X size={16} />
          </button>
        )}
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onRemoveTag(tag)}
              aria-label={t('tags.remove', { tag })}
              className="h-8 pl-2.5 pr-1.5 inline-flex items-center gap-1 rounded-full border border-accent bg-accent-light text-accent text-sm"
            >
              {tag}
              <X size={14} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ResultRow({ title, subtitle, excerpt, thumb, isLink, peers, touched, linkCount, onClick }: {
  title: string;
  subtitle: string | null;
  excerpt: Excerpt | null;
  thumb: string | null;
  isLink: boolean;
  /** Who is on this element elsewhere */
  peers?: PeerMark[];
  /** Just changed from another device */
  touched?: boolean;
  /** Shown when the list is ordered by links */
  linkCount?: number;
  onClick: () => void;
}) {
  return (
    <li className={`transition-colors duration-700 ${touched ? 'bg-accent-light' : ''}`} data-touched={touched ? 'true' : undefined}>
      <button type="button" className="w-full min-h-14 flex items-center gap-3 px-4 py-2 text-left active:bg-bg-secondary" onClick={onClick}>
        {thumb && <img src={thumb} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0 border border-border-default" />}
        {isLink && <Link2 size={16} className="text-text-tertiary flex-shrink-0" />}
        <span className="flex-1 min-w-0">
          <span className="block text-sm truncate">{title}</span>
          {excerpt ? (
            <span className="block text-xs text-text-tertiary line-clamp-2">
              {excerpt.before}<mark className="bg-accent-light text-text-primary rounded-sm">{excerpt.match}</mark>{excerpt.after}
            </span>
          ) : subtitle ? (
            <span className="block text-xs text-text-tertiary truncate">{subtitle}</span>
          ) : null}
        </span>
        {peers && peers.length > 0 && <PeerBadges peers={peers} />}
        {linkCount !== undefined && (
          <span className="flex items-center gap-1 text-xs text-text-tertiary tabular-nums flex-shrink-0">
            <Link2 size={13} />
            {linkCount}
          </span>
        )}
        <ChevronRight size={16} className="text-text-tertiary flex-shrink-0" />
      </button>
    </li>
  );
}

/** Who is on an element: the first name, filled when they move or edit it */
function PeerBadges({ peers }: { peers: PeerMark[] }) {
  const { t } = useTranslation('companion');
  const label = peers.map((p) => t(p.active ? 'peers.editing' : 'peers.viewing', { name: p.name })).join(', ');
  // The one editing first
  const shown = [...peers].sort((a, b) => Number(b.active) - Number(a.active))[0];
  return (
    <span className="flex items-center gap-1 flex-shrink-0 min-w-0 max-w-[45%]" role="img" aria-label={label} title={label}>
      <span
        className="h-6 px-2 rounded-full border text-xs font-medium truncate leading-[22px]"
        style={shown.active
          ? { backgroundColor: shown.color, borderColor: shown.color, color: '#fff' }
          : { backgroundColor: 'var(--color-bg-primary)', borderColor: shown.color, color: shown.color }}
      >
        {shown.name}
      </span>
      {peers.length > 1 && <span className="text-xs text-text-tertiary">+{peers.length - 1}</span>}
    </span>
  );
}

function firstThumbnail(element: Element, assets: Map<string, AssetEntry>): string | null {
  for (const id of element.assetIds) {
    const url = assets.get(id)?.thumbnailDataUrl;
    if (url) return safeDataImageUrl(url);
  }
  return null;
}

function formatPeriod(element: Element, language: string): string | null {
  const r = element.dateRange;
  if (!r || (!r.start && !r.end)) return null;
  const fmt = (d: Date | null) => (d ? formatPreciseDate(d, r.precision, r.approximate, language) : '…');
  return `${fmt(r.start)} – ${fmt(r.end)}`;
}

function ElementDetail({ element, s, renaming, onRenamed, onOpen, onDeleted, tabId, focusedEventId, onTag }: {
  element: Element;
  s: Session;
  /** The name is being edited (pencil in the header) */
  renaming: boolean;
  onRenamed: () => void;
  onOpen: (id: string) => void;
  onDeleted: () => void;
  /** Shown canvas tab: an element created from here goes into it */
  tabId: string | null;
  /** Event brought into view on opening */
  focusedEventId: string | null;
  /** Shows the dossier's elements carrying this tag */
  onTag: (tag: string) => void;
}) {
  const { t, i18n } = useTranslation('companion');
  const [linking, setLinking] = useState(false);
  const [addingProperty, setAddingProperty] = useState(false);
  const byId = useMemo(() => new Map(s.data.elements.map((e) => [e.id, e])), [s.data.elements]);
  const links = s.data.links.filter((l) => l.fromId === element.id || l.toId === element.id);
  const comments = s.data.comments
    .filter((c) => c.targetId === element.id)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const collected = element.date ? formatPreciseDate(element.date, undefined, false, i18n.language) : null;
  const period = formatPeriod(element, i18n.language);
  const geo = element.geo?.type === 'point' ? element.geo : element.geo?.center ?? null;

  return (
    <div className="p-4 space-y-5">
      {renaming && <LabelEditor element={element} s={s} onDone={onRenamed} />}

      <ElementTags element={element} s={s} writable={!s.data.closed} onTag={onTag} />

      <NotesSection element={element} s={s} writable={!s.data.closed} />

      {element.assetIds.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {element.assetIds.map((id) => (
            <AssetTile key={id} asset={s.data.assets.get(id)} ydoc={s.ydoc} />
          ))}
        </div>
      )}

      {(element.properties.length > 0 || collected || period || element.source || geo || !s.data.closed) && (
        <section className="space-y-1.5">
          <div className="flex items-center">
            <h2 className={`${sectionTitle} flex-1`}>{t('element.details')}</h2>
            {!s.data.closed && !addingProperty && (
              <button
                type="button"
                className="-my-2 w-10 h-10 inline-flex items-center justify-center text-accent"
                onClick={() => setAddingProperty(true)}
                aria-label={t('edit.addProperty')}
                title={t('edit.addProperty')}
              >
                <Plus size={20} />
              </button>
            )}
          </div>
          <div className="text-sm divide-y divide-border-default">
            {period && <Row label={t('element.period')} value={period} />}
            {collected && <Row label={t('element.date')} value={collected} />}
            {element.source && <Row label={t('element.source')} value={element.source} />}
            {geo && (
              <Row
                label={t('element.position')}
                value={
                  <a
                    className="text-accent underline"
                    href={`https://www.openstreetmap.org/?mlat=${geo.lat}&mlon=${geo.lng}#map=17/${geo.lat}/${geo.lng}`}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    {geo.lat.toFixed(5)}, {geo.lng.toFixed(5)}
                  </a>
                }
              />
            )}
            <PropertyRows element={element} s={s} writable={!s.data.closed} />
            {addingProperty && !s.data.closed && (
              <AddProperty element={element} s={s} onClose={() => setAddingProperty(false)} />
            )}
          </div>
        </section>
      )}

      <EventsSection element={element} s={s} writable={!s.data.closed} focusedEventId={focusedEventId} />

      <TabMembership element={element} s={s} writable={!s.data.closed} />

      {(links.length > 0 || !s.data.closed) && (
        <section className="space-y-2">
          <div className="flex items-center">
            <h2 className={`${sectionTitle} flex-1`}>
              {links.length > 0 ? t('element.links', { count: links.length }) : t('links.none')}
            </h2>
            {!s.data.closed && (
              <button
                type="button"
                className="-my-2 w-10 h-10 inline-flex items-center justify-center text-accent"
                onClick={() => setLinking(true)}
                aria-label={t('links.add')}
                title={t('links.add')}
              >
                <Plus size={20} />
              </button>
            )}
          </div>
          {links.length > 0 && (
            <>
              <NeighborhoodGraph center={element} elements={s.data.elements} links={s.data.links} onOpen={onOpen} />
              <ul className="divide-y divide-border-default border border-border-default rounded">
                {links.map((l) => (
                  <LinkRow key={l.id} link={l} self={element.id} other={byId.get(l.fromId === element.id ? l.toId : l.fromId)} onOpen={onOpen} s={s} />
                ))}
              </ul>
            </>
          )}
          {linking && <LinkCreator from={element} s={s} tabId={tabId} onClose={() => setLinking(false)} />}
        </section>
      )}

      <section className="space-y-2">
        <h2 className={sectionTitle}>{t('tabs.comments')}</h2>
        {comments.map((c) => <CommentItem key={c.id} comment={c} s={s} />)}
        {!s.data.closed && <CommentForm s={s} targetId={element.id} targetType="element" />}
      </section>

      {!s.data.closed && <DeleteElement element={element} linkCount={links.length} s={s} onDeleted={onDeleted} />}
    </div>
  );
}

/** The element's dated events, in order; a focused one is scrolled to and marked */
function DeleteElement({ element, linkCount, s, onDeleted }: {
  element: Element;
  linkCount: number;
  s: Session;
  onDeleted: () => void;
}) {
  const { t } = useTranslation('companion');
  const [confirming, setConfirming] = useState(false);
  const remove = () => {
    const ydoc = s.ydoc;
    if (!ydoc) return;
    void s.track(() => deleteElement(ydoc, s.dossierId, element.id, s.syncState.connected));
    onDeleted();
  };
  return (
    <section className="pt-2 border-t border-border-default">
      {confirming ? (
        <div className="space-y-2">
          <p className="text-sm">{t('delete.confirmElement', { label: element.label || t('element.untitled') })}</p>
          {linkCount > 0 && <p className="text-xs text-text-tertiary">{t('delete.linksToo', { count: linkCount })}</p>}
          <div className="flex justify-end gap-2">
            <IconAction icon={X} label={t('cancel')} onClick={() => setConfirming(false)} />
            <IconAction icon={Trash2} label={t('delete.confirm')} onClick={remove} variant="confirm" />
          </div>
        </div>
      ) : (
        <button type="button" className={`${dangerButton} w-full`} onClick={() => setConfirming(true)}>
          <Trash2 size={16} />
          {t('delete.element')}
        </button>
      )}
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5">
      <span className="w-1/3 flex-shrink-0 text-text-secondary text-xs pt-0.5 break-words">{label}</span>
      <span className="flex-1 min-w-0 break-words">{value}</span>
    </div>
  );
}

function LinkRow({ link, self, other, onOpen, s }: {
  link: Link;
  self: string;
  other: Element | undefined;
  onOpen: (id: string) => void;
  s: Session;
}) {
  const { t } = useTranslation('companion');
  const [editing, setEditing] = useState(false);
  const outgoing = link.fromId === self;
  const arrow = link.direction === 'none' ? '—'
    : link.direction === 'both' ? '↔'
      : (link.direction === 'forward') === outgoing ? '→' : '←';
  if (editing) return <LinkEditor link={link} outgoing={outgoing} other={other} s={s} onDone={() => setEditing(false)} />;
  return (
    <li className="flex items-center">
      <button
        type="button"
        disabled={!other}
        className="flex-1 min-w-0 min-h-12 flex items-center gap-2 pl-3 pr-1 py-2 text-left active:bg-bg-secondary disabled:opacity-60"
        onClick={() => other && onOpen(other.id)}
      >
        <span className="text-text-tertiary text-sm w-4 text-center">{arrow}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm truncate">{other?.label || t('element.untitled')}</span>
          {link.label && <span className="block text-xs text-text-tertiary truncate">{link.label}</span>}
        </span>
        {other && <ChevronRight size={16} className="text-text-tertiary flex-shrink-0" />}
      </button>
      {!s.data.closed && (
        <button
          type="button"
          className="w-11 h-12 flex items-center justify-center text-text-tertiary flex-shrink-0"
          onClick={() => setEditing(true)}
          aria-label={t('links.edit')}
          title={t('links.edit')}
        >
          <Pencil size={16} />
        </button>
      )}
    </li>
  );
}

/** Swaps the two ends' roles: a direction seen from the other end */
const flip = (d: LinkDirection): LinkDirection => (d === 'forward' ? 'backward' : d === 'backward' ? 'forward' : d);

/**
 * Editing a link from one of its ends: its label, its direction as seen from
 * the element shown (as when creating it), or deleting it (second tap).
 */
function LinkEditor({ link, outgoing, other, s, onDone }: {
  link: Link;
  /** The element shown is the link's start */
  outgoing: boolean;
  other: Element | undefined;
  s: Session;
  onDone: () => void;
}) {
  const { t } = useTranslation('companion');
  const [label, setLabel] = useState(link.label);
  const seen = outgoing ? link.direction : flip(link.direction);
  const [direction, setDirection] = useState<LinkDirection>(seen);
  const [confirming, setConfirming] = useState(false);
  const write = (run: (ydoc: Y.Doc) => void) => {
    const ydoc = s.ydoc;
    if (ydoc) void s.track(() => run(ydoc));
  };
  const commit = () => {
    const changes: { label?: string; direction?: LinkDirection } = {};
    if (label.trim() !== link.label) changes.label = label.trim();
    if (direction !== seen) changes.direction = outgoing ? direction : flip(direction);
    if (Object.keys(changes).length > 0) write((ydoc) => updateLink(ydoc, s.dossierId, link.id, changes, s.syncState.connected));
    onDone();
  };
  return (
    <li className="px-3 py-3 space-y-3 bg-bg-secondary">
      <p className="text-sm truncate">{other?.label || t('element.untitled')}</p>
      <input
        className={inputClass}
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder={t('links.label')}
        aria-label={t('links.label')}
      />
      <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label={t('links.direction')}>
        {DIRECTIONS.map((d) => (
          <button
            key={d.value}
            type="button"
            role="radio"
            aria-checked={direction === d.value}
            aria-label={t(d.key)}
            title={t(d.key)}
            onClick={() => setDirection(d.value)}
            className={choiceButton(direction === d.value)}
          >
            <DirectionIcon direction={d.value} size={22} />
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <IconAction
          icon={Trash2}
          label={confirming ? t('delete.confirm') : t('delete.link')}
          variant={confirming ? 'confirm' : 'danger'}
          onClick={() => {
            if (!confirming) { setConfirming(true); return; }
            write((ydoc) => deleteLink(ydoc, s.dossierId, link.id, s.syncState.connected));
            onDone();
          }}
        />
        <span className="flex-1" />
        <IconAction icon={X} label={t('cancel')} onClick={onDone} />
        <IconAction icon={Check} label={t('edit.save')} onClick={commit} variant="primary" />
      </div>
    </li>
  );
}

function AssetTile({ asset, ydoc }: { asset: AssetEntry | undefined; ydoc: Y.Doc | null }) {
  const { t } = useTranslation('companion');
  const [fullUrl, setFullUrl] = useState<string | null>(null);
  useEffect(() => () => { if (fullUrl) URL.revokeObjectURL(fullUrl); }, [fullUrl]);

  if (!asset) {
    return <div className="aspect-square rounded border border-border-default bg-bg-secondary flex items-center justify-center text-xs text-text-tertiary">{t('asset.missing')}</div>;
  }
  const thumb = asset.thumbnailDataUrl ? safeDataImageUrl(asset.thumbnailDataUrl) : null;
  const open = () => {
    if (!ydoc || !asset.complete) return;
    const map = getYMaps(ydoc).assets.get(asset.id) as Y.Map<unknown> | undefined;
    if (!map) return;
    const bytes = assembleChunks(map);
    const blob = new Blob([bytes as BlobPart], { type: asset.mimeType });
    if (asset.mimeType.startsWith('image/')) {
      setFullUrl(URL.createObjectURL(blob));
    } else {
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
  };
  return (
    <>
      <button
        type="button"
        onClick={open}
        className="aspect-square rounded border border-border-default bg-bg-secondary overflow-hidden flex items-center justify-center"
        title={asset.filename}
      >
        {thumb ? (
          <img src={thumb} alt={asset.filename} className="w-full h-full object-cover" />
        ) : (
          <span className="text-xs text-text-tertiary px-1 break-all line-clamp-3">{asset.filename}</span>
        )}
        {!asset.complete && <span className="sr-only">{t('asset.receiving')}</span>}
      </button>
      {fullUrl && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center" onClick={() => setFullUrl(null)}>
          <img src={fullUrl} alt={asset.filename} className="max-w-full max-h-full object-contain" />
          <button type="button" className="absolute top-3 right-3 p-2 text-white" aria-label={t('close')}>
            <X size={20} />
          </button>
        </div>
      )}
    </>
  );
}

// ============================================================================
// COMMENTS
// ============================================================================

function CommentItem({ comment, s, onOpen, context }: { comment: Comment; s: Session; onOpen?: () => void; context?: string }) {
  const { t } = useTranslation('companion');
  const toggle = () => {
    const dossierId = s.dossierId;
    if (!s.ydoc || !dossierId) return;
    const ydoc = s.ydoc;
    void s.track(() => setCommentResolved(ydoc, dossierId, comment.id, !comment.resolved, s.syncState.connected));
  };
  return (
    <div className={`border border-border-default rounded px-3 py-2 space-y-1 ${comment.resolved ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-2 text-xs">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: comment.authorColor }} />
        <span className="font-medium truncate">{comment.authorName}</span>
        <span className="text-text-tertiary whitespace-nowrap">{comment.createdAt.toLocaleString()}</span>
        {!s.data.closed && (
          <button
            type="button"
            className="ml-auto p-1 text-text-secondary"
            onClick={toggle}
            aria-label={comment.resolved ? t('comments.reopen') : t('comments.resolve')}
            title={comment.resolved ? t('comments.reopen') : t('comments.resolve')}
          >
            {comment.resolved ? <RotateCcw size={14} /> : <Check size={14} />}
          </button>
        )}
      </div>
      {context && (
        <button type="button" className="text-xs text-accent truncate max-w-full" onClick={onOpen}>{context}</button>
      )}
      <p className="text-sm whitespace-pre-wrap break-words">{comment.content}</p>
    </div>
  );
}

function CommentForm({ s, targetId, targetType }: { s: Session; targetId: string; targetType: 'element' | 'link' }) {
  const { t } = useTranslation('companion');
  const [text, setText] = useState('');
  const send = () => {
    const content = text.trim();
    if (!content || !s.ydoc) return;
    const ydoc = s.ydoc;
    const dossierId = s.dossierId;
    if (!dossierId) return;
    void s.track(() => addComment(ydoc, dossierId, targetId, targetType, content, s.syncState.connected));
    setText('');
  };
  return (
    <div className="space-y-2">
      <textarea
        className={`${inputClass} resize-none`}
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('comments.placeholder')}
        aria-label={t('comments.placeholder')}
      />
      {text.trim() && (
        <div className="flex justify-end">
          <IconAction icon={Send} label={t('comments.send')} onClick={send} variant="primary" />
        </div>
      )}
    </div>
  );
}

function CommentsTab({ s, onOpen }: { s: Session; onOpen: (id: string) => void }) {
  const { t } = useTranslation('companion');
  const [showResolved, setShowResolved] = useState(false);
  const elements = useMemo(() => new Map(s.data.elements.map((e) => [e.id, e])), [s.data.elements]);
  const links = useMemo(() => new Map(s.data.links.map((l) => [l.id, l])), [s.data.links]);
  const list = s.data.comments
    .filter((c) => showResolved || !c.resolved)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const targetOf = (c: Comment): { label: string; elementId: string | null } => {
    if (c.targetType === 'element') {
      const e = elements.get(c.targetId);
      return { label: e?.label || t('element.untitled'), elementId: e ? e.id : null };
    }
    const l = links.get(c.targetId);
    const from = l ? elements.get(l.fromId) : undefined;
    const to = l ? elements.get(l.toId) : undefined;
    return { label: l ? `${from?.label ?? '…'} — ${to?.label ?? '…'}` : t('comments.deletedTarget'), elementId: from?.id ?? null };
  };

  return (
    <div className="p-3 space-y-3">
      <label className="flex items-center gap-2 text-xs text-text-secondary">
        <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
        {t('comments.showResolved')}
      </label>
      {list.length === 0 ? (
        <p className="text-sm text-text-tertiary text-center pt-8">{t('comments.empty')}</p>
      ) : (
        list.map((c) => {
          const target = targetOf(c);
          return (
            <CommentItem
              key={c.id}
              comment={c}
              s={s}
              context={target.label}
              onOpen={target.elementId ? () => onOpen(target.elementId!) : undefined}
            />
          );
        })
      )}
    </div>
  );
}

// ============================================================================
// CAPTURE
// ============================================================================

type GeoStatus = 'idle' | 'locating' | 'error';

function CaptureTab({ s, tabId, shareId, onCreated }: {
  s: Session;
  tabId: string | null;
  /** Fills the form from this share */
  shareId: string | null;
  onCreated: (id: string) => void;
}) {
  const { t } = useTranslation('companion');
  const [label, setLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [source, setSource] = useState('');
  /** Photos and files picked, with a preview URL for images */
  const [files, setFiles] = useState<{ key: string; file: File; url: string | null }[]>([]);
  const [geo, setGeo] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState<GeoStatus>('idle');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef(files);
  useEffect(() => { filesRef.current = files; }, [files]);

  // Preview URLs released with the form
  useEffect(() => () => { filesRef.current.forEach((f) => f.url && URL.revokeObjectURL(f.url)); }, []);

  // Filled from a share: title, text and link, files as picked ones
  useEffect(() => {
    if (!shareId) return;
    let cancelled = false;
    void readShare(shareId).then((item) => {
      if (cancelled || !item) return;
      const fields = captureFromShare(item);
      setLabel(fields.label);
      setNotes(fields.notes);
      setSource(fields.source);
      setFiles(item.files.map((f) => {
        const file = new File([f.blob], f.name, { type: f.type });
        return { key: crypto.randomUUID(), file, url: file.type.startsWith('image/') ? URL.createObjectURL(file) : null };
      }));
    }).catch((err: unknown) => console.warn('[Companion] share not read:', err));
    return () => { cancelled = true; };
  }, [shareId]);

  const locate = () => {
    setGeoStatus('locating');
    locateOnce().then(
      (where) => { setGeo(where); setGeoStatus('idle'); },
      () => setGeoStatus('error'),
    );
  };

  const addFiles = (list: FileList | null, input: HTMLInputElement | null) => {
    const picked = [...(list ?? [])];
    if (input) input.value = '';
    // A type the desktop refuses is turned down now; images are checked once
    // re-encoded (an iPhone HEIC becomes a JPEG)
    const refused = picked.find((f) => !f.type.startsWith('image/') && !isAllowedAttachment(f.name, f.type));
    setError(refused ? t('capture.unsupported', { name: refused.name }) : null);
    const accepted = picked.filter((f) => f !== refused && (f.type.startsWith('image/') || isAllowedAttachment(f.name, f.type)));
    setFiles((current) => [
      ...current,
      ...accepted.map((file) => ({
        key: crypto.randomUUID(),
        file,
        url: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      })),
    ]);
  };

  const removeFile = (key: string) => {
    setFiles((current) => {
      const gone = current.find((f) => f.key === key);
      if (gone?.url) URL.revokeObjectURL(gone.url);
      return current.filter((f) => f.key !== key);
    });
  };

  const canSave = !s.data.closed && !!s.ydoc && !saving && (label.trim() || notes.trim() || files.length > 0);

  const save = async () => {
    const dossierId = s.dossierId;
    if (!canSave || !s.ydoc || !dossierId) return;
    const ydoc = s.ydoc;
    setSaving(true);
    setError(null);
    const fallbackLabel = t('capture.defaultLabel', {
      time: new Date().toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }),
    });
    try {
      const id = await s.track(() => createCapture(ydoc, dossierId, {
        label: label.trim() || fallbackLabel,
        notes,
        files: files.map((f) => f.file),
        geo: geo ? { lat: geo.lat, lng: geo.lng } : null,
        source,
        tabId,
      }, s.syncState.connected));
      setLabel('');
      setNotes('');
      setSource('');
      files.forEach((f) => f.url && URL.revokeObjectURL(f.url));
      setFiles([]);
      setGeo(null);
      onCreated(id);
    } catch (err) {
      setError(
        err instanceof FileTooLargeError ? t('capture.tooLarge', { name: err.fileName })
          : err instanceof UnsupportedFileError ? t('capture.unsupported', { name: err.fileName })
            : t('capture.failed'),
      );
    } finally {
      setSaving(false);
    }
  };

  if (s.data.closed) {
    return <p className="p-4 text-sm text-text-secondary">{t('status.closed')}</p>;
  }

  return (
    <div className="p-4 space-y-4">
      <label className="block space-y-1">
        <span className="text-xs font-medium text-text-primary">{t('capture.label')}</span>
        <input className={inputClass} value={label} onChange={(e) => setLabel(e.target.value)} />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-text-primary">{t('capture.notes')}</span>
        <textarea className={`${inputClass} resize-none`} rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-text-primary">{t('capture.source')}</span>
        <input className={inputClass} value={source} onChange={(e) => setSource(e.target.value)} />
      </label>

      <div className="space-y-2">
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(e) => addFiles(e.target.files, e.currentTarget)}
        />
        <input
          ref={mediaRef}
          type="file"
          accept={`image/*,video/*,audio/*,${ATTACHMENT_ACCEPT}`}
          multiple
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          data-testid="capture-files"
          onChange={(e) => addFiles(e.target.files, e.currentTarget)}
        />
        {files.length > 0 && (
          <ul className="grid grid-cols-3 gap-2">
            {files.map((f) => (
              <li key={f.key} className="relative aspect-square rounded border border-border-default bg-bg-secondary overflow-hidden">
                {f.url ? (
                  <img src={f.url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-1 p-1 text-text-secondary">
                    <FileText size={20} />
                    <span className="text-[11px] leading-tight text-center break-all line-clamp-2">{f.file.name}</span>
                  </div>
                )}
                <button
                  type="button"
                  className="absolute top-1 right-1 w-7 h-7 flex items-center justify-center rounded bg-bg-primary/90 border border-border-default text-text-secondary"
                  onClick={() => removeFile(f.key)}
                  aria-label={t('capture.removeFile', { name: f.file.name })}
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-3 gap-2">
          <IconAction icon={Camera} label={t('capture.photo')} onClick={() => cameraRef.current?.click()} wide />
          <IconAction icon={Paperclip} label={t('capture.addFile')} onClick={() => mediaRef.current?.click()} wide />
          <IconAction
            icon={geoStatus === 'locating' ? Loader2 : MapPin}
            label={geoStatus === 'locating' ? t('capture.locating') : t('capture.position')}
            onClick={locate}
            disabled={geoStatus === 'locating' || !!geo}
            wide
            className={geoStatus === 'locating' ? '[&>svg]:animate-spin' : ''}
          />
        </div>

        {geo && (
          <div className="flex items-center gap-2 text-sm">
            <MapPin size={16} className="text-text-secondary" />
            <span className="flex-1">
              {geo.lat.toFixed(5)}, {geo.lng.toFixed(5)}
              <span className="text-xs text-text-tertiary"> ±{Math.round(geo.accuracy)} m</span>
            </span>
            <button type="button" className="w-9 h-9 flex items-center justify-center text-text-secondary" onClick={() => setGeo(null)} aria-label={t('capture.removePosition')}>
              <X size={16} />
            </button>
          </div>
        )}
        {geoStatus === 'error' && <p className="text-xs text-error">{t('capture.positionFailed')}</p>}
      </div>

      {error && <p className="text-sm text-error">{error}</p>}
      <button type="button" className={`${primaryButton} w-full`} onClick={save} disabled={!canSave}>
        {saving ? t('capture.saving') : t('capture.save')}
      </button>
    </div>
  );
}

// ============================================================================
// SETTINGS
// ============================================================================

function SettingsTab({ s, session }: { s: Session; session: CompanionSession }) {
  const { t } = useTranslation('companion');
  const [part, setPart] = useState<'dossier' | 'app'>('dossier');
  const [confirmForget, setConfirmForget] = useState(false);
  const [forgetting, setForgetting] = useState(false);
  const { connected, reconnecting, peerCount } = s.syncState;

  const forget = async () => {
    setForgetting(true);
    try {
      // Never held up by an open that does not answer: the session is
      // forgotten whatever happens to the local copy
      await Promise.race([
        closeCompanionSession().catch(() => undefined),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
      // Not erased (database held): retried and shown on the home page
      await eraseLocalCopy(session.dossierId);
    } finally {
      clearPending(session.dossierId);
      removeSession(session.dossierId);
      navigate('', true);
    }
  };

  return (
    <div className="p-4 space-y-6">
      <div className="grid grid-cols-2 gap-2" role="tablist">
        {(['dossier', 'app'] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={part === id}
            className={choiceButton(part === id)}
            onClick={() => setPart(id)}
          >
            {t(`settings.${id}`)}
          </button>
        ))}
      </div>

      {part === 'app' ? (
        <AppSettings />
      ) : (
        <div className="space-y-6">
          <div className="space-y-1 text-sm">
            <p className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${connected ? 'bg-success' : reconnecting ? 'bg-warning' : 'bg-text-tertiary'}`} />
              {connected ? t('status.connected', { count: peerCount }) : reconnecting ? t('status.reconnecting') : t('status.offline')}
            </p>
            {s.pending > 0 && <p className="text-warning">{t('status.pending', { count: s.pending })}</p>}
          </div>

          {confirmForget ? (
            <div className="space-y-2">
              {s.pending > 0 && <p className="text-sm text-error">{t('settings.forgetPending', { count: s.pending })}</p>}
              <div className="flex gap-2">
                <button type="button" className={`${secondaryButton} flex-1`} onClick={() => setConfirmForget(false)} disabled={forgetting}>
                  {t('cancel')}
                </button>
                <button type="button" className={`${dangerButton} flex-1`} onClick={forget} disabled={forgetting}>
                  {t('settings.forgetConfirm')}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className={`${dangerButton} w-full`} onClick={() => setConfirmForget(true)}>
              <Trash2 size={16} />
              {t('settings.forget')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
