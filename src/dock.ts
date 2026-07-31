/**
 * Where the panel lives, and who draws it.
 *
 * Two problems this solves.
 *
 * **1. The button and the window are in different slots.** For a non-hosting
 * plugin the `toolbar` slot renders inside Ship Studio's Plugins dropdown, and a
 * dropdown unmounts its contents when it closes — so a window drawn from there
 * would vanish the moment you clicked away, which is exactly what "pin" must not
 * do. The `publish` slot sits in the workspace header and stays mounted, so the
 * button lives in `toolbar` and the window is drawn by `publish`. This module is
 * the shared state between them.
 *
 * **2. Either slot might be the one that's mounted.** Rather than betting on it,
 * both register as possible hosts and the lowest-priority number wins. If the
 * `publish` slot ever isn't there, the toolbar still draws the window while the
 * dropdown is open — degraded, but never nothing.
 *
 * State is module-level rather than React state because it has to outlive any
 * single component: the toolbar button unmounts constantly, and the window must
 * not care.
 */
import { useEffect, useState } from 'react';

export type DockMode = 'window' | 'pinned';

export interface DockState {
  open: boolean;
  mode: DockMode;
  /** Top-left of the floating window, in px from the viewport's top-left. */
  x: number;
  y: number;
  /** Width of the right-hand dock when pinned. */
  dockWidth: number;
  /** Width of the floating window when unpinned. */
  winWidth: number;
  /**
   * Height of the floating window when unpinned. `null` means "auto": the
   * frame grows with its content up to a max, the pre-resize behaviour. A
   * number means the user has dragged it to a fixed height and the body
   * scrolls instead.
   */
  winHeight: number | null;
}

const STORAGE_KEY = 'shipstudio-changelist-dock';

/**
 * Bounds for the dock width.
 *
 * The dock now takes width away from the app rather than covering it, so a
 * silly value is destructive rather than merely ugly — a stored 4000 would
 * leave Ship Studio a sliver.
 */
export const MIN_DOCK_WIDTH = 260;
export const MAX_DOCK_WIDTH = 720;

/**
 * Bounds for the floating window's width and height.
 *
 * Width shares the dock's range — the same content lives in both. Height has
 * its own, and is capped below the viewport at render time (see
 * getEffectiveWinHeight) so a saved big window can't outlive the screen it was
 * dragged on.
 */
export const MIN_WINDOW_WIDTH = MIN_DOCK_WIDTH;
export const MAX_WINDOW_WIDTH = MAX_DOCK_WIDTH;
export const MIN_WINDOW_HEIGHT = 160;
export const MAX_WINDOW_HEIGHT = 1000;

/** Bound the *stored preference*. Independent of the current window size. */
function clampWidth(width: number): number {
  if (!Number.isFinite(width)) return 360;
  return Math.round(Math.min(MAX_DOCK_WIDTH, Math.max(MIN_DOCK_WIDTH, width)));
}

function clampWinWidth(width: number): number {
  if (!Number.isFinite(width)) return 380;
  return Math.round(Math.min(MAX_WINDOW_WIDTH, Math.max(MIN_WINDOW_WIDTH, width)));
}

function clampWinHeight(height: number): number {
  if (!Number.isFinite(height)) return MIN_WINDOW_HEIGHT;
  return Math.round(Math.min(MAX_WINDOW_HEIGHT, Math.max(MIN_WINDOW_HEIGHT, height)));
}

/**
 * The width to actually use right now.
 *
 * Deliberately separate from the stored preference: on a narrow window the dock
 * is capped to half the viewport so it can't squeeze the app to a sliver, but
 * the preference is left alone so widening the window restores it. Clamping the
 * stored value instead would silently shrink it forever after one narrow moment.
 */
export function getEffectiveDockWidth(): number {
  const half = Math.max(MIN_DOCK_WIDTH, Math.round(window.innerWidth / 2));
  return Math.min(state.dockWidth, half);
}

/**
 * The fixed height to actually use right now, or `null` for auto-grow.
 *
 * Like getEffectiveDockWidth, the *stored* preference is left alone: a window
 * saved at 800px tall on a big screen is capped to the current viewport here,
 * not silently shrunk forever.
 */
export function getEffectiveWinHeight(): number | null {
  if (state.winHeight === null) return null;
  return Math.min(state.winHeight, window.innerHeight - 8);
}

