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
  getEffectiveDockWidth,
  setDock,
  useDock,
} from '../dock.ts';
import { getLayoutReport, subscribeLayout } from '../hostLayout.ts';

/** The dimmed, centred dialog every view in this plugin renders inside. */
export function Modal({
  title,
  onClose,
  headerExtra,
  children,
}: {
  title: ReactNode;
  onClose: () => void;
  /** Buttons shown to the left of the close button. */
  headerExtra?: ReactNode;
  children: ReactNode;
}) {
  const theme = useTheme();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="change-overlay" onClick={onClose}>
      <div
        className="change-modal"
        style={{
          background: theme.bgPrimary,
          color: theme.textPrimary,
          border: `1px solid ${theme.border}`,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="change-modal-header" style={{ borderBottom: `1px solid ${theme.border}` }}>
          <span>{title}</span>
          <span className="change-header-actions">
            {headerExtra}
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
        <div className="change-modal-body">{children}</div>
      </div>
    </div>
  );
}

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

  useEffect(() => {
    // Escape closes the floating window, but never the pinned dock — the dock
    // is furniture, and Escape is for dismissing transient things.
    if (pinned) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, pinned]);

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
        setDock(clampToViewport(move.clientX - offset.dx, move.clientY - offset.dy));
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

  const frameStyle: React.CSSProperties = pinned
    ? { width: getEffectiveDockWidth(), right: 0, top: contentTop, bottom: 0 }
    : { width: 380, left: dock.x, top: dock.y, maxHeight: 'min(70vh, 620px)' };

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
      <div className="change-frame-body">{children}</div>
      {pinned ? <DockResizeHandle /> : null}
    </div>
  );
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
      {pinned ? '📌' : '📍'}
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
