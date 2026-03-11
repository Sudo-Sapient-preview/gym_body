const FC_STORE_KEY = 'formcheck_state_v1';

const FC_DEFAULT_STATE = {
  selectedExercise: null,
  pendingSource: 'camera',
  sessionSets: [],
  nextSetId: 1,
};

const FC_EXERCISE_META = {
  bench: {
    key: 'bench',
    label: 'BENCH PRESS',
    title: 'Bench Press',
    tips: [
      'Place device to your side at bench height',
      'Upper body and arms must be visible',
      'Ensure shoulders, elbows, and wrists are in frame',
    ],
  },
  squat: {
    key: 'squat',
    label: 'SQUAT',
    title: 'Squat',
    tips: [
      'Device at hip height, side profile',
      'Stand 6-8 feet from the camera',
      'Full body visible - head to feet',
    ],
  },
  deadlift: {
    key: 'deadlift',
    label: 'DEADLIFT',
    title: 'Deadlift',
    tips: [
      'Device at hip height, strict side profile',
      'Stand 6-8 feet from the camera',
      'Entire body visible throughout movement',
    ],
  },
};

function fcLoadState() {
  try {
    const raw = sessionStorage.getItem(FC_STORE_KEY);
    if (!raw) return { ...FC_DEFAULT_STATE };
    const parsed = JSON.parse(raw);
    return { ...FC_DEFAULT_STATE, ...parsed };
  } catch {
    return { ...FC_DEFAULT_STATE };
  }
}

function fcSaveState(state) {
  sessionStorage.setItem(FC_STORE_KEY, JSON.stringify(state));
}

function fcUpdateState(updater) {
  const current = fcLoadState();
  const next = updater({ ...current }) || current;
  fcSaveState(next);
  return next;
}

window.FCState = {
  load: fcLoadState,
  save: fcSaveState,
  update: fcUpdateState,
  defaults: FC_DEFAULT_STATE,
  exercises: FC_EXERCISE_META,
};

