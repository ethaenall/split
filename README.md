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

## What is built

| Built | Not in this file |
| --- | --- |
| getUserMedia + click-to-place line | Multi-camera / opposite-side 200+finish |
| 1s empty-line calibrate, then ARM | Official FAT / photo-finish pixels |
| Luma sample vs short baseline, 800ms debounce | Lane assignment, AI, coach talk |
| Cumulative, this interval, even split, next-must | Cloud accounts |

Even split = goal / planned crossings. Remaining = goal − elapsed. Next = remaining / crossings left. Times are M:SS.xx.

Manual MARK exists. It is small on purpose.

MIT. Copyright 2026 Ethan Birchenall.
