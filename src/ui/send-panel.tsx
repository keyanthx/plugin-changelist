/**
 * The send options — part of the expanded editor, always visible in it.
 *
 * It exists so nothing surprising happens: you see the exact command line, the
 * model it will run, and the branch it will create, before anything is copied
 * or any git command runs.
 *
 * This has moved twice. It was a centred modal up to 760px wide, designed
 * before the panel could be docked; then a strip that opened from a ⌄ on the
 * row. Both made sending a separate act from writing — you finished a prompt,
 * then went somewhere else to hand it over. Opening a change now shows the
 * whole of it: what you're asking for, and what will be sent.
 *
 * `branchName` and `mode` are still per-send state, deliberately not saved to
 * the item — only `ItemEditor`'s own fields persist to storage. This component
 * staying a plain function of its props (never writing to `ChangeItem`) is
 * what keeps that boundary from blurring now the two are one surface.
 */
import { useState } from 'react';
import { findAgentCli, readModelFromCommand } from '../agents.ts';
import { copyText } from '../clipboard.ts';
import { useTheme } from '../context.ts';
import { type ChangeItem, type SendMode, type Settings } from '../model.ts';
import { buildClipboardText, isValidBranchName, suggestBranchName } from '../send.ts';
import { Spinner } from './parts.tsx';

export interface SendOptions {
  mode: SendMode;
  createBranch: boolean;
  branchName: string;
}

