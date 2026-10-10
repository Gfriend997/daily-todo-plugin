import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const runtime = await import('../scripts/daily-todo.mjs').catch(() => ({}));
const run = runtime.run;
const org = '11111111-1111-4111-8111-111111111111';
const project = '22222222-2222-4222-8222-222222222222';
const id = '33333333-3333-4333-8333-333333333333';
const capture = (extra = {}) => ({ id, organization_id: org, organization: 'Example Org', project_id: project, project: 'Example Project', title: 'Review fixture', source: 'fixture chat', confirmation: { kind: 'explicit', reference: 'User said do this' }, ...extra });
async function fixture(t) {
  const vault = await fs.mkdtemp(path.join(os.tmpdir(), 'daily-todo-'));
  t.after(() => fs.rm(vault, { recursive: true, force: true }));
  return { vault, timezone: 'America/Los_Angeles' };
}
const at = (config, now = '2026-10-09T16:00:00Z', extra = {}) => ({ config, now, ...extra });
const ok = result => { assert.deepEqual(result.errors, []); return result; };

test('runtime exports the command entry point', () => assert.equal(typeof run, 'function'));

test('twenty-day rollover preserves original capture and excludes completed tasks', async t => {
  const config = await fixture(t);
  ok(await run('capture', at(config, '2026-09-19T16:00:00Z', { request: capture() })));
  const second = '44444444-4444-4444-8444-444444444444';
  ok(await run('capture', at(config, '2026-09-19T16:00:00Z', { request: capture({ id: second, title: 'Finished fixture' }) })));
  ok(await run('done', at(config, '2026-09-19T17:00:00Z', { request: { id: second, evidence: { kind: 'verified', reference: 'Test artifact passed' } } })));
  const result = ok(await run('startup', at(config)));
  assert.equal(result.date, '2026-10-09');
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].recorded_at, '2026-09-19T16:00:00.000Z');
  assert.equal(result.tasks[0].age_days, 20);
  assert.equal(result.cleanup.deleted, 1);
  assert.match(result.reminder, /show all/i);
});

test('suggestions cannot rank as approved and list returns five or all', async t => {
  const config = await fixture(t);
  const ids = Array.from({ length: 7 }, (_, n) => `33333333-3333-4333-8333-${String(n).padStart(12, '0')}`);
  for (const [n, taskId] of ids.entries()) ok(await run('capture', at(config, `2026-10-09T16:00:0${n}Z`, { request: capture({ id: taskId, title: `Task ${n}` }) })));
  ok(await run('suggest-priority', at(config, undefined, { request: { id: ids[6], priority: 'high', reason: 'Suggested focus' } })));
  let result = ok(await run('list', at(config)));
  assert.equal(result.tasks.length, 5);
  assert.equal(result.tasks[0].id, ids[0]);
  assert.equal(result.tasks[0].priority, 'unassigned');
  ok(await run('approve-priority', at(config, undefined, { request: { id: ids[6], priority: 'high', approval: { kind: 'human', reference: 'User approved' } } })));
  result = ok(await run('list', at(config, undefined, { all: true })));
  assert.equal(result.tasks.length, 7);
  assert.equal(result.tasks[0].id, ids[6]);
  assert.equal(result.tasks[0].approved_priority.approval.reference, 'User approved');
});

const todo = config => path.join(config.vault, '01 Daily', 'To-do');
const working = config => path.join(config.vault, '07 System', 'Working');
const state = config => path.join(todo(config), '.daily-todo-state.json');
async function editTasks(config, date, edit) {
  const file = path.join(todo(config), `${date}.md`);
  const text = await fs.readFile(file, 'utf8');
  const pattern = /(<!-- daily-todo:tasks:start -->\n```json\n)([\s\S]*?)(\n```\n<!-- daily-todo:tasks:end -->)/;
  const match = text.match(pattern);
  assert.ok(match, 'canonical task block');
  await fs.writeFile(file, text.replace(pattern, (_, before, json, after) => before + JSON.stringify(edit(JSON.parse(json)), null, 2) + after));
}

test('manual edits and an empty authority survive rollover without resurrection', async t => {
  const config = await fixture(t);
  ok(await run('capture', at(config, undefined, { request: capture() })));
  await editTasks(config, '2026-10-09', tasks => { tasks[0].title = 'Human edited title'; return tasks; });
  assert.equal(ok(await run('list', at(config))).tasks[0].title, 'Human edited title');
  await editTasks(config, '2026-10-09', () => []);
  assert.equal(ok(await run('startup', at(config, '2026-10-10T16:00:00Z'))).total, 0);
  assert.equal(ok(await run('startup', at(config, '2026-11-10T16:00:00Z'))).total, 0);
});

