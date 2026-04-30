// backend/src/gateway/sse.test.ts
import { describe, it, expect } from 'vitest'
import { extractUsage, iterSSE, splitCacheWrite } from './sse.js'

describe('extractUsage', () => {
  it('captures input from message_start and accumulates output from message_delta', () => {
    const u = extractUsage()
    u.observe('message_start', { message: { usage: { input_tokens: 42, cache_read_input_tokens: 5, cache_creation_input_tokens: 3 } } })
    u.observe('message_delta', { usage: { output_tokens: 10 } })
    u.observe('message_delta', { usage: { output_tokens: 25 } })
    expect(u.snapshot()).toEqual({
      inputTokens: 42, outputTokens: 25,
      cacheReadTokens: 5, cacheWriteTokens: 3, cacheWrite1hTokens: 0,
    })
  })

  it('splits cache writes into 5m vs 1h buckets when breakdown is present', () => {
    const u = extractUsage()
    u.observe('message_start', {
      message: {
        usage: {
          input_tokens: 100,
          cache_creation_input_tokens: 300,
          cache_creation: {
            ephemeral_5m_input_tokens: 200,
            ephemeral_1h_input_tokens: 100,
          },
        },
      },
    })
    const s = u.snapshot()
    expect(s.cacheWriteTokens).toBe(200)
    expect(s.cacheWrite1hTokens).toBe(100)
  })

  it('attributes all writes to 5m when no breakdown is given', () => {
    const r = splitCacheWrite({ cache_creation_input_tokens: 150 })
    expect(r).toEqual({ w5m: 150, w1h: 0 })
  })
})

describe('iterSSE', () => {
  it('joins multiple data: lines with newline per SSE spec', async () => {
    const raw = 'event: test\ndata: {"part":\ndata: "value"}\n\n'
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(raw))
        controller.close()
      },
    })
    const events: { event: string; data: any }[] = []
    for await (const ev of iterSSE(stream)) {
      events.push({ event: ev.event, data: ev.data })
    }
    expect(events).toHaveLength(1)
    expect(events[0]!.event).toBe('test')
    // joined data should be '{"part":\n"value"}' — valid JSON
    expect(events[0]!.data).toEqual({ part: 'value' })
  })

  it('yields parsed events from a ReadableStream', async () => {
    const raw = 'event: message_start\ndata: {"type":"message_start"}\n\nevent: content_block_delta\ndata: {"type":"delta"}\n\n'
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(raw))
        controller.close()
      },
    })
    const events: { event: string; data: any }[] = []
    for await (const ev of iterSSE(stream)) {
      events.push({ event: ev.event, data: ev.data })
    }
    expect(events).toHaveLength(2)
    expect(events[0]).toEqual({ event: 'message_start', data: { type: 'message_start' } })
    expect(events[1]).toEqual({ event: 'content_block_delta', data: { type: 'delta' } })
  })
})
