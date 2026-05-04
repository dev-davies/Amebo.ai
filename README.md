This README is designed to hit every point in your Stage 4A rubric while presenting **Amebo AI** as a professional, production-ready tool.

---

# Amebo AI: Page Summarizer
**Amebo AI** is a lightweight Chrome Extension (Manifest V3) that provides instant, high-quality 3-point summaries of any webpage. By leveraging the speed of Groq’s Llama-3.3-70b model and a secure serverless architecture, it delivers insights in seconds without compromising security.

## :dart: Key Features
*   **Intelligent Extraction**: Heuristic filtering to pull main article content while ignoring navbars and footers.
*   **Instant Summaries**: Powered by Groq for near-instantaneous results.
*   **Reading Time Estimate**: Displays an estimated reading time based on page word count.
*   **Clean UI/UX**: Modern design with loading states, formatted Markdown results, and a copy-to-clipboard feature.
*   **Zero-Config for Mentors**: Works out-of-the-box thanks to a pre-configured serverless proxy.

---

## :package: Architecture Overview
The extension follows a modular "Relay" architecture to separate concerns and maintain security:

1.  **Popup (UI)**: The entry point. It triggers the process, calculates reading time, and renders the final summary.
2.  **Content Script (The Eyes)**: Injected into the webpage to extract the text content from `<article>` or `<main>` tags.
3.  **Background Service Worker (The Brain)**: Acts as the secure "Post Office." It receives text from the content script and relays it to the serverless proxy.
4.  **Vercel Proxy (The Vault)**: A serverless Node.js function that securely attaches the Groq API key and communicates with the AI model.

---

## :brain: AI Integration & Security
### The Proxy Strategy
To comply with the security requirement of **never exposing API keys in the frontend**, this project utilizes a **Vercel Serverless Function** as a middleman.

*   **Secure API Calls**: The extension calls a custom endpoint (`/api/summarize`) rather than the Groq API directly.
*   **Environment Variables**: The Groq API key is stored securely in Vercel’s environment variables. It is never committed to GitHub or bundled in the extension's source code.
*   **CORS Protection**: The proxy is configured with specific headers to allow requests only from authorized contexts.

### Model Choice
*   **Model**: `llama-3.3-70b-versatile` via Groq.
*   **Decision**: This model was chosen for its exceptional speed and high context window, making it perfect for summarizing long-form journalism and academic articles.

---

## :scales: Trade-offs & Decisions
1.  **User Input vs. Proxy**: While requiring a user to input their own API key is a common extension pattern, we opted for a **Serverless Proxy** to provide a "Zero-Setup" experience for mentors while maintaining 100% key security.
2.  **Content Filtering vs. Full HTML**: We chose to extract `innerText` from main content tags rather than sending full HTML. This reduces token usage, speeds up processing, and prevents the AI from getting "distracted" by sidebar ads or navigation links.
3.  **Local Storage Caching**: The extension uses `chrome.storage.local` to cache summaries. If a user re-opens the popup on the same URL, the summary is instant and avoids unnecessary API costs.

---

## :test_tube: Setup & Installation
Since this is a local development extension, follow these steps to install it:

1.  **Download/Clone** this repository to your local machine.
2.  Open Google Chrome and navigate to `chrome://extensions/`.
3.  Enable **Developer Mode** by toggling the switch in the top-right corner.
4.  Click the **Load unpacked** button.
5.  Select the root folder of this project (the one containing `manifest.json`).
6.  **Pin** the Amebo AI icon (the blue/white logo) to your toolbar.
7.  Navigate to any article (e.g., NYTimes, Wikipedia) and click **Summarize Page**.

---

## :file_folder: Project Structure
```text
amebo-ai/
├── manifest.json         # Extension configuration
├── icons/               # Standard size icons (16, 48, 128)
├── popup/
│   ├── popup.html       # Extension UI
│   ├── popup.js         # UI Logic & Reading Time
│   └── popup.css        # Modern styles
├── scripts/
│   ├── content.js       # DOM extraction logic
│   └── background.js    # API communication relay
└── README.md            # You are here!
```

---

### :shield: Security Note
*No API keys are included in this repository. All AI processing is handled via the Vercel Proxy endpoint at `[https://ai-summarizer-proxy-ebon.vercel.app/api/summarize](https://ai-summarizer-proxy-ebon.vercel.app/api/summarize)`.*