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
  readEffortFromCommand,
  readModelFromCommand,
  withEffort,
  withModel,
  type AgentCli,
} from '../agents.ts';
import {
  describeModel,
  parseClaudeCapabilities,
  parseOpenCodeCatalogue,
  type CatalogueModel,
  type ClaudeCapabilities,
} from '../catalogue.ts';
import { copyText } from '../clipboard.ts';
import {
  createCustomTag,
  createField,
  isUsable,
  type CustomTag,
} from '../customTags.ts';
import { useTheme } from '../context.ts';
import { collectDiagnostics } from '../diagnostics.ts';
import { useDock } from '../dock.ts';
import { applyHostLayout, getLayoutReport, restoreHostLayout, subscribeLayout } from '../hostLayout.ts';
import { DIFFICULTY_LABELS, type Difficulty, type Settings } from '../model.ts';
import type { TemplateField } from '../templates.ts';
import type { Shell } from '../types.ts';
import { Field, IconButton } from './parts.tsx';
import { difficultyColor } from './row.tsx';

const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

/** The binary a command template invokes — its first word. */
function binaryOf(command: string): string {
  return command.trim().split(/\s+/)[0] ?? '';
}

interface ModelChoice {
  value: string;
  label: string;
  /** Provider, used to group the dropdown. Null when there's nothing to group by. */
  group: string | null;
  /** Effort levels this model accepts, when the CLI reports them per model. */
  variants: string[];
}

/**
 * The model and effort pickers for one command.
 *
 * Native `<select>` deliberately: its popup is drawn by the OS *outside* the
 * panel, so a 260px dock can still show a 25-item list without clipping it, and
 * keyboard and screen-reader behaviour come for free.
 *
 * Both dropdowns edit only their own flag inside the command template — the raw
 * template stays the source of truth, and stays editable underneath.
 */
