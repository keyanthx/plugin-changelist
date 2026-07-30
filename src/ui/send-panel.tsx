/**
 * The send options popover.
 *
 * It exists so nothing surprising happens: you see the exact command line, the
 * model it will run, and the branch it will create, before anything is copied
 * or any git command runs. Opened by the ⌄ button, and automatically whenever
 * branch creation is switched on — a git mutation should never be one click
 * away from a list of notes.
 */
import { useState } from 'react';
import { findAgentCli, readModelFromCommand } from '../agents.ts';
import { copyText } from '../clipboard.ts';
import { useTheme } from '../context.ts';
import { DIFFICULTY_LABELS, type ChangeItem, type SendMode, type Settings } from '../model.ts';
import { buildClipboardText, isValidBranchName, suggestBranchName } from '../send.ts';
import { Field, Modal, Spinner } from './parts.tsx';

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
  onClose,
}: {
  item: ChangeItem;
  settings: Settings;
  /** Settings prefix, or Ship Studio's own preference when that's empty. */
  branchPrefix: string;
  hasUncommittedChanges: boolean;
  busy: boolean;
  onSend: (options: SendOptions) => void;
  onClose: () => void;
}) {
  const theme = useTheme();

  const [mode, setMode] = useState<SendMode>(settings.sendMode);
  const [createBranch, setCreateBranch] = useState(settings.createBranch);
  const [branchName, setBranchName] = useState(() =>
    item.workBranch ?? suggestBranchName(item.title, branchPrefix)
  );

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
    <Modal title="Send to the terminal" onClose={onClose}>
      <div className="change-popover-body">
        <Field label="Where this is going">
          {/* The labels name the destination, not the intent. Getting this
              wrong — pasting a launch command into a running agent, where it
              becomes a chat message and the flags do nothing — is the one
              mistake that fails silently. */}
          <div className="change-radio-row">
            <ModeButton
              selected={mode === 'launch'}
              title="New agent"
              detail="paste in a terminal tab"
              onClick={() => setMode('launch')}
            />
            <ModeButton
              selected={mode === 'prompt-only'}
              title="Message a running agent"
              detail="paste in the agent's box"
              onClick={() => setMode('prompt-only')}
            />
          </div>
        </Field>

        <Field label={mode === 'launch' ? 'Command that gets copied' : 'Text that gets copied'}>
          <div
            className="change-code change-mono"
            style={{
              background: theme.bgSecondary,
              color: theme.textSecondary,
              border: `1px solid ${theme.border}`,
            }}
          >
            {clipboardText || '(nothing to send — give this change a title or a prompt first)'}
          </div>

          {mode === 'launch' ? (
            <div className="change-settings-note" style={{ color: theme.textMuted, marginTop: 7 }}>
              Paste at a <strong>shell prompt</strong> in a normal terminal tab. Pasted into a
              running agent it becomes a chat message — the flags do nothing and the model
              won&rsquo;t change.
            </div>
          ) : (
            <ModelWarning cli={cli} switching={switching} targetModel={targetModel} />
          )}
        </Field>

        <div>
          <label className="change-check" style={{ color: theme.textPrimary }}>
            <input
              type="checkbox"
              checked={createBranch}
              onChange={(event) => setCreateBranch(event.target.checked)}
            />
            Create a git branch for this change first
          </label>

          {createBranch ? (
            <div style={{ marginTop: 9 }}>
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
                onChange={(event) => setBranchName(event.target.value)}
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

        <div className="change-button-row">
          <button
            className="change-btn"
            style={{ background: theme.action, color: theme.actionText }}
            disabled={busy || !branchOk || !hasPrompt}
            onClick={() => onSend({ mode, createBranch, branchName: branchName.trim() })}
          >
            {busy ? <Spinner /> : <span>▶</span>}
            <span>{busy ? 'Working…' : 'Copy and focus terminal'}</span>
          </button>
          <button
            className="change-btn"
            style={{ background: 'transparent', color: theme.textMuted, border: `1px solid ${theme.border}` }}
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
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
  title,
  detail,
  onClick,
}: {
  selected: boolean;
  title: string;
  detail: string;
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
      }}
      onClick={onClick}
    >
      <strong style={{ fontWeight: 600 }}>{title}</strong>
      <br />
      <span style={{ color: theme.textMuted, fontSize: 10.5 }}>{detail}</span>
    </button>
  );
}
