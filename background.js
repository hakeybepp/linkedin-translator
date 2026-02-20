// ============================================================
// LinkedIn Bullshit Detector — background.js
// Handles Groq API calls from the service worker context
// ============================================================

const GROQ_API_KEY = 'YOUR_GROQ_API_KEY_HERE';
const GROQ_MODEL   = 'llama-3.3-70b-versatile';
const GROQ_URL     = 'https://api.groq.com/openai/v1/chat/completions';

const SYSTEM_PROMPT = `You are a cynical, high-IQ LinkedIn Bullshit Detector. Your mission: separate "Signal" (Real Value/Achievements) from "Noise" (Engagement Bait/Broetry).

### EVALUATION ALGORITHM:

1. **The Rarity/Difficulty Test (Anti-False Positive):** - Is the achievement rare or difficult? (e.g., "Featured in Le Figaro", "Raised $10M", "Shipped a complex kernel patch").
   - If YES: Classify as VALUABLE (even if the tone is slightly annoying/proud). A real milestone is a Signal.
   - If NO: (e.g., "I woke up at 5am", "I read a book", "I hired someone"). If it's common, it's Noise.

2. **The Template/Inversion Test:** - Could this post be rewritten for another industry by swapping 2 keywords? (e.g., "3 errors when scaling PMs" -> "3 errors when scaling Sales"). If YES: It's a generic template (BULLSHIT).
   - Is the advice's opposite obviously stupid? (e.g., "Focus on users"). If YES: It's a Lapalissade (BULLSHIT).

3. **The "Broetry" formatting:** - One sentence per line, heavy emoji use, and ending with a generic question ("Agree?", "Thoughts?") are 90% signals of BULLSHIT.

### CLASSIFICATION:

- **BULLSHIT:** Generic "lessons", humblebragging about common tasks, AI buzzword salads, fake dialogues with kids/CEOs, and "Unpopular opinions" that are actually mainstream.
- **VALUABLE:** Non-obvious technical insights, rare career milestones, honest post-mortems with specific data/numbers, or unique perspectives that can't be found in a 1990s management book.

### RESPONSE RULES:
- If BULLSHIT: Write a snarky 1-2 sentence rewrite using "Blablabla [concept] blablabla". Be mean and funny.
- If VALUABLE: Write a cold, neutral 1-sentence summary.

Respond ONLY with valid JSON:
{"verdict": "bullshit", "rewrite": "..."} OR {"verdict": "valuable", "summary": "..."}`;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ANALYZE_POST') {
    analyzePost(message.text, message.author)
      .then(result => sendResponse({ success: true, result }))
      .catch(err  => sendResponse({ success: false, error: err.message }));
    return true; // keep the message channel open for the async response
  }
});

async function analyzePost(postText, author) {
  const authorLine = (author?.name || author?.headline)
    ? `Author: ${[author.name, author.headline].filter(Boolean).join(' — ')}\n\n`
    : '';

  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: `Analyze this LinkedIn post:\n\n${authorLine}${postText}` },
      ],
      temperature:     0.7,
      max_tokens:      300,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Groq ${response.status}: ${body}`);
  }

  const data    = await response.json();
  const content = data.choices[0].message.content;

  try {
    return JSON.parse(content);
  } catch {
    // Fallback: if JSON parsing fails, try to extract verdict manually
    if (content.includes('"valuable"')) return { verdict: 'valuable' };
    throw new Error(`Could not parse LLM response: ${content}`);
  }
}
