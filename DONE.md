# AutoPilots — Definition of Done

## Product

A restaurant owner, alone on their phone, describes their restaurant and campaign goal, is told exactly which photos to provide, and receives a vertical video they can post to TikTok immediately. No desktop, no assistance, no file conversion.

## Seven done gates

Done is all seven. Each is verified by evidence, not assertion.

### G1 — TikTok-ready file
The export is an H.264/AAC MP4 that TikTok's uploader accepts.
Evidence: a real upload of a generated file succeeds. An .mp4 filename is not evidence.
Status: MET (code). Default exports are H.264 MP4, with AAC when a soundtrack is selected, and ftyp/avc1/mp4a/esds evidence verified in Chrome 152 by the test suite. A regression guard rejects Opus-in-MP4; silent exports contain no audio track, and WebM remains a fallback when MP4 is unsupported. No video has actually been uploaded to TikTok yet, so real upload acceptance is still unproven.

### G2 — Real phone
The full flow completes on a real iPhone (Safari) and a real Android (Chrome), including saving the finished video to the camera roll.
Status: NOT MET. One-tap Web Share hands the MP4 to the OS share sheet when the browser supports it, with iPhone Files-to-Photos guidance as fallback. The phone layout puts the preview above captions, reserves photo-slot space, and meets 44px tap targets in browser viewport tests. NO real iPhone or Android device has been tested; verification is limited to Chrome 152 / macOS and stubbed sharing APIs.

### G3 — Deployed
Reachable at an HTTPS URL with no download, install, login, or build step.
Status: NOT MET. Nothing is deployed; the only documented way to run it is opening a local index.html. Deployment was deliberately not attempted because it is outward-facing and requires the owner's decision.

### G4 — Guided capture holds up
A non-technical owner understands what photo belongs in each slot without asking.
Status: BUILT, UNTESTED. Per-objective slot guidance exists; no one outside the team has used it.

### G5 — Survives interruption
A phone call, lock screen, or tab switch mid-session does not destroy the owner's work.
Status: MET (code). IndexedDB autosave persists original photos/audio and editor fields, with explicit Restore or Start fresh, seven-day expiry, and quota shedding. Editing and export still work when storage is unavailable. Only completed saves survive an abrupt termination, and real phone-interruption behavior is unverified. Hiding the tab still aborts recording; the saved editor can generate a new video after restore.

### G6 — Proof
Three owners complete the flow unattended; at least one resulting video is posted publicly. We can state the completion rate and the top drop-off reason.
Status: NOT MET.

### G7 — The video converts
Two halves, BOTH required:

(a) STRUCTURAL — The app produces a converting structure by default, without the owner knowing any rules.
Status: MET. Every objective leads with the offer; the opening caption is fully visible at t=0 instead of fading in over 0.45s; scene-three cliches are replaced with micro-CTAs; the end-card CTA is drawn as a button. Tests cover first-frame caption pixels and offer placement, including a 40-character offer. This verifies structure, not conversion lift.

(b) MEASURED — Across at least three posted videos, report 3-second view-through against the account's own prior baseline, and at least one video producing a measurable action.
Status: NOT MET. Unreachable without G3 and G6.

Do not claim G7 on (a) alone.

## Explicitly not required for done

Accounts, cloud storage, payments, AI photo analysis, additional objectives, additional soundtracks, drag-to-reorder. These come after done.

## Current standing

Gates met: 3 of 7 in code (G1, G5, G7a); every gate requiring a real device, a real deployment, or a real user remains unmet. G7a is only the structural half of G7, not completion of the whole gate. The rendering core is built and honestly documented; what is missing is everything between 'works on this Mac' and 'a stranger used it.'

## Open decisions for the owner

- The end card asks for an action but carries no phone number, website, or address. Adding one means adding a field to the brief step, which changes the three-step flow. Likely the largest single conversion gap.
- TikTok recommends 1080x1920; the renderer outputs 720x1280.

## Working rules

- autopilots-codex is the single writer on main. Additional engineers require a separate Git worktree and branch.
- autopilots-gemini is analysis only and does not modify project files.
- Claims are accepted only with reproducible evidence. README figures are inherited, not verified, until re-run.
