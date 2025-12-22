let targetTabId = null;

const startBtn = document.getElementById('start');
const stopBtn = document.getElementById('stop');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');


// On popup open, read last known state
chrome.storage.local.get(
  [
    'autoEnrollRunning',
    'autoEnrollCurrent',
    'autoEnrollTotal',
    'autoEnrollLabel',
  ],
  (result) => {
    const {
      autoEnrollRunning,
      autoEnrollCurrent,
      autoEnrollTotal,
      autoEnrollLabel,
    } = result;

    const percent =
      autoEnrollTotal && autoEnrollTotal > 0
        ? Math.round((autoEnrollCurrent / autoEnrollTotal) * 100)
        : 0;

    progressBar.style.width = `${percent}%`;
    progressText.textContent =
      autoEnrollLabel || (autoEnrollRunning ? 'Running...' : 'Idle');
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

  progressText.textContent = 'Starting...';
});

stopBtn.addEventListener('click', () => {
  setRunningState(false);
  sendToTarget('STOP_ENROLLING');

  progressText.textContent = 'Stopped';
  progressBar.style.width = '0%';
});

// Receive progress updates from content.js
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'PROGRESS') {
    const percent =
      message.total === 0
        ? 0
        : Math.round((message.current / message.total) * 100);

    progressBar.style.width = `${percent}%`;
    progressText.textContent =
      message.label || `${message.current} / ${message.total} offers`;
  }

  if (message.type === 'DONE') {
    progressText.textContent = 'Completed';
  }
});
