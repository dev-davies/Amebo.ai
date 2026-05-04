const HIGHLIGHT_CLASS = 'amebo-ai-highlight';
const HIGHLIGHT_STYLE_ID = 'amebo-ai-highlight-style';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'GET_TEXT') {
    const pageTitle = document.title;
    let content = '';

    const article = document.querySelector('article');
    const main = document.querySelector('main');

    if (article) {
      content = article.innerText;
    } else if (main) {
      content = main.innerText;
    } else {
      content = document.body.innerText;
    }

    const cleanedText = content.replace(/\s+/g, ' ').trim().substring(0, 10000);

    sendResponse({ text: cleanedText, title: pageTitle });
    return;
  }

  if (request.action === 'HIGHLIGHT') {
    try {
      clearHighlights();
      injectHighlightStyle();
      const phrases = Array.isArray(request.phrases) ? request.phrases : [];
      let count = 0;
      for (const phrase of phrases) {
        if (typeof phrase === 'string' && phrase.trim().length > 3) {
          count += highlightPhrase(phrase.trim());
        }
      }
      sendResponse({ ok: true, count });
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
    return;
  }

  if (request.action === 'CLEAR_HIGHLIGHTS') {
    clearHighlights();
    sendResponse({ ok: true });
    return;
  }
});

function injectHighlightStyle() {
  if (document.getElementById(HIGHLIGHT_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = HIGHLIGHT_STYLE_ID;
  style.textContent = `.${HIGHLIGHT_CLASS}{background:#fff3a3;color:inherit;padding:0 2px;border-radius:2px;}`;
  document.head.appendChild(style);
}

function clearHighlights() {
  const marks = document.querySelectorAll(`mark.${HIGHLIGHT_CLASS}`);
  marks.forEach(mark => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  });
}

function highlightPhrase(phrase) {
  const root = document.querySelector('article') || document.querySelector('main') || document.body;
  if (!root) return 0;

  const needle = phrase.toLowerCase();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const p = node.parentNode;
      if (!p) return NodeFilter.FILTER_REJECT;
      const tag = p.nodeName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return NodeFilter.FILTER_REJECT;
      if (p.classList && p.classList.contains(HIGHLIGHT_CLASS)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const targets = [];
  let n;
  while ((n = walker.nextNode())) {
    const idx = n.nodeValue.toLowerCase().indexOf(needle);
    if (idx !== -1) targets.push({ node: n, idx });
  }

  let hits = 0;
  for (const { node, idx } of targets) {
    const value = node.nodeValue;
    const before = value.slice(0, idx);
    const match = value.slice(idx, idx + phrase.length);
    const after = value.slice(idx + phrase.length);
    const mark = document.createElement('mark');
    mark.className = HIGHLIGHT_CLASS;
    mark.textContent = match;
    const parent = node.parentNode;
    if (!parent) continue;
    if (before) parent.insertBefore(document.createTextNode(before), node);
    parent.insertBefore(mark, node);
    if (after) parent.insertBefore(document.createTextNode(after), node);
    parent.removeChild(node);
    hits++;
  }
  return hits;
}
