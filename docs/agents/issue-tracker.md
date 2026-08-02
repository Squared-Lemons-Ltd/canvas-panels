# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue:** `gh issue create --title "..." --body-file <path>`.
- **Read an issue:** `gh issue view <number> --comments`, including labels and state as needed.
- **List issues:** use `gh issue list --state <state> --json number,title,body,labels,assignees,url` with suitable filters.
- **Comment:** `gh issue comment <number> --body-file <path>`.
- **Apply or remove labels:** `gh issue edit <number> --add-label "..."` / `--remove-label "..."`.
- **Close:** `gh issue close <number> --comment "..."`.

Infer the repository from `git remote -v`; `gh` does this automatically inside this clone.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## When a skill says “publish to the issue tracker”

Create a GitHub issue.

## When a skill says “fetch the relevant ticket”

Run `gh issue view <number> --comments`.

## Wayfinding operations

The map is one GitHub issue labelled `wayfinder:map`; tickets are child issues.

- **Map:** create an issue with `wayfinder:map`.
- **Child ticket:** create the ticket with one `wayfinder:<type>` label (`research`, `prototype`, `grilling`, or `task`), then attach it with GitHub’s sub-issues API. If sub-issues are unavailable, use a task list on the map and put `Part of #<map>` at the top of the child.
- **Blocking:** use GitHub’s native issue dependencies. Add an edge with `gh api --method POST repos/Squared-Lemons-Ltd/canvas-panels/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-database-id>`. The database id comes from `gh api repos/Squared-Lemons-Ltd/canvas-panels/issues/<number> --jq .id`.
- **Frontier:** list the map’s open children in order, excluding assigned tickets and tickets whose `issue_dependencies_summary.blocked_by` count is non-zero.
- **Claim:** `gh issue edit <number> --add-assignee @me` before any work.
- **Resolve:** post the answer as a resolution comment, close the ticket, then append a one-line linked gist to the map’s **Decisions so far** section.

Always refer to maps and tickets by their linked titles in human-readable output, never by bare issue numbers.
