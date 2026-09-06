# AutoPilots restaurant promotion video builder

A complete, browser-only restaurant video builder with an optional local soundtrack. Plain HTML, CSS, and JavaScript; no backend, framework, build step, dependencies, paid API, or external requests. Your photos and audio are decoded and rendered locally. The app does not analyze photo or audio content.

## Preview locally

Open `index.html` directly in a browser, for example by dragging it into Chrome. Keep `index.html`, `styles.css`, and `app.js` together. No server or internet connection is needed.

1. **Brief:** enter the restaurant name (30 characters), offer/details (40), and call to action (25), then choose one of the four objectives.
2. **Photos:** fill the first three required slots. The fourth objective-specific slot and a fifth extra photo are optional. Choose JPEG, PNG, or WebP files, each strictly smaller than 5 × 1024 × 1024 bytes. Slot guidance follows the objective; it is not inferred from your images.
3. **Review and generate:** edit every scene caption (40 characters maximum) and the CTA end card (25). Optionally pick a soundtrack: one of four built-in tracks synthesized locally with the Web Audio API (Sunny, Hearth, Velvet, Voltage) or your own MP3, M4A, or WAV file strictly under 15MB. Uploaded audio is decoded in memory, kept to at most its first 15 seconds, trimmed or looped to fill the video, and never leaves the browser. Preview with play/pause or the position slider — the preview plays the selected soundtrack from the scrubbed position — then generate. Recording takes 15 real seconds. Keep the tab visible. Cancel is available throughout recording.
4. Play the resulting video, select **Share video** when available, or select **Download video**. MP4/H.264 is preferred, with explicit AAC when a soundtrack is selected; WebM remains a fallback. The actual format and matching filename extension appear beside the download. Generate again after edits to replace an obsolete export.

