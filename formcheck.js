// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// STATE
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const INITIAL_STATE = window.FCState ? window.FCState.load() : {
  selectedExercise: null,
  pendingSource: 'camera',
  sessionSets: [],
  nextSetId: 1,
};

const APP = {
  detector: null,
  sessionSets: Array.isArray(INITIAL_STATE.sessionSets) ? INITIAL_STATE.sessionSets.slice() : [],
  nextSetId: Number.isFinite(INITIAL_STATE.nextSetId) ? INITIAL_STATE.nextSetId : 1,
};

const SESSION = {
  exercise: INITIAL_STATE.selectedExercise,
  sourceMode: INITIAL_STATE.pendingSource || 'camera',
  sourceLabel: 'Live Camera',
  uploadObjectUrl: null,
  stream: null, animFrame: null, isRunning: false, sessionEnded: false,
  smoother: null,
  repState: 'IDLE',
  stateEnteredAt: 0,
  repCount: 0,
  reachedBottom: false,
  repHasBad: false,
  repRejectReasons: new Set(),
  repWarnReasons: new Set(),
  repBadStrikes: {},
  rejectedReps: 0,
  badWarningCount: 0,
  lastBadWarningByKey: {},
  lastRepAt: 0,
  bestDepth: null,
  formSamples: [],
  repLogs: [],
  repSampleScores: [],
  repMinAngle: null,
  repStartedAt: 0,
  lastAnalysis: null,
  squatTorsoLeanStreak: 0,
  poseMissingSince: 0,
  lastFormCheckTime: 0,
  lastInferenceTime: 0,
  warnTimeout: null,
};

function persistAppState() {
  if (!window.FCState) return;
  window.FCState.update((state) => {
    state.sessionSets = APP.sessionSets;
    state.nextSetId = APP.nextSetId;
    state.selectedExercise = SESSION.exercise;
    state.pendingSource = 'camera';
    return state;
  });
}

const video = document.getElementById('video');
const canvas = document.getElementById('poseCanvas');
const ctx = canvas.getContext('2d');

const EMA_ALPHA = 0.55;
const MIN_STATE_MS = 260;
const FORM_CHECK_MS = 400;
const REP_COOLDOWN_MS = 700;
const THROTTLE_MS = 55;
const POSE_LOSS_GRACE_MS = 500;
const MIN_SCORE = 0.12;
const GATE_SCORE = 0.12;
const BAD_EVENT_COOLDOWN_MS = 1600;
const BAD_CONFIRM_COUNT = 7;
const MIN_REJECT_REASONS = 4;

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// EXERCISE DEFINITIONS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// MoveNet keypoint indices:
// 0:nose 1:l-eye 2:r-eye 3:l-ear 4:r-ear
// 5:l-shoulder 6:r-shoulder 7:l-elbow 8:r-elbow
// 9:l-wrist 10:r-wrist 11:l-hip 12:r-hip
// 13:l-knee 14:r-knee 15:l-ankle 16:r-ankle

