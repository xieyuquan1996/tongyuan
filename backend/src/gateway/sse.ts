// backend/src/gateway/sse.ts
export type Usage = {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number    // 5m writes (default TTL)
  cacheWrite1hTokens: number  // 1h writes
}

// Split Anthropic's cache_creation_input_tokens into 5m vs 1h buckets.
// When ephemeral_5m_input_tokens / ephemeral_1h_input_tokens are present we
// trust them directly. Older responses only expose the flat total — attribute
// it all to the 5m bucket, which is what the client gets when it didn't
// explicitly request the 1h TTL.
function splitCacheWrite(usage: any): { w5m: number; w1h: number } {
  const total = Number(usage?.cache_creation_input_tokens ?? 0)
  const breakdown = usage?.cache_creation
  if (breakdown) {
    const w5m = Number(breakdown.ephemeral_5m_input_tokens ?? 0)
    const w1h = Number(breakdown.ephemeral_1h_input_tokens ?? 0)
    if (w5m + w1h > 0) return { w5m, w1h }
  }
  return { w5m: total, w1h: 0 }
}

export function extractUsage() {
  const u: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, cacheWrite1hTokens: 0 }
  return {
    observe(event: string, data: any) {
      if (event === 'message_start') {
        const m = data?.message?.usage
        if (m) {
          u.inputTokens = m.input_tokens ?? 0
          u.cacheReadTokens = m.cache_read_input_tokens ?? 0
          const { w5m, w1h } = splitCacheWrite(m)
          u.cacheWriteTokens = w5m
          u.cacheWrite1hTokens = w1h
        }
      } else if (event === 'message_delta') {
        const m = data?.usage
        if (m?.output_tokens !== undefined) u.outputTokens = m.output_tokens
      }
    },
    snapshot(): Usage { return { ...u } },
  }
}

export { splitCacheWrite }

export async function* iterSSE(stream: ReadableStream<Uint8Array>): AsyncGenerator<{ event: string; data: any; raw: string }> {
  const decoder = new TextDecoder()
  const reader = stream.getReader()
  let buf = ''

  function* parseEvents(b: string): Generator<{ event: string; data: any; raw: string; remaining: string }> {
    let idx: number
    while ((idx = b.indexOf('\n\n')) !== -1) {
      const chunk = b.slice(0, idx)
      b = b.slice(idx + 2)
      let event = 'message'
      let data = ''
      for (const line of chunk.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        // Fix 2: join multiple data: lines with \n per SSE spec
        else if (line.startsWith('data:')) data += (data ? '\n' : '') + line.slice(5).trim()
      }
      if (!data) continue
      let parsed: any = null
      try { parsed = JSON.parse(data) } catch {}
      yield { event, data: parsed, raw: chunk + '\n\n', remaining: b }
    }
    // yield a sentinel with the unconsumed remainder
    yield { event: '', data: null, raw: '', remaining: b }
  }

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) {
        // Fix 1: flush decoder for any buffered multibyte chars
        buf += decoder.decode()
        break
      }
      buf += decoder.decode(value, { stream: true })
      for (const ev of parseEvents(buf)) {
        buf = ev.remaining
        if (ev.raw) yield { event: ev.event, data: ev.data, raw: ev.raw }
      }
    }
    // Fix 1: process any trailing complete events after flush
    for (const ev of parseEvents(buf)) {
      buf = ev.remaining
      if (ev.raw) yield { event: ev.event, data: ev.data, raw: ev.raw }
    }
  } finally {
    reader.releaseLock()
  }
}
