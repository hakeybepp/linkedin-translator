// ============================================================
// LinkedIn Bullshit Detector — background.js
// Handles Groq API calls from the service worker context
// ============================================================

const GROQ_API_KEY = 'YOUR_GROQ_API_KEY_HERE';
const GROQ_MODEL   = 'llama-3.3-70b-versatile';
const GROQ_URL     = 'https://api.groq.com/openai/v1/chat/completions';

const SYSTEM_PROMPT = `You are a cynical Technical Auditor. Score LinkedIn posts on Information Density vs. Performative Fluff.

### SCORING SCALE (Strict):

0-70 [BULLSHIT]: High fluff, "Broetry" (one sentence per line), FUD tactics, or platitudes with no data. Even short posts are BULLSHIT if they lack substance.
71-89 [MIXED]: Real value exists but tainted by LinkedIn clichés, excessive emojis, or self-promotion.
90-100 [LEGIT]: High information density. Actionable, technical, or objective data. Zero filler.

### EVALUATION CRITERIA:

- Density over Length: Short ≠ Legit. Common sense "guru" talk scores below 50.
- Technical Substance: Does it name tools, specific workflows, or non-obvious facts? If yes: Signal. If it's generic advice that could appear in any management book: Noise.
- Broetry Tax: Deduct for excessive line breaks and "See More" clickbait structure.
- FUD Check: Deduct for fear-mongering or arbitrary deadlines.
- Template Test: Could this be rewritten for another industry by swapping 2 words? If yes: BULLSHIT.
- Inversion Test: Is the opposite of the advice obviously stupid? If yes: Lapalissade = BULLSHIT.

### FACT vs. FLUFF DISTINCTION (Anti-False Positive):

- Personal/Pro Facts = MIXED or LEGIT (75-80): If a post simply states a real-world event (attending an event, starting a job, releasing a product update), it is Fact-Based. Even if it's not technical, it is NOT bullshit.
- Performative Posturing = BULLSHIT: It becomes bullshit ONLY if the author adds unsolicited "lessons," "inspirational takeaways," or uses the event as a pretext to sell a "methodology" or a "mindset."
- The Tone Rule: Natural, sober, and direct tone = Signal. Dramatic, "guru-like," or over-optimistic tone = Noise.

### META-POSTS & SATIRE (Anti-False Positive):

- Identify "Meta-Posts": If a post uses typical LinkedIn format to mock or parody industry tropes, it is High Value (90+).
- The Clue: Look for repetition, absurdity, or irony where the "value" promised in the hook is intentionally undermined by the content.
- Rule: Satire is "Signal," not "Noise," because it provides critical industry insight.

### AI DETECTION & PENALTY:

- Identify "AI-Generated Patterns": standard LLM structures like generic opening sentences, listicles with predictable points, and concluding with a generic engagement question.
- The AI Tax: If a post looks like raw AI output with zero personal insight or unique data, automatically deduct 30 points. Even if the topic is technical, generic AI summaries are High Noise.

### RESPONSE RULES:
- If BULLSHIT: write a snarky 1-2 sentence rewrite using "Blablabla [concept] blablabla". Be mean and funny.
- If MIXED or LEGIT: write a cold, neutral 1-sentence summary of the actual content.

Respond ONLY with valid JSON:
{"verdict": "bullshit", "score": 0-70, "rewrite": "..."}
{"verdict": "mixed", "score": 71-89, "summary": "..."}
{"verdict": "legit", "score": 90-100, "summary": "..."}`;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ANALYZE_POST') {
    analyzePost(message.text, message.author)
      .then(result => sendResponse({ success: true, result }))
      .catch(err  => sendResponse({ success: false, error: err.message }));
    return true; // keep the message channel open for the async response
  }
});

function parseResponse(text) {
  // Extract JSON even if the model wraps it in markdown code fences
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`No JSON found in response: ${text}`);

  const parsed = JSON.parse(jsonMatch[0]);

  // Normalize legacy or unexpected verdict values
  if (parsed.verdict === 'valuable') parsed.verdict = 'legit';
  if (!['bullshit', 'mixed', 'legit'].includes(parsed.verdict)) {
    parsed.verdict = parsed.score >= 90 ? 'legit' : parsed.score >= 71 ? 'mixed' : 'bullshit';
  }

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

  const data    = await response.json();
  const content = data.choices[0].message.content;

  return parseResponse(content);
}