const EXERCISES = {
  bench: {
    label: 'BENCH PRESS',
    tips: [
      'Place device to your side at bench height',
      'Upper body and arms must be visible',
      'Ensure shoulders, elbows, and wrists are in frame'
    ],
    diagram: drawBenchDiagram,
    angles: [
      { name: 'Elbow', joints: [[5, 7, 9], [6, 8, 10]], min: 0, max: 180 },
      { name: 'Shoulder', joints: [[11, 5, 7], [12, 6, 8]], min: 0, max: 180 },
      { name: 'Wrist', joints: [[7, 9, 5], [8, 10, 6]], min: 0, max: 180 },
    ],
    analyticsAxes: ['Depth', 'Lockout/Extension', 'Elbow Flare', 'Range Control'],
    getMainAngle: (kps) => avg([getAngle(kps, 5, 7, 9), getAngle(kps, 6, 8, 10)]),
    phaseDown: 80, phaseUp: 155, hysteresisDown: 92,
    downLabel: 'LOWERING', upLabel: 'PRESSING',
    requiredJoints: [5, 6, 7, 8, 9, 10],
  },
  squat: {
    label: 'SQUAT',
    tips: [
      'Device at hip height, side profile',
      'Stand 6-8 feet from the camera',
      'Full body visible - head to feet'
    ],
    diagram: drawSquatDiagram,
    angles: [
      { name: 'Knee', joints: [[11, 13, 15], [12, 14, 16]], min: 0, max: 180 },
      { name: 'Hip', joints: [[5, 11, 13], [6, 12, 14]], min: 0, max: 180 },
      { name: 'Torso', joints: [[11, 5, 0], [12, 6, 0]], min: 0, max: 180 },
    ],
    analyticsAxes: ['Depth', 'Lockout/Extension', 'Knee Tracking', 'Spine/Neck'],
    getMainAngle: (kps) => avg([getAngle(kps, 11, 13, 15), getAngle(kps, 12, 14, 16)]),
    phaseDown: 105, phaseUp: 158, hysteresisDown: 116,
    downLabel: 'SQUATTING', upLabel: 'STANDING',
    requiredJoints: [11, 12, 13, 14, 15, 16],
  },
  deadlift: {
    label: 'DEADLIFT',
    tips: [
      'Device at hip height, strict side profile',
      'Stand 6-8 feet from the camera',
      'Entire body visible throughout movement'
    ],
    diagram: drawDeadliftDiagram,
    angles: [
      { name: 'Hip', joints: [[5, 11, 13], [6, 12, 14]], min: 0, max: 180 },
      { name: 'Back', joints: [[0, 5, 11], [0, 6, 12]], min: 0, max: 180 },
      { name: 'Knee', joints: [[11, 13, 15], [12, 14, 16]], min: 0, max: 180 },
    ],
    analyticsAxes: ['Hinge Depth', 'Lockout/Extension', 'Spine/Neck', 'Range Control'],
    getMainAngle: (kps) => avg([getAngle(kps, 5, 11, 13), getAngle(kps, 6, 12, 14)]),
    phaseDown: 100, phaseUp: 162, hysteresisDown: 112,
    downLabel: 'HINGING', upLabel: 'LOCKOUT',
    requiredJoints: [5, 6, 11, 12, 13, 14],
  }
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// MATH
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function getAngle(kps, a, b, c, minScore = MIN_SCORE) {
  const A = kps[a], B = kps[b], C = kps[c];
  if (!A || !B || !C) return null;
  if (A.score < minScore || B.score < minScore || C.score < minScore) return null;
  const BA = { x: A.x - B.x, y: A.y - B.y };
  const BC = { x: C.x - B.x, y: C.y - B.y };
  const cross = Math.abs(BA.x * BC.y - BA.y * BC.x);
  const dot = BA.x * BC.x + BA.y * BC.y;
  return Math.atan2(cross, dot) * 180 / Math.PI;
}

function avg(arr) {
  const valid = arr.filter(v => v !== null && v !== undefined);
  if (!valid.length) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function scoreHigher(value, goodThreshold, warnThreshold) {
  if (value === null || value === undefined) return 0;
  if (value >= goodThreshold) return 100;
  if (value <= warnThreshold) return 35;
  return Math.round(35 + ((value - warnThreshold) / (goodThreshold - warnThreshold)) * 65);
}

function scoreLower(value, goodThreshold, warnThreshold) {
  if (value === null || value === undefined) return 0;
  if (value <= goodThreshold) return 100;
  if (value >= warnThreshold) return 35;
  return Math.round(100 - ((value - goodThreshold) / (warnThreshold - goodThreshold)) * 65);
}

function createSmoother() {
  return Array.from({ length: 17 }, () => ({ x: 0, y: 0, initialized: false }));
}

function applyEMA(smoother, rawKps) {
  return rawKps.map((kp, i) => {
    if (!kp || kp.score < GATE_SCORE) return kp;
    const s = smoother[i];
    if (!s.initialized) { s.x = kp.x; s.y = kp.y; s.initialized = true; }
    else { s.x = EMA_ALPHA * kp.x + (1 - EMA_ALPHA) * s.x; s.y = EMA_ALPHA * kp.y + (1 - EMA_ALPHA) * s.y; }
    return { x: s.x, y: s.y, score: kp.score, name: kp.name };
  });
}

function passesConfidence(kps, requiredIndices, minVisibleRatio = 0.3) {
  const visible = requiredIndices.filter((i) => kps[i] && kps[i].score >= GATE_SCORE).length;
  const required = Math.max(2, Math.ceil(requiredIndices.length * minVisibleRatio));
  return visible >= required;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SCORING
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function resetRepValidation() {
  SESSION.repHasBad = false;
  SESSION.repRejectReasons = new Set();
  SESSION.repWarnReasons = new Set();
  SESSION.repBadStrikes = {};
  SESSION.repSampleScores = [];
  SESSION.repMinAngle = null;
  SESSION.repStartedAt = Date.now();
  SESSION.repMaxAsymmetry = 0;
  SESSION.equipmentType = 'unknown';
}

function isActiveRepState(state) {
  return ['DESCENDING', 'BOTTOM', 'ASCENDING', 'TOP'].includes(state);
}

function finalizeEvaluation(checks, messages, badReasons, warnReasons) {
  const activeChecks = checks.filter((c) => c.status !== 'idle');
  const goodChecks = activeChecks.filter((c) => c.status === 'good').length;
  const sampleScore = activeChecks.length ? Math.round((goodChecks / activeChecks.length) * 100) : null;
  const hasBad = checks.some((c) => c.status === 'bad');
  const hasWarn = checks.some((c) => c.status === 'warn');
  const radar = checks.map((c) => ({
    label: c.label,
    status: c.status,
    value: c.value ?? (c.status === 'good' ? 100 : c.status === 'warn' ? 55 : c.status === 'bad' ? 20 : 0),
  }));
  return { checks, messages, badReasons, warnReasons, hasBad, hasWarn, sampleScore, radar };
}

function createIdleAnalysis() {
  const ex = EXERCISES[SESSION.exercise];
  const checks = (ex?.analyticsAxes || []).map((label) => ({
    id: label.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
    label,
    status: 'idle',
    value: 0,
    valueText: '',
  }));
  return finalizeEvaluation(checks, [], [], []);
}

function evaluateBench(kps, angle) {
  const checks = [];
  const messages = [];
  const badReasons = [];
  const warnReasons = [];

  const state = SESSION.repState;
  const bottomPhase = state === 'DESCENDING' || state === 'BOTTOM';
  const topPhase = state === 'ASCENDING' || state === 'TOP';

  // Asymmetry Tracking (Barbell vs Dumbbell)
  const lElbow = getAngle(kps, 5, 7, 9);
  const rElbow = getAngle(kps, 6, 8, 10);
  if (lElbow !== null && rElbow !== null) {
    const delta = Math.abs(lElbow - rElbow);
    if (delta > (SESSION.repMaxAsymmetry || 0)) {
      SESSION.repMaxAsymmetry = delta;
    }
  }

  // Evaluate Equipment Status
  let equipStatus = 'good';
  let equipValue = 100;
  let equipLabel = 'Equipment';
  let equipText = '--';

  if (SESSION.repMaxAsymmetry > 10) {
    SESSION.equipmentType = 'dumbbell';
    equipText = 'Dumbbells';
  } else if (SESSION.repMaxAsymmetry > 0) {
    SESSION.equipmentType = 'barbell';
    equipText = 'Barbell';
  }
  checks.push({ id: 'equipment_type', label: 'Equipment Match', status: equipStatus, value: equipValue, valueText: equipText });

  // Shoulder abduction angle (elbow flare) — angle between torso and upper arm
  const shoulderAngle = avg([getAngle(kps, 11, 5, 7), getAngle(kps, 12, 6, 8)]);

  // --- Depth check (elbow angle at bottom) ---
  let depthStatus = 'idle';
  let depthValue = 0;
  if (bottomPhase && angle !== null) {
    if (angle < 80) { depthStatus = 'good'; depthValue = 100; }
    else if (angle > 100) {
      depthStatus = 'warn';
      depthValue = 35;
      const msg = 'Lower bar further - touch chest';
      messages.push({ t: 'warn', m: msg });
      warnReasons.push({ key: 'bench_depth', message: msg });
    } else {
      depthStatus = 'warn';
      depthValue = 60;
    }
  }
  checks.push({ id: 'depth', label: 'Depth', status: depthStatus, value: depthValue, valueText: angle !== null ? Math.round(angle) + 'deg' : '--' });

  // --- Lockout check (elbow angle at top) ---
  let lockoutStatus = 'idle';
  let lockoutValue = 0;
  if (topPhase && angle !== null) {
    if (angle > 155) { lockoutStatus = 'good'; lockoutValue = 100; }
    else if (angle < 140) {
      lockoutStatus = 'warn';
      lockoutValue = 35;
      const msg = 'Lock out fully at top';
      messages.push({ t: 'warn', m: msg });
      warnReasons.push({ key: 'bench_lockout', message: msg });
    } else {
      lockoutStatus = 'warn';
      lockoutValue = scoreHigher(angle, 155, 140);
    }
  }
  checks.push({ id: 'lockout_extension', label: 'Lockout/Extension', status: lockoutStatus, value: lockoutValue, valueText: angle !== null ? Math.round(angle) + 'deg' : '--' });

  // --- Elbow Flare check (shoulder abduction) ---
  let flareStatus = 'idle';
  let flareValue = 0;
  if (shoulderAngle !== null) {
    // Dumbbells naturally allow more flare safely. Barbells lock the shoulder, so >80 is bad.
    const badFlareLimit = SESSION.equipmentType === 'dumbbell' ? 88 : 80;
    const warnFlareLimit = SESSION.equipmentType === 'dumbbell' ? 78 : 70;

    if (shoulderAngle > badFlareLimit) {
      flareStatus = 'bad';
      flareValue = 15;
      const msg = 'Elbows flaring - tuck elbows in';
      messages.push({ t: 'bad', m: msg, injury: true });
      badReasons.push({ key: 'elbow_flare', message: msg, injury: true });
    } else if (shoulderAngle > warnFlareLimit) {
      flareStatus = 'warn';
      flareValue = 45;
      const msg = 'Tuck elbows slightly';
      messages.push({ t: 'warn', m: msg });
      warnReasons.push({ key: 'elbow_flare_warn', message: msg });
    } else {
      flareStatus = 'good';
      flareValue = scoreLower(shoulderAngle, 45, warnFlareLimit);
    }
  }
  checks.push({ id: 'elbow_flare', label: 'Elbow Flare', status: flareStatus, value: flareValue, valueText: shoulderAngle !== null ? Math.round(shoulderAngle) + 'deg' : '--' });

  // --- Range Control ---
  let rangeStatus = 'idle';
  let rangeValue = 0;
  if (angle !== null) {
    const movement = clamp(Math.round(((EXERCISES.bench.phaseUp - angle) / (EXERCISES.bench.phaseUp - EXERCISES.bench.phaseDown)) * 100), 0, 100);
    rangeValue = movement;
    if (bottomPhase || topPhase) rangeStatus = movement >= 62 ? 'good' : 'warn';
  }
  checks.push({ id: 'range_control', label: 'Range Control', status: rangeStatus, value: rangeValue, valueText: rangeStatus === 'idle' ? '' : rangeValue + '%' });

  return finalizeEvaluation(checks, messages, badReasons, warnReasons);
}

function evaluateSquat(kps, angle) {
  const checks = [];
  const messages = [];
  const badReasons = [];
  const warnReasons = [];

  const state = SESSION.repState;
  const bottomPhase = state === 'DESCENDING' || state === 'BOTTOM';
  const topPhase = state === 'ASCENDING' || state === 'TOP';
  const torso = avg([getAngle(kps, 11, 5, 0), getAngle(kps, 12, 6, 0)]);
  const lKnee = kps[13], rKnee = kps[14], lAnkle = kps[15], rAnkle = kps[16];

  let kneeDeviation = null;
  if (lKnee && rKnee && lAnkle && rAnkle &&
    lKnee.score >= MIN_SCORE && rKnee.score >= MIN_SCORE &&
    lAnkle.score >= MIN_SCORE && rAnkle.score >= MIN_SCORE) {
    kneeDeviation = Math.max(Math.abs(lKnee.x - lAnkle.x), Math.abs(rKnee.x - rAnkle.x));
  }

  let depthStatus = 'idle';
  let depthValue = 0;
  if (bottomPhase && angle !== null) {
    if (angle < 102) { depthStatus = 'good'; depthValue = 100; }
    else if (angle > 122) {
      depthStatus = 'warn';
      depthValue = 35;
      const msg = 'Go deeper - below parallel';
      messages.push({ t: 'warn', m: msg });
      warnReasons.push({ key: 'squat_depth', message: msg });
    } else {
      depthStatus = 'warn';
      depthValue = 60;
    }
  }
  checks.push({ id: 'depth', label: 'Depth', status: depthStatus, value: depthValue, valueText: angle !== null ? Math.round(angle) + 'deg' : '--' });

  let lockoutStatus = 'idle';
  let lockoutValue = 0;
  if (topPhase && angle !== null) {
    if (angle > 154) { lockoutStatus = 'good'; lockoutValue = 100; }
    else {
      lockoutStatus = 'warn';
      lockoutValue = scoreHigher(angle, 154, 140);
      warnReasons.push({ key: 'squat_lockout', message: 'Stand tall - full extension at top' });
    }
  }
  checks.push({ id: 'lockout_extension', label: 'Lockout/Extension', status: lockoutStatus, value: lockoutValue, valueText: angle !== null ? Math.round(angle) + 'deg' : '--' });

  let kneeStatus = 'idle';
  let kneeValue = 0;
  if (kneeDeviation !== null) {
    if (kneeDeviation > 62) {
      kneeStatus = 'bad';
      kneeValue = 15;
      const msg = 'Knees caving - push them out';
      messages.push({ t: 'bad', m: msg, injury: true });
      badReasons.push({ key: 'knee_cave', message: msg, injury: true });
    } else if (kneeDeviation > 52) {
      kneeStatus = 'warn';
      kneeValue = 45;
      const msg = 'Knee tracking narrow - push out slightly';
      messages.push({ t: 'warn', m: msg });
      warnReasons.push({ key: 'knee_track_warn', message: msg });
    } else {
      kneeStatus = 'good';
      kneeValue = clamp(Math.round(100 - (kneeDeviation / 62) * 45), 55, 100);
    }
  }
  checks.push({ id: 'knee_tracking', label: 'Knee Tracking', status: kneeStatus, value: kneeValue, valueText: kneeDeviation !== null ? Math.round(kneeDeviation) + 'px' : '--' });

  let torsoStatus = 'idle';
  let torsoValue = 0;
  if (torso !== null) {
    if (torso < 114) {
      SESSION.squatTorsoLeanStreak += 1;
      if (SESSION.squatTorsoLeanStreak >= 10) {
        torsoStatus = 'bad';
        torsoValue = 20;
        const msg = 'Lower back overload risk - reduce forward lean';
        messages.push({ t: 'bad', m: msg, injury: true });
        badReasons.push({ key: 'torso_overload', message: msg, injury: true });
      } else {
        torsoStatus = 'warn';
        torsoValue = scoreHigher(torso, 128, 100);
        const msg = 'Reduce forward lean';
        messages.push({ t: 'warn', m: msg });
        warnReasons.push({ key: 'torso_lean', message: msg });
      }
    } else {
      SESSION.squatTorsoLeanStreak = 0;
      torsoStatus = 'good';
      torsoValue = scoreHigher(torso, 128, 114);
    }
  }
  checks.push({ id: 'spine_neck', label: 'Spine/Neck', status: torsoStatus, value: torsoValue, valueText: torso !== null ? Math.round(torso) + 'deg' : '--' });

  return finalizeEvaluation(checks, messages, badReasons, warnReasons);
}

function evaluateDeadlift(kps, angle) {
  const checks = [];
  const messages = [];
  const badReasons = [];
  const warnReasons = [];

  const state = SESSION.repState;
  const bottomPhase = state === 'DESCENDING' || state === 'BOTTOM';
  const topPhase = state === 'ASCENDING' || state === 'TOP';

  const ls = kps[5], rs = kps[6], lh = kps[11], rh = kps[12];
  let spineAngle = null;
  if (ls && rs && lh && rh &&
    ls.score >= MIN_SCORE && rs.score >= MIN_SCORE &&
    lh.score >= MIN_SCORE && rh.score >= MIN_SCORE) {
    const sMidX = (ls.x + rs.x) / 2, sMidY = (ls.y + rs.y) / 2;
    const hMidX = (lh.x + rh.x) / 2, hMidY = (lh.y + rh.y) / 2;
    spineAngle = Math.abs(Math.atan2(sMidX - hMidX, hMidY - sMidY) * 180 / Math.PI);
  }

  let hingeStatus = 'idle';
  let hingeValue = 0;
  if (bottomPhase && angle !== null) {
    if (angle < 90) { hingeStatus = 'good'; hingeValue = 100; }
    else { hingeStatus = 'warn'; hingeValue = scoreLower(angle, 90, 120); }
  }
  checks.push({ id: 'hinge_depth', label: 'Hinge Depth', status: hingeStatus, value: hingeValue, valueText: angle !== null ? Math.round(angle) + 'deg' : '--' });

  let lockoutStatus = 'idle';
  let lockoutValue = 0;
  if (topPhase && angle !== null) {
    if (angle > 158) { lockoutStatus = 'good'; lockoutValue = 100; }
    else if (angle < 142) {
      lockoutStatus = 'warn';
      lockoutValue = scoreHigher(angle, 158, 135);
      const msg = 'Drive hips forward at top';
      messages.push({ t: 'warn', m: msg });
      warnReasons.push({ key: 'deadlift_lockout', message: msg });
    } else {
      lockoutStatus = 'warn';
      lockoutValue = scoreHigher(angle, 158, 142);
    }
  }
  checks.push({ id: 'lockout_extension', label: 'Lockout/Extension', status: lockoutStatus, value: lockoutValue, valueText: angle !== null ? Math.round(angle) + 'deg' : '--' });

  let spineStatus = 'idle';
  let spineValue = 0;
  if (spineAngle !== null) {
    if (spineAngle > 50) {
      spineStatus = 'bad';
      spineValue = 15;
      const msg = 'Back rounding - brace your core';
      messages.push({ t: 'bad', m: msg, injury: true });
      badReasons.push({ key: 'back_rounding', message: msg, injury: true });
    } else if (spineAngle > 42) {
      spineStatus = 'warn';
      spineValue = 45;
      const msg = 'Brace harder - spine drifting';
      messages.push({ t: 'warn', m: msg });
      warnReasons.push({ key: 'spine_warn', message: msg });
    } else {
      spineStatus = 'good';
      spineValue = scoreLower(spineAngle, 24, 42);
    }
  }
  checks.push({ id: 'spine_neck', label: 'Spine/Neck', status: spineStatus, value: spineValue, valueText: spineAngle !== null ? Math.round(spineAngle) + 'deg' : '--' });

  let rangeStatus = 'idle';
  let rangeValue = 0;
  if (angle !== null) {
    const movement = clamp(Math.round(((EXERCISES.deadlift.phaseUp - angle) / (EXERCISES.deadlift.phaseUp - EXERCISES.deadlift.phaseDown)) * 100), 0, 100);
    rangeValue = movement;
    if (bottomPhase || topPhase) rangeStatus = movement >= 62 ? 'good' : 'warn';
  }
  checks.push({ id: 'range_control', label: 'Range Control', status: rangeStatus, value: rangeValue, valueText: rangeStatus === 'idle' ? '' : rangeValue + '%' });

  return finalizeEvaluation(checks, messages, badReasons, warnReasons);
}

function evaluateCurrentForm(kps, angle) {
  if (SESSION.exercise === 'bench') return evaluateBench(kps, angle);
  if (SESSION.exercise === 'squat') return evaluateSquat(kps, angle);
  if (SESSION.exercise === 'deadlift') return evaluateDeadlift(kps, angle);
  return createIdleAnalysis();
}

function registerBadEvent(key, message) {
  const now = Date.now();
  const strikes = (SESSION.repBadStrikes[key] || 0) + 1;
  SESSION.repBadStrikes[key] = strikes;

  if (strikes >= BAD_CONFIRM_COUNT) {
    SESSION.repHasBad = true;
    SESSION.repRejectReasons.add(message);
    const last = SESSION.lastBadWarningByKey[key] || 0;
    if (now - last >= BAD_EVENT_COOLDOWN_MS) {
      SESSION.badWarningCount += 1;
      SESSION.lastBadWarningByKey[key] = now;
    }
  }
}

function registerEvaluation(snapshot) {
  snapshot.badReasons.forEach((item) => registerBadEvent(item.key, item.message));
  snapshot.warnReasons.forEach((item) => SESSION.repWarnReasons.add(item.message));
  if (snapshot.sampleScore !== null) {
    SESSION.formSamples.push(snapshot.sampleScore);
    if (isActiveRepState(SESSION.repState)) SESSION.repSampleScores.push(snapshot.sampleScore);
    renderFormScore();
  }
}

function finalizeRep() {
  const badReasons = Array.from(SESSION.repRejectReasons);
  const warnReasons = Array.from(SESSION.repWarnReasons);
  const repForm = SESSION.repSampleScores.length
    ? Math.round(SESSION.repSampleScores.reduce((a, b) => a + b, 0) / SESSION.repSampleScores.length)
    : null;
  const repDepth = SESSION.repMinAngle !== null ? Math.round(SESSION.repMinAngle) : null;
  const durationMs = SESSION.repStartedAt ? Math.max(0, Date.now() - SESSION.repStartedAt) : null;

  let result = 'valid';
  let note = '';
  let valid = true;

  if (SESSION.repHasBad && badReasons.length >= MIN_REJECT_REASONS) {
    valid = false;
    result = 'rejected';
    SESSION.rejectedReps += 1;
    note = badReasons.slice(0, 2).join(' | ') || 'Form violation';
    document.getElementById('rejectNote').textContent = 'Last rejected: ' + note;
    renderWarnings([{ t: 'bad', m: 'Rep rejected: ' + note, injury: true }]);
  } else {
    SESSION.repCount += 1;
    popRep();
    if (badReasons.length) {
      result = 'caution';
      note = badReasons[0];
      document.getElementById('rejectNote').textContent = 'Rep counted with caution: ' + note;
      renderWarnings([{ t: 'warn', m: 'Rep counted with caution' }]);
    } else if (warnReasons.length) {
      result = 'warn';
      note = warnReasons[0];
      document.getElementById('rejectNote').textContent = '';
    } else {
      document.getElementById('rejectNote').textContent = '';
    }
  }

  SESSION.repLogs.push({
    index: SESSION.repLogs.length + 1,
    valid,
    result,
    form: repForm,
    depth: repDepth,
    warnings: warnReasons.length,
    badFlags: badReasons.length,
    note: note || '--',
    durationMs,
    at: new Date().toISOString(),
  });

  SESSION.lastRepAt = Date.now();
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// STATE MACHINE
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function transitionTo(newState) {
  if (Date.now() - SESSION.stateEnteredAt < MIN_STATE_MS) return false;
  SESSION.repState = newState;
  SESSION.stateEnteredAt = Date.now();
  return true;
}

function processFrame(kps, angle) {
  if (angle !== null) {
    SESSION.bestDepth = SESSION.bestDepth === null ? angle : Math.min(SESSION.bestDepth, angle);
  }

  if (angle === null) {
    if (SESSION.repState !== 'IDLE') transitionTo('IDLE');
    return;
  }

  const ex = EXERCISES[SESSION.exercise];
  const now = Date.now();
  const state = SESSION.repState;
  if (isActiveRepState(state) && angle !== null) {
    SESSION.repMinAngle = SESSION.repMinAngle === null ? angle : Math.min(SESSION.repMinAngle, angle);
  }

  switch (state) {
    case 'IDLE':
      renderPhase('GET IN POSITION');
      if (angle > ex.phaseUp) transitionTo('READY');
      break;
    case 'READY':
      renderPhase('READY');
      if (angle < ex.phaseUp - 8) {
        if (transitionTo('DESCENDING')) {
          SESSION.reachedBottom = false;
          resetRepValidation();
        }
      }
      break;
    case 'DESCENDING':
      renderPhase(ex.downLabel);
      if (angle <= ex.phaseDown) { SESSION.reachedBottom = true; transitionTo('BOTTOM'); }
      else if (angle > ex.phaseUp && now - SESSION.stateEnteredAt > MIN_STATE_MS) transitionTo('READY');
      break;
    case 'BOTTOM':
      renderPhase(ex.downLabel);
      if (angle > ex.hysteresisDown) transitionTo('ASCENDING');
      break;
    case 'ASCENDING':
      renderPhase(ex.upLabel);
      if (angle >= ex.phaseUp) {
        const cooled = now - SESSION.lastRepAt >= REP_COOLDOWN_MS;
        if (cooled && transitionTo('TOP')) finalizeRep();
      }
      break;
    case 'TOP':
      renderPhase(ex.upLabel);
      transitionTo('READY');
      break;
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// DETECTION LOOP
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
let _cw = 0, _ch = 0;

async function detectLoop() {
  if (!SESSION.isRunning) return;
  const now = Date.now();
  if (now - SESSION.lastInferenceTime < THROTTLE_MS) {
    SESSION.animFrame = requestAnimationFrame(detectLoop);
    return;
  }
  SESSION.lastInferenceTime = now;

  if (video.readyState >= 2) {
    if (video.videoWidth !== _cw || video.videoHeight !== _ch) {
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      _cw = canvas.width; _ch = canvas.height;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    try {
      const poses = await APP.detector.estimatePoses(video);
      if (poses.length > 0) {
        let kps = poses[0].keypoints;
        const ex = EXERCISES[SESSION.exercise];
        const visible = passesConfidence(kps, ex.requiredJoints);
        const mainAngle = ex.getMainAngle(kps);
        const hasAngle = mainAngle !== null;

        updateLiveStatus(visible || hasAngle);

        if (hasAngle || visible) {
          SESSION.poseMissingSince = 0;
          kps = applyEMA(SESSION.smoother, kps);
          drawPose(kps);
          renderAngles(kps);
          processFrame(kps, mainAngle);

          const activeState = isActiveRepState(SESSION.repState);
          if (activeState && now - SESSION.lastFormCheckTime >= FORM_CHECK_MS) {
            SESSION.lastFormCheckTime = now;
            const snapshot = evaluateCurrentForm(kps, mainAngle);
            SESSION.lastAnalysis = snapshot;
            registerEvaluation(snapshot);
            renderWarnings(snapshot.messages);
            renderAnalytics(snapshot);
          }
        } else {
          if (!SESSION.poseMissingSince) SESSION.poseMissingSince = now;
          if (now - SESSION.poseMissingSince >= POSE_LOSS_GRACE_MS) {
            if (SESSION.repState !== 'IDLE') transitionTo('IDLE');
            renderAnalytics(createIdleAnalysis());
          }
        }
      } else {
        updateLiveStatus(false);
        if (!SESSION.poseMissingSince) SESSION.poseMissingSince = now;
        if (now - SESSION.poseMissingSince >= POSE_LOSS_GRACE_MS) {
          if (SESSION.repState !== 'IDLE') transitionTo('IDLE');
          renderAnalytics(createIdleAnalysis());
        }
      }
    } catch (e) {
      console.error('Pose estimation error:', e);
    }
  }
  SESSION.animFrame = requestAnimationFrame(detectLoop);
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// UI HELPERS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function popRep() {
  const el = document.getElementById('repNumber');
  el.textContent = SESSION.repCount;
  el.classList.add('pop');
  setTimeout(() => el.classList.remove('pop'), 120);
}

function renderPhase(label) {
  const el = document.getElementById('sessionPhase');
  if (el.textContent === label) return;
  el.textContent = label;
  const active = SESSION.repState !== 'IDLE' && SESSION.repState !== 'READY';
  el.classList.toggle('active', active);
}

function renderFormScore() {
  const scores = SESSION.formSamples;
  if (!scores.length) return;
  const avg_ = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const el = document.getElementById('formScoreNum');
  el.textContent = avg_;
  el.style.color = avg_ >= 75 ? 'var(--good)' : avg_ >= 50 ? 'var(--warn)' : 'var(--bad)';
  const bar = document.getElementById('formBar');
  bar.style.width = avg_ + '%';
  bar.style.background = avg_ >= 75 ? 'var(--good)' : avg_ >= 50 ? 'var(--warn)' : 'var(--bad)';
  document.getElementById('formLabel').textContent = avg_ >= 75 ? 'GOOD FORM' : avg_ >= 50 ? 'NEEDS WORK' : 'CHECK FORM';
}

function renderWarnings(msgs) {
  if (!msgs || !msgs.length) return;
  const overlay = document.getElementById('warnOverlay');
  overlay.innerHTML = msgs.slice(0, 2).map((m) => {
    const injury = m.injury ? ' injury' : '';
    return `<div class="warn-chip ${m.t}${injury}">${m.m}</div>`;
  }).join('');
  clearTimeout(SESSION.warnTimeout);
  const timeout = msgs.some((m) => m.injury) ? 4000 : 2500;
  SESSION.warnTimeout = setTimeout(() => { overlay.innerHTML = ''; }, timeout);
}

function renderAngles(kps) {
  const ex = EXERCISES[SESSION.exercise];
  ex.angles.forEach((a, i) => {
    const val = avg(a.joints.map(j => getAngle(kps, j[0], j[1], j[2])));
    const el = document.getElementById('aval' + i);
    const fill = document.getElementById('afill' + i);
    if (val !== null) {
      el.textContent = Math.round(val) + 'deg';
      fill.style.width = Math.min(100, (val / 180) * 100) + '%';
      fill.className = 'angle-fill ' + (val > 140 ? 'good' : val > 80 ? 'warn' : '');
    } else {
      el.textContent = '--'; fill.style.width = '0%';
    }
  });
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ANGLE ROWS BUILDER
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function buildAngleRows() {
  const ex = EXERCISES[SESSION.exercise];
  const container = document.getElementById('angleRows');
  container.innerHTML = '';
  ex.angles.forEach((a, i) => {
    container.innerHTML += `
      <div class="angle-row" id="arow${i}">
        <div class="angle-row-head">
          <span class="angle-name">${a.name.toUpperCase()}</span>
          <span class="angle-val" id="aval${i}">--</span>
        </div>
        <div class="angle-track"><div class="angle-fill" id="afill${i}" style="width:0%"></div></div>
      </div>`;
  });
}

function statusText(status) {
  if (status === 'good') return 'Good';
  if (status === 'warn') return 'Warn';
  if (status === 'bad') return 'Bad';
  return 'Idle';
}

function drawRadar(radarPoints) {
  const radarCanvas = document.getElementById('radarCanvas');
  if (!radarCanvas || !radarPoints || !radarPoints.length) return;
  const rctx = radarCanvas.getContext('2d');
  const w = radarCanvas.width;
  const h = radarCanvas.height;
  const n = radarPoints.length;
  const cx = w / 2;
  const cy = h / 2 - 6;
  const radius = Math.min(w, h) * 0.33;

  rctx.clearRect(0, 0, w, h);
  rctx.strokeStyle = 'rgba(255,255,255,0.12)';
  rctx.lineWidth = 1;

  for (let ring = 1; ring <= 4; ring++) {
    const rr = (radius * ring) / 4;
    rctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (i === 0) rctx.moveTo(x, y); else rctx.lineTo(x, y);
    }
    rctx.closePath();
    rctx.stroke();
  }

  rctx.font = '9px JetBrains Mono';
  rctx.fillStyle = 'rgba(255,255,255,0.7)';
  rctx.textAlign = 'center';
  rctx.textBaseline = 'middle';

  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const x = cx + Math.cos(a) * radius;
    const y = cy + Math.sin(a) * radius;
    rctx.beginPath();
    rctx.moveTo(cx, cy);
    rctx.lineTo(x, y);
    rctx.strokeStyle = 'rgba(255,255,255,0.14)';
    rctx.stroke();
    const lx = cx + Math.cos(a) * (radius + 16);
    const ly = cy + Math.sin(a) * (radius + 16);
    rctx.fillText(radarPoints[i].label, lx, ly);
  }

  const hasBad = radarPoints.some((p) => p.status === 'bad') && SESSION.repRejectReasons.size >= MIN_REJECT_REASONS;
  const hasWarn = radarPoints.some((p) => p.status === 'warn');
  const strokeColor = hasBad ? 'rgba(255,59,59,0.9)' : hasWarn ? 'rgba(245,196,0,0.9)' : 'rgba(0,200,150,0.9)';
  const fillColor = hasBad ? 'rgba(255,59,59,0.22)' : hasWarn ? 'rgba(245,196,0,0.22)' : 'rgba(0,200,150,0.22)';

  rctx.beginPath();
  radarPoints.forEach((p, i) => {
    const ratio = clamp((p.value || 0) / 100, 0, 1);
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const x = cx + Math.cos(a) * radius * ratio;
    const y = cy + Math.sin(a) * radius * ratio;
    if (i === 0) rctx.moveTo(x, y); else rctx.lineTo(x, y);
  });
  rctx.closePath();
  rctx.fillStyle = fillColor;
  rctx.strokeStyle = strokeColor;
  rctx.lineWidth = 2;
  rctx.fill();
  rctx.stroke();
}

function renderAnalytics(snapshot) {
  const ex = EXERCISES[SESSION.exercise];
  if (!ex) return;
  const current = snapshot || createIdleAnalysis();
  const checks = current.checks || [];
  const isMoving = !['IDLE', 'READY'].includes(SESSION.repState);

  let statusClass = '';
  let statusLabel = 'Awaiting movement';
  if (isMoving) {
    const confirmedBadCount = SESSION.repRejectReasons.size;
    if ((SESSION.repHasBad || current.hasBad) && confirmedBadCount >= MIN_REJECT_REASONS) {
      statusClass = 'bad';
      statusLabel = 'Not valid rep';
    } else if (current.hasWarn || confirmedBadCount > 0) {
      statusClass = 'warn';
      statusLabel = 'Valid with warns';
    } else {
      statusClass = 'good';
      statusLabel = 'Correct form';
    }
  }

  const statusEl = document.getElementById('analyticsStatus');
  statusEl.className = 'analytics-status' + (statusClass ? ' ' + statusClass : '');
  statusEl.textContent = statusLabel;

  const checksEl = document.getElementById('checksList');
  checksEl.innerHTML = checks.map((c) => {
    const value = c.valueText ? ` ${c.valueText}` : '';
    return `<div class="check-row">
      <span class="check-name">${c.label}</span>
      <span class="check-pill ${c.status}">${statusText(c.status)}${value}</span>
    </div>`;
  }).join('');

  drawRadar(current.radar);
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// POSE DRAWING
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const CONNECTIONS = [
  [5, 7], [7, 9], [6, 8], [8, 10],
  [5, 6], [5, 11], [6, 12], [11, 12],
  [11, 13], [13, 15], [12, 14], [14, 16],
  [0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 6]
];

// Per-exercise highlighted joints
const HIGHLIGHT_JOINTS = {
  bench: [5, 6, 7, 8, 9, 10],
  squat: [11, 12, 13, 14, 15, 16],
  deadlift: [5, 6, 11, 12, 13, 14]
};

function drawPose(kps) {
  const highlights = HIGHLIGHT_JOINTS[SESSION.exercise] || [];
  const T = GATE_SCORE;
  CONNECTIONS.forEach(([a, b]) => {
    if (!kps[a] || !kps[b] || kps[a].score < T || kps[b].score < T) return;
    ctx.beginPath();
    ctx.moveTo(kps[a].x, kps[a].y);
    ctx.lineTo(kps[b].x, kps[b].y);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
  kps.forEach((kp, i) => {
    if (!kp || kp.score < T) return;
    const isKey = highlights.includes(i);
    ctx.beginPath();
    ctx.arc(kp.x, kp.y, isKey ? 6 : 3, 0, Math.PI * 2);
    ctx.fillStyle = isKey ? '#ff5c00' : 'rgba(255,255,255,0.4)';
    ctx.fill();
  });
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// LIVE STATUS + SET HISTORY
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function updateLiveStatus(visible) {
  document.getElementById('liveDot').className = 'loading-dot' + (visible ? ' live' : '');
  document.getElementById('liveLabel').textContent = visible ? 'Tracking' : 'No pose';
}

function renderSetHistory() {
  const el = document.getElementById('setsList');
  if (!APP.sessionSets.length) { el.innerHTML = '<div class="no-sets">No sets yet</div>'; return; }
  el.innerHTML = APP.sessionSets.slice().reverse().map(s =>
    `<div class="set-row">
      <span class="set-row-ex">${EXERCISES[s.ex].label}</span>
      <span class="set-row-stats">${s.reps} valid | ${s.rejectedReps} rej | ${s.form}%</span>
    </div>`
  ).join('');
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// NAVIGATION & SESSION CONTROL
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function goTo(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
  const target = document.getElementById(id);
  if (!target) return;
  target.classList.remove('hidden');
  if (id !== 'sessionScreen') closeAnalyticsPanel(true);
}

function toggleAnalyticsPanel() {
  if (!window.matchMedia('(max-width: 700px)').matches) return;
  document.getElementById('sidePanel').classList.toggle('open');
  document.getElementById('panelBackdrop').classList.toggle('show');
}

function closeAnalyticsPanel(force = false) {
  document.getElementById('sidePanel').classList.remove('open');
  document.getElementById('panelBackdrop').classList.remove('show');
  if (force) return;
}

function chooseExercise(ex) {
  SESSION.exercise = ex;
  const cfg = EXERCISES[ex];
  document.getElementById('setupTitle').textContent = cfg.label + ' - Setup';
  document.getElementById('setupSub').textContent = 'Use camera or upload a side-view video';
  document.getElementById('setupTips').innerHTML = cfg.tips.map(t =>
    `<div class="tip-row"><div class="tip-dot"></div><div class="tip-text">${t}</div></div>`
  ).join('');
  cfg.diagram();
  goTo('setupScreen');
}

function openVideoUpload() {
  const input = document.getElementById('videoFileInput');
  input.value = '';
  input.click();
}

function handleVideoUpload(event) {
  const file = event.target?.files?.[0];
  if (!file) return;
  startSession('upload', file);
}

function waitForVideoMetadata() {
  return new Promise((resolve, reject) => {
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('error', onError);
      reject(new Error('Timed out waiting for video metadata'));
    }, 8000);
    const onLoaded = () => {
      clearTimeout(timer);
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('error', onError);
      resolve();
    };
    const onError = () => {
      clearTimeout(timer);
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('error', onError);
      reject(new Error('Unable to load video metadata'));
    };
    video.addEventListener('loadedmetadata', onLoaded);
    video.addEventListener('error', onError);
  });
}

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getCameraStreamWithFallbacks() {
  const attempts = [];

  attempts.push(async () => navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
  }));

  attempts.push(async () => navigator.mediaDevices.getUserMedia({ video: true }));

  attempts.push(async () => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter((d) => d.kind === 'videoinput');
    if (!cams.length) throw new Error('No video input devices found');
    return navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: cams[0].deviceId } }
    });
  });

  let lastError = null;
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (err) {
      lastError = err;
      await waitMs(220);
    }
  }
  throw lastError || new Error('Unable to start camera stream');
}

async function startSession(sourceMode = 'camera', uploadedFile = null) {
  goTo('sessionScreen');
  closeAnalyticsPanel(true);
  const uploadPrompt = document.getElementById('uploadPrompt');
  if (uploadPrompt) uploadPrompt.classList.add('hidden');
  document.getElementById('sessionExName').textContent = EXERCISES[SESSION.exercise].label;
  buildAngleRows();

  SESSION.sourceMode = sourceMode;
  SESSION.sourceLabel = sourceMode === 'upload' ? (uploadedFile?.name || 'Uploaded Video') : 'Live Camera';

  if (SESSION.uploadObjectUrl) {
    URL.revokeObjectURL(SESSION.uploadObjectUrl);
    SESSION.uploadObjectUrl = null;
  }

  SESSION.repState = 'IDLE';
  SESSION.sessionEnded = false;
  SESSION.stateEnteredAt = 0;
  SESSION.repCount = 0;
  SESSION.reachedBottom = false;
  SESSION.rejectedReps = 0;
  SESSION.repHasBad = false;
  SESSION.repRejectReasons = new Set();
  SESSION.repWarnReasons = new Set();
  SESSION.badWarningCount = 0;
  SESSION.lastBadWarningByKey = {};
  SESSION.lastRepAt = 0;
  SESSION.bestDepth = null;
  SESSION.formSamples = [];
  SESSION.repLogs = [];
  SESSION.repSampleScores = [];
  SESSION.repMinAngle = null;
  SESSION.repStartedAt = 0;
  SESSION.repMaxAsymmetry = 0;
  SESSION.equipmentType = 'unknown';
  SESSION.lastAnalysis = createIdleAnalysis();
  SESSION.squatTorsoLeanStreak = 0;
  SESSION.poseMissingSince = 0;
  SESSION.lastFormCheckTime = 0;
  SESSION.lastInferenceTime = 0;
  SESSION.smoother = createSmoother();

  document.getElementById('repNumber').textContent = '0';
  document.getElementById('formScoreNum').textContent = '--';
  document.getElementById('formScoreNum').style.color = '';
  document.getElementById('formBar').style.width = '0%';
  document.getElementById('formLabel').textContent = 'AWAITING DATA';
  document.getElementById('sessionPhase').textContent = 'Waiting for pose...';
  document.getElementById('sessionPhase').classList.remove('active');
  document.getElementById('liveDot').className = 'loading-dot';
  document.getElementById('liveLabel').textContent = sourceMode === 'upload' ? 'Loading video' : 'Starting';
  document.getElementById('warnOverlay').innerHTML = '';
  document.getElementById('rejectNote').textContent = '';
  renderAnalytics(SESSION.lastAnalysis);
  renderSetHistory();

  try {
    if (!APP.detector) {
      APP.detector = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        { modelType: poseDetection.movenet.modelType.SINGLEPOSE_THUNDER }
      );
    }

    if (sourceMode === 'upload') {
      if (!uploadedFile) throw new Error('No video file selected');
      if (SESSION.stream) {
        SESSION.stream.getTracks().forEach(t => t.stop());
        SESSION.stream = null;
      }
      SESSION.uploadObjectUrl = URL.createObjectURL(uploadedFile);
      video.style.transform = 'none';
      canvas.style.transform = 'none';
      video.srcObject = null;
      video.src = SESSION.uploadObjectUrl;
      video.currentTime = 0;
      await waitForVideoMetadata();
      await video.play();
    } else {
      video.style.transform = 'scaleX(-1)';
      canvas.style.transform = 'scaleX(-1)';
      SESSION.stream = await getCameraStreamWithFallbacks();
      video.srcObject = SESSION.stream;
      await waitForVideoMetadata();
      await video.play();
    }

    SESSION.isRunning = true;
    detectLoop();
  } catch (e) {
    console.error('Session start error:', e);
    let msg;
    if (sourceMode === 'upload') {
      msg = 'Video load failed';
    } else if (e?.name === 'NotReadableError') {
      msg = 'Camera busy in Chrome. Close Edge/Meet/Teams/Zoom tabs and retry.';
    } else if (e?.name === 'NotAllowedError') {
      msg = 'Camera blocked. Allow camera in Chrome site settings.';
    } else {
      msg = `Camera failed: ${e?.name || 'permission/stream error'}`;
    }
    document.getElementById('liveLabel').textContent = 'Camera error';
    renderWarnings([{ t: 'bad', m: msg, injury: true }]);
  }
}

