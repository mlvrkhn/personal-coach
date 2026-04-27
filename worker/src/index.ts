import Groq from 'groq-sdk'

interface Env {
  COACH_KV: KVNamespace
  GROQ_API_KEY: string
  TELEGRAM_BOT_TOKEN: string
  TELEGRAM_CHAT_ID: string
}

interface TelegramMessage {
  message?: {
    chat: { id: number }
    text?: string
  }
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface CoachContext {
  goals: Record<string, { description: string; priority: string }>
  currentWeek: {
    startDate: string
    allocations: Record<string, number>
  }
  personality?: { description: string }
}

interface JournalEntry {
  date: string
  type: 'chat' | 'weekly'
  entry: string
}

const DEFAULT_PERSONALITY = `You are Martin's personal coach. You are brutally honest, provocative, and demanding. You call out excuses immediately. You don't sugarcoat anything. But underneath it all you genuinely want him to win. Think drill sergeant with a heart.`

async function sendTelegram(token: string, chatId: string, text: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
  })
}

async function synthesizeAndJournal(
  groq: Groq,
  kv: KVNamespace,
  userText: string,
  reply: string
): Promise<void> {
  const res = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    max_tokens: 60,
    messages: [
      {
        role: 'system',
        content: 'You extract coaching insights from conversations. Be extremely brief.'
      },
      {
        role: 'user',
        content: `From this exchange, extract any meaningful progress, commitment, or insight in one sentence. If there's nothing worth noting (small talk, greetings, vague chat), respond with exactly: null

User: ${userText}
Coach: ${reply}`
      }
    ]
  })

  const synthesis = res.choices[0].message.content?.trim() ?? 'null'
  if (synthesis === 'null' || synthesis.toLowerCase() === 'null') return

  const raw = await kv.get('coach:journal')
  const journal: JournalEntry[] = raw ? JSON.parse(raw) : []
  journal.push({
    date: new Date().toISOString().split('T')[0],
    type: 'chat',
    entry: synthesis
  })
  await kv.put('coach:journal', JSON.stringify(journal))
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      if (request.method !== 'POST') return new Response('OK')

      const body = await request.json<TelegramMessage>()
      const msg = body.message
      if (!msg?.text) return new Response('OK')

      const chatId = String(msg.chat.id)
      if (chatId !== env.TELEGRAM_CHAT_ID) return new Response('OK')

      const userText = msg.text.trim()

      const [contextRaw, historyRaw] = await Promise.all([
        env.COACH_KV.get('coach:context'),
        env.COACH_KV.get('coach:history')
      ])

      const context: CoachContext | null = contextRaw ? JSON.parse(contextRaw) : null
      const history: ChatMessage[] = historyRaw ? JSON.parse(historyRaw) : []

      const systemPrompt = buildSystemPrompt(context)

      const groq = new Groq({ apiKey: env.GROQ_API_KEY })
      const response = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 150,
        messages: [
          { role: 'system', content: systemPrompt },
          ...history,
          { role: 'user', content: userText }
        ]
      })

      const reply = response.choices[0].message.content?.trim() ?? '...'

      const updatedHistory: ChatMessage[] = [
        ...history,
        { role: 'user' as const, content: userText },
        { role: 'assistant' as const, content: reply }
      ].slice(-20)

      // Fire all async operations in parallel after we have the reply
      await Promise.all([
        sendTelegram(env.TELEGRAM_BOT_TOKEN, chatId, reply),
        env.COACH_KV.put('coach:history', JSON.stringify(updatedHistory)),
        synthesizeAndJournal(groq, env.COACH_KV, userText, reply)
      ])

      return new Response('OK')
    } catch (err) {
      console.error('worker error:', err)
      return new Response('OK')
    }
  }
}

function buildSystemPrompt(context: CoachContext | null): string {
  const personality = context?.personality?.description ?? DEFAULT_PERSONALITY
  let prompt = `${personality} Short replies — max 3 sentences. No greetings.`

  if (!context) return prompt

  const goalLines = Object.entries(context.goals)
    .map(([, g]) => `- ${g.description} [${g.priority}]`)
    .join('\n')

  const allocationLines = Object.entries(context.currentWeek.allocations)
    .map(([key, hours]) => {
      const goal = context.goals[key]
      return `- ${goal?.description ?? key}: ${hours}h/week`
    })
    .join('\n')

  prompt += `\n\nGoals:\n${goalLines}\n\nThis week:\n${allocationLines}`
  return prompt
}
