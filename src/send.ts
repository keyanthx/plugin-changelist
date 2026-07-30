/**
 * Turning an item into something you can paste into a terminal.
 *
 * A plugin can't type into Ship Studio's terminal or start an agent — the whole
 * terminal API is `actions.focusTerminal()`. So the handoff is: build the exact
 * command line, put it on the clipboard, and focus the terminal so the cursor
 * is already in the right place. You see the model before you press enter,
 * which is the point.
 *
 * Pure functions only, so `test/send.test.mjs` can check the quoting against
 * the strings that actually break naive escaping.
 */
import type { ChangeItem, Settings } from './model.ts';

/**
 * Wrap text so a POSIX shell treats it as one literal argument.
 *
 * Single quotes are the only quoting in `sh` with no escapes inside at all —
 * `$`, backticks, backslashes and newlines are all literal. The one thing that
 * can't appear is a single quote, so each one is closed, escaped, and reopened:
 * `don't` becomes `'don'\''t'`.
 *
 * Prompts are full of apostrophes and newlines, so this matters more here than
 * it looks.
 */
export function shellQuote(text: string): string {
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

/**
 * The command line for one item.
 *
 * The template is the user's, so it may be any CLI agent. `{prompt}` is
 * replaced with the quoted prompt; a template that forgets the placeholder
 * still works — the prompt is appended rather than silently dropped.
 */
export function buildCommand(template: string, prompt: string): string {
  const quoted = shellQuote(prompt);
  const trimmed = template.trim();
  if (!trimmed) return quoted;
  if (trimmed.includes('{prompt}')) return trimmed.split('{prompt}').join(quoted);
  return `${trimmed} ${quoted}`;
}

/**
 * What gets copied for this item, given the settings.
 *
 * `prompt-only` mode exists for the case where an agent is already running in
 * the terminal and you just want to feed it the next instruction.
 */
export function buildClipboardText(item: ChangeItem, settings: Settings, mode = settings.sendMode): string {
  const prompt = item.prompt.trim() || item.title.trim();
  if (mode === 'prompt-only') return prompt;
  return buildCommand(settings.commands[item.difficulty], prompt);
}

// ---------------------------------------------------------------------------
// Branch names
// ---------------------------------------------------------------------------

/**
 * A git-safe slug from a title.
 *
 * Git refuses plenty of characters in branch names (spaces, `~^:?*[`, a leading
 * dash, `..`, a trailing `.lock`). Reducing to lowercase letters, digits and
 * single dashes sidesteps all of it, and stays readable in the branch list.
 */
export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize('NFKD')
    // NFKD splits "ü" into "u" + a combining accent; drop the accent, or the
    // next line would turn it into a dash and give us "u-ber" from "Über".
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, ''); // the slice can leave a trailing dash
  return slug || 'change';
}

/**
 * The branch name suggested in the send popover.
 *
 * Only ever a suggestion — the field is editable, and detection that overwrites
 * what someone typed is worse than no detection.
 */
export function suggestBranchName(title: string, prefix: string): string {
  const cleanPrefix = prefix.trim().replace(/^\/+/, '');
  const slug = slugify(title);
  if (!cleanPrefix) return slug;
  return cleanPrefix.endsWith('/') ? `${cleanPrefix}${slug}` : `${cleanPrefix}/${slug}`;
}

/**
 * Whether a branch name is one git will accept.
 *
 * Checked before running `git checkout -b` so a bad name is a message in the
 * popover rather than a red error from git.
 */
export function isValidBranchName(name: string): boolean {
  const value = name.trim();
  if (!value) return false;
  if (/[\s~^:?*[\\]/.test(value)) return false;
  if (value.includes('..') || value.includes('@{')) return false;
  if (value.startsWith('-') || value.startsWith('/') || value.endsWith('/')) return false;
  if (value.endsWith('.') || value.endsWith('.lock')) return false;
  return true;
}
