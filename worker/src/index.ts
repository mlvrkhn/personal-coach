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
}

async function sendTelegram(token: string, chatId: string, text: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
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

    await sendTelegram(env.TELEGRAM_BOT_TOKEN, chatId, reply)

    // Keep last 20 messages (10 turns)
    const updatedHistory: ChatMessage[] = [
      ...history,
      { role: 'user' as const, content: userText },
      { role: 'assistant' as const, content: reply }
    ].slice(-20)

    await env.COACH_KV.put('coach:history', JSON.stringify(updatedHistory))

    return new Response('OK')
  }
}

function buildSystemPrompt(context: CoachContext | null): string {
  let prompt = `You are Martin's personal coach. Direct, concrete, no fluff. Short replies — max 3 sentences. No greetings.`

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

  prompt += `\n\nMartin's goals:\n${goalLines}\n\nThis week's plan:\n${allocationLines}`
  return prompt
}
