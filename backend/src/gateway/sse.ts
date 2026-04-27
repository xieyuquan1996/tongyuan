// backend/src/gateway/sse.ts
export type Usage = {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

export function extractUsage() {
  const u: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
  return {
    observe(event: string, data: any) {
      if (event === 'message_start') {
        const m = data?.message?.usage
        if (m) {
          u.inputTokens = m.input_tokens ?? 0
          u.cacheReadTokens = m.cache_read_input_tokens ?? 0
          u.cacheWriteTokens = m.cache_creation_input_tokens ?? 0
        }
      } else if (event === 'message_delta') {
        const m = data?.usage
        if (m?.output_tokens !== undefined) u.outputTokens = m.output_tokens
      }
    },
    snapshot(): Usage { return { ...u } },
  }
}

export async function* iterSSE(stream: ReadableStream<Uint8Array>): AsyncGenerator<{ event: string; data: any; raw: string }> {
  const decoder = new TextDecoder()
  const reader = stream.getReader()
  let buf = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const chunk = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      let event = 'message'
      let data = ''
      for (const line of chunk.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data += line.slice(5).trim()
      }
      if (!data) continue
      let parsed: any = null
      try { parsed = JSON.parse(data) } catch {}
      yield { event, data: parsed, raw: chunk + '\n\n' }
    }
  }
}
