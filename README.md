# Daily To-do

Private daily Markdown task lists for Obsidian and AI agents. Capture commitments by organization and project, retain original timestamps, record verified completion, and start sessions with five focus tasks. Ask to **show all** for the full list.

The shared helper uses Node.js 22 or newer with no runtime dependencies or model API calls. Agents handle conversation; the helper handles dates, task IDs, writes, locks and rollover.

## Install in Codex

Clone this repository outside your vault, then use its absolute path:

```text
codex plugin marketplace add <absolute-repository-path> --json
codex plugin add daily-todo@daily-todo-local --json
```

Use `$daily-todo-setup` to configure your private vault. On Windows, preview and apply the bundled installer:

```powershell
pwsh -NoProfile -File <plugin-root>/scripts/install-windows.ps1 -Vault <absolute-vault-path> -Preview
pwsh -NoProfile -File <plugin-root>/scripts/install-windows.ps1 -Vault <absolute-vault-path>
```

Review and trust the exact SessionStart hook through `/hooks`. Installation alone does not establish hook trust. A fresh session uses the hook after host review; manual `$daily-todo` invocation is also available.

Private configuration defaults to `~/.codex/daily-todo/config.json`. `DAILY_TODO_CONFIG` can specify another absolute path. See [example configuration](examples/config.example.json) and [request contract](docs/requests.md). Keep configuration and actual tasks outside this repository.

## Daily workflow

- Capture explicit commitments with a source and verified project identity. Confirm inferred tasks before recording them. Ideas remain separate.
- Show five unfinished tasks at session start. Approved priority, due date and original age help order the view. Reminders do not authorize execution.
- Mark done with verified evidence or the user's confirmation. Ask when uncertain.
- Suggest priorities separately; apply them only after the user's actual approval.
- Create `01 Daily/To-do/YYYY-MM-DD.md` using America/Los_Angeles dates. The Windows schedule targets 06:00; session start catches up when needed. An authorized remote agent can invoke the same host helper.

The Windows task checks every five minutes using a Los Angeles time gate. It runs at or after 06:00 while the installing user is logged on, and catches up after logon. Repeated runs use the same idempotent helper. The computer must be available; this package does not provide an always-on remote host.

Other agents can follow `skills/daily-todo/SKILL.md` and call the same CLI. Automatic hooks and the bundled installer are host-specific; this package does not install integrations into every model application.

## Retention and recovery

Keep today and the preceding 13 local calendar dates. Before removing expired managed files, verify the new snapshot and commit its authority metadata. Unfinished tasks retain IDs and original capture timestamps through skipped days. Completed tasks stay in their completion-day file and do not roll forward. **There is no completion archive.** Expired daily files also lose their completion history.

The latest committed snapshot is authoritative. Historical unfinished copies never restore completed or manually removed tasks. Missing or conflicting authority, malformed content, unrecognized manual prose, symlinks and held writer locks stop affected operations. Never remove another writer's lock based on age. Keep unrelated notes outside the managed blocks; do not edit authority metadata manually.

Writes use the vault's cooperative `07 System/Working/writer.lock`. This coordinates participating writers on one host; it cannot enforce distributed exclusion against other devices or Obsidian. Local deletion does not erase cloud recycle bins, versions or backups. If a snapshot write succeeds but authority publication fails, preserve files and investigate the warning before further updates.

## Verify

```text
npm test
node scripts/daily-todo.mjs startup --config <private-config> --json
node scripts/daily-todo.mjs list --config <private-config> --all
node scripts/daily-todo.mjs prune --config <private-config> --dry-run
```

Tests use fictional temporary vaults. CI runs on Windows and Linux with Node 22 and 24. Public examples contain fictional data only.

MIT license. Copyright notices and license text must accompany redistributed copies.
