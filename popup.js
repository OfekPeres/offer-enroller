let targetTabId = null;

const startBtn = document.getElementById('start');
const stopBtn = document.getElementById('stop');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
let lastKnownLabel = null;

function renderState({ running, current = 0, total = 0, label }) {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;

  progressBar.style.width = `${percent}%`;

  if (label) {
    lastKnownLabel = label;
  }

  if (lastKnownLabel) {
    progressText.textContent = lastKnownLabel;
    return;
  }

  if (running && total > 0) {
    progressText.textContent = 'Processing offers…';
  } else if (!running && current > 0 && current < total) {
    progressText.textContent = 'Paused';
  } else if (!running && total > 0 && current === total) {
    progressText.textContent = 'All offers processed';
  } else {
    progressText.textContent = 'Idle';
  }
}

// On popup open, read last known state
chrome.storage.local.get(
  [
    'autoEnrollRunning',
    'autoEnrollCurrent',
    'autoEnrollTotal',
    'autoEnrollLabel',
  ],
  (result) => {
    lastKnownLabel = result.autoEnrollLabel || null;

    renderState({
      running: result.autoEnrollRunning,
      current: result.autoEnrollCurrent,
      total: result.autoEnrollTotal,
      label: result.autoEnrollLabel,
    });
  }
);

async function ensureTargetTab() {
  if (!targetTabId) {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    targetTabId = tab.id;
  }
}

function sendToTarget(action) {
  if (!targetTabId) return;
  chrome.tabs.sendMessage(targetTabId, { action });
}

// 🔹 NEW: persist running state
function setRunningState(isRunning) {
  chrome.storage.local.set({ autoEnrollRunning: isRunning });
}

startBtn.addEventListener('click', async () => {
  await ensureTargetTab();
  setRunningState(true);
  sendToTarget('START_ENROLLING');
});

stopBtn.addEventListener('click', () => {
  setRunningState(false);
  sendToTarget('STOP_ENROLLING');
});

// Receive progress updates from content.js
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'PROGRESS') {
    renderState({
      running: true,
      current: message.current,
      total: message.total,
      label: message.label,
    });
  }
});
