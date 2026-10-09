# Daily To-do Plugin Design

## Purpose and authorization

Capture actionable commitments across projects without making every task due today. Keep a dated private list, original capture times, completion evidence and task age. A session begins with five focus tasks and an option to show all. The owner selected Markdown plus a shared helper and instructed the agent to build the skill/plugin after the requirements interview.

The public package contains only source code, documentation and fictional fixtures. Private configuration, actual task records, provider transcripts and project-registration data are not published. Creating a task does not authorize executing it. Priority changes require human approval. Uncertain completion requires human input.

## Package and runtime

- Node.js 22 or newer, using built-in libraries only; no server or external API in the helper.
- One shared CLI at `scripts/daily-todo.mjs`; skills and lifecycle hooks invoke it.
- `skills/daily-todo/SKILL.md` governs capture, completion, suggestions and reminders.
- A plugin manifest, local/repository marketplace entry and bundled SessionStart hook make the package installable.
- A Windows installer creates the private configuration and a daily scheduled task; it preserves unrelated configuration and never manufactures hook trust.
- Kai uses the same configured helper on the host computer. No new remote-access service is introduced.

## Private storage and task schema

The private vault uses `01 Daily/To-do/YYYY-MM-DD.md`, grouped by organization and project. `America/Los_Angeles` defines dates. Each managed snapshot has a versioned header and bounded, explicitly marked task blocks. Each task has an immutable UUID, verified organization/project identity, title, recorded timestamp with timezone, capture source, optional due date, approved priority/provenance, separate proposed priority, completion timestamp and completion evidence.

The original capture timestamp never resets during rollover. Age is the difference between local capture date and today's date; it is not a deadline or an urgency rule. Markdown has one canonical representation of task state: avoid a second editable copy that can silently diverge. Recognized manual task edits must validate; malformed or ambiguous edits block mutations. Unrelated text in today's file is preserved. Unrecognized prose in an expired file blocks automatic deletion of that file and is reported without copying its body into cleanup logs.

Ideas do not become actionable tasks automatically. This package leaves the separately requested idea list outside the task workflow. Clear explicit commitments and unfinished work can be captured automatically; inferred tasks are proposed to the human before capture. Capturing requires provenance establishing an explicit commitment or confirmed suggestion.

## Helper commands and authority

`ensure` creates today's snapshot if missing and rolls unfinished work from the latest authoritative snapshot. `capture` adds a validated task from a bounded JSON request. `done` requires verified evidence or human confirmation before recording completion. `suggest-priority` records a proposal; `approve-priority` requires a human approval reference and applies it. `list` defaults to five focus tasks; `--all` expands the unfinished list by organization/project. `prune` supports a preview and uses the same rollover safeguards. `startup` ensures today, runs safe retention and emits the reminder as hook context. Public CLI inputs never grant task-execution authority.

A minimal `.daily-todo-state.json` holds the latest committed snapshot filename and generation, not a second task ledger or completion archive. Historical snapshots are never unioned to recover unfinished rows: this would resurrect completed or manually removed tasks. Missing or contradictory authority blocks cleanup. A valid empty snapshot is authoritative. Crash recovery must distinguish a verified newly committed snapshot from arbitrary files; it must not silently choose an older historical file.

Approved priorities order reminders. Unapproved priority suggestions remain separate and cannot reorder tasks as approved. For tasks without approved priority, use deterministic due-date/capture-time ordering and label priority as unassigned; no impact judgment is invented. `show all` includes all unfinished tasks, with grouping. Task text is untrusted data, not instructions for the agent or hook.

## Completion and rollover

Verified completion records `completed_at` and bounded evidence or a human confirmation reference. If the agent is unsure, it asks the human and leaves the task unfinished. Completed tasks remain only in the completion day's current list and do not roll forward. Earlier retained snapshots remain historical and are not silently rewritten. Rollover preserves IDs, source, original capture times, deadlines and approved priority provenance. Missing days require one current snapshot, not synthetic intermediate days. Concurrent scheduler/startup/Kai invocations cannot duplicate capture IDs or daily files.

## Fourteen-day retention

Keep today and the preceding 13 calendar dates. Expired means filename date is earlier than that cutoff; ignore modification time. The owner explicitly selected deletion of all expired completion history with no completion archive. Active tasks older than fourteen days must remain current, with their original age.

Under the cooperative writer lock, first save today's snapshot atomically, reread and verify it, then commit minimal authority metadata. Only after all steps succeed may expired recognized regular daily files be removed. Lock, write, verification, metadata or authority failures cause no pruning. Delete only exact valid `YYYY-MM-DD.md` managed files inside the configured To-do directory. Refuse symlinks/reparse points and resolved path escapes; leave unrelated notes and invalid date filenames untouched. Recheck deletion candidates before removal. Partial deletion reports remaining files for a later retry without changing task authority. Do not preserve deleted task bodies in cleanup logs, local archives or private backup files made by this helper.

Local removal is not secure erasure of cloud recycle bins, version history or unrelated backups. The helper does not delete those stores or other vault records.

## Lock and writes

Use the existing vault protocol: exclusive `07 System/Working/writer.lock`, including session, hostname, process, timezone-aware start time, scope and owner token. Any `writer*.lock`, including sync-conflict copies, blocks writes. Never clear a lock because of age. Reread state after acquisition and release only the acquired lock. Use sibling temporary files, flush and atomic replacement, then verify bytes. Cooperative locking does not enforce distributed exclusion against other devices or non-participating editors.

## Startup and scheduling

All entry points call the same helper. Daily creation is scheduled for 06:00 America/Los_Angeles when the host is available, with missed-run recovery. A Windows trigger must encode the selected timezone independently of the device timezone; verify its task XML. SessionStart creates today's file if absent, irrespective of time, and emits the top-five focus reminder with a show-all instruction. Lock contention or malformed files produce a short actionable warning without losing task data or blocking the whole chat.

Codex non-managed hook definitions require exact-hash review/trust. Installation must report trust pending until the host confirms trust; never write an invented human approval or use a blanket trust bypass. Installed paths and hook commands must handle spaces on Windows. Configuration stays in the user's private profile, not in the public source repository. The installer is repeatable, does not overwrite unrelated hooks/tasks, and exposes its actual runtime path and verification result.

## Verification and release

Use disposable fixture vaults, never real business tasks, for automated tests. Verify task lifecycle/provenance, preserved original age, repeated and missed-day rollover, manual edits/deletions, empty snapshots, completion exclusion, suggested/approved priority separation, top-five/all behavior, local date/DST boundaries, cooperative locks, malformed authority, unsafe paths, interrupted writes and partial pruning. Exercise CLI and lifecycle hook output with fictional records. Validate manifests, marketplace paths and skills. Review with an independent agent, address correctness issues and run relevant suites.

Initialize the user's actual private daily directory only after fixture tests pass. Verify a real startup invocation without inventing existing tasks. Install the plugin and schedule through supported host commands. Publish only the reviewed package to a public GitHub repository, verify remote contents/CI where available, and report any authentication or hook-trust blocker honestly.
