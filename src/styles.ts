/**
 * One prefixed stylesheet, injected on activate and removed on deactivate.
 *
 * Layout, spacing and animation live here. Colours do NOT — they come from
 * `ctx.theme` as inline styles at render time, so the plugin follows Ship
 * Studio's theme (including light/dark switches) with no work.
 *
 * Every class is prefixed `change-` so nothing here can leak into the host UI.
 */
export const STYLE_ID = 'change-plugin-styles';

export const CSS = `
@keyframes changeSpin { to { transform: rotate(360deg); } }
@keyframes changeFadeIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }

/* ------------------------------------------------- main panel: window/dock */

/*
 * The panel never dims the app behind it, in either state — the whole point of
 * pinning a change list is to keep working while it's visible. z-index sits
 * below the send/settings modals so those still layer on top.
 */
.change-frame {
  position: fixed;
  z-index: 9990;
  display: flex;
  flex-direction: column;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.42);
  animation: changeFadeIn 0.12s ease-out;
  /* Borders count toward the width, so the dock occupies exactly the space the
     reflow freed. Without this it renders 2px wider than the padding we added
     and clips the edge of the pane it's supposed to sit beside. */
  box-sizing: border-box;
}

/* Docked: full height against the right edge, so only the inner corners round. */
.change-frame-pinned {
  border-radius: 0;
  border-top: none;
  border-right: none;
  border-bottom: none;
  box-shadow: -8px 0 24px rgba(0, 0, 0, 0.28);
  animation: none;
}

.change-frame-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 10px 9px 13px;
  font-size: 12.5px;
  font-weight: 600;
  flex: none;
  user-select: none;
}

.change-frame-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Only the floating window is draggable; the dock is furniture. */
.change-draggable { cursor: grab; }
.change-draggable:active { cursor: grabbing; }

/* Left edge of the dock, dragged to resize. Sits above the body so it stays
   grabbable over scrolled content. */
.change-resize-handle {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  cursor: col-resize;
  opacity: 0;
  transition: opacity 0.12s ease-out;
  z-index: 2;
}
.change-frame-pinned:hover .change-resize-handle { opacity: 0.6; }
.change-resize-handle:hover { opacity: 1 !important; }

.change-frame-body {
  padding: 12px 13px 16px;
  font-size: 13px;
  line-height: 1.5;
  flex: 1;
  /* Keep scrolling inside the panel: without this, reaching the end chains the
     gesture to whatever is behind us and scrolls Ship Studio instead. */
  overscroll-behavior: contain;
}

/*
 * Scrolling, defended against the host's stylesheet.
 *
 * The panel is drawn from the publish slot, so it is a DOM descendant of
 * header.workspace-header even though position:fixed paints it elsewhere.
 * Ship Studio's header styles therefore apply to it, and a header sensibly says
 * nothing inside it scrolls — a rule such as ".workspace-header-right div"
 * scores (0,1,1) and beats a bare ".change-frame-body" at (0,1,0), forcing our
 * containers to overflow-y: hidden. Measured in the real app: content
 * overflowed by 254px while computed overflow-y was "hidden", so there was
 * genuinely nothing the user could do.
 *
 * The child combinator raises specificity, and !important covers the case where
 * the host rule is itself important. !important is normally a smell; here it is
 * the right tool, because we are protecting our own component's behaviour
 * inside a subtree whose CSS we neither control nor can anticipate.
 *
 * (Note for future edits: this file is one big template literal — backticks in
 * these comments would end the string.)
 */
.change-frame > .change-frame-body,
.change-overlay .change-modal-body {
  overflow-y: auto !important;
  overflow-x: hidden !important;
}

/* ---------------------------------------------------------------- modal */

/* Still used for the transient dialogs — send options and settings. Those DO
   dim, because they want an answer before you carry on. */
.change-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.change-modal {
  width: min(760px, 94vw);
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  border-radius: 10px;
  overflow: hidden;
  animation: changeFadeIn 0.12s ease-out;
}

.change-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  font-size: 13px;
  font-weight: 600;
  flex: none;
}

.change-header-actions { display: flex; align-items: center; gap: 4px; }

.change-modal-body {
  padding: 14px 16px 18px;
  font-size: 13px;
  line-height: 1.5;
  overscroll-behavior: contain;
  /* Its overflow-y is set by the defended rule above, alongside the panel's. */
}

.change-close {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 4px 6px;
  line-height: 1;
}

/* --------------------------------------------------------------- inputs */

.change-input,
.change-textarea {
  width: 100%;
  padding: 7px 9px;
  border-radius: 6px;
  font-size: 12px;
  font-family: inherit;
  outline: none;
  box-sizing: border-box;
}

.change-textarea {
  min-height: 108px;
  resize: vertical;
  line-height: 1.55;
}

.change-mono { font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); }

.change-btn {
  border: none;
  border-radius: 6px;
  padding: 7px 13px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}
.change-btn:disabled { opacity: 0.5; cursor: default; }

.change-icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 5px;
  font-size: 11px;
  line-height: 1;
  font-family: inherit;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.change-icon-btn:hover { background: rgba(127, 127, 127, 0.16); }
.change-icon-btn:disabled { opacity: 0.35; cursor: default; }
.change-icon-btn:disabled:hover { background: none; }

.change-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: changeSpin 0.7s linear infinite;
  display: inline-block;
  flex: none;
}

.change-field-label {
  display: block;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 5px;
  font-weight: 600;
}

/* -------------------------------------------------------- quick capture */

.change-capture { display: flex; gap: 8px; margin-bottom: 6px; }
.change-capture-hint { font-size: 11px; margin-bottom: 16px; }

/* ---------------------------------------------------------------- lists */

.change-group { margin-bottom: 18px; }

.change-group-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  font-weight: 600;
  margin-bottom: 7px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.change-fold {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font: inherit;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 7px;
}

.change-row {
  border-radius: 7px;
  margin-bottom: 5px;
  overflow: hidden;
}

.change-row-main {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 9px;
}

.change-row-title {
  flex: 1;
  min-width: 0;
  cursor: pointer;
  text-align: left;
  background: none;
  border: none;
  font: inherit;
  font-size: 12.5px;
  padding: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.change-row-title.change-done { text-decoration: line-through; opacity: 0.55; }

.change-row-actions { display: flex; align-items: center; gap: 2px; flex: none; }

.change-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
  border: 1.5px solid currentColor;
  background: none;
  padding: 0;
  cursor: pointer;
}
.change-dot-filled { background: currentColor; }

.change-chip {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 2px 5px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  font-family: inherit;
  flex: none;
  line-height: 1.4;
}

.change-branch-tag {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 4px;
  flex: none;
  max-width: 130px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.change-empty {
  text-align: center;
  padding: 26px 12px;
  font-size: 12px;
  line-height: 1.7;
}

/* --------------------------------------------------------------- editor */

.change-editor { padding: 4px 10px 12px; display: flex; flex-direction: column; gap: 11px; }

.change-templates { display: flex; flex-wrap: wrap; gap: 5px; }

.change-template-btn {
  font-size: 11px;
  padding: 4px 9px;
  border-radius: 999px;
  cursor: pointer;
  font-family: inherit;
  background: none;
}

.change-nudges { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 11px; }
.change-nudge { display: inline-flex; align-items: center; gap: 4px; }

.change-editor-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.change-spacer { flex: 1; }

/* The before/after shown when ✨ Improve comes back. */
.change-diff { border-radius: 7px; padding: 10px 11px; display: flex; flex-direction: column; gap: 9px; }
.change-diff-text { font-size: 12px; white-space: pre-wrap; line-height: 1.55; }

/* ------------------------------------------------------- send + popover */

.change-popover-body { display: flex; flex-direction: column; gap: 13px; }

.change-code {
  border-radius: 6px;
  padding: 9px 10px;
  font-size: 11.5px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 130px;
  overflow-y: auto;
}

.change-check { display: flex; align-items: center; gap: 8px; font-size: 12px; cursor: pointer; }

.change-warning { font-size: 11.5px; padding: 8px 10px; border-radius: 6px; line-height: 1.5; }

.change-radio-row { display: flex; gap: 6px; }

.change-radio {
  flex: 1;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 11.5px;
  text-align: left;
  font-family: inherit;
  line-height: 1.45;
}

/* ------------------------------------------------------------- settings */

.change-settings { display: flex; flex-direction: column; gap: 16px; }
.change-settings-note { font-size: 11.5px; line-height: 1.6; }
.change-settings-grid { display: flex; flex-direction: column; gap: 9px; }
.change-settings-row { display: flex; align-items: center; gap: 9px; }
.change-settings-key { font-size: 11px; width: 58px; flex: none; font-weight: 600; }
`;

export function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

export function removeStyles(): void {
  document.getElementById(STYLE_ID)?.remove();
}
