import Groq from 'groq-sdk'
import { readFileSync } from 'fs'
import { sendMessage } from './telegram.js'
import type { CoachData, Notes } from './types.js'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function loadNotes(): Notes {
  try {
    return JSON.parse(process.env.NOTES_JSON ?? '{}')
  } catch {
    return {}
  }
}

export async function runDaily(): Promise<void> {
  const coach: CoachData = JSON.parse(readFileSync('./coach.json', 'utf8'))
  const { profile, goals, currentWeek } = coach
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

  const activeNotes = Object.entries(notes)
    .filter(([, text]) => text)
    .map(([key, text]) => `- ${goals[key]?.description ?? key}: ${text}`)
    .join('\n')

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    max_tokens: 400,
    messages: [
      {
        role: 'system',
        content: `You are ${profile.name}'s personal coach. Be direct, concrete, and human. No corporate motivational speak. No greetings or sign-offs.`
      },
      {
        role: 'user',
        content: `Today is ${dayName}, ${dateStr}.

This week's hour allocations:
${allocationLines}

${activeNotes ? `Current context:\n${activeNotes}` : ''}

Generate a short coaching message for today. Be specific to the priorities, reference the context if relevant. Direct and motivating, no generic fluff. Around 150–200 words. Use plain text, no markdown headers.`
      }
    ]
  })

  const message = response.choices[0].message.content?.trim() ?? ''
  await sendMessage(`*${dayName} — ${dateStr}*\n\n${message}`)
  console.log('Daily message sent.')
}
