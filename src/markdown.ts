/**
 * The whole list as Markdown, for pasting into a PR body, an issue, or a
 * running agent that needs the backlog rather than one prompt.
 *
 * Pure, so `test/markdown.test.mjs` can pin the shape. It deliberately mirrors
 * the on-screen grouping and ordering — In progress, then To do, then Done —
 * so the export reads the way the panel does.
 */
import { DIFFICULTY_LABELS, branchForItem, groupItems, type ChangeItem } from './model.ts';

export function itemsToMarkdown(items: ChangeItem[]): string {
  if (items.length === 0) return 'Nothing to do.';

  const groups = groupItems(items);
  const sections: Array<[string, ChangeItem[], boolean]> = [
    ['In progress', groups.doing, false],
    ['To do', groups.todo, false],
    ['Done', groups.done, true],
  ];

  const blocks: string[] = [];
  for (const [heading, list, done] of sections) {
    if (list.length === 0) continue;
    blocks.push(`## ${heading}\n${list.map((item) => itemToMarkdown(item, done)).join('\n')}`);
  }
  return blocks.join('\n\n');
}

function itemToMarkdown(item: ChangeItem, done: boolean): string {
  const title = item.title.trim() || 'Untitled change';
  const branch = branchForItem(item);
  const meta = [DIFFICULTY_LABELS[item.difficulty], branch ? `on ${branch}` : null]
    .filter(Boolean)
    .join(' · ');

  const head = `- [${done ? 'x' : ' '}] **${title}**${meta ? ` · ${meta}` : ''}`;
  const prompt = item.prompt.trim();
  if (!prompt) return head;
  return `${head}\n  ${prompt.replace(/\n/g, '\n  ')}`;
}