test('current prose survives mutations and expired prose blocks deletion', async t => {
  const config = await fixture(t);
  const result = ok(await run('ensure', at(config)));
  await fs.appendFile(result.path, '\nPrivate manual note.\n');
  ok(await run('capture', at(config, undefined, { request: capture() })));
  assert.match(await fs.readFile(result.path, 'utf8'), /Private manual note/);
  const later = ok(await run('startup', at(config, '2026-11-01T16:00:00Z')));
  assert.equal(later.cleanup.blocked, 1);
  assert.equal(later.cleanup.deleted, 0);
  assert.match(await fs.readFile(result.path, 'utf8'), /Private manual note/);
});

test('retention uses fourteen local calendar dates and ignores modification times', async t => {
  const config = await fixture(t);
  for (const day of ['25', '26', '27']) ok(await run('ensure', at(config, `2026-09-${day}T16:00:00Z`)));
  const invalid = path.join(todo(config), '2026-02-30.md');
  await fs.writeFile(invalid, 'unrelated');
  await fs.writeFile(path.join(todo(config), '2026-99-99.md'), 'unrelated');
  await fs.writeFile(path.join(todo(config), 'other.md'), 'unrelated');
  const result = ok(await run('startup', at(config)));
  assert.equal(result.cleanup.deleted, 1);
  await fs.access(path.join(todo(config), '2026-09-26.md'));
  await fs.access(path.join(todo(config), '2026-09-27.md'));
  await fs.access(invalid);
});

test('local dates and age handle midnight and DST boundaries', async t => {
  const config = await fixture(t);
  assert.equal(ok(await run('ensure', at(config, '2026-03-08T07:59:59Z'))).date, '2026-03-07');
  ok(await run('capture', at(config, '2026-03-08T07:59:59Z', { request: capture() })));
  const result = ok(await run('startup', at(config, '2026-03-09T07:00:00Z')));
  assert.equal(result.date, '2026-03-09');
  assert.equal(result.tasks[0].age_days, 2);
});

test('duplicate IDs are idempotent only for the original immutable capture', async t => {
  const config = await fixture(t);
  ok(await run('capture', at(config, undefined, { request: capture() })));
  ok(await run('capture', at(config, '2026-10-09T17:00:00Z', { request: capture() })));
  const changed = await run('capture', at(config, undefined, { request: capture({ title: 'Different' }) }));
  assert.ok(changed.errors.length);
  const result = ok(await run('list', at(config, undefined, { all: true })));
  assert.equal(result.total, 1);
  assert.equal(result.tasks[0].recorded_at, '2026-10-09T16:00:00.000Z');
});

test('uncertain completion, ideas and non-human priority approval refuse without writes', async t => {
  const config = await fixture(t);
  ok(await run('capture', at(config, undefined, { request: capture() })));
  const before = await fs.readFile(state(config), 'utf8');
  for (const [command, request] of [
    ['done', { id, evidence: { kind: 'uncertain', reference: 'Maybe' } }],
    ['approve-priority', { id, priority: 'high', approval: { kind: 'model', reference: 'AI approved' } }],
    ['capture', capture({ kind: 'idea', id: '44444444-4444-4444-8444-444444444444' })],
    ['capture', capture({ organization_id: 'guess' })],
    ['capture', capture({ confirmation: { kind: 'inferred', reference: 'Guess' } })],
  ]) assert.ok((await run(command, at(config, undefined, { request }))).errors.length);
  assert.equal(await fs.readFile(state(config), 'utf8'), before);
});

test('malformed task edits and missing authority never overwrite or prune', async t => {
  const config = await fixture(t);
  const created = ok(await run('capture', at(config, undefined, { request: capture() })));
  await editTasks(config, '2026-10-09', tasks => { delete tasks[0].confirmation; return tasks; });
  const broken = await fs.readFile(created.path, 'utf8');
  assert.ok((await run('startup', at(config, '2026-11-01T16:00:00Z'))).errors.length);
  assert.equal(await fs.readFile(created.path, 'utf8'), broken);
  await fs.unlink(state(config));
  assert.ok((await run('startup', at(config, '2026-11-01T16:00:00Z'))).errors.length);
  await fs.access(created.path);
});

