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
@keyframes changeRowIn { from { opacity: 0; transform: translateY(-3px); } to { opacity: 1; transform: none; } }
/* A brief acknowledgement that a send happened, on the row it came from. */
@keyframes changeRowSent {
  0% { background: rgba(127, 127, 127, 0.30); }
  100% { background: transparent; }
}

/*
 * Motion is an acknowledgement, never a requirement. Everything above is short
 * and functional, and all of it is off for anyone who asks for less motion.
 */
@media (prefers-reduced-motion: reduce) {
  .change-frame,
  .change-send-strip,
  .change-row,
  .change-row-sent,
  .change-row-actions,
  .change-row-open,
  .change-row-chevron,
  .change-dot,
  .change-resize-handle,
  .change-window-resize-handle {
    animation: none !important;
    transition: none !important;
  }
  .change-dot:hover { transform: none; }
}

/* ------------------------------------------------- main panel: window/dock */

/*
 * The panel never dims the app behind it, in either state — the whole point of
 * pinning a change list is to keep working while it's visible. Nothing in this
 * plugin overlays any more: settings swap into the same frame, and send options
 * open inline on their row.
 */
.change-frame {
  /* Every single-line control in the plugin shares this height, so buttons,
     inputs, selects and radios line up whether they sit beside each other in a
     row or in different panels of the same form. Text fields (the notes box
     and multiline template boxes) opt out — they grow to fit their content. */
  --change-control-height: 32px;
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

/*
 * Bottom-right corner of the floating window, dragged to resize both
 * dimensions. Sits above the body so it stays grabbable over scrolled content,
 * and above the scrollbar so it doesn't share that strip with it.
 */
.change-window-resize-handle {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 14px;
  height: 14px;
  cursor: nwse-resize;
  opacity: 0;
  transition: opacity 0.12s ease-out;
  z-index: 2;
}
.change-frame:hover .change-window-resize-handle { opacity: 0.5; }
.change-window-resize-handle:hover { opacity: 1 !important; }

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
.change-frame > .change-frame-body {
  overflow-y: auto !important;
  /*
   * auto, not hidden. Hidden made anything past the right edge unreachable
   * rather than merely untidy — which is how a narrow dock silently swallowed
   * half of Settings. The rules further down mean this should never trigger;
   * if some future content genuinely cannot fit, it stays reachable.
   */
  overflow-x: auto !important;
  /* Lets @container rules below respond to the dock's width. */
  container-type: inline-size;
  /*
   * Stack the contents, whatever the host says. Ship Studio's header styles its
   * descendants as toolbar rows, and a stray display:flex here lays the capture
   * box, the hint and every group out side by side, stretched to full height.
   * Our own flex containers below set their display explicitly, so pinning this
   * one to block costs nothing.
   */
  display: block !important;
}

/*
 * Our flex rows, restated so a host rule can't change the axis under them.
 * Same reasoning as above: inside the header subtree, layout properties are
 * contested, and these are the ones whose direction actually matters.
 */
.change-frame .change-capture,
.change-frame .change-radio-row,
.change-frame .change-difficulty-row,
.change-frame .change-settings-row,
.change-frame .change-editor-actions,
.change-frame .change-row-main,
.change-frame .change-row-open,
.change-frame .change-picker-row,
.change-frame .change-button-row,
.change-frame .change-tag-head,
.change-frame .change-tag-box-row,
.change-frame .change-send-modes,
.change-frame .change-props-row {
  display: flex !important;
  flex-direction: row !important;
}

.change-frame .change-settings,
.change-frame .change-fields,
.change-frame .change-tag-list,
.change-frame .change-tag-card,
.change-frame .change-tag-boxes,
.change-frame .change-editor,
.change-frame .change-send-strip,
.change-frame .change-popover-body,
.change-frame .change-settings-grid {
  display: flex !important;
  flex-direction: column !important;
}

/* --------------------------------------------------------- panel header */

.change-header-actions { display: flex; align-items: center; gap: 4px; }

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
  /* An input's intrinsic min-content width is wide, and as a flex item its
     automatic minimum size holds it there no matter what the width property
     says. Without this the dock can't narrow without pushing content off. */
  min-width: 0;
}