function endSession() {
  if (SESSION.sessionEnded) return;
  SESSION.sessionEnded = true;
  SESSION.isRunning = false;
  if (SESSION.animFrame) cancelAnimationFrame(SESSION.animFrame);
  if (SESSION.stream) {
    SESSION.stream.getTracks().forEach(t => t.stop());
    SESSION.stream = null;
  }
  if (SESSION.sourceMode === 'upload') {
    video.pause();
    video.removeAttribute('src');
    video.load();
    if (SESSION.uploadObjectUrl) {
      URL.revokeObjectURL(SESSION.uploadObjectUrl);
      SESSION.uploadObjectUrl = null;
    }
  }

  const avgForm = SESSION.formSamples.length
    ? Math.round(SESSION.formSamples.reduce((a, b) => a + b, 0) / SESSION.formSamples.length)
    : 0;

  const setData = {
    id: APP.nextSetId++,
    ex: SESSION.exercise,
    reps: SESSION.repCount,
    form: avgForm,
    badWarnings: SESSION.badWarningCount,
    bestDepth: SESSION.bestDepth !== null ? Math.round(SESSION.bestDepth) : null,
    rejectedReps: SESSION.rejectedReps,
    source: SESSION.sourceMode,
    sourceLabel: SESSION.sourceLabel,
    repLogs: SESSION.repLogs.slice(),
    endedAt: new Date().toISOString(),
  };

  if (setData.reps > 0 || setData.rejectedReps > 0 || setData.badWarnings > 0) {
    APP.sessionSets.push(setData);
  }
  persistAppState();
  window.location.href = 'summary.html';
}

