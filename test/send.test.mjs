/**
 * The handoff layer: shell quoting, command assembly, branch names.
 *
 * Quoting gets its own tests because it's the one place where a subtle bug is
 * both silent and dangerous — a prompt that ends up split across arguments, or
 * worse, a backtick the shell decides to execute.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

import {
  buildClipboardText,
  buildCommand,
  isValidBranchName,
  shellQuote,
  slugify,
  suggestBranchName,
} from '../src/send.ts';
import { DEFAULT_SETTINGS, createItem } from '../src/model.ts';

// --------------------------------------------------------------- quoting

test('plain text is wrapped in single quotes', () => {
  assert.equal(shellQuote('make the hero smaller'), "'make the hero smaller'");
});

test("apostrophes are closed, escaped and reopened", () => {
  // don't  ->  'don'\''t'
  assert.equal(shellQuote("don't"), `'don'\\''t'`);
});

test('shell metacharacters stay literal inside single quotes', () => {
  const nasty = 'price is $HOME `whoami` "quoted" \\ backslash';
  const quoted = shellQuote(nasty);
  assert.equal(quoted, `'${nasty}'`);
  // Nothing but the wrapping quotes was added.
  assert.equal(quoted.slice(1, -1), nasty);
});

test('newlines survive quoting', () => {
  const multiline = 'line one\nline two';
  assert.equal(shellQuote(multiline), `'line one\nline two'`);
});

/**
 * The real test of quoting: hand it to an actual shell and see what comes back.
 *
 * Counting escaped quotes by eye is how quoting bugs get written in the first
 * place, so this asserts on behaviour rather than on a string someone typed out.
 */
test('quoted prompts round-trip through a real shell unchanged', () => {
  const cases = [
    "'''",
    "don't",
    "it's a \"test\" of 'everything'",
    'price is $HOME `whoami` \\ backslash',
    'line one\nline two',
    'emoji ✨ and — dashes',
    '',
  ];

  for (const original of cases) {
    const roundTripped = execFileSync('sh', ['-c', `printf %s ${shellQuote(original)}`]).toString();
    assert.equal(roundTripped, original, `mangled: ${JSON.stringify(original)}`);
  }
});

// -------------------------------------------------------------- commands

test('{prompt} is replaced with the quoted prompt', () => {
  assert.equal(
    buildCommand('claude --model haiku {prompt}', 'shrink the hero'),
    "claude --model haiku 'shrink the hero'"
  );
});

test('a template without the placeholder still gets the prompt appended', () => {
  assert.equal(buildCommand('codex', 'do the thing'), "codex 'do the thing'");
});

test('a placeholder used twice is filled both times', () => {
  assert.equal(buildCommand('echo {prompt} | agent {prompt}', 'x'), "echo 'x' | agent 'x'");
});

test('an empty template falls back to the bare quoted prompt', () => {
  assert.equal(buildCommand('   ', 'just this'), "'just this'");
});

test('difficulty picks which command template is used', () => {
  const item = { ...createItem('t', null), prompt: 'do it', difficulty: 'hard' };
  assert.match(buildClipboardText(item, DEFAULT_SETTINGS, 'launch'), /--model opus/);

  const easy = { ...item, difficulty: 'easy' };
  assert.match(buildClipboardText(easy, DEFAULT_SETTINGS, 'launch'), /--model haiku/);
});

test('prompt-only mode copies the prompt with no command around it', () => {
  const item = { ...createItem('t', null), prompt: 'do it' };
  assert.equal(buildClipboardText(item, DEFAULT_SETTINGS, 'prompt-only'), 'do it');
});

test('an item with no prompt falls back to its title', () => {
  const item = createItem('fix the footer', null);
  assert.equal(buildClipboardText(item, DEFAULT_SETTINGS, 'prompt-only'), 'fix the footer');
});

// --------------------------------------------------------------- branches

test('titles become git-safe slugs', () => {
  assert.equal(slugify('Make the hero smaller!'), 'make-the-hero-smaller');
  assert.equal(slugify('  spaces   everywhere  '), 'spaces-everywhere');
  assert.equal(slugify('Über heading'), 'uber-heading');
  assert.equal(slugify('!!!'), 'change');
  assert.equal(slugify(''), 'change');
});

test('slugs are capped without leaving a trailing dash', () => {
  const slug = slugify('a'.repeat(30) + ' ' + 'b'.repeat(30));
  assert.ok(slug.length <= 40);
  assert.ok(!slug.endsWith('-'));
});

test('the prefix is joined with exactly one slash', () => {
  assert.equal(suggestBranchName('Fix footer', 'feat'), 'feat/fix-footer');
  assert.equal(suggestBranchName('Fix footer', 'feat/'), 'feat/fix-footer');
  assert.equal(suggestBranchName('Fix footer', ''), 'fix-footer');
});

test('branch names git would reject are caught before git runs', () => {
  assert.ok(isValidBranchName('feat/fix-footer'));
  assert.ok(!isValidBranchName(''));
  assert.ok(!isValidBranchName('has spaces'));
  assert.ok(!isValidBranchName('what?'));
  assert.ok(!isValidBranchName('a..b'));
  assert.ok(!isValidBranchName('-leading-dash'));
  assert.ok(!isValidBranchName('trailing/'));
  assert.ok(!isValidBranchName('thing.lock'));
});
