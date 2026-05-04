document.addEventListener('DOMContentLoaded', () => {
  const summarizeBtn = document.getElementById('summarizeBtn');
  const copyBtn = document.getElementById('copyBtn');
  const resetBtn = document.getElementById('resetBtn');
  const loadingDiv = document.getElementById('loading');
  const initialState = document.getElementById('initial-state');
  const resultState = document.getElementById('result-state');
  const summaryOutput = document.getElementById('summary-output');
  const readingTimeDiv = document.getElementById('reading-time');
  const pageTitleDiv = document.getElementById('page-title');

  let currentSummary = '';

  // 1. Initial Page Info Fetch
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (tab) {
      pageTitleDiv.textContent = tab.title;
      // Request text just to calculate reading time initially
      chrome.tabs.sendMessage(tab.id, { action: 'GET_TEXT' }, (response) => {
        if (response && response.text) {
          const words = response.text.trim().split(/\s+/).length;
          const time = Math.ceil(words / 200);
          readingTimeDiv.textContent = `${time} min read`;
        }
      });
    }
  });

  // 2. Summarize Click
  summarizeBtn.addEventListener('click', async () => {
    initialState.classList.add('hidden');
    loadingDiv.classList.remove('hidden');
    summarizeBtn.disabled = true;

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) throw new Error('Active tab not found');

      chrome.tabs.sendMessage(tab.id, { action: 'GET_TEXT' }, (extractionResponse) => {
        if (chrome.runtime.lastError || !extractionResponse) {
          handleError('Could not read page content. Please refresh the page.');
          return;
        }

        chrome.runtime.sendMessage(
          { action: 'PROCESS_TEXT', text: extractionResponse.text },
          (processingResponse) => {
            if (chrome.runtime.lastError || processingResponse.error) {
              handleError(processingResponse?.error || 'AI request failed.');
              return;
            }

            if (processingResponse && processingResponse.summary) {
              displaySummary(processingResponse.summary);
            }
          }
        );
      });
    } catch (error) {
      handleError(error.message);
    }
  });

  // 3. Reset Button
  resetBtn.addEventListener('click', () => {
    resultState.classList.add('hidden');
    initialState.classList.remove('hidden');
    summarizeBtn.disabled = false;
    summaryOutput.innerHTML = '';
    currentSummary = '';
  });

  // 4. Copy Button
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(currentSummary).then(() => {
      const originalText = copyBtn.textContent;
      copyBtn.textContent = 'Copied!';
      setTimeout(() => copyBtn.textContent = originalText, 2000);
    });
  });

  function displaySummary(markdown) {
    currentSummary = markdown;
    loadingDiv.classList.add('hidden');
    resultState.classList.remove('hidden');
    
    // Simple Markdown to HTML converter for bullet points
    // Replaces lines starting with - or * with <li> tags wrapped in <ul>
    const htmlContent = markdown
      .replace(/^\s*[-*]\s+(.*)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    
    summaryOutput.innerHTML = htmlContent;
  }

  function handleError(message) {
    loadingDiv.classList.add('hidden');
    initialState.classList.remove('hidden');
    summarizeBtn.disabled = false;
    alert(message);
  }
});
