import Groq from 'groq-sdk'
import { readFileSync, writeFileSync } from 'fs'
import { sendMessage } from './telegram.js'
import type { CoachData, Notes, WeeklyResponse, JournalEntry } from './types.js'

const DEFAULT_PERSONALITY = `You are Martin's personal coach. You are brutally honest, provocative, and demanding. You call out excuses immediately. You don't sugarcoat anything. But underneath it all you genuinely want him to win. Think drill sergeant with a heart.`

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

function loadNotes(): Notes {
  try {
    return JSON.parse(process.env.NOTES_JSON ?? '{}')
  } catch {
    return {}
  }
}

async function kvGet(key: string): Promise<string | null> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const namespaceId = process.env.CLOUDFLARE_KV_NAMESPACE_ID
  const apiToken = process.env.CLOUDFLARE_API_TOKEN
  if (!accountId || !namespaceId || !apiToken) return null

  const encodedKey = encodeURIComponent(key)
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodedKey}`,
    { headers: { Authorization: `Bearer ${apiToken}` } }
  )
  if (!res.ok) return null
  return res.text()
}

async function kvPut(key: string, value: string): Promise<void> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const namespaceId = process.env.CLOUDFLARE_KV_NAMESPACE_ID
  const apiToken = process.env.CLOUDFLARE_API_TOKEN
  if (!accountId || !namespaceId || !apiToken) return

  const encodedKey = encodeURIComponent(key)
  await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodedKey}`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
      body: value
    }
  )
}

async function pushContextToKV(coach: CoachData): Promise<void> {
  await kvPut('coach:context', JSON.stringify({
    goals: coach.goals,
    currentWeek: coach.currentWeek,
    personality: coach.personality
  }))
}

async function appendJournalEntry(entry: JournalEntry): Promise<void> {
  const raw = await kvGet('coach:journal')
  const journal: JournalEntry[] = raw ? JSON.parse(raw) : []
  journal.push(entry)
  await kvPut('coach:journal', JSON.stringify(journal))
}

export async function runWeekly(): Promise<void> {
  const coach: CoachData = JSON.parse(readFileSync('./coach.json', 'utf8'))
  const { profile, personality, goals, currentWeek, history } = coach
  const notes = loadNotes()

  const systemPrompt = personality?.description ?? DEFAULT_PERSONALITY

  const allocationLines = Object.entries(currentWeek.allocations)
    .map(([key, hours]) => {
      const goal = goals[key]
      const note = notes[key] ? ` — ${notes[key]}` : ''
      return `- ${goal.description} [${goal.priority}]: ${hours}h/week${note}`
    })
    .join('\n')

  const today = new Date().toISOString().split('T')[0]

  const historyText = history.length === 0
    ? 'None yet — this is the first week.'
    : history.slice(-4).reverse()
        .map(w => `Week of ${w.startDate}: ${Object.entries(w.allocations).map(([k, h]) => `${k}=${h}h`).join(', ')}`)
        .join('\n')

  // Read recent journal for context
  const journalRaw = await kvGet('coach:journal')
  const journal: JournalEntry[] = journalRaw ? JSON.parse(journalRaw) : []
  const recentJournal = journal.slice(-5).map(e => `[${e.date}] ${e.entry}`).join('\n')

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    max_tokens: 500,
    messages: [
      { role: 'system', content: `${systemPrompt} Return only valid JSON.` },
      {
        role: 'user',
        content: `Week ending ${today}. Coaching ${profile.name}.

Goals and current allocations:
${allocationLines}

Allocation history (most recent first):
${historyText}

${recentJournal ? `Recent journal entries:\n${recentJournal}` : ''}

Respond with valid JSON only, no markdown:
{
  "summary": "<960 characters max. Direct weekly reflection in your voice. What to focus on, what to fix. No greetings.>",
  "allocations": {
    "jobSearch": <number>,
    "applyKit": <number>,
    "groovebox": <number>,
    "bakuBook": <number>,
    "gym": <number>,
    "spanish": <number>
  }
}

Allocations: realistic total 30–40h/week. Job search stays high priority.`
      }
    ]
  })

  const rawText = response.choices[0].message.content?.trim() ?? ''

  let parsed: WeeklyResponse
  try {
    parsed = JSON.parse(rawText)
  } catch {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error(`Failed to parse weekly response:\n${rawText}`)
    parsed = JSON.parse(jsonMatch[0])
  }

  const { summary, allocations } = parsed

  coach.history.push({ startDate: currentWeek.startDate, allocations: currentWeek.allocations })
  coach.currentWeek = { startDate: today, allocations }

  writeFileSync('./coach.json', JSON.stringify(coach, null, 2) + '\n')

  // Synthesize chat history into journal entry
  const historyFromKV = await kvGet('coach:history')
  if (historyFromKV) {
    const chatHistory = JSON.parse(historyFromKV) as { role: string; content: string }[]
    if (chatHistory.length > 0) {
      const chatSummaryRes = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 120,
        messages: [
          { role: 'system', content: 'You extract coaching insights from conversations. Be brief and direct.' },
          {
            role: 'user',
            content: `Summarize the key progress, commitments, and insights from this week's conversations in 2–3 sentences. Focus on what matters for coaching.\n\n${chatHistory.slice(-20).map(m => `${m.role}: ${m.content}`).join('\n')}`
          }
        ]
      })
      const chatSummary = chatSummaryRes.choices[0].message.content?.trim() ?? ''
      if (chatSummary) {
        await appendJournalEntry({ date: today, type: 'weekly', entry: chatSummary })
      }
    }
  }

  await pushContextToKV(coach)

  const allocationTable = Object.entries(allocations)
    .map(([key, hours]) => `${goals[key].description}: *${hours}h*`)
    .join('\n')

  await sendMessage(`*Weekly Review — ${today}*\n\n${summary}\n\n*Next week:*\n${allocationTable}`)
  console.log('Weekly message sent.')
}
