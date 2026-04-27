import Groq from 'groq-sdk'
import { readFileSync, writeFileSync } from 'fs'
import { execSync } from 'child_process'
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
    max_tokens: 800,
    messages: [
      {
        role: 'system',
        content: `You are ${profile.name}'s personal coach. Analyze his week and set realistic, strategic goals. Be direct in the summary — what went well, what needs focus, no fluff. Return only valid JSON.`
      },
      {
        role: 'user',
        content: `Week ending ${today}.

Goals and current allocations:
${allocationLines}

History of past weeks (most recent first):
${historyText}

Respond with a valid JSON object in this exact format, no markdown, no extra text:
{
  "summary": "weekly reflection text here (~250 words)",
  "allocations": {
    "jobSearch": <number>,
    "applyKit": <number>,
    "groovebox": <number>,
    "bakuBook": <number>,
    "gym": <number>,
    "spanish": <number>
  }
}

For the allocations: decide the best hour distribution for next week based on goal priorities and current notes. Total hours should be realistic (around 30–40h/week across everything). Job search stays high priority while active.`
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

  execSync('git config user.name "coach-bot"')
  execSync('git config user.email "github-actions[bot]@users.noreply.github.com"')
  execSync('git add coach.json')
  execSync('git commit -m "chore: weekly coach update [skip ci]"')
  execSync('git push')

  const allocationTable = Object.entries(allocations)
    .map(([key, hours]) => `${goals[key].description}: *${hours}h*`)
    .join('\n')

  await sendMessage(`*Weekly Review — ${today}*\n\n${summary}\n\n*Next week's plan:*\n${allocationTable}`)
  console.log('Weekly message sent and coach.json committed.')
}
