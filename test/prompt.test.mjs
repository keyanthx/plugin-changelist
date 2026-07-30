/**
 * The prompt-help layers: nudges, templates, and parsing what Claude returns.
 *
 * The nudges are tested against prompts of the kind actually typed in a hurry,
 * because a hint that fires on a perfectly good prompt is worse than no hint.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { countBlanks, lintPrompt, wordCount } from '../src/lint.ts';
import { TEMPLATES, composePrompt, findTemplate, hasAnyFieldValue } from '../src/templates.ts';
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

test('angle-bracket blanks are still counted if any survive', () => {
  // Templates no longer produce these, but a hand-written prompt might.
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

test('every template has a distinct id and usable fields', () => {
  const seen = new Set();
  for (const template of TEMPLATES) {
    assert.ok(!seen.has(template.id), `duplicate template id ${template.id}`);
    seen.add(template.id);
    assert.ok(template.label.length > 0);
    assert.ok(template.hint.length > 0);
    assert.ok(template.fields.length >= 3, `${template.id} has too few fields`);
    for (const field of template.fields) {
      assert.ok(field.id.length > 0);
      assert.ok(field.label.length > 0);
      assert.ok(field.placeholder.length > 0, `${template.id}.${field.id} needs a placeholder`);
    }
  }
});

test('field ids are unique within a template', () => {
  for (const template of TEMPLATES) {
    const ids = template.fields.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length, `${template.id} repeats a field id`);
  }
});

test('the six tags are the ones we designed for', () => {
  assert.deepEqual(
    TEMPLATES.map((t) => t.id),
    ['style', 'text', 'layout', 'add', 'behaviour', 'bug']
  );
});

test('every tag asks where the change goes', () => {
  // "No page, section or file named" is the nudge that fires most often, so
  // every tag makes it a box rather than hoping you mention it.
  for (const template of TEMPLATES) {
    assert.ok(
      template.fields.some((f) => f.id === 'where'),
      `${template.id} never asks where`
    );
  }
});

test('no tag asks more than five things', () => {
  // Most items get sent with no prompt at all, so every extra box is friction
  // that pushes people back to bare titles.
  for (const template of TEMPLATES) {
    assert.ok(template.fields.length <= 5, `${template.id} asks too much`);
  }
});

test('screen size is askable where it matters', () => {
  // "Hero headline wraps badly on mobile" had nowhere to put "on mobile".
  for (const id of ['style', 'bug']) {
    assert.ok(findTemplate(id).fields.some((f) => f.id === 'screen'), `${id} lost screen size`);
  }
});

test('Add covers a button, not just a section', () => {
  // "send email button on nav bar" was filed with no tag at all, because
  // "New section" was the wrong word for a button.
  const add = findTemplate('add');
  const out = composePrompt(add, { what: 'a Send email button', where: 'the nav bar' }, '');
  assert.equal(out, 'What to add: a Send email button\nWhere: the nav bar');
});

test('Layout captures where something should end up', () => {
  // "Move gallery above testimonials" previously fit nothing.
  const layout = findTemplate('layout');
  const out = composePrompt(
    layout,
    { what: 'the gallery section', where: 'home page', destination: 'above the testimonials' },
    ''
  );
  assert.match(out, /Should end up: above the testimonials/);
});

test('templates share field ids so switching keeps what still applies', () => {
  // `where` means the same thing in a bug report and a restyle, so carrying it
  // across is the point rather than an accident.
  const withWhere = TEMPLATES.filter((t) => t.fields.some((f) => f.id === 'where'));
  assert.ok(withWhere.length >= 3);
});

test("a bug's symptom does not inherit another template's noun", () => {
  // Elsewhere `what` names a thing ("the hero headline"); in a bug it describes
  // a behaviour. Sharing the key would carry a noun into "What goes wrong".
  const bug = findTemplate('bug');
  assert.ok(!bug.fields.some((f) => f.id === 'what'));
  assert.ok(bug.fields.some((f) => f.id === 'symptom'));

  const carried = composePrompt(bug, { what: 'the hero headline', where: 'home page' }, '');
  assert.equal(carried, 'Where: home page');
});

test('an unknown template id resolves to nothing', () => {
  assert.equal(findTemplate(null), null);
  assert.equal(findTemplate('nope'), null);
});

// ------------------------------------------------------- composing a prompt

const style = findTemplate('style');

test('filled boxes become labelled lines', () => {
  const out = composePrompt(style, { what: 'the hero headline', where: 'home page' }, '');
  assert.equal(out, 'What: the hero headline\nWhere: home page');
});

test('blank boxes contribute nothing at all', () => {
  // The whole point: you fill what you know and leave the rest alone.
  const out = composePrompt(
    style,
    { what: 'the hero headline', where: '', now: '   ', should: 'two lines' },
    ''
  );
  assert.equal(out, 'What: the hero headline\nShould be: two lines');
});

test('boxes come out in the template order, not the order you typed them', () => {
  const out = composePrompt(style, { should: 'smaller', what: 'the logo' }, '');
  assert.equal(out, 'What: the logo\nShould be: smaller');
});

test('a multi-line value sits under its label so it keeps its shape', () => {
  const bug = findTemplate('bug');
  const out = composePrompt(bug, { steps: 'open /contact\nsubmit twice' }, '');
  assert.equal(out, 'Steps:\nopen /contact\nsubmit twice');
});

test('free text is appended as its own paragraph', () => {
  const out = composePrompt(style, { what: 'the logo' }, 'It also looks off in dark mode.');
  assert.equal(out, 'What: the logo\n\nIt also looks off in dark mode.');
});

test('with no template the free text is the whole prompt, verbatim', () => {
  // This is what keeps writing a prompt freehand working exactly as before,
  // and what makes items saved by older versions read back unchanged.
  const text = 'Shorten the hero headline to two lines.';
  assert.equal(composePrompt(null, {}, text), text);
});

test('nothing filled in produces nothing, not stray punctuation', () => {
  assert.equal(composePrompt(style, {}, ''), '');
  assert.equal(composePrompt(style, { what: '  ' }, '   '), '');
});

test('values are trimmed but their inner text is untouched', () => {
  const out = composePrompt(style, { what: '  the "hero" headline  ' }, '');
  assert.equal(out, 'What: the "hero" headline');
});

test('field values unknown to the template are ignored', () => {
  // Switching template leaves old keys behind; they must not leak into the
  // prompt of a template that never asked for them.
  const out = composePrompt(style, { what: 'the logo', steps: 'from the bug template' }, '');
  assert.equal(out, 'What: the logo');
});

test('hasAnyFieldValue only counts boxes this template asks for', () => {
  assert.equal(hasAnyFieldValue(style, {}), false);
  assert.equal(hasAnyFieldValue(style, { what: '   ' }), false);
  assert.equal(hasAnyFieldValue(style, { what: 'x' }), true);
  assert.equal(hasAnyFieldValue(style, { steps: 'belongs to bug' }), false);
  assert.equal(hasAnyFieldValue(null, { what: 'x' }), false);
});

test('a composed prompt satisfies the nudges when the boxes are filled', () => {
  // The point of the boxes is that answering them produces a prompt the hints
  // are happy with, without anyone having to know what the hints check.
  const out = composePrompt(
    style,
    {
      what: 'the hero headline',
      where: 'the home page',
      now: 'it wraps to four lines',
      should: 'wrap to two lines at 390px',
      keep: 'the subhead and CTA unchanged',
    },
    ''
  );
  assert.deepEqual(ids(out), []);
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
