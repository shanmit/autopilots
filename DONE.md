# AutoPilots — Definition of Done

## Product

A restaurant owner, alone on their phone, describes their restaurant and campaign goal, is told exactly which photos to provide, and receives a vertical video they can post to TikTok immediately. No desktop, no assistance, no file conversion.

## Done gates

Done is all six. Each is verified by evidence, not assertion.

### G1 — TikTok-ready file
The export is an H.264/AAC MP4 that TikTok's uploader accepts.
Evidence: a real upload of a generated file succeeds. An .mp4 filename is not evidence.
Status: NOT MET. app.js MIME_CANDIDATES lists WebM first, so every export to date is WebM/VP9. TikTok does not accept WebM. MP4 is an unvalidated fallback.

### G2 — Real phone
The full flow completes on a real iPhone (Safari) and a real Android (Chrome), including saving the finished video to the camera roll.
Status: NOT MET. Verified only on Chrome 152 / macOS.

### G3 — Deployed
Reachable at an HTTPS URL with no download, install, login, or build step.
Status: NOT MET. Nothing is deployed; the only documented way to run it is opening a local index.html.

### G4 — Guided capture holds up
A non-technical owner understands what photo belongs in each slot without asking.
Status: BUILT, UNTESTED. Per-objective slot guidance exists; no one outside the team has used it.

### G5 — Survives interruption
A phone call, lock screen, or tab switch mid-session does not destroy the owner's work.
Status: NOT MET. State is memory-only; hiding the tab aborts recording.

### G6 — Proof
Three owners complete the flow unattended; at least one resulting video is posted publicly. We can state the completion rate and the top drop-off reason.
Status: NOT MET.

## Explicitly not required for done

Accounts, cloud storage, payments, AI photo analysis, additional objectives, additional soundtracks, drag-to-reorder. These come after done.

## Current standing

Gates met: 0 of 6. The rendering core is built and honestly documented; what is missing is everything between 'works on this Mac' and 'a stranger used it.'

## Working rules

- autopilots-codex is the single writer on main. Additional engineers require a separate Git worktree and branch.
- autopilots-gemini is analysis only and does not modify project files.
- Claims are accepted only with reproducible evidence. README figures are inherited, not verified, until re-run.