function showSummary(lastSetFallback) {
  const lastSet = APP.sessionSets[APP.sessionSets.length - 1] || lastSetFallback;
  const allForms = APP.sessionSets.map((s) => s.form).filter((f) => f > 0);
  const avgForm = allForms.length ? Math.round(allForms.reduce((a, b) => a + b, 0) / allForms.length) : 0;
  const totalReps = APP.sessionSets.reduce((sum, s) => sum + (s.reps || 0), 0);
  const totalWarnings = APP.sessionSets.reduce((sum, s) => sum + (s.badWarnings || 0), 0);
  const bestDepthSession = APP.sessionSets.reduce((best, s) => {
    if (s.bestDepth === null || s.bestDepth === undefined) return best;
    if (best === null) return s.bestDepth;
    return Math.min(best, s.bestDepth);
  }, null);

  document.getElementById('sumTotalReps').textContent = APP.sessionSets.length ? totalReps : (lastSet ? lastSet.reps : 0);
  document.getElementById('sumSets').textContent = APP.sessionSets.length;
  document.getElementById('sumAvgForm').textContent = avgForm ? avgForm + '%' : '--';
  document.getElementById('sumWarnings').textContent = APP.sessionSets.length ? totalWarnings : (lastSet ? lastSet.badWarnings : 0);
  document.getElementById('sumBestDepth').textContent = bestDepthSession !== null ? bestDepthSession + 'deg' : (lastSet && lastSet.bestDepth !== null ? lastSet.bestDepth + 'deg' : '--');
  document.getElementById('summaryDate').textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  document.getElementById('breakdownList').innerHTML = APP.sessionSets.map((s, idx) => {
    const cls = s.form >= 75 ? 'good' : s.form >= 50 ? 'warn' : 'bad';
    const depthText = s.bestDepth !== null ? s.bestDepth + 'deg' : '--';
    const sourceText = s.source === 'upload' ? 'video' : 'camera';
    return `<div class="breakdown-row">
      <span class="breakdown-ex">${EXERCISES[s.ex].label}</span>
      <span class="breakdown-meta">${s.reps} valid | ${s.rejectedReps} rej | ${s.badWarnings} bad | depth ${depthText} | ${sourceText}</span>
      <span class="breakdown-right">
        <span class="score-pill ${cls}">${s.form}%</span>
        <button class="export-btn" onclick="exportSetCsv(${idx})">Export</button>
      </span>
    </div>`;
  }).join('');

  document.getElementById('repBreakdownList').innerHTML = APP.sessionSets.map((s, idx) => {
    const reps = s.repLogs || [];
    const rows = reps.length ? reps.map((rep) => {
      const formText = rep.form !== null && rep.form !== undefined ? rep.form + '%' : '--';
      const depthText = rep.depth !== null && rep.depth !== undefined ? rep.depth + 'deg' : '--';
      const label = rep.result === 'rejected'
        ? 'Rejected'
        : rep.result === 'caution'
          ? 'Caution'
          : rep.result === 'warn'
            ? 'Warn'
            : 'Valid';
      return `<div class="rep-row">
        <span>#${rep.index}</span>
        <span class="rep-pill ${rep.result}">${label}</span>
        <span>${formText}</span>
        <span>${depthText}</span>
        <span class="note">${rep.note || '--'}</span>
      </div>`;
    }).join('') : '<div class="rep-empty">No reps logged for this set</div>';
    const sourceText = s.source === 'upload' ? 'uploaded video' : 'camera';
    return `<div class="rep-set-block">
      <div class="rep-set-head">Set ${idx + 1} | ${EXERCISES[s.ex].label} | ${s.reps} valid / ${s.rejectedReps} rejected | ${sourceText}</div>
      <div class="rep-rows">
        <div class="rep-row head">
          <span>Rep</span>
          <span>Result</span>
          <span>Form</span>
          <span>Depth</span>
          <span>Note</span>
        </div>
        ${rows}
      </div>
    </div>`;
  }).join('') || '<div class="no-sets">No reps logged</div>';
  goTo('summaryScreen');
}

