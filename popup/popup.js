document.addEventListener('DOMContentLoaded', () => {
  const summarizeBtn = document.getElementById('summarizeBtn');
  const copyBtn = document.getElementById('copyBtn');
  const resetBtn = document.getElementById('resetBtn');
  const loadingDiv = document.getElementById('loading');
  const resultActions = document.getElementById('result-actions');
  const summaryOutput = document.getElementById('summary-output');
  const readingTimeDiv = document.getElementById('reading-time');
  const pageTitleDiv = document.getElementById('page-title');
  const errorBanner = document.getElementById('error-banner');

  const PLACEHOLDER_HTML = 'Click the button above to generate your 3-point summary!';
  let currentSummary = '';
  let currentTabId = null;
  let currentUrl = null;

  function showError(message) {
    errorBanner.textContent = message;
    errorBanner.classList.remove('hidden');
  }

  function clearError() {
    errorBanner.textContent = '';
    errorBanner.classList.add('hidden');
  }

  function resetPlaceholder() {
    summaryOutput.replaceChildren();
    const p = document.createElement('p');
    p.className = 'placeholder-text';
    p.textContent = PLACEHOLDER_HTML;
    summaryOutput.appendChild(p);
  }

  function renderSummary(markdown) {
    currentSummary = markdown;
    summaryOutput.replaceChildren();

    const lines = markdown.split('\n').map(l => l.trim()).filter(Boolean);
    const ul = document.createElement('ul');
    let hasBullet = false;

    for (const line of lines) {
      const bullet = line.match(/^[-*]\s+(.*)$/);
      if (bullet) {
        const li = document.createElement('li');
        li.textContent = bullet[1];
        ul.appendChild(li);
        hasBullet = true;
      } else {
        const p = document.createElement('p');
        p.textContent = line;
        summaryOutput.appendChild(p);
      }
    }

    if (hasBullet) summaryOutput.appendChild(ul);
  }

  // Send message to content script, injecting it on-demand if not yet loaded
  async function requestPageText(tabId) {
    const send = () => new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, { action: 'GET_TEXT' }, (response) => {
        const err = chrome.runtime.lastError;
        if (err) reject(err);
        else resolve(response);
      });
    });

    try {
      return await send();
    } catch (_) {
      // Content script not yet injected — inject and retry once.
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['scripts/content.js']
      });
      return await send();
    }
  }

  function processSummary(text) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: 'PROCESS_TEXT', text },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!response) {
            reject(new Error('No response from background.'));
            return;
          }
          if (response.error) {
            reject(new Error(response.error));
            return;
          }
          resolve(response.summary);
        }
      );
    });
  }

  function cacheKey(url) {
    return `summary:${url}`;
  }

  async function getCached(url) {
    const key = cacheKey(url);
    const data = await chrome.storage.local.get(key);
    return data[key];
  }

  async function setCached(url, summary) {
    await chrome.storage.local.set({
      [cacheKey(url)]: { summary, ts: Date.now() }
    });
  }

  async function clearCached(url) {
    await chrome.storage.local.remove(cacheKey(url));
  }

  // 1. Initial Page Info Fetch
  (async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    currentTabId = tab.id;
    currentUrl = tab.url;
    pageTitleDiv.textContent = tab.title || '';

    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
      summarizeBtn.disabled = true;
      summarizeBtn.textContent = 'System Page';
      pageTitleDiv.textContent = 'Cannot summarize system pages.';
      return;
    }

    // Show cached summary if present
    try {
      const cached = await getCached(tab.url);
      if (cached && cached.summary) {
        renderSummary(cached.summary);
        resultActions.classList.remove('hidden');
      }
    } catch (_) { /* ignore cache errors */ }

    // Reading time (best-effort)
    try {
      const response = await requestPageText(tab.id);
      if (response && response.text) {
        const words = response.text.trim().split(/\s+/).length;
        const time = Math.max(1, Math.ceil(words / 200));
        readingTimeDiv.textContent = `${time} min read`;
      }
    } catch (_) {
      // silent — reading time is optional
    }
  })();

  // 2. Summarize click
  summarizeBtn.addEventListener('click', async () => {
    clearError();
    summarizeBtn.disabled = true;
    summaryOutput.replaceChildren();
    loadingDiv.classList.remove('hidden');
    resultActions.classList.add('hidden');

    try {
      if (!currentTabId) throw new Error('Active tab not found.');

      // Cache check (avoids duplicate API calls)
      const cached = await getCached(currentUrl);
      if (cached && cached.summary) {
        renderSummary(cached.summary);
        loadingDiv.classList.add('hidden');
        resultActions.classList.remove('hidden');
        summarizeBtn.disabled = false;
        return;
      }

      const extraction = await requestPageText(currentTabId);
      if (!extraction || !extraction.text) {
        throw new Error('No content received. Please refresh and try again.');
      }

      const summary = await processSummary(extraction.text);
      if (!summary) throw new Error('AI returned an empty summary.');

      await setCached(currentUrl, summary);
      renderSummary(summary);
      resultActions.classList.remove('hidden');
    } catch (error) {
      resetPlaceholder();
      showError(error.message || 'Something went wrong.');
    } finally {
      loadingDiv.classList.add('hidden');
      summarizeBtn.disabled = false;
    }
  });

  // 3. Reset button
  resetBtn.addEventListener('click', async () => {
    clearError();
    resultActions.classList.add('hidden');
    summarizeBtn.disabled = false;
    currentSummary = '';
    resetPlaceholder();
    if (currentUrl) {
      try { await clearCached(currentUrl); } catch (_) { /* ignore */ }
    }
  });

  // 4. Copy button
  copyBtn.addEventListener('click', () => {
    if (!currentSummary) return;
    navigator.clipboard.writeText(currentSummary).then(() => {
      const originalText = copyBtn.textContent;
      copyBtn.textContent = 'Copied!';
      setTimeout(() => copyBtn.textContent = originalText, 2000);
    }).catch(() => showError('Could not copy to clipboard.'));
  });
});
