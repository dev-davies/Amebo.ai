document.addEventListener('DOMContentLoaded', () => {
  console.log('Popup loaded');

  const summarizeBtn = document.getElementById('summarizeBtn');
  const loadingDiv = document.getElementById('loading');
  const summaryOutput = document.getElementById('summary-output');

  summarizeBtn.addEventListener('click', async () => {
    console.log('Summarize button clicked');
    
    // UI state: Show loading, hide button and previous output
    summarizeBtn.classList.add('hidden');
    summaryOutput.classList.add('hidden');
    loadingDiv.classList.remove('hidden');
    
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        throw new Error('No active tab found');
      }

      // 1. Get text from Content Script
      chrome.tabs.sendMessage(tab.id, { action: 'GET_TEXT' }, (extractionResponse) => {
        if (chrome.runtime.lastError) {
          handleError('Could not extract text. Refresh the page and try again.');
          return;
        }

        if (extractionResponse && extractionResponse.text) {
          console.log('Text extracted, sending to background...');
          
          // 2. Send text to Background Script for processing
          chrome.runtime.sendMessage(
            { action: 'PROCESS_TEXT', text: extractionResponse.text },
            (processingResponse) => {
              if (chrome.runtime.lastError) {
                handleError('AI processing failed. Please try again.');
                return;
              }

              // 3. Display the result
              if (processingResponse && processingResponse.summary) {
                showSummary(processingResponse.summary);
              }
            }
          );
        } else {
          handleError('No readable content found on this page.');
        }
      });
    } catch (error) {
      handleError(error.message);
    }
  });

  function showSummary(summary) {
    loadingDiv.classList.add('hidden');
    summarizeBtn.classList.remove('hidden');
    summaryOutput.textContent = summary;
    summaryOutput.classList.remove('hidden');
  }

  function handleError(message) {
    console.error(message);
    loadingDiv.classList.add('hidden');
    summarizeBtn.classList.remove('hidden');
    alert(message);
  }
});
