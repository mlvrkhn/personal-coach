# GoGoSloth

A self-hosted AI coaching system that runs entirely for free. Daily motivation, weekly goal planning, and two-way chat — delivered to Telegram.

Built with GitHub Actions, Cloudflare Workers, and Groq (free LLM API).

---

## What it does

**Scheduled (GitHub Actions):**
- **Daily at 08:00** — focused coaching message based on your week's priorities
- **Sunday at 19:00** — weekly reflection + AI-generated hour allocations for next week

**On-demand (Cloudflare Worker):**
- Send any message to the bot → coaching reply in 2–3 seconds
- Conversation history maintained (last 10 turns)
- Meaningful exchanges automatically journaled

**Coach personality:** configurable — harsh and demanding by default, but genuinely caring. Customizable via the config form.

---

## Tech stack

| Component | Service | Cost |
|-----------|---------|------|
| Scheduled jobs | GitHub Actions | Free |
| Reply webhook | Cloudflare Workers | Free |
| LLM | Groq API (`llama-3.3-70b-versatile`) | Free |
| State | GitHub Secrets + Cloudflare KV | Free |
| Runtime | Node.js 24 + TypeScript | — |
| **Total** | | **$0/month** |

---

## Setup

### Prerequisites

- GitHub account
- Cloudflare account (free)
- Groq account (free) — [console.groq.com](https://console.groq.com)
- Telegram account

### 1. Fork & clone

```bash
git clone https://github.com/mlvrkhn/gogosloth
cd gogosloth
npm install
```

### 2. Create a Telegram bot

1. Open Telegram → `@BotFather` → `/newbot` → follow prompts → copy the **bot token**
2. Send any message to your new bot, then open in browser:
   ```
   https://api.telegram.org/bot<TOKEN>/getUpdates
   ```
3. Find `"chat": { "id": ... }` — that's your **chat ID**

### 3. Get a Groq API key

[console.groq.com](https://console.groq.com) → API Keys → Create API Key. Free, no credit card required. Key starts with `gsk_`.

### 4. Configure with the form

Open `config.html` in your browser:

```bash
open config.html   # macOS
xdg-open config.html  # Linux
```

Fill in your name, personality, and goals → click **Generate JSON** → copy the output.

### 5. Add GitHub secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
|--------|-------|
| `GROQ_API_KEY` | Your Groq key (`gsk_...`) |
| `TELEGRAM_BOT_TOKEN` | Your Telegram bot token |
| `TELEGRAM_CHAT_ID` | Your chat ID |
| `COACH_JSON` | Output from config.html |
| `NOTES_JSON` | `{}` (update later with current progress notes) |
| `GH_PAT` | GitHub personal access token with `secrets:write` permission |

**Creating GH_PAT:** GitHub profile → Settings → Developer settings → Fine-grained tokens → New token → select your repo → Secrets: Read and write.

### 6. Deploy the Cloudflare Worker

```bash
cd worker
npm install
npx wrangler login
npx wrangler kv namespace create gogosloth   # copy the id
```

Edit `worker/wrangler.toml` and replace `id` with your KV namespace ID.

```bash
npx wrangler deploy
```

You'll get a URL like `https://gogosloth.<your-subdomain>.workers.dev`.

Set Worker secrets (run each and paste value when prompted):

```bash
npx wrangler secret put GROQ_API_KEY
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
```

### 7. Register Telegram webhook

```
https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://gogosloth.<your-subdomain>.workers.dev
```

> **Note:** If your Cloudflare account has Zero Trust / Access enabled, add a **Bypass** policy for your Worker URL (Zero Trust → Access → Applications → Add → Self-hosted → Action: Bypass → Include: Everyone).

### 8. Sync initial context to Cloudflare KV

```bash
node -e "
const c = JSON.parse(require('fs').readFileSync('./coach.json','utf8'));
require('fs').writeFileSync('/tmp/ctx.json', JSON.stringify({goals:c.goals,currentWeek:c.currentWeek,personality:c.personality}));
"
cd worker && npx wrangler kv key put --binding=COACH_KV "coach:context" --path /tmp/ctx.json --remote
```

### 9. Test

- **Scheduled:** GitHub → Actions → GoGoSloth → Run workflow → `daily`
- **Reply:** Send any message to your Telegram bot

---

## Usage

### Updating your notes

Edit the `NOTES_JSON` GitHub secret with your current progress:

```json
{
  "jobSearch": "Applied to 3 positions this week",
  "applyKit": "Auth flow done, working on dashboard",
  "bakuBook": "Finished chapter 2 outline"
}
```

### Changing personality

Open `config.html`, update the personality textarea, generate new `COACH_JSON`, update the secret.

### Viewing your journal

```bash
cd worker
npx wrangler kv key get --binding=COACH_KV "coach:journal" --remote
```

### Running locally

```bash
npm run daily      # simulate daily message
npm run weekly     # simulate weekly review
npm run typecheck  # TypeScript check
```

Set env vars first: `GROQ_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `NOTES_JSON`, `COACH_JSON`.

---

## Project structure

```
├── .github/workflows/coach.yml   # Cron + manual trigger
├── src/
│   ├── index.ts                  # Entry point, mode detection
│   ├── daily.ts                  # Daily coaching message
│   ├── weekly.ts                 # Weekly review + KV sync + journal
│   ├── telegram.ts               # Telegram Bot API wrapper
│   └── types.ts                  # TypeScript interfaces
├── worker/
│   ├── src/index.ts              # CF Worker: webhook + journal synthesis
│   └── wrangler.toml             # CF config (update KV namespace ID)
├── config.html                   # Local setup form → generates secrets JSON
└── tsconfig.json
```

---

## Privacy

No personal data is committed to the repository.

| Data | Where |
|------|-------|
| API keys | GitHub Secrets |
| Personal notes | GitHub Secret `NOTES_JSON` |
| Goals, allocations, history | GitHub Secret `COACH_JSON` |
| Conversation history | Cloudflare KV |
| Journal entries | Cloudflare KV |
