# FormCheck — Product Requirements Document

**Version:** 1.1
**Status:** Draft
**Date:** March 2026
**Platform:** Web — single HTML file, no installation
**Exercises:** Squat · Sit-Up · Deadlift

---

## 1. Problem

People who train alone have no way to know if their form is correct. Bad form leads to ineffective workouts and, in compound lifts like the deadlift, injury. Existing tools either require expensive hardware, only count reps, or give feedback too generic to be useful.

---

## 2. Solution

FormCheck uses the device webcam and a pose estimation model to track body joints in real time, count reps, flag form errors, detect injury risk, and show a workout summary after each set — all inside a browser, with no data leaving the device.

---

## 3. Users

| | |
|---|---|
| Who | Solo fitness individuals — no personal trainer |
| Where | Home, gym, or studio |
| Device | Phone propped on stand · Laptop · Tablet on floor |
| Exercises | Squat, Sit-Up, Deadlift |
| Problem | No feedback on form when training alone |

---

## 4. User Flow

```
Exercise Select → Camera Setup → Live Session → Set Summary
```

1. User picks an exercise.
2. Camera setup screen shows where to place the device.
3. Session starts — webcam activates, pose tracking begins.
4. User trains. Rep count, joint angles, and form warnings show in real time.
5. User ends the set. Summary screen shows results.
6. User starts another set or picks a new exercise.

---

## 5. Features

### 5.1 Camera Setup

Before every session, the app shows a diagram and three placement tips specific to the selected exercise.

| Exercise | Camera Position |
|----------|----------------|
| Sit-Up | Floor level · Side profile |
| Squat | Hip height · Side profile · 6–8 ft away |
| Deadlift | Hip height · Side profile · 6–8 ft away |

The session cannot start until the user confirms placement.

---

### 5.2 Rep Counting

A rep is counted when the primary joint angle crosses the **down threshold** then the **up threshold** in sequence. A 700ms cooldown prevents double counting.

| Exercise | Joint | Down Threshold | Up Threshold |
|----------|-------|----------------|--------------|
| Sit-Up | Hip (L+R avg) | < 75° | > 155° |
| Squat | Knee (L+R avg) | < 105° | > 158° |
| Deadlift | Hip (L+R avg) | < 100° | > 162° |

---

### 5.3 Posture Correction

Form checks run every 400ms. Up to 2 warnings show on screen at once. Warnings auto-dismiss after 2.5 seconds.

Each warning has a severity level:

| Level | Colour | Meaning |
|-------|--------|---------|
| Good | Green | Correct checkpoint passed |
| Warn | Amber | Suboptimal — correct without stopping |
| Bad | Red | Stop and correct — injury risk |

**Sit-Up**

| Condition | Level | Message |
|-----------|-------|---------|
| Hip angle < 55° at peak | Good | Full range of motion |
| Hip angle > 90° at peak | Warn | Go further — bring torso up |
| Hip angle < 145° at bottom | Warn | Lower fully before next rep |
| Neck angle < 130° | Bad | Neck strain — relax your head |

**Squat**

| Condition | Level | Message |
|-----------|-------|---------|
| Knee angle < 95° at bottom | Good | Good squat depth |
| Knee angle > 110° at bottom | Warn | Go deeper — below parallel |
| Knee x deviates from ankle x by > 40px | Bad | Knees caving — push them out |
| Torso angle < 120° at bottom | Warn | Reduce forward lean |

**Deadlift**

| Condition | Level | Message |
|-----------|-------|---------|
| Hip angle > 162° at lockout | Good | Full hip extension |
| Hip angle < 150° at lockout | Warn | Drive hips forward at top |
| Hip angle < 80° at bottom | Good | Good hinge depth |
| Spine vector angle > 35° during hinge | Bad | Back rounding — brace your core |
| Spine vector angle ≤ 35° during hinge | Good | Back alignment looks neutral |

---

### 5.4 Injury Detection

Injury risk flags are a subset of the Bad-level posture warnings. They are surfaced with higher visual priority — red border, persistent for 4 seconds instead of 2.5.

| Exercise | Condition | Risk |
|----------|-----------|------|
| Squat | Knee x deviation > 40px from ankle | ACL / knee joint stress |
| Squat | Torso angle < 120° consistently | Lower back overload |
| Deadlift | Spine vector angle > 35° during hinge | Lumbar spine injury |
| Sit-Up | Neck angle < 130° | Cervical strain |

Detection is based on 2D joint approximation. It is a training aid — not a medical assessment. The UI states this clearly on the camera setup screen.

---

### 5.5 Form Score

Form score is a rolling average updated every 400ms throughout the set.

Each check scores: `(good checkpoints passed ÷ total checkpoints) × 100`

The rolling average of all checks = the form score for that set.

| Score | Label | Colour |
|-------|-------|--------|
| 75–100% | Good Form | Green |
| 50–74% | Needs Work | Amber |
| 0–49% | Check Form | Red |

---

### 5.6 Workout Analytics (Post-Set Summary)

Shown after every set ends.

| Metric | Definition |
|--------|-----------|
| Total Reps | Count of completed reps in the set |
| Sets | Total sets completed in the session |
| Avg Form Score | Average form score across all sets in the session |
| Warnings | Total number of Bad-level warnings triggered in the set |
| Best Depth | The minimum joint angle reached during the set (deepest rep) |

All analytics reset when the user selects **New Session**. They persist across sets within the same session.

---

## 6. Live Session Screen

**Camera feed (main area)**
- Mirrored video feed
- Skeleton overlay — orange dots on exercise-relevant joints, white lines for all connections
- Exercise name and current phase (e.g. `SQUATTING` / `STANDING`) — top left
- Live tracking indicator — top right, green + pulsing when pose detected, grey when lost
- Rep counter — bottom left
- Warning chips — bottom right, max 2 at once

**Side panel (desktop) / bottom strip (mobile)**
- Joint angle rows — name, live value in degrees, proportional fill bar
- Form score — percentage, colour-coded bar, label
- Set history — exercise, reps, form score for each set this session
- End Set button

---

## 7. Technical Specifications

| | |
|---|---|
| Pose model | MoveNet SinglePose Thunder |
| ML runtime | TensorFlow.js 4.10.0 |
| Keypoints | 17 COCO body landmarks |
| Min keypoint confidence | 0.25 |
| Form check frequency | Every 400ms |
| Rep cooldown | 700ms |
| Camera | getUserMedia() · front-facing · 1280×720 ideal |
| Rendering | HTML Canvas |
| Delivery | Single HTML file — no build, no server |
| Data | 100% client-side — nothing stored or transmitted |
| Browsers | Chrome 90+ · Edge 90+ · Firefox 90+ · Safari 15+ |

---

## 8. Limitations

- Joint angles carry a 5–10% margin of error due to 2D projection of 3D movement
- Accuracy requires correct camera placement — the wrong angle breaks tracking
- Poor lighting or loose clothing increases keypoint jitter
- One person per frame only — bystanders degrade tracking
- Deadlift spine assessment is an approximation — it cannot replace a trained eye

---

## 9. Out of Scope (v1.1)

- Voice / audio coaching
- More than three exercises
- Session history across browser sessions
- Progress tracking over time
- Multi-person detection
- Offline / PWA support
- User accounts

---

*FormCheck — PRD v1.1 — March 2026*
