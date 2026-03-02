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

  adLabel: [
    '.feed-shared-actor__sub-description',
    '.update-components-actor__sub-description',
  ],

  media: [
    '.update-components-image',
    '.update-components-video',
    '.update-components-article',
    '.update-components-document',
    '.update-components-carousel',
    '.feed-shared-image',
    '.feed-shared-article',
    '.feed-shared-external-video',
    '.feed-shared-mini-update-v2',
    '.feed-shared-carousel',
  ].join(', '),

  seeMore: [
    '.feed-shared-inline-show-more-text__see-more-less-toggle',
    '.feed-shared-text-view__toggle',
  ].join(', '),
};

const cache = new Map();

// ——— Queue (4s between API calls to stay within Groq free tier) ———

const queue = [];
const queued = new Set();
let processing = false;

function enqueue(post) {
  const postId = getPostId(post);
  if (cache.has(postId) || queued.has(postId)) return;
  queued.add(postId);
  queue.push(post);
  if (!processing) processNext();
}

async function processNext() {
  if (queue.length === 0) { processing = false; return; }
  processing = true;
  const post = queue.shift();
  queued.delete(getPostId(post));
  await analyzeAndReplace(post);
  setTimeout(processNext, 4000);
}

// ——— Viewport observer ———

const viewportObserver = new IntersectionObserver((entries) => {
  for (const { isIntersecting, target } of entries) {
    if (!isIntersecting) continue;
    viewportObserver.unobserve(target);
    enqueue(target);
  }
}, { threshold: 0.5 });

function observe(post) {
  if (isAd(post)) return;
  if (post.closest('.comments-comment-item, .comments-comments-list, .comments-comment-entity')) return;
  if (post.dataset.urn && !post.dataset.urn.startsWith('urn:li:activity:')) return;
  if (cache.has(getPostId(post))) return;
  viewportObserver.observe(post);
}

// ——— Init ———

document.querySelectorAll(SEL.post).forEach(observe);

new MutationObserver((mutations) => {
  for (const { addedNodes } of mutations) {
    for (const node of addedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      if (node.matches?.(SEL.post)) observe(node);
      node.querySelectorAll?.(SEL.post).forEach(observe);
    }
  }
}).observe(document.body, { childList: true, subtree: true });

// ——— Analysis ———

async function expandPost(post) {
  const btn = post.querySelector(SEL.seeMore);
  if (btn) {
    btn.click();
    await new Promise(r => setTimeout(r, 300));
  }
}

async function analyzeAndReplace(post) {
  const postId = getPostId(post);
  const textEl = findTextElement(post);
  if (!textEl) return;

  if (cache.has(postId)) {
    displayResult(post, cache.get(postId), textEl);
    return;
  }

  await expandPost(post);

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'ANALYZE_POST',
      text: textEl.innerText.trim(),
      author: findAuthor(post),
    });

    if (!response.success) {
      console.error('[BS Detector] API error:', response.error);
      return;
    }

    const { verdict, rewrite, summary } = response.result;
    const result = { verdict, rewrite, summary, originalHTML: textEl.innerHTML };
    cache.set(postId, result);
    displayResult(post, result, textEl);
  } catch (err) {
    console.error('[BS Detector]', err);
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

function setMediaVisibility(post, visible) {
  post.querySelectorAll(SEL.media).forEach(el => el.style.display = visible ? '' : 'none');
}

function applyRewrite(post, rewrite, originalHTML, textEl) {
  textEl.innerHTML = `
    <span style="display:block;font-style:italic;color:#444;background:#fff8f7;
      border-left:3px solid #cc1100;padding:10px 14px;border-radius:4px;line-height:1.6;
    ">${escapeHTML(rewrite)}</span>
  `;
  setMediaVisibility(post, false);

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
      textEl.innerHTML = originalHTML;
      setMediaVisibility(post, true);
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

function isAd(post) {
  const label = pickFirst(post, SEL.adLabel)?.toLowerCase() ?? '';
  return label.includes('sponsored') || label.includes('promoted') || label.includes('sponsorisé');
}

function pickFirstEl(root, selectors) {
  for (const sel of selectors) {
    const el = root.querySelector(sel);
    if (el?.innerText.trim()) return el;
  }
  return null;
}

function pickFirst(root, selectors) {
  return pickFirstEl(root, selectors)?.innerText.trim() ?? null;
}

const findTextElement = (post) => pickFirstEl(post, SEL.postText);

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
