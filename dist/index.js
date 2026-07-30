import { useState, useEffect, useRef, useCallback } from "data:text/javascript,export default window.__SHIPSTUDIO_REACT__;export const useState=window.__SHIPSTUDIO_REACT__.useState;export const useEffect=window.__SHIPSTUDIO_REACT__.useEffect;export const useRef=window.__SHIPSTUDIO_REACT__.useRef;export const useCallback=window.__SHIPSTUDIO_REACT__.useCallback;export const useMemo=window.__SHIPSTUDIO_REACT__.useMemo;export const createElement=window.__SHIPSTUDIO_REACT__.createElement;";
const CLAUDE = {
  id: "claude",
  label: "Claude Code",
  binary: "claude",
  defaultCommands: {
    easy: "claude --permission-mode plan --model haiku {prompt}",
    normal: "claude --permission-mode plan --model sonnet {prompt}",
    hard: "claude --permission-mode plan --model opus {prompt}"
  },
  improveArgs: (brief, model, effort) => {
    const args = ["-p", brief, "--output-format", "json"];
    if (model.trim()) args.push("--model", model.trim());
    if (effort == null ? void 0 : effort.trim()) args.push("--effort", effort.trim());
    return args;
  },
  defaultImproveModel: "haiku",
  listsModels: false,
  modelSuggestions: ["haiku", "sonnet", "opus"],
  modelHint: "An alias like haiku, sonnet or opus, or a full model id.",
  midSessionModelSwitch: {
    supported: true,
    command: (model) => `/model ${model}`,
    how: "Claude Code can switch mid-session — paste the /model line first."
  },
  effort: {
    supported: true,
    flag: "--effort",
    scope: "always",
    // The levels come from `claude --help` at runtime; see catalogue.ts.
    levels: "fixed",
    how: "Applies to both sending and ✨ Improve."
  }
};
const OPENCODE = {
  id: "opencode",
  label: "OpenCode",
  binary: "opencode",
  defaultCommands: {
    easy: "opencode --agent plan --model opencode-go/hy3 --prompt {prompt}",
    normal: "opencode --agent plan --model opencode-go/glm-5.2 --prompt {prompt}",
    hard: "opencode --agent plan --model opencode-go/kimi-k3 --prompt {prompt}"
  },
  improveArgs: (brief, model, effort) => {
    const args = ["run", brief, "--agent", "plan"];
    if (model.trim()) args.push("--model", model.trim());
    if (effort == null ? void 0 : effort.trim()) args.push("--variant", effort.trim());
    return args;
  },
  defaultImproveModel: "opencode-go/hy3",
  listsModels: true,
  modelSuggestions: [],
  modelHint: "A provider/model id, as listed by `opencode models`.",
  midSessionModelSwitch: {
    supported: false,
    // `/models` opens an interactive picker; there is no `/model <id>` form and
    // no agent-switch command. A running session's model is fixed at launch.
    how: "OpenCode can't switch model mid-session — its /models is a picker. Start a new session to change it."
  },
  effort: {
    supported: true,
    flag: "--variant",
    // Verified against the installed CLI: --variant is on `opencode run` only.
    // The interactive command has no such flag, and the docs put reasoning
    // effort in opencode.json rather than on the command line.
    scope: "headless-only",
    levels: "per-model",
    how: "OpenCode takes effort only on headless runs, so this applies to ✨ Improve. For sessions, set reasoningEffort in opencode.json."
  }
};
const AGENT_CLIS = [CLAUDE, OPENCODE];
function findAgentCli(id) {
  return AGENT_CLIS.find((cli) => cli.id === id) ?? CLAUDE;
}
function readModelFromCommand(command) {
  const match = command.match(/--model[ =]([^\s]+)/);
  return match ? match[1] : null;
}
function withModel(command, model) {
  const trimmed = command.trim();
  if (!trimmed) return trimmed;
  if (/--model[ =][^\s]+/.test(trimmed)) {
    return trimmed.replace(/--model[ =][^\s]+/, `--model ${model}`);
  }
  const parts = trimmed.split(/\s+/);
  parts.splice(1, 0, "--model", model);
  return parts.join(" ");
}
function readEffortFromCommand(command, flag) {
  const match = command.match(new RegExp(`${flag}[ =]([^\\s]+)`));
  return match ? match[1] : null;
}
function withEffort(command, flag, effort) {
  const trimmed = command.trim();
  if (!trimmed) return trimmed;
  const existing = new RegExp(`\\s*${flag}[ =][^\\s]+`);
  const without = trimmed.replace(existing, "");
  if (!effort) return without;
  const parts = without.split(/\s+/);
  parts.splice(1, 0, flag, effort);
  return parts.join(" ");
}
async function copyText(text) {
  var _a;
  try {
    if ((_a = navigator.clipboard) == null ? void 0 : _a.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    return ok;
  } catch {
    return false;
  }
}
async function commandExists(shell, command) {
  const result = await shell.exec("sh", ["-c", `command -v ${command}`], { timeout: 15 }).catch(() => null);
  return Boolean(result && result.exit_code === 0 && result.stdout.trim());
}
function lastJsonLine(stdout) {
  const lines = stdout.split("\n").map((value) => value.trim()).filter(Boolean);
  return lines[lines.length - 1] ?? "";
}
const w = window;
function usePluginContext() {
  const React = w.__SHIPSTUDIO_REACT__;
  const CtxRef = w.__SHIPSTUDIO_PLUGIN_CONTEXT_REF__;
  if (CtxRef && (React == null ? void 0 : React.useContext)) {
    const ctx = React.useContext(CtxRef);
    if (ctx) return ctx;
  }
  return w.__SHIPSTUDIO_PLUGIN_CONTEXT__ ?? null;
}
function useTheme() {
  var _a;
  return ((_a = usePluginContext()) == null ? void 0 : _a.theme) ?? {
    bgPrimary: "var(--bg-primary)",
    bgSecondary: "var(--bg-secondary)",
    bgTertiary: "var(--bg-tertiary)",
    textPrimary: "var(--text-primary)",
    textSecondary: "var(--text-secondary)",
    textMuted: "var(--text-muted)",
    border: "var(--border)",
    accent: "var(--accent)",
    accentHover: "var(--accent)",
    action: "var(--action)",
    actionHover: "var(--action)",
    actionText: "#fff",
    error: "var(--error)",
    success: "var(--success)"
  };
}
function shellQuote(text) {
  return `'${text.replace(/'/g, `'\\''`)}'`;
}
function buildCommand(template, prompt) {
  const quoted = shellQuote(prompt);
  const trimmed = template.trim();
  if (!trimmed) return quoted;
  if (trimmed.includes("{prompt}")) return trimmed.split("{prompt}").join(quoted);
  return `${trimmed} ${quoted}`;
}
function buildClipboardText(item, settings, mode = settings.sendMode) {
  const prompt = item.prompt.trim() || item.title.trim();
  if (mode === "prompt-only") return prompt;
  return buildCommand(settings.commands[item.difficulty], prompt);
}
function slugify(title) {
  const slug = title.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/g, "");
  return slug || "change";
}
function suggestBranchName(title, prefix) {
  const cleanPrefix = prefix.trim().replace(/^\/+/, "");
  const slug = slugify(title);
  if (!cleanPrefix) return slug;
  return cleanPrefix.endsWith("/") ? `${cleanPrefix}${slug}` : `${cleanPrefix}/${slug}`;
}
function isValidBranchName(name2) {
  const value = name2.trim();
  if (!value) return false;
  if (/[\s~^:?*[\\]/.test(value)) return false;
  if (value.includes("..") || value.includes("@{")) return false;
  if (value.startsWith("-") || value.startsWith("/") || value.endsWith("/")) return false;
  if (value.endsWith(".") || value.endsWith(".lock")) return false;
  return true;
}
async function createOrSwitchBranch(shell, rawName) {
  const name2 = rawName.trim();
  if (!isValidBranchName(name2)) {
    return { ok: false, message: `"${name2}" isn't a valid git branch name.` };
  }
  const created = await shell.exec("git", ["checkout", "-b", name2], { timeout: 30 }).catch((error) => ({
    stdout: "",
    stderr: error instanceof Error ? error.message : String(error),
    exit_code: 1
  }));
  if (created.exit_code === 0) return { ok: true, action: "created", name: name2 };
  if (/already exists/i.test(created.stderr)) {
    const switched = await shell.exec("git", ["checkout", name2], { timeout: 30 }).catch(() => ({ stdout: "", stderr: "", exit_code: 1 }));
    if (switched.exit_code === 0) return { ok: true, action: "switched", name: name2 };
    return {
      ok: false,
      message: `Branch ${name2} exists but couldn't be checked out. ${switched.stderr.trim()}`.trim()
    };
  }
  return {
    ok: false,
    message: created.stderr.trim() || `Could not create branch ${name2}.`
  };
}
async function readBranchPrefix(ctx) {
  var _a;
  const projectPath = (_a = ctx.project) == null ? void 0 : _a.path;
  if (!projectPath) return "";
  try {
    const value = await ctx.invoke.call("get_branch_prefix_preference", {
      projectPath
    });
    if (typeof value === "string") return value;
    if (value && typeof value === "object") {
      const record = value;
      for (const key of ["prefix", "branchPrefix", "branch_prefix", "value"]) {
        if (typeof record[key] === "string") return record[key];
      }
    }
  } catch {
  }
  return "";
}
const DEFAULT_SETTINGS = {
  // Claude Code out of the box; the OpenCode preset is one click away in
  // Settings. Both live in `agents.ts` — this mirrors CLAUDE.defaultCommands.
  commands: {
    easy: "claude --permission-mode plan --model haiku {prompt}",
    normal: "claude --permission-mode plan --model sonnet {prompt}",
    hard: "claude --permission-mode plan --model opus {prompt}"
  },
  sendMode: "launch",
  createBranch: false,
  branchPrefix: "",
  improveCli: "claude",
  improveModel: "haiku",
  improveEffort: ""
};
function emptyStored() {
  return { schema: 1, items: [], settings: { ...DEFAULT_SETTINGS } };
}
const DIFFICULTIES$2 = ["easy", "normal", "hard"];
const STATUSES = ["todo", "doing", "done"];
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function asString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}
function readFields(raw) {
  const fields = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") fields[key] = value;
  }
  return fields;
}
function readItem(value) {
  if (!isRecord(value)) return null;
  const id = asString(value.id);
  if (!id) return null;
  const difficulty = value.difficulty;
  const status = value.status;
  const prompt = asString(value.prompt);
  const fields = isRecord(value.fields) ? readFields(value.fields) : {};
  const notes = typeof value.notes === "string" ? value.notes : prompt;
  return {
    id,
    title: asString(value.title),
    prompt,
    fields,
    notes,
    difficulty: DIFFICULTIES$2.includes(difficulty) ? difficulty : "normal",
    status: STATUSES.includes(status) ? status : "todo",
    template: asString(value.template) ? value.template : null,
    branchAtCapture: typeof value.branchAtCapture === "string" ? value.branchAtCapture : null,
    workBranch: typeof value.workBranch === "string" ? value.workBranch : null,
    createdAt: asString(value.createdAt, (/* @__PURE__ */ new Date()).toISOString()),
    sentAt: typeof value.sentAt === "string" ? value.sentAt : void 0,
    doneAt: typeof value.doneAt === "string" ? value.doneAt : void 0
  };
}
function readStored(raw) {
  if (!isRecord(raw) || raw.schema !== 1 || !Array.isArray(raw.items)) return emptyStored();
  const storedSettings = isRecord(raw.settings) ? raw.settings : {};
  const storedCommands = isRecord(storedSettings.commands) ? storedSettings.commands : {};
  return {
    schema: 1,
    items: raw.items.map(readItem).filter((item) => item !== null),
    settings: {
      commands: {
        easy: asString(storedCommands.easy, DEFAULT_SETTINGS.commands.easy),
        normal: asString(storedCommands.normal, DEFAULT_SETTINGS.commands.normal),
        hard: asString(storedCommands.hard, DEFAULT_SETTINGS.commands.hard)
      },
      sendMode: storedSettings.sendMode === "prompt-only" ? "prompt-only" : "launch",
      createBranch: storedSettings.createBranch === true,
      branchPrefix: asString(storedSettings.branchPrefix, DEFAULT_SETTINGS.branchPrefix),
      improveCli: storedSettings.improveCli === "opencode" ? "opencode" : "claude",
      improveModel: asString(storedSettings.improveModel, DEFAULT_SETTINGS.improveModel),
      improveEffort: asString(storedSettings.improveEffort, DEFAULT_SETTINGS.improveEffort)
    }
  };
}
function newId() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi == null ? void 0 : cryptoApi.randomUUID) return cryptoApi.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
function createItem(title, branchAtCapture) {
  return {
    id: newId(),
    title: title.trim(),
    prompt: "",
    fields: {},
    notes: "",
    difficulty: "normal",
    status: "todo",
    template: null,
    branchAtCapture,
    workBranch: null,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function updateItem(items, id, patch) {
  return items.map((item) => item.id === id ? { ...item, ...patch } : item);
}
function setStatus(items, id, status) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return items.map((item) => {
    if (item.id !== id) return item;
    if (status === "done") return { ...item, status, doneAt: now };
    if (status === "doing") return { ...item, status, sentAt: item.sentAt ?? now, doneAt: void 0 };
    return { ...item, status, doneAt: void 0 };
  });
}
function moveItem(items, id, direction) {
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return items;
  const status = items[index].status;
  let target = -1;
  for (let i = index + direction; i >= 0 && i < items.length; i += direction) {
    if (items[i].status === status) {
      target = i;
      break;
    }
  }
  if (target === -1) return items;
  const next = items.slice();
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
function removeItem(items, id) {
  return items.filter((item) => item.id !== id);
}
function branchForItem(item) {
  return item.workBranch ?? item.branchAtCapture;
}
function shouldShowBranch(branch, currentBranch) {
  if (!branch) return false;
  return branch !== currentBranch;
}
function groupItems(items) {
  return {
    doing: items.filter((item) => item.status === "doing"),
    todo: items.filter((item) => item.status === "todo"),
    done: items.filter((item) => item.status === "done")
  };
}
const DIFFICULTY_LABELS = {
  easy: "Easy",
  normal: "Normal",
  hard: "Hard"
};
function nextDifficulty(current) {
  const index = DIFFICULTIES$2.indexOf(current);
  return DIFFICULTIES$2[(index + 1) % DIFFICULTIES$2.length];
}
const STORAGE_KEY = "shipstudio-changelist-dock";
const MIN_DOCK_WIDTH = 260;
const MAX_DOCK_WIDTH = 720;
function clampWidth(width) {
  if (!Number.isFinite(width)) return 360;
  return Math.round(Math.min(MAX_DOCK_WIDTH, Math.max(MIN_DOCK_WIDTH, width)));
}
function getEffectiveDockWidth() {
  const half = Math.max(MIN_DOCK_WIDTH, Math.round(window.innerWidth / 2));
  return Math.min(state.dockWidth, half);
}
function defaultState() {
  return {
    open: false,
    mode: "window",
    x: Math.max(16, window.innerWidth - 420),
    y: 92,
    dockWidth: 360
  };
}
function load() {
  const base = defaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw);
    return {
      // `open` is deliberately not restored for window mode — see below.
      open: saved.mode === "pinned" ? saved.open !== false : false,
      mode: saved.mode === "pinned" ? "pinned" : "window",
      x: typeof saved.x === "number" ? saved.x : base.x,
      y: typeof saved.y === "number" ? saved.y : base.y,
      dockWidth: clampWidth(typeof saved.dockWidth === "number" ? saved.dockWidth : base.dockWidth)
    };
  } catch {
    return base;
  }
}
let state = load();
const listeners$1 = /* @__PURE__ */ new Set();
function emit() {
  for (const listener of listeners$1) listener();
}
function persist() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
  }
}
function getDock() {
  return state;
}
function setDock(patch) {
  state = { ...state, ...patch };
  if (patch.dockWidth !== void 0) state.dockWidth = clampWidth(state.dockWidth);
  persist();
  emit();
}
function clampToViewport(x, y, width = 380) {
  const maxX = Math.max(0, window.innerWidth - Math.min(width, window.innerWidth) - 8);
  const maxY = Math.max(0, window.innerHeight - 80);
  return {
    x: Math.min(Math.max(8, x), maxX),
    y: Math.min(Math.max(8, y), maxY)
  };
}
function useDock() {
  const [, force] = useState(0);
  useEffect(() => {
    const listener = () => force((n) => n + 1);
    listeners$1.add(listener);
    return () => {
      listeners$1.delete(listener);
    };
  }, []);
  return state;
}
const HOST_PRIORITY = { publish: 0, toolbar: 1 };
const mountedHosts = /* @__PURE__ */ new Set();
function bestHost() {
  let best = null;
  for (const host of mountedHosts) {
    if (best === null || HOST_PRIORITY[host] < HOST_PRIORITY[best]) best = host;
  }
  return best;
}
function useIsWindowHost(host) {
  const [owner, setOwner] = useState(bestHost);
  useEffect(() => {
    mountedHosts.add(host);
    const listener = () => setOwner(bestHost());
    listeners$1.add(listener);
    emit();
    return () => {
      mountedHosts.delete(host);
      listeners$1.delete(listener);
      emit();
    };
  }, [host]);
  return owner === host;
}
const EDGE_TOLERANCE = 6;
function isContentRegion(box, viewport2, headerBottom) {
  const reachesLeft = box.left <= EDGE_TOLERANCE;
  const reachesRight = box.right >= viewport2.width - EDGE_TOLERANCE;
  const reachesBottom = box.bottom >= viewport2.height - EDGE_TOLERANCE;
  const startsBelowHeader = box.top >= headerBottom - EDGE_TOLERANCE;
  const tallEnough = box.bottom - box.top >= 120;
  return reachesLeft && reachesRight && reachesBottom && startsBelowHeader && tallEnough;
}
function shrankBy(before, after, expected) {
  const moved = before.right - after.right;
  return moved >= expected * 0.7;
}
let mutations = [];
function setStyle(element, property, value) {
  const previous = element.style.getPropertyValue(property);
  mutations.push({ element, property, previous: previous === "" ? null : previous });
  element.style.setProperty(property, value);
}
function undoAll() {
  for (const mutation of mutations.reverse()) {
    if (mutation.previous === null || mutation.previous === "") {
      mutation.element.style.removeProperty(mutation.property);
    } else {
      mutation.element.style.setProperty(mutation.property, mutation.previous);
    }
  }
  mutations = [];
}
let report = {
  outcome: "off",
  strategy: null,
  container: null,
  headerBottom: 0,
  contentTop: 0,
  note: null
};
const listeners = /* @__PURE__ */ new Set();
function getLayoutReport() {
  return report;
}
function subscribeLayout(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function publish(next) {
  report = { ...report, ...next };
  for (const listener of listeners) listener();
}
let selfDispatchDepth = 0;
function nudgeHostLayout() {
  selfDispatchDepth += 1;
  window.dispatchEvent(new Event("resize"));
  window.setTimeout(() => {
    selfDispatchDepth = Math.max(0, selfDispatchDepth - 1);
  }, 300);
}
function isSelfDispatchedResize() {
  return selfDispatchDepth > 0;
}
function describe(element) {
  const id = element.id ? `#${element.id}` : "";
  const classes = element.className && typeof element.className === "string" ? "." + element.className.trim().split(/\s+/).slice(0, 3).join(".") : "";
  return `${element.tagName.toLowerCase()}${id}${classes}`.slice(0, 80);
}
const ANCHOR_SELECTOR = "[data-changelist-anchor]";
function viewport() {
  return { width: window.innerWidth, height: window.innerHeight };
}
function isOurs(element) {
  return Boolean(element.closest(".change-frame, .change-overlay"));
}
function measureHeaderBottom() {
  const view = viewport();
  let bottom = 0;
  for (const element of Array.from(document.body.querySelectorAll("*"))) {
    if (!(element instanceof HTMLElement) || isOurs(element)) continue;
    const box = element.getBoundingClientRect();
    const spansWidth = box.left <= EDGE_TOLERANCE && box.right >= view.width - EDGE_TOLERANCE;
    const isShort = box.height > 0 && box.height < view.height * 0.3;
    const nearTop = box.top < view.height * 0.35;
    if (spansWidth && isShort && nearTop) bottom = Math.max(bottom, box.bottom);
  }
  if (bottom === 0) {
    const anchor = document.querySelector(ANCHOR_SELECTOR);
    if (anchor) bottom = anchor.getBoundingClientRect().bottom;
  }
  return Math.round(bottom);
}
function findContentRegion(headerBottom) {
  const view = viewport();
  const queue = [document.body];
  while (queue.length > 0) {
    const element = queue.shift();
    if (element !== document.body && !isOurs(element)) {
      if (isContentRegion(element.getBoundingClientRect(), view, headerBottom)) return element;
    }
    for (const child of Array.from(element.children)) {
      if (child instanceof HTMLElement && !isOurs(child)) queue.push(child);
    }
  }
  return null;
}
function findVictim(container) {
  const view = viewport();
  let best = null;
  let bestWidth = 0;
  for (const child of Array.from(container.querySelectorAll("*"))) {
    if (!(child instanceof HTMLElement) || isOurs(child)) continue;
    const box = child.getBoundingClientRect();
    if (box.right < view.width - EDGE_TOLERANCE) continue;
    if (box.width > bestWidth) {
      bestWidth = box.width;
      best = child;
    }
  }
  return best;
}
const STRATEGIES = [
  {
    name: "padding-right",
    apply: (element, width) => {
      setStyle(element, "box-sizing", "border-box");
      setStyle(element, "padding-right", `${width}px`);
    }
  },
  {
    name: "width",
    apply: (element, width) => {
      const current = element.getBoundingClientRect().width;
      setStyle(element, "box-sizing", "border-box");
      setStyle(element, "width", `${Math.max(0, current - width)}px`);
    }
  }
];
function applyHostLayout(width) {
  restoreHostLayout();
  const headerBottom = measureHeaderBottom();
  const container = findContentRegion(headerBottom);
  if (!container) {
    publish({
      outcome: "fallback",
      strategy: null,
      container: null,
      headerBottom,
      contentTop: headerBottom,
      note: "Couldn't find a content area below the toolbars, so the dock overlays instead."
    });
    return report;
  }
  const contentTop = Math.round(container.getBoundingClientRect().top);
  const victim = findVictim(container);
  if (!victim) {
    publish({
      outcome: "fallback",
      strategy: null,
      container: describe(container),
      headerBottom,
      contentTop,
      note: "Nothing inside the content area reaches the right edge, so there was nothing to move."
    });
    return report;
  }
  for (const strategy of STRATEGIES) {
    const before = victim.getBoundingClientRect();
    strategy.apply(container, width);
    nudgeHostLayout();
    const after = victim.getBoundingClientRect();
    if (shrankBy(before, after, width)) {
      publish({
        outcome: "reflow",
        strategy: strategy.name,
        container: describe(container),
        headerBottom,
        contentTop: Math.round(container.getBoundingClientRect().top),
        note: null
      });
      return report;
    }
    undoAll();
  }
  publish({
    outcome: "fallback",
    strategy: null,
    container: describe(container),
    headerBottom,
    contentTop,
    note: "The layout didn't respond to padding or width, so the dock overlays instead."
  });
  return report;
}
function restoreHostLayout() {
  if (mutations.length > 0) undoAll();
  if (report.outcome !== "off") {
    publish({ outcome: "off", strategy: null, note: null });
    nudgeHostLayout();
  }
}
const STYLE_ID = "change-plugin-styles";
const CSS = `
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
  .change-modal,
  .change-row,
  .change-row-sent,
  .change-row-actions,
  .change-dot,
  .change-resize-handle {
    animation: none !important;
    transition: none !important;
  }
  .change-dot:hover { transform: none; }
}

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
.change-frame .change-picker-row,
.change-frame .change-button-row,
.change-frame .change-templates {
  display: flex !important;
  flex-direction: row !important;
}

.change-frame .change-settings,
.change-frame .change-fields,
.change-frame .change-field,
.change-frame .change-editor,
.change-frame .change-popover-body,
.change-frame .change-settings-grid {
  display: flex !important;
  flex-direction: column !important;
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
  /* An input's intrinsic min-content width is wide, and as a flex item its
     automatic minimum size holds it there no matter what the width property
     says. Without this the dock can't narrow without pushing content off. */
  min-width: 0;
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
  padding: 5px 7px;
  border-radius: 5px;
  font-size: 15px;
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
  animation: changeRowIn 0.16s ease-out;
  transition: opacity 0.14s ease-out, background 0.14s ease-out;
}

.change-row-main {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 9px;
}

/* The title is the row. Basis 0 so it absorbs all free space, and everything
   beside it is capped so it can never be squeezed to "Rework the …" again. */
.change-row-title {
  /* Content width, shrinking with an ellipsis when there isn't room — the
     spacer beside it takes the slack, so the "no prompt" marker stays next to
     the title rather than drifting to the far edge. */
  flex: 0 1 auto;
  min-width: 0;
  cursor: pointer;
  text-align: left;
  background: none;
  border: none;
  font: inherit;
  font-size: 13px;
  padding: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.change-row-title.change-done { text-decoration: line-through; opacity: 0.55; }

.change-row-spacer { flex: 1 1 0; min-width: 0; }

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
  background: none;
  padding: 0;
  cursor: pointer;
  transition: background 0.14s ease-out, transform 0.14s ease-out;
}
.change-dot-filled { background: currentColor; }
.change-dot:hover { transform: scale(1.25); }

.change-row-sent { animation: changeRowSent 0.7s ease-out; }

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

/* The template's boxes. One column, tight, so five of them still read as one
   form rather than five separate controls. */
.change-fields { display: flex; flex-direction: column; gap: 8px; min-width: 0; }

.change-field { display: flex; flex-direction: column; gap: 3px; min-width: 0; }

.change-field-name {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
}

/* Shorter than the free-text box: these hold a phrase, not a paragraph. */
.change-field-box { padding: 6px 8px; }
.change-field-multiline { min-height: 52px; resize: vertical; line-height: 1.5; }

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
}

/* ------------------------------------------------------------- settings */

.change-settings { display: flex; flex-direction: column; gap: 16px; }
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
function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}
function removeStyles() {
  var _a;
  (_a = document.getElementById(STYLE_ID)) == null ? void 0 : _a.remove();
}
function buildBrief(input) {
  const context = [
    input.projectName ? `Project: ${input.projectName}` : null,
    `Note title: ${input.title.trim() || "(none)"}`,
    `Rough prompt:
${input.prompt.trim() || "(empty — work from the title)"}`
  ].filter(Boolean).join("\n\n");
  return `You are tidying up a one-off instruction that a web developer is about to hand to a coding agent working on their website. Reply with ONE JSON object and nothing else — no prose before or after, no markdown code fence.

${context}

Reply with exactly this shape:

{
  "title": "a short label, under 60 characters, for their to-do list",
  "prompt": "the rewritten instruction",
  "difficulty": "easy | normal | hard"
}

Rules for the rewritten prompt:
- Keep it to what the note actually asks for. Do NOT invent requirements, extra features, acceptance criteria, tests, or accessibility work that were not mentioned.
- Make it specific about WHERE the change goes (page, section, component, file) and WHAT DONE LOOKS LIKE. If the note doesn't say, keep the author's own placeholder in angle brackets — e.g. <which page?> — rather than guessing. An honest blank is more useful than a confident wrong guess.
- Keep any concrete detail the author already gave: exact text, colours, sizes, file paths. Never paraphrase a quoted string.
- Plain sentences or short labelled lines. No headings, no bullet-point essays, no preamble like "Please".
- Aim for 2–6 lines. Shorter than the note is fine if the note was padded.

Rules for difficulty — this picks which model runs the task, so be honest:
- "easy": a wording, colour, spacing or copy change in one known place.
- "normal": a change across a few files, a new section, or a bug with clear steps.
- "hard": architecture, data flow, tricky state, anything vague or likely to need judgement.

Reply with the JSON object only.`;
}
const ANSI_PATTERN = new RegExp("\\u001b\\[[0-9;]*[A-Za-z]", "g");
function stripAnsi(text) {
  return text.replace(ANSI_PATTERN, "");
}
function extractJson(text) {
  const trimmed = stripAnsi(text).trim();
  if (!trimmed) return null;
  const candidates = [];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) candidates.push(fenced[1]);
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last > first) candidates.push(trimmed.slice(first, last + 1));
  candidates.push(trimmed);
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
    }
  }
  return null;
}
function unwrapCliOutput(stdout) {
  const line = lastJsonLine(stdout);
  try {
    const envelope = JSON.parse(line);
    if (typeof envelope.result === "string") return envelope.result;
  } catch {
  }
  return stdout;
}
function readImproved(value) {
  if (typeof value !== "object" || value === null) return null;
  const record = value;
  const prompt = typeof record.prompt === "string" ? record.prompt.trim() : "";
  if (!prompt) return null;
  const difficulty = record.difficulty;
  return {
    title: typeof record.title === "string" ? record.title.trim() : "",
    prompt,
    difficulty: difficulty === "easy" || difficulty === "hard" || difficulty === "normal" ? difficulty : "normal"
  };
}
async function improveWithAgent(shell, cli, input) {
  const args = cli.improveArgs(buildBrief(input), input.model, input.effort);
  const result = await shell.exec(cli.binary, args, { timeout: 180 }).catch((error) => ({
    stdout: "",
    stderr: error instanceof Error ? error.message : String(error),
    exit_code: 1
  }));
  if (result.exit_code !== 0) {
    const stderr = result.stderr.trim();
    if (/not found|ENOENT/i.test(stderr)) {
      return {
        ok: false,
        code: "no-cli",
        message: `The \`${cli.binary}\` command isn't on Ship Studio's PATH. Templates and hints still work.`
      };
    }
    return {
      ok: false,
      code: "failed",
      message: stderr || `${cli.label} exited without producing anything. Check that \`${cli.binary}\` runs in your terminal.`
    };
  }
  const improved = readImproved(extractJson(unwrapCliOutput(result.stdout)));
  if (!improved) {
    return {
      ok: false,
      code: "unparseable",
      message: `${cli.label} replied, but not with a rewritten prompt. Try again, or add a bit more detail.`
    };
  }
  return { ok: true, improved };
}
const PLACE_WORDS = [
  "page",
  "section",
  "component",
  "file",
  "header",
  "footer",
  "nav",
  "navbar",
  "menu",
  "hero",
  "button",
  "form",
  "card",
  "modal",
  "sidebar",
  "homepage",
  "home page",
  "landing",
  "about",
  "contact",
  "gallery",
  "blog"
];
const OUTCOME_WORDS = [
  "should",
  "instead",
  "so that",
  "must",
  "needs to",
  "make it",
  "turn it",
  "change it to",
  "expected",
  "want it"
];
const VAGUE_WORDS = [
  "nicer",
  "nice",
  "better",
  "cleaner",
  "prettier",
  "modern",
  "fresh",
  "pop",
  "cooler",
  "improve",
  "improved",
  "polish",
  "tidy up"
];
function containsAny(haystack, needles) {
  return needles.some((needle) => haystack.includes(needle));
}
function mentionsAFile(text) {
  return /[\w-]+\.(tsx?|jsx?|css|scss|html|md|astro|vue|svelte)\b/.test(text) || /\S\/\S/.test(text);
}
function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
function countBlanks(text) {
  return (text.match(/<[^>\n]+>/g) ?? []).length;
}
function lintPrompt(prompt) {
  const text = prompt.trim();
  if (!text) return [];
  const lower = text.toLowerCase();
  const nudges = [];
  const blanks = countBlanks(text);
  if (blanks > 0) {
    nudges.push({
      id: "blanks",
      message: blanks === 1 ? "1 blank still to fill in" : `${blanks} blanks still to fill in`
    });
  }
  if (!mentionsAFile(text) && !containsAny(lower, PLACE_WORDS)) {
    nudges.push({ id: "where", message: "no page, section or file named" });
  }
  if (!containsAny(lower, OUTCOME_WORDS)) {
    nudges.push({ id: "outcome", message: "no desired outcome — what does “done” look like?" });
  }
  if (wordCount(text) < 15) {
    nudges.push({ id: "short", message: "quite short — likely to need a follow-up round" });
  }
  if (containsAny(lower, VAGUE_WORDS)) {
    nudges.push({ id: "vague", message: "vague words like “nicer” — say what specifically" });
  }
  return nudges;
}
const TEMPLATES = [
  {
    id: "style",
    label: "Style",
    hint: "Spacing, colour, size, weight — how something looks.",
    fields: [
      { id: "what", label: "What", placeholder: "the hero headline" },
      { id: "where", label: "Where", placeholder: "home page, or src/components/Hero.tsx" },
      { id: "now", label: "Now", placeholder: "how it looks today" },
      { id: "should", label: "Should be", placeholder: "the size, spacing or colour you want" },
      { id: "keep", label: "Keep", placeholder: "what mustn't change" }
    ]
  },
  {
    id: "copy",
    label: "Copy",
    hint: "Wording — headlines, body text, button labels.",
    fields: [
      { id: "what", label: "What", placeholder: "the headline, a button label" },
      { id: "where", label: "Where", placeholder: "home page, hero section" },
      { id: "current", label: "Current text", placeholder: "paste it here", multiline: true },
      { id: "should", label: "Should say", placeholder: "the message, and the tone" },
      { id: "keep", label: "Keep", placeholder: "length limit, words to avoid" }
    ]
  },
  {
    id: "bug",
    label: "Bug",
    hint: "Something is broken and you can describe how to see it.",
    fields: [
      /*
       * `symptom`, not the shared `what`, on purpose. Elsewhere `what` names a
       * thing ("the hero headline"); here it describes a behaviour ("submits
       * twice"). Sharing the key would carry a noun into "What goes wrong" and
       * read as nonsense. `where` genuinely does mean the same thing, so it
       * stays shared.
       */
      { id: "symptom", label: "What goes wrong", placeholder: "the form submits twice" },
      { id: "where", label: "Where", placeholder: "contact page, or the file" },
      { id: "steps", label: "Steps", placeholder: "what you do to see it happen", multiline: true },
      { id: "expected", label: "Expected", placeholder: "what should happen instead" },
      { id: "only", label: "Only on", placeholder: "a browser or screen size, if not everywhere" }
    ]
  },
  {
    id: "new-section",
    label: "New section",
    hint: "Adding something that is not on the page yet.",
    fields: [
      { id: "what", label: "What to add", placeholder: "a testimonials section" },
      { id: "where", label: "Where", placeholder: "home page, below the hero" },
      { id: "content", label: "Content", placeholder: "headline, text, images, links", multiline: true },
      { id: "behaviour", label: "Behaviour", placeholder: "responsive rules, animation, where links go" },
      { id: "match", label: "Match", placeholder: "the existing section it should sit alongside" }
    ]
  },
  {
    id: "refactor",
    label: "Refactor",
    hint: "Tidying code without changing what the visitor sees.",
    fields: [
      { id: "what", label: "What", placeholder: "the file or component" },
      { id: "goal", label: "Goal", placeholder: "what should be easier afterwards" },
      { id: "keep", label: "Keep identical", placeholder: "the rendered output, the props it takes" },
      { id: "avoid", label: "Don't", placeholder: "rename things, touch other files" }
    ]
  }
];
function findTemplate(id) {
  if (!id) return null;
  return TEMPLATES.find((template) => template.id === id) ?? null;
}
function composePrompt(template, fields, notes) {
  const lines = [];
  if (template) {
    for (const field of template.fields) {
      const value = (fields[field.id] ?? "").trim();
      if (!value) continue;
      lines.push(value.includes("\n") ? `${field.label}:
${value}` : `${field.label}: ${value}`);
    }
  }
  const trailing = notes.trim();
  if (!lines.length) return trailing;
  if (!trailing) return lines.join("\n");
  return `${lines.join("\n")}

${trailing}`;
}
const ShipReact$5 = window.__SHIPSTUDIO_REACT__;
function Modal({
  title,
  onClose,
  headerExtra,
  children
}) {
  const theme = useTheme();
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return /* @__PURE__ */ ShipReact$5.createElement("div", { className: "change-overlay", onClick: onClose }, /* @__PURE__ */ ShipReact$5.createElement(
    "div",
    {
      className: "change-modal",
      style: {
        background: theme.bgPrimary,
        color: theme.textPrimary,
        border: `1px solid ${theme.border}`
      },
      onClick: (event) => event.stopPropagation()
    },
    /* @__PURE__ */ ShipReact$5.createElement("div", { className: "change-modal-header", style: { borderBottom: `1px solid ${theme.border}` } }, /* @__PURE__ */ ShipReact$5.createElement("span", null, title), /* @__PURE__ */ ShipReact$5.createElement("span", { className: "change-header-actions" }, headerExtra, /* @__PURE__ */ ShipReact$5.createElement(
      "button",
      {
        className: "change-close",
        style: { color: theme.textMuted },
        title: "Close",
        onClick: onClose
      },
      "✕"
    ))),
    /* @__PURE__ */ ShipReact$5.createElement("div", { className: "change-modal-body" }, children)
  ));
}
function PanelFrame({
  title,
  onClose,
  headerExtra,
  children
}) {
  const theme = useTheme();
  const dock = useDock();
  const pinned = dock.mode === "pinned";
  const dragOffset = useRef(null);
  const bodyRef = useRef(null);
  useWheelFallback(bodyRef);
  useEffect(() => {
    if (pinned) return;
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pinned]);
  const startDrag = useCallback(
    (event) => {
      if (pinned) return;
      const current = getFrameOrigin(event.currentTarget);
      dragOffset.current = { dx: event.clientX - current.x, dy: event.clientY - current.y };
      const onMove = (move) => {
        const offset = dragOffset.current;
        if (!offset) return;
        move.preventDefault();
        setDock(clampToViewport(move.clientX - offset.dx, move.clientY - offset.dy));
      };
      const onUp = () => {
        dragOffset.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [pinned]
  );
  const contentTop = useContentTop();
  const viewportHeight = useViewportHeight();
  const frameStyle = pinned ? {
    width: getEffectiveDockWidth(),
    right: 0,
    top: contentTop,
    height: Math.max(160, viewportHeight - contentTop)
  } : { width: 380, left: dock.x, top: dock.y, maxHeight: "min(70vh, 620px)" };
  return /* @__PURE__ */ ShipReact$5.createElement(
    "div",
    {
      className: `change-frame${pinned ? " change-frame-pinned" : ""}`,
      style: {
        ...frameStyle,
        background: theme.bgPrimary,
        color: theme.textPrimary,
        border: `1px solid ${theme.border}`
      }
    },
    /* @__PURE__ */ ShipReact$5.createElement(
      "div",
      {
        className: `change-frame-header${pinned ? "" : " change-draggable"}`,
        style: { borderBottom: `1px solid ${theme.border}` },
        onMouseDown: startDrag
      },
      /* @__PURE__ */ ShipReact$5.createElement("span", { className: "change-frame-title" }, title),
      /* @__PURE__ */ ShipReact$5.createElement("span", { className: "change-header-actions" }, headerExtra, /* @__PURE__ */ ShipReact$5.createElement(PinButton, null), /* @__PURE__ */ ShipReact$5.createElement(
        "button",
        {
          className: "change-close",
          style: { color: theme.textMuted },
          title: "Close",
          onClick: onClose
        },
        "✕"
      ))
    ),
    /* @__PURE__ */ ShipReact$5.createElement("div", { className: "change-frame-body", ref: bodyRef }, children),
    pinned ? /* @__PURE__ */ ShipReact$5.createElement(DockResizeHandle, null) : null
  );
}
function useWheelFallback(ref) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const onWheel = (event) => {
      const canScroll = event.deltaY > 0 ? element.scrollTop < element.scrollHeight - element.clientHeight - 1 : element.scrollTop > 0;
      if (!canScroll) return;
      if (event.defaultPrevented) element.scrollTop += event.deltaY;
      event.stopPropagation();
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [ref]);
}
function useViewportHeight() {
  const [height, setHeight] = useState(() => window.innerHeight);
  useEffect(() => {
    const onResize = () => setHeight(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return height;
}
function useContentTop() {
  const [top, setTop] = useState(() => getLayoutReport().contentTop);
  useEffect(() => subscribeLayout(() => setTop(getLayoutReport().contentTop)), []);
  return top;
}
function DockResizeHandle() {
  const theme = useTheme();
  const startResize = useCallback((event) => {
    event.preventDefault();
    const onMove = (move) => {
      const next = Math.round(window.innerWidth - move.clientX);
      setDock({ dockWidth: Math.min(MAX_DOCK_WIDTH, Math.max(MIN_DOCK_WIDTH, next)) });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);
  return /* @__PURE__ */ ShipReact$5.createElement(
    "div",
    {
      className: "change-resize-handle",
      style: { background: theme.border },
      title: "Drag to resize",
      onMouseDown: startResize
    }
  );
}
function getFrameOrigin(headerElement) {
  const frame = headerElement.closest(".change-frame");
  const rect = (frame ?? headerElement).getBoundingClientRect();
  return { x: rect.left, y: rect.top };
}
function PinIcon({ filled }) {
  return /* @__PURE__ */ ShipReact$5.createElement(
    "svg",
    {
      width: "15",
      height: "15",
      viewBox: "0 0 24 24",
      fill: filled ? "currentColor" : "none",
      stroke: "currentColor",
      strokeWidth: "2"
    },
    /* @__PURE__ */ ShipReact$5.createElement(
      "path",
      {
        d: "M12 2C8.7 2 6 4.7 6 8c0 4.5 6 12 6 12s6-7.5 6-12c0-3.3-2.7-6-6-6z",
        strokeLinejoin: "round"
      }
    ),
    !filled ? /* @__PURE__ */ ShipReact$5.createElement("circle", { cx: "12", cy: "8", r: "2.2" }) : null
  );
}
function PinButton() {
  const theme = useTheme();
  const dock = useDock();
  const pinned = dock.mode === "pinned";
  return /* @__PURE__ */ ShipReact$5.createElement(
    "button",
    {
      className: "change-icon-btn",
      style: { color: pinned ? theme.accent : theme.textMuted },
      title: pinned ? "Unpin — back to a floating window" : "Pin to the right edge",
      "aria-label": pinned ? "Unpin" : "Pin to the right edge",
      "aria-pressed": pinned,
      onClick: () => setDock({ mode: pinned ? "window" : "pinned" })
    },
    /* @__PURE__ */ ShipReact$5.createElement(PinIcon, { filled: pinned })
  );
}
function IconButton({
  label,
  onClick,
  disabled,
  children,
  danger
}) {
  const theme = useTheme();
  return /* @__PURE__ */ ShipReact$5.createElement(
    "button",
    {
      className: "change-icon-btn",
      style: { color: danger ? theme.error : theme.textMuted },
      title: label,
      "aria-label": label,
      disabled,
      onClick
    },
    children
  );
}
function Spinner() {
  return /* @__PURE__ */ ShipReact$5.createElement("span", { className: "change-spinner" });
}
function Field({ label, children }) {
  const theme = useTheme();
  return /* @__PURE__ */ ShipReact$5.createElement("div", null, /* @__PURE__ */ ShipReact$5.createElement("label", { className: "change-field-label", style: { color: theme.textMuted } }, label), children);
}
const ShipReact$4 = window.__SHIPSTUDIO_REACT__;
function difficultyColor(difficulty, theme) {
  if (difficulty === "easy") return theme.success;
  if (difficulty === "hard") return "var(--warning, #f59e0b)";
  return theme.accent;
}
function ItemRow({
  item,
  expanded,
  currentBranch,
  onToggleExpand,
  onToggleDone,
  onCycleDifficulty,
  onSend,
  onOptions
}) {
  const theme = useTheme();
  const isDone = item.status === "done";
  const started = item.status === "doing" || isDone;
  const branch = branchForItem(item);
  const showBranch = shouldShowBranch(branch, currentBranch);
  const missingPrompt = !item.prompt.trim();
  const difficultyLabel = DIFFICULTY_LABELS[item.difficulty];
  const dotTitle = isDone ? `${difficultyLabel} · done — click to reopen` : `${difficultyLabel} · click to mark done`;
  return /* @__PURE__ */ ShipReact$4.createElement("div", { className: "change-row-main" }, /* @__PURE__ */ ShipReact$4.createElement(
    "button",
    {
      className: `change-dot${started ? " change-dot-filled" : ""}`,
      style: { color: difficultyColor(item.difficulty, theme) },
      title: dotTitle,
      "aria-label": isDone ? "Mark as not done" : "Mark as done",
      onClick: onToggleDone
    }
  ), /* @__PURE__ */ ShipReact$4.createElement(
    "button",
    {
      className: `change-row-title${isDone ? " change-done" : ""}`,
      style: { color: theme.textPrimary },
      title: expanded ? "Collapse" : "Open",
      onClick: onToggleExpand
    },
    item.title || /* @__PURE__ */ ShipReact$4.createElement("span", { style: { color: theme.textMuted } }, "Untitled change")
  ), missingPrompt && !isDone ? /* @__PURE__ */ ShipReact$4.createElement(
    "span",
    {
      className: "change-no-prompt",
      style: { color: theme.textMuted },
      title: "No prompt yet — sending would hand over just the title",
      "aria-label": "No prompt yet"
    },
    "…"
  ) : null, /* @__PURE__ */ ShipReact$4.createElement("span", { className: "change-row-spacer" }), showBranch ? (
    /*
     * An icon, not the name. The tag's real job is the binary signal "this
     * one isn't for the branch you're on" — as text it cost ~92px of a
     * 248px row and truncated the title to "Rework the booking flo…".
     * Capped smaller it would only have read "feat/rewo…", so the name
     * moves to the tooltip and the signal stays.
     */
    /* @__PURE__ */ ShipReact$4.createElement(
      "span",
      {
        className: "change-branch-mark",
        style: { color: theme.textMuted },
        title: `On branch ${branch}`,
        "aria-label": `On branch ${branch}`
      },
      /* @__PURE__ */ ShipReact$4.createElement("svg", { width: "11", height: "11", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.4" }, /* @__PURE__ */ ShipReact$4.createElement("circle", { cx: "6", cy: "5", r: "2.5" }), /* @__PURE__ */ ShipReact$4.createElement("circle", { cx: "6", cy: "19", r: "2.5" }), /* @__PURE__ */ ShipReact$4.createElement("circle", { cx: "18", cy: "9", r: "2.5" }), /* @__PURE__ */ ShipReact$4.createElement("path", { d: "M6 7.5v9M8.5 5.5h4.5a4 4 0 0 1 4 4v0", strokeLinecap: "round" }))
    )
  ) : null, !isDone ? (
    /* Revealed on hover and keyboard focus — see .change-row-actions. Kept
       in the DOM (opacity, not display) so they stay tabbable. */
    /* @__PURE__ */ ShipReact$4.createElement("span", { className: "change-row-actions" }, /* @__PURE__ */ ShipReact$4.createElement(IconButton, { label: "Send to the terminal", onClick: onSend }, /* @__PURE__ */ ShipReact$4.createElement("span", { style: { color: theme.accent, fontSize: 12 } }, "▶")), /* @__PURE__ */ ShipReact$4.createElement(IconButton, { label: "Send options", onClick: onOptions }, "⌄"))
  ) : null);
}
const ShipReact$3 = window.__SHIPSTUDIO_REACT__;
const DIFFICULTIES$1 = ["easy", "normal", "hard"];
function ItemEditor({
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
  onDelete
}) {
  const theme = useTheme();
  const boxStyle = {
    background: theme.bgPrimary,
    color: theme.textPrimary,
    border: `1px solid ${theme.border}`
  };
  const [improving, setImproving] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [error, setError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const nudges = lintPrompt(item.prompt);
  const template = findTemplate(item.template);
  const applyEdit = useCallback(
    (patch) => {
      const nextTemplateId = patch.template !== void 0 ? patch.template : item.template;
      const nextFields = patch.fields ?? item.fields;
      const nextNotes = patch.notes ?? item.notes;
      onChange({
        ...patch,
        prompt: composePrompt(findTemplate(nextTemplateId), nextFields, nextNotes)
      });
    },
    [item.fields, item.notes, item.template, onChange]
  );
  const setField = useCallback(
    (id, value) => applyEdit({ fields: { ...item.fields, [id]: value } }),
    [applyEdit, item.fields]
  );
  const pickTemplate = useCallback(
    (next) => applyEdit({ template: item.template === next.id ? null : next.id }),
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
        effort: improveEffort
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
      notes: suggestion.prompt,
      template: null,
      fields: {},
      difficulty: suggestion.difficulty,
      ...suggestion.title ? { title: suggestion.title } : {}
    });
    setSuggestion(null);
  }, [onChange, suggestion]);
  return /* @__PURE__ */ ShipReact$3.createElement("div", { className: "change-editor", style: { borderTop: `1px solid ${theme.border}` } }, /* @__PURE__ */ ShipReact$3.createElement(
    "input",
    {
      className: "change-input",
      style: {
        background: theme.bgPrimary,
        color: theme.textPrimary,
        border: `1px solid ${theme.border}`
      },
      value: item.title,
      placeholder: "What needs changing?",
      spellCheck: false,
      onChange: (event) => onChange({ title: event.target.value })
    }
  ), /* @__PURE__ */ ShipReact$3.createElement("div", { className: "change-difficulty-row" }, DIFFICULTIES$1.map((difficulty) => {
    const selected = item.difficulty === difficulty;
    const color = difficultyColor(difficulty, theme);
    return /* @__PURE__ */ ShipReact$3.createElement(
      "button",
      {
        key: difficulty,
        className: "change-radio",
        style: {
          background: selected ? "rgba(127, 127, 127, 0.14)" : "transparent",
          border: `1px solid ${selected ? color : theme.border}`,
          color: selected ? color : theme.textSecondary,
          fontWeight: selected ? 600 : 400
        },
        onClick: () => onChange({ difficulty })
      },
      DIFFICULTY_LABELS[difficulty]
    );
  })), /* @__PURE__ */ ShipReact$3.createElement("div", { className: "change-templates" }, TEMPLATES.map((entry) => /* @__PURE__ */ ShipReact$3.createElement(
    "button",
    {
      key: entry.id,
      className: "change-template-btn",
      style: {
        border: `1px solid ${item.template === entry.id ? theme.accent : theme.border}`,
        color: item.template === entry.id ? theme.accent : theme.textSecondary
      },
      title: entry.hint,
      "aria-pressed": item.template === entry.id,
      onClick: () => pickTemplate(entry)
    },
    entry.label
  ))), template ? /* @__PURE__ */ ShipReact$3.createElement("div", { className: "change-fields" }, template.fields.map((field) => /* @__PURE__ */ ShipReact$3.createElement("label", { className: "change-field", key: field.id }, /* @__PURE__ */ ShipReact$3.createElement("span", { className: "change-field-name", style: { color: theme.textMuted } }, field.label), field.multiline ? /* @__PURE__ */ ShipReact$3.createElement(
    "textarea",
    {
      className: "change-input change-field-box change-field-multiline",
      style: boxStyle,
      value: item.fields[field.id] ?? "",
      placeholder: field.placeholder,
      spellCheck: false,
      onChange: (event) => setField(field.id, event.target.value)
    }
  ) : /* @__PURE__ */ ShipReact$3.createElement(
    "input",
    {
      className: "change-input change-field-box",
      style: boxStyle,
      value: item.fields[field.id] ?? "",
      placeholder: field.placeholder,
      spellCheck: false,
      onChange: (event) => setField(field.id, event.target.value)
    }
  )))) : null, /* @__PURE__ */ ShipReact$3.createElement("label", { className: "change-field" }, template ? /* @__PURE__ */ ShipReact$3.createElement("span", { className: "change-field-name", style: { color: theme.textMuted } }, "Anything else") : null, /* @__PURE__ */ ShipReact$3.createElement(
    "textarea",
    {
      className: "change-textarea",
      style: boxStyle,
      value: item.notes,
      placeholder: template ? "Optional — anything the boxes above don’t cover" : "The instruction you'll hand to your agent. Or pick a template above to fill in boxes instead.",
      spellCheck: false,
      onChange: (event) => applyEdit({ notes: event.target.value })
    }
  )), item.prompt.trim() ? /* @__PURE__ */ ShipReact$3.createElement("div", null, /* @__PURE__ */ ShipReact$3.createElement(
    "button",
    {
      className: "change-fold",
      style: { color: theme.textMuted, marginBottom: showPrompt ? 6 : 0 },
      "aria-expanded": showPrompt,
      onClick: () => setShowPrompt(!showPrompt)
    },
    showPrompt ? "▾" : "▸",
    " Prompt (",
    item.prompt.trim().split(/\s+/).length,
    " words)"
  ), showPrompt ? /* @__PURE__ */ ShipReact$3.createElement(
    "div",
    {
      className: "change-code",
      style: {
        background: theme.bgSecondary,
        color: theme.textSecondary,
        border: `1px solid ${theme.border}`
      }
    },
    item.prompt
  ) : null) : null, nudges.length > 0 ? /* @__PURE__ */ ShipReact$3.createElement("div", { className: "change-nudges", style: { color: theme.textMuted } }, nudges.map((nudge) => /* @__PURE__ */ ShipReact$3.createElement("span", { className: "change-nudge", key: nudge.id }, /* @__PURE__ */ ShipReact$3.createElement("span", { style: { opacity: 0.7 } }, "•"), nudge.message))) : null, error ? /* @__PURE__ */ ShipReact$3.createElement("div", { className: "change-warning", style: { background: "rgba(240, 74, 74, 0.12)", color: theme.error } }, error) : null, suggestion ? /* @__PURE__ */ ShipReact$3.createElement(
    "div",
    {
      className: "change-diff",
      style: { background: theme.bgSecondary, border: `1px solid ${theme.border}` }
    },
    /* @__PURE__ */ ShipReact$3.createElement("span", { className: "change-field-label", style: { color: theme.textMuted, marginBottom: 0 } }, "Suggested rewrite"),
    /* @__PURE__ */ ShipReact$3.createElement("div", { className: "change-diff-text" }, suggestion.prompt),
    /* @__PURE__ */ ShipReact$3.createElement("div", { style: { fontSize: 11, color: theme.textMuted } }, "Also sets difficulty to", " ", /* @__PURE__ */ ShipReact$3.createElement("strong", { style: { color: difficultyColor(suggestion.difficulty, theme) } }, DIFFICULTY_LABELS[suggestion.difficulty]), suggestion.title && suggestion.title !== item.title ? /* @__PURE__ */ ShipReact$3.createElement(ShipReact$3.Fragment, null, " ", "and the title to “", suggestion.title, "”") : null, "."),
    /* @__PURE__ */ ShipReact$3.createElement("div", { className: "change-button-row" }, /* @__PURE__ */ ShipReact$3.createElement(
      "button",
      {
        className: "change-btn",
        style: { background: theme.action, color: theme.actionText },
        onClick: acceptSuggestion
      },
      "Use this"
    ), /* @__PURE__ */ ShipReact$3.createElement(
      "button",
      {
        className: "change-btn",
        style: { background: "transparent", color: theme.textMuted, border: `1px solid ${theme.border}` },
        onClick: () => setSuggestion(null)
      },
      "Discard"
    ))
  ) : null, /* @__PURE__ */ ShipReact$3.createElement("div", { className: "change-editor-actions" }, improveAvailable ? /* @__PURE__ */ ShipReact$3.createElement(
    "button",
    {
      className: "change-btn",
      style: { background: "transparent", color: theme.accent, border: `1px solid ${theme.border}` },
      disabled: improving || !item.prompt.trim() && !item.title.trim(),
      title: `Rewrite this prompt with ${cli.label}${improveModel ? ` (${improveModel})` : ""}`,
      onClick: () => void improve()
    },
    improving ? /* @__PURE__ */ ShipReact$3.createElement(Spinner, null) : /* @__PURE__ */ ShipReact$3.createElement("span", null, "✨"),
    /* @__PURE__ */ ShipReact$3.createElement("span", null, improving ? `Asking ${cli.label}…` : "Improve")
  ) : null, /* @__PURE__ */ ShipReact$3.createElement("span", { className: "change-spacer" }), /* @__PURE__ */ ShipReact$3.createElement(IconButton, { label: "Move up", onClick: () => onMove(-1), disabled: !canMoveUp }, "↑"), /* @__PURE__ */ ShipReact$3.createElement(IconButton, { label: "Move down", onClick: () => onMove(1), disabled: !canMoveDown }, "↓"), confirmDelete ? /* @__PURE__ */ ShipReact$3.createElement(ShipReact$3.Fragment, null, /* @__PURE__ */ ShipReact$3.createElement("span", { style: { fontSize: 11, color: theme.textMuted } }, "Delete?"), /* @__PURE__ */ ShipReact$3.createElement(
    "button",
    {
      className: "change-btn",
      style: { background: theme.error, color: "#fff", padding: "4px 9px" },
      onClick: onDelete
    },
    "Yes"
  ), /* @__PURE__ */ ShipReact$3.createElement(
    "button",
    {
      className: "change-btn",
      style: {
        background: "transparent",
        color: theme.textMuted,
        border: `1px solid ${theme.border}`,
        padding: "4px 9px"
      },
      onClick: () => setConfirmDelete(false)
    },
    "No"
  )) : /* @__PURE__ */ ShipReact$3.createElement(IconButton, { label: "Delete this change", danger: true, onClick: () => setConfirmDelete(true) }, "✕")));
}
const ShipReact$2 = window.__SHIPSTUDIO_REACT__;
function SendPanel({
  item,
  settings,
  branchPrefix,
  hasUncommittedChanges,
  busy,
  onSend,
  onClose
}) {
  const theme = useTheme();
  const [mode, setMode] = useState(settings.sendMode);
  const [createBranch, setCreateBranch] = useState(settings.createBranch);
  const [branchName, setBranchName] = useState(
    () => item.workBranch ?? suggestBranchName(item.title, branchPrefix)
  );
  const clipboardText = buildClipboardText(item, settings, mode);
  const branchOk = !createBranch || isValidBranchName(branchName);
  const hasPrompt = Boolean(item.prompt.trim() || item.title.trim());
  const commandForItem = settings.commands[item.difficulty];
  const binary = commandForItem.trim().split(/\s+/)[0] ?? "";
  const cli = findAgentCli(binary === "opencode" ? "opencode" : "claude");
  const targetModel = readModelFromCommand(commandForItem);
  const switching = cli.midSessionModelSwitch;
  return /* @__PURE__ */ ShipReact$2.createElement(Modal, { title: "Send to the terminal", onClose }, /* @__PURE__ */ ShipReact$2.createElement("div", { className: "change-popover-body" }, /* @__PURE__ */ ShipReact$2.createElement(Field, { label: "Where this is going" }, /* @__PURE__ */ ShipReact$2.createElement("div", { className: "change-radio-row" }, /* @__PURE__ */ ShipReact$2.createElement(
    ModeButton,
    {
      selected: mode === "launch",
      title: "New agent",
      detail: "paste in a terminal tab",
      onClick: () => setMode("launch")
    }
  ), /* @__PURE__ */ ShipReact$2.createElement(
    ModeButton,
    {
      selected: mode === "prompt-only",
      title: "Message a running agent",
      detail: "paste in the agent's box",
      onClick: () => setMode("prompt-only")
    }
  ))), /* @__PURE__ */ ShipReact$2.createElement(Field, { label: mode === "launch" ? "Command that gets copied" : "Text that gets copied" }, /* @__PURE__ */ ShipReact$2.createElement(
    "div",
    {
      className: "change-code change-mono",
      style: {
        background: theme.bgSecondary,
        color: theme.textSecondary,
        border: `1px solid ${theme.border}`
      }
    },
    clipboardText || "(nothing to send — give this change a title or a prompt first)"
  ), mode === "launch" ? /* @__PURE__ */ ShipReact$2.createElement("div", { className: "change-settings-note", style: { color: theme.textMuted, marginTop: 7 } }, "Paste at a ", /* @__PURE__ */ ShipReact$2.createElement("strong", null, "shell prompt"), " in a normal terminal tab. Pasted into a running agent it becomes a chat message — the flags do nothing and the model won’t change.") : /* @__PURE__ */ ShipReact$2.createElement(ModelWarning, { cli, switching, targetModel })), /* @__PURE__ */ ShipReact$2.createElement("div", null, /* @__PURE__ */ ShipReact$2.createElement("label", { className: "change-check", style: { color: theme.textPrimary } }, /* @__PURE__ */ ShipReact$2.createElement(
    "input",
    {
      type: "checkbox",
      checked: createBranch,
      onChange: (event) => setCreateBranch(event.target.checked)
    }
  ), "Create a git branch for this change first"), createBranch ? /* @__PURE__ */ ShipReact$2.createElement("div", { style: { marginTop: 9 } }, /* @__PURE__ */ ShipReact$2.createElement(
    "input",
    {
      className: "change-input change-mono",
      style: {
        background: theme.bgPrimary,
        color: theme.textPrimary,
        border: `1px solid ${branchOk ? theme.border : theme.error}`
      },
      value: branchName,
      spellCheck: false,
      placeholder: "branch-name",
      onChange: (event) => setBranchName(event.target.value)
    }
  ), !branchOk ? /* @__PURE__ */ ShipReact$2.createElement("div", { style: { color: theme.error, fontSize: 11, marginTop: 5 } }, "Git won’t accept that name — no spaces or ", /* @__PURE__ */ ShipReact$2.createElement("code", null, "~^:?*["), ".") : null, hasUncommittedChanges ? /* @__PURE__ */ ShipReact$2.createElement(
    "div",
    {
      className: "change-warning",
      style: { background: "rgba(245, 158, 11, 0.12)", color: "var(--warning, #f59e0b)", marginTop: 8 }
    },
    "You have uncommitted changes. They’ll come along to the new branch — commit or stash them first if they belong where they are."
  ) : null) : null), /* @__PURE__ */ ShipReact$2.createElement("div", { className: "change-button-row" }, /* @__PURE__ */ ShipReact$2.createElement(
    "button",
    {
      className: "change-btn",
      style: { background: theme.action, color: theme.actionText },
      disabled: busy || !branchOk || !hasPrompt,
      onClick: () => onSend({ mode, createBranch, branchName: branchName.trim() })
    },
    busy ? /* @__PURE__ */ ShipReact$2.createElement(Spinner, null) : /* @__PURE__ */ ShipReact$2.createElement("span", null, "▶"),
    /* @__PURE__ */ ShipReact$2.createElement("span", null, busy ? "Working…" : "Copy and focus terminal")
  ), /* @__PURE__ */ ShipReact$2.createElement(
    "button",
    {
      className: "change-btn",
      style: { background: "transparent", color: theme.textMuted, border: `1px solid ${theme.border}` },
      disabled: busy,
      onClick: onClose
    },
    "Cancel"
  ))));
}
function ModelWarning({
  cli,
  switching,
  targetModel
}) {
  const theme = useTheme();
  const [copied, setCopied] = useState(false);
  const line = switching.supported && targetModel ? switching.command(targetModel) : null;
  return /* @__PURE__ */ ShipReact$2.createElement(
    "div",
    {
      className: "change-warning",
      style: { background: "rgba(127, 127, 127, 0.12)", color: theme.textSecondary, marginTop: 7 }
    },
    "This uses whatever model that session already started with",
    targetModel ? `, not ${targetModel}` : "",
    ". ",
    switching.how,
    line ? /* @__PURE__ */ ShipReact$2.createElement("div", { style: { marginTop: 8 } }, /* @__PURE__ */ ShipReact$2.createElement(
      "button",
      {
        className: "change-btn",
        style: { background: "transparent", color: theme.accent, border: `1px solid ${theme.border}` },
        onClick: () => {
          void copyText(line).then((ok) => setCopied(ok));
        }
      },
      copied ? `Copied ${line}` : `Copy ${line}`
    )) : null
  );
}
function ModeButton({
  selected,
  title,
  detail,
  onClick
}) {
  const theme = useTheme();
  return /* @__PURE__ */ ShipReact$2.createElement(
    "button",
    {
      className: "change-radio",
      style: {
        background: selected ? "rgba(127, 127, 127, 0.14)" : "transparent",
        border: `1px solid ${selected ? theme.accent : theme.border}`,
        color: selected ? theme.textPrimary : theme.textSecondary
      },
      onClick
    },
    /* @__PURE__ */ ShipReact$2.createElement("strong", { style: { fontWeight: 600 } }, title),
    /* @__PURE__ */ ShipReact$2.createElement("br", null),
    /* @__PURE__ */ ShipReact$2.createElement("span", { style: { color: theme.textMuted, fontSize: 10.5 } }, detail)
  );
}
function parseOpenCodeCatalogue(stdout) {
  const models = [];
  for (const raw of extractJsonObjects(stdout)) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    const id = typeof parsed.id === "string" ? parsed.id : "";
    const provider = typeof parsed.providerID === "string" ? parsed.providerID : "";
    if (!id || !provider) continue;
    const cost = parsed.cost;
    const limit = parsed.limit;
    const capabilities = parsed.capabilities;
    const variants = parsed.variants;
    models.push({
      id: `${provider}/${id}`,
      provider,
      name: typeof parsed.name === "string" && parsed.name ? parsed.name : id,
      contextTokens: typeof (limit == null ? void 0 : limit.context) === "number" ? limit.context : null,
      // Both sides must be free; a zero input price with a paid output isn't.
      free: (cost == null ? void 0 : cost.input) === 0 && (cost == null ? void 0 : cost.output) === 0,
      reasoning: (capabilities == null ? void 0 : capabilities.reasoning) === true,
      variants: variants && typeof variants === "object" && !Array.isArray(variants) ? Object.keys(variants) : []
    });
  }
  return models;
}
function extractJsonObjects(text) {
  const objects = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        objects.push(text.slice(start, i + 1));
        start = -1;
      }
      if (depth < 0) depth = 0;
    }
  }
  return objects;
}
function describeModel(model) {
  const facts = [];
  if (model.contextTokens) facts.push(formatContext(model.contextTokens));
  if (model.free) facts.push("free");
  return facts.length > 0 ? `${model.name} · ${facts.join(" · ")}` : model.name;
}
function formatContext(tokens) {
  if (tokens >= 1e6) return `${Math.round(tokens / 1e5) / 10}M`;
  return `${Math.round(tokens / 1e3)}k`;
}
function parseClaudeCapabilities(helpText) {
  const effortMatch = helpText.match(/--effort[\s\S]{0,200}?\(([^)]+)\)/);
  const effortLevels = effortMatch ? effortMatch[1].split(",").map((value) => value.trim()).filter((value) => /^[a-z][a-z-]*$/.test(value)) : [];
  const modelSection = helpText.match(/--model <model>[\s\S]{0,400}/);
  const quoted = modelSection ? [...modelSection[0].matchAll(/'([a-z][\w.-]*)'/g)].map((m) => m[1]) : [];
  const aliases = quoted.filter((value) => !value.includes("-") || !value.startsWith("claude"));
  return {
    effortLevels: effortLevels.length > 0 ? effortLevels : DEFAULT_EFFORT_LEVELS,
    aliases: mergeAliases(aliases)
  };
}
const DEFAULT_EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"];
function mergeAliases(discovered) {
  const curated = ["haiku", "sonnet", "opus", "fable"];
  const extras = discovered.filter((alias) => !curated.includes(alias));
  return [...curated, ...extras];
}
const CONTAINING_BLOCK_PROPS = ["transform", "filter", "perspective", "contain", "backdropFilter"];
function describeElement(element) {
  const id = element.id ? `#${element.id}` : "";
  const classes = typeof element.className === "string" && element.className.trim() ? "." + element.className.trim().split(/\s+/).slice(0, 3).join(".") : "";
  return `${element.tagName.toLowerCase()}${id}${classes}`.slice(0, 60);
}
function rectOf(element) {
  const r = element.getBoundingClientRect();
  return {
    top: Math.round(r.top),
    left: Math.round(r.left),
    width: Math.round(r.width),
    height: Math.round(r.height),
    bottom: Math.round(r.bottom)
  };
}
function containingBlockAncestors(start) {
  const found = [];
  let node = start.parentElement;
  while (node && node !== document.documentElement) {
    const style = getComputedStyle(node);
    for (const prop of CONTAINING_BLOCK_PROPS) {
      const value = style[prop];
      if (value && value !== "none" && value !== "normal") {
        found.push(`${describeElement(node)} { ${prop}: ${value.slice(0, 40)} }`);
        break;
      }
    }
    node = node.parentElement;
  }
  return found;
}
function collectDiagnostics() {
  const frame = document.querySelector(".change-frame");
  const body = document.querySelector(".change-frame-body");
  if (!frame || !body) return "Change List: panel is not open, so there is nothing to measure.";
  const frameStyle = getComputedStyle(frame);
  const bodyStyle = getComputedStyle(body);
  const overflows = body.scrollHeight > body.clientHeight + 1;
  const canScroll = bodyStyle.overflowY === "auto" || bodyStyle.overflowY === "scroll";
  const runsOffScreen = frame.getBoundingClientRect().bottom > window.innerHeight + 1;
  const verdict = !overflows ? "Content fits — nothing to scroll. If text looks cut off, the panel is sized wrong, not unscrollable." : !canScroll ? `BLOCKED: content overflows by ${body.scrollHeight - body.clientHeight}px but computed overflow-y is "${bodyStyle.overflowY}" — the host stylesheet is overriding ours.` : runsOffScreen ? "Scrollable, but the panel extends below the window — a positioning problem." : "Healthy: content overflows and the container is scrollable.";
  const payload = {
    verdict,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    devicePixelRatio: window.devicePixelRatio,
    mode: frame.classList.contains("change-frame-pinned") ? "pinned" : "window",
    frame: {
      rect: rectOf(frame),
      position: frameStyle.position,
      height: frameStyle.height,
      maxHeight: frameStyle.maxHeight,
      overflow: frameStyle.overflow,
      display: frameStyle.display,
      flexDirection: frameStyle.flexDirection,
      // If this exceeds the viewport height, the bottom of the panel is
      // off-screen and no amount of scrolling inside it will help.
      extendsBelowViewport: frame.getBoundingClientRect().bottom > window.innerHeight + 1
    },
    body: {
      rect: rectOf(body),
      clientHeight: body.clientHeight,
      scrollHeight: body.scrollHeight,
      scrollTop: body.scrollTop,
      overflowY: bodyStyle.overflowY,
      flex: `${bodyStyle.flexGrow} ${bodyStyle.flexShrink} ${bodyStyle.flexBasis}`,
      minHeight: bodyStyle.minHeight,
      // The single most telling number: false means there is nothing to scroll,
      // which points at sizing rather than at the scroll gesture.
      contentOverflows: body.scrollHeight > body.clientHeight + 1,
      maxScrollTop: Math.max(0, body.scrollHeight - body.clientHeight)
    },
    // Non-empty means `position: fixed` is not resolving against the viewport.
    containingBlockAncestors: containingBlockAncestors(frame),
    scrollableAncestorsOfBody: (() => {
      const chain = [];
      let node = body.parentElement;
      while (node && chain.length < 6) {
        const s = getComputedStyle(node);
        chain.push(`${describeElement(node)} { overflow:${s.overflow}; height:${s.height} }`);
        node = node.parentElement;
      }
      return chain;
    })()
  };
  return JSON.stringify(payload, null, 2);
}
const ShipReact$1 = window.__SHIPSTUDIO_REACT__;
const DIFFICULTIES = ["easy", "normal", "hard"];
function binaryOf(command) {
  return command.trim().split(/\s+/)[0] ?? "";
}
function CommandPickers({
  command,
  models,
  selectedModel,
  effortFlag,
  effortLevels,
  effortApplies,
  effortNote,
  onChange
}) {
  const theme = useTheme();
  const selectStyle = {
    background: theme.bgPrimary,
    color: theme.textPrimary,
    border: `1px solid ${theme.border}`
  };
  const groups = [...new Set(models.map((m) => m.group).filter(Boolean))];
  const currentEffort = effortFlag ? readEffortFromCommand(command, effortFlag) : null;
  return /* @__PURE__ */ ShipReact$1.createElement("div", { className: "change-picker-row" }, models.length > 0 ? /* @__PURE__ */ ShipReact$1.createElement(
    "select",
    {
      className: "change-select",
      style: selectStyle,
      value: selectedModel ?? "",
      title: "Model",
      onChange: (event) => onChange(withModel(command, event.target.value))
    },
    selectedModel && !models.some((m) => m.value === selectedModel) ? /* @__PURE__ */ ShipReact$1.createElement("option", { value: selectedModel }, selectedModel, " (not in list)") : null,
    !selectedModel ? /* @__PURE__ */ ShipReact$1.createElement("option", { value: "" }, "Default model") : null,
    groups.length > 0 ? groups.map((group) => /* @__PURE__ */ ShipReact$1.createElement("optgroup", { key: group, label: group }, models.filter((m) => m.group === group).map((m) => /* @__PURE__ */ ShipReact$1.createElement("option", { key: m.value, value: m.value }, m.label)))) : models.map((m) => /* @__PURE__ */ ShipReact$1.createElement("option", { key: m.value, value: m.value }, m.label))
  ) : null, effortFlag && effortLevels.length > 0 ? /* @__PURE__ */ ShipReact$1.createElement(
    "select",
    {
      className: "change-select change-select-effort",
      style: { ...selectStyle, opacity: effortApplies ? 1 : 0.5 },
      value: currentEffort ?? "",
      disabled: !effortApplies,
      title: effortApplies ? "Reasoning effort" : effortNote ?? "Not available here",
      onChange: (event) => onChange(withEffort(command, effortFlag, event.target.value))
    },
    /* @__PURE__ */ ShipReact$1.createElement("option", { value: "" }, "Default effort"),
    effortLevels.map((level) => /* @__PURE__ */ ShipReact$1.createElement("option", { key: level, value: level }, level))
  ) : null);
}
function matchesPreset(commands, cli) {
  return DIFFICULTIES.every((difficulty) => commands[difficulty] === cli.defaultCommands[difficulty]);
}
function SettingsView({
  settings,
  detectedPrefix,
  installedClis,
  shell,
  onChange
}) {
  const theme = useTheme();
  const [openCodeModels, setOpenCodeModels] = useState([]);
  const [claudeCaps, setClaudeCaps] = useState(
    () => parseClaudeCapabilities("")
  );
  const [pendingPreset, setPendingPreset] = useState(null);
  const shellRef = useRef(shell);
  shellRef.current = shell;
  const hasOpenCode = installedClis.opencode === true;
  const hasClaude = installedClis.claude === true;
  useEffect(() => {
    if (!hasOpenCode) return;
    let cancelled = false;
    void (async () => {
      const current = shellRef.current;
      if (!current) return;
      const result = await current.exec("opencode", ["models", "--verbose"], { timeout: 30 }).catch(() => null);
      if (cancelled || !result || result.exit_code !== 0) return;
      setOpenCodeModels(parseOpenCodeCatalogue(result.stdout));
    })();
    return () => {
      cancelled = true;
    };
  }, [hasOpenCode]);
  useEffect(() => {
    if (!hasClaude) return;
    let cancelled = false;
    void (async () => {
      const current = shellRef.current;
      if (!current) return;
      const result = await current.exec("claude", ["--help"], { timeout: 20 }).catch(() => null);
      if (cancelled || !result) return;
      setClaudeCaps(parseClaudeCapabilities(result.stdout || result.stderr));
    })();
    return () => {
      cancelled = true;
    };
  }, [hasClaude]);
  const inputStyle = {
    background: theme.bgPrimary,
    color: theme.textPrimary,
    border: `1px solid ${theme.border}`
  };
  const isCustomised = !AGENT_CLIS.some((cli) => matchesPreset(settings.commands, cli));
  const applyPreset = (cli) => {
    onChange({ commands: { ...cli.defaultCommands } });
    setPendingPreset(null);
  };
  const pickPreset = (cli) => {
    if (isCustomised) setPendingPreset(cli);
    else applyPreset(cli);
  };
  const pickersFor = (command, headless) => {
    var _a;
    const binary = binaryOf(command);
    const cli = AGENT_CLIS.find((entry) => entry.binary === binary) ?? null;
    const selectedModel = readModelFromCommand(command);
    const models = binary === "opencode" ? openCodeModels.map((model) => ({
      value: model.id,
      label: describeModel(model),
      group: model.provider,
      variants: model.variants
    })) : binary === "claude" ? claudeCaps.aliases.map((alias) => ({ value: alias, label: alias, group: null, variants: [] })) : [];
    let effortLevels = [];
    if (cli == null ? void 0 : cli.effort.supported) {
      effortLevels = cli.effort.levels === "per-model" ? ((_a = models.find((m) => m.value === selectedModel)) == null ? void 0 : _a.variants) ?? [] : claudeCaps.effortLevels;
    }
    const effortApplies = (cli == null ? void 0 : cli.effort.supported) === true && (cli.effort.scope === "always" || headless);
    return {
      cli,
      models,
      selectedModel,
      effortFlag: (cli == null ? void 0 : cli.effort.supported) ? cli.effort.flag : null,
      effortLevels,
      effortApplies,
      effortNote: (cli == null ? void 0 : cli.effort.supported) ? cli.effort.how : null
    };
  };
  return /* @__PURE__ */ ShipReact$1.createElement("div", { className: "change-settings" }, /* @__PURE__ */ ShipReact$1.createElement(Field, { label: "Agent CLI" }, /* @__PURE__ */ ShipReact$1.createElement("div", { className: "change-radio-row" }, AGENT_CLIS.map((cli) => {
    const installed = installedClis[cli.id] === true;
    const active = matchesPreset(settings.commands, cli);
    return /* @__PURE__ */ ShipReact$1.createElement(
      "button",
      {
        key: cli.id,
        className: "change-radio",
        style: {
          background: active ? "rgba(127, 127, 127, 0.14)" : "transparent",
          border: `1px solid ${active ? theme.accent : theme.border}`,
          color: installed ? theme.textPrimary : theme.textMuted,
          opacity: installed ? 1 : 0.6
        },
        disabled: !installed,
        title: installed ? `Fill the three commands below with ${cli.label} defaults` : `\`${cli.binary}\` isn't on Ship Studio's PATH`,
        onClick: () => pickPreset(cli)
      },
      /* @__PURE__ */ ShipReact$1.createElement("strong", { style: { fontWeight: 600 } }, cli.label),
      /* @__PURE__ */ ShipReact$1.createElement("br", null),
      /* @__PURE__ */ ShipReact$1.createElement("span", { style: { color: theme.textMuted, fontSize: 10.5 } }, installed ? "Use these defaults" : "not installed")
    );
  })), pendingPreset ? /* @__PURE__ */ ShipReact$1.createElement(
    "div",
    {
      className: "change-warning change-button-row",
      style: {
        background: "rgba(127, 127, 127, 0.12)",
        color: theme.textSecondary,
        marginTop: 8
      }
    },
    /* @__PURE__ */ ShipReact$1.createElement("span", { style: { flex: "1 1 140px", minWidth: 0 } }, "Replace your edited commands with the ", pendingPreset.label, " defaults?"),
    /* @__PURE__ */ ShipReact$1.createElement(
      "button",
      {
        className: "change-btn",
        style: { background: theme.action, color: theme.actionText },
        onClick: () => applyPreset(pendingPreset)
      },
      "Replace"
    ),
    /* @__PURE__ */ ShipReact$1.createElement(
      "button",
      {
        className: "change-btn",
        style: { background: "transparent", color: theme.textMuted, border: `1px solid ${theme.border}` },
        onClick: () => setPendingPreset(null)
      },
      "Cancel"
    )
  ) : null, /* @__PURE__ */ ShipReact$1.createElement("div", { className: "change-settings-note", style: { color: theme.textMuted, marginTop: 8 } }, "Both presets start the agent in ", /* @__PURE__ */ ShipReact$1.createElement("strong", null, "plan mode"), " with your prompt as the first message, so it proposes before it edits.")), /* @__PURE__ */ ShipReact$1.createElement(Field, { label: "Command per difficulty" }, /* @__PURE__ */ ShipReact$1.createElement("div", { className: "change-settings-grid" }, DIFFICULTIES.map((difficulty) => {
    const command = settings.commands[difficulty];
    const pickers = pickersFor(command, false);
    return /* @__PURE__ */ ShipReact$1.createElement("div", { key: difficulty, style: { display: "flex", flexDirection: "column", gap: 5 } }, /* @__PURE__ */ ShipReact$1.createElement("div", { className: "change-settings-row" }, /* @__PURE__ */ ShipReact$1.createElement(
      "span",
      {
        className: "change-settings-key",
        style: { color: difficultyColor(difficulty, theme) }
      },
      DIFFICULTY_LABELS[difficulty]
    ), /* @__PURE__ */ ShipReact$1.createElement(
      CommandPickers,
      {
        command,
        models: pickers.models,
        selectedModel: pickers.selectedModel,
        effortFlag: pickers.effortFlag,
        effortLevels: pickers.effortLevels,
        effortApplies: pickers.effortApplies,
        effortNote: pickers.effortNote,
        onChange: (next) => onChange({ commands: { ...settings.commands, [difficulty]: next } })
      }
    )), /* @__PURE__ */ ShipReact$1.createElement(
      "input",
      {
        className: "change-input change-mono change-command-input",
        style: inputStyle,
        value: command,
        spellCheck: false,
        onChange: (event) => onChange({
          commands: { ...settings.commands, [difficulty]: event.target.value }
        })
      }
    ));
  })), /* @__PURE__ */ ShipReact$1.createElement("div", { className: "change-settings-note", style: { color: theme.textMuted, marginTop: 8 } }, /* @__PURE__ */ ShipReact$1.createElement("code", null, "{prompt}"), " is replaced with the prompt, quoted so apostrophes and line breaks survive. The top box picks the model; the box under it is the whole command, and you can put anything there — including a different tool per difficulty.")), /* @__PURE__ */ ShipReact$1.createElement(Field, { label: "Default send mode" }, /* @__PURE__ */ ShipReact$1.createElement("div", { className: "change-radio-row" }, /* @__PURE__ */ ShipReact$1.createElement(
    "button",
    {
      className: "change-radio",
      style: {
        background: settings.sendMode === "launch" ? "rgba(127, 127, 127, 0.14)" : "transparent",
        border: `1px solid ${settings.sendMode === "launch" ? theme.accent : theme.border}`,
        color: theme.textSecondary
      },
      onClick: () => onChange({ sendMode: "launch" })
    },
    "New agent"
  ), /* @__PURE__ */ ShipReact$1.createElement(
    "button",
    {
      className: "change-radio",
      style: {
        background: settings.sendMode === "prompt-only" ? "rgba(127, 127, 127, 0.14)" : "transparent",
        border: `1px solid ${settings.sendMode === "prompt-only" ? theme.accent : theme.border}`,
        color: theme.textSecondary
      },
      onClick: () => onChange({ sendMode: "prompt-only" })
    },
    "Message a running agent"
  )), /* @__PURE__ */ ShipReact$1.createElement("div", { className: "change-settings-note", style: { color: theme.textMuted, marginTop: 6 } }, "A new agent means pasting the command at a ", /* @__PURE__ */ ShipReact$1.createElement("strong", null, "shell prompt"), " in a normal terminal tab — that’s the only way the model in the command applies.")), /* @__PURE__ */ ShipReact$1.createElement(Field, { label: "Branches" }, /* @__PURE__ */ ShipReact$1.createElement("label", { className: "change-check", style: { color: theme.textPrimary, marginBottom: 9 } }, /* @__PURE__ */ ShipReact$1.createElement(
    "input",
    {
      type: "checkbox",
      checked: settings.createBranch,
      onChange: (event) => onChange({ createBranch: event.target.checked })
    }
  ), "Offer to create a branch on every send"), /* @__PURE__ */ ShipReact$1.createElement(
    "input",
    {
      className: "change-input change-mono",
      style: inputStyle,
      value: settings.branchPrefix,
      spellCheck: false,
      placeholder: detectedPrefix ? `${detectedPrefix} (from Ship Studio)` : "prefix, e.g. feat/",
      onChange: (event) => onChange({ branchPrefix: event.target.value })
    }
  ), /* @__PURE__ */ ShipReact$1.createElement("div", { className: "change-settings-note", style: { color: theme.textMuted, marginTop: 6 } }, "Branch names are suggested from the change title. Ticking the box above opens the send options every time, so you always see the name before git runs.")), /* @__PURE__ */ ShipReact$1.createElement(
    ImproveSettings,
    {
      settings,
      installedClis,
      openCodeModels,
      claudeCaps,
      onChange
    }
  ), /* @__PURE__ */ ShipReact$1.createElement(LayoutDiagnostics, null));
}
function LayoutDiagnostics() {
  const theme = useTheme();
  const dock = useDock();
  const [report2, setReport] = useState(getLayoutReport);
  useEffect(() => subscribeLayout(() => setReport(getLayoutReport())), []);
  const pinned = dock.mode === "pinned" && dock.open;
  const summary = report2.outcome === "reflow" ? "Ship Studio made room — the dock sits beside the app." : report2.outcome === "fallback" ? "Could not resize the app, so the dock is overlaying it." : "Not pinned, so the layout is untouched.";
  const tone = report2.outcome === "reflow" ? theme.success : report2.outcome === "fallback" ? "var(--warning, #f59e0b)" : theme.textMuted;
  return /* @__PURE__ */ ShipReact$1.createElement(Field, { label: "Pinned layout" }, /* @__PURE__ */ ShipReact$1.createElement("div", { style: { color: tone, fontSize: 12, marginBottom: 8 } }, summary), report2.note ? /* @__PURE__ */ ShipReact$1.createElement("div", { className: "change-settings-note", style: { color: theme.textMuted, marginBottom: 8 } }, report2.note) : null, /* @__PURE__ */ ShipReact$1.createElement(
    "div",
    {
      className: "change-code change-mono",
      style: {
        background: theme.bgSecondary,
        color: theme.textSecondary,
        border: `1px solid ${theme.border}`
      }
    },
    [
      `outcome:  ${report2.outcome}`,
      `strategy: ${report2.strategy ?? "—"}`,
      `container:${report2.container ?? "—"}`,
      `header:   ${report2.headerBottom}px`,
      `content:  ${report2.contentTop}px`,
      `width:    ${dock.dockWidth}px`
    ].join("\n")
  ), /* @__PURE__ */ ShipReact$1.createElement("div", { className: "change-button-row", style: { marginTop: 8 } }, /* @__PURE__ */ ShipReact$1.createElement(
    "button",
    {
      className: "change-btn",
      style: { background: "transparent", color: theme.accent, border: `1px solid ${theme.border}` },
      disabled: !pinned,
      title: pinned ? "Measure the layout again" : "Pin the panel first",
      onClick: () => applyHostLayout(dock.dockWidth)
    },
    "Re-detect"
  ), /* @__PURE__ */ ShipReact$1.createElement(
    "button",
    {
      className: "change-btn",
      style: { background: "transparent", color: theme.textMuted, border: `1px solid ${theme.border}` },
      title: "Put Ship Studio's layout back, leaving the dock overlaying",
      onClick: () => restoreHostLayout()
    },
    "Undo layout change"
  ), /* @__PURE__ */ ShipReact$1.createElement(CopyDiagnosticsButton, null)), /* @__PURE__ */ ShipReact$1.createElement("div", { className: "change-settings-note", style: { color: theme.textMuted, marginTop: 8 } }, "The dock resizes Ship Studio’s content area so nothing is covered. Drag the dock’s left edge to change its width. Everything is put back when you unpin."));
}
function CopyDiagnosticsButton() {
  const theme = useTheme();
  const [copied, setCopied] = useState(false);
  return /* @__PURE__ */ ShipReact$1.createElement(
    "button",
    {
      className: "change-btn",
      style: { background: "transparent", color: copied ? theme.success : theme.textMuted, border: `1px solid ${theme.border}` },
      title: "Copy a layout snapshot to the clipboard, for reporting a display bug",
      onClick: () => {
        void copyText(collectDiagnostics()).then((ok) => {
          setCopied(ok);
          window.setTimeout(() => setCopied(false), 2e3);
        });
      }
    },
    copied ? "Copied" : "Copy diagnostics"
  );
}
function ImproveSettings({
  settings,
  installedClis,
  openCodeModels,
  claudeCaps,
  onChange
}) {
  var _a;
  const theme = useTheme();
  const cli = findAgentCli(settings.improveCli);
  const installed = installedClis[cli.id] === true;
  const models = cli.listsModels ? openCodeModels.map((model) => ({
    value: model.id,
    label: describeModel(model),
    group: model.provider,
    variants: model.variants
  })) : claudeCaps.aliases.map((alias) => ({ value: alias, label: alias, group: null, variants: [] }));
  const effortLevels = cli.effort.supported ? cli.effort.levels === "per-model" ? ((_a = models.find((m) => m.value === settings.improveModel)) == null ? void 0 : _a.variants) ?? [] : claudeCaps.effortLevels : [];
  return /* @__PURE__ */ ShipReact$1.createElement(Field, { label: "✨ Improve" }, /* @__PURE__ */ ShipReact$1.createElement("div", { className: "change-radio-row" }, AGENT_CLIS.map((entry) => {
    const entryInstalled = installedClis[entry.id] === true;
    const active = settings.improveCli === entry.id;
    return /* @__PURE__ */ ShipReact$1.createElement(
      "button",
      {
        key: entry.id,
        className: "change-radio",
        style: {
          background: active ? "rgba(127, 127, 127, 0.14)" : "transparent",
          border: `1px solid ${active ? theme.accent : theme.border}`,
          color: entryInstalled ? theme.textSecondary : theme.textMuted,
          opacity: entryInstalled ? 1 : 0.6
        },
        disabled: !entryInstalled,
        title: entryInstalled ? void 0 : `\`${entry.binary}\` isn't on Ship Studio's PATH`,
        onClick: () => (
          // Effort is reset with the CLI: the levels are CLI-specific, so
          // carrying "xhigh" over to OpenCode would be an invalid value.
          onChange({
            improveCli: entry.id,
            improveModel: entry.defaultImproveModel,
            improveEffort: ""
          })
        )
      },
      entry.label
    );
  })), /* @__PURE__ */ ShipReact$1.createElement("div", { className: "change-picker-row", style: { marginTop: 9 } }, /* @__PURE__ */ ShipReact$1.createElement(
    "select",
    {
      className: "change-select",
      style: {
        background: theme.bgPrimary,
        color: theme.textPrimary,
        border: `1px solid ${theme.border}`
      },
      value: settings.improveModel,
      title: "Model",
      onChange: (event) => onChange({ improveModel: event.target.value, improveEffort: "" })
    },
    !models.some((m) => m.value === settings.improveModel) ? /* @__PURE__ */ ShipReact$1.createElement("option", { value: settings.improveModel }, settings.improveModel || "Default", " (not in list)") : null,
    [...new Set(models.map((m) => m.group).filter(Boolean))].length > 0 ? [...new Set(models.map((m) => m.group).filter(Boolean))].map((group) => /* @__PURE__ */ ShipReact$1.createElement("optgroup", { key: group, label: group }, models.filter((m) => m.group === group).map((m) => /* @__PURE__ */ ShipReact$1.createElement("option", { key: m.value, value: m.value }, m.label)))) : models.map((m) => /* @__PURE__ */ ShipReact$1.createElement("option", { key: m.value, value: m.value }, m.label))
  ), effortLevels.length > 0 ? /* @__PURE__ */ ShipReact$1.createElement(
    "select",
    {
      className: "change-select change-select-effort",
      style: {
        background: theme.bgPrimary,
        color: theme.textPrimary,
        border: `1px solid ${theme.border}`
      },
      value: settings.improveEffort,
      title: "Reasoning effort",
      onChange: (event) => onChange({ improveEffort: event.target.value })
    },
    /* @__PURE__ */ ShipReact$1.createElement("option", { value: "" }, "Default effort"),
    effortLevels.map((level) => /* @__PURE__ */ ShipReact$1.createElement("option", { key: level, value: level }, level))
  ) : null), /* @__PURE__ */ ShipReact$1.createElement("div", { className: "change-settings-note", style: { color: theme.textMuted, marginTop: 6 } }, installed ? `${cli.modelHint} Runs read-only — it can't edit your files.` : `\`${cli.binary}\` isn't on Ship Studio's PATH, so Improve is hidden. Templates and hints still work.`));
}
const ShipReact = window.__SHIPSTUDIO_REACT__;
const SAVE_DEBOUNCE_MS = 400;
function Icon() {
  return /* @__PURE__ */ ShipReact.createElement("svg", { width: "15", height: "15", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" }, /* @__PURE__ */ ShipReact.createElement("path", { d: "M3 6l2 2 3.5-3.5", strokeLinecap: "round", strokeLinejoin: "round" }), /* @__PURE__ */ ShipReact.createElement("path", { d: "M3 15l2 2 3.5-3.5", strokeLinecap: "round", strokeLinejoin: "round" }), /* @__PURE__ */ ShipReact.createElement("path", { d: "M13 6.5h8M13 15.5h8", strokeLinecap: "round" }));
}
function Panel({ onClose }) {
  const ctx = usePluginContext();
  const theme = useTheme();
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const [stored, setStored] = useState(emptyStored);
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState("list");
  const [expandedId, setExpandedId] = useState(null);
  const [sendId, setSendId] = useState(null);
  const [sending, setSending] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [justSentId, setJustSentId] = useState(null);
  const [installedClis, setInstalledClis] = useState({});
  const [detectedPrefix, setDetectedPrefix] = useState("");
  const storedRef = useRef(stored);
  storedRef.current = stored;
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const context = ctxRef.current;
      if (!(context == null ? void 0 : context.project)) {
        setHydrated(true);
        return;
      }
      const raw = await context.storage.read().catch(() => ({}));
      const prefix = await readBranchPrefix(context);
      const found = {};
      for (const cli of AGENT_CLIS) {
        found[cli.id] = await commandExists(context.shell, cli.binary);
      }
      if (cancelled) return;
      const restored = readStored(raw);
      const isFirstRun = !raw.settings;
      const openCodeCli = AGENT_CLIS.find((cli) => cli.id === "opencode");
      if (isFirstRun && openCodeCli && found.opencode && !found.claude) {
        restored.settings.commands = { ...openCodeCli.defaultCommands };
        restored.settings.improveCli = "opencode";
        restored.settings.improveModel = openCodeCli.defaultImproveModel;
      }
      setStored(restored);
      setDetectedPrefix(prefix);
      setInstalledClis(found);
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const dirtyRef = useRef(false);
  const persist2 = useCallback(async () => {
    const context = ctxRef.current;
    if (!(context == null ? void 0 : context.project) || !dirtyRef.current) return;
    dirtyRef.current = false;
    try {
      await context.storage.write(storedRef.current);
    } catch {
      dirtyRef.current = true;
    }
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    dirtyRef.current = true;
    const timer = window.setTimeout(() => void persist2(), SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [stored, hydrated, persist2]);
  useEffect(() => () => void persist2(), [persist2]);
  const setItems = useCallback((update) => {
    setStored((previous) => ({ ...previous, items: update(previous.items) }));
  }, []);
  const patchSettings = useCallback((patch) => {
    setStored((previous) => ({ ...previous, settings: { ...previous.settings, ...patch } }));
  }, []);
  const addFromDraft = useCallback(() => {
    var _a, _b;
    const title = draft.trim();
    if (!title) return;
    const item = createItem(title, ((_b = (_a = ctxRef.current) == null ? void 0 : _a.project) == null ? void 0 : _b.currentBranch) ?? null);
    setItems((items) => [...items, item]);
    setDraft("");
  }, [draft, setItems]);
  const patchItem = useCallback(
    (id, patch) => setItems((items) => updateItem(items, id, patch)),
    [setItems]
  );
  const toggleDone = useCallback(
    (item) => setItems((items) => setStatus(items, item.id, item.status === "done" ? "todo" : "done")),
    [setItems]
  );
  const performSend = useCallback(
    async (item, options) => {
      const context = ctxRef.current;
      if (!(context == null ? void 0 : context.project)) return;
      setSending(true);
      try {
        let workBranch = item.workBranch;
        if (options.createBranch) {
          const outcome = await createOrSwitchBranch(context.shell, options.branchName);
          if (!outcome.ok) {
            context.actions.showToast(outcome.message, "error");
            return;
          }
          workBranch = outcome.name;
          context.actions.refreshGitStatus();
          context.actions.refreshBranches();
        }
        const text = buildClipboardText(item, storedRef.current.settings, options.mode);
        const copied = await copyText(text);
        if (!copied) {
          context.actions.showToast(
            "Could not reach the clipboard. Open the send options and copy the command by hand.",
            "error"
          );
          return;
        }
        context.actions.focusTerminal();
        setItems((items) => updateItem(setStatus(items, item.id, "doing"), item.id, { workBranch }));
        setSendId(null);
        setJustSentId(item.id);
        window.setTimeout(() => setJustSentId((id) => id === item.id ? null : id), 700);
        const where = options.mode === "launch" ? "paste at a shell prompt in a terminal tab" : "paste into the running agent";
        context.actions.showToast(
          options.createBranch && workBranch ? `On ${workBranch} — copied, ${where}` : `Copied — ${where}`,
          "success"
        );
      } finally {
        setSending(false);
      }
    },
    [setItems]
  );
  const quickSend = useCallback(
    (item) => {
      const settings = storedRef.current.settings;
      if (settings.createBranch) {
        setSendId(item.id);
        return;
      }
      void performSend(item, { mode: settings.sendMode, createBranch: false, branchName: "" });
    },
    [performSend]
  );
  if (!(ctx == null ? void 0 : ctx.project)) {
    return /* @__PURE__ */ ShipReact.createElement(PanelFrame, { title: "Change List", onClose }, /* @__PURE__ */ ShipReact.createElement("div", { className: "change-empty", style: { color: theme.textMuted } }, "Open a project first.", /* @__PURE__ */ ShipReact.createElement("br", null), "Each project keeps its own list of changes."));
  }
  const groups = groupItems(stored.items);
  const openCount = groups.todo.length + groups.doing.length;
  const sendItem = sendId ? stored.items.find((item) => item.id === sendId) ?? null : null;
  const effectivePrefix = stored.settings.branchPrefix.trim() || detectedPrefix;
  const currentBranch = ctx.project.currentBranch;
  const improveAvailable = installedClis[stored.settings.improveCli] === true;
  const renderGroup = (label, items) => items.length === 0 ? null : /* @__PURE__ */ ShipReact.createElement("div", { className: "change-group", key: label }, /* @__PURE__ */ ShipReact.createElement("div", { className: "change-group-label", style: { color: theme.textMuted } }, label), items.map((item, index) => {
    var _a;
    return /* @__PURE__ */ ShipReact.createElement(
      "div",
      {
        key: item.id,
        className: `change-row${expandedId === item.id ? " change-row-expanded" : ""}${justSentId === item.id ? " change-row-sent" : ""}`,
        style: {
          background: theme.bgSecondary,
          border: `1px solid ${expandedId === item.id ? theme.accent : theme.border}`,
          // An accent edge on the item currently in flight, so the eye lands
          // on what you're working on. Inset shadow rather than a border so
          // it doesn't fight the border above.
          ...item.status === "doing" ? { boxShadow: `inset 3px 0 0 ${theme.accent}` } : null
        }
      },
      /* @__PURE__ */ ShipReact.createElement(
        ItemRow,
        {
          item,
          expanded: expandedId === item.id,
          currentBranch,
          onToggleExpand: () => setExpandedId(expandedId === item.id ? null : item.id),
          onToggleDone: () => toggleDone(item),
          onCycleDifficulty: () => patchItem(item.id, { difficulty: nextDifficulty(item.difficulty) }),
          onSend: () => quickSend(item),
          onOptions: () => setSendId(item.id)
        }
      ),
      expandedId === item.id ? /* @__PURE__ */ ShipReact.createElement(
        ItemEditor,
        {
          item,
          shell: ctx.shell,
          projectName: ((_a = ctx.project) == null ? void 0 : _a.name) ?? null,
          improveCli: stored.settings.improveCli,
          improveModel: stored.settings.improveModel,
          improveEffort: stored.settings.improveEffort,
          improveAvailable,
          canMoveUp: index > 0,
          canMoveDown: index < items.length - 1,
          onChange: (patch) => patchItem(item.id, patch),
          onMove: (direction) => setItems((current) => moveItem(current, item.id, direction)),
          onDelete: () => {
            setItems((current) => removeItem(current, item.id));
            setExpandedId(null);
          }
        }
      ) : null
    );
  }));
  const settingsView = view === "settings";
  return /* @__PURE__ */ ShipReact.createElement(ShipReact.Fragment, null, /* @__PURE__ */ ShipReact.createElement(
    PanelFrame,
    {
      title: settingsView ? "Settings" : /* @__PURE__ */ ShipReact.createElement(ShipReact.Fragment, null, "Change List", openCount > 0 ? /* @__PURE__ */ ShipReact.createElement("span", { style: { color: theme.textMuted, fontWeight: 400 } }, " · ", openCount, " open") : null),
      onClose,
      headerExtra: settingsView ? /* @__PURE__ */ ShipReact.createElement(IconButton, { label: "Back to the list", onClick: () => setView("list") }, "← Back") : /* @__PURE__ */ ShipReact.createElement(IconButton, { label: "Settings", onClick: () => setView("settings") }, "⚙")
    },
    settingsView ? /* @__PURE__ */ ShipReact.createElement(
      SettingsView,
      {
        settings: stored.settings,
        detectedPrefix,
        installedClis,
        shell: ctx.shell,
        onChange: patchSettings
      }
    ) : /* @__PURE__ */ ShipReact.createElement(ShipReact.Fragment, null, /* @__PURE__ */ ShipReact.createElement("div", { className: "change-capture" }, /* @__PURE__ */ ShipReact.createElement(
      "input",
      {
        className: "change-input",
        style: {
          background: theme.bgSecondary,
          color: theme.textPrimary,
          border: `1px solid ${theme.border}`
        },
        value: draft,
        placeholder: "Something to change…",
        spellCheck: false,
        onChange: (event) => setDraft(event.target.value),
        onKeyDown: (event) => {
          if (event.key === "Enter") addFromDraft();
        }
      }
    ), /* @__PURE__ */ ShipReact.createElement(
      "button",
      {
        className: "change-btn",
        style: { background: theme.action, color: theme.actionText },
        disabled: !draft.trim(),
        onClick: addFromDraft
      },
      "Add"
    )), /* @__PURE__ */ ShipReact.createElement("div", { className: "change-capture-hint", style: { color: theme.textMuted } }, "Jot the title now, press Enter, write the prompt later."), !hydrated ? /* @__PURE__ */ ShipReact.createElement("div", { className: "change-empty", style: { color: theme.textMuted } }, "Loading…") : stored.items.length === 0 ? /* @__PURE__ */ ShipReact.createElement("div", { className: "change-empty", style: { color: theme.textMuted } }, "Nothing on the list yet.", /* @__PURE__ */ ShipReact.createElement("br", null), "Add changes as you notice them, then send them to your agent one at a time.") : null, renderGroup("In progress", groups.doing), renderGroup("To do", groups.todo), groups.done.length > 0 ? /* @__PURE__ */ ShipReact.createElement("div", { className: "change-group" }, /* @__PURE__ */ ShipReact.createElement(
      "button",
      {
        className: "change-fold",
        style: { color: theme.textMuted },
        onClick: () => setDoneOpen(!doneOpen)
      },
      doneOpen ? "▾" : "▸",
      " Done (",
      groups.done.length,
      ")"
    ), doneOpen ? groups.done.map((item) => /* @__PURE__ */ ShipReact.createElement(
      "div",
      {
        key: item.id,
        className: "change-row",
        style: { background: theme.bgSecondary, border: `1px solid ${theme.border}` }
      },
      /* @__PURE__ */ ShipReact.createElement(
        ItemRow,
        {
          item,
          expanded: false,
          currentBranch,
          onToggleExpand: () => setExpandedId(expandedId === item.id ? null : item.id),
          onToggleDone: () => toggleDone(item),
          onCycleDifficulty: () => {
          },
          onSend: () => quickSend(item),
          onOptions: () => setSendId(item.id)
        }
      )
    )) : null) : null)
  ), sendItem ? /* @__PURE__ */ ShipReact.createElement(
    SendPanel,
    {
      item: sendItem,
      settings: stored.settings,
      branchPrefix: effectivePrefix,
      hasUncommittedChanges: ctx.project.hasUncommittedChanges,
      busy: sending,
      onSend: (options) => void performSend(sendItem, options),
      onClose: () => setSendId(null)
    }
  ) : null);
}
function ToolbarButton() {
  const dock = useDock();
  return /* @__PURE__ */ ShipReact.createElement(ShipReact.Fragment, null, /* @__PURE__ */ ShipReact.createElement(
    "button",
    {
      className: "toolbar-icon-btn",
      title: dock.open ? "Hide the change list" : "Show the change list",
      "aria-pressed": dock.open,
      onClick: () => setDock({ open: !getDock().open })
    },
    /* @__PURE__ */ ShipReact.createElement(Icon, null)
  ), /* @__PURE__ */ ShipReact.createElement(ToolbarWindowHost, null));
}
function makeWindowHost(host) {
  return function WindowHost() {
    const dock = useDock();
    const isHost = useIsWindowHost(host);
    const shouldReflow = isHost && dock.open && dock.mode === "pinned";
    useEffect(() => {
      if (!shouldReflow) {
        restoreHostLayout();
        return;
      }
      applyHostLayout(getEffectiveDockWidth());
      let timer = 0;
      const onResize = () => {
        if (isSelfDispatchedResize()) return;
        window.clearTimeout(timer);
        timer = window.setTimeout(() => applyHostLayout(getEffectiveDockWidth()), 120);
      };
      window.addEventListener("resize", onResize);
      return () => {
        window.clearTimeout(timer);
        window.removeEventListener("resize", onResize);
        restoreHostLayout();
      };
    }, [shouldReflow, dock.dockWidth]);
    return /* @__PURE__ */ ShipReact.createElement(ShipReact.Fragment, null, isHost ? /* @__PURE__ */ ShipReact.createElement("span", { "data-changelist-anchor": true, style: { display: "inline-block", width: 0, height: 0 } }) : null, isHost && dock.open ? /* @__PURE__ */ ShipReact.createElement(Panel, { onClose: () => setDock({ open: false }) }) : null);
  };
}
const ToolbarWindowHost = makeWindowHost("toolbar");
const PublishWindowHost = makeWindowHost("publish");
const name = "Change List";
const slots = {
  toolbar: ToolbarButton,
  publish: PublishWindowHost
};
function onActivate() {
  injectStyles();
}
function onDeactivate() {
  restoreHostLayout();
  removeStyles();
}
export {
  name,
  onActivate,
  onDeactivate,
  slots
};
