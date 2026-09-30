const send = config => window.postMessage({ type: 'mask2ai-config', config }, '*');
chrome.storage.sync.get('config', ({ config }) => send(config || {}));
chrome.storage.onChanged.addListener(changes => { if (changes.config) send(changes.config.newValue || {}); });