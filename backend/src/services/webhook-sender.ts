export interface WebhookResult {
  ok: boolean
  statusCode?: number
}

export async function sendWebhook(
  url: string,
  token: string | null,
  payload: Record<string, unknown>,
): Promise<WebhookResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    })
    return { ok: res.ok, statusCode: res.status }
  } catch {
    return { ok: false }
  }
}
