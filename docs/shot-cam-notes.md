# Shot Cam / Ludo Arc — working notes

Notes from the planning conversation, so a new session can pick up where this
one left off. Written 2026-11-26. Figures marked "estimate" were not measured;
prices should be re-checked before relying on them.

## What exists today (web, branch `shot-cam`)

Shot Cam is a screen at `/shot-cam` in this app. A player props up a phone,
marks the rim and the court, and the camera tracks a shooting drill.

- **Drills:** Baylor Shooting (5-minute countdown), 20 Free Throws (ends after
  20 shots), 90 Seconds (countdown). A ball in the air at the buzzer counts.
- **Make/miss:** background subtraction in a small crop around the rim; a make
  is a falling ball that enters the rim and fills the net box
  (`src/lib/shotcam/detector.ts`).
- **Shot arcs and release:** low-res whole-frame motion blobs are remembered
  for ~3.5 s; when a shot reaches the rim the ball is traced backwards to the
  release and trimmed to the part that fits one arc (`flight.ts`).
- **Shot location:** MediaPipe Pose finds the shooter's feet near the release
  (`pose.ts`); a camera model fitted to four lane corners, the rim (10 ft up)
  and taps along the 3-point line maps feet to court feet (`geometry.ts`).
- **Live view:** full screen, 5-second countdown, X to stop (top left), drill
  name + start date/time (top left), shot chart with O/X (top right), Ludo Arc
  badge (bottom left), makes/attempts/clock (bottom right), shot arcs.
- **Review:** flip wrong calls, section percentages on a court coloured blue
  (cold) to hot orange against `ZONE_BENCHMARK`, O/X chart, video playback.
- **Video:** recorded on the device with overlays burned in; never uploaded.
  The player taps "Save video to this device" (share sheet on phones).
- **Data:** table `shot_cam_sessions` (migration 014, already applied to the
  Ludolytics Supabase project). Per-shot data, including court x/y, is in the
  `shots` JSON column. Practice Stats tables are not touched.
- **Test scripts:** `scripts/testShotCam.ts` (make/miss on a video) and
  `scripts/testShotLoc.ts` (release tracing). Add `?debug` to the page address
  for tracking logs in the browser console.

### Known limits

- Tested only on a public sample video and one 31-second HomeCourt clip from
  the school gym (4 of 7, matches HomeCourt). Never run on a real phone.
- Shot placement is good to roughly 2-3 feet with careful court marking; shots
  near a section boundary can land in the neighbouring section.
- iPhone Safari cannot be forced to landscape or true full screen.
- The Vercel preview has no Supabase keys, so it cannot save workouts until
  the branch is merged to `main` or keys are added to the Preview environment.
- The existing `shooting_workouts` table (hand-entered HomeCourt numbers) is
  used by a different app, not this repository; Shot Cam does not write to it.

## Decisions made

- Web first; test with real players before deciding anything else.
- Stats are saved centrally; videos stay on the player's device.
- Own branding ("Ludo Arc"), not a copy of HomeCourt's look or drills.
- Section colours are judged per section against its benchmark, not on one
  fixed scale (coach may ask for fixed cut-offs later).

## What to learn from the first real tests

1. Makes/misses counted vs. what really happened.
2. How many shots could not be placed, and whether placed ones look right.
3. The "camera speed" number on the rim-marking screen.
4. Whether the saved video plays and saves to Photos on an iPhone.
5. Anything confusing or slow for a player working alone.

Record the same sessions on a second phone with the plain camera: footage
without overlays is the test set and, later, training data.

## Native iPhone app (wanted next)

Goal: best possible accuracy, plus release time, arc angle and form feedback.
The coach has a Mac, Xcode and an Apple Developer account.

Why native: Apple's Vision / Core ML run far faster than a browser (trained
ball detector at 60 fps, built-in trajectory and body-pose detection), camera
control (focus, exposure, lens, 60-120 fps), cheap overlay recording saved
straight to Photos, forced landscape and full screen.

What carries over: the database, drill rules, chart designs and the tracking
design (rim box, net check, backwards arc tracing, lane + 3-point court fit).
The tracking code is rewritten in Swift.

Stages (effort is working sessions; elapsed time depends on gym testing):

1. App shell: sign-in, drill picker, landscape camera, overlays, save to
   Photos, stats to Supabase. 1-2 sessions.
2. Tracking rebuilt on Vision: rim, make/miss, arcs, shooter location, court
   setup. 2-3 sessions plus testing.
3. Trained ball/rim detector (Core ML, Create ML on the Mac) from labelled
   footage of the school gym. 1-2 sessions; a week or two elapsed.
4. Release time, arc angle, then form feedback. 1-2 sessions each.
5. TestFlight for the team.

Rough timeline (estimate): first build players can try in 1-2 weeks; accurate
in 4-8 weeks if builds are tested every day or two.

Constraints: builds need the coach's Mac attached to the session (Remote
Control); the phone camera cannot be seen remotely, so every accuracy fix is a
loop of gym test -> clip -> adjust. The one Android player needs the web
version kept alive.

## Costs (as discussed)

- Apple Developer: $99/year (already held). Mac and Xcode: already held.
- Supabase: free plan is enough while only stats are stored.
- Central video storage was considered and set aside. It would need Supabase
  Pro, about $25/month plus roughly $10/month for a second active project
  (from memory, unverified); 100 GB storage and 250 GB downloads included,
  about $0.021/GB storage beyond that (from search results).
- Video size: a 27-second test recording was 2.9 MB at 1280x720, suggesting
  about 30-35 MB per 5-minute drill (estimate).
- Tripods or phone mounts: about $15-30 each.
- The main cost is the coach's time testing in the gym and labelling footage.

## Before charging other teams

Not legal advice — a list of things to have checked.

- **Patents:** companies in this space, including HomeCourt's maker, hold
  patents on camera-based shot tracking. Have a patent attorney look first.
- **School policy:** check whether the employment agreement gives the school
  a claim on work done with school time, equipment or accounts.
- **Student privacy:** users are minors — privacy policy, parental consent
  for under-13s, school data agreements. On-device video helps.
- **Name:** check "Ludo Arc" is free to trademark.
- **Apple:** in-app subscriptions pay Apple 15% (small developers) or 30%;
  direct school invoicing has its own rules. Public listing means full review.
- **App changes:** multi-team accounts (a `teams` table with join codes
  exists; Shot Cam access rules assume one team), remove VES branding, add
  sign-up, billing and support, and train on footage from many gyms.

Suggested order: get it right for the home team; let two or three other
coaches use it free; settle the legal questions; then add accounts and billing.
