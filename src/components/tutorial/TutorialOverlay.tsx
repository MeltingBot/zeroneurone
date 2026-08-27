// ─── Tutorial Overlay (guided onboarding) ────────────────────
//
// Coach-mark overlay for the interactive first-run tutorial. Anchors a small
// message box next to the exact spot the user must click or type, follows the
// target through pans/zooms (polling in useTutorialTarget), and validates each
// step from real store state — the user performs every action themselves.
// Mounted once in App.tsx; renders nothing while the tutorial is inactive.

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { useDossierStore } from '../../stores/dossierStore';
import { useSelectionStore } from '../../stores/selectionStore';
import { useViewStore } from '../../stores/viewStore';
import { useTutorialStore } from '../../stores/tutorialStore';
import { TUTORIAL_STEPS, type StepContext } from './tutorialSteps';
import { useTutorialTarget, type TargetRect } from './useTutorialTarget';

const BUBBLE_WIDTH = 300;
const GAP = 10;
const MARKER_SIZE = 48;

export function TutorialOverlay() {
  const active = useTutorialStore((s) => s.active);
  if (!active) return null;
  return <TutorialOverlayInner />;
}

function TutorialOverlayInner() {
  const { t } = useTranslation('pages');
  const location = useLocation();
  const navigate = useNavigate();

  const stepIndex = useTutorialStore((s) => s.stepIndex);
  const baseline = useTutorialStore((s) => s.baseline);
  const tutorialDossierId = useTutorialStore((s) => s.tutorialDossierId);
  const startElementIds = useTutorialStore((s) => s.startElementIds);

  const elements = useDossierStore((s) => s.elements);
  const links = useDossierStore((s) => s.links);
  const currentDossierId = useDossierStore((s) => s.currentDossier?.id ?? null);
  const deleteDossier = useDossierStore((s) => s.deleteDossier);
  const selectedCount = useSelectionStore((s) => s.selectedElementIds.size);
  const displayMode = useViewStore((s) => s.displayMode);

  const step = TUTORIAL_STEPS[stepIndex];
  const total = TUTORIAL_STEPS.length;

  // Tick de re-render : certaines validations lisent le DOM (ex. modale montée)
  // et ne sont déclenchées par aucun store.
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = window.setInterval(() => setTick((n) => n + 1), 400);
    return () => window.clearInterval(interval);
  }, []);

  const ctx: StepContext = useMemo(
    () => ({
      elements,
      links,
      currentDossierId,
      selectedCount,
      displayMode,
      baseline,
      tutorialDossierId,
      startElementIds,
    }),
    [elements, links, currentDossierId, selectedCount, displayMode, baseline, tutorialDossierId, startElementIds]
  );

  // ── Page guard (off-track detection) ──
  const onHome = location.pathname === '/';
  const onDossierPage = location.pathname.startsWith('/dossier/');
  const offTrack =
    (step.page === 'home' && !onHome) ||
    (step.page === 'dossier' &&
      (!onDossierPage ||
        (tutorialDossierId !== null && currentDossierId !== null && currentDossierId !== tutorialDossierId)));
  const [pauseDismissed, setPauseDismissed] = useState(false);
  useEffect(() => {
    if (!offTrack) setPauseDismissed(false);
  }, [offTrack]);

  // ── Target resolution ──
  const selector = useMemo(() => {
    if (offTrack || !step.target) return null;
    return typeof step.target === 'function' ? step.target(ctx) : step.target;
  }, [step, ctx, offTrack]);
  const rect = useTutorialTarget(selector);

  // ── Auto-validation ──
  const [validated, setValidated] = useState(false);
  const advancingRef = useRef(false);
  const complete = !offTrack && step.advanceOn === 'auto' && !!step.isComplete?.(ctx);
  // Étapes « à confirmer » : la condition est remplie mais on attend « Suivant »
  // pour laisser le temps d'observer (vues Carte/Chronologie/Matrice).
  const confirmed = complete && !!step.confirmAfter;
  useEffect(() => {
    if (!complete || step.confirmAfter || advancingRef.current) return;
    advancingRef.current = true;
    setValidated(true);
    const timer = window.setTimeout(() => {
      const state = useTutorialStore.getState();
      // Capture l'id du dossier tutoriel au moment de sa création.
      if (step.id === 'nameDossier') {
        const id = useDossierStore.getState().currentDossier?.id;
        if (id) state.setTutorialDossierId(id);
      }
      state.next(total);
      setValidated(false);
      advancingRef.current = false;
    }, 450);
    return () => window.clearTimeout(timer);
  }, [complete, step.confirmAfter, step.id, total]);

  const skip = () => {
    if (advancingRef.current) return;
    useTutorialStore.getState().next(total);
  };
  const quit = () => useTutorialStore.getState().exit();

  const finishAndDelete = async () => {
    const id = tutorialDossierId;
    useTutorialStore.getState().complete();
    if (id) {
      try {
        await deleteDossier(id);
      } catch (err) {
        console.warn('Tutorial: failed to delete tutorial dossier', err);
      }
      navigate('/');
    }
  };
  const finishAndKeep = () => useTutorialStore.getState().complete();

  // ── Rendering ──
  if (offTrack) {
    if (pauseDismissed) return null;
    return createPortal(
      <CenteredCard
        title={t('tutorial.offTrack.title')}
        body={t('tutorial.offTrack.body')}
        onQuit={quit}
        buttons={[
          { label: t('tutorial.offTrack.continue'), primary: true, onClick: () => setPauseDismissed(true) },
          { label: t('tutorial.quit'), primary: false, onClick: quit },
        ]}
      />,
      document.body
    );
  }

  const title = t(`tutorial.steps.${step.id}.title`);
  const body = confirmed
    ? t(`tutorial.steps.${step.id}.explore`)
    : t(`tutorial.steps.${step.id}.body`);

  // Étapes sans cible : carte centrée (intro, fin).
  if (!step.target) {
    const isDone = step.id === 'done';
    return createPortal(
      <CenteredCard
        title={title}
        body={body}
        onQuit={quit}
        buttons={
          isDone
            ? [
                { label: t('tutorial.deleteDossier'), primary: true, onClick: () => void finishAndDelete() },
                { label: t('tutorial.keepDossier'), primary: false, onClick: finishAndKeep },
              ]
            : [{ label: t('tutorial.next'), primary: true, onClick: skip }]
        }
      />,
      document.body
    );
  }

  // Marqueur de point d'action (étapes de création sur le canvas).
  let marker: { x: number; y: number } | null = null;
  if (rect && step.marker === 'canvas-center') {
    marker = { x: rect.left + rect.width / 2, y: rect.top + rect.height * 0.45 };
  } else if (rect && step.marker === 'right-of-first-element') {
    marker = {
      x: Math.min(rect.left + rect.width + 140, window.innerWidth - 80),
      y: rect.top + rect.height / 2,
    };
  }

  // Anneau : uniquement sur les cibles compactes (pas le canvas entier).
  const isLargeTarget =
    !!rect && rect.width > window.innerWidth * 0.6 && rect.height > window.innerHeight * 0.5;
  const ringRect = rect && !isLargeTarget && !marker ? rect : null;

  const anchor: TargetRect | null = marker
    ? { top: marker.y - MARKER_SIZE / 2, left: marker.x - MARKER_SIZE / 2, width: MARKER_SIZE, height: MARKER_SIZE }
    : rect;

  return createPortal(
    <>
      {ringRect && (
        <div
          className="fixed pointer-events-none rounded transition-all duration-200"
          style={{
            zIndex: 1099,
            top: ringRect.top - 4,
            left: ringRect.left - 4,
            width: ringRect.width + 8,
            height: ringRect.height + 8,
            border: `2px solid ${validated ? 'var(--color-success)' : 'var(--color-accent)'}`,
          }}
        />
      )}
      {marker && (
        <div
          className="fixed pointer-events-none rounded-full"
          style={{
            zIndex: 1099,
            top: marker.y - MARKER_SIZE / 2,
            left: marker.x - MARKER_SIZE / 2,
            width: MARKER_SIZE,
            height: MARKER_SIZE,
            border: `2px dashed ${validated ? 'var(--color-success)' : 'var(--color-accent)'}`,
          }}
        />
      )}
      <Bubble
        stepId={step.id}
        anchor={anchor}
        placement={step.placement ?? 'bottom'}
        title={title}
        body={body}
        validated={validated}
        showNext={step.advanceOn === 'button' || confirmed}
        onNext={skip}
        onSkip={skip}
        onQuit={quit}
        nextLabel={t('tutorial.next')}
        skipLabel={t('tutorial.skip')}
        quitLabel={t('tutorial.quit')}
      />
    </>,
    document.body
  );
}

