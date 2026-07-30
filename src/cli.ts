/**
 * Talking to command-line tools through Ship Studio's shell.
 *
 * The plugin webview has no filesystem and no working third-party HTTP, so
 * anything outside the UI goes through `shell.exec`, which spawns a binary in
 * the project directory with the app's extended PATH.
 *
 * Note that `exec` is a direct spawn, not a shell — there are no pipes, globs
 * or `&&` unless you invoke `sh -c` yourself, which is why `commandExists`
 * does exactly that.
 */
import type { Shell } from './types.ts';

/** Is `command` on the PATH Ship Studio hands to plugins? */
export async function commandExists(shell: Shell, command: string): Promise<boolean> {
  const result = await shell
    .exec('sh', ['-c', `command -v ${command}`], { timeout: 15 })
    .catch(() => null);
  return Boolean(result && result.exit_code === 0 && result.stdout.trim());
}

/**
 * The last non-empty line of stdout.
 *
 * Node and other CLIs sometimes print a warning before their real output;
 * parsing only the last line keeps a stray "ExperimentalWarning" from breaking
 * a `JSON.parse`.
 */
export function lastJsonLine(stdout: string): string {
  const lines = stdout
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean);
  return lines[lines.length - 1] ?? '';
}
