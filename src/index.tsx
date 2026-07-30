/**
 * Change List — a Ship Studio plugin.
 *
 * A per-project list of changes you want made, each with a prompt, that hands
 * them to your AI agent one at a time. Written down here instead of in a notes
 * app, so the list lives next to the site it belongs to.
 *
 * This file is the state container: it owns the list, saves it, and wires the
 * pieces in `ui/` together. The interesting logic lives in the small modules
 * beside it — `model.ts`, `send.ts`, `lint.ts`, `ai.ts` — all of which are pure
 * enough to unit-test without the app running.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AGENT_CLIS } from './agents.ts';
import { copyText } from './clipboard.ts';
import { commandExists } from './cli.ts';
import { usePluginContext, useTheme } from './context.ts';
import { createOrSwitchBranch, readBranchPrefix } from './git.ts';
import {
  createItem,
  emptyStored,
  groupItems,
  moveItem,
  nextDifficulty,
  readStored,
  removeItem,
  setStatus,
  updateItem,
  type ChangeItem,
  type Settings,
  type Stored,
} from './model.ts';
import {
  getDock,
  getEffectiveDockWidth,
  setDock,
  useDock,
  useIsWindowHost,
  type HostName,
} from './dock.ts';
import { applyHostLayout, isSelfDispatchedResize, restoreHostLayout } from './hostLayout.ts';
import { buildClipboardText } from './send.ts';
import { injectStyles, removeStyles } from './styles.ts';
import { ItemEditor } from './ui/editor.tsx';
import { IconButton, Modal, PanelFrame } from './ui/parts.tsx';
import { ItemRow } from './ui/row.tsx';
import { SendPanel, type SendOptions } from './ui/send-panel.tsx';
import { SettingsView } from './ui/settings.tsx';

/** How long after the last keystroke the list is written to disk. */
const SAVE_DEBOUNCE_MS = 400;

function Icon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6l2 2 3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 15l2 2 3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 6.5h8M13 15.5h8" strokeLinecap="round" />
    </svg>
  );
}

