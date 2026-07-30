/**
 * The data model: what a change is, what the settings are, and how both are
 * stored.
 *
 * Everything in this file is pure — no React, no shell, no Ship Studio. That's
 * what lets `test/model.test.mjs` exercise it without the app running.
 *
 * Storage is a single JSON blob per project. Because it's one blob, every save
 * writes the whole thing; there is no partial update to get wrong.
 */
import type { AgentCliId } from './agents.ts';

/** How much work an item is — this is what picks the model/agent on send. */
export type Difficulty = 'easy' | 'normal' | 'hard';

/** Where an item is in the pipeline. */
export type Status = 'todo' | 'doing' | 'done';

/** Which prompt skeleton was used, if any. See `templates.ts`. */
export type TemplateId = 'style' | 'copy' | 'bug' | 'new-section' | 'refactor';

export interface ChangeItem {
  id: string;
  /** The one-line note, captured fast. */
  title: string;
  /** The full instruction handed to the agent. Often written later. */
  prompt: string;
  difficulty: Difficulty;
  status: Status;
  template: TemplateId | null;
  /** The git branch that was checked out when the note was written. */
  branchAtCapture: string | null;
  /** The branch created for this item at send time, when one was. */
  workBranch: string | null;
  /** ISO timestamps. `createdAt` always exists; the others appear as it moves. */
  createdAt: string;
  sentAt?: string;
  doneAt?: string;
}

/**
 * How the prompt leaves the plugin.
 *
 * - `launch` copies a whole command line, so pasting it into a shell starts a
 *   fresh agent on the model this item's difficulty maps to.
 * - `prompt-only` copies just the prompt text, for pasting into an agent that
 *   is already running.
 */
export type SendMode = 'launch' | 'prompt-only';

export interface Settings {
  /**
   * One command template per difficulty. `{prompt}` is replaced with the
   * shell-quoted prompt — see `send.ts`.
   *
   * It's free text on purpose: any CLI agent works, not just Claude.
   */
  commands: Record<Difficulty, string>;
  sendMode: SendMode;
  /** Whether the send popover starts with "create a branch" ticked. */
  createBranch: boolean;
  /** Prefix for generated branch names, e.g. `feat/`. May be empty. */
  branchPrefix: string;
  /**
   * Which CLI ✨ Improve shells out to. Independent of the send commands above,
   * so you can send work to one tool and rewrite prompts on a cheaper other.
   */
  improveCli: AgentCliId;
  /** Model for the ✨ Improve call, in that CLI's own naming. */
  improveModel: string;
  /**
   * Reasoning effort for ✨ Improve. Empty means "the CLI's default".
   *
   * Improve is the one place OpenCode's effort flag actually works, since it
   * runs headlessly — see `AgentCli.effort.scope` in `agents.ts`.
   */
  improveEffort: string;
}

/**
 * The whole stored blob.
 *
 * `schema` is checked on read. A blob from a future or unknown version is
 * ignored entirely rather than half-read into a broken UI.
 */
export interface Stored {
  schema: 1;
  items: ChangeItem[];
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  // Claude Code out of the box; the OpenCode preset is one click away in
  // Settings. Both live in `agents.ts` — this mirrors CLAUDE.defaultCommands.
  commands: {
    easy: 'claude --permission-mode plan --model haiku {prompt}',
    normal: 'claude --permission-mode plan --model sonnet {prompt}',
    hard: 'claude --permission-mode plan --model opus {prompt}',
  },
  sendMode: 'launch',
  createBranch: false,
  branchPrefix: '',
  improveCli: 'claude',
  improveModel: 'haiku',
  improveEffort: '',
};

export function emptyStored(): Stored {
  return { schema: 1, items: [], settings: { ...DEFAULT_SETTINGS } };
}

// ---------------------------------------------------------------------------
// Reading what was stored
// ---------------------------------------------------------------------------