function continueSameExercise() {
  const ex = SESSION.exercise || APP.sessionSets[APP.sessionSets.length - 1]?.ex;
  if (ex) chooseExercise(ex);
  else goTo('selectScreen');
}

function fullReset() {
  APP.sessionSets = [];
  APP.nextSetId = 1;
  SESSION.exercise = null;
  SESSION.sourceMode = 'camera';
  SESSION.sourceLabel = 'Live Camera';
  SESSION.repCount = 0;
  SESSION.formSamples = [];
  SESSION.repLogs = [];
  renderSetHistory();
  goTo('selectScreen');
}

function csvEscape(value) {
  const raw = String(value ?? '');
  if (/[,\"\n]/.test(raw)) return '"' + raw.replace(/\"/g, '""') + '"';
  return raw;
}

function exportSetCsv(index) {
  const set = APP.sessionSets[index];
  if (!set) return;
  const lines = [];
  const headers = ['Set', 'Date', 'Exercise', 'Source', 'Valid Reps', 'Rejected Reps', 'Form Score', 'Bad Warnings', 'Best Depth'];
  const row = [
    index + 1,
    new Date(set.endedAt).toLocaleString('en-US'),
    EXERCISES[set.ex].label,
    set.source === 'upload' ? 'uploaded_video' : 'camera',
    set.reps,
    set.rejectedReps,
    set.form,
    set.badWarnings,
    set.bestDepth !== null ? set.bestDepth + 'deg' : '--',
  ];
  lines.push(headers.map(csvEscape).join(','));
  lines.push(row.map(csvEscape).join(','));

  if (set.repLogs && set.repLogs.length) {
    lines.push('');
    lines.push(['Rep', 'Result', 'Valid', 'Form', 'Depth', 'Warnings', 'Bad Flags', 'DurationMs', 'Note', 'Timestamp'].map(csvEscape).join(','));
    set.repLogs.forEach((rep) => {
      lines.push([
        rep.index,
        rep.result,
        rep.valid ? 'yes' : 'no',
        rep.form !== null && rep.form !== undefined ? rep.form : '--',
        rep.depth !== null && rep.depth !== undefined ? rep.depth + 'deg' : '--',
        rep.warnings,
        rep.badFlags,
        rep.durationMs ?? '--',
        rep.note || '--',
        new Date(rep.at).toLocaleString('en-US'),
      ].map(csvEscape).join(','));
    });
  }

  const csv = lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `formcheck_set_${index + 1}_${set.ex}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportLatestSet() {
  if (!APP.sessionSets.length) {
    renderWarnings([{ t: 'warn', m: 'No set available to export' }]);
    return;
  }
  exportSetCsv(APP.sessionSets.length - 1);
}

window.addEventListener('resize', () => {
  if (!window.matchMedia('(max-width: 700px)').matches) closeAnalyticsPanel(true);
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeAnalyticsPanel();
});

video.addEventListener('ended', () => {
  if (!SESSION.isRunning || SESSION.sourceMode !== 'upload') return;
  renderWarnings([{ t: 'good', m: 'Video finished - set ended' }]);
  endSession();
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SETUP DIAGRAMS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function drawSetupDiagramBase(label) {
  const c = document.getElementById('setupCanvas');
  const x = c.getContext('2d');
  x.clearRect(0, 0, 260, 160);
  x.fillStyle = '#141414';
  x.fillRect(0, 0, 260, 160);

  // Grid
  x.strokeStyle = '#1e1e1e';
  x.lineWidth = 1;
  for (let i = 0; i < 260; i += 20) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 160); x.stroke(); }
  for (let i = 0; i < 160; i += 20) { x.beginPath(); x.moveTo(0, i); x.lineTo(260, i); x.stroke(); }
  return x;
}

function drawStickFigure(x, cx, y, scale, color = '#ff5c00', posture = 'stand') {
  x.strokeStyle = color;
  x.fillStyle = color;
  x.lineWidth = 2;

  const s = scale;
  // head
  x.beginPath();
  x.arc(cx, y, 8 * s, 0, Math.PI * 2);
  x.fill();

  if (posture === 'squat') {
    // squatting body
    x.beginPath(); x.moveTo(cx, y + 8 * s); x.lineTo(cx, y + 22 * s); x.stroke(); // torso
    x.beginPath(); x.moveTo(cx, y + 22 * s); x.lineTo(cx - 14 * s, y + 34 * s); x.lineTo(cx - 10 * s, y + 48 * s); x.stroke();
    x.beginPath(); x.moveTo(cx, y + 22 * s); x.lineTo(cx + 14 * s, y + 34 * s); x.lineTo(cx + 10 * s, y + 48 * s); x.stroke();
    x.beginPath(); x.moveTo(cx, y + 16 * s); x.lineTo(cx - 16 * s, y + 26 * s); x.stroke();
    x.beginPath(); x.moveTo(cx, y + 16 * s); x.lineTo(cx + 16 * s, y + 26 * s); x.stroke();
  } else if (posture === 'hinge') {
    x.beginPath(); x.moveTo(cx, y + 8 * s); x.lineTo(cx + 14 * s, y + 26 * s); x.stroke(); // bent torso
    x.beginPath(); x.moveTo(cx + 14 * s, y + 26 * s); x.lineTo(cx + 10 * s, y + 42 * s); x.lineTo(cx + 4 * s, y + 54 * s); x.stroke();
    x.beginPath(); x.moveTo(cx + 14 * s, y + 26 * s); x.lineTo(cx + 18 * s, y + 42 * s); x.lineTo(cx + 12 * s, y + 54 * s); x.stroke();
    x.beginPath(); x.moveTo(cx, y + 14 * s); x.lineTo(cx - 10 * s, y + 28 * s); x.stroke();
    x.beginPath(); x.moveTo(cx, y + 14 * s); x.lineTo(cx + 16 * s, y + 20 * s); x.stroke();
  } else if (posture === 'bench') {
    // lying on bench, arms pressing up (side view)
    x.beginPath(); x.moveTo(cx, y + 8 * s); x.lineTo(cx + 24 * s, y + 12 * s); x.stroke(); // torso lying flat
    x.beginPath(); x.moveTo(cx + 24 * s, y + 12 * s); x.lineTo(cx + 36 * s, y + 18 * s); x.lineTo(cx + 44 * s, y + 24 * s); x.stroke(); // legs
    x.beginPath(); x.moveTo(cx + 24 * s, y + 12 * s); x.lineTo(cx + 38 * s, y + 14 * s); x.lineTo(cx + 46 * s, y + 20 * s); x.stroke();
    // arms pressing upward
    x.beginPath(); x.moveTo(cx + 4 * s, y + 10 * s); x.lineTo(cx + 2 * s, y - 6 * s); x.lineTo(cx + 6 * s, y - 16 * s); x.stroke();
    x.beginPath(); x.moveTo(cx + 4 * s, y + 10 * s); x.lineTo(cx + 8 * s, y - 4 * s); x.lineTo(cx + 4 * s, y - 14 * s); x.stroke();
  } else {
    x.beginPath(); x.moveTo(cx, y + 8 * s); x.lineTo(cx, y + 28 * s); x.stroke(); // torso
    x.beginPath(); x.moveTo(cx, y + 28 * s); x.lineTo(cx - 8 * s, y + 44 * s); x.lineTo(cx - 6 * s, y + 56 * s); x.stroke();
    x.beginPath(); x.moveTo(cx, y + 28 * s); x.lineTo(cx + 8 * s, y + 44 * s); x.lineTo(cx + 6 * s, y + 56 * s); x.stroke();
    x.beginPath(); x.moveTo(cx, y + 16 * s); x.lineTo(cx - 14 * s, y + 26 * s); x.stroke();
    x.beginPath(); x.moveTo(cx, y + 16 * s); x.lineTo(cx + 14 * s, y + 26 * s); x.stroke();
  }
}

function drawCamera(x, cx, cy) {
  x.fillStyle = '#333';
  x.fillRect(cx - 14, cy - 8, 28, 16);
  x.fillStyle = '#00c896';
  x.beginPath(); x.arc(cx, cy, 5, 0, Math.PI * 2); x.fill();
  x.strokeStyle = '#555';
  x.lineWidth = 1;
  x.strokeRect(cx - 14, cy - 8, 28, 16);
}

function drawBenchDiagram() {
  const x = drawSetupDiagramBase();
  // bench surface
  x.fillStyle = '#222'; x.fillRect(80, 110, 120, 8);
  x.fillStyle = '#1a1a1a'; x.fillRect(90, 118, 10, 32); x.fillRect(180, 118, 10, 32);
  // figure lying on bench
  drawStickFigure(x, 140, 78, 0.9, '#ff5c00', 'bench');
  drawCamera(x, 30, 100);
  // arrow
  x.strokeStyle = '#ff5c00'; x.lineWidth = 1; x.setLineDash([3, 3]);
  x.beginPath(); x.moveTo(44, 100); x.lineTo(100, 95); x.stroke();
  x.setLineDash([]);
  x.fillStyle = '#555'; x.font = '9px JetBrains Mono';
  x.fillText('BENCH HEIGHT - SIDE', 10, 148);
}

function drawSquatDiagram() {
  const x = drawSetupDiagramBase();
  x.strokeStyle = '#333'; x.lineWidth = 1;
  x.beginPath(); x.moveTo(0, 150); x.lineTo(260, 150); x.stroke();
  drawStickFigure(x, 150, 60, 1, '#ff5c00', 'squat');
  drawCamera(x, 30, 95);
  x.strokeStyle = '#ff5c00'; x.lineWidth = 1; x.setLineDash([3, 3]);
  x.beginPath(); x.moveTo(44, 95); x.lineTo(130, 100); x.stroke();
  x.setLineDash([]);
  x.fillStyle = '#555'; x.font = '9px JetBrains Mono';
  x.fillText('HIP HEIGHT', 10, 148);
}

function drawDeadliftDiagram() {
  const x = drawSetupDiagramBase();
  x.strokeStyle = '#333'; x.lineWidth = 1;
  x.beginPath(); x.moveTo(0, 150); x.lineTo(260, 150); x.stroke();
  drawStickFigure(x, 150, 55, 1, '#ff5c00', 'hinge');
  drawCamera(x, 30, 90);
  x.strokeStyle = '#ff5c00'; x.lineWidth = 1; x.setLineDash([3, 3]);
  x.beginPath(); x.moveTo(44, 90); x.lineTo(130, 90); x.stroke();
  x.setLineDash([]);
  x.fillStyle = '#555'; x.font = '9px JetBrains Mono';
  x.fillText('HIP HEIGHT - SIDE', 10, 148);
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// INIT
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
window.addEventListener('load', async () => {
  if (!SESSION.exercise || !EXERCISES[SESSION.exercise]) {
    window.location.href = 'formcheck.html';
    return;
  }

  const loadMsg = document.getElementById('loadMsg');
  if (loadMsg) loadMsg.textContent = 'Loading TensorFlow...';
  await tf.ready();
  if (loadMsg) loadMsg.textContent = 'Loading pose model...';
  if (!APP.detector) {
    APP.detector = await poseDetection.createDetector(
      poseDetection.SupportedModels.MoveNet,
      { modelType: poseDetection.movenet.modelType.SINGLEPOSE_THUNDER }
    );
  }
  if (loadMsg) loadMsg.textContent = 'Ready';
  setTimeout(() => {
    const overlay = document.getElementById('loadOverlay');
    if (overlay) overlay.classList.add('hidden');

    if (SESSION.sourceMode === 'upload') {
      document.getElementById('sessionExName').textContent = EXERCISES[SESSION.exercise].label;
      buildAngleRows();
      renderSetHistory();
      renderAnalytics(createIdleAnalysis());
      const prompt = document.getElementById('uploadPrompt');
      if (prompt) prompt.classList.remove('hidden');
      document.getElementById('liveLabel').textContent = 'Select video';
      return;
    }

    startSession('camera');
  }, 600);
});

