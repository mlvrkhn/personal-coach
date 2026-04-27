export async function sendMessage(text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'Markdown'
    })
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Telegram error ${res.status}: ${body}`)
  }
}
