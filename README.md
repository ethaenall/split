# Split

I wanted the time when the body hits the line. Not when a parent taps.

Phone or laptop on a tripod. One mark. Draw the line. ARM. The crossing is the stamp.

Ethan Birchenall. Sammamish. Skyline. IB Diploma Candidate. Varsity scholar track. District qualifier, 400 / 800 / 4x400.

## Honest geometry

On a 400m track the 200 and the finish are opposite sides. One phone cannot see both. This camera sits on one mark. The UI says which.

Default demo: camera on FINISH, event 800. Crossing 1 = 400 split. Crossing 2 = 800 finish. Goal 2:07.04. Also 400-at-finish (goal 55.25) and 200-repeat.

## Run

```bash
cd "/Users/Ethan/Library/Mobile Documents/com~apple~CloudDocs/hackathons/split"
python3 -m http.server 8767
```

Open http://127.0.0.1:8767

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
| Cumulative, this interval, even split, next-must | |
| BYO AI: webhook sync, JSON, OpenAI-compatible ask | |

Even split = goal / planned crossings. Remaining = goal − elapsed. Next = remaining / crossings left. Times are M:SS.xx.

Manual MARK exists. It is small on purpose.

MIT. Copyright 2026 Ethan Birchenall.