/* Single-line inputs share the plugin's control height. The multiline
   template boxes also carry .change-input, so they're excluded — see
   .change-field-multiline below, which keeps its own growing height. The
   auto-growing one-row fields are excluded too: .change-field-grow keeps its
   own height so it can open up to show text that wraps. */
.change-input:not(.change-field-multiline):not(.change-field-grow) {
  height: var(--change-control-height);
  padding-top: 0;
  padding-bottom: 0;
}

/* One-row fields that grow to show everything typed in them: start at control
   height, wrap at the right edge and open up. auto-grow sets the height from
   scrollHeight, so overflow-y must stay hidden and resize off or they'd fight
   it. overflow-wrap makes even an unbroken string (a URL, a path) wrap instead
   of running past the border. */
.change-field-grow {
  min-height: var(--change-control-height);
  resize: none;
  overflow-y: hidden;
  overflow-wrap: anywhere;
  line-height: 1.5;
}

.change-textarea {
  /* Starts small and grows to fit — see useAutoGrow in editor.tsx. It used to
     reserve 108px whether or not anything was written in it. resize is off
     because a dragged height would be overwritten on the next keystroke. */
  min-height: 56px;
  resize: none;
  overflow-y: hidden;
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
  /* Same height as the inputs and selects it sits beside. border-box keeps
     the bordered variants (Discard, No, …) at exactly this height too. */
  height: var(--change-control-height);
  box-sizing: border-box;
  padding-top: 0;
  padding-bottom: 0;
}
.change-btn:disabled { opacity: 0.5; cursor: default; }

/*
 * Button labels take the button's colour, whatever the host says.
 *
 * Our buttons set their text colour inline on the <button>, but the label is
 * wrapped in a <span> so the flex gap between icon and text applies. A host rule
 * as ordinary as ".toolbar span { color: var(--text-muted) }" then targets that
 * span directly and beats the inherited colour — which renders "Copy and focus
 * terminal" in grey on a solid blue button, i.e. unreadable. Two classes plus an
 * element out-specifies that shape of rule without needing !important.
 */
.change-frame .change-btn > span { color: inherit; }

.change-icon-btn {
  background: var(--change-btn-bg, none);
  border: none;
  cursor: pointer;
  padding: 5px 7px;
  border-radius: 5px;
  font-size: 15px;
  line-height: 1;
  font-family: inherit;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* Icon buttons match the other single-line controls now — they sit beside
     .change-btn in the editor's action row, so a shorter one read as broken. */
  height: var(--change-control-height);
  box-sizing: border-box;
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

.change-capture { display: flex; gap: 8px; margin-bottom: 6px; min-width: 0; }
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
  background: var(--change-btn-bg, none);
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
  animation: changeRowIn 0.16s ease-out;
  transition: opacity 0.14s ease-out, background 0.14s ease-out;
}

/*
 * The in-progress row's buttons sit dark on the blue wash rather than letting
 * the wash show through them. --change-btn-bg flips the value; every control
 * that is transparent by default reads it with its usual colour as the
 * fallback, so nothing changes outside a doing row and nothing needs
 * !important (which would kill hover states).
 */
.change-row-doing { --change-btn-bg: var(--bg-secondary); }

.change-row-main {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 9px;
}

/*
 * The open/collapse target: the title, its markers, and all the slack after
 * them. It takes every pixel not claimed by the dot, the branch mark and the
 * actions, so hitting it doesn't depend on how long the title happens to be.
 */
.change-row-open {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  text-align: left;
  background: none;
  border: none;
  font: inherit;
  font-size: 13px;
  /* Vertical padding grows the target without making the row taller, since the
     dot and the buttons beside it are taller than the text anyway. */
  padding: 4px 4px;
  margin: -4px -4px;
  border-radius: 5px;
  transition: background 0.12s ease-out;
}
.change-row-open { background: var(--change-btn-bg, none); }
.change-row-open:hover { background: rgba(127, 127, 127, 0.10); }

