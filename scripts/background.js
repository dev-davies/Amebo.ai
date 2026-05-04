chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'PROCESS_TEXT') {
    console.log('Background script processing text with Vercel AI Proxy...');

    summarizeText(request.text)
      .then(summary => sendResponse({ summary }))
      .catch(error => sendResponse({ error: error.message }));

    return true; // Keep the message channel open for async response
  }
});

async function summarizeText(text) {
  const ENDPOINT = 'https://ai-summarizer-proxy-ebon.vercel.app/api/summarize';

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Proxy API Error:', errorData);

      if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please try again in a moment.');
      } else {
        throw new Error(errorData.error || `Proxy request failed with status ${response.status}`);
      }
    }

    const data = await response.json();
    return data.summary;

  } catch (error) {
    console.error('Fetch Error:', error);
    throw error;
  }
}
