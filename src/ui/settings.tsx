/**
 * Settings: which CLI runs what, the difficulty → command mapping, and the
 * small defaults.
 *
 * The command fields stay free text on purpose. The preset buttons and model
 * dropdown are conveniences on top of them, not a replacement — the point is
 * that *you* decide what runs. Anything you'd type in the terminal works here,
 * including mixing tools: Easy on OpenCode, Hard on Claude Opus.
 */
import { useEffect, useRef, useState } from 'react';
import {
  AGENT_CLIS,
  findAgentCli,
  parseModelList,
  readModelFromCommand,
  withModel,
  type AgentCli,
} from '../agents.ts';
import { copyText } from '../clipboard.ts';
import { useTheme } from '../context.ts';
import { collectDiagnostics } from '../diagnostics.ts';
import { useDock } from '../dock.ts';
import { applyHostLayout, getLayoutReport, restoreHostLayout, subscribeLayout } from '../hostLayout.ts';
import { DIFFICULTY_LABELS, type Difficulty, type Settings } from '../model.ts';
import type { Shell } from '../types.ts';
import { Field } from './parts.tsx';
import { difficultyColor } from './row.tsx';

const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

/** The binary a command template invokes — its first word. */
function binaryOf(command: string): string {
  return command.trim().split(/\s+/)[0] ?? '';
}

/** Are these commands exactly one of the shipped presets, or hand-edited? */
function matchesPreset(commands: Record<Difficulty, string>, cli: AgentCli): boolean {
  return DIFFICULTIES.every((difficulty) => commands[difficulty] === cli.defaultCommands[difficulty]);
}