test('foreign and sync-conflict writer locks remain untouched', async t => {
  const config = await fixture(t);
  await fs.mkdir(working(config), { recursive: true });
  for (const name of ['writer.lock', 'writer-device-conflict.lock']) {
    const file = path.join(working(config), name);
    await fs.writeFile(file, 'foreign');
    assert.ok((await run('startup', at(config))).errors.length);
    assert.equal(await fs.readFile(file, 'utf8'), 'foreign');
    await fs.unlink(file);
  }
});

test('concurrent capture produces one task and leaves no writer lock', async t => {
  const config = await fixture(t);
  const results = await Promise.all(Array.from({ length: 8 }, () => run('capture', at(config, undefined, { request: capture() }))));
  assert.ok(results.some(result => result.errors.length === 0));
  assert.equal(ok(await run('list', at(config))).total, 1);
  assert.deepEqual((await fs.readdir(working(config))).filter(name => /^writer.*\.lock$/i.test(name)), []);
});

test('unsafe directory configs refuse before creating anything', async t => {
  for (const unsafe of ['../outside', 'nested/../../outside', '/absolute', 'C:\\outside', 'a:stream', 'CON']) {
    const config = await fixture(t);
    assert.ok((await run('startup', at({ ...config, todoDirectory: unsafe }))).errors.length, unsafe);
    assert.deepEqual(await fs.readdir(config.vault), []);
  }
});

test('symlink directory and hardlinked snapshots refuse writes', async t => {
  const config = await fixture(t);
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'daily-todo-outside-'));
  t.after(() => fs.rm(outside, { recursive: true, force: true }));
  await fs.mkdir(path.join(config.vault, '01 Daily'));
  await fs.symlink(outside, todo(config), process.platform === 'win32' ? 'junction' : 'dir');
  assert.ok((await run('startup', at(config))).errors.length);
  assert.deepEqual(await fs.readdir(outside), []);
  await fs.unlink(todo(config));
  const created = ok(await run('ensure', at(config)));
  await fs.link(created.path, path.join(outside, 'linked.md'));
  assert.ok((await run('capture', at(config, undefined, { request: capture() }))).errors.length);
});

test('dry run reports pending cleanup without writing a snapshot or pruning', async t => {
  const config = await fixture(t);
  const initial = ok(await run('ensure', at(config, '2026-09-01T16:00:00Z')));
  const before = await fs.readFile(state(config), 'utf8');
  const preview = ok(await run('prune', at(config, undefined, { dryRun: true })));
  assert.equal(preview.cleanup.remaining, 1);
  assert.equal(preview.cleanup.deleted, 0);
  assert.equal(await fs.readFile(state(config), 'utf8'), before);
  await fs.access(initial.path);
  await assert.rejects(fs.access(path.join(todo(config), '2026-10-09.md')));
});

test('failed authority publication prevents pruning and fails safely on retry', async t => {
  const config = await fixture(t);
  const initial = ok(await run('ensure', at(config, '2026-09-01T16:00:00Z')));
  const before = await fs.readFile(state(config), 'utf8');
  const failed = await run('startup', at(config, undefined, { beforeStep: step => { if (step === 'publish-authority') throw new Error('injected'); } }));
  assert.ok(failed.errors.length);
  await fs.access(initial.path);
  assert.equal(await fs.readFile(state(config), 'utf8'), before);
  assert.ok((await run('startup', at(config))).errors.length);
  await fs.access(initial.path);
});

test('partial pruning keeps committed authority and retries remaining files', async t => {
  const config = await fixture(t);
  for (const day of ['01', '02', '03']) ok(await run('ensure', at(config, `2026-09-${day}T16:00:00Z`)));
  let deletes = 0;
  const failed = await run('startup', at(config, undefined, { beforeStep: step => { if (step === 'delete' && ++deletes === 2) throw new Error('injected'); } }));
  assert.equal(failed.cleanup.deleted, 1);
  assert.equal(failed.cleanup.remaining, 2);
  assert.ok(failed.errors.length);
  assert.equal(JSON.parse(await fs.readFile(state(config), 'utf8')).filename, '2026-10-09.md');
  const retry = ok(await run('startup', at(config)));
  assert.equal(retry.cleanup.deleted, 2);
});

