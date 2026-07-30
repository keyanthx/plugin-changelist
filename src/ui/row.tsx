/**
 * One collapsed row in the list.
 *
 * Kept deliberately sparse: status, difficulty, title, and the two things you
 * do most often (send it, open its options). Reordering and deleting live in
 * the expanded editor, because a row with seven buttons is a row you stop
 * reading.
 */
import { useTheme } from '../context.ts';
import { DIFFICULTY_LABELS, type ChangeItem, type Difficulty } from '../model.ts';
import { IconButton } from './parts.tsx';

/** Difficulty colours. There is no `warning` in the theme, hence the fallback. */
export function difficultyColor(difficulty: Difficulty, theme: ReturnType<typeof useTheme>): string {
  if (difficulty === 'easy') return theme.success;
  if (difficulty === 'hard') return 'var(--warning, #f59e0b)';
  return theme.accent;
}

export function DifficultyChip({
  difficulty,
  onCycle,
}: {
  difficulty: Difficulty;
  onCycle?: () => void;
}) {
  const theme = useTheme();
  return (
    <button
      className="change-chip"
      style={{
        color: difficultyColor(difficulty, theme),
        background: 'rgba(127, 127, 127, 0.14)',
        cursor: onCycle ? 'pointer' : 'default',
      }}
      title={
        onCycle
          ? `${DIFFICULTY_LABELS[difficulty]} — click to change. This picks which model runs it.`
          : DIFFICULTY_LABELS[difficulty]
      }
      onClick={onCycle}
      disabled={!onCycle}
    >
      {DIFFICULTY_LABELS[difficulty].charAt(0)}
    </button>
  );
}

export function ItemRow({
  item,
  expanded,
  currentBranch,
  onToggleExpand,
  onToggleDone,
  onCycleDifficulty,
  onSend,
  onOptions,
}: {
  item: ChangeItem;
  expanded: boolean;
  /** The branch checked out right now, for deciding whether to show the tag. */
  currentBranch: string | null;
  onToggleExpand: () => void;
  onToggleDone: () => void;
  onCycleDifficulty: () => void;
  onSend: () => void;
  onOptions: () => void;
}) {
  const theme = useTheme();
  const isDone = item.status === 'done';

  /**
   * The branch tag only appears when it tells you something — that this note
   * belongs somewhere other than where you are now. Showing "main" while you're
   * on main is pure noise.
   */
  const branch = item.workBranch ?? item.branchAtCapture;
  const showBranch = Boolean(branch) && branch !== currentBranch;

  return (
    <div className="change-row-main">
      <button
        className={`change-dot${isDone || item.status === 'doing' ? ' change-dot-filled' : ''}`}
        style={{ color: isDone ? theme.success : item.status === 'doing' ? theme.accent : theme.textMuted }}
        title={isDone ? 'Done — click to reopen' : 'Mark as done'}
        aria-label={isDone ? 'Mark as not done' : 'Mark as done'}
        onClick={onToggleDone}
      />

      <DifficultyChip difficulty={item.difficulty} onCycle={onCycleDifficulty} />

      <button
        className={`change-row-title${isDone ? ' change-done' : ''}`}
        style={{ color: theme.textPrimary }}
        title={expanded ? 'Collapse' : 'Open'}
        onClick={onToggleExpand}
      >
        {item.title || <span style={{ color: theme.textMuted }}>Untitled change</span>}
      </button>

      {showBranch ? (
        <span
          className="change-branch-tag change-mono"
          style={{ background: 'rgba(127, 127, 127, 0.14)', color: theme.textMuted }}
          title={`Noted on branch ${branch}`}
        >
          {branch}
        </span>
      ) : null}

      {!isDone ? (
        <span className="change-row-actions">
          <IconButton label="Send to the terminal" onClick={onSend}>
            <span style={{ color: theme.accent, fontSize: 12 }}>▶</span>
          </IconButton>
          <IconButton label="Send options" onClick={onOptions}>
            ⌄
          </IconButton>
        </span>
      ) : null}
    </div>
  );
}
