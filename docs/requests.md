# Helper request contract

Run with Node.js 22 or newer. `--config` is an absolute path to private JSON with a `vault` absolute path. Optional fields are `timezone` (default `America/Los_Angeles`), `todoDirectory` (`01 Daily/To-do`), `workingDirectory` (`07 System/Working`) and `retentionDays` (`14`). Store this config outside the public repository.

The helper reads JSON requests, never shell expressions. `--request` names a private temporary JSON file. `--json` returns structured output; without it the CLI prints a human-readable result. The installed Node module also exports `run(command, options)` for the lifecycle hook and fixture tests.

## Capture

```json
{
  "organization_id": "11111111-1111-4111-8111-111111111111",
  "organization": "Example Organization",
  "project_id": "22222222-2222-4222-8222-222222222222",
  "project": "Example Project",
  "title": "Review the fictional prototype",
  "source": "Example user's explicit commitment",
  "confirmation": { "kind": "explicit", "reference": "Example request" }
}
```

Optional fields: `id` (a UUID for repeatable retries), `recorded_at` (an evidenced original ISO timestamp) and `due_date` (`YYYY-MM-DD`). A confirmed inferred task uses `confirmation.kind: "human"` and the actual approval reference. Missing/uncertain provenance and ideas are rejected. Retries with a supplied existing ID must not silently replace different task data.

IDs use canonical lowercase UUIDs. Command IDs accept equivalent uppercase input. A repeated capture checks current authority and retained history; a completed ID in retained history is refused. After that history expires, the helper cannot detect an old completed-ID replay without retaining completion history. Do not replay expired capture requests.

## Completion

```json
{
  "id": "33333333-3333-4333-8333-333333333333",
  "evidence": { "kind": "verified", "reference": "Example verification result" }
}
```

`kind: "human"` records the actual user's confirmation. An uncertain model assessment is not verified evidence. The helper records the completion timestamp; the task stays on that day and does not roll forward.

## Priority suggestion and approval

```json
{
  "id": "33333333-3333-4333-8333-333333333333",
  "priority": "high",
  "reason": "Example deadline and impact evidence"
}
```

Suggestions accept `high`, `normal` or `low`; they remain pending. Approval uses `approve-priority` and replaces `reason` with `approval: {"kind":"human","reference":"Actual human choice"}`. Do not manufacture that reference. Priority is unassigned until approval, and age is never a fabricated deadline.

## Views and cleanup

`list` shows five unfinished focus tasks; `list --all` expands the full unfinished list. `startup` ensures today, applies guarded retention and returns the reminder. `prune --dry-run` previews eligible files after checking state; `prune` performs the authorized retention. All mutation paths use the same cooperative writer lock. There is no force-delete or stale-lock override.