export function SettingsView({
  settings,
  detectedPrefix,
  installedClis,
  shell,
  onChange,
}: {
  settings: Settings;
  /** Ship Studio's own branch-prefix preference, used when ours is blank. */
  detectedPrefix: string;
  /** Which agent CLIs are on the PATH, by id. */
  installedClis: Record<string, boolean>;
  shell: Shell | null;
  onChange: (patch: Partial<Settings>) => void;
}) {
  const theme = useTheme();

  const [openCodeModels, setOpenCodeModels] = useState<string[]>([]);
  const [pendingPreset, setPendingPreset] = useState<AgentCli | null>(null);

  /**
   * `shell` comes off the plugin context, which Ship Studio rebuilds several
   * times a second — so it must never be an effect dependency. Keep the newest
   * one in a ref and key the effect on a stable primitive instead, or this
   * spawns an `opencode models` process on every host render.
   */
  const shellRef = useRef(shell);
  shellRef.current = shell;

  const hasOpenCode = installedClis.opencode === true;

  useEffect(() => {
    if (!hasOpenCode) return;
    let cancelled = false;
    void (async () => {
      const current = shellRef.current;
      if (!current) return;
      const result = await current.exec('opencode', ['models'], { timeout: 20 }).catch(() => null);
      if (cancelled || !result || result.exit_code !== 0) return;
      setOpenCodeModels(parseModelList(result.stdout));
    })();
    return () => {
      cancelled = true;
    };
  }, [hasOpenCode]);

  const inputStyle = {
    background: theme.bgPrimary,
    color: theme.textPrimary,
    border: `1px solid ${theme.border}`,
  };

  const isCustomised = !AGENT_CLIS.some((cli) => matchesPreset(settings.commands, cli));

  const applyPreset = (cli: AgentCli) => {
    onChange({ commands: { ...cli.defaultCommands } });
    setPendingPreset(null);
  };

  /** Never clobber hand-edited commands without asking. */
  const pickPreset = (cli: AgentCli) => {
    if (isCustomised) setPendingPreset(cli);
    else applyPreset(cli);
  };

  /** The model options for whichever binary this command line invokes. */
  const modelOptionsFor = (command: string): string[] => {
    const binary = binaryOf(command);
    if (binary === 'opencode') return openCodeModels;
    const cli = AGENT_CLIS.find((entry) => entry.binary === binary);
    return cli ? cli.modelSuggestions : [];
  };

  return (
    <div className="change-settings">
      <Field label="Agent CLI">
        <div className="change-radio-row">
          {AGENT_CLIS.map((cli) => {
            const installed = installedClis[cli.id] === true;
            const active = matchesPreset(settings.commands, cli);
            return (
              <button
                key={cli.id}
                className="change-radio"
                style={{
                  background: active ? 'rgba(127, 127, 127, 0.14)' : 'transparent',
                  border: `1px solid ${active ? theme.accent : theme.border}`,
                  color: installed ? theme.textPrimary : theme.textMuted,
                  opacity: installed ? 1 : 0.6,
                }}
                disabled={!installed}
                title={
                  installed
                    ? `Fill the three commands below with ${cli.label} defaults`
                    : `\`${cli.binary}\` isn't on Ship Studio's PATH`
                }
                onClick={() => pickPreset(cli)}
              >
                <strong style={{ fontWeight: 600 }}>{cli.label}</strong>
                <br />
                <span style={{ color: theme.textMuted, fontSize: 10.5 }}>
                  {installed ? 'Use these defaults' : 'not installed'}
                </span>
              </button>
            );
          })}
        </div>

        {pendingPreset ? (
          <div
            className="change-warning change-button-row"
            style={{
              background: 'rgba(127, 127, 127, 0.12)',
              color: theme.textSecondary,
              marginTop: 8,
            }}
          >
            <span style={{ flex: '1 1 140px', minWidth: 0 }}>
              Replace your edited commands with the {pendingPreset.label} defaults?
            </span>
            <button
              className="change-btn"
              style={{ background: theme.action, color: theme.actionText }}
              onClick={() => applyPreset(pendingPreset)}
            >
              Replace
            </button>
            <button
              className="change-btn"
              style={{ background: 'transparent', color: theme.textMuted, border: `1px solid ${theme.border}` }}
              onClick={() => setPendingPreset(null)}
            >
              Cancel
            </button>
          </div>
        ) : null}

        <div className="change-settings-note" style={{ color: theme.textMuted, marginTop: 8 }}>
          Both presets start the agent in <strong>plan mode</strong> with your prompt as the first
          message, so it proposes before it edits.
        </div>
      </Field>

      <Field label="Command per difficulty">
        <div className="change-settings-grid">
          {DIFFICULTIES.map((difficulty) => {
            const command = settings.commands[difficulty];
            const options = modelOptionsFor(command);
            const selected = readModelFromCommand(command) ?? '';
            const listId = `change-models-${difficulty}`;

            return (
              <div key={difficulty} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div className="change-settings-row">
                  <span
                    className="change-settings-key"
                    style={{ color: difficultyColor(difficulty, theme) }}
                  >
                    {DIFFICULTY_LABELS[difficulty]}
                  </span>

                  {options.length > 0 ? (
                    <>
                      {/* A datalist keeps the field editable while still
                          offering the real model ids — a hard <select> would
                          lock out anything the list doesn't know about. */}
                      <input
                        className="change-input change-mono"
                        style={inputStyle}
                        list={listId}
                        value={selected}
                        spellCheck={false}
                        placeholder="model"
                        onChange={(event) =>
                          onChange({
                            commands: {
                              ...settings.commands,
                              [difficulty]: withModel(command, event.target.value),
                            },
                          })
                        }
                      />
                      <datalist id={listId}>
                        {options.map((model) => (
                          <option key={model} value={model} />
                        ))}
                      </datalist>
                    </>
                  ) : null}
                </div>

                {/* The indent is a class, not an inline style, so the narrow
                    container query can drop it — inline styles can't be
                    overridden by CSS. */}
                <input
                  className="change-input change-mono change-command-input"
                  style={inputStyle}
                  value={command}
                  spellCheck={false}
                  onChange={(event) =>
                    onChange({
                      commands: { ...settings.commands, [difficulty]: event.target.value },
                    })
                  }
                />
              </div>
            );
          })}
        </div>
        <div className="change-settings-note" style={{ color: theme.textMuted, marginTop: 8 }}>
          <code>{'{prompt}'}</code> is replaced with the prompt, quoted so apostrophes and line
          breaks survive. The top box picks the model; the box under it is the whole command, and
          you can put anything there — including a different tool per difficulty.
        </div>
      </Field>

      <Field label="Default send mode">
        <div className="change-radio-row">
          <button
            className="change-radio"
            style={{
              background: settings.sendMode === 'launch' ? 'rgba(127, 127, 127, 0.14)' : 'transparent',
              border: `1px solid ${settings.sendMode === 'launch' ? theme.accent : theme.border}`,
              color: theme.textSecondary,
            }}
            onClick={() => onChange({ sendMode: 'launch' })}
          >
            New agent
          </button>
          <button
            className="change-radio"
            style={{
              background:
                settings.sendMode === 'prompt-only' ? 'rgba(127, 127, 127, 0.14)' : 'transparent',
              border: `1px solid ${settings.sendMode === 'prompt-only' ? theme.accent : theme.border}`,
              color: theme.textSecondary,
            }}
            onClick={() => onChange({ sendMode: 'prompt-only' })}
          >
            Message a running agent
          </button>
        </div>
        <div className="change-settings-note" style={{ color: theme.textMuted, marginTop: 6 }}>
          A new agent means pasting the command at a <strong>shell prompt</strong> in a normal
          terminal tab — that&rsquo;s the only way the model in the command applies.
        </div>
      </Field>

      <Field label="Branches">
        <label className="change-check" style={{ color: theme.textPrimary, marginBottom: 9 }}>
          <input
            type="checkbox"
            checked={settings.createBranch}
            onChange={(event) => onChange({ createBranch: event.target.checked })}
          />
          Offer to create a branch on every send
        </label>
        <input
          className="change-input change-mono"
          style={inputStyle}
          value={settings.branchPrefix}
          spellCheck={false}
          placeholder={detectedPrefix ? `${detectedPrefix} (from Ship Studio)` : 'prefix, e.g. feat/'}
          onChange={(event) => onChange({ branchPrefix: event.target.value })}
        />
        <div className="change-settings-note" style={{ color: theme.textMuted, marginTop: 6 }}>
          Branch names are suggested from the change title. Ticking the box above opens the send
          options every time, so you always see the name before git runs.
        </div>
      </Field>

      <ImproveSettings
        settings={settings}
        installedClis={installedClis}
        openCodeModels={openCodeModels}
        onChange={onChange}
      />

      <LayoutDiagnostics />
    </div>
  );
}

