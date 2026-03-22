# web-evaluator

A tool that crawls a URL, takes full-page screenshots across multiple viewports, checks the page text for spelling/grammar errors, and asks an AI vision model to rate how responsive the layout looks. Results land in a simple web UI.

I built this because I couldn't find anything (to the best of my knowledge) that combined all three of these things (screenshots + responsiveness rating + spell check) in one async service. Most tools do one thing. This does all of them badly, but together.

Live demo: [webeval.davidvelho.com](https://webeval.davidvelho.com) — self-hosted on a spare computer at home using OpenAI.

## What it does

1. You submit a URL
2. It opens the page in Puppeteer, slow-scrolls to trigger scroll animations, then takes a full-page screenshot at 2 viewports:
   - Desktop 1920×1080
   - iPhone 16 Pro Max
3. It extracts all visible text and runs it through an LLM to find spelling/grammar issues
4. It sends each screenshot to a vision model and asks it to rate responsiveness out of 10, with specific issues and suggested fixes
5. Optionally, if you've crawled the same URL before, it diffs the screenshots using [png_diff](https://github.com/theProgrammerDavid/png_diff) and feeds the heatmap to the vision model so it can reason about what changed since the last crawl

Jobs are queued via Bull + Redis so it doesn't fall over if multiple people submit at once. Past results are public and browsable via the sidebar.

## Stack

This is a weekened project so I chose stuff that I was familiar with considering its self hosted at home

- **NestJS** — API + job processing
- **Bull + Redis** — async job queue
- **Puppeteer** — headless Chrome for screenshots
- **Ollama** (local) or **OpenAI** — AI for spell check and vision rating
- **[png_diff](https://github.com/theProgrammerDavid/png_diff)** — pixel diff + heatmap generation

## Honest caveats

The live demo runs on a spare computer at home using GPT-4o via the OpenAI API with a small amount in credits. Each job takes roughly 10 seconds.

The responsiveness ratings are a rough signal — GPT-4o is good but not infallible. It can miss issues or occasionally flag things that aren't real problems. Treat the output as a starting point, not a definitive audit.

The heatmap feature works best on static pages. Sites with animations or live data will produce noisy diffs — the crawler captures animations at different stages between runs, so the heatmap will flag them as changes when nothing actually changed. That said, this false positive is useful: it gives you a realistic preview of what the tool would look like detecting a genuine layout regression.

You can also run this locally with Ollama (`AI_PROVIDER=ollama`) if you don't want to use OpenAI. Quality will be lower depending on the model, but it works.

## Running it locally

### Prerequisites

- Node.js 20+
- pnpm
- Redis running on `localhost:6379`
- Either Ollama running locally or an OpenAI API key

### Setup

```bash
pnpm install
pnpm run start:dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

```env
# "ollama" or "openai"
AI_PROVIDER=ollama

# Ollama
OLLAMA_MODEL=qwen2.5-coder:7b-instruct-q4_K_M
OLLAMA_VISION_MODEL=llava:7b

# OpenAI (only needed if AI_PROVIDER=openai)
OPENAI_API_KEY=sk-...

# Optional
PORT=3000
HEADLESS_MODE=true
```

### With Docker Compose

```bash
docker compose up --env-file .env
```

This starts the app + Redis together.

## API

Swagger docs: [http://localhost:3000/docs](http://localhost:3000/docs)

```bash
# Submit a URL
curl -X POST http://localhost:3000/v1/crawler \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "waitMs": 3000, "language": "en", "useHeatmap": false}'

# Check job status
curl http://localhost:3000/v1/crawler/:jobId/status

# List all completed jobs
curl http://localhost:3000/v1/crawler/jobs
```

