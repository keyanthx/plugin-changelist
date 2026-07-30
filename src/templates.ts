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

export const TEMPLATES: Template[] = [
  {
    id: 'style',
    label: 'Style',
    hint: 'Spacing, colour, size, weight — how something looks.',
    fields: [
      { id: 'what', label: 'What', placeholder: 'the hero headline' },
      { id: 'where', label: 'Where', placeholder: 'home page, or src/components/Hero.tsx' },
      { id: 'now', label: 'Now', placeholder: 'how it looks today' },
      { id: 'should', label: 'Should be', placeholder: 'the size, spacing or colour you want' },
      { id: 'keep', label: 'Keep', placeholder: "what mustn't change" },
    ],
  },
  {
    id: 'copy',
    label: 'Copy',
    hint: 'Wording — headlines, body text, button labels.',
    fields: [
      { id: 'what', label: 'What', placeholder: 'the headline, a button label' },
      { id: 'where', label: 'Where', placeholder: 'home page, hero section' },
      { id: 'current', label: 'Current text', placeholder: 'paste it here', multiline: true },
      { id: 'should', label: 'Should say', placeholder: 'the message, and the tone' },
      { id: 'keep', label: 'Keep', placeholder: 'length limit, words to avoid' },
    ],
  },
  {
    id: 'bug',
    label: 'Bug',
    hint: 'Something is broken and you can describe how to see it.',
    fields: [
      /*
       * `symptom`, not the shared `what`, on purpose. Elsewhere `what` names a
       * thing ("the hero headline"); here it describes a behaviour ("submits
       * twice"). Sharing the key would carry a noun into "What goes wrong" and
       * read as nonsense. `where` genuinely does mean the same thing, so it
       * stays shared.
       */
      { id: 'symptom', label: 'What goes wrong', placeholder: 'the form submits twice' },
      { id: 'where', label: 'Where', placeholder: 'contact page, or the file' },
      { id: 'steps', label: 'Steps', placeholder: 'what you do to see it happen', multiline: true },
      { id: 'expected', label: 'Expected', placeholder: 'what should happen instead' },
      { id: 'only', label: 'Only on', placeholder: 'a browser or screen size, if not everywhere' },
    ],
  },
  {
    id: 'new-section',
    label: 'New section',
    hint: 'Adding something that is not on the page yet.',
    fields: [
      { id: 'what', label: 'What to add', placeholder: 'a testimonials section' },
      { id: 'where', label: 'Where', placeholder: 'home page, below the hero' },
      { id: 'content', label: 'Content', placeholder: 'headline, text, images, links', multiline: true },
      { id: 'behaviour', label: 'Behaviour', placeholder: 'responsive rules, animation, where links go' },
      { id: 'match', label: 'Match', placeholder: 'the existing section it should sit alongside' },
    ],
  },
  {
    id: 'refactor',
    label: 'Refactor',
    hint: 'Tidying code without changing what the visitor sees.',
    fields: [
      { id: 'what', label: 'What', placeholder: 'the file or component' },
      { id: 'goal', label: 'Goal', placeholder: 'what should be easier afterwards' },
      { id: 'keep', label: 'Keep identical', placeholder: 'the rendered output, the props it takes' },
      { id: 'avoid', label: "Don't", placeholder: 'rename things, touch other files' },
    ],
  },
];

export function findTemplate(id: TemplateId | null): Template | null {
  if (!id) return null;
  return TEMPLATES.find((template) => template.id === id) ?? null;
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
