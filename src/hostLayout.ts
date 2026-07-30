/**
 * Making room for the pinned dock by reflowing Ship Studio's own layout.
 *
 * This is the only file that touches DOM the plugin doesn't own, so it is
 * written defensively throughout.
 *
 * **Why it exists.** A `position: fixed` panel can never displace anything — it
 * floats above the app, covering the toolbar and the preview. To sit *beside*
 * the preview the way Ship Studio's own Edit panel does, the content area has to
 * get narrower. Nothing in the plugin API offers that, so we do it by hand.
 *
 * **Three rules, because this is host DOM:**
 *
 * 1. *Never guess blindly.* Everything is measured from an anchor the plugin
 *    itself renders, not from hardcoded selectors a Ship Studio update would
 *    silently break.
 * 2. *Prove it worked.* A strategy is kept only if a real element measurably got
 *    narrower. Anything else is reverted — a half-applied layout is worse than
 *    an overlay.
 * 3. *Always restorable.* Every mutation records the exact prior inline value
 *    (including "there wasn't one") and is reverted on unpin, on close, and on
 *    plugin deactivate.
 */

/** A plain rect, so the geometry logic can be tested without a DOM. */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Viewport {
  width: number;
  height: number;
}

/** How far off an edge can be and still count as "reaching" it. */
const EDGE_TOLERANCE = 6;

/**
 * Does this box look like the app's content region — the area below the
 * toolbars that runs to the bottom-right corner?
 *
 * Pure, so `test/hostLayout.test.mjs` can cover the tricky cases (the header
 * itself, a full-screen overlay, a narrow sidebar) without a browser.
 */
export function isContentRegion(box: Box, viewport: Viewport, headerBottom: number): boolean {
  const reachesLeft = box.left <= EDGE_TOLERANCE;
  const reachesRight = box.right >= viewport.width - EDGE_TOLERANCE;
  const reachesBottom = box.bottom >= viewport.height - EDGE_TOLERANCE;
  // Must start at or below the header, or we'd pick the whole app and squash
  // the toolbars too — the thing the screenshots show as wrong.
  const startsBelowHeader = box.top >= headerBottom - EDGE_TOLERANCE;
  // And it must be a region, not a sliver.
  const tallEnough = box.bottom - box.top >= 120;

  return reachesLeft && reachesRight && reachesBottom && startsBelowHeader && tallEnough;
}

/** Did applying a strategy actually move this element's right edge inward? */
export function shrankBy(before: Box, after: Box, expected: number): boolean {
  const moved = before.right - after.right;
  // Allow slack for borders and sub-pixel layout, but demand most of the width.
  return moved >= expected * 0.7;
}

// ---------------------------------------------------------------------------
// Recording and undoing what we change
// ---------------------------------------------------------------------------

interface Mutation {
  element: HTMLElement;
  property: string;
  /** The previous inline value, or null when the property wasn't set inline. */
  previous: string | null;
}

let mutations: Mutation[] = [];

function setStyle(element: HTMLElement, property: string, value: string): void {
  // `getPropertyValue` returns '' for a property that isn't set inline, which is
  // distinct from one set to an empty value — record it as null so the undo
  // removes the property rather than pinning it to ''.
  const previous = element.style.getPropertyValue(property);
  mutations.push({ element, property, previous: previous === '' ? null : previous });
  element.style.setProperty(property, value);
}

/** Undo every recorded change, most recent first. */
function undoAll(): void {
  for (const mutation of mutations.reverse()) {
    if (mutation.previous === null || mutation.previous === '') {
      mutation.element.style.removeProperty(mutation.property);
    } else {
      mutation.element.style.setProperty(mutation.property, mutation.previous);
    }
  }
  mutations = [];
}

// ---------------------------------------------------------------------------
// Diagnostics — the substitute for devtools
// ---------------------------------------------------------------------------

export interface LayoutReport {
  /** 'reflow' when the app made room; 'fallback' when we're overlaying. */
  outcome: 'reflow' | 'fallback' | 'off';
  /** Which strategy stuck. */
  strategy: string | null;
  /** A human description of the element we resized. */
  container: string | null;
  /** What we measured the toolbars' bottom edge to be. */
  headerBottom: number;
  /** Top of the content region — where the dock should start. */
  contentTop: number;
  /** Why it fell back, when it did. */
  note: string | null;
}

