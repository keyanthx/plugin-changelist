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
import { useCallback, useState } from 'react';
import { findAgentCli } from '../agents.ts';
import { improveWithAgent, type ImprovedPrompt } from '../ai.ts';
import { useTheme } from '../context.ts';
import { lintPrompt } from '../lint.ts';
import {
  DIFFICULTY_LABELS,
  type ChangeItem,
  type Difficulty,
  type TemplateId,
} from '../model.ts';
import { TEMPLATES, composePrompt, findTemplate, type Template } from '../templates.ts';
import type { Shell } from '../types.ts';
import { IconButton, Spinner } from './parts.tsx';
import { difficultyColor } from './row.tsx';

const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

export function ItemEditor({
  item,
  shell,
  projectName,
  improveCli,
  improveModel,
  improveEffort,
  improveAvailable,
  canMoveUp,
  canMoveDown,
  onChange,
  onMove,
  onDelete,
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
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChange: (patch: Partial<ChangeItem>) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
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

  const nudges = lintPrompt(item.prompt);
  const template = findTemplate(item.template);

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
        prompt: composePrompt(findTemplate(nextTemplateId), nextFields, nextNotes),
      });
    },
    [item.fields, item.notes, item.template, onChange]
  );

  const setField = useCallback(
    (id: string, value: string) => applyEdit({ fields: { ...item.fields, [id]: value } }),
    [applyEdit, item.fields]
  );

  /**
   * Clicking the active template again clears it.
   *
   * Nothing is destroyed by switching: field values are kept under shared keys,
   * so going Style → Bug carries `where` across, and the free-text box is never
   * touched. That's why this no longer needs a "replace what you've written?"
   * confirmation the way pasting a skeleton did.
   */
  const pickTemplate = useCallback(
    (next: Template) => applyEdit({ template: item.template === next.id ? null : next.id }),
    [applyEdit, item.template]
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
      <input
        className="change-input"
        style={{
          background: theme.bgPrimary,
          color: theme.textPrimary,
          border: `1px solid ${theme.border}`,
        }}
        value={item.title}
        placeholder="What needs changing?"
        spellCheck={false}
        onChange={(event) => onChange({ title: event.target.value })}
      />

      {/* Difficulty — the setting that decides which model gets the job. Its own
          class so all three stay on one line; the shared .change-radio-row
          wraps, which orphaned "Hard" onto a second row. */}
      <div className="change-difficulty-row">
        {DIFFICULTIES.map((difficulty) => {
          const selected = item.difficulty === difficulty;
          const color = difficultyColor(difficulty, theme);
          return (
            <button
              key={difficulty}
              className="change-radio"
              style={{
                background: selected ? 'rgba(127, 127, 127, 0.14)' : 'transparent',
                border: `1px solid ${selected ? color : theme.border}`,
                color: selected ? color : theme.textSecondary,
                fontWeight: selected ? 600 : 400,
              }}
              onClick={() => onChange({ difficulty })}
            >
              {DIFFICULTY_LABELS[difficulty]}
            </button>
          );
        })}
      </div>

      {/* Pick one to get boxes; click it again to go back to free text. */}
      <div className="change-templates">
        {TEMPLATES.map((entry) => {
          const active = item.template === entry.id;
          return (
            <button
              key={entry.id}
              className={`change-template-btn${active ? ' change-template-active' : ''}`}
              style={{
                border: `1px solid ${active ? theme.accent : theme.border}`,
                color: active ? theme.accent : theme.textSecondary,
              }}
              title={active ? `Click to remove. ${entry.hint}` : entry.hint}
              aria-pressed={active}
              onClick={() => pickTemplate(entry)}
            >
              {entry.label}
              {/* Reads as a removable pill, so it's obvious the active one can
                  be clicked off rather than only swapped for another. */}
              {active ? <span className="change-template-x">×</span> : null}
            </button>
          );
        })}
      </div>

      {/*
       * The boxes sit in their own panel outlined in the same accent as the
       * highlighted chip above, so it reads as "these belong to Style" rather
       * than as five loose inputs that happen to follow it.
       */}
      {template ? (
        <div
          className="change-fields"
          style={{ borderColor: theme.accent }}
          role="group"
          aria-label={`${template.label} template fields`}
        >
          {template.fields.map((field) => (
            <label className="change-field" key={field.id}>
              <span className="change-field-name" style={{ color: theme.textMuted }}>
                {field.label}
              </span>
              {field.multiline ? (
                <textarea
                  className="change-input change-field-box change-field-multiline"
                  style={boxStyle}
                  value={item.fields[field.id] ?? ''}
                  placeholder={field.placeholder}
                  spellCheck={false}
                  onChange={(event) => setField(field.id, event.target.value)}
                />
              ) : (
                <input
                  className="change-input change-field-box"
                  style={boxStyle}
                  value={item.fields[field.id] ?? ''}
                  placeholder={field.placeholder}
                  spellCheck={false}
                  onChange={(event) => setField(field.id, event.target.value)}
                />
              )}
            </label>
          ))}
        </div>
      ) : null}

      {/* Free text: the whole prompt with no template, an extra note with one. */}
      <label className="change-field">
        {template ? (
          <span className="change-field-name" style={{ color: theme.textMuted }}>
            Anything else
          </span>
        ) : null}
        <textarea
          className="change-textarea"
          style={boxStyle}
          value={item.notes}
          placeholder={
            template
              ? 'Optional — anything the boxes above don’t cover'
              : "The instruction you'll hand to your agent. Or pick a template above to fill in boxes instead."
          }
          spellCheck={false}
          onChange={(event) => applyEdit({ notes: event.target.value })}
        />
      </label>

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
              style={{ background: 'transparent', color: theme.textMuted, border: `1px solid ${theme.border}` }}
              onClick={() => setSuggestion(null)}
            >
              Discard
            </button>
          </div>
        </div>
      ) : null}

      {/* Footer: the rarely-used controls, kept out of the collapsed row. */}
      <div className="change-editor-actions">
        {improveAvailable ? (
          <button
            className="change-btn"
            style={{ background: 'transparent', color: theme.accent, border: `1px solid ${theme.border}` }}
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
                background: 'transparent',
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
