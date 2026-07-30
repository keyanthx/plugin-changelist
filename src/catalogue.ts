/**
 * Reading what the agent CLIs know about their own models.
 *
 * The point is that nothing here is a hardcoded list that quietly goes stale.
 * OpenCode can describe its whole catalogue, and Claude Code documents its
 * effort levels in `--help`, so both pickers are built from what the installed
 * tool actually reports.
 *
 * Pure string-in / data-out, so `test/catalogue.test.mjs` can exercise it
 * against captured real output without a browser or a CLI.
 */

export interface CatalogueModel {
  /** Full id to pass to --model, e.g. `opencode-go/glm-5.2`. */
  id: string;
  /** Provider half of the id, used to group the dropdown. */
  provider: string;
  /** Human name, e.g. "GLM 5.2". Falls back to the id. */
  name: string;
  /** Context window in tokens, when reported. */
  contextTokens: number | null;
  /** True when the model costs nothing to run. */
  free: boolean;
  /** Whether the model reasons at all. */
  reasoning: boolean;
  /**
   * Effort levels this specific model accepts.
   *
   * Per-model on purpose: in the real catalogue these differ — some offer
   * `high`/`max`, others `low`/`medium`/`high`, others `none`/`high`, and 11 of
   * 25 offer none at all. A single global effort list would offer values the
   * chosen model rejects.
   */
  variants: string[];
}

/**
 * Parse `opencode models --verbose`.
 *
 * The format is a `provider/id` line followed by a pretty-printed JSON object,
 * repeated. Rather than relying on that layout precisely, this walks the text
 * and takes each brace-balanced object — so extra banner lines or a reordering
 * don't break it.
 *
 * Anything malformed is skipped rather than thrown, because one bad entry
 * emptying the whole dropdown would be a much worse failure than losing a row.
 */
export function parseOpenCodeCatalogue(stdout: string): CatalogueModel[] {
  const models: CatalogueModel[] = [];

  for (const raw of extractJsonObjects(stdout)) {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      continue;
    }

    const id = typeof parsed.id === 'string' ? parsed.id : '';
    const provider = typeof parsed.providerID === 'string' ? parsed.providerID : '';
    if (!id || !provider) continue;

    const cost = parsed.cost as { input?: number; output?: number } | undefined;
    const limit = parsed.limit as { context?: number } | undefined;
    const capabilities = parsed.capabilities as { reasoning?: boolean } | undefined;
    const variants = parsed.variants;

    models.push({
      id: `${provider}/${id}`,
      provider,
      name: typeof parsed.name === 'string' && parsed.name ? parsed.name : id,
      contextTokens: typeof limit?.context === 'number' ? limit.context : null,
      // Both sides must be free; a zero input price with a paid output isn't.
      free: cost?.input === 0 && cost?.output === 0,
      reasoning: capabilities?.reasoning === true,
      variants:
        variants && typeof variants === 'object' && !Array.isArray(variants)
          ? Object.keys(variants as Record<string, unknown>)
          : [],
    });
  }

  return models;
}

/**
 * Every brace-balanced `{...}` block in the text.
 *
 * Counts depth while skipping over string literals, so a brace inside a model
 * name or URL doesn't end an object early.
 */
function extractJsonObjects(text: string): string[] {
  const objects: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      if (depth === 0) start = i;
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        objects.push(text.slice(start, i + 1));
        start = -1;
      }
      if (depth < 0) depth = 0; // stray brace — resynchronise rather than give up
    }
  }

  return objects;
}

/** A label like "GLM 5.2 · 200k · free" for the dropdown. */
export function describeModel(model: CatalogueModel): string {
  const facts: string[] = [];
  if (model.contextTokens) facts.push(formatContext(model.contextTokens));
  if (model.free) facts.push('free');
  return facts.length > 0 ? `${model.name} · ${facts.join(' · ')}` : model.name;
}

function formatContext(tokens: number): string {
  if (tokens >= 1_000_000) return `${Math.round(tokens / 100_000) / 10}M`;
  return `${Math.round(tokens / 1000)}k`;
}

// ---------------------------------------------------------------------------
// Claude Code
// ---------------------------------------------------------------------------

export interface ClaudeCapabilities {
  /** Values accepted by --effort. */
  effortLevels: string[];
  /** Model aliases the CLI suggests. */
  aliases: string[];
}

/**
 * What Claude Code offers, read out of its own `--help`.
 *
 * There is no model-listing subcommand, no on-disk catalogue, and an invalid
 * `--model` returns a generic error without naming the valid ones — so the help
 * text is the only live signal available. Both fields fall back to a curated
 * list, so a reworded help page yields a slightly stale picker rather than an
 * empty one.
 */
export function parseClaudeCapabilities(helpText: string): ClaudeCapabilities {
  // "--effort <level>   Effort level for the current session (low, medium, high, xhigh, max)"
  const effortMatch = helpText.match(/--effort[\s\S]{0,200}?\(([^)]+)\)/);
  const effortLevels = effortMatch
    ? effortMatch[1]
        .split(',')
        .map((value) => value.trim())
        .filter((value) => /^[a-z][a-z-]*$/.test(value))
    : [];

  // "...an alias for the latest model (e.g. 'fable', 'opus', or 'sonnet')..."
  const modelSection = helpText.match(/--model <model>[\s\S]{0,400}/);
  const quoted = modelSection ? [...modelSection[0].matchAll(/'([a-z][\w.-]*)'/g)].map((m) => m[1]) : [];

  // Keep the short aliases; full ids like `claude-fable-5` also appear in the
  // help text but make for a worse picker than the aliases they stand in for.
  const aliases = quoted.filter((value) => !value.includes('-') || !value.startsWith('claude'));

  return {
    effortLevels: effortLevels.length > 0 ? effortLevels : DEFAULT_EFFORT_LEVELS,
    aliases: mergeAliases(aliases),
  };
}

const DEFAULT_EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'];

/**
 * Curated aliases, ordered cheapest to strongest, plus anything new the help
 * text mentioned. `haiku` is included because it is valid but isn't named in
 * the current help text's example.
 */
function mergeAliases(discovered: string[]): string[] {
  const curated = ['haiku', 'sonnet', 'opus', 'fable'];
  const extras = discovered.filter((alias) => !curated.includes(alias));
  return [...curated, ...extras];
}