export function SendPanel({
  item,
  settings,
  branchPrefix,
  hasUncommittedChanges,
  busy,
  onSend,
}: {
  item: ChangeItem;
  settings: Settings;
  /** Settings prefix, or Ship Studio's own preference when that's empty. */
  branchPrefix: string;
  hasUncommittedChanges: boolean;
  busy: boolean;
  onSend: (options: SendOptions) => void;
}) {
  const theme = useTheme();

  const [mode, setMode] = useState<SendMode>(settings.sendMode);
  const [createBranch, setCreateBranch] = useState(settings.createBranch);
  /**
   * `null` means "follow the title". This section now mounts the moment a
   * change is expanded, which for a new item is *before* the title is typed —
   * seeding the name once at mount would leave you staring at a branch called
   * `feat/untitled-change` while the title above it says something else. Once
   * you type in the field it holds whatever you put there, and stops
   * following.
   */
  const [editedBranchName, setEditedBranchName] = useState<string | null>(null);
  /** The command is one truncated line until you ask to see all of it. */
  const [showCommand, setShowCommand] = useState(false);

  const branchName =
    editedBranchName ?? item.workBranch ?? suggestBranchName(item.title, branchPrefix);

  const clipboardText = buildClipboardText(item, settings, mode);
  const branchOk = !createBranch || isValidBranchName(branchName);
  const hasPrompt = Boolean(item.prompt.trim() || item.title.trim());

  /**
   * Which tool this difficulty's command actually runs, read from the command
   * itself rather than a setting — the templates are free text and can mix
   * tools per difficulty, so the first word is the only reliable source.
   */
  const commandForItem = settings.commands[item.difficulty];
  const binary = commandForItem.trim().split(/\s+/)[0] ?? '';
  const cli = findAgentCli(binary === 'opencode' ? 'opencode' : 'claude');
  const targetModel = readModelFromCommand(commandForItem);
  const switching = cli.midSessionModelSwitch;

  return (
    <div
      className="change-send-strip"
      style={{ borderColor: theme.accent }}
      role="group"
      aria-label="Send to the terminal"
    >
      {/* The labels name the destination, not the intent. Getting this wrong —
          pasting a launch command into a running agent, where it becomes a chat
          message and the flags do nothing — is the one mistake that fails
          silently. The old second line of explanation moves to the tooltip;
          in a strip this narrow it was two thirds of the height. */}
      <div className="change-send-modes">
        <ModeButton
          selected={mode === 'launch'}
          label="New agent"
          hint="Paste at a shell prompt in a terminal tab. Pasted into an agent that's already running it becomes a chat message and the flags do nothing."
          onClick={() => setMode('launch')}
        />
        <ModeButton
          selected={mode === 'prompt-only'}
          label="Running agent"
          hint="Paste into the message box of an agent that's already going"
          onClick={() => setMode('prompt-only')}
        />
      </div>

      {/*
       * The exact text that will be copied. Collapsed to a single truncated
       * line by default — you nearly always just want to confirm it starts with
       * the right tool and model — with the whole thing one click away.
       */}
      <div>
        <button
          className="change-send-command"
          style={{ color: theme.textMuted }}
          aria-expanded={showCommand}
          title={showCommand ? 'Hide the full text' : 'Show the full text'}
          onClick={() => setShowCommand(!showCommand)}
        >
          <span className="change-send-caret" aria-hidden="true">
            {showCommand ? '▾' : '▸'}
          </span>
          <span className="change-send-command-text change-mono" style={{ color: theme.textSecondary }}>
            {clipboardText || '(nothing to send — give this change a title or a prompt first)'}
          </span>
        </button>

        {showCommand ? (
          <div
            className="change-code change-mono"
            style={{
              background: theme.bgSecondary,
              color: theme.textSecondary,
              border: `1px solid ${theme.border}`,
              marginTop: 6,
            }}
          >
            {clipboardText || '(nothing to send — give this change a title or a prompt first)'}
          </div>
        ) : null}

        {/* Launch mode's "paste at a shell prompt" caution lives in the New
            agent button's tooltip — it was two lines of prose for something you
            learn once. The prompt-only warning stays on screen, because it's
            about the model silently not being the one you picked. */}
        {mode === 'prompt-only' ? (
          <ModelWarning cli={cli} switching={switching} targetModel={targetModel} />
        ) : null}
      </div>

      <div>
        <label className="change-check" style={{ color: theme.textPrimary }}>
          <input
            type="checkbox"
            checked={createBranch}
            onChange={(event) => setCreateBranch(event.target.checked)}
          />
          Create a git branch first
        </label>

        {createBranch ? (
          <div style={{ marginTop: 7 }}>
            <input
              className="change-input change-mono"
              style={{
                background: theme.bgPrimary,
                color: theme.textPrimary,
                border: `1px solid ${branchOk ? theme.border : theme.error}`,
              }}
              value={branchName}
              spellCheck={false}
              placeholder="branch-name"
              onChange={(event) => setEditedBranchName(event.target.value)}
            />
            {!branchOk ? (
              <div style={{ color: theme.error, fontSize: 11, marginTop: 5 }}>
                Git won&rsquo;t accept that name — no spaces or <code>~^:?*[</code>.
              </div>
            ) : null}
            {hasUncommittedChanges ? (
              <div
                className="change-warning"
                style={{ background: 'rgba(245, 158, 11, 0.12)', color: 'var(--warning, #f59e0b)', marginTop: 8 }}
              >
                You have uncommitted changes. They&rsquo;ll come along to the new branch — commit or
                stash them first if they belong where they are.
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* No Cancel — there is nothing to cancel. Collapsing the change puts
          this away, and nothing here is saved until you press send. */}
      <button
        className="change-btn"
        style={{ background: theme.action, color: theme.actionText }}
        disabled={busy || !branchOk || !hasPrompt}
        onClick={() => onSend({ mode, createBranch, branchName: branchName.trim() })}
      >
        {busy ? <Spinner /> : <span>▶</span>}
        <span>{busy ? 'Working…' : 'Copy and focus terminal'}</span>
      </button>
    </div>
  );
}

/**
 * What "message a running agent" actually means for the model.
 *
 * The difficulty → model routing only applies at launch. Sending into a session
 * that's already running uses whatever model that session started with, which is
 * a silent mismatch unless we say so. Claude can be nudged with `/model`;
 * OpenCode genuinely cannot, so it gets told plainly rather than offered a
 * button that wouldn't work.
 */
function ModelWarning({
  cli,
  switching,
  targetModel,
}: {
  cli: ReturnType<typeof findAgentCli>;
  switching: ReturnType<typeof findAgentCli>['midSessionModelSwitch'];
  targetModel: string | null;
}) {
  const theme = useTheme();
  const [copied, setCopied] = useState(false);

  const line = switching.supported && targetModel ? switching.command(targetModel) : null;

  return (
    <div
      className="change-warning"
      style={{ background: 'rgba(127, 127, 127, 0.12)', color: theme.textSecondary, marginTop: 7 }}
    >
      This uses whatever model that session already started with
      {targetModel ? `, not ${targetModel}` : ''}. {switching.how}
      {line ? (
        <div style={{ marginTop: 8 }}>
          <button
            className="change-btn"
            style={{ background: 'transparent', color: theme.accent, border: `1px solid ${theme.border}` }}
            onClick={() => {
              void copyText(line).then((ok) => setCopied(ok));
            }}
          >
            {copied ? `Copied ${line}` : `Copy ${line}`}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ModeButton({
  selected,
  label,
  hint,
  onClick,
}: {
  selected: boolean;
  label: string;
  /** The destination, spelled out — shown on hover rather than as a second line. */
  hint: string;
  onClick: () => void;
}) {
  const theme = useTheme();
  return (
    <button
      className="change-radio"
      style={{
        background: selected ? 'rgba(127, 127, 127, 0.14)' : 'transparent',
        border: `1px solid ${selected ? theme.accent : theme.border}`,
        color: selected ? theme.textPrimary : theme.textSecondary,
        fontWeight: selected ? 600 : 400,
      }}
      title={hint}
      aria-pressed={selected}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
