// OpenAI ↔ Anthropic format conversion utilities.

/** Convert an OpenAI chat/completions request body to Anthropic messages format. */
export function oaiToAnthropic(body: any): { anthropicBody: any; rawBody: string } {
  const msgs: any[] = body.messages ?? []
  const systemParts = msgs.filter((m) => m.role === 'system')
  const chatMsgs = msgs.filter((m) => m.role !== 'system')

  const anthropicBody: any = {
    model: body.model,
    max_tokens: body.max_tokens ?? 4096,
    messages: chatMsgs.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  }

  if (systemParts.length > 0) {
    anthropicBody.system = systemParts
      .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
      .join('\n\n')
  }

  if (body.temperature !== undefined) anthropicBody.temperature = body.temperature
  if (body.top_p !== undefined) anthropicBody.top_p = body.top_p
  if (body.stream !== undefined) anthropicBody.stream = body.stream
  if (body.stop !== undefined) anthropicBody.stop_sequences = Array.isArray(body.stop) ? body.stop : [body.stop]
  if (body.tools) {
    anthropicBody.tools = body.tools.map((t: any) => ({
      name: t.function?.name ?? t.name,
      description: t.function?.description ?? t.description,
      input_schema: t.function?.parameters ?? t.input_schema ?? {},
    }))
  }
  if (body.tool_choice) {
    if (body.tool_choice === 'auto') anthropicBody.tool_choice = { type: 'auto' }
    else if (body.tool_choice === 'none') anthropicBody.tool_choice = { type: 'none' }
    else if (body.tool_choice?.function?.name) anthropicBody.tool_choice = { type: 'tool', name: body.tool_choice.function.name }
  }

  return { anthropicBody, rawBody: JSON.stringify(anthropicBody) }
}

/** Convert an Anthropic messages response to OpenAI chat.completion format. */
export function anthropicToOai(resp: any): any {
  const content: any[] = resp.content ?? []
  const textBlocks = content.filter((b) => b.type === 'text')
  const toolBlocks = content.filter((b) => b.type === 'tool_use')

  const message: any = {
    role: 'assistant',
    content: textBlocks.map((b) => b.text).join('') || null,
  }

  if (toolBlocks.length > 0) {
    message.tool_calls = toolBlocks.map((t) => ({
      id: t.id,
      type: 'function',
      function: { name: t.name, arguments: JSON.stringify(t.input ?? {}) },
    }))
    if (!message.content) message.content = null
  }

  const finishReason =
    resp.stop_reason === 'end_turn' ? 'stop'
    : resp.stop_reason === 'tool_use' ? 'tool_calls'
    : resp.stop_reason === 'max_tokens' ? 'length'
    : 'stop'

  return {
    id: resp.id ?? `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: resp.model ?? '',
    choices: [{ index: 0, message, finish_reason: finishReason, logprobs: null }],
    usage: {
      prompt_tokens: resp.usage?.input_tokens ?? 0,
      completion_tokens: resp.usage?.output_tokens ?? 0,
      total_tokens: (resp.usage?.input_tokens ?? 0) + (resp.usage?.output_tokens ?? 0),
    },
  }
}

/**
 * Transform an Anthropic SSE stream into an OpenAI SSE stream.
 * Reads from `upstream` (Anthropic format) and writes OpenAI chunks to the returned ReadableStream.
 */
export function transformAnthropicStream(upstream: ReadableStream<Uint8Array>, model: string): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  const dec = new TextDecoder()

  return new ReadableStream({
    async start(controller) {
      const reader = upstream.getReader()
      let buf = ''
      const chatId = `chatcmpl-${Date.now()}`
      const created = Math.floor(Date.now() / 1000)
      let sentRole = false

      function emit(chunk: any) {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(chunk)}\n\n`))
      }

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += dec.decode(value, { stream: true })

          const lines = buf.split('\n')
          buf = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const raw = line.slice(6).trim()
            if (!raw || raw === '[DONE]') continue

            let ev: any
            try { ev = JSON.parse(raw) } catch { continue }

            if (ev.type === 'message_start') {
              if (!sentRole) {
                sentRole = true
                emit({ id: chatId, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }] })
              }
            } else if (ev.type === 'content_block_delta') {
              const delta = ev.delta
              if (delta?.type === 'text_delta') {
                emit({ id: chatId, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: { content: delta.text }, finish_reason: null }] })
              } else if (delta?.type === 'input_json_delta') {
                emit({ id: chatId, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: { tool_calls: [{ index: ev.index ?? 0, function: { arguments: delta.partial_json } }] }, finish_reason: null }] })
              }
            } else if (ev.type === 'content_block_start' && ev.content_block?.type === 'tool_use') {
              const tb = ev.content_block
              emit({ id: chatId, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: { tool_calls: [{ index: ev.index ?? 0, id: tb.id, type: 'function', function: { name: tb.name, arguments: '' } }] }, finish_reason: null }] })
            } else if (ev.type === 'message_delta') {
              const reason = ev.delta?.stop_reason === 'end_turn' ? 'stop'
                : ev.delta?.stop_reason === 'tool_use' ? 'tool_calls'
                : ev.delta?.stop_reason === 'max_tokens' ? 'length'
                : 'stop'
              emit({ id: chatId, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: {}, finish_reason: reason }] })
            } else if (ev.type === 'message_stop') {
              controller.enqueue(enc.encode('data: [DONE]\n\n'))
            }
          }
        }
      } catch (e) {
        // stream ended or errored
      } finally {
        controller.close()
      }
    },
  })
}
