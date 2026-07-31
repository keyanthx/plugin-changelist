/**
 * The expanded editor for one change.
 *
 * This is where the three layers of prompt help live: a template picker that
 * prefills the questions worth answering, live nudges under the box, and the
 * ✨ Improve button that hands the note to the `claude` CLI.
 *
 * The prompt text is a controlled input driven by the parent's React state.
 * That's on purpose — the parent is the only source of truth, and it never
 * re-reads storage while the modal is open, so nothing can overwrite what you
 * are typing.
 */
import { useCallback, useRef, useState } from 'react';
import { findAgentCli } from '../agents.ts';
import { improveWithAgent, type ImprovedPrompt } from '../ai.ts';
import { useTheme } from '../context.ts';
import { lintPrompt } from '../lint.ts';
import {
  DIFFICULTY_LABELS,
  type ChangeItem,
  type Difficulty,
  type Settings,
  type TemplateId,
} from '../model.ts';
import {
  TEMPLATES,
  composePrompt,
  findTemplate,
  hasAnyFieldValue,
  type Template,
} from '../templates.ts';
import type { Shell } from '../types.ts';
import { AutoGrowTextarea, IconButton, Spinner, useAutoGrow } from './parts.tsx';
import { difficultyColor } from './row.tsx';
import { SendPanel, type SendOptions } from './send-panel.tsx';

const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

/**
 * How many of a tag's boxes are shown before the rest fold away.
 *
 * The templates are written most-important-first — see the note in
 * templates.ts — so the first three are the ones worth asking every time. The
 * rest are still one click away, and open themselves if they hold anything.
 */
const VISIBLE_FIELDS = 3;

/** Everything the send section needs that isn't already on the item itself. */
export interface SendingProps {
  settings: Settings;
  /** Settings prefix, or Ship Studio's own preference when that's empty. */
  branchPrefix: string;
  /** The branch checked out right now, for the mismatch warning. */
  currentBranch: string | null;
  hasUncommittedChanges: boolean;
  busy: boolean;
  onSend: (options: SendOptions) => void;
}

