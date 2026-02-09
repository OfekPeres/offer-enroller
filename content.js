const DEBUG = true;

function log(...args) {
  if (DEBUG) console.log('[AutoEnroll]', ...args);
}

function warn(...args) {
  if (DEBUG) console.warn('[AutoEnroll]', ...args);
}

let isRunning = false;

function sleep(ms) {
  log('Sleeping for', ms, 'ms');
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ========================================
// PROVIDER DETECTION & CONFIGURATION
// ========================================

const PROVIDERS = {
  CITI: {
    name: 'Citi',
    detectUrl: () => window.location.hostname.includes('citi.com'),
    navigationPattern: 'modal',
    selectors: {
      tile: '.tile-content',
      enrolledIndicator: '[aria-label^="Enrolled"]',
      merchantName: '.merchant-name',
      offerTitle: '.offer-title',
      enrollButton: 'button',
      enrollButtonText: 'Enroll in Offer',
      modal: '.cds-modal-content',
      modalCloseButton: 'button[title="Close"]',
      backButton: null,
      detailsPageIndicator: null
    },
    isEnrolled: (tile) => !!tile.querySelector('[aria-label^="Enrolled"]'),
    isOnDetailsPage: () => false
  },
  
  CHASE: {
    name: 'Chase',
    detectUrl: () => window.location.hostname.includes('chase.com'),
    navigationPattern: 'spa', // Single Page Application
    selectors: {
      tile: '[data-cy="commerce-tile"]',
      enrolledIndicator: '[data-cy="offer-tile-alert-container-success"]',
      merchantName: '.mds-body-small-heavier.r9jbijk',
      offerTitle: '.mds-body-large-heavier.r9jbijj',
      enrollButton: 'button',
      enrollButtonText: 'Activate',
      modal: null,
      modalCloseButton: null,
      backButton: '#back-button', // Inside shadow DOM
      backButtonHost: 'mds-navigation-bar', // Shadow DOM host element
      detailsPageIndicator: 'mds-navigation-bar' // This appears on details page
    },
    isEnrolled: (tile) => !!tile.querySelector('[data-cy="offer-tile-alert-container-success"]'),
    isOnDetailsPage: () => {
      // Check URL hash or presence of navigation bar
      return window.location.hash.includes('offer-activated') || 
             window.location.hash.includes('/offer/') ||
             !!document.querySelector('mds-navigation-bar');
    },
    // Function to access shadow DOM
    getBackButton: () => {
      const navBar = document.querySelector('mds-navigation-bar');
      if (navBar && navBar.shadowRoot) {
        return navBar.shadowRoot.querySelector('#back-button');
      }
      return null;
    }
  }
};

function detectProvider() {
  for (const [key, provider] of Object.entries(PROVIDERS)) {
    if (provider.detectUrl()) {
      log(`Detected provider: ${provider.name}`);
      return provider;
    }
  }
  warn('No supported provider detected');
  return null;
}

const currentProvider = detectProvider();

// ========================================
// HELPER FUNCTIONS
// ========================================

function isAlreadyEnrolled(tile) {
  if (!currentProvider) return false;
  return currentProvider.isEnrolled(tile);
}

function describeTile(tile, index, total) {
  if (!currentProvider) return `Offer ${index + 1}/${total}`;
  
  const merchant = tile.querySelector(currentProvider.selectors.merchantName)?.textContent?.trim();
  const offer = tile.querySelector(currentProvider.selectors.offerTitle)?.textContent?.trim();

  const labelParts = [];
  if (merchant) labelParts.push(merchant);
  if (offer) labelParts.push(offer);

  const label = labelParts.length > 0 ? labelParts.join(' – ') : 'Unknown offer';
  return `Offer ${index + 1}/${total}: ${label}`;
}

function sendProgress(current, total, label) {
  chrome.runtime.sendMessage({
    type: 'PROGRESS',
    current,
    total,
    label,
  });

  const provider = currentProvider ? currentProvider.name.toLowerCase() : 'unknown';
  
  chrome.storage.local.set({
    [`autoEnroll_${provider}_Current`]: current,
    [`autoEnroll_${provider}_Total`]: total,
    [`autoEnroll_${provider}_Label`]: label,
    autoEnrollProvider: provider,
  });
}

function getRunningState() {
  return new Promise((resolve) => {
    const provider = currentProvider ? currentProvider.name.toLowerCase() : 'unknown';
    chrome.storage.local.get(`autoEnroll_${provider}_Running`, (result) => {
      resolve(result[`autoEnroll_${provider}_Running`] === true);
    });
  });
}

async function shouldContinue() {
  const provider = currentProvider ? currentProvider.name.toLowerCase() : 'unknown';
  const { [`autoEnroll_${provider}_Running`]: running } = await chrome.storage.local.get(`autoEnroll_${provider}_Running`);
  return running === true;
}

async function autoScrollToLoadAllOffers({ pauseMs = 800, maxRounds = 20 } = {}) {
  if (!currentProvider) return;

  log('Starting auto-scroll to load offers');
  sendProgress(0, 0, 'Loading all offers…');

  let lastCount = 0;

  for (let round = 0; round < maxRounds; round++) {
    if (!(await shouldContinue())) {
      warn('Auto-scroll stopped');
      return;
    }

    const tiles = document.querySelectorAll(currentProvider.selectors.tile);
    const count = tiles.length;

    log(`Scroll round ${round + 1}, tiles: ${count}`);

    if (count === lastCount) {
      log('No new offers loaded, stopping auto-scroll');
      return;
    }

    lastCount = count;
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    await sleep(pauseMs);
  }

  warn('Reached max auto-scroll rounds');
}

// ========================================
// ENROLLMENT FUNCTIONS
// ========================================

// Wait for back button to appear (Chase SPA - in shadow DOM)
function waitForBackButton(timeout = 3000) {
  log('Waiting for back button to appear (checking shadow DOM)');
  return new Promise((resolve) => {
    const start = Date.now();
    
    const interval = setInterval(() => {
      let backButton = null;
      
      // For Chase, use the provider's shadow DOM accessor
      if (currentProvider && currentProvider.getBackButton) {
        backButton = currentProvider.getBackButton();
      } else {
        // Fallback to regular selector
        backButton = document.querySelector(currentProvider.selectors.backButton);
      }
      
      if (backButton) {
        log('Back button found');
        clearInterval(interval);
        resolve(backButton);
      }
      
      if (Date.now() - start > timeout) {
        warn('Timed out waiting for back button');
        clearInterval(interval);
        resolve(null);
      }
    }, 200);
  });
}

// Wait for back button to disappear (returned to listing)
function waitForBackToListing(timeout = 5000) {
  log('Waiting to return to listing page');
  return new Promise((resolve) => {
    const start = Date.now();
    
    const interval = setInterval(() => {
      let backButton = null;
      
      // Check shadow DOM for Chase
      if (currentProvider && currentProvider.getBackButton) {
        backButton = currentProvider.getBackButton();
      } else {
        backButton = document.querySelector(currentProvider.selectors.backButton);
      }
      
      const isOnDetails = currentProvider.isOnDetailsPage();
      
      // If back button gone AND not on details page, we're back to listing
      if (!backButton && !isOnDetails) {
        log('Returned to listing page');
        clearInterval(interval);
        resolve(true);
      }
      
      if (Date.now() - start > timeout) {
        warn('Timed out waiting to return to listing');
        clearInterval(interval);
        resolve(false);
      }
    }, 200);
  });
}

// Click enroll button on details page
async function clickEnrollButton() {
  log('Searching for enroll/activate button');
  
  // Wait a moment for page to settle
  await sleep(500);
  
  const buttons = document.querySelectorAll(currentProvider.selectors.enrollButton);
  
  for (const btn of buttons) {
    const btnText = btn.textContent.trim();
    if (btnText === currentProvider.selectors.enrollButtonText || 
        btnText === 'Enroll in Offer' || 
        btnText === 'Activate' ||
        btnText === 'Add offer' ||
        btnText.toLowerCase().includes('enroll') ||
        btnText.toLowerCase().includes('activate') ||
        btnText.toLowerCase().includes('add')) {
      log(`Enroll button found: "${btnText}", clicking`);
      if (DEBUG) btn.style.outline = '3px solid lime';
      btn.click();
      return true;
    }
  }
  
  warn('Enroll button not found');
  return false;
}

// Navigate back from details page
async function navigateBack() {
  log('Looking for back button (in shadow DOM)');
  
  let backButton = null;
  
  // For Chase, use shadow DOM accessor
  if (currentProvider && currentProvider.getBackButton) {
    backButton = currentProvider.getBackButton();
  } else {
    backButton = document.querySelector(currentProvider.selectors.backButton);
  }
  
  if (backButton) {
    log('Back button found, clicking');
    if (DEBUG) backButton.style.outline = '3px solid orange';
    backButton.click();
    return true;
  } else {
    warn('Back button not found in shadow DOM');
    return false;
  }
}

// Wait for modal to appear (Citi)
function waitForModal(timeout = 5000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const interval = setInterval(() => {
      const modal = document.querySelector(currentProvider.selectors.modal);
      if (modal) {
        log('Modal detected');
        clearInterval(interval);
        resolve(modal);
      }
      if (Date.now() - start > timeout) {
        warn('Timed out waiting for modal');
        clearInterval(interval);
        resolve(null);
      }
    }, 200);
  });
}

