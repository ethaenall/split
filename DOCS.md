# Split — documentation

Finish-line camera split timer. One camera. One mark. The product is the crossing.

## Purpose

Stamp a split when a body crosses a line drawn on live video. Built for a phone or laptop on a tripod at a single point on the track.

## Named person

Ethan Birchenall built this for Reverie Hacks. The app is not locked to him. Any athlete/meet name is optional in Setup.

The barrier is the tap. A parent on the rail hits a button late. Split is the line.

## Target audience

High-school and college runners, parents on a tripod, small meets without a FinishLynx truck. Judges at Reverie Hacks 2026, Software Development track.

## Main features

- Live `getUserMedia` video
- Click or tap to place a line (vertical default, toggle horizontal)
- One second empty-line calibrate, then ARM
- Luma sampled along the line each frame against a short baseline
- Optional body wireframe (MediaPipe Pose, CDN). A hip that crosses the line also stamps
- Spike + 800ms debounce = crossing
- Line flash on detect
- Giant clock
- One fat ARM
- Cumulative, this interval, even-split goal, next-interval must-hit
- Threshold slider in the tune row
- Tiny manual MARK backup
- Stock events: 100, 200, 400, 800, 1500, 200-repeat — plus any event you add
- Any camera mark you name
- Setup: labels, goal, crossings, calibrate, debounce, import/export JSON, shareable URL
- Upload or drop a race clip (same line detector; clock follows the video)
- Connect AI: webhook POST on each crossing, download/copy session JSON, optional OpenAI-compatible ask
- Keys and tokens stay in `localStorage` on this device. No built-in coach.

## Honest geometry

A 400m oval puts the 200 and the finish on opposite sides. One phone cannot see both. Split does not pretend. Default demo keeps the camera on FINISH for an 800: first crossing is the 400, second is the finish.

## Installation

No npm. No frameworks. Static files.

```bash
cd "/Users/Ethan/Library/Mobile Documents/com~apple~CloudDocs/hackathons/split"
python3 -m http.server 8767
```

Open `http://127.0.0.1:8767`. HTTPS or localhost is required for the camera. `file://` is blocked by the browser; the page says so and prints the server command.

GitHub Pages (HTTPS) is the public judge URL once the repo is pushed.

## User manual

1. Allow the camera, or upload a clip.
2. Pick an event and the camera mark — or open Setup and make your own.
3. Type a goal if you want even-split / next-must.
4. Tap the video to drop the line. Toggle Vertical / Horizontal if you need a bar.
5. Press ARM. Keep the line empty for the calibrate window.
6. Clock starts when ARM finishes calibrate. That is the gun. On a clip, the clock follows the video.
7. Each body that crosses stamps cumulative time and the interval.
8. Read this interval vs even split, and what the next interval must be.
9. Tune threshold, debounce, and calibrate in Setup if the line is too hot or too deaf. Wire draws stick figures on bodies; turn it off if the CDN is blocked.
10. MARK is a last-resort tap.

### Stock events

| Event | Default mark | Planned | Goal | Crossing names |
| --- | --- | --- | --- | --- |
| 100 | FINISH | 1 | empty | 100 |
| 200 | FINISH | 1 | empty | 200 |
| 400 | FINISH | 1 | empty | 400 |
| 800 | FINISH | 2 | empty | 400, 800 |
| 1500 | FINISH | 4 | empty | 300, 700, 1100, 1500 |
| 200-repeat | 200 | 4 | empty | 200 #1 … |

Everything in that table is editable. Add events and marks. Export JSON or share `?e=800&m=FINISH&g=2:00.00&n=2`.

## Configuration

| Control | Meaning | Default |
| --- | --- | --- |
| Threshold | Mean absolute luma change that counts as a spike | 18 |
| Orientation | Vertical or horizontal line | Vertical |
| Wire | Body stick-figure overlay; hip-cross can stamp | on |
| Goal | Race goal, `M:SS.xx` or `SS.xx` | empty |
| Crossings | Planned hits at this camera | per event |
| Debounce | Quiet window after a hit | 800ms, editable |
| Calibrate | Empty-line sample before ARM | 1000ms, editable |
| Spike frames | Consecutive frames over threshold | 2 |

Baseline is the 1s calibrate profile, then a slow EMA on quiet frames so clouds do not count as athletes.

## Math

```
even = goal / planned
remaining = goal − elapsed
next = remaining / crossings_left
```

Display is `M:SS.xx`. No coach copy. No predicted place. Built-in model is none. Your endpoint is optional.

## Technical

| File | Job |
| --- | --- |
| `index.html` | Shell, dark phone-wide CSS |
| `line.js` | Place line, sample 64 luma points, draw, flash |
| `pose.js` | MediaPipe Pose wireframes + hip-cross (CDN; optional) |
| `config.js` | Meet setup: events, marks, detect, URL, import/export |
| `split.js` | Camera, file clip, calibrate, detect, clock, math |
| `sync.js` | Session JSON, webhook, last-20 log, OpenAI-compatible ask |
| `LICENSE` | MIT, Copyright 2026 Ethan Birchenall |

Vanilla JavaScript. No build step.

Detection: each frame copies the video into an offscreen canvas, reads a 1-pixel strip on the line, compares the 64-point profile to the baseline, triggers when energy ≥ threshold for 2 frames, then ignores the line for 800ms. If the Pose model loaded, stick figures are drawn on people and a hip that crosses the line also stamps (`source: pose`). If the CDN or model fails, luma still works.

## Built vs not

Fully built: local webcam loop, uploaded clip, line, calibrate, ARM, luma detect, optional pose wireframes, splits, even-split math, configurable events, webhook/JSON sync, optional BYO model.

Not in scope: two-camera 200+finish, official photo finish, lane IDs, meet management, accounts, a hosted model.

Numbers not provided by Ethan are written UNKNOWN.

## References

- Reverie Hacks 2026 Software Development track: https://reverie-hacks-2026.devpost.com/
- `getUserMedia` requires a secure context (localhost or HTTPS)

## License

MIT. Copyright 2026 Ethan Birchenall.