let report: LayoutReport = {
  outcome: 'off',
  strategy: null,
  container: null,
  headerBottom: 0,
  contentTop: 0,
  note: null,
};

const listeners = new Set<() => void>();

export function getLayoutReport(): LayoutReport {
  return report;
}

export function subscribeLayout(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function publish(next: Partial<LayoutReport>): void {
  report = { ...report, ...next };
  for (const listener of listeners) listener();
}

/**
 * Poke the app so panes that size themselves from a ResizeObserver or a resize
 * listener recalculate after we change the layout.
 *
 * The flag matters: our own listener re-applies the layout on resize, so
 * without it this dispatch re-triggers us — "Undo layout change" undid nothing
 * because the resize it fired immediately put the padding back, and every apply
 * scheduled another apply. The window is longer than the listener's debounce so
 * the echo is fully swallowed.
 */
let selfDispatchDepth = 0;

function nudgeHostLayout(): void {
  selfDispatchDepth += 1;
  window.dispatchEvent(new Event('resize'));
  window.setTimeout(() => {
    selfDispatchDepth = Math.max(0, selfDispatchDepth - 1);
  }, 300);
}

/** True while a resize event we fired ourselves is still echoing around. */
export function isSelfDispatchedResize(): boolean {
  return selfDispatchDepth > 0;
}

/** A short, readable identity for an element, for the Settings diagnostics. */
function describe(element: HTMLElement): string {
  const id = element.id ? `#${element.id}` : '';
  const classes = element.className && typeof element.className === 'string'
    ? '.' + element.className.trim().split(/\s+/).slice(0, 3).join('.')
    : '';
  return `${element.tagName.toLowerCase()}${id}${classes}`.slice(0, 80);
}

// ---------------------------------------------------------------------------
// Measuring
// ---------------------------------------------------------------------------

const ANCHOR_SELECTOR = '[data-changelist-anchor]';

function viewport(): Viewport {
  return { width: window.innerWidth, height: window.innerHeight };
}

/** Is this part of the plugin's own UI? Those must never be measured. */
function isOurs(element: Element): boolean {
  return Boolean(element.closest('.change-frame, .change-overlay'));
}

/**
 * The bottom edge of the app's stack of toolbars.
 *
 * Ship Studio has more than one — a header and an Edit/Inspect bar — and they
 * are *siblings*, not ancestors of each other. Walking up from the plugin's
 * anchor therefore only ever finds the bar the anchor sits in, which is how the
 * dock ended up covering the second one.
 *
 * So instead: every full-width, short element in the top third of the window
 * counts as a bar, and the answer is the lowest edge among them.
 */
export function measureHeaderBottom(): number {
  const view = viewport();
  let bottom = 0;

  for (const element of Array.from(document.body.querySelectorAll('*'))) {
    if (!(element instanceof HTMLElement) || isOurs(element)) continue;
    const box = element.getBoundingClientRect();

    const spansWidth = box.left <= EDGE_TOLERANCE && box.right >= view.width - EDGE_TOLERANCE;
    const isShort = box.height > 0 && box.height < view.height * 0.3;
    const nearTop = box.top < view.height * 0.35;

    if (spansWidth && isShort && nearTop) bottom = Math.max(bottom, box.bottom);
  }

  // Fall back to the anchor's own bar if nothing looked like a toolbar.
  if (bottom === 0) {
    const anchor = document.querySelector(ANCHOR_SELECTOR);
    if (anchor) bottom = anchor.getBoundingClientRect().bottom;
  }
  return Math.round(bottom);
}

/**
 * The outermost element that looks like the content region.
 *
 * Outermost matters: the content row contains the preview and any side panels,
 * and padding on the row is what pushes them all in. Picking an inner child
 * would move one pane and leave the rest.
 */
function findContentRegion(headerBottom: number): HTMLElement | null {
  const view = viewport();

  // Search from <body>, not from `#root`. `#root` is only the app root by
  // convention, and in our own preview harness it is the *plugin's* React root —
  // searching inside it found nothing. <body> is the one node guaranteed to
  // contain the whole app.
  const queue: HTMLElement[] = [document.body];

  while (queue.length > 0) {
    const element = queue.shift() as HTMLElement;

    if (element !== document.body && !isOurs(element)) {
      // Breadth-first, so the first match is the outermost one — the row that
      // holds every pane, rather than one pane inside it.
      if (isContentRegion(element.getBoundingClientRect(), view, headerBottom)) return element;
    }

    for (const child of Array.from(element.children)) {
      if (child instanceof HTMLElement && !isOurs(child)) queue.push(child);
    }
  }
  return null;
}

/**
 * The element whose narrowing proves the reflow worked.
 *
 * The widest descendant that currently reaches the right edge — in Ship Studio
 * that's the preview pane. If it doesn't move, nothing really reflowed.
 */
function findVictim(container: HTMLElement): HTMLElement | null {
  const view = viewport();
  let best: HTMLElement | null = null;
  let bestWidth = 0;

  for (const child of Array.from(container.querySelectorAll('*'))) {
    if (!(child instanceof HTMLElement) || isOurs(child)) continue;
    const box = child.getBoundingClientRect();
    if (box.right < view.width - EDGE_TOLERANCE) continue;
    if (box.width > bestWidth) {
      bestWidth = box.width;
      best = child;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Applying
// ---------------------------------------------------------------------------

type Strategy = { name: string; apply: (element: HTMLElement, width: number) => void };

const STRATEGIES: Strategy[] = [
  {
    name: 'padding-right',
    apply: (element, width) => {
      setStyle(element, 'box-sizing', 'border-box');
      setStyle(element, 'padding-right', `${width}px`);
    },
  },
  {
    name: 'width',
    apply: (element, width) => {
      const current = element.getBoundingClientRect().width;
      setStyle(element, 'box-sizing', 'border-box');
      setStyle(element, 'width', `${Math.max(0, current - width)}px`);
    },
  },
];

/**
 * Make room for a dock of `width` px, or report that we couldn't.
 *
 * Safe to call repeatedly — it restores first, so re-running on resize or a
 * width change never stacks padding on padding.
 */
export function applyHostLayout(width: number): LayoutReport {
  restoreHostLayout();

  const headerBottom = measureHeaderBottom();
  const container = findContentRegion(headerBottom);

  if (!container) {
    publish({
      outcome: 'fallback',
      strategy: null,
      container: null,
      headerBottom,
      contentTop: headerBottom,
      note: "Couldn't find a content area below the toolbars, so the dock overlays instead.",
    });
    return report;
  }

  const contentTop = Math.round(container.getBoundingClientRect().top);
  const victim = findVictim(container);

  if (!victim) {
    publish({
      outcome: 'fallback',
      strategy: null,
      container: describe(container),
      headerBottom,
      contentTop,
      note: 'Nothing inside the content area reaches the right edge, so there was nothing to move.',
    });
    return report;
  }

  for (const strategy of STRATEGIES) {
    const before = victim.getBoundingClientRect();
    strategy.apply(container, width);
    // Let panes that listen for size changes react before we measure.
    nudgeHostLayout();
    const after = victim.getBoundingClientRect();

    if (shrankBy(before, after, width)) {
      publish({
        outcome: 'reflow',
        strategy: strategy.name,
        container: describe(container),
        headerBottom,
        contentTop: Math.round(container.getBoundingClientRect().top),
        note: null,
      });
      return report;
    }

    undoAll(); // didn't take — leave no trace before trying the next one
  }

  publish({
    outcome: 'fallback',
    strategy: null,
    container: describe(container),
    headerBottom,
    contentTop,
    note: "The layout didn't respond to padding or width, so the dock overlays instead.",
  });
  return report;
}

/** Put Ship Studio's layout back exactly as it was. */
export function restoreHostLayout(): void {
  if (mutations.length > 0) undoAll();
  if (report.outcome !== 'off') {
    publish({ outcome: 'off', strategy: null, note: null });
    nudgeHostLayout();
  }
}
