function chooseExercise(exerciseKey) {
  if (!window.FCState?.exercises?.[exerciseKey]) return;
  window.FCState.update((state) => {
    state.selectedExercise = exerciseKey;
    state.pendingSource = 'camera';
    return state;
  });
  window.location.href = 'setup.html';
}

window.chooseExercise = chooseExercise;

