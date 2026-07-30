/**
 * The prompt-help layers: nudges, templates, and parsing what Claude returns.
 *
 * The nudges are tested against prompts of the kind actually typed in a hurry,
 * because a hint that fires on a perfectly good prompt is worse than no hint.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { countBlanks, lintPrompt, wordCount } from '../src/lint.ts';
import { TEMPLATES, fillSkeleton, findTemplate } from '../src/templates.ts';
import { extractJson, readImproved, stripAnsi, unwrapCliOutput } from '../src/ai.ts';

const ids = (prompt) => lintPrompt(prompt).map((nudge) => nudge.id);

// ----------------------------------------------------------------- nudges

test('an empty prompt is never nagged', () => {
  assert.deepEqual(lintPrompt(''), []);
  assert.deepEqual(lintPrompt('   \n  '), []);
});

test('a well-formed prompt produces no nudges', () => {
  const good =
    'The hero headline on the home page should be two lines instead of three, ' +
    'and the subhead below it needs to keep its current size.';
  assert.deepEqual(ids(good), []);
});

test('a prompt with no location is flagged', () => {
  assert.ok(ids('It should be smaller and lighter than it currently is right now today').includes('where'));
});

test('naming a file counts as saying where', () => {
  const withFile =
    'In src/components/Hero.tsx the padding should drop to 24px instead of the 48px it uses now.';
  assert.ok(!ids(withFile).includes('where'));
});

test('naming a section counts as saying where', () => {
  const withSection =
    'The footer needs its links spaced further apart so that they stop touching on mobile screens.';
  assert.ok(!ids(withSection).includes('where'));
});

test('a prompt with no desired outcome is flagged', () => {
  assert.ok(ids('The hero section on the home page is too big and the padding is enormous').includes('outcome'));
});

test('short prompts are flagged as likely to need a follow-up', () => {
  assert.ok(ids('fix the footer').includes('short'));
});

test('vague adjectives are called out', () => {
  assert.ok(ids('The about page hero should look nicer than it does at the moment please').includes('vague'));
});

test('unfilled template blanks are counted', () => {
  assert.equal(countBlanks('Restyle <element> in <section> on <page>.'), 3);
  assert.equal(countBlanks('nothing to fill'), 0);

  const nudge = lintPrompt('Restyle <element> on <page>.').find((entry) => entry.id === 'blanks');
  assert.match(nudge.message, /2 blanks/);
});

test('one blank is described in the singular', () => {
  const nudge = lintPrompt('Restyle the hero on <page>, it should be smaller than it is now.').find(
    (entry) => entry.id === 'blanks'
  );
  assert.match(nudge.message, /^1 blank /);
});

test('word count ignores extra whitespace', () => {
  assert.equal(wordCount('  one   two \n three '), 3);
});

// -------------------------------------------------------------- templates

test('every template has a distinct id and a non-empty skeleton', () => {
  const seen = new Set();
  for (const template of TEMPLATES) {
    assert.ok(!seen.has(template.id), `duplicate template id ${template.id}`);
    seen.add(template.id);
    assert.ok(template.skeleton.trim().length > 0);
    assert.ok(template.label.length > 0);
    assert.ok(template.hint.length > 0);
  }
});

test('every skeleton has blanks for the reader to fill', () => {
  for (const template of TEMPLATES) {
    assert.ok(countBlanks(template.skeleton) >= 3, `${template.id} has too few blanks`);
  }
});

test('the title fills the first blank of a skeleton', () => {
  const style = findTemplate('style');
  const filled = fillSkeleton(style, 'the hero image');
  assert.ok(filled.startsWith('Restyle the hero image in'));
  assert.equal(countBlanks(filled), countBlanks(style.skeleton) - 1);
});

test('an empty title leaves the skeleton alone', () => {
  const style = findTemplate('style');
  assert.equal(fillSkeleton(style, '   '), style.skeleton);
});

test('an unknown template id resolves to nothing', () => {
  assert.equal(findTemplate(null), null);
  assert.equal(findTemplate('nope'), null);
});

// ------------------------------------------------------- parsing the reply

test('a bare JSON object is parsed', () => {
  assert.deepEqual(extractJson('{"prompt":"x"}'), { prompt: 'x' });
});

test('a fenced JSON block is parsed', () => {
  assert.deepEqual(extractJson('```json\n{"prompt":"x"}\n```'), { prompt: 'x' });
});

test('JSON with a sentence in front of it is parsed', () => {
  assert.deepEqual(extractJson('Sure! Here you go:\n{"prompt":"x"}'), { prompt: 'x' });
});

test('ANSI colour codes are stripped before parsing', () => {
  const esc = String.fromCharCode(27);
  assert.equal(stripAnsi(`${esc}[0m{"prompt":"x"}${esc}[0m`), '{"prompt":"x"}');
  assert.equal(stripAnsi('no codes here'), 'no codes here');
});

test('JSON wrapped in colour codes still parses', () => {
  const esc = String.fromCharCode(27);
  const coloured = `${esc}[32m{"prompt":"x","difficulty":"easy"}${esc}[0m`;
  assert.deepEqual(extractJson(coloured), { prompt: 'x', difficulty: 'easy' });
});

test("OpenCode's plain-stdout reply parses with no envelope", () => {
  // What `opencode run` actually prints: the bare reply, decoration on stderr.
  const stdout = '{"prompt":"do it","title":"Do it","difficulty":"easy"}\n';
  const improved = readImproved(extractJson(unwrapCliOutput(stdout)));
  assert.equal(improved.prompt, 'do it');
  assert.equal(improved.difficulty, 'easy');
});

test('unparseable output yields null rather than throwing', () => {
  assert.equal(extractJson('I could not do that'), null);
  assert.equal(extractJson(''), null);
});

test("the CLI's JSON envelope is unwrapped", () => {
  const envelope = JSON.stringify({ type: 'result', result: '{"prompt":"inner"}' });
  assert.equal(unwrapCliOutput(envelope), '{"prompt":"inner"}');
});

test('a warning line before the envelope does not break unwrapping', () => {
  const stdout = 'ExperimentalWarning: something\n' + JSON.stringify({ result: 'hello' });
  assert.equal(unwrapCliOutput(stdout), 'hello');
});

test('plain text output is passed through unwrapped', () => {
  assert.equal(unwrapCliOutput('just text'), 'just text');
});

test('a reply without a prompt is rejected', () => {
  assert.equal(readImproved({ title: 'only a title' }), null);
  assert.equal(readImproved({ prompt: '   ' }), null);
  assert.equal(readImproved(null), null);
  assert.equal(readImproved('a string'), null);
});

test('an unknown difficulty from the model falls back to normal', () => {
  const improved = readImproved({ prompt: 'do it', difficulty: 'extreme' });
  assert.equal(improved.difficulty, 'normal');
});

test('a good reply is read in full', () => {
  const improved = readImproved({ prompt: ' do it ', title: ' Fix hero ', difficulty: 'hard' });
  assert.deepEqual(improved, { prompt: 'do it', title: 'Fix hero', difficulty: 'hard' });
});
