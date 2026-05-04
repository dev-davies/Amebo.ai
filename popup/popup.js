document.addEventListener('DOMContentLoaded', () => {
  const summarizeBtn = document.getElementById('summarizeBtn');
  const copyBtn = document.getElementById('copyBtn');
  const resetBtn = document.getElementById('resetBtn');
  const highlightBtn = document.getElementById('highlightBtn');
  const lengthSelect = document.getElementById('lengthSelect');
  const loadingDiv = document.getElementById('loading');
  const resultActions = document.getElementById('result-actions');
  const resultMeta = document.getElementById('result-meta');
  const wordCountEl = document.getElementById('word-count');
  const readingTimeBodyEl = document.getElementById('reading-time-body');
  const summaryOutput = document.getElementById('summary-output');
  const readingTimeDiv = document.getElementById('reading-time');
  const pageTitleDiv = document.getElementById('page-title');
  const errorBanner = document.getElementById('error-banner');
  const warningBanner = document.getElementById('warning-banner');

  const PLACEHOLDER_TEXT = 'Click the button above to generate your summary!';
  const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
  const MAX_CACHE_ENTRIES = 30;
  let currentPayload = null; // { summary, insights, highlights, words }
  let currentTabId = null;
  let currentUrl = null;
  let highlighted = false;

  function showError(message) {
    errorBanner.textContent = message;
    errorBanner.classList.remove('hidden');
  }
  function clearError() {
    errorBanner.textContent = '';
    errorBanner.classList.add('hidden');
  }
  function showWarning(message) {
    warningBanner.textContent = message;
    warningBanner.classList.remove('hidden');
  }
  function clearWarning() {
    warningBanner.textContent = '';
    warningBanner.classList.add('hidden');
  }

  function resetPlaceholder() {
    summaryOutput.replaceChildren();
    const p = document.createElement('p');
    p.className = 'placeholder-text';
    p.textContent = PLACEHOLDER_TEXT;
    summaryOutput.appendChild(p);
  }

  function appendSection(title, items) {
    if (!items || !items.length) return;
    const h = document.createElement('div');
    h.className = 'section-heading';
    h.textContent = title;
    summaryOutput.appendChild(h);
    const ul = document.createElement('ul');
    for (const item of items) {
      const li = document.createElement('li');
      li.textContent = item;
      ul.appendChild(li);
    }
    summaryOutput.appendChild(ul);
  }

  function parseBullets(markdown) {
    return markdown
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .map(l => l.match(/^[-*]\s+(.*)$/))
      .filter(Boolean)
      .map(m => m[1]);
  }

  function renderPayload(payload) {
    summaryOutput.replaceChildren();

    const bullets = payload.summary ? parseBullets(payload.summary) : [];
    if (bullets.length) {
      appendSection('Summary', bullets);
    } else if (payload.summary) {
      const p = document.createElement('p');
      p.textContent = payload.summary;
      summaryOutput.appendChild(p);
    }

    appendSection('Key Insights', payload.insights);
  }

  function updateMeta(words) {
    if (!words) {
      resultMeta.classList.add('hidden');
      return;
    }
    const minutes = Math.max(1, Math.ceil(words / 200));
    wordCountEl.textContent = `${words.toLocaleString()} words`;
    readingTimeBodyEl.textContent = `${minutes} min read`;
    resultMeta.classList.remove('hidden');
  }

  // Send message to content script, injecting it on-demand if needed
  async function sendToContent(tabId, message) {
    const send = () => new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        const err = chrome.runtime.lastError;
        if (err) reject(err);
        else resolve(response);
      });
    });

    try {
      return await send();
    } catch (_) {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['scripts/content.js']
      });
      return await send();
    }
  }

  function processSummary(text, length) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'PROCESS_TEXT', text, length }, (response) => {
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
        resolve(response);
      });
    });
  }

  const cacheKey = (url, length) => `summary:${length}:${url}`;

  async function getCached(url, length) {
    const key = cacheKey(url, length);
    const data = await chrome.storage.local.get(key);
    const entry = data[key];
    if (!entry) return null;
    if (entry.ts && Date.now() - entry.ts > CACHE_TTL_MS) {
      await chrome.storage.local.remove(key);
      return null;
    }
    return entry;
  }

  async function evictIfNeeded() {
    const all = await chrome.storage.local.get(null);
    const entries = Object.entries(all).filter(([k]) => k.startsWith('summary:'));
    if (entries.length <= MAX_CACHE_ENTRIES) return;
    entries.sort((a, b) => (a[1]?.ts || 0) - (b[1]?.ts || 0));
    const toRemove = entries.slice(0, entries.length - MAX_CACHE_ENTRIES).map(([k]) => k);
    if (toRemove.length) await chrome.storage.local.remove(toRemove);
  }

  async function setCached(url, length, payload) {
    await chrome.storage.local.set({
      [cacheKey(url, length)]: { ...payload, ts: Date.now() }
    });
    await evictIfNeeded();
  }

  async function clearCachedAll(url) {
    const all = await chrome.storage.local.get(null);
    const toRemove = Object.keys(all).filter(k => k.startsWith('summary:') && k.endsWith(`:${url}`));
    if (toRemove.length) await chrome.storage.local.remove(toRemove);
  }

  // Init
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

    // Reading time + word count (best-effort)
    try {
      const response = await sendToContent(tab.id, { action: 'GET_TEXT' });
      if (response && response.text) {
        const words = response.text.trim().split(/\s+/).length;
        const time = Math.max(1, Math.ceil(words / 200));
        readingTimeDiv.textContent = `${time} min read`;
      }
    } catch (_) { /* silent */ }

    // Show cached summary for current length if present
    try {
      const cached = await getCached(tab.url, lengthSelect.value);
      if (cached && cached.summary) {
        currentPayload = cached;
        renderPayload(cached);
        updateMeta(cached.words);
        resultActions.classList.remove('hidden');
      }
    } catch (_) { /* ignore */ }
  })();

  // Re-render from cache when length changes
  lengthSelect.addEventListener('change', async () => {
    if (!currentUrl) return;
    try {
      const cached = await getCached(currentUrl, lengthSelect.value);
      if (cached && cached.summary) {
        currentPayload = cached;
        renderPayload(cached);
        updateMeta(cached.words);
        resultActions.classList.remove('hidden');
      } else {
        currentPayload = null;
        resetPlaceholder();
        resultActions.classList.add('hidden');
        resultMeta.classList.add('hidden');
      }
    } catch (_) { /* ignore */ }
  });

  // Summarize
  summarizeBtn.addEventListener('click', async () => {
    clearError();
    clearWarning();
    summarizeBtn.disabled = true;
    summaryOutput.replaceChildren();
    loadingDiv.classList.remove('hidden');
    resultActions.classList.add('hidden');
    resultMeta.classList.add('hidden');

    const length = lengthSelect.value;

    try {
      if (!currentTabId) throw new Error('Active tab not found.');

      const cached = await getCached(currentUrl, length);
      if (cached && cached.summary) {
        currentPayload = cached;
        renderPayload(cached);
        updateMeta(cached.words);
        resultActions.classList.remove('hidden');
        return;
      }

      const extraction = await sendToContent(currentTabId, { action: 'GET_TEXT' });
      if (!extraction || !extraction.text) {
        throw new Error('No content received. Please refresh and try again.');
      }

      if (extraction.truncated) {
        const original = extraction.originalLength || 0;
        showWarning(`Page is long (${original.toLocaleString()} chars) — only the first 10,000 were sent for summarization.`);
      }

      const words = extraction.text.trim().split(/\s+/).length;
      const result = await processSummary(extraction.text, length);
      if (!result || !result.summary) throw new Error('AI returned an empty summary.');

      const payload = {
        summary: result.summary,
        insights: result.insights || [],
        highlights: result.highlights || [],
        words
      };
      currentPayload = payload;
      await setCached(currentUrl, length, payload);
      renderPayload(payload);
      updateMeta(words);
      resultActions.classList.remove('hidden');
    } catch (error) {
      resetPlaceholder();
      showError(error.message || 'Something went wrong.');
    } finally {
      loadingDiv.classList.add('hidden');
      summarizeBtn.disabled = false;
    }
  });

  // Reset
  resetBtn.addEventListener('click', async () => {
    clearError();
    clearWarning();
    resultActions.classList.add('hidden');
    resultMeta.classList.add('hidden');
    summarizeBtn.disabled = false;
    currentPayload = null;
    resetPlaceholder();
    if (currentTabId && highlighted) {
      try { await sendToContent(currentTabId, { action: 'CLEAR_HIGHLIGHTS' }); } catch (_) {}
      highlighted = false;
      highlightBtn.textContent = 'Highlight';
    }
    if (currentUrl) {
      try { await clearCachedAll(currentUrl); } catch (_) {}
    }
  });

  // Copy — flatten payload to readable text
  copyBtn.addEventListener('click', () => {
    if (!currentPayload) return;
    const parts = [];
    if (currentPayload.summary) parts.push(currentPayload.summary);
    if (currentPayload.insights && currentPayload.insights.length) {
      parts.push('Key Insights:');
      parts.push(currentPayload.insights.map(i => `- ${i}`).join('\n'));
    }
    const text = parts.join('\n\n');
    navigator.clipboard.writeText(text).then(() => {
      const original = copyBtn.textContent;
      copyBtn.textContent = 'Copied!';
      setTimeout(() => copyBtn.textContent = original, 2000);
    }).catch(() => showError('Could not copy to clipboard.'));
  });

  // Highlight — toggle
  highlightBtn.addEventListener('click', async () => {
    if (!currentTabId || !currentPayload) return;
    try {
      if (highlighted) {
        await sendToContent(currentTabId, { action: 'CLEAR_HIGHLIGHTS' });
        highlighted = false;
        highlightBtn.textContent = 'Highlight';
        return;
      }
      const phrases = (currentPayload.highlights && currentPayload.highlights.length)
        ? currentPayload.highlights
        : (currentPayload.insights || []);
      if (!phrases.length) {
        showError('No highlight phrases available for this summary.');
        return;
      }
      const res = await sendToContent(currentTabId, { action: 'HIGHLIGHT', phrases });
      if (res && res.ok) {
        highlighted = true;
        highlightBtn.textContent = 'Clear';
      } else {
        showError('Could not highlight on this page.');
      }
    } catch (e) {
      showError(e.message || 'Highlight failed.');
    }
  });
});
