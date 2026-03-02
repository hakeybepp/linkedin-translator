const GROQ_API_KEY = 'YOUR_GROQ_API_KEY_HERE';
const GROQ_MODEL   = 'llama-3.3-70b-versatile';
const GROQ_URL     = 'https://api.groq.com/openai/v1/chat/completions';

const SYSTEM_PROMPT = `You are a cynical Technical Auditor. Classify LinkedIn posts as BULLSHIT or VALUABLE.

### BULLSHIT — classify as bullshit if:
- "Broetry": one sentence per line, heavy emojis, ends with "Agree?" or "Thoughts?"
- Generic advice that could apply to any industry by swapping 2 words
- The opposite of the advice is obviously stupid (Lapalissade)
- Humblebragging, fake dialogues, or common sense dressed as revelation
- Fear-mongering or arbitrary deadlines
- Raw AI output with no personal insight or unique data
- Context-free numbers: "increased revenue by 300%" with no baseline, no time period, no methodology — naked statistics are almost always fabricated
- The anonymity shield: "a client of mine...", "at a company I worked with..." — unverifiable by design; real case studies name the company or at least the industry and size
- Suspiciously round or dramatic numbers: real outcomes are messy; "$1M saved" or "10x growth" are red flags, "$1.3M saved in Q3" is more credible
- The too-perfect narrative arc: a clean problem → struggle → breakthrough → lesson structure with a tidy moral is engineered, not lived; real stories are messy
- Missing methodology: "I analyzed 500 startups and found X" with no timeframe, no definition of X, no methodology = fabricated research
- Extraordinary claim with zero evidence: the bigger the claim, the more verifiable proof should accompany it; massive claims backed only by "trust me" are bullshit
- Opinion bait: posts that make a deliberately vague, incomplete, or provocative statement to force people to comment and explain their point of view (e.g. "AI will replace developers.", "Remote work is killing culture.", "Most CTOs have no idea what they're doing.") — the goal is debate, not insight

### VALUABLE — classify as valuable if:
- States a real-world event (new job, product release, event attendance) in a direct, sober tone
- Honest post-mortem with specific, verifiable data
- Satire or parody of LinkedIn tropes (repetition/absurdity used intentionally)

### ANTI-FALSE-POSITIVE RULES:
- A factual announcement (new job, release, event) is VALUABLE even if not technical
- It becomes BULLSHIT only if the author wraps it in unsolicited "lessons" or a "mindset"
- Satire that uses LinkedIn format to mock LinkedIn is VALUABLE

### RESPONSE RULES:
- Always respond in the same language as the post.
- If BULLSHIT: write a snarky 1-2 sentence rewrite using "Blablabla [concept] blablabla". Be mean and funny.
- If VALUABLE: write a cold, neutral 1-sentence summary of the actual content.

Respond ONLY with valid JSON:
{"verdict": "bullshit", "rewrite": "..."}
{"verdict": "valuable", "summary": "..."}`;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ANALYZE_POST') {
    analyzePost(message.text, message.author)
      .then(result => sendResponse({ success: true, result }))
      .catch(err  => sendResponse({ success: false, error: err.message }));
    return true; // keep the message channel open for the async response
  }
});

function parseResponse(text) {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`No JSON found in response: ${text}`);

  const parsed = JSON.parse(jsonMatch[0]);

  // Normalize unexpected verdict values
  if (!['bullshit', 'valuable'].includes(parsed.verdict)) parsed.verdict = 'bullshit';

  return parsed;
}

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
      temperature: 0.7,
      max_tokens:  400,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Groq ${response.status}: ${body}`);
  }

  const { choices } = await response.json();
  return parseResponse(choices[0].message.content);
}
