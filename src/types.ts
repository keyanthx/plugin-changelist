/**
 * The Ship Studio plugin runtime contract.
 *
 * Mirrors `packages/plugin-sdk/src/context.ts` in the ship-studio repo. It is
 * copied rather than imported because the SDK is a source-only package that
 * isn't published to npm — the same choice the official plugins make.
 */

export interface ExecResult {
  stdout: string;
  stderr: string;
  exit_code: number;
}

export interface Shell {
  /** Runs a binary in the project directory. `timeout` is in seconds (default 120). */
  exec: (command: string, args: string[], options?: { timeout?: number }) => Promise<ExecResult>;
}

export interface PluginProject {
  name: string;
  path: string;
  currentBranch: string;
  hasUncommittedChanges: boolean;
  devServerUrl?: string;
}

export interface PluginTheme {
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  accent: string;
  accentHover: string;
  action: string;
  actionHover: string;
  actionText: string;
  error: string;
  success: string;
}

export interface PluginContextValue {
  pluginId: string;
  /** null on the dashboard — gate anything that touches the project on this. */
  project: PluginProject | null;
  actions: {
    showToast: (message: string, type?: 'success' | 'error') => void;
    refreshGitStatus: () => void;
    refreshBranches: () => void;
    focusTerminal: () => void;
    openUrl: (url: string) => void;
  };
  shell: Shell;
  /** Whole-object JSON blob at {project}/.shipstudio/plugins/{id}/storage.json */
  storage: {
    read: () => Promise<Record<string, unknown>>;
    write: (data: Record<string, unknown>) => Promise<void>;
  };
  /** Only commands declared in the manifest's required_commands. */
  invoke: {
    call: <T = unknown>(command: string, args?: Record<string, unknown>) => Promise<T>;
  };
  theme: PluginTheme;
}
