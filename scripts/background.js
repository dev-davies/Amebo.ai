const ENDPOINT = 'https://ai-summarizer-proxy-alpha.vercel.app/api/summarize';
const CHUNK_CHARS = 12000;
const MAX_CHUNKS = 8;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'PROCESS_TEXT') {
    summarizeText(request.text, request.length || '5')
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ error: error.message }));

    return true; // keep channel open for async response
  }
});

async function callProxy(text, length) {
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
  return {
    summary: typeof data.summary === 'string' ? data.summary : '',
    insights: Array.isArray(data.insights) ? data.insights : [],
    highlights: Array.isArray(data.highlights) ? data.highlights : []
  };
}

function chunkText(text, size) {
  const chunks = [];
  let i = 0;
  while (i < text.length && chunks.length < MAX_CHUNKS) {
    let end = Math.min(i + size, text.length);
    if (end < text.length) {
      const slice = text.slice(i, end);
      const lastEnd = Math.max(
        slice.lastIndexOf('. '),
        slice.lastIndexOf('! '),
        slice.lastIndexOf('? ')
      );
      if (lastEnd > size * 0.6) end = i + lastEnd + 1;
    }
    chunks.push(text.slice(i, end).trim());
    i = end;
  }
  return chunks;
}

function dedupeStrings(arr) {
  const seen = new Set();
  const out = [];
  for (const s of arr) {
    const key = String(s).toLowerCase().replace(/\s+/g, ' ').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

async function summarizeText(text, length) {
  if (!text || !text.trim()) {
    throw new Error('No text to summarize.');
  }

  if (text.length <= CHUNK_CHARS) {
    return callProxy(text, length);
  }

  const chunks = chunkText(text, CHUNK_CHARS);
  const partials = await Promise.all(chunks.map(c => callProxy(c, length)));

  const summaryParts = partials.map(p => p.summary).filter(Boolean);
  const allInsights = dedupeStrings(partials.flatMap(p => p.insights));
  const allHighlights = dedupeStrings(partials.flatMap(p => p.highlights));

  if (!summaryParts.length) {
    throw new Error('AI returned an empty summary.');
  }

  const merged = await callProxy(summaryParts.join('\n\n'), length).catch(() => null);
  if (merged && merged.summary) {
    return {
      summary: merged.summary,
      insights: dedupeStrings([...(merged.insights || []), ...allInsights]).slice(0, 8),
      highlights: dedupeStrings([...(merged.highlights || []), ...allHighlights]).slice(0, 12)
    };
  }

  return {
    summary: summaryParts.join('\n\n'),
    insights: allInsights.slice(0, 8),
    highlights: allHighlights.slice(0, 12)
  };
}
