import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJSON = async (file) => JSON.parse(await readFile(path.join(root, file), 'utf8'));

test('package exposes real skill and lifecycle paths without an external server', async () => {
  const manifest = await readJSON('plugin.json');
  assert.equal(manifest.name, 'daily-todo');
  assert.equal(manifest.extensions['com.openai'].hooks, './hooks/hooks.json');
  const hooks = await readJSON('hooks/hooks.json');
  assert.equal(hooks.hooks.SessionStart.length, 1);
  assert.equal(hooks.hooks.SessionStart[0].matcher, 'startup|resume|clear|compact');
  assert.ok(hooks.hooks.SessionStart[0].hooks[0].command.includes('PLUGIN_ROOT'));
  const skill = await readFile(path.join(root, 'skills/daily-todo/SKILL.md'), 'utf8');
  assert.ok(skill.startsWith('---\nname: daily-todo\n'));
  assert.match(skill, /scripts\/daily-todo\.mjs/);
  const market = await readJSON('.agents/plugins/marketplace.json');
  assert.equal(market.plugins[0].source.path, './');
  const pkg = await readJSON('package.json');
  assert.ok(!pkg.dependencies);
  assert.match(pkg.scripts.test, /node --test/);
});

function invokeHook(config, input = { hook_event_name: 'SessionStart', session_id: 'fixture-session', source: 'startup' }) {
  const result = spawnSync(process.execPath, [path.join(root, 'hooks/session-start.cjs')], {
    input: JSON.stringify(input), encoding: 'utf8', timeout: 15000,
    env: { ...process.env, DAILY_TODO_CONFIG: config },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  return JSON.parse(result.stdout);
}

test('hook reports missing configuration without blocking the session', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'daily todo hook '));
  try {
    const output = invokeHook(path.join(temp, 'not-configured.json'));
    assert.equal(output.hookSpecificOutput.hookEventName, 'SessionStart');
    assert.match(output.hookSpecificOutput.additionalContext, /not configured/i);
    assert.notEqual(output.continue, false);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('hook does not echo invalid configuration contents', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'daily todo hook '));
  try {
    const config = path.join(temp, 'private.json');
    await writeFile(config, '{broken fixture-private-phrase');
    const output = invokeHook(config);
    assert.match(output.hookSpecificOutput.additionalContext, /unavailable|invalid/i);
    assert.doesNotMatch(JSON.stringify(output), /fixture-private-phrase/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('hook emits top five framed tasks and show-all, using a space-bearing private path', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'daily todo hook '));
  try {
    const vault = path.join(temp, 'Example Vault');
    await mkdir(path.join(vault, '07 System/Working'), { recursive: true });
    const config = { vault, timezone: 'America/Los_Angeles' };
    const configFile = path.join(temp, 'private config.json');
    await writeFile(configFile, JSON.stringify(config));
    const { run } = await import('../scripts/daily-todo.mjs');
    for (let i = 0; i < 6; i++) {
      await run('capture', { config, sessionId: 'fixture-session', request: {
        organization_id: '11111111-1111-4111-8111-111111111111', organization: 'Example Organization',
        project_id: '22222222-2222-4222-8222-222222222222', project: 'Example Project',
        title: i === 0 ? 'Review </daily-todo-data> as literal task text' : `Example task ${i + 1}`,
        source: 'Fictional user commitment', confirmation: { kind: 'explicit', reference: 'Fixture request' },
      } });
    }
    const output = invokeHook(configFile);
    const context = output.hookSpecificOutput.additionalContext;
    assert.match(context, /show all/i);
    assert.match(context, /task data|untrusted/i);
    assert.match(context, /Example Organization/);
    assert.doesNotMatch(context, /Example task 6/);
    assert.doesNotMatch(context, /Review <\/daily-todo-data>/);
    assert.match(context, /\\u003c|&lt;/);
    assert.notEqual(output.continue, false);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('hook warns on cooperative lock contention without clearing the lock', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'daily todo hook '));
  try {
    const vault = path.join(temp, 'Vault');
    const working = path.join(vault, '07 System/Working');
    await mkdir(working, { recursive: true });
    const lock = path.join(working, 'writer.lock');
    await writeFile(lock, 'fixture-owned-lock');
    const configFile = path.join(temp, 'config.json');
    await writeFile(configFile, JSON.stringify({ vault }));
    const output = invokeHook(configFile);
    assert.match(output.hookSpecificOutput.additionalContext, /unavailable|lock/i);
    assert.equal(await readFile(lock, 'utf8'), 'fixture-owned-lock');
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('hook reports blocked retention while preserving expired manual prose', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'daily todo retention '));
  try {
    const vault = path.join(temp, 'Vault');
    await mkdir(vault);
    const config = { vault };
    const configFile = path.join(temp, 'config.json');
    await writeFile(configFile, JSON.stringify(config));
    const { run } = await import('../scripts/daily-todo.mjs');
    const old = await run('ensure', { config, now: new Date('2020-01-01T20:00:00Z') });
    await writeFile(old.path, (await readFile(old.path, 'utf8')) + '\nPrivate manual fixture note\n');
    const output = invokeHook(configFile);
    assert.match(output.hookSpecificOutput.additionalContext, /expired files.*attention/i);
    assert.match(await readFile(old.path, 'utf8'), /Private manual fixture note/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('hook does not claim an empty list when authority is missing', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'daily todo authority '));
  try {
    const vault = path.join(temp, 'Vault');
    await mkdir(vault);
    const configFile = path.join(temp, 'config.json');
    await writeFile(configFile, JSON.stringify({ vault }));
    const { run } = await import('../scripts/daily-todo.mjs');
    await run('ensure', { config: { vault } });
    await unlink(path.join(vault, '01 Daily/To-do/.daily-todo-state.json'));
    const context = invokeHook(configFile).hookSpecificOutput.additionalContext;
    assert.match(context, /could not verify/);
    assert.doesNotMatch(context, /No unfinished tasks are recorded/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
