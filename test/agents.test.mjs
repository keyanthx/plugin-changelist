/**
 * The agent CLI registry: defaults, model rewriting, and the headless argv.
 *
 * The flag asymmetry between the two tools is asserted here rather than only
 * commented, because it looks like an inconsistency and someone will
 * "fix" it otherwise. Claude's plan mode is a behavioural contract that refuses
 * a JSON-only brief; OpenCode's plan agent is just a permission profile.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

import {
  AGENT_CLIS,
  findAgentCli,
  parseModelList,
  readModelFromCommand,
  withModel,
} from '../src/agents.ts';
import { buildCommand, shellQuote } from '../src/send.ts';
import { DEFAULT_SETTINGS } from '../src/model.ts';

const claude = findAgentCli('claude');
const opencode = findAgentCli('opencode');
const DIFFICULTIES = ['easy', 'normal', 'hard'];

// ------------------------------------------------------------- send defaults

test('every send default starts the agent in plan mode', () => {
  for (const difficulty of DIFFICULTIES) {
    assert.match(claude.defaultCommands[difficulty], /--permission-mode plan/);
    assert.match(opencode.defaultCommands[difficulty], /--agent plan/);
  }
});

test('every send default is interactive, not a headless one-shot', () => {
  for (const difficulty of DIFFICULTIES) {
    // `claude -p` and `opencode run` are the headless forms; neither belongs
    // in a send, because plan mode is pointless if the process just exits.
    assert.ok(!/\s-p\s/.test(claude.defaultCommands[difficulty]));
    assert.ok(!/^opencode run/.test(opencode.defaultCommands[difficulty]));
  }
});

test('every send default carries the prompt placeholder exactly once', () => {
  for (const cli of AGENT_CLIS) {
    for (const difficulty of DIFFICULTIES) {
      const occurrences = cli.defaultCommands[difficulty].split('{prompt}').length - 1;
      assert.equal(occurrences, 1, `${cli.id}/${difficulty}`);
    }
  }
});

test('the shipped settings match the Claude preset', () => {
  assert.deepEqual(DEFAULT_SETTINGS.commands, claude.defaultCommands);
});

test("OpenCode's models are the ones picked for each tier", () => {
  assert.match(opencode.defaultCommands.easy, /opencode-go\/hy3/);
  assert.match(opencode.defaultCommands.normal, /opencode-go\/glm-5\.2/);
  assert.match(opencode.defaultCommands.hard, /opencode-go\/kimi-k3/);
});

test('OpenCode passes the prompt through --prompt, not positionally', () => {
  for (const difficulty of DIFFICULTIES) {
    assert.match(opencode.defaultCommands[difficulty], /--prompt \{prompt\}/);
  }
});

// ------------------------------------------------- quoting the built commands

test('a prompt substituted into --prompt survives a real shell', () => {
  const nasty = "it's a \"test\" of $HOME `whoami`\nsecond line";
  const command = buildCommand(opencode.defaultCommands.normal, nasty);

  // Everything before the quoted prompt is flags; the quoted part must come
  // back byte-identical.
  const quoted = command.slice(command.indexOf("'"));
  const roundTripped = execFileSync('sh', ['-c', `printf %s ${quoted}`]).toString();
  assert.equal(roundTripped, nasty);
});

test('the model flag stays a separate argument from the prompt', () => {
  const command = buildCommand(opencode.defaultCommands.hard, 'do the thing');
  assert.match(command, /--model opencode-go\/kimi-k3 --prompt 'do the thing'/);
});

// ------------------------------------------------------------- improve argv

test('Claude improves headlessly with a JSON envelope', () => {
  assert.deepEqual(claude.improveArgs('BRIEF', 'haiku'), [
    '-p',
    'BRIEF',
    '--output-format',
    'json',
    '--model',
    'haiku',
  ]);
});

test('Claude improve does NOT use plan mode', () => {
  // Verified against the real CLI: plan mode answers with a plan and refuses
  // the "reply with only this JSON" brief outright.
  assert.ok(!claude.improveArgs('BRIEF', 'haiku').includes('--permission-mode'));
});

test('OpenCode improves through the read-only plan agent', () => {
  const args = opencode.improveArgs('BRIEF', 'opencode-go/hy3');
  assert.deepEqual(args, ['run', 'BRIEF', '--agent', 'plan', '--model', 'opencode-go/hy3']);
  // Without --agent, `run` uses `build`, which may edit files in the project.
  assert.ok(args.includes('--agent'));
});

test('an empty model leaves the flag off entirely', () => {
  assert.deepEqual(claude.improveArgs('BRIEF', '  '), ['-p', 'BRIEF', '--output-format', 'json']);
  assert.deepEqual(opencode.improveArgs('BRIEF', ''), ['run', 'BRIEF', '--agent', 'plan']);
});

test('an unknown cli id falls back to Claude rather than throwing', () => {
  assert.equal(findAgentCli(undefined).id, 'claude');
  assert.equal(findAgentCli('nonesuch').id, 'claude');
});

// ------------------------------------------------- mid-session model switching

/*
 * These encode a real difference between the tools, checked against their docs
 * and their installed binaries. Getting it wrong reintroduces a silent failure:
 * a prompt sent to a running session runs on that session's model, and telling
 * someone otherwise is worse than saying nothing.
 */

