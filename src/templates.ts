/**
 * Prompt templates as *fields to fill in*, not text to paste.
 *
 * The earlier version pasted a skeleton full of `<angle bracket>` blanks into
 * the prompt box and left you to overwrite each one. That put the work of
 * editing around placeholders on you, and half-edited skeletons went out with
 * `<which page?>` still in them.
 *
 * Now each template is a small set of labelled boxes. Fill what you know, leave
 * the rest blank, and `composePrompt` assembles the result — no AI involved,
 * just string joining. An empty box contributes nothing at all.
 */
import type { TemplateId } from './model.ts';

export interface TemplateField {
  /**
   * Stable key the value is stored under.
   *
   * Shared deliberately across templates — `where` means the same thing in a
   * bug report and a restyle — so switching template keeps what still applies
   * instead of making you retype it.
   */
  id: string;
  /** Shown above the box, and used as the label in the composed prompt. */
  label: string;
  placeholder: string;
  multiline?: boolean;
}

export interface Template {
  id: TemplateId;
  label: string;
  /** One line explaining when to reach for it, shown as the chip's tooltip. */
  hint: string;
  fields: TemplateField[];
}

/*
 * Six tags, each asking questions the others don't.
 *
 * Chosen against real queued items rather than invented categories: "send email
 * button on nav bar" had nowhere to go (a button isn't a "new section"), "move
 * gallery above testimonials" had nowhere to go at all, and "hero headline
 * wraps badly on mobile" had no place to say *on mobile*. Hence Add being
 * broader than New section, Layout existing, and Style carrying a screen-size
 * box.
 *
 * Deliberately 3–5 boxes each. In practice most items get sent with no prompt
 * at all, so every extra box is friction that pushes people back to bare
 * titles — the free-text box catches whatever the boxes don't ask for.
 */
export const TEMPLATES: Template[] = [
  {
    id: 'style',
    label: 'Style',
    hint: 'How something already on the page looks — colour, size, spacing, weight.',
    fields: [
      { id: 'what', label: 'What', placeholder: 'the hero headline' },
      { id: 'where', label: 'Where', placeholder: 'home page, or src/components/Hero.tsx' },
      { id: 'should', label: 'Should be', placeholder: 'the size, spacing or colour you want' },
      // The single most common web-specific detail an agent otherwise guesses.
      { id: 'screen', label: 'Screen size', placeholder: 'only on mobile, only above 1024px…' },
      { id: 'keep', label: 'Keep', placeholder: "what mustn't change" },
    ],
  },
  {
    id: 'text',
    label: 'Text',
    hint: 'Wording — headlines, body text, button labels.',
    fields: [
      { id: 'what', label: 'What', placeholder: 'the headline, a button label' },
      { id: 'where', label: 'Where', placeholder: 'home page, hero section' },
      // Pasting the exact string is what lets an agent find it without guessing.
      { id: 'current', label: 'Current text', placeholder: 'paste it here', multiline: true },
      { id: 'should', label: 'Should say', placeholder: 'the message, and the tone' },
    ],
  },
  {
    id: 'layout',
    label: 'Layout',
    hint: 'Moving, reordering, resizing or removing things that already exist.',
    fields: [
      { id: 'what', label: 'What', placeholder: 'the gallery section' },
      { id: 'where', label: 'Where', placeholder: 'home page' },
      // The relationship is the whole point of a layout change.
      { id: 'destination', label: 'Should end up', placeholder: 'above the testimonials, or removed' },
      { id: 'keep', label: 'Keep', placeholder: "what mustn't move or change" },
    ],
  },
  {
    id: 'add',
    label: 'Add',
    hint: "Something that isn't there yet — a button, a section, a page.",
    fields: [
      { id: 'what', label: 'What to add', placeholder: 'a Send email button' },
      { id: 'where', label: 'Where', placeholder: 'the nav bar, or below the hero' },
      { id: 'content', label: 'Content', placeholder: 'its label, text, images, links', multiline: true },
      { id: 'does', label: 'What it does', placeholder: 'opens the mail app, links to /contact' },
      { id: 'match', label: 'Match', placeholder: 'the existing thing it should look like' },
    ],
  },
  {
    id: 'behaviour',
    label: 'Behaviour',
    hint: 'How something responds — clicks, hovers, forms, links, animation.',
    fields: [
      { id: 'what', label: 'What', placeholder: 'the mobile menu' },
      { id: 'where', label: 'Where', placeholder: 'the header, on every page' },
      { id: 'does', label: 'Should do', placeholder: 'close when you click outside it' },
      { id: 'keep', label: 'Keep working', placeholder: "what mustn't break" },
    ],
  },
  {
    id: 'bug',
    label: 'Bug',
    hint: 'Something is broken and you can describe how to see it.',
    fields: [
      /*
       * `symptom`, not the shared `what`. Elsewhere `what` names a thing ("the
       * hero headline"); here it describes a behaviour ("submits twice").
       * Sharing the key would carry a noun into "What goes wrong" and read as
       * nonsense. `where` genuinely does mean the same thing everywhere, so it
       * stays shared and carries across a tag switch.
       */
      { id: 'symptom', label: 'What goes wrong', placeholder: 'the form submits twice' },
      { id: 'where', label: 'Where', placeholder: 'contact page, or the file' },
      { id: 'steps', label: 'Steps', placeholder: 'what you do to see it happen', multiline: true },
      { id: 'expected', label: 'Expected', placeholder: 'what should happen instead' },
      { id: 'screen', label: 'Only on', placeholder: 'a browser or screen size, if not everywhere' },
    ],
  },
];

/**
 * Look up a tag by id, across the built-in set and any custom ones.
 *
 * Returns null for an id that resolves to nothing — which is exactly what
 * should happen when an item refers to a custom tag you've since deleted: the
 * item falls back to free text, keeping everything that was typed.
 */
export function findTemplate(id: TemplateId | null, custom: Template[] = []): Template | null {
  if (!id) return null;
  return (
    TEMPLATES.find((template) => template.id === id) ??
    custom.find((template) => template.id === id) ??
    null
  );
}

/** Built-in tags first, then yours — the order the chips are drawn in. */
export function allTemplates(custom: Template[] = []): Template[] {
  return [...TEMPLATES, ...custom];
}

/**
 * Build the prompt from whatever's filled in.
 *
 * Deliberately dumb and predictable — labelled lines, empty boxes skipped,
 * free-text notes appended as their own paragraph. No AI, so what you see in
 * the preview is exactly what gets sent, every time.
 *
 * With no template and no fields this returns the notes verbatim, which is why
 * writing a prompt freehand still works exactly as it did.
 */
export function composePrompt(
  template: Template | null,
  fields: Record<string, string>,
  notes: string
): string {
  const lines: string[] = [];

  if (template) {
    for (const field of template.fields) {
      const value = (fields[field.id] ?? '').trim();
      if (!value) continue; // a blank box says nothing, so it contributes nothing
      // Multi-line values sit under their label so they keep their shape.
      lines.push(value.includes('\n') ? `${field.label}:\n${value}` : `${field.label}: ${value}`);
    }
  }

  const trailing = notes.trim();
  if (!lines.length) return trailing;
  if (!trailing) return lines.join('\n');
  return `${lines.join('\n')}\n\n${trailing}`;
}

/** Does this template have anything filled in? Used to warn before discarding. */
export function hasAnyFieldValue(
  template: Template | null,
  fields: Record<string, string>
): boolean {
  if (!template) return false;
  return template.fields.some((field) => (fields[field.id] ?? '').trim().length > 0);
}
