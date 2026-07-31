/**
 * The whole list exported as Markdown.
 *
 * The export mirrors the on-screen grouping and ordering — In progress, then
 * To do, then Done — and keeps it plain enough that pasting it into a PR body,
 * an issue or a running agent reads cleanly.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { itemsToMarkdown } from '../src/markdown.ts';

const item = (id, overrides = {}) => ({
  id,
  title: id,
  prompt: '',
  difficulty: 'normal',
  status: 'todo',
  template: null,
  branchAtCapture: null,
  workBranch: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

test('an empty list exports a single line', () => {
  assert.equal(itemsToMarkdown([]), 'Nothing to do.');
});

test('sections appear in doing, todo, done order and skip empty ones', () => {
  const md = itemsToMarkdown([
    item('c', { status: 'done' }),
    item('a'),
    item('b', { status: 'doing' }),
  ]);

  const doing = md.indexOf('## In progress');
  const todo = md.indexOf('## To do');
  const done = md.indexOf('## Done');
  assert.ok(doing >= 0 && todo > doing && done > todo, 'sections ordered');
  assert.ok(!md.includes('`'), 'no stray backticks');
});

test('a row carries the title, difficulty and branch', () => {
  const md = itemsToMarkdown([
    item('Fix hero', { prompt: 'Shorten the hero headline.', difficulty: 'easy', branchAtCapture: 'feat/hero' }),
  ]);
  assert.ok(md.includes('- [ ] **Fix hero** · Easy · on feat/hero'), md);
  assert.ok(md.includes('  Shorten the hero headline.'), md);
});

test('a blank title falls back to Untitled change', () => {
  const md = itemsToMarkdown([item('', { title: '  ' })]);
  assert.ok(md.includes('**Untitled change**'), md);
});

test('done rows render a checked box', () => {
  const md = itemsToMarkdown([item('Shipped', { status: 'done' })]);
  assert.ok(md.includes('- [x] **Shipped**'), md);
});

test('a multiline prompt is indented to stay under its row', () => {
  const md = itemsToMarkdown([item('Bug', { prompt: 'Line one.\nLine two.' })]);
  assert.ok(md.includes('  Line one.\n  Line two.'), md);
});