**Sharing on phones:** Share video appears only when the browser exposes Web Share and `navigator.canShare({files: [file]})` accepts the actual export File. It opens the system share sheet with the video, its real filename and MIME type, a title, and text. Available destinations depend on the device and installed apps; TikTok or Photos may be offered. Cancellation is silent; a rejection points to the unchanged Download video control. The [Web Share specification](https://www.w3.org/TR/web-share/) defines the file-sharing and capability-check APIs.

If file sharing is unavailable on an iPhone, MP4 results show these steps: download the video, open it in Files, use Share → Save Video to save it to Photos, then upload it in TikTok. This guidance stays hidden on other devices and when file sharing is available; WebM fallback results instead explain that MP4 export is needed for Photos.

The share path is implemented and unit-tested with stubbed Web Share APIs in the real-browser harness, but **not device-verified**. No real iPhone, Android share sheet, Photos save, or TikTok handoff was tested. G2 remains unverified.

Changing objectives keeps photos in slot order and resets scene captions to the new objective's templates. Existing caption edits survive navigation and photo additions/replacements; removing a photo removes its caption edit. Brief changes update untouched caption defaults, while manually edited scene captions remain yours. Long substituted defaults prefer shorter templates with intact names or offers, then whole-word trimming without dangling articles or prepositions. Your manually edited captions are not rewritten; review defaults before recording. Scene captions may be blank; the brief and final CTA must be nonblank.

**Autosave and interruptions:** The browser saves the brief, objective, per-slot scene captions and manual-edit flags, final CTA/edit flag, soundtrack choice, and original photo/audio Files in IndexedDB on this device. Input changes are debounced by 800ms; photo add/remove, objective changes, audio add/remove and soundtrack selection write immediately. Hiding or leaving the page also flushes a snapshot. Remove audio clears the selected source file from the live session and its next autosave.

After a reload, a saved draft less than seven days old produces **Restore your last video?** with **Restore** and **Start fresh**. Nothing is restored before the owner chooses. Start fresh deletes the draft; expired records and records with an unknown objective are discarded. Restore sends original files through the same upload validation and decoding paths as fresh uploads, including the 1920px photo cap and 15-second decoded-audio cap. Caption edits stay edited; untouched defaults still update with the brief. A page retained in the browser's back/forward cache keeps its live edits.

Finished export blobs, object URLs, recording state, decoded bitmaps/audio buffers, and audio handles are never saved. An interrupted recording stops as before; restore returns an editor ready to generate a new video, not a half-finished recording. Download or share completed exports before leaving.

Autosave is a safety net. Each failed write is caught; on quota exhaustion, retries omit the stored audio first, then the largest stored photo, then disable autosave for that session with a quiet inline note. These omissions affect only storage copies, never live media or edits. A partial restore explains that missing files need to be added again. If IndexedDB is blocked or unavailable, editing and export still work. Browser storage can be cleared or evicted, and abrupt termination can precede the latest transaction's completion; only committed saves can be recovered ([IndexedDB transaction completion](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/complete_event)). Real phone-call/lock-screen behavior has not been device-verified.

**Phone layout:** At widths up to 768px, the review preview appears above the caption fields; desktop retains its two-column layout. Photo cards reserve the same preview area plus filename and Remove rows in both empty and filled states. Long filenames use an ellipsis rather than expanding the card. Phone controls have at least 44×44 CSS-pixel targets, including the scrubber, photo/file controls, and soundtrack radios; radio indicators stay small inside the larger target.

These layout changes are verified in desktop Chrome at a 390×844 CSS-pixel viewport, not on a real phone. The tests compare visual bounding boxes, enumerate visible interactive DOM controls (including recording and result states), and check file-selector button minimum dimensions. Native video-control internals are browser-owned; the test measures the video element, not each internal media-control target. G2/G4 device and owner validation remain outstanding.

Default captions lead with the owner's offer in scene 1 for every objective. If the full opening template exceeds 40 characters, it falls back to the offer itself rather than replacing it with the restaurant name. The first caption is fully visible at t=0; later captions retain their fade and rise, and scene crossfades are unchanged.

| Objective | Opening template | Scene 3 micro-CTA |
| --- | --- | --- |
| Special Offer | `{offer} at {restaurantName}` | Claim this deal now |
| New Dish Launch | `{offer} — new on the menu` | Be first to try it |
| Quiet Hours Special | `{offer} during quiet hours` | Grab your quiet table today |
| First-Time Diner Deal | `{offer} for your first visit` | Claim your first-visit deal |

Scene captions remain editable with a 40-character limit; the owner's final CTA retains its 25-character limit. These defaults implement the requested conversion structure; conversion lift has not been measured.

The previous AutoPilots landing page is preserved as `landing.html`, with its styles retained in `styles.css`.

## Run the real browser tests

Requirements: Node.js 18 or newer and an already installed Chrome or Chromium browser. No npm install and no downloaded packages are required. From this directory, run:

```sh
node test/run.mjs
```

The harness finds common macOS, Linux, and Windows Chrome paths. If your executable is elsewhere, set `CHROME_PATH` to its full path before running the same command. A sandbox that prohibits Chrome subprocesses must grant the test process permission to launch Chrome; the test fails clearly if it cannot start the browser. The harness never disables Chrome's sandbox.

Allow roughly two to three minutes. A temporary, isolated browser profile is used and removed afterward. The test creates five brightly colored, explicitly labeled **SYNTHETIC TEST IMAGES — NOT RESTAURANT PHOTOS** in browser memory; no real restaurant assets are supplied or downloaded. Temporary screenshots are written to `autopilots-desktop.png` and `autopilots-mobile.png` in the operating system's temporary directory.

The harness drives the actual app through Chrome DevTools Protocol and native input events, invokes the real canvas capture and MediaRecorder APIs, and tests:

- Required brief fields and objective; fewer than three photos; missing required slots even when optional photos are present.
- Exact invalid-type and oversized-file errors, the 5MB boundary, corrupt images, and successful JPEG/PNG/WebP decoding.
- Every objective leads with the offer, including a 40-character offer; a pixel comparison confirms the opening caption is opaque at t=0 and matches the settled caption position at t=0.5.
- All objective-specific slots and default captions; scene/CTA length enforcement; literal handling of markup-like user text.
- At 390×844, preview-before-captions visual order, at least 44×44 CSS-pixel control targets, and unchanged photo-slot/preview height after upload and removal.
- Every step at 320, 480, 768, and 1280 pixels without horizontal overflow; associated control labels and a visible keyboard focus outline.
- Preview animation, pause, scrubbing, cancellation, disabled conflicting controls, and release of capture tracks.
- Seven separate full recordings: a restored five-photo session with uploaded audio and a fresh three-photo session with IndexedDB blocked, in addition to the five baseline recordings: silent exports with three, four, and five photos (including re-generation and object URL revocation), plus two five-photo exports with audio — one built-in track and one uploaded synthetic WAV.
- MP4 output with an `ftyp` signature and `.mp4` filename when supported; soundtrack recorder MIME must contain `mp4a` and no `opus`, and downloaded MP4 bytes must contain `mp4a`/`esds` markers.
- Nonempty blobs above 50,000 bytes, actual downloaded files with matching byte counts and container signatures, matching MIME/filename extensions, and 720 × 1280 video decoding.
- Eight decoded frame samples per export. Mean RGB pixel distance must prove at least one distinct frame per photo plus the CTA; the first scene must also show motion between two samples. A static or fabricated export fails these checks.
- Real recording wall-clock time and decoded endpoint after seeking, each within 14.5–16.5 seconds.
- Soundtrack behavior: the three silent exports structurally carry zero audio tracks (verified at `MediaRecorder.start`), and the five-photo silent export is rejected by `decodeAudioData`; the built-in-track export carries one AAC audio track when MP4/AAC is supported whose decoded samples are nonsilent over 1–13s (RMS > 0.01) and fade to under 20% of that RMS in the final 0.25s; the uploaded 4-second synthetic 440Hz WAV is looped, with nonsilent decoded audio at 6s and 13s; upload validation rejects wrong types, files at or above 15MB, and corrupt audio with exact messages; the audition creates oscillators only while the preview is playing and none when "No music" is selected.
- Stubbed file-sharing support on/off, the shared File’s exact bytes/name/MIME, title/text, silent cancellation, rejection with Download fallback and retry, and conditional iPhone guidance. No native share sheet is opened by these tests.
- Real IndexedDB save/reload/explicit restore with original media metadata and edited/default captions; video generation after restore; saving during an interrupted recording without persisting recorder state; Start fresh; seven-day expiry; unknown objectives; debounced writes and media removal; quota shedding in the required order without disturbing live media; and a complete fresh export when IndexedDB throws.
- Safe handling of a recorder startup failure and no supported MIME types.
- Zero external network requests and zero console/runtime errors throughout the flow. Only `file://` app resources, browser-local `blob:` videos, and Chrome's built-in `data:` media-control icons are allowed. Blob/data resources do not make network requests; HTTP(S), WebSocket, and every other nonlocal scheme fail the check.

Every check prints PASS or the failing assertion. The process exits nonzero on failure and prints a final pass/fail summary.

## Verified test result

The completed run in Chrome 152.0.7977.76 reported:

```text
PASS: 44/44 tests; 7 complete real-time video exports (3 with soundtrack audio); zero external network requests; zero browser errors.
```

| Photos | Soundtrack | Downloaded bytes | Recorder MIME | Audio tracks | Recording wall-clock | Decoded endpoint | Distinct sampled frames |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 3 | none | 8,583,284 | `video/mp4;codecs=avc1.42E01E` | 0 | 15.001s | 15.003s | 6 |
| 4 | none | 8,263,489 | `video/mp4;codecs=avc1.42E01E` | 0 | 15.002s | 15.014s | 6 |
| 5 | none | 8,462,239 | `video/mp4;codecs=avc1.42E01E` | 0 | 15.001s | 15.013s | 7 |
| 5 | Sunny (built-in) | 8,643,570 | `video/mp4;codecs=avc1.42E01E,mp4a.40.2` | 1 | 15.002s | 14.997s | 7 |
| 5 | Uploaded 4s WAV | 8,637,428 | `video/mp4;codecs=avc1.42E01E,mp4a.40.2` | 1 | 15.002s | 15.014s | 7 |
| 5 | Uploaded WAV, restored session | 8,593,901 | `video/mp4;codecs=avc1.42E01E,mp4a.40.2` | 1 | 15.001s | 15.007s | 7 |
| 3 | none, IndexedDB blocked | 8,571,651 | `video/mp4;codecs=avc1.42E01E` | 0 | 15.002s | 15.010s | 6 |

All seven downloaded files decoded at 720 × 1280, had `.mp4` extensions, and contained an `ftyp` signature. The table reports recorder MIME at startup; final blob MIME was `video/mp4;codecs=avc1.42001f` for silent exports and `video/mp4;codecs=avc1.42001f,mp4a.40.2` for all three soundtrack exports. All three soundtrack files contained `mp4a` and `esds` markers, with no Opus in their recorder MIME.

The Sunny export's decoded audio ran 14.976s with mid RMS 0.1784 (1–13s) falling to tail RMS 0.01843 in the final 0.25s (fade-out evidence); the uploaded-WAV export's decoded audio ran 14.976s with RMS 0.2942 at both 6s and 13s, proving the 4-second source looped. All four silent recordings carried zero audio tracks at recorder startup; the five-photo silent export was also rejected by `decodeAudioData`. The process exited 0. The first-frame pixel test found 6,839 opaque caption pixels absent from the blank-caption frame; all 6,839 matched the settled caption positions. At 390×844, the measured photo slot stayed 554.734375px tall before and after upload, with its preview area unchanged at 203.859375px. File sizes and precise frame timings vary between runs.

## Rendering and timing

The output canvas is 720 × 1280 and uses `captureStream(30)`. Photos fill the frame with center-based cropping and the prescribed camera motions:

| Photos | Scene lengths | Motions | End card |
| --- | --- | --- | --- |
| 3 | 4s each | zoom-in, pan-right, zoom-out | 3s |
| 4 | 3s each | zoom-in, pan-left, zoom-out, pan-right | 3s |
| 5 | 2.4s each | zoom-in, pan-up, zoom-out, pan-down, pan-right | 3s |

Camera motions are eased (sine ease-in-out) rather than linear, so each scene accelerates gently from rest and settles before the transition. Every photo frame gets a pre-rendered corner vignette (up to 28% darkening) and a very light warm color cast to unify mixed-quality photos. Captions are drawn at weight 800 with a soft drop shadow (with slight negative letter-spacing on browsers supporting canvas `letterSpacing`, applied before text measurement so wrapping is unchanged) and are fully visible immediately in scene 1; later scenes fade in with a small rise over their first 0.45 seconds; a soft graduated scrim over roughly the bottom 400px supports contrast without covering half the photo. The CTA end card draws the first (hero) photo blurred and darkened — pre-rendered once, drifting with a slow 4% eased zoom over its 3 seconds — with the restaurant name as a tracked-out uppercase lockup and the CTA text on a solid rounded terracotta backdrop. Text and backdrop share the same fade and rise over the card's first half second. The backdrop stays within the 56px horizontal margins; text wraps within 544px with padding, centered below the restaurant-name lockup. Normal text and maximum-length name/CTA strings were visually checked in Chrome without overlap or clipping. The button appearance is burned into the video, not an interactive link.

Each transition crossfades during the final 0.5 seconds of the outgoing scene, including the transition to the CTA. These fades are included in the timeline rather than added to it: the schedule is exactly 12 seconds of photo scenes plus 3 seconds of CTA. Text is measured and word-wrapped, including long unbroken words, within a 608px area. Video is recorded with a requested bitrate of 6.5 Mbps, preferring H.264 (plus 128 kbps AAC when a soundtrack is chosen). The verified 15-second MP4 exports were approximately 8.2–8.6MB; actual bitrate and size depend on the encoder and content.

**Duration metadata depends on the container.** All seven MP4 exports in the verified run reported finite duration immediately. WebM fallback exports may initially report `Infinity`. The tests independently measure `performance.now()` immediately around the real recorder's `start()` and `stop()` calls. When duration is nonfinite, they seek the decoded video to its end to discover the media endpoint. For every export, they seek to eight timestamps and sample decoded pixels. They do not substitute a declared duration for recording or playback evidence. Encoded endpoints can differ from the 15-second schedule by a frame because real-time capture and encoding are browser-scheduled.

## Browser and format caveats

For silent exports, the app tests MIME candidates in this order: MP4/H.264, generic MP4, WebM/VP9, WebM/VP8, generic WebM. For soundtrack exports, it tries explicit MP4/H.264/AAC (`video/mp4;codecs=avc1.42E01E,mp4a.40.2`), then WebM/VP9/Opus, WebM/VP8/Opus, and generic WebM. Generic MP4 is excluded from the audio list because it produced Opus-in-MP4 in the Chrome probe. The browser must support both canvas capture and a candidate MediaRecorder format. Otherwise generation is disabled with a clear explanation. A startup error also restores the editor instead of offering a broken file.

Verified in this environment with **Chrome 152.0.7977.76 on macOS**, producing H.264 MP4 with `.mp4` filenames and AAC when a soundtrack is selected. Silent exports contain no audio track. Other browsers, real phones, and TikTok uploader acceptance have not been validated by this run. G1 still requires a successful real TikTok upload as evidence; these tests establish the file-format portion only. This app does not transcode or rename WebM to MP4.

Known limitations:

- The tab must stay visible and the device awake during recording. Hiding the tab stops the attempt with an explanation; CPU load or device sleep can affect frame rate and timing. Actual recording is real time, not an instantaneous export.
- Drafts are autosaved locally when IndexedDB permits it, with a seven-day restore window and explicit restore choice. Exports are not persisted. There is no account or cloud storage; device loss or cleared browser data cannot be recovered.
- Slot order determines scene order. There is no drag-to-reorder or manual crop/focal-point editor. Landscape images may lose edge content in the vertical crop; check the preview.
- Decoded photos are scaled down to a maximum 1920px longest edge to bound retained memory. Very large or corrupt images may fail to decode, and small source images can look soft when enlarged. Animated images are treated as stills.
- Character limits use browser/JavaScript UTF-16 length, so some emoji count as two characters. System fonts and glyph appearance vary by operating system.
- Output has burned-in captions without a separate subtitle track, photo interpretation, or automated claims about what images contain. "No music" is the default and produces a silent video exactly as before; no AudioContext is created and no audio track is added unless a soundtrack is chosen.
- Soundtrack limits: the four built-in tracks are short deterministic Web Audio compositions (fixed-seed noise, no randomness), not licensed recordings. Uploaded audio must be MP3, M4A, or WAV strictly under 15MB with a recognized audio MIME type (files reporting an empty type are rejected rather than sniffed); only its first 15 seconds are retained in the decoded buffer, shorter files loop, and everything fades to silence before the 15-second mark. Recording with music requires a MediaRecorder MIME supporting an audio codec (Opus or AAC); otherwise the app asks for "No music" or another browser. Audio and video start within about 50ms of each other — fine for background music, not sample-exact sync. The original uploaded audio File is autosaved when storage permits and re-decoded on explicit restore; the AudioBuffer is never persisted.
- Automated label/focus/overflow checks and desktop/mobile screenshots passed; this is not a claim of a complete screen-reader or cross-browser accessibility audit.
