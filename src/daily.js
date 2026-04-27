import Groq from 'groq-sdk'
import { readFileSync } from 'fs'
import { sendMessage } from './telegram.js'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

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

${notesWithContent ? `Current context:\n${notesWithContent}` : ''}

Generate a short coaching message for today. Be specific to the priorities, reference the context if relevant. Direct and motivating, no generic fluff. Around 150–200 words. Use plain text, no markdown headers.`
      }
    ]
  })

  const message = response.choices[0].message.content.trim()
  await sendMessage(`*${dayName} — ${dateStr}*\n\n${message}`)
  console.log('Daily message sent.')
}
