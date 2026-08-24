# Split — documentation

Finish-line camera split timer. One camera. One mark. The product is the crossing.

## Purpose

Stamp a split when a body crosses a line drawn on live video. Built for a phone or laptop on a tripod at a single point on the track.

## Named person

Ethan Birchenall, Sammamish. Skyline IB Diploma Candidate. Runs 400 / 800 / 4x400. Example goals (editable): 400 55.25, 800 2:07.04.

The barrier is the tap. A parent on the rail hits a button late. Split is the line.

## Target audience

High-school and college runners, parents on a tripod, small meets without a FinishLynx truck. Judges at Reverie Hacks 2026, Software Development track.

## Main features

- Live `getUserMedia` video
- Click or tap to place a line (vertical default, toggle horizontal)
- One second empty-line calibrate, then ARM
- Luma sampled along the line each frame against a short baseline
- Spike + 800ms debounce = crossing
- Line flash on detect
- Giant clock
- One fat ARM
- Cumulative, this interval, even-split goal, next-interval must-hit
- Threshold slider in the tune row
- Tiny manual MARK backup
- Event modes: 800 @ finish, 400 @ finish, 200-repeat
- UI states the camera mark: FINISH or 200

## Honest geometry

A 400m oval puts the 200 and the finish on opposite sides. One phone cannot see both. Split does not pretend. Default demo keeps the camera on FINISH for an 800: first crossing is the 400, second is the finish.

## Installation

No npm. No frameworks. Static files.

```bash
cd /Users/Ethan/workspace/split
python3 -m http.server 8765
```

Open `http://127.0.0.1:8765`. HTTPS or localhost is required for the camera. `file://` is blocked by the browser; the page says so and prints the server command.

GitHub Pages (HTTPS) is the public judge URL once the repo is pushed.

## User manual

1. Allow the camera.
2. Confirm the event and the camera mark.
3. Set the goal if you are not using 2:07.04 / 55.25.
4. Tap the video to drop the line on the finish plane. Toggle Vertical / Horizontal in the tune row if the mark is a horizontal bar.
5. Press ARM. Keep the line empty for one second.
6. Clock starts when ARM finishes calibrate. That is the gun.
7. Each body that crosses stamps cumulative time and the interval.
8. Read this interval vs even split, and what the next interval must be.
9. If the line is too hot or too deaf, move the threshold slider. Δ is live energy against baseline.
10. MARK is a last-resort tap. Do not build the race on it.

### Modes

| Event | Default mark | Planned crossings | Default goal | Crossing names |
| --- | --- | --- | --- | --- |
| 800 | FINISH | 2 | 2:07.04 | 400, 800 |
| 400 | FINISH | 1 | 0:55.25 | 400 |
| 200-repeat | 200 | 4 (editable) | none — type one | 200 #1 … |

200 goal is UNKNOWN until you type it. Even-split math hides behind “set goal” until then.

If you put an 800 on the 200 mark, the note says you will not see 400 or finish.

## Configuration

| Control | Meaning | Default |
| --- | --- | --- |
| Threshold | Mean absolute luma change along the line that counts as a spike | 18 |
| Orientation | Vertical or horizontal line | Vertical |
| Goal | Race goal, `M:SS.xx` or `SS.xx` | 2:07.04 |
| Crossings | Planned hits at this camera | 2 for 800 |
| Debounce | Hard-coded | 800ms |
| Calibrate | Hard-coded | 1000ms |
| Spike frames | Consecutive frames over threshold | 2 |

Baseline is the 1s calibrate profile, then a slow EMA on quiet frames so clouds do not count as athletes.

## Math

```
even = goal / planned
remaining = goal − elapsed
next = remaining / crossings_left
```

Display is `M:SS.xx`. No coach copy. No predicted place. No AI.

## Technical

| File | Job |
| --- | --- |
| `index.html` | Shell, dark phone-wide CSS |
| `line.js` | Place line, sample 64 luma points, draw, flash |
| `split.js` | Camera, calibrate, detect, clock, modes, math |
| `LICENSE` | MIT, Copyright 2026 Ethan Birchenall |

Vanilla JavaScript. No build step.

Detection: each frame copies the video into an offscreen canvas, reads a 1-pixel strip on the line, compares the 64-point profile to the baseline, triggers when energy ≥ threshold for 2 frames, then ignores the line for 800ms.

## Built vs not

Fully built: local webcam loop, line, calibrate, ARM, detect, splits, even-split math, three modes.

Not in scope: two-camera 200+finish, official photo finish, lane IDs, meet management, accounts, models.

Numbers not provided by Ethan are written UNKNOWN.

## References

- Reverie Hacks 2026 Software Development track: https://reverie-hacks-2026.devpost.com/
- `getUserMedia` requires a secure context (localhost or HTTPS)

## License

MIT. Copyright 2026 Ethan Birchenall.
