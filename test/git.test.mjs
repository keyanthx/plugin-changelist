/**
 * Reading Ship Studio's branch-prefix preference.
 *
 * This exists because of a real bug: the command was called with no arguments,
 * which every project-scoped Tauri command rejects. It only showed up once the
 * plugin was installed in a real project, as an error toast on first open.
 *
 * The plugin's own `try/catch` does NOT make such a failure invisible — the host
 * toasts an invoke error before re-throwing it. So "it returns '' on failure"
 * is not sufficient; the call has to be made correctly in the first place, and
 * that is what these tests pin down.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readBranchPrefix } from '../src/git.ts';

/** A plugin context stub that records every invoke it receives. */
function makeCtx({ project = { path: '/repo/site' }, respond = () => 'feat' } = {}) {
  const calls = [];
  return {
    calls,
    ctx: {
      project,
      invoke: {
        call: async (command, args) => {
          calls.push({ command, args });
          return respond(command, args);
        },
      },
    },
  };
}

test('the project path is passed as `projectPath`', async () => {
  const { ctx, calls } = makeCtx();
  const prefix = await readBranchPrefix(ctx);

  assert.equal(prefix, 'feat');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'get_branch_prefix_preference');
  assert.deepEqual(calls[0].args, { projectPath: '/repo/site' });
});

test('the path comes from the context, not a hardcoded value', async () => {
  const { ctx, calls } = makeCtx({ project: { path: '/somewhere/else' } });
  await readBranchPrefix(ctx);
  assert.equal(calls[0].args.projectPath, '/somewhere/else');
});

test('with no project, nothing is invoked at all', async () => {
  // The dashboard has no project. Calling would fail and toast at the user for
  // a value that could not be used anyway.
  const { ctx, calls } = makeCtx({ project: null });
  assert.equal(await readBranchPrefix(ctx), '');
  assert.equal(calls.length, 0);
});

test('a project without a path is treated as no project', async () => {
  const { ctx, calls } = makeCtx({ project: { path: '' } });
  assert.equal(await readBranchPrefix(ctx), '');
  assert.equal(calls.length, 0);
});

test('a rejected command degrades to no prefix rather than throwing', async () => {
  const { ctx } = makeCtx({
    respond: () => {
      throw new Error('invalid args `projectPath` for command');
    },
  });
  assert.equal(await readBranchPrefix(ctx), '');
});

test('an object reply is read from whichever key holds the prefix', async () => {
  for (const key of ['prefix', 'branchPrefix', 'branch_prefix', 'value']) {
    const { ctx } = makeCtx({ respond: () => ({ [key]: 'feature' }) });
    assert.equal(await readBranchPrefix(ctx), 'feature', `key ${key}`);
  }
});

test('an unrecognised reply shape yields no prefix', async () => {
  for (const reply of [null, undefined, 42, { something: 'else' }, []]) {
    const { ctx } = makeCtx({ respond: () => reply });
    assert.equal(await readBranchPrefix(ctx), '');
  }
});
