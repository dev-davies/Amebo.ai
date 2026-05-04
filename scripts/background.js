chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'PROCESS_TEXT') {
    summarizeText(request.text, request.length || '5')
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ error: error.message }));

    return true; // keep channel open for async response
  }
});

async function summarizeText(text, length) {
  const ENDPOINT = 'https://ai-summarizer-proxy-ebon.vercel.app/api/summarize';

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, length })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    if (response.status === 429) {
      throw new Error('Rate limit exceeded. Please try again in a moment.');
    }
    throw new Error(errorData.error || `Proxy request failed (${response.status}).`);
  }

  const data = await response.json();
  // Normalize: proxy may return { summary } or { summary, insights, highlights }
  return {
    summary: data.summary || '',
    insights: Array.isArray(data.insights) ? data.insights : [],
    highlights: Array.isArray(data.highlights) ? data.highlights : []
  };
}
