// ============================================================
// LinkedIn Bullshit Detector — content.js
// ============================================================

const SEL = {
  post: [
    '[data-urn]',
    '.feed-shared-update-v2',
    'article[data-id]',
  ].join(', '),

  postText: [
    '.update-components-text .break-words',
    '.feed-shared-update-v2__description .break-words',
    '.update-components-text span[dir]',
    '.feed-shared-text-view span[dir]',
    '.update-components-text',
    '.feed-shared-update-v2__description',
  ],

  authorName: [
    '.update-components-actor__name span[aria-hidden="true"]',
    '.feed-shared-actor__name span[aria-hidden="true"]',
    '.update-components-actor__name',
    '.feed-shared-actor__name',
  ],

  authorHeadline: [
    '.update-components-actor__description span[aria-hidden="true"]',
    '.feed-shared-actor__description span[aria-hidden="true"]',
    '.update-components-actor__description',
    '.feed-shared-actor__description',
  ],
};

const cache = new Map(); // postId -> { verdict, rewrite|summary, originalHTML }

// ——— Inject buttons into posts already on the page ———
document.querySelectorAll(SEL.post).forEach(addAnalyzeButton);

// ——— Watch for new posts as the user scrolls ———
new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      if (node.matches?.(SEL.post)) addAnalyzeButton(node);
      node.querySelectorAll?.(SEL.post).forEach(addAnalyzeButton);
    }
  }
}).observe(document.body, { childList: true, subtree: true });

// ——— Add the analyze button at the top of a post ———
function addAnalyzeButton(post) {
  // Skip comments/replies — only process top-level feed posts
  if (post.closest('.comments-comment-item, .comments-comments-list, .comments-comment-entity')) return;
  if (post.dataset.urn && !post.dataset.urn.startsWith('urn:li:activity:')) return;

  if (post.querySelector('.bs-analyze-btn')) return;

  const textEl = findTextElement(post);
  if (!textEl) return;

  const btn = document.createElement('button');
  btn.className   = 'bs-analyze-btn';
  btn.textContent = '💩 Analyze';
  btn.style.cssText = `
    display: block;
    margin-bottom: 8px;
    background: none;
    border: 1px solid #d0d0d0;
    border-radius: 12px;
    padding: 3px 12px;
    font-size: 12px;
    color: #777;
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s;
  `;

  btn.addEventListener('mouseenter', () => { btn.style.borderColor = '#cc1100'; btn.style.color = '#cc1100'; });
  btn.addEventListener('mouseleave', () => { btn.style.borderColor = '#d0d0d0'; btn.style.color = '#777'; });
  btn.addEventListener('click', () => analyzeAndReplace(post));

  textEl.insertAdjacentElement('beforebegin', btn);
}

// ——— Analysis ———

async function analyzeAndReplace(post) {
  const postId = getPostId(post);

  if (cache.has(postId)) {
    const cached = cache.get(postId);
    const textEl = findTextElement(post);
    if (!textEl) return;
    if (cached.verdict === 'bullshit') {
      applyRewrite(post, cached.rewrite, cached.originalHTML, textEl);
    } else if (cached.verdict === 'mixed') {
      applySummary(post, `⚠️ ${cached.score}/100 — MIXED — ${cached.summary}`, textEl, '#b35c00', '#fff8f0', '#b35c00');
    } else {
      applySummary(post, `✓ ${cached.score}/100 — LEGIT — ${cached.summary}`, textEl, '#0a8a3c', '#f0f7f0', '#0a8a3c');
    }
    return;
  }

  const textEl = findTextElement(post);
  if (!textEl) {
    console.warn('[BS Detector] Could not find post text. Selectors may need updating.');
    return;
  }

  const originalHTML = textEl.innerHTML;
  const text         = textEl.innerText.trim();
  const author       = findAuthor(post);

  // Disable button while loading
  const btn = post.querySelector('.bs-analyze-btn');
  if (btn) { btn.textContent = '⏳ Analyzing...'; btn.disabled = true; }

  try {
    const response = await chrome.runtime.sendMessage({ type: 'ANALYZE_POST', text, author });

    if (!response.success) {
      console.error('[BS Detector] API error:', response.error);
      if (btn) { btn.textContent = '⚠️ Error'; btn.disabled = false; }
      return;
    }

    const { verdict, score, rewrite, summary } = response.result;
    cache.set(postId, { verdict, score, rewrite, summary, originalHTML });

    if (btn) btn.remove();

    if (verdict === 'bullshit') {
      applyRewrite(post, rewrite, originalHTML, textEl);
    } else if (verdict === 'mixed') {
      applySummary(post, `⚠️ ${score}/100 — MIXED — ${summary}`, textEl, '#b35c00', '#fff8f0', '#b35c00');
    } else {
      applySummary(post, `✓ ${score}/100 — LEGIT — ${summary}`, textEl, '#0a8a3c', '#f0f7f0', '#0a8a3c');
    }
  } catch (err) {
    console.error('[BS Detector]', err);
    if (btn) { btn.textContent = '⚠️ Error'; btn.disabled = false; }
  }
}

