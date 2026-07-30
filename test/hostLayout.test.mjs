/**
 * The geometry behind the pinned dock's reflow.
 *
 * `hostLayout.ts` is the one module that edits DOM the plugin doesn't own, so
 * the decisions it makes are kept as pure functions over plain rectangles and
 * pinned down here. The cases that matter are the ones it must *reject*: pick
 * the wrong element and the plugin squashes Ship Studio's toolbars, or worse,
 * half-applies a layout it can't undo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isContentRegion, shrankBy } from '../src/hostLayout.ts';

const VIEW = { width: 1280, height: 820 };
const HEADER_BOTTOM = 89;

const box = (left, top, right, bottom) => ({ left, top, right, bottom });

// ------------------------------------------------------- what counts as content

test('the content row below the toolbars is accepted', () => {
  assert.ok(isContentRegion(box(0, 89, 1280, 820), VIEW, HEADER_BOTTOM));
});

test('the whole app is rejected, because it would squash the toolbars', () => {
  // Starts at y=0, so padding it would narrow the header and the Edit bar —
  // exactly the fault the screenshots showed.
  assert.ok(!isContentRegion(box(0, 0, 1280, 820), VIEW, HEADER_BOTTOM));
});

test('a toolbar is rejected — it does not reach the bottom', () => {
  assert.ok(!isContentRegion(box(0, 0, 1280, 52), VIEW, HEADER_BOTTOM));
  assert.ok(!isContentRegion(box(0, 52, 1280, 89), VIEW, HEADER_BOTTOM));
});

test('a pane that stops short of the right edge is rejected', () => {
  assert.ok(!isContentRegion(box(0, 89, 900, 820), VIEW, HEADER_BOTTOM));
});

test('a sidebar that does not reach the left edge is rejected', () => {
  assert.ok(!isContentRegion(box(920, 89, 1280, 820), VIEW, HEADER_BOTTOM));
});

test('a short strip at the bottom is rejected', () => {
  // Reaches three edges but is only 40px tall — a status bar, not the content.
  assert.ok(!isContentRegion(box(0, 780, 1280, 820), VIEW, HEADER_BOTTOM));
});

test('small measurement noise on the edges is tolerated', () => {
  // Sub-pixel layout and 1px borders should not disqualify the real container.
  assert.ok(isContentRegion(box(2, 87, 1277, 817), VIEW, HEADER_BOTTOM));
});

test('with no toolbars, a full-height container is still accepted', () => {
  assert.ok(isContentRegion(box(0, 0, 1280, 820), VIEW, 0));
});

// ------------------------------------------------------------- proving a reflow

test('a full-width shrink counts', () => {
  assert.ok(shrankBy(box(0, 89, 1280, 820), box(0, 89, 920, 820), 360));
});

test('no movement does not count', () => {
  // The failure mode this exists to catch: the strategy applied, the layout
  // ignored it, and without this check we would have left padding behind and
  // reported success.
  assert.ok(!shrankBy(box(0, 89, 1280, 820), box(0, 89, 1280, 820), 360));
});

test('a token shift does not count as making room', () => {
  assert.ok(!shrankBy(box(0, 89, 1280, 820), box(0, 89, 1260, 820), 360));
});

test('slightly less than asked for still counts', () => {
  // Borders and rounding can eat a few px; demanding exactness would reject
  // reflows that plainly worked.
  assert.ok(shrankBy(box(0, 89, 1280, 820), box(0, 89, 934, 820), 360));
});

test('an element that grew does not count', () => {
  assert.ok(!shrankBy(box(0, 89, 1280, 820), box(0, 89, 1400, 820), 360));
});
