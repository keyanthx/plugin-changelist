/**
 * The stored shape and the list operations.
 *
 * The schema guard matters most: a blob this plugin can't understand must
 * produce an empty list, never a half-read one that renders as broken rows.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_SETTINGS,
  createItem,
  doingItemsWithBranches,
  groupItems,
  moveItem,
  nextSelectableItem,
  readStored,
  removeItem,
  setStatus,
  shouldDeferQuickSend,
  updateItem,
} from '../src/model.ts';

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

// ----------------------------------------------------------- reading back

test('a missing or empty blob gives an empty list with default settings', () => {
  assert.deepEqual(readStored(undefined).items, []);
  assert.deepEqual(readStored({}).items, []);
  assert.deepEqual(readStored({}).settings, DEFAULT_SETTINGS);
});

test('a blob from an unknown schema is ignored rather than half-read', () => {
  const future = { schema: 2, items: [item('a')], settings: { sendMode: 'prompt-only' } };
  const result = readStored(future);
  assert.deepEqual(result.items, []);
  assert.equal(result.settings.sendMode, 'launch');
});

test('a valid blob round-trips', () => {
  const stored = { schema: 1, items: [item('a'), item('b')], settings: DEFAULT_SETTINGS };
  const result = readStored(stored);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].id, 'a');
});

test('entries without an id are dropped, not rendered as blanks', () => {
  const stored = { schema: 1, items: [item('a'), { title: 'no id' }, null, 'nonsense'], settings: {} };
  assert.equal(readStored(stored).items.length, 1);
});

test('unknown difficulty and status values fall back to safe defaults', () => {
  const stored = {
    schema: 1,
    items: [item('a', { difficulty: 'impossible', status: 'archived' })],
    settings: {},
  };
  const [restored] = readStored(stored).items;
  assert.equal(restored.difficulty, 'normal');
  assert.equal(restored.status, 'todo');
});

test('a blob written before OpenCode support keeps its commands and gains the new fields', () => {
  // Exactly what v0.1.0 wrote: no improveCli, and hand-edited commands.
  const old = {
    schema: 1,
    items: [],
    settings: {
      commands: {
        easy: 'claude --model haiku {prompt}',
        normal: 'my-own-agent {prompt}',
        hard: 'claude --model opus {prompt}',
      },
      sendMode: 'prompt-only',
      createBranch: true,
      branchPrefix: 'feat/',
      improveModel: 'sonnet',
    },
  };

  const { settings } = readStored(old);
  assert.equal(settings.commands.normal, 'my-own-agent {prompt}', 'must not clobber edits');
  assert.equal(settings.sendMode, 'prompt-only');
  assert.equal(settings.branchPrefix, 'feat/');
  assert.equal(settings.improveModel, 'sonnet');
  assert.equal(settings.improveCli, 'claude', 'new field takes its default');
  assert.equal(settings.showCopiedText, false, 'preview hidden by default');
});

test('a stored showCopiedText value is preserved', () => {
  const stored = { schema: 1, items: [], settings: { showCopiedText: true } };
  assert.equal(readStored(stored).settings.showCopiedText, true);
});

test('an unknown improveCli value falls back rather than breaking Improve', () => {
  const stored = { schema: 1, items: [], settings: { improveCli: 'some-future-tool' } };
  assert.equal(readStored(stored).settings.improveCli, 'claude');
});

test('a stored opencode improveCli is preserved', () => {
  const stored = { schema: 1, items: [], settings: { improveCli: 'opencode' } };
  assert.equal(readStored(stored).settings.improveCli, 'opencode');
});

test('customised commands survive, missing ones fall back per field', () => {
  const stored = {
    schema: 1,
    items: [],
    settings: { commands: { easy: 'codex {prompt}' } },
  };
  const { settings } = readStored(stored);
  assert.equal(settings.commands.easy, 'codex {prompt}');
  assert.equal(settings.commands.hard, DEFAULT_SETTINGS.commands.hard);
});

// ------------------------------------------------------------- operations

test('an item written before templates became fields keeps its prompt', () => {
  // Old items have a prompt and nothing else. Reading that text back as free
  // text means composePrompt returns it verbatim, so nothing is lost or
  // reformatted by the upgrade.
  const old = {
    schema: 1,
    items: [{ id: 'a', title: 'Fix hero', prompt: 'Restyle <element> on the home page.', template: 'style' }],
    settings: {},
  };
  const [restored] = readStored(old).items;
  assert.equal(restored.prompt, 'Restyle <element> on the home page.');
  assert.equal(restored.notes, 'Restyle <element> on the home page.');
  assert.deepEqual(restored.fields, {});
});

test('items saved under a retired tag keep their boxes', () => {
  // `copy` became `text` and `new-section` became `add`. Dropping the tag would
  // strip the form off an item that had one, for no reason the user caused.
  const stored = {
    schema: 1,
    items: [
      { id: 'a', title: 'a', prompt: '', template: 'copy' },
      { id: 'b', title: 'b', prompt: '', template: 'new-section' },
    ],
    settings: {},
  };
  const [a, b] = readStored(stored).items;
  assert.equal(a.template, 'text');
  assert.equal(b.template, 'add');
});

test('a retired tag with no successor falls back to free text', () => {
  // `refactor` described code hygiene rather than a change a visitor notices,
  // so it has no successor — but whatever was typed still survives as notes.
  const stored = {
    schema: 1,
    items: [{ id: 'a', title: 'a', prompt: 'Tidy up Hero.tsx', template: 'refactor' }],
    settings: {},
  };
  const [item] = readStored(stored).items;
  assert.equal(item.template, null);
  assert.equal(item.notes, 'Tidy up Hero.tsx');
  assert.equal(item.prompt, 'Tidy up Hero.tsx');
});

test('an unknown tag id is kept, because custom tags only exist at runtime', () => {
  // Storage can't know which custom tags you've defined, so it keeps the id and
  // lets `findTemplate` decide. Dropping it here would mean a custom tag was
  // forgotten every time the panel reopened.
  const stored = {
    schema: 1,
    items: [{ id: 'a', title: 'a', prompt: '', template: 'custom:abc123' }],
    settings: {},
  };
  assert.equal(readStored(stored).items[0].template, 'custom:abc123');
});

test('a stored item with fields reads them back', () => {
  const stored = {
    schema: 1,
    items: [{ id: 'a', title: 't', prompt: 'What: x', notes: '', fields: { what: 'x' } }],
    settings: {},
  };
  const [restored] = readStored(stored).items;
  assert.deepEqual(restored.fields, { what: 'x' });
  assert.equal(restored.notes, '');
});

test('non-string field values are dropped rather than breaking the form', () => {
  const stored = {
    schema: 1,
    items: [{ id: 'a', title: 't', prompt: '', fields: { what: 'x', broken: 42, alsoBad: null } }],
    settings: {},
  };
  assert.deepEqual(readStored(stored).items[0].fields, { what: 'x' });
});

test('a new item starts with empty fields and notes', () => {
  const created = createItem('something', null);
  assert.deepEqual(created.fields, {});
  assert.equal(created.notes, '');
  assert.equal(created.prompt, '');
});

test('status changes stamp the matching timestamp', () => {
  const items = [item('a')];
  const doing = setStatus(items, 'a', 'doing');
  assert.ok(doing[0].sentAt);
  assert.equal(doing[0].doneAt, undefined);

  const done = setStatus(doing, 'a', 'done');
  assert.ok(done[0].doneAt);
});

test('reopening a done item clears its completion time', () => {
  const done = setStatus([item('a')], 'a', 'done');
  const reopened = setStatus(done, 'a', 'todo');
  assert.equal(reopened[0].doneAt, undefined);
});

test('sentAt is not overwritten when an item is sent a second time', () => {
  const first = setStatus([item('a')], 'a', 'doing');
  const stamp = first[0].sentAt;
  const second = setStatus(setStatus(first, 'a', 'todo'), 'a', 'doing');
  assert.equal(second[0].sentAt, stamp);
});

test('moving swaps with the neighbour that shares the same status', () => {
  // b is done, so moving c up should swap it with a, jumping over b.
  const items = [item('a'), item('b', { status: 'done' }), item('c')];
  const moved = moveItem(items, 'c', -1);
  assert.deepEqual(
    moved.map((entry) => entry.id),
    ['c', 'b', 'a']
  );
});

test('moving past the end of a group does nothing', () => {
  const items = [item('a'), item('b')];
  assert.deepEqual(moveItem(items, 'a', -1), items);
  assert.deepEqual(moveItem(items, 'b', 1), items);
  assert.deepEqual(moveItem(items, 'missing', 1), items);
});

test('groups keep the manual order within each status', () => {
  const items = [item('a'), item('b', { status: 'doing' }), item('c'), item('d', { status: 'done' })];
  const groups = groupItems(items);
  assert.deepEqual(groups.todo.map((entry) => entry.id), ['a', 'c']);
  assert.deepEqual(groups.doing.map((entry) => entry.id), ['b']);
  assert.deepEqual(groups.done.map((entry) => entry.id), ['d']);
});

test('updating one item leaves the others untouched', () => {
  const items = [item('a'), item('b')];
  const updated = updateItem(items, 'b', { title: 'changed' });
  assert.equal(updated[0].title, 'a');
  assert.equal(updated[1].title, 'changed');
});

test('removing takes exactly one item out', () => {
  assert.deepEqual(
    removeItem([item('a'), item('b')], 'a').map((entry) => entry.id),
    ['b']
  );
});

test('a new item records the branch it was written on', () => {
  const created = createItem('  padded title  ', 'feat/hero');
  assert.equal(created.title, 'padded title');
  assert.equal(created.branchAtCapture, 'feat/hero');
  assert.equal(created.status, 'todo');
  assert.ok(created.id);
});

// ------------------------------------------------ the quick-send gate

test('▶ defers to the editor when a branch would be created', () => {
  // The branch name must be on screen before a git command runs.
  const noBranch = { branchAtCapture: null, workBranch: null };
  assert.equal(shouldDeferQuickSend(noBranch, 'main', true), true);
});

test('▶ defers when the note belongs to another branch', () => {
  // Sending from here would hand the agent the wrong working tree.
  const itemBranch = { branchAtCapture: 'feat/hero', workBranch: null };
  assert.equal(shouldDeferQuickSend(itemBranch, 'main', false), true);
});

test('▶ sends straight away when the branches match', () => {
  const itemBranch = { branchAtCapture: 'main', workBranch: null };
  assert.equal(shouldDeferQuickSend(itemBranch, 'main', false), false);
});

test('▶ sends when there is no branch to worry about', () => {
  const noBranch = { branchAtCapture: null, workBranch: null };
  assert.equal(shouldDeferQuickSend(noBranch, 'main', false), false);
});

// -------------------------------------------------- dead-branch detection

test('only items in flight with a work branch are worth checking', () => {
  const items = [
    item('doing-branch', { status: 'doing', workBranch: 'feat/x' }),
    item('doing-plain', { status: 'doing', workBranch: null }),
    item('todo-branch', { workBranch: 'feat/y' }),
    item('done-branch', { status: 'done', workBranch: 'feat/z' }),
  ];
  assert.deepEqual(
    doingItemsWithBranches(items).map((entry) => entry.id),
    ['doing-branch']
  );
});

// ------------------------------------------------------- keyboard selection

test('selection walks only the actionable rows, doing group first', () => {
  // Visual order is doing before todo regardless of array order.
  const items = [
    item('todo-a'),
    item('doing-b', { status: 'doing' }),
    item('done-c', { status: 'done' }),
    item('todo-d'),
  ];
  assert.equal(nextSelectableItem(items, null, 1), 'doing-b', 'down starts at the first actionable');
  assert.equal(nextSelectableItem(items, 'doing-b', 1), 'todo-a');
  assert.equal(nextSelectableItem(items, 'todo-a', 1), 'todo-d');
  assert.equal(nextSelectableItem(items, 'todo-d', 1), 'todo-d', 'clamps at the end');
});

test('selection moves up through the same order', () => {
  const items = [
    item('doing-b', { status: 'doing' }),
    item('todo-a'),
    item('todo-d'),
    item('done-c', { status: 'done' }),
  ];
  assert.equal(nextSelectableItem(items, null, -1), 'todo-d', 'up from nothing lands on the last');
  assert.equal(nextSelectableItem(items, 'todo-a', -1), 'doing-b');
  assert.equal(nextSelectableItem(items, 'doing-b', -1), 'doing-b', 'clamps at the start');
});

test('selection skips done rows entirely', () => {
  const items = [item('done-c', { status: 'done' }), item('todo-a')];
  assert.equal(nextSelectableItem(items, null, 1), 'todo-a');
});

test('a stale selection behaves like none', () => {
  const items = [item('todo-a')];
  assert.equal(nextSelectableItem(items, 'vanished', 1), 'todo-a');
});

test('nothing selectable yields nothing', () => {
  assert.equal(nextSelectableItem([], 'todo-a', 1), null);
  assert.equal(nextSelectableItem([item('done-c', { status: 'done' })], null, 1), null);
});
