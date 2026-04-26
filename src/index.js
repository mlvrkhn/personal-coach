import { runDaily } from './daily.js'
import { runWeekly } from './weekly.js'

function detectMode() {
  if (process.env.MODE) return process.env.MODE

  const now = new Date()
  const isSunday = now.getUTCDay() === 0
  const hour = now.getUTCHours()

  // Sunday at/after 17:00 UTC = weekly
  if (isSunday && hour >= 17) return 'weekly'
  return 'daily'
}

const mode = detectMode()
console.log(`Running in ${mode} mode`)

if (mode === 'weekly') {
  await runWeekly()
} else {
  await runDaily()
}
