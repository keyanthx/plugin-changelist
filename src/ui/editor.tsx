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
import { DIFFICULTY_LABELS, type ChangeItem, type Difficulty } from '../model.ts';
import { TEMPLATES, fillSkeleton, type Template } from '../templates.ts';
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

  const [pendingTemplate, setPendingTemplate] = useState<Template | null>(null);
  const [improving, setImproving] = useState(false);
  const [suggestion, setSuggestion] = useState<ImprovedPrompt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const nudges = lintPrompt(item.prompt);

  const applyTemplate = useCallback(
    (template: Template) => {
      onChange({ prompt: fillSkeleton(template, item.title), template: template.id });
      setPendingTemplate(null);
    },
    [item.title, onChange]
  );

  /** Inserting over existing text is destructive, so it asks first. */
  const pickTemplate = useCallback(
    (template: Template) => {
      if (item.prompt.trim()) setPendingTemplate(template);
      else applyTemplate(template);
    },
    [applyTemplate, item.prompt]
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

  const acceptSuggestion = useCallback(() => {
    if (!suggestion) return;
    onChange({
      prompt: suggestion.prompt,
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

      {/* Difficulty — the setting that decides which model gets the job. */}
      <div className="change-radio-row">
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

      {/* Templates */}
      <div>
        <div className="change-templates">
          {TEMPLATES.map((template) => (
            <button
              key={template.id}
              className="change-template-btn"
              style={{
                border: `1px solid ${item.template === template.id ? theme.accent : theme.border}`,
                color: item.template === template.id ? theme.accent : theme.textSecondary,
              }}
              title={template.hint}
              onClick={() => pickTemplate(template)}
            >
              {template.label}
            </button>
          ))}
        </div>

        {pendingTemplate ? (
          <div
            className="change-warning change-button-row"
            style={{
              background: 'rgba(127, 127, 127, 0.12)',
              color: theme.textSecondary,
              marginTop: 8,
            }}
          >
            <span style={{ flex: '1 1 140px', minWidth: 0 }}>
              Replace what you&rsquo;ve written with the {pendingTemplate.label} template?
            </span>
            <button
              className="change-btn"
              style={{ background: theme.action, color: theme.actionText }}
              onClick={() => applyTemplate(pendingTemplate)}
            >
              Replace
            </button>
            <button
              className="change-btn"
              style={{ background: 'transparent', color: theme.textMuted, border: `1px solid ${theme.border}` }}
              onClick={() => setPendingTemplate(null)}
            >
              Cancel
            </button>
          </div>
        ) : null}
      </div>

      {/* The prompt itself */}
      <textarea
        className="change-textarea"
        style={{
          background: theme.bgPrimary,
          color: theme.textPrimary,
          border: `1px solid ${theme.border}`,
        }}
        value={item.prompt}
        placeholder="The instruction you'll hand to your agent. Pick a template above to start from a skeleton."
        spellCheck={false}
        onChange={(event) => onChange({ prompt: event.target.value })}
      />

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
