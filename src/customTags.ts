/**
 * Tags you make yourself.
 *
 * The six built-in tags cover common website work, but everyone has their own
 * recurring shapes — an SEO pass, a client review, an accessibility check. A
 * custom tag is the same thing as a built-in one: a name and a few labelled
 * boxes. It goes through the identical `composePrompt`, so nothing downstream
 * knows or cares whether a tag was shipped or invented.
 *
 * **Stored globally, not per project.** Plugin storage is per project, which
 * would mean rebuilding your tags for every site you open — a tag set is how
 * *you* work, not a property of one project. So these live in localStorage
 * alongside the dock's position, and follow you everywhere.
 */
import type { Template, TemplateField } from './templates.ts';

const STORAGE_KEY = 'shipstudio-changelist-tags';

export interface CustomTag {
  id: string;
  label: string;
  fields: TemplateField[];
}

/** Ids are prefixed so a custom tag can never collide with a built-in one. */
const ID_PREFIX = 'custom:';

export function isCustomTagId(id: string | null): boolean {
  return typeof id === 'string' && id.startsWith(ID_PREFIX);
}

function newId(prefix: string): string {
  const cryptoApi = globalThis.crypto as Crypto | undefined;
  const unique = cryptoApi?.randomUUID
    ? cryptoApi.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `${prefix}${unique}`;
}

export function createCustomTag(): CustomTag {
  return { id: newId(ID_PREFIX), label: '', fields: [createField(), createField()] };
}

/**
 * Field ids are generated once and never derived from the label.
 *
 * Renaming a box must not orphan what's already typed in it — and two boxes
 * called the same thing would otherwise share a value.
 */
export function createField(): TemplateField {
  return { id: newId('f'), label: '', placeholder: '' };
}

// ---------------------------------------------------------------------------
// Reading and writing
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Coerce stored JSON into tags we can trust, dropping anything malformed. */
export function readCustomTags(raw: unknown): CustomTag[] {
  if (!Array.isArray(raw)) return [];

  const tags: CustomTag[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const id = typeof entry.id === 'string' ? entry.id : '';
    const label = typeof entry.label === 'string' ? entry.label : '';
    if (!id || !label.trim()) continue; // a nameless tag can't be shown or chosen

    const fields: TemplateField[] = [];
    if (Array.isArray(entry.fields)) {
      for (const field of entry.fields) {
        if (!isRecord(field)) continue;
        const fieldId = typeof field.id === 'string' ? field.id : '';
        const fieldLabel = typeof field.label === 'string' ? field.label : '';
        if (!fieldId || !fieldLabel.trim()) continue; // an unlabelled box asks nothing
        fields.push({
          id: fieldId,
          label: fieldLabel,
          placeholder: typeof field.placeholder === 'string' ? field.placeholder : '',
          multiline: field.multiline === true,
        });
      }
    }
    tags.push({ id, label, fields });
  }
  return tags;
}

export function loadCustomTags(): CustomTag[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? readCustomTags(JSON.parse(raw)) : [];
  } catch {
    // Corrupt or blocked storage shouldn't take the panel down with it.
    return [];
  }
}

export function saveCustomTags(tags: CustomTag[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tags));
  } catch {
    // Full or blocked storage — nothing useful to do, and losing a tag is
    // better than losing the panel.
  }
}

// ---------------------------------------------------------------------------
// Becoming a template
// ---------------------------------------------------------------------------

/**
 * A custom tag as the editor sees it.
 *
 * Half-finished tags are usable rather than broken: boxes still missing a label
 * are dropped here, so a tag you're midway through naming doesn't render a row
 * of blank captions.
 */
export function toTemplate(tag: CustomTag): Template {
  return {
    id: tag.id,
    label: tag.label.trim() || 'Untitled',
    hint: `Your own tag — ${tag.fields.length} box${tag.fields.length === 1 ? '' : 'es'}.`,
    fields: tag.fields.filter((field) => field.label.trim().length > 0),
  };
}

/** Is this tag worth showing as a chip yet? */
export function isUsable(tag: CustomTag): boolean {
  return tag.label.trim().length > 0 && tag.fields.some((field) => field.label.trim().length > 0);
}
