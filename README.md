# Amebo AI: Page Summarizer

**Amebo AI** is a lightweight Chrome Extension (Manifest V3) that delivers structured, high-quality summaries of any webpage. It pairs Groq's `llama-3.3-70b-versatile` model with a secure serverless proxy, so insights arrive in seconds without ever exposing an API key in the browser.

---

## :dart: Key Features
*   **Structured Summaries** — Markdown bullet summary plus a separate **Key Insights** section of non-obvious takeaways.
*   **In-Page Highlight** — Toggleable button that locates verbatim phrases from the summary inside the live page DOM and highlights them.
*   **Smart Extraction** — Prefers `<article>`, falls back to `<main>`, then `document.body`. Long pages are truncated to 50,000 characters with a visible warning.
*   **Reading Time & Word Count** — Estimated read time in the header plus word-count and read-time chips alongside the summary.
*   **Local Caching** — Summaries are cached per-URL in `chrome.storage.local` with a 24-hour TTL and an LRU cap of 30 entries.
*   **On-Demand Content Script Injection** — If the content script isn't already running on the tab, the popup injects it via `chrome.scripting` before requesting text.
*   **Copy to Clipboard** — One click copies the full summary + insights as plain text.
*   **Zero-Config for Reviewers** — Works out-of-the-box via a pre-deployed serverless proxy. No API key required.

---

## :package: Architecture Overview
The extension follows a modular "Relay" architecture to separate concerns and maintain security:

1.  **Popup (UI)** — `popup/popup.{html,js,css}`. Entry point. Coordinates extraction, summarization, caching, rendering, copy, and highlight toggling.
2.  **Content Script (The Eyes)** — `scripts/content.js`. Injected into the page to extract text (`GET_TEXT`), highlight phrases (`HIGHLIGHT`), and clear them (`CLEAR_HIGHLIGHTS`).
3.  **Background Service Worker (The Brain)** — `scripts/background.js`. Listens for `PROCESS_TEXT` messages from the popup and relays the request to the serverless proxy.
4.  **Vercel Proxy (The Vault)** — A serverless Node.js function that securely attaches the Groq API key and returns structured JSON (`summary`, `insights`, `highlights`).

### Message contracts
| From → To | Action | Payload |
|-----------|--------|---------|
| Popup → Content | `GET_TEXT` | — |
| Popup → Content | `HIGHLIGHT` | `{ phrases: string[] }` |
| Popup → Content | `CLEAR_HIGHLIGHTS` | — |
| Popup → Background | `PROCESS_TEXT` | `{ text, length }` |

---

## :brain: AI Integration & Security
### The Proxy Strategy
To comply with the security requirement of **never exposing API keys in the frontend**, this project uses a **Vercel Serverless Function** as a middleman.

*   **Secure API Calls** — The extension calls `/api/summarize` rather than the Groq API directly.
*   **Environment Variables** — `GROQ_API_KEY` is stored in Vercel's environment variables. It is never committed to GitHub or bundled in the extension.
*   **Strict Host Permissions** — `manifest.json` declares the proxy origin in `host_permissions`, so the extension can only talk to that one host.
*   **Zero-Setup for Reviewers** — The proxy accepts requests from any origin; no extension ID configuration needed.

### Model Choice
*   **Model** — `llama-3.3-70b-versatile` via Groq.
*   **Why** — Exceptional speed, large context window, and strong instruction-following for structured-JSON output.

See `API_SETUP.md` for the full request/response contract, prompt, and a drop-in handler reference if you want to fork and deploy your own proxy.

---

## :scales: Trade-offs & Decisions
1.  **Serverless Proxy vs. User-Provided Key** — A proxy gives reviewers a true zero-setup experience while keeping the key server-side. The cost is hosting and a small added latency hop.
2.  **Heuristic Content Extraction vs. Full HTML** — Pulling `innerText` from `<article>`/`<main>` reduces token usage, speeds up the call, and avoids the model getting "distracted" by sidebars, ads, and navigation.
3.  **Structured JSON Response** — The proxy returns `{ summary, insights, highlights }` rather than a single string. This powers the Key Insights section and the in-page highlight feature without a second API call.
4.  **Verbatim Highlights** — The model is prompted to emit phrases copied **verbatim** from the source so the content script can locate them in the DOM. Paraphrased text would never match.
5.  **24-Hour Cache + LRU** — Summaries are cached per-URL with a 24h TTL and capped at 30 entries to keep `chrome.storage.local` lean while avoiding redundant API calls when reopening the popup.
6.  **On-Demand Script Injection** — Content scripts declared in the manifest don't run on tabs that were already open before the extension was installed. The popup falls back to `chrome.scripting.executeScript` to recover gracefully.

---

## :test_tube: Setup & Installation
1.  **Download/Clone** this repository to your local machine.
2.  Open Google Chrome and navigate to `chrome://extensions/`.
3.  Enable **Developer Mode** (top-right toggle).
4.  Click **Load unpacked** and select the project root (the folder containing `manifest.json`).
5.  **Pin** the Amebo AI icon to your toolbar.
6.  Open any article (e.g. NYTimes, Wikipedia) and click **Summarize Page**.

> System pages (`chrome://`, `edge://`, `about:`) cannot be summarized — the popup detects this and disables the button.

### Usage
*   **Summarize Page** — Generates a fresh summary (or returns the cached one if it's under 24h old).
*   **Highlight** — Highlights the model's verbatim phrases in the live page. Click again to clear.
*   **Copy** — Copies the summary + key insights to the clipboard.
*   **Reset** — Clears the rendered summary, removes any highlights, and evicts cached entries for the current URL.

---

## :file_folder: Project Structure
```text
amebo-ai/
├── manifest.json         # MV3 configuration (permissions, host_permissions, scripts)
├── icons/                # 16 / 48 / 128 px extension icons
├── popup/
│   ├── popup.html        # Popup markup
│   ├── popup.js          # UI logic, caching, message dispatch
│   └── popup.css         # Styles
├── scripts/
│   ├── content.js        # DOM extraction + highlight engine
│   └── background.js     # Service worker → proxy relay
├── API_SETUP.md          # Proxy contract & deployment notes (gitignored)
└── README.md             # You are here
```

---

## :gear: Permissions
Declared in `manifest.json`:

| Permission | Why it's needed |
|------------|-----------------|
| `activeTab` | Read the URL/title of the current tab and message its content script |
| `storage` | Cache summaries in `chrome.storage.local` |
| `scripting` | Inject `content.js` on-demand for tabs opened before install |
| `host_permissions: https://ai-summarizer-proxy-ebon.vercel.app/*` | Send text to the serverless proxy |
| `content_scripts: <all_urls>` | Auto-inject the extractor on any page the user summarizes |

---

## :shield: Security Note
*No API keys are included in this repository. All AI processing is handled via the Vercel proxy at <https://ai-summarizer-proxy-ebon.vercel.app/api/summarize>.*
