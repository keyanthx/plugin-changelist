/**
 * The one git mutation this plugin performs: making a branch for an item.
 *
 * It only ever runs from the send popover, with a visible, editable branch name
 * and a checkbox the user ticked. The plugin never commits, never pushes, and
 * never touches a branch you didn't name.
 */
import { isValidBranchName } from './send.ts';
import type { PluginContextValue, Shell } from './types.ts';

export type BranchOutcome =
  | { ok: true; action: 'created' | 'switched'; name: string }
  | { ok: false; message: string };

/**
 * Check out a new branch, or switch to it if it already exists.
 *
 * The "already exists" fallback is deliberate: coming back to an item you
 * started yesterday should land you back on its branch, not show you an error.
 */
export async function createOrSwitchBranch(shell: Shell, rawName: string): Promise<BranchOutcome> {
  const name = rawName.trim();
  if (!isValidBranchName(name)) {
    return { ok: false, message: `"${name}" isn't a valid git branch name.` };
  }

  const created = await shell
    .exec('git', ['checkout', '-b', name], { timeout: 30 })
    .catch((error: unknown) => ({
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
      exit_code: 1,
    }));

  if (created.exit_code === 0) return { ok: true, action: 'created', name };

  if (/already exists/i.test(created.stderr)) {
    const switched = await shell
      .exec('git', ['checkout', name], { timeout: 30 })
      .catch(() => ({ stdout: '', stderr: '', exit_code: 1 }));
    if (switched.exit_code === 0) return { ok: true, action: 'switched', name };
    return {
      ok: false,
      message: `Branch ${name} exists but couldn't be checked out. ${switched.stderr.trim()}`.trim(),
    };
  }

  return {
    ok: false,
    message: created.stderr.trim() || `Could not create branch ${name}.`,
  };
}

/**
 * Ship Studio's own branch-prefix preference, used to pre-fill branch names.
 *
 * Every project-scoped Tauri command takes `projectPath`, and the host rejects
 * the call outright without it. Note that the `try/catch` below is not enough on
 * its own to keep a bad call quiet: Ship Studio toasts an invoke failure
 * *before* re-throwing, so the user sees the error even though we swallow it.
 * The call has to actually succeed — hence the guard as well as the argument.
 *
 * The return shape isn't documented, so this reads it defensively: a bare
 * string, or an object with a plausible key, or nothing. A prefix is a nicety —
 * failing to find one must never block a send.
 */
export async function readBranchPrefix(ctx: PluginContextValue): Promise<string> {
  const projectPath = ctx.project?.path;
  if (!projectPath) return ''; // dashboard, or no project — don't call at all

  try {
    const value = await ctx.invoke.call<unknown>('get_branch_prefix_preference', {
      projectPath,
    });
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      for (const key of ['prefix', 'branchPrefix', 'branch_prefix', 'value']) {
        if (typeof record[key] === 'string') return record[key] as string;
      }
    }
  } catch {
    // Not available, or the command shape changed — carry on without a prefix.
  }
  return '';
}