/* Content width, shrinking with an ellipsis when there isn't room, so the
   markers beside it stay next to the title rather than drifting right. */
.change-row-title {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.change-row-title.change-done { text-decoration: line-through; opacity: 0.55; }

/* The hint that there's something to open. Quiet at rest, clearer on hover. */
.change-row-chevron {
  flex: none;
  font-size: 10px;
  line-height: 1;
  opacity: 0.7;
  transition: opacity 0.12s ease-out;
}
.change-row-open:hover .change-row-chevron { opacity: 1; }

.change-row-spacer { flex: 1 1 0; min-width: 0; }

/*
 * The title box, shown in place of the open button while a change is expanded.
 *
 * Deliberately borderless and transparent until focused, so an open row still
 * reads as a heading rather than sprouting a form field where the title was.
 */
.change-row-title-input {
  flex: 1 1 0;
  min-width: 0;
  background: var(--change-btn-bg, none);
  border: 1px solid transparent;
  border-radius: 5px;
  font: inherit;
  font-size: 13px;
  padding: 4px 5px;
  outline: none;
  /* The one control in the row, so it lines up with the rest. It grows taller
     once the title wraps, but never shorter than a single row. */
  min-height: var(--change-control-height);
  box-sizing: border-box;
  resize: none;
  overflow-y: hidden;
  overflow-wrap: anywhere;
}
.change-row-title-input:hover { border-color: rgba(127, 127, 127, 0.3); }
.change-row-title-input:focus { border-color: rgba(127, 127, 127, 0.55); }

/* Takes over as the collapse control once the title is editable. Sized like the
   row's other icon buttons so it stays an easy target. */
.change-row-collapse {
  flex: none;
  background: var(--change-btn-bg, none);
  border: none;
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  line-height: 1;
  padding: 6px 7px;
  border-radius: 5px;
  opacity: 0.75;
  /* Sized like the row's other icon buttons so it stays an easy target. */
  height: var(--change-control-height);
  box-sizing: border-box;
}
.change-row-collapse:hover { background: rgba(127, 127, 127, 0.16); opacity: 1; }

/* "No prompt yet" — quiet, but present, because sending without one hands the
   agent nothing but the title. */
.change-no-prompt {
  flex: none;
  font-size: 13px;
  line-height: 1;
  opacity: 0.55;
  letter-spacing: 0.06em;
}

/*
 * Actions appear on hover or keyboard focus. Opacity rather than display, so
 * they stay in the tab order and reachable by screen readers — four rows
 * showing eight buttons at rest was most of the row's visual noise.
 */
.change-row-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: none;
  opacity: 0;
  transition: opacity 0.14s ease-out;
}
.change-row:hover .change-row-actions,
.change-row:focus-within .change-row-actions,
.change-row-expanded .change-row-actions {
  opacity: 1;
}

/* One indicator: colour is the difficulty, filled means started. */
.change-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex: none;
  border: 1.5px solid currentColor;
  background: var(--change-btn-bg, none);
  padding: 0;
  cursor: pointer;
  transition: background 0.14s ease-out, transform 0.14s ease-out;
}
.change-dot-filled { background: currentColor; }
.change-dot:hover { transform: scale(1.25); }

.change-row-sent { animation: changeRowSent 0.7s ease-out; }

/* The branch signal: an icon costing ~11px, with the name in its tooltip. As
   text this was 92px of a 248px row and left the title truncated. */
.change-branch-mark {
  flex: none;
  display: inline-flex;
  align-items: center;
  opacity: 0.75;
}

.change-empty {
  text-align: center;
  padding: 26px 12px;
  font-size: 12px;
  line-height: 1.7;
}

/* --------------------------------------------------------------- editor */

.change-editor { padding: 4px 10px 12px; display: flex; flex-direction: column; gap: 8px; }

/* Difficulty and tag on one line. Wraps at a narrow dock rather than squeezing
   the three difficulty buttons into something unreadable. */
.change-props-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; min-width: 0; }
.change-props-row .change-difficulty-row { flex: 1 1 145px; }
.change-tag-select {
  flex: 1 1 96px;
}

