import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, existsSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const windows = process.platform === 'win32';
const installer = resolve('scripts/install-windows.ps1');
const morning = resolve('scripts/morning.ps1');
function powershell(file, args) {
  return spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file, ...args], { encoding: 'utf8' });
}
test('Windows install preview is repeatable, private, and quotes paths with spaces', { skip: !windows }, () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'todo install ')));
  try {
    const vault = join(dir, 'private vault'); mkdirSync(vault);
    const config = join(dir, 'private config', 'config.json');
    const args = ['-Vault', vault, '-ConfigPath', config, '-Preview'];
    const first = powershell(installer, args);
    assert.equal(first.status, 0, first.stderr);
    const result = JSON.parse(first.stdout);
    assert.equal(result.config.vault, vault);
    assert.equal(result.config.retentionDays, 14);
    assert.equal(result.config.timezone, 'America/Los_Angeles');
    assert.equal(existsSync(config), false);
    assert.equal(powershell(installer, args).stdout, first.stdout);
    assert.match(result.taskXml, /<StartBoundary>2020-01-01T00:00:00Z<\/StartBoundary>/);
    assert.match(result.taskXml, /<Interval>PT5M<\/Interval>/);
    assert.match(result.taskXml, /<StartWhenAvailable>true<\/StartWhenAvailable>/);
    assert.match(result.taskXml, /<LogonTrigger>/);
    assert.match(result.taskXml, /-WindowStyle Hidden/);
    assert.match(result.taskXml, /<ExecutionTimeLimit>PT2M<\/ExecutionTimeLimit>/);
    assert.match(result.taskXml, /<MultipleInstancesPolicy>IgnoreNew<\/MultipleInstancesPolicy>/);
    assert.match(result.taskXml, /-File &quot;[^<]+morning\.ps1&quot; -ConfigPath &quot;/);
    assert.ok(result.taskXml.includes(config.replaceAll('&', '&amp;')));
    mkdirSync(join(dir, 'private config'));
    writeFileSync(config, JSON.stringify({ ...result.config, extra: 'preserve me' }));
    const before = readFileSync(config, 'utf8');
    assert.equal(powershell(installer, args).status, 0);
    assert.equal(readFileSync(config, 'utf8'), before);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('installer preserves unrelated scheduled tasks and refuses a conflicting owner', { skip: !windows }, () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'todo install ')));
  const quote = value => `'${value.replaceAll("'", "''")}'`;
  try {
    const config = join(dir, 'private', 'config.json');
    const wrapper = join(dir, 'fixture.ps1');
    const record = join(dir, 'registration.json');
    const fixture = description => `
$ErrorActionPreference = 'Stop'
function Get-ScheduledTask {
  [CmdletBinding()]param([string]$TaskPath)
  [pscustomobject]@{TaskName='Unrelated'; Description='preserve'}
  [pscustomobject]@{TaskName='DailyTodo-GWBrain'; Description=${quote(description)}}
}
function Register-ScheduledTask {
  [CmdletBinding()]param([string]$TaskName,[string]$TaskPath,[string]$Xml,[switch]$Force)
  @{name=$TaskName; path=$TaskPath; xml=$Xml; force=[bool]$Force} | ConvertTo-Json | Set-Content -LiteralPath ${quote(record)}
}
& ${quote(installer)} -Vault ${quote(dir)} -ConfigPath ${quote(config)}
`;
    writeFileSync(wrapper, fixture('another owner'));
    const conflict = powershell(wrapper, []);
    assert.notEqual(conflict.status, 0);
    assert.equal(existsSync(config), false);
    assert.equal(existsSync(record), false);
    writeFileSync(wrapper, fixture('daily-todo-plugin: managed morning rollover v1'));
    const installed = powershell(wrapper, []);
    assert.equal(installed.status, 0, installed.stderr);
    assert.equal(installed.stderr, '');
    assert.equal(JSON.parse(readFileSync(config, 'utf8')).vault, dir);
    const registration = JSON.parse(readFileSync(record, 'utf8'));
    assert.equal(registration.name, 'DailyTodo-GWBrain');
    assert.equal(registration.path, '\\');
    assert.equal(registration.force, true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('installer rejects public-repository config and conflicting existing vault', { skip: !windows }, () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'todo install ')));
  try {
    const publicPath = resolve('examples/private-config-test.json');
    const rejected = powershell(installer, ['-Vault', dir, '-ConfigPath', publicPath, '-Preview']);
    assert.notEqual(rejected.status, 0);
    assert.equal(existsSync(publicPath), false);
    const config = join(dir, 'config.json');
    writeFileSync(config, JSON.stringify({ vault: join(dir, 'different') }));
    assert.notEqual(powershell(installer, ['-Vault', dir, '-ConfigPath', config, '-Preview']).status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('morning gate honors Los Angeles 06:00 across winter, summer, and DST boundaries', { skip: !windows }, () => {
  for (const [utc, due, date] of [
    ['2026-01-15T13:59:00Z', false, '2026-01-15'],
    ['2026-01-15T14:00:00Z', true, '2026-01-15'],
    ['2026-07-15T12:59:00Z', false, '2026-07-15'],
    ['2026-07-15T13:00:00Z', true, '2026-07-15'],
    ['2026-03-08T13:00:00Z', true, '2026-03-08'],
    ['2026-11-01T13:59:00Z', false, '2026-11-01'],
    ['2026-11-01T14:00:00Z', true, '2026-11-01'],
    ['2026-07-15T22:00:00Z', true, '2026-07-15'],
  ]) {
    const result = powershell(morning, ['-ConfigPath', join(tmpdir(), 'absent config.json'), '-Preview', '-NowUtc', utc]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { date, due, timezone: 'America/Los_Angeles' });
  }
});
