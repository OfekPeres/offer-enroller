const DEBUG = true;

function log(...args) {
  if (DEBUG) console.log('[AutoEnroll]', ...args);
}

function warn(...args) {
  if (DEBUG) console.warn('[AutoEnroll]', ...args);
}

// Track running in-memory for the current content script instance
let isRunning = false;

function sleep(ms) {
  log('Sleeping for', ms, 'ms');
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAlreadyEnrolled(tile) {
  return !!tile.querySelector('[aria-label^="Enrolled"]');
}

// Describe the offer for debugging/progress display
function describeTile(tile, index, total) {
  const merchant = tile.querySelector('.merchant-name')?.textContent?.trim();

  const offer = tile.querySelector('.offer-title')?.textContent?.trim();

  const labelParts = [];

  if (merchant) labelParts.push(merchant);
  if (offer) labelParts.push(offer);

  const label =
    labelParts.length > 0 ? labelParts.join(' – ') : 'Unknown offer';

  return `Offer ${index + 1}/${total}: ${label}`;
}

// Send progress to popup AND store persistently
function sendProgress(current, total, label) {
  chrome.runtime.sendMessage({
    type: 'PROGRESS',
    current,
    total,
    label,
  });

  chrome.storage.local.set({
    autoEnrollCurrent: current,
    autoEnrollTotal: total,
    autoEnrollLabel: label,
  });
}

// Read persistent running state from storage
function getRunningState() {
  return new Promise((resolve) => {
    chrome.storage.local.get('autoEnrollRunning', (result) => {
      resolve(result.autoEnrollRunning === true);
    });
  });
}

async function autoScrollToLoadAllOffers({
  pauseMs = 800,
  maxRounds = 20,
} = {}) {
  log('Starting auto-scroll to load offers');

  // Let the popup know we are loading offers
  sendProgress(0, 0, 'Loading all offers…');

  let lastCount = 0;

  for (let round = 0; round < maxRounds; round++) {
    if (!(await shouldContinue())) {
      warn('Auto-scroll stopped');
      return;
    }

    const tiles = document.querySelectorAll('.tile-content');
    const count = tiles.length;

    log(`Scroll round ${round + 1}, tiles: ${count}`);

    if (count === lastCount) {
      log('No new offers loaded, stopping auto-scroll');
      return;
    }

    lastCount = count;

    window.scrollTo({
      top: document.body.scrollHeight,
      behavior: 'smooth',
    });

    await sleep(pauseMs);
  }

  warn('Reached max auto-scroll rounds');
}

async function shouldContinue() {
  const { autoEnrollRunning } = await chrome.storage.local.get(
    'autoEnrollRunning'
  );
  return autoEnrollRunning === true;
}

// Wait for the modal to appear
function waitForModal(timeout = 5000) {
  log('Waiting for modal');
  return new Promise((resolve) => {
    const start = Date.now();

    const interval = setInterval(async () => {
      if (!(await shouldContinue())) {
        clearInterval(interval);
        return resolve(null);
      }

      const modal = document.querySelector('.cds-modal-content');
      if (modal) {
        log('Modal detected');
        clearInterval(interval);
        return resolve(modal);
      }

      if (Date.now() - start > timeout) {
        warn('Timed out waiting for modal');
        clearInterval(interval);
        resolve(null);
      }
    }, 200);
  });
}

// Click the "Enroll in Offer" button inside modal
function clickEnrollButton(modal) {
  log('Searching for enroll button');
  const buttons = modal.querySelectorAll('button');
  for (const btn of buttons) {
    if (btn.textContent.trim() === 'Enroll in Offer') {
      log('Enroll button found, clicking');
      btn.style.outline = DEBUG ? '3px solid lime' : '';
      btn.click();
      return true;
    }
  }
  warn('Enroll button not found');
  return false;
}

// Close modal
async function closeModal(modal) {
  if (!modal) {
    warn('closeModal called without modal');
    return;
  }

  log('Closing modal');
  await sleep(1200);

  const closeButton = modal.querySelector('button[title="Close"]');
  if (closeButton) {
    log('Close button clicked');
    closeButton.click();
  } else {
    warn('Close button not found');
  }
}

// Main tile processing function
async function processTiles() {
  log('Starting offer enrollment');
  await autoScrollToLoadAllOffers();

  const allTiles = Array.from(document.querySelectorAll('.tile-content'));

  const enrolledCount = allTiles.filter(isAlreadyEnrolled).length;
  const unenrolledTiles = allTiles.filter((tile) => !isAlreadyEnrolled(tile));

  const total = allTiles.length;
  let current = enrolledCount;

  log(
    `Found ${total} offers (${enrolledCount} already enrolled, ${unenrolledTiles.length} remaining)`
  );

  // Initialize progress bar correctly
  sendProgress(current, total, `Already enrolled: ${enrolledCount}/${total}`);

  for (let i = 0; i < unenrolledTiles.length; i++) {
    if (!(await shouldContinue())) break;

    const tile = unenrolledTiles[i];

    if (isAlreadyEnrolled(tile)) {
      log(`Skipping already enrolled offer ${i + 1}`);
      continue;
    }
    if (tile.dataset.processed) {
      log(`Skipping already processed tile ${i + 1}`);
      continue;
    }

    tile.dataset.processed = 'true';
    current++;

    const label = describeTile(tile, current, total);
    log(label);
    sendProgress(current, total, label);

    log('Clicking tile');
    tile.click();

    const modal = await waitForModal();
    if (!(await shouldContinue()) || !modal) break;

    await sleep(500);
    if (!(await shouldContinue())) break;

    clickEnrollButton(modal);
    await closeModal(modal);
    await sleep(800);
  }

  isRunning = false;
  // Clear running flag in storage
  chrome.storage.local.set({ autoEnrollRunning: false });
  log('Enrollment process complete');
  chrome.runtime.sendMessage({ type: 'DONE' });
}

// Message listener
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'START_ENROLLING') {
    if (isRunning) {
      warn('Start requested but process already running');
      return;
    }

    log('START_ENROLLING received');
    isRunning = true;
    // Set storage running flag so STOP works across tabs
    chrome.storage.local.set({ autoEnrollRunning: true });
    processTiles();
  }

  if (message.action === 'STOP_ENROLLING') {
    log('STOP_ENROLLING received');
    isRunning = false;
    chrome.storage.local.set({ autoEnrollRunning: false });
  }
});