/*
 * The template's boxes, in a panel of their own.
 *
 * Deliberately the same recipe as the active chip above — a thin accent outline
 * over a faint neutral tint — so the two visually rhyme and the panel reads as
 * "these belong to Style" rather than five loose inputs that happen to follow
 * it. A blue *fill* was the alternative, but it would compete with the input
 * boxes sitting inside it, which carry their own background.
 */
.change-fields {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
  padding: 8px;
  border: 1px solid;
  border-radius: 8px;
  background: rgba(127, 127, 127, 0.05);
}

/* Each box carries its own label in its placeholder, so there is no caption
   above it. Five captions cost 105px — a third of this panel — for text that
   repeats what the placeholder already says. */
.change-field-box { padding: 4px 8px; }
.change-field-multiline { min-height: 46px; resize: vertical; line-height: 1.5; }

/* "2 more" — sits inside the panel so it reads as part of the tag's form. */
.change-fields-fold { margin-bottom: 0; align-self: flex-start; }

.change-nudges { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 11px; }
.change-nudge { display: inline-flex; align-items: center; gap: 4px; }

.change-editor-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}

/*
 * Model and effort dropdowns.
 *
 * Native selects on purpose: the popup is drawn by the OS outside the panel, so
 * a 260px dock still shows a 25-item list in full, and keyboard and
 * screen-reader behaviour come free. min-width: 0 so they shrink with the dock
 * rather than pushing the row wider than it.
 */
.change-picker-row {
  display: flex;
  gap: 6px;
  flex: 1;
  min-width: 0;
  flex-wrap: wrap;
}

.change-select {
  flex: 1 1 130px;
  min-width: 0;
  padding: 6px 8px;
  border-radius: 6px;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  outline: none;
  box-sizing: border-box;
  /* One control height for every single-line element — a select beside an
     input or button must be the same height as them. */
  height: var(--change-control-height);
  padding-top: 0;
  padding-bottom: 0;
}

/* Effort is the narrower of the pair — its values are single short words. */
.change-select-effort { flex: 0 1 110px; }

/* Any row of buttons. Wraps, because .change-btn is nowrap and a row of three
   is wider than a narrow dock — the one thing still overflowing at 260px. */
.change-button-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.change-spacer { flex: 1; }

/* The before/after shown when ✨ Improve comes back. */
.change-diff { border-radius: 7px; padding: 10px 11px; display: flex; flex-direction: column; gap: 9px; }
.change-diff-text { font-size: 12px; white-space: pre-wrap; line-height: 1.55; }

/* ------------------------------------------------------- send + popover */

.change-popover-body { display: flex; flex-direction: column; gap: 13px; }

/*
 * The send options, inside the expanded change.
 *
 * Same recipe as .change-fields — a thin accent outline over a faint neutral
 * tint — so it reads as one labelled region of the editor rather than loose
 * controls at the bottom of it. No margin: it's a flex child of .change-editor
 * like every other block there, and lines up with the title box above it.
 */
.change-send-strip {
  padding: 9px;
  border: 1px solid;
  border-radius: 8px;
  background: rgba(127, 127, 127, 0.05);
  display: flex;
  flex-direction: column;
  gap: 9px;
  min-width: 0;
  animation: changeRowIn 0.14s ease-out;
}

/*
 * Two destinations, side by side — the same trick as .change-difficulty-row.
 *
 * A fixed flex-basis wraps them onto two lines the moment the dock gets narrow:
 * at 260px there are 192px to share, and two 96px buttons plus a 6px gap is
 * already 198. Basis 0 lets them split whatever width there actually is.
 */
