# Change List

A Ship Studio plugin: a per-project list of changes you want made, each with its
own prompt, that hands them to your AI agent one at a time.

The problem it solves: you notice five things while working on a site, write them
down somewhere outside the app, and later feed them to your agent one after
another. This keeps that list next to the project it belongs to, and makes the
handoff a single click.

## How it works

**Keep it in view.** The Change List button opens a small floating window you can
drag anywhere. Hit the 📍 pin and it docks to the right edge, full height, and
stays there — through closing the Plugins dropdown, switching around the app, and
restarts. Neither state dims Ship Studio behind it, so you carry on working while
the list sits there. Unpin to get the floating window back.

**Jot it down.** Type a title, press Enter. That's it — the prompt can wait.
Each note quietly records the git branch you were on when you wrote it.

**Write the prompt.** Open an item and you get three kinds of help:

- **Tags** — six, each asking what that kind of change actually needs:

  | Tag | For | Boxes |
  |---|---|---|
  | **Style** | how something already there looks | what · where · should be · screen size · keep |
  | **Text** | wording | what · where · current text · should say |
  | **Layout** | move, reorder, resize, remove | what · where · should end up · keep |
  | **Add** | something not there yet — a button, a section, a page | what · where · content · what it does · match |
  | **Behaviour** | clicks, hovers, forms, links, animation | what · where · should do · keep working |
  | **Bug** | something is broken | what goes wrong · where · steps · expected · only on |

  Every tag asks **where**, because "no page, section or file named" is the hint
  that fires most often. None asks more than five things — most items get sent
  with no prompt at all, so every extra box is friction. **Leave any of them
  blank** — an empty box contributes nothing. The
  prompt is assembled from what you filled in, by plain string joining, so what
  the preview shows is exactly what gets sent. Click the active template again
  to go back to writing freehand.

  Switching template keeps values that still apply — `where` means the same
  thing in a bug report and a restyle — and never touches your free text.
- **Live hints** under the box: unfilled blanks, no page or file named, no
  desired outcome, vague words like "nicer". Informational only, never blocking.
- **✨ Improve** — sends the note to an agent CLI already on your machine and
  offers a rewritten prompt you can accept or discard. It also suggests a
  difficulty. Hidden when its CLI isn't on the PATH; everything else still works.

**Send it.** Each change is tagged Easy, Normal or Hard, and each level maps to a
command you control. Both presets start the agent **in plan mode**, seeded with
your prompt, so it proposes before it edits:

| Difficulty | Claude Code | OpenCode |
|---|---|---|
| Easy | `claude --permission-mode plan --model haiku {prompt}` | `opencode --agent plan --model opencode-go/hy3 --prompt {prompt}` |
| Normal | `… --model sonnet {prompt}` | `… --model opencode-go/glm-5.2 --prompt {prompt}` |
| Hard | `… --model opus {prompt}` | `… --model opencode-go/kimi-k3 --prompt {prompt}` |

Press ▶ and the plugin builds that command with your prompt quoted into it, copies
it, and focuses the terminal. Paste, press enter — a fresh agent in plan mode on
the model you chose.

### Paste it at a shell prompt

This is the one thing that fails silently, so it's worth stating plainly.

The launch command has to go into a **normal terminal tab, at a shell prompt**.
If a tab is already running an agent, its input box belongs to that agent — the
whole line arrives as a *chat message*, the flags do nothing, and you get the
session's original model with no error to tell you so.

The second mode, **Message a running agent**, copies just the prompt for exactly
that case. It's honest about the consequence: the difficulty → model routing only
applies at launch, so a running session keeps the model it started with. Whether
you can fix that afterwards depends on the tool:

| | Change model mid-session? |
|---|---|
| **Claude Code** | Yes — `/model <alias>` switches immediately. The panel offers a one-click copy of the right line. |
| **OpenCode** | No. `/models` is an interactive picker with no `/model <id>` form; the model is fixed at launch. Start a new session instead. |

Both launch commands were verified against the installed CLIs under a real PTY:
Claude reports `Haiku` and `plan mode`, OpenCode reports `Hy3` and `plan`.

### Choosing a CLI

Settings has one-click presets for **Claude Code** and **OpenCode**; whichever
isn't installed is greyed out rather than hidden, so it's clear why. On a machine
with only one of them, the first run picks that one for you.

The commands stay free text underneath, which means two things worth knowing:

