/**
 * Prompt skeletons.
 *
 * Most of "writing a better prompt" isn't wording — it's remembering to say
 * *where* the change goes and *what done looks like*. A skeleton that already
 * asks those questions gets you there faster than any amount of advice.
 *
 * Each skeleton is a set of labelled lines with angle-bracket blanks. The
 * blanks are deliberately obvious so an unfilled one is easy to spot before
 * sending — and so the agent can tell you missed it.
 */
import type { TemplateId } from './model.ts';

export interface Template {
  id: TemplateId;
  label: string;
  /** One line explaining when to reach for it, shown under the picker. */
  hint: string;
  skeleton: string;
}

export const TEMPLATES: Template[] = [
  {
    id: 'style',
    label: 'Style',
    hint: 'Spacing, colour, size, weight — how something looks.',
    skeleton: [
      'Restyle <element> in <section> on <page>.',
      'Now: <how it looks today>',
      'Should be: <the look you want — spacing, size, colour, weight>',
      'Keep: <what must not change — layout, other pages, the design tokens>',
    ].join('\n'),
  },
  {
    id: 'copy',
    label: 'Copy',
    hint: 'Wording — headlines, body text, button labels.',
    skeleton: [
      'Rewrite the <headline / paragraph / button label> in <section> on <page>.',
      'Current text: "<paste it here>"',
      'It should say: <the message, and the tone>',
      'Keep: <length limit, words to keep, words to avoid>',
    ].join('\n'),
  },
  {
    id: 'bug',
    label: 'Bug',
    hint: 'Something is broken and you can describe how to see it.',
    skeleton: [
      'Bug: <what goes wrong>',
      'Where: <page, component, or file>',
      'Steps: <what I do to see it happen>',
      'Expected: <what should happen instead>',
      'Only on: <browser or screen size, if it is not everywhere>',
    ].join('\n'),
  },
  {
    id: 'new-section',
    label: 'New section',
    hint: 'Adding something that is not on the page yet.',
    skeleton: [
      'Add a <section type> section to <page>, <above / below> the <existing section>.',
      'Content: <headline, text, images, links it should hold>',
      'Behaviour: <responsive rules, animation, where links go>',
      'Match: <the existing section it should look consistent with>',
    ].join('\n'),
  },
  {
    id: 'refactor',
    label: 'Refactor',
    hint: 'Tidying code without changing what the visitor sees.',
    skeleton: [
      'Refactor <file or component>.',
      'Goal: <what should be easier afterwards>',
      'Keep identical: <the rendered output, the props it takes>',
      "Don't: <rename things, change behaviour, touch other files>",
    ].join('\n'),
  },
];

export function findTemplate(id: TemplateId | null): Template | null {
  if (!id) return null;
  return TEMPLATES.find((template) => template.id === id) ?? null;
}

/**
 * The skeleton with the title already dropped into the first blank.
 *
 * A small touch, but it means the very first thing you see is your own note
 * rather than a row of placeholders.
 */
export function fillSkeleton(template: Template, title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return template.skeleton;
  return template.skeleton.replace(/<[^>]+>/, trimmed);
}
