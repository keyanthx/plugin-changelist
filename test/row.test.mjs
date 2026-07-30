/**
 * When the branch tag is allowed to appear.
 *
 * This is load-bearing for the row's hierarchy, not cosmetic. The tag sits
 * beside the title and competes with it for width — an earlier version rendered
 * an in-progress row as "Rework the …" next to a 110px branch name. Every tag
 * that shows without earning it costs title.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// These live in model.ts rather than row.tsx: they're pure item logic, not
// presentation — and Node can strip types from .ts but not JSX in .tsx.
import { branchForItem, shouldShowBranch } from '../src/model.ts';

test('a branch that matches where you already are is not shown', () => {
  // Showing "main" while standing on main is pure noise.
  assert.equal(shouldShowBranch('main', 'main'), false);
});

test('a branch different from the current one is shown', () => {
  assert.equal(shouldShowBranch('feat/hero', 'main'), true);
});

test('no branch means no tag', () => {
  assert.equal(shouldShowBranch(null, 'main'), false);
  assert.equal(shouldShowBranch(undefined, 'main'), false);
  assert.equal(shouldShowBranch('', 'main'), false);
});

test('with no current branch known, a recorded branch still shows', () => {
  // Better to show the fact we have than to hide it because context is missing.
  assert.equal(shouldShowBranch('feat/hero', null), true);
});

test('the work branch wins over the capture branch', () => {
  // Where it's being worked matters more than where it was jotted.
  assert.equal(
    branchForItem({ workBranch: 'feat/in-flight', branchAtCapture: 'main' }),
    'feat/in-flight'
  );
});

test('without a work branch it falls back to where it was noted', () => {
  assert.equal(branchForItem({ workBranch: null, branchAtCapture: 'feat/noted-here' }), 'feat/noted-here');
});

test('an item with neither has no branch', () => {
  assert.equal(branchForItem({ workBranch: null, branchAtCapture: null }), null);
});

test('the two compose: an item worked on the current branch shows nothing', () => {
  const item = { workBranch: 'feat/hero', branchAtCapture: 'main' };
  assert.equal(shouldShowBranch(branchForItem(item), 'feat/hero'), false);
});