- **Any CLI works**, not just these two — `codex {prompt}`, `claude --agent reviewer {prompt}`,
  whatever you'd type yourself.
- **You can mix them.** The three templates are independent, so Easy can run a
  cheap OpenCode model while Hard runs Claude Opus.

### Picking a model and effort

Both are dropdowns, built from what the installed CLI actually reports rather
than a list baked into the plugin:

- **OpenCode** — `opencode models --verbose` returns a full catalogue locally, so
  the picker shows real names grouped by provider with their context window and
  whether they're free (`GLM 5.2 · 200k`, `Big Pickle · 200k · free`).
- **Claude Code** — has no model-listing command, so its aliases and its effort
  levels are read out of `claude --help`. A reworded help page falls back to a
  curated list rather than an empty picker.

**Effort follows the model.** OpenCode reports `variants` per model, and they
genuinely differ — some offer `high`/`max`, others `low`/`medium`/`high`, and
many none at all. The effort dropdown shows exactly that model's levels, and
disappears when it has none, so it can never offer a value the model rejects.

One asymmetry the UI is careful about: `--variant` exists only on
`opencode run`, not the interactive command a send uses, and the OpenCode docs
put reasoning effort in `opencode.json` instead. So for OpenCode **sends** the
effort control is shown disabled with the reason; it's live for ✨ Improve, which
runs headless. Claude's `--effort` works in both places.

Both dropdowns rewrite only their own flag inside the command template and leave
everything else you typed alone.

✨ Improve has **its own** CLI and model, separate from the send commands —
rewriting a sentence doesn't need your most expensive model. It runs read-only
on both tools and cannot edit your files.

**Track it.** Items move To do → In progress → Done. Done items fold away into a
`Done (n)` section rather than disappearing.

### Branches

Optionally, sending an item first creates a git branch named after it. This is
off by default, and never silent: the ⌄ options panel shows the branch name
(editable), the exact command, and a warning if you have uncommitted changes that
would come along. If the branch already exists it switches to it instead.

The plugin never commits and never pushes.

## Why the button and the window are in different slots

Worth knowing before touching `src/index.tsx`.

For a non-hosting plugin the `toolbar` slot renders **inside Ship Studio's
Plugins dropdown**, and that dropdown unmounts its contents when it closes. A
window drawn from there dies the moment you click away — fatal for a pin feature.

So the button lives in `toolbar` and only toggles shared state in `src/dock.ts`;
the window itself is drawn by the **`publish`** slot, which sits in the workspace
header and stays mounted. Both slots register as possible hosts and the lower
priority number wins (`publish` beats `toolbar`), so:

- normally `publish` draws it and pinning works;
- on a build without a `publish` slot, `toolbar` takes over — the panel still
  opens, it just closes with the dropdown;
- it is never drawn twice when both are mounted.

Window position and pin state live in `localStorage`, not plugin storage: they're
about you rather than the project, and reading them synchronously is what stops
the panel jumping into place after first paint.

## How the pinned dock makes room

When you pin it, the dock doesn't float on top of Ship Studio — it takes space
*from* it, the way Ship Studio's own Edit panel does. The toolbars keep their
full width, the dock starts below them, and the content area gets narrower by
exactly the dock's width. Drag the dock's left edge to resize; the app reflows
with it.

Nothing in the plugin API offers this, so `src/hostLayout.ts` does it by editing
the host's DOM — which means it is written to three rules:

1. **Measure, don't guess.** The plugin renders a zero-size anchor in the
   workspace header and works outward from it. Toolbars are found by shape
   (full-width, short, near the top) rather than by selector, so a Ship Studio
   redesign degrades gracefully instead of breaking.
2. **Prove it worked.** After applying `padding-right` (then `width` as a
   fallback), it re-measures the widest pane. If that pane didn't actually get
   narrower, the change is reverted and the dock goes back to overlaying — a
   half-applied layout is worse than no layout.
3. **Always restorable.** Every change records the exact prior inline value and
   is undone on unpin, on close, and in `onDeactivate()`. Disabling the plugin
   can never leave the app squashed.

**Settings → Pinned layout** reports what happened: the container it picked, the
strategy that stuck, the measured toolbar height, plus **Re-detect** and **Undo
layout change**. Ship Studio has no devtools, so that panel is the only way to
see what the plugin did — read it first if the dock ever overlays instead of
docking.

