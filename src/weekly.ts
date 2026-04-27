import Groq from 'groq-sdk'
import { readFileSync, writeFileSync } from 'fs'
import { sendMessage } from './telegram.js'
import type { CoachData, Notes, WeeklyResponse } from './types.js'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

function loadNotes(): Notes {
  try {
    return JSON.parse(process.env.NOTES_JSON ?? '{}')
  } catch {
    return {}
  }
}

export async function runWeekly(): Promise<void> {
  const coach: CoachData = JSON.parse(readFileSync('./coach.json', 'utf8'))
  const { profile, goals, currentWeek, history } = coach
  const notes = loadNotes()

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

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    max_tokens: 500,
    messages: [
      {
        role: 'system',
        content: `You are ${profile.name}'s personal coach. Be direct, no fluff. Return only valid JSON.`
      },
      {
        role: 'user',
        content: `Week ending ${today}.

Goals and current allocations:
${allocationLines}

History (most recent first):
${historyText}

Respond with valid JSON only, no markdown:
{
  "summary": "<960 characters max. Direct weekly reflection: what to focus on, what to adjust. No greetings.>",
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

  const allocationTable = Object.entries(allocations)
    .map(([key, hours]) => `${goals[key].description}: *${hours}h*`)
    .join('\n')

  await sendMessage(`*Weekly Review — ${today}*\n\n${summary}\n\n*Next week:*\n${allocationTable}`)
  console.log('Weekly message sent.')
}
