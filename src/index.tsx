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
import { branchExists, createOrSwitchBranch, readBranchPrefix } from './git.ts';
import { itemsToMarkdown } from './markdown.ts';
import {
  branchForItem,
  createItem,
  doingItemsWithBranches,
  emptyStored,
  groupItems,
  moveItem,
  nextSelectableItem,
  readStored,
  removeItem,
  setStatus,
  shouldDeferQuickSend,
  shouldShowBranch,
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
import { loadCustomTags, saveCustomTags, toTemplate, isUsable, type CustomTag } from './customTags.ts';
import { buildClipboardText } from './send.ts';
import { injectStyles, removeStyles } from './styles.ts';
import { ItemEditor } from './ui/editor.tsx';
import { AutoGrowTextarea, IconButton, PanelFrame } from './ui/parts.tsx';
import { ItemRow } from './ui/row.tsx';
import type { SendOptions } from './ui/send-panel.tsx';
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
  /** The keyboard-navigable row, if any. Selecting never steals focus. */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /**
   * Items in `doing` whose work branch no longer exists — detected once, on
   * open, so a merged-and-deleted branch can offer "mark done" instead of
   * rotting in In progress forever.
   */
  const [deadBranchIds, setDeadBranchIds] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const [draft, setDraft] = useState('');
  /** The capture box, so `n` can focus it without stealing anything else. */
  const captureRef = useRef<HTMLDivElement | null>(null);
  /** Briefly set after a send, purely to flash the row it came from. */
  const [justSentId, setJustSentId] = useState<string | null>(null);
  /** Which agent CLIs are on the PATH, e.g. `{ claude: true, opencode: false }`. */
  const [installedClis, setInstalledClis] = useState<Record<string, boolean>>({});
  const [detectedPrefix, setDetectedPrefix] = useState('');
  /**
   * Tags you made yourself. Global rather than per project — a tag set is how
   * you work, not a property of one site — so they load from localStorage
   * synchronously rather than from the project's storage blob.
   */
  const [customTags, setCustomTags] = useState<CustomTag[]>(loadCustomTags);

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

      /**
       * For every item in flight that has a work branch, ask git whether the
       * branch is still there. This is the only time it runs — on open, with
       * the user watching — so "the branch is gone, mark done?" can never
       * happen by surprise. A merged-and-deleted branch is the signal that
       * work finished without the item being told.
       */
      const gone = new Set<string>();
      const checks = doingItemsWithBranches(restored.items).map(async (item) => {
        if (item.workBranch && !(await branchExists(context.shell, item.workBranch))) {
          gone.add(item.id);
        }
      });
      await Promise.all(checks);

      if (cancelled) return;
      setStored(restored);
      setDeadBranchIds(gone);
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

  /** Custom tags persist immediately — there's no debounce worth having here. */
  const updateCustomTags = useCallback((next: CustomTag[]) => {
    setCustomTags(next);
    saveCustomTags(next);
  }, []);

  const patchSettings = useCallback((patch: Partial<Settings>) => {
    setStored((previous) => ({ ...previous, settings: { ...previous.settings, ...patch } }));
  }, []);

  /** Copy the whole list as Markdown — a backlog for a PR, an issue, an agent. */
  const copyListAsMarkdown = useCallback(async () => {
    const copied = await copyText(itemsToMarkdown(storedRef.current.items));
    const context = ctxRef.current;
    context?.actions.showToast(
      copied
        ? 'List copied as Markdown'
        : 'Could not reach the clipboard. Open the list and copy by hand.',
      copied ? 'success' : 'error'
    );
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

        // Flash the row so the copy is acknowledged on screen, not only in a
        // toast that may be looked away from.
        setJustSentId(item.id);
        window.setTimeout(() => setJustSentId((id) => (id === item.id ? null : id)), 700);
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
   * The ▶ button on a row. Sends straight away, unless sending would do
   * something the user hasn't seen — create a branch (the name must be on
   * screen) or run on a different branch than the note belongs to. Both cases
   * open the change instead, where the send options and the warning are.
   */
  const quickSend = useCallback(
    (item: ChangeItem) => {
      const settings = storedRef.current.settings;
      const currentBranch = ctxRef.current?.project?.currentBranch ?? null;
      if (shouldDeferQuickSend(item, currentBranch, settings.createBranch)) {
        setExpandedId(item.id);
        setSelectedId(item.id);
        return;
      }
      void performSend(item, { mode: settings.sendMode, createBranch: false, branchName: '' });
    },
    [performSend]
  );

  /** Move the keyboard selection one row up or down the actionable list. */
  const moveSelection = useCallback((direction: -1 | 1) => {
    setSelectedId((current) => nextSelectableItem(storedRef.current.items, current, direction));
  }, []);

  /** An item that left the actionable rows (done, deleted) stops being selected. */
  useEffect(() => {
    if (!selectedId) return;
    const item = stored.items.find((entry) => entry.id === selectedId);
    if (!item || item.status === 'done') setSelectedId(null);
  }, [stored.items, selectedId]);

  /**
   * The keyboard, when the panel is open and focus isn't in a field.
   *
   *   n         focus the capture box
   *   j / ↓     select the next actionable row
   *   k / ↑     select the previous one
   *   Enter     expand / collapse the selected row
   *   s         send the selected row (through the same gate as ▶)
   *   d         mark the selected row done
   *   Escape    collapse the open row, then close the floating window
   *
   * Typing anywhere in an input keeps the keys: the capture box already adds
   * on Enter, the title box commits on Enter, and a Cmd/Ctrl chord is never
   * hijacked. The one place the panel adds a shortcut of its own is Escape in
   * Settings, which goes back to the list.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;

      if (view === 'settings') {
        if (event.key === 'Escape') {
          event.preventDefault();
          setView('list');
        }
        return;
      }

      const findSelected = () =>
        selectedId ? storedRef.current.items.find((item) => item.id === selectedId) : undefined;

      switch (event.key) {
        case 'Escape': {
          event.preventDefault();
          if (expandedId) setExpandedId(null);
          // The pinned dock is furniture — Escape never closes it.
          else if (getDock().mode === 'window') setDock({ open: false });
          break;
        }
        case 'n':
          event.preventDefault();
          captureRef.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus();
          break;
        case 'j':
        case 'ArrowDown':
          event.preventDefault();
          moveSelection(1);
          requestAnimationFrame(() => {
            document
              .querySelector<HTMLElement>('.change-row-selected')
              ?.scrollIntoView({ block: 'nearest' });
          });
          break;
        case 'k':
        case 'ArrowUp':
          event.preventDefault();
          moveSelection(-1);
          requestAnimationFrame(() => {
            document
              .querySelector<HTMLElement>('.change-row-selected')
              ?.scrollIntoView({ block: 'nearest' });
          });
          break;
        case 'Enter': {
          const item = findSelected();
          if (!item || item.status === 'done') break;
          event.preventDefault();
          const next = expandedId === item.id ? null : item.id;
          setExpandedId(next);
          if (next) {
            // Opening from the keyboard lands the cursor in the title box,
            // ready to edit without another keypress.
            requestAnimationFrame(() => {
              const titleInput = document.querySelector<HTMLTextAreaElement>(
                '.change-row-expanded .change-row-title-input'
              );
              titleInput?.focus();
            });
          }
          break;
        }
        case 's': {
          const item = findSelected();
          if (!item || item.status === 'done') break;
          event.preventDefault();
          quickSend(item);
          break;
        }
        case 'd': {
          const item = findSelected();
          if (!item || item.status === 'done') break;
          event.preventDefault();
          toggleDone(item);
          break;
        }
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expandedId, moveSelection, quickSend, selectedId, toggleDone, view]);

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
  const effectivePrefix = stored.settings.branchPrefix.trim() || detectedPrefix;
  const currentBranch = ctx.project.currentBranch;
  /** ✨ Improve only works if the CLI it's pointed at is actually installed. */
  const improveAvailable = installedClis[stored.settings.improveCli] === true;
  /* Half-finished tags stay out of the chip row until they'd actually do
     something — a nameless tag with no boxes is noise, not a choice. */
  const customTemplates = customTags.filter(isUsable).map(toTemplate);

  /**
   * How to send one item. Built here rather than in `ItemEditor` so the editor
   * needs no knowledge of branches, settings or the send flow — it just draws
   * the section and calls back.
   */
  const sendingFor = (item: ChangeItem) => ({
    settings: stored.settings,
    branchPrefix: effectivePrefix,
    currentBranch: ctx.project?.currentBranch ?? null,
    hasUncommittedChanges: ctx.project?.hasUncommittedChanges ?? false,
    busy: sending,
    onSend: (options: SendOptions) => void performSend(item, options),
  });

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
            className={`change-row${expandedId === item.id ? ' change-row-expanded' : ''}${
              justSentId === item.id ? ' change-row-sent' : ''
            }${item.status === 'doing' ? ' change-row-doing' : ''}${
              selectedId === item.id ? ' change-row-selected' : ''
            }`}
            style={{
              // The item in flight gets a faint blue fill — colour-mix tints the
              // row's own background with the accent, so it follows the theme
              // and stays subtle instead of a saturated bar on the left edge.
              background:
                item.status === 'doing'
                  ? `color-mix(in srgb, ${theme.accent} 10%, ${theme.bgSecondary})`
                  : theme.bgSecondary,
              border: `1px solid ${expandedId === item.id ? theme.accent : theme.border}`,
              // The selection bar reads as "this one is selected" without
              // fighting the accent border that marks the expanded row.
              boxShadow: selectedId === item.id ? `inset 3px 0 0 0 ${theme.accent}` : undefined,
            }}
            onClick={() => setSelectedId(item.id)}
          >
            <ItemRow
              item={item}
              expanded={expandedId === item.id}
              currentBranch={currentBranch}
              onToggleExpand={() => setExpandedId(expandedId === item.id ? null : item.id)}
              onToggleDone={() => toggleDone(item)}
              onTitleChange={(title) => patchItem(item.id, { title })}
              onSend={() => quickSend(item)}
            />
            {expandedId === item.id ? (
              <ItemEditor
                item={item}
                shell={ctx.shell}
                projectName={ctx.project?.name ?? null}
                improveCli={stored.settings.improveCli}
                improveModel={stored.settings.improveModel}
                improveEffort={stored.settings.improveEffort}
                improveAvailable={improveAvailable}
                customTemplates={customTemplates}
                canMoveUp={index > 0}
                canMoveDown={index < items.length - 1}
                sending={sendingFor(item)}
                branchGone={deadBranchIds.has(item.id)}
                onChange={(patch) => patchItem(item.id, patch)}
                onMove={(direction) => setItems((current) => moveItem(current, item.id, direction))}
                onDelete={() => {
                  setItems((current) => removeItem(current, item.id));
                  setExpandedId(null);
                }}
                onMarkDone={() => toggleDone(item)}
              />
            ) : null}
          </div>
        ))}
      </div>
    );

  const settingsView = view === 'settings';

  /*
   * One PanelFrame for every view, with only its contents swapping.
   *
   * Settings used to `return` its own PanelFrame from an early branch while the
   * list returned a Fragment. Those are different root types, so React tore the
   * whole frame down and built a new one on each switch — the `.change-frame`
   * node was destroyed and recreated, landing at a different position among its
   * siblings in Ship Studio's header. Any positional host CSS (`:last-child`,
   * `nth-child`, `div + div`) then started matching it, which is why the layout
   * only collapsed *after* a trip through Settings. Keeping one frame also
   * keeps the scroll position and avoids re-running the pin/reflow effects.
   */
  return (
    <>
      <PanelFrame
        title={
          settingsView ? (
            'Settings'
          ) : (
            <>
              Change List
              {openCount > 0 ? (
                <span style={{ color: theme.textMuted, fontWeight: 400 }}> · {openCount} open</span>
              ) : null}
            </>
          )
        }
        onClose={onClose}
        headerExtra={
          settingsView ? (
            <IconButton label="Back to the list" onClick={() => setView('list')}>
              ← Back
            </IconButton>
          ) : (
            <>
              <IconButton label="Copy the list as Markdown" onClick={() => void copyListAsMarkdown()}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="11" height="11" rx="1.5" />
                  <path d="M5 15V5a1.5 1.5 0 0 1 1.5-1.5H15" strokeLinecap="round" />
                </svg>
              </IconButton>
              <IconButton label="Settings" onClick={() => setView('settings')}>
                ⚙
              </IconButton>
            </>
          )
        }
      >
        {settingsView ? (
          <SettingsView
            settings={stored.settings}
            detectedPrefix={detectedPrefix}
            installedClis={installedClis}
            shell={ctx.shell}
            customTags={customTags}
            onCustomTagsChange={updateCustomTags}
            onChange={patchSettings}
          />
        ) : (
        <>
        <div className="change-capture" ref={captureRef}>
          <AutoGrowTextarea
            className="change-input change-field-grow"
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
              // Enter adds the change, as with the old single-line box.
              // Shift+Enter inserts a line break instead.
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                addFromDraft();
              }
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
                      onTitleChange={(title) => patchItem(item.id, { title })}
                      onSend={() => quickSend(item)}
                    />
                  </div>
                ))
              : null}
          </div>
        ) : null}
        </>
        )}
      </PanelFrame>
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
