/**
 * Dev-preview shim: stands in for the globals Ship Studio hands to plugins.
 *
 * Must be imported before `src/index.tsx` — the JSX transform reads
 * `window.__SHIPSTUDIO_REACT__` when each module is first evaluated, and ES
 * module imports are evaluated in order.
 *
 * Faithfulness matters here. The host rebuilds the plugin context object on
 * every one of its own renders (`buildContext(...)` is called inline inside
 * PluginSlot's map, unmemoized). A preview that hands the plugin one frozen
 * context is easier to write but hides every bug caused by that churn — the
 * kind where a text field snaps back to an old value a moment after you type.
 * So `makeContext()` is a factory, and main.tsx calls it on a timer.
 *
 * Preview only. Never part of the built plugin bundle.
 */
import * as React from 'react';
import * as ReactDOM from 'react-dom';

const w = window as unknown as Record<string, unknown>;
w.__SHIPSTUDIO_REACT__ = React;
w.__SHIPSTUDIO_REACT_DOM__ = ReactDOM;

const STORAGE_KEY = 'change-preview-storage';

/** Preview-only switches, flipped from the console. See the bottom of this file. */
const FLAGS = {
  /** Whether `claude` appears to be installed, so the ✨ Improve button shows. */
  get hasClaude() {
    return localStorage.getItem('change-preview-no-claude') !== '1';
  },
  /** Whether `opencode` appears to be installed. */
  get hasOpenCode() {
    return localStorage.getItem('change-preview-no-opencode') !== '1';
  },
  /** Makes every `git checkout` fail, to exercise the error path. */
  get branchFails() {
    return localStorage.getItem('change-preview-branch-fails') === '1';
  },
  /** Makes `git checkout -b` refuse because the branch is already there. */
  get branchExists() {
    return localStorage.getItem('change-preview-branch-exists') === '1';
  },
  /** Makes `claude -p` return something that isn't a rewritten prompt. */
  get claudeGarbles() {
    return localStorage.getItem('change-preview-claude-garbles') === '1';
  },
  /** Shows the "your uncommitted changes will come along" warning. */
  get dirtyRepo() {
    return localStorage.getItem('change-preview-dirty-repo') === '1';
  },
};

function ok(stdout: string) {
  return Promise.resolve({ stdout, stderr: '', exit_code: 0 });
}

function fail(stderr: string) {
  return Promise.resolve({ stdout: '', stderr, exit_code: 1 });
}

/**
 * Fake shell: answer the commands the plugin actually runs with canned data, so
 * the whole flow works offline. An unhandled command returns a non-zero exit so
 * it shows up rather than silently succeeding.
 */
