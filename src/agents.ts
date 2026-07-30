/**
 * The agent CLIs this plugin knows how to drive.
 *
 * Everything CLI-specific lives here — flags, defaults, how to ask for a
 * one-shot reply. The rest of the plugin works in terms of an `AgentCli`, so
 * supporting a third tool later is one entry in this file rather than a hunt
 * through the UI.
 *
 * Two different jobs are being described per CLI, and they want opposite things:
 *
 * - **Sending** starts an *interactive* session, seeded with the prompt and in
 *   plan mode, so you can steer it. That's what `defaultCommands` produce.
 * - **✨ Improve** is a *headless* one-shot that has to print text and exit.
 *   That's `improveArgs`, and it deliberately runs no plan agent and no
 *   permission mode — it's rewriting a sentence, not touching the repo.
 */
import type { Difficulty } from './model.ts';

export type AgentCliId = 'claude' | 'opencode';

export interface AgentCli {
  id: AgentCliId;
  label: string;
  /** The binary `commandExists()` looks for on the PATH. */
  binary: string;
  /** Interactive, plan-mode command per difficulty. `{prompt}` is substituted. */
  defaultCommands: Record<Difficulty, string>;
  /** Argv for a headless one-shot rewrite. Not a template — spawned directly. */
  improveArgs: (brief: string, model: string) => string[];
  /** Default model for ✨ Improve. Cheap and fast beats clever for a rewrite. */
  defaultImproveModel: string;
  /** `<binary> models` lists real ids we can offer as a dropdown. */
  listsModels: boolean;
  /** Offered when there's no list command to ask. */
  modelSuggestions: string[];
  /** Shown under the model picker. */
  modelHint: string;
  /**
   * Whether the model can be changed once a session is already running.
   *
   * This matters because the difficulty → model routing only takes effect at
   * launch. Sending a prompt to an agent that's already running uses whatever
   * model that session started with, and for one of these tools there is no way
   * to change it afterwards — so the UI has to say so rather than imply the
   * difficulty was honoured.
   */
  midSessionModelSwitch:
    | { supported: true; /** Pasteable command that does it. */ command: (model: string) => string; how: string }
    | { supported: false; how: string };
}

/**
 * Claude Code.
 *
 * `--permission-mode plan` is one of the documented choices. Without `-p` the
 * command starts an interactive session with the prompt as its first message.
 */
const CLAUDE: AgentCli = {
  id: 'claude',
  label: 'Claude Code',
  binary: 'claude',
  defaultCommands: {
    easy: 'claude --permission-mode plan --model haiku {prompt}',
    normal: 'claude --permission-mode plan --model sonnet {prompt}',
    hard: 'claude --permission-mode plan --model opus {prompt}',
  },
  improveArgs: (brief, model) => {
    // Deliberately NO --permission-mode plan here. Claude's plan mode is a
    // behavioural contract, not just a permission profile: it answers with a
    // plan and refuses a "reply with only this JSON" instruction outright
    // (tested — it reads the brief as an injection attempt). Print mode with a
    // JSON-only brief returns the object cleanly, which is what we need.
    const args = ['-p', brief, '--output-format', 'json'];
    if (model.trim()) args.push('--model', model.trim());
    return args;
  },
  defaultImproveModel: 'haiku',
  listsModels: false,
  modelSuggestions: ['haiku', 'sonnet', 'opus'],
  modelHint: 'An alias like haiku, sonnet or opus, or a full model id.',
  midSessionModelSwitch: {
    supported: true,
    command: (model) => `/model ${model}`,
    how: 'Claude Code can switch mid-session — paste the /model line first.',
  },
};

/**
 * OpenCode.
 *
 * `plan` is a primary agent, so plan mode is `--agent plan`. The bare
 * `opencode` command opens the TUI and takes its first message from `--prompt`;
 * `opencode run` is the headless form and takes the message positionally.
 *
 * Models are `provider/model` strings, which is why the dropdown exists.
 */
const OPENCODE: AgentCli = {
  id: 'opencode',
  label: 'OpenCode',
  binary: 'opencode',
  defaultCommands: {
    easy: 'opencode --agent plan --model opencode-go/hy3 --prompt {prompt}',
    normal: 'opencode --agent plan --model opencode-go/glm-5.2 --prompt {prompt}',
    hard: 'opencode --agent plan --model opencode-go/kimi-k3 --prompt {prompt}',
  },
  improveArgs: (brief, model) => {
    // `--agent plan` is a read-only permission profile in OpenCode, not a
    // behavioural mode, so it still answers a JSON-only brief verbatim
    // (tested). Worth having: without it `run` uses the `build` agent, which
    // is allowed to edit files in the project it runs in.
    const args = ['run', brief, '--agent', 'plan'];
    if (model.trim()) args.push('--model', model.trim());
    return args;
  },
  defaultImproveModel: 'opencode-go/hy3',
  listsModels: true,
  modelSuggestions: [],
  modelHint: 'A provider/model id, as listed by `opencode models`.',
  midSessionModelSwitch: {
    supported: false,
    // `/models` opens an interactive picker; there is no `/model <id>` form and
    // no agent-switch command. A running session's model is fixed at launch.
    how: "OpenCode can't switch model mid-session — its /models is a picker. Start a new session to change it.",
  },
};

export const AGENT_CLIS: AgentCli[] = [CLAUDE, OPENCODE];

export function findAgentCli(id: string | undefined): AgentCli {
  return AGENT_CLIS.find((cli) => cli.id === id) ?? CLAUDE;
}

/**
 * The model id inside a command template, if it has one.
 *
 * Used to show the dropdown's current selection. Both CLIs spell the flag
 * `--model <value>`, so one pattern covers them.
 */
export function readModelFromCommand(command: string): string | null {
  const match = command.match(/--model[ =]([^\s]+)/);
  return match ? match[1] : null;
}

/**
 * Swap the model in a command template, keeping everything else the user typed.
 *
 * If there's no `--model` yet, one is inserted straight after the binary rather
 * than appended — appending would land it after `{prompt}` on OpenCode's
 * `--prompt {prompt}` form and swallow the model as part of the message.
 */
export function withModel(command: string, model: string): string {
  const trimmed = command.trim();
  if (!trimmed) return trimmed;
  if (/--model[ =][^\s]+/.test(trimmed)) {
    return trimmed.replace(/--model[ =][^\s]+/, `--model ${model}`);
  }
  const parts = trimmed.split(/\s+/);
  parts.splice(1, 0, '--model', model);
  return parts.join(' ');
}

/** Parse `opencode models` output into a list of ids. */
export function parseModelList(stdout: string): string[] {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[\w.-]+\/[\w.:-]+$/.test(line));
}
