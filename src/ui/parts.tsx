/**
 * Small shared UI pieces.
 *
 * Only these hooks may be imported from 'react': useState, useEffect, useRef,
 * useCallback, useMemo. The build rewrites `react` to a tiny module that
 * re-exports exactly those from Ship Studio's own React — see vite.config.ts.
 * Type-only imports are fine, because they vanish at build time.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTheme } from '../context.ts';
import {
  MAX_DOCK_WIDTH,
  MIN_DOCK_WIDTH,
  clampToViewport,
  getDock,
  getEffectiveDockWidth,
  getEffectiveWinHeight,
  setDock,
  useDock,
} from '../dock.ts';
import { getLayoutReport, subscribeLayout } from '../hostLayout.ts';

/**
 * The main panel's frame: a small floating window, or docked to the right edge.
 *
 * Neither state dims the app behind it, which is the point — the whole reason to
 * pin a change list is to keep working while you look at it. That also means no
 * click-outside-to-close: with nothing covering the app, an outside click is
 * just you using Ship Studio, and closing the panel would be maddening.
 */
export function PanelFrame({
  title,
  onClose,
  headerExtra,
  children,
}: {
  title: ReactNode;
  onClose: () => void;
  headerExtra?: ReactNode;
  children: ReactNode;
}) {
  const theme = useTheme();
  const dock = useDock();
  const pinned = dock.mode === 'pinned';

  /** Drag offset between the pointer and the window's top-left corner. */
  const dragOffset = useRef<{ dx: number; dy: number } | null>(null);

  const bodyRef = useRef<HTMLDivElement | null>(null);
  useWheelFallback(bodyRef);

  /**
   * Dragging is wired on the window rather than per-pointer-event on the header
   * so the drag survives the pointer briefly outting the header, and always ends
   * on mouseup even if that happens outside the app.
   */
  const startDrag = useCallback(
    (event: React.MouseEvent) => {
      if (pinned) return;
      const current = getFrameOrigin(event.currentTarget as HTMLElement);
      dragOffset.current = { dx: event.clientX - current.x, dy: event.clientY - current.y };

      const onMove = (move: MouseEvent) => {
        const offset = dragOffset.current;
        if (!offset) return;
        move.preventDefault();
        // Track the window's current size so dragging after a resize clamps
        // against the right edges, not the 380px default. Read live from the
        // dock module: this callback was created once and must not hold a
        // stale copy of the state.
        const live = getDock();
        setDock(
          clampToViewport(move.clientX - offset.dx, move.clientY - offset.dy, live.winWidth, getEffectiveWinHeight())
        );
      };
      const onUp = () => {
        dragOffset.current = null;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [pinned]
  );

  /**
   * Where the content area starts, measured from the live app rather than
   * assumed. Starting at 0 was the bug in the screenshots: the dock covered the
   * Push button and the Edit/Inspect bar. Aligning to the content region clears
   * the toolbars whether or not the reflow itself succeeded.
   */
  const contentTop = useContentTop();

  const viewportHeight = useViewportHeight();

  /**
   * The dock's height is set explicitly rather than via `bottom: 0`.
   *
   * `position: fixed` only resolves against the viewport while no ancestor
   * establishes a containing block — and `transform`, `filter`, `perspective`
   * and `contain` all do. Inside a host we don't control, `bottom: 0` can
   * therefore resolve against some inner element instead, making the frame far
   * taller than the screen: the body then never overflows, so it never scrolls,
   * and its lower half sits below the window unreachable.
   *
   * A pixel height derived from `window.innerHeight` doesn't care about any of
   * that. `maxHeight` on the floating window is already viewport-relative (vh),
   * so it was never exposed to the same problem.
   */
  const frameStyle: React.CSSProperties = pinned
    ? {
        width: getEffectiveDockWidth(),
        right: 0,
        top: contentTop,
        height: Math.max(160, viewportHeight - contentTop),
      }
    : (() => {
        // max-height is only the auto-grow cap — it would cap a user-dragged
        // height too, so it comes off the moment a fixed height is set.
        const winHeight = getEffectiveWinHeight();
        return {
          width: Math.min(dock.winWidth, window.innerWidth - 16),
          left: dock.x,
          top: dock.y,
          maxHeight: winHeight === null ? 'min(70vh, 620px)' : undefined,
          height: winHeight ?? undefined,
        };
      })();

  return (
    <div
      className={`change-frame${pinned ? ' change-frame-pinned' : ''}`}
      style={{
        ...frameStyle,
        background: theme.bgPrimary,
        color: theme.textPrimary,
        border: `1px solid ${theme.border}`,
      }}
    >
      <div
        className={`change-frame-header${pinned ? '' : ' change-draggable'}`}
        style={{ borderBottom: `1px solid ${theme.border}` }}
        onMouseDown={startDrag}
      >
        <span className="change-frame-title">{title}</span>
        <span className="change-header-actions">
          {headerExtra}
          <PinButton />
          <button
            className="change-close"
            style={{ color: theme.textMuted }}
            title="Close"
            onClick={onClose}
          >
            ✕
          </button>
        </span>
      </div>
      <div className="change-frame-body" ref={bodyRef}>
        {children}
      </div>
      {pinned ? <DockResizeHandle /> : <WindowResizeHandle />}
    </div>
  );
}

/**
 * Keep the panel scrollable even if the host swallows wheel events.
 *
 * Ship Studio is a Tauri app, and desktop webviews commonly attach a global
 * `wheel` listener that calls `preventDefault()` for anything outside their own
 * scroll containers, to stop macOS rubber-banding. Our panel isn't one of
 * theirs, so the gesture can be cancelled before it ever scrolls us — which is
 * how a container with a perfectly good `overflow-y: auto` ends up feeling
 * frozen.
 *
 * It defends against both shapes that problem takes, synchronously — no timers
 * and no "did it move?" probing. An earlier attempt did probe on the next
 * animation frame, and it was wrong: the browser hasn't necessarily applied its
 * own scroll by then, so a healthy environment looked broken and the handler
 * scrolled a second time on top of the native one.
 *
 * 1. **Host listens in the bubble phase** (the common case): our
 *    `stopPropagation` means their handler never runs, so it can't cancel
 *    anything. We do *not* call `preventDefault`, so the browser scrolls us
 *    natively — momentum and smoothness intact.
 * 2. **Host listens in the capture phase**: theirs already ran, and
 *    `defaultPrevented` tells us so synchronously. Only then do we move the
 *    scroll position ourselves, because nothing else is going to.
 */
function useWheelFallback(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const onWheel = (event: WheelEvent) => {
      const canScroll =
        event.deltaY > 0
          ? element.scrollTop < element.scrollHeight - element.clientHeight - 1
          : element.scrollTop > 0;

      // Nothing to scroll here — let it chain out normally.
      if (!canScroll) return;

      // Case 2: something upstream already cancelled the native scroll.
      if (event.defaultPrevented) element.scrollTop += event.deltaY;

      // Case 1: keep it away from a host handler that would cancel it.
      event.stopPropagation();
    };

    // `passive: false` so the browser doesn't assume we'll never interfere.
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [ref]);
}

/** The viewport height, kept current across window resizes. */
function useViewportHeight(): number {
  const [height, setHeight] = useState(() => window.innerHeight);
  useEffect(() => {
    const onResize = () => setHeight(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return height;
}

/** Subscribes to the measured top of the app's content region. */
function useContentTop(): number {
  const [top, setTop] = useState(() => getLayoutReport().contentTop);
  useEffect(() => subscribeLayout(() => setTop(getLayoutReport().contentTop)), []);
  return top;
}

/**
 * Drag the dock's left edge to resize it.
 *
 * Worth having now that width displaces real content rather than just covering
 * it — 360px is a guess, and the right number depends on the window.
 */
function DockResizeHandle() {
  const theme = useTheme();

  const startResize = useCallback((event: React.MouseEvent) => {
    event.preventDefault();

    const onMove = (move: MouseEvent) => {
      // The dock is anchored right, so its width is the distance from the
      // pointer to the right edge of the viewport.
      const next = Math.round(window.innerWidth - move.clientX);
      setDock({ dockWidth: Math.min(MAX_DOCK_WIDTH, Math.max(MIN_DOCK_WIDTH, next)) });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  return (
    <div
      className="change-resize-handle"
      style={{ background: theme.border }}
      title="Drag to resize"
      onMouseDown={startResize}
    />
  );
}

/** Where the frame currently sits, read off the DOM so drags never drift. */
function getFrameOrigin(headerElement: HTMLElement): { x: number; y: number } {
  const frame = headerElement.closest('.change-frame') as HTMLElement | null;
  const rect = (frame ?? headerElement).getBoundingClientRect();
  return { x: rect.left, y: rect.top };
}

/**
 * Resize the floating window from its bottom-right corner.
 *
 * The mirror of DockResizeHandle: same window-level listeners so the drag
 * survives the pointer leaving the handle, but here the corner moves, so the
 * new width/height come from the pointer's absolute position, not the distance
 * to an edge. Once a height is set it stops auto-growing; the body scrolls.
 */
function WindowResizeHandle() {
  const theme = useTheme();

  const startResize = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      const origin = getFrameOrigin(event.currentTarget as HTMLElement);

      const onMove = (move: MouseEvent) => {
        const width = Math.max(0, move.clientX - origin.x);
        const height = Math.max(0, move.clientY - origin.y);
        setDock({
          winWidth: width,
          winHeight: height,
        });
        // The frame is anchored at top-left, so only the corner moves while
        // dragging; getEffectiveWinHeight caps the stored height to the
        // viewport at render, so the bottom edge can't fall off-screen.
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    []
  );

  return (
    <div
      className="change-window-resize-handle"
      style={{ background: theme.border }}
      title="Drag to resize"
      onMouseDown={startResize}
    />
  );
}

/**
 * Grow a textarea to fit its content instead of scrolling inside itself.
 *
 * The free-text box used to reserve a fixed height whether or not you wrote
 * anything, which is a lot of empty space in a docked panel. Starting small and
 * growing costs nothing when the box is empty and gives more room than before
 * when the text is long. `AutoGrowTextarea` applies it to the one-row fields
 * (title, capture, template boxes) so typing past the width wraps and widens the
 * box instead of disappearing past its edge.
 */
export function useAutoGrow(ref: React.RefObject<HTMLTextAreaElement | null>, value: string) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    // Collapse first, or scrollHeight only ever reports the current height and
    // the box could grow but never shrink again.
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, [ref, value]);
}

/** A single-line-looking field that wraps and grows once the text gets long. */
export function AutoGrowTextarea({
  value,
  onChange,
  onKeyDown,
  className,
  style,
  placeholder,
  ariaLabel,
  title,
  spellCheck,
}: {
  value: string;
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  className: string;
  style?: React.CSSProperties;
  placeholder?: string;
  ariaLabel?: string;
  title?: string;
  spellCheck?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useAutoGrow(ref, value);
  return (
    <textarea
      ref={ref}
      rows={1}
      className={className}
      style={style}
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      title={title}
      spellCheck={spellCheck}
      onChange={onChange}
      onKeyDown={onKeyDown}
    />
  );
}

/**
 * A map-pin outline, filled when pinned.
 *
 * Matches the toolbar's `Icon()` convention (15×15, viewBox 0 0 24 24,
 * currentColor stroke) so it sits at the same size and weight as its
 * neighbours, rather than an emoji that renders differently per platform.
 */
function PinIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
    >
      <path
        d="M12 2C8.7 2 6 4.7 6 8c0 4.5 6 12 6 12s6-7.5 6-12c0-3.3-2.7-6-6-6z"
        strokeLinejoin="round"
      />
      {!filled ? <circle cx="12" cy="8" r="2.2" /> : null}
    </svg>
  );
}

function PinButton() {
  const theme = useTheme();
  const dock = useDock();
  const pinned = dock.mode === 'pinned';

  return (
    <button
      className="change-icon-btn"
      style={{ color: pinned ? theme.accent : theme.textMuted }}
      title={pinned ? 'Unpin — back to a floating window' : 'Pin to the right edge'}
      aria-label={pinned ? 'Unpin' : 'Pin to the right edge'}
      aria-pressed={pinned}
      onClick={() => setDock({ mode: pinned ? 'window' : 'pinned' })}
    >
      <PinIcon filled={pinned} />
    </button>
  );
}

/** A borderless icon button — the ↑ ↓ ⌄ ✕ controls on each row. */
export function IconButton({
  label,
  onClick,
  disabled,
  children,
  danger,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  danger?: boolean;
}) {
  const theme = useTheme();
  return (
    <button
      className="change-icon-btn"
      style={{ color: danger ? theme.error : theme.textMuted }}
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function Spinner() {
  return <span className="change-spinner" />;
}

/** A labelled block, so every field in the plugin lines up the same way. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <div>
      <label className="change-field-label" style={{ color: theme.textMuted }}>
        {label}
      </label>
      {children}
    </div>
  );
}