function clickEnrollButtonInModal(modal) {
  const buttons = modal.querySelectorAll('button');
  for (const btn of buttons) {
    if (btn.textContent.trim() === 'Enroll in Offer') {
      log('Clicking enroll in modal');
      btn.click();
      return true;
    }
  }
  return false;
}

function closeModal(modal) {
  const closeButton = modal.querySelector(currentProvider.selectors.modalCloseButton);
  if (closeButton) {
    log('Closing modal');
    closeButton.click();
  } else {
    log('Close button not found, trying Escape');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  }
}

// ========================================
// MAIN ENROLLMENT LOGIC
// ========================================

async function processTiles() {
  if (!currentProvider) {
    warn('No provider detected, cannot process tiles');
    sendProgress(0, 0, 'Error: Unsupported website');
    chrome.runtime.sendMessage({ type: 'DONE' });
    return;
  }

  log(`Starting offer enrollment for ${currentProvider.name}`);
  await autoScrollToLoadAllOffers();

  const allTiles = Array.from(document.querySelectorAll(currentProvider.selectors.tile));
  const enrolledCount = allTiles.filter(isAlreadyEnrolled).length;
  const unenrolledTiles = allTiles.filter((tile) => !isAlreadyEnrolled(tile));

  const total = allTiles.length;
  let current = enrolledCount;

  log(`Found ${total} offers (${enrolledCount} already enrolled, ${unenrolledTiles.length} remaining)`);

  sendProgress(current, total, `Already enrolled: ${enrolledCount}/${total}`);

  for (let i = 0; i < unenrolledTiles.length; i++) {
    if (!(await shouldContinue())) {
      log('Stopped by user');
      break;
    }

    let tile = unenrolledTiles[i];
    
    // Check if tile is still in the DOM (might have been re-rendered)
    if (!tile.isConnected) {
      log('Tile was removed from DOM, re-querying tiles...');
      const freshTiles = Array.from(document.querySelectorAll(currentProvider.selectors.tile));
      const freshUnenrolled = freshTiles.filter(t => !isAlreadyEnrolled(t));
      
      if (i < freshUnenrolled.length) {
        tile = freshUnenrolled[i];
        log('Found fresh tile at same index');
      } else {
        warn('Could not find tile at index', i);
        continue;
      }
    }

    // Re-check if enrolled (in case page was updated)
    if (isAlreadyEnrolled(tile)) {
      log(`Skipping already enrolled offer ${i + 1}`);
      continue;
    }

    current++;

    const label = describeTile(tile, current, total);
    log(`\n=== Processing offer ${i + 1}/${unenrolledTiles.length} ===`);
    log(label);
    sendProgress(current, total, label);

    // Scroll tile into view
    tile.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(300);

    log('Clicking tile');
    if (DEBUG) tile.style.outline = '3px solid cyan';
    tile.click();
    
    log('Click executed, waiting for UI change...');

    if (currentProvider.navigationPattern === 'modal') {
      // Citi: Modal-based enrollment
      const modal = await waitForModal();
      if (!(await shouldContinue()) || !modal) break;

      await sleep(500);
      if (!(await shouldContinue())) break;

      clickEnrollButtonInModal(modal);
      await sleep(1200);
      closeModal(modal);
      await sleep(800);
      
    } else if (currentProvider.navigationPattern === 'spa') {
      // Chase: SPA with back button
      
      // Wait for details page to load (back button appears)
      const backButton = await waitForBackButton();
      if (!(await shouldContinue()) || !backButton) {
        warn('Back button did not appear, skipping this offer');
        continue;
      }

      // Click enroll/activate
      await sleep(300); // Reduced from 500ms
      if (!(await shouldContinue())) break;
      
      const enrollClicked = await clickEnrollButton();
      if (!enrollClicked) {
        warn('Failed to click enroll button, trying to go back anyway');
      }

      // Wait for enrollment to process
      await sleep(1500); // Reduced from 2000ms
      if (!(await shouldContinue())) break;

      // Navigate back
      log('Clicking back button');
      const backClicked = await navigateBack();
      if (!backClicked) {
        warn('Failed to click back button, might be stuck');
        break;
      }

      // Wait for return to listing page
      const returnedToListing = await waitForBackToListing(3000); // Reduced from 5000ms
      if (!returnedToListing) {
        warn('Did not return to listing page properly');
        // Try to continue anyway
      }

      // Extra wait to ensure page is stable
      await sleep(500); // Reduced from 1000ms
      log('Back on listing, ready for next offer');
    }
  }

  isRunning = false;
  const provider = currentProvider.name.toLowerCase();
  chrome.storage.local.set({ [`autoEnroll_${provider}_Running`]: false });
  log('Enrollment process complete');
  chrome.runtime.sendMessage({ type: 'DONE' });
}

// ========================================
// MESSAGE HANDLER
// ========================================

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'START_ENROLLING') {
    if (!currentProvider) {
      warn('Cannot start: No supported provider detected');
      chrome.runtime.sendMessage({ 
        type: 'PROGRESS',
        current: 0,
        total: 0,
        label: 'Error: Unsupported website. Please navigate to Citi or Chase offers page.'
      });
      return;
    }

    if (isRunning) {
      warn('Start requested but process already running');
      return;
    }

    log('START_ENROLLING received');
    isRunning = true;
    const provider = currentProvider.name.toLowerCase();
    chrome.storage.local.set({ [`autoEnroll_${provider}_Running`]: true });
    processTiles();
  }

  if (message.action === 'STOP_ENROLLING') {
    log('STOP_ENROLLING received');
    isRunning = false;
    if (currentProvider) {
      const provider = currentProvider.name.toLowerCase();
      chrome.storage.local.set({ [`autoEnroll_${provider}_Running`]: false });
    }
  }
});

log('Content script loaded for', currentProvider?.name || 'unknown provider');