function CommandPickers({
  command,
  models,
  selectedModel,
  effortFlag,
  effortLevels,
  effortApplies,
  effortNote,
  onChange,
}: {
  command: string;
  models: ModelChoice[];
  selectedModel: string | null;
  effortFlag: string | null;
  effortLevels: string[];
  effortApplies: boolean;
  effortNote: string | null;
  onChange: (command: string) => void;
}) {
  const theme = useTheme();

  const selectStyle = {
    background: theme.bgPrimary,
    color: theme.textPrimary,
    border: `1px solid ${theme.border}`,
  };

  const groups = [...new Set(models.map((m) => m.group).filter(Boolean))] as string[];
  const currentEffort = effortFlag ? readEffortFromCommand(command, effortFlag) : null;

  return (
    <div className="change-picker-row">
      {models.length > 0 ? (
        <select
          className="change-select"
          style={selectStyle}
          value={selectedModel ?? ''}
          title="Model"
          onChange={(event) => onChange(withModel(command, event.target.value))}
        >
          {/* Shown only when the command names a model we don't recognise, so
              a hand-typed id isn't silently replaced by the first option. */}
          {selectedModel && !models.some((m) => m.value === selectedModel) ? (
            <option value={selectedModel}>{selectedModel} (not in list)</option>
          ) : null}
          {!selectedModel ? <option value="">Default model</option> : null}

          {groups.length > 0
            ? groups.map((group) => (
                <optgroup key={group} label={group}>
                  {models
                    .filter((m) => m.group === group)
                    .map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                </optgroup>
              ))
            : models.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
        </select>
      ) : null}

      {effortFlag && effortLevels.length > 0 ? (
        <select
          className="change-select change-select-effort"
          style={{ ...selectStyle, opacity: effortApplies ? 1 : 0.5 }}
          value={currentEffort ?? ''}
          disabled={!effortApplies}
          title={effortApplies ? 'Reasoning effort' : (effortNote ?? 'Not available here')}
          onChange={(event) => onChange(withEffort(command, effortFlag, event.target.value))}
        >
          <option value="">Default effort</option>
          {effortLevels.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
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
  customTags,
  onCustomTagsChange,
  onChange,
}: {
  settings: Settings;
  /** Ship Studio's own branch-prefix preference, used when ours is blank. */
  detectedPrefix: string;
  /** Which agent CLIs are on the PATH, by id. */
  installedClis: Record<string, boolean>;
  shell: Shell | null;
  /** Tags you made yourself, stored globally rather than per project. */
  customTags: CustomTag[];
  onCustomTagsChange: (tags: CustomTag[]) => void;
  onChange: (patch: Partial<Settings>) => void;
}) {
  const theme = useTheme();

  /** OpenCode's full catalogue, so the picker can show real names and variants. */
  const [openCodeModels, setOpenCodeModels] = useState<CatalogueModel[]>([]);
  /** Claude's effort levels and aliases, read from its own --help. */
  const [claudeCaps, setClaudeCaps] = useState<ClaudeCapabilities>(() =>
    parseClaudeCapabilities('')
  );
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
  const hasClaude = installedClis.claude === true;

  /**
   * Ask each installed CLI what it can do, once when Settings opens.
   *
   * Both commands are local and fast (`opencode models --verbose` is ~0.5s off
   * a local cache), so there's no need to persist the result — and asking every
   * time means a CLI update shows up immediately rather than being remembered
   * wrongly.
   */
  useEffect(() => {
    if (!hasOpenCode) return;
    let cancelled = false;
    void (async () => {
      const current = shellRef.current;
      if (!current) return;
      const result = await current
        .exec('opencode', ['models', '--verbose'], { timeout: 30 })
        .catch(() => null);
      if (cancelled || !result || result.exit_code !== 0) return;
      setOpenCodeModels(parseOpenCodeCatalogue(result.stdout));
    })();
    return () => {
      cancelled = true;
    };
  }, [hasOpenCode]);

  useEffect(() => {
    if (!hasClaude) return;
    let cancelled = false;
    void (async () => {
      const current = shellRef.current;
      if (!current) return;
      const result = await current.exec('claude', ['--help'], { timeout: 20 }).catch(() => null);
      if (cancelled || !result) return;
      // Claude has no model-listing command, so its own help text is the only
      // live source for the effort enum and the model aliases.
      setClaudeCaps(parseClaudeCapabilities(result.stdout || result.stderr));
    })();
    return () => {
      cancelled = true;
    };
  }, [hasClaude]);

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

  /**
   * Everything the pickers need for one command line, derived from the command
   * itself rather than a setting — the templates are free text and can mix
   * tools per difficulty, so the first word is the only reliable source.
   */
  const pickersFor = (command: string, headless: boolean) => {
    const binary = binaryOf(command);
    const cli = AGENT_CLIS.find((entry) => entry.binary === binary) ?? null;
    const selectedModel = readModelFromCommand(command);

    const models: ModelChoice[] =
      binary === 'opencode'
        ? openCodeModels.map((model) => ({
            value: model.id,
            label: describeModel(model),
            group: model.provider,
            variants: model.variants,
          }))
        : binary === 'claude'
          ? claudeCaps.aliases.map((alias) => ({ value: alias, label: alias, group: null, variants: [] }))
          : [];

    // Effort levels: fixed per CLI for Claude, per-model for OpenCode.
    let effortLevels: string[] = [];
    if (cli?.effort.supported) {
      effortLevels =
        cli.effort.levels === 'per-model'
          ? (models.find((m) => m.value === selectedModel)?.variants ?? [])
          : claudeCaps.effortLevels;
    }

    // A control that can't take effect is worse than no control — see the
    // model-that-wouldn't-change bug. OpenCode's flag is headless-only.
    const effortApplies =
      cli?.effort.supported === true && (cli.effort.scope === 'always' || headless);

    return {
      cli,
      models,
      selectedModel,
      effortFlag: cli?.effort.supported ? cli.effort.flag : null,
      effortLevels,
      effortApplies,
      effortNote: cli?.effort.supported ? cli.effort.how : null,
    };
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
            // Sends launch an interactive session, so headless-only effort
            // flags don't apply here.
            const pickers = pickersFor(command, false);

            return (
              <div key={difficulty} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div className="change-settings-row">
                  <span
                    className="change-settings-key"
                    style={{ color: difficultyColor(difficulty, theme) }}
                  >
                    {DIFFICULTY_LABELS[difficulty]}
                  </span>

                  <CommandPickers
                    command={command}
                    models={pickers.models}
                    selectedModel={pickers.selectedModel}
                    effortFlag={pickers.effortFlag}
                    effortLevels={pickers.effortLevels}
                    effortApplies={pickers.effortApplies}
                    effortNote={pickers.effortNote}
                    onChange={(next) =>
                      onChange({ commands: { ...settings.commands, [difficulty]: next } })
                    }
                  />
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
        claudeCaps={claudeCaps}
        onChange={onChange}
      />

      <CustomTagsSettings tags={customTags} onChange={onCustomTagsChange} />

      <LayoutDiagnostics />
    </div>
  );
}

/**
 * Make your own tags.
 *
 * A tag is only ever a name plus a few labelled boxes, so this editor is only
 * ever a name field plus a list of box rows. No modes, no separate save step —
 * typing is the edit, and it's stored as you go.
 */
function CustomTagsSettings({
  tags,
  onChange,
}: {
  tags: CustomTag[];
  onChange: (tags: CustomTag[]) => void;
}) {
  const theme = useTheme();
  const [openId, setOpenId] = useState<string | null>(null);

  const inputStyle = {
    background: theme.bgPrimary,
    color: theme.textPrimary,
    border: `1px solid ${theme.border}`,
  };

  const patchTag = (id: string, patch: Partial<CustomTag>) =>
    onChange(tags.map((tag) => (tag.id === id ? { ...tag, ...patch } : tag)));

  const patchField = (tagId: string, fieldId: string, patch: Partial<TemplateField>) =>
    onChange(
      tags.map((tag) =>
        tag.id === tagId
          ? {
              ...tag,
              fields: tag.fields.map((field) =>
                field.id === fieldId ? { ...field, ...patch } : field
              ),
            }
          : tag
      )
    );

  const addTag = () => {
    const tag = createCustomTag();
    onChange([...tags, tag]);
    setOpenId(tag.id); // open it straight away — you made it to fill it in
  };

  return (
    <Field label="Your own tags">
      {tags.length === 0 ? (
        <div className="change-settings-note" style={{ color: theme.textMuted, marginBottom: 8 }}>
          A tag is a name and a few boxes to fill in. Make one for work you do
          often — an SEO pass, a client review — and it appears beside Style,
          Text and the rest.
        </div>
      ) : null}

      <div className="change-tag-list">
        {tags.map((tag) => {
          const open = openId === tag.id;
          return (
            <div
              key={tag.id}
              className="change-tag-card"
              style={{ borderColor: open ? theme.accent : theme.border }}
            >
              <div className="change-tag-head">
                <input
                  className="change-input"
                  style={inputStyle}
                  value={tag.label}
                  placeholder="Tag name, e.g. SEO"
                  spellCheck={false}
                  onChange={(event) => patchTag(tag.id, { label: event.target.value })}
                />
                <button
                  className="change-btn"
                  style={{
                    background: 'transparent',
                    color: theme.textMuted,
                    border: `1px solid ${theme.border}`,
                  }}
                  title={open ? 'Hide the boxes' : 'Edit the boxes'}
                  onClick={() => setOpenId(open ? null : tag.id)}
                >
                  {open ? 'Done' : `${tag.fields.length} boxes`}
                </button>
                <IconButton
                  label={`Delete the ${tag.label || 'untitled'} tag`}
                  danger
                  onClick={() => onChange(tags.filter((entry) => entry.id !== tag.id))}
                >
                  ✕
                </IconButton>
              </div>

              {open ? (
                <div className="change-tag-boxes">
                  <div className="change-settings-note" style={{ color: theme.textMuted }}>
                    Each box becomes a line in the prompt, as{' '}
                    <code>Name: what you typed</code>. The example is only a hint
                    shown inside the empty box.
                  </div>

                  {tag.fields.map((field) => (
                    <div className="change-tag-box-row" key={field.id}>
                      <input
                        className="change-input"
                        style={inputStyle}
                        value={field.label}
                        placeholder="Box name, e.g. Where"
                        spellCheck={false}
                        onChange={(event) =>
                          patchField(tag.id, field.id, { label: event.target.value })
                        }
                      />
                      <input
                        className="change-input"
                        style={inputStyle}
                        value={field.placeholder}
                        placeholder="Example (optional)"
                        spellCheck={false}
                        onChange={(event) =>
                          patchField(tag.id, field.id, { placeholder: event.target.value })
                        }
                      />
                      <IconButton
                        label="Remove this box"
                        onClick={() =>
                          patchTag(tag.id, {
                            fields: tag.fields.filter((entry) => entry.id !== field.id),
                          })
                        }
                      >
                        ✕
                      </IconButton>
                    </div>
                  ))}

                  <button
                    className="change-btn"
                    style={{
                      background: 'transparent',
                      color: theme.accent,
                      border: `1px dashed ${theme.border}`,
                    }}
                    onClick={() => patchTag(tag.id, { fields: [...tag.fields, createField()] })}
                  >
                    + Add box
                  </button>

                  {!isUsable(tag) ? (
                    <div className="change-settings-note" style={{ color: 'var(--warning, #f59e0b)' }}>
                      Give the tag a name and at least one named box, and it will
                      show up when you open a change.
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <button
        className="change-btn"
        style={{ background: theme.action, color: theme.actionText, marginTop: 8 }}
        onClick={addTag}
      >
        + New tag
      </button>

      <div className="change-settings-note" style={{ color: theme.textMuted, marginTop: 8 }}>
        Your tags follow you to every project, since they describe how you work
        rather than one site.
      </div>
    </Field>
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
  claudeCaps,
  onChange,
}: {
  settings: Settings;
  installedClis: Record<string, boolean>;
  openCodeModels: CatalogueModel[];
  claudeCaps: ClaudeCapabilities;
  onChange: (patch: Partial<Settings>) => void;
}) {
  const theme = useTheme();
  const cli = findAgentCli(settings.improveCli);
  const installed = installedClis[cli.id] === true;

  const models: ModelChoice[] = cli.listsModels
    ? openCodeModels.map((model) => ({
        value: model.id,
        label: describeModel(model),
        group: model.provider,
        variants: model.variants,
      }))
    : claudeCaps.aliases.map((alias) => ({ value: alias, label: alias, group: null, variants: [] }));

  /*
   * Improve is headless, so this is the one place OpenCode's effort flag
   * genuinely applies — hence `true` for the headless argument. Levels come
   * from the chosen model for OpenCode, and from Claude's own --help for Claude.
   */
  const effortLevels = cli.effort.supported
    ? cli.effort.levels === 'per-model'
      ? (models.find((m) => m.value === settings.improveModel)?.variants ?? [])
      : claudeCaps.effortLevels
    : [];

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
                // Effort is reset with the CLI: the levels are CLI-specific, so
                // carrying "xhigh" over to OpenCode would be an invalid value.
                onChange({
                  improveCli: entry.id,
                  improveModel: entry.defaultImproveModel,
                  improveEffort: '',
                })
              }
            >
              {entry.label}
            </button>
          );
        })}
      </div>

      <div className="change-picker-row" style={{ marginTop: 9 }}>
        <select
          className="change-select"
          style={{
            background: theme.bgPrimary,
            color: theme.textPrimary,
            border: `1px solid ${theme.border}`,
          }}
          value={settings.improveModel}
          title="Model"
          onChange={(event) => onChange({ improveModel: event.target.value, improveEffort: '' })}
        >
          {!models.some((m) => m.value === settings.improveModel) ? (
            <option value={settings.improveModel}>
              {settings.improveModel || 'Default'} (not in list)
            </option>
          ) : null}
          {[...new Set(models.map((m) => m.group).filter(Boolean))].length > 0
            ? ([...new Set(models.map((m) => m.group).filter(Boolean))] as string[]).map((group) => (
                <optgroup key={group} label={group}>
                  {models
                    .filter((m) => m.group === group)
                    .map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                </optgroup>
              ))
            : models.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
        </select>

        {effortLevels.length > 0 ? (
          <select
            className="change-select change-select-effort"
            style={{
              background: theme.bgPrimary,
              color: theme.textPrimary,
              border: `1px solid ${theme.border}`,
            }}
            value={settings.improveEffort}
            title="Reasoning effort"
            onChange={(event) => onChange({ improveEffort: event.target.value })}
          >
            <option value="">Default effort</option>
            {effortLevels.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      <div className="change-settings-note" style={{ color: theme.textMuted, marginTop: 6 }}>
        {installed
          ? `${cli.modelHint} Runs read-only — it can't edit your files.`
          : `\`${cli.binary}\` isn't on Ship Studio's PATH, so Improve is hidden. Templates and hints still work.`}
      </div>
    </Field>
  );
}