.change-send-modes { display: flex; gap: 6px; min-width: 0; flex-wrap: nowrap; }
.change-send-modes .change-radio {
  flex: 1 1 0;
  min-width: 0;
  /* Tight horizontally so "Running agent" still fits whole at 260px. */
  padding: 5px 6px;
  text-align: center;
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.change-send-note { font-size: 11px; line-height: 1.5; margin-top: 6px; overflow-wrap: anywhere; }

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

.change-warning code {
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11px;
  padding: 0 3px;
  background: rgba(127, 127, 127, 0.18);
  border-radius: 4px;
}

/* Wraps rather than squeezing: two preset buttons don't fit side by side in a
   narrow dock, and stacking them reads far better than compressing both. */
.change-radio-row { display: flex; gap: 6px; flex-wrap: wrap; }

/*
 * The three difficulty buttons, which must stay on one line.
 *
 * They previously used .change-radio-row, whose 120px flex-basis meant three of
 * them plus gaps exceeded the panel and wrapped 2 + 1 — "Easy | Normal" with
 * "Hard" orphaned below, which reads as broken. Basis 0 lets all three share
 * whatever width there is.
 */
.change-difficulty-row { display: flex; gap: 6px; flex-wrap: nowrap; min-width: 0; }
.change-difficulty-row .change-radio {
  flex: 1 1 0;
  min-width: 0;
  /* Tighter than a standalone radio — these sit on a shared row now. */
  padding: 5px 8px;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.change-radio {
  flex: 1 1 120px;
  min-width: 0;
  overflow-wrap: anywhere;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 11.5px;
  text-align: left;
  font-family: inherit;
  line-height: 1.45;
  /* The single-line radios (difficulty, send modes, send-mode setting) share
     the plugin's control height. The settings' agent-CLI preset buttons are
     two lines of content, so :has(br) below restores their natural height. */
  height: var(--change-control-height);
  box-sizing: border-box;
  padding-top: 0;
  padding-bottom: 0;
}
.change-radio:has(br) {
  height: auto;
  padding-top: 8px;
  padding-bottom: 8px;
}

/* ------------------------------------------------------------- settings */

.change-settings { display: flex; flex-direction: column; gap: 16px; }

/* --------------------------------------------------- your own tags */

.change-tag-list { display: flex; flex-direction: column; gap: 8px; min-width: 0; }

.change-tag-card {
  border: 1px solid;
  border-radius: 8px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  background: rgba(127, 127, 127, 0.05);
}

/* Name, a boxes toggle, and delete — the whole tag in one row when collapsed. */
.change-tag-head {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex-wrap: wrap;
}

.change-tag-boxes { display: flex; flex-direction: column; gap: 6px; min-width: 0; }

/* One box: its name, an optional example, and a way to remove it. Wraps rather
   than squeezing, so a 260px dock stacks the two inputs instead of clipping. */
.change-tag-box-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex-wrap: wrap;
}
.change-tag-box-row .change-input { flex: 1 1 110px; }
.change-settings-note { font-size: 11.5px; line-height: 1.6; overflow-wrap: anywhere; }
.change-settings-grid { display: flex; flex-direction: column; gap: 9px; }
.change-settings-row { display: flex; align-items: center; gap: 9px; min-width: 0; }
.change-settings-key { font-size: 11px; width: 58px; flex: none; font-weight: 600; }

/* Indented to line up under its difficulty label. The container query below
   removes this when the label moves above the field instead. */
.change-command-input { margin-left: 67px; width: calc(100% - 67px); }

/*
 * A narrow layout for the dock.
 *
 * The panel's width comes from the dock, not the window, so media queries would
 * be asking the wrong question — @container asks the right one. Everything here
 * is refinement: the min-width and wrapping rules above already stop content
 * being clipped, so a webview without container query support degrades to a
 * cramped-but-complete panel rather than a broken one.
 */
@container (max-width: 320px) {
  /* Label above the field, instead of stealing 58px beside it.
     !important because the host-CSS defence above pins these rows to
     flex-direction: row — our own two rules would otherwise fight, and the
     narrow layout has to win. */
  .change-frame .change-settings-row {
    flex-direction: column !important;
    align-items: stretch;
    gap: 4px;
  }
  .change-settings-key { width: auto; }
  .change-command-input { margin-left: 0; width: 100%; }

  /* One preset per line — half of a narrow dock is unreadable. */
  .change-radio { flex-basis: 100%; }
}
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