/** Sensible starting spot: near the top-right, clear of the header. */
function defaultState(): DockState {
  return {
    open: false,
    mode: 'window',
    x: Math.max(16, window.innerWidth - 420),
    y: 92,
    dockWidth: 360,
    winWidth: 380,
    winHeight: null,
  };
}

/**
 * Chrome preferences live in localStorage, not plugin storage.
 *
 * Plugin storage is per-project and async — wrong on both counts here. Where you
 * put the window is about you, not about the project, and reading it
 * synchronously is what stops the panel jumping into place after first paint.
 */
function load(): DockState {
  const base = defaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<DockState>;
    return {
      // `open` is deliberately not restored for window mode — see below.
      open: saved.mode === 'pinned' ? saved.open !== false : false,
      mode: saved.mode === 'pinned' ? 'pinned' : 'window',
      x: typeof saved.x === 'number' ? saved.x : base.x,
      y: typeof saved.y === 'number' ? saved.y : base.y,
      dockWidth: clampWidth(typeof saved.dockWidth === 'number' ? saved.dockWidth : base.dockWidth),
      winWidth: clampWinWidth(typeof saved.winWidth === 'number' ? saved.winWidth : base.winWidth),
      winHeight:
        typeof saved.winHeight === 'number'
          ? clampWinHeight(saved.winHeight)
          : base.winHeight,
    };
  } catch {
    return base;
  }
}

let state: DockState = load();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function persist() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // A full or blocked localStorage must not break the panel.
  }
}

export function getDock(): DockState {
  return state;
}

export function setDock(patch: Partial<DockState>): void {
  state = { ...state, ...patch };
  if (patch.dockWidth !== undefined) state.dockWidth = clampWidth(state.dockWidth);
  if (patch.winWidth !== undefined) state.winWidth = clampWinWidth(state.winWidth);
  if (patch.winHeight !== undefined) {
    // null means auto-grow — only numbers get clamped.
    state.winHeight = patch.winHeight === null ? null : clampWinHeight(patch.winHeight);
  }
  persist();
  emit();
}

/**
 * Keep the window on screen.
 *
 * Dragging it mostly off the edge and then reopening to an invisible panel is a
 * trap worth closing; the header stays reachable no matter what. The optional
 * width/height are the window's current size — clamped separately at render
 * time via getEffectiveWinHeight, so passing the stored height is fine.
 */
export function clampToViewport(
  x: number,
  y: number,
  width = 380,
  height?: number | null
): { x: number; y: number } {
  const maxX = Math.max(0, window.innerWidth - Math.min(width, window.innerWidth) - 8);
  const maxY = Math.max(0, window.innerHeight - (height ?? 80));
  return {
    x: Math.min(Math.max(8, x), maxX),
    y: Math.min(Math.max(8, y), maxY),
  };
}

/** Subscribe a component to dock state. */
export function useDock(): DockState {
  const [, force] = useState(0);
  useEffect(() => {
    const listener = () => force((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return state;
}

// ---------------------------------------------------------------------------
// Which slot draws the window
// ---------------------------------------------------------------------------

/** Lower number wins. `publish` is preferred because it stays mounted. */
export const HOST_PRIORITY = { publish: 0, toolbar: 1 } as const;

export type HostName = keyof typeof HOST_PRIORITY;

const mountedHosts = new Set<HostName>();

function bestHost(): HostName | null {
  let best: HostName | null = null;
  for (const host of mountedHosts) {
    if (best === null || HOST_PRIORITY[host] < HOST_PRIORITY[best]) best = host;
  }
  return best;
}

/**
 * True when this slot is the one that should draw the window.
 *
 * Every slot that *could* draw it registers on mount; exactly one gets `true`,
 * so the panel is never drawn twice when both slots happen to be mounted.
 */
export function useIsWindowHost(host: HostName): boolean {
  const [owner, setOwner] = useState<HostName | null>(bestHost);

  useEffect(() => {
    mountedHosts.add(host);
    const listener = () => setOwner(bestHost());
    listeners.add(listener);
    emit(); // tell any other mounted host that the winner may have changed

    return () => {
      mountedHosts.delete(host);
      listeners.delete(listener);
      emit();
    };
  }, [host]);

  return owner === host;
}
