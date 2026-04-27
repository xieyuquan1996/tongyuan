// backend/src/tests/mock-upstream.ts
//
// Tiny self-contained HTTP server that impersonates the Anthropic upstream for
// e2e tests. Uses node's built-in http module — no msw, no supertest.
// Each test queues a sequence of behaviors; requests are popped FIFO.

import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

export type MockBehavior =
  | { kind: 'ok'; usage?: { input: number; output: number }; text?: string; model?: string }
  | { kind: 'stream'; chunks: number; model?: string }
  | { kind: 'error'; status: number; body?: string }

export type MockSession = {
  server: Server
  baseUrl: string
  hits: number
  close: () => Promise<void>
}

export async function startMockUpstream(queue: MockBehavior[]): Promise<MockSession> {
  const session: MockSession = {
    server: undefined as unknown as Server,
    baseUrl: '',
    hits: 0,
    close: async () => {},
  }

  const server = createServer((req, res) => {
    // /v1/models is a side-channel used by the model sync service. Always
    // respond with a single test model so that sync calls don't consume the
    // queued behavior slots.
    if (req.url?.startsWith('/v1/models')) {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ data: [{ id: 'e2e-test-model', display_name: 'E2E Test' }] }))
      return
    }

    session.hits += 1
    const behavior = queue.shift() ?? { kind: 'error' as const, status: 500, body: '{"error":"no behavior queued"}' }

    if (behavior.kind === 'error') {
      res.writeHead(behavior.status, { 'content-type': 'application/json' })
      res.end(behavior.body ?? JSON.stringify({ error: 'mocked_error' }))
      return
    }

    if (behavior.kind === 'ok') {
      const usage = behavior.usage ?? { input: 42, output: 17 }
      const text = behavior.text ?? 'pong'
      const model = behavior.model ?? 'e2e-test-model'
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({
        id: 'msg_e2e_' + Date.now(),
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text }],
        model,
        stop_reason: 'end_turn',
        usage: { input_tokens: usage.input, output_tokens: usage.output },
      }))
      return
    }

    if (behavior.kind === 'stream') {
      const model = behavior.model ?? 'e2e-test-model'
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        'connection': 'keep-alive',
      })
      res.write('event: message_start\n')
      res.write(`data: ${JSON.stringify({
        type: 'message_start',
        message: { id: 'msg_e2e', model, usage: { input_tokens: 10, output_tokens: 0 } },
      })}\n\n`)
      for (let i = 0; i < behavior.chunks; i++) {
        res.write('event: content_block_delta\n')
        res.write(`data: ${JSON.stringify({
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: `chunk${i} ` },
        })}\n\n`)
      }
      res.write('event: message_delta\n')
      res.write(`data: ${JSON.stringify({
        type: 'message_delta',
        usage: { output_tokens: behavior.chunks * 3 },
      })}\n\n`)
      res.write('event: message_stop\n')
      res.write(`data: ${JSON.stringify({ type: 'message_stop' })}\n\n`)
      res.end()
      return
    }
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  session.server = server
  session.baseUrl = `http://127.0.0.1:${port}`
  session.close = () => new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()))
  })
  return session
}