// ——— Bullshit: replace post text with snarky rewrite ———
function applyRewrite(post, rewrite, originalHTML, textEl) {
  textEl.innerHTML = `
    <span style="
      display: block;
      font-style: italic;
      color: #444;
      background: #fff8f7;
      border-left: 3px solid #cc1100;
      padding: 10px 14px;
      border-radius: 4px;
      line-height: 1.6;
    ">${escapeHTML(rewrite)}</span>
  `;

  if (post.querySelector('.bs-see-original')) return;

  const toggle = document.createElement('button');
  toggle.className    = 'bs-see-original';
  toggle.textContent  = 'See original post';
  toggle.style.cssText = `
    display: inline-block;
    margin-top: 8px;
    background: none;
    border: none;
    color: #0077b5;
    font-size: 12px;
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
  `;

  let showingOriginal = false;
  toggle.addEventListener('click', () => {
    showingOriginal = !showingOriginal;
    if (showingOriginal) {
      textEl.innerHTML   = originalHTML;
      toggle.textContent = 'Hide original post';
    } else {
      applyRewrite(post, rewrite, originalHTML, textEl);
      toggle.textContent = 'See original post';
    }
  });

  textEl.insertAdjacentElement('afterend', toggle);
}

// ——— Mixed/Legit: show a score badge above the post text ———
function applySummary(post, text, textEl, color, background, borderColor) {
  if (post.querySelector('.bs-summary')) return;

  const box = document.createElement('div');
  box.className = 'bs-summary';
  box.style.cssText = `
    display: block;
    font-size: 12px;
    color: #444;
    background: ${background};
    border-left: 3px solid ${borderColor};
    padding: 6px 12px;
    border-radius: 4px;
    margin-bottom: 8px;
    line-height: 1.5;
  `;
  box.innerHTML = `<strong style="color:${color}">${escapeHTML(text)}</strong>`;

  textEl.insertAdjacentElement('beforebegin', box);
}

// ——— Author extraction ———

function findAuthor(post) {
  const pick = (selectors) => {
    for (const sel of selectors) {
      const el = post.querySelector(sel);
      if (el && el.innerText.trim()) return el.innerText.trim();
    }
    return null;
  };

  const name     = pick(SEL.authorName);
  const headline = pick(SEL.authorHeadline);
  return { name, headline };
}

// ——— Utilities ———

function findTextElement(post) {
  for (const sel of SEL.postText) {
    const el = post.querySelector(sel);
    if (el && el.innerText.trim().length > 0) return el;
  }
  return null;
}

function getPostId(post) {
  return (
    post.dataset.urn ||
    post.dataset.id  ||
    hashString(post.innerText.slice(0, 200))
  );
}

function escapeHTML(str) {
  const div       = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = Math.imul(31, hash) + str.charCodeAt(i) | 0;
  }
  return String(hash);
}
