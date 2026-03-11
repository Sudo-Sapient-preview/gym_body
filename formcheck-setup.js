const setupCanvas = document.getElementById('setupCanvas');

function drawSetupDiagramBase() {
  const x = setupCanvas.getContext('2d');
  x.clearRect(0, 0, 260, 160);
  x.fillStyle = '#141414';
  x.fillRect(0, 0, 260, 160);
  x.strokeStyle = '#1e1e1e';
  x.lineWidth = 1;
  for (let i = 0; i < 260; i += 20) {
    x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 160); x.stroke();
  }
  for (let i = 0; i < 160; i += 20) {
    x.beginPath(); x.moveTo(0, i); x.lineTo(260, i); x.stroke();
  }
  return x;
}

function drawStickFigure(x, cx, y, scale, color = '#ff5c00', posture = 'stand') {
  x.strokeStyle = color;
  x.fillStyle = color;
  x.lineWidth = 2;
  const s = scale;
  x.beginPath(); x.arc(cx, y, 8 * s, 0, Math.PI * 2); x.fill();

  if (posture === 'squat') {
    x.beginPath(); x.moveTo(cx, y + 8 * s); x.lineTo(cx, y + 22 * s); x.stroke();
    x.beginPath(); x.moveTo(cx, y + 22 * s); x.lineTo(cx - 14 * s, y + 34 * s); x.lineTo(cx - 10 * s, y + 48 * s); x.stroke();
    x.beginPath(); x.moveTo(cx, y + 22 * s); x.lineTo(cx + 14 * s, y + 34 * s); x.lineTo(cx + 10 * s, y + 48 * s); x.stroke();
    x.beginPath(); x.moveTo(cx, y + 16 * s); x.lineTo(cx - 16 * s, y + 26 * s); x.stroke();
    x.beginPath(); x.moveTo(cx, y + 16 * s); x.lineTo(cx + 16 * s, y + 26 * s); x.stroke();
    return;
  }

  if (posture === 'hinge') {
    x.beginPath(); x.moveTo(cx, y + 8 * s); x.lineTo(cx + 14 * s, y + 26 * s); x.stroke();
    x.beginPath(); x.moveTo(cx + 14 * s, y + 26 * s); x.lineTo(cx + 10 * s, y + 42 * s); x.lineTo(cx + 4 * s, y + 54 * s); x.stroke();
    x.beginPath(); x.moveTo(cx + 14 * s, y + 26 * s); x.lineTo(cx + 18 * s, y + 42 * s); x.lineTo(cx + 12 * s, y + 54 * s); x.stroke();
    x.beginPath(); x.moveTo(cx, y + 14 * s); x.lineTo(cx - 10 * s, y + 28 * s); x.stroke();
    x.beginPath(); x.moveTo(cx, y + 14 * s); x.lineTo(cx + 16 * s, y + 20 * s); x.stroke();
    return;
  }

  x.beginPath(); x.moveTo(cx, y + 8 * s); x.lineTo(cx - 20 * s, y + 20 * s); x.stroke();
  x.beginPath(); x.moveTo(cx - 20 * s, y + 20 * s); x.lineTo(cx - 14 * s, y + 34 * s); x.lineTo(cx - 6 * s, y + 44 * s); x.stroke();
  x.beginPath(); x.moveTo(cx - 20 * s, y + 20 * s); x.lineTo(cx - 26 * s, y + 34 * s); x.lineTo(cx - 18 * s, y + 44 * s); x.stroke();
  x.beginPath(); x.moveTo(cx, y + 12 * s); x.lineTo(cx + 12 * s, y + 18 * s); x.stroke();
  x.beginPath(); x.moveTo(cx, y + 12 * s); x.lineTo(cx - 10 * s, y + 22 * s); x.stroke();
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
  // bench
  x.fillStyle = '#222'; x.fillRect(80, 110, 120, 8);
  x.fillStyle = '#1a1a1a'; x.fillRect(90, 118, 10, 32); x.fillRect(180, 118, 10, 32);
  // figure lying on bench, pressing up
  drawStickFigure(x, 140, 78, 0.9, '#ff5c00', 'bench');
  drawCamera(x, 30, 100);
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

const SETUP_DIAGRAMS = {
  bench: drawBenchDiagram,
  squat: drawSquatDiagram,
  deadlift: drawDeadliftDiagram,
};

function goBack() {
  window.location.href = 'formcheck.html';
}

function startFromSetup(source) {
  window.FCState.update((state) => {
    state.pendingSource = source;
    return state;
  });
  window.location.href = 'session.html';
}

window.goBack = goBack;
window.startFromSetup = startFromSetup;

window.addEventListener('load', () => {
  const state = window.FCState.load();
  const exercise = state.selectedExercise;
  const meta = window.FCState.exercises[exercise];
  if (!meta) {
    window.location.href = 'formcheck.html';
    return;
  }

  document.getElementById('setupTitle').textContent = `${meta.label} - Setup`;
  document.getElementById('setupSub').textContent = 'Use camera or upload a side-view video';
  document.getElementById('setupTips').innerHTML = meta.tips
    .map((tip) => `<div class="tip-row"><div class="tip-dot"></div><div class="tip-text">${tip}</div></div>`)
    .join('');

  SETUP_DIAGRAMS[exercise]?.();
});

