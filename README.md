# Personal Coach Bot

An automated personal coaching system: daily motivation, weekly goal planning, and two-way chat — delivered to Telegram, running for free.

## How it works

```
GitHub Actions (cron) → Node.js/TypeScript → Groq LLM → Telegram  (scheduled push)
Telegram reply → Cloudflare Worker → Groq LLM → Telegram           (instant reply)
```

**Scheduled:**
- Daily at 08:00 CEST — focused coaching message based on the week's priorities
- Sunday at 19:00 CEST — weekly reflection + AI-generated hour allocations for the next week

**On-demand:**
- Send any message to the bot → get a coaching reply within 2–3 seconds
- Conversation history maintained (last 10 turns)

## Tech stack

| Component | Technology |
|-----------|-----------|
| Scheduled jobs | GitHub Actions (cron) |
| Reply webhook | Cloudflare Workers |
| LLM | Groq API — `llama-3.3-70b-versatile` (free) |
| State | GitHub Secrets + Cloudflare KV |
| Runtime | Node.js 24 + TypeScript (`tsx`) |
| Delivery | Telegram Bot API |

## Privacy model

No personal data is committed to the repository.

| Data | Storage |
|------|---------|
| API keys | GitHub Secrets |
| Personal notes / diary entries | GitHub Secret `NOTES_JSON` |
| Goals, allocations, history | GitHub Secret `COACH_JSON` |
| Conversation history | Cloudflare KV |
| Generated messages | Telegram only, never logged |

## Setup

### 1. Telegram bot

1. Open Telegram → `@BotFather` → `/newbot` → follow prompts → copy token
2. Send any message to your new bot, then visit:
   ```
   https://api.telegram.org/bot<TOKEN>/getUpdates
   ```
3. Find `"chat": { "id": ... }` — that's your chat ID

### 2. Groq API key

Sign up at [console.groq.com](https://console.groq.com) → API Keys → Create. Free, no credit card.

### 3. GitHub secrets

Repo → **Settings → Secrets and variables → Actions**:

| Secret | Value |
|--------|-------|
| `GROQ_API_KEY` | `gsk_...` |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token |
| `TELEGRAM_CHAT_ID` | Your chat ID |
| `NOTES_JSON` | `{}` (update later — see Usage) |
| `COACH_JSON` | Contents of `coach.json` (your goals config) |
| `GH_PAT` | GitHub PAT with `secrets:write` permission |

### 4. Cloudflare Worker (for replies)

```bash
cd worker
npx wrangler login
wrangler kv namespace create coach   # copy the id into wrangler.toml
wrangler deploy
wrangler secret put GROQ_API_KEY
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_CHAT_ID
```

Register the webhook with Telegram:
```
https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://personal-coach.<your-subdomain>.workers.dev
```

If your `workers.dev` subdomain is protected by Cloudflare Access, add a **Bypass** policy for `personal-coach.<your-subdomain>.workers.dev`.

### 5. Sync initial context to KV

```bash
node -e "
const c = JSON.parse(require('fs').readFileSync('./coach.json','utf8'));
require('fs').writeFileSync('/tmp/ctx.json', JSON.stringify({goals:c.goals,currentWeek:c.currentWeek}));
"
cd worker && npx wrangler kv key put --binding=COACH_KV "coach:context" --path /tmp/ctx.json --remote
```

### 6. Test

- **Scheduled**: Actions → Personal Coach → Run workflow → `daily`
- **Reply**: Send any message to your bot → expect reply in 2–3 seconds

## Usage

### Updating notes

Notes never touch the repo. Edit the `NOTES_JSON` GitHub secret:

```json
{
  "jobSearch": "Applied to 3 positions, waiting for responses",
  "applyKit": "Working on auth flow",
  "groovebox": "",
  "bakuBook": "Finished chapter 2 outline",
  "gym": "3 sessions last week",
  "spanish": "Duolingo streak 14 days"
}
```

### Talking to the bot

Just send any message. The bot has context of your goals and current week plan, and remembers the last 10 conversation turns.

### Running locally

```bash
npm run daily      # simulate daily message
npm run weekly     # simulate weekly review
npm run typecheck  # TypeScript check
```

Requires env vars: `GROQ_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `NOTES_JSON`, `COACH_JSON`.

## Project structure

```
├── .github/workflows/coach.yml   # Cron schedule + manual trigger
├── src/
│   ├── index.ts                  # Entry point, mode detection
│   ├── daily.ts                  # Daily coaching message
│   ├── weekly.ts                 # Weekly review + KV context sync
│   ├── telegram.ts               # Telegram Bot API wrapper
│   └── types.ts                  # TypeScript interfaces
├── worker/
│   ├── src/index.ts              # Cloudflare Worker webhook handler
│   └── wrangler.toml             # CF Worker config + KV binding
└── tsconfig.json
```

## Cost

| Service | Cost |
|---------|------|
| GitHub Actions | Free |
| Cloudflare Workers + KV | Free |
| Groq API | Free (14 400 req/day) |
| Telegram Bot API | Free |
| **Total** | **$0/month** |
