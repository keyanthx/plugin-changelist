/**
 * Tags you make yourself.
 *
 * The riskiest part is what happens to half-finished and deleted tags: a tag
 * you're midway through creating must not render a row of blank captions, and
 * deleting one must not destroy the items that were using it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createCustomTag,
  createField,
  isCustomTagId,
  isUsable,
  readCustomTags,
  toTemplate,
} from '../src/customTags.ts';
import { composePrompt, findTemplate } from '../src/templates.ts';

// ------------------------------------------------------------------ shape

test('a new tag starts empty but ready to fill', () => {
  const tag = createCustomTag();
  assert.equal(tag.label, '');
  assert.equal(tag.fields.length, 2, 'starts with a couple of boxes to type into');
  assert.ok(isCustomTagId(tag.id));
});

test('custom ids can never collide with a built-in tag', () => {
  const tag = createCustomTag();
  assert.ok(tag.id.startsWith('custom:'));
  for (const builtIn of ['style', 'text', 'layout', 'add', 'behaviour', 'bug']) {
    assert.notEqual(tag.id, builtIn);
    assert.equal(isCustomTagId(builtIn), false);
  }
});

test('every field gets its own id', () => {
  const ids = new Set([createField().id, createField().id, createField().id]);
  assert.equal(ids.size, 3);
});

// --------------------------------------------------------- when it's usable

test('a tag needs a name and at least one named box to be offered', () => {
  const tag = createCustomTag();
  assert.equal(isUsable(tag), false, 'brand new: nothing typed yet');

  tag.label = 'SEO';
  assert.equal(isUsable(tag), false, 'named, but asks nothing');

  tag.fields[0].label = 'Page';
  assert.equal(isUsable(tag), true);
});

test('whitespace does not count as filled in', () => {
  const tag = createCustomTag();
  tag.label = '   ';
  tag.fields[0].label = '   ';
  assert.equal(isUsable(tag), false);
});

// ------------------------------------------------------- becoming a template

test('unnamed boxes are dropped, so a half-made tag has no blank captions', () => {
  const tag = createCustomTag();
  tag.label = 'SEO';
  tag.fields[0].label = 'Page';
  // fields[1] deliberately left unnamed
  const template = toTemplate(tag);
  assert.equal(template.fields.length, 1);
  assert.equal(template.fields[0].label, 'Page');
});

test('a nameless tag still renders with a placeholder name', () => {
  const tag = createCustomTag();
  assert.equal(toTemplate(tag).label, 'Untitled');
});

test('a custom tag composes exactly like a built-in one', () => {
  const tag = createCustomTag();
  tag.label = 'SEO';
  tag.fields[0] = { id: 'page', label: 'Page', placeholder: '' };
  tag.fields[1] = { id: 'keyword', label: 'Target keyword', placeholder: '' };

  const out = composePrompt(toTemplate(tag), { page: '/about', keyword: 'driving school' }, 'Keep it short.');
  assert.equal(out, 'Page: /about\nTarget keyword: driving school\n\nKeep it short.');
});

test('blank boxes are skipped in a custom tag too', () => {
  const tag = createCustomTag();
  tag.label = 'SEO';
  tag.fields[0] = { id: 'page', label: 'Page', placeholder: '' };
  tag.fields[1] = { id: 'keyword', label: 'Target keyword', placeholder: '' };
  assert.equal(composePrompt(toTemplate(tag), { page: '/about' }, ''), 'Page: /about');
});

// ------------------------------------------------------------------ lookup

test('a custom tag is found alongside the built-in ones', () => {
  const tag = createCustomTag();
  tag.label = 'SEO';
  tag.fields[0].label = 'Page';
  const custom = [toTemplate(tag)];

  assert.equal(findTemplate(tag.id, custom)?.label, 'SEO');
  assert.equal(findTemplate('style', custom)?.label, 'Style', 'built-ins still resolve');
});

test('an item using a deleted tag falls back to free text', () => {
  // Deleting a tag must not destroy items that referenced it — the notes still
  // hold everything typed, so the item degrades to a plain prompt.
  assert.equal(findTemplate('custom:deleted', []), null);
  assert.equal(composePrompt(null, { page: '/about' }, 'Still here.'), 'Still here.');
});

// --------------------------------------------------------------- reading back

test('stored tags round-trip', () => {
  const raw = [{ id: 'custom:a', label: 'SEO', fields: [{ id: 'f1', label: 'Page', placeholder: '/about' }] }];
  assert.deepEqual(readCustomTags(raw), [
    { id: 'custom:a', label: 'SEO', fields: [{ id: 'f1', label: 'Page', placeholder: '/about', multiline: false }] },
  ]);
});

test('nameless tags and unlabelled boxes are dropped on read', () => {
  const raw = [
    { id: 'custom:a', label: '', fields: [] },
    { id: 'custom:b', label: 'Good', fields: [{ id: 'f1', label: 'Page' }, { id: 'f2', label: '  ' }] },
  ];
  const tags = readCustomTags(raw);
  assert.equal(tags.length, 1);
  assert.equal(tags[0].label, 'Good');
  assert.equal(tags[0].fields.length, 1);
});

test('junk does not throw or leak through', () => {
  assert.deepEqual(readCustomTags(null), []);
  assert.deepEqual(readCustomTags('nope'), []);
  assert.deepEqual(readCustomTags([42, null, 'x']), []);
  assert.deepEqual(readCustomTags([{ id: 'custom:a', label: 'X', fields: 'not an array' }]), [
    { id: 'custom:a', label: 'X', fields: [] },
  ]);
});
