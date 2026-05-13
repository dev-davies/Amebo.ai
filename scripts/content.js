const HIGHLIGHT_CLASS = 'amebo-ai-highlight';
const HIGHLIGHT_STYLE_ID = 'amebo-ai-highlight-style';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'GET_TEXT') {
    const pageTitle = document.title;
    const content = extractMainContent();

    const MAX_CHARS = 200000;
    const normalized = content.replace(/\s+/g, ' ').trim();
    const truncated = normalized.length > MAX_CHARS;
    const cleanedText = truncated ? truncateAtSentence(normalized, MAX_CHARS) : normalized;

    sendResponse({
      text: cleanedText,
      title: pageTitle,
      truncated,
      originalLength: normalized.length
    });
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

const NOISE_SELECTOR = [
  'nav', 'aside', 'footer', 'header',
  'form', 'script', 'style', 'noscript', 'template', 'iframe',
  '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
  '[role="complementary"]', '[role="search"]', '[aria-hidden="true"]',
  '.nav', '.navbar', '.menu', '.sidebar', '.footer', '.header',
  '.comments', '#comments', '.comment', '.social', '.share',
  '.related', '.recommended', '.advert', '.ad', '.ads', '.promo',
  '.cookie', '.newsletter', '.subscribe', '.popup', '.modal'
].join(',');

function visibleText(el) {
  if (!el) return '';
  const text = el.innerText || '';
  return text.replace(/\s+/g, ' ').trim();
}

function linkDensity(el) {
  const total = (el.innerText || '').length;
  if (!total) return 1;
  let linkLen = 0;
  el.querySelectorAll('a').forEach(a => { linkLen += (a.innerText || '').length; });
  return linkLen / total;
}

function scoreCandidate(el) {
  const text = visibleText(el);
  if (text.length < 250) return -Infinity;
  const density = linkDensity(el);
  if (density > 0.5) return -Infinity;
  const paragraphs = el.querySelectorAll('p').length;
  return text.length * (1 - density) + paragraphs * 80;
}

function extractMainContent() {
  const clone = document.body ? document.body.cloneNode(true) : null;
  if (!clone) return '';
  clone.querySelectorAll(NOISE_SELECTOR).forEach(n => n.remove());

  const selectors = [
    'article',
    '[role="main"]',
    'main',
    '[itemprop="articleBody"]',
    '.post-content', '.entry-content', '.article-content', '.story-body',
    '#content', '#main-content'
  ];

  let best = null;
  let bestScore = -Infinity;
  for (const sel of selectors) {
    clone.querySelectorAll(sel).forEach(el => {
      const s = scoreCandidate(el);
      if (s > bestScore) { bestScore = s; best = el; }
    });
  }

  if (!best) {
    clone.querySelectorAll('div, section').forEach(el => {
      const s = scoreCandidate(el);
      if (s > bestScore) { bestScore = s; best = el; }
    });
  }

  const chosen = best || clone;
  return (chosen.innerText || '').trim();
}

function truncateAtSentence(text, max) {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastEnd = Math.max(
    slice.lastIndexOf('. '),
    slice.lastIndexOf('! '),
    slice.lastIndexOf('? ')
  );
  if (lastEnd > max * 0.7) return slice.slice(0, lastEnd + 1);
  return slice;
}

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