async function exec(command: string, args: string[]) {
  const joined = args.join(' ');

  // `commandExists` — which agent CLIs are on the PATH?
  if (command === 'sh' && args[0] === '-c' && joined.includes('command -v claude')) {
    return FLAGS.hasClaude ? ok('/usr/local/bin/claude') : fail('');
  }
  if (command === 'sh' && args[0] === '-c' && joined.includes('command -v opencode')) {
    return FLAGS.hasOpenCode ? ok('/opt/homebrew/bin/opencode') : fail('');
  }

  /*
   * The model dropdown. `--verbose` returns a JSON object per model, and these
   * shapes mirror real 1.18.7 output — including that `variants` differs per
   * model and is often empty, which is exactly what the effort picker keys off.
   */
  if (command === 'opencode' && args[0] === 'models') {
    // Counted so the preview can prove the settings effect runs once rather
    // than re-firing on every host render. Read `__modelListCalls` in devtools.
    const w = window as unknown as { __modelListCalls?: number };
    w.__modelListCalls = (w.__modelListCalls ?? 0) + 1;

    const model = (
      provider: string,
      id: string,
      name: string,
      variants: string[],
      free: boolean,
      context = 200000
    ) =>
      `${provider}/${id}\n` +
      JSON.stringify(
        {
          id,
          providerID: provider,
          name,
          cost: { input: free ? 0 : 3, output: free ? 0 : 15 },
          limit: { context },
          capabilities: { reasoning: variants.length > 0 },
          variants: Object.fromEntries(variants.map((v) => [v, {}])),
        },
        null,
        2
      );

    return ok(
      [
        model('opencode', 'big-pickle', 'Big Pickle', [], true),
        model('opencode', 'north-mini-code-free', 'North Mini Code Free', ['none', 'high'], true, 256000),
        model('opencode-go', 'hy3', 'Hy3', ['high', 'max'], false),
        model('opencode-go', 'glm-5.2', 'GLM 5.2', ['low', 'medium', 'high'], false),
        model('opencode-go', 'kimi-k3', 'Kimi K3', [], false, 262144),
        model('ollama', 'qwen3.5', 'Qwen 3.5', [], true, 128000),
      ].join('\n')
    );
  }

  // Claude has no model-listing command, so the plugin reads its --help.
  if (command === 'claude' && args[0] === '--help') {
    return ok(
      [
        "  --model <model>     Model for the current session. Provide an alias for",
        "                      the latest model (e.g. 'fable', 'opus', or 'sonnet')",
        "                      or a model's full name (e.g. 'claude-fable-5').",
        '  --effort <level>    Effort level for the current session',
        '                      (low, medium, high, xhigh, max)',
      ].join('\n')
    );
  }

  // ✨ Improve through OpenCode. The real CLI writes the bare reply to stdout
  // and its `> plan · hy3` decoration to stderr — mirrored here so the plugin's
  // parsing is exercised against the shape it will actually meet.
  if (command === 'opencode' && args[0] === 'run') {
    await new Promise((resolve) => setTimeout(resolve, 900));
    if (FLAGS.claudeGarbles) return ok('I am not sure what you mean.');
    return {
      stdout:
        JSON.stringify({
          title: 'Shorten the hero headline',
          prompt:
            'On the home page, shorten the hero headline in src/components/Hero.tsx so it fits on two lines at 1440px.\nKeep the subhead and the CTA button exactly as they are.',
          difficulty: 'easy',
        }) + '\n',
      stderr: '[0m\n> plan · hy3\n',
      exit_code: 0,
    };
  }

  // Branch creation from the send popover.
  if (command === 'git' && args[0] === 'checkout') {
    const name = args[args.length - 1];
    const creating = args[1] === '-b';

    // `branch-exists` mimics the common real case: `-b` refuses, the plain
    // checkout then succeeds, and the plugin switches instead of creating.
    if (FLAGS.branchExists && creating) {
      return fail(`fatal: a branch named '${name}' already exists`);
    }
    if (FLAGS.branchFails) {
      return fail('error: Your local changes would be overwritten by checkout.');
    }
    console.log(`[preview] git ${args.join(' ')}`);
    return ok(creating ? `Switched to a new branch '${name}'` : `Switched to branch '${name}'`);
  }

  if (command === 'git' && args[0] === 'check-ignore') return ok('');

  // ✨ Improve. The real CLI takes ~20s; the delay here keeps the spinner honest.
  if (command === 'claude' && args[0] === '-p') {
    await new Promise((resolve) => setTimeout(resolve, 900));
    if (FLAGS.claudeGarbles) return ok(JSON.stringify({ result: "I'm not sure what you mean." }));
    return ok(
      JSON.stringify({
        result: JSON.stringify({
          title: 'Shorten the hero headline',
          prompt:
            'On the home page, shorten the hero headline in src/components/Hero.tsx so it fits on two lines at 1440px.\nKeep the subhead and the CTA button exactly as they are.',
          difficulty: 'easy',
        }),
      })
    );
  }

  return fail(`preview: unhandled ${command} ${joined}`);
}

