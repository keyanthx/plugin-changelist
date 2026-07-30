/**
 * One collapsed row in the list.
 *
 * The title is the point of the row, so everything else defers to it. An
 * earlier version put a status dot *and* a difficulty chip before the title and
 * let the branch tag take whatever width it liked — which in practice rendered
 * as "Rework the …" beside a 110px branch name. Now there is one indicator, the
 * title takes all remaining width, and the branch is capped to a hint.
 *
 * Reordering and deleting live in the expanded editor; a row with seven buttons
 * is a row you stop reading.
 */
import { useTheme } from '../context.ts';
import {
  DIFFICULTY_LABELS,
  branchForItem,
  shouldShowBranch,
  type ChangeItem,
  type Difficulty,
} from '../model.ts';
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
  const started = item.status === 'doing' || isDone;

  const branch = branchForItem(item);
  const showBranch = shouldShowBranch(branch, currentBranch);

  /**
   * Sending an item with no prompt hands the agent nothing but the title. That
   * is the single biggest lever on what comes back, so it earns a mark.
   */
  const missingPrompt = !item.prompt.trim();

  /*
   * One indicator, not two. Its colour carries the difficulty — which decides
   * the model — and whether it's filled carries "started". Status doesn't need
   * repeating here: the group headings above already say In progress / To do /
   * Done. The label spells both out in words so difficulty is never
   * colour-only.
   */
  const difficultyLabel = DIFFICULTY_LABELS[item.difficulty];
  const dotTitle = isDone
    ? `${difficultyLabel} · done — click to reopen`
    : `${difficultyLabel} · click to mark done`;

  return (
    <div className="change-row-main">
      <button
        className={`change-dot${started ? ' change-dot-filled' : ''}`}
        style={{ color: difficultyColor(item.difficulty, theme) }}
        title={dotTitle}
        aria-label={isDone ? 'Mark as not done' : 'Mark as done'}
        onClick={onToggleDone}
      />

      {/*
       * The whole middle of the row is one button, including the slack after
       * the title — with the title sized to its text the target was only as
       * wide as the words, so short titles were fiddly to hit. The chevron is
       * the hint that there's something to open.
       */}
      <button
        className="change-row-open"
        style={{ color: theme.textPrimary }}
        title={expanded ? 'Collapse' : 'Open'}
        aria-expanded={expanded}
        onClick={onToggleExpand}
      >
        <span className={`change-row-title${isDone ? ' change-done' : ''}`}>
          {item.title || <span style={{ color: theme.textMuted }}>Untitled change</span>}
        </span>

        {missingPrompt && !isDone ? (
          <span
            className="change-no-prompt"
            style={{ color: theme.textMuted }}
            title="No prompt yet — sending would hand over just the title"
            aria-label="No prompt yet"
          >
            {/* A hollow speech mark: quiet, and legible at 11px. */}
            &#8230;
          </span>
        ) : null}

        <span className="change-row-chevron" style={{ color: theme.textMuted }} aria-hidden="true">
          {expanded ? '▾' : '▸'}
        </span>

        {/* Takes the slack — inside the button, so the empty space is clickable
            too rather than being dead area in the middle of the row. */}
        <span className="change-row-spacer" />
      </button>

      {showBranch ? (
        /*
         * An icon, not the name. The tag's real job is the binary signal "this
         * one isn't for the branch you're on" — as text it cost ~92px of a
         * 248px row and truncated the title to "Rework the booking flo…".
         * Capped smaller it would only have read "feat/rewo…", so the name
         * moves to the tooltip and the signal stays.
         */
        <span
          className="change-branch-mark"
          style={{ color: theme.textMuted }}
          title={`On branch ${branch}`}
          aria-label={`On branch ${branch}`}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <circle cx="6" cy="5" r="2.5" />
            <circle cx="6" cy="19" r="2.5" />
            <circle cx="18" cy="9" r="2.5" />
            <path d="M6 7.5v9M8.5 5.5h4.5a4 4 0 0 1 4 4v0" strokeLinecap="round" />
          </svg>
        </span>
      ) : null}

      {!isDone ? (
        /* Revealed on hover and keyboard focus — see .change-row-actions. Kept
           in the DOM (opacity, not display) so they stay tabbable. */
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