/**
 * What the pinned dock did to Ship Studio's layout.
 *
 * Ship Studio has no devtools, so without this a failed reflow is invisible and
 * unreportable. Everything needed to diagnose a bad guess is here.
 */
function LayoutDiagnostics() {
  const theme = useTheme();
  const dock = useDock();
  const [report, setReport] = useState(getLayoutReport);

  useEffect(() => subscribeLayout(() => setReport(getLayoutReport())), []);

  const pinned = dock.mode === 'pinned' && dock.open;

  const summary =
    report.outcome === 'reflow'
      ? 'Ship Studio made room — the dock sits beside the app.'
      : report.outcome === 'fallback'
        ? 'Could not resize the app, so the dock is overlaying it.'
        : 'Not pinned, so the layout is untouched.';

  const tone =
    report.outcome === 'reflow'
      ? theme.success
      : report.outcome === 'fallback'
        ? 'var(--warning, #f59e0b)'
        : theme.textMuted;

  return (
    <Field label="Pinned layout">
      <div style={{ color: tone, fontSize: 12, marginBottom: 8 }}>{summary}</div>

      {report.note ? (
        <div className="change-settings-note" style={{ color: theme.textMuted, marginBottom: 8 }}>
          {report.note}
        </div>
      ) : null}

      <div
        className="change-code change-mono"
        style={{
          background: theme.bgSecondary,
          color: theme.textSecondary,
          border: `1px solid ${theme.border}`,
        }}
      >
        {[
          `outcome:  ${report.outcome}`,
          `strategy: ${report.strategy ?? '—'}`,
          `container:${report.container ?? '—'}`,
          `header:   ${report.headerBottom}px`,
          `content:  ${report.contentTop}px`,
          `width:    ${dock.dockWidth}px`,
        ].join('\n')}
      </div>

      <div className="change-button-row" style={{ marginTop: 8 }}>
        <button
          className="change-btn"
          style={{ background: 'transparent', color: theme.accent, border: `1px solid ${theme.border}` }}
          disabled={!pinned}
          title={pinned ? 'Measure the layout again' : 'Pin the panel first'}
          onClick={() => applyHostLayout(dock.dockWidth)}
        >
          Re-detect
        </button>
        <button
          className="change-btn"
          style={{ background: 'transparent', color: theme.textMuted, border: `1px solid ${theme.border}` }}
          title="Put Ship Studio's layout back, leaving the dock overlaying"
          onClick={() => restoreHostLayout()}
        >
          Undo layout change
        </button>
        <CopyDiagnosticsButton />
      </div>

      <div className="change-settings-note" style={{ color: theme.textMuted, marginTop: 8 }}>
        The dock resizes Ship Studio&rsquo;s content area so nothing is covered. Drag the dock&rsquo;s
        left edge to change its width. Everything is put back when you unpin.
      </div>
    </Field>
  );
}

