/**
 * Reading the CLIs' own model catalogues.
 *
 * The OpenCode cases run against `test/fixtures/opencode-models.txt`, captured
 * verbatim from `opencode models --verbose` on a real install — the point of
 * these parsers is to avoid hardcoded lists, so testing them against invented
 * output would defeat the exercise.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  describeModel,
  parseClaudeCapabilities,
  parseOpenCodeCatalogue,
} from '../src/catalogue.ts';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = readFileSync(join(here, 'fixtures/opencode-models.txt'), 'utf8');

// ------------------------------------------------------------- OpenCode

test('real CLI output parses into models', () => {
  const models = parseOpenCodeCatalogue(FIXTURE);
  assert.equal(models.length, 7);
  for (const model of models) {
    assert.match(model.id, /^[\w.-]+\/[\w.:-]+$/, `bad id: ${model.id}`);
    assert.ok(model.provider.length > 0);
    assert.ok(model.name.length > 0);
  }
});

test('ids are provider-qualified, as --model expects', () => {
  const ids = parseOpenCodeCatalogue(FIXTURE).map((m) => m.id);
  assert.ok(ids.includes('opencode-go/glm-5.2'));
  assert.ok(ids.includes('opencode/big-pickle'));
});

test('friendly names come through', () => {
  const byId = Object.fromEntries(parseOpenCodeCatalogue(FIXTURE).map((m) => [m.id, m]));
  assert.equal(byId['opencode/big-pickle'].name, 'Big Pickle');
});

test('effort variants are read per model, not globally', () => {
  // The whole reason effort can't be one shared list: these genuinely differ.
  const byId = Object.fromEntries(parseOpenCodeCatalogue(FIXTURE).map((m) => [m.id, m]));
  assert.deepEqual(byId['opencode/laguna-s-2.1-free'].variants, ['low', 'medium', 'high']);
  assert.deepEqual(byId['opencode/north-mini-code-free'].variants, ['none', 'high']);
  assert.deepEqual(byId['opencode/big-pickle'].variants, []);
});

test('free models are identified', () => {
  const byId = Object.fromEntries(parseOpenCodeCatalogue(FIXTURE).map((m) => [m.id, m]));
  assert.equal(byId['opencode/big-pickle'].free, true);
});

test('context windows are read', () => {
  const byId = Object.fromEntries(parseOpenCodeCatalogue(FIXTURE).map((m) => [m.id, m]));
  assert.equal(byId['opencode/big-pickle'].contextTokens, 200000);
});

test('braces inside strings do not end an object early', () => {
  const tricky = JSON.stringify({
    id: 'weird',
    providerID: 'p',
    name: 'Has { and } in it',
    limit: { context: 1000 },
    cost: { input: 1, output: 1 },
    variants: {},
  });
  const models = parseOpenCodeCatalogue(tricky);
  assert.equal(models.length, 1);
  assert.equal(models[0].name, 'Has { and } in it');
});

test('a malformed entry is skipped, not fatal', () => {
  // One broken record must not empty the whole dropdown.
  const mixed = `{ "id": "broken", "providerID": }\n${FIXTURE}`;
  const models = parseOpenCodeCatalogue(mixed);
  assert.ok(models.length >= 7, 'good entries still parsed');
  assert.ok(!models.some((m) => m.id.includes('broken')));
});

test('entries missing an id or provider are dropped', () => {
  const partial = JSON.stringify({ name: 'No id', variants: {} });
  assert.deepEqual(parseOpenCodeCatalogue(partial), []);
});

test('empty or junk input yields an empty list rather than throwing', () => {
  assert.deepEqual(parseOpenCodeCatalogue(''), []);
  assert.deepEqual(parseOpenCodeCatalogue('command not found'), []);
});

test('dropdown labels carry the useful facts', () => {
  const byId = Object.fromEntries(parseOpenCodeCatalogue(FIXTURE).map((m) => [m.id, m]));
  const label = describeModel(byId['opencode/big-pickle']);
  assert.match(label, /^Big Pickle/);
  assert.match(label, /200k/);
  assert.match(label, /free/);
});

// --------------------------------------------------------- Claude Code

const REAL_HELP = `
  --model <model>                       Model for the current session. Provide
                                        an alias for the latest model (e.g.
                                        'fable', 'opus', or 'sonnet') or a
                                        model's full name (e.g.
                                        'claude-fable-5').
  --effort <level>                      Effort level for the current session
                                        (low, medium, high, xhigh, max)
`;

test("effort levels are read from Claude's own help", () => {
  assert.deepEqual(parseClaudeCapabilities(REAL_HELP).effortLevels, [
    'low',
    'medium',
    'high',
    'xhigh',
    'max',
  ]);
});

test('aliases include the curated set', () => {
  const { aliases } = parseClaudeCapabilities(REAL_HELP);
  for (const expected of ['haiku', 'sonnet', 'opus', 'fable']) {
    assert.ok(aliases.includes(expected), `missing ${expected}`);
  }
});

test('aliases are not duplicated when help repeats them', () => {
  const { aliases } = parseClaudeCapabilities(REAL_HELP);
  assert.equal(new Set(aliases).size, aliases.length);
});

test('a reworded help page falls back instead of emptying the picker', () => {
  const { effortLevels, aliases } = parseClaudeCapabilities('no useful flags here');
  assert.deepEqual(effortLevels, ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.ok(aliases.includes('opus'));
});

test('a new effort level added upstream is picked up automatically', () => {
  const future = '  --effort <level>  Effort level for the current session (low, high, ultra)';
  assert.deepEqual(parseClaudeCapabilities(future).effortLevels, ['low', 'high', 'ultra']);
});