function Panel({ onClose }: { onClose: () => void }) {
  const ctx = usePluginContext();
  const theme = useTheme();

  /**
   * Ship Studio rebuilds the context object several times a second, so `ctx`
   * must never be an effect dependency — an effect keyed on it would re-run
   * constantly and overwrite whatever you're typing. The newest context lives
   * in this ref, and effects and callbacks read it from there.
   */
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  const [stored, setStored] = useState<Stored>(emptyStored);
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<'list' | 'settings'>('list');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sendId, setSendId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const [draft, setDraft] = useState('');
  /** Which agent CLIs are on the PATH, e.g. `{ claude: true, opencode: false }`. */
  const [installedClis, setInstalledClis] = useState<Record<string, boolean>>({});
  const [detectedPrefix, setDetectedPrefix] = useState('');

  const storedRef = useRef(stored);
  storedRef.current = stored;

  // ------------------------------------------------------------ persistence

  /**
   * Hydrate once per open. The modal unmounts when it closes, so React state is
   * not memory — everything you'd be annoyed to lose is read back here, and
   * only here. Reading again later would fight whatever is in the editor.
   */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const context = ctxRef.current;
      if (!context?.project) {
        setHydrated(true);
        return;
      }
      const raw = await context.storage.read().catch(() => ({}));
      const prefix = await readBranchPrefix(context);

      // One `command -v` per known CLI, so Settings can grey out what isn't
      // installed and ✨ Improve can hide when its chosen CLI is missing.
      const found: Record<string, boolean> = {};
      for (const cli of AGENT_CLIS) {
        found[cli.id] = await commandExists(context.shell, cli.binary);
      }

      if (cancelled) return;
      const restored = readStored(raw);

      /**
       * First run on a machine with only OpenCode: adopt its preset instead of
       * defaulting to a `claude` binary that isn't there. Gated on there being
       * no stored settings at all, so it can never overwrite a real choice —
       * someone who deliberately points at a CLI they haven't installed yet
       * keeps that setting.
       */
      const isFirstRun = !(raw as { settings?: unknown }).settings;
      const openCodeCli = AGENT_CLIS.find((cli) => cli.id === 'opencode');
      if (isFirstRun && openCodeCli && found.opencode && !found.claude) {
        restored.settings.commands = { ...openCodeCli.defaultCommands };
        restored.settings.improveCli = 'opencode';
        restored.settings.improveModel = openCodeCli.defaultImproveModel;
      }

      setStored(restored);
      setDetectedPrefix(prefix);
      setInstalledClis(found);
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** True when there are changes not yet written to disk. */
  const dirtyRef = useRef(false);

  const persist = useCallback(async () => {
    const context = ctxRef.current;
    if (!context?.project || !dirtyRef.current) return;
    dirtyRef.current = false;
    try {
      await context.storage.write(storedRef.current as unknown as Record<string, unknown>);
    } catch {
      // Leave it dirty so the next save — including the one on close — retries.
      dirtyRef.current = true;
    }
  }, []);

  // Debounced save. Typing a prompt shouldn't mean a disk write per keystroke.
  useEffect(() => {
    if (!hydrated) return;
    dirtyRef.current = true;
    const timer = window.setTimeout(() => void persist(), SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [stored, hydrated, persist]);

  /**
   * Flush on close. Without this, closing the modal within the debounce window
   * would silently drop the last thing you typed — exactly the kind of bug
   * you'd never think to look for.
   */
  useEffect(() => () => void persist(), [persist]);

  // ---------------------------------------------------------------- actions

  const setItems = useCallback((update: (items: ChangeItem[]) => ChangeItem[]) => {
    setStored((previous) => ({ ...previous, items: update(previous.items) }));
  }, []);

  const patchSettings = useCallback((patch: Partial<Settings>) => {
    setStored((previous) => ({ ...previous, settings: { ...previous.settings, ...patch } }));
  }, []);

  const addFromDraft = useCallback(() => {
    const title = draft.trim();
    if (!title) return;
    const item = createItem(title, ctxRef.current?.project?.currentBranch ?? null);
    setItems((items) => [...items, item]);
    setDraft('');
  }, [draft, setItems]);

  const patchItem = useCallback(
    (id: string, patch: Partial<ChangeItem>) => setItems((items) => updateItem(items, id, patch)),
    [setItems]
  );

  const toggleDone = useCallback(
    (item: ChangeItem) =>
      setItems((items) => setStatus(items, item.id, item.status === 'done' ? 'todo' : 'done')),
    [setItems]
  );

  /**
   * The handoff: optionally branch, copy, focus the terminal, mark as doing.
   *
   * Order matters. The branch comes first because it's the step that can fail,
   * and the item is only marked "doing" if the prompt actually reached the
   * clipboard — an item shown as sent whose prompt never got copied is the
   * worst outcome this plugin has.
   */
  const performSend = useCallback(
    async (item: ChangeItem, options: SendOptions) => {
      const context = ctxRef.current;
      if (!context?.project) return;

      setSending(true);
      try {
        let workBranch = item.workBranch;

        if (options.createBranch) {
          const outcome = await createOrSwitchBranch(context.shell, options.branchName);
          if (!outcome.ok) {
            context.actions.showToast(outcome.message, 'error');
            return;
          }
          workBranch = outcome.name;
          context.actions.refreshGitStatus();
          context.actions.refreshBranches();
        }

        const text = buildClipboardText(item, storedRef.current.settings, options.mode);
        const copied = await copyText(text);
        if (!copied) {
          context.actions.showToast(
            'Could not reach the clipboard. Open the send options and copy the command by hand.',
            'error'
          );
          return;
        }

        context.actions.focusTerminal();
        setItems((items) => updateItem(setStatus(items, item.id, 'doing'), item.id, { workBranch }));
        setSendId(null);
        // Name the destination. "Paste it in the terminal" was too vague: the
        // launch command only works at a shell prompt, and pasting it into a
        // running agent silently turns it into a chat message.
        const where =
          options.mode === 'launch'
            ? 'paste at a shell prompt in a terminal tab'
            : 'paste into the running agent';
        context.actions.showToast(
          options.createBranch && workBranch
            ? `On ${workBranch} — copied, ${where}`
            : `Copied — ${where}`,
          'success'
        );
      } finally {
        setSending(false);
      }
    },
    [setItems]
  );

  /**
   * The ▶ button. Sends straight away, unless a branch would be created — a
   * git command should never run without you seeing the name it will use.
   */
  const quickSend = useCallback(
    (item: ChangeItem) => {
      const settings = storedRef.current.settings;
      if (settings.createBranch) {
        setSendId(item.id);
        return;
      }
      void performSend(item, { mode: settings.sendMode, createBranch: false, branchName: '' });
    },
    [performSend]
  );

  // -------------------------------------------------------------- rendering

  // `useProject()` is null on the dashboard, and so is everything below it.
  if (!ctx?.project) {
    return (
      <PanelFrame title="Change List" onClose={onClose}>
        <div className="change-empty" style={{ color: theme.textMuted }}>
          Open a project first.
          <br />
          Each project keeps its own list of changes.
        </div>
      </PanelFrame>
    );
  }

  const groups = groupItems(stored.items);
  const openCount = groups.todo.length + groups.doing.length;
  const sendItem = sendId ? (stored.items.find((item) => item.id === sendId) ?? null) : null;
  const effectivePrefix = stored.settings.branchPrefix.trim() || detectedPrefix;
  const currentBranch = ctx.project.currentBranch;
  /** ✨ Improve only works if the CLI it's pointed at is actually installed. */
  const improveAvailable = installedClis[stored.settings.improveCli] === true;

  if (view === 'settings') {
    return (
      <PanelFrame
        title="Settings"
        onClose={onClose}
        headerExtra={
          <IconButton label="Back to the list" onClick={() => setView('list')}>
            ← Back
          </IconButton>
        }
      >
        <SettingsView
          settings={stored.settings}
          detectedPrefix={detectedPrefix}
          installedClis={installedClis}
          shell={ctx.shell}
          onChange={patchSettings}
        />
      </PanelFrame>
    );
  }

  /** One group of rows, each expanding into its editor in place. */
  const renderGroup = (label: string, items: ChangeItem[]) =>
    items.length === 0 ? null : (
      <div className="change-group" key={label}>
        <div className="change-group-label" style={{ color: theme.textMuted }}>
          {label}
        </div>
        {items.map((item, index) => (
          <div
            key={item.id}
            className="change-row"
            style={{
              background: theme.bgSecondary,
              border: `1px solid ${expandedId === item.id ? theme.accent : theme.border}`,
            }}
          >
            <ItemRow
              item={item}
              expanded={expandedId === item.id}
              currentBranch={currentBranch}
              onToggleExpand={() => setExpandedId(expandedId === item.id ? null : item.id)}
              onToggleDone={() => toggleDone(item)}
              onCycleDifficulty={() =>
                patchItem(item.id, { difficulty: nextDifficulty(item.difficulty) })
              }
              onSend={() => quickSend(item)}
              onOptions={() => setSendId(item.id)}
            />
            {expandedId === item.id ? (
              <ItemEditor
                item={item}
                shell={ctx.shell}
                projectName={ctx.project?.name ?? null}
                improveCli={stored.settings.improveCli}
                improveModel={stored.settings.improveModel}
                improveAvailable={improveAvailable}
                canMoveUp={index > 0}
                canMoveDown={index < items.length - 1}
                onChange={(patch) => patchItem(item.id, patch)}
                onMove={(direction) => setItems((current) => moveItem(current, item.id, direction))}
                onDelete={() => {
                  setItems((current) => removeItem(current, item.id));
                  setExpandedId(null);
                }}
              />
            ) : null}
          </div>
        ))}
      </div>
    );

  return (
    <>
      <PanelFrame
        title={
          <>
            Change List
            {openCount > 0 ? (
              <span style={{ color: theme.textMuted, fontWeight: 400 }}> · {openCount} open</span>
            ) : null}
          </>
        }
        onClose={onClose}
        headerExtra={
          <IconButton label="Settings" onClick={() => setView('settings')}>
            ⚙
          </IconButton>
        }
      >
        <div className="change-capture">
          <input
            className="change-input"
            style={{
              background: theme.bgSecondary,
              color: theme.textPrimary,
              border: `1px solid ${theme.border}`,
            }}
            value={draft}
            placeholder="Something to change…"
            spellCheck={false}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') addFromDraft();
            }}
          />
          <button
            className="change-btn"
            style={{ background: theme.action, color: theme.actionText }}
            disabled={!draft.trim()}
            onClick={addFromDraft}
          >
            Add
          </button>
        </div>
        <div className="change-capture-hint" style={{ color: theme.textMuted }}>
          Jot the title now, press Enter, write the prompt later.
        </div>

        {!hydrated ? (
          <div className="change-empty" style={{ color: theme.textMuted }}>
            Loading…
          </div>
        ) : stored.items.length === 0 ? (
          <div className="change-empty" style={{ color: theme.textMuted }}>
            Nothing on the list yet.
            <br />
            Add changes as you notice them, then send them to your agent one at a time.
          </div>
        ) : null}

        {renderGroup('In progress', groups.doing)}
        {renderGroup('To do', groups.todo)}

        {groups.done.length > 0 ? (
          <div className="change-group">
            <button
              className="change-fold"
              style={{ color: theme.textMuted }}
              onClick={() => setDoneOpen(!doneOpen)}
            >
              {doneOpen ? '▾' : '▸'} Done ({groups.done.length})
            </button>
            {doneOpen
              ? groups.done.map((item) => (
                  <div
                    key={item.id}
                    className="change-row"
                    style={{ background: theme.bgSecondary, border: `1px solid ${theme.border}` }}
                  >
                    <ItemRow
                      item={item}
                      expanded={false}
                      currentBranch={currentBranch}
                      onToggleExpand={() => setExpandedId(expandedId === item.id ? null : item.id)}
                      onToggleDone={() => toggleDone(item)}
                      onCycleDifficulty={() => {}}
                      onSend={() => quickSend(item)}
                      onOptions={() => setSendId(item.id)}
                    />
                  </div>
                ))
              : null}
          </div>
        ) : null}
      </PanelFrame>

      {sendItem ? (
        <SendPanel
          item={sendItem}
          settings={stored.settings}
          branchPrefix={effectivePrefix}
          hasUncommittedChanges={ctx.project.hasUncommittedChanges}
          busy={sending}
          onSend={(options) => void performSend(sendItem, options)}
          onClose={() => setSendId(null)}
        />
      ) : null}
    </>
  );
}

