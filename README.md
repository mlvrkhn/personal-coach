# Personal Coach Bot

An automated personal coaching system that delivers daily motivation and weekly goal planning directly to Telegram — for free, with zero manual overhead.

## How it works

```
GitHub Actions (cron) → Node.js + TypeScript → Groq LLM API → Telegram Bot
```

Two scheduled jobs run automatically:

- **Daily at 08:00 CEST** — a focused coaching message based on the week's priorities and your latest notes
- **Sunday at 19:00 CEST** — a weekly reflection + AI-generated hour allocation for the next week, automatically committed back to the repo

All state lives in `coach.json`, committed to the repository. No database, no server, no running costs.

## Tech stack

- **Runtime**: Node.js 24 + TypeScript (executed directly via `tsx`)
- **LLM**: Groq API — `llama-3.3-70b-versatile` (free tier, 14 400 req/day)
- **Delivery**: Telegram Bot API
- **Automation**: GitHub Actions (cron schedule)
- **State**: `coach.json` versioned in git

## Setup

### 1. Clone and install

```bash
git clone https://github.com/your-username/personal-coach
cd personal-coach
npm install
```

### 2. Create a Telegram bot

1. Open Telegram → search `@BotFather` → send `/newbot`
2. Follow the prompts — you'll receive a **bot token**
3. Send any message to your new bot, then open:
   ```
   https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates
   ```
4. Find `"chat": { "id": ... }` — that's your **chat ID**

### 3. Get a Groq API key

Sign up at [console.groq.com](https://console.groq.com) → API Keys → Create API Key. Free, no credit card required.

### 4. Add GitHub secrets

In your repo: **Settings → Secrets and variables → Actions → New repository secret**

| Secret | Value |
|--------|-------|
| `GROQ_API_KEY` | Your Groq API key (`gsk_...`) |
| `TELEGRAM_BOT_TOKEN` | Your Telegram bot token |
| `TELEGRAM_CHAT_ID` | Your Telegram chat ID |
| `NOTES_JSON` | Your personal notes as JSON (see Usage below) |

### 5. Test it

Go to **Actions → Personal Coach → Run workflow** → select `daily` → run.

A message should appear in Telegram within 30 seconds.

## Usage

### Updating your notes

Personal notes never touch the repository. They live in the `NOTES_JSON` GitHub secret — a JSON object with one field per goal area.

Go to **Settings → Secrets → `NOTES_JSON`** and update the value:

```json
{
  "jobSearch": "Applied to 3 positions this week, waiting for responses from Firm X",
  "applyKit": "Landing page done, working on auth flow",
  "groovebox": "",
  "bakuBook": "Finished chapter 2 outline",
  "gym": "",
  "spanish": "Completed Duolingo streak, 10 days"
}
```

The coach reads this at runtime — it's never written to disk or committed.

### Weekly automation

Every Sunday at 19:00 CEST the bot:
1. Generates a weekly reflection
2. Decides next week's hour allocation per goal (based on priorities and notes)
3. Commits the updated `coach.json` back to the repo

### Running locally

```bash
npm run daily    # simulate daily message
npm run weekly   # simulate weekly review (will also commit + push)
npm run typecheck  # TypeScript type check
```

Requires a `.env` file or exported env vars:
```
GROQ_API_KEY=gsk_...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
```

## Project structure

```
├── .github/workflows/coach.yml   # Cron schedule + manual trigger
├── src/
│   ├── index.ts                  # Entry point, mode detection
│   ├── daily.ts                  # Daily message logic
│   ├── weekly.ts                 # Weekly review + coach.json update
│   ├── telegram.ts               # Telegram Bot API wrapper
│   └── types.ts                  # TypeScript interfaces
├── coach.json                    # Your goals and state
└── tsconfig.json
```

## Cost

| Service | Cost |
|---------|------|
| GitHub Actions | Free |
| Groq API | Free (14 400 req/day) |
| Telegram Bot API | Free |
| **Total** | **$0/month** |

## Tracked areas

Configurable in `coach.json`. Defaults:

- Job search
- ApplyKit (side project)
- Groovebox (side project)
- Baku Book (writing project)
- Gym
- Spanish
