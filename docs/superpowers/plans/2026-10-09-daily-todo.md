# Daily To-do Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build, verify, install and publish the requested daily Markdown task skill/plugin.

**Architecture:** One deterministic Node helper owns snapshots, task mutations, authority metadata, cooperative locking and retention. Plugin skills supply conversational capture, completion and human-approved priority workflows. The scheduler and SessionStart hook call the same helper with private host configuration.

**Tech Stack:** Node.js 22+ standard library, Node test runner, Markdown, JSON, Windows PowerShell Task Scheduler.

**Spec:** `docs/superpowers/specs/2026-10-09-daily-todo-design.md`

## Global Constraints

- No runtime third-party dependencies or model API calls in the helper.
- Private daily files: `01 Daily/To-do/YYYY-MM-DD.md`; timezone `America/Los_Angeles`.
- Retain today plus the preceding 13 calendar dates; no completion archive.
- Verified completion or human confirmation; human-approved priority changes only.
- Latest committed snapshot is authoritative; historical records never resurrect tasks.
- Respect `07 System/Working/writer*.lock`; never clear someone else's lock.
- Public output contains only source, docs and fictional examples.
- Provider planning/review calls run outside the execution sandbox under normal approvals.

## Review Focus

- Edited or missing authoritative snapshots must block unsafe recovery/pruning rather than restore stale tasks.
- Windows paths with spaces, reparse points and nonexistent ancestor directories must remain contained.
- A current file saved before metadata failure must recover without duplication or premature pruning.
- Unrecognized manual prose must survive mutations and prevent unnoticed loss on expiration.
- The host's timezone, DST and missed morning runs must not change the selected 06:00 schedule.

### Task 1: Snapshot engine, task lifecycle and safe retention

**Files:** Create `scripts/daily-todo.mjs`; test `tests/daily-todo.test.mjs`.

**Interfaces:** Export `run(command, options)` returning structured results; options include validated config, request, all, dryRun, sessionId and an injectable test clock. CLI: `node scripts/daily-todo.mjs <command> --config <private-json> [--request <json>] [--all] [--dry-run] [--json]`. Config: `{vault, timezone, todoDirectory, workingDirectory, retentionDays}` with defaults in the spec. Commands: `ensure`, `capture`, `done`, `suggest-priority`, `approve-priority`, `list`, `prune`, `startup`.

- [ ] Write fixture tests showing lifecycle commands are missing: original capture survives a 20-day gap, completed tasks do not roll, unapproved priorities do not reorder as approved, top five and all are distinct.
- [ ] Run `node --test tests/daily-todo.test.mjs`; confirm failures because behavior is absent.
- [ ] Implement versioned Markdown snapshots with one canonical task representation and minimal authority metadata.
- [ ] Add filesystem tests for locks, duplicate invocations, valid manual task edits/deletions, unrelated prose, missing authority, invalid filenames, symlink escapes, injected write/metadata failure and partial pruning.
- [ ] Implement exclusive vault lock, reread-after-lock, atomic save/re-read verification, authority commit and guarded file-only pruning.
- [ ] Run `node --test tests/daily-todo.test.mjs`; require all assertions to pass.
- [ ] Commit the runtime and tests; record exact test result and any deviations in the private ledger.

### Task 2: Skills, hook and portable packaging

**Files:** Create `skills/daily-todo/SKILL.md`, `skills/daily-todo/agents/openai.yaml`, `hooks/session-start.cjs`, `hooks/hooks.json`, plugin/marketplace manifests, `package.json`, fictional `examples/`, `README.md`, `LICENSE`, CI and `tests/plugin.test.mjs`.

**Interfaces:** Consume Task 1's CLI and structured `startup` output. The hook resolves the installed plugin root and private config, emits valid SessionStart `additionalContext` containing five tasks plus show-all, and handles unconfigured/locked cases without leaking config secrets. Manifest paths remain plugin-relative. No server is included.

- [ ] Write tests for hook output, space-bearing paths, unconfigured host, malformed config, top-five output and safe task-content framing.
- [ ] Run tests and confirm the missing hook/manifest behavior fails.
- [ ] Write the bounded skill workflow with explicit task provenance, uncertainty escalation, priority approval and separate ideas.
- [ ] Implement hook and package metadata using current official schemas and documented compatibility where required.
- [ ] Add generic usage examples and CI using fixture tests; exclude all private paths/records.
- [ ] Run `node --test tests/*.test.mjs` and bundled skill validation; inspect actual output.
- [ ] Commit packaging and document any host-version limits.

### Task 3: Windows installation, scheduling and host verification

**Files:** Create `scripts/install-windows.ps1`, `scripts/morning.ps1` if required, and `tests/install.test.mjs`.

**Interfaces:** Consume helper startup/ensure and plugin install commands. Store private JSON outside source control. Create a distinctly named task invoking the installed helper at 06:00 America/Los_Angeles with missed-run recovery. Preserve all unrelated tasks/hooks/config. Provide a preview mode for tests and expose the task XML for verification.

- [ ] Write tests for contained config generation, repeatable install planning, quoted Windows paths and timezone-aware task XML across DST.
- [ ] Run those tests and confirm missing installer behavior fails.
- [ ] Implement the installer and scheduler integration without clearing locks or fabricating hook trust.
- [ ] Run the full suite and independent review; fix important findings with regression tests.
- [ ] Install against the actual host only after fixture validation; verify plugin discovery, today's private file, a real startup reminder and the scheduled task's action/trigger.
- [ ] Report exact hook trust state and any remote/Kai integration limits; do not claim a future chat ran without evidence.
- [ ] Commit and publish the generic package to the user's public GitHub destination; verify remote files and CI where available.

## Execution ledger

Track actual commits, test commands/results, review findings, provider usage uncertainty, registration links, installation evidence and publication state in `.local/build-ledger.md` (ignored). Preserve this plan's scope through resumptions. No task is complete on model summary alone.
