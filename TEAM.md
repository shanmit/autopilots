# AutoPilots agent team

Project: /Users/shanhuang/Desktop/Startups/AutoPilots

| Session | Role | Responsibility |
| --- | --- | --- |
| conductor-leader | Claude lead | Clarify the objective, assign bounded tasks, coordinate dependencies, review results, report to the user |
| autopilots-gemini | Gemini analyst | Research, repository inspection, options, evidence, recommendations; no project edits |
| autopilots-codex | Codex engineer | Implementation, debugging, testing, code review |

## Workflow

Give the lead a goal and acceptance criteria. The lead delegates analysis to Gemini and engineering to Codex as needed, checks their outputs, and returns a verified result. Independent analysis and engineering may run concurrently; dependent work waits for the relevant findings.

Each assignment includes its objective, scope, expected deliverable, acceptance criteria, and dependencies. Workers do not expand scope on their own. Completed workers wait; avoid repeated status requests or idle task loops.

The repository currently has no application code or commits. Before multiple engineering workers edit in parallel, establish an initial commit and give each engineer a separate branch and worktree. Until then, Codex is the single writer and Gemini is analysis only.

## Agent Deck commands

- `agent-deck session children conductor-leader`: list linked workers.
- `agent-deck session send autopilots-gemini "<bounded research task>"`: assign analysis.
- `agent-deck session send autopilots-codex "<bounded engineering task>"`: assign engineering.
- `agent-deck session output <session>`: inspect the latest result.

Check session status before sending. Do not repeat a send merely because readiness detection times out; inspect the terminal and latest output first. A waiting session may be finished, blocked, or awaiting approval. Read the actual result before deciding.