/**
 * The button in the Plugins dropdown. It only toggles shared state — it does
 * not draw the panel.
 *
 * That separation is the whole trick: this component unmounts as soon as the
 * dropdown closes, so anything it rendered would go with it. The panel is drawn
 * by `WindowHost` from a slot that stays mounted.
 */
function ToolbarButton() {
  const dock = useDock();
  return (
    <>
      <button
        className="toolbar-icon-btn"
        title={dock.open ? 'Hide the change list' : 'Show the change list'}
        aria-pressed={dock.open}
        onClick={() => setDock({ open: !getDock().open })}
      >
        <Icon />
      </button>
      {/* Fallback host. Draws nothing while the `publish` slot is mounted and
          winning; it exists so the panel still opens on a Ship Studio build
          where `publish` isn't there — degraded (it closes with the dropdown)
          rather than a button that does nothing. */}
      <ToolbarWindowHost />
    </>
  );
}

/**
 * Draws the panel, if this slot is the one that should.
 *
 * Rendered from both slots; `useIsWindowHost` picks a single winner so the panel
 * can never appear twice. `publish` wins when it's available because it stays
 * mounted for the life of the workspace, which is what makes pinning work.
 */
function makeWindowHost(host: HostName) {
  return function WindowHost() {
    const dock = useDock();
    const isHost = useIsWindowHost(host);
    const shouldReflow = isHost && dock.open && dock.mode === 'pinned';

    /**
     * Make room in Ship Studio's layout while pinned, and give it back the
     * moment we aren't.
     *
     * Keyed on plain primitives — never on the plugin context, which is rebuilt
     * several times a second and would re-run this DOM surgery constantly.
     */
    useEffect(() => {
      if (!shouldReflow) {
        restoreHostLayout();
        return;
      }

      applyHostLayout(getEffectiveDockWidth());

      // The content area moves when the window resizes, so re-measure — but
      // debounced, because resize fires continuously while dragging. Re-reading
      // the effective width matters here: a narrower window caps the dock so it
      // can't squeeze the app to nothing.
      let timer = 0;
      const onResize = () => {
        // Ignore the resize events hostLayout fires itself, or applying the
        // layout would schedule another apply and "Undo" would never stick.
        if (isSelfDispatchedResize()) return;
        window.clearTimeout(timer);
        timer = window.setTimeout(() => applyHostLayout(getEffectiveDockWidth()), 120);
      };
      window.addEventListener('resize', onResize);

      return () => {
        window.clearTimeout(timer);
        window.removeEventListener('resize', onResize);
        restoreHostLayout();
      };
    }, [shouldReflow, dock.dockWidth]);

    return (
      <>
        {/*
          A zero-size marker that stays in the workspace header. `hostLayout`
          measures from it instead of hardcoding selectors, so a Ship Studio
          redesign degrades to the overlay fallback rather than breaking.
        */}
        {isHost ? <span data-changelist-anchor style={{ display: 'inline-block', width: 0, height: 0 }} /> : null}
        {isHost && dock.open ? <Panel onClose={() => setDock({ open: false })} /> : null}
      </>
    );
  };
}

const ToolbarWindowHost = makeWindowHost('toolbar');
const PublishWindowHost = makeWindowHost('publish');

export const name = 'Change List';
export const slots = {
  toolbar: ToolbarButton,
  publish: PublishWindowHost,
};

export function onActivate() {
  injectStyles();
}

export function onDeactivate() {
  // Give Ship Studio its layout back before we go. Disabling or uninstalling the
  // plugin must never leave the app squashed with no way to undo it.
  restoreHostLayout();
  removeStyles();
}