const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];
const STATUSES: Status[] = ['todo', 'doing', 'done'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/**
 * Coerce one stored entry into a valid item, or drop it.
 *
 * Being strict about the shape here means the rest of the plugin can treat
 * every field as present — no `item.difficulty ?? 'normal'` scattered through
 * the UI.
 */
function readItem(value: unknown): ChangeItem | null {
  if (!isRecord(value)) return null;
  const id = asString(value.id);
  if (!id) return null;

  const difficulty = value.difficulty as Difficulty;
  const status = value.status as Status;

  return {
    id,
    title: asString(value.title),
    prompt: asString(value.prompt),
    difficulty: DIFFICULTIES.includes(difficulty) ? difficulty : 'normal',
    status: STATUSES.includes(status) ? status : 'todo',
    template: asString(value.template) ? (value.template as TemplateId) : null,
    branchAtCapture: typeof value.branchAtCapture === 'string' ? value.branchAtCapture : null,
    workBranch: typeof value.workBranch === 'string' ? value.workBranch : null,
    createdAt: asString(value.createdAt, new Date().toISOString()),
    sentAt: typeof value.sentAt === 'string' ? value.sentAt : undefined,
    doneAt: typeof value.doneAt === 'string' ? value.doneAt : undefined,
  };
}

/**
 * Turn whatever came out of storage into a `Stored` we can trust.
 *
 * A wrong or missing `schema` yields a fresh empty list — never a partial read.
 * Settings, by contrast, are merged field by field, so a blob written by an
 * older version still keeps the command templates the user customised.
 */
export function readStored(raw: unknown): Stored {
  if (!isRecord(raw) || raw.schema !== 1 || !Array.isArray(raw.items)) return emptyStored();

  const storedSettings = isRecord(raw.settings) ? raw.settings : {};
  const storedCommands = isRecord(storedSettings.commands) ? storedSettings.commands : {};

  return {
    schema: 1,
    items: raw.items.map(readItem).filter((item): item is ChangeItem => item !== null),
    settings: {
      commands: {
        easy: asString(storedCommands.easy, DEFAULT_SETTINGS.commands.easy),
        normal: asString(storedCommands.normal, DEFAULT_SETTINGS.commands.normal),
        hard: asString(storedCommands.hard, DEFAULT_SETTINGS.commands.hard),
      },
      sendMode: storedSettings.sendMode === 'prompt-only' ? 'prompt-only' : 'launch',
      createBranch: storedSettings.createBranch === true,
      branchPrefix: asString(storedSettings.branchPrefix, DEFAULT_SETTINGS.branchPrefix),
      improveCli: storedSettings.improveCli === 'opencode' ? 'opencode' : 'claude',
      improveModel: asString(storedSettings.improveModel, DEFAULT_SETTINGS.improveModel),
      improveEffort: asString(storedSettings.improveEffort, DEFAULT_SETTINGS.improveEffort),
    },
  };
}

// ---------------------------------------------------------------------------
// Creating and changing items
// ---------------------------------------------------------------------------

/** `crypto.randomUUID` isn't guaranteed everywhere, so there's a fallback. */
function newId(): string {
  const cryptoApi = globalThis.crypto as Crypto | undefined;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createItem(title: string, branchAtCapture: string | null): ChangeItem {
  return {
    id: newId(),
    title: title.trim(),
    prompt: '',
    difficulty: 'normal',
    status: 'todo',
    template: null,
    branchAtCapture,
    workBranch: null,
    createdAt: new Date().toISOString(),
  };
}

/** Replace one item, leaving order untouched. */
export function updateItem(
  items: ChangeItem[],
  id: string,
  patch: Partial<ChangeItem>
): ChangeItem[] {
  return items.map((item) => (item.id === id ? { ...item, ...patch } : item));
}

/**
 * Move an item to a new status, stamping the matching timestamp.
 *
 * Moving back out of `done` clears `doneAt`, so a mis-click doesn't leave a
 * completion time on something that isn't finished.
 */
export function setStatus(items: ChangeItem[], id: string, status: Status): ChangeItem[] {
  const now = new Date().toISOString();
  return items.map((item) => {
    if (item.id !== id) return item;
    if (status === 'done') return { ...item, status, doneAt: now };
    if (status === 'doing') return { ...item, status, sentAt: item.sentAt ?? now, doneAt: undefined };
    return { ...item, status, doneAt: undefined };
  });
}

/**
 * Move an item one place up or down *within its own status group*.
 *
 * Swapping with the raw neighbour would be confusing, because the list is
 * rendered grouped: an item could appear to jump several rows, or vanish into
 * another group. So we find the previous/next item that shares its status and
 * swap with that one.
 */
export function moveItem(items: ChangeItem[], id: string, direction: -1 | 1): ChangeItem[] {
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return items;

  const status = items[index].status;
  let target = -1;
  for (let i = index + direction; i >= 0 && i < items.length; i += direction) {
    if (items[i].status === status) {
      target = i;
      break;
    }
  }
  if (target === -1) return items;

  const next = items.slice();
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function removeItem(items: ChangeItem[], id: string): ChangeItem[] {
  return items.filter((item) => item.id !== id);
}

/** The three rendered groups, each keeping the user's manual order. */
export function groupItems(items: ChangeItem[]) {
  return {
    doing: items.filter((item) => item.status === 'doing'),
    todo: items.filter((item) => item.status === 'todo'),
    done: items.filter((item) => item.status === 'done'),
  };
}

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'Easy',
  normal: 'Normal',
  hard: 'Hard',
};

/** Cycles easy → normal → hard → easy, for the click-to-change chip. */
export function nextDifficulty(current: Difficulty): Difficulty {
  const index = DIFFICULTIES.indexOf(current);
  return DIFFICULTIES[(index + 1) % DIFFICULTIES.length];
}