/** A fresh context object, exactly as the host builds one per render. */
export function makeContext() {
  return {
    pluginId: 'changelist',
    project: {
      name: 'example-project',
      path: '/repo/example-project',
      currentBranch: 'main',
      hasUncommittedChanges: FLAGS.dirtyRepo,
    },
    actions: {
      showToast: (message: string, type?: string) => console.log(`[toast:${type ?? 'info'}] ${message}`),
      refreshGitStatus: () => {},
      refreshBranches: () => {},
      focusTerminal: () => console.log('[action] focusTerminal'),
      openUrl: (url: string) => window.open(url, '_blank'),
    },
    shell: { exec },
    storage: {
      read: async () => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'),
      write: async (data: Record<string, unknown>) =>
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data)),
    },
    /**
     * Fake `invoke`, deliberately as strict about arguments as the real backend.
     *
     * Every project-scoped Tauri command requires `projectPath`, and the host
     * rejects the call outright when it's missing. An earlier version of this
     * fake ignored arguments entirely, so a call with none passed here and
     * failed only once the plugin was installed in a real project — the preview
     * being kinder than production is exactly how that bug survived.
     *
     * The host also toasts an invoke failure *before* re-throwing, so a plugin's
     * own try/catch can't hide it. Logging here mirrors that: a missing argument
     * is visible while developing, not silent.
     */
    invoke: {
      call: async (command: string, args?: Record<string, unknown>) => {
        const requiresProjectPath = [
          'get_branch_prefix_preference',
          'read_project_metadata',
        ];

        if (requiresProjectPath.includes(command) && !args?.projectPath) {
          const message = `invalid args \`projectPath\` for command \`${command}\`: command ${command} missing required key projectPath`;
          console.error(`[preview] invoke rejected — ${message}`);
          throw new Error(message);
        }

        if (command === 'get_branch_prefix_preference') return 'feat';
        return null;
      },
    },
    theme: {
      bgPrimary: '#16181d',
      bgSecondary: '#1c1f26',
      bgTertiary: '#252932',
      textPrimary: '#e6e8ec',
      textSecondary: '#a8adb8',
      textMuted: '#6f7681',
      border: '#2c313b',
      accent: '#7aa2f7',
      accentHover: '#93b4ff',
      action: '#3b6fd4',
      actionHover: '#4a7ee4',
      actionText: '#ffffff',
      error: '#f04a4a',
      success: '#3fbf6f',
    },
  };
}

/**
 * The channel `usePluginContext()` prefers: a real React context whose object
 * lives on a window global. The host does the same via `exposePluginContextRef`.
 */
export const PreviewPluginContext = React.createContext<ReturnType<typeof makeContext> | null>(null);
w.__SHIPSTUDIO_PLUGIN_CONTEXT_REF__ = PreviewPluginContext;

// Legacy single global, kept populated for the fallback path.
w.__SHIPSTUDIO_PLUGIN_CONTEXT__ = makeContext();

/**
 * Console helpers for driving the preview:
 *
 *   changeReset()                back to a first-run empty list
 *   changeFlag('no-claude')      as on a machine with only OpenCode installed
 *   changeFlag('no-opencode')    as on a machine with only Claude Code
 *   changeFlag('branch-fails')   make every git checkout fail
 *   changeFlag('branch-exists')  make `checkout -b` refuse, so it switches
 *   changeFlag('claude-garbles') make Improve return something unparseable
 *   changeFlag('dirty-repo')     show the uncommitted-changes warning
 *
 * Each `changeFlag` call toggles and reloads.
 */
(w as { changeReset?: () => void }).changeReset = () => {
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
};

(w as { changeFlag?: (name: string) => void }).changeFlag = (name: string) => {
  const key = `change-preview-${name}`;
  if (localStorage.getItem(key) === '1') localStorage.removeItem(key);
  else localStorage.setItem(key, '1');
  location.reload();
};
