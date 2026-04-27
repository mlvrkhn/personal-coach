import Groq from 'groq-sdk'
import { readFileSync } from 'fs'
import { sendMessage } from './telegram.js'
import type { CoachData, Notes } from './types.js'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const DEFAULT_PERSONALITY = `You are Martin's personal coach. You are brutally honest, provocative, and demanding. You call out excuses immediately. You don't sugarcoat anything. But underneath it all you genuinely want him to win. Think drill sergeant with a heart.`

function loadNotes(): Notes {
  try {
    return JSON.parse(process.env.NOTES_JSON ?? '{}')
  } catch {
    return {}
  }
}

export async function runDaily(): Promise<void> {
  const coach: CoachData = JSON.parse(readFileSync('./coach.json', 'utf8'))
  const { profile, personality, goals, currentWeek } = coach
  const notes = loadNotes()

  const today = new Date()
  const dayName = DAY_NAMES[today.getDay()]
  const dateStr = today.toISOString().split('T')[0]

  const allocationLines = Object.entries(currentWeek.allocations)
    .map(([key, hours]) => {
      const goal = goals[key]
      const note = notes[key] ? ` — ${notes[key]}` : ''
      return `- ${goal.description}: ${hours}h/week${note}`
    })
    .join('\n')

  const activeNotes = Object.values(notes)
    .filter(Boolean)
    .map((text, i) => {
      const key = Object.keys(notes)[i]
      return `- ${goals[key]?.description ?? key}: ${text}`
    })
    .join('\n')

  const systemPrompt = personality?.description ?? DEFAULT_PERSONALITY

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    max_tokens: 100,
    messages: [
      { role: 'system', content: `${systemPrompt} No greetings. Plain text only.` },
      {
        role: 'user',
        content: `Today: ${dayName}, ${dateStr}. Coaching ${profile.name}.

Allocations:
${allocationLines}

${activeNotes ? `Context:\n${activeNotes}` : ''}

Write a coaching message. Max 320 characters.`
      }
    ]
  })

  const message = response.choices[0].message.content?.trim() ?? ''
  await sendMessage(`*${dayName} — ${dateStr}*\n\n${message}`)
  console.log('Daily message sent.')
}