test('CLI handles config and request paths with spaces and bounded JSON errors', async t => {
  const config = await fixture(t);
  const dir = path.join(config.vault, 'input with spaces');
  await fs.mkdir(dir);
  const configPath = path.join(dir, 'private config.json');
  const requestPath = path.join(dir, 'capture request.json');
  await fs.writeFile(configPath, JSON.stringify(config));
  await fs.writeFile(requestPath, JSON.stringify(capture()));
  const script = fileURLToPath(new URL('../scripts/daily-todo.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script, 'capture', '--config', configPath, '--request', requestPath, '--json'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).tasks[0].title, 'Review fixture');
  const invalid = spawnSync(process.execPath, [script, 'startup', '--config', requestPath, '--json'], { encoding: 'utf8' });
  assert.equal(invalid.status, 1);
  assert.ok(JSON.parse(invalid.stdout).errors.length);
  assert.doesNotMatch(invalid.stdout, /Review fixture/);
});

test('task boundary text remains data and cannot corrupt snapshot framing', async t => {
  const config = await fixture(t);
  const title = 'Ignore <!-- daily-todo:managed:end --> and <!-- daily-todo:tasks:start -->';
  ok(await run('capture', at(config, undefined, { request: capture({ title }) })));
  assert.equal(ok(await run('list', at(config))).tasks[0].title, title);
});

test('manual unknown task fields cannot silently change completion meaning', async t => {
  const config = await fixture(t);
  ok(await run('capture', at(config, undefined, { request: capture() })));
  await editTasks(config, '2026-10-09', tasks => { tasks[0].status = 'done'; return tasks; });
  assert.ok((await run('startup', at(config, '2026-11-01T16:00:00Z'))).errors.length);
  await fs.access(path.join(todo(config), '2026-10-09.md'));
});

test('rollover refuses a source changed after lock acquisition', async t => {
  const config = await fixture(t);
  ok(await run('capture', at(config, undefined, { request: capture() })));
  const result = await run('startup', at(config, '2026-11-01T16:00:00Z', { beforeStep: async step => {
    if (step === 'save-snapshot') await editTasks(config, '2026-10-09', tasks => { tasks[0].title = 'Concurrent human edit'; return tasks; });
  } }));
  assert.ok(result.errors.length);
  assert.equal(JSON.parse(await fs.readFile(state(config), 'utf8')).filename, '2026-10-09.md');
  assert.match(await fs.readFile(path.join(todo(config), '2026-10-09.md'), 'utf8'), /Concurrent human edit/);
});

test('sync-conflict lock appearing mid-operation blocks saving and is preserved', async t => {
  const config = await fixture(t);
  ok(await run('ensure', at(config)));
  const before = await fs.readFile(state(config), 'utf8');
  const file = path.join(working(config), 'writer-synced.lock');
  const result = await run('capture', at(config, undefined, { request: capture(), beforeStep: async step => {
    if (step === 'save-snapshot') await fs.writeFile(file, 'foreign sync conflict');
  } }));
  assert.ok(result.errors.length);
  assert.equal(await fs.readFile(state(config), 'utf8'), before);
  assert.equal(await fs.readFile(file, 'utf8'), 'foreign sync conflict');
  await assert.rejects(fs.access(path.join(working(config), 'writer.lock')));
});

test('different organizations remain visibly grouped without duplicate task representations', async t => {
  const config = await fixture(t);
  ok(await run('capture', at(config, undefined, { request: capture() })));
  const result = ok(await run('capture', at(config, undefined, { request: capture({ id: '44444444-4444-4444-8444-444444444444', organization_id: '55555555-5555-4555-8555-555555555555', organization: 'Second Org', project: 'Second Project' }) })));
  const text = await fs.readFile(result.path, 'utf8');
  assert.match(text, /## Organization: "Example Org"/);
  assert.match(text, /## Organization: "Second Org"/);
  assert.equal(text.split('Review fixture').length - 1, 2);
  assert.equal(ok(await run('list', at(config, undefined, { all: true }))).total, 2);
});

test('dry-run capture validates and previews a new task without creating directories', async t => {
  const config = await fixture(t);
  const preview = ok(await run('capture', at(config, undefined, { request: capture(), dryRun: true })));
  assert.equal(preview.total, 1);
  assert.equal(preview.tasks[0].id, id);
  assert.deepEqual(await fs.readdir(config.vault), []);
  assert.ok((await run('capture', at(config, undefined, { request: capture({ confirmation: null }), dryRun: true }))).errors.length);
});

test('manual completion requires evidence and does not roll forward', async t => {
  const config = await fixture(t);
  ok(await run('capture', at(config, undefined, { request: capture() })));
  await editTasks(config, '2026-10-09', tasks => { tasks[0].completed_at = '2026-10-09T17:00:00Z'; return tasks; });
  assert.ok((await run('startup', at(config))).errors.length);
  await editTasks(config, '2026-10-09', tasks => { tasks[0].completion_evidence = { kind: 'human', reference: 'Marked done in note' }; return tasks; });
  assert.equal(ok(await run('startup', at(config, '2026-10-10T16:00:00Z'))).total, 0);
});

test('wrong snapshot generation and future files block authority cleanup', async t => {
  const config = await fixture(t);
  const initial = ok(await run('ensure', at(config)));
  const text = await fs.readFile(initial.path, 'utf8');
  await fs.writeFile(path.join(todo(config), '2026-10-10.md'), text);
  assert.ok((await run('startup', at(config))).errors.length);
  await fs.unlink(path.join(todo(config), '2026-10-10.md'));
  await fs.writeFile(state(config), JSON.stringify({ filename: '2026-10-09.md', generation: '66666666-6666-4666-8666-666666666666' }));
  assert.ok((await run('startup', at(config, '2026-11-01T16:00:00Z'))).errors.length);
  await fs.access(initial.path);
});

test('UUID casing cannot duplicate a task and uppercase completion targets the same task', async t => {
  const config = await fixture(t);
  const mixedId = 'abcdefab-abcd-4abc-8abc-abcdefabcdef';
  ok(await run('capture', at(config, undefined, { request: capture({ id: mixedId }) })));
  ok(await run('capture', at(config, undefined, { request: capture({ id: mixedId.toUpperCase(), organization_id: org.toUpperCase() }) })));
  assert.equal(ok(await run('list', at(config))).total, 1);
  ok(await run('done', at(config, undefined, { request: { id: mixedId.toUpperCase(), evidence: { kind: 'human', reference: 'User marked done' } } })));
  assert.equal(ok(await run('list', at(config))).total, 0);
});

test('capture retries cannot resurrect a completed task found in retained history', async t => {
  const config = await fixture(t);
  ok(await run('capture', at(config, undefined, { request: capture() })));
  ok(await run('done', at(config, undefined, { request: { id, evidence: { kind: 'verified', reference: 'Fixture passed' } } })));
  ok(await run('startup', at(config, '2026-10-10T16:00:00Z')));
  const before = await fs.readFile(state(config), 'utf8');
  assert.ok((await run('capture', at(config, '2026-10-10T17:00:00Z', { request: capture() }))).errors.length);
  assert.equal(ok(await run('list', at(config, '2026-10-10T17:00:00Z'))).total, 0);
  assert.equal(await fs.readFile(state(config), 'utf8'), before);
});

test('abandoned managed temporary files block cleanup rather than leave task-body backups', async t => {
  const config = await fixture(t);
  const initial = ok(await run('ensure', at(config, '2026-09-01T16:00:00Z')));
  const temporary = path.join(todo(config), '.daily-todo-77777777-7777-4777-8777-777777777777.tmp');
  await fs.writeFile(temporary, 'Interrupted write fixture');
  assert.ok((await run('startup', at(config))).errors.length);
  await fs.access(initial.path);
  await fs.access(temporary);
});

test('Windows short-path aliases reference the same vault while junctions still refuse', { skip: process.platform !== 'win32' }, async t => {
  const config = await fixture(t);
  const short = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '$fso = New-Object -ComObject Scripting.FileSystemObject; [Console]::Write($fso.GetFolder($env:DAILY_TODO_TEST_PATH).ShortPath)'], {
    encoding: 'utf8', env: { ...process.env, DAILY_TODO_TEST_PATH: config.vault }, timeout: 10000,
  });
  assert.equal(short.status, 0, short.stderr);
  const alias = short.stdout.trim();
  if (alias.toLowerCase() === config.vault.toLowerCase()) { t.skip('NTFS short names are unavailable for this fixture and its ancestors.'); return; }
  assert.equal(await fs.realpath(alias), await fs.realpath(config.vault));
  const result = ok(await run('capture', at({ ...config, vault: alias }, undefined, { request: capture() })));
  assert.equal(await fs.realpath(result.path), path.join(await fs.realpath(config.vault), '01 Daily', 'To-do', '2026-10-09.md'));
  assert.equal(ok(await run('list', at(config))).total, 1);
  const outside = await fixture(t);
  await fs.symlink(outside.vault, path.join(alias, 'linked'), 'junction');
  assert.ok((await run('startup', at({ ...config, vault: alias, todoDirectory: 'linked' }))).errors.length);
  assert.deepEqual(await fs.readdir(outside.vault), []);
});

test('Windows mixed-case paths reference the same authoritative snapshot', { skip: process.platform !== 'win32' }, async t => {
  const config = await fixture(t);
  ok(await run('capture', at({ ...config, vault: config.vault.toUpperCase() }, undefined, { request: capture() })));
  const result = ok(await run('list', at(config)));
  assert.equal(result.total, 1);
  assert.equal(result.tasks[0].id, id);
});