export function ItemEditor({
  item,
  shell,
  projectName,
  improveCli,
  improveModel,
  improveEffort,
  improveAvailable,
  customTemplates,
  canMoveUp,
  canMoveDown,
  sending,
  branchGone,
  onChange,
  onMove,
  onDelete,
  onMarkDone,
}: {
  item: ChangeItem;
  shell: Shell | null;
  projectName: string | null;
  /** Which CLI ✨ Improve shells out to, from settings. */
  improveCli: string;
  improveModel: string;
  /** Reasoning effort for the rewrite, from settings. */
  improveEffort: string;
  /** False when that CLI isn't on the PATH — the button then hides. */
  improveAvailable: boolean;
  /** Tags you made yourself, shown as chips beside the built-in ones. */
  customTemplates: Template[];
  canMoveUp: boolean;
  canMoveDown: boolean;
  /**
   * How to send this item. The section is part of the editor and always
   * visible in it — opening a change shows you what will be sent and lets you
   * send it, rather than hiding that behind a second control.
   */
  sending: SendingProps;
  /**
   * True when this item's work branch no longer exists — the panel detected on
   * open that it was merged and deleted, so "doing" is probably stale.
   */
  branchGone: boolean;
  onChange: (patch: Partial<ChangeItem>) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
  /** Mark the item done — the action the branch-gone strip offers. */
  onMarkDone: () => void;
}) {
  const theme = useTheme();

  /** Shared by every box, so the form reads as one surface. */
  const boxStyle = {
    background: theme.bgPrimary,
    color: theme.textPrimary,
    border: `1px solid ${theme.border}`,
  };

  const [improving, setImproving] = useState(false);
  const [suggestion, setSuggestion] = useState<ImprovedPrompt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showAllFields, setShowAllFields] = useState(false);

  const notesRef = useRef<HTMLTextAreaElement | null>(null);
  useAutoGrow(notesRef, item.notes);

  const nudges = lintPrompt(item.prompt);
  const template = findTemplate(item.template, customTemplates);

  /**
   * Which boxes to draw.
   *
   * The folded ones open themselves whenever any of them holds something —
   * data you typed must never sit invisible behind a fold, which would be a
   * silent way to send a prompt missing half of what you wrote.
   */
  const hiddenFields = template ? template.fields.slice(VISIBLE_FIELDS) : [];
  const hiddenHaveValues =
    template !== null &&
    hiddenFields.length > 0 &&
    hasAnyFieldValue({ ...template, fields: hiddenFields }, item.fields);
  const allFieldsShown = showAllFields || hiddenHaveValues;
  const visibleFields = template
    ? allFieldsShown
      ? template.fields
      : template.fields.slice(0, VISIBLE_FIELDS)
    : [];

  /**
   * Any edit to a box recomposes the prompt.
   *
   * `prompt` stays the single thing the rest of the plugin reads, so sending,
   * linting and ✨ Improve need no knowledge of templates at all.
   */
  const applyEdit = useCallback(
    (patch: { template?: TemplateId | null; fields?: Record<string, string>; notes?: string }) => {
      const nextTemplateId = patch.template !== undefined ? patch.template : item.template;
      const nextFields = patch.fields ?? item.fields;
      const nextNotes = patch.notes ?? item.notes;
      onChange({
        ...patch,
        prompt: composePrompt(findTemplate(nextTemplateId, customTemplates), nextFields, nextNotes),
      });
    },
    [customTemplates, item.fields, item.notes, item.template, onChange]
  );

  const setField = useCallback(
    (id: string, value: string) => applyEdit({ fields: { ...item.fields, [id]: value } }),
    [applyEdit, item.fields]
  );

  /**
   * Nothing is destroyed by switching tag: field values are kept under shared
   * keys, so going Style → Bug carries `where` across, and the free-text box is
   * never touched. That's why this needs no "replace what you've written?"
   * confirmation.
   */
  const pickTemplate = useCallback(
    (id: string) => {
      setShowAllFields(false); // a new tag starts folded again
      applyEdit({ template: id || null });
    },
    [applyEdit]
  );

  const cli = findAgentCli(improveCli);

  const improve = useCallback(async () => {
    if (!shell) return;
    setImproving(true);
    setError(null);
    setSuggestion(null);
    try {
      const outcome = await improveWithAgent(shell, cli, {
        title: item.title,
        prompt: item.prompt,
        projectName,
        model: improveModel,
        effort: improveEffort,
      });
      if (outcome.ok) setSuggestion(outcome.improved);
      else setError(outcome.message);
    } finally {
      setImproving(false);
    }
  }, [cli, improveEffort, improveModel, item.prompt, item.title, projectName, shell]);

  /**
   * An accepted rewrite becomes the free text, and the template steps aside.
   *
   * The rewrite is already a whole prompt. Leaving the boxes active would mean
   * the very next keystroke in one of them recomposed straight over the top of
   * it, quietly undoing the thing you just accepted.
   */
  const acceptSuggestion = useCallback(() => {
    if (!suggestion) return;
    onChange({
      prompt: suggestion.prompt,
      notes: suggestion.prompt,
      template: null,
      fields: {},
      difficulty: suggestion.difficulty,
      ...(suggestion.title ? { title: suggestion.title } : {}),
    });
    setSuggestion(null);
  }, [onChange, suggestion]);

  return (
    <div className="change-editor" style={{ borderTop: `1px solid ${theme.border}` }}>
      {/*
       * The two properties of a change, on one row: how hard it is (which picks
       * the model) and what kind it is (which picks the boxes). They used to be
       * a button row plus a wrapping strip of seven chips — 114px between them
       * at a narrow dock, for two small choices.
       */}
      <div className="change-props-row">
        <div className="change-difficulty-row">
          {DIFFICULTIES.map((difficulty) => {
            const selected = item.difficulty === difficulty;
            const color = difficultyColor(difficulty, theme);
            return (
              <button
                key={difficulty}
                className="change-radio"
                style={{
                  background: selected
                    ? 'var(--change-btn-bg, rgba(127, 127, 127, 0.14))'
                    : 'var(--change-btn-bg, transparent)',
                  border: `1px solid ${selected ? color : theme.border}`,
                  color: selected ? color : theme.textSecondary,
                  fontWeight: selected ? 600 : 400,
                }}
                title={`${DIFFICULTY_LABELS[difficulty]} — picks which model runs it`}
                onClick={() => onChange({ difficulty })}
              >
                {DIFFICULTY_LABELS[difficulty]}
              </button>
            );
          })}
        </div>

        {/*
         * A native select, like the model pickers in Settings and for the same
         * reason: the OS draws the list outside the panel, so every tag is
         * readable even at a 260px dock, and it doesn't grow taller as you add
         * tags of your own.
         */}
        <select
          className="change-select change-tag-select"
          style={{
            background: theme.bgPrimary,
            color: template ? theme.accent : theme.textSecondary,
            border: `1px solid ${template ? theme.accent : theme.border}`,
          }}
          value={item.template ?? ''}
          title={template ? template.hint : 'Pick a tag to get boxes to fill in'}
          aria-label="Tag"
          onChange={(event) => pickTemplate(event.target.value)}
        >
          <option value="">No tag</option>
          <optgroup label="Tags">
            {TEMPLATES.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </optgroup>
          {customTemplates.length > 0 ? (
            <optgroup label="Your tags">
              {customTemplates.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
      </div>

      {/*
       * The boxes sit in their own panel outlined in the accent, so they read as
       * "these belong to Style" rather than as loose inputs that happen to
       * follow the tag.
       *
       * Each box's label lives in its placeholder rather than in a caption above
       * it — five captions cost 105px, a third of this panel. The label is still
       * what composePrompt writes into the prompt, and aria-label/title keep it
       * available once the box has text in it.
       */}
      {template ? (
        <div
          className="change-fields"
          style={{ borderColor: theme.accent }}
          role="group"
          aria-label={`${template.label} template fields`}
        >
          {visibleFields.map((field) => {
            const shared = {
              style: boxStyle,
              value: item.fields[field.id] ?? '',
              placeholder: `${field.label} — ${field.placeholder}`,
              title: field.label,
              spellCheck: false,
              onChange: (event: { target: { value: string } }) =>
                setField(field.id, event.target.value),
            };
            return field.multiline ? (
              <textarea
                key={field.id}
                className="change-input change-field-box change-field-multiline"
                aria-label={field.label}
                {...shared}
              />
            ) : (
              /*
               * A one-row box that grows once the answer gets long: typed past
               * the right edge, it wraps and opens up instead of hiding text.
               * Enter closes the box (Shift+Enter for a line break), so it
               * still behaves like a single-line field unless you ask for more.
               */
              <AutoGrowTextarea
                key={field.id}
                className="change-input change-field-box change-field-grow"
                ariaLabel={field.label}
                {...shared}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                }}
              />
            );
          })}

          {/* Hidden while any folded box holds something — see hiddenHaveValues. */}
          {hiddenFields.length > 0 && !hiddenHaveValues ? (
            <button
              className="change-fold change-fields-fold"
              style={{ color: theme.textMuted }}
              aria-expanded={showAllFields}
              onClick={() => setShowAllFields(!showAllFields)}
            >
              {showAllFields ? '▾ Fewer' : `▸ ${hiddenFields.length} more`}
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Free text: the whole prompt with no tag, an extra note with one. */}
      <textarea
        ref={notesRef}
        className="change-textarea"
        style={boxStyle}
        value={item.notes}
        aria-label={template ? 'Anything else' : 'Prompt'}
        placeholder={
          template
            ? 'Anything else the boxes don’t cover'
            : "The instruction you'll hand to your agent. Or pick a tag to fill in boxes instead."
        }
        spellCheck={false}
        onChange={(event) => applyEdit({ notes: event.target.value })}
      />

      {/*
       * The assembled prompt, read-only.
       *
       * Read-only on purpose: it's built from the boxes, so anything typed here
       * would be silently rebuilt away the next time you touched a field. The
       * "Anything else" box above is the place for wording the boxes can't
       * express, and because composition is plain string joining rather than a
       * model, what you see here is exactly what gets sent.
       */}
      {item.prompt.trim() ? (
        <div>
          <button
            className="change-fold"
            style={{ color: theme.textMuted, marginBottom: showPrompt ? 6 : 0 }}
            aria-expanded={showPrompt}
            onClick={() => setShowPrompt(!showPrompt)}
          >
            {showPrompt ? '▾' : '▸'} Prompt ({item.prompt.trim().split(/\s+/).length} words)
          </button>
          {showPrompt ? (
            <div
              className="change-code"
              style={{
                background: theme.bgSecondary,
                color: theme.textSecondary,
                border: `1px solid ${theme.border}`,
              }}
            >
              {item.prompt}
            </div>
          ) : null}
        </div>
      ) : null}

      {nudges.length > 0 ? (
        <div className="change-nudges" style={{ color: theme.textMuted }}>
          {nudges.map((nudge) => (
            <span className="change-nudge" key={nudge.id}>
              <span style={{ opacity: 0.7 }}>•</span>
              {nudge.message}
            </span>
          ))}
        </div>
      ) : null}

      {error ? (
        <div className="change-warning" style={{ background: 'rgba(240, 74, 74, 0.12)', color: theme.error }}>
          {error}
        </div>
      ) : null}

      {/* What ✨ Improve came back with — never applied without a click. */}
      {suggestion ? (
        <div
          className="change-diff"
          style={{ background: theme.bgSecondary, border: `1px solid ${theme.border}` }}
        >
          <span className="change-field-label" style={{ color: theme.textMuted, marginBottom: 0 }}>
            Suggested rewrite
          </span>
          <div className="change-diff-text">{suggestion.prompt}</div>
          <div style={{ fontSize: 11, color: theme.textMuted }}>
            Also sets difficulty to{' '}
            <strong style={{ color: difficultyColor(suggestion.difficulty, theme) }}>
              {DIFFICULTY_LABELS[suggestion.difficulty]}
            </strong>
            {suggestion.title && suggestion.title !== item.title ? (
              <>
                {' '}
                and the title to &ldquo;{suggestion.title}&rdquo;
              </>
            ) : null}
            .
          </div>
          <div className="change-button-row">
            <button
              className="change-btn"
              style={{ background: theme.action, color: theme.actionText }}
              onClick={acceptSuggestion}
            >
              Use this
            </button>
            <button
              className="change-btn"
              style={{ background: 'var(--change-btn-bg, transparent)', color: theme.textMuted, border: `1px solid ${theme.border}` }}
              onClick={() => setSuggestion(null)}
            >
              Discard
            </button>
          </div>
        </div>
      ) : null}

      {/*
       * The send section — where "I've written this" turns into "send it".
       * Last, because it's the most consequential thing here: it's the only
       * part of the editor that can run git and touch the clipboard.
       */}
      <SendPanel
        item={item}
        settings={sending.settings}
        branchPrefix={sending.branchPrefix}
        currentBranch={sending.currentBranch}
        hasUncommittedChanges={sending.hasUncommittedChanges}
        busy={sending.busy}
        onSend={sending.onSend}
      />

      {branchGone ? (
        <div
          className="change-warning"
          style={{
            background: 'rgba(245, 158, 11, 0.12)',
            color: 'var(--warning, #f59e0b)',
            marginTop: 8,
          }}
        >
          Branch <code>{item.workBranch}</code> no longer exists — likely merged.
          <div style={{ marginTop: 6 }}>
            <button
              className="change-btn"
              style={{ background: theme.action, color: theme.actionText }}
              onClick={onMarkDone}
            >
              Mark done
            </button>
          </div>
        </div>
      ) : null}


      {/* Footer: the rarely-used controls, kept out of the collapsed row. */}
      <div className="change-editor-actions">
        {improveAvailable ? (
          <button
            className="change-btn"
            style={{ background: 'var(--change-btn-bg, transparent)', color: theme.accent, border: `1px solid ${theme.border}` }}
            disabled={improving || (!item.prompt.trim() && !item.title.trim())}
            title={`Rewrite this prompt with ${cli.label}${improveModel ? ` (${improveModel})` : ''}`}
            onClick={() => void improve()}
          >
            {/* Wrapped in an element so the button's flex `gap` applies —
                two bare text nodes would render with nothing between them. */}
            {improving ? <Spinner /> : <span>✨</span>}
            <span>{improving ? `Asking ${cli.label}…` : 'Improve'}</span>
          </button>
        ) : null}

        <span className="change-spacer" />

        <IconButton label="Move up" onClick={() => onMove(-1)} disabled={!canMoveUp}>
          ↑
        </IconButton>
        <IconButton label="Move down" onClick={() => onMove(1)} disabled={!canMoveDown}>
          ↓
        </IconButton>

        {confirmDelete ? (
          <>
            <span style={{ fontSize: 11, color: theme.textMuted }}>Delete?</span>
            <button
              className="change-btn"
              style={{ background: theme.error, color: '#fff', padding: '4px 9px' }}
              onClick={onDelete}
            >
              Yes
            </button>
            <button
              className="change-btn"
              style={{
                background: 'var(--change-btn-bg, transparent)',
                color: theme.textMuted,
                border: `1px solid ${theme.border}`,
                padding: '4px 9px',
              }}
              onClick={() => setConfirmDelete(false)}
            >
              No
            </button>
          </>
        ) : (
          <IconButton label="Delete this change" danger onClick={() => setConfirmDelete(true)}>
            ✕
          </IconButton>
        )}
      </div>
    </div>
  );
}
