chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'PROGRESS' || message.type === 'DONE') {
    chrome.storage.local.set(message);
  }
});
