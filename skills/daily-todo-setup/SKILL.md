---
name: daily-todo-setup
description: Configure the Daily To-do plugin's private vault, SessionStart reminder and optional Windows morning schedule. Use when setting up this plugin or repairing its configuration; do not change unrelated hooks or tasks.
---

# Configure Daily To-do

Resolve the installed plugin root from this skill's path. Confirm the private vault location and the user's retention/schedule choices. The standard workflow uses a 14-date window, five focus tasks and America/Los_Angeles dates; the Windows installer schedules 06:00 in that timezone. Explain that expired completion history is removed and no archive is made. Use the user's already-recorded choices without asking again.

On Windows, preview the exact installation before applying it:

```powershell
pwsh -NoProfile -File <plugin-root>/scripts/install-windows.ps1 -Vault <absolute-private-vault> -Preview
pwsh -NoProfile -File <plugin-root>/scripts/install-windows.ps1 -Vault <absolute-private-vault>
```

Use normal execution approvals. The installer writes private configuration and one named scheduled task; inspect its returned evidence. Preserve unrelated tasks, hooks and configuration. Do not call a model provider just to calculate dates or roll tasks forward.

Codex discovers the plugin's SessionStart hook, but the user must review and trust its exact definition through `/hooks`. Never fabricate hook trust, write an approval record on the user's behalf, or use a blanket trust bypass. Verify configuration with a real `startup` invocation and distinguish that from evidence that a fresh chat automatically ran the hook.

On other platforms, write the same private JSON config with the user's confirmed vault and timezone, then test the helper. Set up the equivalent scheduler only when authorized; the bundled scheduler installer is Windows-only. Kai or another authorized remote agent can use the configured host helper without adding a remote service.

Report the actual plugin path, private config path, scheduled trigger, latest daily file and hook trust status. An unavailable vault, held cooperative lock or invalid snapshot is a blocker, not permission to erase or recreate state. Never put the private config or actual task records in the public repository.
