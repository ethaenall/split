# Split

I wanted the time when the body hits the line. Not when a parent taps.

Phone or laptop on a tripod. One mark. Draw the line. ARM. The crossing is the stamp.

Ethan Birchenall. Sammamish. Skyline. IB Diploma Candidate. Varsity scholar track. District qualifier, 400 / 800 / 4x400.

## Honest geometry

On a 400m track the 200 and the finish are opposite sides. One phone cannot see both. This camera sits on one mark. The UI says which.

Stock presets: 100, 200, 400, 800, 1500, 200-repeat. Add your own event, mark, split names, goal, crossings, calibrate, and debounce. Setup exports JSON. The URL holds `e`, `m`, `g`, `n` so a meet can share a link. Goal starts empty — type yours.

Example times I run (not baked into the app): 400 55.25, 800 2:07.04.

## Run

```bash
cd "/Users/Ethan/Library/Mobile Documents/com~apple~CloudDocs/hackathons/split"
python3 -m http.server 8767
```

Open http://127.0.0.1:8767

`node test/run.js` — math, cover-crop, boot crash guard.

Camera is blocked on `file://`. Use the server.

Judges: allow camera → tap the video to draw the line → ARM → wait one second → wave a hand through the line → the split appears.

Or: Upload clip → draw line → ARM → crossings stamp off the film. Clock follows the video.

Connect AI is optional. Paste a webhook. Every crossing POSTs JSON. Or download / copy the session and drop it into your model. OpenAI-compatible base URL works for local models. Keys stay in this browser. No built-in coach.

## What is built

| Built | Not in this file |
| --- | --- |
| getUserMedia + click-to-place line | Multi-camera / opposite-side 200+finish |
| Upload / drop a race clip | Official FAT / photo-finish pixels |
| 1s empty-line calibrate, then ARM | Lane assignment, built-in coach |
| Luma sample vs short baseline, 800ms debounce | Cloud accounts |
| Wireframe bodies (MediaPipe Pose CDN). Hip crossing also stamps | Lane IDs |
| BYO AI: webhook sync, JSON, OpenAI-compatible ask | |
| Configurable events / marks / labels / detect | |

Even split = goal / planned crossings. Remaining = goal − elapsed. Next = remaining / crossings left. Times are M:SS.xx.

Manual MARK exists. It is small on purpose.

MIT. Copyright 2026 Ethan Birchenall.
