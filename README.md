# LinkedIn Feed Filter

A Chrome extension that automatically analyzes your LinkedIn feed and distills posts to their actual information content.

## What it does

As you scroll, each post is quietly sent to an LLM (Llama 3.3 70B via Groq). Based on the analysis:

- **Low signal posts** — the text is replaced with a condensed, no-nonsense version of what was actually said. A *See original post* toggle lets you read the source if you want.
- **High signal posts** — a small green badge summarizes the actual content in one sentence.

Media (images, videos, articles) is hidden on low-signal posts to reduce visual noise.

## Setup

1. Get a free API key at [console.groq.com](https://console.groq.com)
2. Copy `config.example.js` to `config.js` and paste your key
3. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, select this folder

## Notes

- Ads are skipped automatically
- Requests are spaced 4 seconds apart to stay within Groq's free tier (15 RPM)
- Results are cached in memory for the duration of the session
- The extension only runs on `linkedin.com`
