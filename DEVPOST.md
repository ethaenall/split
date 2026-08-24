# Devpost — paste-ready

Track: Software Development
Deadline: Aug 23, 2026 @ 10:00pm PDT (Aug 24, 12:00am CDT)

Do not submit until the public repo and live HTTPS URL are in the boxes below.

## Required software-track files

1. Code repository — public GitHub
2. Demo video — record the judge path (phone or laptop webcam, wave a hand)
3. Documentation — this repo’s `DOCS.md` (also paste the GitHub URL)

## Judge path (read this on the video)

1. Open the live demo. Allow camera.
2. Leave event on 800. Confirm the pill: Camera is on FINISH.
3. Tap the video. A yellow line drops. Drag/tap to sit it on a plane a hand can cross.
4. Press ARM. Keep the frame empty for one second (CALIBRATING).
5. Clock starts. Wave a hand through the line. The line flashes. Split 1 is the 400.
6. Wave again. Split 2 is the 800. Clock stops. Read this / even / next-must.

If you opened the HTML as a file, the yellow banner tells you to run `python3 -m http.server 8765`.

## Fields

**Project name**
Split

**Tagline**
The time is when the body hits the line.

**The problem it solves**
I run the 400 and the 800. The split I get is when a parent taps a screen, not when I hit the line. One phone on a tripod can watch one mark. This stamps that mark.

**Inspiration**
I wanted the time when the body hits the line. Not when a parent taps.

**What it does**
Live camera. You draw a line. ARM calibrates one empty second, then the clock is the gun. A luma spike on that line, debounced 800ms, is a crossing. You see cumulative, this interval, even split, and what the next interval must be. Default: camera on FINISH, 800, goal 2:07.04 — first hit is the 400, second is the finish. Also 400-at-finish and 200-repeat. The UI says which mark the camera is on. One phone cannot see the 200 and the finish. Manual MARK exists and is small.

**How I built it**
Vanilla JavaScript. No npm. No frameworks. `getUserMedia` for the feed. A 1-pixel strip along the line, 64 luma samples, mean absolute error against a 1-second baseline, slow EMA while quiet. Static files. Serve with `python3 -m http.server` or GitHub Pages.

**Challenges I ran into**
`file://` blocks the camera. Opposite sides of a 400m track cannot share one lens. A full-height line dilutes a small body, so detection uses a profile, not one pixel. ARM has to calibrate before the gun, not eat the first second of the race.

**Accomplishments that I'm proud of**
The crossing is the product. The clock is huge. ARM is one fat control. The geometry is honest.

**What I learned**
A finish camera is a start watch plus a line. If you lie about seeing both the 200 and the finish, runners will know.

**What's next**
A second phone on the other side, talking over a local link. Not in this submission.

**Built with**
JavaScript, HTML, CSS, getUserMedia

**Try it out / Website**
LIVE_URL

**GitHub repo**
REPO_URL

**Demo video**
Record the judge path. Keep it under 3 minutes. No voiceover required. Show the hand, the flash, the split.

**Cover image**
Screenshot: dark phone UI, yellow line on live video, giant clock, red ARM.

**Team**
Ethan Birchenall — Skyline, Sammamish. Solo.

**Track**
Software Development

## Blurb (person / barrier / what changed)

Ethan, Sammamish, IB Diploma Candidate, 400/800. The barrier is the parent tap. Split stamps the body on the line. Two-minute path: allow camera, draw line, ARM, wave a hand, read the 400.

## Disclosures

No model. No dataset. No API key. Built with Hermes Agent (Nous Research) as a coding assistant. All timing math is deterministic and in `split.js`.

## Checklist

- [ ] Public repo
- [ ] HTTPS demo loads without login
- [ ] DOCS.md linked
- [ ] Demo video of the hand-wave path
- [ ] Track = Software Development
- [ ] MIT license visible
- [ ] City only (Sammamish). No home address. No birth date.
