/**
 * Live nudges under the prompt box.
 *
 * These are hints, never errors: nothing here blocks saving or sending. The
 * point is to catch the four things a prompt written in ten seconds usually
 * leaves out, at the moment you can still fix them cheaply.
 *
 * Everything is a plain string check — no AI, no network, no delay. That's
 * deliberate: a hint that arrives half a second late is a hint you've already
 * typed past.
 */

export interface Nudge {
  id: 'where' | 'outcome' | 'short' | 'vague' | 'blanks';
  message: string;
}

/**
 * Words that name a place in a website project.
 *
 * Anything here counts as "you said where". It's a generous list on purpose —
 * a false "you didn't say where" on a prompt that clearly did is more annoying
 * than a missed hint.
 */
const PLACE_WORDS = [
  'page',
  'section',
  'component',
  'file',
  'header',
  'footer',
  'nav',
  'navbar',
  'menu',
  'hero',
  'button',
  'form',
  'card',
  'modal',
  'sidebar',
  'homepage',
  'home page',
  'landing',
  'about',
  'contact',
  'gallery',
  'blog',
];

/** Phrases that state a target state rather than just a complaint. */
const OUTCOME_WORDS = [
  'should',
  'instead',
  'so that',
  'must',
  'needs to',
  'make it',
  'turn it',
  'change it to',
  'expected',
  'want it',
];

/** Adjectives that feel like direction but carry no information. */
const VAGUE_WORDS = [
  'nicer',
  'nice',
  'better',
  'cleaner',
  'prettier',
  'modern',
  'fresh',
  'pop',
  'cooler',
  'improve',
  'improved',
  'polish',
  'tidy up',
];

function containsAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

/** A path-ish or filename-ish token, e.g. `src/index.tsx` or `Hero.tsx`. */
function mentionsAFile(text: string): boolean {
  return /[\w-]+\.(tsx?|jsx?|css|scss|html|md|astro|vue|svelte)\b/.test(text) || /\S\/\S/.test(text);
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** How many `<like this>` blanks are still unfilled from a template. */
export function countBlanks(text: string): number {
  return (text.match(/<[^>\n]+>/g) ?? []).length;
}

/**
 * The hints for one prompt, in the order they're worth reading.
 *
 * An empty prompt gets nothing — nagging someone about a box they haven't
 * started typing in is just noise.
 */
export function lintPrompt(prompt: string): Nudge[] {
  const text = prompt.trim();
  if (!text) return [];

  const lower = text.toLowerCase();
  const nudges: Nudge[] = [];

  const blanks = countBlanks(text);
  if (blanks > 0) {
    nudges.push({
      id: 'blanks',
      message:
        blanks === 1 ? '1 blank still to fill in' : `${blanks} blanks still to fill in`,
    });
  }

  if (!mentionsAFile(text) && !containsAny(lower, PLACE_WORDS)) {
    nudges.push({ id: 'where', message: 'no page, section or file named' });
  }

  if (!containsAny(lower, OUTCOME_WORDS)) {
    nudges.push({ id: 'outcome', message: 'no desired outcome — what does “done” look like?' });
  }

  if (wordCount(text) < 15) {
    nudges.push({ id: 'short', message: 'quite short — likely to need a follow-up round' });
  }

  if (containsAny(lower, VAGUE_WORDS)) {
    nudges.push({ id: 'vague', message: 'vague words like “nicer” — say what specifically' });
  }

  return nudges;
}
