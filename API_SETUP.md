# API Setup — Vercel Proxy Updates

This document describes the changes needed in the Vercel serverless proxy at `https://ai-summarizer-proxy-ebon.vercel.app/api/summarize` to support the new structured-response, length-toggle, and in-page highlighting features in the Amebo AI extension.

---

## Summary of changes

| # | Change | Why |
|---|--------|-----|
| 1 | Accept a `length` field in the request body | Powers the "3 bullets / 5 bullets / Detailed" toggle |
| 2 | Return structured JSON: `{ summary, insights, highlights }` | Powers the Key Insights section and the Highlight button |
| 3 | Lock CORS to the extension's origin | Prevents arbitrary websites from abusing the proxy |
| 4 | Bump the prompt to demand verbatim highlight phrases | The content script can only highlight strings that exist in the page text |

---

## 1. Request shape

**Old**
```json
{ "text": "..." }
```

**New**
```json
{ "text": "...", "length": "3" | "5" | "detailed" }
```

Default `length` to `"5"` if missing.

```js
const { text, length = '5' } = req.body;
```

---

## 2. Response shape

**Old**
```json
{ "summary": "- bullet one\n- bullet two\n- bullet three" }
```

**New**
```json
{
  "summary": "- bullet one\n- bullet two\n- bullet three",
  "insights": [
    "Non-obvious takeaway one.",
    "Non-obvious takeaway two.",
    "Non-obvious takeaway three."
  ],
  "highlights": [
    "exact verbatim phrase copied from the article",
    "another exact phrase that exists on the page",
    "third phrase exactly as written in source"
  ]
}
```

Field rules:
- **`summary`** — markdown bullets, one per line, each starting with `- `.
- **`insights`** — 3 short, non-obvious takeaways (max ~15 words each).
- **`highlights`** — 3–5 phrases copied **verbatim** from the article (5–12 words each). The extension matches these against the page DOM, so any deviation (rewording, paraphrasing, added punctuation) means nothing gets highlighted.

---

## 3. Prompt update

Use a system prompt that forces JSON output and enforces the verbatim rule. Use `response_format: { type: 'json_object' }` for reliability.

```js
const lengthInstruction =
  length === '3'      ? 'exactly 3 bullets'
  : length === 'detailed' ? '6-8 bullets with more detail'
                          : 'exactly 5 bullets';

const systemPrompt = `You summarize web articles. Respond ONLY with valid JSON matching this shape:
{
  "summary": "markdown bullets, each starting with '- '",
  "insights": ["short insight 1", "short insight 2", "short insight 3"],
  "highlights": ["verbatim phrase from text", "another verbatim phrase"]
}
Rules:
- "summary": ${lengthInstruction}, each bullet on its own line starting with "- ".
- "insights": 3 short non-obvious takeaways, max ~15 words each.
- "highlights": 3-5 phrases copied VERBATIM from the article (5-12 words each). They MUST match the source text exactly so they can be located on the page. Do NOT paraphrase.
No prose outside the JSON.`;
```

---

## 4. Full handler reference

Drop-in replacement for `/api/summarize.js`:

