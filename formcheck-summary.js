function csvEscape(value) {
  const raw = String(value ?? '');
  if (/[,\"\n]/.test(raw)) return '"' + raw.replace(/\"/g, '""') + '"';
  return raw;
}

function labelForExercise(exKey) {
  return window.FCState.exercises[exKey]?.label || exKey || '--';
}

function exportSetCsv(index) {
  const state = window.FCState.load();
  const set = state.sessionSets[index];
  if (!set) return;

  const lines = [];
  const headers = ['Set', 'Date', 'Exercise', 'Source', 'Valid Reps', 'Rejected Reps', 'Form Score', 'Bad Warnings', 'Best Depth'];
  lines.push(headers.map(csvEscape).join(','));
  lines.push([
    index + 1,
    new Date(set.endedAt).toLocaleString('en-US'),
    labelForExercise(set.ex),
    set.source === 'upload' ? 'uploaded_video' : 'camera',
    set.reps,
    set.rejectedReps,
    set.form,
    set.badWarnings,
    set.bestDepth !== null ? set.bestDepth + 'deg' : '--',
  ].map(csvEscape).join(','));

  if (set.repLogs?.length) {
    lines.push('');
    lines.push(['Rep', 'Result', 'Valid', 'Form', 'Depth', 'Warnings', 'Bad Flags', 'DurationMs', 'Note', 'Timestamp'].map(csvEscape).join(','));
    set.repLogs.forEach((rep) => {
      lines.push([
        rep.index,
        rep.result,
        rep.valid ? 'yes' : 'no',
        rep.form ?? '--',
        rep.depth !== null && rep.depth !== undefined ? rep.depth + 'deg' : '--',
        rep.warnings,
        rep.badFlags,
        rep.durationMs ?? '--',
        rep.note || '--',
        new Date(rep.at).toLocaleString('en-US'),
      ].map(csvEscape).join(','));
    });
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `formcheck_set_${index + 1}_${set.ex}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportLatestSet() {
  const state = window.FCState.load();
  if (!state.sessionSets.length) return;
  exportSetCsv(state.sessionSets.length - 1);
}

function newSession() {
  window.FCState.save({ ...window.FCState.defaults });
  window.location.href = 'formcheck.html';
}

function anotherSet() {
  const state = window.FCState.load();
  const lastSet = state.sessionSets[state.sessionSets.length - 1];
  const ex = state.selectedExercise || lastSet?.ex;
  if (!ex) {
    window.location.href = 'formcheck.html';
    return;
  }
  window.FCState.update((next) => {
    next.selectedExercise = ex;
    next.pendingSource = 'camera';
    return next;
  });
  window.location.href = 'setup.html';
}

window.exportSetCsv = exportSetCsv;
window.exportLatestSet = exportLatestSet;
window.newSession = newSession;
window.anotherSet = anotherSet;

window.addEventListener('load', () => {
  const state = window.FCState.load();
  const sets = state.sessionSets || [];

  const allForms = sets.map((s) => s.form).filter((f) => f > 0);
  const avgForm = allForms.length ? Math.round(allForms.reduce((a, b) => a + b, 0) / allForms.length) : 0;
  const totalReps = sets.reduce((sum, s) => sum + (s.reps || 0), 0);
  const totalWarnings = sets.reduce((sum, s) => sum + (s.badWarnings || 0), 0);
  const bestDepthSession = sets.reduce((best, s) => {
    if (s.bestDepth === null || s.bestDepth === undefined) return best;
    if (best === null) return s.bestDepth;
    return Math.min(best, s.bestDepth);
  }, null);

  document.getElementById('sumTotalReps').textContent = totalReps;
  document.getElementById('sumSets').textContent = sets.length;
  document.getElementById('sumAvgForm').textContent = avgForm ? avgForm + '%' : '--';
  document.getElementById('sumWarnings').textContent = totalWarnings;
  document.getElementById('sumBestDepth').textContent = bestDepthSession !== null ? bestDepthSession + 'deg' : '--';
  document.getElementById('summaryDate').textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  document.getElementById('breakdownList').innerHTML = sets.map((s, idx) => {
    const cls = s.form >= 75 ? 'good' : s.form >= 50 ? 'warn' : 'bad';
    const depthText = s.bestDepth !== null ? s.bestDepth + 'deg' : '--';
    const sourceText = s.source === 'upload' ? 'video' : 'camera';
    return `<div class="breakdown-row">
      <span class="breakdown-ex">${labelForExercise(s.ex)}</span>
      <span class="breakdown-meta">${s.reps} valid | ${s.rejectedReps} rej | ${s.badWarnings} bad | depth ${depthText} | ${sourceText}</span>
      <span class="breakdown-right">
        <span class="score-pill ${cls}">${s.form}%</span>
        <button class="export-btn" onclick="exportSetCsv(${idx})">Export</button>
      </span>
    </div>`;
  }).join('') || '<div class="no-sets">No sets yet</div>';

  document.getElementById('repBreakdownList').innerHTML = sets.map((s, idx) => {
    const rows = (s.repLogs || []).map((rep) => {
      const label = rep.result === 'rejected'
        ? 'Rejected'
        : rep.result === 'caution'
          ? 'Caution'
          : rep.result === 'warn'
            ? 'Warn'
            : 'Valid';
      const depthText = rep.depth !== null && rep.depth !== undefined ? rep.depth + 'deg' : '--';
      const formText = rep.form !== null && rep.form !== undefined ? rep.form + '%' : '--';
      return `<div class="rep-row">
        <span>#${rep.index}</span>
        <span class="rep-pill ${rep.result}">${label}</span>
        <span>${formText}</span>
        <span>${depthText}</span>
        <span class="note">${rep.note || '--'}</span>
      </div>`;
    }).join('') || '<div class="rep-empty">No reps logged for this set</div>';

    const sourceText = s.source === 'upload' ? 'uploaded video' : 'camera';
    return `<div class="rep-set-block">
      <div class="rep-set-head">Set ${idx + 1} | ${labelForExercise(s.ex)} | ${s.reps} valid / ${s.rejectedReps} rejected | ${sourceText}</div>
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
});

