const SEL = {
  post: '[data-urn], .feed-shared-update-v2, article[data-id]',

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

const cache = new Map();

// ——— Init ———

document.querySelectorAll(SEL.post).forEach(addAnalyzeButton);

new MutationObserver((mutations) => {
  for (const { addedNodes } of mutations) {
    for (const node of addedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      if (node.matches?.(SEL.post)) addAnalyzeButton(node);
      node.querySelectorAll?.(SEL.post).forEach(addAnalyzeButton);
    }
  }
}).observe(document.body, { childList: true, subtree: true });

// ——— Button injection ———

function addAnalyzeButton(post) {
  if (post.closest('.comments-comment-item, .comments-comments-list, .comments-comment-entity')) return;
  if (post.dataset.urn && !post.dataset.urn.startsWith('urn:li:activity:')) return;
  if (post.querySelector('.bs-analyze-btn')) return;

  const textEl = findTextElement(post);
  if (!textEl) return;

  const btn = document.createElement('button');
  btn.className    = 'bs-analyze-btn';
  btn.textContent  = '💩 Analyze';
  btn.style.cssText = `
    display: block; margin-bottom: 8px; background: none;
    border: 1px solid #d0d0d0; border-radius: 12px;
    padding: 3px 12px; font-size: 12px; color: #777;
    cursor: pointer; transition: border-color 0.15s, color 0.15s;
  `;

  btn.addEventListener('mouseenter', () => { btn.style.borderColor = '#cc1100'; btn.style.color = '#cc1100'; });
  btn.addEventListener('mouseleave', () => { btn.style.borderColor = '#d0d0d0'; btn.style.color = '#777'; });
  btn.addEventListener('click', () => analyzeAndReplace(post));

  textEl.insertAdjacentElement('beforebegin', btn);
}

// ——— Analysis ———

async function analyzeAndReplace(post) {
  const postId = getPostId(post);
  const textEl = findTextElement(post);
  if (!textEl) return;

  if (cache.has(postId)) {
    displayResult(post, cache.get(postId), textEl);
    return;
  }

  const btn = post.querySelector('.bs-analyze-btn');
  if (btn) { btn.textContent = '⏳ Analyzing...'; btn.disabled = true; }

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'ANALYZE_POST',
      text: textEl.innerText.trim(),
      author: findAuthor(post),
    });

    if (!response.success) {
      console.error('[BS Detector] API error:', response.error);
      if (btn) { btn.textContent = '⚠️ Error'; btn.disabled = false; }
      return;
    }

    const { verdict, rewrite, summary } = response.result;
    const result = { verdict, rewrite, summary, originalHTML: textEl.innerHTML };
    cache.set(postId, result);
    if (btn) btn.remove();
    displayResult(post, result, textEl);
  } catch (err) {
    console.error('[BS Detector]', err);
    if (btn) { btn.textContent = '⚠️ Error'; btn.disabled = false; }
  }
}

function displayResult(post, result, textEl) {
  const { verdict, rewrite, summary, originalHTML } = result;
  if (verdict === 'bullshit') {
    applyRewrite(post, rewrite, originalHTML, textEl);
  } else {
    applySummary(post, summary, textEl);
  }
}

// ——— DOM updates ———

function applyRewrite(post, rewrite, originalHTML, textEl) {
  textEl.innerHTML = `
    <span style="display:block;font-style:italic;color:#444;background:#fff8f7;
      border-left:3px solid #cc1100;padding:10px 14px;border-radius:4px;line-height:1.6;
    ">${escapeHTML(rewrite)}</span>
  `;

  if (post.querySelector('.bs-see-original')) return;

  const toggle = document.createElement('button');
  toggle.className    = 'bs-see-original';
  toggle.textContent  = 'See original post';
  toggle.style.cssText = `
    display:block;margin-top:8px;background:none;border:none;
    color:#0077b5;font-size:12px;cursor:pointer;padding:0;text-decoration:underline;
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

function applySummary(post, summary, textEl) {
  if (post.querySelector('.bs-summary')) return;

  const box = document.createElement('div');
  box.className    = 'bs-summary';
  box.style.cssText = `
    display:block;font-size:12px;color:#444;background:#f0f7f0;
    border-left:3px solid #0a8a3c;padding:6px 12px;
    border-radius:4px;margin-bottom:8px;line-height:1.5;
  `;
  box.innerHTML = `<strong style="color:#0a8a3c">✓ Valuable</strong> — ${escapeHTML(summary)}`;

  textEl.insertAdjacentElement('beforebegin', box);
}

// ——— Helpers ———

function findTextElement(post) {
  for (const sel of SEL.postText) {
    const el = post.querySelector(sel);
    if (el?.innerText.trim()) return el;
  }
  return null;
}

function pickFirst(el, selectors) {
  for (const sel of selectors) {
    const text = el.querySelector(sel)?.innerText.trim();
    if (text) return text;
  }
  return null;
}

function findAuthor(post) {
  return {
    name:     pickFirst(post, SEL.authorName),
    headline: pickFirst(post, SEL.authorHeadline),
  };
}

function getPostId(post) {
  return post.dataset.urn ?? post.dataset.id ?? hashString(post.innerText.slice(0, 200));
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = Math.imul(31, hash) + str.charCodeAt(i) | 0;
  return String(hash);
}
