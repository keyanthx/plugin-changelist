/**
 * A snapshot of how the panel is actually laid out, for pasting back to me.
 *
 * Ship Studio has no devtools, so when the panel misbehaves there is otherwise
 * no way to tell a sizing problem from a scrolling one, or to see whether the
 * host's own CSS is interfering. Guessing from a description has already cost
 * two wrong fixes for the "Settings won't scroll" bug; this replaces the guess
 * with numbers.
 *
 * Everything here is read-only measurement of the plugin's own elements plus
 * the ancestors above them. No host state is modified.
 */

/** CSS properties that make an ancestor the containing block for `fixed`. */
const CONTAINING_BLOCK_PROPS = ['transform', 'filter', 'perspective', 'contain', 'backdropFilter'] as const;

function describeElement(element: Element): string {
  const id = element.id ? `#${element.id}` : '';
  const classes =
    typeof element.className === 'string' && element.className.trim()
      ? '.' + element.className.trim().split(/\s+/).slice(0, 3).join('.')
      : '';
  return `${element.tagName.toLowerCase()}${id}${classes}`.slice(0, 60);
}

function rectOf(element: Element) {
  const r = element.getBoundingClientRect();
  return {
    top: Math.round(r.top),
    left: Math.round(r.left),
    width: Math.round(r.width),
    height: Math.round(r.height),
    bottom: Math.round(r.bottom),
  };
}

/**
 * Ancestors that would capture a `position: fixed` descendant.
 *
 * If this list isn't empty, the dock's `fixed` positioning is resolving against
 * that element rather than the viewport — which is the difference between a
 * frame that fits the screen and one that runs off the bottom of it.
 */
function containingBlockAncestors(start: Element): string[] {
  const found: string[] = [];
  let node: Element | null = start.parentElement;

  while (node && node !== document.documentElement) {
    const style = getComputedStyle(node);
    for (const prop of CONTAINING_BLOCK_PROPS) {
      const value = style[prop as keyof CSSStyleDeclaration] as string | undefined;
      if (value && value !== 'none' && value !== 'normal') {
        found.push(`${describeElement(node)} { ${prop}: ${value.slice(0, 40)} }`);
        break;
      }
    }
    node = node.parentElement;
  }
  return found;
}

export function collectDiagnostics(): string {
  const frame = document.querySelector('.change-frame') as HTMLElement | null;
  const body = document.querySelector('.change-frame-body') as HTMLElement | null;

  if (!frame || !body) return 'Change List: panel is not open, so there is nothing to measure.';

  const frameStyle = getComputedStyle(frame);
  const bodyStyle = getComputedStyle(body);

  const payload = {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    devicePixelRatio: window.devicePixelRatio,

    mode: frame.classList.contains('change-frame-pinned') ? 'pinned' : 'window',

    frame: {
      rect: rectOf(frame),
      position: frameStyle.position,
      height: frameStyle.height,
      maxHeight: frameStyle.maxHeight,
      overflow: frameStyle.overflow,
      display: frameStyle.display,
      flexDirection: frameStyle.flexDirection,
      // If this exceeds the viewport height, the bottom of the panel is
      // off-screen and no amount of scrolling inside it will help.
      extendsBelowViewport: frame.getBoundingClientRect().bottom > window.innerHeight + 1,
    },

    body: {
      rect: rectOf(body),
      clientHeight: body.clientHeight,
      scrollHeight: body.scrollHeight,
      scrollTop: body.scrollTop,
      overflowY: bodyStyle.overflowY,
      flex: `${bodyStyle.flexGrow} ${bodyStyle.flexShrink} ${bodyStyle.flexBasis}`,
      minHeight: bodyStyle.minHeight,
      // The single most telling number: false means there is nothing to scroll,
      // which points at sizing rather than at the scroll gesture.
      contentOverflows: body.scrollHeight > body.clientHeight + 1,
      maxScrollTop: Math.max(0, body.scrollHeight - body.clientHeight),
    },

    // Non-empty means `position: fixed` is not resolving against the viewport.
    containingBlockAncestors: containingBlockAncestors(frame),

    scrollableAncestorsOfBody: (() => {
      const chain: string[] = [];
      let node: HTMLElement | null = body.parentElement;
      while (node && chain.length < 6) {
        const s = getComputedStyle(node);
        chain.push(`${describeElement(node)} { overflow:${s.overflow}; height:${s.height} }`);
        node = node.parentElement;
      }
      return chain;
    })(),
  };

  return JSON.stringify(payload, null, 2);
}