test('Claude can switch model mid-session, and we know the command', () => {
  const switching = claude.midSessionModelSwitch;
  assert.equal(switching.supported, true);
  assert.equal(switching.command('opus'), '/model opus');
  assert.equal(switching.command('claude-sonnet-5'), '/model claude-sonnet-5');
});

test('OpenCode cannot switch model mid-session', () => {
  // `/models` is an interactive picker; there is no `/model <id>` form. If this
  // ever flips to true, the send panel will start offering a button that does
  // nothing — hence the test.
  assert.equal(opencode.midSessionModelSwitch.supported, false);
  assert.ok(!('command' in opencode.midSessionModelSwitch));
});

test('every CLI explains its mid-session behaviour in words', () => {
  for (const cli of AGENT_CLIS) {
    assert.ok(cli.midSessionModelSwitch.how.length > 20, `${cli.id} needs a real explanation`);
  }
});

// -------------------------------------------------------- model read / write

test('the model is read out of either CLI syntax', () => {
  assert.equal(readModelFromCommand(claude.defaultCommands.hard), 'opus');
  assert.equal(readModelFromCommand(opencode.defaultCommands.easy), 'opencode-go/hy3');
  assert.equal(readModelFromCommand('claude {prompt}'), null);
});

test('swapping the model keeps every other flag the user typed', () => {
  const custom = 'claude --permission-mode plan --model sonnet --verbose {prompt}';
  assert.equal(
    withModel(custom, 'opus'),
    'claude --permission-mode plan --model opus --verbose {prompt}'
  );
});

test('a command with no --model gets one right after the binary', () => {
  // Appending would land it after {prompt} and be swallowed as message text.
  assert.equal(withModel('opencode --prompt {prompt}', 'x/y'), 'opencode --model x/y --prompt {prompt}');
  assert.equal(withModel('claude {prompt}', 'opus'), 'claude --model opus {prompt}');
});

test('setting a model never disturbs the prompt placeholder', () => {
  for (const cli of AGENT_CLIS) {
    for (const difficulty of DIFFICULTIES) {
      const swapped = withModel(cli.defaultCommands[difficulty], 'some/model');
      assert.equal(swapped.split('{prompt}').length - 1, 1);
    }
  }
});

// --------------------------------------------------------- opencode models

test('`opencode models` output is parsed into provider/model ids', () => {
  const stdout = [
    'opencode/big-pickle',
    'opencode-go/deepseek-v4-flash',
    'opencode-go/glm-5.2',
    'ollama/gemma4:e2b',
    '',
    '  opencode-go/kimi-k3  ',
  ].join('\n');

  assert.deepEqual(parseModelList(stdout), [
    'opencode/big-pickle',
    'opencode-go/deepseek-v4-flash',
    'opencode-go/glm-5.2',
    'ollama/gemma4:e2b',
    'opencode-go/kimi-k3',
  ]);
});

test('banner lines and prose are not mistaken for model ids', () => {
  const noisy = ['Available models:', '  █▀▀█ █▀▀█', 'opencode-go/glm-5.2', 'done.'].join('\n');
  assert.deepEqual(parseModelList(noisy), ['opencode-go/glm-5.2']);
});

test('shellQuote is still what protects every built command', () => {
  assert.equal(shellQuote("a'b"), `'a'\\''b'`);
});
