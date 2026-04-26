import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'fs'
import { sendMessage } from './telegram.js'

const client = new Anthropic()

export async function runDaily() {
  const coach = JSON.parse(readFileSync('./coach.json', 'utf8'))
  const { profile, goals, currentWeek } = coach

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const today = new Date()
  const dayName = dayNames[today.getDay()]
  const dateStr = today.toISOString().split('T')[0]

  const allocationLines = Object.entries(currentWeek.allocations)
    .map(([key, hours]) => {
      const goal = goals[key]
      const notes = goal.notes ? ` — ${goal.notes}` : ''
      return `- ${goal.description}: ${hours}h/week${notes}`
    })
    .join('\n')

  const notesWithContent = Object.entries(goals)
    .filter(([, g]) => g.notes)
    .map(([, g]) => `- ${g.description}: ${g.notes}`)
    .join('\n')

  const userMessage = `Today is ${dayName}, ${dateStr}.

This week's hour allocations:
${allocationLines}

${notesWithContent ? `Current context:\n${notesWithContent}` : ''}

Generate a short coaching message for today. Be specific to the priorities, reference the context if relevant. Direct and motivating, no generic fluff. Around 150–200 words. Use plain text, no markdown headers.`

  const response = await client.messages.create({
    model: 'claude-haiku-3-5-20251001',
    max_tokens: 400,
    system: `You are ${profile.name}'s personal coach. You know his goals and current workload. Be direct, concrete, and human. No corporate motivational speak. No greetings or sign-offs.`,
    messages: [{ role: 'user', content: userMessage }]
  })

  const message = response.content[0].text.trim()
  await sendMessage(`*${dayName} — ${dateStr}*\n\n${message}`)
  console.log('Daily message sent.')
}