```js
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const ALLOWED_ORIGINS = [
  // Replace with your real extension ID — find it at chrome://extensions
  'chrome-extension://YOUR_EXTENSION_ID_HERE'
];

function applyCors(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  applyCors(req, res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const origin = req.headers.origin || '';
  if (!ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).json({ error: 'Forbidden origin' });
  }

  try {
    const { text, length = '5' } = req.body || {};
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Missing "text" field.' });
    }

    const lengthInstruction =
      length === '3'      ? 'exactly 3 bullets'
      : length === 'detailed' ? '6-8 bullets with more detail'
                              : 'exactly 5 bullets';

    const systemPrompt = `You summarize web articles. Respond ONLY with valid JSON matching this shape:
{
  "summary": "markdown bullets, each starting with '- '",
  "insights": ["short insight 1", "short insight 2", "short insight 3"],
  "highlights": ["verbatim phrase from text", "another verbatim phrase"]
}
Rules:
- "summary": ${lengthInstruction}, each bullet on its own line starting with "- ".
- "insights": 3 short non-obvious takeaways, max ~15 words each.
- "highlights": 3-5 phrases copied VERBATIM from the article (5-12 words each). They MUST match the source text exactly so they can be located on the page. Do NOT paraphrase.
No prose outside the JSON.`;

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: text.slice(0, 10000) }
      ]
    });

    let parsed = {};
    try {
      parsed = JSON.parse(completion.choices[0].message.content);
    } catch {
      return res.status(502).json({ error: 'AI returned invalid JSON.' });
    }

    return res.status(200).json({
      summary:    typeof parsed.summary === 'string' ? parsed.summary : '',
      insights:   Array.isArray(parsed.insights) ? parsed.insights.slice(0, 5) : [],
      highlights: Array.isArray(parsed.highlights) ? parsed.highlights.slice(0, 5) : []
    });
  } catch (err) {
    console.error('Summarize handler error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
```

---

## 5. Environment variables (Vercel)

Confirm these are set in **Vercel → Project → Settings → Environment Variables**:

| Name | Value |
|------|-------|
| `GROQ_API_KEY` | Your Groq API key (Server-only, never exposed) |

Redeploy the project after editing.

---

## 6. Finding your Chrome Extension ID

The CORS allowlist needs your extension's runtime ID:

1. Open `chrome://extensions`.
2. Toggle **Developer mode** (top-right).
3. Find **Amebo AI** in the list — copy the ID under the name (a 32-char string like `abcdefghijklmnopabcdefghijklmnop`).
4. Paste it into `ALLOWED_ORIGINS` as `chrome-extension://<id>`.

> Loading the unpacked extension from a different folder generates a different ID. If you re-clone the repo elsewhere, update the allowlist.

---

## 7. Quick test

After deploying:

```bash
curl -X POST https://ai-summarizer-proxy-ebon.vercel.app/api/summarize \
  -H "Content-Type: application/json" \
  -H "Origin: chrome-extension://YOUR_EXTENSION_ID_HERE" \
  -d '{"text":"Lorem ipsum dolor sit amet ...","length":"3"}'
```

Expected: HTTP 200 with `{ summary, insights, highlights }`. Without the matching `Origin` header, expect HTTP 403.

---

## 7b. Verifying CORS is actually enforced

The README claims CORS is locked down. Confirm it from a terminal:

```bash
# Request WITHOUT a matching Origin header → should be 403
curl -i -X POST https://ai-summarizer-proxy-ebon.vercel.app/api/summarize \
  -H "Content-Type: application/json" \
  -H "Origin: https://example.com" \
  -d '{"text":"hello world"}'

# Request WITH the extension's Origin → should be 200
curl -i -X POST https://ai-summarizer-proxy-ebon.vercel.app/api/summarize \
  -H "Content-Type: application/json" \
  -H "Origin: chrome-extension://YOUR_EXTENSION_ID_HERE" \
  -d '{"text":"hello world","length":"3"}'
```

If both return 200, your proxy is **not** enforcing the allowlist — anyone can drain your Groq quota. Re-check that the handler short-circuits with `403` when `req.headers.origin` is not in `ALLOWED_ORIGINS` (see §4).

> Browsers send an `Origin` header automatically; `curl` only sends it when you pass `-H "Origin: ..."`. So a 200 response from a `curl` call **without** `-H "Origin: ..."` is also a sign the proxy isn't checking.

---

## 8. Backwards compatibility

The extension is defensive — if any of these fields are missing it falls back gracefully:

| Missing field | Behavior |
|---------------|----------|
| `insights` | "Key Insights" section is hidden |
| `highlights` | Highlight button shows "No highlight phrases available" (or falls back to using `insights` as phrases) |
| `length` ignored by proxy | Still works, length toggle just produces the same default |

So you can ship the API change incrementally without breaking the popup.