One subtlety worth keeping: `hostLayout` fires a synthetic `resize` so panes that
size themselves react to the change, and it flags those events as its own. The
resize listener that re-measures the layout ignores flagged events — otherwise
each apply schedules another apply, and "Undo" is instantly reverted by the
resize it just fired.

## What it can't do

Ship Studio gives plugins no way to type into the terminal or start an agent —
`focusTerminal()` is the whole API. So the handoff is clipboard-based by
necessity. In practice that's a feature: you see the command and the model before
you press enter.

## Where the data lives

`{project}/.shipstudio/plugins/changelist/storage.json` — one JSON blob per
project, gitignored by Ship Studio's templates. Nothing leaves your machine
except what your chosen CLI sends when you press ✨ Improve.

## A flag asymmetry worth not "fixing"

Improve runs read-only on both CLIs, but gets there differently:

- **OpenCode** uses `run --agent plan`. Its plan agent is a *permission profile*,
  so it still answers a JSON-only brief verbatim. Without it, `run` uses the
  `build` agent, which may edit files in the project it runs in.
- **Claude Code** uses plain `-p` with **no** `--permission-mode plan`. Claude's
  plan mode is a *behavioural contract*, not just a permission profile: asked to
  reply with only a JSON object it answers with a plan and refuses — it reads the
  brief as an injection attempt. Print mode with a JSON-only brief is correct here.

Both behaviours were checked against the installed CLIs, and `test/agents.test.mjs`
asserts them so the asymmetry doesn't get tidied away later.

## Develop

```bash
npm install
npm run preview   # the UI in a browser, no Ship Studio and no network needed
npm test          # the pure layers: model, quoting, branch names, nudges, parsing
npm run build     # writes dist/index.js — commit it
```

The preview harness deliberately models three things that make it as hostile as
production — keep all of them, because each one hides a class of bug otherwise:

1. it **rebuilds the plugin context object on a timer**, so context-churn bugs
   (inputs resetting themselves, effects looping) show up offline;
2. the fake `invoke` **rejects a missing `projectPath`**, the way the real
   backend does;
3. the toolbar slot sits inside a **dropdown that unmounts its contents**, and
   the publish slot can be toggled off — so the pin feature is tested against
   the conditions that would break it.

Console
helpers (`changeReset()`, `changeFlag('no-claude')`, `changeFlag('no-opencode')`,
`changeFlag('branch-fails')`, `changeFlag('branch-exists')`,
`changeFlag('claude-garbles')`, `changeFlag('dirty-repo')`) drive the paths that
are awkward to reach by hand.

Then in Ship Studio: **Plugins → Plugin Manager → Link Dev Plugin** and pick this
folder. After each change, rebuild and hit **Reload** on the plugin's row.

React is deliberately **not** bundled — it comes from
`window.__SHIPSTUDIO_REACT__`. Bundling a second copy breaks hooks instantly:

```bash
grep -c 'ReactCurrentDispatcher\|react-dom/client' dist/index.js   # must be 0
```

## Layout

| File | What's in it |
|---|---|
| `src/index.tsx` | State container: owns the list, saves it, wires the rest together |
| `src/dock.ts` | Window vs pinned state, position persistence, and which slot draws the panel |
| `src/hostLayout.ts` | The only file that edits Ship Studio's DOM — makes room for the pinned dock, and puts it back |
| `src/agents.ts` | The CLI registry — flags, presets, model handling. The only file that knows a tool's syntax |
| `src/catalogue.ts` | Reads each CLI's own model list and effort levels, so nothing is hardcoded |
| `src/model.ts` | The item and settings shapes, the storage schema guard, list operations |
| `src/send.ts` | Shell quoting, command assembly, branch-name slugs |
| `src/lint.ts` | The live nudges |
| `src/templates.ts` | The five prompt skeletons |
| `src/ai.ts` | ✨ Improve — the one-shot call and the parsing of its reply |
| `src/git.ts` | The one git mutation: create-or-switch branch |
| `src/ui/` | Presentational pieces |

`agents.ts`, `model.ts`, `send.ts`, `lint.ts`, `templates.ts` and the parsing half
of `ai.ts` are pure, and covered by `test/`.

Adding a third CLI is one entry in `AGENT_CLIS` — its flags, its plan-mode form,
and how to invoke it headlessly. Nothing in `ui/` needs to change.