// ─── Drag (déplacement manuel de la bulle) ───────────────────

function useCardDrag(resetKey: string) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragState = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);

  useEffect(() => {
    setOffset({ x: 0, y: 0 });
  }, [resetKey]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, textarea, select')) return;
    dragState.current = { startX: e.clientX, startY: e.clientY, baseX: offset.x, baseY: offset.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current) return;
    setOffset({
      x: dragState.current.baseX + e.clientX - dragState.current.startX,
      y: dragState.current.baseY + e.clientY - dragState.current.startY,
    });
  };
  const onPointerUp = () => {
    dragState.current = null;
  };

  return {
    offset,
    dragging: dragState.current !== null,
    handlers: { onPointerDown, onPointerMove, onPointerUp },
  };
}

// ─── Bubble ──────────────────────────────────────────────────

interface BubbleProps {
  stepId: string;
  anchor: TargetRect | null;
  placement: 'top' | 'bottom' | 'left' | 'right';
  title: string;
  body: string;
  validated: boolean;
  showNext: boolean;
  onNext: () => void;
  onSkip: () => void;
  onQuit: () => void;
  nextLabel: string;
  skipLabel: string;
  quitLabel: string;
}

function Bubble({
  stepId,
  anchor,
  placement,
  title,
  body,
  validated,
  showNext,
  onNext,
  onSkip,
  onQuit,
  nextLabel,
  skipLabel,
  quitLabel,
}: BubbleProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(140);
  useEffect(() => {
    if (ref.current) setHeight(ref.current.offsetHeight);
  }, [title, body]);
  const { offset, handlers } = useCardDrag(stepId);
  const moved = offset.x !== 0 || offset.y !== 0;

  let top: number;
  let left: number;
  let effective = placement;

  if (!anchor) {
    // Cible pas encore montée : bulle centrée en haut de l'écran.
    top = 96;
    left = (window.innerWidth - BUBBLE_WIDTH) / 2;
  } else {
    // Flip si la bulle déborde du viewport.
    if (effective === 'bottom' && anchor.top + anchor.height + GAP + height > window.innerHeight) {
      effective = 'top';
    } else if (effective === 'top' && anchor.top - GAP - height < 0) {
      effective = 'bottom';
    } else if (effective === 'left' && anchor.left - GAP - BUBBLE_WIDTH < 0) {
      effective = 'right';
    } else if (effective === 'right' && anchor.left + anchor.width + GAP + BUBBLE_WIDTH > window.innerWidth) {
      effective = 'left';
    }

    switch (effective) {
      case 'bottom':
        top = anchor.top + anchor.height + GAP;
        left = anchor.left + anchor.width / 2 - BUBBLE_WIDTH / 2;
        break;
      case 'top':
        top = anchor.top - GAP - height;
        left = anchor.left + anchor.width / 2 - BUBBLE_WIDTH / 2;
        break;
      case 'left':
        top = anchor.top + anchor.height / 2 - height / 2;
        left = anchor.left - GAP - BUBBLE_WIDTH;
        break;
      case 'right':
      default:
        top = anchor.top + anchor.height / 2 - height / 2;
        left = anchor.left + anchor.width + GAP;
        break;
    }
    left = Math.max(8, Math.min(left, window.innerWidth - BUBBLE_WIDTH - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - height - 8));
  }

  // Flèche vers la cible (masquée dès que la bulle a été déplacée à la main).
  let arrow: React.CSSProperties | null = null;
  if (anchor && !moved) {
    const cx = anchor.left + anchor.width / 2;
    const cy = anchor.top + anchor.height / 2;
    if (effective === 'bottom') {
      arrow = { top: -5, left: Math.max(12, Math.min(cx - left - 4, BUBBLE_WIDTH - 20)), borderRight: 'none', borderBottom: 'none' };
    } else if (effective === 'top') {
      arrow = { bottom: -5, left: Math.max(12, Math.min(cx - left - 4, BUBBLE_WIDTH - 20)), borderLeft: 'none', borderTop: 'none' };
    } else if (effective === 'left') {
      arrow = { right: -5, top: Math.max(12, Math.min(cy - top - 4, height - 20)), borderLeft: 'none', borderBottom: 'none' };
    } else {
      arrow = { left: -5, top: Math.max(12, Math.min(cy - top - 4, height - 20)), borderRight: 'none', borderTop: 'none' };
    }
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={title}
      className="fixed bg-bg-primary border border-border-default rounded shadow-sm cursor-move select-none touch-none"
      style={{ zIndex: 1100, top: top + offset.y, left: left + offset.x, width: BUBBLE_WIDTH }}
      {...handlers}
    >
      {arrow && (
        <div
          className="absolute w-2 h-2 bg-bg-primary border border-border-default rotate-45"
          style={arrow}
        />
      )}
      <div className="px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          <button
            onClick={onQuit}
            title={quitLabel}
            className="text-text-tertiary hover:text-text-primary shrink-0 mt-0.5"
          >
            <X size={14} />
          </button>
        </div>
        <p className="mt-1 text-xs text-text-secondary" aria-live="polite">
          {body}
        </p>
        <div className="mt-2.5 flex items-center justify-end">
          <div className="flex items-center gap-2">
            {!showNext && !validated && (
              <button
                onClick={onSkip}
                className="text-xs text-text-tertiary hover:text-text-secondary"
              >
                {skipLabel}
              </button>
            )}
            {showNext && (
              <button
                onClick={onNext}
                className="bg-accent text-white hover:bg-accent-hover px-2.5 py-1 text-xs font-medium rounded"
              >
                {nextLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Centered card (intro / done / pause) ────────────────────

interface CenteredCardProps {
  title: string;
  body: string;
  onQuit: () => void;
  buttons: Array<{ label: string; primary: boolean; onClick: () => void }>;
}

function CenteredCard({ title, body, onQuit, buttons }: CenteredCardProps) {
  const { offset, handlers } = useCardDrag(title);
  return (
    <div
      role="dialog"
      aria-label={title}
      className="fixed bg-bg-primary border border-border-default rounded shadow-sm cursor-move select-none touch-none"
      style={{
        zIndex: 1100,
        top: `calc(30% + ${offset.y}px)`,
        left: `calc(50% + ${offset.x}px)`,
        transform: 'translateX(-50%)',
        width: 360,
        maxWidth: 'calc(100vw - 32px)',
      }}
      {...handlers}
    >
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          <button
            onClick={onQuit}
            className="text-text-tertiary hover:text-text-primary shrink-0 mt-0.5"
          >
            <X size={14} />
          </button>
        </div>
        <p className="mt-1.5 text-xs text-text-secondary">{body}</p>
        <div className="mt-3 flex items-center justify-end">
          <div className="flex items-center gap-2">
            {buttons.map((btn) =>
              btn.primary ? (
                <button
                  key={btn.label}
                  onClick={btn.onClick}
                  className="bg-accent text-white hover:bg-accent-hover px-2.5 py-1 text-xs font-medium rounded"
                >
                  {btn.label}
                </button>
              ) : (
                <button
                  key={btn.label}
                  onClick={btn.onClick}
                  className="border border-border-default text-text-primary bg-bg-primary hover:bg-bg-secondary px-2.5 py-1 text-xs font-medium rounded"
                >
                  {btn.label}
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
