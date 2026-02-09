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
    progressText.textContent = 'Processing offers...';
  } else if (!running && current > 0 && current < total) {
    progressText.textContent = 'Paused';
  } else if (!running && total > 0 && current === total) {
    progressText.textContent = 'All offers processed';
  } else {
    progressText.textContent = 'Idle';
  }
}

// Detect current provider from the active tab
async function detectProvider() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return null;
  
  const url = tab.url.toLowerCase();
  if (url.includes('citi.com')) return 'citi';
  if (url.includes('chase.com')) return 'chase';
  return null;
}

// On popup open, read last known state for current provider
async function loadState() {
  const provider = await detectProvider();
  
  if (!provider) {
    renderState({
      running: false,
      current: 0,
      total: 0,
      label: 'Navigate to Citi or Chase offers page'
    });
    return;
  }

  // Read provider-specific storage
  chrome.storage.local.get(
    [
      `autoEnroll_${provider}_Running`,
      `autoEnroll_${provider}_Current`,
      `autoEnroll_${provider}_Total`,
      `autoEnroll_${provider}_Label`,
    ],
    (result) => {
      lastKnownLabel = result[`autoEnroll_${provider}_Label`] || null;
      renderState({
        running: result[`autoEnroll_${provider}_Running`],
        current: result[`autoEnroll_${provider}_Current`],
        total: result[`autoEnroll_${provider}_Total`],
        label: result[`autoEnroll_${provider}_Label`],
      });
    }
  );
}

// Load state when popup opens
loadState();

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

// Set running state for current provider
async function setRunningState(isRunning) {
  const provider = await detectProvider();
  if (!provider) {
    console.warn('No provider detected, cannot set running state');
    return;
  }
  chrome.storage.local.set({ [`autoEnroll_${provider}_Running`]: isRunning });
}

startBtn.addEventListener('click', async () => {
  await ensureTargetTab();
  await setRunningState(true);
  sendToTarget('START_ENROLLING');
});

stopBtn.addEventListener('click', async () => {
  await setRunningState(false);
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
  
  if (message.type === 'DONE') {
    // Reload state to show final progress
    loadState();
  }
});