/**
 * Copies a layout snapshot for a bug report.
 *
 * Ship Studio has no devtools, so this is the only way to see what the panel is
 * actually doing. It earned its place: it's what identified the host stylesheet
 * forcing `overflow-y: hidden` on the panel body, after two wrong guesses.
 * Tucked into Settings rather than the panel header, where it was clutter.
 */
function CopyDiagnosticsButton() {
  const theme = useTheme();
  const [copied, setCopied] = useState(false);

  return (
    <button
      className="change-btn"
      style={{ background: 'transparent', color: copied ? theme.success : theme.textMuted, border: `1px solid ${theme.border}` }}
      title="Copy a layout snapshot to the clipboard, for reporting a display bug"
      onClick={() => {
        void copyText(collectDiagnostics()).then((ok) => {
          setCopied(ok);
          window.setTimeout(() => setCopied(false), 2000);
        });
      }}
    >
      {copied ? 'Copied' : 'Copy diagnostics'}
    </button>
  );
}

/**
 * ✨ Improve gets its own CLI and model, independent of the send commands.
 *
 * Rewriting a sentence is a small job — there's no reason it has to run on the
 * same (possibly expensive) model you send the actual work to.
 */
function ImproveSettings({
  settings,
  installedClis,
  openCodeModels,
  onChange,
}: {
  settings: Settings;
  installedClis: Record<string, boolean>;
  openCodeModels: string[];
  onChange: (patch: Partial<Settings>) => void;
}) {
  const theme = useTheme();
  const cli = findAgentCli(settings.improveCli);
  const installed = installedClis[cli.id] === true;
  const options = cli.listsModels ? openCodeModels : cli.modelSuggestions;

  return (
    <Field label="✨ Improve">
      <div className="change-radio-row">
        {AGENT_CLIS.map((entry) => {
          const entryInstalled = installedClis[entry.id] === true;
          const active = settings.improveCli === entry.id;
          return (
            <button
              key={entry.id}
              className="change-radio"
              style={{
                background: active ? 'rgba(127, 127, 127, 0.14)' : 'transparent',
                border: `1px solid ${active ? theme.accent : theme.border}`,
                color: entryInstalled ? theme.textSecondary : theme.textMuted,
                opacity: entryInstalled ? 1 : 0.6,
              }}
              disabled={!entryInstalled}
              title={entryInstalled ? undefined : `\`${entry.binary}\` isn't on Ship Studio's PATH`}
              onClick={() =>
                onChange({ improveCli: entry.id, improveModel: entry.defaultImproveModel })
              }
            >
              {entry.label}
            </button>
          );
        })}
      </div>

      <input
        className="change-input change-mono"
        style={{
          background: theme.bgPrimary,
          color: theme.textPrimary,
          border: `1px solid ${theme.border}`,
          marginTop: 9,
        }}
        list="change-improve-models"
        value={settings.improveModel}
        spellCheck={false}
        placeholder={cli.defaultImproveModel}
        onChange={(event) => onChange({ improveModel: event.target.value })}
      />
      <datalist id="change-improve-models">
        {options.map((model) => (
          <option key={model} value={model} />
        ))}
      </datalist>

      <div className="change-settings-note" style={{ color: theme.textMuted, marginTop: 6 }}>
        {installed
          ? `${cli.modelHint} Runs read-only — it can't edit your files.`
          : `\`${cli.binary}\` isn't on Ship Studio's PATH, so Improve is hidden. Templates and hints still work.`}
      </div>
    </Field>
  );
}
