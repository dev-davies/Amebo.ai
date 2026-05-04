document.addEventListener('DOMContentLoaded', () => {
  console.log('Popup loaded');

  const summarizeBtn = document.getElementById('summarizeBtn');

  summarizeBtn.addEventListener('click', async () => {
    console.log('Summarize button clicked');
    
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        console.error('No active tab found');
        return;
      }

      chrome.tabs.sendMessage(tab.id, { action: 'GET_TEXT' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error sending message:', chrome.runtime.lastError.message);
          alert('Could not extract text. Make sure you are on a web page and refresh it if you just installed the extension.');
          return;
        }

        if (response) {
          console.log('Extracted Title:', response.title);
          console.log('Extracted Text:', response.text);
        }
      });
    } catch (error) {
      console.error('An error occurred:', error);
    }
  });
});
