/**
 * ✨ Improve — turn a rough note into a prompt worth sending.
 *
 * It shells out to whichever agent CLI is already on the machine — Claude Code
 * or OpenCode, see `agents.ts` — so there's no API key to manage and no
 * third-party HTTP from the webview (which doesn't work anyway). With neither
 * installed the button hides itself; templates and nudges still work offline.
 *
 * Nothing comes back trusted: the reply is parsed, shape-checked, and shown as
 * a before/after the user accepts or discards. It is never applied silently.
 */
import type { AgentCli } from './agents.ts';
import { lastJsonLine } from './cli.ts';
import type { Difficulty } from './model.ts';
import type { Shell } from './types.ts';

export interface ImproveInput {
  title: string;
  prompt: string;
  /** Project name and framework, when known — helps the rewrite be concrete. */
  projectName?: string | null;
  /** Which model to spend on the rewrite. From settings, in the CLI's naming. */
  model: string;
  /** Reasoning effort, in the CLI's naming. Empty means the CLI's default. */
  effort?: string;
}

export interface ImprovedPrompt {
  title: string;
  prompt: string;
  difficulty: Difficulty;
}

/**
 * The instruction sent to Claude.
 *
 * Two things make the difference between a useful rewrite and a wordy one:
 * naming the exact output shape, and forbidding invention. A model asked to
 * "improve a prompt" will happily add requirements the user never wanted —
 * which is worse than the rough note, because the extra requirements get built.
 */
export function buildBrief(input: ImproveInput): string {
  const context = [
    input.projectName ? `Project: ${input.projectName}` : null,
    `Note title: ${input.title.trim() || '(none)'}`,
    `Rough prompt:\n${input.prompt.trim() || '(empty — work from the title)'}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  return `You are tidying up a one-off instruction that a web developer is about to hand to a coding agent working on their website. Reply with ONE JSON object and nothing else — no prose before or after, no markdown code fence.

${context}

Reply with exactly this shape:

{
  "title": "a short label, under 60 characters, for their to-do list",
  "prompt": "the rewritten instruction",
  "difficulty": "easy | normal | hard"
}

Rules for the rewritten prompt:
- Keep it to what the note actually asks for. Do NOT invent requirements, extra features, acceptance criteria, tests, or accessibility work that were not mentioned.
- Make it specific about WHERE the change goes (page, section, component, file) and WHAT DONE LOOKS LIKE. If the note doesn't say, keep the author's own placeholder in angle brackets — e.g. <which page?> — rather than guessing. An honest blank is more useful than a confident wrong guess.
- Keep any concrete detail the author already gave: exact text, colours, sizes, file paths. Never paraphrase a quoted string.
- Plain sentences or short labelled lines. No headings, no bullet-point essays, no preamble like "Please".
- Aim for 2–6 lines. Shorter than the note is fine if the note was padded.

Rules for difficulty — this picks which model runs the task, so be honest:
- "easy": a wording, colour, spacing or copy change in one known place.
- "normal": a change across a few files, a new section, or a bug with clear steps.
- "hard": architecture, data flow, tricky state, anything vague or likely to need judgement.

Reply with the JSON object only.`;
}

// ---------------------------------------------------------------------------
// Parsing the reply
// ---------------------------------------------------------------------------

/** Built from a string literal so the escape character stays readable. */
const ANSI_PATTERN = new RegExp('\\u001b\\[[0-9;]*[A-Za-z]', 'g');

/**
 * Remove ANSI colour escapes.
 *
 * OpenCode's `run` writes its own decoration to stderr and keeps stdout clean
 * (verified against 1.18.7), but that's a promise no CLI makes in writing, and
 * one stray colour code would break `JSON.parse` for a reason nobody would
 * guess from the error. Cheap insurance.
 */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, '');
}

/**
 * Find the JSON object in whatever came back.
 *
 * Handles the things that actually happen: a bare object, an object inside a
 * ```json fence, an object with a sentence in front of it, and colour codes.
 */
export function extractJson(text: string): unknown {
  const trimmed = stripAnsi(text).trim();
  if (!trimmed) return null;

  const candidates: string[] = [];

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) candidates.push(fenced[1]);

  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last > first) candidates.push(trimmed.slice(first, last + 1));

  candidates.push(trimmed);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next shape.
    }
  }
  return null;
}

/**
 * Unwrap `claude -p --output-format json`, which returns an envelope with the
 * assistant's text in `result`.
 *
 * OpenCode's `run` needs no unwrapping — it writes the plain reply to stdout
 * and its decoration to stderr — so it takes the fall-through path. One
 * function covers both because the fallback is "treat stdout as the reply".
 */
export function unwrapCliOutput(stdout: string): string {
  const line = lastJsonLine(stdout);
  try {
    const envelope = JSON.parse(line) as { result?: unknown };
    if (typeof envelope.result === 'string') return envelope.result;
  } catch {
    // Not an envelope — the plain-text path.
  }
  return stdout;
}

/** Is this parsed value usable as an improved prompt? */
export function readImproved(value: unknown): ImprovedPrompt | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;

  const prompt = typeof record.prompt === 'string' ? record.prompt.trim() : '';
  if (!prompt) return null; // the prompt is the whole point; without it there's nothing to show

  const difficulty = record.difficulty;
  return {
    title: typeof record.title === 'string' ? record.title.trim() : '',
    prompt,
    difficulty:
      difficulty === 'easy' || difficulty === 'hard' || difficulty === 'normal'
        ? difficulty
        : 'normal',
  };
}

// ---------------------------------------------------------------------------
// Running it
// ---------------------------------------------------------------------------

export type ImproveOutcome =
  | { ok: true; improved: ImprovedPrompt }
  | { ok: false; code: 'no-cli' | 'failed' | 'unparseable'; message: string };

/**
 * Run the rewrite through whichever CLI was chosen.
 *
 * A one-shot rewrite can take the better part of a minute on a slow model, so
 * the timeout is generous and the UI shows a spinner saying what it's waiting
 * for. `cli.improveArgs` is what makes this CLI-agnostic — see `agents.ts` for
 * why the two tools need different flags to stay read-only.
 */
export async function improveWithAgent(
  shell: Shell,
  cli: AgentCli,
  input: ImproveInput
): Promise<ImproveOutcome> {
  const args = cli.improveArgs(buildBrief(input), input.model, input.effort);

  const result = await shell.exec(cli.binary, args, { timeout: 180 }).catch((error: unknown) => ({
    stdout: '',
    stderr: error instanceof Error ? error.message : String(error),
    exit_code: 1,
  }));

  if (result.exit_code !== 0) {
    const stderr = result.stderr.trim();
    // A missing binary is the one failure with an obvious next step.
    if (/not found|ENOENT/i.test(stderr)) {
      return {
        ok: false,
        code: 'no-cli',
        message: `The \`${cli.binary}\` command isn't on Ship Studio's PATH. Templates and hints still work.`,
      };
    }
    return {
      ok: false,
      code: 'failed',
      message:
        stderr ||
        `${cli.label} exited without producing anything. Check that \`${cli.binary}\` runs in your terminal.`,
    };
  }

  const improved = readImproved(extractJson(unwrapCliOutput(result.stdout)));
  if (!improved) {
    return {
      ok: false,
      code: 'unparseable',
      message: `${cli.label} replied, but not with a rewritten prompt. Try again, or add a bit more detail.`,
    };
  }

  return { ok: true, improved };
}
